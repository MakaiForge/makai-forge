#!/usr/bin/env python3
"""
Fetch ProtonDB reports for all mod-compatible games, analyze which
Proton versions are most used/rated, and save as JSON.
"""

import json
import os
import re
import sys
import time
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

API_BASE = "https://protondb.max-p.me/games"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

GAMES = [
    {"id": "skyrim", "name": "Skyrim", "steamAppId": "72850"},
    {"id": "skyrim_se", "name": "Skyrim Special Edition", "steamAppId": "489830"},
    {"id": "skyrim_vr", "name": "Skyrim VR", "steamAppId": "611670"},
    {"id": "fallout3", "name": "Fallout 3", "steamAppId": "22300"},
    {"id": "falloutnv", "name": "Fallout New Vegas", "steamAppId": "22380"},
    {"id": "fallout4", "name": "Fallout 4", "steamAppId": "377160"},
    {"id": "fallout4_vr", "name": "Fallout 4 VR", "steamAppId": "611660"},
    {"id": "oblivion", "name": "Oblivion", "steamAppId": "22330"},
    {"id": "morrowind", "name": "Morrowind", "steamAppId": "22320"},
    {"id": "starfield", "name": "Starfield", "steamAppId": "1716740"},
    {"id": "enderal", "name": "Enderal", "steamAppId": "933480"},
    {"id": "enderal_se", "name": "Enderal SE", "steamAppId": "976620"},
    {"id": "witcher3", "name": "The Witcher 3", "steamAppId": "292030"},
    {"id": "cyberpunk2077", "name": "Cyberpunk 2077", "steamAppId": "1091500"},
    {"id": "larian", "name": "Baldur's Gate 3", "steamAppId": "1086940"},
    {"id": "stardewvalley", "name": "Stardew Valley", "steamAppId": "413150"},
    {"id": "valheim", "name": "Valheim", "steamAppId": "892970"},
    {"id": "rimworld", "name": "RimWorld", "steamAppId": "294100"},
    {"id": "factorio", "name": "Factorio", "steamAppId": "427520"},
    {"id": "projectzomboid", "name": "Project Zomboid", "steamAppId": "108600"},
    {"id": "bannerlord", "name": "Bannerlord", "steamAppId": "261550"},
    {"id": "7daystodie", "name": "7 Days to Die", "steamAppId": "251570"},
    {"id": "subnautica", "name": "Subnautica", "steamAppId": "264710"},
    {"id": "thelongdark", "name": "The Long Dark", "steamAppId": "305620"},
    {"id": "satisfactory", "name": "Satisfactory", "steamAppId": "526870"},
    {"id": "terraria", "name": "Terraria", "steamAppId": "105600"},
    {"id": "donotfeedthemonkeys", "name": "Do Not Feed the Monkeys", "steamAppId": "658850"},
    {"id": "kerbalspaceprogram", "name": "Kerbal Space Program", "steamAppId": "220200"},
    {"id": "battletech", "name": "BattleTech", "steamAppId": "637090"},
    {"id": "dragonageorigins", "name": "Dragon Age: Origins", "steamAppId": "17450"},
    {"id": "dragonage2", "name": "Dragon Age II", "steamAppId": "1238040"},
    {"id": "masseffect", "name": "Mass Effect (Legendary)", "steamAppId": "1328670"},
    {"id": "xcom2", "name": "XCOM 2", "steamAppId": "268500"},
]

POSITIVE_RATINGS = {"platinum", "gold"}
NEGATIVE_RATINGS = {"bronze", "borked"}
NEUTRAL_RATINGS = {"silver"}


def fetch_reports(steam_app_id: str) -> list[dict]:
    url = f"{API_BASE}/{steam_app_id}/reports/"
    req = Request(url, headers={"User-Agent": "MakaiForge/1.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        print(f"  HTTP {e.code} for {steam_app_id}", file=sys.stderr)
        return []
    except (URLError, OSError, json.JSONDecodeError) as e:
        print(f"  Error for {steam_app_id}: {e}", file=sys.stderr)
        return []


def normalize_version(raw: str | None) -> str:
    if not raw:
        return "unknown"
    v = raw.strip()
    v = re.sub(r"\s+", " ", v)
    return v


def analyze_reports(reports: list[dict]) -> dict:
    version_stats: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "positive": 0, "negative": 0, "neutral": 0, "ratings": []}
    )

    for r in reports:
        pv = normalize_version(r.get("protonVersion"))
        rating = (r.get("rating") or "").strip().lower()

        stats = version_stats[pv]
        stats["total"] += 1

        if rating in POSITIVE_RATINGS:
            stats["positive"] += 1
        elif rating in NEGATIVE_RATINGS:
            stats["negative"] += 1
        else:
            stats["neutral"] += 1

        stats["ratings"].append(rating)

    entries = []
    for version, stats in version_stats.items():
        positive_ratio = round(stats["positive"] / stats["total"], 2) if stats["total"] > 0 else 0
        entries.append({
            "version": version,
            "total": stats["total"],
            "positive": stats["positive"],
            "negative": stats["negative"],
            "neutral": stats["neutral"],
            "positiveRatio": positive_ratio,
        })

    entries.sort(key=lambda e: (-e["total"], -e["positiveRatio"]))

    return {
        "totalReports": len(reports),
        "versions": entries,
        "recommended": [e["version"] for e in entries[:5] if e["positiveRatio"] >= 0.5],
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    for game in GAMES:
        game_id = game["id"]
        steam_id = game["steamAppId"]
        print(f"[{game_id}] ({steam_id}) {game['name']}...", end=" ", flush=True)

        reports = fetch_reports(steam_id)
        if not reports:
            print("sem reports")
            result = {
                "gameId": game_id,
                "name": game["name"],
                "steamAppId": steam_id,
                "totalReports": 0,
                "versions": [],
                "recommended": [],
            }
        else:
            print(f"{len(reports)} reports", flush=True)
            result = analyze_reports(reports)
            result["gameId"] = game_id
            result["name"] = game["name"]
            result["steamAppId"] = steam_id

        out_path = os.path.join(OUT_DIR, f"{game_id}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        time.sleep(0.3)

    print("\nConcluido! JSONs salvos em:", OUT_DIR)


if __name__ == "__main__":
    main()
