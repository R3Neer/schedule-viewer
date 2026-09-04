import { defineConfig, devices } from "@playwright/test";

const localChromium = process.env.SCHEDULE_VIEWER_CHROMIUM;
const externalServer = process.env.SCHEDULE_VIEWER_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["apple-glass.spec.mjs", "settings-controls.spec.mjs", "settings-motion.spec.mjs", "settings-gestures.spec.mjs"],
  timeout: 35_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    ...(localChromium ? { browserName: "chromium", launchOptions: { executablePath: localChromium } } : devices["Desktop Safari"]),
    baseURL: "http://127.0.0.1:4175",
    // Tracing a real WebGL renderer changes WebKit's frame scheduling enough
    // to invalidate motion measurements. Keep screenshots for diagnostics and
    // measure animation cadence without recording overhead.
    trace: "off",
    screenshot: "only-on-failure"
  },
  webServer: externalServer ? undefined : {
    command: "python -m http.server 4175 --directory dist --bind 127.0.0.1",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 15_000
  }
});
