#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

import yaml

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
IMAGE_FITS = {"contain", "cover", "fill", "none", "scale-down"}
IMAGE_EXT = re.compile(r"\.(?:png|jpe?g|webp|avif|gif)(?:[?#].*)?$", re.I)
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(path, "es obligatorio")
    return value.strip()


def _date(value: Any, path: str) -> str:
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        fail(path, "debe ser una fecha ISO YYYY-MM-DD")
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        fail(path, "debe ser una fecha ISO válida")
    return value


def _list(value: Any, path: str) -> list[Any]:
    if value is None:
        return []
    if not isinstance(value, list):
        fail(path, "debe ser una lista")
    return value


def _id(value: Any, path: str) -> str:
    result = _text(value, path)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", result):
        fail(path, "identificador inválido")
    return result


def normalize_image(value: Any, path: str, default_fit: str = "contain") -> dict[str, Any]:
    if isinstance(value, str):
        value = {"src": value}
    if not isinstance(value, dict):
        fail(path, "debe ser una imagen")
    src = value.get("src")
    asset = value.get("asset")
    if bool(src) == bool(asset):
        fail(path, "requiere exactamente uno de src o asset")
    if src and (not isinstance(src, str) or not IMAGE_EXT.search(src) or src.lower().startswith(("data:", "blob:"))):
        fail(f"{path}.src", "solo admite PNG, JPEG, WebP, AVIF o GIF; SVG no está permitido")
    fit = value.get("fit", default_fit)
    if fit not in IMAGE_FITS:
        fail(f"{path}.fit", "valor desconocido")
    alt = value.get("alt", "")
    if not isinstance(alt, str):
        fail(f"{path}.alt", "debe ser texto")
    return {"type": "image", **({"src": src} if src else {"asset": asset}), "fit": fit, "alt": alt}


def _image_map(value: Any, path: str, validator) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    result = {}
    for key, image in value.items():
        if not validator(key):
            fail(f"{path}.{key}", "clave temporal desconocida")
        result[key] = normalize_image(image, f"{path}.{key}")
    return result


def _orientation_images(value: Any, path: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        fail(path, "debe ser un mapping")
    return {
        **({"vertical": normalize_image(value["vertical"], f"{path}.vertical")} if "vertical" in value else {}),
        **({"horizontal": normalize_image(value["horizontal"], f"{path}.horizontal")} if "horizontal" in value else {}),
    }


def _period_images(value: Any, path: str) -> dict[str, Any]:
    try:
        vertical = value["active"]["vertical"]
        active_horizontal = value["active"]["horizontal"]
        inactive_vertical = value["inactive"]["vertical"]
        inactive_horizontal = value["inactive"]["horizontal"]
        default_vertical = vertical["default"]
    except (KeyError, TypeError):
        fail(path, "requiere imágenes active.vertical.default, active.horizontal, inactive.vertical e inactive.horizontal")
    return {
        "active": {
            "vertical": {
                "default": normalize_image(default_vertical, f"{path}.active.vertical.default"),
                "days": _image_map(vertical.get("days"), f"{path}.active.vertical.days", lambda key: key in WEEKDAYS),
                "weeks": _image_map(vertical.get("weeks"), f"{path}.active.vertical.weeks", lambda key: bool(ISO_DATE.fullmatch(key))),
                "months": _image_map(vertical.get("months"), f"{path}.active.vertical.months", lambda key: bool(re.fullmatch(r"\d{4}-\d{2}", key))),
            },
            "horizontal": normalize_image(active_horizontal, f"{path}.active.horizontal"),
        },
        "inactive": {
            "vertical": normalize_image(inactive_vertical, f"{path}.inactive.vertical"),
            "horizontal": normalize_image(inactive_horizontal, f"{path}.inactive.horizontal"),
            "weekdays": _image_map(value["inactive"].get("weekdays"), f"{path}.inactive.weekdays", lambda key: key in WEEKDAYS),
        },
    }


def compile_config_data(raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("version") != 4:
        fail("version", "Schedule Viewer requiere version: 4")
    defaults_raw = raw.get("defaults") or {}
    starts = defaults_raw.get("week_starts_on", "monday")
    fit = defaults_raw.get("image_fit", "contain")
    if starts not in WEEKDAYS:
        fail("defaults.week_starts_on", "weekday desconocido")
    if fit not in IMAGE_FITS:
        fail("defaults.image_fit", "valor desconocido")
    unit = (raw.get("presentation") or {}).get("vertical", {}).get("unit", "day")
    if unit not in {"day", "week", "month"}:
        fail("presentation.vertical.unit", "debe ser day, week o month")
    calendar_raw = raw.get("calendar") or {}
    active_weekdays = _list(calendar_raw.get("active_weekdays"), "calendar.active_weekdays")
    if not active_weekdays or len(set(active_weekdays)) != len(active_weekdays) or any(day not in WEEKDAYS for day in active_weekdays):
        fail("calendar.active_weekdays", "debe contener weekdays únicos y al menos uno activo")

    exceptions = []
    for index, value in enumerate(_list(calendar_raw.get("exceptions"), "calendar.exceptions")):
        path = f"calendar.exceptions[{index}]"
        if not isinstance(value, dict):
            fail(path, "debe ser un mapping")
        state = value.get("state", "inactive")
        kind = value.get("kind", "other")
        if state not in {"active", "inactive"}:
            fail(f"{path}.state", "debe ser active o inactive")
        if kind not in {"holiday", "closure", "other"}:
            fail(f"{path}.kind", "valor desconocido")
        images = _orientation_images(value.get("images"), f"{path}.images")
        if state == "active" and images:
            fail(f"{path}.images", "una excepción activa usa las imágenes del periodo")
        exceptions.append({"id": _id(value.get("id"), f"{path}.id"), "date": _date(value.get("date"), f"{path}.date"), "name": _text(value.get("name"), f"{path}.name"), "state": state, "kind": kind, "images": images})

    inactive_periods = []
    for index, value in enumerate(_list(calendar_raw.get("inactive_periods"), "calendar.inactive_periods")):
        path = f"calendar.inactive_periods[{index}]"
        start = _date(value.get("start"), f"{path}.start")
        end = _date(value.get("end"), f"{path}.end")
        if start > end:
            fail(path, "start no puede ser posterior a end")
        kind = value.get("kind", "other")
        if kind not in {"vacation", "closure", "other"}:
            fail(f"{path}.kind", "valor desconocido")
        inactive_periods.append({"id": _id(value.get("id"), f"{path}.id"), "name": _text(value.get("name"), f"{path}.name"), "start": start, "end": end, "kind": kind, "images": _orientation_images(value.get("images"), f"{path}.images")})

    periods = []
    for index, value in enumerate(_list(raw.get("periods"), "periods")):
        path = f"periods[{index}]"
        start = _date(value.get("start"), f"{path}.start")
        end = _date(value.get("end"), f"{path}.end")
        if start > end:
            fail(path, "start no puede ser posterior a end")
        periods.append({"id": _id(value.get("id"), f"{path}.id"), "name": _text(value.get("name"), f"{path}.name"), "start": start, "end": end, "images": _period_images(value.get("images"), f"{path}.images")})
    if not periods:
        fail("periods", "debe contener al menos un periodo")
    for previous, current in zip(sorted(periods, key=lambda item: item["start"]), sorted(periods, key=lambda item: item["start"])[1:]):
        if previous["end"] >= current["start"]:
            fail("periods", f"{previous['id']} y {current['id']} se solapan")
    for path, values in (("periods", periods), ("calendar.exceptions", exceptions), ("calendar.inactive_periods", inactive_periods)):
        ids = [item["id"] for item in values]
        if len(ids) != len(set(ids)):
            fail(path, "contiene identificadores duplicados")
    dates = [item["date"] for item in exceptions]
    if len(dates) != len(set(dates)):
        fail("calendar.exceptions", "contiene fechas duplicadas")

    return {
        "version": 4,
        "app": {"timezone": _text((raw.get("app") or {}).get("timezone", "Europe/Madrid"), "app.timezone")},
        "defaults": {"weekStartsOn": starts, "imageFit": fit},
        "runtime": {"allowDateOverride": (raw.get("runtime") or {}).get("allow_date_override", True), "demo": bool((raw.get("runtime") or {}).get("demo", False))},
        "presentation": {"vertical": {"unit": unit}, "desktopToggle": (raw.get("presentation") or {}).get("desktop_toggle", True)},
        "calendar": {"activeWeekdays": active_weekdays, "exceptions": exceptions, "inactivePeriods": inactive_periods},
        "periods": periods,
    }


def compile_yaml(path: Path) -> dict[str, Any]:
    return compile_config_data(load_yaml(path))


def dump_compiled_json(config: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
