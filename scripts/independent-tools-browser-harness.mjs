import assert from 'node:assert/strict';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local test origin required');
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport }), errors = [];
    await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
    const draw = await context.newPage(), audio = await context.newPage();
    for (const page of [draw, audio]) { page.setDefaultTimeout(10000); page.on('pageerror', (error) => errors.push(error.message)); }
    await draw.goto(base + '/draw/', { waitUntil: 'domcontentloaded' });
    await draw.waitForSelector('#draw-canvas'); await draw.waitForFunction(() => !document.querySelector('#main').inert);
    const tap = async (page, selector, x, y) => { const r = await page.locator(selector).boundingBox(); const size = await page.locator(selector).evaluate((canvas) => ({ width: canvas.width, height: canvas.height })); const point = { x: r.x + (x + .5) * r.width / size.width, y: r.y + (y + .5) * r.height / size.height }; const hit = await page.evaluate(({ point }) => document.elementFromPoint(point.x, point.y)?.id, { point }); assert.equal(hit, selector.slice(1), `Canvas hit was ${hit} at ${JSON.stringify(point)} (${JSON.stringify(r)})`); await page.mouse.click(point.x, point.y); };
    await tap(draw, '#draw-canvas', 4, 4);
    await draw.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
    await draw.locator('#draw-animation-controls-panel .animation-controls__frame-add').click();
    await draw.locator('#draw-animation-controls-panel [data-action="close-animation"]').click();
    await draw.locator('#draw-save').click();
    await draw.waitForFunction(() => new URLSearchParams(location.search).has('pxd'));
    const sourceId = new URL(draw.url()).searchParams.get('pxd'), sourceRevision = new URL(draw.url()).searchParams.get('pxdRevision');
    assert.equal(await draw.locator('.project-mode-picker').count(), 0);
    await audio.goto(base + '/audio/', { waitUntil: 'domcontentloaded' });
    await audio.waitForSelector('#audio-pixel-canvas'); await audio.waitForFunction(() => !document.querySelector('#main').inert);
    assert.equal(new URL(audio.url()).searchParams.has('pxd'), false);
    assert.equal(await audio.locator('.project-mode-picker, #audio-animation-sync').count(), 0);
    await audio.locator('#project-open').click(); await audio.locator('#project-tab-library').click();
    assert.equal(await audio.locator('.project-list__row').count(), 0);
    await audio.locator('.project-imports > summary').click();
    await audio.locator(`#project-import-${sourceId}`).click();
    await audio.waitForFunction(() => !document.querySelector('#main').inert && !document.querySelector('#pxd-panel').open);
    await audio.waitForFunction((sourceId) => { const id = new URLSearchParams(location.search).get('pxd'); return id && id !== sourceId; }, sourceId);
    const audioId = new URL(audio.url()).searchParams.get('pxd');
    assert.notEqual(audioId, sourceId);
    assert.equal(await audio.locator('#audio-animation-controls [data-action="select-frame"]').count(), 2);
    await tap(audio, '#audio-pixel-canvas', 5, 4);
    await saveCurrentProject(audio); await audio.locator('#project-close').click();
    const editedAlpha = await audio.locator('#audio-pixel-canvas').evaluate((canvas) => canvas.getContext('2d').getImageData(5, 4, 1, 1).data[3]);
    assert.equal(editedAlpha, 255, 'Imported Music image must actually accept edits');
    const sourceAfter = await audio.evaluate(async (id) => { const { createPxdStore } = await import('/js/creation/pxd-store.mjs'); const { readPxdImage } = await import('/js/creation/pxd-project.mjs'); const source = await createPxdStore().load(id); const image = await readPxdImage(source, 'main'); return { revision: source.revisionId, alpha: image.rgba[(4 * image.width + 5) * 4 + 3] }; }, sourceId);
    assert.equal(sourceAfter.revision, sourceRevision); assert.equal(sourceAfter.alpha, 0);
    await audio.locator('#project-open').click(); await audio.locator('#project-tab-library').click();
    assert.equal(await audio.locator(`#project-${audioId}`).count(), 1);
    assert.equal(await audio.locator(`#project-${sourceId}`).count(), 0);
    await audio.locator('#project-close').click();
    const layout = await audio.evaluate(() => { const r = document.querySelector('#audio-pixel-canvas').getBoundingClientRect(), nav = document.querySelector('.app-tabs').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1, canvasHeight: r.height, canvasBottom: r.bottom, navTop: nav.top }; });
    assert.equal(layout.overflow, false, JSON.stringify(layout)); assert.ok(layout.canvasHeight > 70 && layout.canvasBottom <= layout.navTop, JSON.stringify(layout));
    await audio.screenshot({ path: `/tmp/pixieed-animation-checks/independent-audio-${viewport.width}x${viewport.height}.png` });
    if (viewport.width === 1280) {
      await audio.locator('#project-open').click(); await audio.locator('#project-tab-library').click();
      await audio.locator(`#project-delete-${audioId}`).click(); await audio.locator('#project-delete-confirm').click();
      await audio.waitForSelector(`#project-restore-${audioId}`, { state: 'attached' });
      const kept = await audio.evaluate(async (id) => (await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id))?.projectId, sourceId);
      assert.equal(kept, sourceId);
      await audio.locator('.project-trash > summary').click(); await audio.locator(`#project-restore-${audioId}`).click();
      await audio.waitForSelector(`#project-${audioId}`); await audio.locator('#project-close').click();
    }
    assert.deepEqual(errors, []); console.log(`PASS independent tools ${viewport.width}x${viewport.height}: separate entry/list/save, copied import, unchanged source, viewport`);
    await context.close();
  }
} finally { await browser.close(); }
