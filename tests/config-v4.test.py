#!/usr/bin/env python3
from __future__ import annotations

import copy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from config_v4 import ConfigError, compile_config_data, compile_yaml, load_yaml  # noqa: E402

source = load_yaml(ROOT / "config" / "schedule.yaml")
compiled = compile_yaml(ROOT / "config" / "schedule.yaml")
assert compiled["version"] == 4
assert compiled["periods"]
assert compiled["presentation"]["vertical"]["unit"] in {"day", "week", "month"}
assert "academicYears" not in compiled

def rejects(mutator, fragment: str) -> None:
    raw = copy.deepcopy(source)
    mutator(raw)
    try:
        compile_config_data(raw)
    except ConfigError as error:
        assert fragment in str(error), (fragment, error)
    else:
        raise AssertionError(f"Se esperaba error con {fragment!r}")

rejects(lambda raw: raw.update(version=3), "version")
rejects(lambda raw: raw["periods"][1].update(start=raw["periods"][0]["end"]), "solapan")
rejects(lambda raw: raw["periods"][0]["images"]["active"].update(horizontal={"src": "unsafe.svg"}), "SVG")
rejects(lambda raw: raw["calendar"].update(active_weekdays=[]), "al menos uno")
rejects(lambda raw: raw["presentation"]["vertical"].update(unit="year"), "day, week o month")
rejects(lambda raw: raw["calendar"]["exceptions"].append(copy.deepcopy(raw["calendar"]["exceptions"][0])), "duplicados")

print("config-v4: compilación y contratos negativos OK")

# The build compiler must agree with the browser on every image assignment.
fit_source = copy.deepcopy(source)
fit_source["defaults"]["image_fit"] = "cover"
def visit_images(value, callback):
    if isinstance(value, dict):
        if "src" in value or "asset" in value:
            callback(value)
        else:
            for child in value.values():
                visit_images(child, callback)
    elif isinstance(value, list):
        for child in value:
            visit_images(child, callback)
visit_images(fit_source, lambda image: image.pop("fit", None))
fit_source["periods"][0]["images"]["active"]["horizontal"] = {"src": "assets/override.webp", "fit": "contain"}
fit_compiled = compile_config_data(fit_source)
override = fit_compiled["periods"][0]["images"]["active"]["horizontal"]
def assert_fit(image):
    assert image["fit"] == ("contain" if image is override else "cover"), image
visit_images(fit_compiled, assert_fit)
