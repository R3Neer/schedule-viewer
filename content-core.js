import { dayKeyFromIso } from "./date-core.js";
import { displayPeriodForDate, evaluateDate } from "./calendar-core.js";
import { resolveRange } from "./range-core.js";
import { selectViewProfile } from "./view-core.js";
import { normalizeImageDescriptor } from "./config-schema.js";

function orientationImage(images, orientation) {
  return images?.[orientation] ?? null;
}

export function resolveDefaultInactiveContent(config, evaluation = {}, orientation = "vertical") {
  const period = evaluation.displayPeriod ?? displayPeriodForDate(config, evaluation.date);
  const image = period?.images?.inactive?.[orientation];
  if (!image) throw new Error(`Falta la imagen inactiva ${orientation}.`);
  return { ...normalizeImageDescriptor(image), source: "default" };
}

export function resolveInactiveContent(config, evaluation, orientation = "vertical") {
  const exception = orientationImage(evaluation.matches?.exception?.images, orientation);
  if (exception) return { ...normalizeImageDescriptor(exception), source: "exception" };
  const interval = orientationImage(evaluation.matches?.period?.images, orientation);
  if (interval) return { ...normalizeImageDescriptor(interval), source: "period" };
  const period = evaluation.displayPeriod;
  if (orientation === "vertical") {
    const weekday = period?.images?.inactive?.weekdays?.[evaluation.weekday];
    if (weekday) return { ...normalizeImageDescriptor(weekday), source: "weekday" };
  }
  return resolveDefaultInactiveContent(config, evaluation, orientation);
}

function verticalContent(config, period, date) {
  const vertical = period.images.active.vertical;
  const unit = config.presentation.vertical.unit;
  if (unit === "day") return vertical.days?.[dayKeyFromIso(date)] ?? vertical.default;
  if (unit === "week") {
    const key = resolveRange({ type: "week", startsOn: config.defaults.weekStartsOn }, date, config.defaults).start;
    return vertical.weeks?.[key] ?? vertical.default;
  }
  return vertical.months?.[date.slice(0, 7)] ?? vertical.default;
}

export function selectScheduleContent(config, { date, viewport = { width: 1024, height: 768, pointer: "fine" }, viewId = null, manualViewId = null } = {}) {
  const view = viewId ? { id: viewId } : selectViewProfile(config, { viewport, manualViewId });
  const orientation = view.id === "horizontal" ? "horizontal" : "vertical";
  const evaluation = evaluateDate(config, date);
  const period = evaluation.activePeriod ?? evaluation.displayPeriod;
  if (!period) throw new Error("No hay ningún periodo configurado.");
  const range = orientation === "horizontal"
    ? { type: "period", anchor: date, start: period.start, end: period.end }
    : resolveRange(config.presentation.vertical.unit, date, config.defaults);
  const content = evaluation.inactive
    ? resolveInactiveContent(config, evaluation, orientation)
    : orientation === "horizontal" ? period.images.active.horizontal : verticalContent(config, period, date);
  const normalized = normalizeImageDescriptor(
    content,
    "selection.content",
    { alt: evaluation.label ?? period.name }
  );
  return {
    kind: evaluation.inactive ? "inactive" : orientation,
    viewId: view.id,
    range,
    periodId: period.id,
    evaluation,
    alt: normalized.alt || evaluation.label || period.name,
    content: { ...normalized, alt: normalized.alt || evaluation.label || period.name }
  };
}

export function selectScheduleAsset(config, options) {
  const selection = selectScheduleContent(config, options);
  return { ...selection, path: selection.content.src ?? null, assetId: selection.content.asset ?? null };
}

export function collectCustomContentAssetPaths(config) {
  const paths = new Set();
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (value.type === "image" && value.src) paths.add(value.src);
    if (Array.isArray(value)) value.forEach(visit); else Object.values(value).forEach(visit);
  };
  visit(config.periods);
  visit(config.calendar);
  return [...paths];
}

export function ruleMatches() { return false; }
export function selectRule() { return null; }
