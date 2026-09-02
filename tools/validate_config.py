#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "schedules.json"
DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
IMAGE_FITS = {"contain", "cover", "fill", "none", "scale-down"}
GENERATED_VIEWS = {"day", "week", "no-class", "vacations"}


def minutes(value: str) -> int:
    h, m = map(int, value.split(":"))
    return h * 60 + m


def valid_date(value: str) -> bool:
    return bool(DATE_RE.match(value or ""))


def is_local_asset(src: str) -> bool:
    parsed = urlparse(src)
    return not parsed.scheme and not src.startswith("//")


def validate_image_src(src: str, location: str, generated_assets: set[str], errors: list[str]) -> None:
    if not isinstance(src, str) or not src:
        errors.append(f"{location}: image requiere src no vacío")
        return
    if src.startswith(("data:", "blob:")):
        return
    if is_local_asset(src) and src not in generated_assets and not (ROOT / src).is_file():
        errors.append(f"{location}: no existe el asset local {src}")


def validate_content(
    descriptor,
    location: str,
    errors: list[str],
    generated_assets: set[str],
    expected_view: str | None = None,
) -> None:
    if isinstance(descriptor, str):
        validate_image_src(descriptor, location, generated_assets, errors)
        return

    if not isinstance(descriptor, dict):
        errors.append(f"{location}: el contenido debe ser una cadena o un objeto")
        return

    content_type = descriptor.get("type")
    if content_type == "image":
        validate_image_src(descriptor.get("src"), location, generated_assets, errors)
        fit = descriptor.get("fit", "contain")
        if fit not in IMAGE_FITS:
            errors.append(f"{location}: fit no soportado: {fit}")
        alt = descriptor.get("alt")
        if alt is not None and not isinstance(alt, str):
            errors.append(f"{location}: alt debe ser texto")
        return

    if content_type == "generated-schedule":
        view = descriptor.get("view")
        if view is not None and view not in GENERATED_VIEWS:
            errors.append(f"{location}: view generada desconocida: {view}")
        if expected_view and view is not None and view != expected_view:
            errors.append(f"{location}: view debe ser {expected_view}, no {view}")
        alt = descriptor.get("alt")
        if alt is not None and not isinstance(alt, str):
            errors.append(f"{location}: alt debe ser texto")
        fallback = descriptor.get("fallbackSrc")
        if fallback is not None:
            validate_image_src(fallback, f"{location}.fallbackSrc", generated_assets, errors)
        return

    errors.append(f"{location}: type desconocido: {content_type!r}")


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    errors = []

    if cfg.get("version") != 2:
        errors.append("version debe ser 2")
    if cfg.get("timezone") != "Europe/Madrid":
        errors.append("timezone debe ser Europe/Madrid")

    generated_assets = set()
    for path in cfg.get("states", {}).values():
        if isinstance(path, str) and path:
            generated_assets.add(path)
    for year in cfg.get("academicYears", []):
        for term in year.get("terms", []):
            assets = term.get("assets", {})
            if assets.get("week"):
                generated_assets.add(assets["week"])
            generated_assets.update(path for path in assets.get("days", {}).values() if path)

    state_content = cfg.get("content", {}).get("states", {})
    unknown_states = set(state_content) - {"noClassToday", "vacations"}
    if unknown_states:
        errors.append(f"Estados de contenido desconocidos: {sorted(unknown_states)}")
    if "noClassToday" in state_content:
        validate_content(state_content["noClassToday"], "content.states.noClassToday", errors, generated_assets, "no-class")
    if "vacations" in state_content:
        validate_content(state_content["vacations"], "content.states.vacations", errors, generated_assets, "vacations")

    seen_years = set()
    for year in cfg.get("academicYears", []):
        year_id = year.get("id")
        if year_id in seen_years:
            errors.append(f"Curso duplicado: {year_id}")
        seen_years.add(year_id)

        calendar = year.get("calendar", {})
        schedules = year.get("terms", [])
        schedule_ids = [term.get("id") for term in schedules]
        if len(schedule_ids) != len(set(schedule_ids)):
            errors.append(f"Horarios de término duplicados en {year_id}")

        calendar_terms = calendar.get("terms", [])
        calendar_ids = [term.get("termId") for term in calendar_terms]
        if len(calendar_ids) != len(set(calendar_ids)):
            errors.append(f"Términos de calendario duplicados en {year_id}")

        if set(calendar_ids) != set(schedule_ids):
            missing_schedule = set(calendar_ids) - set(schedule_ids)
            missing_calendar = set(schedule_ids) - set(calendar_ids)
            if missing_schedule:
                errors.append(f"Falta horario para términos de calendario en {year_id}: {sorted(missing_schedule)}")
            if missing_calendar:
                errors.append(f"Faltan fechas de calendario para horarios en {year_id}: {sorted(missing_calendar)}")

        ordered_ranges = []
        for term in calendar_terms:
            term_id = term.get("termId")
            start, end = term.get("start", ""), term.get("end", "")
            if not valid_date(start) or not valid_date(end):
                errors.append(f"Fechas inválidas en {year_id}/{term_id}: {term}")
                continue
            if start > end:
                errors.append(f"Fechas invertidas en {year_id}/{term_id}")
            ordered_ranges.append((start, end, term_id))

        ordered_ranges.sort()
        for left, right in zip(ordered_ranges, ordered_ranges[1:]):
            if left[1] >= right[0]:
                errors.append(f"Cuatrimestres solapados en {year_id}: {left[2]} / {right[2]}")

        for key in ("holidays", "nonTeachingDays"):
            seen_dates = set()
            for entry in calendar.get(key, []):
                date = entry.get("date", "")
                if not valid_date(date):
                    errors.append(f"Fecha inválida en {year_id}.{key}: {entry}")
                if date in seen_dates:
                    errors.append(f"Fecha duplicada en {year_id}.{key}: {date}")
                seen_dates.add(date)

        vacation_ids = set()
        for period in calendar.get("vacations", []):
            period_id = period.get("id")
            if not period_id or period_id in vacation_ids:
                errors.append(f"Vacaciones con id inválido/duplicado en {year_id}: {period}")
            vacation_ids.add(period_id)
            start, end = period.get("start", ""), period.get("end", "")
            if not valid_date(start) or not valid_date(end):
                errors.append(f"Periodo de vacaciones inválido en {year_id}: {period}")
                continue
            if start > end:
                errors.append(f"Periodo de vacaciones invertido: {period_id}")
            show_from = period.get("showNextTermFrom")
            next_term = period.get("nextTermId")
            if show_from:
                if not next_term:
                    errors.append(f"{period_id}: showNextTermFrom requiere nextTermId")
                if not valid_date(show_from) or not (start <= show_from <= end):
                    errors.append(f"{period_id}: showNextTermFrom debe caer dentro del periodo")
            if next_term and not period.get("nextAcademicYearId") and next_term not in schedule_ids:
                errors.append(f"{period_id}: nextTermId desconocido en {year_id}: {next_term}")

        for term in schedules:
            term_id = term.get("id")
            key = (year_id, term_id)
            subjects = term.get("subjects", {})
            assets = term.get("assets", {})
            if not assets.get("week"):
                errors.append(f"Falta asset semanal en {key}")
            missing_days = DAYS - set(assets.get("days", {}))
            if missing_days:
                errors.append(f"Faltan assets diarios en {key}: {sorted(missing_days)}")

            content = term.get("content", {})
            unknown_content_keys = set(content) - {"week", "days"}
            if unknown_content_keys:
                errors.append(f"Claves content desconocidas en {key}: {sorted(unknown_content_keys)}")
            if "week" in content:
                validate_content(content["week"], f"{year_id}/{term_id}.content.week", errors, generated_assets, "week")
            custom_days = content.get("days", {})
            if not isinstance(custom_days, dict):
                errors.append(f"{year_id}/{term_id}.content.days debe ser un objeto")
            else:
                unknown_days = set(custom_days) - DAYS
                if unknown_days:
                    errors.append(f"Días content desconocidos en {key}: {sorted(unknown_days)}")
                for day, descriptor in custom_days.items():
                    validate_content(descriptor, f"{year_id}/{term_id}.content.days.{day}", errors, generated_assets, "day")

            per_day = {day: [] for day in DAYS}
            for session in term.get("sessions", []):
                day = session.get("day")
                if day not in DAYS:
                    errors.append(f"Día inválido en {key}: {session}")
                    continue
                if session.get("subject") not in subjects:
                    errors.append(f"Asignatura desconocida en {key}: {session}")
                if not TIME_RE.match(session.get("start", "")) or not TIME_RE.match(session.get("end", "")):
                    errors.append(f"Hora inválida en {key}: {session}")
                    continue
                start, end = minutes(session["start"]), minutes(session["end"])
                if start >= end:
                    errors.append(f"Sesión con duración inválida en {key}: {session}")
                per_day[day].append((start, end, session))

            for day, sessions in per_day.items():
                sessions.sort(key=lambda item: (item[0], item[1]))
                for left, right in zip(sessions, sessions[1:]):
                    if left[1] > right[0]:
                        errors.append(f"Solapamiento en {key} {day}: {left[2]} / {right[2]}")

    if errors:
        print("Configuración inválida:")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)

    print("validate-config: OK")


if __name__ == "__main__":
    main()
