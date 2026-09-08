import json
import sys


def write_event(event_type: str, **data):
    serialized = json.dumps({"event": event_type, **data}, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write(serialized + "\n")
    sys.stdout.flush()


def write_response(payload: dict):
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    sys.stdout.write(serialized + "\n")
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


def dispatch(method: str, params: object | None) -> object:
    if method not in METHODS:
        raise RpcError("method_not_found", f"Unknown method: {method}")
    return METHODS[method](params or {})
