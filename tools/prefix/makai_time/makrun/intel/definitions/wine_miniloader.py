FORK_ID = "wine-miniloader"

DEFINITION = {
    "name": 'Wine-Miniloader',
    "author": 'Dawn Winery (NelloKudo)',
    "base": None,
    "branch": None,
    "wine_version": None,
    "dxvk": False,
    "vkd3d": False,
    "dxvk_nvapi": False,
    "features": {
        "miniloader_fixes": True,
    },
    "patches": ['miniloader_race_conditions'],
    "dll_overrides": {},
    "env_defaults": {},
    "ld_library_path_extra": [],
    "notes": 'Standalone Wine with miniloader launcher fixes (WeGame, Nikke). Not Proton. Hosted on dawn.wine.',
}
