from __future__ import annotations
import struct
import zlib
from pathlib import Path
from typing import BinaryIO, Iterator


BSA_MAGIC = b"BSA\x00"
BA2_MAGIC = b"BTDX"
BA2_GNRL = b"GNRL"
BA2_DX10 = b"DX10"

BSA_V_OBLIVION = 0x67
BSA_V_TES4 = 0x68
BSA_V_SSE = 0x69

FILE_REC_SIZE = 16


class ArchiveEntry:
    __slots__ = ("path", "data", "compressed")

    def __init__(self, path: str, data: bytes, compressed: bool = False) -> None:
        self.path = path
        self.data = data
        self.compressed = compressed


def _read_names(f: BinaryIO, count: int) -> list[str]:
    names: list[str] = []
    for _ in range(count):
        out: list[bytes] = []
        while True:
            b = f.read(1)
            if not b or b == b"\x00":
                break
            out.append(b)
        names.append(b"".join(out).decode("ascii", "replace"))
    return names


# ── BSA ─────────────────────────────────────────────────────────────────────


def extract_bsa(archive_path: str | Path, dest_dir: str | Path) -> list[str]:
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    extracted: list[str] = []
    with open(archive_path, "rb") as f:
        for entry in _iter_bsa(f):
            path = entry.path.replace("\\", "/")
            out_path = dest / path
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(entry.data)
            extracted.append(path)
    return extracted


def list_bsa(archive_path: str | Path) -> list[str]:
    with open(archive_path, "rb") as f:
        return [e.path for e in _iter_bsa(f)]


def _iter_bsa(f: BinaryIO) -> Iterator[ArchiveEntry]:
    hdr = f.read(36)
    if hdr[:4] != BSA_MAGIC:
        raise ValueError(f"Not a BSA archive")

    version = struct.unpack_from("<I", hdr, 4)[0]
    folder_offset = struct.unpack_from("<I", hdr, 8)[0]
    archive_flags = struct.unpack_from("<I", hdr, 12)[0]
    folder_count = struct.unpack_from("<I", hdr, 16)[0]
    file_count = struct.unpack_from("<I", hdr, 20)[0]
    folder_name_len = struct.unpack_from("<I", hdr, 24)[0]
    file_name_len = struct.unpack_from("<I", hdr, 28)[0]

    is_sse = version >= BSA_V_SSE
    compressed_default = bool(archive_flags & 0x04)
    folder_rec_size = 16 if is_sse else 12

    # Read folder records
    f.seek(folder_offset)
    folders: list[tuple[int, int, int]] = []  # (hash, fileCount, fileRecsOffset)
    for _ in range(folder_count):
        fhash = struct.unpack("<Q", f.read(8))[0]
        fcount = struct.unpack("<I", f.read(4))[0]
        recs_off = struct.unpack("<I", f.read(4))[0] if is_sse else 0
        folders.append((fhash, fcount, recs_off))

    # For SSE v105: file records at per-folder offsets. Names block starts after
    # all file records. If offsets point to nonsensical locations (e.g. past
    # sequential layout, as in buggy dummy BSAs), fall back to sequential layout.
    sequential_names_start = folder_offset + folder_count * folder_rec_size + file_count * FILE_REC_SIZE

    if is_sse and folders:
        computed_start = max(
            (recs_off + fcount * FILE_REC_SIZE) for _h, fcount, recs_off in folders
        )
        # If computed offset is past sequential or negative, use sequential
        if computed_start > sequential_names_start or computed_start < folder_offset:
            names_start = sequential_names_start
        else:
            names_start = computed_start
    else:
        names_start = sequential_names_start

    # Read names
    f.seek(names_start)
    folder_names = _read_names(f, folder_count)

    file_names_start = names_start + folder_name_len
    f.seek(file_names_start)
    file_names = _read_names(f, file_count)

    data_start = file_names_start + file_name_len

    # Iterate files per folder
    global_fi = 0
    for folder_idx, (_fhash, fcount, recs_off) in enumerate(folders):
        folder_name = folder_names[folder_idx] if folder_idx < len(folder_names) else ""

        if is_sse:
            # Sanity check: if recs_off points into names area, use sequential
            expected = folder_offset + folder_count * folder_rec_size + \
                       FILE_REC_SIZE * sum(f[1] for f in folders[:folder_idx])
            if recs_off >= names_start or recs_off < folder_offset:
                f.seek(expected)
            else:
                f.seek(recs_off)
        else:
            off = folder_offset + folder_count * folder_rec_size + \
                  FILE_REC_SIZE * sum(f[1] for f in folders[:folder_idx])
            f.seek(off)

        for _ in range(fcount):
            _fh = struct.unpack("<Q", f.read(8))[0]
            size_flags = struct.unpack("<I", f.read(4))[0]
            fdata_off = struct.unpack("<I", f.read(4))[0]

            raw_size = size_flags & 0x3FFFFFFF
            bit30 = bool(size_flags & (1 << 30))
            compressed = compressed_default ^ bit30

            name = file_names[global_fi] if global_fi < len(file_names) else f"f{global_fi}.bin"
            sep = "/" if folder_name else ""
            path = f"{folder_name}{sep}{name}"
            global_fi += 1

            abs_off = data_start + fdata_off if is_sse else fdata_off

            f.seek(abs_off)
            raw_data = f.read(raw_size)

            if compressed:
                try:
                    data = zlib.decompress(raw_data, -zlib.MAX_WBITS)
                except zlib.error:
                    try:
                        data = zlib.decompress(raw_data)
                    except zlib.error:
                        data = raw_data
            else:
                data = raw_data

            yield ArchiveEntry(path, data, compressed)


# ── BA2 ─────────────────────────────────────────────────────────────────────


def extract_ba2(archive_path: str | Path, dest_dir: str | Path) -> list[str]:
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    extracted: list[str] = []
    with open(archive_path, "rb") as f:
        for entry in _iter_ba2(f):
            path = entry.path.replace("\\", "/")
            out_path = dest / path
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(entry.data)
            extracted.append(path)
    return extracted


def list_ba2(archive_path: str | Path) -> list[str]:
    with open(archive_path, "rb") as f:
        return [e.path for e in _iter_ba2(f)]


def _iter_ba2(f: BinaryIO) -> Iterator[ArchiveEntry]:
    magic = f.read(4)
    if magic != BA2_MAGIC:
        raise ValueError(f"Not a BA2 archive")

    version = struct.unpack("<I", f.read(4))[0]
    arc_type = f.read(4)
    file_count = struct.unpack("<I", f.read(4))[0]
    name_offset = struct.unpack("<Q", f.read(8))[0]

    if arc_type == BA2_GNRL:
        yield from _iter_ba2_gnrl(f, file_count, name_offset)
    elif arc_type == BA2_DX10:
        yield from _iter_ba2_dx10(f, file_count, name_offset)
    else:
        raise ValueError(f"Unknown BA2 type: {arc_type!r}")


def _iter_ba2_gnrl(f: BinaryIO, count: int, name_offset: int) -> Iterator[ArchiveEntry]:
    records: list[tuple[int, str, int, int, int]] = []
    for _ in range(count):
        _hash = struct.unpack("<Q", f.read(8))[0]
        ext = f.read(4).rstrip(b"\x00").decode("ascii", "replace")
        _dir_hash = struct.unpack("<I", f.read(4))[0]
        unpacked_size = struct.unpack("<I", f.read(4))[0]
        offset = struct.unpack("<I", f.read(4))[0]
        packed_size = struct.unpack("<I", f.read(4))[0]
        records.append((_hash, ext, unpacked_size, offset, packed_size))

    f.seek(name_offset)
    names = _read_names(f, count)

    for i, (_hash, ext, unpacked_size, offset, packed_size) in enumerate(records):
        name = names[i] if i < len(names) else f"file_{i}.{ext}"

        f.seek(offset)
        raw = f.read(packed_size if packed_size > 0 else unpacked_size)

        if packed_size > 0 and packed_size < unpacked_size:
            try:
                data = zlib.decompress(raw)
            except zlib.error:
                data = raw
        else:
            data = raw

        yield ArchiveEntry(name, data, packed_size < unpacked_size)


def _iter_ba2_dx10(f: BinaryIO, count: int, name_offset: int) -> Iterator[ArchiveEntry]:
    fmt_names = {
        71: "DXT1", 72: "DXT1_SRGB", 74: "DXT3", 75: "DXT3_SRGB",
        77: "DXT5", 78: "DXT5_SRGB", 97: "BC4_U", 98: "BC4_S",
        99: "BC5_U", 100: "BC5_S", 111: "BC6_UF16", 112: "BC6_SF16",
        113: "BC7", 114: "BC7_SRGB",
    }

    records: list[dict] = []
    for _ in range(count):
        _hash = struct.unpack("<Q", f.read(8))[0]
        ext = f.read(4).rstrip(b"\x00").decode("ascii", "replace")
        _dir_hash = struct.unpack("<I", f.read(4))[0]
        chunk_count = struct.unpack("<I", f.read(4))[0]
        _chunk_hdr_sz = struct.unpack("<I", f.read(4))[0]
        height = struct.unpack("<H", f.read(2))[0]
        width = struct.unpack("<H", f.read(2))[0]
        mips = struct.unpack("<I", f.read(4))[0]
        fmt_id = struct.unpack("<I", f.read(4))[0]

        chunks: list[tuple[int, int, int]] = []
        for _ in range(chunk_count):
            coff = struct.unpack("<Q", f.read(8))[0]
            cpack = struct.unpack("<I", f.read(4))[0]
            cunp = struct.unpack("<I", f.read(4))[0]
            _sm = struct.unpack("<I", f.read(4))[0]
            _em = struct.unpack("<I", f.read(4))[0]
            chunks.append((coff, cpack, cunp))

        records.append({
            "ext": ext, "height": height, "width": width,
            "mips": mips, "fmt": fmt_id, "chunks": chunks,
        })

    f.seek(name_offset)
    names = _read_names(f, count)

    DX10_HDR = struct.Struct("<IIIIIIIII")
    DDS_PF = struct.Struct("<IIIIII")

    for i, rec in enumerate(records):
        name = names[i] if i < len(names) else f"tex_{i}.{rec['ext']}"
        fmt_name = fmt_names.get(rec["fmt"], f"UNK{rec['fmt']}")

        pixel_data = bytearray()
        for coff, cpack, cunp in rec["chunks"]:
            f.seek(coff)
            raw = f.read(cpack)
            if cpack != cunp:
                try:
                    pixel_data.extend(zlib.decompress(raw))
                except zlib.error:
                    pixel_data.extend(raw)
            else:
                pixel_data.extend(raw)

        fourcc = 0x30315844  # "DX10"
        if fmt_name == "DXT1":
            fourcc = 0x31545844  # "DXT1"
        elif "DXT3" in fmt_name:
            fourcc = 0x33545844  # "DXT3"
        elif "DXT5" in fmt_name:
            fourcc = 0x35545844  # "DXT5"

        caps = 0x1000
        if rec["mips"] > 1:
            caps |= 0x400008

        dds = bytearray()
        dds += b"DDS "
        dds += struct.pack("<I", 124)

        # dwSize, dwFlags, dwHeight, dwWidth, dwPitchOrLinearSize, dwDepth, dwMipMapCount
        dds += struct.pack("<IIIIIII", 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000,
                          rec["height"], rec["width"], 0, 0, rec["mips"])
        dds += b"\x00" * 44  # reserved
        # ddpf
        dds += DDS_PF.pack(32, 4, 0x4, 0, 0, 0)
        # Replace fourCC
        dds[-16:-12] = struct.pack("<I", fourcc)
        dds += struct.pack("<III", caps, 0, 0)
        dds += struct.pack("<I", 0)  # reserved
        dds += bytes(pixel_data)

        yield ArchiveEntry(name, bytes(dds), False)


# ── Shared ──────────────────────────────────────────────────────────────────


def detect_format(archive_path: str | Path) -> str:
    with open(archive_path, "rb") as f:
        magic = f.read(4)
    if magic == BSA_MAGIC:
        return "bsa"
    elif magic == BA2_MAGIC:
        return "ba2"
    return "unknown"


def extract_archive(archive_path: str | Path, dest_dir: str | Path) -> list[str]:
    fmt = detect_format(archive_path)
    if fmt == "bsa":
        return extract_bsa(archive_path, dest_dir)
    elif fmt == "ba2":
        return extract_ba2(archive_path, dest_dir)
    raise ValueError(f"Unknown archive format: {fmt}")
