import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

test.describe("touch settings control placement", () => {
  test.use({
    viewport: { width: 402, height: 874 },
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA
  });

  test("the floating settings button is visibly inside the touch viewport and returns after a tap", async ({ page }) => {
    await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");

    const gear = page.locator("#settings-button");
    const initial = await gear.boundingBox();
    expect(initial).not.toBeNull();
    expect(initial.y).toBeGreaterThanOrEqual(60);
    expect(initial.x).toBeGreaterThanOrEqual(8);
    expect(initial.x + initial.width).toBeLessThanOrEqual(394);
    expect(initial.y + initial.height).toBeLessThanOrEqual(866);

    await expect(gear).toHaveClass(/is-hidden/, { timeout: 6_000 });
    await page.touchscreen.tap(40, 320);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await expect(gear).toHaveCSS("opacity", "1");

    const revealed = await gear.boundingBox();
    expect(revealed).not.toBeNull();
    expect(revealed.y).toBeGreaterThanOrEqual(60);
    expect(revealed.y + revealed.height).toBeLessThanOrEqual(866);
  });

  test("mobile fallback keeps settings reachable even if device classification becomes desktop", async ({ page }) => {
    await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");

    const gear = page.locator("#settings-button");
    await page.evaluate(() => {
      document.documentElement.dataset.deviceMode = "desktop";
      document.querySelector("#settings-button")?.classList.add("is-hidden");
    });
    await expect(gear).toHaveClass(/is-hidden/);

    await page.touchscreen.tap(40, 320);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await expect(gear).toHaveCSS("opacity", "1");

    const box = await gear.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(60);
    expect(box.x + box.width).toBeLessThanOrEqual(394);
    expect(box.y + box.height).toBeLessThanOrEqual(866);
  });

  test("a focused settings control does not disappear before keyboard activation", async ({ page }) => {
    await page.clock.install();
    await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
    const gear = page.locator("#settings-button");
    await gear.focus();
    await page.clock.fastForward(5000);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await page.keyboard.press("Enter");
    await expect(page.locator("#settings-dialog")).toBeVisible();
  });
});
