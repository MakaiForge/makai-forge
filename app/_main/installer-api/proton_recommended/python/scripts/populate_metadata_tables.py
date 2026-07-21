"""
Popula tabelas de metadados no proton_data.db a partir dos JSONs da API.

Lê os JSONs em tools/plaina_proton/api proton/ e cria/atualiza
tabelas auxiliares no proton_data.db com os MESMOS field names
dos JSONs originais, para que _load_json() retorne estrutura idêntica.

Uso:
    python scripts/populate_metadata_tables.py
"""

import json
import os
import sqlite3

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
_PROTON_API_DIR = os.path.join(_PROJECT_ROOT, "tools", "plaina_proton", "api proton")
_DB_PATH = os.path.join(_PROJECT_ROOT, "resources", "proton_data.db")

DB = sqlite3.connect(_DB_PATH)
DB.execute("PRAGMA journal_mode=WAL")
DB.row_factory = sqlite3.Row


def migrate_protons():
    filepath = os.path.join(_PROTON_API_DIR, "protons.json")
    if not os.path.exists(filepath):
        print("  [SKIP] protons.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS proton_forks;
        CREATE TABLE proton_forks (
            fork_id TEXT PRIMARY KEY,
            name TEXT,
            ranking TEXT,
            tierScore REAL DEFAULT 0,
            category TEXT,
            description TEXT,
            source TEXT,
            versionCount INTEGER DEFAULT 0,
            stats TEXT,
            playable TEXT,
            warn TEXT
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    DB.execute("BEGIN")
    rows = 0
    for fork_id, info in data.items():
        DB.execute(
            """INSERT INTO proton_forks
               (fork_id, name, ranking, tierScore, category, description,
                source, versionCount, stats, playable, warn)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                fork_id,
                info.get("name"),
                info.get("ranking"),
                info.get("tierScore", 0),
                info.get("category"),
                info.get("description"),
                info.get("source"),
                info.get("versionCount"),
                json.dumps(info.get("stats", {}), ensure_ascii=False),
                json.dumps(info.get("playable", []), ensure_ascii=False),
                info.get("warn", ""),
            ),
        )
        rows += 1
    DB.commit()
    print(f"  ✓ proton_forks: {rows}")


def migrate_anticheat():
    filepath = os.path.join(_PROTON_API_DIR, "anticheat.json")
    if not os.path.exists(filepath):
        print("  [SKIP] anticheat.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS anticheat;
        CREATE TABLE anticheat (
            game_id TEXT PRIMARY KEY,
            title TEXT,
            acTypes TEXT,
            acRecommendations TEXT,
            currentProton TEXT,
            forks TEXT,
            protonConfidence TEXT,
            protonSource TEXT,
            shop TEXT,
            tier TEXT
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    games = data.get("games", {}) if isinstance(data, dict) else data

    DB.execute("BEGIN")
    rows = 0
    for game_id, entry in games.items():
        if not isinstance(entry, dict):
            continue
        DB.execute(
            """INSERT INTO anticheat
               (game_id, title, acTypes, acRecommendations, currentProton,
                forks, protonConfidence, protonSource, shop, tier)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                entry.get("title"),
                json.dumps(entry.get("acTypes", []), ensure_ascii=False),
                json.dumps(entry.get("acRecommendations", []), ensure_ascii=False),
                entry.get("currentProton"),
                json.dumps(entry.get("forks", {}), ensure_ascii=False),
                entry.get("protonConfidence"),
                entry.get("protonSource"),
                entry.get("shop"),
                entry.get("tier"),
            ),
        )
        rows += 1
    DB.commit()
    print(f"  ✓ anticheat: {rows}")


def migrate_mod_compat():
    filepath = os.path.join(_PROTON_API_DIR, "mod_compat.json")
    if not os.path.exists(filepath):
        print("  [SKIP] mod_compat.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS mod_compat;
        CREATE TABLE mod_compat (
            app_id TEXT PRIMARY KEY,
            title TEXT,
            steamAppId TEXT,
            scriptExtender TEXT,
            extenderUrl TEXT,
            recommendedFork TEXT,
            recommendedVersion TEXT,
            requiredDllIds TEXT,
            winetricksCommands TEXT,
            extraOverrides TEXT,
            communityScore INTEGER DEFAULT 0,
            tier TEXT,
            modCompatNotes TEXT,
            sourceUrls TEXT
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    games = data.get("games", {})
    DB.execute("BEGIN")
    rows = 0
    for app_id, entry in games.items():
        DB.execute(
            """INSERT INTO mod_compat
               (app_id, title, steamAppId, scriptExtender, extenderUrl,
                recommendedFork, recommendedVersion, requiredDllIds,
                winetricksCommands, extraOverrides, communityScore, tier,
                modCompatNotes, sourceUrls)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                app_id,
                entry.get("title"),
                entry.get("steamAppId"),
                entry.get("scriptExtender"),
                entry.get("extenderUrl"),
                entry.get("recommendedFork"),
                entry.get("recommendedVersion"),
                json.dumps(entry.get("requiredDllIds", []), ensure_ascii=False),
                json.dumps(entry.get("winetricksCommands", []), ensure_ascii=False),
                entry.get("extraOverrides", ""),
                entry.get("communityScore", 0),
                entry.get("tier"),
                entry.get("modCompatNotes"),
                json.dumps(entry.get("sourceUrls", []), ensure_ascii=False),
            ),
        )
        rows += 1
    DB.commit()
    print(f"  ✓ mod_compat: {rows}")


def migrate_dlls():
    filepath = os.path.join(_PROTON_API_DIR, "prefixo_dlls.json")
    if not os.path.exists(filepath):
        print("  [SKIP] prefixo_dlls.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS dll_dependencies;
        DROP TABLE IF EXISTS dll_catalog;
        CREATE TABLE dll_catalog (
            dll_id TEXT PRIMARY KEY,
            dll TEXT,
            descricao TEXT,
            funcao_geral TEXT,
            impacto TEXT,
            winetricks TEXT,
            protontricks TEXT,
            override_necessario TEXT,
            ja_incluso_proton TEXT,
            jogos_tipo TEXT
        );
        CREATE TABLE dll_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dll_id TEXT,
            depends_on TEXT,
            tipo TEXT
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    dlls = data.get("dlls", {})
    DB.execute("BEGIN")
    rows = 0
    for dll_id, info in dlls.items():
        DB.execute(
            """INSERT INTO dll_catalog
               (dll_id, dll, descricao, funcao_geral, impacto,
                winetricks, protontricks, override_necessario,
                ja_incluso_proton, jogos_tipo)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                dll_id,
                info.get("dll"),
                info.get("descricao"),
                info.get("funcao_geral"),
                info.get("impacto"),
                info.get("winetricks"),
                info.get("protontricks"),
                info.get("override_necessario"),
                info.get("ja_incluso_proton"),
                json.dumps(info.get("jogos_tipo", []), ensure_ascii=False),
            ),
        )
        rows += 1

    rede = data.get("rede_dependencias", {})
    dep_rows = 0
    for dll_id, deps in rede.items():
        if isinstance(deps, list):
            for dep in deps:
                DB.execute(
                    "INSERT INTO dll_dependencies (dll_id, depends_on, tipo) VALUES (?, ?, ?)",
                    (dll_id, dep if isinstance(dep, str) else dep.get("id", ""), "normal"),
                )
                dep_rows += 1
        elif isinstance(deps, dict):
            for dep_type, dep_list in deps.items():
                for dep in dep_list if isinstance(dep_list, list) else [dep_list]:
                    DB.execute(
                        "INSERT INTO dll_dependencies (dll_id, depends_on, tipo) VALUES (?, ?, ?)",
                        (dll_id, dep if isinstance(dep, str) else dep.get("id", ""), dep_type),
                    )
                    dep_rows += 1
    DB.commit()
    print(f"  ✓ dll_catalog: {rows} DLLs, {dep_rows} dependências")


def migrate_launch_args():
    filepath = os.path.join(_PROTON_API_DIR, "launch_args.json")
    if not os.path.exists(filepath):
        print("  [SKIP] launch_args.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS game_launch_tips;
        DROP TABLE IF EXISTS launch_catalog;
        CREATE TABLE launch_catalog (
            arg_id TEXT PRIMARY KEY,
            category TEXT,
            description TEXT,
            usage TEXT,
            fork_support TEXT,
            source TEXT
        );
        CREATE TABLE game_launch_tips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT,
            tip TEXT,
            priority INTEGER DEFAULT 0
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    args = data.get("args", {})
    DB.execute("BEGIN")
    rows = 0
    for arg_id, info in args.items():
        if arg_id.startswith("===="):
            continue
        DB.execute(
            """INSERT INTO launch_catalog
               (arg_id, category, description, usage, fork_support, source)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                arg_id,
                info.get("category", "other"),
                info.get("description", ""),
                info.get("usage", ""),
                json.dumps(info.get("forkSupport", []), ensure_ascii=False),
                info.get("source", ""),
            ),
        )
        rows += 1

    tips = data.get("gameSpecificTips", {}).get("tips", [])
    tip_rows = 0
    for tip in tips:
        if not isinstance(tip, dict):
            continue
        game_id = tip.get("id")
        launch_tips = tip.get("launchTips", [])
        for lt in launch_tips:
            tip_text = lt.get("tip", "") if isinstance(lt, dict) else str(lt)
            tip_priority = lt.get("priority", 0) if isinstance(lt, dict) else 0
            DB.execute(
                "INSERT INTO game_launch_tips (game_id, tip, priority) VALUES (?, ?, ?)",
                (str(game_id), tip_text, tip_priority),
            )
            tip_rows += 1
    DB.commit()
    print(f"  ✓ launch_catalog: {rows} args, {tip_rows} game tips")


def migrate_gacha():
    filepath = os.path.join(_PROTON_API_DIR, "gacha_navegador_chromium.json")
    if not os.path.exists(filepath):
        print("  [SKIP] gacha_navegador_chromium.json")
        return

    DB.executescript("""
        DROP TABLE IF EXISTS gacha;
        CREATE TABLE gacha (
            game_id TEXT PRIMARY KEY,
            id TEXT,
            titulo TEXT,
            tipo_login TEXT,
            anti_cheat TEXT,
            status_linux TEXT,
            fix_conhecido TEXT,
            engine TEXT
        );
    """)

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    games = data.get("jogos_afetados", {}) if isinstance(data, dict) else data

    DB.execute("BEGIN")
    rows = 0
    for game_id, entry in games.items():
        DB.execute(
            """INSERT INTO gacha
               (game_id, id, titulo, tipo_login, anti_cheat, status_linux, fix_conhecido, engine)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                entry.get("id"),
                entry.get("titulo"),
                entry.get("tipo_login"),
                entry.get("anti_cheat"),
                entry.get("status_linux"),
                entry.get("fix_conhecido"),
                entry.get("engine"),
            ),
        )
        rows += 1
    DB.commit()
    print(f"  ✓ gacha: {rows}")


def main():
    print("=" * 55)
    print("JSON Metadata → proton_data.db (field names iguais ao JSON)")
    print(f"Origem: {_PROTON_API_DIR}")
    print(f"Destino: {_DB_PATH}")
    print("=" * 55)

    if not os.path.exists(_DB_PATH):
        print("  [ERRO] proton_data.db não encontrado. Execute migrate_to_sqlite.py primeiro.")
        DB.close()
        return

    migrate_protons()
    migrate_anticheat()
    migrate_mod_compat()
    migrate_dlls()
    migrate_launch_args()
    migrate_gacha()

    DB.close()
    print("\n✓ Tabelas recriadas.\n")


if __name__ == "__main__":
    main()
