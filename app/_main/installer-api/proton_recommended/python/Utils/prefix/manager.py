"""prefix/manager.py — Prefix detection, AppID resolution, compat tool path."""

import errno
import json
import os
import shutil
import stat
import subprocess as sp
import sys
from pathlib import Path
from typing import Optional

from bridge.Utils.steam_finder import (
    find_steam_steamapps_dirs,
    find_game_installdir,
    _find_installdir_from_manifest,
    parse_vdf_libraries,
    find_steam_libraries,
)


def find_steam_appid_from_game_path(game_path: str | Path) -> Optional[str]:
    """Find the Steam App ID for a game installation path.

    Supports exact match and fuzzy match (by directory name).
    """
    target = Path(game_path).resolve()
    for steamapps in find_steam_steamapps_dirs():
        common = steamapps / "common"
        if not common.exists():
            continue
        # exact match
        for manifest in steamapps.glob("appmanifest_*.acf"):
            installdir = _find_installdir_from_manifest(manifest)
            if installdir:
                candidate = common / installdir
                if candidate.resolve() == target:
                    text = manifest.read_text(encoding="utf-8", errors="replace")
                    m = __import__("re").search(r'"appid"\s+"(\d+)"', text)
                    if m:
                        return m.group(1)
        # fuzzy: match by installing_dir_key or partial
        target_str = str(target).lower()
        for manifest in steamapps.glob("appmanifest_*.acf"):
            text = manifest.read_text(encoding="utf-8", errors="replace")
            installdir = _find_installdir_from_manifest(manifest)
            if installdir and installdir.lower() in target_str:
                m = __import__("re").search(r'"appid"\s+"(\d+)"', text)
                if m:
                    return m.group(1)
    return None


def find_appid_by_name(game_name: str) -> Optional[str]:
    """Fuzzy-find a Steam App ID by game name.

    Searches all libraryfolders.vdf manifests for a partial name match.
    Returns the first matching App ID, or None.
    """
    import re
    name_lower = game_name.lower().replace(" ", "").replace("-", "").replace("_", "")
    for steamapps in find_steam_steamapps_dirs():
        for manifest in steamapps.glob("appmanifest_*.acf"):
            try:
                text = manifest.read_text(encoding="utf-8", errors="replace")
                manifest_name = _find_installdir_from_manifest(manifest)
                if manifest_name:
                    manifest_clean = manifest_name.lower().replace(" ", "").replace("-", "").replace("_", "")
                    if name_lower in manifest_clean or manifest_clean in name_lower:
                        m = re.search(r'"appid"\s+"(\d+)"', text)
                        if m:
                            return m.group(1)
            except OSError:
                continue
    return None


def get_compat_tool_path(game_path: str | Path) -> Optional[str]:
    """Get the Proton/Wine compat tool path for a game if set in Steam config."""
    steam_id = find_steam_appid_from_game_path(game_path)
    if not steam_id:
        return None

    for steamapps in find_steam_steamapps_dirs():
        vdf_paths = [
            steamapps / "config" / "config.vdf",
            steamapps.parent / "config" / "config.vdf",
        ]
        for cf in vdf_paths:
            if not cf.exists():
                continue
            try:
                text = cf.read_text(encoding="utf-8", errors="replace")
                # Look for CompatToolMapping for this app
                pattern = re.compile(
                    rf'"CompatToolMapping"\s*{{[^}}]*?"{steam_id}"[^}}]*?"name"\s*"([^"]+)"',
                    re.DOTALL,
                )
                m = pattern.search(text)
                if m:
                    tool_name = m.group(1)
                    for steamapps2 in find_steam_steamapps_dirs():
                        for search_root in [
                            steamapps2 / "compatibilitytools.d",
                            steamapps2.parent / "compatibilitytools.d",
                            steamapps2.parent.parent / "compatibilitytools.d",
                        ]:
                            if not search_root.exists():
                                continue
                            candidate = search_root / tool_name / "proton"
                            if candidate.exists():
                                return str(candidate)
                    # check steamapps/common/Proton*
                    for steamapps2 in find_steam_steamapps_dirs():
                        common_dir = steamapps2 / "common" if (steamapps2 / "common").exists() else steamapps2.parent / "steamapps" / "common"
                        if not common_dir.exists():
                            continue
                        for proton_dir in common_dir.glob("Proton*"):
                            if proton_dir.name.lower().replace(" ", "").replace("-", "").replace("_", "") == tool_name.lower().replace(" ", "").replace("-", "").replace("_", ""):
                                proton_bin = proton_dir / "proton"
                                if proton_bin.exists():
                                    return str(proton_bin)
                    return None
            except (OSError, re.error):
                continue

    return None


def get_prefix_path(game_path: str | Path) -> Optional[str]:
    """Get the Proton/Wine prefix path for a game installation.

    This is typically at <steam_root>/compatdata/<steam_id>/pfx/
    """
    steam_id = find_steam_appid_from_game_path(game_path)
    if not steam_id:
        return None

    for steamapps in find_steam_steamapps_dirs():
        compatdata = steamapps.parent / "compatdata" / steam_id
        if compatdata.exists():
            pfx = compatdata / "pfx"
            if pfx.exists():
                return str(pfx)
            return str(compatdata)

        # flatpak
        flatpak = Path.home() / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam" / "compatdata" / steam_id
        if flatpak.exists():
            pfx = flatpak / "pfx"
            return str(pfx) if pfx.exists() else str(flatpak)

    return None


def get_prefix_drive_c(game_path: str | Path) -> Optional[str]:
    """Get the drive_c path inside a game's Proton prefix."""
    prefix = get_prefix_path(game_path)
    if not prefix:
        return None
    pfx_path = Path(prefix)
    drive_c = pfx_path / "drive_c"
    if drive_c.exists():
        return str(drive_c)
    return None
