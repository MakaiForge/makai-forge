"""Scanner do prefixo Wine/Proton — lê registry, DLLs, versões e componentes."""

import os
import re
import shutil
from pathlib import Path
from typing import Optional


def _read_reg_file(path: Path) -> dict[str, str]:
    """Lê um arquivo de registro Wine (system.reg, user.reg) e retorna dict chave->valor."""
    result = {}
    if not path.exists():
        return result
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return result
    current_key = ""
    for line in text.splitlines():
        if line.startswith("[") and line.endswith("]"):
            current_key = line[1:-1]
        elif "=" in line and current_key:
            k, _, v = line.partition("=")
            result[f"{current_key}\\{k.strip()}"] = v.strip().strip('"')
    return result


def detect_wine_version(prefix_path: str) -> Optional[str]:
    """Detecta a versão do Wine a partir do system.reg."""
    reg = _read_reg_file(Path(prefix_path) / "system.reg")
    for key, val in reg.items():
        if "CurrentVersion" in key and "Wine" in val:
            m = re.search(r"(\d+\.\d+)", val)
            if m:
                return m.group(1)
    return None


def detect_arch(prefix_path: str) -> str:
    """Detecta arquitetura do prefixo (win32/win64)."""
    syswow64 = Path(prefix_path) / "drive_c" / "windows" / "syswow64"
    return "win64" if syswow64.exists() else "win32"


def detect_windows_version(prefix_path: str) -> Optional[str]:
    """Detecta a versão do Windows configurada no prefixo."""
    reg = _read_reg_file(Path(prefix_path) / "system.reg")
    for key, val in reg.items():
        if 'Software\\\\Microsoft\\\\Windows\\\\CurrentVersion' in key and 'ProductName' in key:
            return val
    return None


def detect_mono(prefix_path: str) -> bool:
    """Verifica se Wine Mono está instalado."""
    mono_path = Path(prefix_path) / "drive_c" / "windows" / "mono"
    return mono_path.exists()


def detect_gecko(prefix_path: str) -> bool:
    """Verifica se Wine Gecko está instalado."""
    gecko_path = Path(prefix_path) / "drive_c" / "windows" / "gecko"
    return gecko_path.exists()


def detect_dxvk(prefix_path: str) -> bool:
    """Verifica se DXVK está instalado (dxgi.dll nativa)."""
    for arch in ["system32", "syswow64"]:
        dll = Path(prefix_path) / "drive_c" / "windows" / arch / "dxgi.dll"
        if dll.exists():
            return True
    return False


def detect_vkd3d(prefix_path: str) -> bool:
    """Verifica se VKD3D-Proton está instalado (d3d12.dll nativa)."""
    for arch in ["system32", "syswow64"]:
        dll = Path(prefix_path) / "drive_c" / "windows" / arch / "d3d12.dll"
        if dll.exists():
            return True
    return False


def list_installed_dlls(prefix_path: str) -> list[str]:
    """Lista todas as DLLs em system32 e syswow64."""
    dlls = []
    for arch in ["system32", "syswow64"]:
        dll_dir = Path(prefix_path) / "drive_c" / "windows" / arch
        if dll_dir.exists():
            for f in dll_dir.iterdir():
                if f.suffix.lower() in (".dll", ".exe"):
                    dlls.append(f.name)
    return sorted(set(dlls))


def check_registry_key(prefix_path: str, key_path: str) -> bool:
    """Verifica se uma chave de registro existe no prefixo."""
    # Converte HKLM\... para o formato do system.reg
    norm = key_path.replace("HKLM\\", "").replace("HKEY_LOCAL_MACHINE\\", "")
    reg = _read_reg_file(Path(prefix_path) / "system.reg")
    for key in reg:
        if norm in key:
            return True
    return False


def check_dll_exists(prefix_path: str, dll_name: str) -> bool:
    """Verifica se uma DLL existe no prefixo."""
    for arch in ["system32", "syswow64"]:
        dll = Path(prefix_path) / "drive_c" / "windows" / arch / dll_name
        if dll.exists():
            return True
    return False


def scan(prefix_path: str) -> dict:
    """Escaneia o prefixo e retorna um relatório completo."""
    return {
        "wine_version": detect_wine_version(prefix_path),
        "arch": detect_arch(prefix_path),
        "windows_version": detect_windows_version(prefix_path),
        "mono_installed": detect_mono(prefix_path),
        "gecko_installed": detect_gecko(prefix_path),
        "dxvk_installed": detect_dxvk(prefix_path),
        "vkd3d_installed": detect_vkd3d(prefix_path),
        "dlls": list_installed_dlls(prefix_path),
        "prefix_path": prefix_path,
    }
