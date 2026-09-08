"""Container-aware Proton configuration.

Expõe informações do runtime para o Proton via variáveis de ambiente
MAKAI_* que nenhum outro runtime atualmente expõe.

Objetivo: permitir que o Proton tome decisões inteligentes baseadas
no ambiente de container real (GPU real, sync method, CPU topology).
"""

import os


def container_env(
    gpu_vendor: str,
    gpu_driver: str,
    gpu_opengl: str,
    gpu_vulkan: str,
    sync_method: str,
    sync_devices: list[str],
    cpu_cores: int,
    cpu_threads: int,
    cpu_hybrid: bool,
    cpu_p_cores: list[int],
    cpu_e_cores: list[int],
    wayland: bool,
    runtime_name: str,
    overrides_active: bool,
) -> dict[str, str]:
    """Gera variáveis MAKAI_* expondo o ambiente do container.
    
    NENHUM runtime atual faz isso. O Proton (ou qualquer processo dentro
    do container) pode consultar estas variáveis para:
    - Escolher backend gráfico (D3D9/10/11/12)
    - Configurar threading baseado na CPU real
    - Ativar/desativar workarounds por GPU
    - Logging/debug específico do container
    
    Returns: dict com variáveis MAKAI_*.
    """
    env = {}

    # Identificação do runtime
    env["MAKAI_TIME"] = "1"
    env["MAKAI_RUNTIME"] = runtime_name

    # GPU
    env["MAKAI_GPU_VENDOR"] = gpu_vendor.upper()
    env["MAKAI_GPU_DRIVER"] = gpu_driver
    env["MAKAI_GL_VERSION"] = gpu_opengl
    if gpu_vulkan and gpu_vulkan != "unknown":
        env["MAKAI_VULKAN_VERSION"] = gpu_vulkan

    # Sync
    env["MAKAI_SYNC"] = sync_method
    if sync_devices:
        env["MAKAI_SYNC_DEVICES"] = ",".join(sync_devices)

    # CPU
    env["MAKAI_CPU_CORES"] = str(cpu_cores)
    env["MAKAI_CPU_THREADS"] = str(cpu_threads)
    if cpu_hybrid and cpu_p_cores:
        p_str = ",".join(str(c) for c in cpu_p_cores)
        e_str = ",".join(str(c) for c in cpu_e_cores)
        env["MAKAI_CPU_TOPOLOGY"] = f"p-cores:{p_str},e-cores:{e_str}"

    # Display
    env["MAKAI_DISPLAY"] = "wayland" if wayland else "x11"

    # Runtime info
    env["MAKAI_GPU_OVERRIDES"] = "1" if overrides_active else "0"

    return env


def proton_recommendation(
    game_exe_name: str,
    gpu_vendor: str,
    vram_mb: int = 0,
    engine: str | None = None,
) -> dict:
    """Recomenda configurações Proton baseadas no hardware e jogo.
    
    Returns:
    {
        "proton_fork": "GE-Proton" | "UMU-Proton" | "Proton-CachyOS" | None,
        "explanation": "Motivo da recomendação",
        "priority": "critical" | "recommended" | "optional",
    }
    """
    rec = {
        "proton_fork": None,
        "explanation": "Sem recomendação específica",
        "priority": "optional",
    }

    # Jogos D3D12 se beneficiam de forks mais novos (VKD3D atualizado)
    d3d12_games = {
        "cyberpunk2077.exe", "cyberpunk2077", "rdr2.exe", "reddeadredemption2.exe",
        "diabloIV.exe", "diablo4.exe", "hogwartslegacy.exe", "forza5.exe",
        "spiderman.exe", "spider-man.exe", "thewitcher3.exe",
    }

    # Jogos D3D9 se beneficiam de forks com DXVG otimizado
    d3d9_games = {
        "skyrimse.exe", "skyrim.exe", "fallout4.exe", "falloutnv.exe",
        "oblivion.exe", "morrowind.exe", "vampire.exe",
    }

    exe_lower = game_exe_name.lower()

    if exe_lower in d3d12_games:
        if gpu_vendor == "nvidia":
            rec["proton_fork"] = "Proton-CachyOS"
            rec["explanation"] = "Jogo D3D12: Proton-CachyOS tem VKD3D mais recente e patches NVIDIA"
        elif gpu_vendor == "amd":
            rec["proton_fork"] = "UMU-Proton"
            rec["explanation"] = "Jogo D3D12: UMU-Proton tem RADV workarounds"
        rec["priority"] = "recommended"

    elif exe_lower in d3d9_games:
        rec["proton_fork"] = "Proton-CachyOS"
        rec["explanation"] = "Jogo D3D9: DXVK otimizado em Proton-CachyOS"
        rec["priority"] = "optional"

    # Engine-specific
    if engine == "nwjs" or engine == "chromium":
        rec["proton_fork"] = "UMU-Proton"
        rec["explanation"] = "Chromium/NW.js joga melhor com UMU-Proton (wine-wayland patches)"
        rec["priority"] = "recommended"

    return rec
