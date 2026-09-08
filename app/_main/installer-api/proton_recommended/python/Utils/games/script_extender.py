from __future__ import annotations
import re
import shutil
from pathlib import Path
from typing import Any


SE_DEFS: dict[str, dict[str, Any]] = {
    "skyrim": {
        "name": "SKSE",
        "loader_exe": "skse_loader.exe",
        "dll_pattern": "skse*.dll",
        "dir_pattern": "SKSE",
        "download_url": "https://skse.silverlock.org/download/archive/skse_1_07_03.7z",
        "version_file": "skse_whatsnew.txt",
    },
    "skyrimspecialedition": {
        "name": "SKSE64",
        "loader_exe": "skse64_loader.exe",
        "dll_pattern": "skse64*.dll",
        "dir_pattern": "SKSE",
        "download_url": "https://skse.silverlock.org/download/archive/skse64_2_02_06.7z",
        "version_file": "skse64_whatsnew.txt",
    },
    "skyrimvr": {
        "name": "SKSE64 VR",
        "loader_exe": "sksevr_loader.exe",
        "dll_pattern": "sksevr*.dll",
        "dir_pattern": "SKSE",
        "download_url": "https://skse.silverlock.org/download/archive/sksevr_2_00_12.7z",
        "version_file": "skse64_whatsnew.txt",
    },
    "fallout4": {
        "name": "F4SE",
        "loader_exe": "f4se_loader.exe",
        "dll_pattern": "f4se*.dll",
        "dir_pattern": "F4SE",
        "download_url": "https://f4se.silverlock.org/download/archive/f4se_0_7_8.7z",
        "version_file": "f4se_whatsnew.txt",
    },
    "fallout4vr": {
        "name": "F4SE VR",
        "loader_exe": "f4sev_loader.exe",
        "dll_pattern": "f4sev*.dll",
        "dir_pattern": "F4SE",
        "download_url": "https://f4se.silverlock.org/download/archive/f4se_0_6_21.7z",
        "version_file": "f4se_whatsnew.txt",
    },
    "falloutnewvegas": {
        "name": "xNVSE",
        "loader_exe": "nvse_loader.exe",
        "dll_pattern": "nvse*.dll",
        "dir_pattern": "nvse",
        "download_url": "https://github.com/xNVSE/NVSE/releases/download/6.4.8/nvse_6_4_8.7z",
        "version_file": None,
    },
    "fallout3": {
        "name": "FOSE",
        "loader_exe": "fose_loader.exe",
        "dll_pattern": "fose*.dll",
        "dir_pattern": "fose",
        "download_url": "https://fose.silverlock.org/download/archive/fose_1_3_beta9.7z",
        "version_file": None,
    },
    "oblivion": {
        "name": "OBSE",
        "loader_exe": "obse_loader.exe",
        "dll_pattern": "obse*.dll",
        "dir_pattern": "obse",
        "download_url": "https://obse.silverlock.org/download/archive/obse_0022.7z",
        "version_file": None,
    },
}


def get_extender_for_game(game_id: str) -> dict[str, Any] | None:
    key = game_id.lower().replace(" ", "").replace("-", "").replace("_", "")
    best: tuple[int, dict[str, Any] | None] = (0, None)
    for known_key, defn in SE_DEFS.items():
        if key == known_key:
            return dict(defn)
        if key.startswith(known_key) and len(known_key) > best[0]:
            best = (len(known_key), defn)
    if best[1] is not None:
        return dict(best[1])
    for known_key, defn in SE_DEFS.items():
        if known_key.startswith(key) and len(known_key) > best[0]:
            best = (len(known_key), defn)
    return dict(best[1]) if best[1] else None


def check_installed(game_path: str | Path) -> dict[str, Any]:
    gp = Path(game_path)
    result: dict[str, Any] = {
        "installed": False,
        "loader_found": False,
        "dll_found": False,
        "dir_found": False,
        "version": None,
    }

    for se_key, defn in SE_DEFS.items():
        loader = gp / defn["loader_exe"]
        if loader.exists():
            result["loader_found"] = True

        dll_pattern = defn["dll_pattern"].replace("*", "")
        for f in gp.glob(f"{dll_pattern}*"):
            if f.suffix.lower() == ".dll":
                result["dll_found"] = True
                break

        se_dir = gp / defn["dir_pattern"]
        if se_dir.is_dir():
            result["dir_found"] = True

        if defn["version_file"]:
            vf = gp / defn["version_file"]
            if vf.exists():
                text = vf.read_text("utf-8", errors="replace")
                m = re.search(r"(\d+\.\d+\.\d+)", text)
                if m:
                    result["version"] = m.group(1)

    result["installed"] = result["loader_found"] or (result["dll_found"] and result["dir_found"])
    return result


def check_installed_all(game_paths: dict[str, str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for game_id, game_path in game_paths.items():
        defn = get_extender_for_game(game_id)
        if defn is None:
            continue
        results[game_id] = check_installed(game_path)
        results[game_id]["extender_name"] = defn["name"]
    return results


def download_and_install(game_id: str, game_path: str | Path, target_dir: str | Path | None = None) -> dict[str, Any]:
    import subprocess as sp
    import urllib.request
    import tempfile

    defn = get_extender_for_game(game_id)
    if defn is None:
        return {"ok": False, "error": f"No script extender defined for game: {game_id}"}

    gp = Path(game_path)
    url = defn["download_url"]

    try:
        with tempfile.TemporaryDirectory() as tmp_str:
            tmp = Path(tmp_str)
            arc_path = tmp / "se_download.7z"

            print(f"Downloading {defn['name']} from {url}...")
            urllib.request.urlretrieve(url, arc_path)
            print(f"Downloaded {arc_path.stat().st_size} bytes")

            extract_dir = tmp / "se_extracted"
            extract_dir.mkdir()

            result = sp.run(
                ["7z", "x", str(arc_path), f"-o{extract_dir}", "-y"],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode != 0:
                return {"ok": False, "error": f"Extraction failed: {result.stderr}"}

            src_root = extract_dir
            top_items = list(src_root.iterdir())
            if len(top_items) == 1 and top_items[0].is_dir():
                src_root = top_items[0]

            copied = 0
            for item in src_root.iterdir():
                if item.is_file():
                    dest = gp / item.name
                    shutil.copy2(item, dest)
                    copied += 1
                elif item.is_dir() and item.name.lower() in ("skse", "f4se", "nvse", "fose", "obse"):
                    dest = gp / item.name
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.copytree(item, dest)
                    copied += sum(1 for _ in dest.rglob("*"))

            return {
                "ok": True,
                "data": {
                    "extender": defn["name"],
                    "files_copied": copied,
                    "game_path": str(gp),
                    "url": url,
                },
            }
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
