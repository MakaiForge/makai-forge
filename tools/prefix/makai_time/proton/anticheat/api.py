"""API pública de detecção, env vars, relaxamento de container e recomendação."""

from makai_time.proton.anticheat.ac_types import AC_TYPE_INFO
from makai_time.proton.anticheat.container import CONTAINER_RELAX_FLAGS
from makai_time.proton.anticheat.games import GAME_AC_DATABASE


def detect_anticheat(
    game_exe: str,
    steam_app_id: str | None = None,
) -> dict | None:
    exe_lower = game_exe.lower() if game_exe else ""
    for game_id, data in GAME_AC_DATABASE.items():
        if steam_app_id and data.get("steam_id") == steam_app_id:
            return {"game_id": game_id, **data}
        if exe_lower:
            for exe_pattern in data.get("exe", []):
                if exe_pattern.lower() == exe_lower:
                    return {"game_id": game_id, **data}
    return None


def get_ac_env_vars(game_exe: str, steam_app_id: str | None = None) -> dict[str, str]:
    ac_data = detect_anticheat(game_exe, steam_app_id)
    if not ac_data:
        return {}
    env = {}
    env.update(ac_data.get("env", {}))
    for ac_type in ac_data.get("ac_types", []):
        ac_info = AC_TYPE_INFO.get(ac_type, {})
        if ac_info.get("env_var"):
            env[ac_info["env_var"]] = ac_info["env_val"]
    return env


def get_ac_container_relaxations(
    game_exe: str,
    steam_app_id: str | None = None,
) -> list[str]:
    ac_data = detect_anticheat(game_exe, steam_app_id)
    if not ac_data:
        return []
    return list(ac_data.get("container_relax", []))


def get_ac_container_bwrap_flags(
    game_exe: str,
    steam_app_id: str | None = None,
) -> list[str]:
    relaxations = get_ac_container_relaxations(game_exe, steam_app_id)
    flags = []
    for relax in relaxations:
        flags.extend(CONTAINER_RELAX_FLAGS.get(relax, {}).get("bwrap_flags", []))
    return flags


def is_anticheat_compatible(
    game_exe: str,
    steam_app_id: str | None = None,
) -> bool | None:
    ac_data = detect_anticheat(game_exe, steam_app_id)
    if not ac_data or not ac_data.get("ac_types"):
        return None
    return ac_data.get("compatible", False)


def has_anticheat(
    game_exe: str,
    steam_app_id: str | None = None,
) -> bool:
    ac_data = detect_anticheat(game_exe, steam_app_id)
    return bool(ac_data and ac_data.get("ac_types"))


def list_anticheat_games(
    ac_type: str | None = None,
    compatible_only: bool = False,
) -> list[dict]:
    results = []
    for game_id, data in GAME_AC_DATABASE.items():
        if not data.get("ac_types"):
            continue
        if ac_type and ac_type not in data.get("ac_types", []):
            continue
        if compatible_only and not data.get("compatible", False):
            continue
        exe_str = data.get("exe", [None])[0] or "unknown.exe"
        results.append({
            "game_id": game_id,
            "exe": exe_str,
            "ac_types": data.get("ac_types", []),
            "compatible": data.get("compatible", False),
            "steam_id": data.get("steam_id", ""),
            "notes": data.get("notes", ""),
        })
    return results


def list_ac_types() -> list[dict]:
    return [
        {
            "id": ac_id,
            "name": info.get("name", ac_id),
            "compatible_generally": info.get("compatible_generally"),
            "description": info.get("description", ""),
        }
        for ac_id, info in AC_TYPE_INFO.items()
    ]


def get_anticheat_info(ac_type: str) -> dict | None:
    return AC_TYPE_INFO.get(ac_type)


def suggest_proton_for_anticheat(
    game_exe: str,
    steam_app_id: str | None = None,
) -> str | None:
    ac_data = detect_anticheat(game_exe, steam_app_id)
    if not ac_data or not ac_data.get("ac_types"):
        return None

    ac_types = ac_data["ac_types"]

    if "vanguard" in ac_types or "ricochet" in ac_types:
        return None

    if "nprotect" in ac_types or "xigncode3" in ac_types:
        return "proton-ge"

    if "eac" in ac_types and "battleye" in ac_types:
        if "destiny-2" in (ac_data.get("game_id", "")):
            return None
        return "proton-ge"

    if "eac" in ac_types:
        return "dw-proton"

    if "battleye" in ac_types:
        return "proton-ge"

    if "ace" in ac_types:
        return "dw-proton"

    if "denuvo" in ac_types:
        return "proton-cachyos"

    return "proton-ge"
