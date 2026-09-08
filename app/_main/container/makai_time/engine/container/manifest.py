import json
import os
from pathlib import Path
from datetime import datetime, timezone

from engine.log import log


def get_manifest_path(prefix_path: str) -> Path:
    return Path(prefix_path).expanduser().resolve() / "container.json"


def read_manifest(prefix_path: str) -> dict:
    path = get_manifest_path(prefix_path)
    if not path.is_file():
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Failed to read manifest %s: %s", path, e)
        return {}


def write_manifest(prefix_path: str, data: dict) -> None:
    path = get_manifest_path(prefix_path)
    tmp = path.with_suffix(".json.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        tmp.replace(path)
    except OSError as e:
        log.warning("Failed to write manifest %s: %s", path, e)


def save_game_session(
    prefix_path: str,
    game_id: str | None,
    fork_id: str | None,
    proton_path: str,
    runtime_name: str,
    runtime_version: str,
    features: dict | None = None,
    display_backend: str = "auto",
) -> dict:
    manifest = read_manifest(prefix_path)

    now = datetime.now(timezone.utc).isoformat()

    session = {
        "date": now,
        "game_id": game_id or "",
        "fork_id": fork_id or "",
        "display_backend": display_backend,
        "runtime": runtime_name,
        "runtime_version": runtime_version,
    }

    history = manifest.get("history", [])
    history.append(session)
    if len(history) > 50:
        history = history[-50:]

    manifest.update({
        "version": 2,
        "last_updated": now,
        "meta": {
            "game_id": game_id or "",
            "fork_id": fork_id or "",
            "launch_count": len(history),
        },
        "proton": {
            "path": str(Path(proton_path).resolve()),
            "fork": fork_id or "",
        },
        "runtime": {
            "name": runtime_name,
            "version": runtime_version,
        },
        "display": {
            "backend": display_backend,
        },
        "history": history,
    })

    if features:
        manifest.setdefault("features", {})
        manifest["features"]["injected"] = {
            k: v for k, v in features.items()
            if k in ("fork_id", "launch")
        }
        if features.get("env"):
            manifest["env"] = features["env"]

    write_manifest(prefix_path, manifest)
    return manifest
