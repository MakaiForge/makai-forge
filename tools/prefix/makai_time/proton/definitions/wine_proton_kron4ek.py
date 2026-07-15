FORK_ID = "wine-proton-kron4ek"

DEFINITION = {
    "name": 'Wine-Proton (Kron4ek)',
    "author": 'Kron4ek',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": False,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "esync": True,
        "fsync": True,
        "ntsync": True,
        "proton_patches": True,
        "wayland": True,
        "wow64": True,
    },
    "patches": ['proton_wine_patches'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": "Kron4ek's Wine build with Proton patches applied (Valve's Wine tree). No DXVK/VKD3D included - install manually. Available in amd64, amd64-wow64, x86.",
}
