import assert from "node:assert/strict";
import { allowsBrowserSafeBack, gestureIntent, shouldCompleteGesture } from "../settings-gestures.js";

assert.equal(gestureIntent({ dx: 8, dy: 1, allowBack: true }), null, "tiny movements stay taps");
assert.equal(gestureIntent({ dx: 40, dy: 4, allowBack: true }), "back", "LTR back follows leading to trailing");
assert.equal(gestureIntent({ dx: -40, dy: 4, allowBack: true }), "reject", "a leftward swipe is not Back in LTR");
assert.equal(gestureIntent({ dx: -40, dy: 4, allowBack: true, direction: -1 }), "back", "RTL reverses the Back direction");
assert.equal(gestureIntent({ dx: 4, dy: 40, allowDismiss: true }), "dismiss", "a downward header drag dismisses");
assert.equal(gestureIntent({ dx: 18, dy: 18, allowBack: true, allowDismiss: true }), "reject", "ambiguous diagonal drags do nothing");
assert.equal(gestureIntent({ dx: 2, dy: 40, allowBack: true, allowDismiss: false }), "reject", "content scrolling is not dismissal");

assert.equal(shouldCompleteGesture({ progress: .34, velocity: 0, kind: "back" }), true);
assert.equal(shouldCompleteGesture({ progress: .12, velocity: .5, kind: "back" }), true, "a short fast flick completes Back");
assert.equal(shouldCompleteGesture({ progress: .2, velocity: .2, kind: "back" }), false, "a short slow drag cancels Back");
assert.equal(shouldCompleteGesture({ progress: .29, velocity: 0, kind: "dismiss" }), true);
assert.equal(shouldCompleteGesture({ progress: .1, velocity: .6, kind: "dismiss" }), true, "a fast downward flick closes");

assert.equal(allowsBrowserSafeBack({ coordinate: 12, viewportWidth: 402 }), false, "Safari's leading browser edge stays reserved");
assert.equal(allowsBrowserSafeBack({ coordinate: 40, viewportWidth: 402 }), true);
assert.equal(allowsBrowserSafeBack({ coordinate: 45, viewportWidth: 874, safeInset: 30 }), false, "landscape safe area expands the reserved edge");
assert.equal(allowsBrowserSafeBack({ coordinate: 55, viewportWidth: 874, safeInset: 30 }), true);
assert.equal(allowsBrowserSafeBack({ coordinate: 0, viewportWidth: 402, standalone: true }), true, "an installed PWA owns its leading edge");
assert.equal(allowsBrowserSafeBack({ coordinate: 862, viewportWidth: 874, direction: -1 }), false, "RTL reserves the opposite browser edge");

console.log("settings gesture tests passed");
