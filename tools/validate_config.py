#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "schedules.json"
DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def minutes(value: str) -> int:
    h, m = map(int, value.split(":"))
    return h * 60 + m


def valid_date(value: str) -> bool:
    return bool(DATE_RE.match(value or ""))


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    errors = []

    if cfg.get("version") != 2:
        errors.append("version debe ser 2")
    if cfg.get("timezone") != "Europe/Madrid":
        errors.append("timezone debe ser Europe/Madrid")

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
            key = (year_id, term.get("id"))
            subjects = term.get("subjects", {})
            assets = term.get("assets", {})
            if not assets.get("week"):
                errors.append(f"Falta asset semanal en {key}")
            missing_days = DAYS - set(assets.get("days", {}))
            if missing_days:
                errors.append(f"Faltan assets diarios en {key}: {sorted(missing_days)}")

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
