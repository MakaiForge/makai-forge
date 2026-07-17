FORK_ID = "proton-speedhack"

DEFINITION = {
    "name": 'Proton-SpeedHack',
    "author": 'LtSquigs',
    "base": 'valve',
    "branch": None,
    "wine_version": None,
    "dxvk": True,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "speed_hack": True,
    },
    "patches": ['speed_hack'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Speed hack capabilities for older games. No D3D12 support.',
}
