#!/usr/bin/env python3
"""
Makai Time — Runtime container para Proton/Wine.

Entry point único que coordena:
- Detecção de GPU + overrides (Fase 1)
- Detecção de sync method (ntsync/fsync/esync) (Fase 2)
- CPU topology pinning (Fase 2)
- Config injection (DXVK, VKD3D, Wine) (Fase 2-3)
- Per-game profiles + engine handlers (Fase 5)
- Proton recommendation (Fase 5)
- Container-aware env vars MAKAI_* (Fase 5)
- Execução do container bwrap
"""

import os
import sys
import argparse
import subprocess
import shutil

from makai_time.core import gpu, sync, runtime, display, ldso
from makai_time.overrides import detect as ov_detect, capture as ov_capture, mount as ov_mount
from makai_time.proton import config as proton_config, recommender, intel as proton_intel
from makai_time.proton.prefix_reader import detect_proton_from_prefix
from makai_time.profiles import manager as profile_manager
from makai_time.utils import sysinfo





def build_bwrap_cmd(
    command: list[str],
    *,
    proton_path: str,
    prefix_path: str,
    game_path: str = None,
    runtime_path: str = None,
    overrides_base: str = None,
    gpu_info: dict = None,
    sync_info: dict = None,
    cpu_info: dict = None,
    env_vars: dict = None,
    uid: int = None,
) -> list[str]:
    """Monta comando bwrap completo."""
    if uid is None:
        uid = os.getuid()
    home = os.path.expanduser("~")
    bwrap_path = shutil.which("bwrap") or "bwrap"

    cmd = [
        bwrap_path,
        "--unshare-all",
        "--share-net",
        "--die-with-parent",
        "--new-session",
        "--hostname", "makaiforge",
        "--bind", "/dev/shm", "/dev/shm",
    ]

    # Overrides GPU + ICDs ANTES de --ro-bind / / para criar mount points
    if overrides_base:
        cmd.extend(ov_mount.override_bwrap_args(overrides_base))

    cmd.extend(["--ro-bind", "/", "/"])

    # --tmpfs e --dev DEPOIS de --ro-bind / / para sobrescrever bind recursivo
    cmd.extend(["--tmpfs", "/tmp", "--dev", "/dev"])

    # GPU devices
    cmd.extend(ov_mount.gpu_device_args())

    # NTSYNC device
    if sync_info and sync_info["method"] == "ntsync":
        cmd.extend(["--dev-bind", "/dev/ntsync", "/dev/ntsync"])

    # Runtime libs são providas via LD_LIBRARY_PATH (--ro-bind /lib quebra host executables)

    # Display + audio
    cmd.extend(display.all_display_args(uid))

    # HOME writable
    cmd.extend(["--bind", home, home])

    # Prefix writable
    cmd.extend(["--bind", prefix_path, prefix_path])

    # Proton writable
    cmd.extend(["--bind", proton_path, proton_path])

    # Game read-only
    if game_path:
        resolved_game = os.path.realpath(os.path.expanduser(game_path))
        cmd.extend(["--ro-bind", resolved_game, resolved_game])

    # Env vars
    cmd.extend([
        "--setenv", "PATH", "/usr/bin:/bin:/usr/sbin:/sbin",
        "--setenv", "HOME", home,
        "--setenv", "USER", os.getenv("USER", "user"),
        "--setenv", "LANG", os.environ.get("LANG", "C.UTF-8"),
        "--setenv", "LC_ALL", os.environ.get("LC_ALL", "C.UTF-8"),
        "--setenv", "TERM", os.environ.get("TERM", "xterm-256color"),
    ])

    if env_vars:
        for key, val in env_vars.items():
            cmd.extend(["--setenv", key, str(val)])

    if "WINEPREFIX" not in (env_vars or {}):
        cmd.extend(["--setenv", "WINEPREFIX", prefix_path])

    if "STEAM_COMPAT_DATA_PATH" not in (env_vars or {}):
        cmd.extend(["--setenv", "STEAM_COMPAT_DATA_PATH", prefix_path])

    # Comando
    cmd.append("--")
    cmd.extend(command)

    return cmd


def run(
    game_exe: str,
    proton_path: str,
    prefix_path: str,
    game_path: str = None,
    runtime_name: str = "steamrt4",
    game_profile: str = None,
    base_path: str = None,
    dry_run: bool = False,
    verbose: bool = True,
    env_overrides: dict[str, str] | None = None,
) -> int:
    """
    Entry point principal.

    Fluxo:
    0. detect_game()                    → detecta jogo + engine + perfil
    0.5. identify_proton()              → detecta fork de Proton + features
    1. ensure_runtime(runtime)           → baixa steamrt4 se necessário
    2. detect_gpu()                      → informações da GPU
    2.5. proton_recommendation()         → recomenda Proton fork para o jogo
    3. detect_sync()                     → ntsync/fsync/esync
    4. detect_cpu_topology()             → P-cores / E-cores
    5. create_overrides(gpu_info)        → só libs GPU necessárias
    6. generate_dxvk_conf(gpu_info)      → dxvk.conf otimizado
    7. generate_env_vars(...)            → env vars (hardware + perfil + engine + container-aware)
    8. build_bwrap_cmd(...)              → monta comando bwrap
    9. run_in_container(...)             → executa
    """
    if base_path is None:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if verbose:
        print("=" * 60)
        print(" Makai Time — Runtime Container")
        print("=" * 60)

    # ── Step 0: Profile detection ─────────────────────────────────────────
    if verbose:
        print("\n[0/9] Detectando jogo...")
    
    # Game profile pode ser passado explicitamente ou detectado pelo exe
    explicit_profile = None
    if game_profile:
        explicit_profile = profile_manager.load_profile(base_path, game_profile)
        if explicit_profile and verbose:
            print(f"  Perfil explícito: {explicit_profile.get('name')}")

    detected_profile = profile_manager.detect_game(game_exe)
    if detected_profile and verbose:
        eng = detected_profile.get("engine")
        eng_str = f" ({eng})" if eng else ""
        print(f"  Jogo detectado: {detected_profile.get('name')}{eng_str}")
    elif not explicit_profile and verbose:
        print(f"  Nenhum perfil específico, usando defaults")

    # Perfil final: explícito > detectado > None
    final_profile = explicit_profile or detected_profile or None

    # Se perfil tem runtime específico, override
    if final_profile and final_profile.get("runtime"):
        runtime_name = final_profile["runtime"]
        if verbose:
            print(f"  Runtime do perfil: {runtime_name}")

    # ── Step 0.5: Proton Intelligence ─────────────────────────────────────
    if verbose:
        print("\n[0.5/9] Identificando Proton...")
    proton_id = proton_intel.identify_proton(proton_path)
    proton_info = proton_intel.get_proton_info(proton_path) if proton_id else None
    if proton_id and verbose:
        name = proton_info.get("name", proton_id) if proton_info else proton_id
        author = proton_info.get("author", "") if proton_info else ""
        features = proton_info.get("features", {}) if proton_info else {}
        active_features = [k for k, v in features.items() if v] if features else []
        print(f"  Proton: {name} ({author})")
        if active_features:
            print(f"  Features: {', '.join(active_features[:5])}")
    elif verbose:
        print(f"  Proton não identificado, usando defaults")

    # ── Step 0.2: Detect proton from prefix ──────────────────────────────
    if verbose:
        print("\n[0.2/9] Detectando Proton pelo prefixo...")
    prefix_skip_nvidia = False
    prefix_fork_id = detect_proton_from_prefix(prefix_path)
    if prefix_fork_id:
        prefix_def = proton_intel.PROTON_KNOWLEDGE.get(prefix_fork_id, {})
        container_ov = prefix_def.get("container_overrides", {})
        prefix_skip_nvidia = container_ov.get("nvidia_libs_bundled", False)
        if verbose:
            print(f"  Fork detectado pelo prefixo: {prefix_fork_id}")
            print(f"  NVIDIA bundled: {prefix_skip_nvidia}")
    else:
        if verbose:
            print(f"  Nenhum Proton detectado no prefixo")

    # ── Step 1: Runtime ───────────────────────────────────────────────────
    if verbose:
        print(f"\n[1/9] Garantindo runtime: {runtime_name}")
    rt_path = runtime.ensure_runtime(base_path, runtime_name, verbose=verbose)

    # ── Step 2: GPU info ──────────────────────────────────────────────────
    if verbose:
        print("\n[2/9] Detectando GPU...")
    gpu_info = gpu.info()
    if verbose:
        print(f"  Vendor: {gpu_info['vendor']}")
        print(f"  Driver: {gpu_info['driver']}")

    # ── Step 2.5: Proton recommendation ──────────────────────────────────
    if verbose:
        print("\n[2.5/9] Recomendando Proton...")
    game_exe_name = os.path.basename(game_exe)
    engine_name = final_profile.get("engine") if final_profile else None
    rec = recommender.proton_recommendation(
        game_exe_name=game_exe_name,
        gpu_vendor=gpu_info["vendor"],
        engine=engine_name,
    )
    if rec and rec.get("proton_fork") and verbose:
        print(f"  Recomendação: {rec['proton_fork']}")
        print(f"  Motivo: {rec['explanation']}")
        print(f"  Prioridade: {rec['priority']}")

    # ── Step 3: Sync method ───────────────────────────────────────────────
    if verbose:
        print("\n[3/9] Detectando sync method...")
    sync_info = sync.info()
    if verbose:
        print(f"  Sync method (detectado): {sync_info['method']}")

    # ── Step 4: CPU topology ──────────────────────────────────────────────
    if verbose:
        print("\n[4/9] Detectando CPU...")
    cpu_info = sysinfo.cpu_topology()
    if verbose:
        print(f"  Cores: {cpu_info['total_cores']}, Threads: {cpu_info['total_threads']}")
        if cpu_info['hybrid']:
            print(f"  Hybrid: {cpu_info['p_core_count']}P+{cpu_info['e_core_count']}E")

    # ── Step 5: Create GPU overrides (com inteligência de fork) ──────────
    if verbose:
        skip_str = " (pulando NVIDIA, bundled no Proton)" if prefix_skip_nvidia else ""
        print(f"\n[5/9] Criando GPU overrides{skip_str}...")
    overrides_base = os.path.join(base_path, "overrides")
    ov_capture.clean_overrides(overrides_base)
    n_libs = ov_capture.capture_all_graphics(
        overrides_base, verbose=verbose, skip_nvidia=prefix_skip_nvidia,
    )
    if verbose:
        print(f"  {n_libs} libs capturadas")

    # ── Step 6: Generate DXVK/VKD3D config ───────────────────────────────
    if verbose:
        print("\n[6/9] Gerando configs Proton...")
    if os.path.isdir(prefix_path):
        dxvk_path = proton_config.write_dxvk_config(
            prefix_path, gpu_info["vendor"], gpu_info["driver"]
        )
        vkd3d_path = proton_config.write_vkd3d_config(
            prefix_path, gpu_info["vendor"]
        )
        if verbose:
            print(f"  dxvk.conf: {dxvk_path}")
            print(f"  vkd3d_proton.conf: {vkd3d_path}")
    else:
        if verbose:
            print(f"  prefixo não existe, pulando escrita de configs")

    # ── Step 7: Generate env vars ────────────────────────────────────────
    if verbose:
        print("\n[7/9] Gerando variáveis de ambiente...")

    # 7a. Merge profile with hardware config
    merged = profile_manager.merge_profile(final_profile, gpu_info["vendor"], sync_info["method"], prefix_path=prefix_path)

    # Se perfil forçou sync diferente, sobrepoe
    profile_sync = merged.get("sync", sync_info["method"])
    if profile_sync != sync_info["method"]:
        if verbose:
            print(f"  Sync override pelo perfil: {sync_info['method']} → {profile_sync}")
        # Recalcula sync info
        if profile_sync == "esync":
            sync_info = {"method": "esync", "env": {"WINEFSYNC": "0", "WINEESYNC": "1"}, "devices": []}
        elif profile_sync == "ntsync":
            pass  # mantém detectado

    # 7b. Base env vars (hardware)
    wayland_avail = any(
        os.path.exists(p) for p in [
            f"/run/user/{os.getuid()}/wayland-0",
            "/run/user/1000/wayland-0",
        ]
    )
    env = proton_config.env_vars(
        gpu_vendor=gpu_info["vendor"],
        sync_method=profile_sync,
        hybrid_cpu=cpu_info["hybrid"],
        wayland=wayland_avail,
    )

    # 7c. Profile env vars (override hardware)
    env.update(merged["env"])

    # 7c2. UMU_ID / GAMEID para compatibilidade com protonfixes
    if "UMU_ID" not in env:
        game_name = (final_profile or {}).get("name", "") or os.path.basename(game_exe)
        safe_id = "".join(c for c in game_name if c.isalnum()).lower()[:32] or "game"
        env["UMU_ID"] = f"makai-{safe_id}"
    if "GAMEID" not in env:
        env["GAMEID"] = env["UMU_ID"]
    if "STEAM_COMPAT_CLIENT_INSTALL_PATH" not in env:
        env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = ""

    # 7d. Proton-specific config
    if proton_id:
        proton_intel.apply_proton_config(proton_id, env)

    # 7e. Container-aware env vars (MAKAI_*)
    overrides_active = os.path.isdir(overrides_base) and any(
        os.listdir(os.path.join(overrides_base, d, "lib"))
        for d in os.listdir(overrides_base)
        if os.path.isdir(os.path.join(overrides_base, d, "lib"))
    )
    makai_env = recommender.container_env(
        gpu_vendor=gpu_info["vendor"],
        gpu_driver=gpu_info["driver"],
        gpu_opengl=gpu_info["opengl"],
        gpu_vulkan=gpu_info["vulkan"],
        sync_method=profile_sync,
        sync_devices=sync_info.get("devices", []),
        cpu_cores=cpu_info["total_cores"],
        cpu_threads=cpu_info["total_threads"],
        cpu_hybrid=cpu_info["hybrid"],
        cpu_p_cores=cpu_info["p_core_ids"],
        cpu_e_cores=cpu_info["e_core_ids"],
        wayland=wayland_avail,
        runtime_name=runtime_name,
        overrides_active=overrides_active,
    )
    env.update(makai_env)

    # 7f. LD_LIBRARY_PATH (overrides > runtime > host)
    from makai_time.core import ldso
    ld_lib_path = ldso.build_ld_library_path(
        prefix_dir=prefix_path if os.path.isdir(prefix_path) else None,
        overrides_dir=overrides_base if overrides_active else None,
        runtime_dir=rt_path,
        include_host=True,
        container_paths=True,
    )
    if ld_lib_path:
        env["LD_LIBRARY_PATH"] = ld_lib_path

    # 7g. Regenerar ld.so.cache (se overrides ativos)
    cache_path = None
    if overrides_active and rt_path:
        cache_path = ldso.regenerate_ld_so_cache(rt_path, overrides_base)
        if cache_path and verbose:
            print(f"  ld.so.cache regenerado: {cache_path}")

    if verbose:
        makai_keys = [k for k in env if k.startswith("MAKAI_")]
        print(f"  {len(env)} env vars ({len(makai_keys)} MAKAI_*)")
        if ld_lib_path:
            print(f"  LD_LIBRARY_PATH: {ld_lib_path[:80]}...")
        if final_profile:
            pname = final_profile.get("name", "desconhecido")
            print(f"  Perfil: {pname}")

    # 7h. Env overrides da CLI/Electron (maior prioridade)
    if env_overrides:
        env.update(env_overrides)
        if verbose:
            print(f"  {len(env_overrides)} env overrides aplicados")

    # ── Step 8: Build bwrap command ─────────────────────────────────────
    proton_script = os.path.join(proton_path, "proton")
    wine_binary = os.path.join(proton_path, "dist", "bin", "wine")
    if os.path.isfile(proton_script):
        command = [proton_script, "waitforexitandrun", game_exe]
    elif os.path.isfile(wine_binary):
        command = [wine_binary, game_exe]
    else:
        command = [game_exe]

    cmd = build_bwrap_cmd(
        command,
        proton_path=proton_path,
        prefix_path=prefix_path,
        game_path=game_path,
        runtime_path=rt_path,
        overrides_base=overrides_base,
        gpu_info=gpu_info,
        sync_info=sync_info,
        cpu_info=cpu_info,
        env_vars=env,
    )

    if dry_run:
        show_profile_overview(final_profile, verbose)
        print("\n" + "=" * 60)
        print(" DRY RUN — Comando bwrap:")
        print("=" * 60)
        print(" ".join(cmd))
        return 0

    if verbose:
        print("\n" + "=" * 60)
        print(" Executando container...")
        print("=" * 60 + "\n")

    result = subprocess.run(cmd)
    return result.returncode


def show_profile_overview(profile: dict | None, verbose: bool):
    """Mostra resumo do perfil no dry-run."""
    if not profile:
        return
    print()
    print(" Perfil do Jogo:")
    print(f"   Nome:   {profile.get('name', 'N/A')}")
    print(f"   Engine: {profile.get('engine', 'N/A')}")
    if profile.get("sync"):
        print(f"   Sync:   {profile['sync']}")
    if profile.get("no_fsync"):
        print(f"   FSync:  desabilitado (forçado)")
    if profile.get("use_wined3d"):
        print(f"   DXVK:   desabilitado (wined3d forçado)")
    if profile.get("env"):
        print(f"   Env:    {len(profile['env'])} overrides")
    if profile.get("notes"):
        print(f"   Notas:  {profile['notes']}")


def cli():
    parser = argparse.ArgumentParser(description="Makai Time — Runtime container")
    parser.add_argument("--game-exe", required=True)
    parser.add_argument("--proton-path", required=True)
    parser.add_argument("--prefix-path", required=True)
    parser.add_argument("--game-path")
    parser.add_argument("--runtime", default="steamrt4",
                        choices=["steamrt4", "sniper", "soldier", "scout"])
    parser.add_argument("--profile")
    parser.add_argument("--base-path")
    parser.add_argument("--verbose", "-v", action="store_true", default=True)
    parser.add_argument("--quiet", "-q", action="store_false", dest="verbose")
    parser.add_argument("--dry-run", action="store_true",
                        help="Mostra o comando bwrap sem executar")
    parser.add_argument("--env", "-e", action="append", default=[],
                        help="Variável de ambiente adicional (KEY=VALUE, pode repetir)")

    args = parser.parse_args()

    env_overrides = {}
    for e in args.env:
        if "=" in e:
            key, val = e.split("=", 1)
            env_overrides[key] = val

    return run(
        game_exe=args.game_exe,
        proton_path=args.proton_path,
        prefix_path=args.prefix_path,
        game_path=args.game_path,
        runtime_name=args.runtime,
        game_profile=args.profile,
        base_path=args.base_path,
        dry_run=args.dry_run,
        verbose=args.verbose,
        env_overrides=env_overrides or None,
    )


if __name__ == "__main__":
    sys.exit(cli())
