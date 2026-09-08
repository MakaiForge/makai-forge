"""game_install_core._util — utilidades compartilhadas.

Helps comuns a detect/copy/scan/snapshot: resolução do prefixo real,
listagem de arquivos (sem loops de symlink) e hashing SHA256.
"""

import hashlib
import os

SKIP_DIRS = {"node_modules", ".git", "__pycache__"}


def resolve_actual_prefix(prefix_path: str) -> str:
    """Resolve o diretório real do prefixo (tratando layout <prefixo>/pfx)."""
    drive_c = os.path.join(prefix_path, "drive_c")
    if os.path.isdir(os.path.join(drive_c, "windows", "system32")):
        return prefix_path
    pfx = os.path.join(prefix_path, "pfx")
    return pfx if os.path.isdir(os.path.join(pfx, "drive_c", "windows", "system32")) else prefix_path


def walk_dir(dir_path: str) -> list[str]:
    """Lista todos os arquivos recursivamente, evitando loops de symlink."""
    files: list[str] = []
    seen = set()

    def walk(d: str):
        real = os.path.realpath(d)
        if real in seen:
            return
        seen.add(real)
        try:
            for entry in os.scandir(d):
                if entry.is_dir(follow_symlinks=False):
                    if entry.name in SKIP_DIRS:
                        continue
                    walk(entry.path)
                elif entry.is_file(follow_symlinks=False):
                    files.append(entry.path)
        except PermissionError:
            pass
        except OSError:
            pass

    walk(dir_path)
    return files


def file_sha256(file_path: str) -> str | None:
    """SHA256 de um arquivo (streaming, 64KB buffer)."""
    h = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def compute_hashes(files: list[str], base_path: str,
                   progress_callback=None,
                   pbase: int = 0, prange: int = 100) -> dict[str, str]:
    """Calcula SHA256 de uma lista de arquivos, em lotes.

    pbase/prange — progress_base / progress_range para callback monotônico.
    """
    hashes: dict[str, str] = {}
    batch_size = 20
    total = len(files)

    for i in range(0, total, batch_size):
        batch = files[i:i + batch_size]
        for fp in batch:
            rel = os.path.relpath(fp, base_path)
            h = file_sha256(fp)
            if h:
                hashes[rel] = h
        if progress_callback and total > 0:
            # Clampa o lote ao total (total < batch_size não estoura o range)
            denom = min(i + batch_size, total)
            pct = pbase + int(denom / total * prange)
            progress_callback(min(pbase + prange, pct))
    return hashes


def total_bytes(files: list[str]) -> int:
    """Soma o tamanho de todos os arquivos."""
    total = 0
    for f in files:
        try:
            total += os.path.getsize(f)
        except OSError:
            pass
    return total
