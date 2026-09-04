#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "dist"
config = json.loads((OUT / "config" / "schedule.json").read_text(encoding="utf-8"))

expected: list[tuple[str, tuple[int, int]]] = []
seen: set[str] = set()

def visit(value):
    if isinstance(value, dict):
        if value.get("type") == "image" and value.get("src"):
            relative = value["src"]
            if relative not in seen:
                seen.add(relative)
                orientation = "horizontal" if any(token in relative for token in ("horizontal", "week-")) else "vertical"
                expected.append((relative, (1600, 1000) if orientation == "horizontal" else (1080, 2160)))
        for item in value.values():
            visit(item)
    elif isinstance(value, list):
        for item in value:
            visit(item)

visit(config["periods"])
visit(config["calendar"])

for relative, size in expected:
    path = OUT / relative
    assert path.is_file(), f"Falta asset generado: {relative}"
    with Image.open(path) as image:
        assert image.size == size, (relative, image.size, size)
        assert image.format == "WEBP", (relative, image.format)
        sample = image.convert("RGB").resize((80, 80))
        colors = sample.getcolors(maxcolors=80 * 80)
        assert colors is not None and len(colors) >= 12, f"{relative}: imagen sospechosamente plana ({len(colors or [])} colores)"
        stat = ImageStat.Stat(sample)
        assert max(stat.stddev) >= 8.0, f"{relative}: contraste insuficiente {stat.stddev}"
        pixels = list(sample.getdata())
        non_white = sum(1 for r, g, b in pixels if min(r, g, b) < 235)
        assert non_white >= 50, f"{relative}: casi todo el asset es blanco ({non_white}/6400 píxeles no blancos)"

print(f"generated-assets: {len(expected)} WebP reales, dimensiones/variedad/contraste OK")
