import assert from 'node:assert/strict';
import { startIconThemePreview } from '../bin/icon-theme-preview.mjs';
import { iconThemeFixture } from './iconThemeFixture.mjs';

// Optional visual release check; use the installed browser runtime, not a shipped SDK dependency.
const { chromium } = await import(process.env.ZYNC_PLAYWRIGHT_MODULE || 'playwright');
const sample = iconThemeFixture();
let browser, server;
try {
  server = await startIconThemePreview(sample.directory);
  browser = await chromium.launch({ channel: process.env.ZYNC_BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#icons img').first().waitFor();
  assert.equal(await page.locator('#icons img').count(), 3);
  assert.equal(await page.locator('#title').textContent(), 'Example Icons');
  for (const [name, folder, id] of [['package.json', false, 'source'], ['APP.TS', false, 'source'],
    ['backup.tar.gz', false, 'file'], ['unknown', false, 'file'], ['SRC', true, 'source'], ['src ', true, 'folder']]) {
    await page.locator('#name').fill(name);
    await page.locator('#folder').setChecked(folder);
    assert.equal(await page.locator('#sample img').getAttribute('src'), `/icons/${id}`);
  }
  await page.getByRole('button', { name: 'Toggle light/dark' }).click();
  assert.equal(await page.locator('body').getAttribute('class'), 'light');
  const loaded = await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().then(() => image.naturalWidth > 0))));
  assert.ok(loaded.every(Boolean), 'all bundled example icons decode under the preview CSP');
  assert.ok((await page.locator('#folder').boundingBox()).width < 30, 'checkbox remains compact');
  assert.deepEqual(errors, []);
  console.log('Icon preview browser: artwork, mappings, theme toggle, CSP and controls passed.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  sample.cleanup();
}
