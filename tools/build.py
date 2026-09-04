#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from config_v4 import compile_yaml, dump_compiled_json
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
        ROOT / "lazy-src" / "apple-glass.entry.js": lazy_out / "apple-glass.js",
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


def isolate_release_code(out: Path) -> None:
    # Older installed workers ignore query strings when looking up cached JS.
    # Put the entire module graph (including lazy imports) on distinct paths.
    worker = (out / "service-worker.js").read_text(encoding="utf-8")
    release = re.search(r'const RELEASE_ID = "([\w-]+)";', worker).group(1)
    destination = out / "releases" / release
    destination.mkdir(parents=True)
    for source in out.iterdir():
        if source.suffix in (".js", ".css") and source.name != "service-worker.js":
            shutil.copy2(source, destination / source.name)
    shutil.copytree(out / "lazy", destination / "lazy")
    index = out / "index.html"
    html = index.read_text(encoding="utf-8")
    html = re.sub(r'\./([\w.-]+\.(?:js|css))\?v=' + re.escape(release),
                  rf'./releases/{release}/\1?v={release}', html)
    index.write_text(html, encoding="utf-8")
    # Keep root files for clients loaded before this release and diagnostics.


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
        "favicon.svg",
        "manifest.webmanifest",
        "styles.css",
        "settings-responsive.css",
        "apple-liquid-glass.css",
        "app.js",
        "app-updates.js",
        "apple-glass.js",
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
        "settings-motion.js",
        "settings-gestures.js",
        "service-worker.js",
    ):
        shutil.copy2(ROOT / filename, out / filename)

    shutil.copytree(ROOT / "icons", out / "icons")

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
    isolate_release_code(out)
    print(f"Build v4 generado en {out}")


if __name__ == "__main__":
    main()
