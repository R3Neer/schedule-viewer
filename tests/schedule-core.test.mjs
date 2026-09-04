import assert from "node:assert/strict";
import { activeWeekdaysForPeriod, evaluateDate, monthOccurrences, weekOccurrences } from "../calendar-core.js";
import { selectScheduleContent } from "../content-core.js";
import { desktopToggleTarget, selectViewProfile } from "../view-core.js";
import { makeConfig } from "./fixture-config.mjs";

const config = makeConfig();
assert.equal(selectViewProfile(config, { viewport: { width: 402, height: 874, pointer: "coarse" } }).id, "vertical");
assert.equal(selectViewProfile(config, { viewport: { width: 874, height: 402, pointer: "coarse" } }).id, "horizontal");
assert.equal(selectViewProfile(config, { viewport: { width: 1440, height: 900, pointer: "fine" } }).id, "horizontal");
assert.equal(desktopToggleTarget(config, "horizontal", { width: 1440, height: 900, pointer: "fine" }), "vertical");

assert.equal(evaluateDate(config, "2026-10-12").status, "holiday");
assert.equal(evaluateDate(config, "2026-10-17").status, "active");
assert.equal(evaluateDate(config, "2026-10-18").status, "inactive-weekday");
assert.equal(evaluateDate(config, "2026-12-15").status, "vacation");
assert.equal(evaluateDate(config, "2026-08-01").status, "out-of-period");

// La excepción exacta prevalece sobre el periodo inactivo y el patrón semanal.
const precedence = makeConfig();
precedence.calendar.exceptions.push({ id: "winter-open", date: "2026-12-19", name: "Apertura especial", state: "active", kind: "other", images: {} });
assert.equal(evaluateDate(precedence, "2026-12-19").status, "active");

const weeks = weekOccurrences({ start: "2026-09-09", end: "2026-09-22" }, "monday");
assert.deepEqual(weeks.map(item => [item.key, item.start, item.end]), [
  ["2026-09-07", "2026-09-09", "2026-09-13"],
  ["2026-09-14", "2026-09-14", "2026-09-20"],
  ["2026-09-21", "2026-09-21", "2026-09-22"]
]);
assert.deepEqual(monthOccurrences({ start: "2026-11-20", end: "2027-02-03" }).map(item => item.key), ["2026-11", "2026-12", "2027-01", "2027-02"]);
assert.deepEqual(activeWeekdaysForPeriod(config, config.periods[0]), ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);

let selected = selectScheduleContent(config, { date: "2026-10-05", viewId: "horizontal" });
assert.equal(selected.content.src, "assets/autumn/horizontal.webp");
selected = selectScheduleContent(config, { date: "2026-10-05", viewId: "vertical" });
assert.equal(selected.content.src, "assets/autumn/monday.webp");
selected = selectScheduleContent(config, { date: "2026-10-12", viewId: "vertical" });
assert.equal(selected.content.src, "assets/states/inactive-vertical.webp");
selected = selectScheduleContent(config, { date: "2026-11-13", viewId: "vertical" });
assert.equal(selected.content.src, "assets/states/closure.webp");
selected = selectScheduleContent(config, { date: "2026-12-15", viewId: "horizontal" });
assert.equal(selected.content.src, "assets/states/winter.webp");

for (const unit of ["week", "month"]) {
  const alternate = makeConfig();
  alternate.presentation.vertical.unit = unit;
  const result = selectScheduleContent(alternate, { date: "2026-09-07", viewId: "vertical" });
  assert.match(result.content.src, unit === "week" ? /week-1/ : /month-1/);
}

console.log("schedule-core: periodos, precedencia, unidades reales y horizontal fijo OK");
