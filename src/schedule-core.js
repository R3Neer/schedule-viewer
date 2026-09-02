const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function compareDate(a, b) {
  return a.localeCompare(b);
}

export function inRange(date, start, end) {
  return compareDate(date, start) >= 0 && compareDate(date, end) <= 0;
}

export function dayKeyFromIso(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return DAY_KEYS[weekday];
}

export function isWeekend(date) {
  const day = dayKeyFromIso(date);
  return day === "saturday" || day === "sunday";
}

export function getDateInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function flattenTerms(config) {
  return config.academicYears
    .flatMap((year) => year.terms.map((term) => ({ academicYear: year, term })))
    .sort((a, b) => compareDate(a.term.start, b.term.start));
}

export function findActiveTerm(config, date) {
  return flattenTerms(config).find(({ term }) => inRange(date, term.start, term.end)) ?? null;
}

export function findNextTerm(config, date) {
  return flattenTerms(config).find(({ term }) => compareDate(term.start, date) > 0 && term.assets?.week) ?? null;
}

export function findAcademicYear(config, date) {
  const containingTerm = findActiveTerm(config, date);
  if (containingTerm) return containingTerm.academicYear;

  const years = config.academicYears.map((year) => {
    const starts = year.terms.map((term) => term.start).sort();
    const ends = year.terms.map((term) => term.end).sort();
    return { year, start: starts[0], end: ends[ends.length - 1] };
  });

  const exact = years.find(({ start, end }) => inRange(date, start, end));
  if (exact) return exact.year;

  const next = years.find(({ start }) => compareDate(start, date) > 0);
  if (next) return next.year;

  return years.at(-1)?.year ?? null;
}

export function isExceptionDate(academicYear, date) {
  return Boolean(academicYear?.exceptions?.some((entry) => entry.date === date));
}

export function isInNonTeachingPeriod(academicYear, date) {
  return Boolean(academicYear?.nonTeachingPeriods?.some((period) => inRange(date, period.start, period.end)));
}

export function selectScheduleAsset(config, { date, portraitNarrow }) {
  const active = findActiveTerm(config, date);
  const academicYear = active?.academicYear ?? findAcademicYear(config, date);
  const noClassToday = isWeekend(date)
    || !active
    || isExceptionDate(academicYear, date)
    || isInNonTeachingPeriod(academicYear, date);

  if (portraitNarrow) {
    if (noClassToday) {
      return {
        kind: "no-class",
        path: config.states.noClassTodayVertical,
        alt: "Sin clases hoy"
      };
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

  return {
    kind: "vacations",
    path: config.states.vacationsHorizontal,
    alt: "Vacaciones"
  };
}
