"""
core/detection.py — Detecção de jogos (Steam, GOG, manual).

Fonte única de verdade para localizar jogos instalados.
"""

import os
import glob
import re

from core import storage
def __default_prefix_dir(game_id: str) -> str:
    home = os.path.expanduser("~")
    return os.path.join(home, "Games", "Prefix", game_id)


def detect_game(game_id: str) -> dict:
    """
    Detecta um jogo instalado via Steam, GOG ou scan manual.

    Args:
        game_id: ID do jogo

    Returns:
        dict com gamePath, prefixPath, source, steamAppId
    """
    result = {"gamePath": None, "prefixPath": None, "source": None, "steamAppId": None}

    # Tenta Steam primeiro
    config = storage.get(f"game:{game_id}:config") or {}

    if isinstance(config, dict):
        steam_app_id = config.get("steamAppId")
        if steam_app_id:
            steam = find_steam_app_path(steam_app_id)
            if steam:
                result["gamePath"] = steam["gamePath"]
                result["prefixPath"] = _default_prefix_dir(game_id)
                result["source"] = "steam"
                result["steamAppId"] = steam_app_id
                return result

    # Tenta por todos os steamIds do catalogo
    steam_ids = _get_steam_ids(game_id)
    for app_id in steam_ids:
        steam = find_steam_app_path(app_id)
        if steam:
            result["gamePath"] = steam["gamePath"]
            result["prefixPath"] = _default_prefix_dir(game_id)
            result["source"] = "steam"
            result["steamAppId"] = app_id
            return result

    # Tenta GOG
    gog_path = find_gog_game_path(game_id)
    if gog_path:
        result["gamePath"] = gog_path
        result["prefixPath"] = _default_prefix_dir(game_id)
        result["source"] = "gog"
        return result

    # Tenta scan manual
    exe = _get_detect_exe(game_id)
    if exe:
        manual = scan_manual(exe)
        if manual:
            result["gamePath"] = manual
            result["prefixPath"] = _default_prefix_dir(game_id)
            result["source"] = "manual"
            return result

    return result


def find_steam_app_path(steam_app_id: str) -> dict | None:
    """
    Encontra o caminho de instalação de um jogo Steam.

    Args:
        steam_app_id: Steam AppID

    Returns:
        dict com gamePath e libraryPath, ou None
    """
    libraries = _find_all_steam_libraries()
    for lib in libraries:
        manifest = os.path.join(lib, f"appmanifest_{steam_app_id}.acf")
        if not os.path.exists(manifest):
            continue
        try:
            with open(manifest) as f:
                content = f.read()
            match = re.search(r'"installdir"\s*"([^"]+)"', content)
            if match:
                game_path = os.path.join(lib, "common", match.group(1))
                if os.path.exists(game_path):
                    return {"gamePath": game_path, "libraryPath": lib}
        except OSError:
            continue
    return None


def find_gog_game_path(game_id: str) -> str | None:
    """Tenta encontrar jogo GOG em locais comuns."""
    home = os.path.expanduser("~")
    base_dirs = [
        os.path.join(home, "GOG Games"),
        os.path.join(home, "GOG"),
        os.path.join(home, "Games"),
    ]

    slug = game_id.lower().replace(" ", "")

    for base in base_dirs:
        if not os.path.exists(base):
            continue
        try:
            for entry in os.listdir(base):
                entry_lower = entry.lower().replace(" ", "")
                if slug in entry_lower or game_id.lower() in entry_lower:
                    full_path = os.path.join(base, entry)
                    if os.path.isdir(full_path):
                        return full_path
        except OSError:
            continue
    return None


def scan_manual(detect_exe: str, alts: list[str] | None = None) -> str | None:
    """Scan manual de diretórios conhecidos."""
    home = os.path.expanduser("~")
    exes = [detect_exe]
    if alts:
        exes.extend(alts)

    flat_dirs = [
        os.path.join(home, "Games"),
        os.path.join(home, "GOG Games"),
        os.path.join(home, "GOG"),
        os.path.join(home, ".local", "share", "Steam", "steamapps", "common"),
    ]

    for base in flat_dirs:
        if not os.path.exists(base):
            continue
        try:
            for entry in os.listdir(base):
                game_dir = os.path.join(base, entry)
                if not os.path.isdir(game_dir):
                    continue
                for exe in exes:
                    if os.path.exists(os.path.join(game_dir, exe)):
                        return game_dir
        except OSError:
            continue

    return None


def _find_all_steam_libraries() -> list[str]:
    """Retorna todas as Steam libraries (pastas steamapps)."""
    libraries = []
    base_steam = os.path.expanduser("~/.steam/steam")
    libraryfolders = os.path.join(base_steam, "steamapps", "libraryfolders.vdf")

    # Sempre inclui a library principal
    libraries.append(os.path.join(base_steam, "steamapps"))

    if os.path.exists(libraryfolders):
        try:
            with open(libraryfolders) as f:
                for line in f:
                    line = line.strip()
                    if '"' in line and line.count('"') >= 4:
                        parts = line.split('"')
                        path_candidate = parts[-2]
                        if os.path.isdir(path_candidate):
                            libraries.append(os.path.join(path_candidate, "steamapps"))
        except OSError:
            pass

    return list(set(libraries))


def _get_steam_ids(game_id: str) -> list[str]:
    """Retorna lista de Steam AppIDs para um game_id."""
    # Tenta do catalogo
    catalog = _load_game_dlls()
    for entry in catalog:
        if entry.get("gameId") == game_id or entry.get("name", "").lower().replace(" ", "_") == game_id:
            steam_ids = entry.get("steamIds") or []
            if isinstance(steam_ids, list):
                return [str(s) for s in steam_ids]
            if isinstance(steam_ids, str):
                return [steam_ids]
    return []


def _get_detect_exe(game_id: str) -> str | None:
    """Retorna o executável de detecção para um game_id."""
    catalog = _load_game_dlls()
    for entry in catalog:
        if entry.get("gameId") == game_id:
            return entry.get("detectExe")
    return None


def _load_game_dlls() -> list:
    """Carrega o catálogo game-dlls.json."""
    json_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "game-dlls.json"
    )
    if os.path.exists(json_path):
        import json
        with open(json_path) as f:
            data = json.load(f)
        if isinstance(data, dict) and "games" in data:
            return data["games"]
        if isinstance(data, list):
            return data
    return []
