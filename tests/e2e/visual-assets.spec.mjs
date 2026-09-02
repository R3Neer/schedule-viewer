import { test, expect } from "@playwright/test";

async function expectVisualDetail(page) {
  const detail = await page.locator("#schedule-image").evaluate((image) => {
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
  });
  expect(detail.colors).toBeGreaterThanOrEqual(8);
  expect(detail.dark).toBeGreaterThanOrEqual(15);
}

test("el WebP semanal de escritorio contiene un horario visual real", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  const image = page.locator("#schedule-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /assets\/2026-2027\/q1\/week-horizontal\.webp$/);
  await expect.poll(() => image.evaluate((node) => [node.naturalWidth, node.naturalHeight])).toEqual([1600, 1000]);
  await expectVisualDetail(page);
});

test("Space muestra también un WebP diario con contenido visual real", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Space");
  const image = page.locator("#schedule-image");
  await expect(page.locator("html")).toHaveAttribute("data-view-profile", "desktop_portrait");
  await expect(image).toHaveAttribute("src", /assets\/2026-2027\/q1\/day-wednesday-vertical\.webp$/);
  await expect.poll(() => image.evaluate((node) => [node.naturalWidth, node.naturalHeight])).toEqual([1080, 2160]);
  await expectVisualDetail(page);
});
