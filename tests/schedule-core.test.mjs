import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectCustomContentAssetPaths,
  selectScheduleAsset,
  selectScheduleContent
} from "../schedule-core.js";

const config = JSON.parse(fs.readFileSync(new URL("../config/schedules.json", import.meta.url), "utf8"));

function expectAsset(date, portraitNarrow, kind, suffix) {
  const result = selectScheduleAsset(config, { date, portraitNarrow });
  assert.equal(result.kind, kind, `${date}: kind`);
  assert.ok(result.path?.endsWith(suffix), `${date}: ${result.path} no termina en ${suffix}`);
}

expectAsset("2026-09-02", true, "no-class", "no-class-today-vertical.webp");
expectAsset("2026-09-02", false, "next-week", "q1/week-horizontal.webp");
expectAsset("2026-09-09", true, "day", "q1/day-wednesday-vertical.webp");
expectAsset("2026-09-12", true, "no-class", "no-class-today-vertical.webp");
expectAsset("2026-09-12", false, "week", "q1/week-horizontal.webp");
expectAsset("2026-10-12", true, "no-class", "no-class-today-vertical.webp");
expectAsset("2026-10-12", false, "week", "q1/week-horizontal.webp");
expectAsset("2027-01-10", false, "vacations", "vacations-horizontal.webp");
expectAsset("2027-01-20", false, "next-week", "q2/week-horizontal.webp");
expectAsset("2027-02-03", true, "day", "q2/day-wednesday-vertical.webp");
expectAsset("2027-03-22", true, "no-class", "no-class-today-vertical.webp");
expectAsset("2027-03-22", false, "vacations", "vacations-horizontal.webp");
expectAsset("2027-07-10", false, "vacations", "vacations-horizontal.webp");

const defaultDay = selectScheduleContent(config, { date: "2026-09-09", portraitNarrow: true });
assert.equal(defaultDay.content.type, "generated-schedule");
assert.equal(defaultDay.content.view, "day");
assert.ok(defaultDay.content.fallbackSrc.endsWith("q1/day-wednesday-vertical.webp"));

const custom = structuredClone(config);
const q1 = custom.academicYears[0].terms.find((term) => term.id === "q1");
q1.content = {
  days: {
    wednesday: {
      type: "image",
      src: "assets/custom/wednesday.gif",
      alt: "GIF raro del miércoles",
      fit: "cover"
    },
    thursday: "assets/custom/thursday.png"
  },
  week: {
    type: "image",
    src: "assets/custom/week.avif",
    alt: "Semana personalizada"
  }
};
custom.content = {
  states: {
    noClassToday: {
      type: "image",
      src: "assets/custom/no-class.svg",
      alt: "Nada hoy"
    }
  }
};

const gifDay = selectScheduleContent(custom, { date: "2026-09-09", portraitNarrow: true });
assert.equal(gifDay.kind, "day");
assert.deepEqual(gifDay.content, {
  type: "image",
  src: "assets/custom/wednesday.gif",
  fit: "cover",
  alt: "GIF raro del miércoles"
});
assert.equal(gifDay.alt, "GIF raro del miércoles");

const shorthand = selectScheduleContent(custom, { date: "2026-09-10", portraitNarrow: true });
assert.equal(shorthand.content.type, "image");
assert.equal(shorthand.content.src, "assets/custom/thursday.png");
assert.equal(shorthand.content.fit, "contain");

const customWeek = selectScheduleContent(custom, { date: "2026-09-09", portraitNarrow: false });
assert.equal(customWeek.kind, "week");
assert.equal(customWeek.content.type, "image");
assert.equal(customWeek.content.src, "assets/custom/week.avif");
assert.equal(customWeek.alt, "Semana personalizada");

const customNoClass = selectScheduleContent(custom, { date: "2026-10-12", portraitNarrow: true });
assert.equal(customNoClass.kind, "no-class");
assert.equal(customNoClass.content.src, "assets/custom/no-class.svg");
assert.equal(customNoClass.alt, "Nada hoy");

const customPaths = collectCustomContentAssetPaths(custom).sort();
assert.deepEqual(customPaths, [
  "assets/custom/no-class.svg",
  "assets/custom/thursday.png",
  "assets/custom/week.avif",
  "assets/custom/wednesday.gif"
]);

console.log("schedule-core: 19 casos/contratos OK");
