import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(`Usage: node scripts/hidden-object-editing-browser-harness.mjs [--help]\nRuns the local hidden-object editing check against PIXIEED_BROWSER_BASE_URL (default http://127.0.0.1:4182).\nRequires project package playwright, or PIXIEED_PLAYWRIGHT_MODULE as a path, file URL, or package specifier. No dependencies are installed automatically.`); process.exit(0); }
async function loadChromium() { const value = process.env.PIXIEED_PLAYWRIGHT_MODULE?.trim(), pathLike = value && /^(?:\/|\.{1,2}(?:\/|$)|[A-Za-z]:[\\/])/.test(value); const specifier = !value ? 'playwright' : value.startsWith('file:') ? value : pathLike ? pathToFileURL(resolve(value)).href : value; try { const api = await import(specifier); if (!api.chromium?.launch) throw new TypeError('module does not export chromium.launch'); return api.chromium; } catch (error) { console.error(`Unable to load Playwright (${value || 'project package "playwright"'}). Install it in the project with npm install --save-dev playwright, or set PIXIEED_PLAYWRIGHT_MODULE to a valid filesystem path, file URL, or package specifier. No dependency was installed. Cause: ${error.message}`); process.exit(1); } }

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required.');
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true });

async function makeImage(page) {
  const encoded = await page.evaluate(() => {
    const image = document.createElement('canvas'); image.width = image.height = 32;
    const context = image.getContext('2d');
    context.fillStyle = '#7297ad'; context.fillRect(0, 0, 32, 32);
    context.fillStyle = '#e78663'; context.fillRect(5, 5, 2, 2);
    return image.toDataURL('image/png').split(',')[1];
  });
  return { name: 'local-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') };
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin
    ? route.continue()
    : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`${base}/hidden-object/`);
  await page.locator('#hidden-image-file').setInputFiles(await makeImage(page));
  await page.waitForFunction(() => document.querySelector('#hidden-image-slot')?.dataset.filled === 'true');
  await page.locator('#hidden-start').click();
  await page.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
  await page.locator('#hidden-target-settings > summary').click();
  await page.locator('#hidden-name').fill('赤い花'); await page.locator('#hidden-add').click();

  const canvas = page.locator('#hidden-canvas'); const box = await canvas.boundingBox();
  const point = (x, y) => ({ x: box.x + (x + 0.5) * box.width / 32, y: box.y + (y + 0.5) * box.height / 32 });
  const first = point(5, 5); const last = point(6, 6);
  await page.mouse.move(first.x, first.y); await page.mouse.down(); await page.mouse.move(last.x, last.y); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#hidden-target-list')?.textContent.includes('2px'));
  await page.locator('#hidden-undo').click();
  await page.waitForFunction(() => document.querySelector('#hidden-target-list')?.textContent.includes('0px'));
  await page.locator('#hidden-redo').click();
  await page.waitForFunction(() => document.querySelector('#hidden-target-list')?.textContent.includes('2px'));

  await page.locator('#hidden-target-settings > summary').click();
  await page.locator('#hidden-rename').fill('赤い花・改'); await page.locator('#hidden-rename-apply').click();
  assert.match(await page.locator('#hidden-target-list').textContent(), /赤い花・改/);
  await page.locator('#hidden-undo').click(); assert.match(await page.locator('#hidden-target-list').textContent(), /赤い花/);
  await page.locator('#hidden-redo').click(); assert.match(await page.locator('#hidden-target-list').textContent(), /赤い花・改/);

  if (await page.locator('#hidden-target-settings').evaluate(el => el.open)) await page.locator('#hidden-target-settings > summary').click();
  await page.locator('#hidden-confirm').click();
  await page.waitForFunction(() => document.querySelector('#hidden-play-local') && !document.querySelector('#hidden-play-local').disabled);
  await page.locator('#hidden-target-settings > summary').click();
  await page.locator('#hidden-edit-targets').click();
  await page.waitForFunction(() => document.querySelector('#hidden-editor').dataset.confirmed === 'false');
  assert.equal(await page.locator('#hidden-play-local').isHidden(), true, 'editing a confirmed draft must disable local play');
  if (await page.locator('#hidden-target-settings').evaluate(el => el.open)) await page.locator('#hidden-target-settings > summary').click();
  await page.locator('#hidden-confirm').click();
  await page.waitForFunction(() => !document.querySelector('#hidden-play-local').disabled);
  await page.reload();
  if (await page.locator('#hidden-editor').isHidden()) { await page.locator('#hidden-resume').waitFor({ state: 'visible' }); await page.locator('#hidden-resume').click(); }
  await page.waitForFunction(() => document.querySelector('#hidden-editor').dataset.confirmed === 'true');
  assert.match(await page.locator('#hidden-target-list').textContent(), /赤い花・改/);
  await page.locator('#hidden-play-local').click(); await page.waitForURL(/\/play\/hidden-object\/\?localHidden=/);
  await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'PASS', targetMaskUndoRedo: 'PASS', renameUndoRedo: 'PASS', confirmedEdit: 'PASS', saveReopen: 'PASS', localPlay: 'PASS', externalRequests: 'blocked', errors }));
  await context.close();
} finally { await browser.close(); }
