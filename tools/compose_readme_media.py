#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "docs" / "media"


def rounded(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius, fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def paste_card(canvas: Image.Image, image: Image.Image, position: tuple[int, int], radius: int, shadow: int = 28) -> None:
    x, y = position
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow_layer)
    draw.rounded_rectangle(
        (x - 4, y + 10, x + image.width + 4, y + image.height + 18),
        radius + 5,
        fill=(18, 35, 58, 105),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow))
    canvas.alpha_composite(shadow_layer)
    layer.alpha_composite(rounded(image, radius), position)
    canvas.alpha_composite(layer)


def main() -> None:
    width, height = 1600, 900
    canvas = Image.new("RGBA", (width, height))
    pixels = canvas.load()
    for y in range(height):
        amount = y / (height - 1)
        start, end = (239, 246, 255), (214, 227, 244)
        color = tuple(round(start[index] * (1 - amount) + end[index] * amount) for index in range(3))
        for x in range(width):
            glow = max(0.0, 1.0 - (((x - 1270) / 720) ** 2 + ((y - 80) / 620) ** 2))
            pixels[x, y] = tuple(min(255, round(channel + glow * 10)) for channel in color) + (255,)

    desktop = Image.open(MEDIA / "desktop-week-light.png").convert("RGB")
    desktop.thumbnail((1120, 700), Image.Resampling.LANCZOS)
    phone = Image.open(MEDIA / "iphone-images-light.png").convert("RGB")
    phone.thumbnail((335, 730), Image.Resampling.LANCZOS)

    paste_card(canvas, desktop, (72, 112), 26, 34)
    paste_card(canvas, phone, (1190, 72), 42, 30)
    canvas.convert("RGB").save(MEDIA / "hero.png", optimize=True)
    print(f"README hero written to {MEDIA / 'hero.png'}")


if __name__ == "__main__":
    main()
