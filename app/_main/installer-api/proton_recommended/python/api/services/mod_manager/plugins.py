from __future__ import annotations

from pathlib import Path

from Utils.plugins import (
    PluginEntry as AmethystPluginEntry,
    read_plugins as amethyst_read_plugins,
    write_plugins as amethyst_write_plugins,
    read_loadorder as amethyst_read_loadorder,
    write_loadorder as amethyst_write_loadorder,
)


def read(path: str, star_prefix: bool = True) -> list[dict]:
    entries = amethyst_read_plugins(Path(path), star_prefix=star_prefix)
    return [
        {"name": e.name, "enabled": e.enabled}
        for e in entries
    ]


def write(path: str, entries: list[dict], star_prefix: bool = True) -> bool:
    plugin_entries = [
        AmethystPluginEntry(name=e["name"], enabled=e["enabled"])
        for e in entries
    ]
    amethyst_write_plugins(Path(path), plugin_entries, star_prefix=star_prefix)
    return True


def read_loadorder(path: str) -> list[str]:
    return amethyst_read_loadorder(Path(path))


def write_loadorder(path: str, entries: list[str]) -> bool:
    amethyst_write_loadorder(Path(path), entries)
    return True
