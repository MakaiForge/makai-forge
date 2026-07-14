"""
core/engine/registry.py — Operações no registro do Wine.

Aplica DLL overrides, registry patches (ex: Bethesda),
e configurações específicas do jogo via user.reg/system.reg.
"""

import os
import shutil
import subprocess
import re

MAKAITRICKS_PATH = os.path.expanduser(
    "~/Documentos/Makai-forge/data/install-api/Makaitricks"
)


def apply_dll_overrides(prefix_path: str, dlls: list[dict]) -> bool:
    """
    Aplica DLL overrides no user.reg do prefixo.

    Args:
        prefix_path: Caminho do wrapper de prefixo
        dlls: Lista de dicts com 'name' e 'type' (ex: {'name': 'winmm', 'type': 'native'})

    Returns:
        True se sucesso
    """
    user_reg = os.path.join(prefix_path, "pfx", "user.reg")
    if not os.path.exists(user_reg):
        return False

    try:
        with open(user_reg, "r") as f:
            content = f.read()
    except OSError:
        return False

    # Garante que a seção [Software\\Wine\\DllOverrides] existe
    section = "[Software\\\\Wine\\\\DllOverrides]"
    if section not in content:
        # Adiciona antes do final do arquivo
        content = content.rstrip() + f"\n\n{section}\n"
        for dll in dlls:
            content += f"\"{dll['name']}\"=\"{dll['type']}\"\n"
        content += "\n"
    else:
        # Atualiza ou adiciona entries na seção existente
        lines = content.split("\n")
        in_section = False
        new_lines = []
        added = set()

        for line in lines:
            if section in line:
                in_section = True
                new_lines.append(line)
                continue
            if in_section:
                if line.startswith("["):
                    # Fim da seção — adiciona faltantes antes
                    for dll in dlls:
                        if dll["name"] not in added:
                            new_lines.append(f'"{dll["name"]}"="{dll["type"]}"')
                            added.add(dll["name"])
                    in_section = False
                    new_lines.append(line)
                    continue
                # Verifica se linha já existe
                for dll in dlls:
                    if line.startswith(f'"{dll["name"]}"'):
                        added.add(dll["name"])
                        # Atualiza valor se diferente
                        parts = line.split("=", 1)
                        if len(parts) == 2 and parts[1].strip(f'"{1}') != dll["type"]:
                            line = f'"{dll["name"]}"="{dll["type"]}"'
                        break
                new_lines.append(line)
            else:
                new_lines.append(line)

        # Se sobrou DLL não adicionada, adiciona no final
        if added != {d["name"] for d in dlls}:
            for dll in dlls:
                if dll["name"] not in added:
                    new_lines.append(f'"{dll["name"]}"="{dll["type"]}"')

        content = "\n".join(new_lines)

    try:
        with open(user_reg, "w") as f:
            f.write(content)
        return True
    except OSError:
        return False


def apply_registry_file(prefix_path: str, reg_file: str) -> bool:
    """
    Importa um arquivo .reg no prefixo via regedit.

    Args:
        prefix_path: Caminho do wrapper de prefixo
        reg_file: Caminho para o arquivo .reg

    Returns:
        True se sucesso
    """
    if not os.path.exists(reg_file):
        return False

    proton_path = _find_proton_in_prefix(prefix_path)
    if not proton_path:
        return False

    env = os.environ.copy()
    env["STEAM_COMPAT_DATA_PATH"] = prefix_path
    env["WINEPREFIX"] = os.path.join(prefix_path, "pfx")

    try:
        subprocess.run(
            [proton_path, "run", "regedit", reg_file],
            env=env,
            timeout=30,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_makaitricks(prefix_path: str, components: list[str], proton_path: str) -> dict:
    """
    Executa o Makaitricks para instalar componentes no prefixo.

    Args:
        prefix_path: Caminho do wrapper
        components: Lista de componentes (ex: ["vcrun2022", "dxvk"])
        proton_path: Caminho do Proton

    Returns:
        dict com sucesso e log
    """
    if not components:
        return {"success": True, "log": []}

    env = os.environ.copy()
    env["STEAM_COMPAT_DATA_PATH"] = prefix_path
    env["WINEPREFIX"] = os.path.join(prefix_path, "pfx")

    results = []
    all_ok = True

    for component in components:
        try:
            result = subprocess.run(
                [MAKAITRICKS_PATH, component],
                env=env,
                timeout=120,
                capture_output=True,
                text=True,
            )
            ok = result.returncode == 0
            results.append({"component": component, "success": ok, "output": result.stdout[-200:] if result.stdout else ""})
            if not ok:
                all_ok = False
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            results.append({"component": component, "success": False, "error": str(e)})
            all_ok = False

    return {"success": all_ok, "log": results}


def _find_proton_in_prefix(prefix_path: str) -> str | None:
    """Tenta encontrar o Proton associado a este prefixo."""
    # Verifica proton_binary no storage
    try:
        from core import storage
        proton_binary = storage.get("proton_binary")
        if proton_binary and os.path.isfile(proton_binary):
            return proton_binary
    except ImportError:
        pass

    # Procura em compatibilitytools.d
    from .proton import find_proton
    return find_proton(None)
