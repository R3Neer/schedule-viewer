import assert from "node:assert/strict";
import {
  addDays,
  collectCustomContentAssetPaths,
  desktopContextMatches,
  desktopToggleTarget,
  evaluateDate,
  resolveInactiveContent,
  resolveRange,
  selectScheduleContent,
  selectViewProfile
} from "../schedule-core.js";
import { makeConfig } from "./fixture-config.mjs";

const config = makeConfig();

assert.equal(addDays("2028-02-28", 1), "2028-02-29");
assert.equal(addDays("2028-02-29", 1), "2028-03-01");
assert.throws(() => addDays("2026-02-30", 1), /Fecha ISO inválida/);

assert.deepEqual(resolveRange("day", "2026-09-09", config.defaults), {
  type: "day", anchor: "2026-09-09", start: "2026-09-09", end: "2026-09-09", dayCount: 1
});
assert.deepEqual(resolveRange({ type: "week", startsOn: "monday" }, "2026-09-09", config.defaults), {
  type: "week", anchor: "2026-09-09", start: "2026-09-07", end: "2026-09-13", dayCount: 7, startsOn: "monday"
});
assert.deepEqual(resolveRange({ type: "week", startsOn: "sunday" }, "2026-09-09", config.defaults), {
  type: "week", anchor: "2026-09-09", start: "2026-09-06", end: "2026-09-12", dayCount: 7, startsOn: "sunday"
});
assert.equal(resolveRange("month", "2028-02-15", config.defaults).end, "2028-02-29");
assert.deepEqual(resolveRange("year", "2026-09-09", config.defaults), {
  type: "year", anchor: "2026-09-09", start: "2026-01-01", end: "2026-12-31", dayCount: 365
});
assert.deepEqual(resolveRange({ type: "relative", before: 2, after: 4 }, "2026-09-09", config.defaults), {
  type: "relative", anchor: "2026-09-09", start: "2026-09-07", end: "2026-09-13", dayCount: 7
});
assert.deepEqual(resolveRange({ type: "rolling", days: 7, anchorPosition: "start" }, "2026-09-09", config.defaults), {
  type: "rolling", anchor: "2026-09-09", start: "2026-09-09", end: "2026-09-15", dayCount: 7
});
assert.deepEqual(resolveRange({ type: "rolling", days: 5, anchorPosition: "center" }, "2026-09-09", config.defaults), {
  type: "rolling", anchor: "2026-09-09", start: "2026-09-07", end: "2026-09-11", dayCount: 5
});
assert.deepEqual(resolveRange({ type: "interval", start: "2026-08-31", end: "2026-09-02" }, "2026-09-09", config.defaults), {
  type: "interval", anchor: "2026-09-09", start: "2026-08-31", end: "2026-09-02", dayCount: 3
});
assert.throws(() => resolveRange({ type: "interval", start: "2026-09-02", end: "2026-09-01" }, "2026-09-09"), /posterior/);
assert.throws(() => resolveRange({ type: "fortnightish" }, "2026-09-09"), /desconocido/);

assert.equal(selectViewProfile(config, { viewport: { width: 402, height: 874, pointer: "coarse" } }).id, "phone_portrait");
assert.equal(selectViewProfile(config, { viewport: { width: 874, height: 402, pointer: "coarse" } }).id, "phone_landscape");
assert.equal(selectViewProfile(config, { viewport: { width: 820, height: 1180, pointer: "coarse" } }).id, "wide_default");
assert.equal(selectViewProfile(config, { viewport: { width: 1440, height: 900, pointer: "fine" } }).id, "wide_default");
assert.equal(selectViewProfile(config, { viewport: { width: 1440, height: 900, pointer: "fine" }, manualViewId: "desktop_portrait" }).id, "desktop_portrait");
assert.equal(desktopContextMatches(config, { width: 1440, height: 900, pointer: "fine" }), true);
assert.equal(desktopContextMatches(config, { width: 820, height: 1180, pointer: "coarse" }), false);
assert.equal(desktopToggleTarget(config, "wide_default", { width: 1440, height: 900, pointer: "fine" }), "desktop_portrait");
assert.equal(desktopToggleTarget(config, "desktop_portrait", { width: 1440, height: 900, pointer: "fine" }), "wide_default");
assert.equal(desktopToggleTarget(config, "wide_default", { width: 820, height: 1180, pointer: "coarse" }), null);

let evaluation = evaluateDate(config, "2026-09-12");
assert.equal(evaluation.status, "inactive-weekday");
assert.equal(evaluation.inactive, true);
assert.equal(resolveInactiveContent(config, evaluation).source, "default");

const sundayOnly = structuredClone(config);
sundayOnly.calendar.inactiveWeekdays = { sunday: {} };
assert.equal(evaluateDate(sundayOnly, "2026-09-12").status, "normal");
assert.equal(evaluateDate(sundayOnly, "2026-09-13").status, "inactive-weekday");

const noRecurringInactive = structuredClone(config);
noRecurringInactive.calendar.inactiveWeekdays = {};
assert.equal(evaluateDate(noRecurringInactive, "2026-09-12").status, "normal");
assert.equal(evaluateDate(noRecurringInactive, "2026-09-13").status, "normal");

const activeOverride = structuredClone(config);
activeOverride.calendar.activeDates.push({ date: "2026-12-25", label: "Clase extraordinaria" });
evaluation = evaluateDate(activeOverride, "2026-12-25");
assert.equal(evaluation.status, "active");
assert.equal(evaluation.inactive, false);

const precedence = structuredClone(config);
precedence.calendar.inactiveWeekdays.friday = {
  image: { type: "image", src: "assets/inactive/friday.svg", fit: "contain", alt: "Viernes" }
};
precedence.academicYears[0].calendar.inactiveDates.push({
  date: "2026-12-25", type: "non-teaching", label: "Fecha exacta",
  image: { type: "image", src: "assets/inactive/exact.svg", fit: "contain", alt: "Exacta" }
});
evaluation = evaluateDate(precedence, "2026-12-25");
assert.equal(evaluation.status, "non-teaching");
assert.equal(resolveInactiveContent(precedence, evaluation).src, "assets/inactive/exact.svg");

const holidayWinsPeriod = structuredClone(config);
evaluation = evaluateDate(holidayWinsPeriod, "2026-12-25");
assert.equal(evaluation.status, "vacation");
assert.equal(resolveInactiveContent(holidayWinsPeriod, evaluation).src, "assets/inactive/holiday.svg");
holidayWinsPeriod.academicYears[0].calendar.holidays[1].image = null;
assert.equal(resolveInactiveContent(holidayWinsPeriod, evaluation).src, "assets/inactive/winter.svg");
holidayWinsPeriod.academicYears[0].calendar.periods[0].image = null;
holidayWinsPeriod.calendar.inactiveWeekdays.friday = {
  image: { type: "image", src: "assets/inactive/friday.svg", fit: "contain", alt: "Viernes" }
};
evaluation = evaluateDate(holidayWinsPeriod, "2026-12-25");
assert.equal(resolveInactiveContent(holidayWinsPeriod, evaluation).src, "assets/inactive/friday.svg");
holidayWinsPeriod.calendar.inactiveWeekdays.friday = {};
evaluation = evaluateDate(holidayWinsPeriod, "2026-12-25");
assert.equal(resolveInactiveContent(holidayWinsPeriod, evaluation).src, "assets/states/inactive.webp");

function select(date, width, height, manualViewId = null) {
  return selectScheduleContent(config, {
    date,
    viewport: { width, height, pointer: width >= 1000 ? "fine" : "coarse" },
    manualViewId
  });
}

let selection = select("2026-09-02", 402, 874);
assert.equal(selection.kind, "inactive");
assert.equal(selection.viewId, "phone_portrait");
assert.equal(selection.content.src, "assets/states/inactive.webp");

selection = select("2026-09-02", 1440, 900, "wide_default");
assert.equal(selection.kind, "next-week");
assert.equal(selection.termId, "q1");
assert.equal(selection.content.fallbackSrc, "assets/q1/week.webp");

selection = select("2026-09-09", 402, 874);
assert.equal(selection.kind, "day");
assert.equal(selection.day, "wednesday");
assert.equal(selection.range.type, "day");

selection = select("2026-09-12", 874, 402);
assert.equal(selection.kind, "week");
assert.equal(selection.termId, "q1");

selection = select("2026-10-12", 402, 874);
assert.equal(selection.kind, "inactive");
selection = select("2026-10-12", 1440, 900, "wide_default");
assert.equal(selection.kind, "week");
assert.equal(selection.termId, "q1");

selection = select("2027-01-10", 874, 402);
assert.equal(selection.content.type, "image");
assert.equal(selection.content.src, "assets/states/vacations.webp");
assert.equal(selection.alt, "Vacaciones");

selection = select("2027-01-20", 874, 402);
assert.equal(selection.kind, "next-week");
assert.equal(selection.termId, "q2");

selection = select("2027-03-22", 874, 402);
assert.equal(selection.content.src, "assets/states/vacations.webp");
selection = select("2027-07-10", 1440, 900, "wide_default");
assert.equal(selection.content.src, "assets/states/vacations.webp");

selection = select("2026-09-09", 1440, 900, "desktop_portrait");
assert.equal(selection.kind, "day");
assert.equal(selection.viewId, "desktop_portrait");
assert.equal(selection.content.fallbackSrc, "assets/q1/wednesday.webp");

const monthConfig = structuredClone(config);
monthConfig.views.wide_default.range = { type: "month" };
selection = selectScheduleContent(monthConfig, {
  date: "2026-09-09", viewport: { width: 1440, height: 900, pointer: "fine" }, manualViewId: "wide_default"
});
assert.equal(selection.kind, "range");
assert.equal(selection.range.type, "month");
assert.equal(selection.range.start, "2026-09-01");
assert.equal(selection.range.end, "2026-09-30");
assert.equal(selection.content.view, "range");

const assets = collectCustomContentAssetPaths(config);
assert.ok(assets.includes("assets/states/inactive.webp"));
assert.ok(assets.includes("assets/inactive/holiday.svg"));
assert.ok(assets.includes("assets/inactive/winter.svg"));
assert.ok(assets.includes("assets/states/vacations.webp"));

console.log("schedule-core v3: 49 contratos de calendario, rangos, vistas, reglas e imágenes OK");
