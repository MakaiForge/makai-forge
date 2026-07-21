"""
Recomendação de Proton para jogos com mods (script extenders, loaders, etc).

Baseado no mod_compat.json, fornece:
- Recomendação de Proton por jogo para uso com mods
- Lista de DLLs necessárias para modding (script extenders)
- Score da comunidade e notas de compatibilidade

Dados extraídos de relatos da comunidade (ProtonDB, Reddit, GitHub, fóruns).
"""

from .data import _load_json


_MOD_COMPAT_CACHE: dict | None = None


def _get_mod_compat() -> dict:
    global _MOD_COMPAT_CACHE
    if _MOD_COMPAT_CACHE is not None:
        return _MOD_COMPAT_CACHE
    data = _load_json("mod_compat.json")
    if not data:
        return {"meta": {}, "games": {}}
    _MOD_COMPAT_CACHE = data
    return data


def recommend_proton_for_modding(game_id: str) -> dict:
    """Recomenda Proton + DLLs para jogar um jogo com mods.

    Retorna configuração específica para modding: qual GE-Proton usar,
    script extender, DLLs necessárias, e score da comunidade.

    Args:
        game_id: Steam App ID do jogo (ex: "489830")

    Retorna:
        Dict com recomendação para modding, ou dict vazio se não encontrado
    """
    data = _get_mod_compat()
    games = data.get("games", {})
    game = games.get(game_id)
    if not game:
        return {
            "game_id": game_id,
            "found": False,
            "message": "Nenhum dado de modding encontrado para este jogo.",
            "fallback": "GE-Proton é recomendado para jogos com script extenders e mods.",
        }

    result = {
        "game_id": game_id,
        "found": True,
        "title": game["title"],
        "scriptExtender": game["scriptExtender"],
        "extenderUrl": game.get("extenderUrl", ""),
        "recommendedFork": game["recommendedFork"],
        "recommendedVersion": game["recommendedVersion"],
        "requiredDllIds": game["requiredDllIds"],
        "winetricksCommands": game["winetricksCommands"],
        "extraOverrides": game.get("extraOverrides", ""),
        "communityScore": game["communityScore"],
        "tier": game["tier"],
        "notes": game["modCompatNotes"],
        "sources": game["sourceUrls"],
        "steamAppId": game["steamAppId"],
    }

    return result


def list_mod_compatible_games(query: str = "") -> list:
    """Lista todos os jogos com dados de compatibilidade de mods.

    Args:
        query: Filtro opcional de busca por nome

    Retorna:
        Lista de dicts com dados resumidos de cada jogo
    """
    data = _get_mod_compat()
    games = data.get("games", {})
    results = []

    for game_id, game in games.items():
        if query and query.lower() not in game["title"].lower():
            continue
        results.append({
            "game_id": game_id,
            "title": game["title"],
            "scriptExtender": game["scriptExtender"],
            "recommendedFork": game["recommendedFork"],
            "communityScore": game["communityScore"],
            "tier": game["tier"],
        })

    return sorted(results, key=lambda x: -x["communityScore"])


def get_game_mod_info(game_id: str) -> dict | None:
    """Retorna informações detalhadas de mod compat para um jogo.

    Args:
        game_id: Steam App ID do jogo

    Retorna:
        Dict completo do jogo ou None
    """
    data = _get_mod_compat()
    return data.get("games", {}).get(game_id)
