import os

from .database import (
    get_app_name,
    get_game_name,
    check_native,
    check_port,
)


def analyze(exe_path):
    clean_name = get_app_name(exe_path)
    result = {
        "original": os.path.basename(exe_path),
        "clean_name": clean_name,
        "game_name": get_game_name(clean_name),
    }

    native = check_native(clean_name)
    if native["found"]:
        result["type"] = "native"
        result["app"] = native["app"]
        result["package"] = native["package"]
        result["desc"] = native["desc"]
        return result

    port = check_port(clean_name)
    if port["found"]:
        result["type"] = "port"
        result["app"] = port["port"].get("name", clean_name.title())
        result["port"] = port["port"]
        result["port_id"] = port["id"]
        return result

    game_name = get_game_name(clean_name)
    if game_name:
        result["type"] = "game"
        result["app"] = game_name
        return result

    result["type"] = "unknown"
    result["app"] = clean_name.title() if clean_name else "Desconhecido"
    return result


def analyze_batch(exe_paths):
    return [analyze(p) for p in exe_paths]
