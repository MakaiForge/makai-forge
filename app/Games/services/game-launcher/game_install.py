"""
game_install.py — SHIM de compatibilidade.

A implementação real vive em `game_install_core` (módulo único e à parte,
usado por todas as abas e pelo CompactFlow). Este arquivo apenas re-exporta
a API pública para não quebrar imports antigos.
"""

from game_install_core import (
    detect_installer_type,
    copy_to_prefix,
    scan_prefix_for_exes,
    classify_exe,
    snapshot_prefix,
    find_new_executables,
    run_installer_in_container,
    install_game,
)

__all__ = [
    "detect_installer_type",
    "copy_to_prefix",
    "scan_prefix_for_exes",
    "classify_exe",
    "snapshot_prefix",
    "find_new_executables",
    "run_installer_in_container",
    "install_game",
]
