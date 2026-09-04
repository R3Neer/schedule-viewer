import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("a real v4.6 cached app loads the new menu before its worker activates and retains local data offline", async ({ page, context }) => {
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  const fixture = fileURLToPath(new URL("../fixtures/v4-6/", import.meta.url));
  const oldFiles = new Set(["app.js", "settings-ui.js", "index.html", "service-worker.js"]);
  let upgraded = false;
  let allowWorker;
  const workerGate = new Promise(resolve => { allowWorker = resolve; });
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp" };
  const server = createServer(async (request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    const base = !upgraded && oldFiles.has(name) ? fixture : dist;
    const target = path.resolve(base, name);
    if (!target.startsWith(base)) return response.writeHead(403).end();
    if (upgraded && name === "service-worker.js") await workerGate;
    try {
      const body = await readFile(target);
      response.writeHead(200, { "Content-Type": types[path.extname(name)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await page.goto(url);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Imágenes", exact: true }).click();
    await expect(page.locator("#image-day-type")).toHaveCount(0);
    await page.locator("#settings-close").click();
    await page.evaluate(async () => {
      const { saveUserState } = await import("./local-store.js");
      const config = await (await fetch("./config/schedule.json")).json();
      config.app.title = "Mi horario guardado";
      config.calendar.inactive.defaultImage = { type: "image", asset: "legacy-image" };
      await saveUserState({ config, assets: [{ id: "legacy-image", blob: new Blob(["original-image-bytes"]), mimeType: "image/png" }] });
    });
    upgraded = true;
    await page.reload();
    await expect(page).toHaveTitle(/^Mi horario guardado/);
    // Keep the old worker controlling this navigation. Query-string versioning
    // alone serves the old app/settings modules here and fails this assertion.
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Imágenes", exact: true }).click();
    await expect(page.locator("#image-day-type")).toHaveValue("active");
    await expect(page.locator(".image-setting")).toHaveCount(6);
    await page.locator("#settings-close").click();
    // Activation reloads the document: synchronize with that navigation before
    // evaluating cache state, rather than racing its destroyed JS context.
    const reloaded = page.waitForEvent("load");
    allowWorker();
    await reloaded;
    await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1");
    expect(await page.evaluate(async () => (await caches.keys()).includes("schedule-viewer-offline-20260903-v4-6"))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle(/^Mi horario guardado/);
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Imágenes", exact: true }).click();
    await expect(page.locator(".image-setting")).toHaveCount(6);
    expect(await page.evaluate(async () => (await (await import("./local-store.js")).getAsset("legacy-image")).blob.text())).toBe("original-image-bytes");
  } finally {
    allowWorker();
    await context.close();
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
});
