#!/usr/bin/env python3
"""
core/server.py — RPC Server Unificado (JSON-lines sobre stdin/stdout).

Protocolo idêntico ao protonforge-api/server.py:
    Request:  {"id": 1, "method": "ping", "params": {}}
    Response: {"id": 1, "result": "pong"}
    Error:    {"id": 1, "error": {"code": "...", "message": "..."}}
    Event:    {"event": "ready", "protocolVersion": 1}

Uso:
    python core/server.py                    # loop persistente
    echo '{"id":1,"method":"ping"}' | python core/server.py  # single-shot

Métodos implementados:
    ping                    → "pong"
    storage_get             → storage.get(key)
    storage_put             → storage.put(key, value)
    storage_delete          → storage.delete(key)
    storage_keys            → storage.keys(prefix)
    storage_entries         → storage.entries(prefix)
    (mais serão adicionados nas próximas fases)
"""

import json
import os
import sys
import time
import traceback
import threading
from datetime import datetime, timezone

# Garante que o diretório raiz do projeto está no PYTHONPATH
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.log")


def log_msg(*args):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{ts}] {' '.join(str(a) for a in args)}"
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def write_response(payload: dict):
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write(serialized + "\n")
    sys.stdout.flush()


# ─── Métodos RPC ────────────────────────────────────────────────

import core.storage as storage


def dispatch(method: str, params: object | None) -> object:
    if method == "ping":
        return "pong"

    if method == "storage_get":
        if not isinstance(params, dict) or "key" not in params:
            raise RpcError("invalid_params", "key required")
        return storage.get(params["key"])

    if method == "storage_put":
        if not isinstance(params, dict) or "key" not in params:
            raise RpcError("invalid_params", "key and value required")
        storage.put(params["key"], params.get("value"))
        return {"ok": True}

    if method == "storage_delete":
        if not isinstance(params, dict) or "key" not in params:
            raise RpcError("invalid_params", "key required")
        storage.delete(params["key"])
        return {"ok": True}

    if method == "storage_keys":
        prefix = ""
        if isinstance(params, dict):
            prefix = params.get("prefix", "")
        return storage.keys(prefix)

    if method == "storage_entries":
        prefix = ""
        if isinstance(params, dict):
            prefix = params.get("prefix", "")
        return storage.entries(prefix)

    if method == "play_game":
        if not isinstance(params, dict) or "game_id" not in params:
            raise RpcError("invalid_params", "game_id required")
        profile = params.get("profile", "Default")
        from core.play import play_game
        return play_game(params["game_id"], profile)

    if method == "detect_game":
        if not isinstance(params, dict) or "game_id" not in params:
            raise RpcError("invalid_params", "game_id required")
        from core.detection import detect_game
        return detect_game(params["game_id"])

    if method == "deploy_mods":
        if not isinstance(params, dict) or "game_id" not in params:
            raise RpcError("invalid_params", "game_id required")
        from core.deploy import deploy_mods
        return deploy_mods(
            game_id=params["game_id"],
            game_path=params.get("game_path", ""),
            staging_dir=params.get("staging_dir", ""),
            modlist=params.get("modlist", []),
            link_mode=params.get("link_mode", "hardlink"),
            profile=params.get("profile", "Default"),
        )

    if method == "undeploy_mods":
        if not isinstance(params, dict) or "game_path" not in params:
            raise RpcError("invalid_params", "game_path required")
        from core.deploy import undeploy_mods
        return undeploy_mods(
            game_path=params["game_path"],
            staging_dir=params.get("staging_dir", ""),
            filemap_path=params.get("filemap_path"),
        )

    raise RpcError("method_not_found", f"Unknown method: {method}")


class RpcError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message


# ─── Handler com thread ─────────────────────────────────────────

def handle_request(payload: dict):
    request_id = payload.get("id")
    method = payload.get("method")
    params = payload.get("params")

    if request_id is None:
        write_response({
            "id": None,
            "error": {"code": "invalid_request", "message": "Missing request id"},
        })
        return

    if not isinstance(method, str) or not method:
        write_response({
            "id": request_id,
            "error": {"code": "invalid_method", "message": "Invalid method"},
        })
        return

    try:
        result = dispatch(method, params)
        write_response({"id": request_id, "result": result})
        log_msg("OK", method, str(request_id))
    except RpcError as e:
        log_msg("RPC_ERROR", method, str(request_id), e.code, e.message)
        write_response({
            "id": request_id,
            "error": {"code": e.code, "message": e.message},
        })
    except Exception as e:
        log_msg("EXCEPTION", method, str(request_id), str(e)[:200])
        traceback.print_exc(file=sys.stderr)
        write_response({
            "id": request_id,
            "error": {"code": "internal_error", "message": str(e)[:200]},
        })


# ─── Loop ───────────────────────────────────────────────────────

def start_stdio_rpc_loop():
    log_msg("SERVER", "started", "--stdio")
    write_response({"event": "ready", "protocolVersion": 1})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except json.JSONDecodeError as e:
            write_response({
                "id": None,
                "error": {"code": "invalid_json", "message": str(e)},
            })
            continue

        if not isinstance(payload, dict):
            write_response({
                "id": None,
                "error": {"code": "invalid_request", "message": "Request must be an object"},
            })
            continue

        thread = threading.Thread(target=handle_request, args=(payload,), daemon=True)
        thread.start()


def main():
    if "--stdio" in sys.argv:
        start_stdio_rpc_loop()
        return

    if not sys.stdin.isatty():
        raw_line = sys.stdin.readline().strip()
        if raw_line:
            try:
                payload = json.loads(raw_line)
                handle_request(payload)
            except json.JSONDecodeError as e:
                write_response({
                    "id": None,
                    "error": {"code": "invalid_json", "message": str(e)},
                })
        return

    start_stdio_rpc_loop()


if __name__ == "__main__":
    main()
