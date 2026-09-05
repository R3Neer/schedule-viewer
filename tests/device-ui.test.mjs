import assert from "node:assert/strict";
import {
  MAX_COVER_CROP,
  coverCropFraction,
  detectDeviceMode,
  detectDisplayMode,
  isApplePlatform,
  resolveUiEnvironment,
  resolveViewportImageFit
} from "../device-ui.js";

assert.equal(detectDeviceMode({ maxTouchPoints: 5, pointerCoarse: true, pointerFine: false, hoverNone: true }), "touch", "iPhone debe ser touch");
assert.equal(detectDeviceMode({ maxTouchPoints: 10, pointerCoarse: true, pointerFine: false, hoverNone: true }), "touch", "iPad grande debe seguir siendo touch");
assert.equal(detectDeviceMode({ maxTouchPoints: 5, pointerCoarse: false, pointerFine: false, hoverNone: true }), "touch", "tablet táctil sin pointer declarado debe ser touch");
assert.equal(detectDeviceMode({ maxTouchPoints: 0, pointerCoarse: false, pointerFine: false, hoverNone: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", platform: "iPhone" }), "touch", "iPhone real debe seguir siendo touch aunque media queries fallen");
assert.equal(detectDeviceMode({ maxTouchPoints: 0, pointerCoarse: false, pointerFine: false, hoverNone: false, userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile", platform: "Linux armv8l" }), "touch", "Android móvil debe seguir siendo touch aunque media queries fallen");
assert.equal(detectDeviceMode({ maxTouchPoints: 5, pointerCoarse: false, pointerFine: true, hoverNone: false, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }), "touch", "iPadOS disfrazado de Mac debe ser touch");
assert.equal(detectDeviceMode({ maxTouchPoints: 0, pointerCoarse: false, pointerFine: true, hoverNone: false }), "desktop", "PC con ratón debe ser desktop");
assert.equal(detectDeviceMode({ maxTouchPoints: 1, pointerCoarse: false, pointerFine: true, hoverNone: false }), "desktop", "portátil con pantalla táctil y ratón no debe mutar a tablet");
assert.equal(detectDeviceMode({ maxTouchPoints: 0, pointerCoarse: false, pointerFine: true, hoverNone: false, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel" }), "desktop", "Mac real debe seguir siendo desktop");

assert.equal(isApplePlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }), true);
assert.equal(isApplePlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 }), true, "iPadOS en modo desktop debe detectarse como Apple");
assert.equal(isApplePlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 }), true, "Mac debe usar tema Apple");
assert.equal(isApplePlatform({ userAgent: "Mozilla/5.0 (Linux; Android 16)", platform: "Linux armv8l", maxTouchPoints: 5 }), false);
assert.equal(isApplePlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 }), false);

assert.equal(detectDisplayMode({ matchMedia: () => ({ matches: false }) }, { standalone: true }), "standalone");
assert.equal(detectDisplayMode({ matchMedia: () => ({ matches: true }) }, {}), "standalone");
assert.equal(detectDisplayMode({ matchMedia: () => ({ matches: false }) }, {}), "browser");

assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }), { deviceMode: "touch", uiTheme: "apple" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile", platform: "Linux armv8l", maxTouchPoints: 5 }), { deviceMode: "touch", uiTheme: "generic" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0, pointerFine: true }), { deviceMode: "desktop", uiTheme: "apple" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0, pointerFine: true }), { deviceMode: "desktop", uiTheme: "generic" });

assert.equal(MAX_COVER_CROP, 0.1);
assert.equal(coverCropFraction({ imageWidth: 1600, imageHeight: 900, viewportWidth: 1600, viewportHeight: 900 }), 0);
assert.ok(Math.abs(coverCropFraction({ imageWidth: 2622, imageHeight: 1206, viewportWidth: 1920, viewportHeight: 1080 }) - 0.182) < 0.001);
assert.equal(resolveViewportImageFit({ requestedFit: "cover", imageWidth: 1600, imageHeight: 900, viewportWidth: 1600, viewportHeight: 1000 }), "cover", "un recorte del 10% exacto sigue usando cover");
assert.equal(resolveViewportImageFit({ requestedFit: "cover", imageWidth: 2622, imageHeight: 1206, viewportWidth: 1920, viewportHeight: 1080 }), "contain", "un recorte apreciable muestra la imagen completa");
assert.equal(resolveViewportImageFit({ requestedFit: "cover", imageWidth: 2622, imageHeight: 1206, viewportWidth: 402, viewportHeight: 874 }), "contain", "el umbral también protege pantallas táctiles");
assert.equal(resolveViewportImageFit({ requestedFit: "cover", imageWidth: 1206, imageHeight: 2622, viewportWidth: 402, viewportHeight: 874 }), "cover", "una imagen móvil bien proporcionada mantiene el llenado completo");
assert.equal(resolveViewportImageFit({ requestedFit: "contain", imageWidth: 2622, imageHeight: 1206, viewportWidth: 1920, viewportHeight: 1080 }), "contain");

console.log("device-ui: independent touch/desktop layout and Apple/generic materials OK");
