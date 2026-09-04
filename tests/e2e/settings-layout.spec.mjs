import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

async function openSettings(page, tab = null) {
  await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  if (tab) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator("#settings-dialog")).toHaveAttribute("data-motion-state", "open");
  }
}

test.describe("settings responsive geometry", () => {
  test.use({ userAgent: IPHONE_UA, hasTouch: true, isMobile: true });

  test("portrait keeps destructive action separated from its description", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await openSettings(page, "Copia de seguridad");
    const paragraph = page.locator(".danger-card p");
    const button = page.locator("#backup-reset");
    const [p, b] = await Promise.all([paragraph.boundingBox(), button.boundingBox()]);
    expect(p).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b.y - (p.y + p.height)).toBeGreaterThanOrEqual(12);
  });

  test("calendar section headings have breathing room above and below", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await openSettings(page, "Calendario");

    const metrics = await page.locator("#calendar-settings").evaluate((host) => {
      const sections = [...host.querySelectorAll(":scope > .calendar-editor")];
      return sections.map((section, index) => {
        const heading = section.querySelector(":scope > .settings-section-heading").getBoundingClientRect();
        const card = section.querySelector(":scope > .settings-card").getBoundingClientRect();
        const previous = index ? sections[index - 1].getBoundingClientRect() : null;
        return {
          spaceAbove: previous ? heading.top - previous.bottom : null,
          spaceBelow: card.top - heading.bottom
        };
      });
    });

    expect(metrics).toHaveLength(3);
    for (const metric of metrics) expect(metric.spaceBelow).toBeGreaterThanOrEqual(10);
    for (const metric of metrics.slice(1)) expect(metric.spaceAbove).toBeGreaterThanOrEqual(24);
  });

  test("landscape reserves useful content height and keeps close/footer inside the viewport", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 874, height: 402 });
    await openSettings(page, "Imágenes");

    const viewport = page.viewportSize();
    const close = await page.locator("#settings-close").boundingBox();
    const scroll = await page.locator(".settings-scroll").boundingBox();
    const sheet = await page.locator(".settings-sheet").boundingBox();
    await expect(page.locator(".settings-footer")).toBeHidden();
    const titleSize = await page.locator("#settings-title").evaluate((node) => parseFloat(getComputedStyle(node).fontSize));

    expect(close).not.toBeNull();
    expect(scroll).not.toBeNull();
    expect(sheet).not.toBeNull();

    expect(close.x).toBeGreaterThanOrEqual(8);
    expect(close.y).toBeGreaterThanOrEqual(8);
    expect(close.x + close.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(close.y + close.height).toBeLessThanOrEqual(viewport.height - 8);
    expect(scroll.height).toBeGreaterThanOrEqual(120);
    expect(scroll.y + scroll.height).toBeLessThanOrEqual(sheet.y + sheet.height + 1);

    expect(titleSize).toBeLessThanOrEqual(22);
    await page.screenshot({ path: testInfo.outputPath("apple-settings-landscape.png") });
  });
});
