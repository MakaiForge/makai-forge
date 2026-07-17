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
from pathlib import Path
from ctypes import CDLL, c_int
from ctypes.util import find_library

from makai_time.core import gpu, sync, runtime, display, ldso, steamclient, layers
from makai_time.core import passwd as makai_passwd
from makai_time.core import gamescope
from makai_time.core.setup_pfx import setup_pfx
from makai_time.container.discord import discord_ipc_args
from makai_time.overrides import detect as ov_detect, capture as ov_capture, mount as ov_mount
from makai_time.proton import anticheat as proton_anticheat
from makai_time.proton import config as proton_config, recommender, intel as proton_intel
from makai_time.proton.prefix_reader import detect_proton_from_prefix
from makai_time.profiles import manager as profile_manager
from makai_time.utils import sysinfo





def build_bwrap_cmd(
    command: list[str],
    uid: int | None = None,
    *,
    proton_path: str,
    prefix_path: str,
    game_path: str = None,
    runtime_path: str = None,
    overrides_base: str = None,
    gpu_info: dict = None,
    sync_info: dict = None,
    cpu_info: dict = None,
    env_vars: dict[str, str] | None = None,
    ld_cache_path: str = None,
    passwd_path: str = None,
    group_path: str = None,
    skip_nvidia_layers: bool = False,
    use_capsule: bool = False,
    ac_bwrap_args: list[str] | None = None,
) -> list[str]:
    """Monta comando bwrap completo."""
    if uid is None:
        uid = os.getuid()
    home = os.path.expanduser("~")
    bwrap_path = shutil.which("bwrap") or "bwrap"

    # Resolve isolamento PID vs relaxamento AC
    # bwrap < 0.12 nao suporta --no-unshare-pid, entao substituimos
    # --unshare-all por flags individuais sem --unshare-pid
    ac_args = list(ac_bwrap_args or [])
    if "--no-unshare-pid" in ac_args:
        unshare_flags = [
            "--unshare-user", "--unshare-ipc", "--unshare-net",
            "--unshare-uts", "--unshare-cgroup-try",
        ]
        ac_args = [a for a in ac_args if a != "--no-unshare-pid"]
    else:
        unshare_flags = ["--unshare-all"]

    cmd = [
        bwrap_path,
        *unshare_flags,
        "--share-net",
        "--die-with-parent",
        "--new-session",
        "--hostname", "makaiforge",
        "--bind", "/dev/shm", "/dev/shm",
    ]

    # Anti-cheat relaxations (/dev, /proc)
    if ac_args:
        cmd.extend(ac_args)

    # Overrides + bindings para paths que ja existem no host
    # (ICD JSONs em /usr/share/vulkan/icd.d/ etc.)
    if overrides_base:
        if use_capsule:
            from makai_time.overrides.capsule_capture import capsule_bwrap_args
            cmd.extend(capsule_bwrap_args(overrides_base))
        else:
            cmd.extend(ov_mount.override_bwrap_args(overrides_base))

    cmd.extend(["--ro-bind", "/", "/"])

    # --tmpfs e --dev DEPOIS de --ro-bind / / para sobrescrever bind recursivo
    cmd.extend(["--tmpfs", "/tmp", "--dev", "/dev"])

    # ld.so.cache regenerado sobrepõe o do host
    if ld_cache_path and os.path.isfile(ld_cache_path):
        cmd.extend(["--ro-bind", ld_cache_path, "/etc/ld.so.cache"])

    # /etc/passwd + /etc/group sintéticos (só o usuário atual)
    if passwd_path and os.path.isfile(passwd_path):
        cmd.extend(["--ro-bind", passwd_path, "/etc/passwd"])
    if group_path and os.path.isfile(group_path):
        cmd.extend(["--ro-bind", group_path, "/etc/group"])

    # GPU devices
    cmd.extend(ov_mount.gpu_device_args())

    # NTSYNC device
    if sync_info and sync_info["method"] == "ntsync":
        cmd.extend(["--dev-bind", "/dev/ntsync", "/dev/ntsync"])

    # Display + audio
    cmd.extend(display.all_display_args(uid))

    # HOME protegido: tmpfs oculta /home inteiro, bind expõe só o user atual
    cmd.extend(["--tmpfs", "/home", "--bind", home, home])

    # Discord IPC sockets (rich presence)
    cmd.extend(discord_ipc_args(uid))

    # Vulkan/OpenXR layer masking (tmpfs vazio sobre layers do host)
    cmd.extend(layers.layer_mask_args(overrides_base, skip_nvidia=skip_nvidia_layers))

    # Steam client paths (steam_api.dll / steamclient.fake)
    cmd.extend(steamclient.steamclient_mount_args(prefix_path, game_path))

    # Proton (read-only — instalação fixa, não precisa escrever)
    cmd.extend(["--ro-bind", proton_path, proton_path])
    proton_parent = os.path.dirname(proton_path)
    if os.path.isfile(os.path.join(proton_parent, "proton")):
        cmd.extend(["--ro-bind", proton_parent, proton_parent])

    # Game read-only
    if game_path:
        resolved_game = os.path.realpath(os.path.expanduser(game_path))
        cmd.extend(["--ro-bind", resolved_game, resolved_game])

    # Prefix writable (por último pra sobrepor ro-bind do game_path se for parent)
    cmd.extend(["--bind", prefix_path, prefix_path])

    # Env vars — venv Python SEMPRE (OBRIGATÓRIO: AGENTS.md)
    cmd.extend([
        "--setenv", "PATH", "/home/cas/Documentos/Makai-forge/tools/venv/bin:/usr/bin:/bin:/usr/sbin:/sbin",
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
    use_capsule: bool = False,
    mutable_runtime: bool = False,
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

    # ── Step -1: Garbage Collection ────────────────────────────────────────
    if verbose:
        print("\n[-1/9] Limpando runtimes antigos...")
    try:
        removed = runtime.garbage_collect(base_path, verbose=verbose)
        if removed and verbose:
            print(f"  {len(removed)} runtime(s) removido(s)")
    except Exception:
        pass

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
    prefix_skip_nvidia = False
    if verbose:
        print("\n[0.2/9] Detectando Proton pelo prefixo...")
    prefix_fork_id = detect_proton_from_prefix(prefix_path)
    if prefix_fork_id:
        if verbose:
            print(f"  Fork detectado pelo prefixo: {prefix_fork_id}")
    elif verbose:
        print(f"  Nenhum Proton detectado no prefixo")

    # Step 0.3: Determinar skip_nvidia final
    # Prioridade: Proton rodando > Proton do prefixo
    if proton_id:
        prefix_skip_nvidia = proton_intel.skip_nvidia_overrides(proton_id)
    elif prefix_fork_id:
        prefix_skip_nvidia = proton_intel.skip_nvidia_overrides(prefix_fork_id)
    if verbose:
        print(f"  NVIDIA libs do host: {'ocultas (bundled no Proton)' if prefix_skip_nvidia else 'visíveis'}")

    # Step 0.4: Unified fork ID (directory > prefix fallback)
    fork_id = proton_id or prefix_fork_id
    if fork_id and verbose and not proton_id:
        print(f"  Fork ID (prefix fallback): {fork_id}")

    # ── Step 0.75: Setup prefix + compatdata symlink ──────────────────────
    if verbose:
        print("\n[0.75/9] Preparando prefixo (setup_pfx)...")
    if os.path.isdir(prefix_path):
        setup_pfx(prefix_path)
        # Proton precisa criar symlink compatdata/ no próprio diretório
        # (agora --ro-bind). Criamos antes para evitar EROFS.
        compatdata_link = os.path.join(proton_path, "compatdata")
        if not os.path.islink(compatdata_link):
            try:
                os.symlink(prefix_path, compatdata_link)
            except (FileNotFoundError, OSError):
                pass
        if verbose:
            print(f"  Prefixo preparado: {prefix_path}")

    # ── Step 0.8: Game drive detection ────────────────────────────────────
    if verbose:
        print("\n[0.8/9] Detectando drive do jogo...")
    game_drive = None
    game_dir = game_path or os.path.dirname(os.path.realpath(game_exe))
    for parent in Path(game_dir).parents:
        if parent.is_mount() and parent != Path("/"):
            game_drive = str(parent)
            break
    if game_drive and verbose:
        print(f"  Game drive: {game_drive}")

    # ── Step 0.9: Anti-cheat detection ────────────────────────────────────
    if verbose:
        print("\n[0.9/9] Detectando anti-cheat...")
    game_exe_name_ac = os.path.basename(game_exe)
    ac_data = proton_anticheat.detect_anticheat(game_exe_name_ac)
    ac_env = {}
    ac_bwrap_flags = []
    ac_relaxations = []
    if ac_data and ac_data.get("ac_types"):
        ac_types_str = ", ".join(ac_data["ac_types"])
        compat = ac_data.get("compatible", False)
        compat_str = "compatível" if compat else "NÃO compatível"
        print(f"  Anti-cheat detectado: {ac_types_str} ({compat_str})")
        ac_env = proton_anticheat.get_ac_env_vars(game_exe_name_ac)
        ac_relaxations = proton_anticheat.get_ac_container_relaxations(game_exe_name_ac)
        ac_bwrap_flags = proton_anticheat.get_ac_container_bwrap_flags(game_exe_name_ac)
        if ac_relaxations and verbose:
            print(f"  Relaxamentos de container: {', '.join(ac_relaxations)}")
    elif verbose:
        print(f"  Nenhum anti-cheat detectado")

    # ── Step 1: Runtime (opcional — só baixa se perfil exigir) ────────────
    if verbose:
        print(f"\n[1/9] Verificando runtime: {runtime_name}")
    rt_path, runtime_name = runtime.resolve_runtime_chain(
        base_path, preferred=runtime_name, verbose=verbose,
    )

    # ── Step 1b: Mutable sysroot (FEX-Emu) ──────────────────────────────
    if mutable_runtime and rt_path:
        mutable_path = runtime.make_mutable_copy(rt_path, verbose=verbose)
        if mutable_path:
            rt_path = mutable_path
            if verbose:
                print(f"  Modo mutável ativado (FEX-Emu compatível)")

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
        method = " (capsule)" if use_capsule else ""
        print(f"\n[5/9] Criando GPU overrides{skip_str}{method}...")
    overrides_base = os.path.join(prefix_path, "overrides")
    ov_capture.clean_overrides(overrides_base)
    if use_capsule:
        from makai_time.overrides.capsule_capture import capsule_capture
        from makai_time.overrides.detect import all_graphics_libraries
        raw_libs = all_graphics_libraries()
        if prefix_skip_nvidia:
            raw_libs = [l for l in raw_libs if "nvidia" not in l.lower()]
        n_libs = capsule_capture(
            raw_libs, overrides_base, verbose=verbose,
        )
    else:
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

    # 7c2. UMU env vars para compatibilidade com protonfixes + SteamRT interface
    from secrets import token_hex
    if "UMU_ID" not in env:
        game_name = (final_profile or {}).get("name", "") or os.path.basename(game_exe)
        safe_id = "".join(c for c in game_name if c.isalnum()).lower()[:32] or "game"
        env["UMU_ID"] = f"makai-{safe_id}"
    if "GAMEID" not in env:
        env["GAMEID"] = env["UMU_ID"]
    if "UMU_INVOCATION_ID" not in env:
        env["UMU_INVOCATION_ID"] = token_hex(16)
    if "PROTONPATH" not in env:
        env["PROTONPATH"] = proton_path
    if "RUNTIMEPATH" not in env and rt_path:
        env["RUNTIMEPATH"] = rt_path
    if "PROTON_CRASH_REPORT_DIR" not in env:
        env["PROTON_CRASH_REPORT_DIR"] = "/tmp/umu_crashreports"

    # 7c3. Steam client env vars (steam_api.dll stub + steamclient.fake)
    steam_app_id = env.get("SteamAppId", "0")
    env.update(steamclient.steamclient_env(
        prefix_path=prefix_path,
        steam_app_id=steam_app_id,
    ))
    if "STEAM_COMPAT_SHADER_PATH" not in env:
        env["STEAM_COMPAT_SHADER_PATH"] = f"{prefix_path}/shadercache"
    if "STEAM_COMPAT_TOOL_PATHS" not in env:
        val = proton_path
        if rt_path:
            val += f":{rt_path}"
        env["STEAM_COMPAT_TOOL_PATHS"] = val
    if "STEAM_COMPAT_MOUNTS" not in env:
        val = proton_path
        if rt_path:
            val += f":{rt_path}"
        env["STEAM_COMPAT_MOUNTS"] = val
        env["STEAM_COMPAT_MOUNTS"] = f"{proton_path}:{rt_path}"
    if "STEAM_COMPAT_INSTALL_PATH" not in env:
        env["STEAM_COMPAT_INSTALL_PATH"] = game_drive or os.path.dirname(os.path.realpath(game_exe))
    if "STEAM_COMPAT_CLIENT_INSTALL_PATH" not in env:
        env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = ""
    if "STEAM_COMPAT_APP_ID" not in env:
        env["STEAM_COMPAT_APP_ID"] = "0"
    if "STEAM_COMPAT_LIBRARY_PATHS" not in env:
        env["STEAM_COMPAT_LIBRARY_PATHS"] = game_drive or ""

    # 7d. Proton-specific config + DLL overrides
    if fork_id:
        proton_intel.apply_proton_config(fork_id, env)
        dll_ov = proton_intel.get_dll_overrides(fork_id)
        if dll_ov:
            current = env.get("WINEDLLOVERRIDES", "")
            extra = ";".join(f"{k}={v}" for k, v in dll_ov.items())
            env["WINEDLLOVERRIDES"] = f"{current};{extra}" if current else extra
            if verbose:
                print(f"  DLL overrides da definição: {extra}")

    # 7d2. Anti-cheat env vars (se detectado)
    if ac_env:
        env.update(ac_env)
        if verbose:
            print(f"  Anti-cheat env vars: {len(ac_env)}")

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

    # 7f. STEAM_RUNTIME_LIBRARY_PATH (usado pelo Proton script)
    # NÃO setamos LD_LIBRARY_PATH diretamente porque o Proton script gerencia
    # o próprio LD_LIBRARY_PATH — e overrides GPU na LD_LIBRARY_PATH quebram
    # o Python que executa o Proton script (SIGSEGV em import encodings).
    # O Proton script pega STEAM_RUNTIME_LIBRARY_PATH e o acrescenta ao seu
    # próprio LD_LIBRARY_PATH (steam-compat-tool-interface.md).
    ld_lib_path = ldso.build_ld_library_path(
        prefix_dir=prefix_path if os.path.isdir(prefix_path) else None,
        overrides_dir=overrides_base if overrides_active else None,
        runtime_dir=rt_path,
        include_host=True,
        container_paths=False,
    )
    if ld_lib_path:
        env["STEAM_RUNTIME_LIBRARY_PATH"] = ld_lib_path

    # 7f2. LD_LIBRARY_PATH_EXTRA da definição do Proton (ex: libcuda paths custom)
    if fork_id:
        ld_extra = proton_intel.get_ld_extra(fork_id)
        if ld_extra:
            current = env.get("STEAM_RUNTIME_LIBRARY_PATH", "")
            extra = ":".join(ld_extra)
            env["STEAM_RUNTIME_LIBRARY_PATH"] = f"{current}:{extra}" if current else extra

    # Remove LD_LIBRARY_PATH do env — o Proton script gerencia o próprio.
    # Overrides GPU na LD_LIBRARY_PATH quebram o Python que roda o Proton.
    # Se o jogo usar Wine direto (sem Proton), o build_bwrap_cmd pode setar
    # LD_LIBRARY_PATH via env_overrides.
    env.pop("LD_LIBRARY_PATH", None)

    # 7g. Regenerar ld.so.cache (se overrides ativos e não-capsule)
    cache_path = None
    if overrides_active and rt_path and not use_capsule:
        cache_path = ldso.regenerate_ld_so_cache(rt_path, overrides_base)
        if cache_path and verbose:
            print(f"  ld.so.cache regenerado: {cache_path}")
    elif overrides_active and not rt_path:
        if verbose:
            print(f"  ld.so.cache: pulado (sem runtime, usando ld.so.cache do host)")

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

    # ── Step 7i: Gerar /etc/passwd + /etc/group sintéticos ─────────────
    import tempfile
    passwd_path = None
    group_path = None
    if prefix_path:
        _tmp = tempfile.mkdtemp(prefix="makai_passwd_")
        passwd_path, group_path = makai_passwd.write_passwd_files(_tmp)
        if verbose:
            print(f"  /etc/passwd + /etc/group gerados")

    # ── Step 8: Build bwrap command ─────────────────────────────────────
    # Proton script pode estar na raiz ou dentro de files/
    proton_script = os.path.join(proton_path, "proton")
    if not os.path.isfile(proton_script):
        parent = os.path.dirname(proton_path)
        proton_script = os.path.join(parent, "proton")
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
        ld_cache_path=cache_path,
        passwd_path=passwd_path,
        group_path=group_path,
        skip_nvidia_layers=prefix_skip_nvidia,
        use_capsule=use_capsule,
        ac_bwrap_args=ac_bwrap_flags or None,
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

    # prctl PR_SET_CHILD_SUBREAPER: este processo adota filhos órfãos do container
    try:
        libc = CDLL(find_library("c"), use_errno=True)
        PR_SET_CHILD_SUBREAPER = 36
        libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0, 0)
    except Exception:
        pass

    proc = subprocess.Popen(cmd, stdout=None, stderr=None)

    if game_drive:
        appid = int(os.environ.get("SteamAppId", env.get("SteamAppId", "0")))
        gamescope.monitor_windows(proc.pid, appid=appid)

    rc = proc.wait()

    # GC de runtimes antigos (assíncrono, não crítico)
    try:
        removed = runtime.garbage_collect(base_path, verbose=verbose)
        if removed and verbose:
            print(f"  GC: {len(removed)} runtime(s) antigo(s) removido(s)")
    except Exception:
        pass

    # Limpa overrides do prefixo (criado por execução)
    try:
        ov_capture.clean_overrides(overrides_base)
        if verbose:
            print("  Overrides limpos")
    except Exception:
        pass

    return rc


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
    parser.add_argument("--download-runtime", nargs="?", const="steamrt4",
                        help="Baixa runtime especificado (default: steamrt4) e sai")
    parser.add_argument("--env", "-e", action="append", default=[],
                        help="Variável de ambiente adicional (KEY=VALUE, pode repetir)")
    parser.add_argument("--capsule", action="store_true",
                        help="Usa capsule-capture-libs (cópia) em vez de symlinks GPU")
    parser.add_argument("--mutable", action="store_true",
                        help="Torna runtime mutável (writable, para FEX-Emu)")

    args = parser.parse_args()

    if args.download_runtime:
        rt_path = runtime.ensure_runtime(
            args.base_path or os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            args.download_runtime,
            verbose=True,
        )
        print(f"Runtime {args.download_runtime} pronto: {rt_path}")
        return 0

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
        use_capsule=args.capsule,
        mutable_runtime=args.mutable,
    )


if __name__ == "__main__":
    sys.exit(cli())
