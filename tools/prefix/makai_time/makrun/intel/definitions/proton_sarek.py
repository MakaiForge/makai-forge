FORK_ID = "proton-sarek"

DEFINITION = {
    "name": 'Proton-Sarek',
    "author": 'pythonlover02',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": False,
    "features": {
        "async": True,
        "sarek_patches": True,
    },
    "patches": ['dxvk_sarek', 'async_dxvk'],
    "dll_overrides": {},
    "env_defaults": {
        'DXVK_ASYNC': '1',
    },
    "ld_library_path_extra": [],
        "launch": {"method": "wine_preloader", "wineloadernoexec": True, "use_preloader": True},
    "notes": 'Sarek DXVK fork. Async compute. Good for older GPUs with Vulkan 1.3 issues.',
}
