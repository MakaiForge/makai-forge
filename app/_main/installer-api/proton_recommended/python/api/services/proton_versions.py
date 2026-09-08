"""
Detecção de versões de Proton instaladas no sistema.

Escaneia os diretórios padrão do Steam e da API pra listar
todas as versões de Proton disponíveis.

Diretórios escaneados:
1. ~/.steam/steam/steamapps/common/ (Proton Steam oficial)
2. ~/.steam/steam/compatibilitytools.d/ (Proton GE, CachyOS, etc.)
3. /usr/share/steam/compatibilitytools.d/ (sistema)
4. ~/.local/share/protonforge/compat-tools/compatibilitytools.d/ (API)

Cada Proton válido tem:
- proton (binário executável)
- toolmanifest.vdf (manifesto do Steam)
"""

import os
import subprocess


def _is_valid_proton(directory_path: str) -> bool:
    """Verifica se um diretório contém um Proton válido.

    Args:
        directory_path: Caminho do diretório

    Retorna:
        True se o diretório contém os arquivos esperados
    """
    proton_file = os.path.join(directory_path, "proton")
    tool_manifest = os.path.join(directory_path, "toolmanifest.vdf")

    # Alguns forks (GE) nem sempre tem toolmanifest.vdf
    # Mas sempre tem o binário 'proton'
    if os.path.isfile(proton_file):
        return True

    return os.path.isfile(tool_manifest)


def get_installed_protons() -> list[dict]:
    """Escaneia e retorna todas as versões de Proton instaladas.

    Retorna:
        Lista de dicts com name, path, source

        source pode ser:
        - "steam": Proton oficial da Valve (steamapps/common)
        - "compatibility_tools": Steam compatibilitytools.d
        - "system": /usr/share/steam/compatibilitytools.d/
        - "api": Gerenciado pela ProtonForge API
    """
    home = os.path.expanduser("~")
    versions = []

    # Caminhos a escanear
    scan_paths = [
        (
            os.path.join(home, ".steam", "steam", "steamapps", "common"),
            "steam",
        ),
        (
            os.path.join(home, ".steam", "steam", "compatibilitytools.d"),
            "compatibility_tools",
        ),
        (
            "/usr/share/steam/compatibilitytools.d",
            "system",
        ),
    ]

    # Diretórios gerenciados pela ProtonForge API / Compact Flow
    protonforge_config = os.path.join(
        home, ".config", "protonforge", "compat-tools", "compatibilitytools.d"
    )
    if os.path.isdir(protonforge_config):
        scan_paths.append((protonforge_config, "api"))

    # Diretório gerenciado pelo Makai Forge
    makai_config = os.path.join(
        home, ".config", "makai-forger", "compat-tools", "compatibilitytools.d"
    )
    if os.path.isdir(makai_config):
        scan_paths.append((makai_config, "api"))

    # Legacy: ~/.local/share/protonforge/
    legacy_api = os.path.join(
        home, ".local", "share", "protonforge", "compat-tools", "compatibilitytools.d"
    )
    if os.path.isdir(legacy_api) and legacy_api not in scan_paths:
        scan_paths.append((legacy_api, "api"))

    seen_paths = set()

    for base_path, source in scan_paths:
        if not os.path.isdir(base_path):
            continue

        try:
            entries = os.listdir(base_path)
        except PermissionError:
            continue

        for entry in entries:
            entry_path = os.path.join(base_path, entry)
            if not os.path.isdir(entry_path):
                continue

            real_path = os.path.realpath(entry_path)
            if real_path in seen_paths:
                continue
            seen_paths.add(real_path)

            if _is_valid_proton(entry_path):
                versions.append({
                    "name": entry,
                    "path": real_path,
                    "source": source,
                })

    # Ordena alfabeticamente
    versions.sort(key=lambda v: v["name"].lower())

    return versions


def validate_proton_path(proton_path: str) -> dict:
    """Valida se um caminho específico é um Proton funcional.

    Args:
        proton_path: Caminho absoluto pro diretório do Proton

    Retorna:
        Dict com valid (bool), name, version, error (se houver)
    """
    if not os.path.isdir(proton_path):
        return {
            "valid": False,
            "name": os.path.basename(proton_path),
            "version": None,
            "error": "Diretório não encontrado",
        }

    if not _is_valid_proton(proton_path):
        return {
            "valid": False,
            "name": os.path.basename(proton_path),
            "version": None,
            "error": "Proton inválido — arquivo 'proton' ou 'toolmanifest.vdf' não encontrado",
        }

    version = os.path.basename(proton_path)

    return {
        "valid": True,
        "name": os.path.basename(proton_path),
        "version": version,
        "error": None,
    }
