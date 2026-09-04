#!/usr/bin/env python3
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_MEDIA = {
    "hero.png": (1600, 900),
    "desktop-horizontal-light.png": (1440, 900),
    "iphone-vertical-light.png": (402, 874),
    "iphone-settings-light.png": (402, 874),
    "iphone-images-light.png": (402, 874),
    "iphone-horizontal-landscape.png": (874, 402),
    "desktop-yaml-dark.png": (1440, 900),
}
REVIEW_FILES = {
    *(f"apple-{scheme}-{panel}.png" for scheme in ("light", "dark") for panel in ("home", "periods", "calendar", "presentation", "images", "backup", "advanced")),
    "narrow-periods.png", "landscape-calendar.png", "desktop-settings.png", "reduced-motion-images.png",
}


def main() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for filename, expected_size in EXPECTED_MEDIA.items():
        path = ROOT / "docs" / "media" / filename
        with Image.open(path) as image:
            if image.size != expected_size:
                raise SystemExit(f"Dimensiones inesperadas para {filename}: {image.size}")
        if filename in {"hero.png", "iphone-vertical-light.png", "iphone-settings-light.png", "iphone-images-light.png", "iphone-horizontal-landscape.png", "desktop-yaml-dark.png"} and filename not in readme:
            raise SystemExit(f"README no enlaza {filename}")

    review_root = ROOT / "docs" / "visual-review-v4"
    missing = sorted(filename for filename in REVIEW_FILES if not (review_root / filename).is_file())
    if missing:
        raise SystemExit(f"Matriz visual incompleta: {', '.join(missing)}")
    if (ROOT / "dist" / "docs").exists() or (ROOT / "dist" / "showcase").exists():
        raise SystemExit("Los artefactos de documentación han entrado en dist")
    print("showcase v4: capturas públicas, matriz visual y aislamiento del deploy OK")


if __name__ == "__main__":
    main()
