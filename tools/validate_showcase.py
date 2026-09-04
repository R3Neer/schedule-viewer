#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_HASHES = {
    "botanical-print.jpg": "4eeb321088cd280d3cff7b9fd716d1f577d3fad47d275cba5d5b9a6970419643",
    "mountain-landscape.jpg": "ae944d90ec8d8c5ab23999b0a70536d9f5913628c3347fd942b59cf4ee2f4ba0",
}
EXPECTED_MEDIA = {
    "hero.png": (1600, 900),
    "desktop-week-light.png": (1440, 900),
    "iphone-day-art.png": (402, 874),
    "iphone-images-light.png": (402, 874),
    "iphone-week-landscape.png": (874, 402),
    "desktop-yaml-dark.png": (1440, 900),
}


def main() -> None:
    for filename, expected in EXPECTED_HASHES.items():
        payload = (ROOT / "showcase" / "sources" / filename).read_bytes()
        actual = hashlib.sha256(payload).hexdigest()
        if actual != expected:
            raise SystemExit(f"Hash inesperado para {filename}: {actual}")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for filename, expected_size in EXPECTED_MEDIA.items():
        path = ROOT / "docs" / "media" / filename
        with Image.open(path) as image:
            if image.size != expected_size:
                raise SystemExit(f"Dimensiones inesperadas para {filename}: {image.size}")
        if filename in ("hero.png", "iphone-images-light.png", "iphone-week-landscape.png", "desktop-yaml-dark.png") and filename not in readme:
            raise SystemExit(f"README no enlaza {filename}")

    if (ROOT / "dist" / "showcase").exists():
        raise SystemExit("Los fixtures del showcase han entrado en dist")
    print("showcase: hashes, capturas, README y aislamiento del deploy OK")


if __name__ == "__main__":
    main()
