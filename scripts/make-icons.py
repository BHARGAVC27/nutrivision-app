r"""Generates the launcher, adaptive, splash and favicon images from the
design's brand mark: a green rounded square with the serif "m".

    ..\.venv-cv\Scripts\python.exe scripts\make-icons.py

Outputs go to assets/images/ and are referenced from app.json.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"
FONT = ROOT / "node_modules" / "@expo-google-fonts" / "source-serif-4" / "700Bold" / "SourceSerif4_700Bold.ttf"

GREEN = (0x1E, 0x6B, 0x4C, 255)
CREAM = (0xFF, 0xFD, 0xF8, 255)
PAGE = (0xF6, 0xF1, 0xE7, 255)
GLYPH = "m"


def glyph(size: int, color, box: int) -> Image.Image:
    """The letter, centred on a transparent `size` canvas, sized to `box` px."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT), int(box * 0.92))
    l, t, r, b = draw.textbbox((0, 0), GLYPH, font=font)
    w, h = r - l, b - t
    draw.text(((size - w) / 2 - l, (size - h) / 2 - t), GLYPH, font=font, fill=color)
    return img


def mark(size: int, radius_ratio: float = 14 / 46) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=GREEN)
    return Image.alpha_composite(img, glyph(size, CREAM, int(size * 0.55)))


# Launcher icon (also the iOS-style square used by expo-image on the home screen).
mark(1024).save(OUT / "icon.png")

# Adaptive icon: background is flat green, the glyph sits inside the 66% safe zone.
Image.new("RGBA", (512, 512), GREEN).save(OUT / "android-icon-background.png")
glyph(512, CREAM, int(512 * 0.44)).save(OUT / "android-icon-foreground.png")
glyph(432, (255, 255, 255, 255), int(432 * 0.44)).save(OUT / "android-icon-monochrome.png")

# Splash: the mark on the paper page colour set in app.json.
mark(228).save(OUT / "splash-icon.png")

mark(48).save(OUT / "favicon.png")
print("icons written to", OUT)
