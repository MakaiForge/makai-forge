import os
from pathlib import Path
from re import match as re_match
from secrets import token_hex

from makrun.consts import RUNTIME_DIR, STEAM_COMPAT_DIR
from makrun.log import log
from makrun.util.system import get_library_paths


def check_env(env: dict[str, str]) -> dict[str, str]:
    if not os.environ.get("GAMEID"):
        log.info("No GAMEID set, using makrun-default")
        os.environ["GAMEID"] = "makrun-default"

    env["GAMEID"] = os.environ["GAMEID"]

    if os.environ.get("WINEPREFIX") == "":
        raise ValueError("WINEPREFIX is empty")

    if "WINEPREFIX" not in os.environ:
        pfx = Path.home() / "Games" / "makrun" / env["GAMEID"]
        pfx.mkdir(parents=True, exist_ok=True)
        os.environ["WINEPREFIX"] = str(pfx)

    prefix = os.environ["WINEPREFIX"]
    if not Path(prefix).expanduser().is_dir():
        Path(prefix).expanduser().mkdir(parents=True)
        os.environ["WINEPREFIX"] = str(Path(prefix).expanduser())

    env["WINEPREFIX"] = os.environ["WINEPREFIX"]

    if os.environ.get("PROTONPATH"):
        path = STEAM_COMPAT_DIR / os.environ["PROTONPATH"]
        if path.is_dir():
            os.environ["PROTONPATH"] = str(path)
        elif Path(os.environ["PROTONPATH"]).is_dir():
            os.environ["PROTONPATH"] = str(Path(os.environ["PROTONPATH"]).resolve())

    if "PROTONPATH" not in os.environ or not os.environ["PROTONPATH"]:
        raise FileNotFoundError("PROTONPATH not set or empty")

    env["PROTONPATH"] = os.environ["PROTONPATH"]
    return env


def set_env(env: dict[str, str], exe_path: str | None = None) -> dict[str, str]:
    pfx = Path(env["WINEPREFIX"]).expanduser().resolve()
    proton = Path(env["PROTONPATH"]).expanduser().resolve()

    if os.environ.get("PROTON_VERB") in {"waitforexitandrun", "run", "runinprefix"}:
        env["PROTON_VERB"] = os.environ["PROTON_VERB"]
    else:
        env["PROTON_VERB"] = "waitforexitandrun"

    env["EXE"] = ""
    env["STEAM_COMPAT_INSTALL_PATH"] = ""

    if exe_path:
        try:
            exe = Path(exe_path).expanduser().resolve()
            env["EXE"] = str(exe)
            if not env.get("STEAM_COMPAT_INSTALL_PATH"):
                env["STEAM_COMPAT_INSTALL_PATH"] = str(exe.parent)
        except FileNotFoundError:
            env["EXE"] = exe_path
            log.warning("Executable not found: %s", exe_path)

    env["UMU_ID"] = env["GAMEID"]
    env["STEAM_COMPAT_APP_ID"] = "0"
    env["SteamAppId"] = "0"
    env["SteamGameId"] = "0"
    env["UMU_INVOCATION_ID"] = token_hex(16)

    env["WINEPREFIX"] = str(pfx)
    env["PROTONPATH"] = str(proton)
    env["STEAM_COMPAT_DATA_PATH"] = env["WINEPREFIX"]
    env["STEAM_COMPAT_SHADER_PATH"] = f"{env['STEAM_COMPAT_DATA_PATH']}/shadercache"

    runtime_path = os.environ.get("RUNTIMEPATH", "")
    env["RUNTIMEPATH"] = str(RUNTIME_DIR / runtime_path) if runtime_path else ""
    env["STEAM_COMPAT_TOOL_PATHS"] = f"{proton}:{env['RUNTIMEPATH']}"
    env["STEAM_COMPAT_MOUNTS"] = env["STEAM_COMPAT_TOOL_PATHS"]

    enable_game_drive(env)

    env["UMU_RUNTIME_UPDATE"] = os.environ.get("UMU_RUNTIME_UPDATE", "")
    env["UMU_NO_RUNTIME"] = os.environ.get("UMU_NO_RUNTIME", "")
    env["UMU_NO_PROTON"] = os.environ.get("UMU_NO_PROTON", "")

    return env


def enable_game_drive(env: dict[str, str]) -> dict[str, str]:
    paths: set[str] = set()
    install_path = env.get("STEAM_COMPAT_INSTALL_PATH", "")

    for parent in Path(install_path).parents:
        if parent.is_mount() and parent != Path("/"):
            env["STEAM_COMPAT_LIBRARY_PATHS"] = str(parent)
            break

    if os.environ.get("LD_LIBRARY_PATH"):
        paths = set(os.environ["LD_LIBRARY_PATH"].split(":"))

    if install_path:
        paths.add(install_path)

    paths |= get_library_paths()
    env["MAKAI_RUNTIME_LIBRARY_PATH"] = ":".join(paths)

    return env
