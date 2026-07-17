FORK_ID = "proton-ge-rtsp"

DEFINITION = {
    "name": 'Proton-GE RTSP',
    "author": 'SpookySkeletons',
    "base": 'proton-ge',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": True,
    "dxvk_nvapi": True,
    "features": {
        "rtsp_codec": True,
        "vrchat_fixes": True,
    },
    "patches": ['rtsp_codec', 'vrchat_optimizations'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'GE-Proton + RTSP codec support for VRChat. Niche use case.',
}
