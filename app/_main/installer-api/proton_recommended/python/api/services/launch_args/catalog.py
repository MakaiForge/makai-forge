"""
Catálogo de launch args mais comuns para Proton.

Fonte principal: launch_args.json (68 args categorizados)
Aqui estão os 12 args mais úteis para configuração automática.
"""

COMMON_ARGS = {
    "DXVK_ASYNC": {
        "desc": "Compilação assíncrona de shaders. Reduz stutter drasticamente.",
        "fork_support": ["ge-proton", "proton-cachyos", "dw-proton"],
        "value": "1",
    },
    "DXVK_FRAME_RATE": {
        "desc": "Limita FPS via DXVK. Afeta jogos D3D9/10/11.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em", "dw-proton"],
        "value": "0",
    },
    "VKD3D_CONFIG": {
        "desc": "Configura VKD3D-Proton. dxr = Ray Tracing.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em"],
        "value": "",
    },
    "PROTON_ENABLE_NVAPI": {
        "desc": "Habilita NVAPI pra DLSS e Reflex (NVIDIA).",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "dw-proton"],
        "value": "1",
    },
    "PROTON_ENABLE_WAYLAND": {
        "desc": "Força Proton a usar Wayland em vez de XWayland.",
        "fork_support": ["ge-proton", "proton-cachyos", "proton-em"],
        "value": "1",
    },
    "PROTON_USE_WINED3D": {
        "desc": "Usa WineD3D (OpenGL) em vez de DXVK (Vulkan). Mais estável, mais lento.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em", "dw-proton"],
        "value": "1",
    },
    "PROTON_NO_FSYNC": {
        "desc": "Desabilita fsync. Útil em kernels sem suporte a FUTEX_WAIT_MULTIPLE.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em", "dw-proton"],
        "value": "1",
    },
    "PROTON_HEAP_DELAY_FREE": {
        "desc": "Atrasta liberação de memória. Contorna use-after-free em alguns jogos.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos"],
        "value": "1",
    },
    "PULSE_LATENCY_MSEC": {
        "desc": "Ajusta buffer do PulseAudio. 60 = seguro pra eliminar estalos.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em", "dw-proton"],
        "value": "60",
    },
    "WINEDLLOVERRIDES": {
        "desc": "Sobrescreve ordem de carregamento de DLLs.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos", "proton-em", "dw-proton"],
        "value": "",
    },
    "MANGOHUD": {
        "desc": "Overlay de desempenho (FPS, temperaturas). Requer pacote mangohud.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos"],
        "value": "1",
    },
    "GAMEMODE": {
        "desc": "Otimiza CPU governor, IO priority, scheduler. Requer pacote gamemode.",
        "fork_support": ["valve", "ge-proton", "proton-cachyos"],
        "value": "gamemoderun",
    },
}
