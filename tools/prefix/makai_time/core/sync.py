"""Sync method detection: ntsync, fsync, esync.

Prioridade: ntsync (kernel >= 6.14) > fsync (kernel >= 5.16 c/ futex2) > esync (fallback).
"""

import os
from makai_time.utils import sysinfo


def best_sync_method() -> dict:
    """Retorna o melhor método de sync disponível + env vars.
    
    Returns:
        {
            "method": "ntsync" | "fsync" | "esync" | "none",
            "env": { "WINEFSYNC": "...", "WINEESYNC": "...", "WINENTSYNC": "..." },
            "devices": ["/dev/ntsync"] | [],
            "kernel_supports": bool,
        }
    """
    kv = sysinfo.kernel_version()

    if sysinfo.ntsync_available():
        env = {"WINENTSYNC": "1"}
        if kv >= (6, 14, 0):
            env["STAGING_SHARED_MEMORY"] = "1"
        return {
            "method": "ntsync",
            "env": env,
            "devices": ["/dev/ntsync"],
            "kernel_supports": True,
        }

    if sysinfo.kernel_has_futex2():
        return {
            "method": "fsync",
            "env": {"WINEFSYNC": "1", "WINEESYNC": "0"},
            "devices": [],
            "kernel_supports": True,
        }

    return {
        "method": "esync",
        "env": {"WINEFSYNC": "0", "WINEESYNC": "1"},
        "devices": [],
        "kernel_supports": False,
    }


def info() -> dict:
    return best_sync_method()
