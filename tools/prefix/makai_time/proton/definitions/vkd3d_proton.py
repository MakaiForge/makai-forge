FORK_ID = "vkd3d-proton"

DEFINITION = {
    "name": 'VKD3D-Proton',
    "author": 'HansKristian-Work',
    "base": None,
    "branch": None,
    "wine_version": None,
    "dxvk": False,
    "vkd3d": True,
    "dxvk_nvapi": False,
    "features": {
        "d3d12": True,
        "descriptor_heap": True,
        "vulkan": True,
    },
    "patches": [],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Direct3D 12 to Vulkan translation layer. Required for DX12 games. LGPL license.',
}
