const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function compareDate(a, b) { return a.localeCompare(b); }
export function inRange(date, start, end) { return compareDate(date, start) >= 0 && compareDate(date, end) <= 0; }

export function parseIsoParts(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new TypeError(`Fecha ISO inválida: ${date}`);
  return match.slice(1).map(Number);
}

export function dateFromIso(date) {
  const [year, month, day] = parseIsoParts(date);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) throw new TypeError(`Fecha ISO inválida: ${date}`);
  return value;
}

export function isoFromDate(value) {
  return value.toISOString().slice(0, 10);
}

export function addDays(date, amount) {
  const value = dateFromIso(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return isoFromDate(value);
}

export function daysBetween(start, end) {
  return Math.round((dateFromIso(end) - dateFromIso(start)) / 86400000);
}

export function dayKeyFromIso(date) {
  return DAY_KEYS[dateFromIso(date).getUTCDay()];
}

export function dayIndex(day) {
  return DAY_KEYS.indexOf(day);
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
