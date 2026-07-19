"""
core/engine/framework_installer.py — Instalação de frameworks (BepInEx, SMAPI, RED4ext, etc.)

FrameworkDef:
  name        - Nome exibido
  downloadUrl - URL direta (zip/7z)
  detector    - {file?, folder?} para checar se já instalado (relativo a game_path)
  innerFolder - Pasta dentro do zip que contém os arquivos
  chmodFiles  - Arquivos pra chmod +x
"""

import json
import os
import shutil
import sys
import tempfile
import urllib.request

# ─── Definições ──────────────────────────────────────────────────

_GAME_FRAMEWORKS: dict[str, list[dict]] = {
    "valheim": [{
        "name": "BepInExPack Valheim",
        "downloadUrl": "https://valheim.thunderstore.io/package/denikson/BepInExPack_Valheim/5.4.1100/BepInExPack_Valheim-5.4.1100.zip",
        "detector": {"folder": "BepInEx"},
        "innerFolder": "BepInExPack_Valheim",
        "chmodFiles": ["start_game_bepinex.sh"],
    }],
    "subnautica": [{
        "name": "BepInExPack Subnautica",
        "downloadUrl": "https://subnautica.thunderstore.io/package/denikson/BepInExPack_Subnautica/5.4.1100/BepInExPack_Subnautica-5.4.1100.zip",
        "detector": {"folder": "BepInEx"},
        "innerFolder": "BepInExPack_Subnautica",
    }],
    "larian": [{
        "name": "BG3 Script Extender",
        "downloadUrl": "https://github.com/Norbyte/bg3se/releases/download/v1.0.29/bg3se_2024_07_25.zip",
        "detector": {"file": "bg3se_loader.exe"},
    }],
    "stardewvalley": [{
        "name": "SMAPI",
        "downloadUrl": "https://github.com/Pathoschild/SMAPI/releases/download/4.1.10/SMAPI-4.1.10.zip",
        "detector": {"file": "StardewModdingAPI.exe"},
    }],
    "cyberpunk2077": [
        {
            "name": "RED4ext",
            "downloadUrl": "https://github.com/wghost/RED4ext/releases/download/v0.5.4/RED4ext.zip",
            "detector": {"folder": "red4ext"},
        },
        {
            "name": "Cyber Engine Tweaks (CET)",
            "downloadUrl": "https://github.com/cesm2020/CET/releases/download/1.32.0/CET.zip",
            "detector": {"file": "bin/x64/plugins/cyber_engine_tweaks.asi"},
        },
    ],
    "satisfactory": [{
        "name": "SML (Satisfactory Mod Loader)",
        "downloadUrl": "https://github.com/satisfactorymodding/SML/releases/download/3.7.1/SML-3.7.1.zip",
        "detector": {"folder": "SML"},
    }],
}


def get_frameworks(game_id: str) -> list[dict]:
    return _GAME_FRAMEWORKS.get(game_id, [])


def is_framework_installed(game_path: str, fw: dict) -> bool:
    detector = fw.get("detector") or {}
    folder = detector.get("folder")
    file = detector.get("file")
    if folder:
        return os.path.isdir(os.path.join(game_path, folder))
    if file:
        return os.path.isfile(os.path.join(game_path, file))
    return False


def _extract_archive(archive_path: str, dest_dir: str) -> bool:
    import zipfile
    try:
        with zipfile.ZipFile(archive_path) as z:
            z.extractall(dest_dir)
        return True
    except Exception:
        pass
    try:
        import py7zr
        with py7zr.SevenZipFile(archive_path, mode="r") as z:
            z.extractall(path=dest_dir)
        return True
    except Exception:
        pass
    try:
        import subprocess
        r = subprocess.run(["7z", "x", archive_path, f"-o{dest_dir}", "-y"],
                           capture_output=True, timeout=30)
        return r.returncode == 0
    except Exception:
        pass
    return False


def _copy_recursive(src: str, dst: str):
    for entry in os.listdir(src):
        s = os.path.join(src, entry)
        d = os.path.join(dst, entry)
        if os.path.isdir(s):
            os.makedirs(d, exist_ok=True)
            _copy_recursive(s, d)
        elif os.path.isfile(s):
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copy2(s, d)
            try:
                os.chmod(d, 0o755)
            except OSError:
                pass


def install_framework(game_path: str, fw: dict) -> bool:
    url = fw.get("downloadUrl")
    if not url:
        return False

    with tempfile.TemporaryDirectory(prefix=f"fw-{fw['name']}-") as tmpdir:
        ext = ".7z" if url.lower().endswith(".7z") else ".zip"
        archive_path = os.path.join(tmpdir, f"framework{ext}")

        _emit("log", level="info", message=f"Baixando {fw['name']}...")
        try:
            urllib.request.urlretrieve(url, archive_path)
        except Exception as e:
            _emit("log", level="warn", message=f"Download {fw['name']} falhou: {e}")
            return False

        if not os.path.isfile(archive_path) or os.path.getsize(archive_path) == 0:
            _emit("log", level="warn", message=f"Download {fw['name']} vazio")
            return False

        _emit("log", level="info", message=f"Extraindo {fw['name']}...")
        extract_dir = os.path.join(tmpdir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        if not _extract_archive(archive_path, extract_dir):
            _emit("log", level="warn", message=f"Extração {fw['name']} falhou")
            return False

        source_dir = extract_dir
        inner = fw.get("innerFolder")
        if inner:
            inner_path = os.path.join(extract_dir, inner)
            if os.path.isdir(inner_path):
                source_dir = inner_path

        _emit("log", level="info", message=f"Instalando {fw['name']}...")
        _copy_recursive(source_dir, game_path)

        for file in fw.get("chmodFiles") or []:
            fp = os.path.join(game_path, file)
            if os.path.isfile(fp):
                try:
                    os.chmod(fp, 0o755)
                except OSError:
                    pass

        installed = is_framework_installed(game_path, fw)
        if installed:
            _emit("log", level="info", message=f"{fw['name']} instalado")
        else:
            _emit("log", level="warn", message=f"{fw['name']}: detector não encontrou arquivo esperado")
        return installed


def ensure_frameworks(game_path: str, game_id: str) -> dict:
    fws = get_frameworks(game_id)
    installed = []
    skipped = []
    failed = []

    for fw in fws:
        if is_framework_installed(game_path, fw):
            _emit("log", level="info", message=f"{fw['name']} já instalado")
            skipped.append(fw["name"])
            continue
        ok = install_framework(game_path, fw)
        if ok:
            installed.append(fw["name"])
        else:
            failed.append(fw["name"])

    return {"installed": installed, "skipped": skipped, "failed": failed}


def _emit(level: str, message: str, **extra):
    try:
        payload = {"event": "log", "level": level, "message": message, **extra}
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    except Exception:
        pass
