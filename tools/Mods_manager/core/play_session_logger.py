import os
import json
import time
from datetime import datetime, timezone


_PLAY_LOG_DIR = os.path.expanduser("~/.cache/makai-forge/play-logs")


def _log_dir() -> str:
    os.makedirs(_PLAY_LOG_DIR, exist_ok=True)
    return _PLAY_LOG_DIR


def _slug(game_id: str) -> str:
    return game_id.lower().replace(" ", "-").replace("/", "-").replace("\\", "-")


def _session_path(game_id: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    return os.path.join(_log_dir(), f"{_slug(game_id)}-{ts}.jsonl")


class PlaySessionLogger:
    def __init__(self, game_id: str):
        self.game_id = game_id
        self.path = _session_path(game_id)
        self._start = time.monotonic()
        self._fd = open(self.path, "w")
        self._write("session_start", game_id=game_id)

    def _write(self, event: str, **data):
        line = json.dumps({
            "t": time.monotonic() - self._start,
            "event": event,
            **data,
        }, ensure_ascii=True, default=str)
        self._fd.write(line + "\n")
        self._fd.flush()

    def step(self, name: str, message: str, **extra):
        self._write("step", step=name, message=message, **extra)

    def proton(self, path: str, fork_id: str | None, method: str | None, features_count: int):
        self._write("proton",
            proton_path=path,
            fork_id=fork_id or "unknown",
            method=method or "unknown",
            features_count=features_count,
        )

    def prefix(self, path: str, created: bool = False):
        self._write("prefix", prefix_path=path, created=created)

    def container(self, manifest_path: str, runtime: str, bwrap_cmd: list[str] | None = None):
        data = dict(manifest_path=manifest_path, runtime=runtime)
        if bwrap_cmd:
            data["bwrap_cmd"] = " ".join(str(c) for c in bwrap_cmd)
        self._write("container", **data)

    def makrun_cmd(self, cmd: list[str]):
        self._write("makrun_cmd", cmd=" ".join(str(c) for c in cmd))

    def result(self, success: bool, pid: int | None = None, method: str | None = None, error: str | None = None):
        self._write("result",
            success=success,
            pid=pid,
            method=method,
            error=error,
            duration_s=time.monotonic() - self._start,
        )

    def close(self):
        try:
            self._fd.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
