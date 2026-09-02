#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from urllib.parse import urlparse

from config_v3 import compile_yaml, dump_compiled_json
from render_assets import render_all

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CONFIG = ROOT / "config" / "schedule.yaml"


def iter_image_sources(node):
    if isinstance(node, list):
        for item in node:
            yield from iter_image_sources(item)
        return
    if not isinstance(node, dict):
        return
    if node.get("type") == "image" and isinstance(node.get("src"), str):
        yield node["src"]
    for value in node.values():
        yield from iter_image_sources(value)


def is_local_path(src: str) -> bool:
    parsed = urlparse(src)
    return not parsed.scheme and not src.startswith("//")


def verify_assets(config: dict, out: Path) -> None:
    expected = set(iter_image_sources(config))
    expected.update(config.get("states", {}).values())
    for year in config.get("academicYears", []):
        for term in year.get("terms", []):
            expected.add(term["assets"]["week"])
            expected.update(term["assets"]["days"].values())

    missing = sorted(
        src for src in expected
        if isinstance(src, str)
        and is_local_path(src)
        and not (out / src).is_file()
    )
    if missing:
        joined = "\n".join(f"  - {path}" for path in missing)
        raise SystemExit(f"Build abortado: faltan assets locales referenciados:\n{joined}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist")
    args = parser.parse_args()
    out = (ROOT / args.out).resolve()

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    config = compile_yaml(SOURCE_CONFIG)

    for filename in (
        "index.html",
        "styles.css",
        "app.js",
        "schedule-core.js",
        "date-core.js",
        "range-core.js",
        "view-core.js",
        "calendar-core.js",
        "content-core.js",
        "content-renderer.js",
        "service-worker.js",
    ):
        shutil.copy2(ROOT / filename, out / filename)

    (out / "config").mkdir()
    compiled_path = out / "config" / "schedule.json"
    dump_compiled_json(config, compiled_path)
    (out / ".nojekyll").write_text("", encoding="utf-8")

    source_assets = ROOT / "assets"
    if source_assets.exists():
        shutil.copytree(source_assets, out / "assets", dirs_exist_ok=True)

    render_all(compiled_path, out)
    verify_assets(config, out)
    print(f"Build v3 generado en {out}")


if __name__ == "__main__":
    main()
