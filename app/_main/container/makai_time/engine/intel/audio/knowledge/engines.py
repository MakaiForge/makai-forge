"""Mapeamento engine de jogo → características de áudio.

Permite fazer engenharia reversa: dado um engine conhecido,
sabemos qual middleware de áudio ele usa.
"""

from __future__ import annotations

from typing import Any

ENGINE_AUDIO_MAP: dict[str, dict[str, Any]] = {
    "Unreal Engine 3": {
        "middleware": "FMOD",
        "confidence": 0.7,
        "notes": "UE3 usava FMOD como padrão, mas podia ser substituído",
    },
    "Unreal Engine 4": {
        "middleware": "Wwise",
        "confidence": 0.6,
        "notes": "UE4 vem com Wwise integration, mas também suporta FMOD, SDL_mixer",
    },
    "Unreal Engine 5": {
        "middleware": "Wwise",
        "confidence": 0.6,
        "notes": "UE5 continua com Wwise como padrão, mas pode usar MetaSounds nativo",
    },
    "Unity": {
        "middleware": "FMOD",
        "confidence": 0.5,
        "notes": "Unity usa FMOD como padrão, mas pode usar Wwise, Criware, ou próprio",
    },
    "Unity (FMOD Studio)": {
        "middleware": "FMOD Studio",
        "confidence": 0.8,
        "notes": "Unity + FMOD Studio integration package",
    },
    "Unity (Wwise)": {
        "middleware": "Wwise",
        "confidence": 0.8,
        "notes": "Unity + Wwise integration package",
    },
    "Unity (Criware)": {
        "middleware": "CRIWARE",
        "confidence": 0.8,
        "notes": "Unity + Criware CPK Atom integration",
    },
    "Source Engine": {
        "middleware": "BASS",
        "confidence": 0.6,
        "notes": "Source usa BASS para áudio, mas tem mixing 3D próprio",
    },
    "Source 2": {
        "middleware": "BASS",
        "confidence": 0.5,
        "notes": "Source 2 continua com BASS mas pode usar Steam Audio",
    },
    "RPG Maker (RGSS)": {
        "middleware": "BASS",
        "confidence": 0.7,
        "notes": "RPG Maker usa BASS via RGSS (mais comum) ou winmm (mais antigo)",
    },
    "RPG Maker MV/MZ": {
        "middleware": "Web Audio",
        "confidence": 0.8,
        "notes": "RPG Maker MV/MZ roda em NW.js/Chromium, áudio via Web Audio API",
    },
    "GameMaker Studio": {
        "middleware": "BASS",
        "confidence": 0.8,
        "notes": "GameMaker (antigo) usa BASS internamente",
    },
    "GameMaker Studio 2": {
        "middleware": "BASS",
        "confidence": 0.7,
        "notes": "GMS2 continua com BASS, mas versões recentes podem usar Wwise",
    },
    "Godot": {
        "middleware": "SDL_mixer",
        "confidence": 0.5,
        "notes": "Godot tem áudio próprio, não usa middleware externo tipicamente",
    },
    "Ren'Py": {
        "middleware": "SDL_mixer",
        "confidence": 0.7,
        "notes": "Ren'Py usa SDL_mixer ou pygame.mixer",
    },
    "CryEngine": {
        "middleware": "Wwise",
        "confidence": 0.7,
        "notes": "CryEngine usa Wwise como padrão",
    },
    "Frostbite": {
        "middleware": "Wwise",
        "confidence": 0.6,
        "notes": "Frostbite (EA/DICE) usa Wwise",
    },
    "id Tech (Doom)": {
        "middleware": "FMOD",
        "confidence": 0.7,
        "notes": "id Tech 5/6/7 usa FMOD Studio",
    },
    "Creation Engine (Bethesda)": {
        "middleware": "BASS",
        "confidence": 0.6,
        "notes": "Skyrim/Fallout 4 usam BASS (xaudio2 no Fallout 4? ou BASS mesmo)",
    },
    "MT Framework (Capcom)": {
        "middleware": "CRIWARE",
        "confidence": 0.6,
        "notes": "Capcom usa Criware em muitos títulos MT Framework",
    },
    "RE Engine (Capcom)": {
        "middleware": "CRIWARE",
        "confidence": 0.5,
        "notes": "RE Engine pode usar Criware, Wwise, ou próprio",
    },
}


def get_audio_middleware_by_engine(engine_name: str) -> str | None:
    """Retorna middleware de áudio mais provável para um engine."""
    info = ENGINE_AUDIO_MAP.get(engine_name)
    if info:
        return info["middleware"]
    return None


def get_engine_audio_info(engine_name: str) -> dict[str, Any] | None:
    """Retorna info completa de áudio para um engine."""
    info = ENGINE_AUDIO_MAP.get(engine_name)
    if info:
        return dict(info)
    return None


def list_engines() -> list[str]:
    return list(ENGINE_AUDIO_MAP.keys())


def guess_engine_from_dlls(dll_names: list[str]) -> list[dict[str, Any]]:
    """Tenta adivinhar engine a partir de DLLs encontradas.

    Exemplo: se encontrar UnityPlayer.dll → Unity.
    """
    hints: dict[str, list[str]] = {
        "Unity": ["unityplayer.dll", "unityengine.dll"],
        "Unreal Engine": ["unrealengine.dll", "engine.u", "core.u"],
        "Godot": ["godot.dll", "godotengine.dll"],
        "GameMaker Studio": ["gmloader.dll", "gameplay.dll"],
        "RPG Maker": ["rgss", "rpg_maker"],
        "Ren'Py": ["renpy.dll"],
    }

    results = []
    dlls_lower = [d.lower() for d in dll_names]
    for engine, hints_list in hints.items():
        for hint in hints_list:
            if any(hint in d for d in dlls_lower):
                info = ENGINE_AUDIO_MAP.get(engine)
                results.append({
                    "engine": engine,
                    "confidence": 0.5,
                    "audio_middleware": info["middleware"] if info else None,
                })
                break
    return results
