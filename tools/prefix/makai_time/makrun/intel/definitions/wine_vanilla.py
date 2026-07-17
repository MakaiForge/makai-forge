FORK_ID = "wine-vanilla"

DEFINITION = {
    "name": 'Wine-Vanilla (Kron4ek)',
    "author": 'Kron4ek',
    "base": None,
    "branch": None,
    "wine_version": None,
    "dxvk": False,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "esync": True,
        "fsync": True,
        "ntsync": True,
        "wayland": True,
        "wow64": True,
    },
    "patches": [],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Pure upstream WineHQ build by Kron4ek. No patches. Compiled with -O3 -msse3 -march=x86-64.',
}
