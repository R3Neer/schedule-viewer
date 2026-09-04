import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function serveVersions() {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  let version = 'previous';
  let failInstall = false;
  let workerRequests = 0;
  let editorGate = null;
  let releaseEditor;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' };
  const server = createServer(async (request, response) => {
    const name = (new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html')
      .replace(/releases\/test-(previous|next)\//, 'releases/20260904-v4-18/');
    const target = path.resolve(dist, name);
    if (!target.startsWith(dist)) return response.writeHead(403).end();
    if (name === 'service-worker.js') workerRequests++;
    if (name.endsWith('lazy/yaml-editor.js') && editorGate) await editorGate;
    if (failInstall && name === 'config/schedule.json') return response.writeHead(503).end();
    try {
      let body = await readFile(target);
      if (name === 'service-worker.js') body = body.toString().replace('20260904-v4-18', `test-${version}`);
      if (name === 'index.html') body = body.toString().replace('<html lang="es">', `<html lang="es" data-test-release="${version}">`);
      response.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    upgrade({ broken = false } = {}) { version = 'next'; failInstall = broken; },
    get workerRequests() { return workerRequests; },
    holdEditor() { editorGate = new Promise(resolve => { releaseEditor = resolve; }); },
    releaseEditor() { releaseEditor?.(); },
    async close() {
      releaseEditor?.();
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
  };
}

async function openApp(page, url) {
  await page.clock.install();
  await page.addInitScript(() => {
    sessionStorage.setItem('boots', String(Number(sessionStorage.getItem('boots') || 0) + 1));
  });
  await page.goto(url + '?date=2026-09-10');
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', '1');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-app-update', 'current');
  await expect.poll(() => page.evaluate(() => document.body.inert)).toBe(false);
}

async function triggerCheck(page, event = 'online') {
  await page.clock.fastForward(11000);
  await page.evaluate(event => {
    (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
  }, event);
}

for (const event of ['online', 'visibilitychange', 'pageshow', 'interval']) {
  test(`automatically checks on ${event}, reloads once and retains stored data`, async ({ page }) => {
    const server = await serveVersions();
    try {
      await openApp(page, server.url);
      expect(await page.evaluate(() => sessionStorage.getItem('boots'))).toBe('1');
      await page.evaluate(async () => {
        const { saveUserState } = await import('./local-store.js');
        const config = await (await fetch('./config/schedule.json')).json();
        config.app.title = 'Horario conservado';
        config.calendar.inactive.defaultImage = { type: 'image', asset: 'surviving-asset' };
        await saveUserState({ config, assets: [{ id: 'surviving-asset', blob: new Blob(['exact-image-bytes']), mimeType: 'image/png' }] });
      });
      server.upgrade();
      if (event === 'interval') await page.clock.fastForward(5 * 60000);
      else await triggerCheck(page, event);
      await expect(page.locator('html')).toHaveAttribute('data-test-release', 'next');
      await expect(page).toHaveTitle(/^Horario conservado/);
      expect(await page.evaluate(() => sessionStorage.getItem('boots'))).toBe('2');
      expect(await page.evaluate(async () => (await (await import('./local-store.js')).getAsset('surviving-asset')).blob.text())).toBe('exact-image-bytes');
      const requests = server.workerRequests;
      await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('online')); });
      await page.clock.fastForward(1000);
      expect(server.workerRequests).toBe(requests);
    } finally { await server.close(); }
  });
}

test.describe('Apple update notices', () => {
test.use({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1' });
for (const editor of ['settings', 'yaml']) {
  test(`${editor} draft blocks updates in every tab until explicitly saved or discarded`, async ({ page, context }, testInfo) => {
    const server = await serveVersions();
    try {
      await openApp(page, server.url);
      await page.locator('#settings-button').click();
      await page.getByRole('button', { name: editor === 'yaml' ? 'Avanzado' : 'Horario', exact: true }).click();
      await expect(page.locator('#settings-dialog')).toHaveAttribute('data-motion-state', 'open');
      if (editor === 'yaml') {
        await page.locator('#yaml-edit').click();
        await expect(page.locator('.cm-content')).toBeVisible();
        await page.locator('.cm-content').fill('version: [\n');
      } else await page.getByLabel('Nombre', { exact: true }).fill('Borrador protegido');
      const other = await context.newPage();
      await openApp(other, server.url);
      server.upgrade();
      await triggerCheck(other);
      await expect(page.locator('.settings-scroll [data-app-update-notice]')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-test-release', 'previous');
      await expect(other.locator('html')).toHaveAttribute('data-test-release', 'previous');
      expect(await page.evaluate(async () => (await caches.keys()).includes('schedule-viewer-offline-test-previous'))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`pending-${editor}.png`) });
      if (editor === 'yaml') {
        await expect(page.locator('.cm-content')).toContainText('version: [');
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('#settings-close').click();
        await expect(page.locator('#settings-dialog')).toBeVisible();
        page.once('dialog', dialog => dialog.accept());
      } else {
        await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador protegido');
        await page.locator('#settings-save').click();
        await expect(page.locator('#settings-status')).toContainText('Guardado');
      }
      await page.locator('#settings-close').click();
      await page.clock.fastForward(15000);
      await expect(page.locator('html')).toHaveAttribute('data-test-release', 'next');
      await expect(other.locator('html')).toHaveAttribute('data-test-release', 'next');
      if (editor === 'settings') await expect(page).toHaveTitle(/^Borrador protegido/);
      expect(await page.evaluate(() => document.body.inert)).toBe(false);
    } finally { await server.close(); }
  });
}
});

test('an unfinished editor load cannot be closed or interrupted by an update', async ({ page }) => {
  const server = await serveVersions();
  try {
    await openApp(page, server.url);
    await page.locator('#settings-button').click();
    await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
    server.holdEditor();
    await page.locator('#yaml-edit').click();
    await expect(page.locator('.settings-scroll')).toHaveAttribute('aria-busy', 'true');
    server.upgrade();
    await triggerCheck(page);
    await expect(page.locator('.settings-scroll [data-app-update-notice]')).toBeVisible();
    await page.locator('#settings-close').click();
    await expect(page.locator('#settings-status')).toContainText('Espera');
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'previous');
    server.releaseEditor();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.settings-scroll')).not.toHaveAttribute('aria-busy', 'true');
    await page.locator('#settings-close').click();
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'next');
  } finally { await server.close(); }
});

test('a failed update or offline connection keeps the current app usable', async ({ page, context }) => {
  const server = await serveVersions();
  try {
    await openApp(page, server.url);
    await context.setOffline(true);
    const requests = server.workerRequests;
    await triggerCheck(page);
    expect(server.workerRequests).toBe(requests);
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'previous');
    await context.setOffline(false);
    server.upgrade({ broken: true });
    await triggerCheck(page);
    await expect.poll(() => server.workerRequests).toBeGreaterThan(requests);
    await expect.poll(() => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !reg.installing && !reg.waiting;
    })).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'previous');
    await page.locator('#settings-button').click();
    await expect(page.locator('#settings-dialog')).toBeVisible();
  } finally { await server.close(); }
});
