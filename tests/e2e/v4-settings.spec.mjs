import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1";

async function load(page, { width = 402, height = 874 } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto("/?date=2026-09-10", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
}

async function panel(page, name) {
  if (await page.locator("#settings-dialog").getAttribute("data-panel") !== "home") {
    await page.locator("#settings-back").click();
    await expect(page.locator("#settings-dialog")).toHaveAttribute("data-panel", "home");
  }
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
}

test.use({ userAgent: IPHONE_UA, hasTouch: true, isMobile: true });

test("las seis secciones mantienen orden, jerarquía y áreas táctiles", async ({ page }) => {
  await load(page);
  await expect(page.locator("#settings-close")).toBeVisible();
  const [sheetBox, closeBox] = await Promise.all([
    page.locator(".settings-sheet").boundingBox(),
    page.locator("#settings-close").boundingBox()
  ]);
  expect(sheetBox.y).toBeGreaterThanOrEqual(60);
  expect(closeBox.y).toBeGreaterThanOrEqual(sheetBox.y);
  const rows = page.locator("[data-settings-tab]");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAccessibleName("Periodos");
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")))).toEqual([
    "Periodos", "Calendario", "Presentación", "Imágenes", "Copia de seguridad", "Avanzado"
  ]);
  for (const box of await rows.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
});

test("periodos editables conservan borrador y rechazan solapamientos", async ({ page }) => {
  await load(page);
  await panel(page, "Periodos");
  const initialCards = page.locator(".period-card");
  const initialAdd = page.getByRole("button", { name: "Añadir periodo" });
  const [firstCard, secondCard, addRow] = await Promise.all([
    initialCards.nth(0).boundingBox(), initialCards.nth(1).boundingBox(), initialAdd.boundingBox()
  ]);
  expect(secondCard.y - firstCard.y - firstCard.height).toBeGreaterThanOrEqual(16);
  expect(addRow.y - secondCard.y - secondCard.height).toBeGreaterThanOrEqual(16);
  const name = page.getByLabel("Nombre del periodo").first();
  await name.fill("Proyecto editorial");
  await expect(page.locator("#settings-save")).toBeEnabled();
  await page.getByRole("button", { name: "Añadir periodo" }).click();
  await expect(page.locator(".period-card")).toHaveCount(3);
  const cards = page.locator(".period-card");
  const lastStart = cards.last().locator('input[type="date"]').first();
  await lastStart.fill("2026-10-01");
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("solapan");
  await lastStart.fill("2027-05-15");
  await lastStart.press("Tab");
  const lastEnd = cards.last().locator('input[type="date"]').nth(1);
  await lastEnd.fill("2027-08-31");
  await lastEnd.press("Tab");
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado", { ignoreCase: true });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.locator("#settings-button").click();
  await panel(page, "Periodos");
  await expect(page.getByLabel("Nombre del periodo").first()).toHaveValue("Proyecto editorial");
});

test("calendario añade excepciones e intervalos y presenta categorías", async ({ page }) => {
  await load(page);
  await panel(page, "Calendario");
  await expect(page.getByText("Patrón semanal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Añadir excepción" }).click();
  await page.getByRole("button", { name: "Añadir periodo inactivo" }).click();
  await expect(page.locator(".calendar-item")).toHaveCount(6);
  const inactiveCards = page.locator(".calendar-editor").last().locator(".calendar-item");
  const [firstInactive, secondInactive] = await Promise.all([
    inactiveCards.nth(0).boundingBox(), inactiveCards.nth(1).boundingBox()
  ]);
  expect(secondInactive.y - firstInactive.y - firstInactive.height).toBeGreaterThanOrEqual(16);
  await expect(page.locator('select[aria-label="Categoría"]').last()).toBeVisible();
});

test("Presentación ofrece Día, Semana y Mes y declara horizontal fija", async ({ page }) => {
  await load(page);
  await panel(page, "Presentación");
  const unit = page.getByLabel("Presentación vertical");
  await expect(unit.locator("option")).toHaveCount(3);
  await unit.selectOption("month");
  await expect(page.getByText(/imagen fija por periodo/i)).toBeVisible();
  await page.locator("#settings-save").click();
  await expect(page.locator("#settings-status")).toContainText("Guardado", { ignoreCase: true });
});

test("Imágenes separa vertical dinámica, horizontal única e inactivos", async ({ page }) => {
  await load(page);
  await panel(page, "Imágenes");
  await expect(page.getByLabel("Periodo", { exact: true })).toBeVisible();
  await expect(page.getByText("Días activos", { exact: true })).toBeVisible();
  await expect(page.getByText("Días inactivos", { exact: true })).toBeVisible();
  const fixedHorizontal = page.locator('[data-image-key$=":active:horizontal"]');
  await expect(fixedHorizontal).toHaveCount(1);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Cambiar Predeterminada vertical/ }).first().click();
  const chooser = await chooserPromise;
  const inputAccept = await chooser.element().getAttribute("accept");
  expect(inputAccept).not.toContain("svg");
  await chooser.setFiles([]);
  const monday = page.locator('[data-image-key$=":active:day:monday"]');
  await monday.locator("summary").click();
  await expect(monday.getByRole("button", { name: "Cambiar", exact: true })).toBeVisible();
  await expect(monday.getByRole("button", { name: "Quitar", exact: true })).toBeVisible();
});

test("Copia y YAML usan iconos accesibles y conservan acciones textuales críticas", async ({ page }) => {
  await load(page);
  await panel(page, "Copia de seguridad");
  await expect(page.getByRole("button", { name: "Importar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Restablecer configuración demo/ })).toBeVisible();
  await page.locator("#settings-back").click();
  await panel(page, "Avanzado");
  for (const label of ["Editar YAML", "Importar YAML", "Exportar YAML"]) {
    const button = page.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    expect((await button.boundingBox()).width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByText(/YAML no incluye las imágenes/)).toBeVisible();
});

test("no deja paneles ocultos enfocables y cerrar con borrador exige confirmación", async ({ page }) => {
  await load(page);
  await panel(page, "Periodos");
  await page.getByLabel("Nombre del periodo").first().fill("Sin guardar");
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  const hiddenFocusable = await page.locator('[data-settings-panel][hidden] button, [data-settings-panel][hidden] input, [data-settings-panel][hidden] select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).length);
  expect(hiddenFocusable).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#settings-close").click();
  await expect(page.locator("#settings-dialog")).toBeHidden();
});

for (const size of [
  { name: "320x740", width: 320, height: 740 },
  { name: "402x874", width: 402, height: 874 },
  { name: "874x402", width: 874, height: 402 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 }
]) test(`geometría sin desbordamiento ${size.name}`, async ({ page }) => {
  await load(page, size);
  const geometry = await page.locator(".settings-sheet").evaluate(node => ({
    left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
    top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom,
    viewportWidth: innerWidth, viewportHeight: innerHeight
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
});
