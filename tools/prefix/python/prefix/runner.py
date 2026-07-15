"""
Proton/Umu command runner — run arbitrary commands inside a game's prefix.

Unified from:
  - data/install-api/proton_recommended/python/Utils/prefix/runner.py
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from .container import build_bwrap_cmd

STEAM_RUNTIME_DIR = os.path.expanduser("~/.local/share/makaiforge/steamrt4")
USE_CUSTOM_CONTAINER = True  # True = bwrap, False = _v2-entry-point


def _find_steam_runtime() -> str | None:
    entry = os.path.join(STEAM_RUNTIME_DIR, "_v2-entry-point")
    if os.path.isfile(entry) and os.access(entry, os.X_OK):
        return STEAM_RUNTIME_DIR
    return None


def run_proton_command_for_game(
    proton_path: str,
    command: list[str],
    use_umu: bool = False,
    env_override: Optional[dict[str, str]] = None,
) -> Optional[int]:
    """
    Run a command inside a game's Proton context.

    Builds environment from os.environ + env_override.
    Sets defaults for STEAM_COMPAT_* vars only if not already provided.
    Uses managed Steam Runtime if available and requested.
    """
    run_env = os.environ.copy()
    if env_override:
        run_env.update(env_override)

    proton = Path(proton_path)

    # Only set defaults if caller didn't provide them in env_override
    run_env.setdefault("STEAM_COMPAT_DATA_PATH", "")
    run_env.setdefault("STEAM_COMPAT_CLIENT_INSTALL_PATH", str(proton.parent))

    if use_umu:
        sid = run_env.get("SteamAppId", "")
        game_id = f"umu-{sid}" if sid else ""
        extra = {
            "GAMEID": game_id,
            "STORE": "steam",
            "WINEPREFIX": run_env.get("WINEPREFIX", ""),
            "PROTONPATH": str(proton.parent),
        }

        if USE_CUSTOM_CONTAINER:
            try:
                from .container import _find_runtime_root
                rt = _find_runtime_root()
                if rt:
                    cmd = build_bwrap_cmd(
                        [str(proton), "run"] + command,
                        proton_path=str(proton),
                        env_extra=extra,
                    )
                else:
                    umu = shutil.which("umu-run")
                    cmd = [umu] + command if umu else [str(proton), "run"] + command
            except (ImportError, RuntimeError):
                umu = shutil.which("umu-run")
                cmd = [umu] + command if umu else [str(proton), "run"] + command
        else:
            runtime_dir = _find_steam_runtime()
            if runtime_dir:
                entry = os.path.join(runtime_dir, "_v2-entry-point")
                shim = os.path.join(runtime_dir, "umu-shim")
                cmd = [entry, "--verb=waitforexitandrun", "--", shim, str(proton), "run"] + command
            else:
                umu = shutil.which("umu-run")
                cmd = [umu] + command if umu else [str(proton), "run"] + command
    else:
        cmd = [str(proton), "run"] + command

    try:
        result = subprocess.run(cmd, env=run_env, capture_output=False, timeout=3600)
        return result.returncode
    except (subprocess.TimeoutExpired, OSError):
        return None
