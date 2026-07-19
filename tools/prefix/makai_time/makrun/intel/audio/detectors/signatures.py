"""Camada 3: assinaturas de middleware de áudio.

Identifica o middleware mesmo quando o nome do arquivo não é padrão,
analisando assinaturas de bytes, metadata do PE, ou seções conhecidas.
"""

from __future__ import annotations

import logging
import struct
from pathlib import Path

log = logging.getLogger("makrun.intel.audio.signatures")

SIGNATURES: list[dict] = [
    {
        "id": "wwise_ak_soundengine",
        "middleware": "Wwise",
        "patterns": [
            b"AkSoundEngine",
            b"AkMusicEngine",
            b"AkBankMgr",
        ],
        "dll_hint": "AkSoundEngine.dll",
    },
    {
        "id": "fmod",
        "middleware": "FMOD",
        "patterns": [
            b"FMOD::System_Create",
            b"FMOD::Studio::System",
            b"FSOUND_FrontEnd",
        ],
        "dll_hint": "fmod.dll",
    },
    {
        "id": "openal_soft",
        "middleware": "OpenAL Soft",
        "patterns": [
            b"OpenAL Soft",
            b"ALC_EXT_CAPTURE",
            b"AL_SOFT_buffer_samples",
        ],
        "dll_hint": "OpenAL32.dll",
    },
    {
        "id": "criware",
        "middleware": "CRIWARE",
        "patterns": [
            b"CriAtom",
            b"CriFs",
            b"CriMana",
        ],
        "dll_hint": "cri_atom.dll",
    },
    {
        "id": "bass",
        "middleware": "BASS",
        "patterns": [
            b"BASS_Init",
            b"BASS_StreamCreate",
            b"BASS_ChannelPlay",
        ],
        "dll_hint": "bass.dll",
    },
    {
        "id": "xaudio2",
        "middleware": "XAudio2",
        "patterns": [
            b"XAudio2Create",
            b"IXAudio2",
            b"XAUDIO2",
        ],
        "dll_hint": "xaudio2_9.dll",
    },
    {
        "id": "irrklang",
        "middleware": "irrKlang",
        "patterns": [
            b"irrKlang",
            b"ISoundEngine",
            b"ikpFlac",
        ],
        "dll_hint": "irrKlang.dll",
    },
    {
        "id": "discord_game_sdk",
        "middleware": "Discord GameSDK",
        "patterns": [
            b"Discord",
            b"DiscordCreate",
        ],
        "dll_hint": "discord_game_sdk.dll",
    },
    {
        "id": "steam_audio",
        "middleware": "Steam Audio",
        "patterns": [
            b"iplCreateContext",
            b"iplAudioEngine",
            b"phonon",
        ],
        "dll_hint": "steam_audio.dll",
    },
    {
        "id": "vivox",
        "middleware": "Vivox",
        "patterns": [
            b"vivox",
            b"Vivox",
            b"vx_",
        ],
        "dll_hint": "vivoxsdk.dll",
    },
    {
        "id": "miles",
        "middleware": "Miles Sound System",
        "patterns": [
            b"MSS",
            b"AIL_",
            b"Miles",
        ],
        "dll_hint": "mss32.dll",
    },
    {
        "id": "soloud",
        "middleware": "SoLoud",
        "patterns": [
            b"SoLoud::",
            b"Soloud",
        ],
        "dll_hint": "soloud.dll",
    },
]


def identify_middleware(dll_path: str | Path) -> list[dict]:
    """Analisa uma DLL em busca de assinaturas de middleware.

    Lê bytes da DLL e procura por padrões conhecidos.
    Retorna lista de matches com middleware e confiança.
    """
    path = Path(dll_path)
    if not path.is_file():
        return []

    try:
        data = path.read_bytes()
    except (OSError, PermissionError):
        return []

    results = []
    for sig in SIGNATURES:
        score = sum(1 for pat in sig["patterns"] if pat in data)
        if score > 0:
            confidence = min(score / len(sig["patterns"]), 1.0)
            results.append({
                "id": sig["id"],
                "middleware": sig["middleware"],
                "confidence": round(confidence, 2),
                "matches": score,
                "total_patterns": len(sig["patterns"]),
            })
            log.debug("Assinatura detectada: %s (confiança: %.2f)", sig["middleware"], confidence)

    return results


def is_pe_dll(dll_path: str | Path) -> bool:
    """Verifica se um arquivo é uma DLL PE32/PE32+ válida."""
    path = Path(dll_path)
    if not path.is_file():
        return False
    try:
        data = path.read_bytes()
        if len(data) < 64:
            return False
        pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
        if pe_offset + 4 > len(data):
            return False
        return data[pe_offset:pe_offset+4] == b"PE\x00\x00"
    except (OSError, PermissionError, struct.error):
        return False
