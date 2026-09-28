#!/usr/bin/env python3
"""Render the extension icons: a brain sitting quietly with its eyes closed.

Original artwork, drawn in code. Writes PNGs by hand (zlib + struct) so the
build needs nothing installed.

Detail is dropped as the canvas shrinks — a face that reads at 128px is mush
at 16px, where the icon has to survive as a silhouette:

    16px   brain, closed eyes, smile
    32px   + the fold between the hemispheres
    48px   + cheeks and the calm lines above
    128px  + the remaining folds

    python3 tools/make-icons.py
"""
import binascii
import math
import os
import struct
import zlib

SIZES = (16, 32, 48, 128)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

CREAM = (0xFC, 0xF4, 0xE4)
PINK = (0xF2, 0xAD, 0xB0)
FOLD = (0xE1, 0x8F, 0x95)
INK = (0x2C, 0x2C, 0x2C)
BLUSH = (0xF7, 0x99, 0x8C)
BLUE = (0x76, 0xB2, 0xD4)

SS = 4  # supersampling per axis

# --- layout, in unit coordinates (y grows downward) ------------------------
BRAIN_CX, BRAIN_CY = 0.50, 0.625
BRAIN_RX, BRAIN_RY = 0.285, 0.232
BUMP_N, BUMP_R = 10, 0.082

EYE_Y, EYE_DX, EYE_R = 0.590, 0.086, 0.037
MOUTH_CY, MOUTH_R = 0.657, 0.042
CHEEK_DX, CHEEK_Y = 0.168, 0.664
CHEEK_RX, CHEEK_RY = 0.048, 0.029

AURA_ANGLES = (52, 71, 90, 109, 128)
AURA_IN, AURA_OUT = 0.345, 0.450


def bumps():
    """Lobes around the rim, so the silhouette reads as a brain not a cloud."""
    out = []
    for i in range(BUMP_N):
        a = 2 * math.pi * i / BUMP_N
        out.append(
            (
                BRAIN_CX + (BRAIN_RX - 0.035) * math.cos(a),
                BRAIN_CY - (BRAIN_RY - 0.030) * math.sin(a),
                BUMP_R + 0.013 * math.sin(3 * a),
            )
        )
    return out


BUMPS = bumps()


def arc(cx, cy, r, deg0, deg1, n=18, squash=1.0):
    pts = []
    for i in range(n + 1):
        t = math.radians(deg0 + (deg1 - deg0) * i / n)
        pts.append((cx + r * math.cos(t), cy - r * squash * math.sin(t)))
    return pts


def face_paths(spread=0.0, gap=0.0):
    """Eyes and mouth. On a tiny canvas they are pushed apart, or they land
    within a pixel of each other and merge into one dark smudge."""
    return (
        arc(BRAIN_CX - EYE_DX - gap, EYE_Y - spread, EYE_R, 15, 165, squash=0.52),
        arc(BRAIN_CX + EYE_DX + gap, EYE_Y - spread, EYE_R, 15, 165, squash=0.52),
        arc(BRAIN_CX, MOUTH_CY + spread, MOUTH_R, 205, 335, squash=0.62),
    )

# The split between the hemispheres: down from the crown, between the eyes.
CENTRE_FOLD = [(0.507, 0.398), (0.495, 0.440), (0.509, 0.484), (0.500, 0.528)]

# Folds are what separate a brain from a flower, so there are several, tucked
# into the space the face does not use.
FOLDS = (
    arc(0.325, 0.498, 0.072, 200, 345, squash=0.80),
    arc(0.675, 0.498, 0.072, 195, 340, squash=0.80),
    arc(0.245, 0.628, 0.058, 200, 350, squash=0.90),
    arc(0.755, 0.628, 0.058, 190, 340, squash=0.90),
    arc(0.400, 0.435, 0.050, 205, 335, squash=0.75),
    arc(0.600, 0.435, 0.050, 205, 335, squash=0.75),
)


def inside_rounded_rect(x, y, inset, radius):
    lo, hi = inset, 1.0 - inset
    if not (lo <= x <= hi and lo <= y <= hi):
        return False
    cx = min(max(x, lo + radius), hi - radius)
    cy = min(max(y, lo + radius), hi - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius


def inside_ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def near_segment(x, y, a, b, half):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / span))
    return (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2 <= half * half


def near_path(x, y, pts, half):
    for i in range(len(pts) - 1):
        if near_segment(x, y, pts[i], pts[i + 1], half):
            return True
    return False


def in_brain(x, y):
    if inside_ellipse(x, y, BRAIN_CX, BRAIN_CY, BRAIN_RX, BRAIN_RY):
        return True
    for cx, cy, r in BUMPS:
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return True
    return False


def sample(x, y, faces, centre, extras, folds, w):
    """Colour at a unit point, or None for transparent. `w` scales stroke widths."""
    if not inside_rounded_rect(x, y, 0.02, 0.22):
        return None

    if extras:
        for deg in AURA_ANGLES:
            t = math.radians(deg)
            a = (BRAIN_CX + AURA_IN * math.cos(t), BRAIN_CY - AURA_IN * math.sin(t))
            b = (BRAIN_CX + AURA_OUT * math.cos(t), BRAIN_CY - AURA_OUT * math.sin(t))
            if near_segment(x, y, a, b, 0.022 * w):
                return BLUE

    if not in_brain(x, y):
        return CREAM

    colour = PINK

    if folds:
        for path in FOLDS:
            if near_path(x, y, path, 0.011 * w):
                colour = FOLD
    if centre and near_path(x, y, CENTRE_FOLD, 0.013 * w):
        colour = FOLD

    if extras:
        for dx in (-CHEEK_DX, CHEEK_DX):
            if inside_ellipse(x, y, BRAIN_CX + dx, CHEEK_Y, CHEEK_RX, CHEEK_RY):
                colour = BLUSH

    # The face is the whole point: never dropped, only adjusted.
    for path in faces:
        if near_path(x, y, path, 0.016 * w):
            colour = INK

    return colour


def render(size):
    # Small canvases need proportionally fatter strokes to survive.
    w = {16: 1.30, 32: 1.15, 48: 1.06}.get(size, 1.0)
    centre, extras, folds = size >= 32, size >= 48, size >= 64
    faces = face_paths(0.030, 0.012) if size <= 16 else face_paths()

    rows = []
    step = 1.0 / (size * SS)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    got = sample(
                        (px * SS + sx + 0.5) * step,
                        (py * SS + sy + 0.5) * step,
                        faces, centre, extras, folds, w,
                    )
                    if got is not None:
                        r += got[0]
                        g += got[1]
                        b += got[2]
                        a += 255
            n = SS * SS
            if a:
                k = a / 255  # un-premultiply so edge pixels keep their colour
                row += bytes((round(r / k), round(g / k), round(b / k), round(a / n)))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def chunk(tag, payload):
    body = tag + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", binascii.crc32(body))


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT, f"icon{size}.png")
        print(f"icons/icon{size}.png  {write_png(path, size, render(size))} bytes")


if __name__ == "__main__":
    main()
