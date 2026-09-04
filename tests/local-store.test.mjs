import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import {
  cleanupLegacyMigrationCaches, deleteAsset, deleteUnreferencedAssets, getAsset,
  hasUserConfig, listAssets, loadUserConfig, openScheduleDb, putAsset, resetUserState, saveUserState
} from "../local-store.js";
import { makeConfig } from "./fixture-config.mjs";

await resetUserState();
assert.equal(await hasUserConfig(), false);
const config = makeConfig();
config.periods[0].images.active.vertical.default = { type: "image", asset: "default-local", fit: "contain", alt: "Local" };
const bytes = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0]);
await saveUserState({
  config, yaml: "version: 4\n", source: "local",
  assets: [{ id: "default-local", blob: new Blob([bytes], { type: "image/gif" }), filename: "animated.gif", mimeType: "image/gif" }]
});
const stored = await loadUserConfig();
assert.equal(stored.version, 4);
assert.equal(stored.normalized.periods[0].images.active.vertical.default.asset, "default-local");
const gif = await getAsset("default-local");
assert.equal(gif.filename, "animated.gif");
assert.equal(gif.mimeType, "image/gif");
assert.deepEqual(new Uint8Array(await gif.blob.arrayBuffer()), bytes);
const rawDb = await openScheduleDb();
const rawTransaction = rawDb.transaction("assets", "readonly");
const rawAsset = await new Promise((resolve, reject) => {
  const request = rawTransaction.objectStore("assets").get("default-local");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
rawDb.close();
assert.equal(rawAsset.blob, undefined);
assert.deepEqual(new Uint8Array(rawAsset.bytes), bytes);

const legacyDb = await openScheduleDb();
const legacyTransaction = legacyDb.transaction("assets", "readwrite");
legacyTransaction.objectStore("assets").put({ id: "legacy-blob", blob: new Blob([bytes], { type: "image/gif" }), mimeType: "image/gif", filename: "legacy.gif" });
await new Promise((resolve, reject) => {
  legacyTransaction.oncomplete = resolve;
  legacyTransaction.onerror = () => reject(legacyTransaction.error);
  legacyTransaction.onabort = () => reject(legacyTransaction.error);
});
legacyDb.close();
const legacyAsset = await getAsset("legacy-blob");
assert.deepEqual(new Uint8Array(await legacyAsset.blob.arrayBuffer()), bytes);
await deleteAsset("legacy-blob");

await assert.rejects(putAsset({ id: "svg", blob: new Blob(["<svg/>"], { type: "image/svg+xml" }), filename: "x.svg" }), /SVG/);
await putAsset({ id: "orphan", blob: new Blob([new Uint8Array([137, 80])], { type: "image/png" }), filename: "orphan.png" });
await deleteUnreferencedAssets(["default-local"]);
assert.deepEqual((await listAssets()).map(item => item.id), ["default-local"]);

const before = await loadUserConfig();
await assert.rejects(saveUserState({ config, assets: [{ id: "broken", blob: "not-a-blob" }] }), /inválido/);
assert.deepEqual((await loadUserConfig()).normalized, before.normalized);
assert.equal(await getAsset("broken"), null);
await deleteAsset("default-local");
assert.equal(await getAsset("default-local"), null);

const deleted = [];
assert.deepEqual(await cleanupLegacyMigrationCaches({ cacheStorage: {
  async keys() { return ["schedule-viewer-offline-v3", "schedule-viewer-offline-v3-old", "schedule-viewer-offline-v4", "other"]; },
  async delete(name) { deleted.push(name); return true; }
} }), ["schedule-viewer-offline-v3", "schedule-viewer-offline-v3-old"]);
assert.deepEqual(deleted, ["schedule-viewer-offline-v3", "schedule-viewer-offline-v3-old"]);

await resetUserState();
console.log("local-store: v4, bytes GIF, atomicidad, limpieza y rechazo SVG OK");
