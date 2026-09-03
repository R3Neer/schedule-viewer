#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
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
    expected.update(path for path in config.get("states", {}).values() if isinstance(path, str) and path)
    for year in config.get("academicYears", []):
        for term in year.get("terms", []):
            week = term.get("assets", {}).get("week")
            if week:
                expected.add(week)
            expected.update(path for path in term.get("assets", {}).get("days", {}).values() if path)

    missing = sorted(
        src for src in expected
        if isinstance(src, str)
        and is_local_path(src)
        and not (out / src).is_file()
    )
    if missing:
        joined = "\n".join(f"  - {path}" for path in missing)
        raise SystemExit(f"Build abortado: faltan assets locales referenciados:\n{joined}")


def build_lazy_bundles(out: Path) -> None:
    lazy_out = out / "lazy"
    lazy_out.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise SystemExit("Build abortado: npm/npx no está disponible para empaquetar los módulos opcionales.")

    entries = {
        ROOT / "lazy-src" / "config-io.entry.js": lazy_out / "config-io.js",
        ROOT / "lazy-src" / "yaml-editor.entry.js": lazy_out / "yaml-editor.js",
    }
    for entry, output in entries.items():
        subprocess.run([
            npx,
            "--no-install",
            "esbuild",
            str(entry),
            "--bundle",
            "--format=esm",
            "--platform=browser",
            "--target=es2022",
            "--minify",
            f"--outfile={output}",
        ], cwd=ROOT, check=True)


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
        "runtime-renderer.js",
        "local-store.js",
        "asset-resolver.js",
        "device-ui.js",
        "config-schema.js",
        "settings-ui.js",
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
    build_lazy_bundles(out)
    print(f"Build v4 generado en {out}")


if __name__ == "__main__":
    main()
