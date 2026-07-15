"""Proton configuration injection: DXVK, VKD3D, env vars.

Gera arquivos dxvk.conf, vkd3d_proton.conf e variáveis de ambiente
otimizadas baseadas no hardware detectado.
"""

import os


def dxvk_config(gpu_vendor: str, gpu_driver: str) -> str:
    """Gera conteúdo de dxvk.conf otimizado para o hardware.
    
    Args:
        gpu_vendor: "nvidia", "amd", "intel"
        gpu_driver: versão do driver (ex: "550.120", "Mesa 24.2.0")
    """
    lines = []

    if gpu_vendor == "nvidia":
        lines.extend([
            "# NVIDIA optimized DXVK config",
            "d3d9.maxAvailableMemory = 32768",  # 32GB max report
            "d3d9.numBuffers = 4",
            "d3d11.maxFrameLatency = 1",
            "dxvk.numCompilerThreads = 2",
            "dxvk.enableGraphicsPipelineLibrary = True",
            "dxvk.enableAsync = False",
        ])
    elif gpu_vendor == "amd":
        lines.extend([
            "# AMD optimized DXVK config",
            "d3d9.maxAvailableMemory = 32768",
            "d3d9.numBuffers = 3",
            "d3d11.maxFrameLatency = 1",
            "dxvk.numCompilerThreads = 0",  # Auto
            "dxvk.enableGraphicsPipelineLibrary = True",
            "dxvk.enableAsync = True",  # RADV se beneficia de async
        ])
    elif gpu_vendor == "intel":
        lines.extend([
            "# Intel optimized DXVK config",
            "d3d9.maxAvailableMemory = 16384",
            "d3d9.numBuffers = 3",
            "d3d11.maxFrameLatency = 1",
            "dxvk.numCompilerThreads = 2",
            "dxvk.enableGraphicsPipelineLibrary = True",
        ])

    return "\n".join(lines) + "\n"


def vkd3d_config(gpu_vendor: str) -> str:
    """Gera conteúdo de vkd3d_proton.conf."""
    lines = []

    if gpu_vendor == "nvidia":
        lines.extend([
            "# NVIDIA optimized VKD3D config",
        ])
    elif gpu_vendor == "amd":
        lines.extend([
            "# AMD optimized VKD3D config",
        ])

    return "\n".join(lines) + "\n"


def env_vars(
    gpu_vendor: str,
    sync_method: str,
    hybrid_cpu: bool = False,
    wayland: bool = True,
) -> dict[str, str]:
    """Gera variáveis de ambiente otimizadas.
    
    Args:
        gpu_vendor: "nvidia", "amd", "intel"
        sync_method: "ntsync", "fsync", "esync"
        hybrid_cpu: True se CPU tem P-cores + E-cores
        wayland: True se Wayland está disponível
    """
    env = {}

    # GPU-specific
    if gpu_vendor == "nvidia":
        env["__GL_SHADER_DISK_CACHE"] = "1"
        env["__GL_SHADER_DISK_CACHE_SKIP_CLEANUP"] = "0"
        env["__GL_THREADED_OPTIMIZATIONS"] = "1"
        env["PROTON_HIDE_NVIDIA_GPU"] = "0"
        env["__GLX_VENDOR_LIBRARY_NAME"] = "nvidia"
    elif gpu_vendor == "amd":
        env["RADV_DEBUG"] = ""
        env["RADV_PERFTEST"] = "aco"
        env["ACO_DEBUG"] = ""
    elif gpu_vendor == "intel":
        env["MESA_LOADER_DRIVER_OVERRIDE"] = "iris"

    # Sync method
    if sync_method == "ntsync":
        env["WINENTSYNC"] = "1"
        env["WINEFSYNC"] = "0"
        env["WINEESYNC"] = "0"
        env["STAGING_SHARED_MEMORY"] = "1"
    elif sync_method == "fsync":
        env["WINEFSYNC"] = "1"
        env["WINEESYNC"] = "0"
        env["WINENTSYNC"] = "0"
    else:
        env["WINEFSYNC"] = "0"
        env["WINEESYNC"] = "1"
        env["WINENTSYNC"] = "0"

    # DXVK/VKD3D
    env["DXVK_HUD"] = "0"
    env["DXVK_STATE_CACHE"] = "1"
    env["VKD3D_SHADER_CACHE"] = "1"

    # Display
    if wayland:
        env["SDL_VIDEO_DRIVER"] = "wayland"
        env["GDK_BACKEND"] = "wayland"
        env["QT_QPA_PLATFORM"] = "wayland;xcb"
    else:
        env["SDL_VIDEO_DRIVER"] = "x11"

    # Wine
    env["WINEESYNC"] = env.get("WINEESYNC", "0")
    env["WINEFSYNC"] = env.get("WINEFSYNC", "0")
    env["WINENTSYNC"] = env.get("WINENTSYNC", "0")
    env["WINE"] = "/usr/bin/wine"

    # GStreamer: evitar scan de plugins com arch mismatch (Proton bundled)
    env["GST_PLUGIN_SYSTEM_PATH"] = ""
    env["GST_REGISTRY_FORK"] = "no"

    return env


def write_dxvk_config(prefix_dir: str, gpu_vendor: str, gpu_driver: str) -> str:
    """Escreve dxvk.conf no prefixo.
    
    Returns: caminho do arquivo.
    """
    config_path = os.path.join(prefix_dir, "dxvk.conf")
    content = dxvk_config(gpu_vendor, gpu_driver)
    with open(config_path, "w") as f:
        f.write(content)
    return config_path


def write_vkd3d_config(prefix_dir: str, gpu_vendor: str) -> str:
    """Escreve vkd3d_proton.conf no prefixo."""
    config_path = os.path.join(prefix_dir, "vkd3d_proton.conf")
    content = vkd3d_config(gpu_vendor)
    with open(config_path, "w") as f:
        f.write(content)
    return config_path
