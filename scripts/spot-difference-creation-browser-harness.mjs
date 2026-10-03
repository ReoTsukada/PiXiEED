import assert from 'node:assert/strict';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to the existing Playwright module.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
async function makePng(page, changed = false) {
  const data = await page.evaluate((value) => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d'); context.fillStyle = '#345f88'; context.fillRect(0, 0, 32, 32);
    if (value) { context.fillStyle = '#e66b42'; context.fillRect(10, 10, 3, 3); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, changed);
  return Buffer.from(data, 'base64');
}
async function open(viewport, { slowDecode = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (slowDecode) await context.addInitScript(() => {
    const native = window.createImageBitmap.bind(window);
    window.createImageBitmap = (...args) => new Promise((resolve, reject) => setTimeout(() => native(...args).then(resolve, reject), 350));
  });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  const page = await context.newPage(); await page.goto(`${baseUrl}/spot-difference/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#spot-import-pair'); await page.waitForFunction(() => window.indexedDB);
  return { context, page };
}

try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open(viewport);
    const before = await makePng(page); const after = await makePng(page, true);
    await page.locator('#spot-before-file').setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: before });
    await page.waitForFunction(() => document.querySelector('#spot-before-slot')?.dataset.filled === 'true');
    assert.equal(await page.locator('#spot-import-pair').textContent(), '違いを描く');
    assert.equal(await page.locator('#spot-inline-draw').isVisible(), false, 'choosing a file only stages its preview');
    assert.equal(await page.locator('#spot-editor').isVisible(), false, 'choosing a file must not auto-open the editor');
    await page.locator('#spot-after-file').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: after });
    await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
    assert.equal(await page.locator('#spot-import-pair').textContent(), '候補を確認');
    await page.locator('#spot-import-pair').click();
    await page.waitForFunction(() => !document.querySelector('#spot-editor').hidden);
    assert.match(await page.locator('#spot-status').textContent(), /差分候補/);
    assert.ok(await page.locator('#spot-candidates li').count() > 0);
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(overflow.scroll <= overflow.width + 1, `two-image flow overflows at ${viewport.width}x${viewport.height}: ${JSON.stringify(overflow)}`);
    await context.close();
    console.log(`PASS two-image import ${viewport.width}x${viewport.height}`);
  }

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const { context, page } = await open(viewport);
    const transparent = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#spot-after-file').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') });
    await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
    assert.equal(await page.locator('#spot-import-pair').textContent(), '違いを描く');
    assert.equal(await page.locator('#spot-editor').isVisible(), false, 'one image stays as a preview until the primary action');
    await page.locator('#spot-import-pair').click();
    await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
    const canvasBox = await page.locator('#spot-inline-canvas').boundingBox();
    assert.ok(canvasBox && canvasBox.height > 150, `inline canvas is too short at ${viewport.width}x${viewport.height}: ${JSON.stringify(canvasBox)}`);
    const overlap = await page.evaluate(() => {
      const stage = document.querySelector('#spot-inline-draw').getBoundingClientRect(); const nav = document.querySelector('.app-tabs').getBoundingClientRect();
      return stage.bottom <= nav.top + 1;
    });
    assert.ok(overlap, `inline stage overlaps bottom navigation at ${viewport.width}x${viewport.height}`);
    await page.locator('#spot-inline-add-color').fill('#e66b42');
    await page.locator('#spot-inline-canvas').click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });
    await page.locator('#spot-inline-finish').click();
    await page.waitForFunction(() => !document.querySelector('#spot-editor').hidden);
    assert.ok(await page.locator('#spot-candidates li').count() > 0, 'drawing should produce a candidate');
    assert.equal(await page.locator('#spot-play-local').isVisible(), false, 'unconfirmed draft must not be playable yet');
    assert.equal(await page.locator('#spot-publish').isEnabled(), false, 'publishing must stay disabled while preparing');
    await context.close();
    console.log(`PASS single-image clone/draw/candidate ${viewport.width}x${viewport.height}`);
  }

  {
    const { context, page } = await open({ width: 320, height: 568 });
    const image = await makePng(page, true);
    await page.locator('#spot-after-slot').evaluate((host, bytes) => {
      const file = new File([Uint8Array.from(atob(bytes), (char) => char.charCodeAt(0))], 'dropped.png', { type: 'image/png' });
      const transfer = new DataTransfer(); transfer.items.add(file);
      host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, image.toString('base64'));
    await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
    assert.equal(await page.locator('#spot-after-slot [data-slot-preview]').isVisible(), true, 'drop should populate a preview');
    assert.equal(await page.locator('#spot-inline-draw').isVisible(), false, 'drop should not start drawing');
    assert.equal(await page.locator('#spot-editor').isVisible(), false, 'drop should not start comparison');
    assert.equal(await page.locator('#spot-import-pair').textContent(), '違いを描く');
    await context.close();
    console.log('PASS dropped image previews without auto-opening');
  }

  {
    const { context, page } = await open({ width: 390, height: 844 }, { slowDecode: true });
    await page.locator('#spot-before-file').setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: await makePng(page) });
    await page.locator('#spot-after-file').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: await makePng(page, true) });
    await page.locator('#spot-import-pair').click();
    await page.locator('#project-open').click();
    await page.waitForSelector('#project-new', { state: 'visible', timeout: 10000 });
    await page.locator('#project-new').click();
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true' && !document.querySelector('#main').inert);
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#spot-editor').isVisible(), false, 'a delayed old import must not replace the newly opened project');
    assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:picture:spot-difference:v1')), null, 'stale decoded files must not be installed after switching projects');
    await context.close();
    console.log('PASS delayed import cannot replace project selected during decode');
  }

  {
    const { context, page } = await open({ width: 390, height: 844 });
    await page.locator('#project-open').click();
    await page.locator('#project-new').click();
    await page.waitForFunction(() => !document.querySelector('#main').inert);
    const transparent = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#spot-before-file').setInputFiles({ name: 'unfinished.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') });
    await page.locator('#spot-import-pair').click();
    await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
    const readSavedPxd = () => page.evaluate(async () => {
      const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:spot_difference'));
      const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261001-free-tools-1');
      const { readPxdPuzzle, materializePxdPuzzle } = await import('/js/creation/pxd-puzzles.mjs?rev=20261001-free-tools-1');
      const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
      const project = await createToolProjectStore('spot_difference').load(pointer.projectId, pointer.revisionId);
      const read = await readPxdPuzzle(project, 'spot_difference');
      const reopened = await materializePxdPuzzle(read, { tool: 'spot_difference', store: createLocalDraftStore(createIndexedDbDraftAdapter()) });
      return { candidates: read.document.candidates.length, reopenedCandidates: reopened.document.candidates.length, width: read.document.width, height: read.document.height, beforeWidth: read.images['spot-before'].width, afterWidth: read.images['spot-after'].width, before: read.images['spot-before'].rgba.join(','), after: read.images['spot-after'].rgba.join(',') };
    });
    await page.locator('#project-open').click();
    await page.locator('#project-tab-current').click();
    await saveCurrentProject(page);
    await page.waitForFunction(() => localStorage.getItem('pixieed:pxd:last:spot_difference'));
    const untouched = await readSavedPxd();
    assert.equal(untouched.candidates, 0, 'unfinished empty state should be stored as an empty candidate set');
    assert.equal(untouched.reopenedCandidates, 0, 'empty candidate state should survive reopening');
    assert.equal(untouched.before, untouched.after, 'the untouched working copy should be independent but pixel-equal');
    await page.locator('#project-close').click();
    await page.locator('#spot-inline-add-color').fill('#e66b42');
    const canvasBox = await page.locator('#spot-inline-canvas').boundingBox();
    await page.locator('#spot-inline-canvas').click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });
    await page.locator('#project-open').click();
    await page.locator('#project-tab-current').click();
    const previousPxdRevision = await page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pxd:last:spot_difference')).revisionId);
    await saveCurrentProject(page);
    await page.waitForFunction((previous) => JSON.parse(localStorage.getItem('pixieed:pxd:last:spot_difference') || 'null')?.revisionId !== previous, previousPxdRevision);
    const roundTrip = await readSavedPxd();
    assert.equal(roundTrip.candidates, 1, 'drawn work should be stored as a candidate');
    assert.equal(roundTrip.reopenedCandidates, 1, 'drawn candidate should survive reopening');
    assert.ok(roundTrip.before !== roundTrip.after, 'drawing changes the working copy while keeping the original immutable');
    assert.ok(roundTrip.width > 0 && roundTrip.height > 0 && roundTrip.beforeWidth === roundTrip.width && roundTrip.afterWidth === roundTrip.width);
    await context.close();
    console.log('PASS empty and drawn inline work both save/reopen without changing the original');
  }
} finally { await browser.close(); }
