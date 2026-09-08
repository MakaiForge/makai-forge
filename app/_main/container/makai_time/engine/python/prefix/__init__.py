"""
app/_main/container/makai_time/engine/python/ — Unified Wine prefix management for Makai Forge.

All prefix-related Python code consolidated here.
Originais em python-rpc/ e install-api/ importam deste módulo.
"""

import os
import sys
import warnings

# ── Venv guard ────────────────────────────────────────────────────────────────
# Warn if not running from the project's app/_venv (ensures consistent deps).
_this_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.normpath(os.path.join(_this_dir, *([".."] * 6)))
_expected_venv_python = os.path.join(_project_root, "app", "_venv", "bin", "python3")
# Check venv: the wrapper scripts (python3 → python3.bin → python3.10.bin) all
# resolve to different realpaths.  Instead of comparing specific filenames, just
# verify that sys.executable lives under the project's venv directory.
if os.path.exists(_expected_venv_python):
    _venv_dir = os.path.dirname(os.path.dirname(_expected_venv_python))  # …/app/_venv
    try:
        _real_exec = os.path.realpath(sys.executable)
    except (AttributeError, OSError):
        _real_exec = ""
    if _real_exec and not _real_exec.startswith(os.path.realpath(_venv_dir) + os.sep):
        warnings.warn(
            f"Makai Forge prefix: expected venv at {_venv_dir}, "
            f"but running {sys.executable} (resolved: {_real_exec}). "
            "Use app/_venv/bin/python3 for compatibility."
        )
# ──────────────────────────────────────────────────────────────────────────────


def get_venv_python() -> str:
    """
    Resolve the project's venv Python path dynamically.
    Works regardless of how the module is imported.
    """
    return _expected_venv_python


from .core import (
    resolve_prefix_path,
    ensure_proton_valid,
    is_prefix_initialized,
    resolve_actual_prefix,
    ensure_prefix_markers,
    create_prefix,
    delete_prefix,
    clean_prefix,
)

from .makaitricks import (
    install_recommended_dlls,
    run_makaitricks,
    run_makaitricks_verbs,
)

from .runner import (
    run_proton_command_for_game,
)

from .prefix_universal import (
    create_prefix_universal,
    find_wine_binary,
    find_wineserver,
)

__all__ = [
    "get_venv_python",
    "resolve_prefix_path",
    "ensure_proton_valid",
    "is_prefix_initialized",
    "resolve_actual_prefix",
    "ensure_prefix_markers",
    "create_prefix",
    "delete_prefix",
    "clean_prefix",
    "install_recommended_dlls",
    "run_makaitricks",
    "run_makaitricks_verbs",
    "run_proton_command_for_game",
    "create_prefix_universal",
    "find_wine_binary",
    "find_wineserver",
]
