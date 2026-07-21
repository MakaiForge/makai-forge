FORK_ID = "dxvk-gplasync"

DEFINITION = {
    "name": 'DXVK GPL+Async',
    "author": 'Ph42oN',
    "base": 'dxvk',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "async_shaders": True,
        "d3d11": True,
        "gpl_compliance": True,
        "vulkan": True,
    },
    "patches": ['async_shader_compilation'],
    "dll_overrides": {},
    "env_defaults": {
        'DXVK_ASYNC': '1',
    },
    "ld_library_path_extra": [],
    "notes": 'DXVK fork with async shader compilation and GPL compliance. Safe for single-player/co-op games.',
}
