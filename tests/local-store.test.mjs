import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import {
  deleteAsset,
  deleteUnreferencedAssets,
  getAsset,
  hasUserConfig,
  listAssets,
  loadUserConfig,
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

console.log("local-store: config, Blob, reemplazo, limpieza y atomicidad IndexedDB OK");
