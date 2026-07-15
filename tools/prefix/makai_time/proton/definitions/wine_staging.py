FORK_ID = "wine-staging"

DEFINITION = {
    "name": 'Wine-Staging (Kron4ek)',
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
        "wayland": True,
        "wow64": True,
    },
    "patches": ['wine_staging'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": "Kron4ek's Wine Staging build. Official Wine Staging patchset compiled with -O3. Available in 3 arch variants.",
}
