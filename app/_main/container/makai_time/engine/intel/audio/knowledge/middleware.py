"""Base de conhecimento de middlewares de áudio.

Mapeia middleware → características, backends suportados,
drivers Wine preferidos, e problemas conhecidos.
"""

from __future__ import annotations

from typing import Any

MIDDLEWARE_DB: dict[str, dict[str, Any]] = {
    "OpenAL Soft": {
        "description": "Implementação open-source do OpenAL 1.1",
        "backends": ["mmdevapi", "dsound", "pulse", "alsa", "pipewire", "oss", "coreaudio", "null"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": True,
        "wine_debug_channel": "dsound",
        "notes": "Usa WASAPI por padrão no Wine moderno. Backend DSound caiu em desuso.",
        "known_issues": [
            "Backend DSound pode ter problemas com buffers 3D no Wine",
            "WASAPI backend no Wine não suporta posicionamento 3D nativo",
        ],
    },
    "FMOD": {
        "description": "Middleware de áudio da Firelight Technologies",
        "backends": ["mmdevapi", "dsound", "xaudio2", "pulse", "alsa", "oss"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "mmdevapi",
        "notes": "FMOD faz próprio mixing 3D internamente. Usa WASAPI no Windows 8+.",
        "known_issues": [
            "FMOD 4.x pode ter fallback para DSound sem 3D",
            "FMOD 5.x+ usa WASAPI e funciona bem com winepipewire",
        ],
    },
    "Wwise": {
        "description": "Middleware de áudio da Audiokinetic (usado em AAA)",
        "backends": ["mmdevapi", "dsound", "xaudio2", "pulse"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "mmdevapi",
        "notes": "Wwise tem mixer próprio sofisticado. Usa WASAPI nativamente.",
        "known_issues": [
            "Pode exigir versão específica do VC++ redist",
            "Áudio 3D é mixing interno do Wwise, não depende do Wine",
        ],
    },
    "CRIWARE": {
        "description": "Middleware de áudio da CRI (CriAtom, comum em jogos japoneses)",
        "backends": ["mmdevapi", "dsound", "xaudio2"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "mmdevapi",
        "notes": "CriAtom tem implementation própria de 3D. Comum em MMOs japoneses.",
        "known_issues": [
            "Pode usar formatos de áudio proprietários (ADX, HCA)",
            "Áudio 3D é mixing interno do CRI, não passa pelo Wine",
        ],
    },
    "XAudio2": {
        "description": "API de áudio da Microsoft (Xbox + Windows)",
        "backends": ["mmdevapi"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "xaudio2",
        "notes": "XAudio2 é uma API sobre WASAPI. Wine suporta desde 2019.",
        "known_issues": [
            "XAudio2 2.7 (DXSDK) usa DSound por baixo — legacy",
            "XAudio2 2.8+ usa WASAPI nativo — funcionando no Wine",
        ],
    },
    "DirectSound": {
        "description": "API de áudio legada da Microsoft (DirectX)",
        "backends": ["mmdevapi", "dsound_drv"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepulse",
        "needs_dsoal": True,
        "dsoal_compatible": True,
        "wine_debug_channel": "dsound",
        "notes": "API legada substituída por WASAPI. Wine emula sobre mmdevapi.",
        "known_issues": [
            "DirectSound3D não tem suporte nativo no Wine mmdevapi",
            "DSOAL pode restaurar áudio 3D para jogos que usam DS3D",
            "Wine 9.x+ roteia DSound para mmdevapi — perde aceleração 3D",
        ],
    },
    "BASS": {
        "description": "Middleware de áudio da Un4seen Developments",
        "backends": ["mmdevapi", "dsound", "pulse", "alsa", "oss"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "mmdevapi",
        "notes": "BASS é leve e faz mixing próprio. Usado em muitos jogos indies.",
        "known_issues": [
            "Versões antigas podem falhar no Wine por causa de timing",
            "Mixing 3D é interno do BASS, funciona independente do Wine",
        ],
    },
    "irrKlang": {
        "description": "Engine de áudio 3D da Ambiera",
        "backends": ["dsound", "pulse", "alsa", "winmm"],
        "preferred_backend_linux": "dsound",
        "preferred_wine_driver": "winepulse",
        "needs_dsoal": True,
        "dsoal_compatible": True,
        "wine_debug_channel": "dsound",
        "notes": "Engine mais antiga, usa DirectSound como backend principal.",
        "known_issues": [
            "Backend DirectSound é o único que suporta 3D",
            "DSOAL pode ser necessário para restaurar áudio 3D",
        ],
    },
    "SDL_mixer": {
        "description": "SDL_mixer — extensão de áudio da SDL",
        "backends": ["pulse", "alsa", "pipewire", "dsound"],
        "preferred_backend_linux": "pipewire",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "winmm",
        "notes": "SDL_mixer usa SDL_Audio por baixo, que no Wine usa winmm ou dsound.",
        "known_issues": [
            "Posicionamento 3D limitado (panning stereo, não HRTF)",
            "Wine 10+ tem SDL_Audio via winmm funcionando",
        ],
    },
    "Miles Sound System": {
        "description": "Middleware de áudio legacy da RAD Game Tools",
        "backends": ["dsound", "winmm", "pulse"],
        "preferred_backend_linux": "dsound",
        "preferred_wine_driver": "winepulse",
        "needs_dsoal": True,
        "dsoal_compatible": True,
        "wine_debug_channel": "dsound",
        "notes": "Engine muito antiga (anos 90/2000). Usa DirectSound para 3D.",
        "known_issues": [
            "Depende de DirectSound3D — DSOAL recomendado",
            "Pode exigir aceleração de som (eax=1 no Wine)",
        ],
    },
    "SoLoud": {
        "description": "Engine de áudio simples e portátil",
        "backends": ["pulse", "alsa", "pipewire", "dsound", "winmm", "openal"],
        "preferred_backend_linux": "pipewire",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "winmm",
        "notes": "Engine moderno e leve. Prefere backend nativo ao invés de Win32.",
        "known_issues": [],
    },
    "MMDevAPI/WASAPI": {
        "description": "Windows Multimedia Device API (padrão moderno)",
        "backends": ["mmdevapi"],
        "preferred_backend_linux": "mmdevapi",
        "preferred_wine_driver": "winepipewire",
        "needs_dsoal": False,
        "dsoal_compatible": False,
        "wine_debug_channel": "mmdevapi",
        "notes": "API nativa do Windows Vista+. Wine suporta via mmdevapi.dll.",
        "known_issues": [
            "Não tem suporte a buffers 3D — mixing é responsabilidade do middleware",
            "winepipewire.so é o driver mais moderno para WASAPI no Wine",
        ],
    },
}


def get_middleware_info(middleware_name: str) -> dict[str, Any] | None:
    """Retorna info de um middleware pelo nome."""
    if middleware_name in MIDDLEWARE_DB:
        return dict(MIDDLEWARE_DB[middleware_name])
    return None


def list_middleware_names() -> list[str]:
    return list(MIDDLEWARE_DB.keys())


def get_middlewares_by_feature(feature: str, value: Any) -> list[str]:
    """Retorna middlewares que têm uma feature específica."""
    return [
        name for name, info in MIDDLEWARE_DB.items()
        if info.get(feature) == value
    ]
