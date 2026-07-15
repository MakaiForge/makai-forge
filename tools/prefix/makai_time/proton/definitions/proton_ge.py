FORK_ID = "proton-ge"

DEFINITION = {
    "name": 'GE-Proton (GloriousEggroll)',
    "author": 'GloriousEggroll',
    "base": 'valve',
    "branch": 'bleeding-edge',
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "async": False,
        "dlss_upgrader": False,
        "fsr": True,
        "fsr4": False,
        "gamemode": True,
        "hdr": True,
        "local_shader_cache": False,
        "ntsync": False,
        "per_game_shader_cache": True,
        "raytracing": True,
        "wayland": True,
        "xess_upgrader": False,
    },
    "patches": ['mf_media_foundation', 'staging', 'fsr', 'gamemode', 'cuda_physx', 'nvapi', 'protonfixes', 'raw_mouse', 'vulkan_improvements'],
    "dll_overrides": {
        'winemenubuilder.exe': '',
        'mscoree': '',
    },
    "env_defaults": {
        'PROTON_ENABLE_NVAPI': '1',
        'WINE_FULLSCREEN_FSR': '1',
        'WINE_FULLSCREEN_FSR_STRENGTH': '2',
    },
    "ld_library_path_extra": [],
    "notes": 'Bleeding edge. Best compatibility for most games. FSR, GameMode, codecs.',
}
