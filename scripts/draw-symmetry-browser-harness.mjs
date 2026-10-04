/** Local source-pixel acceptance for the four drawing symmetry axes. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
async function state() { return page.locator('#draw-canvas').evaluate(c => ({ width: c.width, height: c.height, rgba: [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data], rect: c.getBoundingClientRect().toJSON() })); }
async function ready() { await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen' && !document.querySelector('#main').inert); }
async function settings(keys) {
  if (!await page.locator('#draw-settings-picker').evaluate(n => n.open)) await page.locator('#draw-settings-summary').click();
  for (const key of ['horizontal', 'vertical', 'diagonalDown', 'diagonalUp']) {
    const button = page.locator(`[data-symmetry="${key}"]`);
    if ((await button.getAttribute('aria-pressed') === 'true') !== keys.includes(key)) await button.click();
  }
  await page.locator('#draw-settings-summary').click();
}
async function tap(x, y) {
  const before = await state();
  await page.mouse.click(before.rect.x + (x + .5) * before.rect.width / before.width, before.rect.y + (y + .5) * before.rect.height / before.height);
  const after = await state(), changed = [];
  for (let i = 0; i < after.rgba.length; i += 4) if (after.rgba.slice(i, i + 4).some((v, j) => v !== before.rgba[i + j])) changed.push([i / 4 % after.width, Math.floor(i / 4 / after.width)]);
  return { before, after, changed };
}
const sorted = points => points.map(p => p.join(',')).sort();
async function exact(name, keys, point, expected) {
  await settings(keys); const result = await tap(...point);
  assert.deepEqual(sorted(result.changed), sorted(expected), name);
  await page.locator('#draw-undo').click(); assert.deepEqual((await state()).rgba, result.before.rgba, `${name}: one Undo`);
  results.push({ name, changed: result.changed, undo: true });
}
try {
  await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await ready();
  await exact('left-right', ['horizontal'], [2, 4], [[2,4],[13,4]]);
  await exact('up-down', ['vertical'], [2, 4], [[2,4],[2,11]]);
  await exact('diagonal-down', ['diagonalDown'], [2, 4], [[2,4],[4,2]]);
  await exact('diagonal-up', ['diagonalUp'], [2, 4], [[2,4],[11,13]]);
  await exact('three-axis closure', ['horizontal','vertical','diagonalDown'], [2,4], [[2,4],[13,4],[2,11],[13,11],[4,2],[11,2],[4,13],[11,13]]);
  await exact('center deduplication', ['horizontal','vertical','diagonalDown','diagonalUp'], [7,7], [[7,7],[8,7],[7,8],[8,8]]);
  const fixture = await page.evaluate(async () => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
    const { importToolProject } = await import('/js/creation/tool-project-import.mjs');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const rgba = new Uint8Array(16 * 8 * 4);
    for (let x = 0; x < 3; x++) rgba.set([[200,60,60,255],[70,180,70,255],[50,90,230,255]][x], (7 * 16 + x) * 4);
    const input = await putPxdSharedImage(createPxdProject(), { width:16, height:8, rgba });
    const project = await createToolProjectStore('draw').save(await importToolProject(input,'draw'), { expectedRevisionId:null });
    return { id:project.projectId, revision:project.revisionId };
  });
  await page.goto(`${base}/draw/?` + new URLSearchParams({ pxd:fixture.id, pxdRevision:fixture.revision })); await ready();
  assert.equal((await state()).height,8);
  await exact('rectangle diagonal clip', ['diagonalDown'], [2,1], [[2,1]]);
  await exact('rectangle centered diagonal', ['diagonalDown'], [5,4], [[5,4],[8,1]]);
  await settings(['vertical','diagonalUp']);
  await page.waitForFunction(() => document.querySelector('#project-open').dataset.state === 'saved');
  await page.waitForFunction(async id => { const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id); return project?.manifest.editorState?.draw?.symmetry?.vertical && project?.manifest.editorState?.draw?.symmetry?.diagonalUp; }, fixture.id);
  const latestRevision = await page.evaluate(async id => (await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id)).revisionId, fixture.id);
  await page.goto(`${base}/draw/?` + new URLSearchParams({ pxd:fixture.id, pxdRevision:latestRevision }), { waitUntil: 'domcontentloaded' }); await ready();
  await page.waitForFunction(() => document.querySelector('[data-symmetry="vertical"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('[data-symmetry="vertical"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-symmetry="diagonalUp"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-symmetry="horizontal"]').getAttribute('aria-pressed'),'false');
  results.push({ name:'PXD symmetry preference restore', passed:true });
  assert.deepEqual(errors, []);
  await mkdir('/tmp/pixieed-symmetry-20261004',{recursive:true});
  await page.screenshot({path:'/tmp/pixieed-symmetry-20261004/source-pixels.png'});
  await writeFile('/tmp/pixieed-symmetry-20261004/results.json', JSON.stringify({results,errors},null,2));
  console.log(`PASS ${results.length} source-pixel cases: four axes, combinations, center deduplication, rectangular clip, Undo, PXD restore`);
} finally { await context.close(); await browser.close(); }
