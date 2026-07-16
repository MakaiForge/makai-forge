"""steamclient.fake — Steam API stub for DRM-free and custom games.

Wine ships a built-in steam.dll that stubs Steamworks API calls.
Proton has additional steamclient support via env vars.

Usage:
    env_vars = steamclient_env(prefix_path, steam_app_id="0")
    override_args = steamclient_mount_args(prefix_path, game_dir)
"""

import os
import shutil


STEAM_API_DLL_OVERRIDES = (
    "steam_api=b;steam_api64=b;steam=b;"
    "steamclient=b;steamclient64=b"
)


def steamclient_env(
    prefix_path: str | None = None,
    steam_app_id: str = "0",
) -> dict[str, str]:
    env = {
        "SteamAppId": steam_app_id,
        "SteamGameId": steam_app_id,
        "PROTON_USE_STEAMCLIENT": "1",
        "WINEDLLOVERRIDES": STEAM_API_DLL_OVERRIDES,
    }

    steam_paths = [
        os.path.realpath(os.path.expanduser("~/.steam/root")),
        os.path.realpath(os.path.expanduser("~/.steam/steam")),
        os.path.realpath(os.path.expanduser("~/.steam")),
    ]
    for sp in steam_paths:
        if os.path.isdir(sp):
            env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = sp
            break

    return env


def steamclient_mount_args(
    prefix_path: str | None = None,
    game_dir: str | None = None,
) -> list[str]:
    args = []

    steam_root_real = os.path.realpath(os.path.expanduser("~/.steam/root"))
    if os.path.isdir(steam_root_real):
        subdirs = ["bin32", "bin64", "sdk32", "sdk64", "steam", "steambeta"]
        for sub in subdirs:
            path = os.path.join(steam_root_real, sub)
            if os.path.isdir(path):
                args.extend(["--ro-bind", path, path])

    return args
