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


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    errors = []

    if cfg.get("timezone") != "Europe/Madrid":
        errors.append("timezone debe ser Europe/Madrid")

    seen_terms = set()
    for year in cfg.get("academicYears", []):
        for entry in year.get("exceptions", []):
            if not DATE_RE.match(entry.get("date", "")):
                errors.append(f"Fecha de excepción inválida: {entry}")
        for period in year.get("nonTeachingPeriods", []):
            if not DATE_RE.match(period.get("start", "")) or not DATE_RE.match(period.get("end", "")):
                errors.append(f"Periodo no lectivo inválido: {period}")
            elif period["start"] > period["end"]:
                errors.append(f"Periodo invertido: {period['id']}")

        for term in year.get("terms", []):
            key = (year["id"], term["id"])
            if key in seen_terms:
                errors.append(f"Término duplicado: {key}")
            seen_terms.add(key)
            if term["start"] > term["end"]:
                errors.append(f"Fechas invertidas en {key}")

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
                sessions.sort()
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
