import { compareDate, dateFromIso } from "./date-core.js";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const RANGE_TYPES = ["day", "week", "month"];
export const USER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);
const IMAGE_FITS = new Set(["contain", "cover", "fill", "none", "scale-down"]);
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|avif|gif)(?:[?#].*)?$/i;

export class ConfigValidationError extends TypeError {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ConfigValidationError";
    this.path = path;
  }
}

function fail(path, message) { throw new ConfigValidationError(path, message); }
function clone(value) { return value == null ? value : structuredClone(value); }
function list(value, path) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(path, "must be a list");
  return value;
}
function text(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "is required");
  return value.trim();
}
function iso(value, path) {
  if (typeof value !== "string") fail(path, "must be an ISO date in YYYY-MM-DD format");
  try { dateFromIso(value); } catch { fail(path, "must be a valid ISO date in YYYY-MM-DD format"); }
  return value;
}
function identifier(value, path) {
  const id = text(value, path);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) fail(path, "only allows letters, numbers, periods, hyphens and underscores");
  return id;
}

export function normalizeImageDescriptor(value, path = "image", defaults = {}) {
  if (typeof value === "string") value = { src: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an image");
  if (value.type != null && value.type !== "image") fail(`${path}.type`, "must be image");
  const hasSrc = typeof value.src === "string" && Boolean(value.src.trim());
  const hasAsset = typeof value.asset === "string" && Boolean(value.asset.trim());
  if (hasSrc === hasAsset) fail(path, "requires exactly one of src or asset");
  if (hasSrc && (!IMAGE_EXTENSION.test(value.src.trim()) || /^(?:blob|data):/i.test(value.src))) {
    fail(`${path}.src`, "only allows PNG, JPEG, WebP, AVIF or GIF; SVG is not allowed");
  }
  const fit = value.fit ?? defaults.fit ?? "contain";
  if (!IMAGE_FITS.has(fit)) fail(`${path}.fit`, `unknown value ${JSON.stringify(fit)}`);
  const alt = value.alt ?? defaults.alt ?? "";
  if (typeof alt !== "string") fail(`${path}.alt`, "must be text");
  return { type: "image", ...(hasSrc ? { src: value.src.trim() } : { asset: value.asset.trim() }), fit, alt };
}

function imageMap(value, path, validKey, defaults) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "must be a mapping");
  return Object.fromEntries(Object.entries(value).map(([key, descriptor]) => {
    if (!validKey(key)) fail(`${path}.${key}`, "unknown time key");
    return [key, normalizeImageDescriptor(descriptor, `${path}.${key}`, defaults)];
  }));
}

function orientationImages(value, path, defaults) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "must be a mapping");
  return {
    ...(value.vertical != null ? { vertical: normalizeImageDescriptor(value.vertical, `${path}.vertical`, defaults) } : {}),
    ...(value.horizontal != null ? { horizontal: normalizeImageDescriptor(value.horizontal, `${path}.horizontal`, defaults) } : {})
  };
}

function periodImages(value, path, defaults) {
  const active = value?.active;
  const inactive = value?.inactive;
  const vertical = active?.vertical;
  if (!vertical?.default) fail(`${path}.active.vertical.default`, "is required");
  if (!active?.horizontal) fail(`${path}.active.horizontal`, "is required");
  if (!inactive?.vertical) fail(`${path}.inactive.vertical`, "is required");
  if (!inactive?.horizontal) fail(`${path}.inactive.horizontal`, "is required");
  return {
    active: {
      vertical: {
        default: normalizeImageDescriptor(vertical.default, `${path}.active.vertical.default`, defaults),
        days: imageMap(vertical.days, `${path}.active.vertical.days`, key => WEEKDAYS.includes(key), defaults),
        weeks: imageMap(vertical.weeks, `${path}.active.vertical.weeks`, key => /^\d{4}-\d{2}-\d{2}$/.test(key), defaults),
        months: imageMap(vertical.months, `${path}.active.vertical.months`, key => /^\d{4}-\d{2}$/.test(key), defaults)
      },
      horizontal: normalizeImageDescriptor(active.horizontal, `${path}.active.horizontal`, defaults)
    },
    inactive: {
      vertical: normalizeImageDescriptor(inactive.vertical, `${path}.inactive.vertical`, defaults),
      horizontal: normalizeImageDescriptor(inactive.horizontal, `${path}.inactive.horizontal`, defaults),
      weekdays: imageMap(inactive.weekdays, `${path}.inactive.weekdays`, key => WEEKDAYS.includes(key), defaults)
    }
  };
}

function normalizeException(value, path, defaults) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be a mapping");
  const state = value.state ?? "inactive";
  if (!["active", "inactive"].includes(state)) fail(`${path}.state`, "must be active or inactive");
  const kind = value.kind ?? "other";
  if (!["holiday", "closure", "other"].includes(kind)) fail(`${path}.kind`, "must be holiday, closure or other");
  const images = orientationImages(value.images, `${path}.images`, defaults);
  if (state === "active" && Object.keys(images).length) fail(`${path}.images`, "an active exception uses the period's active images");
  return { id: identifier(value.id, `${path}.id`), date: iso(value.date, `${path}.date`), name: text(value.name, `${path}.name`), state, kind, images };
}

function normalizeInactivePeriod(value, path, defaults) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be a mapping");
  const start = iso(value.start, `${path}.start`);
  const end = iso(value.end, `${path}.end`);
  if (compareDate(start, end) > 0) fail(path, "start cannot be later than end");
  const kind = value.kind ?? "other";
  if (!["vacation", "closure", "other"].includes(kind)) fail(`${path}.kind`, "must be vacation, closure or other");
  return { id: identifier(value.id, `${path}.id`), name: text(value.name, `${path}.name`), start, end, kind, images: orientationImages(value.images, `${path}.images`, defaults) };
}

function unique(items, key, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[key])) fail(path, `duplicate ${key} ${JSON.stringify(item[key])}`);
    seen.add(item[key]);
  }
}

export function compileSourceConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("config", "the root must be a mapping");
  if (raw.version !== 4) fail("version", "Schedule Viewer requires version: 4");
  const weekStartsOn = raw.defaults?.week_starts_on ?? raw.defaults?.weekStartsOn ?? "monday";
  if (!WEEKDAYS.includes(weekStartsOn)) fail("defaults.week_starts_on", "unknown weekday");
  const imageFit = raw.defaults?.image_fit ?? raw.defaults?.imageFit ?? "contain";
  if (!IMAGE_FITS.has(imageFit)) fail("defaults.image_fit", "unknown value");
  const unit = raw.presentation?.vertical?.unit ?? "day";
  if (!RANGE_TYPES.includes(unit)) fail("presentation.vertical.unit", "must be day, week or month");
  const activeWeekdays = list(raw.calendar?.active_weekdays ?? raw.calendar?.activeWeekdays, "calendar.active_weekdays");
  if (!activeWeekdays.length || activeWeekdays.some(day => !WEEKDAYS.includes(day)) || new Set(activeWeekdays).size !== activeWeekdays.length) {
    fail("calendar.active_weekdays", "must contain unique weekdays and at least one active day");
  }
  const exceptions = list(raw.calendar?.exceptions, "calendar.exceptions").map((item, index) => normalizeException(item, `calendar.exceptions[${index}]`, { fit: imageFit }));
  const inactivePeriods = list(raw.calendar?.inactive_periods ?? raw.calendar?.inactivePeriods, "calendar.inactive_periods")
    .map((item, index) => normalizeInactivePeriod(item, `calendar.inactive_periods[${index}]`, { fit: imageFit }));
  unique(exceptions, "id", "calendar.exceptions");
  unique(exceptions, "date", "calendar.exceptions");
  unique(inactivePeriods, "id", "calendar.inactive_periods");

  const periods = list(raw.periods, "periods").map((value, index) => {
    const path = `periods[${index}]`;
    const start = iso(value?.start, `${path}.start`);
    const end = iso(value?.end, `${path}.end`);
    if (compareDate(start, end) > 0) fail(path, "start cannot be later than end");
    return { id: identifier(value?.id, `${path}.id`), name: text(value?.name, `${path}.name`), start, end, images: periodImages(value?.images, `${path}.images`, { fit: imageFit }) };
  });
  if (!periods.length) fail("periods", "must contain at least one period");
  unique(periods, "id", "periods");
  const ordered = [...periods].sort((a, b) => compareDate(a.start, b.start));
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareDate(ordered[index - 1].end, ordered[index].start) >= 0) fail("periods", `${ordered[index - 1].id} and ${ordered[index].id} overlap`);
  }

  return {
    version: 4,
    app: { timezone: text(raw.app?.timezone ?? "Europe/Madrid", "app.timezone") },
    defaults: { weekStartsOn, imageFit },
    runtime: { allowDateOverride: raw.runtime?.allow_date_override ?? raw.runtime?.allowDateOverride ?? true, demo: Boolean(raw.runtime?.demo) },
    presentation: { vertical: { unit }, desktopToggle: raw.presentation?.desktop_toggle ?? raw.presentation?.desktopToggle ?? true },
    calendar: { activeWeekdays: [...activeWeekdays], exceptions, inactivePeriods },
    periods
  };
}

function sourceImage(image) {
  return image ? { ...(image.asset ? { asset: image.asset } : { src: image.src }), ...(image.alt ? { alt: image.alt } : {}), ...(image.fit != null ? { fit: image.fit } : {}) } : undefined;
}
function sourceMap(map) { return Object.fromEntries(Object.entries(map ?? {}).map(([key, image]) => [key, sourceImage(image)])); }
function sourceOrientations(images) { return { ...(images?.vertical ? { vertical: sourceImage(images.vertical) } : {}), ...(images?.horizontal ? { horizontal: sourceImage(images.horizontal) } : {}) }; }

export function decompileConfig(input) {
  const config = input.defaults?.weekStartsOn ? input : compileSourceConfig(input);
  return {
    version: 4,
    app: { timezone: config.app.timezone },
    defaults: { week_starts_on: config.defaults.weekStartsOn, image_fit: config.defaults.imageFit },
    runtime: { allow_date_override: config.runtime.allowDateOverride, ...(config.runtime.demo ? { demo: true } : {}) },
    presentation: { vertical: { unit: config.presentation.vertical.unit }, desktop_toggle: config.presentation.desktopToggle },
    calendar: {
      active_weekdays: [...config.calendar.activeWeekdays],
      exceptions: config.calendar.exceptions.map(item => ({ id: item.id, date: item.date, name: item.name, state: item.state, kind: item.kind, ...(Object.keys(item.images).length ? { images: sourceOrientations(item.images) } : {}) })),
      inactive_periods: config.calendar.inactivePeriods.map(item => ({ id: item.id, name: item.name, start: item.start, end: item.end, kind: item.kind, ...(Object.keys(item.images).length ? { images: sourceOrientations(item.images) } : {}) }))
    },
    periods: config.periods.map(period => ({
      id: period.id, name: period.name, start: period.start, end: period.end,
      images: {
        active: {
          vertical: {
            default: sourceImage(period.images.active.vertical.default),
            ...(Object.keys(period.images.active.vertical.days).length ? { days: sourceMap(period.images.active.vertical.days) } : {}),
            ...(Object.keys(period.images.active.vertical.weeks).length ? { weeks: sourceMap(period.images.active.vertical.weeks) } : {}),
            ...(Object.keys(period.images.active.vertical.months).length ? { months: sourceMap(period.images.active.vertical.months) } : {})
          },
          horizontal: sourceImage(period.images.active.horizontal)
        },
        inactive: {
          vertical: sourceImage(period.images.inactive.vertical), horizontal: sourceImage(period.images.inactive.horizontal),
          ...(Object.keys(period.images.inactive.weekdays).length ? { weekdays: sourceMap(period.images.inactive.weekdays) } : {})
        }
      }
    }))
  };
}

export function collectAssetIds(config) {
  const ids = new Set();
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (value.type === "image" && typeof value.asset === "string") ids.add(value.asset);
    if (Array.isArray(value)) value.forEach(visit); else Object.values(value).forEach(visit);
  };
  visit(config);
  return [...ids];
}

function legacyImage(value, path) { return value ? normalizeImageDescriptor(typeof value === "string" ? { src: value } : value, path) : null; }

export function migrateV3Config(oldConfig) {
  if (oldConfig?.version !== 3) fail("version", "only a v3 configuration can be migrated");
  const activeWeekdays = WEEKDAYS.filter(day => !Object.prototype.hasOwnProperty.call(oldConfig.calendar?.inactiveWeekdays ?? {}, day));
  const inactiveVertical = legacyImage(oldConfig.calendar?.inactive?.defaultImage ?? oldConfig.states?.noClassTodayVertical, "calendar.inactive.default_image");
  const inactiveHorizontal = legacyImage(oldConfig.states?.vacationsHorizontal ?? inactiveVertical, "states.vacations");
  if (!inactiveVertical || !inactiveHorizontal) fail("migration", "inactive images are missing");
  const exceptions = [];
  const usedDates = new Set();
  const addException = (entry, state, kind, prefix) => {
    if (!entry?.date || usedDates.has(entry.date)) return;
    usedDates.add(entry.date);
    const image = state === "inactive" && entry.image ? legacyImage(entry.image, `${prefix}.${entry.date}.image`) : null;
    exceptions.push({ id: `${prefix}-${entry.date}`, date: entry.date, name: entry.label || (state === "active" ? "Active day" : "Inactive day"), state, kind, images: image ? { vertical: image, horizontal: image } : {} });
  };
  (oldConfig.calendar?.activeDates ?? []).forEach(entry => addException(entry, "active", "other", "active"));
  (oldConfig.calendar?.inactiveDates ?? []).forEach(entry => addException(entry, "inactive", "other", "inactive"));
  const inactivePeriods = [];
  const periods = [];
  for (const year of oldConfig.academicYears ?? []) {
    (year.calendar?.holidays ?? []).forEach(entry => addException(entry, "inactive", "holiday", "holiday"));
    (year.calendar?.inactiveDates ?? []).forEach(entry => addException(entry, "inactive", "other", "inactive"));
    for (const item of year.calendar?.periods ?? []) {
      const image = item.image ? legacyImage(item.image, `period.${item.id}.image`) : null;
      inactivePeriods.push({ id: item.id, name: item.label || item.id, start: item.start, end: item.end, kind: item.type === "vacation" ? "vacation" : item.type === "non-teaching" ? "closure" : "other", images: image ? { vertical: image, horizontal: image } : {} });
    }
    for (const range of year.calendar?.terms ?? []) {
      const term = (year.terms ?? []).find(item => item.id === range.termId);
      if (!term) fail("migration", `${range.termId} does not exist`);
      const days = {};
      for (const weekday of activeWeekdays) {
        const descriptor = term.content?.days?.[weekday] ?? term.assets?.days?.[weekday];
        if (!descriptor) fail("migration", `${term.displayName ?? term.id} depends on the structured schedule for ${weekday}`);
        days[weekday] = legacyImage(descriptor, `term.${term.id}.days.${weekday}`);
      }
      const horizontal = term.content?.week ?? term.assets?.week;
      if (!horizontal) fail("migration", `${term.displayName ?? term.id} depends on the horizontal structured schedule`);
      periods.push({
        id: `${year.id}-${term.id}`.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, ""), name: term.displayName || term.id, start: range.start, end: range.end,
        images: { active: { vertical: { default: days[activeWeekdays[0]], days }, horizontal: legacyImage(horizontal, `term.${term.id}.week`) }, inactive: { vertical: inactiveVertical, horizontal: inactiveHorizontal } }
      });
    }
  }
  return compileSourceConfig({
    version: 4, app: { timezone: oldConfig.app?.timezone ?? "Europe/Madrid" },
    defaults: { week_starts_on: oldConfig.defaults?.weekStartsOn ?? "monday", image_fit: oldConfig.defaults?.imageFit ?? "contain" },
    runtime: { allow_date_override: oldConfig.runtime?.allowDateOverride !== false },
    presentation: { vertical: { unit: "day" }, desktop_toggle: oldConfig.desktop?.shortcuts?.toggleView?.enabled !== false },
    calendar: { active_weekdays: activeWeekdays, exceptions, inactive_periods: inactivePeriods }, periods
  });
}

export function assertSupportedUserAsset(record, path = "asset") {
  const mime = record?.mimeType || record?.blob?.type;
  if (!USER_IMAGE_MIME_TYPES.has(mime)) fail(path, "only allows PNG, JPEG, WebP, AVIF or GIF; SVG is not allowed");
  return record;
}
