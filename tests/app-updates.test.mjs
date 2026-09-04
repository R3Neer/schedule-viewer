import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app-updates.js', import.meta.url), 'utf8').replace('export function', 'function');
function events(extra = {}) {
  const handlers = new Map();
  return { ...extra, addEventListener(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); }, emit(name, event = {}) { for (const fn of handlers.get(name) || []) fn(event); } };
}
async function setup({ failRegistration = false } = {}) {
  let time = 0, safe = true, reloads = 0, checks = 0;
  const timers = new Map();
  const notices = [{ hidden: true }];
  const registration = events({ waiting: null, installing: null, async update() { checks++; } });
  const workers = events({ controller: null, ready: Promise.resolve(), async register() {
    if (failRegistration) throw new Error('temporarily unavailable');
    return registration;
  } });
  const document = events({ readyState: 'complete', hidden: false, body: { inert: false }, documentElement: { dataset: {} }, querySelectorAll() { return notices; } });
  const window = events({ location: { reload() { reloads++; } } });
  const navigator = { serviceWorker: workers, onLine: true };
  let tick;
  const context = vm.createContext({ document, window, navigator, performance: { now: () => time }, setInterval(fn) { tick = fn; }, setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, console });
  vm.runInContext(source, context);
  const manager = context.initAppUpdates({ isSafeToReload: () => safe });
  await new Promise(setImmediate);
  return { manager, workers, registration, document, window, navigator, notices, timers,
    advance(ms) { time += ms; }, setSafe(value) { safe = value; }, tick: () => tick(),
    recoverRegistration() { failRegistration = false; },
    get reloads() { return reloads; }, get checks() { return checks; } };
}

const polling = await setup();
assert.equal(polling.document.documentElement.dataset.offlineReady, '1');
assert.equal(polling.checks, 0, 'registration must not immediately be followed by a duplicate update request');
polling.advance(11000);
polling.document.hidden = true;
await polling.manager.check({ force: true });
assert.equal(polling.checks, 0);
polling.document.hidden = false;
polling.navigator.onLine = false;
await polling.manager.check({ force: true });
assert.equal(polling.checks, 0);
polling.navigator.onLine = true;
polling.window.emit('online');
await new Promise(setImmediate);
assert.equal(polling.checks, 1);
polling.document.emit('visibilitychange');
polling.window.emit('pageshow');
assert.equal(polling.checks, 1, 'foreground event storms are throttled');
polling.advance(300000);
await polling.tick();
assert.equal(polling.checks, 2);

const recovered = await setup({ failRegistration: true });
assert.equal(recovered.document.documentElement.dataset.offlineReady, '0');
recovered.recoverRegistration();
recovered.advance(11000);
await recovered.manager.check({ force: true });
assert.equal(recovered.document.documentElement.dataset.offlineReady, '1');

const initial = await setup();
let initialActivationRequests = 0;
initial.registration.waiting = { postMessage() { initialActivationRequests++; } };
initial.manager.reconsider();
assert.equal(initialActivationRequests, 0, 'first installation activates naturally, without an update handshake');
initial.workers.emit('message', { data: { type: 'PREPARE_UPDATE' }, ports: [{ postMessage() {} }] });
initial.workers.emit('controllerchange');
assert.equal(initial.reloads, 0, 'first install never reloads');
assert.equal(initial.document.body.inert, false, 'first controller must release any pending preparation lock');
assert.equal(initial.notices[0].hidden, true, 'first installation is not a pending update');
initial.setSafe(false);
initial.workers.emit('controllerchange');
assert.equal(initial.reloads, 0, 'even a legacy immediate activation cannot discard an edit');
assert.equal(initial.notices[0].hidden, false);
initial.setSafe(true);
initial.manager.reconsider();
initial.manager.reconsider();
assert.equal(initial.reloads, 1, 'controller changes reload only once');

const handshake = await setup();
let answer;
const prepare = () => handshake.workers.emit('message', { data: { type: 'PREPARE_UPDATE' }, ports: [{ postMessage(value) { answer = value.safe; } }] });
handshake.setSafe(false);
prepare();
assert.equal(answer, false);
assert.equal(handshake.document.body.inert, false);
handshake.setSafe(true);
prepare();
assert.equal(answer, true);
assert.equal(handshake.document.body.inert, true);
let stopped = false;
handshake.window.emit('keydown', { preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
assert.equal(stopped, true, 'global shortcuts cannot start editing after a ready vote');
handshake.workers.emit('message', { data: { type: 'CANCEL_UPDATE' } });
assert.equal(handshake.document.body.inert, false);
prepare();
for (const timeout of [...handshake.timers.values()]) timeout();
assert.equal(handshake.document.body.inert, false, 'worker failure cannot strand an inert page');

console.log('app-updates: visibility, offline, throttling, first install, safe reload and handshake unlock OK');
