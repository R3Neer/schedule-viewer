import { test, expect } from "@playwright/test";

const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGNkYPjPwMDAwMDAxAADABErAQPdiBRnAAAAAElFTkSuQmCC",
  "base64"
);
const GIF_BUFFER = Buffer.from(
  "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEA/wAAAAAAAAAAAAAIBgABCAQQEAA7",
  "base64"
);

async function mockInputEnvironment(page, { touch = false, apple = false } = {}) {
  await page.addInitScript(({ touch, apple }) => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    const forcedMql = (query, matches) => ({
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; }
    });
    window.matchMedia = (query) => {
      if (query === "(pointer: coarse)") return forcedMql(query, touch);
      if (query === "(pointer: fine)") return forcedMql(query, !touch);
      if (query === "(hover: none)") return forcedMql(query, touch);
      return nativeMatchMedia(query);
    };
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => touch ? 5 : 0 });
    if (apple) {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        get: () => touch
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1"
          : "Mozilla/5.0 (Macintosh; Intel Mac OS X 26_0) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15"
      });
      Object.defineProperty(navigator, "platform", { configurable: true, get: () => touch ? "iPhone" : "MacIntel" });
    }
  }, { touch, apple });
}

async function openTouch(page, date = "2026-09-09", { apple = true, width = 402, height = 874 } = {}) {
  await mockInputEnvironment(page, { touch: true, apple });
  await page.setViewportSize({ width, height });
  await page.goto(`/?date=${date}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-device-mode", "touch");
  await expect(page.locator("#schedule-image")).toBeVisible();
}

async function openDesktop(page, date = "2026-09-09", { apple = false } = {}) {
  await mockInputEnvironment(page, { touch: false, apple });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?date=${date}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-device-mode", "desktop");
  await expect(page.locator("#schedule-image")).toBeVisible();
}

async function openSettings(page) {
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("open", "");
}

async function closeSettings(page) {
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings-dialog")).not.toHaveAttribute("open", "");
}

async function saveSettings(page) {
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado en este dispositivo");
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
}

async function chooseImage(page, rowText, file) {
  const row = page.locator(".image-setting").filter({ hasText: rowText });
  const chooserPromise = page.waitForEvent("filechooser");
  await row.getByRole("button", { name: /Cambiar|Usar imagen específica/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

async function waitForServiceWorkerControl(page) {
  await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1", { timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Service Worker sin control")), 8_000);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function expectNoViewportScroll(page) {
  await expect.poll(() => page.evaluate(() => ({
    x: document.documentElement.scrollWidth <= window.innerWidth + 1,
    y: document.documentElement.scrollHeight <= window.innerHeight + 1
  }))).toEqual({ x: true, y: true });
}

test("iPhone abre la demo diaria con tema Apple y aviso de personalización", async ({ page }) => {
  await openTouch(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-ui-theme", "apple");
  await expect(html).toHaveAttribute("data-config-source", "demo");
  await expect(html).toHaveAttribute("data-view-profile", "touch_portrait");
  await expect(html).toHaveAttribute("data-range-type", "day");
  await expect(page.locator("#demo-hint")).toBeVisible();
  await expect(page.locator("#demo-hint")).toContainText("Personaliza tu horario desde Ajustes");
  await expectNoViewportScroll(page);
});

test("en touch Ajustes muestra solo Vertical/Horizontal y el engranaje se oculta y reaparece", async ({ page }) => {
  await openTouch(page);
  const cog = page.locator("#settings-button");
  await expect(cog).not.toHaveClass(/is-hidden/);
  await expect(cog).toHaveClass(/is-hidden/, { timeout: 5_000 });
  await page.locator(".schedule-shell").dispatchEvent("pointerdown");
  await expect(cog).not.toHaveClass(/is-hidden/);
  await openSettings(page);
  await expect(page.getByLabel("Vertical")).toBeVisible();
  await expect(page.getByLabel("Horizontal")).toBeVisible();
  await expect(page.getByLabel("Principal")).toHaveCount(0);
  await expect(page.getByLabel("Secundaria")).toHaveCount(0);
});

test("el aviso demo abre Ajustes directamente", async ({ page }) => {
  await openTouch(page);
  await page.locator("#demo-hint").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("open", "");
  await expect(page.locator("#settings-source")).toHaveText("Configuración demo");
});

test("en escritorio Ajustes muestra Principal/Secundaria, Ctrl+, abre y Escape cierra", async ({ page }) => {
  await openDesktop(page);
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "generic");
  await page.keyboard.press("Control+Comma");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Principal")).toBeVisible();
  await expect(page.getByLabel("Secundaria")).toBeVisible();
  await expect(page.getByLabel("Vertical")).toHaveCount(0);
  await expect(page.getByLabel("Horizontal")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-dialog")).not.toHaveAttribute("open", "");
});

test("Cmd+, abre Ajustes en el entorno Apple de escritorio", async ({ page }) => {
  await openDesktop(page, "2026-09-09", { apple: true });
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "apple");
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", {
    key: ",", metaKey: true, bubbles: true, cancelable: true
  })));
  await expect(page.locator("#settings-dialog")).toHaveAttribute("open", "");
});

test("Space alterna la vista primaria y secundaria sin reload ni scroll", async ({ page }) => {
  await openDesktop(page);
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "week");
  await page.evaluate(() => { window.__sameDocument = crypto.randomUUID(); });
  const sentinel = await page.evaluate(() => window.__sameDocument);
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "desktop_portrait");
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "day");
  expect(await page.evaluate(() => window.__sameDocument)).toBe(sentinel);
  await expectNoViewportScroll(page);
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  expect(await page.evaluate(() => window.__sameDocument)).toBe(sentinel);
});

test("Space no actúa mientras Ajustes está abierto", async ({ page }) => {
  await openDesktop(page);
  await openSettings(page);
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
});

test("girar un dispositivo touch cambia de día a semana sin recargar", async ({ page }) => {
  await openTouch(page);
  await page.evaluate(() => { window.__orientationSentinel = "alive"; });
  await page.setViewportSize({ width: 874, height: 402 });
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "touch_landscape");
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "week");
  expect(await page.evaluate(() => window.__orientationSentinel)).toBe("alive");
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "touch_portrait");
  expect(await page.evaluate(() => window.__orientationSentinel)).toBe("alive");
});

test("la GUI puede convertir la vista principal en mensual y persiste tras reload", async ({ page }) => {
  await openDesktop(page);
  await openSettings(page);
  await page.getByLabel("Principal").selectOption("month");
  await saveSettings(page);
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "month");
  await expect(page.locator("html")).toHaveAttribute("data-range-start", "2026-09-01");
  await expect(page.locator("html")).toHaveAttribute("data-range-end", "2026-09-30");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "month");
  await expect(page.locator("#demo-hint")).toBeHidden();
});

test("los weekdays inactivos se pueden eliminar completamente desde la GUI", async ({ page }) => {
  await openTouch(page, "2026-09-13");
  await expect(page.locator("html")).toHaveAttribute("data-calendar-status", "inactive-weekday");
  await openSettings(page);
  const saturday = page.locator('#inactive-settings input[value="saturday"]');
  const sunday = page.locator('#inactive-settings input[value="sunday"]');
  await saturday.uncheck();
  await sunday.uncheck();
  await saveSettings(page);
  await closeSettings(page);
  await expect(page.locator("html")).toHaveAttribute("data-calendar-status", "normal");
  await expect(page.locator("html")).toHaveAttribute("data-content-type", "generated-schedule");
});

test("una imagen local para el estado inactivo se guarda como Blob y sobrevive al reload", async ({ page }) => {
  await openTouch(page, "2026-10-12");
  await expect(page.locator("html")).toHaveAttribute("data-calendar-status", "holiday");
  await openSettings(page);
  await page.getByRole("tab", { name: "Imágenes" }).click();
  await chooseImage(page, "Imagen por defecto", {
    name: "local-default.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER
  });
  await saveSettings(page);
  await closeSettings(page);
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => page.locator("#schedule-image").evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([3, 2]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => page.locator("#schedule-image").evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([3, 2]);
});

test("un GIF local conserva su MIME y se renderiza mediante Blob", async ({ page }) => {
  await openTouch(page, "2026-10-12");
  await openSettings(page);
  await page.getByRole("tab", { name: "Imágenes" }).click();
  await chooseImage(page, "Imagen por defecto", {
    name: "animated.gif",
    mimeType: "image/gif",
    buffer: GIF_BUFFER
  });
  await saveSettings(page);
  await closeSettings(page);
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  const types = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("schedule-viewer-local");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("assets", "readonly");
    const records = await new Promise((resolve, reject) => {
      const req = tx.objectStore("assets").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records.map((item) => item.mimeType);
  });
  expect(types).toContain("image/gif");
});

test("guardar cualquier personalización elimina el aviso de demo", async ({ page }) => {
  await openTouch(page);
  await expect(page.locator("#demo-hint")).toBeVisible();
  await openSettings(page);
  await page.getByLabel("Vertical").selectOption("month");
  await saveSettings(page);
  await expect(page.locator("#demo-hint")).toBeHidden();
  await closeSettings(page);
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
});

test("exportar .schedule, restablecer e importar restaura configuración e imagen", async ({ page }) => {
  await openTouch(page, "2026-10-12");
  await openSettings(page);
  await page.getByRole("tab", { name: "Imágenes" }).click();
  await chooseImage(page, "Imagen por defecto", {
    name: "backup.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER
  });
  await saveSettings(page);
  await page.getByRole("tab", { name: "Copia de seguridad" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backup-export").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.schedule$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#backup-reset").click();
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "demo");
  await page.getByRole("tab", { name: "Copia de seguridad" }).click();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#backup-import").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(downloadPath);
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
  await closeSettings(page);
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => page.locator("#schedule-image").evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([3, 2]);
});

test("CodeMirror/Lezer no se descarga al abrir la app y sí al abrir Editar YAML", async ({ page }) => {
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));
  await openDesktop(page);
  expect(requested.some((url) => url.includes("lazy/yaml-editor.js"))).toBe(false);
  await openSettings(page);
  await page.getByRole("tab", { name: "Avanzado" }).click();
  expect(requested.some((url) => url.includes("lazy/yaml-editor.js"))).toBe(false);
  await page.locator("#yaml-edit").click();
  await expect(page.locator("html")).toHaveAttribute("data-yaml-editor-loaded", "1");
  await expect(page.locator(".cm-editor")).toBeVisible();
  expect(requested.some((url) => url.includes("lazy/yaml-editor.js"))).toBe(true);
});

test("el editor YAML detecta errores sintácticos y bloquea Aplicar", async ({ page }) => {
  await openDesktop(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Avanzado" }).click();
  await page.locator("#yaml-edit").click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("version: [\n");
  await expect(page.locator("#yaml-status")).not.toHaveText("YAML válido.");
  await expect(page.locator("#yaml-apply")).toBeDisabled();
  await expect(page.locator(".cm-diagnostic-error")).toHaveCount(1, { timeout: 5_000 });
});

test("el editor YAML detecta errores semánticos de Schedule Viewer", async ({ page }) => {
  await openDesktop(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Avanzado" }).click();
  await page.locator("#yaml-edit").click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("version: 3\n");
  await expect(page.locator("#yaml-status")).toContainText("app");
  await expect(page.locator("#yaml-apply")).toBeDisabled();
});

test("un YAML válido puede aplicarse y pasa a ser configuración local", async ({ page }) => {
  await openDesktop(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Avanzado" }).click();
  await page.locator("#yaml-edit").click();
  await expect(page.locator("#yaml-status")).toHaveText("YAML válido.");
  await expect(page.locator("#yaml-apply")).toBeEnabled();
  await page.locator("#yaml-apply").click();
  await expect(page.locator("#yaml-status")).toHaveText("YAML aplicado y guardado.");
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
});

test("vacaciones horizontales usan su imagen y los festivos horizontales mantienen el horario", async ({ page }) => {
  await openTouch(page, "2026-12-25", { width: 874, height: 402 });
  await expect(page.locator("html")).toHaveAttribute("data-calendar-status", "vacation");
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /assets\/states\/vacations-horizontal\.webp$/);
  await page.goto("/?date=2026-10-12", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-calendar-status", "holiday");
  await expect(page.locator("html")).toHaveAttribute("data-content-type", "generated-schedule");
});

test("la configuración y un asset local siguen funcionando offline junto con Ajustes", async ({ page, context }) => {
  await openTouch(page, "2026-10-12");
  await waitForServiceWorkerControl(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Imágenes" }).click();
  await chooseImage(page, "Imagen por defecto", {
    name: "offline.png",
    mimeType: "image/png",
    buffer: PNG_BUFFER
  });
  await saveSettings(page);
  await closeSettings(page);
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await openSettings(page);
  await expect(page.getByLabel("Vertical")).toBeVisible();
  await page.getByLabel("Vertical").selectOption("month");
  await saveSettings(page);
  await expect(page.locator("html")).toHaveAttribute("data-range-type", "month");
  await context.setOffline(false);
});

test("el Service Worker no borra una cache v3 antes de la migración", async ({ page }) => {
  await openDesktop(page);
  await waitForServiceWorkerControl(page);
  const cacheState = await page.evaluate(async () => {
    await caches.open("schedule-viewer-offline-v3-synthetic");
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return caches.keys();
  });
  expect(cacheState).toContain("schedule-viewer-offline-v3-synthetic");
});
