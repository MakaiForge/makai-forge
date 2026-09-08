"""game_install_core.detect — detecta se um jogo é instalador ou executável.

Regras:
  1. Arquivo único .exe/.msi → instalador
  2. Pasta com .exe cujo nome contém setup/install/msi (até 2 níveis) → instalador
  3. Senão → portátil (executável), com estatísticas (exe_count, total_files)
"""

import os
import re

from ._util import walk_dir

INSTALLER_PATTERNS = [re.compile(r"setup", re.I),
                      re.compile(r"install", re.I),
                      re.compile(r"msi", re.I)]

SCAN_MAX_DEPTH = 2


def find_installer_in_folder(folder_path: str) -> str | None:
    """Procura .exe com nome de instalador até SCAN_MAX_DEPTH níveis."""
    folder_path = os.path.abspath(folder_path)
    for root, dirs, files in os.walk(folder_path):
        depth = root[len(folder_path):].count(os.sep)
        if depth > SCAN_MAX_DEPTH:
            dirs.clear()
            continue
        for f in files:
            if f.lower().endswith(".exe") and any(p.search(f) for p in INSTALLER_PATTERNS):
                return os.path.join(root, f)
    return None


def detect_installer_type(source_path: str) -> dict:
    """
    Detecta se source_path é instalador ou portátil.

    Returns:
        is_installer: bool
        installer_path: str | None
        source_path: str
        error: str | None
        exe_count: int          — quantos .exe na pasta (se portátil)
        total_files: int        — arquivos totais (se portátil)
    """
    source_path = os.path.abspath(source_path)

    if not os.path.exists(source_path):
        return {"is_installer": False, "installer_path": None, "source_path": source_path,
                "error": "source_path does not exist", "exe_count": 0, "total_files": 0}

    # Arquivo único (.exe/.msi) → sempre instalador
    if os.path.isfile(source_path):
        ext = os.path.splitext(source_path)[1].lower()
        if ext in (".exe", ".msi"):
            return {"is_installer": True, "installer_path": source_path, "source_path": source_path,
                    "exe_count": 0, "total_files": 0}
        return {"is_installer": False, "installer_path": None, "source_path": source_path,
                "exe_count": 0, "total_files": 0}

    # Pasta → procurar .exe com nome de instalador
    installer = find_installer_in_folder(source_path)
    if installer:
        return {"is_installer": True, "installer_path": installer, "source_path": source_path,
                "exe_count": 0, "total_files": 0}

    # Portátil — coletar estatísticas para validação
    all_files = walk_dir(source_path)
    exe_count = sum(1 for f in all_files if f.lower().endswith(".exe"))

    return {"is_installer": False, "installer_path": None, "source_path": source_path,
            "error": None, "exe_count": exe_count, "total_files": len(all_files)}
