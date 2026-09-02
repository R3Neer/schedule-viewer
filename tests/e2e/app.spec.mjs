import { test, expect } from "@playwright/test";

async function expectRendered(page, { kind, alt, width, height, src }) {
  await expect(page.locator("html")).toHaveAttribute("data-view", kind);
  await expect(page.locator("#error-message")).toBeHidden();

  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", alt);

  if (src) await expect(image).toHaveAttribute("src", src);

  await expect.poll(async () => image.evaluate((node) => ({
    complete: node.complete,
    width: node.naturalWidth,
    height: node.naturalHeight
  }))).toEqual({ complete: true, width, height });
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
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("ucm-scheduler-offline-v1"))).toBe(true);
}

test("iPhone vertical abre un día lectivo y muestra su horario", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });

  await expectRendered(page, {
    kind: "day",
    alt: /1er Cuatrimestre, horario del wednesday/,
    width: 1000,
    height: 1850,
    src: /^data:image\/svg\+xml/
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
    src: /^data:image\/svg\+xml/
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
    src: /^data:image\/svg\+xml/
  });

  await page.goto("/?date=2027-01-20", { waitUntil: "domcontentloaded" });
  await expectRendered(page, {
    kind: "next-week",
    alt: /2º Cuatrimestre, próximo horario semanal/,
    width: 2500,
    height: 1000,
    src: /^data:image\/svg\+xml/
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
      src: /^data:image\/svg\+xml/
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
    src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/
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
      src: /assets\/2026-2027\/q1\/week-horizontal\.webp$/
    });
  } finally {
    await context.setOffline(false);
  }
});
