import assert from "node:assert/strict";
import { makeConfig } from "./fixture-config.mjs";
import {
  compiledToYaml, exportSchedulePackage, inspectSchedulePackage,
  normalizeCompiledConfig, yamlToCompiled
} from "../lazy-src/config-io.entry.js";

const config = makeConfig();
config.periods[0].images.active.vertical.default = { type: "image", asset: "default-local", fit: "contain", alt: "Local" };
config.calendar.exceptions[0].images = { vertical: { type: "image", asset: "holiday-gif", fit: "cover", alt: "Fiesta" } };

const normalized = normalizeCompiledConfig(config);
const yaml = compiledToYaml(normalized);
assert.match(yaml, /version: 4/);
assert.match(yaml, /asset: default-local/);
assert.equal(yamlToCompiled(yaml).periods[0].images.active.vertical.default.asset, "default-local");

const gifBytes = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0]);
const assets = [
  { id: "default-local", blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), filename: "default.png", mimeType: "image/png" },
  { id: "holiday-gif", blob: new Blob([gifBytes], { type: "image/gif" }), filename: "party.gif", mimeType: "image/gif" }
];
const packageBlob = await exportSchedulePackage({ config: normalized, assets });
const restored = await inspectSchedulePackage(packageBlob);
assert.equal(restored.config.version, 4);
assert.equal(restored.assets.length, 2);
const restoredGif = restored.assets.find(item => item.id === "holiday-gif");
assert.equal(restoredGif.mimeType, "image/gif");
assert.deepEqual(new Uint8Array(await restoredGif.blob.arrayBuffer()), gifBytes);

await assert.rejects(exportSchedulePackage({ config: normalized, assets: assets.slice(0, 1) }), /holiday-gif/);
await assert.rejects(inspectSchedulePackage(new Blob([new Uint8Array([1, 2, 3])], { type: "application/zip" })));
assert.throws(() => yamlToCompiled("version: 3\n"), /version/);
assert.throws(() => yamlToCompiled(yaml.replace("assets/autumn/horizontal.webp", "assets/autumn/horizontal.svg")), /SVG/);

console.log("config-io: YAML v4 y .schedule preservan MIME, nombre y bytes GIF OK");

const coverConfig = structuredClone(config);
coverConfig.defaults.imageFit = "cover";
coverConfig.periods[0].images.active.vertical.default.fit = "cover";
const coverPackage = await exportSchedulePackage({ config: coverConfig, assets });
const coverRestored = await inspectSchedulePackage(coverPackage);
assert.deepEqual(coverRestored.config, normalizeCompiledConfig(coverConfig));
assert.equal(coverRestored.config.periods[0].images.active.horizontal.fit, "contain");
