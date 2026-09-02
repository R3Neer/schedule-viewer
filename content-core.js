import { dayKeyFromIso, inRange } from "./date-core.js";
import {
  calendarTermFor, combinedTerm, evaluateDate, findNextTerm
} from "./calendar-core.js";
import { resolveRange } from "./range-core.js";
import { selectViewProfile } from "./view-core.js";

const IMAGE_FITS = new Set(["contain", "cover", "fill", "none", "scale-down"]);

export function normalizeContentDescriptor(descriptor, defaults = {}) {
  if (descriptor == null) return null;
  if (typeof descriptor === "string") descriptor = { type: "image", src: descriptor };
  if (typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw new TypeError("El contenido debe ser una cadena o un objeto.");
  }
  if (descriptor.type !== "image") {
    throw new TypeError(`Tipo de contenido externo desconocido: ${descriptor.type ?? "(sin type)"}`);
  }
  if (typeof descriptor.src !== "string" || !descriptor.src) {
    throw new TypeError("El contenido image requiere src.");
  }
  const fit = descriptor.fit ?? defaults.fit ?? "contain";
  if (!IMAGE_FITS.has(fit)) throw new TypeError(`object-fit no soportado: ${fit}`);
  return {
    type: "image",
    src: descriptor.src,
    fit,
    alt: descriptor.alt ?? defaults.alt
  };
}

function imageFromEntry(entry, defaults = {}) {
  return entry?.image ? normalizeContentDescriptor(entry.image, defaults) : null;
}

export function resolveInactiveContent(config, evaluation) {
  const defaults = {
    fit: config.defaults?.imageFit ?? "contain",
    alt: evaluation.label ?? "Día inactivo"
  };
  const exact = imageFromEntry(evaluation.matches?.inactiveDate, defaults);
  if (exact) return { ...exact, source: "date" };
  const holiday = imageFromEntry(evaluation.matches?.holiday, defaults);
  if (holiday) return { ...holiday, source: "holiday" };
  const period = imageFromEntry(evaluation.matches?.period, defaults);
  if (period) return { ...period, source: `period:${evaluation.matches.period.id}` };
  const weekday = imageFromEntry(evaluation.matches?.inactiveWeekday, defaults);
  if (weekday) return { ...weekday, source: `weekday:${evaluation.weekday}` };

  const fallback = config.calendar?.inactive?.defaultImage;
  if (!fallback) throw new Error("Falta calendar.inactive.defaultImage.");
  return {
    ...normalizeContentDescriptor(fallback, defaults),
    source: "default"
  };
}

function valueMatches(expected, actual) {
  return !expected || expected.includes(actual);
}

export function ruleMatches(rule, context) {
  const when = rule.when ?? {};
  if (!valueMatches(when.view, context.viewId)) return false;
  if (!valueMatches(when.calendarStatus, context.evaluation.status)) return false;
  if (!valueMatches(when.weekday, context.evaluation.weekday)) return false;
  if (!valueMatches(when.term, context.evaluation.activeTerm?.term.id ?? null)) return false;
  if (when.date && when.date !== context.date) return false;
  if (when.dateRange && !inRange(context.date, when.dateRange.start, when.dateRange.end)) return false;
  return true;
}

export function selectRule(config, context) {
  return (config.rules ?? [])
    .filter((rule) => ruleMatches(rule, context))
    .sort((a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (a.order ?? 0) - (b.order ?? 0)
    )[0] ?? null;
}

function termContent(term, rangeType, day, viewId) {
  if (term.content?.views?.[viewId]) return normalizeContentDescriptor(term.content.views[viewId]);
  if (rangeType === "day" && term.content?.days?.[day]) {
    return normalizeContentDescriptor(term.content.days[day]);
  }
  if (rangeType === "week" && term.content?.week) {
    return normalizeContentDescriptor(term.content.week);
  }
  return null;
}

function generatedScheduleContent(term, rangeType, day) {
  let fallbackSrc = null;
  let generatedView = "range";
  if (rangeType === "day") {
    generatedView = "day";
    fallbackSrc = term.assets?.days?.[day] ?? null;
  } else if (rangeType === "week") {
    generatedView = "week";
    fallbackSrc = term.assets?.week ?? null;
  }
  return {
    type: "generated-schedule",
    view: generatedView,
    fallbackSrc,
    alt: null
  };
}

function selectionForTerm(academicYear, term, view, range, date, kindPrefix = null) {
  const day = dayKeyFromIso(date);
  const custom = termContent(term, range.type, day, view.id);
  const content = custom ?? generatedScheduleContent(term, range.type, day);
  const kind = kindPrefix ?? (
    range.type === "day" ? "day" :
    range.type === "week" ? "week" :
    "range"
  );
  const rangeLabel =
    range.type === "day" ? `horario del ${day}` :
    range.type === "week" ? "horario semanal" :
    `horario ${range.type} ${range.start}–${range.end}`;
  const alt = content.alt ?? `${term.displayName}, ${rangeLabel}`;

  return {
    kind,
    viewId: view.id,
    range,
    academicYearId: academicYear.id,
    termId: term.id,
    day: range.type === "day" ? day : null,
    alt,
    content: { ...content, alt }
  };
}

function resolveRuleSelection(config, rule, context) {
  const descriptor = rule.content;
  if (!descriptor) return null;

  if (descriptor.type === "image") {
    const content = normalizeContentDescriptor(descriptor, { alt: descriptor.alt });
    return {
      kind: context.evaluation.inactive ? "inactive" : "image",
      viewId: context.view.id,
      range: context.range,
      alt: content.alt ?? context.evaluation.label ?? "Imagen",
      content
    };
  }

  if (descriptor.type === "inactive-image") {
    const content = resolveInactiveContent(config, context.evaluation);
    return {
      kind: "inactive",
      viewId: context.view.id,
      range: context.range,
      alt: content.alt ?? context.evaluation.label ?? "Día inactivo",
      content
    };
  }

  let target = null;
  const targetRange = descriptor.range
    ? resolveRange(descriptor.range, context.date, config.defaults)
    : context.range;

  if (descriptor.type === "current-term-schedule") {
    target = context.evaluation.activeTerm;
    if (!target) return null;
  } else if (descriptor.type === "next-term-schedule") {
    target = findNextTerm(config, context.date);
    if (!target) return null;
  } else if (descriptor.type === "term-schedule") {
    const year = config.academicYears.find((item) => item.id === descriptor.academicYear);
    const calendarTerm = calendarTermFor(year, descriptor.term);
    const term = combinedTerm(year, calendarTerm);
    if (!year || !term) throw new Error(`No existe ${descriptor.academicYear}/${descriptor.term}.`);
    target = { academicYear: year, term };
  }

  if (!target) return null;
  const prefix =
    descriptor.type === "next-term-schedule" || descriptor.type === "term-schedule"
      ? targetRange.type === "week" ? "next-week" : "next-range"
      : null;

  return selectionForTerm(
    target.academicYear,
    target.term,
    context.view,
    targetRange,
    context.date,
    prefix
  );
}

export function selectScheduleContent(config, {
  date,
  viewport = { width: 1024, height: 768, pointer: "fine" },
  viewId = null,
  manualViewId = null
} = {}) {
  const view = viewId
    ? config.views?.[viewId]
    : selectViewProfile(config, { viewport, manualViewId });

  if (!view) throw new Error(`Vista inexistente: ${viewId}`);

  const range = resolveRange(view.range, date, config.defaults);
  const evaluation = evaluateDate(config, date);
  const context = { config, date, viewId: view.id, view, range, evaluation };
  const rule = selectRule(config, context);

  if (rule) {
    const ruled = resolveRuleSelection(config, rule, context);
    if (ruled) return { ...ruled, evaluation };
  }

  if (evaluation.inactive) {
    const content = resolveInactiveContent(config, evaluation);
    return {
      kind: "inactive",
      viewId: view.id,
      range,
      evaluation,
      alt: content.alt ?? evaluation.label ?? "Día inactivo",
      content
    };
  }

  if (evaluation.activeTerm) {
    return {
      ...selectionForTerm(
        evaluation.activeTerm.academicYear,
        evaluation.activeTerm.term,
        view,
        range,
        date
      ),
      evaluation
    };
  }

  const content = resolveInactiveContent(config, evaluation);
  return {
    kind: "inactive",
    viewId: view.id,
    range,
    evaluation,
    alt: content.alt ?? "Día inactivo",
    content
  };
}

export function selectScheduleAsset(config, options) {
  const selection = selectScheduleContent(config, options);
  const path = selection.content.type === "image"
    ? selection.content.src
    : selection.content.fallbackSrc;
  return { ...selection, path: path ?? null };
}

function collectImageDescriptor(paths, descriptor) {
  if (!descriptor) return;
  try {
    const content = normalizeContentDescriptor(descriptor);
    if (!/^(?:data|blob):/i.test(content.src)) paths.add(content.src);
  } catch {
    // Internal rule descriptors are not image descriptors.
  }
}

export function collectCustomContentAssetPaths(config) {
  const paths = new Set();

  collectImageDescriptor(paths, config.calendar?.inactive?.defaultImage);
  for (const entry of Object.values(config.calendar?.inactiveWeekdays ?? {})) {
    collectImageDescriptor(paths, entry?.image);
  }
  for (const entry of config.calendar?.inactiveDates ?? []) {
    collectImageDescriptor(paths, entry?.image);
  }

  for (const year of config.academicYears ?? []) {
    for (const entry of year.calendar?.holidays ?? []) collectImageDescriptor(paths, entry?.image);
    for (const entry of year.calendar?.inactiveDates ?? []) collectImageDescriptor(paths, entry?.image);
    for (const period of year.calendar?.periods ?? []) collectImageDescriptor(paths, period?.image);

    for (const term of year.terms ?? []) {
      collectImageDescriptor(paths, term.content?.week);
      for (const item of Object.values(term.content?.days ?? {})) collectImageDescriptor(paths, item);
      for (const item of Object.values(term.content?.views ?? {})) collectImageDescriptor(paths, item);
    }
  }

  for (const rule of config.rules ?? []) {
    if (rule.content?.type === "image") collectImageDescriptor(paths, rule.content);
  }

  return [...paths];
}
