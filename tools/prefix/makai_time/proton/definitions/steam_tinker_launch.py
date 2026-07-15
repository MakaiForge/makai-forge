FORK_ID = "steam-tinker-launch"

DEFINITION = {
    "name": 'Steam Tinker Launch',
    "author": 'sonic2kk',
    "base": None,
    "branch": None,
    "wine_version": None,
    "dxvk": False,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "custom_proton_download": True,
        "gamescope": True,
        "gui_config": True,
        "mangohud": True,
        "mod_organizer_2": True,
        "per_game_env": True,
        "reshade": True,
        "specialk": True,
        "vortex": True,
        "winetricks_integration": True,
    },
    "patches": [],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Bash wrapper/launcher tool for Steam. Not a Proton fork. Provides GUI for mangohud, gamescope, modding tools, reshade. 2.8k stars.',
}
