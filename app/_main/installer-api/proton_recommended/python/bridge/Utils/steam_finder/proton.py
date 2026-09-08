"""steam_finder/proton.py — Proton tool detection, prefix finding, and execution."""

import json
import re
import shutil
import subprocess as sp
import sys
from pathlib import Path
from typing import Optional

from . import find_steam_steamapps_dirs, _find_installdir_from_manifest


def find_proton_for_game(steam_id: str, compat_tool: Optional[str] = None) -> Optional[str]:
    """Find the Proton binary path for a given Steam game.

    Args:
        steam_id: Steam App ID.
        compat_tool: Optional override (e.g. "proton_experimental", "GE-Proton9-25").
                     If None, reads from config.vdf or uses Steam Linux Runtime.

    Returns:
        Absolute path to the Proton binary, or None.
    """
    for steamapps in find_steam_steamapps_dirs():
        steam_root = steamapps.parent
        compat_data = steam_root / "compatibilitytools.d"
        if not compat_data.exists():
            compat_data = steam_root.parent.parent / "compatibilitytools.d"
        if not compat_data.exists():
            continue

        if compat_tool:
            tool_dir = compat_data / compat_tool
            for candidate in ["proton", "protonfixes", f"{compat_tool}"]:
                proton_bin = tool_dir / candidate
                if proton_bin.exists():
                    return str(proton_bin)

        for tool_dir in compat_data.iterdir():
            if not tool_dir.is_dir():
                continue
            for candidate in ["proton", "protonfixes", tool_dir.name]:
                proton_bin = tool_dir / candidate
                if proton_bin.exists():
                    return str(proton_bin)

    # Fallback: check embedded Proton in Steam
    for steamapps in find_steam_steamapps_dirs():
        steam_root = steamapps.parent
        # Steam ships Proton in steamapps/common/Proton <version>
        proton_dirs = list((steam_root / "steamapps" / "common").glob("Proton*"))
        proton_dirs.sort(key=_proton_sort_key, reverse=True)
        for proton_dir in proton_dirs:
            proton_bin = proton_dir / "proton"
            if proton_bin.exists():
                return str(proton_bin)

    return None


def find_any_installed_proton() -> Optional[str]:
    """Find the 'best' Proton installation available on the system.

    Priority: GE-Proton → Proton Experimental → Proton Next → Latest numbered Proton.
    """
    candidates: list[tuple[str, str, int]] = []
    dirnames_seen: set[str] = set()

    for steamapps in find_steam_steamapps_dirs():
        steam_root = steamapps.parent

        # compatibilitytools.d
        compat = steam_root / "compatibilitytools.d"
        if not compat.exists():
            compat = steam_root.parent.parent / "compatibilitytools.d"
        if compat.exists():
            for tool in compat.iterdir():
                if not tool.is_dir() or tool.name in dirnames_seen:
                    continue
                dirnames_seen.add(tool.name)
                proton_bin = tool / "proton"
                if proton_bin.exists():
                    priority = _proton_priority(tool.name)
                    candidates.append((priority, str(proton_bin), tool.stat().st_mtime))

        # Built-in Proton versions
        common_dir = steam_root / "steamapps" / "common"
        if common_dir.exists():
            pdirs = list(common_dir.glob("Proton*"))
            pdirs.sort(key=_proton_sort_key, reverse=True)
            for pdir in pdirs:
                if pdir.name in dirnames_seen:
                    continue
                dirnames_seen.add(pdir.name)
                proton_bin = pdir / "proton"
                if proton_bin.exists():
                    candidates.append((_proton_priority(pdir.name), str(proton_bin), pdir.stat().st_mtime))

    if not candidates:
        return None
    candidates.sort(key=lambda x: (-x[0], -x[2]))
    return candidates[0][1]


def find_prefix(steam_id: str) -> Optional[str]:
    """Find the Proton prefix (compatdata) path for a given Steam App ID."""
    for steamapps in find_steam_steamapps_dirs():
        compatdata = steamapps.parent / "compatdata" / steam_id
        if compatdata.exists() and (compatdata / "pfx").exists():
            return str(compatdata / "pfx")
        if compatdata.exists():
            return str(compatdata)
    return None


def list_installed_proton() -> list[dict]:
    """List all installed Proton tools with name and path."""
    proton_tools: list[dict] = []
    seen: set[str] = set()

    for steamapps in find_steam_steamapps_dirs():
        steam_root = steamapps.parent

        # compatibilitytools.d
        compat = steam_root / "compatibilitytools.d"
        if not compat.exists():
            compat = steam_root.parent.parent / "compatibilitytools.d"
        if compat.exists():
            for pdir in compat.iterdir():
                if not pdir.is_dir() or pdir.name in seen:
                    continue
                seen.add(pdir.name)
                proton_bin = pdir / "proton"
                if proton_bin.exists():
                    proton_tools.append({"name": pdir.name, "path": str(proton_bin)})

        # Embedded Proton versions
        common_dir = steam_root / "steamapps" / "common"
        if common_dir.exists():
            for pdir in common_dir.glob("Proton*"):
                if pdir.name in seen:
                    continue
                seen.add(pdir.name)
                proton_bin = pdir / "proton"
                if proton_bin.exists():
                    proton_tools.append({"name": pdir.name, "path": str(proton_bin)})

    proton_tools.sort(key=lambda x: _proton_sort_key(x["name"]), reverse=True)
    return proton_tools


def find_steam_root_for_proton_script(proton_script_path: str) -> Optional[str]:
    """Given a proton script path, determine the Steam root."""
    p = Path(proton_script_path).resolve()
    # e.g. /path/to/steam/steamapps/common/Proton 8.0/proton -> /path/to/steam
    for parent in p.parents:
        contents = set(parent.iterdir()) if parent.exists() else set()
        if (parent / "steam.sh").exists() or (parent / "steam").exists():
            return str(parent)
        if any(x.name.startswith("steam") for x in contents):
            return str(parent)
    return None


def _own_process_in_steam_flatpak() -> bool:
    """Check if we are running inside Steam Flatpak runtime."""
    return "FLATPAK_ID" in sp.os.environ or "STEAM_FLATPAK" in sp.os.environ or "STEAM_RUNTIME" in sp.os.environ


def _proton_in_steam_flatpak(proton_script_path: str) -> bool:
    """Check if the given proton script is inside Steam Flatpak."""
    flatpak_steam = Path.home() / ".var" / "app" / "com.valvesoftware.Steam"
    proton_path = Path(proton_script_path).resolve()
    try:
        proton_path.relative_to(flatpak_steam)
        return True
    except ValueError:
        return False


def proton_run_command(
    proton_script: str,
    steam_id: str,
    program_args: list[str],
    env: Optional[dict[str, str]] = None,
) -> Optional[int]:
    """Run a program with Proton, returning exit code.

    Equivalent to: <proton_script> run <steam_id> <program> [args...]
    or: STEAM_COMPAT_DATA_PATH=<compatdata> <proton_script> runinprefix <program> [args...]
    """
    prefix = find_prefix(steam_id)
    if not prefix:
        print(f"Prefix not found for {steam_id}", file=sys.stderr)
        return None

    # Check for umu-run (preferred)
    umu = shutil.which("umu-run") or shutil.which("umu")
    proton_path = Path(proton_script)

    run_env = {
        "STEAM_COMPAT_DATA_PATH": str(Path(prefix).parent),
        "STEAM_COMPAT_CLIENT_INSTALL_PATH": str(Path(proton_script).parent),
    }
    if env:
        run_env.update(env)

    if umu:
        cmd = [umu] + program_args
    elif proton_path.exists():
        cmd = [proton_script, "runinprefix"] + program_args
    else:
        print(f"Proton script not found: {proton_script}", file=sys.stderr)
        return None

    try:
        result = sp.run(cmd, env={**sp.os.environ, **run_env}, capture_output=False, timeout=3600)
        return result.returncode
    except sp.TimeoutExpired:
        print("Proton command timed out", file=sys.stderr)
        return None
    except OSError as e:
        print(f"Failed to run Proton: {e}", file=sys.stderr)
        return None


# ── Internal helpers ──────────────────────────────────────────────────────────

def _proton_sort_key(name: str) -> tuple:
    parts = re.findall(r"(\d+|[a-zA-Z]+)", name.replace("-", " ").replace("_", " "))
    keys: list = []
    for p in parts:
        try:
            keys.append((0, int(p)))
        except ValueError:
            keys.append((1, p.lower()))
    return tuple(keys)


def _proton_priority(name: str) -> int:
    lower = name.lower()
    if "ge" in lower or "glorious" in lower:
        return 5
    if "experimental" in lower:
        return 4
    if "next" in lower:
        return 3
    if "hotfix" in lower:
        return 2
    return 1
