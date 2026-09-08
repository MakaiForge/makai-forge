#!/usr/bin/env python3
"""game_install_core.server — servidor RPC standalone (stdin, JSON lines).

Self-contained (não depende do resto do app) e fala o MESMO protocolo usado
pelo MakaiRPC do app e pelo callApi do CompactFlow:

  Requisição : {"id": <id>, "method": <str>, "params": {…}}
  Sucesso    : {"id": <id>, "result": {…}}
  Erro       : {"id": <id>, "error": {"code": …, "message": …}}
  Evento     : {"event": "<name>", …}  (ex.: install_progress)

Modos:
  python server.py --stdio      → loop (lê linhas até EOF, responde cada uma)
  echo '{"id":1,"method":…}' | python server.py   → single-shot (CompactFlow)

Métodos: detect_installer_type, copy_to_prefix, scan_prefix_for_exes,
snapshot_prefix, find_new_executables, install_game.
"""

import json
import os
import sys

# Garante `import game_install_core` funcione de qualquer cwd (app, CompactFlow,
# CLI). sys.path[0] ao rodar `python server.py` é a pasta do pacote — subir um nível.
_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR = os.path.dirname(_SELF_DIR)
for _d in (_PARENT_DIR, _SELF_DIR):
    if _d not in sys.path:
        sys.path.insert(0, _d)


def write_event(event_type: str, **data) -> None:
    sys.stdout.write(json.dumps({"event": event_type, **data},
                                ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def write_response(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True,
                                separators=(",", ":")) + "\n")
    sys.stdout.flush()


class RpcError(Exception):
    def __init__(self, code: str, message: str | None = None):
        self.code = code
        self.message = message or code


METHODS: dict[str, callable] = {}


def register(method: str):
    def wrapper(func):
        METHODS[method] = func
        return func
    return wrapper


# ─── Handlers ────────────────────────────────────────────────────

@register("detect_installer_type")
def handle_detect_installer_type(params: dict):
    from game_install_core.detect import detect_installer_type
    source_path = params.get("source_path") if isinstance(params, dict) else None
    if not source_path:
        raise RpcError("invalid_params", "source_path required")
    return detect_installer_type(str(source_path))


@register("copy_to_prefix")
def handle_copy_to_prefix(params: dict):
    from game_install_core.copy import copy_to_prefix
    source_path = params.get("source_path") if isinstance(params, dict) else None
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    if not source_path or not prefix_path:
        raise RpcError("invalid_params", "source_path and prefix_path required")

    def _progress(pct):
        write_event("copy_progress", percent=pct)

    return copy_to_prefix(str(source_path), str(prefix_path), progress_callback=_progress)


@register("scan_prefix_for_exes")
def handle_scan_prefix_for_exes(params: dict):
    from game_install_core.scan import scan_prefix_for_exes
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    game_folder_name = params.get("game_folder_name") if isinstance(params, dict) else None
    if not prefix_path:
        raise RpcError("invalid_params", "prefix_path required")
    return scan_prefix_for_exes(str(prefix_path), str(game_folder_name) if game_folder_name else None)


@register("snapshot_prefix")
def handle_snapshot_prefix(params: dict):
    from game_install_core.snapshot import snapshot_prefix
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    if not prefix_path:
        raise RpcError("invalid_params", "prefix_path required")
    return snapshot_prefix(str(prefix_path))


@register("find_new_executables")
def handle_find_new_executables(params: dict):
    from game_install_core.snapshot import find_new_executables
    before = params.get("before") if isinstance(params, dict) else None
    after = params.get("after") if isinstance(params, dict) else None
    if before is None or after is None:
        raise RpcError("invalid_params", "before and after required")
    return find_new_executables(list(before), list(after))


@register("install_game")
def handle_install_game(params: dict):
    from game_install_core.orchestrator import install_game
    source_path = params.get("source_path") if isinstance(params, dict) else None
    prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
    proton_path = params.get("proton_path") if isinstance(params, dict) else None
    game_id = params.get("game_id", "") if isinstance(params, dict) else ""
    existing_exe_path = params.get("existing_exe_path") if isinstance(params, dict) else None
    if not source_path or not prefix_path or not proton_path:
        raise RpcError("invalid_params", "source_path, prefix_path, proton_path required")

    def _progress(step, pct, msg):
        write_event("install_progress", step=step, percent=pct, message=msg)

    return install_game(
        source_path=str(source_path),
        prefix_path=str(prefix_path),
        proton_path=str(proton_path),
        game_id=str(game_id),
        existing_exe_path=str(existing_exe_path) if existing_exe_path else None,
        progress_callback=_progress,
    )


# ─── Loop / single-shot ──────────────────────────────────────────

def handle_request(payload: dict) -> None:
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
        result = METHODS[method](params or {})
        write_response({"id": request_id, "result": result})
    except RpcError as e:
        write_response({
            "id": request_id,
            "error": {"code": e.code, "message": e.message},
        })
    except KeyError:
        write_response({
            "id": request_id,
            "error": {"code": "method_not_found", "message": f"Unknown method: {method}"},
        })
    except Exception as e:  # noqa: BLE001 — protocolo RPC: nunca derruba o server
        write_response({
            "id": request_id,
            "error": {"code": "internal_error", "message": str(e)[:200]},
        })


def start_stdio_rpc_loop() -> None:
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
        handle_request(payload)


def main() -> None:
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
