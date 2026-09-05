import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const listeners = new Map();
const deletedCaches = [];
let claimed = false;

const context = {
  URL,
  Response,
  MessageChannel,
  setTimeout: fn => setTimeout(fn, 25),
  clearTimeout,
  console,
  caches: {
    async keys() {
      return [
        "schedule-viewer-offline-v2-content",
        "schedule-viewer-old",
        "schedule-viewer-offline-v3",
        "schedule-viewer-offline-v4",
        "schedule-viewer-offline-v4-1",
        "schedule-viewer-offline-20260903-v4-6",
        "schedule-viewer-offline-20260903-v4-8",
        "schedule-viewer-offline-20260904-v4-16",
        "schedule-viewer-offline-20260904-v4-17",
        "schedule-viewer-offline-20260904-v4-18",
        "schedule-viewer-offline-20260904-v5-0",
        "another-app-cache"
      ];
    },
    async delete(name) {
      deletedCaches.push(name);
      return true;
    }
  },
  self: {
    registration: { scope: "https://example.test/schedule-viewer/" },
    location: { origin: "https://example.test" },
    clients: { async claim() { claimed = true; } },
    addEventListener(name, callback) { listeners.set(name, callback); }
  }
};

vm.createContext(context);
vm.runInContext(code, context, { filename: "service-worker.js" });

assert.ok(listeners.has("install"));
assert.ok(listeners.has("activate"));
assert.ok(listeners.has("fetch"));
assert.equal(typeof context.scheduleAssetPaths, "function");
assert.equal(typeof context.isMigrationCache, "function");

const config = {
  calendar: {
    exceptions: [{ images: { vertical: { type: "image", src: "assets/inactive/holiday.avif" } } }],
    inactivePeriods: [{ images: { horizontal: { type: "image", asset: "winter-local" } } }]
  },
  periods: [{ images: {
    active: {
      vertical: { default: { type: "image", src: "assets/demo/vertical.webp" }, days: { monday: { type: "image", src: "assets/demo/monday.webp" } } },
      horizontal: { type: "image", src: "assets/demo/horizontal.webp" }
    },
    inactive: {
      vertical: { type: "image", src: "assets/inactive/default.webp" },
      horizontal: { type: "image", src: "https://cdn.example.org/remote.png" }
    }
  } }]
};

const paths = [...context.scheduleAssetPaths(config)].sort();
assert.deepEqual(paths, [
  "https://example.test/schedule-viewer/assets/demo/horizontal.webp",
  "https://example.test/schedule-viewer/assets/demo/monday.webp",
  "https://example.test/schedule-viewer/assets/demo/vertical.webp",
  "https://example.test/schedule-viewer/assets/inactive/default.webp",
  "https://example.test/schedule-viewer/assets/inactive/holiday.avif"
]);
assert.ok(!paths.some((path) => path.includes("winter-local")), "los Blob de IndexedDB no deben duplicarse en Cache Storage");

let activation = null;
listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
await activation;
assert.deepEqual(deletedCaches.sort(), [
  "schedule-viewer-offline-v2-content",
  "schedule-viewer-old",
  "schedule-viewer-offline-v4",
  "schedule-viewer-offline-v4-1",
  "schedule-viewer-offline-20260903-v4-6",
  "schedule-viewer-offline-20260903-v4-8",
  "schedule-viewer-offline-20260904-v4-16",
  "schedule-viewer-offline-20260904-v4-17",
  "schedule-viewer-offline-20260904-v4-18",
  "schedule-viewer-offline-20260904-v5-0"
].sort());
assert.equal(claimed, true);
assert.equal(context.isMigrationCache("schedule-viewer-offline-v3"), true);
assert.equal(context.isMigrationCache("schedule-viewer-offline-v3-content"), true);
assert.equal(context.isMigrationCache("schedule-viewer-offline-v4"), false);

assert.match(code, /config\/schedule\.json/);
assert.equal(vm.runInContext("CACHE_NAME", context), "schedule-viewer-offline-20260905-v1-0-1-r4");
assert.match(code, /MIGRATION_CACHE_PREFIX/);
assert.match(code, /discoverImageDescriptors/);
assert.match(code, /ignoreSearch/);
assert.match(code, /local-store\.js/);
assert.doesNotMatch(code, /demo-labels\.js/, "v4 no depende del antiguo vocabulario académico");
assert.match(code, /lazy\/config-io\.js/, "import/export debe estar disponible offline sin ejecutar su bundle en la carga inicial");
assert.doesNotMatch(code, /lazy\/yaml-editor\.js/, "CodeMirror debe seguir siendo descarga realmente bajo demanda");

let skipped = 0;
let cancelled = 0;
context.self.skipWaiting = async () => { skipped++; };
const client = (id, safe) => ({
  id, url: `https://example.test/schedule-viewer/?tab=${id}`,
  postMessage(message, ports) {
    if (message.type === 'CANCEL_UPDATE') cancelled++;
    else if (safe !== null) { ports[0].postMessage({ safe }); ports[0].close(); }
  }
});
context.self.clients.matchAll = async () => [client('clean', true), client('editing', false)];
await context.activateWhenSafe();
assert.equal(skipped, 0);
assert.equal(cancelled, 2, 'all prepared tabs are unlocked when one tab is editing');
context.self.clients.matchAll = async () => [client('old-or-suspended', null)];
await context.activateWhenSafe();
assert.equal(skipped, 0, 'an unknown or suspended client must not lose changes');
context.self.clients.matchAll = async () => [client('a', true), client('b', true)];
await context.activateWhenSafe();
assert.equal(skipped, 1);
assert.match(code, /app-updates\.js/, 'update coordination must work offline');

console.log("service-worker: invalida releases previas, preserva v3, separa IndexedDB, precachea config-io y deja CodeMirror lazy OK");
