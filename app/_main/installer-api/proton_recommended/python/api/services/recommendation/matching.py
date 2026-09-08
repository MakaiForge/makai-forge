"""
Consultas ao banco de dados de recomendação (proton_data.db).

Duas tabelas principais:
  - game_matches:   matched.json indexado (jogos no catálogo)
  - fork_recommendations:  recomendações por similaridade de título
"""

import json

from ...db.connection import _get_proton_db


def get_game_match(game_id: str) -> dict | None:
    db = _get_proton_db()
    if db is None:
        return None
    row = db.execute(
        "SELECT * FROM game_matches WHERE game_id = ?", (game_id,)
    ).fetchone()
    if row is None:
        return None
    result = dict(row)
    fr = result.get("fork_recommendations")
    if fr:
        try:
            result["forkRecommendations"] = json.loads(fr)
        except (json.JSONDecodeError, TypeError):
            result["forkRecommendations"] = {}
    else:
        result["forkRecommendations"] = {}
    return result


def get_fork_recommendations(game_id: str) -> list[dict]:
    db = _get_proton_db()
    if db is None:
        return []
    rows = db.execute(
        "SELECT * FROM fork_recommendations WHERE game_id = ?", (game_id,)
    ).fetchall()
    results = []
    for row in rows:
        d = dict(row)
        ac = d.get("anticheat")
        if ac:
            try:
                d["anticheat"] = json.loads(ac)
            except (json.JSONDecodeError, TypeError):
                d["anticheat"] = {}
        else:
            d["anticheat"] = {}
        results.append(d)
    return results
