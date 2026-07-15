"""Engine-specific configuration handlers.

Cada engine conhecida tem workarounds específicos que melhoram
compatibilidade e performance dentro do container.

Engines suportadas:
- bethesda: Creation Engine (Skyrim, Fallout, Oblivion)
- unity: Unity Engine
- unreal: Unreal Engine 3/4/5
- nwjs: NW.js (Chromium) — usado por jogos como How to Raise a Happy NEET
- renpy: Ren'Py visual novel engine
- gamemaker: GameMaker Studio
- rpgmaker: RPG Maker (XP/VX/Ace/MV/MZ)
"""

import os


def bethesda_config(prefix_dir: str) -> dict[str, str]:
    """Configurações para jogos Bethesda (Creation Engine).
    
    Problemas conhecidos:
    - bUseTemporaryFiles=0 no Skyrim (evita corruption de save)
    - Load order precisa ser gerenciado externamente
    - FSBC (file stream buffer cache) causa stutter
    - Havok physics crasha com mais de 60 FPS
    """
    env = {}
    ini_overrides = {}

    # Skyrim SE / AE
    skyrim_prefs = os.path.join(prefix_dir, "drive_c", "users",
                                os.environ.get("USER", "steamuser"),
                                "My Documents", "My Games", "Skyrim Special Edition",
                                "SkyrimPrefs.ini")
    if os.path.isfile(skyrim_prefs):
        env["PROTON_BETHESTA_FIX"] = "1"

    # Fallout 4
    fallout4_prefs = os.path.join(prefix_dir, "drive_c", "users",
                                   os.environ.get("USER", "steamuser"),
                                   "My Documents", "My Games", "Fallout4",
                                   "Fallout4Prefs.ini")
    if os.path.isfile(fallout4_prefs):
        env["PROTON_BETHESTA_FIX"] = "1"

    # Problemas de sync com Bethesda
    env["PROTON_NO_FSYNC"] = "1"
    env["PROTON_NO_ESYNC"] = "0"

    # Desabilitar antialiasing forcing (causa crash em algumas GPUs)
    env["__GL_YIELD"] = "NOTHING"

    # Recomendar DXVK para D3D9 (melhor que wined3d)
    env["PROTON_USE_WINED3D"] = "0"

    return env


def unity_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para Unity Engine.
    
    Problemas conhecidos:
    - GfxDevice: D3D11 pode crashar com certos drivers
    - Threading: gfx-enable-gfx-jobs=1 melhora performance
    - VSync: muitas engines Unity forçam vsync
    """
    env = {
        "UNITY_ENABLE_ENHANCED_GFX_JOBS": "1",
        "UNITY_GFX_DEBUG_LEVEL": "0",
    }
    return env


def unreal_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para Unreal Engine 3/4/5.
    
    Problemas conhecidos:
    - D3D12: VKD3D precisa de configurações específicas
    - Shader compilation stutter (comum em UE4/5)
    - Pool size para texturas
    """
    env = {
        "PROTON_USE_WINED3D": "0",
        "VKD3D_CONFIG": "dxr",
    }
    # Config DXVK para UE
    dxvk_overrides = {
        "dxvk.enableGraphicsPipelineLibrary": "True",
        "d3d11.maxFrameLatency": "1",
    }
    return env


def nwjs_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para NW.js (Chromium) jogos.
    
    NW.js é usado por vários jogos indies (How to Raise a Happy NEET,
    Doki Doki Literature Club, etc.).
    
    Problemas conhecidos:
    - --no-sandbox necessário (container bwrap já isola)
    - GPU rasterization pode crashar
    - Video decoding problemático
    """
    env = {
        "PROTON_NO_SANDBOX": "1",
    }
    return env


def renpy_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para Ren'Py.
    
    Problemas conhecidos:
    - Áudio: Ren'Py usa pygame/SDL2, precisa de PulseAudio ou PipeWire
    - Video: codecs problemáticos em alguns jogos
    """
    env = {}
    return env


def gamemaker_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para GameMaker Studio.
    
    Problemas conhecidos:
    - D3D9: alguns jogos GM rodam melhor com wined3d que DXVK
    - Audio: audio crackling comum
    """
    env = {
        "PROTON_USE_WINED3D": "1",
    }
    return env


def rpgmaker_config(prefix_dir: str = "") -> dict[str, str]:
    """Configurações para RPG Maker.
    
    Problemas conhecidos:
    - Audio: midi playback problemático
    - DirectDraw: precisa de ddraw workarounds
    - Game.exe precisa de certas libs
    """
    env = {
        "PROTON_USE_WINED3D": "1",
        "PROTON_NO_D3D12": "1",
    }
    return env


ENGINE_HANDLERS = {
    "bethesda": bethesda_config,
    "unity": unity_config,
    "unreal": unreal_config,
    "nwjs": nwjs_config,
    "nw": nwjs_config,
    "chromium": nwjs_config,
    "renpy": renpy_config,
    "gamemaker": gamemaker_config,
    "rpgmaker": rpgmaker_config,
}


def detect_engine(game_exe_name: str) -> str | None:
    """Detecta engine pelo nome do executável.
    
    Returns: string da engine ou None se não detectado.
    """
    exe_lower = game_exe_name.lower()

    # NW.js / Electron
    if exe_lower in ("nw.exe", "nwjs.exe", "electron.exe"):
        return "nwjs"

    # Unity
    if exe_lower.startswith("unity") or exe_lower == "game.exe":
        # Muitos jogos Unity usam Game.exe — precisa de mais heurística
        pass

    # Ren'Py
    if exe_lower in ("renpy.exe", "ren'py.exe"):
        return "renpy"

    # GameMaker
    if exe_lower.startswith("gm") or exe_lower.startswith("gamemaker"):
        return "gamemaker"

    # Bethesda
    bethesda_exes = {
        "skyrimse.exe", "skyrim.exe", "skyrimspecialedition.exe",
        "fallout4.exe", "falloutnv.exe", "fallout3.exe",
        "oblivion.exe", "morrowind.exe", "tesv.exe",
        "fallout4launcher.exe",
    }
    if exe_lower in bethesda_exes:
        return "bethesda"

    return None


def apply_engine_config(
    engine: str,
    prefix_dir: str,
    env: dict[str, str],
) -> dict[str, str]:
    """Aplica configurações de engine ao dicionário de env vars.
    
    Args:
        engine: nome da engine (bethesda, unity, etc.)
        prefix_dir: caminho do prefixo Wine
        env: dicionário de env vars existente (será modificado)
    
    Returns: env modificado.
    """
    handler = ENGINE_HANDLERS.get(engine)
    if handler:
        engine_env = handler(prefix_dir)
        env.update(engine_env)
    return env
