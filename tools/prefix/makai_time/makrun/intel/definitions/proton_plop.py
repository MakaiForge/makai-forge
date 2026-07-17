FORK_ID = "proton-plop"

DEFINITION = {
    "name": 'Proton-Plop',
    "author": 'loathingKernel',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "em_nightly": True,
    },
    "patches": ['various_optimizations'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'EM nightly builds integration. Various optimizations.',
}
