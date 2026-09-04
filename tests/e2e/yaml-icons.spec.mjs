import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' });
test('YAML icons remain accessible, export saved data and validate imports', async ({ page }) => {
  await page.goto('/');
  await page.locator('#settings-button').click();
  await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
  const editing = page.getByRole('button', { name: 'Editar YAML', exact: true });
  const importing = page.getByRole('button', { name: 'Importar YAML', exact: true });
  const exporting = page.getByRole('button', { name: 'Exportar YAML', exact: true });
  for (const button of [editing, importing, exporting]) {
    await expect(button).toHaveText('');
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await editing.click();
  await expect(page.locator('#settings-dialog')).toHaveAttribute('data-panel', 'yaml');
  await expect(page.locator('#settings-title')).toHaveText('Editor YAML');
  await expect(page.locator('#settings-back-label')).toHaveText('Avanzado');
  await page.locator('#settings-back').click();
  await expect(page.locator('#settings-dialog')).toHaveAttribute('data-panel', 'advanced');
  await expect(editing).toBeFocused();
  await importing.focus();
  await page.keyboard.press('Tab');
  await expect(exporting).toBeFocused();
  const downloaded = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.yaml$/);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const yaml = Buffer.concat(chunks);
  expect(yaml.toString()).toContain('academic_years:');
  const upload = async buffer => {
    const chooser = page.waitForEvent('filechooser');
    await importing.click();
    await (await chooser).setFiles({ name: 'test.yaml', mimeType: 'text/yaml', buffer });
  };
  await upload(Buffer.from('version: [\n'));
  await expect(page.locator('#yaml-file-status')).not.toContainText('YAML importado');
  await expect(page.locator('.settings-scroll')).not.toHaveAttribute('aria-busy', 'true');
  await upload(yaml);
  await expect(page.locator('#yaml-file-status')).toContainText('YAML importado y aplicado');
  expect(await page.locator('.settings-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Exercise the native input cancellation path without manufacturing a file.
  const chooser = page.waitForEvent('filechooser');
  await importing.click();
  await chooser;
  await page.locator('input[type=file]').evaluate(el => el.dispatchEvent(new Event('cancel')));
  await expect(page.locator('.settings-scroll')).not.toHaveAttribute('aria-busy', 'true');
});
