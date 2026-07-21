from __future__ import annotations
import re
from pathlib import Path
from typing import Any


def parse_modlist(filepath: str | Path) -> list[dict[str, Any]]:
    """Parse an MO2 modlist.txt into structured mod entries."""
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"modlist.txt not found: {path}")

    text = path.read_text("utf-8", errors="replace")
    entries: list[dict[str, Any]] = []
    last_entry_idx: int = -1

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # Check indentation for optional files (attached to previous mod entry)
        indent = len(line) - len(line.lstrip())
        if indent > 0 and last_entry_idx >= 0:
            opt_name = stripped.lstrip("+-").strip()
            entries[last_entry_idx].setdefault("optional_files", []).append({
                "name": opt_name,
                "enabled": stripped.startswith("+") or stripped.startswith("*"),
            })
            continue

        # Separator: "*--- SeparatorName" or "--- SeparatorName"
        sep_match = re.match(r"^[\*\-\+]\s*-{2,}\s*(.+)", stripped)
        if sep_match:
            entries.append({
                "name": sep_match.group(1).strip(),
                "enabled": stripped.startswith("*"),
                "is_separator": True,
                "optional_files": [],
            })
            last_entry_idx = len(entries) - 1
            continue

        # Regular mod entry
        enabled = stripped.startswith("*")
        name = stripped.lstrip("*-+").strip()
        entries.append({
            "name": name,
            "enabled": enabled,
            "is_separator": False,
            "optional_files": [],
        })
        last_entry_idx = len(entries) - 1

    return entries


def match_mods_to_staging(
    modlist_entries: list[dict[str, Any]],
    staging_dir: str | Path,
) -> list[dict[str, Any]]:
    """Match modlist entries to actual mod folders in staging dir.

    Returns entries with matched staging folder name (or None if not found).
    """
    staging = Path(staging_dir)
    if not staging.is_dir():
        return modlist_entries

    existing_mods: set[str] = set()
    for item in staging.iterdir():
        if item.is_dir() or item.is_symlink():
            existing_mods.add(item.name.lower().replace(" ", "").replace("_", "").replace("-", ""))

    for entry in modlist_entries:
        if entry.get("is_separator"):
            entry["matched"] = True
            entry["staging_name"] = entry["name"]
            continue

        name = entry["name"]
        normalized = name.lower().replace(" ", "").replace("_", "").replace("-", "")

        if normalized in existing_mods:
            entry["matched"] = True
            entry["staging_name"] = name
        else:
            # Fuzzy match: check if normalized name is a substring of any existing mod
            for existing in existing_mods:
                if normalized in existing or existing in normalized:
                    entry["matched"] = True
                    entry["staging_name"] = next(
                        (item.name for item in staging.iterdir()
                         if item.name.lower().replace(" ", "").replace("_", "").replace("-", "") == existing),
                        name,
                    )
                    break
            else:
                entry["matched"] = False
                entry["staging_name"] = None

    return modlist_entries


def import_modlist(
    modlist_path: str | Path,
    staging_dir: str | Path | None = None,
) -> dict[str, Any]:
    """Full import pipeline: parse + match + return structured data."""
    entries = parse_modlist(modlist_path)
    if staging_dir:
        entries = match_mods_to_staging(entries, staging_dir)

    enabled = [e for e in entries if e.get("enabled") and not e.get("is_separator")]
    disabled = [e for e in entries if not e.get("enabled") and not e.get("is_separator")]
    separators = [e for e in entries if e.get("is_separator")]
    unmatched = [e for e in entries if not e.get("matched") and not e.get("is_separator")]

    return {
        "ok": True,
        "data": {
            "total": len(entries),
            "enabled_count": len(enabled),
            "disabled_count": len(disabled),
            "separators": len(separators),
            "unmatched_count": len(unmatched),
            "entries": entries,
            "unmatched": unmatched,
        },
    }
