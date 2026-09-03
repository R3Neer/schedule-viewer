import assert from "node:assert/strict";
import {
  collectAssetIds,
  compileSourceConfig,
  ConfigValidationError,
  decompileConfig,
  normalizeImageDescriptor
} from "../config-schema.js";
import { makeConfig } from "./fixture-config.mjs";

const compiled = makeConfig();
const source = decompileConfig(compiled);
const roundtrip = compileSourceConfig(source);
assert.equal(roundtrip.version, 3);
assert.equal(roundtrip.app.title, compiled.app.title);
assert.equal(roundtrip.desktop.primaryView, "wide_default");
assert.equal(roundtrip.desktop.shortcuts.toggleView.enabled, true);
assert.deepEqual(roundtrip.views.phone_portrait.range, { type: "day" });
assert.equal(roundtrip.academicYears[0].terms[0].sessions.length, 2);

const local = structuredClone(source);
local.calendar.inactive.default_image = {
  asset: "inactive-default-local",
  alt: "Inactivo local",
  fit: "cover"
};
local.academic_years[0].calendar.holidays[0].image = {
  asset: "holiday-gif",
  alt: "Festivo local"
};
local.desktop.shortcuts.toggle_view.enabled = false;
const localCompiled = compileSourceConfig(local);
assert.equal(localCompiled.calendar.inactive.defaultImage.asset, "inactive-default-local");
assert.equal(localCompiled.calendar.inactive.defaultImage.src, undefined);
assert.equal(localCompiled.desktop.shortcuts.toggleView.enabled, false);
assert.deepEqual(new Set(collectAssetIds(localCompiled)), new Set(["inactive-default-local", "holiday-gif"]));

assert.deepEqual(normalizeImageDescriptor({ asset: "x", alt: "X" }), {
  type: "image", asset: "x", fit: "contain", alt: "X"
});
assert.throws(
  () => normalizeImageDescriptor({ src: "a.webp", asset: "x" }),
  (error) => error instanceof ConfigValidationError && /exactamente uno/.test(error.message)
);
assert.throws(
  () => normalizeImageDescriptor({}),
  (error) => error instanceof ConfigValidationError && /exactamente uno/.test(error.message)
);

const noGeneratedAssets = structuredClone(source);
delete noGeneratedAssets.academic_years[0].terms[0].assets;
const withoutAssets = compileSourceConfig(noGeneratedAssets);
assert.equal(withoutAssets.academicYears[0].terms[0].assets.week, null);
assert.deepEqual(withoutAssets.academicYears[0].terms[0].assets.days, {});

const invalid = structuredClone(source);
invalid.views.wide_default.range = { type: "fortnightish" };
assert.throws(
  () => compileSourceConfig(invalid),
  (error) => error instanceof ConfigValidationError && error.path === "views.wide_default.range.type"
);

const ambiguous = structuredClone(source);
ambiguous.academic_years[0].calendar.periods = [
  { id: "a", type: "vacation", start: "2026-10-01", end: "2026-10-10", image: { asset: "a" } },
  { id: "b", type: "vacation", start: "2026-10-05", end: "2026-10-15", image: { asset: "b" } }
];
assert.throws(() => compileSourceConfig(ambiguous), /se solapan/);
ambiguous.academic_years[0].calendar.periods[1].priority = 2;
assert.equal(compileSourceConfig(ambiguous).academicYears[0].calendar.periods.length, 2);

console.log("config-schema: roundtrip, assets locales y validación semántica OK");
