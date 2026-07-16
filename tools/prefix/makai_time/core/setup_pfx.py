"""Prefix preparation: setup_pfx()

Cria symlinks pfx → .  e steamuser → $USER (ou vice-versa)
que Protons GE, UMU e protonfixes esperam encontrar.

Referência: umu-run/umu_run.py:setup_pfx() (linhas 31-60)
"""

import os
from pathlib import Path
from pwd import getpwuid


def setup_pfx(prefix_path: str) -> None:
    pfx = Path(prefix_path)
    steam = pfx / "drive_c" / "users" / "steamuser"
    user = getpwuid(os.getuid()).pw_name
    wineuser = pfx / "drive_c" / "users" / user

    pfx_link = pfx / "pfx"
    if pfx_link.is_symlink():
        pfx_link.unlink()
    if not pfx_link.is_dir():
        pfx_link.symlink_to(pfx.resolve())

    tracked = pfx / "tracked_files"
    tracked.touch(exist_ok=True)

    if not wineuser.exists() and not steam.exists():
        steam.mkdir(parents=True, exist_ok=True)
        wineuser.symlink_to("steamuser")
    elif wineuser.is_dir() and not steam.exists():
        steam.symlink_to(user)
    elif not wineuser.exists() and steam.is_dir():
        wineuser.symlink_to("steamuser")
