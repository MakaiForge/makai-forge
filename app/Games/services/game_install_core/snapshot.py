"""game_install_core.snapshot — snapshot do prefixo + detecção de novos exe.

Usado no fluxo de INSTALADOR: tira snapshot antes/depois de rodar o
instalador e compara para achar o executável recém-instalado.
"""

import os

from ._util import resolve_actual_prefix

WINE_INTERNAL_DIR_PREFIXES = [
    "windows/", "windows/system32/", "windows/syswow64/",
    "windows/system/", "windows/winsxs/", "windows/installer/",
    "windows/temp/", "windows/msdownld.tmp/",
    "ProgramData/", "Config.Msi/", "$Recycle.Bin/",
]


def is_wine_internal(rel_path: str) -> bool:
    lower = rel_path.lower()
    return any(lower.startswith(p) for p in WINE_INTERNAL_DIR_PREFIXES)


def snapshot_prefix(prefix_path: str) -> list[dict]:
    """
    Tira snapshot do drive_c: registra todos os arquivos e diretórios.

    Returns: [{path, size, mtimeMs, isDirectory}]
    """
    prefix_path = os.path.expanduser(prefix_path)
    actual = resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")
    entries: list[dict] = []

    def walk(dir_path: str, rel_prefix: str = ""):
        try:
            with os.scandir(dir_path) as it:
                for entry in it:
                    rel = f"{rel_prefix}/{entry.name}" if rel_prefix else entry.name
                    if entry.is_dir(follow_symlinks=False):
                        try:
                            st = entry.stat()
                            entries.append({
                                "path": rel, "size": 0,
                                "mtimeMs": int(st.st_mtime * 1000),
                                "isDirectory": True,
                            })
                        except OSError:
                            pass
                        walk(entry.path, rel)
                    elif entry.is_file(follow_symlinks=False):
                        try:
                            st = entry.stat()
                            entries.append({
                                "path": rel, "size": st.st_size,
                                "mtimeMs": int(st.st_mtime * 1000),
                                "isDirectory": False,
                            })
                        except OSError:
                            pass
        except PermissionError:
            pass
        except OSError:
            pass

    if os.path.isdir(drive_c):
        walk(drive_c)

    return entries


def find_new_executables(before: list[dict], after: list[dict]) -> list[dict]:
    """
    Compara snapshots, retorna .exe novos (não Wine-internos).

    Returns: [{path, name, size}] — ordenado por mtimeMs (mais recente primeiro)
    """
    before_paths = {e["path"] for e in before}
    before_dirs = {e["path"] for e in before if e.get("isDirectory")}

    after_sorted = sorted(after, key=lambda e: e.get("mtimeMs", 0), reverse=True)

    new_in_new_dirs: list[dict] = []
    new_in_existing_dirs: list[dict] = []
    seen = set()

    for entry in after_sorted:
        if entry.get("isDirectory"):
            continue
        p = entry["path"]
        if not p.lower().endswith(".exe"):
            continue
        if is_wine_internal(p):
            continue
        if p in before_paths:
            continue
        if p in seen:
            continue
        seen.add(p)

        parent_dir = p.rsplit("/", 1)[0] if "/" in p else ""
        parent_is_new = bool(parent_dir and parent_dir not in before_dirs)

        candidate = {
            "path": p,
            "name": os.path.basename(p),
            "size": entry["size"],
        }

        if parent_is_new:
            new_in_new_dirs.append(candidate)
        else:
            new_in_existing_dirs.append(candidate)

    return new_in_new_dirs + new_in_existing_dirs
