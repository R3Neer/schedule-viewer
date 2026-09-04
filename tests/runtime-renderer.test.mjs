import assert from "node:assert/strict";
import { renderSelectionContent } from "../runtime-renderer.js";
import { makeConfig } from "./fixture-config.mjs";

const config = makeConfig();
const localSelection = {
  kind: "inactive",
  viewId: "phone_portrait",
  range: { type: "day", start: "2026-10-12", end: "2026-10-12" },
  content: { type: "image", asset: "holiday-local", fit: "cover", alt: "Festivo local" }
};
const local = renderSelectionContent(config, localSelection, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.deepEqual(local, {
  contentType: "image",
  src: null,
  assetId: "holiday-local",
  fallbackSrc: null,
  fit: "cover",
  cacheKey: "local-asset:holiday-local"
});

const staticSelection = structuredClone(localSelection);
staticSelection.content = { type: "image", src: "assets/custom/picture.png", fit: "contain", alt: "Static" };
const staticRendered = renderSelectionContent(config, staticSelection, {
  baseURI: "https://example.test/schedule-viewer/",
  viewportWidth: 402,
  viewportHeight: 874,
  phoneArtwork: true
});
assert.equal(staticRendered.assetId, undefined);
assert.equal(staticRendered.src, "https://example.test/schedule-viewer/assets/custom/picture.png");
assert.equal(staticRendered.fit, "contain");

console.log("runtime-renderer: src estático y asset IndexedDB separados correctamente OK");
