"""Camada 2: scan de DLLs de áudio no diretório do jogo."""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger("engine.intel.audio.dlls")

AUDIO_DLL_PATTERNS: dict[str, str] = {
    "ALAudio.dll": "OpenAL Soft",
    "OpenAL32.dll": "OpenAL",
    "wrap_oal.dll": "OpenAL Soft",
    "soft_oal.dll": "OpenAL Soft",
    "fmod.dll": "FMOD",
    "fmod64.dll": "FMOD",
    "fmodstudio.dll": "FMOD Studio",
    "fmodstudio64.dll": "FMOD Studio",
    "fmodL.dll": "FMOD (low-level)",
    "fmodstudioL.dll": "FMOD Studio (low-level)",
    "AkSoundEngine.dll": "Wwise",
    "AkSoundEngine64.dll": "Wwise",
    "AkiSoundEngine.dll": "Wwise",
    "bass.dll": "BASS",
    "bass_fx.dll": "BASS FX",
    "basswma.dll": "BASS WMA",
    "bassmidi.dll": "BASS MIDI",
    "bassflac.dll": "BASS FLAC",
    "bassopus.dll": "BASS Opus",
    "bassmix.dll": "BASS Mix",
    "cri_ware.dll": "CRIWARE",
    "cri_atom.dll": "CRIWARE Atom",
    "cri_fs.dll": "CRIWARE FS",
    "cri_movie.dll": "CRIWARE Movie",
    "cri_mana.dll": "CRIWARE Mana",
    "cri_pf.dll": "CRIWARE PF",
    "xaudio2_9.dll": "XAudio2 2.9",
    "xaudio2_8.dll": "XAudio2 2.8",
    "xaudio2_7.dll": "XAudio2 2.7",
    "xaudio2_6.dll": "XAudio2 2.6",
    "xaudio2.dll": "XAudio2",
    "irrKlang.dll": "irrKlang",
    "ikpMP3.dll": "irrKlang MP3",
    "ikpFlac.dll": "irrKlang FLAC",
    "soloud.dll": "SoLoud",
    "SoLoud.dll": "SoLoud",
    "vivoxsdk.dll": "Vivox",
    "discord_game_sdk.dll": "Discord GameSDK",
    "steam_audio.dll": "Steam Audio",
    "phonon.dll": "Steam Audio (Phonon)",
    "galaxy_audio.dll": "GOG Galaxy Audio",
    "alsoft.dll": "OpenAL Soft (DLL)",
    "SDL2.dll": "SDL2",
    "SDL3.dll": "SDL3",
    "SDL_mixer.dll": "SDL_mixer",
    "libmpg123.dll": "MPG123 (via SDL_mixer)",
    "libogg.dll": "Ogg Vorbis (via SDL_mixer)",
    "libvorbis.dll": "Ogg Vorbis (via SDL_mixer)",
    "Miles.dll": "Miles Sound System",
    "mss32.dll": "Miles Sound System",
    "mss64.dll": "Miles Sound System",
    "mssd.dll": "Miles Sound System",
    "aude32.dll": "Audiere",
    "Audiere.dll": "Audiere",
}


SYSTEM_DIRS = {"windows", "system32", "syswow64", "program files", "program files (x86)"}


def scan_game_directory(game_dir: str | Path) -> list[dict]:
    """Escaneia diretório do jogo por DLLs de áudio conhecidas.

    Estratégia para performance (prefixo pode ter 70k+ arquivos):
    1. Varre o diretório do executável (instalação do jogo)
    2. Varre a raiz do prefixo (arquivos de config/overlay)
    3. Pula system32/syswow64 (DLLs do Wine, não do jogo)

    Retorna lista de dicts com 'filename', 'path', 'middleware', 'size'.
    """
    base = Path(game_dir).expanduser().resolve()
    if not base.is_dir():
        log.warning("Diretório não encontrado: %s", base)
        return []

    pattern_lower = {k.lower(): v for k, v in AUDIO_DLL_PATTERNS.items()}
    found: list[dict] = []
    seen: set[str] = set()

    # Diretórios para escanear (evita walk completo do prefixo)
    scan_dirs: list[Path] = [base]

    # Adiciona drive_c/ se existir (prefixo Wine)
    drive_c = base / "drive_c"
    if drive_c.is_dir():
        # Só adiciona subdiretórios que não são system/windows
        for entry in drive_c.iterdir():
            name_lower = entry.name.lower()
            if name_lower not in SYSTEM_DIRS and entry.is_dir():
                scan_dirs.append(entry)

    # Adiciona diretório de instalação do jogo se existir
    for candidate in ["Grand Fantasia Violet", "game", "Game", "data", "Data"]:
        for sd in list(scan_dirs):
            p = sd / candidate
            if p.is_dir() and p not in scan_dirs:
                scan_dirs.append(p)

    log.debug("Diretórios para scan: %s", [str(d) for d in scan_dirs])

    for scan_base in scan_dirs:
        if not scan_base.is_dir():
            continue
        try:
            for entry in scan_base.iterdir():
                if not entry.is_file():
                    continue
                name_lower = entry.name.lower()
                if name_lower in pattern_lower and name_lower not in seen:
                    seen.add(name_lower)
                    middleware = pattern_lower[name_lower]
                    try:
                        size = entry.stat().st_size or 0
                    except OSError:
                        size = 0
                    try:
                        rel_path = str(entry.relative_to(base))
                    except ValueError:
                        rel_path = str(entry)
                    found.append({
                        "filename": entry.name,
                        "path": rel_path,
                        "middleware": middleware,
                        "size": size,
                    })
                    log.debug("DLL: %s (%s) em %s", entry.name, middleware, rel_path)
        except PermissionError:
            log.warning("Permissão negada: %s", scan_base)
            continue

    if not found:
        log.info("Nenhuma DLL de áudio encontrada no prefixo")
    else:
        log.info("DLLs de áudio encontradas: %d", len(found))

    return found


def get_known_middleware_names() -> list[str]:
    return list(set(AUDIO_DLL_PATTERNS.values()))
