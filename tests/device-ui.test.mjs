import assert from "node:assert/strict";
import { detectDeviceMode, isApplePlatform, resolveUiEnvironment } from "../device-ui.js";

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

assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }), { deviceMode: "touch", uiTheme: "apple" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile", platform: "Linux armv8l", maxTouchPoints: 5 }), { deviceMode: "touch", uiTheme: "generic" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0, pointerFine: true }), { deviceMode: "desktop", uiTheme: "apple" });
assert.deepEqual(resolveUiEnvironment({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0, pointerFine: true }), { deviceMode: "desktop", uiTheme: "generic" });

console.log("device-ui: independent touch/desktop layout and Apple/generic materials OK");
