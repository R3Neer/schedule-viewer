import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("updating an installed client replaces cached code and preserves v4 config and exact image bytes", async ({ page }) => {
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  const legacy = await readFile(new URL("../fixtures/service-worker-v4-5.js", import.meta.url));
  let upgraded = false;
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp" };
  const server = createServer(async (request, response) => {
    const name = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
    const target = path.resolve(dist, name);
    if (!target.startsWith(dist)) { response.writeHead(403).end(); return; }
    try {
      const body = name === "service-worker.js" && !upgraded ? legacy : await readFile(target);
      response.writeHead(200, { "Content-Type": types[path.extname(name)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1");
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.evaluate(async () => {
      const { saveUserState } = await import("./local-store.js");
      const config = await (await fetch("./config/schedule.json")).json();
      config.periods[0].name = "Conservado tras actualizar";
      await saveUserState({ config, assets: [{ id: "upgrade-image", blob: new Blob(["GIF89a-exact-local-bytes"], { type: "image/gif" }), mimeType: "image/gif", filename: "animated.gif" }] });
      const cache = await caches.open("schedule-viewer-offline-v4-1");
      await cache.put(new URL("./lazy/yaml-editor.js", location.href), new Response("throw new Error('STALE_BUNDLE');", { headers: { "Content-Type": "text/javascript" } }));
    });
    upgraded = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("schedule-viewer-offline-20260905-v1-0-1-r3"))).toBe(true);
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("schedule-viewer-offline-v4-1"))).toBe(false);
    const audit = await page.evaluate(async () => {
      const { getAsset, loadUserConfig } = await import("./local-store.js");
      const image = await getAsset("upgrade-image");
      const bundle = await (await fetch("./lazy/yaml-editor.js")).text();
      return { bytes: await image.blob.text(), mime: image.mimeType, filename: image.filename, name: (await loadUserConfig()).normalized.periods[0].name, stale: bundle.includes("STALE_BUNDLE"), editor: bundle.includes("cm-editor") };
    });
    expect(audit).toEqual({ bytes: "GIF89a-exact-local-bytes", mime: "image/gif", filename: "animated.gif", name: "Conservado tras actualizar", stale: false, editor: true });
    await page.locator("#settings-button").click();
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await page.locator("#yaml-edit").click();
    await expect(page.locator(".cm-editor")).toBeVisible();
  } finally {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
});
