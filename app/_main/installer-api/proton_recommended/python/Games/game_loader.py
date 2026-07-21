"""game_loader — Auto-discovery of game handlers in Games/ directory."""

from __future__ import annotations
import importlib
import inspect
import pkgutil
from pathlib import Path
from typing import Optional

from .base_game import BaseGame, GameInfo


_handlers: Optional[dict[str, BaseGame]] = None
_handlers_by_steam: Optional[dict[str, BaseGame]] = None


def _discover_handlers() -> dict[str, BaseGame]:
    """Scan Games/ package and instantiate all BaseGame subclasses."""
    handlers: dict[str, BaseGame] = {}

    package_path = Path(__file__).resolve().parent

    for importer, modname, ispkg in pkgutil.iter_modules([str(package_path)]):
        if modname.startswith("_") or modname in ("base_game", "game_loader", "__init__"):
            continue
        try:
            module = importlib.import_module(f"Games.{modname}")
        except Exception:
            continue

        for _, obj in inspect.getmembers(module, inspect.isclass):
            if (issubclass(obj, BaseGame) and obj is not BaseGame
                    and not getattr(obj, "_abstract", False)):
                try:
                    instance = obj()
                    if instance.game_id in handlers:
                        continue
                    handlers[instance.game_id] = instance
                except Exception:
                    pass

    # Also load generic games from registry
    try:
        from ._registry import create_generic_games
        for instance in create_generic_games():
            if instance.game_id not in handlers:
                handlers[instance.game_id] = instance
    except Exception:
        pass

    return handlers


def _ensure_loaded() -> None:
    global _handlers, _handlers_by_steam
    if _handlers is not None:
        return
    _handlers = _discover_handlers()
    _handlers_by_steam = {}
    for h in _handlers.values():
        if h.steam_app_id:
            _handlers_by_steam[h.steam_app_id] = h


def get_all_games() -> list[BaseGame]:
    _ensure_loaded()
    return list(_handlers.values())


def get_game_by_id(game_id: str) -> Optional[BaseGame]:
    _ensure_loaded()
    return _handlers.get(game_id)


def get_game_by_steam_id(steam_id: str) -> Optional[BaseGame]:
    _ensure_loaded()
    return _handlers_by_steam.get(steam_id)


def get_all_game_infos(configs: dict | None = None) -> list[GameInfo]:
    """Return serialisable GameInfo for all games, optionally with config overrides."""
    if configs is None:
        configs = {}
    result = []
    for game in get_all_games():
        cfg = configs.get(game.name, {})
        result.append(game.to_game_info(
            configured=bool(cfg.get("game_path")),
            game_path=cfg.get("game_path", ""),
        ))
    return result


def clear_cache() -> None:
    global _handlers, _handlers_by_steam
    _handlers = None
    _handlers_by_steam = None
