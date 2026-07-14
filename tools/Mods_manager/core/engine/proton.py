"""
core/engine/proton.py — Gerenciamento de Proton.

Encontra, valida e retorna o caminho do Proton
a partir da configuração do jogo ou da Steam.
"""

import os
import glob

STEAM_COMPAT_TOOLS_DIRS = [
    os.path.expanduser("~/.steam/root/compatibilitytools.d"),
    os.path.expanduser("~/.steam/compatibilitytools.d"),
    os.path.expanduser("~/.local/share/Steam/compatibilitytools.d"),
]


def find_proton(proton_version: str | None) -> str | None:
    """
    Procura o Proton pelo nome da versão nos diretórios
    Steam compatibilitytools.d.

    Args:
        proton_version: Nome da versão (ex: "GE-Proton9-12")

    Returns:
        Caminho completo para o binário proton, ou None se não encontrado.
    """
    if not proton_version:
        return None

    for tools_dir in STEAM_COMPAT_TOOLS_DIRS:
        resolved = os.path.realpath(tools_dir)
        if not os.path.isdir(resolved):
            continue
        try:
            entries = os.listdir(resolved)
        except PermissionError:
            continue

        # Match exato ou case-insensitive
        for entry in entries:
            if not os.path.isdir(os.path.join(resolved, entry)):
                continue
            if entry == proton_version or entry.lower() == proton_version.lower():
                candidate = os.path.join(resolved, entry, "proton")
                if os.path.isfile(candidate):
                    return candidate

    # Tenta dirs com symlink original (sem realpath) como fallback
    for tools_dir in STEAM_COMPAT_TOOLS_DIRS:
        if not os.path.isdir(tools_dir):
            continue
        pattern = os.path.join(tools_dir, f"{proton_version}", "proton")
        matches = glob.glob(pattern)
        if matches and os.path.isfile(matches[0]):
            return matches[0]

    return None


def find_umu_run() -> str | None:
    """Localiza o binário umu-run."""
    import shutil
    candidates = [
        "umu-run",
        "/usr/bin/umu-run",
        "/usr/local/bin/umu-run",
        os.path.expanduser("~/.local/bin/umu-run"),
        os.path.expanduser("~/.cargo/bin/umu-run"),
        os.path.expanduser("~/Documentos/Makai-forge/tools/prefix/umu-run"),
    ]
    for c in candidates:
        path = shutil.which(c)
        if path:
            return path
        if os.path.isfile(c):
            return c
    return None


def find_compatibility_tool_path(game_path: str, steam_app_id: str | None) -> str | None:
    """
    Tenta determinar o Proton a partir do caminho do jogo (Steam).

    Verifica steamapps/common → procura o Proton que o jogo usa.
    """
    if not steam_app_id:
        return None
    # Procura em libraryfolders.vdf
    steam_paths = _find_all_steam_libraries()
    for lib in steam_paths:
        compat_dir = os.path.join(lib, "compatdata", steam_app_id)
        config_vdf = os.path.join(compat_dir, "config_info.vdf")
        if os.path.exists(config_vdf):
            with open(config_vdf) as f:
                for line in f:
                    if '"name"' in line:
                        name = line.split('"')[3]
                        proton = find_proton(name)
                        if proton:
                            return proton
    return None


def _find_all_steam_libraries() -> list[str]:
    """Retorna todas as Steam libraries (pastas steamapps)."""
    libraries = []
    base_steam = os.path.expanduser("~/.steam/steam")
    libraryfolders = os.path.join(base_steam, "steamapps", "libraryfolders.vdf")
    if not os.path.exists(libraryfolders):
        return [os.path.join(base_steam, "steamapps")]

    try:
        with open(libraryfolders) as f:
            for line in f:
                line = line.strip()
                # libraryfolders.vdf: "\t\t\"1\"\t\t\"/path/to/library\""
                if '"' in line and line.count('"') >= 4:
                    parts = line.split('"')
                    path_candidate = parts[-2]
                    if os.path.isdir(path_candidate):
                        libraries.append(os.path.join(path_candidate, "steamapps"))
    except Exception:
        pass

    if not libraries:
        libraries.append(os.path.join(base_steam, "steamapps"))
    return libraries
