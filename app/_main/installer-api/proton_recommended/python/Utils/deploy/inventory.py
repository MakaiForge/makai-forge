"""deploy/inventory.py — Mod inventory, type detection, filemap building."""

from pathlib import Path

from .types import (
    ModFileEntry, ModInventory,
    SE_PATTERNS, ROOT_PLUGIN_EXTS,
    IMAGE_EXTS, README_EXTS, README_PATTERNS,
)


def _strip_data_prefix(relative_path: str) -> str:
    parts = relative_path.replace("\\", "/").split("/")
    if parts and parts[0].lower() == "data":
        return "/".join(parts[1:])
    return relative_path


def inventory_mod(staging_dir: str | Path, mod_name: str) -> ModInventory:
    """Scan a staged mod and build an inventory (files, plugins, SE, previews, readmes)."""
    staging = Path(staging_dir)
    mod_staging = staging / mod_name
    has_fomod = False
    files: list[ModFileEntry] = []
    script_extender_files: list[ModFileEntry] = []
    plugin_files: list[str] = []
    preview_files: list[ModFileEntry] = []
    readme_files: list[ModFileEntry] = []

    if not mod_staging.exists():
        return ModInventory(mod_name=mod_name)

    def walk_dir(dir_path: Path, relative_prefix: str = "") -> None:
        nonlocal has_fomod
        try:
            entries = list(dir_path.iterdir())
        except PermissionError:
            return

        for entry in entries:
            full_path = entry
            rel_path = f"{relative_prefix}/{entry.name}" if relative_prefix else entry.name

            if entry.is_dir():
                if entry.name.lower() == "fomod":
                    has_fomod = True
                walk_dir(full_path, rel_path)
            elif entry.is_file():
                is_root = not relative_prefix
                lower_name = entry.name.lower()
                ext = Path(lower_name).suffix
                name_no_ext = Path(lower_name).stem

                is_se = False
                if is_root:
                    for pat in SE_PATTERNS:
                        if pat.search(lower_name):
                            is_se = True
                            break
                    if is_se:
                        if not (lower_name.endswith(".exe") or lower_name.endswith(".dll")):
                            is_se = False

                try:
                    size = entry.stat().st_size
                except OSError:
                    size = 0

                fe = ModFileEntry(
                    relative_path=rel_path,
                    relative_path_lower=rel_path.lower(),
                    size=size,
                    is_script_extender=is_se,
                    is_plugin=ext in ROOT_PLUGIN_EXTS,
                )
                files.append(fe)
                if is_se:
                    script_extender_files.append(fe)
                if fe.is_plugin:
                    plugin_files.append(entry.name)

                if ext in IMAGE_EXTS:
                    preview_files.append(fe)

                if ext in README_EXTS:
                    dir_name = relative_prefix.split("/")[0].lower() if relative_prefix else ""
                    if any(p in name_no_ext for p in README_PATTERNS) or any(p in dir_name for p in README_PATTERNS):
                        readme_files.append(fe)

    walk_dir(mod_staging)
    return ModInventory(
        mod_name=mod_name,
        files=files,
        script_extender_files=script_extender_files,
        plugin_files=plugin_files,
        has_fomod=has_fomod,
        preview_files=preview_files,
        readme_files=readme_files,
    )


def detect_mod_type(staging_dir: str | Path) -> dict:
    """Detect mod type: FOMOD, has plugins, has script extender."""
    staging = Path(staging_dir)
    has_fomod = (staging / "fomod").is_dir()
    has_plugins = False
    has_skse = False
    has_root_level = False

    for entry in staging.rglob("*"):
        if not entry.is_file():
            continue
        ext = entry.suffix.lower()
        rel = entry.relative_to(staging)
        is_root = len(rel.parts) == 1

        if ext in ROOT_PLUGIN_EXTS:
            has_plugins = True
        if ext in (".exe", ".dll"):
            for pat in SE_PATTERNS:
                if pat.search(entry.name.lower()):
                    has_skse = True
                    break

    return {
        "has_fomod": has_fomod,
        "has_plugins": has_plugins,
        "has_script_extender": has_skse,
        "has_root_level": has_root_level,
    }


def build_filemap(
    modlist: list[dict],
    staging_dir: str | Path,
    game_path: str | Path,
) -> dict[str, str]:
    """Build a map of relative_path -> source_path for enabled mods.

    Respects priority order (later = higher priority = wins conflicts).
    Only includes deployable files (plugins at root, SE files, everything under Data/).
    """
    staging = Path(staging_dir)
    filemap: dict[str, str] = {}

    enabled = [m for m in modlist if m.get("enabled") and not m.get("is_separator")]
    enabled.sort(key=lambda m: m.get("priority", 0))

    for mod in enabled:
        mod_name = mod["name"]
        mod_staging = staging / mod_name
        if not mod_staging.exists():
            continue

        def walk_dir(dir_path: Path, relative_prefix: str = "") -> None:
            try:
                entries = list(dir_path.iterdir())
            except PermissionError:
                return

            is_root = relative_prefix == ""
            for entry in entries:
                full_path = entry
                raw_relative = f"{relative_prefix}/{entry.name}" if relative_prefix else entry.name

                if entry.is_dir():
                    walk_dir(full_path, raw_relative)
                elif entry.is_file():
                    if is_root:
                        ext = entry.suffix.lower()
                        is_plugin = ext in ROOT_PLUGIN_EXTS
                        is_se = any(p.search(entry.name.lower()) for p in SE_PATTERNS) and ext in (".exe", ".dll")
                        if not is_plugin and not is_se:
                            continue
                    rel = _strip_data_prefix(raw_relative)
                    filemap[rel] = str(full_path)

        walk_dir(mod_staging)

    return filemap
