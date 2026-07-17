"""Leitor de prefixo Wine/Proton.

Analisa o diretório de prefixo para identificar qual Proton foi usado
para criar o prefixo, lendo config_info e version.
"""

import os


def read_prefix_version(prefix_path: str) -> str | None:
    """Lê o arquivo 'version' do prefixo.

    Exemplo: 'CachyOS-11.0-100'
    """
    version_file = os.path.join(prefix_path, "version")
    if os.path.isfile(version_file):
        try:
            with open(version_file) as f:
                return f.read().strip()
        except OSError:
            pass
    return None


def read_prefix_config_info(prefix_path: str) -> dict:
    """Lê o arquivo 'config_info' do prefixo.

    Formato (linha a linha):
      Linha 0: nome da versão (ex: 'CachyOS-11.0-100')
      Linha 1: path de fonts (ex: .../files/share/fonts/)
      Linha 2: path de lib (ex: .../files/lib/)
      Linha 3-5: números (flags)
      Linha 6: vazio
      Linha 7: path de default_pfx
      Linha 8: timestamp
      Linha 9-10: bools
      Linha 11: DLLs tracked
      Linha 12-13: bools

    Returns dict com campos conhecidos.
    """
    config_file = os.path.join(prefix_path, "config_info")
    if not os.path.isfile(config_file):
        return {}

    try:
        with open(config_file) as f:
            lines = f.read().splitlines()
    except OSError:
        return {}

    info = {}
    if len(lines) > 0:
        info["version_name"] = lines[0].strip()
    if len(lines) > 1:
        info["fonts_path"] = lines[1].strip()
    if len(lines) > 2:
        info["lib_path"] = lines[2].strip()
    if len(lines) > 7:
        info["default_pfx_path"] = lines[7].strip()

    # Extrair caminho do Proton de qualquer path que aponte para files/
    for key in ("lib_path", "fonts_path", "default_pfx_path"):
        path = info.get(key)
        if path:
            parts = path.split(os.sep)
            try:
                files_idx = parts.index("files")
                proton_root = os.sep.join(parts[:files_idx])
                info["proton_path"] = proton_root
                break
            except ValueError:
                continue

    return info


def proton_path_from_prefix(prefix_path: str) -> str | None:
    """Extrai o caminho do Proton do config_info.

    Returns: caminho absoluto do Proton ou None.
    """
    info = read_prefix_config_info(prefix_path)
    proton_path = info.get("proton_path")
    if proton_path and os.path.isdir(proton_path):
        return proton_path
    return None


def detect_proton_from_prefix(prefix_path: str) -> str | None:
    """Detecta qual fork de Proton gerou este prefixo.

    Tenta:
    1. config_info → caminho do Proton → identify_proton()
    2. version → match com nome do fork no catálogo

    Returns: fork_id (ex: 'proton-cachyos') ou None.
    """
    from makrun.intel import identify_proton, PROTON_KNOWLEDGE

    # 1. config_info: caminho real do Proton
    proton_path = proton_path_from_prefix(prefix_path)
    if proton_path:
        fork_id = identify_proton(proton_path)
        if fork_id:
            return fork_id

    # 2. version: match por nome
    version_name = read_prefix_version(prefix_path)
    if version_name:
        vn_lower = version_name.lower().replace("-", "").replace(" ", "")
        for fork_id, definition in PROTON_KNOWLEDGE.items():
            name = definition.get("name", "").lower().replace("-", "").replace(" ", "")
            if name and name in vn_lower:
                return fork_id

    return None
