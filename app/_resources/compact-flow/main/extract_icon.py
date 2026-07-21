import sys, os, struct, io
from PIL import Image

try:
    import pefile
except ImportError:
    pefile = None

PNG_HEADER = b'\x89PNG\r\n\x1a\n'

def dib_to_png(data):
    if len(data) < 40:
        return None
    if data[:len(PNG_HEADER)] == PNG_HEADER:
        img = Image.open(io.BytesIO(data))
        return img
    header_size = struct.unpack('<I', data[0:4])[0]
    if header_size < 40:
        return None
    width = struct.unpack('<I', data[4:8])[0]
    height_raw = struct.unpack('<I', data[8:12])[0]
    bpp = struct.unpack('<H', data[14:16])[0]
    height = height_raw // 2 if height_raw > 0 else 0
    if width == 0 or height == 0 or width > 512 or height > 512:
        return None

    row_size = ((width * bpp + 31) // 32) * 4
    pixel_offset = header_size
    compression = struct.unpack('<I', data[16:20])[0]
    if compression == 3:
        pixel_offset += 12
    colors_used = struct.unpack('<I', data[32:36])[0]
    if colors_used == 0 and bpp <= 8:
        colors_used = 1 << bpp
    pixel_offset += colors_used * 4

    expected = pixel_offset + row_size * height
    if len(data) < expected:
        height = height_raw
        expected = pixel_offset + row_size * height
        if len(data) < expected:
            return None

    pixels = bytearray()
    for y in range(height - 1, -1, -1):
        row_start = pixel_offset + y * row_size
        row = data[row_start:row_start + row_size]
        if bpp == 32:
            pixels.extend(row[:width * 4])
        elif bpp == 24:
            for x in range(width):
                off = x * 3
                pixels.extend(row[off:off + 3])
                pixels.append(255)
        else:
            return None

    if bpp == 32:
        img = Image.frombuffer('RGBA', (width, height), bytes(pixels), 'raw', 'BGRA', 0, 1)
    elif bpp == 24:
        img = Image.frombuffer('RGBA', (width, height), bytes(pixels), 'raw', 'BGRA', 0, 1)
    else:
        return None
    return img


def rva_read(pe, exe_path, rva, size):
    with open(exe_path, 'rb') as f:
        for s in pe.sections:
            va = s.VirtualAddress
            end = va + max(s.Misc_VirtualSize, s.SizeOfRawData)
            if va <= rva < end:
                offset = s.PointerToRawData + (rva - va)
                f.seek(offset)
                return f.read(size)
    return None

def extract_icon_pe(exe_path, out_path):
    if pefile is None:
        return False
    try:
        pe = pefile.PE(exe_path, fast_load=True)
        pe.parse_data_directories(directories=[
            pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']
        ])
        icon_data = {}
        group_icon_data = None
        fid = None

        for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
            if entry.id in (pefile.RESOURCE_TYPE['RT_ICON'], pefile.RESOURCE_TYPE['RT_GROUP_ICON']):
                for sub in entry.directory.entries:
                    if hasattr(sub, 'directory') and sub.directory:
                        for lang in sub.directory.entries:
                            rva = lang.data.struct.OffsetToData
                            sz = lang.data.struct.Size
                            raw = rva_read(pe, exe_path, rva, sz)
                            if raw is None:
                                continue
                            if entry.id == pefile.RESOURCE_TYPE['RT_GROUP_ICON']:
                                group_icon_data = raw
                            else:
                                icon_data[sub.id] = raw

        if group_icon_data is None or not icon_data:
            return False

        count = struct.unpack('<H', group_icon_data[4:6])[0]
        for i in range(count):
            off = 6 + i * 14
            icon_id = struct.unpack('<H', group_icon_data[off+12:off+14])[0]
            if icon_id in icon_data:
                img = dib_to_png(icon_data[icon_id])
                if img:
                    img.save(out_path, 'PNG')
                    return True
    except Exception as e:
        print(f'pefile error: {e}', file=sys.stderr)
    return False


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(1)
    exe_path = sys.argv[1]
    out_path = sys.argv[2]
    if not os.path.exists(exe_path):
        sys.exit(1)
    if extract_icon_pe(exe_path, out_path):
        sys.exit(0)
    sys.exit(1)
