import re
from pathlib import Path

from makrun import RUNTIME_VERSIONS, DEFAULT_RUNTIME
from makrun.consts import RUNTIME_DIR
from makrun.log import log

RuntimeVersion = tuple[str, str, str]


def resolve_runtime_version(proton_path: Path | None) -> RuntimeVersion:
    if not proton_path or not proton_path.is_dir():
        log.debug("No PROTONPATH, defaulting to %s", DEFAULT_RUNTIME[1])
        return DEFAULT_RUNTIME

    manifest = proton_path / "toolmanifest.vdf"
    if not manifest.is_file():
        log.debug("No toolmanifest.vdf, defaulting to %s", DEFAULT_RUNTIME[1])
        return DEFAULT_RUNTIME

    appid = _parse_manifest(manifest)
    if not appid:
        return DEFAULT_RUNTIME

    for version in RUNTIME_VERSIONS:
        if version[2] == appid:
            log.debug("Resolved runtime: %s (appid %s)", version[1], appid)
            return version

    log.debug("Unknown appid %s, defaulting to %s", appid, DEFAULT_RUNTIME[1])
    return DEFAULT_RUNTIME


def _parse_manifest(path: Path) -> str | None:
    key = "require_tool_appid"
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                if key not in line:
                    continue
                m = re.search(r'"require_tool_appid"\s+"(\d+)"', line)
                if m:
                    return m.group(1)
    except (OSError, UnicodeDecodeError):
        pass
    return None


def get_runtime_path(version: RuntimeVersion) -> Path:
    return RUNTIME_DIR / version[1]
