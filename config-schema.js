const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const IMAGE_FITS = new Set(["contain", "cover", "fill", "none", "scale-down"]);
const RANGE_TYPES = new Set(["day", "week", "month", "year", "rolling", "relative", "interval"]);
const RENDERER_TYPES = new Set(["timetable", "image"]);
const RULE_CONTENT_TYPES = new Set(["image", "inactive-image", "current-term-schedule", "next-term-schedule", "term-schedule"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class ConfigValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ConfigValidationError";
    this.path = path;
    this.detail = message;
  }
}

function fail(path, message) {
  throw new ConfigValidationError(path, message);
}

function clone(value) {
  return structuredClone(value);
}

function dateValue(value, path) {
  if (typeof value !== "string" || !DATE_RE.test(value)) fail(path, "debe ser una fecha ISO YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) fail(path, `fecha inválida ${JSON.stringify(value)}`);
  return value;
}

function timeValue(value, path) {
  if (typeof value !== "string" || !TIME_RE.test(value)) fail(path, "debe tener formato HH:MM");
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) fail(path, `hora inválida ${JSON.stringify(value)}`);
  return value;
}

function listish(value, path) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(path, "debe ser una lista");
  return value;
}

function sourceIdentity(image) {
  return image?.asset ? `asset:${image.asset}` : image?.src ? `src:${image.src}` : null;
}

export function normalizeImageDescriptor(value, path = "image", { defaultAlt = null, defaultFit = "contain" } = {}) {
  if (typeof value === "string") value = { src: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser una ruta o un descriptor de imagen");
  if ((value.type ?? "image") !== "image") fail(`${path}.type`, "debe ser 'image'");

  const hasSrc = typeof value.src === "string" && Boolean(value.src.trim());
  const hasAsset = typeof value.asset === "string" && Boolean(value.asset.trim());
  if (hasSrc === hasAsset) fail(path, "image requiere exactamente uno de src o asset");

  const fit = value.fit ?? defaultFit;
  if (!IMAGE_FITS.has(fit)) fail(`${path}.fit`, `valor desconocido ${JSON.stringify(fit)}`);
  const alt = value.alt ?? defaultAlt;
  if (alt != null && typeof alt !== "string") fail(`${path}.alt`, "debe ser texto");

  return {
    type: "image",
    ...(hasSrc ? { src: value.src } : { asset: value.asset }),
    fit,
    alt
  };
}

function normalizeRange(value, path, defaults) {
  if (typeof value === "string") value = { type: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un nombre de rango o un mapping");
  const type = value.type;
  if (!RANGE_TYPES.has(type)) fail(`${path}.type`, `valor desconocido ${JSON.stringify(type)}`);
  const result = { type };

  if (type === "week") {
    const startsOn = value.starts_on ?? value.startsOn ?? defaults.week_starts_on ?? "monday";
    if (!WEEKDAYS.includes(startsOn)) fail(`${path}.starts_on`, `weekday desconocido ${JSON.stringify(startsOn)}`);
    result.startsOn = startsOn;
  } else if (type === "relative" || type === "rolling") {
    if ("before" in value || "after" in value) {
      const before = value.before ?? 0;
      const after = value.after ?? 0;
      if (!Number.isInteger(before) || before < 0) fail(`${path}.before`, "debe ser un entero >= 0");
      if (!Number.isInteger(after) || after < 0) fail(`${path}.after`, "debe ser un entero >= 0");
      Object.assign(result, { before, after });
    } else {
      const days = value.days;
      if (!Number.isInteger(days) || days < 1) fail(`${path}.days`, "debe ser un entero >= 1");
      const anchorPosition = value.anchor_position ?? value.anchorPosition ?? "start";
      if (!new Set(["start", "center", "end"]).has(anchorPosition)) fail(`${path}.anchor_position`, "debe ser start, center o end");
      Object.assign(result, { days, anchorPosition });
    }
  } else if (type === "interval") {
    const start = dateValue(value.start, `${path}.start`);
    const end = dateValue(value.end, `${path}.end`);
    if (start > end) fail(path, "start no puede ser posterior a end");
    Object.assign(result, { start, end });
  }
  return result;
}

function normalizeWhen(value, path) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const result = {};
  if (value.orientation != null) {
    if (!["portrait", "landscape", "any"].includes(value.orientation)) fail(`${path}.orientation`, "debe ser portrait, landscape o any");
    result.orientation = value.orientation;
  }
  if (value.pointer != null) {
    if (!["coarse", "fine", "any"].includes(value.pointer)) fail(`${path}.pointer`, "debe ser coarse, fine o any");
    result.pointer = value.pointer;
  }
  for (const [source, target] of [["min_width", "minWidth"], ["max_width", "maxWidth"], ["min_height", "minHeight"], ["max_height", "maxHeight"]]) {
    const raw = value[source] ?? value[target];
    if (raw != null) {
      if (!Number.isInteger(raw) || raw < 0) fail(`${path}.${source}`, "debe ser un entero >= 0");
      result[target] = raw;
    }
  }
  return result;
}

function normalizeDateEntry(value, path, type = null) {
  if (typeof value === "string") value = { date: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser una fecha o un mapping");
  const result = { date: dateValue(value.date, `${path}.date`) };
  if (value.label != null) {
    if (typeof value.label !== "string") fail(`${path}.label`, "debe ser texto");
    result.label = value.label;
  }
  if (type) result.type = type;
  if (value.image != null) result.image = normalizeImageDescriptor(value.image, `${path}.image`, { defaultAlt: result.label });
  return result;
}

function normalizeInactiveWeekdays(value, path) {
  const result = {};
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const weekday = value[index];
      if (!WEEKDAYS.includes(weekday)) fail(`${path}[${index}]`, `weekday desconocido ${JSON.stringify(weekday)}`);
      if (weekday in result) fail(path, `weekday duplicado ${JSON.stringify(weekday)}`);
      result[weekday] = {};
    }
    return result;
  }
  if (!value || typeof value !== "object") fail(path, "debe ser una lista o un mapping");
  for (const [weekday, rawOptions] of Object.entries(value)) {
    if (!WEEKDAYS.includes(weekday)) fail(`${path}.${weekday}`, `weekday desconocido ${JSON.stringify(weekday)}`);
    const options = rawOptions ?? {};
    if (typeof options !== "object" || Array.isArray(options)) fail(`${path}.${weekday}`, "debe ser un mapping");
    result[weekday] = {};
    if (options.image != null) result[weekday].image = normalizeImageDescriptor(options.image, `${path}.${weekday}.image`, { defaultAlt: weekday });
  }
  return result;
}

function normalizePeriod(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  if (typeof value.id !== "string" || !value.id) fail(`${path}.id`, "es obligatorio");
  const type = value.type ?? "custom";
  if (!["vacation", "non-teaching", "custom"].includes(type)) fail(`${path}.type`, `tipo desconocido ${JSON.stringify(type)}`);
  const start = dateValue(value.start, `${path}.start`);
  const end = dateValue(value.end, `${path}.end`);
  if (start > end) fail(path, "start no puede ser posterior a end");
  const priority = value.priority ?? 0;
  if (!Number.isInteger(priority)) fail(`${path}.priority`, "debe ser un entero");
  const result = { id: value.id, type, start, end, priority };
  if (value.label != null) {
    if (typeof value.label !== "string") fail(`${path}.label`, "debe ser texto");
    result.label = value.label;
  }
  if (value.image != null) result.image = normalizeImageDescriptor(value.image, `${path}.image`, { defaultAlt: result.label });
  return result;
}

function checkPeriodAmbiguity(periods, path) {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      const left = periods[i];
      const right = periods[j];
      const overlaps = left.start <= right.end && right.start <= left.end;
      if (!overlaps || left.priority !== right.priority) continue;
      if (left.image && right.image && sourceIdentity(left.image) !== sourceIdentity(right.image)) {
        fail(path, `periodos ${JSON.stringify(left.id)} y ${JSON.stringify(right.id)} se solapan con igual prioridad e imágenes distintas`);
      }
    }
  }
}

function checkUniqueDates(entries, path) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.date)) fail(path, `fecha duplicada ${entry.date}`);
    seen.add(entry.date);
  }
}

function normalizeSubjects(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) fail(path, "debe contener asignaturas");
  const result = {};
  for (const [key, subject] of Object.entries(value)) {
    if (!subject || typeof subject !== "object" || Array.isArray(subject)) fail(`${path}.${key}`, "debe ser un mapping");
    for (const required of ["name", "short", "group", "room", "fill", "accent"]) {
      if (typeof subject[required] !== "string" || !subject[required]) fail(`${path}.${key}.${required}`, "es obligatorio");
    }
    result[key] = clone(subject);
  }
  return result;
}

function normalizeSessions(value, path, subjects) {
  const sessions = listish(value, path);
  if (!sessions.length) fail(path, "debe contener al menos una sesión");
  const result = [];
  const byDay = new Map();
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const itemPath = `${path}[${index}]`;
    if (!session || typeof session !== "object" || Array.isArray(session)) fail(itemPath, "debe ser un mapping");
    if (!WEEKDAYS.includes(session.day)) fail(`${itemPath}.day`, `weekday desconocido ${JSON.stringify(session.day)}`);
    const start = timeValue(session.start, `${itemPath}.start`);
    const end = timeValue(session.end, `${itemPath}.end`);
    if (start >= end) fail(itemPath, "start debe ser anterior a end");
    if (!(session.subject in subjects)) fail(`${itemPath}.subject`, `asignatura desconocida ${JSON.stringify(session.subject)}`);
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
    const previous = byDay.get(session.day) ?? [];
    for (const other of previous) {
      if (startMinutes < other.end && other.start < endMinutes) fail(itemPath, `se solapa con ${other.subject} el ${session.day}`);
    }
    previous.push({ start: startMinutes, end: endMinutes, subject: session.subject });
    byDay.set(session.day, previous);
    result.push({ day: session.day, start, end, subject: session.subject });
  }
  return result;
}

function normalizeTermContent(value, path) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const result = {};
  if (value.week != null) result.week = normalizeImageDescriptor(value.week, `${path}.week`);
  if (value.days != null) {
    if (typeof value.days !== "object" || Array.isArray(value.days)) fail(`${path}.days`, "debe ser un mapping");
    result.days = {};
    for (const [weekday, descriptor] of Object.entries(value.days)) {
      if (!WEEKDAYS.includes(weekday)) fail(`${path}.days.${weekday}`, "weekday desconocido");
      result.days[weekday] = normalizeImageDescriptor(descriptor, `${path}.days.${weekday}`);
    }
  }
  if (value.views != null) {
    if (typeof value.views !== "object" || Array.isArray(value.views)) fail(`${path}.views`, "debe ser un mapping");
    result.views = Object.fromEntries(Object.entries(value.views).map(([key, descriptor]) => [key, normalizeImageDescriptor(descriptor, `${path}.views.${key}`)]));
  }
  return result;
}

function normalizeRuleWhen(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const result = {};
  for (const [source, target] of [["view", "view"], ["calendar_status", "calendarStatus"], ["weekday", "weekday"], ["term", "term"]]) {
    const internal = value[target];
    if (value[source] == null && internal == null) continue;
    let raw = value[source] ?? internal;
    if (typeof raw === "string") raw = [raw];
    if (!Array.isArray(raw) || !raw.length || !raw.every((item) => typeof item === "string")) fail(`${path}.${source}`, "debe ser texto o una lista no vacía");
    if (source === "weekday" && raw.some((item) => !WEEKDAYS.includes(item))) fail(`${path}.${source}`, "weekday desconocido");
    result[target] = raw;
  }
  if (value.date != null) result.date = dateValue(value.date, `${path}.date`);
  const dateRange = value.date_range ?? value.dateRange;
  if (dateRange != null) {
    if (typeof dateRange !== "object" || Array.isArray(dateRange)) fail(`${path}.date_range`, "debe ser un mapping");
    const start = dateValue(dateRange.start, `${path}.date_range.start`);
    const end = dateValue(dateRange.end, `${path}.date_range.end`);
    if (start > end) fail(`${path}.date_range`, "start no puede ser posterior a end");
    result.dateRange = { start, end };
  }
  return result;
}

function normalizeRuleContent(value, path, defaults) {
  if (typeof value === "string") value = { type: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  if (!RULE_CONTENT_TYPES.has(value.type)) fail(`${path}.type`, `tipo desconocido ${JSON.stringify(value.type)}`);
  if (value.type === "image") return normalizeImageDescriptor(value, path);
  const result = { type: value.type };
  if (value.type === "term-schedule") {
    const academicYear = value.academic_year ?? value.academicYear;
    if (typeof academicYear !== "string" || !academicYear) fail(`${path}.academic_year`, "es obligatorio");
    if (typeof value.term !== "string" || !value.term) fail(`${path}.term`, "es obligatorio");
    Object.assign(result, { academicYear, term: value.term });
  }
  if (value.range != null) result.range = normalizeRange(value.range, `${path}.range`, defaults);
  return result;
}

function normalizeTermAssets(value, path) {
  if (value == null) return { week: null, days: {} };
  if (typeof value !== "object" || Array.isArray(value)) fail(path, "debe ser un mapping");
  const week = value.week ?? null;
  if (week != null && (typeof week !== "string" || !week)) fail(`${path}.week`, "debe ser una ruta no vacía");
  const daysRaw = value.days ?? {};
  if (typeof daysRaw !== "object" || Array.isArray(daysRaw)) fail(`${path}.days`, "debe ser un mapping");
  const days = {};
  for (const [weekday, route] of Object.entries(daysRaw)) {
    if (!WEEKDAYS.includes(weekday)) fail(`${path}.days.${weekday}`, "weekday desconocido");
    if (typeof route !== "string" || !route) fail(`${path}.days.${weekday}`, "debe ser una ruta no vacía");
    days[weekday] = route;
  }
  return { week, days };
}

export function compileSourceConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("config", "la raíz debe ser un mapping");
  if (raw.version !== 3) fail("version", "Schedule Viewer v3 requiere version: 3");

  const appRaw = raw.app;
  if (!appRaw || typeof appRaw !== "object") fail("app", "es obligatorio");
  const title = appRaw.title ?? "Schedule Viewer";
  const timezone = appRaw.timezone;
  if (typeof title !== "string" || !title) fail("app.title", "es obligatorio");
  if (typeof timezone !== "string" || !timezone) fail("app.timezone", "es obligatorio");

  const defaultsRaw = raw.defaults ?? {};
  if (typeof defaultsRaw !== "object" || Array.isArray(defaultsRaw)) fail("defaults", "debe ser un mapping");
  const weekStartsOn = defaultsRaw.week_starts_on ?? defaultsRaw.weekStartsOn ?? "monday";
  if (!WEEKDAYS.includes(weekStartsOn)) fail("defaults.week_starts_on", `weekday desconocido ${JSON.stringify(weekStartsOn)}`);
  const imageFit = defaultsRaw.image_fit ?? defaultsRaw.imageFit ?? "contain";
  if (!IMAGE_FITS.has(imageFit)) fail("defaults.image_fit", `valor desconocido ${JSON.stringify(imageFit)}`);
  const defaults = { week_starts_on: weekStartsOn, image_fit: imageFit };

  const runtimeRaw = raw.runtime ?? {};
  if (typeof runtimeRaw !== "object" || Array.isArray(runtimeRaw)) fail("runtime", "debe ser un mapping");
  const runtime = {
    allowDateOverride: Boolean(runtimeRaw.allow_date_override ?? runtimeRaw.allowDateOverride ?? true),
    demo: Boolean(runtimeRaw.demo ?? false)
  };

  const visual = clone(raw.visual ?? {});
  if (typeof visual !== "object" || Array.isArray(visual)) fail("visual", "debe ser un mapping");

  const statesRaw = raw.states ?? {};
  if (typeof statesRaw !== "object" || Array.isArray(statesRaw)) fail("states", "debe ser un mapping");
  const inactiveState = statesRaw.inactive_default ?? statesRaw.noClassTodayVertical ?? "assets/states/no-class-today-vertical.webp";
  const vacationsState = statesRaw.vacations ?? statesRaw.vacationsHorizontal ?? "assets/states/vacations-horizontal.webp";
  if (typeof inactiveState !== "string" || !inactiveState) fail("states.inactive_default", "es obligatorio");
  if (typeof vacationsState !== "string" || !vacationsState) fail("states.vacations", "es obligatorio");

  const calendarRaw = raw.calendar;
  if (!calendarRaw || typeof calendarRaw !== "object" || Array.isArray(calendarRaw)) fail("calendar", "es obligatorio");
  const inactiveRaw = calendarRaw.inactive;
  const defaultImageRaw = inactiveRaw?.default_image ?? inactiveRaw?.defaultImage;
  if (!defaultImageRaw) fail("calendar.inactive.default_image", "es obligatorio");
  const calendar = {
    inactive: { defaultImage: normalizeImageDescriptor(defaultImageRaw, "calendar.inactive.default_image", { defaultAlt: "Día inactivo", defaultFit: imageFit }) },
    inactiveWeekdays: normalizeInactiveWeekdays(calendarRaw.inactive_weekdays ?? calendarRaw.inactiveWeekdays ?? [], "calendar.inactive_weekdays"),
    activeDates: listish(calendarRaw.active_dates ?? calendarRaw.activeDates ?? [], "calendar.active_dates").map((item, index) => normalizeDateEntry(item, `calendar.active_dates[${index}]`)),
    inactiveDates: listish(calendarRaw.inactive_dates ?? calendarRaw.inactiveDates ?? [], "calendar.inactive_dates").map((item, index) => normalizeDateEntry(item, `calendar.inactive_dates[${index}]`))
  };
  checkUniqueDates(calendar.activeDates, "calendar.active_dates");
  checkUniqueDates(calendar.inactiveDates, "calendar.inactive_dates");

  const viewsRaw = raw.views;
  if (!viewsRaw || typeof viewsRaw !== "object" || Array.isArray(viewsRaw) || !Object.keys(viewsRaw).length) fail("views", "debe contener al menos una vista");
  const views = {};
  Object.entries(viewsRaw).forEach(([id, view], order) => {
    const path = `views.${id}`;
    if (!view || typeof view !== "object" || Array.isArray(view)) fail(path, "debe ser un mapping");
    const priority = view.priority ?? 0;
    if (!Number.isInteger(priority)) fail(`${path}.priority`, "debe ser un entero");
    if (view.range == null) fail(`${path}.range`, "es obligatorio");
    let renderer = view.renderer;
    if (typeof renderer === "string") renderer = { type: renderer };
    if (!renderer || typeof renderer !== "object" || Array.isArray(renderer)) fail(`${path}.renderer`, "es obligatorio");
    if (!RENDERER_TYPES.has(renderer.type)) fail(`${path}.renderer.type`, `renderer desconocido ${JSON.stringify(renderer.type)}`);
    const artwork = renderer.artwork ?? "asset";
    if (!["phone", "asset", "auto"].includes(artwork)) fail(`${path}.renderer.artwork`, "debe ser phone, asset o auto");
    views[id] = {
      id,
      priority,
      order,
      manualOnly: Boolean(view.manual_only ?? view.manualOnly ?? false),
      when: normalizeWhen(view.when, `${path}.when`),
      range: normalizeRange(view.range, `${path}.range`, defaults),
      renderer: { type: renderer.type, artwork }
    };
  });

  const desktopRaw = raw.desktop ?? {};
  if (typeof desktopRaw !== "object" || Array.isArray(desktopRaw)) fail("desktop", "debe ser un mapping");
  const primaryView = desktopRaw.primary_view ?? desktopRaw.primaryView;
  const secondaryView = desktopRaw.secondary_view ?? desktopRaw.secondaryView;
  const defaultView = desktopRaw.default_view ?? desktopRaw.defaultView ?? primaryView;
  for (const [key, value] of [["primary_view", primaryView], ["secondary_view", secondaryView], ["default_view", defaultView]]) {
    if (!(value in views)) fail(`desktop.${key}`, `vista inexistente ${JSON.stringify(value)}`);
  }
  const shortcutsRaw = desktopRaw.shortcuts ?? {};
  const toggleRaw = shortcutsRaw.toggle_view ?? shortcutsRaw.toggleView ?? { key: "Space", enabled: true };
  if (!toggleRaw || typeof toggleRaw !== "object" || typeof toggleRaw.key !== "string" || !toggleRaw.key) fail("desktop.shortcuts.toggle_view.key", "es obligatorio");
  const desktop = {
    when: normalizeWhen(desktopRaw.when, "desktop.when"),
    primaryView,
    secondaryView,
    defaultView,
    shortcuts: { toggleView: { key: toggleRaw.key, enabled: toggleRaw.enabled !== false } }
  };

  const academicRaw = raw.academic_years ?? raw.academicYears;
  if (!Array.isArray(academicRaw) || !academicRaw.length) fail("academic_years", "debe contener al menos un curso");
  const academicYears = [];
  const seenYears = new Set();
  academicRaw.forEach((year, yearIndex) => {
    const path = `academic_years[${yearIndex}]`;
    if (!year || typeof year !== "object" || Array.isArray(year)) fail(path, "debe ser un mapping");
    if (typeof year.id !== "string" || !year.id) fail(`${path}.id`, "es obligatorio");
    if (seenYears.has(year.id)) fail(`${path}.id`, `id duplicado ${JSON.stringify(year.id)}`);
    seenYears.add(year.id);
    const displayName = year.display_name ?? year.displayName ?? year.id;
    if (typeof displayName !== "string") fail(`${path}.display_name`, "debe ser texto");
    const calRaw = year.calendar ?? {};
    if (typeof calRaw !== "object" || Array.isArray(calRaw)) fail(`${path}.calendar`, "debe ser un mapping");
    const termRanges = listish(calRaw.terms, `${path}.calendar.terms`).map((item, index) => {
      const itemPath = `${path}.calendar.terms[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) fail(itemPath, "debe ser un mapping");
      const termId = item.term_id ?? item.termId;
      if (typeof termId !== "string" || !termId) fail(`${itemPath}.term_id`, "es obligatorio");
      const start = dateValue(item.start, `${itemPath}.start`);
      const end = dateValue(item.end, `${itemPath}.end`);
      if (start > end) fail(itemPath, "start no puede ser posterior a end");
      return { termId, start, end };
    });
    const orderedRanges = [...termRanges].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < orderedRanges.length; i += 1) {
      if (orderedRanges[i - 1].end >= orderedRanges[i].start) fail(`${path}.calendar.terms`, "los términos no pueden solaparse");
    }
    const holidays = listish(calRaw.holidays ?? [], `${path}.calendar.holidays`).map((item, index) => normalizeDateEntry(item, `${path}.calendar.holidays[${index}]`, "holiday"));
    const inactiveDates = listish(calRaw.inactive_dates ?? calRaw.inactiveDates ?? [], `${path}.calendar.inactive_dates`).map((item, index) => normalizeDateEntry(item, `${path}.calendar.inactive_dates[${index}]`, "non-teaching"));
    checkUniqueDates(holidays, `${path}.calendar.holidays`);
    checkUniqueDates(inactiveDates, `${path}.calendar.inactive_dates`);
    const periods = listish(calRaw.periods ?? [], `${path}.calendar.periods`).map((item, index) => normalizePeriod(item, `${path}.calendar.periods[${index}]`));
    checkPeriodAmbiguity(periods, `${path}.calendar.periods`);

    const termsRaw = year.terms;
    if (!Array.isArray(termsRaw) || !termsRaw.length) fail(`${path}.terms`, "debe contener horarios");
    const terms = [];
    const seenTerms = new Set();
    termsRaw.forEach((term, termIndex) => {
      const termPath = `${path}.terms[${termIndex}]`;
      if (!term || typeof term !== "object" || Array.isArray(term)) fail(termPath, "debe ser un mapping");
      if (typeof term.id !== "string" || !term.id) fail(`${termPath}.id`, "es obligatorio");
      if (seenTerms.has(term.id)) fail(`${termPath}.id`, `id duplicado ${JSON.stringify(term.id)}`);
      seenTerms.add(term.id);
      const subjects = normalizeSubjects(term.subjects, `${termPath}.subjects`);
      terms.push({
        id: term.id,
        displayName: term.display_name ?? term.displayName ?? term.id,
        subtitle: term.subtitle ?? "",
        assets: normalizeTermAssets(term.assets, `${termPath}.assets`),
        content: normalizeTermContent(term.content, `${termPath}.content`),
        subjects,
        sessions: normalizeSessions(term.sessions, `${termPath}.sessions`, subjects)
      });
    });
    const calendarIds = new Set(termRanges.map((item) => item.termId));
    const scheduleIds = new Set(terms.map((item) => item.id));
    if (calendarIds.size !== scheduleIds.size || [...calendarIds].some((id) => !scheduleIds.has(id))) fail(`${path}.calendar.terms`, "ids de calendario no coinciden con horarios");
    academicYears.push({
      id: year.id,
      displayName,
      calendar: { sources: clone(calRaw.sources ?? {}), terms: termRanges, holidays, inactiveDates, periods },
      terms
    });
  });

  const rules = listish(raw.rules ?? [], "rules").map((rule, index) => {
    const path = `rules[${index}]`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) fail(path, "debe ser un mapping");
    const priority = rule.priority ?? 0;
    if (!Number.isInteger(priority)) fail(`${path}.priority`, "debe ser un entero");
    const when = normalizeRuleWhen(rule.when, `${path}.when`);
    for (const viewId of when.view ?? []) if (!(viewId in views)) fail(`${path}.when.view`, `vista inexistente ${JSON.stringify(viewId)}`);
    const content = normalizeRuleContent(rule.content, `${path}.content`, defaults);
    if (content.type === "term-schedule") {
      const year = academicYears.find((item) => item.id === content.academicYear);
      if (!year) fail(`${path}.content.academic_year`, `curso inexistente ${JSON.stringify(content.academicYear)}`);
      if (!year.terms.some((term) => term.id === content.term)) fail(`${path}.content.term`, `término inexistente ${JSON.stringify(content.term)}`);
    }
    return { priority, order: index, when, content };
  });

  return {
    version: 3,
    app: { title, timezone },
    timezone,
    defaults: { weekStartsOn, imageFit },
    runtime,
    visual,
    states: { noClassTodayVertical: inactiveState, vacationsHorizontal: vacationsState },
    calendar,
    views,
    desktop,
    rules,
    academicYears
  };
}

function sourceImage(image, { includeType = false } = {}) {
  if (!image) return null;
  const result = {
    ...(includeType ? { type: "image" } : {}),
    ...(image.asset ? { asset: image.asset } : { src: image.src }),
    ...(image.alt != null ? { alt: image.alt } : {}),
    ...(image.fit && image.fit !== "contain" ? { fit: image.fit } : {})
  };
  return result;
}

function sourceRange(range) {
  if (!range) return "day";
  if (["day", "month", "year"].includes(range.type)) return range.type;
  const result = { type: range.type };
  if (range.type === "week") result.starts_on = range.startsOn ?? "monday";
  if (["relative", "rolling"].includes(range.type)) {
    if (range.before != null || range.after != null) {
      result.before = range.before ?? 0;
      result.after = range.after ?? 0;
    } else {
      result.days = range.days;
      result.anchor_position = range.anchorPosition ?? "start";
    }
  }
  if (range.type === "interval") Object.assign(result, { start: range.start, end: range.end });
  return result;
}

function sourceWhen(when = {}) {
  const result = {};
  if (when.orientation) result.orientation = when.orientation;
  if (when.pointer) result.pointer = when.pointer;
  if (when.minWidth != null) result.min_width = when.minWidth;
  if (when.maxWidth != null) result.max_width = when.maxWidth;
  if (when.minHeight != null) result.min_height = when.minHeight;
  if (when.maxHeight != null) result.max_height = when.maxHeight;
  return result;
}

function sourceDateEntry(entry) {
  return {
    date: entry.date,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.image ? { image: sourceImage(entry.image) } : {})
  };
}

function sourcePeriod(period) {
  return {
    id: period.id,
    type: period.type,
    ...(period.label ? { label: period.label } : {}),
    start: period.start,
    end: period.end,
    ...(period.priority ? { priority: period.priority } : {}),
    ...(period.image ? { image: sourceImage(period.image) } : {})
  };
}

function sourceRuleWhen(when = {}) {
  const result = {};
  if (when.view) result.view = when.view.length === 1 ? when.view[0] : [...when.view];
  if (when.calendarStatus) result.calendar_status = when.calendarStatus.length === 1 ? when.calendarStatus[0] : [...when.calendarStatus];
  if (when.weekday) result.weekday = when.weekday.length === 1 ? when.weekday[0] : [...when.weekday];
  if (when.term) result.term = when.term.length === 1 ? when.term[0] : [...when.term];
  if (when.date) result.date = when.date;
  if (when.dateRange) result.date_range = clone(when.dateRange);
  return result;
}

function sourceRuleContent(content) {
  if (content.type === "image") return sourceImage(content, { includeType: true });
  const result = { type: content.type };
  if (content.type === "term-schedule") {
    result.academic_year = content.academicYear;
    result.term = content.term;
  }
  if (content.range) result.range = sourceRange(content.range);
  return result;
}

export function decompileConfig(config) {
  const inactiveEntries = Object.entries(config.calendar?.inactiveWeekdays ?? {});
  const hasWeekdayImages = inactiveEntries.some(([, options]) => options?.image);
  const inactiveWeekdays = hasWeekdayImages
    ? Object.fromEntries(inactiveEntries.map(([weekday, options]) => [weekday, options?.image ? { image: sourceImage(options.image) } : {}]))
    : inactiveEntries.map(([weekday]) => weekday);

  const views = Object.fromEntries(Object.entries(config.views ?? {}).map(([id, view]) => [id, {
    ...(view.priority ? { priority: view.priority } : {}),
    ...(view.manualOnly ? { manual_only: true } : {}),
    ...(Object.keys(sourceWhen(view.when)).length ? { when: sourceWhen(view.when) } : {}),
    range: sourceRange(view.range),
    renderer: clone(view.renderer)
  }]));

  const academicYears = (config.academicYears ?? []).map((year) => ({
    id: year.id,
    display_name: year.displayName,
    calendar: {
      ...(Object.keys(year.calendar?.sources ?? {}).length ? { sources: clone(year.calendar.sources) } : {}),
      terms: (year.calendar?.terms ?? []).map((term) => ({ term_id: term.termId, start: term.start, end: term.end })),
      holidays: (year.calendar?.holidays ?? []).map(sourceDateEntry),
      inactive_dates: (year.calendar?.inactiveDates ?? []).map(sourceDateEntry),
      periods: (year.calendar?.periods ?? []).map(sourcePeriod)
    },
    terms: (year.terms ?? []).map((term) => ({
      id: term.id,
      display_name: term.displayName,
      subtitle: term.subtitle,
      ...((term.assets?.week || Object.keys(term.assets?.days ?? {}).length) ? { assets: { ...(term.assets?.week ? { week: term.assets.week } : {}), ...(Object.keys(term.assets?.days ?? {}).length ? { days: clone(term.assets.days) } : {}) } } : {}),
      ...(Object.keys(term.content ?? {}).length ? { content: {
        ...(term.content.week ? { week: sourceImage(term.content.week) } : {}),
        ...(term.content.days ? { days: Object.fromEntries(Object.entries(term.content.days).map(([day, image]) => [day, sourceImage(image)])) } : {}),
        ...(term.content.views ? { views: Object.fromEntries(Object.entries(term.content.views).map(([view, image]) => [view, sourceImage(image)])) } : {})
      } } : {}),
      subjects: clone(term.subjects),
      sessions: clone(term.sessions)
    }))
  }));

  return {
    version: 3,
    app: clone(config.app),
    defaults: { week_starts_on: config.defaults?.weekStartsOn ?? "monday", image_fit: config.defaults?.imageFit ?? "contain" },
    runtime: { allow_date_override: config.runtime?.allowDateOverride !== false, ...(config.runtime?.demo ? { demo: true } : {}) },
    visual: clone(config.visual ?? {}),
    states: {
      inactive_default: config.states?.noClassTodayVertical ?? "assets/states/no-class-today-vertical.webp",
      vacations: config.states?.vacationsHorizontal ?? "assets/states/vacations-horizontal.webp"
    },
    calendar: {
      inactive: { default_image: sourceImage(config.calendar?.inactive?.defaultImage) },
      inactive_weekdays: inactiveWeekdays,
      active_dates: (config.calendar?.activeDates ?? []).map(sourceDateEntry),
      inactive_dates: (config.calendar?.inactiveDates ?? []).map(sourceDateEntry)
    },
    views,
    desktop: {
      ...(Object.keys(sourceWhen(config.desktop?.when)).length ? { when: sourceWhen(config.desktop.when) } : {}),
      primary_view: config.desktop?.primaryView,
      secondary_view: config.desktop?.secondaryView,
      default_view: config.desktop?.defaultView,
      shortcuts: { toggle_view: { key: config.desktop?.shortcuts?.toggleView?.key ?? "Space", enabled: config.desktop?.shortcuts?.toggleView?.enabled !== false } }
    },
    academic_years: academicYears,
    rules: (config.rules ?? []).map((rule) => ({ priority: rule.priority ?? 0, when: sourceRuleWhen(rule.when), content: sourceRuleContent(rule.content) }))
  };
}

export function collectAssetIds(node) {
  const ids = new Set();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    if (value.type === "image" && typeof value.asset === "string" && value.asset) ids.add(value.asset);
    Object.values(value).forEach(visit);
  };
  visit(node);
  return [...ids];
}

export { WEEKDAYS, RANGE_TYPES };
