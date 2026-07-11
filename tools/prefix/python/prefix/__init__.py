"""
tools/prefix/python/ — Unified Wine prefix management for Makai Forge.

All prefix-related Python code consolidated here.
Originais em python-rpc/ e install-api/ importam deste módulo.
"""

import os
import sys
import warnings

# ── Venv guard ────────────────────────────────────────────────────────────────
# Warn if not running from the project's tools/venv (ensures consistent deps).
_this_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.normpath(os.path.join(_this_dir, *([".."] * 4)))
_expected_venv_python = os.path.join(_project_root, "tools", "venv", "bin", "python3")
if os.path.exists(_expected_venv_python):
    try:
        if os.path.realpath(sys.executable) != os.path.realpath(_expected_venv_python):
            warnings.warn(
                f"Makai Forge prefix module: expected venv Python at {_expected_venv_python}, "
                f"but running with {sys.executable}. Use tools/venv/bin/python3 for compatibility."
            )
    except (AttributeError, OSError):
        pass  # sys.executable may be empty in some embedded environments
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
]
