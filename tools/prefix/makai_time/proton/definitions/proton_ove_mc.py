FORK_ID = "proton-ove-mc"

DEFINITION = {
    "name": 'ProtonBuilds (Ove-Mc)',
    "author": 'Ove-Mc',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "async": False,
        "dlss_upgrader": False,
        "fsr": True,
        "fsr4": False,
        "gamemode": False,
        "hdr": False,
        "local_shader_cache": False,
        "ntsync": False,
        "per_game_shader_cache": False,
        "raytracing": False,
        "wayland": False,
        "xess_upgrader": False,
    },
    "patches": ['fsr'],
    "dll_overrides": {},
    "env_defaults": {
        'WINE_FULLSCREEN_FSR': '1',
    },
    "ld_library_path_extra": [],
    "notes": 'Custom Proton builds for Steam Deck with FSR support. Based on Proton 10.0.',
}
