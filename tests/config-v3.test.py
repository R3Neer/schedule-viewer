#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from config_v3 import ConfigError, compile_config_data, compile_yaml


def minimal():
    return {
        "version": 3,
        "app": {"title": "Test", "timezone": "Europe/Madrid"},
        "defaults": {"week_starts_on": "monday", "image_fit": "contain"},
        "runtime": {"allow_date_override": True},
        "visual": {},
        "states": {"inactive_default": "assets/states/inactive.webp", "vacations": "assets/states/vacations.webp"},
        "calendar": {
            "inactive": {"default_image": {"src": "assets/states/inactive.webp", "alt": "Inactivo"}},
            "inactive_weekdays": ["saturday", "sunday"],
            "active_dates": [], "inactive_dates": [],
        },
        "views": {
            "wide": {"when": {"min_width": 761}, "range": "week", "renderer": {"type": "timetable", "artwork": "asset"}},
            "day": {"manual_only": True, "range": "day", "renderer": "timetable"},
        },
        "desktop": {
            "when": {"min_width": 1000}, "primary_view": "wide", "secondary_view": "day", "default_view": "wide",
            "shortcuts": {"toggle_view": {"key": "Space"}},
        },
        "academic_years": [{
            "id": "2026-2027", "display_name": "Curso",
            "calendar": {"terms": [{"term_id": "q1", "start": "2026-09-01", "end": "2026-12-31"}], "holidays": [], "inactive_dates": [], "periods": []},
            "terms": [{
                "id": "q1", "display_name": "Q1", "subtitle": "",
                "assets": {"week": "assets/q1/week.webp", "days": {day: f"assets/q1/{day}.webp" for day in ["monday","tuesday","wednesday","thursday","friday"]}},
                "subjects": {"A": {"name": "A", "short": "A", "group": "G", "room": "R", "fill": "#fff", "accent": "#000"}},
                "sessions": [{"day": "monday", "start": "09:00", "end": "10:00", "subject": "A"}],
            }],
        }],
        "rules": [],
    }


def expect_error(mutator, fragment):
    raw = minimal(); mutator(raw)
    try:
        compile_config_data(raw)
    except ConfigError as error:
        assert fragment in str(error), (fragment, str(error))
    else:
        raise AssertionError(f"Se esperaba ConfigError con {fragment!r}")


compiled = compile_yaml(ROOT / "config" / "schedule.yaml")
assert compiled["version"] == 3
assert compiled["app"]["timezone"] == "Europe/Madrid"
assert compiled["calendar"]["inactive"]["defaultImage"]["src"].endswith("no-class-today-vertical.webp")
assert set(compiled["calendar"]["inactiveWeekdays"]) == {"saturday", "sunday"}
assert compiled["desktop"]["defaultView"] == "wide_default"
assert compiled["views"]["phone_portrait"]["range"] == {"type": "day"}
assert compiled["views"]["wide_default"]["range"]["type"] == "week"
assert compiled["rules"][0]["priority"] > compiled["rules"][-1]["priority"]
assert len(compiled["academicYears"][0]["terms"][0]["sessions"]) == 11
assert len(compiled["academicYears"][0]["terms"][1]["sessions"]) == 14

mapped = minimal()
mapped["calendar"]["inactive_weekdays"] = {"sunday": {"image": {"src": "assets/sunday.gif", "fit": "cover"}}}
mapped_compiled = compile_config_data(mapped)
assert list(mapped_compiled["calendar"]["inactiveWeekdays"]) == ["sunday"]
assert mapped_compiled["calendar"]["inactiveWeekdays"]["sunday"]["image"]["fit"] == "cover"

ranges = minimal()
for definition in [
    {"type": "month"}, {"type": "year"}, {"type": "relative", "before": 2, "after": 4},
    {"type": "rolling", "days": 14, "anchor_position": "center"},
    {"type": "interval", "start": "2026-09-01", "end": "2026-09-30"},
]:
    ranges["views"]["wide"]["range"] = definition
    assert compile_config_data(ranges)["views"]["wide"]["range"]["type"] == definition["type"]

expect_error(lambda raw: raw["calendar"]["inactive"].pop("default_image"), "calendar.inactive.default_image")
expect_error(lambda raw: raw["calendar"].update(inactive_weekdays=["funday"]), "weekday desconocido")
expect_error(lambda raw: raw["defaults"].update(week_starts_on="funday"), "defaults.week_starts_on")
expect_error(lambda raw: raw["views"]["wide"].update(range={"type": "fortnightish"}), "views.wide.range.type")
expect_error(lambda raw: raw["views"]["wide"].update(range={"type": "relative", "before": -1, "after": 2}), "views.wide.range.before")
expect_error(lambda raw: raw["views"]["wide"].update(range={"type": "interval", "start": "2026-09-02", "end": "2026-09-01"}), "views.wide.range")
expect_error(lambda raw: raw["views"]["wide"].update(renderer={"type": "telepathy"}), "views.wide.renderer.type")
expect_error(lambda raw: raw["desktop"].update(primary_view="missing"), "desktop.primary_view")
expect_error(lambda raw: raw["academic_years"][0]["calendar"]["terms"][0].update(start="2026-02-30"), "fecha inválida")
expect_error(lambda raw: raw["academic_years"][0]["terms"][0]["sessions"].append({"day": "monday", "start": "09:30", "end": "10:30", "subject": "A"}), "se solapa")
expect_error(lambda raw: raw["academic_years"][0]["terms"][0]["sessions"][0].update(subject="NOPE"), "asignatura desconocida")
expect_error(lambda raw: raw["rules"].append({"when": {"view": "missing"}, "content": {"type": "inactive-image"}}), "vista inexistente")
expect_error(lambda raw: raw["rules"].append({"when": {"view": "wide"}, "content": {"type": "image", "src": ""}}), "content.src")


def ambiguous_periods(raw):
    raw["academic_years"][0]["calendar"]["periods"] = [
        {"id": "a", "type": "vacation", "start": "2026-10-01", "end": "2026-10-10", "image": {"src": "assets/a.webp"}},
        {"id": "b", "type": "vacation", "start": "2026-10-05", "end": "2026-10-15", "image": {"src": "assets/b.webp"}},
    ]
expect_error(ambiguous_periods, "se solapan")

priority_periods = minimal()
priority_periods["academic_years"][0]["calendar"]["periods"] = [
    {"id": "a", "type": "vacation", "start": "2026-10-01", "end": "2026-10-10", "priority": 1, "image": {"src": "assets/a.webp"}},
    {"id": "b", "type": "vacation", "start": "2026-10-05", "end": "2026-10-15", "priority": 2, "image": {"src": "assets/b.webp"}},
]
assert len(compile_config_data(priority_periods)["academicYears"][0]["calendar"]["periods"]) == 2

print("config-v3: YAML real + 20 contratos positivos/negativos de compilación y validación OK")
