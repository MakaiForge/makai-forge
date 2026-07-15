FORK_ID = "proton-ge-miniloader"

DEFINITION = {
    "name": 'Proton-GE-Miniloader',
    "author": 'Dawn Winery (NelloKudo)',
    "base": 'proton-ge',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "async": False,
        "dlss_upgrader": False,
        "fsr": False,
        "fsr4": False,
        "gamemode": False,
        "hdr": False,
        "local_shader_cache": False,
        "miniloader_fixes": True,
        "ntsync": False,
        "per_game_shader_cache": False,
        "raytracing": False,
        "wayland": False,
        "xess_upgrader": False,
    },
    "patches": ['miniloader_race_conditions', 'wine_miniloader_name'],
    "dll_overrides": {},
    "env_defaults": {
        'WINE_MINILOADER_NAME': '',
    },
    "ld_library_path_extra": [],
    "notes": 'GE-Proton with miniloader patches for WeGame, Nikke, and similar launchers. Uses WINE_MINILOADER_NAME env var.',
}
