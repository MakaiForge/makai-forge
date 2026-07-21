from __future__ import annotations
import struct
from pathlib import Path

BSA_VERSION_OBLIVION = 0x67
BSA_VERSION_FO3_FNV_SKYRIM = 0x68
BSA_VERSION_SSE = 0x69

_HEADER_SIZE = 36
_FOLDER_RECORD_SIZE = 16
_FILE_RECORD_SIZE = 16
_DUMMY_FILE_NAME = "dummy.dds"
_DUMMY_FOLDER_NAME = ""
_ARCHIVE_FLAGS = 0x01 | 0x02
_FILE_FLAGS = 0x02


def _gen_hash_int(data: bytes) -> int:
    h = 0
    for b in data:
        h = (h * 0x1003F + b) & 0xFFFFFFFFFFFFFFFF
    return h


def _gen_hash(file_name: str) -> int:
    lowered = file_name.lower().replace("\\", "/").encode("ascii", "replace")
    dot = lowered.rfind(b".")
    if dot < 0:
        ext = b""
        stem = lowered
    else:
        ext = lowered[dot:]
        stem = lowered[:dot]
    length = len(stem)
    hash_val = 0
    if length > 0:
        last = stem[-1]
        second_last = stem[-2] if length > 2 else 0
        first = lowered[0]
        hash_val = last | (second_last << 8) | (length << 16) | (first << 24)
    if len(ext) > 0:
        ext_str = ext[1:]
        if ext_str == b"kf":
            hash_val |= 0x80
        elif ext_str == b"nif":
            hash_val |= 0x8000
        elif ext_str == b"dds":
            hash_val |= 0x8080
        elif ext_str == b"wav":
            hash_val |= 0x80000000
        middle_end = dot - 2 if dot >= 2 else 1
        middle = lowered[1:max(1, middle_end)]
        temp = _gen_hash_int(middle)
        temp = (temp + _gen_hash_int(ext)) & 0xFFFFFFFFFFFFFFFF
        hash_val |= (temp & 0xFFFFFFFF) << 32
    return hash_val & 0xFFFFFFFFFFFFFFFF


def write_dummy_bsa(path: Path, version: int) -> None:
    folder_name = _DUMMY_FOLDER_NAME
    file_name = _DUMMY_FILE_NAME
    is_sse = version >= BSA_VERSION_SSE
    folder_rec_size = 16 if is_sse else 12
    file_rec_size = 16
    file_name_len = len(file_name) + 1
    folder_name_len = len(folder_name) + 1

    buf = bytearray()
    buf += b"BSA\x00"
    buf += struct.pack("<I", version)
    buf += struct.pack("<I", _HEADER_SIZE)                     # folderRecordOffset
    buf += struct.pack("<I", _ARCHIVE_FLAGS)                   # archiveFlags
    buf += struct.pack("<I", 1)                                 # folderCount
    buf += struct.pack("<I", 1)                                 # fileCount
    buf += struct.pack("<I", folder_name_len)                   # folderNameLength
    buf += struct.pack("<I", file_name_len)                     # fileNameLength
    buf += struct.pack("<I", _FILE_FLAGS)                       # fileFlags

    # Folder record
    buf += struct.pack("<Q", _gen_hash(folder_name))           # hash
    buf += struct.pack("<I", 1)                                 # fileCount
    if is_sse:
        # v105: offset to this folder's file records
        file_recs_off = _HEADER_SIZE + folder_rec_size + folder_name_len
        buf += struct.pack("<I", file_recs_off)

    # Folder name
    buf += folder_name.encode("ascii", "replace") + b"\x00"

    # File record
    total_recs_size = _HEADER_SIZE + folder_rec_size + folder_name_len
    buf += struct.pack("<Q", _gen_hash(file_name))             # hash
    buf += struct.pack("<I", 0)                                 # sizeFlags (0 = uncompressed, 0 size)
    # File data offset: after header + folder rec + folder name + file rec + file name
    file_data_off = total_recs_size + file_rec_size + file_name_len
    buf += struct.pack("<I", file_data_off)

    # File name
    buf += file_name.encode("ascii", "replace") + b"\x00"

    # Dummy file data (4 bytes of zeros)
    buf += struct.pack("<I", 0)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(buf))


def _split_archive_list(list_str: str | None) -> list[str]:
    if not list_str:
        return []
    return [s.strip() for s in list_str.split(",") if s.strip()]


def _join_archive_list(items: list[str]) -> str:
    return ", ".join(items)


def ensure_in_archive_list(list_str: str | None, bsa_name: str) -> str:
    items = _split_archive_list(list_str)
    lname = bsa_name.lower()
    items = [s for s in items if s.lower() != lname]
    items.insert(0, bsa_name)
    return _join_archive_list(items)


def remove_from_archive_list(list_str: str | None, bsa_name: str) -> str:
    items = _split_archive_list(list_str)
    lname = bsa_name.lower()
    return _join_archive_list([s for s in items if s.lower() != lname])


def append_to_archive_list(list_str: str | None, bsa_names: list[str]) -> str:
    items = _split_archive_list(list_str)
    have = {s.lower() for s in items}
    for name in bsa_names:
        if name.lower() not in have:
            items.append(name)
            have.add(name.lower())
    return _join_archive_list(items)


def remove_many_from_archive_list(list_str: str | None, bsa_names: list[str]) -> str:
    items = _split_archive_list(list_str)
    drop = {n.lower() for n in bsa_names}
    return _join_archive_list([s for s in items if s.lower() not in drop])


BSA_GAME_MAP: dict[str, int] = {
    "skyrim": BSA_VERSION_FO3_FNV_SKYRIM,
    "skyrimspecialedition": BSA_VERSION_SSE,
    "fallout3": BSA_VERSION_FO3_FNV_SKYRIM,
    "falloutnewvegas": BSA_VERSION_FO3_FNV_SKYRIM,
    "fallout4": BSA_VERSION_SSE,
    "oblivion": BSA_VERSION_OBLIVION,
    "enderall": BSA_VERSION_FO3_FNV_SKYRIM,
    "nehrum": BSA_VERSION_FO3_FNV_SKYRIM,
}

DUMMY_BSA_NAME = "00_Dummy.bsa"


def get_bsa_version(game_id: str) -> int | None:
    key = game_id.lower().replace(" ", "").replace("-", "").replace("_", "")
    return BSA_GAME_MAP.get(key)


def apply_bsa_invalidation(game_path: Path, game_id: str) -> dict:
    version = get_bsa_version(game_id)
    if version is None:
        return {"ok": False, "error": f"BSA invalidation not supported for game: {game_id}"}
    data_dir = game_path / "Data"
    if not data_dir.is_dir():
        data_dir = game_path
    bsa_path = data_dir / DUMMY_BSA_NAME
    write_dummy_bsa(bsa_path, version)

    ini_paths = [
        game_path / "Skyrim.ini",
        game_path / "SkyrimCustom.ini",
        game_path / "Fallout.ini",
        game_path / "FalloutCustom.ini",
        game_path / "Oblivion.ini",
    ]
    ini_path = next((p for p in ini_paths if p.exists()), None)
    if ini_path:
        _patch_ini(ini_path, DUMMY_BSA_NAME)

    return {"ok": True, "data": {"bsa_path": str(bsa_path), "ini_path": str(ini_path) if ini_path else None}}


def _patch_ini(ini_path: Path, bsa_name: str) -> None:
    text = ini_path.read_text("utf-8", errors="replace")
    lines = text.splitlines(keepends=True)
    in_archive = False
    patched = False
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith("sarchivelist="):
            in_archive = True
            val = stripped.split("=", 1)[1] if "=" in stripped else ""
            new_val = ensure_in_archive_list(val, bsa_name)
            new_lines.append(f"sArchiveList={new_val}\n")
            patched = True
        elif in_archive and stripped.startswith("["):
            in_archive = False
            new_lines.append(line)
        elif in_archive:
            in_archive = False
            new_lines.append(line)
        else:
            new_lines.append(line)
    if not patched:
        new_lines.append(f"\nsArchiveList={bsa_name}\n")
    ini_path.write_text("".join(new_lines), "utf-8")


def remove_bsa_invalidation(game_path: Path, game_id: str) -> dict:
    version = get_bsa_version(game_id)
    if version is None:
        return {"ok": False, "error": f"BSA invalidation not supported for game: {game_id}"}
    data_dir = game_path / "Data"
    if not data_dir.is_dir():
        data_dir = game_path
    bsa_path = data_dir / DUMMY_BSA_NAME
    if bsa_path.exists():
        bsa_path.unlink()
    ini_paths = [
        game_path / "Skyrim.ini",
        game_path / "SkyrimCustom.ini",
        game_path / "Fallout.ini",
        game_path / "FalloutCustom.ini",
        game_path / "Oblivion.ini",
    ]
    for ini_path in ini_paths:
        if ini_path.exists():
            text = ini_path.read_text("utf-8", errors="replace")
            new_text = _restore_ini(text, DUMMY_BSA_NAME)
            if new_text != text:
                ini_path.write_text(new_text, "utf-8")
    return {"ok": True}


def _restore_ini(text: str, bsa_name: str) -> str:
    lines = text.splitlines(keepends=True)
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith("sarchivelist="):
            val = stripped.split("=", 1)[1] if "=" in stripped else ""
            new_val = remove_from_archive_list(val, bsa_name)
            new_lines.append(f"sArchiveList={new_val}\n")
        else:
            new_lines.append(line)
    return "".join(new_lines)
