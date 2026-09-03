const DB_NAME = "schedule-viewer-local";
const DB_VERSION = 1;
const CONFIG_STORE = "config";
const ASSET_STORE = "assets";
const ACTIVE_CONFIG_ID = "active";

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

export function openScheduleDb(factory = globalThis.indexedDB) {
  if (!factory) return Promise.reject(new Error("IndexedDB no está disponible en este navegador."));
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) db.createObjectStore(CONFIG_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("No se pudo abrir IndexedDB.")), { once: true });
  });
}

async function withDb(factory, fn) {
  const db = await openScheduleDb(factory);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export async function loadUserConfig(factory = globalThis.indexedDB) {
  return withDb(factory, async (db) => {
    const tx = db.transaction(CONFIG_STORE, "readonly");
    const record = await requestAsPromise(tx.objectStore(CONFIG_STORE).get(ACTIVE_CONFIG_ID));
    await transactionDone(tx);
    return record ?? null;
  });
}

export async function hasUserConfig(factory = globalThis.indexedDB) {
  return Boolean(await loadUserConfig(factory));
}

export async function getAsset(id, factory = globalThis.indexedDB) {
  if (!id) return null;
  return withDb(factory, async (db) => {
    const tx = db.transaction(ASSET_STORE, "readonly");
    const record = await requestAsPromise(tx.objectStore(ASSET_STORE).get(id));
    await transactionDone(tx);
    return record ?? null;
  });
}

export async function listAssets(factory = globalThis.indexedDB) {
  return withDb(factory, async (db) => {
    const tx = db.transaction(ASSET_STORE, "readonly");
    const records = await requestAsPromise(tx.objectStore(ASSET_STORE).getAll());
    await transactionDone(tx);
    return records ?? [];
  });
}

export async function putAsset(record, factory = globalThis.indexedDB) {
  if (!record?.id || !(record.blob instanceof Blob)) throw new TypeError("Asset inválido.");
  const now = new Date().toISOString();
  const normalized = {
    id: record.id,
    blob: record.blob,
    mimeType: record.mimeType || record.blob.type || "application/octet-stream",
    filename: record.filename || record.id,
    createdAt: record.createdAt || now,
    updatedAt: now
  };
  await withDb(factory, async (db) => {
    const tx = db.transaction(ASSET_STORE, "readwrite");
    tx.objectStore(ASSET_STORE).put(normalized);
    await transactionDone(tx);
  });
  return normalized;
}

export async function deleteAsset(id, factory = globalThis.indexedDB) {
  await withDb(factory, async (db) => {
    const tx = db.transaction(ASSET_STORE, "readwrite");
    tx.objectStore(ASSET_STORE).delete(id);
    await transactionDone(tx);
  });
}

export async function saveUserState({ config, yaml = null, assets = [], source = "local" }, factory = globalThis.indexedDB) {
  if (!config || typeof config !== "object") throw new TypeError("Falta configuración normalizada.");
  const now = new Date().toISOString();
  const record = {
    id: ACTIVE_CONFIG_ID,
    normalized: structuredClone(config),
    yaml: typeof yaml === "string" ? yaml : null,
    version: 3,
    source,
    updatedAt: now
  };

  await withDb(factory, async (db) => {
    const tx = db.transaction([CONFIG_STORE, ASSET_STORE], "readwrite");
    const assetStore = tx.objectStore(ASSET_STORE);
    for (const asset of assets) {
      if (!asset?.id || !(asset.blob instanceof Blob)) {
        tx.abort();
        throw new TypeError(`Asset pendiente inválido: ${asset?.id ?? "(sin id)"}`);
      }
      assetStore.put({
        id: asset.id,
        blob: asset.blob,
        mimeType: asset.mimeType || asset.blob.type || "application/octet-stream",
        filename: asset.filename || asset.id,
        createdAt: asset.createdAt || now,
        updatedAt: now
      });
    }
    tx.objectStore(CONFIG_STORE).put(record);
    await transactionDone(tx);
  });
  return record;
}

export async function deleteUnreferencedAssets(referencedIds, factory = globalThis.indexedDB) {
  const keep = new Set(referencedIds ?? []);
  await withDb(factory, async (db) => {
    const tx = db.transaction(ASSET_STORE, "readwrite");
    const store = tx.objectStore(ASSET_STORE);
    const records = await requestAsPromise(store.getAllKeys());
    for (const id of records) if (!keep.has(id)) store.delete(id);
    await transactionDone(tx);
  });
}

export async function resetUserState({ clearAssets = true } = {}, factory = globalThis.indexedDB) {
  await withDb(factory, async (db) => {
    const stores = clearAssets ? [CONFIG_STORE, ASSET_STORE] : [CONFIG_STORE];
    const tx = db.transaction(stores, "readwrite");
    tx.objectStore(CONFIG_STORE).delete(ACTIVE_CONFIG_ID);
    if (clearAssets) tx.objectStore(ASSET_STORE).clear();
    await transactionDone(tx);
  });
}

function hashText(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isLocalHttpSource(src, baseURI) {
  if (typeof src !== "string" || /^(?:data|blob):/i.test(src)) return false;
  try {
    const resolved = new URL(src, baseURI);
    return resolved.origin === new URL(baseURI).origin;
  } catch {
    return false;
  }
}

async function rewriteCachedImages(node, cache, baseURI, pendingAssets) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) await rewriteCachedImages(item, cache, baseURI, pendingAssets);
    return;
  }
  if (typeof node !== "object") return;

  if (node.type === "image" && typeof node.src === "string" && isLocalHttpSource(node.src, baseURI)) {
    const absolute = new URL(node.src, baseURI).href;
    const response = await cache.match(absolute, { ignoreSearch: true });
    if (response?.ok) {
      const blob = await response.blob();
      const id = `legacy-${hashText(absolute)}`;
      pendingAssets.push({
        id,
        blob,
        mimeType: blob.type,
        filename: absolute.split("/").pop() || id
      });
      delete node.src;
      node.asset = id;
    }
  }

  for (const value of Object.values(node)) await rewriteCachedImages(value, cache, baseURI, pendingAssets);
}

export async function migrateCachedV3Config({
  factory = globalThis.indexedDB,
  cacheStorage = globalThis.caches,
  baseURI = globalThis.location?.href
} = {}) {
  if (!cacheStorage || !baseURI || await hasUserConfig(factory)) return null;
  const names = await cacheStorage.keys();
  const candidates = names.filter((name) => name === "schedule-viewer-offline-v3" || name.startsWith("schedule-viewer-offline-v3-"));

  for (const name of candidates) {
    const cache = await cacheStorage.open(name);
    const configUrl = new URL("./config/schedule.json", baseURI).href;
    const response = await cache.match(configUrl, { ignoreSearch: true });
    if (!response?.ok) continue;
    let config;
    try {
      config = await response.clone().json();
    } catch {
      continue;
    }
    if (config?.version !== 3 || config?.runtime?.demo) continue;

    const migrated = structuredClone(config);
    const pendingAssets = [];
    await rewriteCachedImages(migrated, cache, baseURI, pendingAssets);

    // Los WebP de horarios de una instancia previa no forman parte de la app pública.
    // Al anular sus rutas, el renderer genera SVG dinámico y evita depender del cache antiguo.
    for (const year of migrated.academicYears ?? []) {
      for (const term of year.terms ?? []) term.assets = { week: null, days: {} };
    }
    migrated.runtime = { ...(migrated.runtime ?? {}), demo: false };
    return saveUserState({ config: migrated, yaml: null, assets: pendingAssets, source: "local" }, factory);
  }
  return null;
}

export const LOCAL_DB_NAME = DB_NAME;
