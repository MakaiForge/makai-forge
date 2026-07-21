"""Camada 4: análise em runtime via WINEDEBUG.

Gera comandos/env vars para capturar chamadas de áudio reais
e parseia logs resultantes. Não executa o jogo — apenas prepara
a instrumentação e analisa logs existentes.
"""

from __future__ import annotations

import logging
import re
from typing import Any

log = logging.getLogger("engine.intel.audio.runtime")

AUDIO_DEBUG_CHANNELS = {
    "dsound": "DirectSound",
    "mmdevapi": "MMDevAPI/WASAPI",
    "xaudio2": "XAudio2",
    "winmm": "WinMM",
    "midi": "MIDI",
    "winealsa": "ALSA",
    "winepulse": "PulseAudio",
    "winepipewire": "PipeWire",
    "wincodec": "WineCodec",
}


def generate_winedebug_flags() -> str:
    """Gera string WINEDEBUG para capturar chamadas de áudio.

    Uso:
        export WINEDEBUG="$(python -m engine.intel.audio.detectors.runtime generate)"
    """
    channels = "+" + ",+".join(AUDIO_DEBUG_CHANNELS.keys())
    return channels


def generate_env_for_analysis() -> dict[str, str]:
    """Retorna env vars para análise de áudio em runtime."""
    return {
        "WINEDEBUG": generate_winedebug_flags(),
        "WINEDEBUG_CHANNELS": "loaddll",
        "ALSOFT_LOGLEVEL": "3",
        "ALSOFT_LOGFILE": "alsoft.log",
        "DSOAL_LOGLEVEL": "4",
        "DSOAL_LOGFILE": "dsoal.log",
    }


def parse_runtime_log(log_path: str) -> dict[str, Any]:
    """Parseia um log de runtime (WINEDEBUG) para extrair uso de APIs de áudio.

    Procura por:
    - trace:mmdevapi: → WASAPI ativo
    - trace:dsound: → DirectSound ativo
    - trace:xaudio2: → XAudio2 ativo
    - IDirectSoundCreate, DirectSoundCreate8 → DSound usado
    - AudioClient_Create → WASAPI usado
    """
    if not log_path:
        return {"apis_detected": [], "calls_found": [], "summary": ""}

    try:
        with open(log_path) as f:
            content = f.read()
    except (FileNotFoundError, PermissionError, OSError):
        return {"error": f"Cannot read log: {log_path}"}

    apis: dict[str, int] = {}
    calls: list[str] = []
    lines = content.splitlines()

    for line in lines:
        line_lower = line.lower()

        # mmdevapi traces
        if "trace:mmdevapi:" in line_lower:
            apis["MMDevAPI/WASAPI"] = apis.get("MMDevAPI/WASAPI", 0) + 1
            if apis["MMDevAPI/WASAPI"] <= 3:
                calls.append(line.strip())

        # dsound traces
        if "trace:dsound:" in line_lower:
            apis["DirectSound"] = apis.get("DirectSound", 0) + 1
            if apis["DirectSound"] <= 3:
                calls.append(line.strip())
            if "idirectsound_create" in line_lower or "directsoundcreate" in line_lower:
                calls.append(f"*** DSound initialized: {line.strip()}")

        # xaudio2 traces
        if "trace:xaudio2:" in line_lower:
            apis["XAudio2"] = apis.get("XAudio2", 0) + 1
            if apis["XAudio2"] <= 3:
                calls.append(line.strip())

        # winmm traces
        if "trace:winmm:" in line_lower:
            apis["WinMM"] = apis.get("WinMM", 0) + 1

    total_apis = len(apis)
    sorted_apis = sorted(apis.items(), key=lambda x: -x[1])

    most_active = sorted_apis[0][0] if sorted_apis else "none"
    summary_parts = []
    for api_name, count in sorted_apis:
        summary_parts.append(f"{api_name} ({count} chamadas)")

    return {
        "apis_detected": list(apis.keys()),
        "most_active_api": most_active,
        "calls_found": calls,
        "call_counts": apis,
        "summary": ", ".join(summary_parts) if summary_parts else "Nenhuma API de áudio detectada",
    }


def supported_channels() -> list[str]:
    return list(AUDIO_DEBUG_CHANNELS.keys())
