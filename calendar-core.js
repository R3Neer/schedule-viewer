import { compareDate, dateFromIso, dayKeyFromIso, inRange } from "./date-core.js";

export function scheduleFor(year, termId) {
  return year?.terms?.find((term) => term.id === termId) ?? null;
}

export function calendarTermFor(year, termId) {
  return year?.calendar?.terms?.find((term) => term.termId === termId) ?? null;
}

export function combinedTerm(year, calendarTerm) {
  const schedule = scheduleFor(year, calendarTerm?.termId);
  if (!schedule || !calendarTerm) return null;
  return { ...schedule, start: calendarTerm.start, end: calendarTerm.end };
}

export function flattenTerms(config) {
  return (config.academicYears ?? [])
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
  return flattenTerms(config).find(({ term }) => compareDate(term.start, date) > 0) ?? null;
}

function academicYearBounds(year) {
  const ranges = [
    ...(year.calendar?.terms ?? []).map(({ start, end }) => ({ start, end })),
    ...(year.calendar?.periods ?? []).map(({ start, end }) => ({ start, end }))
  ];
  if (!ranges.length) return null;
  return {
    start: ranges.map((item) => item.start).sort()[0],
    end: ranges.map((item) => item.end).sort().at(-1)
  };
}

export function findAcademicYear(config, date) {
  const active = findActiveTerm(config, date);
  if (active) return active.academicYear;
  const years = (config.academicYears ?? [])
    .map((year) => ({ year, bounds: academicYearBounds(year) }))
    .filter(({ bounds }) => bounds)
    .sort((a, b) => compareDate(a.bounds.start, b.bounds.start));
  const exact = years.find(({ bounds }) => inRange(date, bounds.start, bounds.end));
  if (exact) return exact.year;
  const next = years.find(({ bounds }) => compareDate(bounds.start, date) > 0);
  if (next) return next.year;
  return years.at(-1)?.year ?? null;
}

function firstDateEntry(entries, date) {
  return entries?.find((entry) => entry.date === date) ?? null;
}

function highestPriorityPeriod(periods, date) {
  return (periods ?? [])
    .filter((period) => inRange(date, period.start, period.end))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null;
}

export function evaluateDate(config, date) {
  dateFromIso(date);
  const activeTerm = findActiveTerm(config, date);
  const academicYear = activeTerm?.academicYear ?? findAcademicYear(config, date);
  const globalCalendar = config.calendar ?? {};
  const localCalendar = academicYear?.calendar ?? {};

  const activeDate =
    firstDateEntry(globalCalendar.activeDates, date) ||
    firstDateEntry(localCalendar.activeDates, date);
  const inactiveDate =
    firstDateEntry(globalCalendar.inactiveDates, date) ||
    firstDateEntry(localCalendar.inactiveDates, date);
  const holiday = firstDateEntry(localCalendar.holidays, date);
  const period = highestPriorityPeriod(localCalendar.periods, date);
  const weekday = dayKeyFromIso(date);
  const inactiveWeekday = globalCalendar.inactiveWeekdays?.[weekday] ?? null;
  const isInactiveWeekday = Object.prototype.hasOwnProperty.call(
    globalCalendar.inactiveWeekdays ?? {}, weekday
  );

  let status = "normal";
  let inactive = false;
  let reason = "active-term";
  let label = null;

  if (activeDate) {
    status = "active";
    reason = "explicit-active-date";
    label = activeDate.label ?? null;
  } else if (inactiveDate) {
    status = inactiveDate.type === "non-teaching" ? "non-teaching" : "inactive-date";
    inactive = true;
    reason = status;
    label = inactiveDate.label ?? null;
  } else if (period) {
    status = period.type === "vacation" ? "vacation" : period.type;
    inactive = true;
    reason = `period:${period.id}`;
    label = period.label ?? null;
  } else if (holiday) {
    status = "holiday";
    inactive = true;
    reason = "holiday";
    label = holiday.label ?? null;
  } else if (isInactiveWeekday) {
    status = "inactive-weekday";
    inactive = true;
    reason = `weekday:${weekday}`;
  } else if (!activeTerm) {
    status = "out-of-term";
    inactive = true;
    reason = "out-of-term";
  }

  return {
    date, weekday, status, inactive, reason, label,
    activeTerm, academicYear,
    matches: {
      activeDate,
      inactiveDate,
      holiday,
      period,
      inactiveWeekday: isInactiveWeekday ? inactiveWeekday : null
    }
  };
}
