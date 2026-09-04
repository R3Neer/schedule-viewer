import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15";

async function load(page) {
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.evaluate(() => document.querySelector("#settings-button").classList.remove("is-hidden"));
}

async function captureOpening(page, testInfo, prefix) {
  await page.evaluate(() => document.querySelector("#settings-button").click());
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "opening");
  await page.waitForTimeout(90); // Visual sampling only; assertions use explicit states.
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-opening-mid.png`) });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-opening-final.png`) });
}

async function captureNavigation(page, testInfo, panel, prefix) {
  await page.evaluate(name => document.querySelector(`[data-settings-tab="${name}"]`).click(), panel);
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "navigating");
  await page.waitForTimeout(75); // Visual sampling only; assertions use explicit states.
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-navigation-mid.png`) });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-navigation-final.png`) });
  await expect(page.locator(".settings-title-ghost")).toHaveCount(0);
}

async function captureBackAndClose(page, testInfo, prefix) {
  await page.locator("#settings-back").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "navigating");
  await page.waitForTimeout(75); // Visual sampling only; assertions use explicit states.
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-back-mid.png`) });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "closing");
  await page.waitForTimeout(75); // Visual sampling only; assertions use explicit states.
  await page.screenshot({ path: testInfo.outputPath(`${prefix}-closing-mid.png`) });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "closed");
}

test.describe("motion visual review", () => {
  test.describe("iPhone portrait", () => {
    test.use({ colorScheme: "light", userAgent: IPHONE_UA, hasTouch: true, isMobile: true, viewport: { width: 402, height: 874 } });
    test("records opening and internal navigation at normal speed", async ({ page }, testInfo) => {
      await load(page);
      await captureOpening(page, testInfo, "iphone-light");
      await captureNavigation(page, testInfo, "advanced", "iphone-light");
      await expect(page.locator(".settings-scroll")).toBeInViewport();
      await captureBackAndClose(page, testInfo, "iphone-light");
    });
  });

  test.describe("narrow dark iPhone", () => {
    test.use({ colorScheme: "dark", userAgent: IPHONE_UA, hasTouch: true, isMobile: true, viewport: { width: 320, height: 740 } });
    test("keeps the animated editor actions inside the viewport", async ({ page }, testInfo) => {
      await load(page);
      await captureOpening(page, testInfo, "iphone-dark-320");
      await captureNavigation(page, testInfo, "advanced", "iphone-dark-320");
      expect(await page.locator(".settings-scroll").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.locator("#yaml-edit").click();
      await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
      await expect(page.locator(".cm-editor")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("iphone-dark-320-yaml-editor.png") });
      expect(await page.locator(".settings-scroll").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    });
  });

  test.describe("iPhone landscape", () => {
    test.use({ colorScheme: "light", userAgent: IPHONE_UA, hasTouch: true, isMobile: true, viewport: { width: 874, height: 402 } });
    test("keeps the sheet geometry stable while images enter", async ({ page }, testInfo) => {
      await load(page);
      await captureOpening(page, testInfo, "iphone-landscape");
      const before = await page.locator(".settings-sheet").boundingBox();
      await captureNavigation(page, testInfo, "images", "iphone-landscape");
      const after = await page.locator(".settings-sheet").boundingBox();
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    });
  });

  test.describe("Apple desktop", () => {
    test.use({ colorScheme: "light", userAgent: MAC_SAFARI_UA, hasTouch: false, isMobile: false, viewport: { width: 1200, height: 800 } });
    test("uses restrained desktop travel without resizing the dialog", async ({ page }, testInfo) => {
      await load(page);
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "apple");
      await captureOpening(page, testInfo, "apple-desktop");
      const before = await page.locator(".settings-sheet").boundingBox();
      await captureNavigation(page, testInfo, "backup", "apple-desktop");
      const after = await page.locator(".settings-sheet").boundingBox();
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    });
  });

  test.describe("reduced motion", () => {
    test.use({ colorScheme: "light", reducedMotion: "reduce", userAgent: IPHONE_UA, hasTouch: true, isMobile: true, viewport: { width: 402, height: 874 } });
    test("records the non-spatial alternative", async ({ page }, testInfo) => {
      await load(page);
      await page.evaluate(() => document.querySelector("#settings-button").click());
      await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
      await page.screenshot({ path: testInfo.outputPath("reduced-motion-open.png") });
      await page.evaluate(() => document.querySelector('[data-settings-tab="schedule"]').click());
      await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
      await page.screenshot({ path: testInfo.outputPath("reduced-motion-schedule.png") });
      await expect(page.locator(".settings-title-ghost")).toHaveCount(0);
    });
  });
});
