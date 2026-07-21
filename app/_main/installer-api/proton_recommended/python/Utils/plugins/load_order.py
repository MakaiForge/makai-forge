"""load_order.py — Masterlist-based load order optimization for Bethesda plugins.

Based on ModSanity's sort.rs + masterlist.rs (MIT). Uses a YAML/JSON masterlist
(LOOT data) to resolve dependency graphs and sort plugins topologically.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

MASTERLIST_PATH = Path(__file__).resolve().parent.parent / "data" / "masterlist.json"


# ── Data structures ──────────────────────────────────────────────────────────

PluginInfo = dict[str, Any]


# ── Masterlist loader ────────────────────────────────────────────────────────

def load_masterlist(path: str | Path | None = None) -> dict[str, Any]:
    """Load the LOOT masterlist JSON and build a name-keyed lookup map."""
    p = Path(path) if path else MASTERLIST_PATH
    with open(p) as f:
        raw = json.load(f)

    lookup: dict[str, dict] = {}
    for entry in raw.get("plugins", []):
        lookup[entry["name"].lower()] = entry

    groups = raw.get("groups", [])
    group_order: list[str] = []
    for g in groups:
        group_order.append(g["name"])

    return {"lookup": lookup, "groups": group_order}


def get_after_rules(plugin_name: str, lookup: dict[str, dict]) -> list[str]:
    """Return the list of plugins that `plugin_name` should load after."""
    entry = lookup.get(plugin_name.lower())
    if not entry:
        return []
    result = []
    for item in entry.get("after", []):
        if isinstance(item, str):
            result.append(item.lower())
        elif isinstance(item, dict):
            result.append(item.get("name", "").lower())
    return result


def get_requirements(plugin_name: str, lookup: dict[str, dict]) -> list[str]:
    """Return required (master) plugins for `plugin_name`."""
    entry = lookup.get(plugin_name.lower())
    if not entry:
        return []
    result = []
    for item in entry.get("req", []):
        if isinstance(item, str):
            result.append(item.lower())
        elif isinstance(item, dict):
            result.append(item.get("name", "").lower())
    return result


def get_group(plugin_name: str, lookup: dict[str, dict]) -> str:
    """Return the LOOT group for a plugin (default, early loaders, late loaders, etc)."""
    entry = lookup.get(plugin_name.lower())
    if entry and entry.get("group"):
        return entry["group"]
    return "default"


def get_messages(plugin_name: str, lookup: dict[str, dict]) -> list[dict]:
    """Return messages (warnings/errors) for a plugin."""
    entry = lookup.get(plugin_name.lower())
    if entry:
        return entry.get("msg", [])
    return []


# ── Game master lists ────────────────────────────────────────────────────────

_GAME_OFFICIAL_MASTERS: dict[str, list[str]] = {
    "skyrim": [
        "skyrim.esm", "update.esm", "dawnguard.esm",
        "hearthfires.esm", "dragonborn.esm",
    ],
    "skyrimse": [
        "skyrim.esm", "update.esm", "dawnguard.esm",
        "hearthfires.esm", "dragonborn.esm",
    ],
    "skyrimvr": [
        "skyrim.esm", "update.esm", "dawnguard.esm",
        "hearthfires.esm", "dragonborn.esm",
    ],
    "fallout3": [
        "fallout3.esm", "anchorage.esm", "thepitt.esm",
        "brokensteel.esm", "pointlookout.esm", "mothershipzeta.esm",
        "talons.esm",
    ],
    "falloutnv": [
        "falloutnv.esm", "deadmoney.esm", "honesthearts.esm",
        "oldworldblues.esm", "lonesomeroad.esm", "gunrunnersarsenal.esm",
        "tribalpack.esm", "mercenarypack.esm", "classicpack.esm",
    ],
    "fallout4": [
        "fallout4.esm", "dlcrobot.esm", "dlcworkshop01.esm",
        "dlccoast.esm", "dlcworkshop02.esm", "dlcworkshop03.esm",
        "dlcnukaworld.esm", "dlcultrahighresolution.esm",
    ],
    "fallout4vr": [
        "fallout4.esm", "dlcrobot.esm", "dlcworkshop01.esm",
        "dlccoast.esm", "dlcworkshop02.esm", "dlcworkshop03.esm",
        "dlcnukaworld.esm", "dlcultrahighresolution.esm",
    ],
    "oblivion": [
        "oblivion.esm",
    ],
    "morrowind": [
        "morrowind.esm", "tribunal.esm", "bloodmoon.esm",
    ],
    "starfield": [
        "starfield.esm", "constellation.esm", "oldmars.esm",
        "blueprintships-starfield.esm",
    ],
}

_SKYRIM_AE_CONTENT = [
    "ccbgssse001-fish.esm", "ccbgssse002-exoticarrows.esl",
    "ccbgssse003-zombies.esl", "ccbgssse004-ruinsedge.esl",
    "ccbgssse005-goldenhills.esp", "ccbgssse006-stendarshammer.esl",
    "ccbgssse007-chrysamere.esl", "ccbgssse010-petdwarven.esl",
    "ccbgssse011-hrsarmrelvn.esl", "ccbgssse012-hrsarmrstl.esl",
    "ccbgssse013-dawnfang.esl", "ccbgssse014-spellpack01.esl",
    "ccbgssse016-umbra.esm", "ccbgssse018-shadowrend.esl",
    "ccbgssse019-staffofsheogorath.esl", "ccbgssse020-trails.esl",
    "ccbgssse021-lordsmail.esl", "ccbgssse025-advdsgs.esm",
    "ccbgssse031-advcyrus.esm", "ccbgssse034-mntuni.esl",
    "ccbgssse035-petnhound.esl", "ccbgssse036-petbwolf.esl",
    "ccbgssse037-curios.esl", "ccbgssse038-bowofshadows.esl",
    "ccbgssse040-advobgobs.esl", "ccbgssse041-netchleather.esl",
    "ccbgssse043-crosselv.esl", "ccbgssse044-builderhome.esl",
    "ccbgssse045-hasedoki.esl", "ccbgssse050-ba_daedric.esl",
    "ccbgssse051-ba_daedricmail.esl", "ccbgssse052-ba_iron.esl",
    "ccbgssse053-ba_leather.esl", "ccbgssse054-ba_orcish.esl",
    "ccbgssse055-ba_orcishscaled.esl", "ccbgssse056-ba_silver.esl",
    "ccbgssse057-ba_stalhrim.esl", "ccbgssse058-ba_steel.esl",
    "ccbgssse059-ba_dragonplate.esl", "ccbgssse060-ba_dragonscale.esl",
    "ccbgssse061-ba_dwarven.esl", "ccbgssse062-ba_ebony.esl",
    "ccbgssse063-ba_elven.esl", "ccbgssse064-ba_elven scaled.esl",
    "ccbgssse066-staves.esl", "ccbgssse067-daedinv.esm",
    "ccbgssse068-bloodfall.esl", "ccbgssse069-bowofthenord.esl",
    "ccbgssse071-advefs.esm", "ccbgssse072-hikkypine.esl",
    "ccbgssse073-petsaddle.esl", "ccbgssse074-petsaddle.esl",
    "ccbgssse075-petsaddle.esl", "ccbgssse076-petsaddle.esl",
    "ccbgssse077-petsaddle.esl", "ccbgssse078-petsaddle.esl",
    "ccbgssse079-petsaddle.esl", "ccbgssse080-petsaddle.esl",
    "ccbgssse081-petsaddle.esl", "ccbgssse082-petsaddle.esl",
    "ccbgssse083-petsaddle.esl", "ccbgssse084-petsaddle.esl",
    "ccvsvsse001-winter.esl", "ccvsvsse002-manacles.esl",
    "ccvsvsse003-necroarts.esl", "ccvsvsse004-beafarmer.esl",
    "ccvsvsse005-goldbrand.esl", "ccvsvsse006-wind.esl",
    "ccvsvsse007-knightsfallen.esl", "ccvsvsse008-wight.esl",
    "ccvsvsse009-beastfaction.esl", "ccffbsse001-imperialdragon.esl",
    "ccffbsse002-crossbowpack.esl", "ccmtysse001-knightsoftheoven.esl",
    "ccmtysse002-ve.esl", "ccqdrsse001-survivalmode.esl",
    "ccqdrsse002-firewood.esl", "ccrmssse001-necrohouse.esl",
    "cctwbsse001-puzzledungeon.esm", "cceejsse001-hstead.esm",
    "cceejsse002-tower.esl", "cceejsse003-hollow.esl",
    "cceejsse004-hall.esl", "cceejsse005-cave.esm",
    "cceejsse006-hstead.esm", "cceejsse007-hstead.esl",
    "cceejsse008-hstead.esl", "cceejsse009-hstead.esl",
    "cceejsse010-hstead.esl",
]

_GROUP_PRIORITIES: dict[str, int] = {
    "default": 5,
    "early loaders": 2,
    "late loaders": 8,
    "Unofficial Patches": 1,
    "DLC": 3,
    "Fixes": 4,
}


# ── Topological sort ─────────────────────────────────────────────────────────

def sort_plugins(
    plugins: list[PluginInfo],
    game_id: str,
    masterlist: dict[str, Any] | None = None,
) -> tuple[list[PluginInfo], list[str]]:
    """Sort plugins topologically and return (sorted_plugins, warnings).

    Uses:
      1. Actual masters from plugin headers (hard deps)
      2. Masterlist 'load_after' rules (soft deps)
      3. Masterlist group priorities
      4. Official game masters → AE content → ESM → ESP/ESL
    """
    lookup = masterlist.get("lookup", {}) if masterlist else {}
    warnings: list[str] = []

    # Build name → index map
    name_map: dict[str, int] = {}
    for i, p in enumerate(plugins):
        name_map[p["filename"].lower()] = i

    # Build dependency graph
    deps: dict[int, list[int]] = {}
    for i, p in enumerate(plugins):
        deps[i] = []

        # Hard deps: actual masters from plugin header
        for master_name in p.get("masters", []):
            dep_idx = name_map.get(master_name.lower())
            if dep_idx is not None:
                if dep_idx not in deps[i]:
                    deps[i].append(dep_idx)
            else:
                warnings.append(f"Missing master: {master_name} (required by {p['filename']})")

        # Soft deps: LOOT masterlist 'after' rules
        for after_name in get_after_rules(p["filename"], lookup):
            dep_idx = name_map.get(after_name.lower())
            if dep_idx is not None and dep_idx not in deps[i]:
                deps[i].append(dep_idx)

        # Requirements
        for req_name in get_requirements(p["filename"], lookup):
            dep_idx = name_map.get(req_name.lower())
            if dep_idx is not None and dep_idx not in deps[i]:
                deps[i].append(dep_idx)

    # Priority function
    official = _GAME_OFFICIAL_MASTERS.get(game_id, [])
    ae_content = _SKYRIM_AE_CONTENT if game_id in ("skyrimse", "skyrimvr") else []

    def priority(idx: int) -> int:
        fn_lower = plugins[idx]["filename"].lower()
        if fn_lower in official or any(fn_lower == m.lower() for m in official):
            return 0
        if fn_lower in ae_content or any(fn_lower == m.lower() for m in ae_content):
            return 1
        group = get_group(plugins[idx]["filename"], lookup)
        return _GROUP_PRIORITIES.get(group, 5)

    # Kahn's algorithm
    in_degree: list[int] = [len(deps[i]) for i in range(len(plugins))]

    queue: list[int] = [i for i, d in enumerate(in_degree) if d == 0]
    queue.sort(key=lambda i: priority(i), reverse=True)

    sorted_indices: list[int] = []
    while queue:
        # Higher priority = sorted first (lower number)
        current = queue.pop()
        sorted_indices.append(current)

        for i in range(len(plugins)):
            if current in deps.get(i, []):
                in_degree[i] -= 1
                if in_degree[i] == 0:
                    # Insert in sorted position by priority ascending
                    idx = 0
                    while idx < len(queue) and priority(queue[idx]) <= priority(i):
                        idx += 1
                    queue.insert(idx, i)

    if len(sorted_indices) != len(plugins):
        remaining = len(plugins) - len(sorted_indices)
        # Put remaining plugins at end (cycle resolution)
        for i in range(len(plugins)):
            if i not in sorted_indices:
                sorted_indices.append(i)
        warnings.append(f"{remaining} plugins had circular dependencies — placed at end")

    sorted_plugins = [plugins[i].copy() for i in sorted_indices]
    for idx, p in enumerate(sorted_plugins):
        p["load_order"] = idx

    return sorted_plugins, warnings


# ── Validation ───────────────────────────────────────────────────────────────

def validate_load_order(
    plugins: list[PluginInfo],
    game_id: str,
    masterlist: dict[str, Any] | None = None,
) -> list[str]:
    """Validate a load order and return a list of issues found."""
    issues: list[str] = []
    name_map: dict[str, int] = {}
    for i, p in enumerate(plugins):
        name_map[p["filename"].lower()] = i

    lookup = masterlist.get("lookup", {}) if masterlist else {}

    # Check masters load before dependents
    for i, p in enumerate(plugins):
        for master in p.get("masters", []):
            midx = name_map.get(master.lower())
            if midx is not None and midx > i:
                issues.append(f"{p['filename']}[{i}] loads before its master {master}[{midx}]")

        # Check masterlist requirements
        for req in get_requirements(p["filename"], lookup):
            ridx = name_map.get(req.lower())
            if ridx is None:
                issues.append(f"{p['filename']} requires missing plugin: {req}")

        # Masterlist messages
        for msg in get_messages(p["filename"], lookup):
            t = msg.get("type", "say")
            content = msg.get("content", "")
            if t == "error":
                issues.append(f"[ERROR] {p['filename']}: {content}")
            elif t == "warn":
                issues.append(f"[WARN] {p['filename']}: {content}")

    return issues
