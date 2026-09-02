import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "python -m http.server 4173 --directory dist --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
