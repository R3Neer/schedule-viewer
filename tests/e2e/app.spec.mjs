import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { stringify } from "yaml";
import { decompileConfig } from "../../config-schema.js";

const baseConfig = JSON.parse(fs.readFileSync(new URL("../../dist/config/schedule.json", import.meta.url), "utf8"));
const baseYaml = stringify(decompileConfig(baseConfig), { lineWidth: 0 });
const semanticBadYaml = baseYaml.replace("range: day", "range: fortnightish");
const PNG_IMAGE = {
  name: "local.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGNkYPjPwMDAwMDAxAADABErAQPdiBRnAAAAAElFTkSuQmCC", "base64")
};
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36";

async function expectRendered(page, { kind, viewProfile, rangeType, calendarStatus, configSource, width, height, src, contentType }) {
  const html = page.locator("html");
  if (kind) await expect(html).toHaveAttribute("data-view", kind);
  if (viewProfile) await expect(html).toHaveAttribute("data-view-profile", viewProfile);
  if (rangeType) await expect(html).toHaveAttribute("data-range-type", rangeType);
  if (calendarStatus) await expect(html).toHaveAttribute("data-calendar-status", calendarStatus);
  if (configSource) await expect(html).toHaveAttribute("data-config-source", configSource);
  if (contentType) await expect(html).toHaveAttribute("data-content-type", contentType);
  await expect(page.locator("#error-message")).toBeHidden();
  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  if (src) await expect(image).toHaveAttribute("src", src);
  if (width != null && height != null) {
    await expect.poll(() => image.evaluate((node) => ({ complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }))).toEqual({ complete: true, width, height });
  }
}

async function expectNoViewportScroll(page) {
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= window.innerWidth + 1,
    vertical: document.documentElement.scrollHeight <= window.innerHeight + 1
  }))).toEqual({ horizontal: true, vertical: true });
}

async function openSettings(page, tab = null) {
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  if (tab) await page.getByRole("tab", { name: tab }).click();
}

async function closeSettings(page) {
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings-dialog")).toBeHidden();
}

async function chooseDefaultImage(page) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".image-setting").first().getByRole("button", { name: "Cambiar" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(PNG_IMAGE);
}

async function saveSettings(page) {
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado", { timeout: 10_000 });
  await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
}

async function waitForServiceWorker(page) {
  await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1", { timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("El Service Worker no tomó control")), 8_000);
      navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("schedule-viewer-offline-v4"))).toBe(true);
}

async function localAssetCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("schedule-viewer-local", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("assets", "readonly");
      const count = tx.objectStore("assets").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
      tx.oncomplete = () => db.close();
    };
  }));
}

test.describe("iPhone / Apple", () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });

  test("demo diaria, Liquid-Glass web y aviso de personalización", async ({ page }) => {
    await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
    await expectRendered(page, { kind: "day", viewProfile: "touch_portrait", rangeType: "day", calendarStatus: "normal", configSource: "demo", width: 1000, height: 1850, src: /^data:image\/svg\+xml/, contentType: "generated-schedule" });
    await expect(page.locator("html")).toHaveAttribute("data-device-mode", "touch");
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "apple");
    await expect(page.locator("#demo-hint")).not.toHaveClass(/is-hidden/);
    expect(await page.locator("#settings-button").evaluate((node) => getComputedStyle(node).backdropFilter)).toContain("blur");
    await expectNoViewportScroll(page);
  });

  test("Ajustes touch solo muestra Vertical/Horizontal y el engranaje se autooculta", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    const gear = page.locator("#settings-button");
    await expect(gear).toHaveClass(/is-hidden/, { timeout: 6_000 });
    await page.touchscreen.tap(20, 300);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await openSettings(page);
    const labels = await page.locator(".settings-row-label").allTextContents();
    expect(labels).toEqual(expect.arrayContaining(["Vertical", "Horizontal"]));
    expect(labels).not.toEqual(expect.arrayContaining(["Principal", "Secundaria"]));
    await expect(page.getByText("Móvil vertical", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ordenador", { exact: true })).toHaveCount(0);
  });

  test("el aviso demo abre Ajustes y Reduced Motion elimina transiciones largas", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?date=2026-09-09");
    await page.locator("#demo-hint").click();
    await expect(page.locator("#settings-dialog")).toBeVisible();
    const duration = await page.locator("#settings-button").evaluate((node) => getComputedStyle(node).transitionDuration);
    const seconds = Math.max(...duration.split(",").map((part) => parseFloat(part) * (part.includes("ms") ? 0.001 : 1)));
    expect(seconds).toBeLessThan(0.02);
  });

  test("Vertical puede cambiar a Mes y persiste tras reload", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await openSettings(page);
    await page.locator('[data-view-id="touch_portrait"] > select.settings-select').selectOption("month");
    await saveSettings(page);
    await expect(page.locator("html")).toHaveAttribute("data-range-type", "month");
    await closeSettings(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, { rangeType: "month", configSource: "local", contentType: "generated-schedule" });
    await expect(page.locator("#demo-hint")).toBeHidden();
  });

  test("imagen local por defecto persiste como Blob y sobrevive al reload", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await openSettings(page, "Imágenes");
    await chooseDefaultImage(page);
    await saveSettings(page);
    await closeSettings(page);
    await page.goto("/?date=2026-10-12");
    await expectRendered(page, { kind: "inactive", calendarStatus: "holiday", configSource: "local", width: 3, height: 2, src: /^blob:/, contentType: "image" });
    expect(await localAssetCount(page)).toBe(1);
    await page.reload();
    await expectRendered(page, { configSource: "local", width: 3, height: 2, src: /^blob:/ });
  });

  test(".schedule restaura configuración + assets después de Restablecer demo", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await openSettings(page, "Imágenes");
    await chooseDefaultImage(page);
    await saveSettings(page);
    await page.getByRole("tab", { name: "Copia de seguridad" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#backup-export").click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#backup-reset").click();
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "demo");
    await page.getByRole("tab", { name: "Copia de seguridad" }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#backup-import").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path);
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "local", { timeout: 10_000 });
    expect(await localAssetCount(page)).toBe(1);
    await closeSettings(page);
    await page.goto("/?date=2026-10-12");
    await expectRendered(page, { width: 3, height: 2, src: /^blob:/, configSource: "local" });
  });

  test("CodeMirror/Lezer solo carga al pedir YAML y bloquea sintaxis/schema inválidos", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    expect((await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))).some((url) => url.includes("lazy/yaml-editor.js"))).toBe(false);
    await openSettings(page, "Avanzado");
    await page.locator("#yaml-edit").click();
    await expect(page.locator("html")).toHaveAttribute("data-yaml-editor-loaded", "1", { timeout: 10_000 });
    await expect(page.locator(".cm-editor")).toBeVisible();
    const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
    expect(resources.some((url) => url.includes("lazy/yaml-editor.js"))).toBe(true);

    const editor = page.locator(".cm-content");
    for (const [text, expected] of [["version: [\n", null], [semanticBadYaml, "fortnightish"]]) {
      await editor.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText(text);
      await expect(page.locator("#yaml-apply")).toBeDisabled();
      if (expected) await expect(page.locator("#yaml-status")).toContainText(expected);
    }
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(baseYaml);
    await expect(page.locator("#yaml-status")).toHaveText("YAML válido.", { timeout: 10_000 });
    await expect(page.locator("#yaml-apply")).toBeEnabled();
  });

  test("config + Blob + Ajustes siguen operativos offline", async ({ page, context }) => {
    await page.goto("/?date=2026-09-09");
    await openSettings(page, "Imágenes");
    await chooseDefaultImage(page);
    await saveSettings(page);
    await closeSettings(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.goto("/?date=2026-10-12", { waitUntil: "domcontentloaded" });
    await expectRendered(page, { configSource: "local", calendarStatus: "holiday", width: 3, height: 2, src: /^blob:/ });
    await openSettings(page);
    await expect(page.locator("#settings-dialog")).toBeVisible();
  });
});

test.describe("Android", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
  test("es touch pero utiliza el tema genérico", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await expect(page.locator("html")).toHaveAttribute("data-device-mode", "touch");
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "generic");
    await openSettings(page);
    expect(await page.locator(".settings-row-label").allTextContents()).toEqual(expect.arrayContaining(["Vertical", "Horizontal"]));
  });
});

test.describe("Escritorio", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }));

  test("abre Principal semanal con WebP demo y Ajustes solo muestra Principal/Secundaria", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await expectRendered(page, { kind: "week", viewProfile: "wide_default", rangeType: "week", configSource: "demo", width: 1600, height: 1000, src: /assets\/demo\/q1\/week-horizontal\.webp$/, contentType: "generated-schedule" });
    await expect(page.locator("html")).toHaveAttribute("data-device-mode", "desktop");
    await expectNoViewportScroll(page);
    await openSettings(page);
    const labels = await page.locator(".settings-row-label").allTextContents();
    expect(labels).toEqual(expect.arrayContaining(["Principal", "Secundaria"]));
    expect(labels).not.toEqual(expect.arrayContaining(["Vertical", "Horizontal"]));
  });

  test("Space alterna Principal ↔ Secundaria sin reload ni scroll", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await page.evaluate(() => { window.__sameDocument = crypto.randomUUID(); });
    const marker = await page.evaluate(() => window.__sameDocument);
    await page.keyboard.press("Space");
    await expectRendered(page, { kind: "day", viewProfile: "desktop_portrait", rangeType: "day", width: 1080, height: 2160, src: /assets\/demo\/q1\/day-wednesday-vertical\.webp$/ });
    expect(await page.evaluate(() => window.__sameDocument)).toBe(marker);
    await expectNoViewportScroll(page);
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  });

  test("Ctrl+, abre, Escape cierra y desactivar Space persiste", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await page.keyboard.down("Control"); await page.keyboard.press(","); await page.keyboard.up("Control");
    const dialog = page.locator("#settings-dialog");
    await expect(dialog).toBeVisible();
    await dialog.evaluate((node) => {
      node.tabIndex = -1;
      node.focus({ preventScroll: true });
    });
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
    const toggle = page.locator(".switch-row input[type=checkbox]");
    await toggle.uncheck();
    await saveSettings(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
    await page.reload();
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  });

  test("offline conserva WebP semanal y Space hacia el día cacheado", async ({ page, context }) => {
    await page.goto("/?date=2026-09-09");
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, { viewProfile: "wide_default", width: 1600, height: 1000 });
    await page.keyboard.press("Space");
    await expectRendered(page, { viewProfile: "desktop_portrait", width: 1080, height: 2160 });
  });

  test("migración v3 conserva WebP exactos como Blobs antes de borrar la cache", async ({ page }) => {
    await page.goto("/?date=2026-09-09");
    await waitForServiceWorker(page);
    const legacy = structuredClone(baseConfig);
    legacy.app.title = "Migrated V3";
    legacy.runtime = { allowDateOverride: true, demo: false };
    const q1 = legacy.academicYears[0].terms[0];
    q1.assets.week = "assets/legacy/q1/week.webp";
    q1.assets.days = Object.fromEntries(Object.keys(q1.assets.days).map((day) => [day, `assets/legacy/q1/${day}.webp`]));

    await page.evaluate(async (config) => {
      const cache = await caches.open("schedule-viewer-offline-v3");
      await cache.put(new URL("./config/schedule.json", location.href).href, new Response(JSON.stringify(config), { headers: { "Content-Type": "application/json" } }));
      const putCopy = async (source, target) => {
        const response = await fetch(new URL(source, location.href).href);
        if (!response.ok) throw new Error(`No se pudo preparar ${source}`);
        await cache.put(new URL(target, location.href).href, response.clone());
      };
      await putCopy("assets/states/no-class-today-vertical.webp", config.calendar.inactive.defaultImage.src);
      for (const rule of config.rules.filter((item) => item.content?.type === "image" && item.content.src)) {
        await putCopy(rule.content.src, rule.content.src);
      }
      await putCopy("assets/demo/q1/week-horizontal.webp", config.academicYears[0].terms[0].assets.week);
      for (const [day, target] of Object.entries(config.academicYears[0].terms[0].assets.days)) {
        await putCopy(`assets/demo/q1/day-${day}-vertical.webp`, target);
      }
    }, legacy);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
    await expect(page).toHaveTitle(/^Migrated V3 ·/);
    await expectRendered(page, { width: 1600, height: 1000, src: /^blob:/, configSource: "local" });
    expect(await localAssetCount(page)).toBeGreaterThanOrEqual(7);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((name) => name.startsWith("schedule-viewer-offline-v3")))).toBe(false);
    await page.keyboard.press("Space");
    await expectRendered(page, { width: 1080, height: 2160, src: /^blob:/, configSource: "local" });
  });
});
