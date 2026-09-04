const CACHE_PREFIX = "schedule-viewer-";
const LEGACY_CACHE_PREFIXES = ["schedule-viewer-offline-v2"];
const MIGRATION_CACHE_PREFIX = "schedule-viewer-offline-v3";
const LEGACY_IMMEDIATE_UPDATE_CACHES = ["schedule-viewer-offline-20260903-v4-6"];
const RELEASE_ID = "20260904-v5-0";
// A separate cache per release prevents unchanged lazy URLs from retaining old code.
const CACHE_NAME = `${CACHE_PREFIX}offline-${RELEASE_ID}`;
const SCOPE = self.registration.scope;

const CORE_PATHS = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./styles.css",
  "./settings-responsive.css",
  "./apple-liquid-glass.css",
  "./app.js",
  "./app-updates.js",
  "./apple-glass.js",
  "./schedule-core.js",
  "./date-core.js",
  "./range-core.js",
  "./view-core.js",
  "./calendar-core.js",
  "./content-core.js",
  "./content-renderer.js",
  "./runtime-renderer.js",
  "./local-store.js",
  "./asset-resolver.js",
  "./device-ui.js",
  "./config-schema.js",
  "./settings-ui.js",
  "./settings-motion.js",
  "./settings-gestures.js",
  "./lazy/config-io.js"
];

function scoped(path) {
  return new URL(path, SCOPE).href;
}

function addLocalAsset(paths, src) {
  if (typeof src !== "string" || !src || /^(?:data|blob):/i.test(src)) return;
  try {
    const url = new URL(src, SCOPE);
    if (url.origin === self.location.origin) paths.add(url.href);
  } catch (error) {
    console.warn("Ruta de asset inválida:", src, error);
  }
}

function discoverImageDescriptors(paths, node) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) discoverImageDescriptors(paths, item);
    return;
  }
  if (typeof node !== "object") return;
  if (node.type === "image" && typeof node.src === "string") addLocalAsset(paths, node.src);
  for (const value of Object.values(node)) discoverImageDescriptors(paths, value);
}

function scheduleAssetPaths(config) {
  const paths = new Set();
  discoverImageDescriptors(paths, config.calendar);
  discoverImageDescriptors(paths, config.periods);
  return [...paths];
}

async function cacheOptionalAssets(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response.clone());
    } catch (error) {
      console.warn("No se pudo precachear un asset opcional:", url, error);
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const configUrl = scoped("./config/schedule.json");
    const configResponse = await fetch(configUrl, { cache: "reload" });
    if (!configResponse.ok) throw new Error(`No se pudo precachear schedule.json: ${configResponse.status}`);
    const config = await configResponse.clone().json();
    await cache.put(configUrl, configResponse.clone());
    await cache.addAll(CORE_PATHS.map((path) => new Request(scoped(path), { cache: "reload" })));
    await cache.addAll(CORE_PATHS.filter(path => /\.(js|css)$/.test(path))
      .map(path => new Request(scoped(path.replace("./", `./releases/${RELEASE_ID}/`)), { cache: "reload" })));
    await cacheOptionalAssets(cache, scheduleAssetPaths(config));
    // v4.6 predates coordinated updates. Promote this bridge worker without
    // reloading its old client, so the next navigation receives the new menu.
    const cacheNames = await caches.keys();
    if (cacheNames.some(name => LEGACY_IMMEDIATE_UPDATE_CACHES.includes(name))) await self.skipWaiting();
    // Later releases coordinate activation with every open app before reload.
  })());
});

let activationAttempt = null;
async function activateWhenSafe() {
  const clients = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter(client => client.url.startsWith(SCOPE));
  const answers = await Promise.all(clients.map(client => new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = safe => { clearTimeout(timer); channel.port1.close(); resolve(safe); };
    const timer = setTimeout(() => finish(false), 3000);
    channel.port1.onmessage = event => finish(event.data?.safe === true);
    try { client.postMessage({ type: "PREPARE_UPDATE" }, [channel.port2]); }
    catch { finish(false); }
  })));
  const current = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter(client => client.url.startsWith(SCOPE));
  if (answers.every(Boolean) && current.every(client => clients.some(known => known.id === client.id))) {
    await self.skipWaiting();
  } else {
    for (const client of clients) client.postMessage({ type: "CANCEL_UPDATE" });
  }
}
self.addEventListener("message", event => {
  if (event.data?.type !== "ACTIVATE_UPDATE" || !event.source?.url?.startsWith(SCOPE)) return;
  activationAttempt ??= activateWhenSafe().finally(() => { activationAttempt = null; });
  event.waitUntil(activationAttempt);
});

function isMigrationCache(name) {
  return name === MIGRATION_CACHE_PREFIX || name.startsWith(`${MIGRATION_CACHE_PREFIX}-`);
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const ownedPrefixes = [CACHE_PREFIX, ...LEGACY_CACHE_PREFIXES];
    await Promise.all(
      names
        .filter((name) => name !== CACHE_NAME)
        .filter((name) => !isMigrationCache(name))
        .filter((name) => ownedPrefixes.some((prefix) => name.startsWith(prefix)))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function cachedIgnoringVersion(cache, request) {
  return cache.match(request, { ignoreSearch: true });
}

async function networkFirstConfig(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cachedIgnoringVersion(cache, request);
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (
      await cache.match(scoped("./index.html")) ||
      await cache.match(scoped("./")) ||
      new Response("Schedule Viewer no está disponible sin conexión.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cachedIgnoringVersion(cache, request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Recurso no disponible sin conexión.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/config/schedule.json")) {
    event.respondWith(networkFirstConfig(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
