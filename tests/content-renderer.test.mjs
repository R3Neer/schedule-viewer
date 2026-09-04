import assert from "node:assert/strict";
import {
  renderGeneratedSvg,
  renderSelectionContent
} from "../content-renderer.js";
import { selectScheduleContent } from "../schedule-core.js";
import { makeConfig } from "./fixture-config.mjs";

const config = makeConfig();

const day = selectScheduleContent(config, {
  date: "2026-09-09",
  viewport: { width: 402, height: 874, pointer: "coarse" }
});
const phone = renderSelectionContent(config, day, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.equal(phone.contentType, "generated-schedule");
assert.ok(phone.src.startsWith("data:image/svg+xml"));
assert.equal(phone.fallbackSrc, null);
assert.match(decodeURIComponent(phone.src), /width="1000" height="1850"/);
assert.match(decodeURIComponent(phone.src), /Miércoles/);

const desktop = renderSelectionContent(config, day, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 1440,
  viewportHeight: 900,
  phoneArtwork: false
});
assert.equal(desktop.src, "https://example.test/schedule-viewer/assets/q1/wednesday.webp");
assert.ok(desktop.fallbackSrc.startsWith("data:image/svg+xml"));

const imageSelection = {
  ...day,
  kind: "inactive",
  alt: "GIF",
  content: { type: "image", src: "assets/custom/test.gif", fit: "cover", alt: "GIF" }
};
const image = renderSelectionContent(config, imageSelection, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.deepEqual(image, {
  contentType: "image",
  src: "https://example.test/schedule-viewer/assets/custom/test.gif",
  fallbackSrc: null,
  fit: "cover",
  cacheKey: "image:https://example.test/schedule-viewer/assets/custom/test.gif"
});

const monthConfig = structuredClone(config);
monthConfig.views.wide_default.range = { type: "month" };
const month = selectScheduleContent(monthConfig, {
  date: "2026-09-09",
  viewport: { width: 1440, height: 900, pointer: "fine" },
  manualViewId: "wide_default"
});
const monthSvg = renderGeneratedSvg(monthConfig, month, {
  viewportWidth: 1440,
  viewportHeight: 900,
  phoneArtwork: false
});
assert.match(monthSvg, /width="1600" height="1000"/);
assert.match(monthSvg, /2026-09-01/);
assert.match(monthSvg, /2026-09-30/);
assert.match(monthSvg, /30 días/);

const monthRendered = renderSelectionContent(monthConfig, month, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 1440,
  viewportHeight: 900,
  phoneArtwork: false
});
assert.ok(monthRendered.src.startsWith("data:image/svg+xml"));
assert.equal(monthRendered.fallbackSrc, null);

console.log("content-renderer v3: day/week assets, images y rango genérico OK");
