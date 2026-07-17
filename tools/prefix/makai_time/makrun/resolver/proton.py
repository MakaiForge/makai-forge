import os
from pathlib import Path

from makrun.consts import STEAM_COMPAT_DIR
from makrun.log import log


def resolve_proton_path(name: str | None = None) -> Path | None:
    if name:
        path = STEAM_COMPAT_DIR / name
        if path.is_dir():
            log.debug("Proton found: %s", path)
            return path.resolve()
        path = Path(name)
        if path.is_dir():
            log.debug("Proton found (absolute): %s", path)
            return path.resolve()

    return _find_latest_proton()


def _find_latest_proton() -> Path | None:
    if not STEAM_COMPAT_DIR.is_dir():
        return None

    candidates = sorted(
        (d for d in STEAM_COMPAT_DIR.iterdir() if d.is_dir()),
        key=lambda d: os.path.getmtime(d),
        reverse=True,
    )

    for candidate in candidates:
        proton_script = candidate / "proton"
        if proton_script.is_file():
            log.debug("Latest Proton: %s", candidate.name)
            return candidate.resolve()

    return None


def validate_proton(path: Path) -> bool:
    if not path.is_dir():
        log.error("Proton directory not found: %s", path)
        return False
    if not (path / "proton").is_file():
        log.error("Proton script not found in: %s", path)
        return False
    return True
