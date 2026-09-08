"""
Conexões SQLite para dados de Proton (proton_data.db, fork_catalog.db).

Ponto central para:
  - _get_db()          → conexão com proton_data.db
  - _get_proton_db()   → alias para _get_db (consistência com matching.py)
  - _get_fork_catalog_db() → conexão com fork_catalog.db
  - _RESOURCES_DIR     → diretório de resources baixados pelo bootstrap
  - _PROTON_API_DIR    → diretório dos JSONs de fallback
"""

import os
import sqlite3

_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..", "..")
)


def _get_resources_dir() -> str:
    """Diretório dos resources baixados pelo bootstrap.

    Prioridade:
      1. Env MAKAI_RESOURCES_DIR (definido pelo Electron no spawn do server)
      2. userData do app: ~/.config/makai-forger/resources
      3. Dev fallback: <repo>/app/_data (DBs embarcados no repositório)
    """
    env = os.environ.get("MAKAI_RESOURCES_DIR")
    if env:
        return env

    user_resources = os.path.join(
        os.path.expanduser("~"), ".config", "makai-forger", "resources"
    )
    if os.path.isdir(user_resources):
        return user_resources

    repo_data = os.path.join(_REPO_ROOT, "app", "_data")
    if os.path.isdir(repo_data):
        return repo_data

    return user_resources


def _resolve_db_path(name: str) -> str:
    base = _get_resources_dir()
    for sub in ("", "database"):
        candidate = os.path.join(base, sub, name)
        if os.path.exists(candidate):
            return candidate
    return os.path.join(base, "database", name)


_RESOURCES_DIR = _get_resources_dir()
_PROTON_API_DIR = os.path.join(_RESOURCES_DIR, "data")
_PROTON_DATA_DB = _resolve_db_path("proton_data.db")
_FORK_CATALOG_DB = _resolve_db_path("fork_catalog.db")

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
