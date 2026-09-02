import assert from "node:assert/strict";
import fs from "node:fs";
import { selectScheduleAsset } from "../src/schedule-core.js";

const config = JSON.parse(fs.readFileSync(new URL("../config/schedules.json", import.meta.url), "utf8"));

function expect(date, portraitNarrow, kind, suffix) {
  const result = selectScheduleAsset(config, { date, portraitNarrow });
  assert.equal(result.kind, kind, `${date}: kind`);
  assert.ok(result.path.endsWith(suffix), `${date}: ${result.path} no termina en ${suffix}`);
}

expect("2026-09-02", true, "no-class", "no-class-today-vertical.webp");
expect("2026-09-02", false, "next-week", "q1/week-horizontal.webp");
expect("2026-09-09", true, "day", "q1/day-wednesday-vertical.webp");
expect("2026-09-12", true, "no-class", "no-class-today-vertical.webp");
expect("2026-09-12", false, "week", "q1/week-horizontal.webp");
expect("2026-10-12", true, "no-class", "no-class-today-vertical.webp");
expect("2026-10-12", false, "week", "q1/week-horizontal.webp");
expect("2027-01-10", false, "vacations", "vacations-horizontal.webp");
expect("2027-01-20", false, "next-week", "q2/week-horizontal.webp");
expect("2027-02-03", true, "day", "q2/day-wednesday-vertical.webp");
expect("2027-03-22", true, "no-class", "no-class-today-vertical.webp");
expect("2027-03-22", false, "vacations", "vacations-horizontal.webp");
expect("2027-07-10", false, "vacations", "vacations-horizontal.webp");

console.log("schedule-core: 13 casos OK");
