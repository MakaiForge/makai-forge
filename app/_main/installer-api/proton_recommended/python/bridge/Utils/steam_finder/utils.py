"""steam_finder/utils.py — Small helpers for Steam/Proton operations."""

import re
import shutil
from pathlib import Path
from typing import Optional

from . import _parse_acf_field, _find_installdir_from_manifest


def find_wine() -> Optional[str]:
    """Find a system wine binary."""
    wine = shutil.which("wine")
    return wine


def _normalize_tool_name(name: str) -> str:
    """Normalize a tool name for comparison.

    >>> _normalize_tool_name("GE-Proton9-25")
    'geproton925'
    """
    return re.sub(r"[^a-z0-9]", "", name.lower())
