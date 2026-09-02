import fs from "node:fs";
import { test, expect } from "@playwright/test";

const baseConfig = JSON.parse(
  fs.readFileSync(new URL("../../dist/config/schedule.json", import.meta.url), "utf8")
);

const ANIMATED_GIF = "data:image/gif;base64,R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEA/wAAAAAAAAAAAAAIBgABCAQQEAA7";
const PNG_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGNkYPjPwMDAwMDAxAADABErAQPdiBRnAAAAAElFTkSuQmCC";

async function expectRendered(page, { kind, viewProfile, rangeType, rangeStart, rangeEnd, calendarStatus, alt, width, height, src, contentType, fit }) {
  const html = page.locator("html");
  if (kind) await expect(html).toHaveAttribute("data-view", kind);
  if (viewProfile) await expect(html).toHaveAttribute("data-view-profile", viewProfile);
  if (rangeType) await expect(html).toHaveAttribute("data-range-type", rangeType);
  if (rangeStart) await expect(html).toHaveAttribute("data-range-start", rangeStart);
  if (rangeEnd) await expect(html).toHaveAttribute("data-range-end", rangeEnd);
  if (calendarStatus) await expect(html).toHaveAttribute("data-calendar-status", calendarStatus);
  if (contentType) await expect(html).toHaveAttribute("data-content-type", contentType);

  await expect(page.locator("#error-message")).toBeHidden();
  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  if (alt) await expect(image).toHaveAttribute("alt", alt);
  if (src) await expect(image).toHaveAttribute("src", src);
  if (fit) await expect.poll(() => image.evaluate((node) => node.style.objectFit)).toBe(fit);
  if (width != null && height != null) {
    await expect.poll(async () => image.evaluate((node) => ({ complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }))).toEqual({ complete: true, width, height });
  }
}

async function expectNoViewportScroll(page) {
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= window.innerWidth + 1,
    vertical: document.documentElement.scrollHeight <= window.innerHeight + 1
  }))).toEqual({ horizontal: true, vertical: true });
}

async function expectImageHasVisualDetail(page) {
  await expect.poll(() => page.locator("#schedule-image").evaluate((image) => {
    if (!image.complete || !image.naturalWidth) return false;
    const canvas = document.createElement("canvas");
    canvas.width = 50; canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set(); let darkish = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      colors.add(`${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`);
      if (Math.min(r, g, b) < 220) darkish += 1;
    }
    return colors.size >= 8 && darkish >= 15;
  })).toBe(true);
}

async function useCustomConfig(page, mutate) {
  const custom = structuredClone(baseConfig);
  mutate(custom);
  await page.route("**/config/schedule.json", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(custom) });
  });
  return custom;
}

async function waitForServiceWorker(page) {
  await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1", { timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("El Service Worker no tomó control")), 7_500);
      navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("schedule-viewer-offline-v3"))).toBe(true);
}

test("iPhone vertical abre un día lectivo con la vista diaria configurada", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "day", viewProfile: "phone_portrait", rangeType: "day", rangeStart: "2026-09-09", rangeEnd: "2026-09-09",
    calendarStatus: "normal", alt: /1er Cuatrimestre, horario del wednesday/, width: 1000, height: 1850,
    src: /^data:image\/svg\+xml/, contentType: "generated-schedule"
  });
  await expectNoViewportScroll(page);
});

test("iPhone horizontal usa la vista semanal y calcula lunes-domingo", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "week", viewProfile: "phone_landscape", rangeType: "week", rangeStart: "2026-09-07", rangeEnd: "2026-09-13",
    width: 2500, height: 1000, src: /^data:image\/svg\+xml/, contentType: "generated-schedule"
  });
  await expectNoViewportScroll(page);
});

test("girar el iPhone cambia de perfil sin recargar", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "phone_portrait");
  await page.evaluate(() => { window.__sentinel = crypto.randomUUID(); });
  const sentinel = await page.evaluate(() => window.__sentinel);
  await page.setViewportSize({ width: 874, height: 402 });
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "phone_landscape");
  await expect(page.locator("html")).toHaveAttribute("data-view", "week");
  expect(await page.evaluate(() => window.__sentinel)).toBe(sentinel);
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "phone_portrait");
  expect(await page.evaluate(() => window.__sentinel)).toBe(sentinel);
});

test("solo domingo puede configurarse como día recurrentemente inactivo", async ({ page }) => {
  await useCustomConfig(page, (config) => { config.calendar.inactiveWeekdays = { sunday: {} }; });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-12", { waitUntil: "domcontentloaded" });
  await expectRendered(page, { kind: "day", calendarStatus: "normal", alt: /horario del saturday/, width: 1000, height: 1850, contentType: "generated-schedule" });
  await page.goto("/?date=2026-09-13", { waitUntil: "domcontentloaded" });
  await expectRendered(page, { kind: "inactive", calendarStatus: "inactive-weekday", alt: "Sin clases hoy", width: 1080, height: 2160, contentType: "image" });
});

test("puede no haber ningún weekday inactivo", async ({ page }) => {
  await useCustomConfig(page, (config) => { config.calendar.inactiveWeekdays = {}; });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-13", { waitUntil: "domcontentloaded" });
  await expectRendered(page, { kind: "day", calendarStatus: "normal", alt: /horario del sunday/, width: 1000, height: 1850, contentType: "generated-schedule" });
});

test("un festivo sin override usa siempre la imagen inactiva obligatoria", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-10-12", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "inactive", viewProfile: "phone_portrait", calendarStatus: "holiday", alt: "Sin clases hoy", width: 1080, height: 2160,
    src: /assets\/states\/no-class-today-vertical\.webp$/, contentType: "image"
  });
});

test("un festivo puede sustituir la imagen inactiva por un GIF", async ({ page }) => {
  await useCustomConfig(page, (config) => {
    config.academicYears[0].calendar.holidays.find((item) => item.date === "2026-10-12").image = {
      type: "image", src: ANIMATED_GIF, alt: "GIF festivo", fit: "cover"
    };
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-10-12", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "inactive", calendarStatus: "holiday", alt: "GIF festivo", width: 2, height: 2,
    src: /^data:image\/gif;base64/, contentType: "image", fit: "cover"
  });
});

test("una fecha concreta gana a la imagen del periodo que la contiene", async ({ page }) => {
  await useCustomConfig(page, (config) => {
    const year = config.academicYears[0];
    year.calendar.periods.find((item) => item.id === "winter-interterm").image = { type: "image", src: ANIMATED_GIF, alt: "Periodo", fit: "contain" };
    year.calendar.inactiveDates.push({
      date: "2026-12-25", type: "non-teaching", label: "Navidad exacta",
      image: { type: "image", src: PNG_IMAGE, alt: "Navidad exacta", fit: "contain" }
    });
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-12-25", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "inactive", calendarStatus: "non-teaching", alt: "Navidad exacta", width: 3, height: 2,
    src: /^data:image\/png;base64/, contentType: "image"
  });
});

test("vacaciones horizontales y preview de Q2 respetan reglas con prioridad", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/?date=2027-01-10", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "inactive", calendarStatus: "vacation", alt: "Vacaciones", width: 1600, height: 1000,
    src: /assets\/states\/vacations-horizontal\.webp$/, contentType: "image"
  });
  await page.goto("/?date=2027-01-20", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "next-week", calendarStatus: "vacation", rangeType: "week", rangeStart: "2027-01-18", rangeEnd: "2027-01-24",
    alt: /2º Cuatrimestre, horario semanal/, width: 2500, height: 1000, src: /^data:image\/svg\+xml/, contentType: "generated-schedule"
  });
});

test("escritorio arranca siempre en la vista horizontal primaria", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "week", viewProfile: "wide_default", rangeType: "week", width: 1600, height: 1000,
    src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/, contentType: "generated-schedule"
  });
  await expect(page.locator("html")).toHaveAttribute("data-manual-view", "0");
  await expectImageHasVisualDetail(page);
});

test("Space alterna semana ↔ día en escritorio sin recargar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { window.__sentinel = "same-document"; });
  await page.keyboard.press("Space");
  await expectRendered(page, {
    kind: "day", viewProfile: "desktop_portrait", rangeType: "day", width: 1080, height: 2160,
    src: /assets\/2026-2027\/q1\/day-wednesday-vertical\.webp$/, contentType: "generated-schedule"
  });
  await expect(page.locator("html")).toHaveAttribute("data-manual-view", "1");
  await expectImageHasVisualDetail(page);
  expect(await page.evaluate(() => window.__sentinel)).toBe("same-document");
  await page.keyboard.press("Space");
  await expectRendered(page, {
    kind: "week", viewProfile: "wide_default", width: 1600, height: 1000,
    src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/, contentType: "generated-schedule"
  });
  expect(await page.evaluate(() => window.__sentinel)).toBe("same-document");
});

test("Space no secuestra inputs, contenteditable ni combinaciones con modificadores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const input = document.createElement("input"); input.id = "test-input"; document.body.append(input);
    const editable = document.createElement("div"); editable.id = "test-editable"; editable.contentEditable = "true"; document.body.append(editable);
  });
  await page.locator("#test-input").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  await page.locator("#test-editable").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "wide_default");
});

test("una vista mensual configurable resuelve y renderiza septiembre completo", async ({ page }) => {
  await useCustomConfig(page, (config) => { config.views.wide_default.range = { type: "month" }; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "range", viewProfile: "wide_default", rangeType: "month", rangeStart: "2026-09-01", rangeEnd: "2026-09-30",
    width: 1600, height: 1000, src: /^data:image\/svg\+xml/, contentType: "generated-schedule"
  });
});

test("una vista relativa arbitraria expone exactamente su ventana temporal", async ({ page }) => {
  await useCustomConfig(page, (config) => { config.views.wide_default.range = { type: "relative", before: 2, after: 4 }; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "range", rangeType: "relative", rangeStart: "2026-09-07", rangeEnd: "2026-09-13",
    width: 1600, height: 1000, contentType: "generated-schedule"
  });
});

test("un intervalo absoluto configurable no depende de la fecha ancla", async ({ page }) => {
  await useCustomConfig(page, (config) => {
    config.views.wide_default.range = { type: "interval", start: "2026-09-01", end: "2026-09-30" };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "range", rangeType: "interval", rangeStart: "2026-09-01", rangeEnd: "2026-09-30",
    width: 1600, height: 1000, contentType: "generated-schedule"
  });
});

test("ninguna de las dos vistas de escritorio introduce scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectNoViewportScroll(page);
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "desktop_portrait");
  await expectNoViewportScroll(page);
});

test("offline en iPhone recarga horario y la imagen inactiva obligatoria", async ({ page, context }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-10-12", { waitUntil: "load" });
  await waitForServiceWorker(page);
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /no-class-today-vertical\.webp$/);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, {
      kind: "inactive", calendarStatus: "holiday", width: 1080, height: 2160,
      src: /no-class-today-vertical\.webp$/, contentType: "image"
    });
  } finally { await context.setOffline(false); }
});

test("offline en escritorio conserva WebP semanal y permite Space hacia el día cacheado", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "load" });
  await waitForServiceWorker(page);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, {
      kind: "week", viewProfile: "wide_default", width: 1600, height: 1000,
      src: /week-horizontal\.webp$/, contentType: "generated-schedule"
    });
    await page.keyboard.press("Space");
    await expectRendered(page, {
      kind: "day", viewProfile: "desktop_portrait", width: 1080, height: 2160,
      src: /day-wednesday-vertical\.webp$/, contentType: "generated-schedule"
    });
  } finally { await context.setOffline(false); }
});
