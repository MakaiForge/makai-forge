"""
Geração de opções de lançamento para jogos.

Combina dados de anti-cheat, gacha games e DLLs recomendadas
em um conjunto de opções (env_vars, winetricks, dlls, etc).
"""

from ..data import _load_json
from ..gacha import _get_gacha_data


def get_default_launch_options() -> dict:
    return {
        "env_vars": [],
        "dlls": [],
        "winetricks": [],
        "wine_overrides": "",
        "gacha_hints": [],
    }


def get_game_launch_options(game_id: str, game_data: dict) -> dict:
    options = get_default_launch_options()

    anticheat = _load_json("anticheat.json")
    ac_games = anticheat.get("games", {}) if isinstance(anticheat, dict) else {}
    if game_id in ac_games:
        ac_data = ac_games[game_id]
        if ac_data.get("acTypes"):
            options["winetricks"].append("vcrun2022")

    options["dlls"] = ["d3dcompiler_47", "vcrun2022"]
    options["winetricks"] = list(set(options["winetricks"] + ["d3dcompiler_47", "vcrun2022"]))
    options["wine_overrides"] = "d3dcompiler_47=n,b"

    gacha_data = _get_gacha_data(game_id)
    if gacha_data:
        options["gacha_hints"] = [{
            "tipo_login": gacha_data.get("tipo_login", ""),
            "anti_cheat": gacha_data.get("anti_cheat", ""),
            "status_linux": gacha_data.get("status_linux", ""),
            "fix_conhecido": gacha_data.get("fix_conhecido", ""),
            "engine": gacha_data.get("engine", ""),
        }]

        options["dlls"] = list(set(options["dlls"] + ["mfplat"]))
        options["winetricks"] = list(set(options["winetricks"] + ["mf"]))

        if "genshin" in game_id or "honkai" in game_id:
            options["wine_overrides"] = "mfplat=n,b;d3dcompiler_47=n,b"
            options["env_vars"] = list(set(options["env_vars"] + ["PROTON_ENABLE_WAYLAND=0"]))
        else:
            options["env_vars"] = list(set(options["env_vars"] + ["PROTON_ENABLE_WAYLAND=0"]))

    return options
