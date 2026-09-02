const CACHE_PREFIX = "ucm-scheduler-";
const CACHE_NAME = `${CACHE_PREFIX}offline-v2-content`;
const SCOPE = self.registration.scope;

const CORE_PATHS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./schedule-core.js",
  "./content-renderer.js"
];

function scoped(path) {
  return new URL(path, SCOPE).href;
}

function addCustomContentPath(paths, descriptor) {
  if (descriptor == null) return;
  const src = typeof descriptor === "string"
    ? descriptor
    : descriptor?.type === "image"
      ? descriptor.src
      : null;
  if (typeof src !== "string" || !src || /^(?:data|blob):/i.test(src)) return;

  try {
    const url = new URL(src, SCOPE);
    if (url.origin === self.location.origin) paths.add(url.href);
  } catch (error) {
    console.warn("Ruta de contenido personalizada inválida:", src, error);
  }
}

function scheduleAssetPaths(config) {
  const paths = new Set();

  for (const path of Object.values(config.states ?? {})) {
    if (typeof path === "string" && path) paths.add(scoped(path));
  }

  for (const descriptor of Object.values(config.content?.states ?? {})) {
    addCustomContentPath(paths, descriptor);
  }

  for (const year of config.academicYears ?? []) {
    for (const term of year.terms ?? []) {
      if (term.assets?.week) paths.add(scoped(term.assets.week));
      for (const path of Object.values(term.assets?.days ?? {})) {
        if (path) paths.add(scoped(path));
      }

      addCustomContentPath(paths, term.content?.week);
      for (const descriptor of Object.values(term.content?.days ?? {})) {
        addCustomContentPath(paths, descriptor);
      }
    }
  }

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
    const configUrl = scoped("./config/schedules.json");
    const configResponse = await fetch(configUrl, { cache: "reload" });

    if (!configResponse.ok) {
      throw new Error(`No se pudo precachear schedules.json: ${configResponse.status}`);
    }

    const config = await configResponse.clone().json();
    await cache.put(configUrl, configResponse.clone());
    await cache.addAll(CORE_PATHS.map(scoped));
    await cacheOptionalAssets(cache, scheduleAssetPaths(config));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
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
    if (response.ok) {
      await cache.put(scoped("./config/schedules.json"), response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cachedIgnoringVersion(cache, request)
      ?? await cache.match(scoped("./config/schedules.json"), { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(scoped("./index.html"), response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(scoped("./index.html"), { ignoreSearch: true })
      ?? await cache.match(scoped("./"), { ignoreSearch: true });
    if (cached) return cached;
    throw error;
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
  } catch (error) {
    return new Response("Recurso no disponible sin conexión", {
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

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.endsWith("/config/schedules.json")) {
    event.respondWith(networkFirstConfig(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
