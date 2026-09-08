"""game_install_core.scan — escaneia o prefixo por .exe jogáveis.

Nunca retorna executáveis de diretórios do sistema (case-insensitive):
windows, system32, Program Files, Microsoft.NET etc. — só o que foi
realmente copiado para o drive_c (o jogo).
"""

import os
import re

from ._util import resolve_actual_prefix

SYSTEM_DIRS = {
    "windows", "system32", "syswow64", "system", "winsxs",
    "temp", "tmp", "msdownld.tmp", "cache", "logs",
    "perflogs", "recovery", "boot",
}

NEGATIVE_DIRS = {
    "common files", "internet explorer", "windows media player",
    "windows nt", "msbuild", "reference assemblies",
    "microsoft sdks", "microsoft.net", "windows kits",
    "microsoft sql server",
}

EXCLUDED_EXES = {
    "uninstall.exe", "uninst.exe", "uninst000.exe", "unins000.exe",
    "vc_redist.exe", "vcredist.exe", "vcredist_x86.exe", "vcredist_x64.exe",
    "dotnet.exe", "dotnetfx.exe", "dxsetup.exe", "directx.exe", "dxwebsetup.exe",
}

EXCLUDED_PATTERNS = [
    re.compile(r"^vc_redist", re.I), re.compile(r"^vcredist", re.I),
    re.compile(r"^dotnet", re.I), re.compile(r"^dxsetup", re.I),
    re.compile(r"^unins", re.I), re.compile(r"^uninst", re.I),
    re.compile(r"redist", re.I),
]

GAME_EXE_PATTERNS = [
    re.compile(r"^game\.exe$", re.I),
    re.compile(r".+-win64-shipping\.exe$", re.I),
    re.compile(r".+-win32-shipping\.exe$", re.I),
    re.compile(r".+_windows\.exe$", re.I),
    re.compile(r"^nw\.exe$", re.I),
]

LAUNCHER_PATTERNS = [
    re.compile(r"^launcher\.exe$", re.I),
    re.compile(r"^start(?:er|_game|_app|\.exe)?$", re.I),
    re.compile(r"^patcher\.exe$", re.I),
    re.compile(r"^updater\.exe$", re.I),
    re.compile(r"^makai_time\.exe$", re.I),
]

SETUP_PATTERNS = [
    re.compile(r"^setup", re.I),
    re.compile(r"^install", re.I),
    re.compile(r"^autorun", re.I),
]

MAX_CANDIDATES = 10


def classify_exe(name: str) -> str:
    """Classifica executável em: game, launcher, setup, redist, unknown."""
    name_lower = name.lower()

    if any(p.search(name) for p in SETUP_PATTERNS):
        return "setup"
    if name_lower in EXCLUDED_EXES:
        return "redist"
    if any(p.search(name) for p in EXCLUDED_PATTERNS):
        return "redist"
    if any(p.search(name) for p in LAUNCHER_PATTERNS):
        return "launcher"
    if any(p.search(name) for p in GAME_EXE_PATTERNS):
        return "game"

    return "unknown"


def scan_prefix_for_exes(prefix_path: str,
                         game_folder_name: str | None = None) -> dict:
    """
    Escaneia drive_c por .exe jogáveis.

    Args:
        prefix_path: caminho do prefixo Wine.
        game_folder_name: nome da pasta do jogo (para matching exato).

    Returns:
        candidates: [{path, name, size, type}]
        suggested_dir: str | None
    """
    prefix_path = os.path.expanduser(prefix_path)
    actual = resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")

    if not os.path.isdir(drive_c):
        return {"candidates": [], "suggested_dir": None}

    results: list[dict] = []

    def scan(dir_path: str, depth: int = 0):
        if depth > 6:
            return
        base = os.path.basename(dir_path).lower()
        if base in SYSTEM_DIRS or base in NEGATIVE_DIRS:
            return
        try:
            with os.scandir(dir_path) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        scan(entry.path, depth + 1)
                    elif (entry.is_file(follow_symlinks=False)
                          and entry.name.lower().endswith(".exe")):
                        name_lower = entry.name.lower()
                        if name_lower in EXCLUDED_EXES:
                            continue
                        if any(p.search(entry.name) for p in EXCLUDED_PATTERNS):
                            continue
                        try:
                            st = entry.stat()
                            if st.st_size > 1024:
                                exe_type = classify_exe(entry.name)
                                # Se tem game_folder_name, tenta match exato
                                if (exe_type == "unknown"
                                        and game_folder_name
                                        and os.path.splitext(entry.name)[0].lower()
                                        == os.path.splitext(game_folder_name)[0].lower()):
                                    exe_type = "game"
                                results.append({
                                    "path": entry.path,
                                    "name": entry.name,
                                    "size": st.st_size,
                                    "type": exe_type,
                                })
                        except OSError:
                            pass
        except PermissionError:
            pass
        except OSError:
            pass

    scan(drive_c)

    results.sort(key=lambda r: r.get("size", 0), reverse=True)
    candidates = results[:MAX_CANDIDATES]

    suggested_dir = os.path.dirname(candidates[0]["path"]) if candidates else drive_c

    return {"candidates": candidates, "suggested_dir": suggested_dir}
