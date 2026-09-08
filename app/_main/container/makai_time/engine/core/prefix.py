import os
from pathlib import Path
from pwd import getpwuid

from engine.log import log


def setup_pfx(prefix_path: str) -> None:
    pfx = Path(prefix_path) / "pfx"
    steam = Path(prefix_path) / "drive_c" / "users" / "steamuser"
    user = getpwuid(os.getuid()).pw_name
    wineuser = Path(prefix_path) / "drive_c" / "users" / user

    if pfx.is_symlink():
        pfx.unlink()

    if not pfx.is_dir():
        pfx.symlink_to(Path(prefix_path).resolve())

    Path(prefix_path).joinpath("tracked_files").touch(exist_ok=True)

    if not wineuser.exists() and not steam.exists():
        steam.mkdir(parents=True)
        wineuser.symlink_to("steamuser")
    elif wineuser.is_dir() and not steam.exists():
        steam.symlink_to(user)
    elif not wineuser.exists() and steam.is_dir():
        wineuser.symlink_to("steamuser")
