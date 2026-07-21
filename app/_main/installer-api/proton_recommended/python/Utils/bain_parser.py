from __future__ import annotations
import re
from pathlib import Path
from typing import Any


def detect_bain(archive_path: str) -> dict[str, Any]:
    """Detect if an archive is a BAIN-style installer.

    Returns package structure with sub-packages and their file trees.
    """
    ext = Path(archive_path).suffix.lower()
    if ext not in (".zip", ".7z", ".rar", ".fomod"):
        return {"ok": False, "error": "Unsupported archive format"}

    try:
        import subprocess
        result = subprocess.run(
            ["7z", "l", archive_path, "-ba"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return {"ok": False, "error": result.stderr.strip()}
        lines = result.stdout.splitlines()
    except FileNotFoundError:
        return {"ok": False, "error": "7z not found"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

    # Parse 7z output to get file paths
    files: list[str] = []
    for line in lines:
        parts = line.split(maxsplit=5)
        if len(parts) >= 6:
            path = parts[-1]
            if path and not path.endswith("/"):
                files.append(path)

    # Find root-level directories that look like BAIN packages
    package_re = re.compile(r"^(\d+)\s*[-–—]?\s*(.+)$|^(\d+)\s+(.+)$")
    root_dirs: set[str] = set()
    for f in files:
        parts = f.split("/")
        if len(parts) >= 2:
            root_dirs.add(parts[0])

    packages: list[dict[str, Any]] = []
    for d in sorted(root_dirs, key=lambda x: (int(re.match(r"^(\d+)", x).group(1)) if re.match(r"^(\d+)", x) else 999, x)):
        m = package_re.match(d)
        if m:
            order = int(m.group(1) or m.group(3))
            name = (m.group(2) or m.group(4) or "").strip()
            package_files = [f for f in files if f.startswith(d + "/")]
            packages.append({
                "order": order,
                "name": name or d,
                "directory": d,
                "file_count": len(package_files),
                "files": package_files,
            })

    if not packages:
        return {"ok": False, "error": "No BAIN packages detected", "is_bain": False}

    return {
        "ok": True,
        "is_bain": True,
        "data": {
            "packages": packages,
            "total_files": len(files),
        },
    }


def install_bain_packages(
    archive_path: str,
    staging_dir: str,
    selected_packages: list[int],
) -> dict[str, Any]:
    """Install selected BAIN packages from archive to staging dir."""
    import subprocess
    import tempfile

    detect = detect_bain(archive_path)
    if not detect.get("ok"):
        return detect

    all_packages = detect["data"]["packages"]
    selected = [p for p in all_packages if p["order"] in selected_packages]

    if not selected:
        return {"ok": False, "error": "No packages selected"}

    # Extract only files from selected packages
    staging = Path(staging_dir)
    staging.mkdir(parents=True, exist_ok=True)

    extracted_count = 0
    for pkg in selected:
        pkg_staging = staging / pkg["directory"]
        pkg_staging.mkdir(parents=True, exist_ok=True)

        # Extract each file maintaining structure
        for f in pkg["files"]:
            rel_path = "/".join(f.split("/")[1:])  # strip package dir
            if not rel_path:
                continue
            dest = pkg_staging / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)

            try:
                result = subprocess.run(
                    ["7z", "x", archive_path, f"-o{dest.parent}", f"{f}", "-y"],
                    capture_output=True, text=True, timeout=120,
                )
                if result.returncode == 0:
                    extracted_count += 1
            except Exception:
                continue

    return {
        "ok": True,
        "data": {
            "packages_installed": len(selected),
            "files_extracted": extracted_count,
            "install_path": str(staging),
        },
    }
