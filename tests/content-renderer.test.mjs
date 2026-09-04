import assert from "node:assert/strict";
import { renderSelectionContent } from "../content-renderer.js";
import { makeConfig } from "./fixture-config.mjs";

const rendered = renderSelectionContent(makeConfig(), {
  content: { type: "image", src: "assets/demo/picture.webp", fit: "cover", alt: "Demo" }
}, { baseURI: "https://example.test/schedule-viewer/" });
assert.deepEqual(rendered, {
  contentType: "image",
  src: "https://example.test/schedule-viewer/assets/demo/picture.webp",
  fallbackSrc: null,
  fit: "cover",
  cacheKey: "image:https://example.test/schedule-viewer/assets/demo/picture.webp"
});
assert.throws(() => renderSelectionContent(makeConfig(), { content: { type: "image", asset: "local" } }, { baseURI: "https://example.test/" }), /renderable/);
assert.throws(() => renderSelectionContent(makeConfig(), { content: { type: "term-schedule" } }, { baseURI: "https://example.test/" }), /renderable/);

console.log("content-renderer: runtime exclusivamente basado en imágenes OK");
