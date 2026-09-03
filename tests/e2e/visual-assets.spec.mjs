import { test, expect } from "@playwright/test";

async function useDesktopPointer(page) {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    const forced = (query, matches) => ({
      matches, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
    });
    window.matchMedia = (query) => {
      if (query === "(pointer: fine)") return forced(query, true);
      if (query === "(pointer: coarse)") return forced(query, false);
      if (query === "(hover: none)") return forced(query, false);
      return nativeMatchMedia(query);
    };
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 0 });
  });
}

async function expectVisualDetail(page) {
  await expect.poll(() => page.locator("#schedule-image").evaluate((image) => {
    if (!image.complete || !image.naturalWidth) return { colors: 0, dark: 0 };
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      colors.add(`${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`);
      if (Math.min(r, g, b) < 220) dark += 1;
    }
    return { colors: colors.size, dark };
  })).toMatchObject({ colors: expect.any(Number), dark: expect.any(Number) });
  const detail = await page.locator("#schedule-image").evaluate((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      colors.add(`${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`);
      if (Math.min(r, g, b) < 220) dark += 1;
    }
    return { colors: colors.size, dark };
  });
  expect(detail.colors).toBeGreaterThanOrEqual(8);
  expect(detail.dark).toBeGreaterThanOrEqual(15);
}

test("el WebP semanal de la demo es un horario visual real", async ({ page }) => {
  await useDesktopPointer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /assets\/demo\/q1\/week-horizontal\.webp$/);
  await expect.poll(() => image.evaluate((node) => [node.naturalWidth, node.naturalHeight])).toEqual([1600, 1000]);
  await expectVisualDetail(page);
});

test("Space muestra también el WebP diario real de la demo", async ({ page }) => {
  await useDesktopPointer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Space");
  const image = page.locator("#schedule-image");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "desktop_portrait");
  await expect(image).toHaveAttribute("src", /assets\/demo\/q1\/day-wednesday-vertical\.webp$/);
  await expect.poll(() => image.evaluate((node) => [node.naturalWidth, node.naturalHeight])).toEqual([1080, 2160]);
  await expectVisualDetail(page);
});
