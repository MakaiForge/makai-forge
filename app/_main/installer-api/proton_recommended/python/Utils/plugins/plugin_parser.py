"""plugin_parser.py — Parse ESP/ESM/ESL plugin headers to extract masters and metadata.

Port of ModSanity's parser.rs — reads TES4/TES5 record headers from Bethesda plugin files.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PluginHeader:
    signature: str = ""
    flags: int = 0
    is_master: bool = False
    is_light: bool = False
    masters: list[str] = field(default_factory=list)
    description: str | None = None
    author: str | None = None


FLAG_MASTER = 0x00000001
FLAG_LIGHT = 0x00000200


def parse_plugin_header(path: str | Path) -> PluginHeader | None:
    """Parse a plugin file and return its header, or None on failure."""
    try:
        with open(path, "rb") as f:
            return _parse(f)
    except Exception:
        return None


def _parse(f) -> PluginHeader:
    header = PluginHeader()

    sig = f.read(4)
    header.signature = sig.decode("ascii", errors="replace")

    if header.signature not in ("TES4", "TES5", "TES3"):
        return header

    data_size = struct.unpack("<I", f.read(4))[0]
    flags = struct.unpack("<I", f.read(4))[0]
    header.flags = flags
    header.is_master = bool(flags & FLAG_MASTER)
    header.is_light = bool(flags & FLAG_LIGHT)

    # Skip form ID (4) + version info (4) = 8 bytes
    f.read(8)

    end_pos = f.tell() + data_size

    while f.tell() < end_pos:
        sub_type = f.read(4)
        if len(sub_type) < 4:
            break
        sub_tag = sub_type.decode("ascii", errors="replace")

        sub_size = struct.unpack("<H", f.read(2))[0]
        data = f.read(sub_size)

        if sub_tag == "MAST":
            master = data.split(b"\x00")[0].decode("ascii", errors="replace")
            header.masters.append(master)
        elif sub_tag == "SNAM":
            header.description = data.split(b"\x00")[0].decode("utf-8", errors="replace")
        elif sub_tag == "CNAM":
            header.author = data.split(b"\x00")[0].decode("utf-8", errors="replace")

    return header


def scan_plugins(data_dir: str | Path) -> list[dict]:
    """Scan a game's Data directory for plugins and return their info."""
    data_dir = Path(data_dir)
    if not data_dir.is_dir():
        return []

    plugins = []
    for f in data_dir.iterdir():
        if f.suffix.lower() in (".esp", ".esm", ".esl"):
            header = parse_plugin_header(f)
            plugins.append({
                "filename": f.name,
                "is_master": header.is_master if header else f.suffix.lower() == ".esm",
                "is_light": header.is_light if header else f.suffix.lower() == ".esl",
                "masters": header.masters if header else [],
            })
    return plugins
