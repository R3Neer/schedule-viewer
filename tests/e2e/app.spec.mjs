import fs from "node:fs";
import { test, expect } from "@playwright/test";

const baseConfig = JSON.parse(fs.readFileSync(new URL("../../config/schedules.json", import.meta.url), "utf8"));
const ANIMATED_GIF = "data:image/gif;base64,R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEA/wAAAAAAAAAAAAAIBgABCAQQEAA7";
const PNG_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGNkYPjPwMDAwMDAxAADABErAQPdiBRnAAAAAElFTkSuQmCC";

async function expectRendered(page, { kind, alt, width, height, src, contentType, fit }) {
  await expect(page.locator("html")).toHaveAttribute("data-view", kind);
  await expect(page.locator("#error-message")).toBeHidden();
  if (contentType) await expect(page.locator("html")).toHaveAttribute("data-content-type", contentType);

  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", alt);
  if (src) await expect(image).toHaveAttribute("src", src);
  if (fit) await expect.poll(() => image.evaluate((node) => node.style.objectFit)).toBe(fit);

  await expect.poll(async () => image.evaluate((node) => ({
    complete: node.complete,
    width: node.naturalWidth,
    height: node.naturalHeight
  }))).toEqual({ complete: true, width, height });
}

async function expectNoViewportScroll(page) {
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= window.innerWidth + 1,
    vertical: document.documentElement.scrollHeight <= window.innerHeight + 1
  }))).toEqual({ horizontal: true, vertical: true });
}

async function waitForServiceWorker(page) {
  await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1", { timeout: 15_000 });

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("El Service Worker no tomó control de la página")), 7_500);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  });

  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("ucm-scheduler-offline-v2-content"))).toBe(true);
}

async function useCustomConfig(page, mutate) {
  const custom = structuredClone(baseConfig);
  mutate(custom);
  await page.route("**/config/schedules.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(custom)
    });
  });
}

test("iPhone vertical abre un día lectivo y muestra su horario", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });

  await expectRendered(page, {
    kind: "day",
    alt: /1er Cuatrimestre, horario del wednesday/,
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
});

test("iPhone vertical muestra Sin clases hoy en un festivo", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-10-12", { waitUntil: "domcontentloaded" });

  await expectRendered(page, {
    kind: "no-class",
    alt: "Sin clases hoy",
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
});

test("iPhone horizontal respeta vacaciones y la transición al siguiente cuatrimestre", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });

  await page.goto("/?date=2027-01-10", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "vacations",
    alt: "Vacaciones",
    width: 2500,
    height: 1000,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });

  await page.goto("/?date=2027-01-20", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "next-week",
    alt: /2º Cuatrimestre, próximo horario semanal/,
    width: 2500,
    height: 1000,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
});

test("girar el iPhone cambia entre día y semana sin recargar", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "day",
    alt: /1er Cuatrimestre, horario del wednesday/,
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });

  await page.setViewportSize({ width: 874, height: 402 });
  await expectRendered(page, {
    kind: "week",
    alt: /1er Cuatrimestre, horario semanal/,
    width: 2500,
    height: 1000,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });

  await page.setViewportSize({ width: 402, height: 874 });
  await expectRendered(page, {
    kind: "day",
    alt: /1er Cuatrimestre, horario del wednesday/,
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
});

test("el layout de iPhone sigue sin introducir scroll en vertical ni horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "day",
    alt: /1er Cuatrimestre, horario del wednesday/,
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
  await expectNoViewportScroll(page);

  await page.setViewportSize({ width: 874, height: 402 });
  await expectRendered(page, {
    kind: "week",
    alt: /1er Cuatrimestre, horario semanal/,
    width: 2500,
    height: 1000,
    src: /^data:image\/svg\+xml/,
    contentType: "generated-schedule"
  });
  await expectNoViewportScroll(page);
});

test("un ContentDescriptor image muestra un GIF animado en vez del horario generado", async ({ page }) => {
  await useCustomConfig(page, (config) => {
    const q1 = config.academicYears[0].terms.find((term) => term.id === "q1");
    q1.content = {
      days: {
        wednesday: {
          type: "image",
          src: ANIMATED_GIF,
          alt: "GIF raro del miércoles",
          fit: "cover"
        }
      }
    };
  });
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });

  await expectRendered(page, {
    kind: "day",
    alt: "GIF raro del miércoles",
    width: 2,
    height: 2,
    src: /^data:image\/gif;base64/,
    contentType: "image",
    fit: "cover"
  });
});

test("un ContentDescriptor image muestra PNG también en horizontal", async ({ page }) => {
  await useCustomConfig(page, (config) => {
    const q1 = config.academicYears[0].terms.find((term) => term.id === "q1");
    q1.content = {
      week: {
        type: "image",
        src: PNG_IMAGE,
        alt: "Semana en PNG",
        fit: "contain"
      }
    };
  });
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });

  await expectRendered(page, {
    kind: "week",
    alt: "Semana en PNG",
    width: 3,
    height: 2,
    src: /^data:image\/png;base64/,
    contentType: "image",
    fit: "contain"
  });
});

test("la web sigue abriendo el horario del iPhone después de cortar la red", async ({ page, context }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "load" });
  await waitForServiceWorker(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, {
      kind: "day",
      alt: /1er Cuatrimestre, horario del wednesday/,
      width: 1000,
      height: 1850,
      src: /^data:image\/svg\+xml/,
      contentType: "generated-schedule"
    });
  } finally {
    await context.setOffline(false);
  }
});

test("offline en escritorio sirve también el WebP semanal desde caché", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "load" });

  await expectRendered(page, {
    kind: "week",
    alt: /1er Cuatrimestre, horario semanal/,
    width: 1600,
    height: 1000,
    src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/,
    contentType: "generated-schedule"
  });
  await waitForServiceWorker(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectRendered(page, {
      kind: "week",
      alt: /1er Cuatrimestre, horario semanal/,
      width: 1600,
      height: 1000,
      src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/,
      contentType: "generated-schedule"
    });
  } finally {
    await context.setOffline(false);
  }
});
