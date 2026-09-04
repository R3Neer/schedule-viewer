import assert from "node:assert/strict";
import { stepCriticalSpring } from "../settings-motion.js";

const resting = stepCriticalSpring({ position: 1, velocity: 0, target: 1, response: .3, delta: 1 / 60 });
assert.equal(resting.position, 1, "a settled spring stays at its target");
assert.equal(resting.velocity, 0, "a settled spring stays at rest");

let state = { position: 0, velocity: 0 };
for (let frame = 1; frame <= 30; frame++) {
  const previous = state.position;
  state = stepCriticalSpring({ ...state, target: 1, response: .3, delta: 1 / 60 });
  assert.ok(state.position >= previous, `the critically damped spring advances at frame ${frame}`);
  assert.ok(state.position <= 1, `the critically damped spring does not overshoot at frame ${frame}`);
}
assert.ok(1 - state.position < .001, "the visible motion settles without a long tail");

state = { position: .62, velocity: 2.4 };
const retargeted = stepCriticalSpring({ ...state, target: 0, response: .26, delta: 0 });
assert.equal(retargeted.position, state.position, "retargeting preserves position exactly");
assert.ok(Math.abs(retargeted.velocity - state.velocity) < Number.EPSILON * 10, "retargeting preserves velocity exactly");
for (let frame = 0; frame < 30; frame++) state = stepCriticalSpring({ ...state, target: 0, response: .26, delta: 1 / 60 });
assert.ok(state.position < .002, "a retargeted spring reaches its new destination promptly");
assert.ok(Math.abs(state.velocity) < .05, "a retargeted spring comes to rest cleanly");

const delayed = stepCriticalSpring({ position: .35, velocity: 0, target: 1, response: .3, delta: 1.5 });
assert.ok(1 - delayed.position < .001, "a delayed rendering frame catches up instead of freezing mid-transition");
assert.ok(Math.abs(delayed.velocity) < .05, "a delayed rendering frame reaches a stable destination");

console.log("settings-motion tests passed");
