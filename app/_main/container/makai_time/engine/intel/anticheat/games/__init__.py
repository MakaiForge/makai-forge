"""Auto-descoberta de jogos com anti-cheat.

Cada módulo em games/ exporta uma constante ``GAME`` (dict).
O padrão é idêntico ao de definitions/ no intel.py.
"""

import importlib
import logging
import os
import pkgutil

_log = logging.getLogger("engine.intel.anticheat.games")

GAME_AC_DATABASE: dict[str, dict] = {}

_games_dir = os.path.dirname(os.path.abspath(__file__))
_games_pkg = __package__ or __name__

for _loader, _module_name, _is_pkg in pkgutil.iter_modules([_games_dir]):
    if _module_name == "__init__":
        continue
    _mod = importlib.import_module(f"{_games_pkg}.{_module_name}")
    if hasattr(_mod, "GAME"):
        game_data = _mod.GAME
        game_id = game_data.get("id", _module_name)
        entry = {k: v for k, v in game_data.items() if k != "id"}
        GAME_AC_DATABASE[game_id] = entry
