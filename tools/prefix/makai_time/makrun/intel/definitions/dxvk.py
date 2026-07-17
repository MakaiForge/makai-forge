FORK_ID = "dxvk"

DEFINITION = {
    "name": 'DXVK',
    "author": 'doitsujin',
    "base": None,
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "d3d10": True,
        "d3d11": True,
        "d3d9": True,
        "vulkan": True,
    },
    "patches": [],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Direct3D 9/10/11 to Vulkan translation layer. Essential for Windows games on Linux. ZLIB license.',
}
