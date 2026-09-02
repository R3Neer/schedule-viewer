import assert from "node:assert/strict";
import fs from "node:fs";
import { selectScheduleContent } from "../schedule-core.js";
import { renderGeneratedSvg, renderSelectionContent } from "../content-renderer.js";

const config = JSON.parse(fs.readFileSync(new URL("../config/schedules.json", import.meta.url), "utf8"));

const day = selectScheduleContent(config, { date: "2026-09-09", portraitNarrow: true });
const phone = renderSelectionContent(config, day, {
  baseURI: "https://example.test/ucm-scheduler/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.equal(phone.contentType, "generated-schedule");
assert.ok(phone.src.startsWith("data:image/svg+xml"));
assert.equal(phone.fallbackSrc, null);
assert.match(decodeURIComponent(phone.src), /width="1000" height="1850"/);

const desktop = renderSelectionContent(config, day, {
  baseURI: "https://example.test/ucm-scheduler/",
  viewportWidth: 1440,
  viewportHeight: 900,
  phoneArtwork: false
});
assert.equal(desktop.contentType, "generated-schedule");
assert.equal(desktop.src, "https://example.test/ucm-scheduler/assets/2026-2027/q1/day-wednesday-vertical.webp");
assert.ok(desktop.fallbackSrc.startsWith("data:image/svg+xml"));

const imageSelection = {
  ...day,
  alt: "GIF personalizado",
  content: {
    type: "image",
    src: "assets/custom/wednesday.gif",
    fit: "cover",
    alt: "GIF personalizado"
  }
};
const image = renderSelectionContent(config, imageSelection, {
  baseURI: "https://example.test/ucm-scheduler/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.deepEqual(image, {
  contentType: "image",
  src: "https://example.test/ucm-scheduler/assets/custom/wednesday.gif",
  fallbackSrc: null,
  fit: "cover",
  cacheKey: "image:https://example.test/ucm-scheduler/assets/custom/wednesday.gif"
});

assert.match(renderGeneratedSvg(config, day), /Miércoles/);

console.log("content-renderer: contratos generated/image OK");
