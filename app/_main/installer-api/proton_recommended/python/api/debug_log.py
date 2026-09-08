"""
Debug logger para o fluxo de instalação.

Ativado via env var DEBUG_INSTALL=1.
Escreve JSON lines em um arquivo de log no diretório do usuário.

Uso:
    from api.debug_log import debug_log
    debug_log.log("winetricks_run", {"verb": "vcrun2022", "success": True})
"""

import json
import os
import platform
from datetime import datetime, timezone


_LOG_PATH: str | None = None
_STARTED = False


def _get_log_path() -> str | None:
    global _LOG_PATH
    if _LOG_PATH is not None:
        return _LOG_PATH

    if not os.environ.get("DEBUG_INSTALL"):
        return None

    # Tenta salvar no diretório home
    home = os.path.expanduser("~")
    log_dir = os.path.join(home, ".cache", "makai-forge", "debug")
    os.makedirs(log_dir, exist_ok=True)
    _LOG_PATH = os.path.join(log_dir, "install-debug.json")
    # Limpa log anterior
    try:
        open(_LOG_PATH, "w").close()
    except OSError:
        _LOG_PATH = None
    return _LOG_PATH


def start(session_id: str | None = None) -> None:
    global _STARTED
    if not os.environ.get("DEBUG_INSTALL"):
        return
    _STARTED = True
    log("session_start", {"sessionId": session_id or f"install-{int(datetime.now().timestamp())}"})


def log(step: str, data: dict | None = None) -> None:
    if not _STARTED and step != "session_start":
        return
    if not os.environ.get("DEBUG_INSTALL"):
        return

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "data": data or {},
    }

    path = _get_log_path()
    if path:
        try:
            with open(path, "a") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except OSError:
            pass


def end(result: dict | None = None) -> None:
    log("session_end", result or {})
