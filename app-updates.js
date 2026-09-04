// Updates are prepared in a separate cache and activated only when every open
// client can reload. No local configuration or image data is touched here.
export function initAppUpdates({ isSafeToReload = () => false } = {}) {
  if (!("serviceWorker" in navigator)) return { check() {}, reconsider() {} };
  const workers = navigator.serviceWorker;
  let registration;
  let checking = false;
  let starting = false;
  let lastCheck = -Infinity;
  let hadController = Boolean(workers.controller);
  let changedController = false;
  let reloading = false;
  let locked = false;
  let unlockTimer;
  let pending = false;
  let lastAttempt = -Infinity;
  const notices = document.querySelectorAll("[data-app-update-notice]");

  function showPending(value) {
    pending = value;
    document.documentElement.dataset.appUpdate = value ? "pending" : "current";
    for (const notice of notices) {
      notice.hidden = !value;
      notice.textContent = "Update available. It will be applied after Settings is closed in every tab; save your changes first.";
    }
  }

  function unlock() {
    clearTimeout(unlockTimer);
    if (locked) document.body.inert = false;
    locked = false;
  }

  function reload() {
    if (reloading || !isSafeToReload()) return;
    reloading = true;
    document.documentElement.dataset.appUpdate = "reloading";
    window.location.reload();
  }

  function reconsider() {
    if (changedController) return reload();
    if (!workers.controller || !registration?.waiting) return;
    showPending(true);
    if (!isSafeToReload() || locked || document.hidden || performance.now() - lastAttempt < 1000) return;
    lastAttempt = performance.now();
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }

  workers.addEventListener("message", event => {
    if (event.data?.type === "PREPARE_UPDATE") {
      const safe = isSafeToReload() && !reloading;
      showPending(true);
      if (safe) {
        locked = true;
        document.body.inert = true;
        clearTimeout(unlockTimer);
        // A stopped worker must never leave the UI permanently inert.
        unlockTimer = setTimeout(unlock, 8000);
      }
      event.ports[0]?.postMessage({ safe });
    } else if (event.data?.type === "CANCEL_UPDATE") {
      unlock();
    }
  });

  workers.addEventListener("controllerchange", () => {
    unlock();
    if (!hadController) {
      hadController = true; // Initial installation is not an update.
      showPending(false);
      return;
    }
    changedController = true;
    showPending(true);
    reload();
  });

  // Global app shortcuts must not open an editor after this tab voted ready.
  window.addEventListener("keydown", event => {
    if (locked) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true });

  async function check({ force = false } = {}) {
    reconsider();
    if (checking || starting || document.hidden || navigator.onLine === false) return;
    const elapsed = performance.now() - lastCheck;
    if (elapsed < (force ? 10000 : 5 * 60000)) return;
    checking = true;
    lastCheck = performance.now();
    try {
      if (!registration) { await start(); return; }
      await registration.update();
      reconsider();
    } catch {
      // Offline, captive portals and temporary server failures retain the app.
    } finally { checking = false; }
  }

  function watchInstalling() {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      // waiting may not be populated until the installed event finishes.
      if (installing.state === "installed") setTimeout(reconsider, 0);
    });
  }

  async function start() {
    if (starting) return;
    starting = true;
    lastCheck = performance.now();
    try {
      registration = await workers.register("./service-worker.js", { scope: "./", updateViaCache: "none" });
      registration.addEventListener("updatefound", watchInstalling);
      watchInstalling();
      reconsider();
      // register already performs an update check; do not immediately duplicate it.
      lastCheck = performance.now();
      await workers.ready;
      document.documentElement.dataset.offlineReady = "1";
    } catch {
      document.documentElement.dataset.offlineReady = "0";
    } finally { starting = false; }
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden) void check({ force: true }); });
  window.addEventListener("pageshow", () => void check({ force: true }));
  window.addEventListener("online", () => void check({ force: true }));
  // Short local retries coordinate tabs; network checks remain five minutes apart.
  setInterval(() => void check(), 15000);
  if (document.readyState === "complete") void start();
  else window.addEventListener("load", start, { once: true });
  showPending(false);
  return { check, reconsider, get pending() { return pending; } };
}
