import os
from enum import Enum
from pathlib import Path


class GamescopeAtom(Enum):
    SteamGame = "STEAM_GAME"
    BaselayerAppId = "GAMESCOPECTRL_BASELAYER_APPID"


class FileLock(Enum):
    Runtime = "makrun_runtime.lock"
    Prefix = "makrun_prefix.lock"


PROTON_VERBS = {
    "waitforexitandrun",
    "run",
    "runinprefix",
    "destroyprefix",
}

PR_SET_CHILD_SUBREAPER = 36

TMPFS_MIN = 1073741824

XDG_CACHE_HOME = (
    Path(os.environ["XDG_CACHE_HOME"])
    if os.environ.get("XDG_CACHE_HOME")
    else Path.home() / ".cache"
)

XDG_DATA_HOME = (
    Path(os.environ["XDG_DATA_HOME"])
    if os.environ.get("XDG_DATA_HOME")
    else Path.home() / ".local" / "share"
)

RUNTIME_DIR = XDG_DATA_HOME / "umu"
STEAM_COMPAT_DIR = XDG_DATA_HOME / "Steam" / "compatibilitytools.d"
CACHE_DIR = XDG_CACHE_HOME / "makrun"
