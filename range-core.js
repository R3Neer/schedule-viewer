import {
  addDays, compareDate, dateFromIso, dayIndex, dayKeyFromIso,
  daysBetween, isoFromDate, parseIsoParts
} from "./date-core.js";

export function resolveRange(definition, anchor, defaults = {}) {
  const range = typeof definition === "string" ? { type: definition } : { ...definition };
  if (!range?.type) throw new TypeError("La vista no define un rango.");
  const kind = range.type;
  let start = anchor;
  let end = anchor;

  if (kind === "day") {
    // one day
  } else if (kind === "week") {
    const startsOn = range.startsOn ?? defaults.weekStartsOn ?? "monday";
    const current = dayIndex(dayKeyFromIso(anchor));
    const desired = dayIndex(startsOn);
    if (desired < 0) throw new TypeError(`startsOn desconocido: ${startsOn}`);
    start = addDays(anchor, -((current - desired + 7) % 7));
    end = addDays(start, 6);
  } else if (kind === "month") {
    const [year, month] = parseIsoParts(anchor);
    start = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(year, month, 1));
    last.setUTCDate(0);
    end = isoFromDate(last);
  } else if (kind === "year") {
    const [year] = parseIsoParts(anchor);
    start = `${String(year).padStart(4, "0")}-01-01`;
    end = `${String(year).padStart(4, "0")}-12-31`;
  } else if (kind === "relative" || kind === "rolling") {
    if (Number.isInteger(range.before) || Number.isInteger(range.after)) {
      const before = range.before ?? 0;
      const after = range.after ?? 0;
      if (before < 0 || after < 0) throw new TypeError("before/after deben ser >= 0.");
      start = addDays(anchor, -before);
      end = addDays(anchor, after);
    } else {
      const days = range.days;
      if (!Number.isInteger(days) || days < 1) throw new TypeError("rolling.days debe ser >= 1.");
      const position = range.anchorPosition ?? "start";
      if (position === "start") end = addDays(anchor, days - 1);
      else if (position === "end") start = addDays(anchor, -(days - 1));
      else if (position === "center") {
        start = addDays(anchor, -Math.floor((days - 1) / 2));
        end = addDays(start, days - 1);
      } else throw new TypeError(`anchorPosition desconocido: ${position}`);
    }
  } else if (kind === "interval") {
    start = range.start;
    end = range.end;
    dateFromIso(start);
    dateFromIso(end);
    if (compareDate(start, end) > 0) throw new TypeError("interval.start no puede ser posterior a end.");
  } else {
    throw new TypeError(`Tipo de rango desconocido: ${kind}`);
  }

  return {
    type: kind, anchor, start, end,
    dayCount: daysBetween(start, end) + 1,
    ...(range.startsOn ? { startsOn: range.startsOn } : {})
  };
}
