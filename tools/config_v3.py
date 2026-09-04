#!/usr/bin/env python3
from __future__ import annotations

import copy
import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

import yaml

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
IMAGE_FITS = {"contain", "cover", "fill", "none", "scale-down"}
RANGE_TYPES = {"day", "week", "month", "year", "rolling", "relative", "interval"}
RENDERER_TYPES = {"timetable", "image"}
RULE_CONTENT_TYPES = {"image", "inactive-image", "current-term-schedule", "next-term-schedule", "term-schedule"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME = re.compile(r"^\d{2}:\d{2}$")


class ConfigError(ValueError):
    pass


def fail(path: str, message: str) -> None:
    raise ConfigError(f"{path}: {message}")


def _plain(value: Any) -> Any:
    if isinstance(value, (dt.date, dt.datetime)):
        return value.date().isoformat() if isinstance(value, dt.datetime) else value.isoformat()
    if isinstance(value, list):
        return [_plain(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    return value


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        fail(str(path), f"YAML inválido: {error}")
    if not isinstance(raw, dict):
        fail(str(path), "la raíz YAML debe ser un mapping")
    return _plain(raw)


def _date(value: Any, path: str) -> str:
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        fail(path, "debe ser una fecha ISO YYYY-MM-DD")
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        fail(path, f"fecha inválida {value!r}")
    return value


def _time(value: Any, path: str) -> str:
    if not isinstance(value, str) or not TIME.fullmatch(value):
        fail(path, "debe tener formato HH:MM")
    try:
        hour, minute = map(int, value.split(":"))
        if hour > 23 or minute > 59:
            raise ValueError
    except ValueError:
        fail(path, f"hora inválida {value!r}")
    return value


def _listish(value: Any, path: str) -> list[Any]:
    if value is None:
        return []
    if not isinstance(value, list):
        fail(path, "debe ser una lista")
    return value


def normalize_image(value: Any, path: str, *, default_alt: str | None = None, default_fit: str = "contain") -> dict[str, Any]:
    if isinstance(value, str):
        value = {"src": value}
    if not isinstance(value, dict):
        fail(path, "debe ser una ruta o un descriptor de imagen")
    kind = value.get("type", "image")
    if kind != "image":
        fail(f"{path}.type", "debe ser 'image'")
    src = value.get("src")
    if not isinstance(src, str) or not src.strip():
        fail(f"{path}.src", "es obligatorio y no puede estar vacío")
    fit = value.get("fit", default_fit)
    if fit not in IMAGE_FITS:
        fail(f"{path}.fit", f"valor desconocido {fit!r}")
    alt = value.get("alt", default_alt)
    if alt is not None and not isinstance(alt, str):
        fail(f"{path}.alt", "debe ser texto")
    return {"type": "image", "src": src, "fit": fit, "alt": alt}


def normalize_range(value: Any, path: str, defaults: dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, str):
        value = {"type": value}
    if not isinstance(value, dict):
        fail(path, "debe ser un nombre de rango o un mapping")
    kind = value.get("type")
    if kind not in RANGE_TYPES:
        fail(f"{path}.type", f"valor desconocido {kind!r}")
    result: dict[str, Any] = {"type": kind}

    if kind == "week":
        starts_on = value.get("starts_on", defaults.get("week_starts_on", "monday"))
        if starts_on not in WEEKDAYS:
            fail(f"{path}.starts_on", f"weekday desconocido {starts_on!r}")
        result["startsOn"] = starts_on
    elif kind in {"relative", "rolling"}:
        if "before" in value or "after" in value:
            before = value.get("before", 0)
            after = value.get("after", 0)
            if not isinstance(before, int) or before < 0:
                fail(f"{path}.before", "debe ser un entero >= 0")
            if not isinstance(after, int) or after < 0:
                fail(f"{path}.after", "debe ser un entero >= 0")
            result.update(before=before, after=after)
        else:
            days = value.get("days")
            if not isinstance(days, int) or days < 1:
                fail(f"{path}.days", "debe ser un entero >= 1")
            anchor_position = value.get("anchor_position", "start")
            if anchor_position not in {"start", "center", "end"}:
                fail(f"{path}.anchor_position", "debe ser start, center o end")
            result.update(days=days, anchorPosition=anchor_position)
    elif kind == "interval":
        start = _date(value.get("start"), f"{path}.start")
        end = _date(value.get("end"), f"{path}.end")
        if start > end:
            fail(path, "start no puede ser posterior a end")
        result.update(start=start, end=end)

    return result


def _normalize_when(value: Any, path: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    result: dict[str, Any] = {}
    orientation = value.get("orientation")
    if orientation is not None:
        if orientation not in {"portrait", "landscape", "any"}:
            fail(f"{path}.orientation", "debe ser portrait, landscape o any")
        result["orientation"] = orientation
    pointer = value.get("pointer")
    if pointer is not None:
        if pointer not in {"coarse", "fine", "any"}:
            fail(f"{path}.pointer", "debe ser coarse, fine o any")
        result["pointer"] = pointer
    for source, target in (
        ("min_width", "minWidth"),
        ("max_width", "maxWidth"),
        ("min_height", "minHeight"),
        ("max_height", "maxHeight"),
    ):
        if source in value:
            number = value[source]
            if not isinstance(number, int) or number < 0:
                fail(f"{path}.{source}", "debe ser un entero >= 0")
            result[target] = number
    return result


def _normalize_date_entry(value: Any, path: str, *, kind: str | None = None) -> dict[str, Any]:
    if isinstance(value, str):
        value = {"date": value}
    if not isinstance(value, dict):
        fail(path, "debe ser una fecha o un mapping")
    result: dict[str, Any] = {"date": _date(value.get("date"), f"{path}.date")}
    if "label" in value:
        if not isinstance(value["label"], str):
            fail(f"{path}.label", "debe ser texto")
        result["label"] = value["label"]
    if kind:
        result["type"] = kind
    if "image" in value:
        result["image"] = normalize_image(value["image"], f"{path}.image", default_alt=result.get("label"))
    return result


def _normalize_inactive_weekdays(value: Any, path: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if isinstance(value, list):
        for index, weekday in enumerate(value):
            if weekday not in WEEKDAYS:
                fail(f"{path}[{index}]", f"weekday desconocido {weekday!r}")
            if weekday in result:
                fail(path, f"weekday duplicado {weekday!r}")
            result[weekday] = {}
        return result
    if not isinstance(value, dict):
        fail(path, "debe ser una lista o un mapping")
    for weekday, options in value.items():
        if weekday not in WEEKDAYS:
            fail(f"{path}.{weekday}", f"weekday desconocido {weekday!r}")
        if options is None:
            options = {}
        if not isinstance(options, dict):
            fail(f"{path}.{weekday}", "debe ser un mapping")
        normalized: dict[str, Any] = {}
        if "image" in options:
            normalized["image"] = normalize_image(options["image"], f"{path}.{weekday}.image", default_alt=weekday.capitalize())
        result[weekday] = normalized
    return result


def _normalize_period(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    period_id = value.get("id")
    if not isinstance(period_id, str) or not period_id:
        fail(f"{path}.id", "es obligatorio")
    kind = value.get("type", "custom")
    if kind not in {"vacation", "non-teaching", "custom"}:
        fail(f"{path}.type", f"tipo desconocido {kind!r}")
    start = _date(value.get("start"), f"{path}.start")
    end = _date(value.get("end"), f"{path}.end")
    if start > end:
        fail(path, "start no puede ser posterior a end")
    priority = value.get("priority", 0)
    if not isinstance(priority, int):
        fail(f"{path}.priority", "debe ser un entero")
    result = {
        "id": period_id,
        "type": kind,
        "start": start,
        "end": end,
        "priority": priority,
    }
    if "label" in value:
        if not isinstance(value["label"], str):
            fail(f"{path}.label", "debe ser texto")
        result["label"] = value["label"]
    if "image" in value:
        result["image"] = normalize_image(value["image"], f"{path}.image", default_alt=result.get("label"))
    return result


def _check_period_ambiguity(periods: list[dict[str, Any]], path: str) -> None:
    for i, left in enumerate(periods):
        for right in periods[i + 1:]:
            overlaps = left["start"] <= right["end"] and right["start"] <= left["end"]
            if not overlaps or left["priority"] != right["priority"]:
                continue
            left_image = left.get("image")
            right_image = right.get("image")
            if left_image and right_image and left_image.get("src") != right_image.get("src"):
                fail(path, f"periodos {left['id']!r} y {right['id']!r} se solapan con igual prioridad e imágenes distintas")


def _normalize_subjects(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not value:
        fail(path, "debe contener asignaturas")
    result = {}
    for key, subject in value.items():
        if not isinstance(subject, dict):
            fail(f"{path}.{key}", "debe ser un mapping")
        for required in ("name", "short", "group", "room", "fill", "accent"):
            if not isinstance(subject.get(required), str) or not subject.get(required):
                fail(f"{path}.{key}.{required}", "es obligatorio")
        result[key] = copy.deepcopy(subject)
    return result


def _normalize_sessions(value: Any, path: str, subjects: dict[str, Any]) -> list[dict[str, Any]]:
    sessions = _listish(value, path)
    result = []
    by_day: dict[str, list[tuple[int, int, str]]] = {}
    for index, session in enumerate(sessions):
        item_path = f"{path}[{index}]"
        if not isinstance(session, dict):
            fail(item_path, "debe ser un mapping")
        day = session.get("day")
        if day not in WEEKDAYS:
            fail(f"{item_path}.day", f"weekday desconocido {day!r}")
        start = _time(session.get("start"), f"{item_path}.start")
        end = _time(session.get("end"), f"{item_path}.end")
        if start >= end:
            fail(item_path, "start debe ser anterior a end")
        subject = session.get("subject")
        if subject not in subjects:
            fail(f"{item_path}.subject", f"asignatura desconocida {subject!r}")
        result.append({"day": day, "start": start, "end": end, "subject": subject})
        start_minutes = int(start[:2]) * 60 + int(start[3:])
        end_minutes = int(end[:2]) * 60 + int(end[3:])
        for other_start, other_end, other_subject in by_day.setdefault(day, []):
            if start_minutes < other_end and other_start < end_minutes:
                fail(item_path, f"se solapa con {other_subject} el {day}")
        by_day[day].append((start_minutes, end_minutes, subject))
    if not result:
        fail(path, "debe contener al menos una sesión")
    return result


def _normalize_term_content(value: Any, path: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    result: dict[str, Any] = {}
    if "week" in value:
        result["week"] = normalize_image(value["week"], f"{path}.week")
    if "days" in value:
        days = value["days"]
        if not isinstance(days, dict):
            fail(f"{path}.days", "debe ser un mapping")
        result["days"] = {}
        for weekday, descriptor in days.items():
            if weekday not in WEEKDAYS:
                fail(f"{path}.days.{weekday}", "weekday desconocido")
            result["days"][weekday] = normalize_image(descriptor, f"{path}.days.{weekday}")
    if "views" in value:
        views = value["views"]
        if not isinstance(views, dict):
            fail(f"{path}.views", "debe ser un mapping")
        result["views"] = {key: normalize_image(descriptor, f"{path}.views.{key}") for key, descriptor in views.items()}
    return result


def _normalize_rule_content(value: Any, path: str, defaults: dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, str):
        value = {"type": value}
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    kind = value.get("type")
    if kind not in RULE_CONTENT_TYPES:
        fail(f"{path}.type", f"tipo desconocido {kind!r}")
    if kind == "image":
        return normalize_image(value, path)
    result: dict[str, Any] = {"type": kind}
    if kind == "term-schedule":
        academic_year = value.get("academic_year")
        term = value.get("term")
        if not isinstance(academic_year, str) or not academic_year:
            fail(f"{path}.academic_year", "es obligatorio")
        if not isinstance(term, str) or not term:
            fail(f"{path}.term", "es obligatorio")
        result.update(academicYear=academic_year, term=term)
    if "range" in value:
        result["range"] = normalize_range(value["range"], f"{path}.range", defaults)
    return result


def _normalize_rule_when(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    result: dict[str, Any] = {}
    for source, target in (
        ("view", "view"),
        ("calendar_status", "calendarStatus"),
        ("weekday", "weekday"),
        ("term", "term"),
    ):
        if source in value:
            raw = value[source]
            if isinstance(raw, str):
                raw = [raw]
            if not isinstance(raw, list) or not raw or not all(isinstance(item, str) for item in raw):
                fail(f"{path}.{source}", "debe ser texto o una lista no vacía")
            if source == "weekday":
                unknown = [item for item in raw if item not in WEEKDAYS]
                if unknown:
                    fail(f"{path}.{source}", f"weekday desconocido {unknown[0]!r}")
            result[target] = raw
    if "date" in value:
        result["date"] = _date(value["date"], f"{path}.date")
    if "date_range" in value:
        date_range = value["date_range"]
        if not isinstance(date_range, dict):
            fail(f"{path}.date_range", "debe ser un mapping")
        start = _date(date_range.get("start"), f"{path}.date_range.start")
        end = _date(date_range.get("end"), f"{path}.date_range.end")
        if start > end:
            fail(f"{path}.date_range", "start no puede ser posterior a end")
        result["dateRange"] = {"start": start, "end": end}
    return result


def compile_config_data(raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("version") != 3:
        fail("version", "Schedule Viewer v3 requiere version: 3")

    app = raw.get("app")
    if not isinstance(app, dict):
        fail("app", "es obligatorio")
    title = app.get("title", "Schedule Viewer")
    timezone = app.get("timezone")
    if not isinstance(title, str) or not title:
        fail("app.title", "es obligatorio")
    if not isinstance(timezone, str) or not timezone:
        fail("app.timezone", "es obligatorio")

    defaults_raw = raw.get("defaults") or {}
    if not isinstance(defaults_raw, dict):
        fail("defaults", "debe ser un mapping")
    week_starts_on = defaults_raw.get("week_starts_on", "monday")
    if week_starts_on not in WEEKDAYS:
        fail("defaults.week_starts_on", f"weekday desconocido {week_starts_on!r}")
    image_fit = defaults_raw.get("image_fit", "contain")
    if image_fit not in IMAGE_FITS:
        fail("defaults.image_fit", f"valor desconocido {image_fit!r}")
    defaults = {"week_starts_on": week_starts_on, "image_fit": image_fit}

    runtime_raw = raw.get("runtime") or {}
    if not isinstance(runtime_raw, dict):
        fail("runtime", "debe ser un mapping")
    runtime = {"allowDateOverride": bool(runtime_raw.get("allow_date_override", True))}

    visual = copy.deepcopy(raw.get("visual") or {})
    if not isinstance(visual, dict):
        fail("visual", "debe ser un mapping")

    states_raw = raw.get("states") or {}
    if not isinstance(states_raw, dict):
        fail("states", "debe ser un mapping")
    inactive_state = states_raw.get("inactive_default")
    vacations_state = states_raw.get("vacations")
    if not isinstance(inactive_state, str) or not inactive_state:
        fail("states.inactive_default", "es obligatorio")
    if not isinstance(vacations_state, str) or not vacations_state:
        fail("states.vacations", "es obligatorio")
    states = {
        "noClassTodayVertical": inactive_state,
        "vacationsHorizontal": vacations_state,
    }

    calendar_raw = raw.get("calendar")
    if not isinstance(calendar_raw, dict):
        fail("calendar", "es obligatorio")
    inactive_raw = calendar_raw.get("inactive")
    if not isinstance(inactive_raw, dict) or "default_image" not in inactive_raw:
        fail("calendar.inactive.default_image", "es obligatorio")
    default_image = normalize_image(
        inactive_raw["default_image"],
        "calendar.inactive.default_image",
        default_alt="Día inactivo",
        default_fit=image_fit,
    )
    calendar = {
        "inactive": {"defaultImage": default_image},
        "inactiveWeekdays": _normalize_inactive_weekdays(
            calendar_raw.get("inactive_weekdays", []),
            "calendar.inactive_weekdays",
        ),
        "activeDates": [
            _normalize_date_entry(item, f"calendar.active_dates[{index}]")
            for index, item in enumerate(_listish(calendar_raw.get("active_dates", []), "calendar.active_dates"))
        ],
        "inactiveDates": [
            _normalize_date_entry(item, f"calendar.inactive_dates[{index}]")
            for index, item in enumerate(_listish(calendar_raw.get("inactive_dates", []), "calendar.inactive_dates"))
        ],
    }

    views_raw = raw.get("views")
    if not isinstance(views_raw, dict) or not views_raw:
        fail("views", "debe contener al menos una vista")
    views: dict[str, Any] = {}
    for index, (view_id, view) in enumerate(views_raw.items()):
        path = f"views.{view_id}"
        if not isinstance(view, dict):
            fail(path, "debe ser un mapping")
        priority = view.get("priority", 0)
        if not isinstance(priority, int):
            fail(f"{path}.priority", "debe ser un entero")
        manual_only = bool(view.get("manual_only", False))
        if "range" not in view:
            fail(f"{path}.range", "es obligatorio")
        renderer_raw = view.get("renderer")
        if isinstance(renderer_raw, str):
            renderer_raw = {"type": renderer_raw}
        if not isinstance(renderer_raw, dict):
            fail(f"{path}.renderer", "es obligatorio")
        renderer_type = renderer_raw.get("type")
        if renderer_type not in RENDERER_TYPES:
            fail(f"{path}.renderer.type", f"renderer desconocido {renderer_type!r}")
        artwork = renderer_raw.get("artwork", "asset")
        if artwork not in {"phone", "asset", "auto"}:
            fail(f"{path}.renderer.artwork", "debe ser phone, asset o auto")
        views[view_id] = {
            "id": view_id,
            "priority": priority,
            "order": index,
            "manualOnly": manual_only,
            "when": _normalize_when(view.get("when"), f"{path}.when"),
            "range": normalize_range(view["range"], f"{path}.range", defaults),
            "renderer": {"type": renderer_type, "artwork": artwork},
        }

    desktop_raw = raw.get("desktop") or {}
    if not isinstance(desktop_raw, dict):
        fail("desktop", "debe ser un mapping")
    primary = desktop_raw.get("primary_view")
    secondary = desktop_raw.get("secondary_view")
    default_view = desktop_raw.get("default_view", primary)
    for key, value in (("primary_view", primary), ("secondary_view", secondary), ("default_view", default_view)):
        if value not in views:
            fail(f"desktop.{key}", f"vista inexistente {value!r}")
    shortcuts_raw = desktop_raw.get("shortcuts") or {}
    if not isinstance(shortcuts_raw, dict):
        fail("desktop.shortcuts", "debe ser un mapping")
    toggle = shortcuts_raw.get("toggle_view") or {"key": "Space"}
    if not isinstance(toggle, dict) or not isinstance(toggle.get("key"), str) or not toggle["key"]:
        fail("desktop.shortcuts.toggle_view.key", "es obligatorio")
    desktop = {
        "when": _normalize_when(desktop_raw.get("when"), "desktop.when"),
        "primaryView": primary,
        "secondaryView": secondary,
        "defaultView": default_view,
        "shortcuts": {"toggleView": {"key": toggle["key"]}},
    }

    academic_years_raw = raw.get("academic_years")
    if not isinstance(academic_years_raw, list) or not academic_years_raw:
        fail("academic_years", "debe contener al menos un curso")
    academic_years: list[dict[str, Any]] = []
    seen_years: set[str] = set()
    for year_index, year in enumerate(academic_years_raw):
        path = f"academic_years[{year_index}]"
        if not isinstance(year, dict):
            fail(path, "debe ser un mapping")
        year_id = year.get("id")
        if not isinstance(year_id, str) or not year_id:
            fail(f"{path}.id", "es obligatorio")
        if year_id in seen_years:
            fail(f"{path}.id", f"id duplicado {year_id!r}")
        seen_years.add(year_id)
        display_name = year.get("display_name", year_id)
        if not isinstance(display_name, str):
            fail(f"{path}.display_name", "debe ser texto")
        cal_raw = year.get("calendar") or {}
        if not isinstance(cal_raw, dict):
            fail(f"{path}.calendar", "debe ser un mapping")
        term_ranges_raw = _listish(cal_raw.get("terms"), f"{path}.calendar.terms")
        term_ranges = []
        for index, item in enumerate(term_ranges_raw):
            item_path = f"{path}.calendar.terms[{index}]"
            if not isinstance(item, dict):
                fail(item_path, "debe ser un mapping")
            term_id = item.get("term_id")
            if not isinstance(term_id, str) or not term_id:
                fail(f"{item_path}.term_id", "es obligatorio")
            start = _date(item.get("start"), f"{item_path}.start")
            end = _date(item.get("end"), f"{item_path}.end")
            if start > end:
                fail(item_path, "start no puede ser posterior a end")
            term_ranges.append({"termId": term_id, "start": start, "end": end})

        holidays = [
            _normalize_date_entry(item, f"{path}.calendar.holidays[{index}]", kind="holiday")
            for index, item in enumerate(_listish(cal_raw.get("holidays", []), f"{path}.calendar.holidays"))
        ]
        inactive_dates = [
            _normalize_date_entry(item, f"{path}.calendar.inactive_dates[{index}]", kind="non-teaching")
            for index, item in enumerate(_listish(cal_raw.get("inactive_dates", []), f"{path}.calendar.inactive_dates"))
        ]
        periods = [
            _normalize_period(item, f"{path}.calendar.periods[{index}]")
            for index, item in enumerate(_listish(cal_raw.get("periods", []), f"{path}.calendar.periods"))
        ]
        _check_period_ambiguity(periods, f"{path}.calendar.periods")

        terms_raw = year.get("terms")
        if not isinstance(terms_raw, list) or not terms_raw:
            fail(f"{path}.terms", "debe contener horarios")
        terms = []
        seen_terms = set()
        for term_index, term in enumerate(terms_raw):
            term_path = f"{path}.terms[{term_index}]"
            if not isinstance(term, dict):
                fail(term_path, "debe ser un mapping")
            term_id = term.get("id")
            if not isinstance(term_id, str) or not term_id:
                fail(f"{term_path}.id", "es obligatorio")
            if term_id in seen_terms:
                fail(f"{term_path}.id", f"id duplicado {term_id!r}")
            seen_terms.add(term_id)
            assets = term.get("assets")
            if not isinstance(assets, dict):
                fail(f"{term_path}.assets", "es obligatorio")
            week = assets.get("week")
            days = assets.get("days")
            if not isinstance(week, str) or not week:
                fail(f"{term_path}.assets.week", "es obligatorio")
            if not isinstance(days, dict):
                fail(f"{term_path}.assets.days", "debe ser un mapping")
            for weekday in ("monday", "tuesday", "wednesday", "thursday", "friday"):
                if not isinstance(days.get(weekday), str) or not days.get(weekday):
                    fail(f"{term_path}.assets.days.{weekday}", "es obligatorio")
            subjects = _normalize_subjects(term.get("subjects"), f"{term_path}.subjects")
            sessions = _normalize_sessions(term.get("sessions"), f"{term_path}.sessions", subjects)
            terms.append({
                "id": term_id,
                "displayName": term.get("display_name", term_id),
                "subtitle": term.get("subtitle", ""),
                "assets": {"week": week, "days": copy.deepcopy(days)},
                "content": _normalize_term_content(term.get("content"), f"{term_path}.content"),
                "subjects": subjects,
                "sessions": sessions,
            })
        range_term_ids = {item["termId"] for item in term_ranges}
        schedule_term_ids = {item["id"] for item in terms}
        if range_term_ids != schedule_term_ids:
            fail(f"{path}.calendar.terms", f"ids de calendario {sorted(range_term_ids)} no coinciden con horarios {sorted(schedule_term_ids)}")
        academic_years.append({
            "id": year_id,
            "displayName": display_name,
            "calendar": {
                "sources": copy.deepcopy(cal_raw.get("sources") or {}),
                "terms": term_ranges,
                "holidays": holidays,
                "inactiveDates": inactive_dates,
                "periods": periods,
            },
            "terms": terms,
        })

    rules_raw = _listish(raw.get("rules", []), "rules")
    rules = []
    for index, rule in enumerate(rules_raw):
        path = f"rules[{index}]"
        if not isinstance(rule, dict):
            fail(path, "debe ser un mapping")
        priority = rule.get("priority", 0)
        if not isinstance(priority, int):
            fail(f"{path}.priority", "debe ser un entero")
        when = _normalize_rule_when(rule.get("when"), f"{path}.when")
        for view_id in when.get("view", []):
            if view_id not in views:
                fail(f"{path}.when.view", f"vista inexistente {view_id!r}")
        content = _normalize_rule_content(rule.get("content"), f"{path}.content", defaults)
        if content["type"] == "term-schedule":
            year = next((item for item in academic_years if item["id"] == content["academicYear"]), None)
            if year is None:
                fail(f"{path}.content.academic_year", f"curso inexistente {content['academicYear']!r}")
            if content["term"] not in {term["id"] for term in year["terms"]}:
                fail(f"{path}.content.term", f"término inexistente {content['term']!r}")
        rules.append({"priority": priority, "order": index, "when": when, "content": content})

    result = {
        "version": 3,
        "app": {"title": title, "timezone": timezone},
        "timezone": timezone,
        "defaults": {"weekStartsOn": week_starts_on, "imageFit": image_fit},
        "runtime": runtime,
        "visual": visual,
        "states": states,
        "calendar": calendar,
        "views": views,
        "desktop": desktop,
        "rules": rules,
        "academicYears": academic_years,
    }
    return result


def compile_yaml(path: Path) -> dict[str, Any]:
    return compile_config_data(load_yaml(path))


def dump_compiled_json(config: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
