"""
Carregamento de dados da API.
Fontes únicas por domínio:
  - forks Proton → fork_catalog.db (fork_overview + fork_versions)
  - demais (anticheat, mod_compat, gacha) → SQLite (proton_data.db) com fallback JSON
"""

import json
import logging
import sqlite3

from ..db.connection import _get_db, _PROTON_API_DIR

# (SQLite table, id_column, wrapper_key) — APENAS não-Proton
JSON_TO_SQLITE: dict[str, tuple[str, str | None, str | None]] = {
    "anticheat.json": ("anticheat", "game_id", "games"),
    "mod_compat.json": ("mod_compat", "app_id", "games"),
    "gacha_navegador_chromium.json": ("gacha", "game_id", "jogos_afetados"),
}

# Fields stored as JSON strings — auto-parse on load
JSON_FIELDS_BY_TABLE: dict[str, set[str]] = {
    "anticheat": {"acTypes", "acRecommendations", "forks"},
    "mod_compat": {"requiredDllIds", "winetricksCommands", "sourceUrls"},
    "launch_catalog": {"forkSupport"},
}

_cache: dict = {}

_log = logging.getLogger("api.data")


def _query_sqlite(filename: str) -> dict | list | None:
    mapping = JSON_TO_SQLITE.get(filename)
    if not mapping:
        return None

    table, id_col, wrapper = mapping
    db = _get_db()
    if db is None:
        return None

    json_fields = JSON_FIELDS_BY_TABLE.get(table, set())

    try:
        cursor = db.execute(f"SELECT * FROM [{table}]")
        rows = cursor.fetchall()

        result: dict = {}
        for row in rows:
            entry = dict(row)
            eid = entry.pop(id_col, None) if id_col else None

            for fld in json_fields:
                if fld in entry and isinstance(entry[fld], str):
                    try:
                        entry[fld] = json.loads(entry[fld])
                    except (json.JSONDecodeError, TypeError):
                        pass

            if id_col and eid is not None:
                result[str(eid)] = entry
            else:
                result[str(id(row))] = entry

        if wrapper:
            return {wrapper: result}
        return result

    except sqlite3.OperationalError:
        return None


def _load_fork_catalog_protons() -> dict:
    """Carrega TODOS os forks exclusivamente do fork_catalog.db.

    Fontes:
      - fork_overview  → metadados (id, nome, categoria, autor, repo)
      - fork_versions  → tags de versão (836+ releases em 21 forks)

    tierScore e ranking são derivados da contagem de versões.
    """
    from ..db.connection import _get_fork_catalog_db

    fc_db = _get_fork_catalog_db()
    if fc_db is None:
        return {}

    # 1. Versões: agrupa tags por fork
    versions_by_fork: dict[str, list[str]] = {}
    try:
        vrows = fc_db.execute(
            "SELECT fork_id, tag FROM releases ORDER BY id ASC"
        ).fetchall()
    except sqlite3.OperationalError:
        vrows = []

    for vr in vrows:
        versions_by_fork.setdefault(str(vr["fork_id"]), []).append(str(vr["tag"]))

    # 2. Metadados dos forks
    try:
        rows = fc_db.execute(
            "SELECT id, name, category, author, repo_url, features "
            "FROM forks"
        ).fetchall()
    except sqlite3.OperationalError:
        return {}

    # 3. Maior contagem de versões (base para score relativo)
    max_v = max(
        (len(versions_by_fork.get(str(r["id"]), [])) for r in rows),
        default=1,
    )

    result: dict = {}
    for row in rows:
        fork_id = str(row["id"])
        name = str(row["name"]) if row["name"] else fork_id
        cat = (str(row["category"]) if row["category"] else "Proton").lower()
        versions = versions_by_fork.get(fork_id, [])
        vcount = len(versions)

        # tierScore 30-100 proporcional à contagem de versões
        tierScore = round(30.0 + (vcount / max_v) * 70.0, 1) if max_v > 0 else 30.0

        if tierScore >= 80:
            ranking = "gold"
        elif tierScore >= 50:
            ranking = "silver"
        elif tierScore >= 20:
            ranking = "bronze"
        else:
            ranking = "experimental"

        desc_parts = []
        if row["author"]:
            desc_parts.append(f"Mantido por {row['author']}.")
        if row["features"]:
            desc_parts.append(str(row["features"]))
        description = " ".join(desc_parts)

        # Features a partir do campo features JSON
        raw_features = str(row["features"]) if row["features"] else ""
        try:
            import json
            features_list = json.loads(raw_features) if raw_features.startswith("[") else []
        except (json.JSONDecodeError, TypeError):
            features_list = [f.strip() for f in raw_features.replace(",", " ").split() if f.strip()]

        result[fork_id] = {
            "fork_id": fork_id,
            "name": name,
            "ranking": ranking,
            "tierScore": tierScore,
            "category": cat,
            "description": description,
            "source": str(row["repo_url"]) if row["repo_url"] else "",
            "versionCount": vcount if vcount > 0 else None,
            "versions": versions if versions else ["latest"],
            "stats": {
                "totalReleases": vcount,
                "stableReleases": vcount,
                "featureCount": len(features_list),
                "topFeatures": features_list[:8],
            },
            "playable": [],
            "warn": "",
        }

    _log.info("fork_catalog: %d forks carregados", len(result))
    return result


def _load_json(filename: str) -> dict | list:
    if filename == "protons.json":
        return _load_fork_catalog_protons()

    cache_key = f"db:{filename}"
    if cache_key in _cache:
        return _cache[cache_key]

    sqlite_data = _query_sqlite(filename)
    if sqlite_data is not None:
        _cache[cache_key] = sqlite_data
        return sqlite_data

    if filename in _cache:
        return _cache[filename]

    filepath = os.path.join(_PROTON_API_DIR, filename)
    if not os.path.exists(filepath):
        _cache[filename] = {}
        return {}

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    _cache[filename] = data
    return data
