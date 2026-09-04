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
  if (!Array.isArray(value)) fail(path, "debe ser una lista");
  return value;
}
function text(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "es obligatorio");
  return value.trim();
}
function iso(value, path) {
  if (typeof value !== "string") fail(path, "debe ser una fecha ISO YYYY-MM-DD");
  try { dateFromIso(value); } catch { fail(path, "debe ser una fecha ISO válida YYYY-MM-DD"); }
  return value;
}
function identifier(value, path) {
  const id = text(value, path);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) fail(path, "solo admite letras, números, punto, guion y guion bajo");
  return id;
}

export function normalizeImageDescriptor(value, path = "image", defaults = {}) {
  if (typeof value === "string") value = { src: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser una imagen");
  if (value.type != null && value.type !== "image") fail(`${path}.type`, "debe ser image");
  const hasSrc = typeof value.src === "string" && Boolean(value.src.trim());
  const hasAsset = typeof value.asset === "string" && Boolean(value.asset.trim());
  if (hasSrc === hasAsset) fail(path, "requiere exactamente uno de src o asset");
  if (hasSrc && (!IMAGE_EXTENSION.test(value.src.trim()) || /^(?:blob|data):/i.test(value.src))) {
    fail(`${path}.src`, "solo admite PNG, JPEG, WebP, AVIF o GIF; SVG no está permitido");
  }
  const fit = value.fit ?? defaults.fit ?? "contain";
  if (!IMAGE_FITS.has(fit)) fail(`${path}.fit`, `valor desconocido ${JSON.stringify(fit)}`);
  const alt = value.alt ?? defaults.alt ?? "";
  if (typeof alt !== "string") fail(`${path}.alt`, "debe ser texto");
  return { type: "image", ...(hasSrc ? { src: value.src.trim() } : { asset: value.asset.trim() }), fit, alt };
}

function imageMap(value, path, validKey) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  return Object.fromEntries(Object.entries(value).map(([key, descriptor]) => {
    if (!validKey(key)) fail(`${path}.${key}`, "clave temporal desconocida");
    return [key, normalizeImageDescriptor(descriptor, `${path}.${key}`)];
  }));
}

function orientationImages(value, path) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  return {
    ...(value.vertical != null ? { vertical: normalizeImageDescriptor(value.vertical, `${path}.vertical`) } : {}),
    ...(value.horizontal != null ? { horizontal: normalizeImageDescriptor(value.horizontal, `${path}.horizontal`) } : {})
  };
}

function periodImages(value, path) {
  const active = value?.active;
  const inactive = value?.inactive;
  const vertical = active?.vertical;
  if (!vertical?.default) fail(`${path}.active.vertical.default`, "es obligatorio");
  if (!active?.horizontal) fail(`${path}.active.horizontal`, "es obligatorio");
  if (!inactive?.vertical) fail(`${path}.inactive.vertical`, "es obligatorio");
  if (!inactive?.horizontal) fail(`${path}.inactive.horizontal`, "es obligatorio");
  return {
    active: {
      vertical: {
        default: normalizeImageDescriptor(vertical.default, `${path}.active.vertical.default`),
        days: imageMap(vertical.days, `${path}.active.vertical.days`, key => WEEKDAYS.includes(key)),
        weeks: imageMap(vertical.weeks, `${path}.active.vertical.weeks`, key => /^\d{4}-\d{2}-\d{2}$/.test(key)),
        months: imageMap(vertical.months, `${path}.active.vertical.months`, key => /^\d{4}-\d{2}$/.test(key))
      },
      horizontal: normalizeImageDescriptor(active.horizontal, `${path}.active.horizontal`)
    },
    inactive: {
      vertical: normalizeImageDescriptor(inactive.vertical, `${path}.inactive.vertical`),
      horizontal: normalizeImageDescriptor(inactive.horizontal, `${path}.inactive.horizontal`),
      weekdays: imageMap(inactive.weekdays, `${path}.inactive.weekdays`, key => WEEKDAYS.includes(key))
    }
  };
}

function normalizeException(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const state = value.state ?? "inactive";
  if (!["active", "inactive"].includes(state)) fail(`${path}.state`, "debe ser active o inactive");
  const kind = value.kind ?? "other";
  if (!["holiday", "closure", "other"].includes(kind)) fail(`${path}.kind`, "debe ser holiday, closure u other");
  const images = orientationImages(value.images, `${path}.images`);
  if (state === "active" && Object.keys(images).length) fail(`${path}.images`, "una excepción activa usa las imágenes activas del periodo");
  return { id: identifier(value.id, `${path}.id`), date: iso(value.date, `${path}.date`), name: text(value.name, `${path}.name`), state, kind, images };
}

function normalizeInactivePeriod(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const start = iso(value.start, `${path}.start`);
  const end = iso(value.end, `${path}.end`);
  if (compareDate(start, end) > 0) fail(path, "start no puede ser posterior a end");
  const kind = value.kind ?? "other";
  if (!["vacation", "closure", "other"].includes(kind)) fail(`${path}.kind`, "debe ser vacation, closure u other");
  return { id: identifier(value.id, `${path}.id`), name: text(value.name, `${path}.name`), start, end, kind, images: orientationImages(value.images, `${path}.images`) };
}

function unique(items, key, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[key])) fail(path, `${key} duplicado ${JSON.stringify(item[key])}`);
    seen.add(item[key]);
  }
}

export function compileSourceConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("config", "la raíz debe ser un mapping");
  if (raw.version !== 4) fail("version", "Schedule Viewer requiere version: 4");
  const weekStartsOn = raw.defaults?.week_starts_on ?? raw.defaults?.weekStartsOn ?? "monday";
  if (!WEEKDAYS.includes(weekStartsOn)) fail("defaults.week_starts_on", "weekday desconocido");
  const imageFit = raw.defaults?.image_fit ?? raw.defaults?.imageFit ?? "contain";
  if (!IMAGE_FITS.has(imageFit)) fail("defaults.image_fit", "valor desconocido");
  const unit = raw.presentation?.vertical?.unit ?? "day";
  if (!RANGE_TYPES.includes(unit)) fail("presentation.vertical.unit", "debe ser day, week o month");
  const activeWeekdays = list(raw.calendar?.active_weekdays ?? raw.calendar?.activeWeekdays, "calendar.active_weekdays");
  if (!activeWeekdays.length || activeWeekdays.some(day => !WEEKDAYS.includes(day)) || new Set(activeWeekdays).size !== activeWeekdays.length) {
    fail("calendar.active_weekdays", "debe contener weekdays únicos y al menos uno activo");
  }
  const exceptions = list(raw.calendar?.exceptions, "calendar.exceptions").map((item, index) => normalizeException(item, `calendar.exceptions[${index}]`));
  const inactivePeriods = list(raw.calendar?.inactive_periods ?? raw.calendar?.inactivePeriods, "calendar.inactive_periods")
    .map((item, index) => normalizeInactivePeriod(item, `calendar.inactive_periods[${index}]`));
  unique(exceptions, "id", "calendar.exceptions");
  unique(exceptions, "date", "calendar.exceptions");
  unique(inactivePeriods, "id", "calendar.inactive_periods");

  const periods = list(raw.periods, "periods").map((value, index) => {
    const path = `periods[${index}]`;
    const start = iso(value?.start, `${path}.start`);
    const end = iso(value?.end, `${path}.end`);
    if (compareDate(start, end) > 0) fail(path, "start no puede ser posterior a end");
    return { id: identifier(value?.id, `${path}.id`), name: text(value?.name, `${path}.name`), start, end, images: periodImages(value?.images, `${path}.images`) };
  });
  if (!periods.length) fail("periods", "debe contener al menos un periodo");
  unique(periods, "id", "periods");
  const ordered = [...periods].sort((a, b) => compareDate(a.start, b.start));
  for (let index = 1; index < ordered.length; index += 1) {
    if (compareDate(ordered[index - 1].end, ordered[index].start) >= 0) fail("periods", `${ordered[index - 1].id} y ${ordered[index].id} se solapan`);
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
  return image ? { ...(image.asset ? { asset: image.asset } : { src: image.src }), ...(image.alt ? { alt: image.alt } : {}), ...(image.fit !== "contain" ? { fit: image.fit } : {}) } : undefined;
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
  if (oldConfig?.version !== 3) fail("version", "solo se puede migrar una configuración v3");
  const activeWeekdays = WEEKDAYS.filter(day => !Object.prototype.hasOwnProperty.call(oldConfig.calendar?.inactiveWeekdays ?? {}, day));
  const inactiveVertical = legacyImage(oldConfig.calendar?.inactive?.defaultImage ?? oldConfig.states?.noClassTodayVertical, "calendar.inactive.default_image");
  const inactiveHorizontal = legacyImage(oldConfig.states?.vacationsHorizontal ?? inactiveVertical, "states.vacations");
  if (!inactiveVertical || !inactiveHorizontal) fail("migration", "faltan imágenes inactivas");
  const exceptions = [];
  const usedDates = new Set();
  const addException = (entry, state, kind, prefix) => {
    if (!entry?.date || usedDates.has(entry.date)) return;
    usedDates.add(entry.date);
    const image = state === "inactive" && entry.image ? legacyImage(entry.image, `${prefix}.${entry.date}.image`) : null;
    exceptions.push({ id: `${prefix}-${entry.date}`, date: entry.date, name: entry.label || (state === "active" ? "Día activo" : "Día inactivo"), state, kind, images: image ? { vertical: image, horizontal: image } : {} });
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
      if (!term) fail("migration", `no existe ${range.termId}`);
      const days = {};
      for (const weekday of activeWeekdays) {
        const descriptor = term.content?.days?.[weekday] ?? term.assets?.days?.[weekday];
        if (!descriptor) fail("migration", `${term.displayName ?? term.id} depende del horario estructurado para ${weekday}`);
        days[weekday] = legacyImage(descriptor, `term.${term.id}.days.${weekday}`);
      }
      const horizontal = term.content?.week ?? term.assets?.week;
      if (!horizontal) fail("migration", `${term.displayName ?? term.id} depende del horario estructurado horizontal`);
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
  if (!USER_IMAGE_MIME_TYPES.has(mime)) fail(path, "solo admite PNG, JPEG, WebP, AVIF o GIF; SVG no está permitido");
  return record;
}
