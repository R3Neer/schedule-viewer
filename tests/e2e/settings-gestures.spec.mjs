import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";

test.use({
  colorScheme: "light",
  userAgent: IPHONE_UA,
  hasTouch: true,
  isMobile: true,
  viewport: { width: 402, height: 874 }
});

async function loadSettings(page, panel = "advanced") {
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.evaluate(() => document.querySelector("#settings-button").click());
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  if (panel !== "home") {
    await page.evaluate(name => document.querySelector(`[data-settings-tab="${name}"]`).click(), panel);
    await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", panel);
    await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  }
}

async function pointerSwipe(page, { target, start, end, steps = 6, delay = 18, pointerId = 71 }) {
  const origin = page.locator(target);
  const sheet = page.locator(".settings-sheet");
  await origin.dispatchEvent("pointerdown", {
    pointerId, pointerType: "touch", isPrimary: true, button: 0, buttons: 1,
    clientX: start.x, clientY: start.y
  });
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    await page.waitForTimeout(delay);
    await sheet.dispatchEvent("pointermove", {
      pointerId, pointerType: "touch", isPrimary: true, button: 0, buttons: 1,
      clientX: start.x + (end.x - start.x) * ratio,
      clientY: start.y + (end.y - start.y) * ratio
    });
  }
  await sheet.dispatchEvent("pointerup", {
    pointerId, pointerType: "touch", isPrimary: true, button: 0, buttons: 0,
    clientX: end.x, clientY: end.y
  });
}

test("web mode reserves Safari's leading edge but accepts an in-content Back swipe", async ({ page }) => {
  await loadSettings(page);
  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 10, y: 400 }, end: { x: 240, y: 402 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "advanced");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");

  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 48, y: 400 }, end: { x: 240, y: 402 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "home");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator(".settings-title-ghost")).toHaveCount(0);
});

test("an installed PWA can use the exact leading edge and a short slow drag cancels cleanly", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: true }));
  await loadSettings(page);
  await pointerSwipe(page, {
    target: "#settings-advanced-panel",
    start: { x: 2, y: 400 }, end: { x: 38, y: 402 },
    steps: 5, delay: 90
  });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "advanced");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");

  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 2, y: 400 }, end: { x: 220, y: 402 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "home");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
});

test("wrong-direction and content vertical gestures do not navigate or dismiss", async ({ page }) => {
  await loadSettings(page);
  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 250, y: 400 }, end: { x: 80, y: 402 } });
  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 100, y: 360 }, end: { x: 102, y: 650 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "advanced");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator("#settings-dialog")).toBeVisible();
});

test("header swipe down cancels when short, closes when committed and respects dirty confirmation", async ({ page }) => {
  await loadSettings(page, "schedule");
  const title = await page.locator("#settings-title").boundingBox();
  const start = { x: title.x + title.width / 2, y: title.y + title.height / 2 };

  await pointerSwipe(page, { target: "#settings-title", start, end: { x: start.x, y: start.y + 55 }, steps: 5, delay: 80 });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator("#settings-dialog")).toBeVisible();

  await page.getByLabel("Nombre", { exact: true }).fill("Borrador táctil");
  page.once("dialog", prompt => prompt.dismiss());
  await pointerSwipe(page, { target: "#settings-title", start, end: { x: start.x, y: start.y + 300 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Borrador táctil");
  await expect.poll(() => page.locator(".settings-sheet").evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeCloseTo(0, 1);

  page.once("dialog", prompt => prompt.accept());
  await pointerSwipe(page, { target: "#settings-title", start, end: { x: start.x, y: start.y + 300 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "closed");
  await expect(page.locator("#settings-dialog")).toBeHidden();
});

test("landscape browser safe area expands the reserved gesture margin", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await loadSettings(page);
  await page.locator(".settings-sheet").evaluate(node => node.style.setProperty("--settings-safe-leading", "30px"));

  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 45, y: 220 }, end: { x: 390, y: 222 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "advanced");
  await pointerSwipe(page, { target: "#settings-advanced-panel", start: { x: 70, y: 220 }, end: { x: 420, y: 222 } });
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "home");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
});

test("a native Chromium touch stream completes Back without being claimed as page scroll", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch input is a Chromium-only native-stream check");
  await loadSettings(page);

  const zone = await page.locator(".settings-back-gesture-zone").boundingBox();
  const start = { x: zone.x + zone.width / 2, y: zone.y + Math.min(zone.height / 2, 260) };

  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start.x, y: start.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
  });
  for (let step = 1; step <= 8; step++) {
    await page.waitForTimeout(18);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + step * 26, y: start.y + step * .25, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "home");
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  await expect(page.locator(".settings-title-ghost")).toHaveCount(0);
});
