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


def run(proton_name: str | None, exe_path: str | None, game_id: str | None) -> int:
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

    for key, val in env.items():
        log.debug("%s=%s", key, val)
        os.environ[key] = val

    command = build_command(env, runtime_path)
    log.debug("Command: %s", command)

    return run_command(command)
