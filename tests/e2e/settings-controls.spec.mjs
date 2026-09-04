import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15";

async function ready(page, date = "2026-09-10") {
  await page.goto(`/?date=${date}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
}

test("desktop hint dismisses outside, opens Settings itself and generic checks are themed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);

  const hint = page.locator("#demo-hint");
  await expect(hint).toBeVisible();
  await page.locator(".schedule-shell").click({ position: { x: 120, y: 120 } });
  await expect(hint).toHaveClass(/is-hidden/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.locator("#demo-hint").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();

  const checkbox = page.locator('.checkbox-row input[type="checkbox"]').first();
  await expect(checkbox).toHaveCSS("appearance", "none");
  expect((await checkbox.boundingBox()).width).toBeGreaterThanOrEqual(22);
  await checkbox.click();
  await expect(checkbox).toBeChecked({ checked: false });

  await page.locator("#settings-back").click();
  await page.getByRole("button", { name: "Presentation", exact: true }).click();
  await expect(page.getByText("Switch views with Space", { exact: true })).toBeVisible();
  await expect(page.getByText(/Portrait shows the portrait view/)).toHaveCount(0);
  const toggle = page.locator('.switch-row input[type="checkbox"]');
  await expect(toggle).toHaveCSS("appearance", "none");
  expect((await toggle.boundingBox()).width).toBeGreaterThanOrEqual(48);
});

test.describe("independent platform layout and materials", () => {
  test("Android uses the iOS touch layout with generic materials", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, userAgent: ANDROID_UA });
    const page = await context.newPage();
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-device-mode", "touch");
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "generic");
    await page.locator("#settings-button").click();
    const geometry = await page.locator(".settings-sheet").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { bottom: rect.bottom, viewportHeight: innerHeight, radius: getComputedStyle(node).borderTopLeftRadius };
    });
    expect(Math.abs(geometry.bottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);
    expect(Number.parseFloat(geometry.radius)).toBeGreaterThan(0);
    await context.close();
  });

  test("macOS uses the desktop layout with Apple materials", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: MAC_UA });
    const page = await context.newPage();
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-device-mode", "desktop");
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "apple");
    await page.locator("#settings-button").click();
    const geometry = await page.locator(".settings-sheet").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight };
    });
    expect(geometry.top).toBeGreaterThan(0);
    expect(geometry.bottom).toBeLessThan(geometry.viewportHeight);
    await context.close();
  });
});

test.describe("touch floating settings control", () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });

  test("appears initially, hides, and each page tap starts a fresh visible interval", async ({ page }) => {
    await page.clock.install();
    await ready(page);
    const gear = page.locator("#settings-button");
    await expect(gear).not.toHaveClass(/is-hidden/);

    await page.clock.fastForward(4300);
    await expect(gear).toHaveClass(/is-hidden/);
    await page.touchscreen.tap(80, 320);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await page.clock.fastForward(3000);
    await expect(gear).not.toHaveClass(/is-hidden/);
    await page.clock.fastForward(1400);
    await expect(gear).toHaveClass(/is-hidden/);
  });

  test("presentation explains the current touch context without desktop-only controls", async ({ page }) => {
    await ready(page);
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Presentation", exact: true }).click();

    await expect(page.getByText("Switch views with Space", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Portrait shows the portrait view; landscape shows the landscape view.", { exact: true })).toBeVisible();
    await expect(page.getByText(/On touch screens/)).toHaveCount(0);
  });

  test("rotation switches between vertical and horizontal content after the viewport settles", async ({ page }) => {
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "vertical");
    const portraitSource = await page.locator("#schedule-image").getAttribute("src");

    await page.setViewportSize({ width: 874, height: 402 });
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "horizontal");
    await expect(page.locator("#schedule-image")).not.toHaveAttribute("src", portraitSource);

    await page.setViewportSize({ width: 402, height: 874 });
    await expect(page.locator("html")).toHaveAttribute("data-view-profile", "vertical");
    await expect(page.locator("#schedule-image")).toHaveAttribute("src", portraitSource);
  });

  test("saved local images render as real thumbnails in image settings", async ({ page }) => {
    await ready(page);
    await page.evaluate(async () => {
      const config = await fetch("./config/schedule.json").then(response => response.json());
      const response = await fetch(config.periods[0].images.active.vertical.default.src);
      const file = new File([await response.arrayBuffer()], "preview.webp", { type: response.headers.get("content-type") || "image/webp" });
      const id = "preview-test-asset";
      config.periods[0].images.active.vertical.default = { type: "image", asset: id, alt: "Miniatura local", fit: "contain" };
      const { saveUserState } = await import("./local-store.js");
      await saveUserState({ config, yaml: null, assets: [{ id, blob: file, mimeType: file.type, filename: file.name }], source: "local" });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Images", exact: true }).click();
    const preview = page.locator('[data-image-key$="active:vertical:default"] .image-preview');
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  });

  test("a saved v4 config with obsolete public image paths recovers without losing its data", async ({ page }) => {
    await ready(page);
    await page.evaluate(async () => {
      const config = await fetch("./config/schedule.json").then(response => response.json());
      config.periods[0].name = "Mi periodo conservado";
      config.periods[0].images.active.vertical.days.thursday.src = "assets/removed/old-thursday.webp";
      const { saveUserState } = await import("./local-store.js");
      await saveUserState({ config, yaml: null, assets: [], source: "local" });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
    await expect(page.locator("html")).toHaveAttribute("data-image-recovery", "demo");
    await expect(page.locator("#schedule-image")).toBeVisible();
    await expect.poll(() => page.locator("#schedule-image").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Periods", exact: true }).click();
    await expect(page.getByLabel("Period name").first()).toHaveValue("Mi periodo conservado");
  });
});
