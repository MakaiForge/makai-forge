"""
Motor principal de recomendação de Proton.

Fluxo de decisão:
1. game_match (matched.json via proton_data.db)
2. fork_recommendations (proton_data.db)
3. Anti-cheat recommendations (anticheat.json)
4. Fallback: tierScore dos forks (protons.json)
"""

from ..data import _load_json
from ..catalog import _get_catalog_title as _get_catalog_title_online
from ..gacha import _get_gacha_data, _sort_forks_for_gacha
from ..anticheat import _get_anticheat_rec
from .matching import get_game_match, get_fork_recommendations
from .options import get_default_launch_options, get_game_launch_options


def recommend(game_id: str) -> dict:
    result = {
        "game_id": game_id,
        "title": "Unknown",
        "primary": None,
        "alternatives": [],
        "launch_options": get_default_launch_options(),
    }

    protons = _load_json("protons.json")
    game_match = get_game_match(game_id)

    if game_match:
        result["title"] = game_match.get("title", game_id)
        fork_recs = game_match.get("forkRecommendations", {})
        primary = fork_recs.get("primary", {})
        alternatives = fork_recs.get("alternatives", [])

        if primary:
            fork_name = primary.get("fork", "valve")
            fork_info = protons.get(fork_name, {})
            result["primary"] = {
                "fork": fork_name,
                "name": fork_info.get("name", fork_name),
                "version": primary.get("version", "latest"),
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": primary.get("confidence", "low"),
            }

        seen_forks = {result["primary"]["fork"]} if result["primary"] else set()
        for alt in alternatives:
            fork_name = alt.get("fork", "valve")
            if fork_name in seen_forks:
                continue
            seen_forks.add(fork_name)
            fork_info = protons.get(fork_name, {})
            result["alternatives"].append({
                "fork": fork_name,
                "name": fork_info.get("name", fork_name),
                "version": alt.get("version", "latest"),
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": alt.get("confidence", "low"),
            })

        if _get_gacha_data(game_id):
            for fid, finfo in _sort_forks_for_gacha(protons):
                if fid not in seen_forks:
                    seen_forks.add(fid)
                    result["alternatives"].append({
                        "fork": fid,
                        "name": finfo.get("name", fid),
                        "version": "latest",
                        "tier": finfo.get("ranking", "unknown"),
                        "tierScore": finfo.get("tierScore", 0),
                        "confidence": "genérico",
                    })

        result["launch_options"] = get_game_launch_options(game_id, game_match)
        return result

    fork_recs = get_fork_recommendations(game_id)
    if fork_recs:
        primary = None
        best_fork_from_ac = None
        found_title = None
        found_entries = []

        for rec in fork_recs:
            fork_id = rec["fork_id"]
            fork_info = protons.get(fork_id, {})

            anticheat = rec.get("anticheat", {})
            best_fork = anticheat.get("bestFork") if isinstance(anticheat, dict) else None
            distance = rec.get("distance", 999)
            if distance is None:
                distance = 999

            entry = {
                "fork": fork_id,
                "name": fork_info.get("name", fork_id),
                "version": rec.get("recommended", "latest"),
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": rec.get("confidence", "low"),
                "distance": distance,
                "bestFork": best_fork,
            }

            if found_title is None:
                found_title = rec.get("title", game_id)
            found_entries.append(entry)

        for entry in found_entries:
            if entry["bestFork"]:
                best_fork_from_ac = entry["bestFork"]
            if entry["bestFork"] and entry["fork"] == entry["bestFork"]:
                primary = entry
                break

        if primary is None and best_fork_from_ac:
            fork_info = protons.get(best_fork_from_ac, {})
            primary = {
                "fork": best_fork_from_ac,
                "name": fork_info.get("name", best_fork_from_ac),
                "version": "latest",
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": "medium",
                "note": "Recomendado para anti-cheat (EasyAntiCheat/BattlEye)",
            }
            found_entries.insert(0, primary)

        if primary is None:
            closest = min(found_entries, key=lambda e: e["distance"])
            if closest["distance"] < 1.0:
                primary = closest
            else:
                primary = max(found_entries, key=lambda e: e["tierScore"])

        alternatives = sorted(
            [e for e in found_entries if e["fork"] != primary["fork"]],
            key=lambda e: e["distance"],
        )

        for entry in [primary] + alternatives:
            entry.pop("distance", None)
            entry.pop("bestFork", None)

        result["title"] = found_title or game_id
        result["primary"] = primary
        result["alternatives"] = alternatives
        result["launch_options"] = get_game_launch_options(game_id, {})
        return result

    gacha_data = _get_gacha_data(game_id)

    anticheat_rec = _get_anticheat_rec(game_id)
    if anticheat_rec:
        result["title"] = anticheat_rec.get("title", game_id)
        ac_recs = anticheat_rec.get("acRecommendations", [])

        seen = set()
        prioritized = []
        for ac in ac_recs:
            if ac["fork"] in seen:
                continue
            seen.add(ac["fork"])
            fork_info = protons.get(ac["fork"], {})
            prioritized.append({
                "fork": ac["fork"],
                "name": fork_info.get("name", ac["fork"]),
                "version": "latest",
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": anticheat_rec.get("protonConfidence", "medium"),
                "reason": ac.get("reason", ""),
            })

        result["primary"] = prioritized[0]
        result["alternatives"] = prioritized[1:] if len(prioritized) > 1 else []

        rest = _sort_forks_for_gacha(protons) if gacha_data else sorted(
            [(fid, finfo) for fid, finfo in protons.items()
             if fid not in {e["fork"] for e in prioritized}],
            key=lambda x: x[1].get("tierScore", 0),
            reverse=True,
        )
        for fork_id, fork_info in rest:
            if fork_id in {e["fork"] for e in prioritized}:
                continue
            result["alternatives"].append({
                "fork": fork_id,
                "name": fork_info.get("name", fork_id),
                "version": "latest",
                "tier": fork_info.get("ranking", "unknown"),
                "tierScore": fork_info.get("tierScore", 0),
                "confidence": "genérico",
            })

        result["launch_options"] = get_game_launch_options(game_id, {})
        return result

    catalog_title = _get_catalog_title_online(game_id)
    if catalog_title:
        result["title"] = catalog_title

    sorted_forks = _sort_forks_for_gacha(protons) if gacha_data else sorted(
        protons.items(),
        key=lambda x: x[1].get("tierScore", 0),
        reverse=True,
    )

    for i, (fork_id, fork_info) in enumerate(sorted_forks):
        entry = {
            "fork": fork_id,
            "name": fork_info.get("name", fork_id),
            "version": "latest",
            "tier": fork_info.get("ranking", "unknown"),
            "tierScore": fork_info.get("tierScore", 0),
            "confidence": "genérico",
        }
        if i == 0:
            result["primary"] = entry
        else:
            result["alternatives"].append(entry)

    return result


def get_available_forks() -> list:
    protons = _load_json("protons.json")
    result = []
    for fork_id, fork_data in protons.items():
        versions = fork_data.get("versions") or []
        result.append({
            "id": fork_id,
            "name": fork_data.get("name", fork_id),
            "category": fork_data.get("category", "Proton"),
            "ranking": fork_data.get("ranking", "unknown"),
            "tierScore": fork_data.get("tierScore", 0),
            "versionCount": len(versions),
            "versions": versions,
            "description": fork_data.get("description", ""),
            "source": fork_data.get("source", ""),
            "features": fork_data.get("stats", {}).get("topFeatures", []),
        })
    return sorted(result, key=lambda x: -x["tierScore"])
