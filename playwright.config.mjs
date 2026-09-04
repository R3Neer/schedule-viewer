import { defineConfig } from "@playwright/test";

const localChromium = process.env.SCHEDULE_VIEWER_CHROMIUM;
const externalServer = process.env.SCHEDULE_VIEWER_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["v4-settings.spec.mjs", "settings-layout.spec.mjs", "settings-motion.spec.mjs", "settings-gestures.spec.mjs", "update.spec.mjs"],
  timeout: 40_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    // Exercise the CSS fallback in the functional suite. The separate WebKit
    // suite requires real WebGL. Software GL in headless Chromium can spend
    // longer rendering a trace snapshot than the control's auto-hide delay.
    launchOptions: { args: ["--disable-webgl"], ...(localChromium ? { executablePath: localChromium } : {}) },
    trace: "retain-on-failure",
    video: process.env.SCHEDULE_VIEWER_MOTION_VIDEO ? "on" : "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: externalServer ? undefined : {
    command: "python -m http.server 4173 --directory dist --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
