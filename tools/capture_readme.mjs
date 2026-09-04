#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const media = path.join(root, "docs", "media");
const review = path.join(root, "docs", "visual-review-v4");
const baseURL = "http://127.0.0.1:4174";
const iPhoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const desktopUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 26_0) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15";

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(baseURL)).ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The capture server did not start.");
}

async function waitForApp(page) {
  await page.waitForSelector('html[data-app-ready="1"]');
  await page.locator("#error-message").waitFor({ state: "hidden" });
  await page.locator("#schedule-image").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector("#schedule-image");
    return image?.complete && image.naturalWidth > 0;
  });
}

async function openPanel(page, panel) {
  await page.evaluate(() => document.querySelector("#settings-button").classList.remove("is-hidden"));
  await page.locator("#settings-button").click();
  await page.locator('#settings-dialog[data-motion-state="open"]').waitFor();
  if (!panel || panel === "home") return;
  const target = panel === "yaml" ? "advanced" : panel;
  await page.locator(`[data-settings-tab="${target}"]`).click();
  await page.locator(`#settings-dialog[data-panel="${target}"][data-motion-state="open"]`).waitFor();
  if (panel === "yaml") {
    await page.locator("#yaml-edit").click();
    await page.locator('#settings-dialog[data-panel="yaml"][data-motion-state="open"] .cm-editor').waitFor();
  }
}

async function capture(browser, options) {
  const context = await browser.newContext({
    viewport: options.viewport,
    userAgent: options.mobile ? iPhoneUA : desktopUA,
    colorScheme: options.colorScheme ?? "light",
    reducedMotion: options.reducedMotion ?? "no-preference",
    hasTouch: Boolean(options.mobile),
    isMobile: Boolean(options.mobile),
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.route("**/lazy/apple-glass.*", route => route.abort());
  await page.goto(`${baseURL}/?date=${options.date ?? "2026-09-10"}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  if (options.settings) {
    await openPanel(page, options.settings);
    if (options.settings === "images" && options.expandImages) {
      await page.locator('details[data-image-group="Active days"] > summary').click();
      await page.locator('details[data-image-group^="Portrait"] > summary').click();
    }
  }
  await page.screenshot({ path: path.join(options.review ? review : media, options.filename) });
  await context.close();
}

await Promise.all([fs.mkdir(media, { recursive: true }), fs.mkdir(review, { recursive: true })]);
const server = spawn("python", ["-m", "http.server", "4174", "--directory", "dist", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true
});

try {
  await waitForServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SCHEDULE_VIEWER_CHROMIUM || undefined,
    args: ["--disable-webgl"]
  });
  const phone = { viewport: { width: 402, height: 874 }, mobile: true };
  const narrow = { viewport: { width: 320, height: 740 }, mobile: true };
  const landscape = { viewport: { width: 874, height: 402 }, mobile: true };
  const desktop = { viewport: { width: 1440, height: 900 } };

  for (const item of [
    { filename: "desktop-horizontal-light.png", ...desktop },
    { filename: "iphone-vertical-light.png", ...phone, date: "2026-09-09" },
    { filename: "iphone-settings-light.png", ...phone, settings: "home" },
    { filename: "iphone-images-light.png", ...phone, settings: "images", expandImages: true },
    { filename: "iphone-horizontal-landscape.png", ...landscape },
    { filename: "desktop-yaml-dark.png", ...desktop, colorScheme: "dark", settings: "yaml" }
  ]) await capture(browser, item);

  for (const panel of ["home", "periods", "calendar", "presentation", "images", "backup", "advanced"]) {
    await capture(browser, { filename: `apple-light-${panel}.png`, ...phone, settings: panel, review: true });
    await capture(browser, { filename: `apple-dark-${panel}.png`, ...phone, colorScheme: "dark", settings: panel, review: true });
  }
  await capture(browser, { filename: "narrow-periods.png", ...narrow, settings: "periods", review: true });
  await capture(browser, { filename: "landscape-calendar.png", ...landscape, settings: "calendar", review: true });
  await capture(browser, { filename: "desktop-settings.png", ...desktop, settings: "home", review: true });
  await capture(browser, { filename: "reduced-motion-images.png", ...phone, settings: "images", reducedMotion: "reduce", review: true });
  await browser.close();
  console.log(`Public captures: ${media}`);
  console.log(`Visual review matrix: ${review}`);
} finally {
  server.kill();
}
