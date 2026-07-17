FORK_ID = "wine-staging-tkg"

DEFINITION = {
    "name": 'Wine-Staging-Tkg (Kron4ek)',
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
        "staging_patches": True,
        "tkg_patches": True,
        "wayland": True,
        "wow64": True,
    },
    "patches": ['wine_staging', 'wine_tkg', 'custom_configurable'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": "Kron4ek's Wine Staging + TkG patchset build. Includes extra patches beyond staging. Compiled with -O3 -msse3.",
}
