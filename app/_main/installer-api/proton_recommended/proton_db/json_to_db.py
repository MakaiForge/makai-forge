#!/usr/bin/env python3
"""
Converts proton_db JSON files into a SQLite database (proton_recommended.db).

Schema:
  - game_recommendations: one row per game
    game_id, steam_app_id, total_reports, recommended (JSON list), versions (JSON blob)

Usage:
  python json_to_db.py
  → Writes proton_recommended.db in the same directory as the JSONs
"""

import json
import os
import sqlite3
import glob

DB_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_DIR = DB_DIR
DB_PATH = os.path.join(DB_DIR, "proton_recommended.db")


def create_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS game_recommendations (
            game_id TEXT PRIMARY KEY,
            steam_app_id TEXT NOT NULL DEFAULT '',
            total_reports INTEGER NOT NULL DEFAULT 0,
            recommended TEXT NOT NULL DEFAULT '[]',
            versions TEXT NOT NULL DEFAULT '[]'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS version_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            version TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            positive INTEGER NOT NULL DEFAULT 0,
            negative INTEGER NOT NULL DEFAULT 0,
            positive_ratio REAL NOT NULL DEFAULT 0.0,
            UNIQUE(game_id, version),
            FOREIGN KEY (game_id) REFERENCES game_recommendations(game_id)
        )
    """)
    return conn


def import_json(conn: sqlite3.Connection, filepath: str):
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    game_id = data.get("gameId", "")
    steam_app_id = data.get("steamAppId", "")
    total_reports = data.get("totalReports", 0)
    recommended = json.dumps(data.get("recommended", []), ensure_ascii=False)
    versions = json.dumps(data.get("versions", []), ensure_ascii=False)

    conn.execute("""
        INSERT OR REPLACE INTO game_recommendations
            (game_id, steam_app_id, total_reports, recommended, versions)
        VALUES (?, ?, ?, ?, ?)
    """, (game_id, steam_app_id, total_reports, recommended, versions))

    for v in data.get("versions", []):
        conn.execute("""
            INSERT OR REPLACE INTO version_stats
                (game_id, version, total, positive, negative, positive_ratio)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            game_id,
            v["version"],
            v["total"],
            v["positive"],
            v["negative"],
            v["positiveRatio"],
        ))

    print(f"  [{game_id}] {total_reports} reports, {len(data.get('versions',[]))} versions")


def main():
    json_files = sorted(glob.glob(os.path.join(JSON_DIR, "*.json")))
    json_files = [f for f in json_files
                  if not os.path.basename(f).startswith(("fetch_", "process_", "json_to_db"))]

    if not json_files:
        print("No JSON files found!")
        return

    print(f"Creating {DB_PATH}...")
    conn = create_db()

    for fp in json_files:
        import_json(conn, fp)

    conn.commit()

    # Verify
    cur = conn.execute("SELECT COUNT(*) FROM game_recommendations")
    games_count = cur.fetchone()[0]
    cur = conn.execute("SELECT COUNT(*) FROM version_stats")
    versions_count = cur.fetchone()[0]
    conn.close()

    print(f"\nDone! {games_count} games, {versions_count} version stats imported.")
    print(f"DB: {DB_PATH}")


if __name__ == "__main__":
    main()
