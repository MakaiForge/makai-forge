FORK_ID = "proton-tkg"

DEFINITION = {
    "name": 'Proton-Tkg',
    "author": 'Frogging-Family',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "custom_patches": True,
        "tkg_configs": True,
    },
    "patches": ['wine_tkg', 'custom_configurable'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Customizable build system. User can choose patches via TKG config.',
}
