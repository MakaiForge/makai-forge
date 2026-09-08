"""deploy — Mod deploy, restore, inventory, conflict detection, extraction."""

from .types import (
    ModFileEntry, ModInventory, DeploymentResult, LinkMode,
    SE_PATTERNS, ROOT_PLUGIN_EXTS, SKIP_ROOT_EXTS, IMAGE_EXTS, README_EXTS,
    README_PATTERNS, GAME_LOCAL_DIR_MAP,
)
from .archive import extract_archive
from .inventory import inventory_mod, detect_mod_type, build_filemap
from .core import (
    deploy, restore, undeploy_mod, write_plugins_txt,
    detect_plugin_conflicts, get_staging_dir, main,
)

__all__ = [
    "ModFileEntry", "ModInventory", "DeploymentResult", "LinkMode",
    "SE_PATTERNS", "ROOT_PLUGIN_EXTS", "SKIP_ROOT_EXTS",
    "IMAGE_EXTS", "README_EXTS", "README_PATTERNS", "GAME_LOCAL_DIR_MAP",
    "extract_archive",
    "inventory_mod", "detect_mod_type", "build_filemap",
    "deploy", "restore", "undeploy_mod", "write_plugins_txt",
    "detect_plugin_conflicts", "get_staging_dir", "main",
]
