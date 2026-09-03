import assert from "node:assert/strict";
import { makeConfig } from "./fixture-config.mjs";
import {
  compiledToYaml,
  exportSchedulePackage,
  inspectSchedulePackage,
  normalizeCompiledConfig,
  yamlToCompiled
} from "../lazy-src/config-io.entry.js";

const config = makeConfig();
config.calendar.inactive.defaultImage = { type: "image", asset: "default-local", fit: "contain", alt: "Local" };
config.academicYears[0].calendar.holidays[0].image = { type: "image", asset: "holiday-gif", fit: "cover", alt: "Fiesta" };
config.academicYears[0].terms.forEach((term) => { term.assets = { week: null, days: {} }; });

const normalized = normalizeCompiledConfig(config);
assert.equal(normalized.calendar.inactive.defaultImage.asset, "default-local");
const yaml = compiledToYaml(normalized);
assert.match(yaml, /asset: default-local/);
assert.match(yaml, /asset: holiday-gif/);
const reparsed = yamlToCompiled(yaml);
assert.equal(reparsed.calendar.inactive.defaultImage.asset, "default-local");
assert.equal(reparsed.academicYears[0].calendar.holidays[0].image.asset, "holiday-gif");

const gifBytes = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0]);
const assets = [
  { id: "default-local", blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), filename: "default.png", mimeType: "image/png" },
  { id: "holiday-gif", blob: new Blob([gifBytes], { type: "image/gif" }), filename: "party.gif", mimeType: "image/gif" }
];
const packageBlob = await exportSchedulePackage({ config: normalized, assets });
assert.ok(packageBlob.size > 100);
const restored = await inspectSchedulePackage(packageBlob);
assert.equal(restored.config.calendar.inactive.defaultImage.asset, "default-local");
assert.equal(restored.assets.length, 2);
assert.equal(restored.assets.find((item) => item.id === "holiday-gif").mimeType, "image/gif");
assert.equal(restored.assets.find((item) => item.id === "holiday-gif").blob.size, gifBytes.length);

await assert.rejects(
  exportSchedulePackage({ config: normalized, assets: assets.filter((item) => item.id !== "holiday-gif") }),
  /Falta el asset local requerido holiday-gif/
);

const corrupt = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/zip" });
await assert.rejects(inspectSchedulePackage(corrupt));

assert.throws(() => yamlToCompiled("version: [\n"), /YAML|flow|end|unexpected/i);
assert.throws(() => yamlToCompiled(yaml.replace("type: week", "type: fortnightish")), /fortnightish/);

console.log("config-io: YAML roundtrip y paquete .schedule con assets/manifest OK");
