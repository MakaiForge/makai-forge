"""Cache de análises de áudio.

Armazena resultados de análise por jogo para evitar re-análise.
Usa JSON simples em ~/.cache/makrun/audio/.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from makrun.intel.audio.models import AudioResult

log = logging.getLogger("makrun.intel.audio.cache")

CACHE_DIR = Path.home() / ".cache" / "makrun" / "audio"
CACHE_TTL = 86400 * 7  # 7 dias


def _ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _game_key(game_dir: str, exe_path: str | None = None) -> str:
    """Gera chave de cache única para um jogo.

    Combina caminho do diretório com hash de arquivos .exe e DLLs de áudio.
    """
    base = Path(game_dir).expanduser().resolve()
    if not base.is_dir():
        return hashlib.sha256(game_dir.encode()).hexdigest()[:16]

    # Files to hash: all exe and dll files
    files_to_hash = list(base.rglob("*.exe")) + list(base.rglob("*.dll"))
    files_to_hash = [f for f in files_to_hash if f.is_file() and f.stat().st_size < 50_000_000]

    hasher = hashlib.sha256()
    hasher.update(str(base).encode())

    # Sample a few files for quick invalidation
    for f in files_to_hash[:20]:
        try:
            hasher.update(f.name.encode())
            hasher.update(str(f.stat().st_mtime).encode())
            hasher.update(str(f.stat().st_size).encode())
        except OSError:
            pass

    return hasher.hexdigest()[:16]


def load_cached_analysis(game_dir: str, exe_path: str | None = None) -> AudioResult | None:
    """Carrega análise em cache se ainda válida."""
    key = _game_key(game_dir, exe_path)
    cache_file = CACHE_DIR / f"{key}.json"

    if not cache_file.is_file():
        return None

    try:
        data = json.loads(cache_file.read_text())
        cache_time = data.get("cached_at", 0)
        if time.time() - cache_time > CACHE_TTL:
            log.debug("Cache expirado para %s", game_dir)
            cache_file.unlink(missing_ok=True)
            return None

        result = AudioResult(
            api=data.get("api"),
            middleware=data.get("middleware"),
            backend=data.get("backend"),
            confidence=data.get("confidence", 0.0),
            evidence=[],
            recommendations=data.get("recommendations", []),
            dlls_detected=data.get("dlls_detected", []),
            apis_detected=data.get("apis_detected", []),
            preferred_driver=data.get("preferred_driver"),
            needs_dsoal=data.get("needs_dsoal", False),
        )
        log.debug("Cache carregado para %s", game_dir)
        return result
    except (json.JSONDecodeError, OSError, KeyError):
        cache_file.unlink(missing_ok=True)
        return None


def save_cached_analysis(game_dir: str, result: AudioResult, exe_path: str | None = None) -> None:
    """Salva análise em cache."""
    _ensure_cache_dir()
    key = _game_key(game_dir, exe_path)
    cache_file = CACHE_DIR / f"{key}.json"

    data = result.to_dict()
    data["cached_at"] = time.time()
    data["game_dir"] = game_dir

    try:
        cache_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        log.debug("Cache salvo para %s → %s", game_dir, cache_file)
    except OSError:
        log.warning("Falha ao salvar cache para %s", game_dir)


def invalidate_cache(game_dir: str, exe_path: str | None = None) -> None:
    """Invalida cache de um jogo."""
    key = _game_key(game_dir, exe_path)
    cache_file = CACHE_DIR / f"{key}.json"
    cache_file.unlink(missing_ok=True)
    log.debug("Cache invalidado para %s", game_dir)


def clear_all_cache() -> int:
    """Limpa todo cache de análises de áudio. Retorna número de arquivos removidos."""
    _ensure_cache_dir()
    count = 0
    for f in CACHE_DIR.glob("*.json"):
        f.unlink()
        count += 1
    log.info("Cache limpo: %d arquivos removidos", count)
    return count
