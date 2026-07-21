"""
Dados de anti-cheat e recomendações baseadas em AC.

Carrega o anticheat.json que mapeia jogos com anti-cheat
(EasyAntiCheat, BattlEye, etc) para forks de Proton compatíveis.

Usado como fallback quando não há game_match nem fork_recommendations:
jogos com anti-cheat recebem recomendações específicas do AC em vez
do tierScore genérico.
"""

from .data import _load_json


def _get_anticheat_rec(game_id: str) -> dict | None:
    anticheat = _load_json("anticheat.json")
    ac_games = anticheat.get("games", {}) if isinstance(anticheat, dict) else {}
    ac_data = ac_games.get(game_id)
    if not ac_data or not ac_data.get("acRecommendations"):
        return None
    return ac_data


def check_anticheat(game_id: str) -> dict:
    """Verifica se um jogo requer anti-cheat e quais.

    Args:
        game_id: ID do jogo

    Retorna:
        Dict com {eac: bool, battleye: bool}
    """
    ac_data = _get_anticheat_rec(game_id)
    if not ac_data:
        return {"eac": False, "battleye": False}

    raw = str(ac_data).lower()
    return {
        "eac": "easyanticheat" in raw or "eos" in raw,
        "battleye": "battleye" in raw,
    }
