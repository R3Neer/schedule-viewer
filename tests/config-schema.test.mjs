import assert from "node:assert/strict";
import {
  ConfigValidationError, assertSupportedUserAsset, collectAssetIds,
  compileSourceConfig, decompileConfig, migrateV3Config
} from "../config-schema.js";
import { makeConfig, makeSourceConfig } from "./fixture-config.mjs";

const compiled = compileSourceConfig(makeSourceConfig());
assert.equal(compiled.version, 4);
assert.equal(compiled.periods.length, 2);
assert.deepEqual(compileSourceConfig(decompileConfig(compiled)), compiled);

const overlapping = makeSourceConfig();
overlapping.periods[1].start = "2026-12-20";
assert.throws(() => compileSourceConfig(overlapping), error => error instanceof ConfigValidationError && error.path === "periods" && /overlap/.test(error.message));

const svg = makeSourceConfig();
svg.periods[0].images.active.horizontal = { src: "assets/unsafe.svg" };
assert.throws(() => compileSourceConfig(svg), /SVG is not allowed/);
assert.throws(() => assertSupportedUserAsset({ mimeType: "image/svg+xml" }), /SVG is not allowed/);
for (const mimeType of ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]) {
  assert.doesNotThrow(() => assertSupportedUserAsset({ mimeType }));
}

const assetConfig = makeConfig();
assetConfig.periods[0].images.active.horizontal = { type: "image", asset: "hero", fit: "contain", alt: "" };
assetConfig.calendar.exceptions[0].images.vertical = { type: "image", asset: "holiday", fit: "cover", alt: "" };
assert.deepEqual(new Set(collectAssetIds(assetConfig)), new Set(["hero", "holiday"]));

const days = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map(day => [day, `assets/legacy/${day}.webp`]));
const legacy = {
  version: 3,
  app: { timezone: "Europe/Madrid" }, defaults: { weekStartsOn: "monday", imageFit: "contain" }, runtime: {},
  calendar: { inactive: { defaultImage: "assets/legacy/inactive.webp" }, inactiveWeekdays: { saturday: {}, sunday: {} } },
  states: { vacationsHorizontal: "assets/legacy/vacation.webp" },
  academicYears: [{
    id: "legacy", calendar: { terms: [{ termId: "q1", start: "2026-09-01", end: "2026-12-20" }], holidays: [], inactiveDates: [], periods: [] },
    terms: [{ id: "q1", displayName: "Periodo importado", assets: { week: "assets/legacy/week.webp", days } }]
  }]
};
const migrated = migrateV3Config(legacy);
assert.equal(migrated.version, 4);
assert.equal(migrated.periods[0].name, "Periodo importado");
assert.equal(migrated.periods[0].images.active.horizontal.src, "assets/legacy/week.webp");
const structuredOnly = structuredClone(legacy);
delete structuredOnly.academicYears[0].terms[0].assets.days.friday;
assert.throws(() => migrateV3Config(structuredOnly), /structured schedule/);
const legacySvg = structuredClone(legacy);
legacySvg.academicYears[0].terms[0].assets.week = "assets/legacy/week.svg";
assert.throws(() => migrateV3Config(legacySvg), /SVG is not allowed/);

console.log("config-schema: contrato v4, roundtrip, migración segura y formatos de imagen OK");

// Defaults reach every image path, while explicit overrides survive export.
const fitSource = makeSourceConfig();
fitSource.defaults.image_fit = "cover";
function visitImages(value, callback) {
  if (!value || typeof value !== "object") return;
  if (value.src || value.asset) callback(value);
  else Object.values(value).forEach(child => visitImages(child, callback));
}
visitImages(fitSource, image => { delete image.fit; });
fitSource.periods[0].images.active.horizontal.fit = "contain";
const fitConfig = compileSourceConfig(fitSource);
visitImages(fitConfig, image => assert.equal(image.fit,
  image === fitConfig.periods[0].images.active.horizontal ? "contain" : "cover"));
assert.deepEqual(compileSourceConfig(decompileConfig(fitConfig)), fitConfig);
