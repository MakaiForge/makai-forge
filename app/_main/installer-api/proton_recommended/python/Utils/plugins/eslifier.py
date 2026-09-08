"""eslifier.py — Convert ESP/ESM to ESL (Light Master).

Sets the ESL flag (0x00000200) and optionally scans for
FormIDs that exceed the 12-bit ESL range (> 0xFFF).
"""

from __future__ import annotations

import os
import struct
from pathlib import Path

FLAG_LIGHT = 0x00000200


def eslify(path: str | Path, dry_run: bool = False, safe_check: bool = True) -> dict:
    """Convert a plugin to ESL format.

    Args:
        path: Path to .esp or .esm file.
        dry_run: If True, only check without modifying.
        safe_check: If True, scan all FormIDs to verify they fit in 12-bit range.

    Returns:
        dict with keys:
            success: bool
            is_esl: bool (already ESL)
            max_formid: int (highest FormID found, 0 if not scanned)
            safe: bool (True if all FormIDs < 0xFFF, or if not scanned)
            new_path: str | None (renamed file path)
            error: str | None
    """
    path = Path(path)
    if not path.is_file():
        return {"success": False, "error": f"File not found: {path}"}

    ext = path.suffix.lower()
    if ext not in (".esp", ".esm", ".esl"):
        return {"success": False, "error": f"Not a plugin file: {ext}"}

    if ext == ".esl":
        return {"success": True, "is_esl": True, "max_formid": 0, "safe": True, "new_path": str(path), "error": None}

    try:
        raw = path.read_bytes()
    except OSError as e:
        return {"success": False, "error": str(e)}

    if len(raw) < 24:
        return {"success": False, "error": "File too small to be a plugin"}

    sig = raw[0:4]
    if sig not in (b"TES4", b"TES5"):
        return {"success": False, "error": f"Not a Bethesda plugin: {sig!r}"}

    data_size = struct.unpack_from("<I", raw, 4)[0]
    flags = struct.unpack_from("<I", raw, 8)[0]

    if flags & FLAG_LIGHT:
        return {"success": True, "is_esl": True, "max_formid": 0, "safe": True, "new_path": str(path), "error": None}

    # Safety check: scan all top-level FormIDs
    max_formid = 0
    if safe_check:
        max_formid = _scan_max_formid(raw)

    safe = max_formid < 0x1000

    if dry_run:
        return {
            "success": True, "is_esl": False,
            "max_formid": max_formid, "safe": safe,
            "new_path": None, "error": None,
        }

    # Set ESL flag
    new_flags = flags | FLAG_LIGHT
    modified = bytearray(raw)
    struct.pack_into("<I", modified, 8, new_flags)

    new_ext = ".esl"
    new_path = path.with_suffix(new_ext)

    try:
        Path(new_path).write_bytes(bytes(modified))
    except OSError as e:
        return {"success": False, "error": f"Failed to write: {e}"}

    # Remove original if rename succeeded
    try:
        path.unlink()
    except OSError as e:
        return {"success": False, "error": f"Wrote ESL but failed to remove original: {e}"}

    return {
        "success": True, "is_esl": True,
        "max_formid": max_formid, "safe": safe,
        "new_path": str(new_path), "error": None,
    }


def _scan_max_formid(raw: bytes) -> int:
    """Scan all records for the highest FormID.

    Navigates the flattened record structure:
      <sig:4> <size:4> <flags:4> <formid:4> ...
    Skipping GRUP headers (which contain group data, not records).
    """
    max_id = 0
    i = 0
    n = len(raw)

    while i < n - 16:
        sig = raw[i:i+4]
        if sig == b"GRUP":
            if i + 20 > n:
                break
            size = struct.unpack_from("<I", raw, i + 4)[0]
            if size < 24:
                i += 1
                continue
            i += size
            continue
        if sig == b"TES4":
            size = struct.unpack_from("<I", raw, i + 4)[0]
            i += 24 + size
            continue

        # Check if this might be a record (sig is printable ASCII)
        if all(32 <= b < 127 for b in sig):
            formid = struct.unpack_from("<I", raw, i + 12)[0]
            if formid > max_id:
                max_id = formid
            size = struct.unpack_from("<I", raw, i + 4)[0]
            if size > 0xFFFFFF:
                i += 1
                continue
            i += 24 + size
        else:
            i += 1

    return max_id


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    import json
    import sys

    args = sys.argv[1:]
    if not args:
        print(json.dumps({"success": False, "error": "Usage: eslifier.py <path> [--dry-run] [--no-safe-check]"}))
        return

    path = args[0]
    dry_run = "--dry-run" in args
    safe_check = "--no-safe-check" not in args

    result = eslify(path, dry_run=dry_run, safe_check=safe_check)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
