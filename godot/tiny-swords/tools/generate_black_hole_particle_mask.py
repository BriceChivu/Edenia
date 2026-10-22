"""Bake the incoming particle trails from the original atlas. Requires ImageMagick."""
from pathlib import Path
import math
import struct
import subprocess
import zlib

folder = Path(__file__).resolve().parents[1] / "assets/black-hole"
frame = 567
size = 144
rgba = subprocess.check_output(["magick", str(folder / "portal.png"), "-depth", "8", "rgba:-"])
centers = set()
for index in range(8):
    # The first third of each frame contains the separate incoming specks;
    # the opaque aperture and its jagged rim begin farther right.
    for y in range(frame):
        for x in range(frame // 3):
            offset = (((index // 4 * frame + y) * frame * 4) + index % 4 * frame + x) * 4
            r, g, b, a = rgba[offset:offset + 4]
            if a > 128 and max(r, g, b) > 90:
                centers.add((round(x * size / frame), round(y * size / frame)))

# A small soft neighborhood joins the specks' eight poses into their trails.
# The mask remains fixed while the particles animate, avoiding pulsing patches.
pixels = bytearray(size * size)
for cx, cy in centers:
    for y in range(max(0, cy - 7), min(size, cy + 8)):
        for x in range(max(0, cx - 7), min(size, cx + 8)):
            distance = math.hypot(x - cx, y - cy)
            weight = max(0.0, min(1.0, (7.0 - distance) / 3.0))
            pixels[y * size + x] = max(pixels[y * size + x], round(weight * 255))

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

scanlines = b"".join(b"\0" + pixels[y * size:(y + 1) * size] for y in range(size))
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 0, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(scanlines)) + chunk(b"IEND", b"")
(folder / "particle_flow_mask.png").write_bytes(png)
print("Baked incoming particle trail mask")
