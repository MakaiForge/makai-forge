"""
Conexões SQLite para dados de Proton (proton_data.db, fork_catalog.db).

Ponto central para:
  - _get_db()          → conexão com proton_data.db
  - _get_proton_db()   → alias para _get_db (consistência com matching.py)
  - _get_fork_catalog_db() → conexão com fork_catalog.db
  - _PROJECT_ROOT      → raiz do projeto
  - _PROTON_API_DIR    → diretório dos JSONs (tools/plaina_proton/api proton)
"""

import os
import sqlite3

_PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..")
)
_PROTON_API_DIR = os.path.join(
    _PROJECT_ROOT, "tools", "plaina_proton", "api proton"
)
_PROTON_DATA_DB = os.path.join(_PROJECT_ROOT, "resources", "proton_data.db")
_FORK_CATALOG_DB = os.path.join(_PROJECT_ROOT, "resources", "database", "fork_catalog.db")

_cache: dict = {}


def _get_db() -> sqlite3.Connection | None:
    if "proton_db" in _cache:
        return _cache["proton_db"]
    if not os.path.exists(_PROTON_DATA_DB):
        return None
    conn = sqlite3.connect(_PROTON_DATA_DB, timeout=5, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    _cache["proton_db"] = conn
    return conn


def _get_proton_db() -> sqlite3.Connection | None:
    return _get_db()


def _get_fork_catalog_db() -> sqlite3.Connection | None:
    if "fork_catalog" in _cache:
        return _cache["fork_catalog"]
    if not os.path.exists(_FORK_CATALOG_DB):
        return None
    conn = sqlite3.connect(_FORK_CATALOG_DB, timeout=5, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    _cache["fork_catalog"] = conn
    return conn
