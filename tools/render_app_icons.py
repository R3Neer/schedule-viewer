#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"


def render(size: int, filename: str) -> None:
    scale = size / 64
    image = Image.new("RGB", (size, size), "#173F68")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((13 * scale, 15 * scale, 51 * scale, 51 * scale), radius=8 * scale, fill="#FFFFFF")
    draw.rectangle((13 * scale, 23 * scale, 51 * scale, 27 * scale), fill="#70B7E6")
    for x in (24, 40):
        draw.rounded_rectangle(((x - 2) * scale, 12 * scale, (x + 2) * scale, 23 * scale), radius=2 * scale, fill="#70B7E6")
    for x, y, width, height in ((22, 33, 7, 7), (35, 33, 7, 7), (22, 43, 7, 4)):
        draw.rounded_rectangle((x * scale, y * scale, (x + width) * scale, (y + height) * scale), radius=1.2 * scale, fill="#173F68")
    image.save(OUT / filename, optimize=True)


OUT.mkdir(exist_ok=True)
render(180, "apple-touch-icon.png")
render(192, "icon-192.png")
render(512, "icon-512.png")
print(f"App icons written to {OUT}")
