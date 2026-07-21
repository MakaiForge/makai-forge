"""
Importa do módulo unificado tools/prefix/python/prefix/.
"""
import sys, os
_prefix_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 7), "tools", "prefix", "python")
)
if _prefix_path not in sys.path:
    sys.path.insert(0, _prefix_path)

from prefix.core import clean_prefix  # noqa: E402,F401
from prefix.runner import run_proton_command_for_game  # noqa: E402,F401

from .manager import (  # noqa: E402,F401
    find_steam_appid_from_game_path,
    find_appid_by_name,
    get_compat_tool_path,
    get_prefix_path,
    get_prefix_drive_c,
)

__all__ = [
    "find_steam_appid_from_game_path",
    "find_appid_by_name",
    "get_compat_tool_path",
    "get_prefix_path",
    "get_prefix_drive_c",
    "clean_prefix",
    "run_proton_command_for_game",
]
