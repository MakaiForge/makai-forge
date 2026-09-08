"""steam_finder — Steam library detection and game location."""

import re
import sys
from pathlib import Path
from typing import Optional

# ── Library Detection ─────────────────────────────────────────────────────────


def find_steam_libraries() -> list[Path]:
    """Scan all known Steam installation paths and return libraryfolders.vdf paths."""
    candidates: list[Path] = []

    native_paths = [
        Path.home() / ".local" / "share" / "Steam",
        Path.home() / ".steam" / "steam",
        Path.home() / "Steam",
        Path("/usr/share/steam"),
    ]
    for p in native_paths:
        vdf = p / "config" / "libraryfolders.vdf"
        if vdf.exists():
            candidates.append(vdf)

    snap_paths = [
        Path.home() / "snap" / "steam" / "common" / ".local" / "share" / "Steam",
        Path.home() / "snap" / "steam" / "common" / ".steam" / "steam",
    ]
    for p in snap_paths:
        vdf = p / "config" / "libraryfolders.vdf"
        if vdf.exists():
            candidates.append(vdf)

    flatpak_paths = [
        Path.home() / ".var" / "app" / "com.valvesoftware.Steam" / "data" / "Steam",
        Path.home() / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam",
        Path.home() / ".var" / "app" / "com.valvesoftware.Steam" / ".steam" / "steam",
    ]
    for p in flatpak_paths:
        vdf = p / "config" / "libraryfolders.vdf"
        if vdf.exists():
            candidates.append(vdf)

    extra = [
        Path.home() / "Games" / "Steam",
        Path("/media") / "SteamLibrary",
        Path("/mnt") / "SteamLibrary",
    ]
    for p in extra:
        vdf = p / "config" / "libraryfolders.vdf"
        if vdf.exists():
            candidates.append(vdf)

    return candidates


def parse_vdf_libraries(vdf_path: str | Path) -> list[Path]:
    """Parse libraryfolders.vdf and return list of library paths."""
    path = Path(vdf_path)
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    libraries: list[Path] = []
    for m in re.finditer(r'"(\d+)"\s*\n\s*\{[^}]*?"path"\s*"([^"]+)"', text, re.DOTALL):
        lib_path_str = m.group(2)
        lib_path = Path(lib_path_str)
        if lib_path.exists():
            libraries.append(lib_path)
    for m in re.finditer(r'"(\d+)"\s+"([^"]+)"', text):
        lib_path = Path(m.group(2))
        if lib_path.exists() and lib_path not in libraries:
            libraries.append(lib_path)
    return libraries


def find_steam_steamapps_dirs() -> list[Path]:
    """Return all steamapps/ directories across all known libraries."""
    dirs: list[Path] = []
    already = set()
    vdfs = find_steam_libraries()
    for vdf in vdfs:
        libraries = parse_vdf_libraries(vdf)
        for lib in libraries:
            steamapps = lib / "steamapps"
            if steamapps.exists() and str(steamapps) not in already:
                dirs.append(steamapps)
                already.add(str(steamapps))
    return dirs


def find_game_by_steam_id(steam_id: str) -> Optional[dict]:
    """Find a game by its Steam App ID across all libraries.

    Returns dict with {name, install_dir, steam_id, library_path} or None.
    """
    target = str(steam_id)
    for steamapps in find_steam_steamapps_dirs():
        manifest_pattern = steamapps / f"appmanifest_{target}.acf"
        if manifest_pattern.exists():
            text = manifest_pattern.read_text(encoding="utf-8", errors="replace")
            name = _parse_acf_field(text, "name")
            installdir = _parse_acf_field(text, "installdir")
            if name:
                game_path = steamapps / "common" / (installdir or name)
                return {
                    "name": name,
                    "install_dir": str(game_path) if game_path.exists() else None,
                    "steam_id": steam_id,
                    "library_path": str(steamapps),
                }
    return None


def find_game_installdir(steam_id: str) -> Optional[str]:
    """Return the game's install directory path given its Steam App ID, or None."""
    result = find_game_by_steam_id(steam_id)
    if result:
        return result.get("install_dir")
    return None


def find_game_in_libraries(steam_id: str, libraries: list[Path]) -> Optional[Path]:
    """Search a specific list of steamapps dirs for a game manifest."""
    for steamapps in libraries:
        manifest = steamapps / f"appmanifest_{steam_id}.acf"
        if manifest.exists():
            installdir = _find_installdir_from_manifest(manifest)
            if installdir:
                game_path = steamapps / "common" / installdir
                if game_path.exists():
                    return game_path
    return None


def game_steam_id(game_path: str | Path) -> Optional[str]:
    """Try to determine the Steam App ID for a game path by scanning libraryfolders."""
    game = Path(game_path)
    for steamapps in find_steam_steamapps_dirs():
        common = steamapps / "common"
        if not common.exists():
            continue
        for manifest in steamapps.glob("appmanifest_*.acf"):
            installdir = _find_installdir_from_manifest(manifest)
            if installdir:
                candidate = common / installdir
                if candidate.resolve() == game.resolve():
                    return _parse_acf_field(manifest.read_text(encoding="utf-8", errors="replace"), "appid")
        game_str = str(game).lower()
        for manifest in steamapps.glob("appmanifest_*.acf"):
            text = manifest.read_text(encoding="utf-8", errors="replace")
            installdir = _parse_acf_field(text, "installdir")
            if installdir and installdir.lower() in game_str:
                return _parse_acf_field(text, "appid")
    return None


# ── Internal helpers ──────────────────────────────────────────────────────────


def _parse_acf_field(text: str, field: str) -> Optional[str]:
    m = re.search(rf'"{field}"\s+"([^"]*)"', text)
    return m.group(1) if m else None


def _find_installdir_from_manifest(manifest_path: Path) -> Optional[str]:
    try:
        text = manifest_path.read_text(encoding="utf-8", errors="replace")
        return _parse_acf_field(text, "installdir")
    except OSError:
        return None


# ── Re-export from submodules ─────────────────────────────────────────────────

from .proton import (  # noqa: E402, F401
    find_proton_for_game,
    find_any_installed_proton,
    find_prefix,
    list_installed_proton,
    find_steam_root_for_proton_script,
    proton_run_command,
    _own_process_in_steam_flatpak,
    _proton_in_steam_flatpak,
)

from .utils import (  # noqa: E402, F401
    find_wine,
    _normalize_tool_name,
)
