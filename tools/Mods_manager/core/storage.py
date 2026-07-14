"""
core/storage.py — Armazenamento JSON centralizado.

Fonte única de verdade para toda persistência.
O Electron consulta/grava via RPC, nunca acessa o arquivo diretamente.
"""

import json
import os
from pathlib import Path

STORAGE_DIR = os.path.expanduser("~/.config/makai-forger")
STORAGE_FILE = os.path.join(STORAGE_DIR, "mods-store.json")

_locked: dict[str, object] | None = None


def _load() -> dict[str, object]:
    global _locked
    if _locked is not None:
        return _locked
    os.makedirs(STORAGE_DIR, exist_ok=True)
    if os.path.exists(STORAGE_FILE):
        try:
            with open(STORAGE_FILE, "r") as f:
                _locked = json.load(f)
        except (json.JSONDecodeError, OSError):
            _locked = {}
    else:
        _locked = {}
    return _locked


def _save(data: dict[str, object]) -> None:
    os.makedirs(STORAGE_DIR, exist_ok=True)
    with open(STORAGE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get(key: str) -> object | None:
    data = _load()
    return data.get(key)


def put(key: str, value: object) -> None:
    data = _load()
    data[key] = value
    _save(data)


def delete(key: str) -> None:
    data = _load()
    data.pop(key, None)
    _save(data)


def keys(prefix: str = "") -> list[str]:
    data = _load()
    if prefix:
        return [k for k in data if k.startswith(prefix)]
    return list(data.keys())


def entries(prefix: str = "") -> list[tuple[str, object]]:
    data = _load()
    if prefix:
        return [(k, v) for k, v in data.items() if k.startswith(prefix)]
    return list(data.items())
