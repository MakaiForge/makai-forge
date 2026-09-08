#!/usr/bin/env python3
"""
Process the full ProtonDB data dump (reports_piiremoved.json) using ijson
to extract per-game Proton version stats for all mod-compatible games.
"""

import json
import os
import sys
import re
from collections import defaultdict

import ijson

REPORTS_FILE = "/tmp/reports_piiremoved.json"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# All 33 mod-compatible games
GAMES = [
    {"id": "skyrim", "appId": "72850"},
    {"id": "skyrim_se", "appId": "489830"},
    {"id": "skyrim_vr", "appId": "611670"},
    {"id": "fallout3", "appId": "22300"},
    {"id": "falloutnv", "appId": "22380"},
    {"id": "fallout4", "appId": "377160"},
    {"id": "fallout4_vr", "appId": "611660"},
    {"id": "oblivion", "appId": "22330"},
    {"id": "morrowind", "appId": "22320"},
    {"id": "starfield", "appId": "1716740"},
    {"id": "enderal", "appId": "933480"},
    {"id": "enderal_se", "appId": "976620"},
    {"id": "witcher3", "appId": "292030"},
    {"id": "cyberpunk2077", "appId": "1091500"},
    {"id": "larian", "appId": "1086940"},
    {"id": "minecraft", "appId": ""},  # No Steam AppId
    {"id": "stardewvalley", "appId": "413150"},
    {"id": "valheim", "appId": "892970"},
    {"id": "rimworld", "appId": "294100"},
    {"id": "factorio", "appId": "427520"},
    {"id": "projectzomboid", "appId": "108600"},
    {"id": "bannerlord", "appId": "261550"},
    {"id": "7daystodie", "appId": "251570"},
    {"id": "subnautica", "appId": "264710"},
    {"id": "thelongdark", "appId": "305620"},
    {"id": "satisfactory", "appId": "526870"},
    {"id": "terraria", "appId": "105600"},
    {"id": "donotfeedthemonkeys", "appId": "658850"},
    {"id": "kerbalspaceprogram", "appId": "220200"},
    {"id": "battletech", "appId": "637090"},
    {"id": "dragonageorigins", "appId": "17450"},
    {"id": "dragonage2", "appId": "1238040"},
    {"id": "masseffect", "appId": "1328670"},
    {"id": "xcom2", "appId": "268500"},
]

# Games without Steam appId are excluded from ProtonDB
TARGET_APPIDS = {g["appId"] for g in GAMES if g["appId"]}


def normalize_version(raw: str | None) -> str | None:
    """Normalize Proton version strings. Returns None for unknown/empty."""
    if not raw:
        return None
    v = raw.strip()
    if not v or v.lower() in ("", "unknown", "none", "n/a", "default"):
        return None

    # Strip URLs and markdown links
    v = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', v)
    v = re.sub(r'https?://\S+', '', v)

    # Collapse whitespace
    v = re.sub(r"\s+", " ", v).strip()

    # Remove trailing/leading punctuation
    v = v.strip(".- ,;:()[]{}\"'")

    # Normalize "Proton 5.21-GE-1" and "Proton-5.21-GE-1" and "5.21-GE-1" → "GE-Proton5.21-1"
    m = re.match(r"(?:Proton[-\s]*)?(\d+\.\d+)-GE[-\s]*(\d+(?:\.\d+)?)", v)
    if m:
        return f"GE-Proton{m.group(1)}-{m.group(2)}"

    # Normalize "GE-Proton7-25" → "GE-Proton7-25" (already in our format)
    m = re.match(r"^GE[-\s]*Proton[-\s]*(\d+)[-\s]*(\d+(?:\.\d+)?)", v)
    if m:
        return f"GE-Proton{m.group(1)}-{m.group(2)}"

    # CUSTOM GE X.Y variants
    m = re.match(r"(?:CUSTOM\s+)?GE[-\s]*(\d+\.\d+[-\s]*\d*)", v)
    if m:
        ver = m.group(1).replace(" ", "-")
        return f"GE-Proton{ver}"

    # "GE-1.18" → "GE-Proton-1.18"
    m = re.match(r"^GE-(\d+\.\d+)$", v)
    if m:
        return f"GE-Proton-{m.group(1)}"

    # Wine-GE variants
    m = re.match(r"Wine-GE-(\d[\d.]*)", v)
    if m:
        return f"GE-Proton-{m.group(1)}"

    # proton_tkg variants
    m = re.match(r"proton_tkg_(\d[\d.]*)", v)
    if m:
        return f"Proton-tkg-{m.group(1)}"

    # "Experimental" variants → "Proton Experimental"
    if re.match(r"^(?:Proton[-\s]*)?Experimental", v):
        return "Proton Experimental"

    # "Hotfix" variants → "Proton Hotfix"
    if re.match(r"^(?:Proton[-\s]*)?Hotfix", v):
        return "Proton Hotfix"

    # "Proton X.Y" → "X.Y" (if it's just a simple Valve version like "Proton 8.0")
    m = re.match(r"^Proton\s+(\d+\.\d+)(?:-(\d+))?$", v)
    if m:
        if m.group(2):
            return f"{m.group(1)}-{m.group(2)}"
        return m.group(1)

    # "proton-ge-custom" generic → "GE-Proton-Custom"
    if "ge-custom" in v.lower():
        return "GE-Proton-Custom"

    # "4.11-11" style - already clean
    if re.match(r"^\d+\.\d+(-\d+)?$", v):
        return v

    # "Proton 5.5-GE" → "GE-Proton5.5"
    m = re.match(r"Proton\s+(\d+\.\d+)-GE", v)
    if m:
        return f"GE-Proton{m.group(1)}"

    # "5.21_GE_2-1" → "GE-Proton5.21-2.1"
    v2 = v.replace("_", "-")
    m = re.match(r"(\d+\.\d+)-GE-(\d[\d.]*)", v2)
    if m:
        return f"GE-Proton{m.group(1)}-{m.group(2)}"

    # "5.21.GE.1" → "GE-Proton5.21-1"
    m = re.match(r"(\d+\.\d+)\.GE\.(\d+)", v)
    if m:
        return f"GE-Proton{m.group(1)}-{m.group(2)}"

    # "4.11-12, 5.0-GE-1" → keep first one
    if "," in v:
        v = v.split(",")[0].strip()

    # If nothing matched, return as-is if it has numbers
    if re.search(r"\d", v):
        return v

    # Non-numeric versions that aren't Default/unknown → keep them (Experimental, etc.)
    return v if len(v) < 40 else None


def process_reports():
    # Stats per appId: { version -> {total, positive, negative} }
    stats: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(lambda: {"total": 0, "positive": 0, "negative": 0})
    )

    total_reports = 0
    matched_reports = 0

    print(f"Processing {REPORTS_FILE}...")
    size_mb = os.path.getsize(REPORTS_FILE) / (1024 * 1024)
    print(f"File size: {size_mb:.0f} MB")

    with open(REPORTS_FILE, "rb") as f:
        # Iterate over each item in the top-level array
        for report in ijson.items(f, "item"):
            total_reports += 1
            if total_reports % 100000 == 0:
                print(f"  Processed {total_reports} reports, matched {matched_reports}", flush=True)

            try:
                app_info = report.get("app", {})
                steam = app_info.get("steam", {})
                app_id = str(steam.get("appId", ""))

                if app_id not in TARGET_APPIDS:
                    continue

                responses = report.get("responses", {})
                raw_version = responses.get("protonVersion")
                verdict = responses.get("verdict", "")

                version = normalize_version(raw_version)
                if version is None:
                    continue

                game_stats = stats[app_id][version]
                game_stats["total"] += 1

                if verdict == "yes":
                    game_stats["positive"] += 1
                else:
                    game_stats["negative"] += 1

                matched_reports += 1

            except (KeyError, TypeError, AttributeError):
                continue

    print(f"\nTotal reports processed: {total_reports}")
    print(f"Matching reports: {matched_reports}")
    return stats


def build_output(stats: dict) -> dict:
    result = {}
    for g in GAMES:
        gid = g["id"]
        aid = g["appId"]
        game_stats = stats.get(aid, {})

        if not game_stats:
            print(f"[{gid}] No data")
            result[gid] = {
                "gameId": gid,
                "steamAppId": aid,
                "totalReports": 0,
                "versions": [],
                "recommended": [],
            }
            continue

        versions = []
        total_reports_game = 0
        for version, vs in game_stats.items():
            t = vs["total"]
            pos = vs["positive"]
            neg = vs["negative"]
            total_reports_game += t
            ratio = round(pos / t, 2) if t > 0 else 0
            versions.append({
                "version": version,
                "total": t,
                "positive": pos,
                "negative": neg,
                "positiveRatio": ratio,
            })

        # Sort by total (desc), then by ratio (desc)
        versions.sort(key=lambda e: (-e["total"], -e["positiveRatio"]))

        # Exclude "Default" from recommendations - it means user didn't specify
        # Only recommend specific named versions with >= 5 reports and >= 0.5 ratio
        named_versions = [v for v in versions if v["version"] != "Default"]

        # Lower threshold for games with fewer reports
        # Use >= 3 if there are enough qualifying versions, otherwise fall back to >= 2
        strict = [v for v in named_versions if v["positiveRatio"] >= 0.5 and v["total"] >= 3]
        if len(strict) >= 2:
            recommended = [v["version"] for v in strict[:5]]
        else:
            loose = [v for v in named_versions if v["positiveRatio"] >= 0.5 and v["total"] >= 2]
            recommended = [v["version"] for v in loose[:5]]

        result[gid] = {
            "gameId": gid,
            "steamAppId": aid,
            "totalReports": total_reports_game,
            "versions": versions,
            "recommended": recommended,
        }

        print(f"[{gid}] {versions[0]['version'] if versions else 'N/A'} "
              f"- {total_reports_game} reports, "
              f"{len(versions)} versions, "
              f"{len(recommended)} recommended")

    return result


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    if not os.path.exists(REPORTS_FILE):
        print(f"Error: {REPORTS_FILE} not found.", file=sys.stderr)
        sys.exit(1)

    stats = process_reports()
    outputs = build_output(stats)

    for gid, data in outputs.items():
        out_path = os.path.join(OUT_DIR, f"{gid}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nDone! JSONs saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
