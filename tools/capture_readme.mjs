#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "media");
const botanicalPath = path.join(root, "showcase", "sources", "botanical-print.jpg");
const mountainPath = path.join(root, "showcase", "sources", "mountain-landscape.jpg");
const baseURL = "http://127.0.0.1:4174";
const iPhoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const macSafariUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 26_0) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15";

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The README capture server did not start.");
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

async function openSettings(page, panel = null) {
  await page.evaluate(() => document.querySelector("#settings-button").classList.remove("is-hidden"));
  await page.locator("#settings-button").click();
  await page.locator('#settings-dialog[data-motion-state="open"]').waitFor();
  if (panel) {
    await page.locator(`[data-settings-tab="${panel}"]`).click();
    await page.locator(`#settings-dialog[data-panel="${panel}"][data-motion-state="open"]`).waitFor();
  }
}

async function seedShowcaseImages(page) {
  const [botanical, mountain] = await Promise.all([
    fs.readFile(botanicalPath, "base64"),
    fs.readFile(mountainPath, "base64")
  ]);
  await page.evaluate(async ({ botanical, mountain }) => {
    const bytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
    const config = await (await fetch("./config/schedule.json", { cache: "no-store" })).json();
    const term = config.academicYears[0].terms[0];
    term.content ??= {};
    term.content.days ??= {};
    term.content.days.wednesday = {
      type: "image", asset: "showcase-botanical", alt: "Ilustración botánica histórica", fit: "cover"
    };
    term.content.week = {
      type: "image", asset: "showcase-mountains", alt: "Paisaje de montaña", fit: "cover"
    };
    const { saveUserState } = await import("./local-store.js");
    await saveUserState({
      config,
      source: "local",
      assets: [
        { id: "showcase-botanical", blob: new Blob([bytes(botanical)], { type: "image/jpeg" }), mimeType: "image/jpeg", filename: "botanical-print.jpg" },
        { id: "showcase-mountains", blob: new Blob([bytes(mountain)], { type: "image/jpeg" }), mimeType: "image/jpeg", filename: "mountain-landscape.jpg" }
      ]
    });
  }, { botanical, mountain });
}

async function capture(launchOptions, options) {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: options.viewport,
    userAgent: options.mobile ? iPhoneUA : macSafariUA,
    colorScheme: options.colorScheme ?? "light",
    reducedMotion: "reduce",
    hasTouch: Boolean(options.mobile),
    isMobile: Boolean(options.mobile),
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  // The CSS material is the intentional production fallback. It keeps the
  // documentation capture deterministic on machines without a stable GPU.
  await page.route("**/lazy/apple-glass.*", route => route.abort());
  await page.goto(`${baseURL}/?date=${options.date}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  if (options.seedImages) {
    await seedShowcaseImages(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApp(page);
  }
  if (options.panel) {
    await openSettings(page, options.panel === "yaml" ? "advanced" : options.panel);
    if (options.panel === "yaml") {
      await page.locator("#yaml-edit").click();
      await page.locator('#settings-dialog[data-panel="yaml"][data-motion-state="open"]').waitFor();
      await page.locator(".cm-editor").waitFor();
    }
  }
  await page.screenshot({ path: path.join(output, options.filename) });
  await context.close();
  await browser.close();
}

await fs.mkdir(output, { recursive: true });
const server = spawn("python", ["-m", "http.server", "4174", "--directory", "dist", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true
});

try {
  await waitForServer();
  const executablePath = process.env.SCHEDULE_VIEWER_CHROMIUM || undefined;
  const launchOptions = { headless: true, executablePath, args: ["--disable-webgl"] };
  await capture(launchOptions, { filename: "desktop-week-light.png", viewport: { width: 1440, height: 900 }, date: "2026-09-10" });
  await capture(launchOptions, { filename: "iphone-day-art.png", viewport: { width: 402, height: 874 }, date: "2026-09-09", mobile: true, seedImages: true });
  await capture(launchOptions, { filename: "iphone-images-light.png", viewport: { width: 402, height: 874 }, date: "2026-09-09", mobile: true, seedImages: true, panel: "images" });
  await capture(launchOptions, { filename: "iphone-week-landscape.png", viewport: { width: 874, height: 402 }, date: "2026-09-10", mobile: true });
  await capture(launchOptions, { filename: "desktop-yaml-dark.png", viewport: { width: 1440, height: 900 }, date: "2026-09-10", colorScheme: "dark", panel: "yaml" });
  console.log(`README screenshots written to ${output}`);
} finally {
  server.kill();
}
