"""Proton Analyzer — inspeção dinâmica do Proton no disco.

Diferente de `intel/__init__.py` que lê definições pré-codadas,
este módulo ANALISA a estrutura real do Proton no filesystem para
detectar capacidades dinamicamente. Usado pelo container builder
para tomar decisões sem hardcode.

Pipeline:
  1. Recebe path do Proton no disco
  2. Inspeciona diretórios, binários, arquivos de manifesto
  3. Retorna dict estruturado com capacidades detectadas
  4. Builder usa esse dict para montar container + env vars
"""

from __future__ import annotations

import os
import re
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.intel.analyzer")


def analyze_proton(proton_path: str | Path) -> dict[str, Any]:
    """Analisa estrutura de um Proton no disco.

    Returns dict com atributos detectados:
    {
        "proton_path": "/path/to/proton",
        "fork_id": "proton-cachyos",  # do intel.identify_proton
        "version": "cachyos-11.0-20260602-slr",
        "wine_version": "",            # detectado via 'wine --version'
        "umu_bootstrap": True/False,   # tem umu.exe?
        "steam_stub": True/False,      # tem steam.exe?
        "nvidia_dlls": True/False,     # tem nvidia-libs bundled?
        "dxvk": True/False,            # tem DXVK?
        "vkd3d": True/False,           # tem VKD3D?
        "ntsync": True/False,          # Proton 11+ suporta NTSYNC?
        "wine_preloader": True/False,  # tem wine-preloader?
        "wine64_preloader": True/False,
        "wine32_preloader": True/False,
        "protonfixes": True/False,     # tem protonfixes/?
        "launch_method": "wine_preloader|wine64|start_unix",
        "container_features": {
            "needs_x11": True,
            "needs_wayland": True,
            "needs_ntsync_dev": True,  # montar /dev/ntsync
            "needs_nvidia_dll_mount": True,
            "nvidia_libs_bundled": True,
        },
        "wine_arch": ["x86_64", "i386"],
        "default_pfx_has_umu": True,
        "x64_lib_dir": "files/lib/wine/x86_64-unix/",
        "x32_lib_dir": "files/lib/wine/i386-unix/",
        "proton_script_lines": 2451,
    }
    """
    base = Path(proton_path).expanduser().resolve()
    if not base.is_dir():
        return {"proton_path": str(base), "error": f"Path not found: {base}"}

    result: dict[str, Any] = {
        "proton_path": str(base),
    }

    # 1. Version file
    result["version"] = _read_version(base)
    result["wine_version"] = ""

    # 2. Wine binaries
    bin_dir = base / "files" / "bin"
    result["wine_binary"] = _check_file(bin_dir, "wine")
    result["wineserver_binary"] = _check_file(bin_dir, "wineserver")

    # 3. Wine preloaders
    result["wine_preloader"] = _check_file(base / "files" / "lib" / "wine" / "x86_64-unix", "wine-preloader")
    result["wine64_preloader"] = _check_file(base / "files" / "lib" / "wine" / "x86_64-unix", "wine64-preloader")
    result["wine32_preloader"] = _check_file(base / "files" / "lib" / "wine" / "i386-unix", "wine-preloader")

    # 4. Bootstrap (umu.exe / steam.exe)
    sys32 = base / "files" / "share" / "default_pfx" / "drive_c" / "windows" / "system32"
    result["umu_bootstrap"] = _check_file(sys32, "umu.exe")
    result["steam_stub"] = _check_file(sys32, "steam.exe")

    # 5. Componentes gráficos
    wine_lib = base / "files" / "lib" / "wine"
    result["dxvk"] = _check_dir(wine_lib, "dxvk")
    result["vkd3d"] = _check_dir(wine_lib, "vkd3d-proton") or _check_dir(wine_lib, "vkd3d")
    result["nvidia_dlls"] = _check_dir(wine_lib, "nvidia-libs")
    result["discord_rpc"] = _check_dir(wine_lib, "discord-rpc-bridge")

    # 6. Protonfixes
    result["protonfixes"] = (base / "protonfixes").is_dir()

    # 7. Detectar método de launch
    if result["wine_preloader"]:
        result["launch_method"] = "wine_preloader"
    elif result["wine_binary"]:
        result["launch_method"] = "wine64"
    else:
        result["launch_method"] = "start_unix"

    # 8. NTSYNC: Proton 11+ detectado pela version string
    result["ntsync"] = _detect_ntsync(base, result.get("version", ""))

    # 9. Wine architectures disponíveis
    arches = []
    if _check_dir(wine_lib, "x86_64-unix"):
        arches.append("x86_64")
    if _check_dir(wine_lib, "i386-unix"):
        arches.append("i386")
    result["wine_arch"] = arches
    result["x64_lib_dir"] = "files/lib/wine/x86_64-unix" if "x86_64" in arches else ""
    result["x32_lib_dir"] = "files/lib/wine/i386-unix" if "i386" in arches else ""

    # 10. Container features
    result["container_features"] = _build_container_features(result, base)

    # 11. Proton script info
    proton_script = base / "proton"
    if proton_script.is_file():
        result["proton_script_lines"] = _count_lines(proton_script)
        result["proton_script_mode"] = oct(proton_script.stat().st_mode)[-3:]
    else:
        result["proton_script_lines"] = 0
        result["proton_script_mode"] = ""

    return result


def _read_version(base: Path) -> str:
    version_file = base / "version"
    if version_file.is_file():
        try:
            text = version_file.read_text().strip()
            # Formato: "1781825334 cachyos-11.0-20260602-slr"
            parts = text.split(None, 1)
            if len(parts) > 1:
                return parts[1]
            return parts[0]
        except OSError:
            return ""
    return ""


def _check_file(directory: Path, filename: str) -> bool:
    return (directory / filename).is_file()


def _check_dir(directory: Path, dirname: str) -> bool:
    return (directory / dirname).is_dir()


def _detect_ntsync(base: Path, version_str: str) -> bool:
    """Detecta suporte a NTSYNC.

    - Proton 11+ tem ntsync
    - Verificar version string contendo 11.x, 12.x etc.
    - Ou verificar se o arquivo version tem número de build recente
    """
    if "11" in version_str or "12" in version_str:
        return True

    version_file = base / "version"
    if version_file.is_file():
        try:
            text = version_file.read_text().strip()
            # Check for Proton 11+ build numbers
            build_match = re.search(r'^(\d+)', text)
            if build_match:
                build = int(build_match.group(1))
                # Build numbers for Proton 11+ typically > 1700000000
                if build > 1700000000:
                    return True
        except (OSError, ValueError):
            pass

    return False


def _build_container_features(analysis: dict, base: Path) -> dict[str, Any]:
    """Deriva container_features da análise estrutural."""
    features: dict[str, Any] = {
        "needs_x11": True,
        "needs_wayland": True,
        "needs_ntsync_dev": analysis.get("ntsync", False),
        "needs_nvidia_dll_mount": analysis.get("nvidia_dlls", False),
        "nvidia_libs_bundled": analysis.get("nvidia_dlls", False),
        "umu_bootstrap": analysis.get("umu_bootstrap", False),
        "use_umu_env": analysis.get("umu_bootstrap", False),
    }

    return features


def _count_lines(path: Path) -> int:
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0
