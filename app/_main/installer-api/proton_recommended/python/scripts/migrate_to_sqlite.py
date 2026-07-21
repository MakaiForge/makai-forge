"""
Migração: JSONs pesados → SQLite

Converte matched.json (146MB) e recommendations/*.json (224MB)
para um banco SQLite com indexes, tornando as consultas ~100x mais rápidas.

Uso:
    python scripts/migrate_to_sqlite.py

O proton_data.db será criado em resources/proton_data.db.
"""

import json
import os
import sqlite3
import sys
import time

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
_PROTON_API_DIR = os.path.join(
    _PROJECT_ROOT, "tools", "plaina_proton", "api proton"
)
_DB_PATH = os.path.join(_PROJECT_ROOT, "resources", "proton_data.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute("PRAGMA cache_size=-800000")
    return conn


def create_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS game_matches (
            game_id TEXT PRIMARY KEY,
            title TEXT,
            genres TEXT,
            release_year TEXT,
            assigned_proton TEXT,
            method TEXT,
            confidence TEXT,
            gpu_tier TEXT,
            cpu_tier TEXT,
            ram_gb REAL,
            fork_recommendations TEXT
        );

        CREATE TABLE IF NOT EXISTS fork_recommendations (
            game_id TEXT NOT NULL,
            fork_id TEXT NOT NULL,
            title TEXT,
            recommended TEXT,
            confidence TEXT,
            distance REAL,
            anchor_count INTEGER,
            anticheat TEXT,
            PRIMARY KEY (game_id, fork_id)
        );

        CREATE INDEX IF NOT EXISTS idx_fork_recs_game_id ON fork_recommendations(game_id);
        CREATE INDEX IF NOT EXISTS idx_fork_recs_fork_id ON fork_recommendations(fork_id);
    """)


def _j(val):
    """Serializa pra JSON string se não for escalar."""
    if val is None or isinstance(val, (str, int, float, bool)):
        return val
    return json.dumps(val, ensure_ascii=False)


def migrate_matched(conn: sqlite3.Connection):
    filepath = os.path.join(_PROTON_API_DIR, "matched.json")
    if not os.path.exists(filepath):
        print(f"[SKIP] {filepath} não encontrado")
        return

    print(f"[ matched.json ] Carregando e importando...")
    t0 = time.time()

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"  → {len(data)} jogos carregados em {time.time()-t0:.1f}s")

    conn.execute("BEGIN TRANSACTION")
    rows = 0
    for game_id, entry in data.items():
        fr = entry.get("forkRecommendations", {})
        ram_gb = entry.get("ramGB")
        if ram_gb is not None:
            try:
                ram_gb = float(ram_gb)
                if ram_gb > 999999:
                    ram_gb = None
            except (ValueError, TypeError, OverflowError):
                ram_gb = None
        conn.execute(
            """INSERT OR REPLACE INTO game_matches
               (game_id, title, genres, release_year, assigned_proton,
                method, confidence, gpu_tier, cpu_tier, ram_gb,
                fork_recommendations)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                entry.get("title"),
                _j(entry.get("genres")),
                entry.get("releaseYear"),
                entry.get("assignedProton"),
                entry.get("method"),
                entry.get("confidence"),
                entry.get("gpuTier"),
                entry.get("cpuTier"),
                ram_gb,
                json.dumps(fr, ensure_ascii=False) if fr else None,
            ),
        )
        rows += 1
        if rows % 10000 == 0:
            print(f"  → {rows} registros...")

    conn.commit()
    print(f"  ✓ {rows} registros importados em {time.time()-t0:.1f}s")


def migrate_recommendations(conn: sqlite3.Connection):
    rec_dir = os.path.join(_PROTON_API_DIR, "recommendations")
    if not os.path.isdir(rec_dir):
        print(f"[SKIP] {rec_dir} não encontrado")
        return

    fork_files = sorted([
        f for f in os.listdir(rec_dir) if f.endswith(".json")
    ])

    total_rows = 0
    t0 = time.time()

    for fname in fork_files:
        fork_id = fname.replace(".json", "")
        filepath = os.path.join(rec_dir, fname)
        fsize = os.path.getsize(filepath) / (1024 * 1024)
        print(f"[ {fname} ] ({fsize:.0f}MB) Importando...")

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        conn.execute("BEGIN TRANSACTION")
        rows = 0
        for game_id, entry in data.items():
            anticheat = entry.get("anticheat")
            distance = entry.get("distance", 999)
            if isinstance(distance, str):
                try:
                    distance = float(distance)
                except (ValueError, TypeError):
                    distance = 999

            conn.execute(
                """INSERT OR REPLACE INTO fork_recommendations
                   (game_id, fork_id, title, recommended, confidence,
                    distance, anchor_count, anticheat)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    game_id,
                    fork_id,
                    entry.get("title"),
                    entry.get("recommended"),
                    entry.get("confidence"),
                    distance,
                    entry.get("anchorCount"),
                    json.dumps(anticheat, ensure_ascii=False) if anticheat else None,
                ),
            )
            rows += 1
            if rows % 50000 == 0:
                print(f"  → {rows} registros...")

        conn.commit()
        print(f"  ✓ {rows} registros em {time.time()-t0:.1f}s total")
        total_rows += rows

    print(f"  ✓ Total: {total_rows} registros em {time.time()-t0:.1f}s")


def main():
    print("=" * 50)
    print("Migração JSON → SQLite")
    print(f"Origem: {_PROTON_API_DIR}")
    print(f"Destino: {_DB_PATH}")
    print("=" * 50)

    if os.path.exists(_DB_PATH):
        os.remove(_DB_PATH)
        print("DB anterior removido.")

    conn = get_db()
    create_tables(conn)
    migrate_matched(conn)
    migrate_recommendations(conn)
    conn.close()

    db_size = os.path.getsize(_DB_PATH) / (1024 * 1024)
    print(f"\n✓ DB criado: {_DB_PATH} ({db_size:.1f}MB)")


if __name__ == "__main__":
    main()
