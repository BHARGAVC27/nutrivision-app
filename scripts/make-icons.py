r"""Generates the launcher, adaptive, splash and favicon images for NutriVision.

The mark: a cream leaf on the app's green that also reads as an eye — "Nutri"
and "Vision" — whose iris is a ring in the three MUAC-tape colours (red, amber,
green), the same three colours the app uses for refer / not sure / healthy.
Drawn at 4x and downsampled for smooth edges.

    ..\.venv-cv\Scripts\python.exe scripts\make-icons.py

Outputs go to assets/images/ and are referenced from app.json; run
`npx expo prebuild --platform android` afterwards so the Android launcher
mipmaps and splash drawables are regenerated from them.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"

GREEN = (0x1E, 0x6B, 0x4C, 255)      # theme colors.green
CREAM = (0xFF, 0xFD, 0xF8, 255)      # theme colors.surface
RED = (0xA8, 0x35, 0x2A, 255)        # theme colors.red
AMBER = (0xB9, 0x76, 0x1B, 255)      # theme colors.amber
LEAF_GREEN = (0x2E, 0x8B, 0x62, 255)  # a lighter green so the ring's green arc reads on cream
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling factor
TILT = 32  # degrees; the leaf points up to the right


def almond_mask(S: int, a: float, b: float) -> Image.Image:
    """Vesica (leaf / eye) shape centred on an S×S canvas: half-width a, half-height b (px)."""
    R = (b + a * a / b) / 2
    d = (a * a / b - b) / 2
    c = S / 2
    top = Image.new("L", (S, S), 0)
    bot = Image.new("L", (S, S), 0)
    ImageDraw.Draw(top).ellipse((c - R, c - d - R, c + R, c - d + R), fill=255)
    ImageDraw.Draw(bot).ellipse((c - R, c + d - R, c + R, c + d + R), fill=255)
    return ImageChops.multiply(top, bot)


def circle_mask(S: int, r: float) -> Image.Image:
    m = Image.new("L", (S, S), 0)
    c = S / 2
    ImageDraw.Draw(m).ellipse((c - r, c - r, c + r, c + r), fill=255)
    return m


def leaf_eye(size: int, span: float, mono: bool = False) -> Image.Image:
    """The mark on a transparent size×size canvas; `span` = leaf length as a fraction of size."""
    S = size * SS
    a = span * S / 2            # half-length of the leaf
    b = a * 0.52                # half-width
    r_out = b * 0.78            # iris ring
    r_in = r_out * 0.66
    r_pupil = r_out * 0.36
    c = S / 2

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    leaf = almond_mask(S, a, b)
    # a short stem at the lower tip, so it reads as a leaf as well as an eye (no line across the
    # iris: that would read as the "eye with a slash" hidden/visibility-off symbol)
    stem_w = S * 0.034
    sx, sy = c - a * 0.96, c
    ImageDraw.Draw(leaf).line((sx, sy, sx - a * 0.22, sy + a * 0.07), fill=255, width=int(stem_w))
    tip = (sx - a * 0.22, sy + a * 0.07)
    ImageDraw.Draw(leaf).ellipse((tip[0] - stem_w / 2, tip[1] - stem_w / 2, tip[0] + stem_w / 2, tip[1] + stem_w / 2), fill=255)
    layer.paste(WHITE if mono else CREAM, (0, 0), leaf)

    # iris: three arcs with small gaps, like the bands of a MUAC tape
    ring = ImageChops.subtract(circle_mask(S, r_out), circle_mask(S, r_in))
    if mono:
        layer.putalpha(ImageChops.subtract(layer.getchannel("A"), ring))
    else:
        gap = 7
        arcs = [(RED, 200, 270), (AMBER, 270, 320), (LEAF_GREEN, 320, 560)]  # degrees, clockwise from 3 o'clock
        box = (c - r_out, c - r_out, c + r_out, c + r_out)
        for color, start, end in arcs:
            seg = Image.new("L", (S, S), 0)
            ImageDraw.Draw(seg).pieslice(box, start + gap / 2, end - gap / 2, fill=255)
            layer.paste(color, (0, 0), ImageChops.multiply(seg, ring))
    pupil = circle_mask(S, r_pupil)
    layer.paste(WHITE if mono else GREEN, (0, 0), pupil)

    layer = layer.rotate(TILT, resample=Image.BICUBIC, center=(c, c))
    return layer.resize((size, size), Image.LANCZOS)


def tile(size: int, radius_ratio: float = 0.225, span: float = 0.74) -> Image.Image:
    """Rounded green square with the mark: launcher icon, splash, favicon, in-app logo."""
    S = size * SS
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=GREEN)
    bg = bg.resize((size, size), Image.LANCZOS)
    return Image.alpha_composite(bg, leaf_eye(size, span))


if __name__ == "__main__":
    tile(1024).save(OUT / "icon.png")
    # Adaptive icon: flat green background; the mark sits inside the 66% safe zone of the foreground.
    Image.new("RGBA", (1024, 1024), GREEN).save(OUT / "android-icon-background.png")
    leaf_eye(1024, span=0.56).save(OUT / "android-icon-foreground.png")
    leaf_eye(1024, span=0.56, mono=True).save(OUT / "android-icon-monochrome.png")
    # Splash: the tile on the paper page colour set in app.json.
    tile(456).save(OUT / "splash-icon.png")
    tile(48, span=0.80).save(OUT / "favicon.png")
    print("icons written to", OUT)
