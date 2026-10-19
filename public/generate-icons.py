"""Original S mark; regenerate with python3 public/generate-icons.py.
Standard library only, no build step or font dependency. Polygon rasterization uses
4x supersampling; every file is deterministic. The maskable mark stays within the
central safe circle (radius 40% of the canvas).
"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent
# A single continuous, geometric S silhouette on a 100 x 100 canvas.
POINTS = [(66,30),(38,30),(30,38),(30,48),(38,55),(57,55),(57,61),(34,61),(34,70),(63,70),(71,62),(71,51),(63,45),(44,45),(44,39),(66,39)]
BG = (23,44,54)

def inside(x, y):
    hit = False
    for (ax, ay), (bx, by) in zip(POINTS, POINTS[1:] + POINTS[:1]):
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            hit = not hit
    return hit

def png(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            n = sum(inside((x+(sx+.5)/4)*100/size, (y+(sy+.5)/4)*100/size) for sy in range(4) for sx in range(4))
            rows.extend(round(c + (255-c)*n/16) for c in BG)
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind+data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B',size,size,8,2,0,0,0)) + chunk(b'IDAT',zlib.compress(bytes(rows),9)) + chunk(b'IEND',b'')

svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#172c36"/><polygon fill="white" points="' + ' '.join(f'{x},{y}' for x,y in POINTS) + '"/></svg>\n'
(ROOT/'favicon.svg').write_text(svg)
for name,size in [('icon-192.png',192),('icon-512.png',512),('icon-maskable-512.png',512),('apple-touch-icon.png',180),('favicon-32.png',32)]:
    (ROOT/name).write_bytes(png(size))
