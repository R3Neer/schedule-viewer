import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";

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
  await page.getByRole("button", { name: "Calendario", exact: true }).click();

  const checkbox = page.locator('.checkbox-row input[type="checkbox"]').first();
  await expect(checkbox).toHaveCSS("appearance", "none");
  expect((await checkbox.boundingBox()).width).toBeGreaterThanOrEqual(22);
  await checkbox.click();
  await expect(checkbox).toBeChecked({ checked: false });

  await page.locator("#settings-back").click();
  await page.getByRole("button", { name: "Presentación", exact: true }).click();
  const toggle = page.locator('.switch-row input[type="checkbox"]');
  await expect(toggle).toHaveCSS("appearance", "none");
  expect((await toggle.boundingBox()).width).toBeGreaterThanOrEqual(48);
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
    await page.getByRole("button", { name: "Periodos", exact: true }).click();
    await expect(page.getByLabel("Nombre del periodo").first()).toHaveValue("Mi periodo conservado");
  });
});
