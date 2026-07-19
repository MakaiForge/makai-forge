"""
# =============================================================================
# !!! ATENÇÃO: NÃO MODIFICAR SEM AUTORIZAÇÃO EXPLÍCITA !!!
# =============================================================================
# Orquestrador principal do Makrun. Pipeline:
#   1. Resolve caminho do Proton + runtime
#   2. Configura prefixo + env vars
#   3. Injeta features (Proton Intelligence)
#   4. Constrói comando bwrap (container)
#   5. Executa
#
# NÃO ADICIONAR:
#   - Lógica específica de jogo (vai em profiles.py)
#   - Config de container (vai em builder.py + steps/)
#   - Novas env vars (vai em environment.py + steps/env.py)
# =============================================================================
"""

import os
from pathlib import Path

from makrun.consts import RUNTIME_DIR, FileLock
from makrun.core.command import build_command
from makrun.core.environment import check_env, set_env
from makrun.core.prefix import setup_pfx
from makrun.log import log
from makrun.resolver.proton import (
    detect_proton_from_prefix,
    resolve_proton_path,
    validate_proton,
)
from makrun.resolver.runtime import ensure_runtime, get_runtime_path, resolve_runtime_version
from makrun.util.lock import unix_flock
from makrun.util.process import run_command


def run(
    proton_name: str | None,
    exe_path: str | None,
    game_id: str | None,
    dry_run: bool = False,
) -> int:
    env: dict[str, str] = {
        "WINEPREFIX": "",
        "GAMEID": "",
        "PROTONPATH": "",
        "MAKAI_APP_ID": "",
        "MAKAI_TOOL_PATHS": "",
        "MAKAI_LIBRARY_PATHS": "",
        "MAKAI_MOUNTS": "",
        "MAKAI_GAME_INSTALL_DIR": "",
        "MAKAI_CLIENT_INSTALL_PATH": "",
        "MAKAI_COMPAT_DATA_PATH": "",
        "MAKAI_SHADER_PATH": "",
        "EXE": "",
        "SteamAppId": "",
        "SteamGameId": "",
        "MAKAI_RUNTIME_LIBRARY_PATH": "",
        "PROTON_VERB": "",
        "UMU_ID": "",
        "UMU_NO_RUNTIME": "",
        "UMU_RUNTIME_UPDATE": "",
        "UMU_NO_PROTON": "",
        "RUNTIMEPATH": "",
        "WINEDEBUG": "",
    }

    if game_id:
        os.environ["GAMEID"] = game_id

    # ── Auto-detecção de Proton via prefixo ──────────────────────────────────
    # Se o usuário NÃO passou --proton nem PROTONPATH, tenta descobrir
    # qual Proton usar lendo os metadados do WINEPREFIX (arquivos version
    # ou config_info). Isso evita que o makrun caia no fallback errado
    # (_find_latest_proton) quando o prefixo foi criado com um Proton
    # específico. Veja detect_proton_from_prefix() em resolver/proton.py.
    if not proton_name and os.environ.get("WINEPREFIX"):
        detected = detect_proton_from_prefix(os.environ["WINEPREFIX"])
        if detected:
            log.info("Proton auto-detectado do prefixo: %s", detected)
            proton_name = detected

    proton_path = resolve_proton_path(proton_name)
    if not proton_path or not validate_proton(proton_path):
        raise FileNotFoundError("No valid Proton found")

    os.environ["PROTONPATH"] = str(proton_path)
    runtime_ver = resolve_runtime_version(proton_path)
    runtime_path = ensure_runtime(runtime_ver)
    os.environ["RUNTIMEPATH"] = runtime_ver[1]

    if exe_path:
        os.environ["EXE"] = exe_path

    check_env(env)
    setup_pfx(env["WINEPREFIX"])
    set_env(env, exe_path)

    # NOVO: Proton Intelligence + Feature Injection
    features = None
    if proton_path:
        try:
            from makrun.intel.injector import inject_features
            from makrun.container.manifest import save_game_session

            _exe = exe_path or env.get("EXE", "")
            features = inject_features(
                proton_path=str(proton_path),
                game_id=game_id,
                game_exe=_exe,
                game_dir=env.get("WINEPREFIX", ""),
            )
            log.info("Proton: %s", features.get("fork_id"))
            log.info("Launch method: %s", features.get("launch", {}).get("method"))
            if features.get("env"):
                log.debug("Injected %d env vars", len(features["env"]))

            # Salva container manifest
            try:
                save_game_session(
                    prefix_path=env.get("WINEPREFIX", ""),
                    game_id=game_id,
                    fork_id=features.get("fork_id"),
                    proton_path=str(proton_path),
                    runtime_name=runtime_ver[0],
                    runtime_version=runtime_ver[1],
                    features=features,
                )
            except Exception as e:
                log.warning("Failed to save manifest: %s", e)
        except Exception as e:
            log.warning("Feature injection failed: %s", e)

    # Merge injected env vars (já que bwrap --clearenv apaga tudo,
    # precisamos passar as env vars do injector via --setenv no builder)
    # As env vars do injector são injetadas no container pelo builder

    for key, val in env.items():
        log.debug("%s=%s", key, val)
        if key in ("MAKAI_RUNTIME_LIBRARY_PATH", "STEAM_RUNTIME_LIBRARY_PATH"):
            continue  # não vazar pro host container — vai via bwrap --setenv
        os.environ[key] = val

    # Se é UMU_NO_RUNTIME, passar direto para o Proton
    if env.get("UMU_NO_RUNTIME") == "1":
        log.warning("Runtime disabled, launching Proton directly")
        proton_script = proton_path / "proton"
        verb = env.get("PROTON_VERB", "waitforexitandrun")
        exe = exe_path or ""
        command = [str(proton_script), verb, exe]
    else:
        command = build_command(
            env=env,
            runtime_path=runtime_path,
            proton_path=proton_path,
            exe_path=exe_path or "",
            features=features,
            dry_run=dry_run,
        )

    log.debug("Command: %s", command)

    if dry_run:
        log.info("=== DRY-RUN: would execute ===")
        log.info(" ".join(str(c) for c in command))
        return 0

    return run_command(tuple(command))
