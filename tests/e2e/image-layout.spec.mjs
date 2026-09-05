import { test, expect } from "@playwright/test";
import { makeSourceConfig } from "../fixture-config.mjs";
import { readFile } from "node:fs/promises";

const phoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const cases = [
  { name: "iPhone portrait", width: 402, height: 874, touch: true },
  { name: "iPhone browser bars", width: 402, height: 740, touch: true },
  { name: "iPhone landscape", width: 874, height: 402, touch: true },
  { name: "narrow phone", width: 360, height: 800, touch: true },
  { name: "tablet", width: 820, height: 1180, touch: true },
  { name: "desktop", width: 1440, height: 900, touch: false }
];
for (const size of cases) test.describe(size.name, () => {
  test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch,
    isMobile: size.touch, ...(size.touch ? { userAgent: phoneUA } : {}) });
  test("cover fills the viewport after package restore and rotation", async ({ page, context, browserName }) => {
    await page.goto(`/?date=${process.env.SCHEDULE_VIEWER_TEST_DATE || "2026-09-07"}`);
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
    // Public CI uses synthetic opaque artwork, never a personal schedule.
    const payload = process.env.SCHEDULE_VIEWER_TEST_PACKAGE
      ? (await readFile(process.env.SCHEDULE_VIEWER_TEST_PACKAGE)).toString("base64") : null;
    await page.evaluate(async ({ source, payload }) => {
      const io = await import("./lazy/config-io.js");
      const { compileSourceConfig } = await import("./config-schema.js");
      const { saveUserState } = await import("./local-store.js");
      let backup;
      if (payload) backup = new Blob([Uint8Array.from(atob(payload), char => char.charCodeAt(0))]);
      else {
        source.defaults.image_fit = "cover";
        const replace = value => {
          if (!value || typeof value !== "object") return;
          if (value.src) { delete value.src; delete value.fit; value.asset = "opaque"; }
          else Object.values(value).forEach(replace);
        };
        replace(source);
        const canvas = document.createElement("canvas");
        canvas.width = 1206; canvas.height = 2622;
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ae5632"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        backup = await io.exportSchedulePackage({ config: compileSourceConfig(source),
          assets: [{ id: "opaque", blob, filename: "opaque.png", mimeType: "image/png" }] });
      }
      const imported = await io.inspectSchedulePackage(backup);
      await saveUserState({ config: imported.config, yaml: imported.yaml, assets: imported.assets });
    }, { source: makeSourceConfig(), payload });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
    await expect(page.locator("html")).toHaveAttribute("data-offline-ready", "1");
    const image = page.locator("#schedule-image");
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    // Supply nonzero insets even on headless engines. This catches accidental
    // use of safe-area padding in artwork while preserving the real controls.
    const css = await page.evaluate(async () => {
      const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => /\/styles\.css/.test(link.href));
      return (await (await fetch(link.href)).text()).replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g,
        (_, side) => ({ top: "59px", right: "12px", bottom: "34px", left: "12px" })[side]);
    });
    await page.addStyleTag({ content: css });
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await expect(image).toHaveCSS("object-fit", "cover");
      const metrics = await image.evaluate(img => {
        const box = img.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, vw: innerWidth, vh: innerHeight,
          padding: getComputedStyle(img.parentElement).padding, scroll: document.documentElement.scrollWidth };
      });
      expect(metrics).toEqual({ x: 0, y: 0, width: size.width, height: size.height,
        vw: size.width, vh: size.height, padding: "0px", scroll: size.width });
      await page.screenshot({ path: test.info().outputPath(`${colorScheme}.png`) });
    }
    await page.setViewportSize({ width: size.height, height: size.width });
    await expect.poll(() => image.evaluate(img => Math.round(img.getBoundingClientRect().height))).toBe(size.width);
    await expect(image).toHaveCSS("object-fit", "cover");
    // Offline navigation is covered by Chromium; the WebKit harness reports
    // an internal navigation error under context.setOffline on Windows.
    if (browserName === "chromium") await context.setOffline(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  });
});

test("explicit contain survives a cover default and preserves the complete image", async ({ page }) => {
  await page.goto("/?date=2026-09-07");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.evaluate(async () => {
    const config = await (await fetch("./config/schedule.json")).json();
    config.defaults.imageFit = "cover";
    const { saveUserState } = await import("./local-store.js");
    const io = await import("./lazy/config-io.js");
    await saveUserState({ config: io.yamlToCompiled(io.compiledToYaml(config)) });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-image-fit", "contain");
  const image = page.locator("#schedule-image");
  await expect(image).toHaveCSS("object-fit", "contain");
  const aspect = await image.evaluate(img => ({ natural: img.naturalWidth / img.naturalHeight,
    box: img.getBoundingClientRect().width / img.getBoundingClientRect().height }));
  expect(aspect.box).toBeCloseTo(aspect.natural, 2);
});


test("installed iOS shell requests artwork behind the status bar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  const css = await page.evaluate(async () => {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(link => /\/styles\.css/.test(link.href));
    return (await fetch(link.href)).text();
  });
  expect(css).toMatch(/@media all and \(display-mode: standalone\)[\s\S]*height:\s*100vh/);
});

test("reopening repairs image fits saved by the defective importer", async ({ page, context }) => {
  await page.goto("/?date=2026-09-05");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.evaluate(async source => {
    source.defaults.image_fit = "cover";
    const replace = value => {
      if (!value || typeof value !== "object") return;
      if (value.src) { delete value.src; delete value.fit; value.asset = "repair-opaque"; }
      else Object.values(value).forEach(replace);
    };
    replace(source);
    const io = await import("./lazy/config-io.js");
    const intended = io.yamlToCompiled(io.compiledToYaml(source));
    const defective = structuredClone(intended);
    const setContain = value => {
      if (!value || typeof value !== "object") return;
      if (value.type === "image") value.fit = "contain";
      else Object.values(value).forEach(setContain);
    };
    setContain(defective);
    const canvas = document.createElement("canvas");
    canvas.width = 1206; canvas.height = 2622;
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    const store = await import("./local-store.js");
    await store.putAsset({ id: "repair-opaque", blob, filename: "repair.png", mimeType: "image/png" });
    const db = await store.openScheduleDb();
    const transaction = db.transaction("config", "readwrite");
    transaction.objectStore("config").put({
      id: "active", normalized: defective, yaml: io.compiledToYaml(intended), version: 4, source: "local"
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, makeSourceConfig());
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto("/?date=2026-09-05");
  await expect(reopened.locator("html")).toHaveAttribute("data-app-ready", "1");
  await expect(reopened.locator("html")).toHaveAttribute("data-image-fit", "cover");
  await expect(reopened.locator("#schedule-image")).toHaveCSS("object-fit", "cover");
  const state = await reopened.evaluate(async () => {
    const store = await import("./local-store.js");
    const record = await store.loadUserConfig();
    const asset = await store.getAsset("repair-opaque");
    return { revision: record.imageFitRevision, fit: record.normalized.periods[0].images.inactive.vertical.fit,
      assetBytes: asset.blob.size };
  });
  expect(state).toEqual({ revision: 1, fit: "cover", assetBytes: expect.any(Number) });
  expect(state.assetBytes).toBeGreaterThan(0);
});
