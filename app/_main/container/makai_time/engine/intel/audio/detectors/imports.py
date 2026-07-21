"""Camada 1: análise de imports do executável."""

from __future__ import annotations

import logging
import re
import struct
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.intel.audio.imports")

AUDIO_DLLS = {
    "dsound.dll": "DirectSound",
    "mmdevapi.dll": "MMDevAPI",
    "xaudio2_9.dll": "XAudio2",
    "xaudio2_8.dll": "XAudio2",
    "xaudio2_7.dll": "XAudio2",
    "xaudio2_6.dll": "XAudio2",
    "xaudio2.dll": "XAudio2",
    "openal32.dll": "OpenAL",
    "wrap_oal.dll": "OpenAL",
    "fmod.dll": "FMOD",
    "fmod64.dll": "FMOD",
    "fmodstudio.dll": "FMOD Studio",
    "fmodstudio64.dll": "FMOD Studio",
    "bass.dll": "BASS",
    "bass_fx.dll": "BASS",
    "basswma.dll": "BASS",
    "bassmidi.dll": "BASS",
    "AkiSoundEngine.dll": "Wwise",
    "AkSoundEngine.dll": "Wwise",
    "cri_ware.dll": "CRIWARE",
    "cri_atom.dll": "CRIWARE",
    "cri_fs.dll": "CRIWARE",
    "cri_movie.dll": "CRIWARE",
    "cri_mana.dll": "CRIWARE",
    "libsoxr.dll": "CRIWARE",
    "vivoxsdk.dll": "Vivox",
    "galaxy_audio.dll": "GOG Galaxy",
    "discord_game_sdk.dll": "Discord RPC",
    "steam_api.dll": "Steam Audio",
    "steam_api64.dll": "Steam Audio",
    "alsoft.dll": "OpenAL Soft",
    "alure.dll": "OpenAL Alure",
    "SDL2.dll": "SDL2",
    "SDL3.dll": "SDL3",
    "SDL_mixer.dll": "SDL_mixer",
    "irrKlang.dll": "irrKlang",
    "soloud.dll": "SoLoud",
}


def analyze_pe_imports(exe_path: str | Path) -> list[dict[str, Any]]:
    """Extrai imports de DLLs de áudio de um PE32/PE32+.

    Usa objdump -p como backend primário, fallback para parse manual do PE.
    Retorna lista de dicts com dll_name e api_name.
    """
    exe = Path(exe_path)
    if not exe.is_file():
        log.warning("Arquivo não encontrado: %s", exe)
        return []

    dlls = _parse_imports_objdump(exe)
    if dlls is None:
        dlls = _parse_imports_pe_raw(exe)

    audio_imports = []
    for dll_name in dlls:
        key = dll_name.lower()
        api_name = AUDIO_DLLS.get(key)
        if api_name:
            audio_imports.append({"dll": dll_name, "api": api_name})
            log.debug("Import detectado: %s → %s", dll_name, api_name)

    return audio_imports


def _parse_imports_objdump(exe_path: Path) -> list[str] | None:
    """Tenta extrair imports via objdump -p."""
    try:
        import subprocess
        result = subprocess.run(
            ["objdump", "-p", str(exe_path)],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None

        dlls = set()
        in_imports = False
        for line in result.stdout.splitlines():
            if "DLL Name:" in line:
                name = line.split("DLL Name:")[-1].strip().lower()
                if name.endswith(".dll"):
                    dlls.add(name)
            elif "Time/Date" in line and "DLL Name" not in line:
                continue
        return list(dlls) if dlls else None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


def _parse_imports_pe_raw(exe_path: Path) -> list[str]:
    """Parse manual do PE para ler tabela de imports.

    Fallback quando objdump não está disponível.
    """
    dlls: set[str] = set()
    try:
        data = exe_path.read_bytes()
    except OSError:
        return []

    # PE header offset
    if len(data) < 64:
        return []
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if pe_offset + 4 > len(data):
        return []

    # PE signature
    if data[pe_offset:pe_offset+4] != b"PE\x00\x00":
        return []

    # File header
    file_hdr_offset = pe_offset + 4
    if file_hdr_offset + 20 > len(data):
        return []
    optional_hdr_size = struct.unpack_from("<H", data, file_hdr_offset + 16)[0]
    num_sections = struct.unpack_from("<H", data, file_hdr_offset + 2)[0]

    # Optional header
    opt_hdr_offset = file_hdr_offset + 20
    if opt_hdr_offset + optional_hdr_size > len(data):
        return []

    # Data directory (import table is entry 1)
    is_pe32 = struct.unpack_from("<H", data, opt_hdr_offset)[0] == 0x10B
    data_dir_offset = opt_hdr_offset + (96 if is_pe32 else 112)
    import_rva = struct.unpack_from("<I", data, data_dir_offset + 0)[0]

    # Convert RVA to file offset via section table
    section_offset = opt_hdr_offset + optional_hdr_size
    import_offset = _rva_to_offset(data, import_rva, section_offset, num_sections)
    if import_offset is None:
        return []

    # Walk import directory
    offset = import_offset
    while offset + 20 <= len(data):
        ilt_rva = struct.unpack_from("<I", data, offset)[0]
        name_rva = struct.unpack_from("<I", data, offset + 12)[0]
        if ilt_rva == 0 and name_rva == 0:
            break

        if name_rva:
            name_offset = _rva_to_offset(data, name_rva, section_offset, num_sections)
            if name_offset and name_offset < len(data):
                end = data.index(b"\x00", name_offset)
                name = data[name_offset:end].decode("ascii", errors="replace").lower()
                if name.endswith(".dll"):
                    dlls.add(name)

        offset += 20

    return list(dlls)


def _rva_to_offset(data: bytes, rva: int, section_offset: int, num_sections: int) -> int | None:
    """Converte Relative Virtual Address para file offset."""
    for i in range(num_sections):
        off = section_offset + i * 40
        if off + 40 > len(data):
            return None
        virt_addr = struct.unpack_from("<I", data, off + 12)[0]
        virt_size = struct.unpack_from("<I", data, off + 8)[0]
        raw_offset = struct.unpack_from("<I", data, off + 20)[0]
        if virt_addr <= rva < virt_addr + virt_size:
            return rva - virt_addr + raw_offset
    return None


def supported_formats() -> list[str]:
    return list(set(AUDIO_DLLS.values()))
