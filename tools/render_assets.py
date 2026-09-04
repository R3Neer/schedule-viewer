#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_REGULAR = next((path for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/segoeui.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf") if Path(path).exists()), "DejaVuSans.ttf")
FONT_BOLD = next((path for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/segoeuib.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf") if Path(path).exists()), "DejaVuSans-Bold.ttf")
DAY_NAMES = {"monday": "Lunes", "tuesday": "Martes", "wednesday": "Miércoles", "thursday": "Jueves", "friday": "Viernes", "saturday": "Sábado", "sunday": "Domingo"}
COLORS = [(42, 103, 166), (40, 124, 120), (109, 74, 165), (166, 75, 29), (47, 122, 78)]


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def src(descriptor):
    return descriptor.get("src") if isinstance(descriptor, dict) else None


def save(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=90, method=6)


def vertical_card(title: str, subtitle: str, output: Path, accent=(42, 103, 166)):
    image = Image.new("RGB", (1080, 2160), "#f4f5f8")
    draw = ImageDraw.Draw(image)
    draw.text((72, 72), "Schedule Viewer", font=font(30, True), fill="#173f68")
    draw.text((72, 165), title, font=font(72, True), fill="#1c1c1e")
    draw.text((72, 255), subtitle, font=font(27), fill="#6e6e73")
    y = 390
    labels = ["Prioridad", "Actividad", "Revisión", "Tiempo personal"]
    for index, label in enumerate(labels):
        height = 245 if index != 1 else 330
        draw.rounded_rectangle((72, y, 1008, y + height), radius=32, fill="white", outline="#dedee4", width=2)
        color = COLORS[index % len(COLORS)] if index else accent
        draw.rounded_rectangle((96, y + 28, 112, y + height - 28), radius=8, fill=color)
        draw.text((145, y + 52), label, font=font(36, True), fill=color)
        draw.text((145, y + 112), "Contenido ficticio para la demostración pública", font=font(22), fill="#6e6e73")
        y += height + 28
    save(image, output)


def horizontal_card(title: str, subtitle: str, output: Path, accent=(42, 103, 166)):
    image = Image.new("RGB", (1600, 1000), "#f4f5f8")
    draw = ImageDraw.Draw(image)
    draw.text((64, 50), "Schedule Viewer", font=font(28, True), fill="#173f68")
    draw.text((64, 112), title, font=font(54, True), fill="#1c1c1e")
    draw.text((64, 180), subtitle, font=font(24), fill="#6e6e73")
    columns = ["Plan", "Crear", "Revisar", "Compartir"]
    for index, label in enumerate(columns):
        x1 = 64 + index * 375
        x2 = x1 + 345
        draw.rounded_rectangle((x1, 245, x2, 920), radius=28, fill="white", outline="#dedee4", width=2)
        color = COLORS[index % len(COLORS)] if index else accent
        draw.text(((x1 + x2) / 2, 300), label, font=font(32, True), fill=color, anchor="mm")
        for row in range(3):
            top = 365 + row * 165
            draw.rounded_rectangle((x1 + 24, top, x2 - 24, top + 128), radius=20, fill=tuple(min(255, channel + 185) for channel in color), outline=color, width=2)
    save(image, output)


def inactive_card(horizontal: bool, output: Path):
    size = (1600, 1000) if horizontal else (1080, 2160)
    image = Image.new("RGB", size, "#f2f1f6")
    draw = ImageDraw.Draw(image)
    title_size = 82 if horizontal else 64
    draw.rounded_rectangle((size[0] * .12, size[1] * .24, size[0] * .88, size[1] * .76), radius=42, fill="white", outline="#dedee4", width=2)
    draw.text((size[0] / 2, size[1] * .45), "Sin actividad", font=font(title_size, True), fill="#1c1c1e", anchor="mm")
    draw.text((size[0] / 2, size[1] * .56), "La imagen puede personalizarse en Ajustes", font=font(24), fill="#6e6e73", anchor="mm")
    save(image, output)


def render_all(config_path: Path, out_root: Path):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    written = set()
    for period_index, period in enumerate(config["periods"]):
        vertical = period["images"]["active"]["vertical"]
        for day, descriptor in vertical.get("days", {}).items():
            path = src(descriptor)
            if path and path not in written:
                vertical_card(DAY_NAMES.get(day, day.title()), period["name"], out_root / path, COLORS[period_index % len(COLORS)])
                written.add(path)
        default_path = src(vertical["default"])
        if default_path and default_path not in written:
            vertical_card("Vista vertical", period["name"], out_root / default_path, COLORS[period_index % len(COLORS)])
            written.add(default_path)
        horizontal_path = src(period["images"]["active"]["horizontal"])
        if horizontal_path and horizontal_path not in written:
            horizontal_card(period["name"], "Imagen apaisada fija del periodo", out_root / horizontal_path, COLORS[period_index % len(COLORS)])
            written.add(horizontal_path)
        for orientation in ("vertical", "horizontal"):
            path = src(period["images"]["inactive"][orientation])
            if path and path not in written:
                inactive_card(orientation == "horizontal", out_root / path)
                written.add(path)


if __name__ == "__main__":
    render_all(ROOT / "dist" / "config" / "schedule.json", ROOT / "dist")
