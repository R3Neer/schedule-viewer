const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function compareDate(a, b) { return a.localeCompare(b); }
export function inRange(date, start, end) { return compareDate(date, start) >= 0 && compareDate(date, end) <= 0; }

export function dayKeyFromIso(date) {
  const [year, month, day] = date.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function isWeekend(date) {
  const day = dayKeyFromIso(date);
  return day === "saturday" || day === "sunday";
}

export function getDateInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function scheduleFor(year, termId) {
  return year.terms?.find((term) => term.id === termId) ?? null;
}

function calendarTermFor(year, termId) {
  return year.calendar?.terms?.find((term) => term.termId === termId) ?? null;
}

function combinedTerm(year, calendarTerm) {
  const schedule = scheduleFor(year, calendarTerm.termId);
  if (!schedule) return null;
  return { ...schedule, start: calendarTerm.start, end: calendarTerm.end };
}

export function flattenTerms(config) {
  return config.academicYears
    .flatMap((year) => (year.calendar?.terms ?? []).map((calendarTerm) => {
      const term = combinedTerm(year, calendarTerm);
      return term ? { academicYear: year, term } : null;
    }).filter(Boolean))
    .sort((a, b) => compareDate(a.term.start, b.term.start));
}

export function findActiveTerm(config, date) {
  return flattenTerms(config).find(({ term }) => inRange(date, term.start, term.end)) ?? null;
}

export function findNextTerm(config, date) {
  return flattenTerms(config).find(({ term }) => compareDate(term.start, date) > 0 && term.assets?.week) ?? null;
}

function academicYearBounds(year) {
  const ranges = [
    ...(year.calendar?.terms ?? []).map(({ start, end }) => ({ start, end })),
    ...(year.calendar?.vacations ?? []).map(({ start, end }) => ({ start, end }))
  ];
  if (!ranges.length) return null;
  return {
    start: ranges.map((item) => item.start).sort()[0],
    end: ranges.map((item) => item.end).sort().at(-1)
  };
}

export function findAcademicYear(config, date) {
  const containingTerm = findActiveTerm(config, date);
  if (containingTerm) return containingTerm.academicYear;

  const years = config.academicYears
    .map((year) => ({ year, bounds: academicYearBounds(year) }))
    .filter(({ bounds }) => bounds);

  const exact = years.find(({ bounds }) => inRange(date, bounds.start, bounds.end));
  if (exact) return exact.year;

  const next = years.find(({ bounds }) => compareDate(bounds.start, date) > 0);
  if (next) return next.year;

  return years.at(-1)?.year ?? null;
}

export function isHolidayDate(academicYear, date) {
  return Boolean(academicYear?.calendar?.holidays?.some((entry) => entry.date === date));
}

export function isNonTeachingDay(academicYear, date) {
  return Boolean(academicYear?.calendar?.nonTeachingDays?.some((entry) => entry.date === date));
}

export function findVacation(academicYear, date) {
  return academicYear?.calendar?.vacations?.find((period) => inRange(date, period.start, period.end)) ?? null;
}

function resolveVacationNextTerm(config, academicYear, vacation, date) {
  if (!vacation?.nextTermId || !vacation?.showNextTermFrom || compareDate(date, vacation.showNextTermFrom) < 0) {
    return null;
  }
  const targetYearId = vacation.nextAcademicYearId ?? academicYear.id;
  const targetYear = config.academicYears.find((year) => year.id === targetYearId);
  if (!targetYear) return null;
  const calendarTerm = calendarTermFor(targetYear, vacation.nextTermId);
  if (!calendarTerm) return null;
  const term = combinedTerm(targetYear, calendarTerm);
  return term?.assets?.week ? { academicYear: targetYear, term } : null;
}

export function selectScheduleAsset(config, { date, portraitNarrow }) {
  const active = findActiveTerm(config, date);
  const academicYear = active?.academicYear ?? findAcademicYear(config, date);
  const vacation = findVacation(academicYear, date);
  const noClassToday = isWeekend(date)
    || !active
    || isHolidayDate(academicYear, date)
    || isNonTeachingDay(academicYear, date)
    || Boolean(vacation);

  if (portraitNarrow) {
    if (noClassToday) {
      return { kind: "no-class", path: config.states.noClassTodayVertical, alt: "Sin clases hoy" };
    }
    const day = dayKeyFromIso(date);
    return {
      kind: "day",
      path: active.term.assets.days[day],
      alt: `${active.term.displayName}, horario del ${day}`,
      academicYearId: active.academicYear.id,
      termId: active.term.id,
      day
    };
  }

  if (vacation) {
    const next = resolveVacationNextTerm(config, academicYear, vacation, date);
    if (next) {
      return {
        kind: "next-week",
        path: next.term.assets.week,
        alt: `${next.term.displayName}, próximo horario semanal`,
        academicYearId: next.academicYear.id,
        termId: next.term.id
      };
    }
    return { kind: "vacations", path: config.states.vacationsHorizontal, alt: "Vacaciones" };
  }

  if (active) {
    return {
      kind: "week",
      path: active.term.assets.week,
      alt: `${active.term.displayName}, horario semanal`,
      academicYearId: active.academicYear.id,
      termId: active.term.id
    };
  }

  const next = findNextTerm(config, date);
  if (next) {
    return {
      kind: "next-week",
      path: next.term.assets.week,
      alt: `${next.term.displayName}, próximo horario semanal`,
      academicYearId: next.academicYear.id,
      termId: next.term.id
    };
  }

  return { kind: "vacations", path: config.states.vacationsHorizontal, alt: "Vacaciones" };
}
