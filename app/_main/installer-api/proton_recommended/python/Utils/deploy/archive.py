"""deploy/archive.py — Archive extraction."""

import subprocess as sp
import shutil
from pathlib import Path


def extract_archive(archive_path: str | Path, staging_dir: str | Path, password: str | None = None) -> list[str]:
    """Extract archive to staging dir. Supports .7z, .zip, .rar, .tar.*

    Returns list of extracted file paths (relative to staging_dir).
    Returns empty list on failure.
    """
    archive = Path(archive_path)
    dest = Path(staging_dir)
    dest.mkdir(parents=True, exist_ok=True)

    ext = archive.suffix.lower()

    try:
        if ext == ".7z" or ext == ".rar":
            cmd = ["7z", "x", str(archive), f"-o{dest}", "-y"]
            if password:
                cmd.append(f"-p{password}")
            result = sp.run(
                cmd, capture_output=True, text=True, timeout=300,
            )
            if result.returncode != 0:
                return []
        elif ext == ".zip":
            shutil.unpack_archive(str(archive), str(dest), "zip")
        elif ext in (".gz", ".bz2", ".xz"):
            shutil.unpack_archive(str(archive), str(dest))
        elif ext == ".tar":
            shutil.unpack_archive(str(archive), str(dest), "tar")
        else:
            return []
    except (sp.TimeoutExpired, shutil.ReadError, OSError) as e:
        print(f"Extract failed: {e}", file=__import__('sys').stderr)
        return []

    extracted: list[str] = []
    for filepath in dest.rglob("*"):
        if filepath.is_file():
            extracted.append(str(filepath.relative_to(dest)))
    return extracted
