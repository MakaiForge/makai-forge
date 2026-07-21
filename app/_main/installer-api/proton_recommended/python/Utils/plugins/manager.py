"""plugins.py — Read, write, cache, sync, and prune plugin lists.

Two formats:
  star_prefix=True  (MO2-style — Fallout 4, Skyrim SE, Starfield):
    *PluginName.esp   — enabled
    PluginName.esp    — disabled
  star_prefix=False (legacy — Fallout 3/NV, Oblivion, Skyrim LE):
    PluginName.esp    — enabled (disabled omitted from the file entirely)
    loadorder.txt     — full known plugin set (source of truth for disabled state)

Mirrors Amethyst plugins.py (583L) — cache, normalisation, prune, sync.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass
class PluginEntry:
    name: str
    enabled: bool = True


# ── Mtime-keyed parse cache ──────────────────────────────────────────────────

_plugins_cache: dict[tuple[str, bool], tuple[float, tuple[tuple[str, bool], ...]]] = {}
_loadorder_cache: dict[str, tuple[float, tuple[str, ...]]] = {}


def invalidate_cache(path: Path | None = None) -> None:
    if path is None:
        _plugins_cache.clear()
        _loadorder_cache.clear()
        return
    p = str(path)
    _plugins_cache.pop((p, True), None)
    _plugins_cache.pop((p, False), None)
    _loadorder_cache.pop(p, None)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalise_ext(name: str) -> str:
    """Lowercase file extension only (e.g. Mod.ESP → Mod.esp)."""
    dot = name.rfind(".")
    return name[:dot] + name[dot:].lower() if dot >= 0 else name


def _read_with_cache(path: Path, star_prefix: bool) -> list[tuple[str, bool]]:
    """Read plugins.txt, parse entries, cache by mtime."""
    if not path.is_file():
        return []
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0
    key = (str(path), star_prefix)
    cached = _plugins_cache.get(key)
    if cached is not None and cached[0] == mtime:
        return list(cached[1])
    parsed: list[tuple[str, bool]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        if star_prefix:
            if line.startswith("*"):
                parsed.append((_normalise_ext(line[1:]), True))
            else:
                parsed.append((_normalise_ext(line), False))
        else:
            parsed.append((_normalise_ext(line), True))
    if mtime:
        _plugins_cache[key] = (mtime, tuple(parsed))
    return parsed


# ── Public API ───────────────────────────────────────────────────────────────

def read_plugins(path: Path, star_prefix: bool = True) -> list[PluginEntry]:
    """Parse plugins.txt, return entries in file order. Cached by mtime."""
    return [PluginEntry(name=n, enabled=e) for n, e in _read_with_cache(path, star_prefix)]


def write_plugins(path: Path, entries: list[PluginEntry], star_prefix: bool = True) -> None:
    """Write entries to plugins.txt. Updates cache to keep reads coherent."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if star_prefix:
        lines = [f"*{e.name}" if e.enabled else e.name for e in entries]
    else:
        lines = [e.name for e in entries if e.enabled]
    text = "\n".join(lines) + ("\n" if lines else "")
    path.write_text(text, encoding="utf-8")
    # Warm both star_prefix variants of the cache
    try:
        mtime = path.stat().st_mtime
        star = tuple((_normalise_ext(e.name), e.enabled) for e in entries)
        _plugins_cache[(str(path), True)] = (mtime, star)
        legacy = tuple((_normalise_ext(e.name), True) for e in entries if e.enabled)
        _plugins_cache[(str(path), False)] = (mtime, legacy)
    except OSError:
        _plugins_cache.pop((str(path), True), None)
        _plugins_cache.pop((str(path), False), None)


def read_loadorder(path: Path) -> list[str]:
    """Read loadorder.txt — one bare filename per line. Cached by mtime."""
    if not path.is_file():
        return []
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0
    key = str(path)
    cached = _loadorder_cache.get(key)
    if cached is not None and cached[0] == mtime:
        return list(cached[1])
    names: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            names.append(line)
    if mtime:
        _loadorder_cache[key] = (mtime, tuple(names))
    return names


def write_loadorder(path: Path, entries: list[PluginEntry]) -> None:
    """Write bare filenames to loadorder.txt."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [e.name for e in entries]
    text = "\n".join(lines) + ("\n" if lines else "")
    path.write_text(text, encoding="utf-8")
    try:
        _loadorder_cache[str(path)] = (path.stat().st_mtime, tuple(lines))
    except OSError:
        _loadorder_cache.pop(str(path), None)


def append_plugin(
    path: Path, plugin_name: str, enabled: bool = True, star_prefix: bool = True,
) -> None:
    """Append a plugin to plugins.txt if not already present (case-insensitive)."""
    entries = read_plugins(path, star_prefix=star_prefix)
    if plugin_name.lower() in {e.name.lower() for e in entries}:
        return
    entries.append(PluginEntry(name=plugin_name, enabled=enabled))
    write_plugins(path, entries, star_prefix=star_prefix)


def sort_plugins(entries: list[PluginEntry]) -> list[PluginEntry]:
    """Sort plugins: ESM first, then ESP, then ESL, alphabetical within."""
    def sort_key(e: PluginEntry) -> tuple[int, str]:
        low = e.name.lower()
        if low.endswith(".esm"):
            return (0, low)
        elif low.endswith(".esl"):
            return (2, low)
        return (1, low)
    return sorted(entries, key=sort_key)


# ── Prune ────────────────────────────────────────────────────────────────────

def prune_plugins_from_filemap(
    filemap: dict[str, str],
    plugins_path: Path,
    plugin_extensions: set[str],
    data_dir: Path | None = None,
    star_prefix: bool = True,
) -> int:
    """Remove plugins.txt entries whose file is no longer in the filemap.

    Plugins physically present in data_dir are always kept (vanilla game files).
    Returns count of removed entries.
    """
    if not plugin_extensions:
        return 0
    exts = {e.lower() for e in plugin_extensions}

    in_filemap = {
        Path(p).name.lower() for p in filemap
        if "/" not in p and Path(p).suffix.lower() in exts
    }

    in_data: set[str] = set()
    if data_dir and data_dir.is_dir():
        for entry in data_dir.iterdir():
            if entry.is_file() and entry.suffix.lower() in exts:
                in_data.add(entry.name.lower())

    keep = in_filemap | in_data
    existing = read_plugins(plugins_path, star_prefix=star_prefix)
    kept = [e for e in existing if e.name.lower() in keep]
    removed = len(existing) - len(kept)
    if removed:
        write_plugins(plugins_path, kept, star_prefix=star_prefix)
    return removed


# ── Sync ─────────────────────────────────────────────────────────────────────

def sync_plugins_from_filemap(
    filemap: dict[str, str],
    plugins_path: Path,
    plugin_extensions: set[str],
    disabled_plugins: dict[str, list[str]] | None = None,
    star_prefix: bool = True,
) -> int:
    """Add new root-level plugins from filemap to plugins.txt.

    Returns count of added plugins.
    """
    if not plugin_extensions:
        return 0
    exts = {e.lower() for e in plugin_extensions}

    existing = read_plugins(plugins_path, star_prefix=star_prefix)
    known = {e.name.lower() for e in existing}

    new_entries: list[PluginEntry] = []
    for rel_path, mod_name in filemap.items():
        if "/" in rel_path:
            continue
        low = rel_path.lower()
        if Path(rel_path).suffix.lower() not in exts:
            continue
        if low in known:
            continue
        if disabled_plugins:
            disabled = {n.lower() for n in disabled_plugins.get(mod_name, [])}
            if low in disabled:
                continue
        stem = Path(rel_path).stem
        ext = Path(rel_path).suffix.lower()
        normalised = stem + ext
        new_entries.append(PluginEntry(name=normalised, enabled=True))
        known.add(normalised.lower())

    if new_entries:
        write_plugins(plugins_path, existing + new_entries, star_prefix=star_prefix)
    return len(new_entries)


def sync_plugins_combined(
    filemap: dict[str, str],
    plugins_path: Path,
    plugin_extensions: set[str],
    data_dir: Path | None = None,
    disabled_plugins: dict[str, list[str]] | None = None,
    star_prefix: bool = True,
) -> tuple[int, int]:
    """Single-pass prune + sync: remove orphans, add new plugins.

    Returns (removed_count, added_count).
    """
    if not plugin_extensions:
        return 0, 0
    exts = {e.lower() for e in plugin_extensions}

    # 1. Filemap root-level plugin names
    filemap_lower: dict[str, str] = {}
    filemap_mod: dict[str, str] = {}
    for rel_path, mod_name in filemap.items():
        if "/" in rel_path:
            continue
        if Path(rel_path).suffix.lower() not in exts:
            continue
        low = rel_path.lower()
        if low not in filemap_lower:
            filemap_lower[low] = rel_path
            filemap_mod[low] = mod_name

    # 2. Vanilla plugins from Data dir are always kept
    in_data: set[str] = set()
    if data_dir and data_dir.is_dir():
        for entry in data_dir.iterdir():
            if entry.is_file() and entry.suffix.lower() in exts:
                in_data.add(entry.name.lower())

    # 3. Disabled plugins
    disabled: set[str] = set()
    if disabled_plugins:
        for mod_name, names in disabled_plugins.items():
            for n in names:
                disabled.add(n.lower())

    # 4. Read once
    existing = read_plugins(plugins_path, star_prefix=star_prefix)
    existing_lower = {e.name.lower() for e in existing}

    known = set(existing_lower)
    if not star_prefix:
        known.update(n.lower() for n in read_loadorder(plugins_path.parent / "loadorder.txt"))

    # 5. Prune
    keep = set(filemap_lower.keys()) | in_data
    kept = [e for e in existing if e.name.lower() in keep]
    removed = len(existing) - len(kept)

    # 6. Add
    kept_lower = {e.name.lower() for e in kept}
    new: list[PluginEntry] = []
    for low, original in filemap_lower.items():
        if low in known or low in disabled:
            continue
        dot = original.rfind(".")
        normalised = original[:dot] + original[dot:].lower() if dot >= 0 else original
        new.append(PluginEntry(name=normalised, enabled=True))
        known.add(low)

    if removed or new:
        write_plugins(plugins_path, kept + new, star_prefix=star_prefix)

    return removed, len(new)
