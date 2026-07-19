"""
core/engine/external_tool_installer.py — Instalação de external tools (SSEEdit, LOOT, WolvenKit, etc.)

ExternalToolDef:
  name        - Nome exibido
  exeName     - Nome do executável
  downloadUrl - URL direta (zip/7z) — opcional
  detector    - {file?, folder?} para checar se já instalado
  innerFolder - Pasta dentro do zip com os arquivos
  useProton   - Se true, lança via Proton
  args        - Args extras ao lançar
"""

import json
import os
import shutil
import sys
import tempfile
import urllib.request

_BASE_TOOLS_DIR = os.path.expanduser("~/.config/makai-forger/tools")

# ─── Definições ──────────────────────────────────────────────────

_BETHESA_TOOLS = [
    {"name": "SSEEdit", "exeName": "SSEEdit.exe", "searchPaths": ["."]},
    {"name": "FNIS", "exeName": "FNIS.exe", "searchPaths": ["."]},
    {"name": "BodySlide", "exeName": "BodySlide.exe", "searchPaths": ["."]},
    {"name": "Outfit Studio", "exeName": "OutfitStudio.exe", "searchPaths": ["."]},
    {"name": "LOOT", "exeName": "LOOT.exe", "searchPaths": ["."]},
    {"name": "Wrye Bash", "exeName": "Wrye Bash.exe", "searchPaths": ["."]},
    {"name": "Creation Kit", "exeName": "CreationKit.exe", "searchPaths": ["."]},
    {"name": "zEdit", "exeName": "zEdit.exe", "searchPaths": ["."]},
    {"name": "Cathedral Assets Optimizer", "exeName": "CAO.exe", "searchPaths": ["."]},
    {"name": "Nemesis", "exeName": "Nemesis Unlimited Behavior Engine.exe", "searchPaths": ["."]},
    {"name": "BethINI", "exeName": "BethINI.exe", "searchPaths": ["."]},
]

_SKYRIM_TOOLS = [
    {"name": "SSEEdit", "exeName": "xTESEdit64.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z",
     "detector": {"file": "xTESEdit64.exe"}},
    {"name": "LOOT", "exeName": "LOOT.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/loot/loot/releases/latest/download/loot_0.29.1-win64.7z",
     "detector": {"file": "LOOT.exe"}},
    {"name": "Wrye Bash", "exeName": "Wrye Bash.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/Wrye-Bash/Wrye-Bash/releases/latest/download/Wrye.Bash.314.-.Standalone.Executable.7z",
     "innerFolder": "Mopy", "detector": {"file": "Wrye Bash.exe"}},
    {"name": "zEdit", "exeName": "zEdit.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/z-edit/zedit/releases/download/0.6.7/zEdit_v0.6.7_-_Portable_x64.7z",
     "detector": {"file": "zEdit.exe"}},
    {"name": "ESLifier", "exeName": "ESLifier.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/MaskPlague/ESLifier/releases/download/v0.15.3/ESLifier.zip",
     "detector": {"file": "ESLifier.exe"}},
    {"name": "Pandora Behavior Engine+", "exeName": "Pandora Behaviour Engine+.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/Monitor221hz/Pandora-Behaviour-Engine-Plus/releases/latest/download/Pandora_Behaviour_Engine_v4.3.1-beta_win-x64_net.zip",
     "detector": {"file": "Pandora Behaviour Engine+.exe"}},
    {"name": "FNIS", "exeName": "FNIS.exe", "searchPaths": ["."]},
    {"name": "BodySlide", "exeName": "BodySlide.exe", "searchPaths": ["."]},
    {"name": "Outfit Studio", "exeName": "OutfitStudio.exe", "searchPaths": ["."]},
    {"name": "Creation Kit", "exeName": "CreationKit.exe", "searchPaths": ["."]},
    {"name": "Cathedral Assets Optimizer", "exeName": "CAO.exe", "searchPaths": ["."]},
    {"name": "Nemesis", "exeName": "Nemesis Unlimited Behavior Engine.exe", "searchPaths": ["."]},
    {"name": "BethINI", "exeName": "BethINI.exe", "searchPaths": ["."]},
    {"name": "DynDOLOD", "exeName": "DynDOLODx64.exe", "searchPaths": ["."]},
    {"name": "TexGen", "exeName": "TexGenx64.exe", "searchPaths": ["."]},
    {"name": "xLODGen", "exeName": "xLODGenx64.exe", "searchPaths": ["."]},
    {"name": "VRAMr", "exeName": "VRAMr.exe", "searchPaths": ["."]},
    {"name": "BENDr", "exeName": "BENDr.exe", "searchPaths": ["."]},
    {"name": "ParallaxR", "exeName": "ParallaxR.exe", "searchPaths": ["."]},
]

_MORROWIND_TOOLS = [
    {"name": "TES3Edit", "exeName": "TES3Edit.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/TES5Edit/TES5Edit/releases/latest/download/xEdit.4.1.5f.7z",
     "detector": {"file": "TES3Edit.exe"}},
    {"name": "LOOT", "exeName": "LOOT.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/loot/loot/releases/latest/download/loot_0.29.1-win64.7z",
     "detector": {"file": "LOOT.exe"}},
    {"name": "Wrye Mash", "exeName": "Wrye Mash.exe", "searchPaths": ["."]},
    {"name": "Construction Set", "exeName": "TESConstructionSet.exe", "searchPaths": ["."]},
    {"name": "MWSE", "exeName": "mwse_loader.exe", "searchPaths": ["."],
     "downloadUrl": "https://github.com/MWSE/MWSE/releases/download/2.1/MWSE-2.1.7z",
     "detector": {"file": "mwse_loader.exe"}},
    {"name": "MGE XE", "exeName": "MGEXEgui.exe", "searchPaths": ["."]},
]

_GAME_TOOLS: dict[str, list[dict]] = {
    "skyrim": _SKYRIM_TOOLS,
    "skyrim_se": _SKYRIM_TOOLS,
    "enderal": _SKYRIM_TOOLS,
    "fallout3": _BETHESA_TOOLS,
    "fallout4": _BETHESA_TOOLS,
    "fallout4_vr": _BETHESA_TOOLS,
    "falloutnv": _BETHESA_TOOLS,
    "oblivion": _BETHESA_TOOLS,
    "starfield": _BETHESA_TOOLS,
    "morrowind": _MORROWIND_TOOLS,
    "cyberpunk2077": [
        {"name": "WolvenKit", "exeName": "WolvenKit.exe", "searchPaths": ["."],
         "downloadUrl": "https://github.com/WolvenKit/WolvenKit/releases/download/8.19.0/WolvenKit-8.19.0.zip",
         "detector": {"file": "WolvenKit.exe"}, "useProton": True},
        {"name": "ArchiveXL", "exeName": "", "searchPaths": []},
        {"name": "TweakXL", "exeName": "", "searchPaths": []},
        {"name": "Codeware", "exeName": "", "searchPaths": []},
    ],
    "larian": [
        {"name": "BG3 Mod Manager", "exeName": "bg3mm.exe", "searchPaths": ["."]},
    ],
    "witcher3": [
        {"name": "Script Merger", "exeName": "ScriptMerger.exe", "searchPaths": ["."]},
        {"name": "Witcher 3 Mod Limit Fix", "exeName": "", "searchPaths": []},
    ],
}


def get_tools(game_id: str) -> list[dict]:
    return _GAME_TOOLS.get(game_id, [])


def is_tool_installed(game_id: str, tool: dict) -> bool:
    tool_dir = _get_tool_install_dir(game_id, tool["name"])
    detector = tool.get("detector") or {}
    folder = detector.get("folder")
    file = detector.get("file")
    if folder:
        return os.path.isdir(os.path.join(tool_dir, folder))
    if file:
        return os.path.isfile(os.path.join(tool_dir, file))
    exe = tool.get("exeName")
    if exe:
        return os.path.isfile(os.path.join(tool_dir, exe))
    return os.path.isdir(tool_dir)


def resolve_tool_path(game_id: str, tool: dict) -> str | None:
    tool_dir = _get_tool_install_dir(game_id, tool["name"])
    detector = tool.get("detector") or {}
    if detector.get("file"):
        p = os.path.join(tool_dir, detector["file"])
        if os.path.isfile(p):
            return p
    if detector.get("folder"):
        p = os.path.join(tool_dir, detector["folder"], tool.get("exeName", ""))
        if os.path.isfile(p):
            return p
    exe = tool.get("exeName")
    if exe:
        p = os.path.join(tool_dir, exe)
        if os.path.isfile(p):
            return p
    return None


def _get_tool_install_dir(game_id: str, tool_name: str) -> str:
    safe = tool_name.replace("/", "_").replace("\\", "_")
    return os.path.join(_BASE_TOOLS_DIR, game_id, safe)


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


def _get_inner_dir(extract_dir: str, tool: dict) -> str:
    inner = tool.get("innerFolder")
    if inner:
        p = os.path.join(extract_dir, inner)
        if os.path.isdir(p):
            return p
    entries = os.listdir(extract_dir)
    dirs = [e for e in entries if os.path.isdir(os.path.join(extract_dir, e))]
    files = [e for e in entries if os.path.isfile(os.path.join(extract_dir, e))]
    if len(dirs) == 1 and len(files) == 0:
        return os.path.join(extract_dir, dirs[0])
    return extract_dir


def install_tool(game_id: str, tool: dict) -> bool:
    url = tool.get("downloadUrl")
    if not url:
        return False

    tool_dir = _get_tool_install_dir(game_id, tool["name"])

    with tempfile.TemporaryDirectory(prefix=f"tool-{tool['name']}-") as tmpdir:
        ext = ".7z" if url.lower().endswith(".7z") else ".zip"
        archive_path = os.path.join(tmpdir, f"tool{ext}")

        _emit("log", level="info", message=f"Baixando {tool['name']}...")
        try:
            urllib.request.urlretrieve(url, archive_path)
        except Exception as e:
            _emit("log", level="warn", message=f"Download {tool['name']} falhou: {e}")
            return False

        if not os.path.isfile(archive_path) or os.path.getsize(archive_path) == 0:
            _emit("log", level="warn", message=f"Download {tool['name']} vazio")
            return False

        _emit("log", level="info", message=f"Extraindo {tool['name']}...")
        extract_dir = os.path.join(tmpdir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)
        if not _extract_archive(archive_path, extract_dir):
            _emit("log", level="warn", message=f"Extração {tool['name']} falhou")
            return False

        source_dir = _get_inner_dir(extract_dir, tool)

        _emit("log", level="info", message=f"Instalando {tool['name']}...")
        os.makedirs(tool_dir, exist_ok=True)
        _copy_recursive(source_dir, tool_dir)

        installed = is_tool_installed(game_id, tool)
        if installed:
            _emit("log", level="info", message=f"{tool['name']} instalado em {tool_dir}")
        else:
            _emit("log", level="warn", message=f"{tool['name']}: exe não encontrado")
        return installed


def ensure_tools(game_id: str) -> dict:
    tools = get_tools(game_id)
    installed = []
    skipped = []
    failed = []

    downloadable = [t for t in tools if t.get("downloadUrl")]
    for tool in downloadable:
        if is_tool_installed(game_id, tool):
            _emit("log", level="info", message=f"{tool['name']} já instalado")
            skipped.append(tool["name"])
            continue
        ok = install_tool(game_id, tool)
        if ok:
            installed.append(tool["name"])
        else:
            failed.append(tool["name"])

    return {"installed": installed, "skipped": skipped, "failed": failed}


def _emit(level: str, message: str, **extra):
    try:
        payload = {"event": "log", "level": level, "message": message, **extra}
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    except Exception:
        pass
