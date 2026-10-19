#!/bin/sh
# macOS sips + Python 3 standard library: sh assets/icon/generate.sh
# Exact sips crops/resizes below regenerate all PNGs from the supplied 1024px JPEG.
# The 864px crop at (80,80) removes the rounded white border and bottom-right sparkle.
# Maskable padding #2c2d65 is sampled from source pixel (80,80); the head and F
# are inside the central 80% circle. Favicon uses a 400px head crop at (120,312).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
cd "$ROOT"
test "$(shasum -a 256 assets/icon/source.jpg | cut -d ' ' -f 1)" = 46702b7854d588960c6c57bc95ab76d24a4baff486ee6a227d5250e48eeb58cc
sips -s format png --cropToHeightWidth 864 864 --cropOffset 80 80 assets/icon/source.jpg --out "$T/crop.png" >/dev/null
for spec in apple-touch-icon:180 icon-192:192 icon-512:512; do
  sips -z "${spec#*:}" "${spec#*:}" "$T/crop.png" --out "public/${spec%:*}.png" >/dev/null
done
sips -z 384 384 "$T/crop.png" --out "$T/mask.png" >/dev/null
sips --padToHeightWidth 512 512 --padColor 2c2d65 "$T/mask.png" --out public/icon-maskable-512.png >/dev/null
sips -s format png --cropToHeightWidth 400 400 --cropOffset 120 312 assets/icon/source.jpg --out "$T/head.png" >/dev/null
sips -z 32 32 "$T/head.png" --out public/favicon-32.png >/dev/null

# sips embeds a creation timestamp in its sRGB ICC profile. Replace ancillary
# metadata with the standard sRGB chunk for byte-for-byte reproducible PNGs.
python3 - "$ROOT/public" <<'PYTHON'
from pathlib import Path
import struct
import sys
import zlib

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))

for name in ['apple-touch-icon', 'icon-192', 'icon-512', 'icon-maskable-512', 'favicon-32']:
    path = Path(sys.argv[1]) / (name + '.png')
    data = path.read_bytes()
    output = bytearray(data[:8])
    offset = 8
    while offset < len(data):
        length = struct.unpack('!I', data[offset:offset+4])[0]
        kind = data[offset+4:offset+8]
        if kind in (b'IHDR', b'IDAT', b'IEND'):
            output.extend(data[offset:offset+length+12])
        if kind == b'IHDR':
            output.extend(chunk(b'sRGB', b'\x00'))
        offset += length + 12
    path.write_bytes(output)
PYTHON
