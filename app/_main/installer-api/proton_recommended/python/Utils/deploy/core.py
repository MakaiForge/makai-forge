"""deploy/core.py — Deploy, restore, undeploy, conflict detection, plugins.txt."""

import os
import shutil
import stat
import sys
from pathlib import Path
from typing import Optional

from .types import (
    ModInventory, DeploymentResult, LinkMode,
    ROOT_PLUGIN_EXTS, GAME_LOCAL_DIR_MAP, BETTHESDA_GAME_TYPES,
)
from .inventory import inventory_mod, build_filemap, _strip_data_prefix
from .archive import extract_archive


# ── Prefix Helpers ───────────────────────────────────────────────────────────

def find_prefix_username(prefix_path: str | Path) -> str | None:
    """Detect the real Windows username inside a Wine/Proton prefix.

    Reads ``drive_c/users/`` and returns the first non-system directory.
    Falls back to parsing ``user.reg`` if the directory is ambiguous.
    """
    users_dir = Path(prefix_path) / "drive_c" / "users"
    if not users_dir.is_dir():
        return None

    skip = {"public", "default", "all users", "default user"}
    candidates = [d.name for d in users_dir.iterdir()
                  if d.is_dir() and d.name.lower() not in skip]
    if len(candidates) == 1:
        return candidates[0]

    # Ambiguous — try user.reg for the Shell Folders path
    user_reg = Path(prefix_path) / "user.reg"
    if user_reg.is_file():
        import re
        text = user_reg.read_text("utf-8", errors="replace")
        m = re.search(r'"AppData"=str\(2\):"C:\\\\users\\\\([^\\\\]+)\\\\', text)
        if m:
            return m.group(1)
        # Fallback: find any user under Software\Microsoft\Windows\CurrentVersion
        m = re.search(r'\[Software\\\\Microsoft\\\\Windows\\\\CurrentVersion', text)
        if m:
            for c in candidates:
                if c.lower() not in skip:
                    return c

    return candidates[0] if candidates else None


# ── File System Helpers ──────────────────────────────────────────────────────

def _remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _transfer(src: Path, dst: Path, mode: str = LinkMode.SYMLINK) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if mode == LinkMode.COPY:
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        shutil.copy2(str(src), str(dst))
    elif mode == LinkMode.HARDLINK:
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        os.link(str(src), str(dst))
    else:
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        os.symlink(str(src), str(dst))


def _do_link(src: str, dst: str, mode: str = LinkMode.SYMLINK) -> Optional[OSError]:
    try:
        _transfer(Path(src), Path(dst), mode)
    except OSError as e:
        return e
    return None


# ── Plugin Conflict Detection ─────────────────────────────────────────────────

def detect_plugin_conflicts(
    modlist: list[dict],
    staging_dir: str | Path,
) -> list[dict]:
    """Detect plugin conflicts across enabled mods.

    Returns list of conflicts: {plugin, relative_path, mods: [{name, priority}], winner}
    """
    staging = Path(staging_dir)
    plugin_map: dict[str, list[dict]] = {}

    for m in modlist:
        if not m.get("enabled") or m.get("is_separator"):
            continue
        mod_name = m["name"]
        priority = m.get("priority", 0)
        mod_staging = staging / mod_name
        if not mod_staging.exists():
            continue

        for entry in mod_staging.rglob("*"):
            if not entry.is_file():
                continue
            ext = entry.suffix.lower()
            if ext in ROOT_PLUGIN_EXTS:
                rel = str(entry.relative_to(mod_staging))
                name = entry.name
                if name not in plugin_map:
                    plugin_map[name] = []
                plugin_map[name].append({
                    "name": mod_name,
                    "priority": priority,
                    "relative_path": rel,
                })

    conflicts: list[dict] = []
    for plugin_name, mods in plugin_map.items():
        if len(mods) > 1:
            winner = max(mods, key=lambda x: x["priority"])
            conflicts.append({
                "plugin": plugin_name,
                "relative_path": mods[0]["relative_path"],
                "mods": mods,
                "winner": winner["name"],
                "type": "plugin",
            })

    conflicts.sort(key=lambda c: c["plugin"])
    return conflicts


# ── plugins.txt Writer ────────────────────────────────────────────────────────

def write_plugins_txt(plugins_txt_path: str | Path, plugin_entries: list[dict]) -> bool:
    """Write plugins.txt in the expected format for Bethesda games."""
    try:
        path = Path(plugins_txt_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        lines: list[str] = []
        for entry in plugin_entries:
            enabled = entry.get("enabled", True)
            name = entry["name"]
            if enabled:
                lines.append(f"{name}\n")
            else:
                lines.append(f"*{name}\n")
        path.write_text("".join(lines), encoding="utf-8")
        return True
    except OSError as e:
        print(f"Failed to write plugins.txt: {e}", file=sys.stderr)
        return False


# ── Deploy / Undeploy / Restore ───────────────────────────────────────────────

def get_staging_dir(game_id: str, base_dir: str | Path | None = None) -> Path:
    """Get the staging directory path for a game."""
    base = Path(base_dir) if base_dir else Path.home() / ".config" / "protonforge" / "staging"
    return base / game_id


def undeploy_mod(
    game_path: str | Path,
    staging_dir: str | Path,
    mod_name: str,
) -> tuple[int, list[str]]:
    """Remove symlinks created by a specific mod from the game's Data directory."""
    log: list[str] = []
    staging = Path(staging_dir) / mod_name
    data_dir = Path(game_path) / "Data"
    if not staging.exists() or not data_dir.exists():
        return 0, log

    count = 0
    for entry in staging.rglob("*"):
        if not entry.is_file():
            continue
        raw_relative = str(entry.relative_to(staging))
        relative = _strip_data_prefix(raw_relative)
        target = data_dir / relative

        try:
            if target.is_symlink():
                link_target = os.readlink(str(target))
                if link_target == str(entry):
                    target.unlink()
                    count += 1
        except OSError:
            pass

    return count, log


def _get_plugins_txt_path(
    game_id: str,
    profile_dir: str | Path,
    proton_prefix: str | Path | None,
) -> Path | None:
    """Compute the correct plugins.txt path.

    Priority:
    1. If a real Proton prefix is available: detect its username and build
       the path inside the prefix (e.g.
       ``<prefix>/drive_c/users/<real_user>/AppData/Local/<game>/plugins.txt``).
    2. Fallback to the old ``profile_dir`` path.
    """
    game_local = GAME_LOCAL_DIR_MAP.get(game_id, game_id)

    if proton_prefix:
        prefix = Path(proton_prefix)
        username = find_prefix_username(prefix)
        if username:
            return prefix / "drive_c" / "users" / username / "AppData" / "Local" / game_local / "plugins.txt"
        # prefix exists but no user found — fall through

    return Path(profile_dir, "drive_c", "users", "steamuser", "AppData", "Local", game_local, "plugins.txt")


def _get_loot_game_type(game_id: str) -> str:
    """Look up the loot_game_type for a game ID via game_loader."""
    try:
        from Games.game_loader import get_game_by_id
        handler = get_game_by_id(game_id)
        if handler:
            return handler.loot_game_type
    except Exception:
        pass
    return ""


def deploy(
    game_path: str | Path,
    staging_dir: str | Path,
    profile_dir: str | Path,
    game_id: str,
    modlist: list[dict],
    link_mode: str = LinkMode.SYMLINK,
    proton_prefix: str | Path | None = None,
) -> DeploymentResult:
    """Full deployment pipeline: filemap → force-copy SE → symlink → plugins.txt."""
    log: list[str] = []
    log.append(f"Starting deploy for {game_id}")

    game = Path(game_path)
    staging = Path(staging_dir)
    data_dir = game / "Data"

    if not game.exists():
        return DeploymentResult(success=False, log=[*log, "Game path not found"], filemap={})

    modlist_enabled = [m for m in modlist if m.get("enabled") and not m.get("is_separator")]
    log.append(f"{len(modlist_enabled)} mods enabled")

    conflicts = detect_plugin_conflicts(modlist_enabled, staging)
    critical = [c for c in conflicts if c.get("type") == "plugin"]
    if critical:
        log.append(f"WARNING: {len(critical)} plugin conflict(s) detected:")
        for c in critical:
            names = " vs ".join(m["name"] for m in c["mods"])
            log.append(f"  {c['relative_path']} — {names}")
            log.append(f"  Winner: {c['winner']} (priority wins)")
    if conflicts:
        log.append(f"Total conflicts: {len(conflicts)} ({len(critical)} critical)")

    filemap = build_filemap(modlist, staging, game_path)
    log.append(f"Built filemap with {len(filemap)} entries")

    se_copied = 0
    for m in modlist_enabled:
        inv = inventory_mod(staging, m["name"])
        if not inv.script_extender_files:
            continue
        for se_file in inv.script_extender_files:
            stripped = _strip_data_prefix(se_file.relative_path)
            source = staging / m["name"] / se_file.relative_path
            target = game / stripped
            if not source.exists():
                continue
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    target.unlink()
                shutil.copy2(str(source), str(target))
                se_copied += 1
            except OSError as e:
                log.append(f"Failed to force-copy SE {se_file.relative_path}: {e}")
    if se_copied:
        log.append(f"Force-copied {se_copied} script extender files to game root")

    pre_existing: dict[str, str] = {}
    if data_dir.exists():
        for entry in data_dir.rglob("*"):
            if entry.is_symlink():
                try:
                    target = os.readlink(str(entry))
                    pre_existing[str(entry.relative_to(data_dir))] = target
                except OSError:
                    pass
    log.append(f"Saved manifest: {len(pre_existing)} pre-existing symlinks")

    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        symlinks_created = 0

        for relative_path, source_path in filemap.items():
            target = data_dir / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)

            err = _do_link(source_path, str(target), link_mode)
            if err:
                log.append(f"Failed to link {relative_path}: {err}")
            else:
                symlinks_created += 1

        # ── plugins.txt (Bethesda games only) ─────────────────────────────
        loot_type = _get_loot_game_type(game_id)
        if loot_type and loot_type in BETTHESDA_GAME_TYPES:
            plugin_exts = {".esp", ".esm", ".esl"}
            plugin_names: list[str] = []
            for rel_path in filemap:
                ext = Path(rel_path).suffix.lower()
                if ext in plugin_exts:
                    plugin_names.append(Path(rel_path).name)

            def _sort_key(name: str) -> tuple[int, str]:
                if name.lower().endswith(".esm"):
                    return (0, name.lower())
                elif name.lower().endswith(".esl"):
                    return (2, name.lower())
                return (1, name.lower())

            sorted_plugins = sorted(plugin_names, key=_sort_key)
            plugin_entries = [{"name": p, "enabled": True} for p in sorted_plugins]

            plugins_txt_path = _get_plugins_txt_path(game_id, profile_dir, proton_prefix)
            if plugins_txt_path:
                if write_plugins_txt(plugins_txt_path, plugin_entries):
                    log.append(f"Wrote plugins.txt ({plugins_txt_path}) with {len(plugin_entries)} entries")
                else:
                    log.append("Failed to write plugins.txt")
        else:
            log.append(f"Skipped plugins.txt (non-Bethesda game: {loot_type or 'none'})")

        log.append(f"Deploy complete: {symlinks_created} links created")
        return DeploymentResult(success=True, log=log, filemap=filemap)

    except Exception as err:
        log.append(f"Deploy failed: {err}. Rolling back...")
        for relative_path in filemap:
            target = data_dir / relative_path
            try:
                if target.is_symlink():
                    target.unlink()
            except OSError:
                pass
        for rel_path, link_target in pre_existing.items():
            target = data_dir / rel_path
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                os.symlink(link_target, str(target))
            except OSError:
                pass
        log.append(f"Rollback complete: {len(pre_existing)} symlinks restored")
        return DeploymentResult(success=False, log=log, filemap={})


def restore(game_path: str | Path) -> int:
    """Remove all symlinks from the game's Data directory."""
    data_dir = Path(game_path) / "Data"
    if not data_dir.exists():
        return 0

    count = 0
    for entry in list(data_dir.rglob("*")):
        try:
            if entry.is_symlink():
                entry.unlink()
                count += 1
            elif entry.is_dir() and not entry.is_symlink():
                try:
                    remaining = list(entry.iterdir())
                    if not remaining:
                        entry.rmdir()
                except OSError:
                    pass
        except OSError:
            pass

    return count


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import json
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

    if cmd == "inventory":
        _, staging_dir, mod_name, *_ = sys.argv[1:]
        inv = inventory_mod(staging_dir, mod_name)
        print(json.dumps({
            "mod_name": inv.mod_name, "file_count": len(inv.files),
            "plugin_files": inv.plugin_files, "has_fomod": inv.has_fomod,
            "script_extender_files": [f.relative_path for f in inv.script_extender_files],
        }, indent=2))
    elif cmd == "detect":
        _, staging_dir, *_ = sys.argv[1:]
        print(json.dumps(detect_mod_type(staging_dir), indent=2))
    elif cmd == "extract":
        _, archive, dest, *_ = sys.argv[1:]
        result = extract_archive(archive, dest)
        print(f"Extracted {len(result)} files")
    elif cmd == "deploy":
        _, game_path, staging_dir, profile_dir, game_id, modlist_json, *_ = sys.argv[1:]
        modlist = json.loads(modlist_json)
        result = deploy(game_path, staging_dir, profile_dir, game_id, modlist)
        print(json.dumps({"success": result.success, "log": result.log, "filemap_count": len(result.filemap)}, indent=2))
    elif cmd == "restore":
        _, game_path, *_ = sys.argv[1:]
        count = restore(game_path)
        print(f"Restored: {count} symlinks removed")
    else:
        print("Commands: inventory, detect, extract, deploy, restore")


if __name__ == "__main__":
    main()
