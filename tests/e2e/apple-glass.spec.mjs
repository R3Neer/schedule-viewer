import { test, expect } from "@playwright/test";
test.use({
  colorScheme: "light",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
  hasTouch: true, isMobile: true, viewport: { width: 402, height: 874 }
});

test("grouped settings preserve drafts across sections and confine glass to the floating control", async ({ page }, testInfo) => {
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.touchscreen.tap(20, 300);
  // Keep the control available during software-GPU screenshots. Auto-hide is
  // exercised separately; keyboard focus must suspend it for actual users too.
  await page.locator("#settings-button").focus();
  await expect(page.locator("#settings-button")).toHaveAttribute("data-liquid-glass-render", "webgl");
  await expect.poll(() => page.locator("#settings-button canvas").evaluateAll(
    canvases => canvases.some(canvas => canvas.width > 1 && canvas.height > 1)
  )).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("apple-floating-control.png") });
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator("#settings-home-panel")).toBeVisible();
  await expect(page.locator(".settings-footer")).toBeHidden();
  await expect(page.locator(".settings-sheet")).toHaveCSS("background-color", "rgb(242, 241, 246)");
  await expect(page.locator(".settings-sheet canvas")).toHaveCount(0);
  await expect(page.locator("#settings-button .apple-glass-underlay")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("apple-settings-home.png") });

  await page.getByRole("button", { name: "Periodos", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  const cards = page.locator("#period-settings > .settings-form-list > .settings-card");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  const configuredGap = await page.locator("#period-settings > .settings-form-list").evaluate(element =>
    Number.parseFloat(getComputedStyle(element).rowGap)
  );
  const measuredGap = second.y - first.y - first.height;
  expect(configuredGap).toBeGreaterThanOrEqual(16);
  expect(Math.abs(measuredGap - configuredGap)).toBeLessThanOrEqual(1);
  await expect(cards.first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: testInfo.outputPath("apple-settings-periods.png") });
  await page.getByLabel("Nombre del periodo").first().fill("Mi periodo");
  await page.locator("#settings-back").click();
  await page.getByRole("button", { name: "Imágenes", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.locator("#settings-back").click();
  await page.getByRole("button", { name: "Periodos", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.getByLabel("Nombre del periodo").first()).toHaveValue("Mi periodo");
  await expect(page.locator("#settings-save")).toBeVisible();
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado");
  await expect(page.locator("#settings-save")).toBeHidden();
});

test("settings remain styled and usable when the optical renderer cannot load", async ({ page }) => {
  await page.route("**/lazy/apple-glass.*", route => route.abort());
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.touchscreen.tap(20, 300);
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator("#settings-home-panel")).toBeVisible();
  await expect(page.locator(".settings-sheet")).toHaveCSS("background-color", "rgb(242, 241, 246)");
  await page.getByRole("button", { name: "Periodos", exact: true }).click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.getByLabel("Nombre del periodo").first()).toBeVisible();
});

test("a pending optical renderer never mounts while Settings is opening", async ({ page }) => {
  await page.route("**/lazy/apple-glass.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.touchscreen.tap(20, 300);
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.waitForTimeout(650);
  await expect(page.locator("#settings-button .apple-glass-underlay")).toHaveCount(0);
  await expect(page.locator("#settings-button canvas")).toHaveCount(0);
});
