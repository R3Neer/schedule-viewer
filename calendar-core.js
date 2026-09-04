import { addDays, compareDate, dayKeyFromIso, inRange } from "./date-core.js";
import { resolveRange } from "./range-core.js";

export function flattenTerms(config) {
  return [...(config.periods ?? [])].sort((a, b) => compareDate(a.start, b.start)).map(period => ({ period, term: period }));
}

export function findActivePeriod(config, date) {
  return (config.periods ?? []).find(period => inRange(date, period.start, period.end)) ?? null;
}

export function findActiveTerm(config, date) {
  const period = findActivePeriod(config, date);
  return period ? { period, term: period } : null;
}

export function findNextTerm(config, date) {
  const period = [...(config.periods ?? [])].sort((a, b) => compareDate(a.start, b.start)).find(item => compareDate(item.start, date) > 0);
  return period ? { period, term: period } : null;
}

export function displayPeriodForDate(config, date) {
  const exact = findActivePeriod(config, date);
  if (exact) return exact;
  const ordered = [...(config.periods ?? [])].sort((a, b) => compareDate(a.start, b.start));
  const previous = ordered.filter(period => compareDate(period.end, date) < 0).at(-1);
  return previous ?? ordered.find(period => compareDate(period.start, date) > 0) ?? ordered[0] ?? null;
}

export function evaluateDate(config, date) {
  const weekday = dayKeyFromIso(date);
  const exact = (config.calendar?.exceptions ?? []).find(item => item.date === date) ?? null;
  const inactivePeriod = (config.calendar?.inactivePeriods ?? []).find(item => inRange(date, item.start, item.end)) ?? null;
  const activePeriod = findActivePeriod(config, date);
  const displayPeriod = activePeriod ?? displayPeriodForDate(config, date);
  const recurrentActive = (config.calendar?.activeWeekdays ?? []).includes(weekday);

  let status = "active";
  let inactive = false;
  let reason = "weekly-pattern";
  let label = activePeriod?.name ?? null;

  if (exact?.state === "active" && activePeriod) {
    status = "active";
    reason = "explicit-active-date";
    label = exact.name;
  } else if (exact?.state === "inactive") {
    status = exact.kind === "holiday" ? "holiday" : "inactive-date";
    inactive = true;
    reason = `exception:${exact.id}`;
    label = exact.name;
  } else if (inactivePeriod) {
    status = inactivePeriod.kind === "vacation" ? "vacation" : "inactive-period";
    inactive = true;
    reason = `period:${inactivePeriod.id}`;
    label = inactivePeriod.name;
  } else if (!activePeriod) {
    status = "out-of-period";
    inactive = true;
    reason = "out-of-period";
    label = "Outside any period";
  } else if (!recurrentActive) {
    status = "inactive-weekday";
    inactive = true;
    reason = `weekday:${weekday}`;
    label = "Inactive day";
  }

  return {
    date, weekday, status, inactive, reason, label, activePeriod, displayPeriod,
    activeTerm: activePeriod ? { period: activePeriod, term: activePeriod } : null,
    matches: { exception: exact, period: inactivePeriod }
  };
}

export function weekOccurrences(period, startsOn = "monday") {
  if (!period) return [];
  let cursor = resolveRange({ type: "week", startsOn }, period.start, { weekStartsOn: startsOn }).start;
  const result = [];
  while (compareDate(cursor, period.end) <= 0) {
    const fullEnd = addDays(cursor, 6);
    result.push({ key: cursor, start: compareDate(cursor, period.start) < 0 ? period.start : cursor, end: compareDate(fullEnd, period.end) > 0 ? period.end : fullEnd, partial: compareDate(cursor, period.start) < 0 || compareDate(fullEnd, period.end) > 0 });
    cursor = addDays(cursor, 7);
  }
  return result;
}

export function monthOccurrences(period) {
  if (!period) return [];
  let cursor = `${period.start.slice(0, 7)}-01`;
  const result = [];
  while (compareDate(cursor, period.end) <= 0) {
    const range = resolveRange("month", cursor);
    result.push({ key: cursor.slice(0, 7), start: compareDate(range.start, period.start) < 0 ? period.start : range.start, end: compareDate(range.end, period.end) > 0 ? period.end : range.end });
    cursor = addDays(range.end, 1);
  }
  return result;
}

export function activeWeekdaysForPeriod(config, period) {
  const active = new Set(config.calendar?.activeWeekdays ?? []);
  for (const item of config.calendar?.exceptions ?? []) {
    if (item.state === "active" && period && inRange(item.date, period.start, period.end)) active.add(dayKeyFromIso(item.date));
  }
  const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return order.filter(day => active.has(day));
}
