import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { stringify } from "yaml";
import { decompileConfig } from "../../config-schema.js";

const config = JSON.parse(fs.readFileSync(new URL("../../dist/config/schedule.json", import.meta.url), "utf8"));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";
const png = { name: "custom.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGNkYPjPwMDAwMDAxAADABErAQPdiBRnAAAAAElFTkSuQmCC", "base64") };
async function section(page, name) {
  if (await page.locator("#settings-back").isVisible()) await page.locator("#settings-back").click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function open(page, name = "Imágenes") {
  await page.mouse.click(20, 300);
  await page.locator("#settings-button").click();
  await section(page, name);
}
async function choose(page, row) {
  const waiting = page.waitForEvent("filechooser");
  await row.getByRole("button", { name: /Elegir imagen|Cambiar/ }).click();
  await (await waiting).setFiles(png);
  await expect(row.locator("img")).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => row.locator("img").evaluate(node => node.naturalWidth)).toBe(3);
}
async function save(page) {
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado");
}
async function rendered(page, custom) {
  await expect(page.locator("html")).toHaveAttribute("data-content-type", custom ? "image" : "generated-schedule");
  if (custom) {
    await expect(page.locator("#schedule-image")).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => page.locator("#schedule-image").evaluate(node => node.naturalWidth)).toBe(3);
  }
}
const day = (page, label) => page.locator("#image-settings").getByRole("group", { name: label, exact: true });
const termKey = id => JSON.stringify([config.academicYears[0].id, id]);

test.describe("image settings on phone", () => {
  test.use({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
  test("daily and weekly images are independent across terms, persist and restore", async ({ page }) => {
    await page.goto("/?date=2026-09-07");
    await open(page);
    await expect(page.getByLabel("Tipo de día", { exact: true })).toHaveValue("active");
    await expect(page.locator(".image-setting")).toHaveCount(6);
    await expect(day(page, "Sábado")).toHaveCount(0);
    await expect(day(page, "Domingo")).toHaveCount(0);
    await choose(page, day(page, "Lunes"));
    await choose(page, day(page, "Vista semanal"));
    await page.getByLabel("Periodo", { exact: true }).selectOption(termKey("q2"));
    await expect(day(page, "Lunes")).toContainText("Horario generado");
    await choose(page, day(page, "Martes"));
    await page.getByLabel("Tipo de día", { exact: true }).selectOption("inactive");
    await expect(page.getByLabel("Periodo", { exact: true })).toHaveCount(0);
    await page.getByLabel("Tipo de día", { exact: true }).selectOption("active");
    await expect(page.getByLabel("Periodo", { exact: true })).toHaveValue(termKey("q2"));
    await expect(day(page, "Martes").locator("img")).toHaveAttribute("src", /^blob:/);
    await save(page);
    await page.locator("#settings-close").click();
    await rendered(page, true);
    await page.reload();
    await rendered(page, true);
    await page.goto("/?date=2026-09-08");
    await rendered(page, false);
    await page.setViewportSize({ width: 874, height: 402 });
    await rendered(page, true);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?date=2027-01-11");
    await rendered(page, false);
    await page.goto("/?date=2027-01-12");
    await rendered(page, true);
    await open(page);
    await page.getByLabel("Periodo", { exact: true }).selectOption(termKey("q2"));
    await day(page, "Martes").getByRole("button", { name: "Restaurar horario generado" }).click();
    await save(page);
    await page.locator("#settings-close").click();
    await rendered(page, false);
    await page.goto("/?date=2026-09-07");
    await rendered(page, true);
  });

  test("global inactive dates appear after YAML import and survive backup/restore", async ({ page }) => {
    const custom = structuredClone(config);
    custom.calendar.inactiveDates.push({ date: "2026-09-10", label: "Cierre global" });
    await page.goto("/?date=2026-09-10");
    await open(page, "Avanzado");
    const waiting = page.waitForEvent("filechooser");
    await page.locator("#yaml-import").click();
    await (await waiting).setFiles({ name: "global.yaml", mimeType: "text/yaml", buffer: Buffer.from(stringify(decompileConfig(custom))) });
    await expect(page.locator("#yaml-file-status")).toContainText("YAML importado");
    await section(page, "Imágenes");
    await page.getByLabel("Tipo de día", { exact: true }).selectOption("inactive");
    await expect(page.getByRole("heading", { name: "Fechas inactivas globales" })).toBeVisible();
    const global = page.locator('[data-image-key="inactive:global:2026-09-10"]');
    await choose(page, global);
    await save(page);
    await section(page, "Copia de seguridad");
    const download = page.waitForEvent("download");
    await page.locator("#backup-export").click();
    const packagePath = await (await download).path();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#backup-reset").click();
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "demo");
    await section(page, "Copia de seguridad");
    const importing = page.waitForEvent("filechooser");
    await page.locator("#backup-import").click();
    await (await importing).setFiles(packagePath);
    await expect(page.locator("html")).toHaveAttribute("data-config-source", "local");
    await page.locator("#settings-close").click();
    await rendered(page, true);
    await page.reload();
    await rendered(page, true);
    await open(page);
    await page.getByLabel("Tipo de día", { exact: true }).selectOption("inactive");
    await global.getByRole("button", { name: "Quitar imagen específica" }).click();
    await save(page);
    await page.locator("#settings-close").click();
    await expect(page.locator("#schedule-image")).toHaveAttribute("src", /no-class-today-vertical.webp/);
  });

  test("inactive weekday changes filter the menu without deleting active images", async ({ page }) => {
    await page.goto("/?date=2026-09-07");
    await open(page);
    await choose(page, day(page, "Lunes"));
    await section(page, "Horario");
    await page.getByRole("checkbox", { name: "Lunes", exact: true }).check();
    await page.getByRole("checkbox", { name: "Sábado", exact: true }).uncheck();
    await section(page, "Imágenes");
    await expect(day(page, "Lunes")).toHaveCount(0);
    await expect(day(page, "Sábado")).toBeVisible();
    await expect(day(page, "Domingo")).toHaveCount(0);
    await save(page);
    await page.locator("#settings-close").click();
    await page.reload();
    await open(page, "Horario");
    await page.getByRole("checkbox", { name: "Lunes", exact: true }).uncheck();
    await section(page, "Imágenes");
    await expect(day(page, "Lunes").locator("img")).toHaveAttribute("src", /^blob:/);
  });

  test("discarding an image leaves the saved schedule unchanged", async ({ page }) => {
    await page.goto("/?date=2026-09-07");
    await open(page);
    await choose(page, day(page, "Lunes"));
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#settings-close").click();
    await rendered(page, false);
    await open(page);
    await expect(day(page, "Lunes")).toContainText("Horario generado");
  });
});

for (const [name, viewport, colorScheme, userAgent] of [
  ["portrait", { width: 402, height: 874 }, "light", IPHONE],
  ["narrow-dark", { width: 320, height: 740 }, "dark", IPHONE],
  ["landscape", { width: 874, height: 402 }, "light", IPHONE],
  ["android", { width: 412, height: 915 }, "light", "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"],
  ["desktop", { width: 1440, height: 900 }, "light", undefined]
]) {
  test.describe(name, () => {
    test.use({ viewport, colorScheme, ...(userAgent ? { userAgent, hasTouch: true, isMobile: true } : {}) });
    test("image menus fit the viewport", async ({ page }, info) => {
      await page.goto("/?date=2026-09-07");
      await open(page);
      for (const kind of ["active", "inactive"]) {
        await page.getByLabel("Tipo de día", { exact: true }).selectOption(kind);
        const overflow = await page.locator(".settings-scroll").evaluate(node => node.scrollWidth > node.clientWidth + 1);
        expect(overflow).toBe(false);
        await page.screenshot({ path: info.outputPath(name + "-" + kind + ".png") });
      }
    });
  });
}
