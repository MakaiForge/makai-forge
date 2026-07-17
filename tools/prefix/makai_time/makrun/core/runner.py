import os
from pathlib import Path

from makrun.consts import RUNTIME_DIR, FileLock
from makrun.core.command import build_command
from makrun.core.environment import check_env, set_env
from makrun.core.prefix import setup_pfx
from makrun.log import log
from makrun.resolver.proton import resolve_proton_path, validate_proton
from makrun.resolver.runtime import get_runtime_path, resolve_runtime_version
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
        "STEAM_COMPAT_APP_ID": "",
        "STEAM_COMPAT_TOOL_PATHS": "",
        "STEAM_COMPAT_LIBRARY_PATHS": "",
        "STEAM_COMPAT_MOUNTS": "",
        "STEAM_COMPAT_INSTALL_PATH": "",
        "STEAM_COMPAT_CLIENT_INSTALL_PATH": "",
        "STEAM_COMPAT_DATA_PATH": "",
        "STEAM_COMPAT_SHADER_PATH": "",
        "EXE": "",
        "SteamAppId": "",
        "SteamGameId": "",
        "STEAM_RUNTIME_LIBRARY_PATH": "",
        "PROTON_VERB": "",
        "UMU_ID": "",
        "UMU_NO_RUNTIME": "",
        "UMU_RUNTIME_UPDATE": "",
        "UMU_NO_PROTON": "",
        "RUNTIMEPATH": "",
    }

    if game_id:
        os.environ["GAMEID"] = game_id

    proton_path = resolve_proton_path(proton_name)
    if not proton_path or not validate_proton(proton_path):
        raise FileNotFoundError("No valid Proton found")

    os.environ["PROTONPATH"] = str(proton_path)
    runtime_ver = resolve_runtime_version(proton_path)
    runtime_path = get_runtime_path(runtime_ver)
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
