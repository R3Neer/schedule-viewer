import fs from "node:fs";
import { test, expect } from "@playwright/test";

const baseConfig = JSON.parse(
  fs.readFileSync(new URL("../../dist/config/schedule.json", import.meta.url), "utf8")
);

async function waitForServiceWorker(page) {
  await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1", { timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("El Service Worker no tomó control")), 8_000);
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  });
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

test("migración v3 conserva los WebP exactos como Blobs antes de borrar la caché antigua", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await waitForServiceWorker(page);

  const legacy = structuredClone(baseConfig);
  legacy.app.title = "Migrated V3";
  legacy.runtime = { allowDateOverride: true, demo: false };
  const q1 = legacy.academicYears[0].terms[0];
  q1.assets.week = "assets/legacy/q1/week.webp";
  q1.assets.days = Object.fromEntries(
    Object.keys(q1.assets.days).map((day) => [day, `assets/legacy/q1/${day}.webp`])
  );

  await page.evaluate(async (config) => {
    const cache = await caches.open("schedule-viewer-offline-v3");
    const configUrl = new URL("./config/schedule.json", location.href).href;
    await cache.put(configUrl, new Response(JSON.stringify(config), {
      headers: { "Content-Type": "application/json" }
    }));

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
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => page.locator("#schedule-image").evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([1600, 1000]);
  expect(await localAssetCount(page)).toBeGreaterThanOrEqual(7);
  await expect.poll(() => page.evaluate(async () =>
    (await caches.keys()).some((name) => name.startsWith("schedule-viewer-offline-v3"))
  )).toBe(false);

  await page.keyboard.press("Space");
  await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => page.locator("#schedule-image").evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 2160]);
});
