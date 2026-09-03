import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import {
  cleanupLegacyMigrationCaches,
  deleteAsset,
  deleteUnreferencedAssets,
  getAsset,
  hasUserConfig,
  listAssets,
  loadUserConfig,
  migrateCachedV3Config,
  putAsset,
  resetUserState,
  saveUserState
} from "../local-store.js";
import { makeConfig } from "./fixture-config.mjs";

await resetUserState();
assert.equal(await hasUserConfig(), false);
assert.equal(await loadUserConfig(), null);
assert.deepEqual(await listAssets(), []);

const config = makeConfig();
config.calendar.inactive.defaultImage = { type: "image", asset: "default-local", fit: "contain", alt: "Local" };
const firstBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
await saveUserState({
  config,
  yaml: "version: 3\n",
  assets: [{ id: "default-local", blob: firstBlob, filename: "default.png", mimeType: "image/png" }]
});

assert.equal(await hasUserConfig(), true);
let stored = await loadUserConfig();
assert.equal(stored.source, "local");
assert.equal(stored.version, 3);
assert.equal(stored.normalized.calendar.inactive.defaultImage.asset, "default-local");
assert.equal(stored.yaml, "version: 3\n");

let asset = await getAsset("default-local");
assert.equal(asset.filename, "default.png");
assert.equal(asset.mimeType, "image/png");
assert.equal(asset.blob.size, 4);

const replacement = new Blob([new Uint8Array([9, 8, 7, 6, 5])], { type: "image/gif" });
await putAsset({ id: "default-local", blob: replacement, filename: "animated.gif", mimeType: "image/gif", createdAt: asset.createdAt });
asset = await getAsset("default-local");
assert.equal(asset.blob.size, 5);
assert.equal(asset.mimeType, "image/gif");
assert.equal(asset.filename, "animated.gif");

await putAsset({ id: "orphan", blob: new Blob(["x"], { type: "image/png" }), filename: "orphan.png" });
assert.equal((await listAssets()).length, 2);
await deleteUnreferencedAssets(["default-local"]);
assert.deepEqual((await listAssets()).map((item) => item.id), ["default-local"]);

const beforeFailure = await loadUserConfig();
await assert.rejects(
  saveUserState({
    config: { ...config, app: { ...config.app, title: "NO DEBE GUARDARSE" } },
    assets: [{ id: "broken", blob: "esto no es un Blob" }]
  }),
  /Asset pendiente inválido/
);
const afterFailure = await loadUserConfig();
assert.equal(afterFailure.normalized.app.title, beforeFailure.normalized.app.title, "la transacción fallida no debe sustituir la config anterior");
assert.equal(await getAsset("broken"), null, "la transacción fallida no debe dejar assets parciales");

await deleteAsset("default-local");
assert.equal(await getAsset("default-local"), null);
await resetUserState();
assert.equal(await hasUserConfig(), false);
assert.deepEqual(await listAssets(), []);

// Migración desde la última versión privada: la cache v3 debe sobrevivir hasta
// que configuración e imágenes estén dentro de una única transacción local.
const legacy = makeConfig();
legacy.runtime = { ...legacy.runtime, demo: false };
const baseURI = "https://example.test/schedule-viewer/";
const configUrl = new URL("./config/schedule.json", baseURI).href;
const responseMap = new Map();
responseMap.set(configUrl, new Response(JSON.stringify(legacy), {
  status: 200,
  headers: { "Content-Type": "application/json" }
}));
for (const [path, type, bytes] of [
  ["assets/states/inactive.webp", "image/webp", [1, 1, 1]],
  ["assets/states/vacations.webp", "image/webp", [2, 2, 2]],
  ["assets/q1/week.webp", "image/webp", [3, 3, 3, 3]],
  ["assets/q1/monday.webp", "image/webp", [4, 4, 4, 4, 4]]
]) {
  responseMap.set(new URL(path, baseURI).href, new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": type }
  }));
}

const deletedCaches = [];
const legacyCache = {
  async match(request) {
    const key = typeof request === "string" ? request : request.url;
    return responseMap.get(key)?.clone() ?? undefined;
  }
};
const cacheStorage = {
  async keys() { return ["schedule-viewer-offline-v3", "another-app-cache"]; },
  async open(name) {
    assert.equal(name, "schedule-viewer-offline-v3");
    return legacyCache;
  },
  async delete(name) {
    deletedCaches.push(name);
    return true;
  }
};

const migrated = await migrateCachedV3Config({ cacheStorage, baseURI });
assert.equal(migrated.source, "local");
assert.equal(migrated.normalized.runtime.demo, false);
assert.match(migrated.normalized.calendar.inactive.defaultImage.asset, /^legacy-/);
assert.match(migrated.normalized.rules[1].content.asset, /^legacy-/);
assert.match(migrated.normalized.academicYears[0].terms[0].content.week.asset, /^legacy-/);
assert.match(migrated.normalized.academicYears[0].terms[0].content.days.monday.asset, /^legacy-/);
assert.equal(migrated.normalized.academicYears[0].terms[0].assets.week, "assets/q1/week.webp", "las rutas originales se conservan como fallback estructural");

const migratedAssets = await listAssets();
const migratedNames = new Set(migratedAssets.map((item) => item.filename));
assert.ok(migratedNames.has("inactive.webp"));
assert.ok(migratedNames.has("vacations.webp"));
assert.ok(migratedNames.has("week.webp"));
assert.ok(migratedNames.has("monday.webp"));
assert.deepEqual(deletedCaches, ["schedule-viewer-offline-v3"], "la cache v3 se elimina únicamente después de guardar la migración");

// Una instalación ya migrada también puede limpiar restos v3 sin tocar caches ajenas.
const cleanupDeletes = [];
const cleaned = await cleanupLegacyMigrationCaches({
  cacheStorage: {
    async keys() { return ["schedule-viewer-offline-v3-old", "schedule-viewer-offline-v4", "other"]; },
    async delete(name) { cleanupDeletes.push(name); return true; }
  }
});
assert.deepEqual(cleaned, ["schedule-viewer-offline-v3-old"]);
assert.deepEqual(cleanupDeletes, ["schedule-viewer-offline-v3-old"]);

await resetUserState();
console.log("local-store: config, Blob, atomicidad y migración v3 lossless a IndexedDB OK");
