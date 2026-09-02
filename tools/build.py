#!/usr/bin/env python3
from __future__ import annotations
import argparse
import shutil
from pathlib import Path
from render_assets import render_all

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist")
    args = parser.parse_args()
    out = (ROOT / args.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # Copy static runtime files.
    shutil.copy2(ROOT / "index.html", out / "index.html")
    shutil.copy2(ROOT / "styles.css", out / "styles.css")
    shutil.copy2(ROOT / "src" / "app.js", out / "app.js")
    shutil.copy2(ROOT / "src" / "schedule-core.js", out / "schedule-core.js")
    (out / "config").mkdir()
    shutil.copy2(ROOT / "config" / "schedules.json", out / "config" / "schedules.json")
    (out / ".nojekyll").write_text("", encoding="utf-8")

    # Assets are rendered from the same structured schedule data.
    render_all(ROOT / "config" / "schedules.json", out)
    print(f"Build generado en {out}")


if __name__ == "__main__":
    main()
