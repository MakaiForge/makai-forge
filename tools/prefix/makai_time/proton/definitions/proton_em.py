FORK_ID = "proton-em"

DEFINITION = {
    "name": 'Proton-EM',
    "author": 'Etaash',
    "base": 'valve',
    "branch": 'em-10',
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "fsr4": True,
        "hdr": True,
        "wayland_improved": True,
    },
    "patches": ['winewayland_color_management', 'winewayland_mouse_pointer', 'winewayland_hdr', 'fsr4', 'media_fixes'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Wayland-first Proton. Best winewayland.drv implementation. FSR4 pioneer.',
}
