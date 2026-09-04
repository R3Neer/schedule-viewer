import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

function contrastSuite(colorScheme) {
  test.describe(`YAML editor contrast: ${colorScheme}`, () => {
    test.use({ colorScheme, userAgent: IPHONE_UA, hasTouch: true, isMobile: true });

    test("every rendered syntax color clears WCAG AA against the real editor background", async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 402, height: 874 });
      await page.goto("/?date=2026-09-09", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-app-ready", "1");
      await page.locator("#settings-button").click();
      await page.getByRole("button", { name: "Avanzado", exact: true }).click();
      await page.locator("#yaml-edit").click();
      await expect(page.locator(".cm-editor")).toBeVisible();
      const content = page.locator(".cm-content");
      await content.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText('enabled: true\ncount: 42\nname: "Schedule"\n# readable comment\nvalue: null\n');

      const audit = await page.locator(".cm-editor").evaluate((editor) => {
        const parse = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = ([r, g, b]) => {
          const linear = [r, g, b].map((channel) => {
            const value = channel / 255;
            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
          });
          return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
        };
        const ratio = (foreground, background) => {
          const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return (lighter + .05) / (darker + .05);
        };
        const background = parse(getComputedStyle(editor).backgroundColor);
        const tokens = [...editor.querySelectorAll('[class*="tok-"]')].map((node) => ({
          classes: [...node.classList].filter((name) => name.startsWith("tok-")),
          color: getComputedStyle(node).color,
          ratio: ratio(parse(getComputedStyle(node).color), background)
        }));
        const editorRect = editor.getBoundingClientRect();
        const scrollRect = editor.closest(".settings-scroll").getBoundingClientRect();
        return {
          background: getComputedStyle(editor).backgroundColor,
          foreground: getComputedStyle(editor).color,
          foregroundRatio: ratio(parse(getComputedStyle(editor).color), background),
          editorRight: editorRect.right,
          scrollRight: scrollRect.right,
          tokens
        };
      });

      expect(audit.foregroundRatio).toBeGreaterThanOrEqual(4.5);
      expect(audit.editorRight).toBeLessThanOrEqual(audit.scrollRight);
      expect(new Set(audit.tokens.flatMap((token) => token.classes)).size).toBeGreaterThanOrEqual(3);
      for (const token of audit.tokens) expect(token.ratio, `${token.classes.join(".")} ${token.color} on ${audit.background}`).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: testInfo.outputPath(`yaml-editor-${colorScheme}.png`) });
    });
  });
}

contrastSuite("light");
contrastSuite("dark");
