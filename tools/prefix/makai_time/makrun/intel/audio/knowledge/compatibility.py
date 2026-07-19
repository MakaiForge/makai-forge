"""Banco de problemas conhecidos de jogos com middlewares de áudio no Linux/Wine.

Estrutura: cada entrada mapeia jogo_id ou hash para problemas documentados.
"""

from __future__ import annotations

from typing import Any

KNOWN_ISSUES: dict[str, dict[str, Any]] = {
    "gf": {
        "game_name": "Grand Fantasia Violet",
        "middleware": "OpenAL Soft",
        "dlls": ["ALAudio.dll"],
        "symptoms": [
            "3D attack sounds silent",
            "BGM works",
            "SFX 2D works",
            "Mob sounds work",
        ],
        "root_cause": "ALAudio.dll usa WASAPI (mmdevapi) e mixing 3D interno; "
                      "provável bug no mixing 3D do ALAudio.dll ou parâmetros de ganho/posição",
        "tried": [
            "DSOAL — não resolveu (jogo não usa DirectSound)",
            "Proton-CachyOS 20260702 (winepipewire) — não resolveu",
            "Forçar winepulse.drv — não resolveu",
        ],
        "workarounds": [
            "Testar substituindo ALAudio.dll por OpenAL Soft vanilla com WASAPI",
            "Testar ALSOFT_LOGLEVEL=3 para capturar parâmetros de mixing 3D",
            "Testar GE-Proton (backend mais antigo) para comparação",
        ],
        "confidence": 0.85,
    },
    "how_to_raise_a_happy_neet": {
        "game_name": "How to Raise a Happy NEET",
        "middleware": "NW.js (Chromium)",
        "dlls": ["nw_elf.dll", "ffmpeg.dll"],
        "symptoms": [],
        "root_cause": None,
        "tried": [],
        "workarounds": [],
        "confidence": 0.0,
    },
    "ffxiv": {
        "game_name": "Final Fantasy XIV",
        "middleware": "CRIWARE",
        "dlls": ["cri_atom.dll", "cri_fs.dll"],
        "symptoms": [
            "Áudio pode falhar em certas cutscenes",
            "Música pode parar após zoneamento",
        ],
        "root_cause": "CRIWARE Atom usa WASAPI; winepipewire precisa de buffer adequado",
        "tried": ["Proton GE + winepulse.drv"],
        "workarounds": [
            "Usar Proton GE com winepulse.drv",
            "Aumentar latência do PipeWire (quantum=1024)",
        ],
        "confidence": 0.5,
    },
    "skyrim_se": {
        "game_name": "The Elder Scrolls V: Skyrim Special Edition",
        "middleware": "BASS (XAudio2)",
        "dlls": ["bass.dll", "xaudio2_7.dll"],
        "symptoms": [
            "Sem som de passos/passos 3D",
        ],
        "root_cause": "XAudio2 2.7 legacy (DXSDK) pode ter problemas com winepipewire",
        "tried": ["Forçar xaudio2=native,builtin"],
        "workarounds": [
            "Usar Proton GE com winepulse.drv",
            "WINEDLLOVERRIDES=xaudio2=native,builtin",
        ],
        "confidence": 0.6,
    },
    "fallout_4": {
        "game_name": "Fallout 4",
        "middleware": "BASS (XAudio2)",
        "dlls": ["bass.dll", "xaudio2_7.dll"],
        "symptoms": [
            "Rádio funciona, mas SFX 3D podem falhar",
        ],
        "root_cause": "BASS + XAudio2 2.7 legacy com winepipewire",
        "tried": [],
        "workarounds": [
            "Proton GE com winepulse.drv",
            "Forçar dsound=native,builtin",
        ],
        "confidence": 0.4,
    },
}


def get_known_issue(game_id: str) -> dict[str, Any] | None:
    """Retorna entrada de problema conhecido para um jogo."""
    return KNOWN_ISSUES.get(game_id)


def search_by_middleware(middleware_name: str) -> list[dict[str, Any]]:
    """Retorna jogos conhecidos que usam um middleware específico."""
    return [
        {**entry, "game_id": gid}
        for gid, entry in KNOWN_ISSUES.items()
        if entry.get("middleware", "").lower() == middleware_name.lower()
    ]


def search_by_dll(dll_name: str) -> list[dict[str, Any]]:
    """Retorna jogos conhecidos que contêm uma DLL específica."""
    results = []
    dll_lower = dll_name.lower()
    for gid, entry in KNOWN_ISSUES.items():
        if any(d.lower() == dll_lower for d in entry.get("dlls", [])):
            results.append({**entry, "game_id": gid})
    return results


def list_known_games() -> list[str]:
    return list(KNOWN_ISSUES.keys())
