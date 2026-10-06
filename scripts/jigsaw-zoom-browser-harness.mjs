#!/usr/bin/env node
/** Local, isolated acceptance for cursor/pinch anchoring and bounded piece drawing. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_JIGSAW_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? {
  executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh',
} : {}) });
let checks = 0;
const pass = (message) => { checks += 1; console.log(`PASS ${engine}: ${message}`); };

async function fixture(viewport, dpr, size = 64) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    globalThis.jigsawRenderCounts = { paints: 0, draws: 0, canvases: 0 };
    for (const [method, key] of [['clearRect', 'paints'], ['drawImage', 'draws']]) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (this.canvas.id === 'jigsaw-board') globalThis.jigsawRenderCounts[key] += 1;
        return original.apply(this, args);
      };
    }
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (name, ...args) {
      if (String(name).toLowerCase() === 'canvas') globalThis.jigsawRenderCounts.canvases += 1;
      return create.call(this, name, ...args);
    };
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
  const png = await page.evaluate((size) => {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d26448'; ctx.fillRect(0, 0, size, size);
    // The block is one pixel wider than half, so the image is not read as enlarged pixel art (which would be shrunk to 1x).
    ctx.fillStyle = '#406aad'; ctx.fillRect(0, 0, size / 2 + 1, size / 2);
    return canvas.toDataURL('image/png').split(',')[1];
  }, size);
  await page.locator('#jigsaw-source-kind').evaluate((select) => { select.value = 'file'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#jigsaw-file').setInputFiles({ name: 'zoom-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => /\d.*ピース/.test(document.querySelector('.arc-card-count')?.textContent || ''));
  // This bounded-rendering fixture needs a dense partition; the player chooses difficulty.
  await page.locator('#jigsaw-grid-size').evaluate(select=>{select.value='3';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('#jigsaw-start').click();
  await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
  await frame(page);
  return { context, page, errors };
}
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const counts = (page) => page.evaluate(() => ({ ...globalThis.jigsawRenderCounts }));
const worldAt = (page, point) => page.locator('#jigsaw-board').evaluate((canvas, point) => {
  const rect = canvas.getBoundingClientRect(); const matrix = canvas.getContext('2d').getTransform().inverse();
  const value = matrix.transformPoint(new DOMPoint((point.x - rect.left) * Math.min(2, devicePixelRatio), (point.y - rect.top) * Math.min(2, devicePixelRatio)));
  return { x: value.x, y: value.y };
}, point);
function closePoint(actual, expected, message) {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.001, `${message}: ${JSON.stringify({ actual, expected })}`);
}
async function wheel(page, point, deltaY) {
  await page.locator('#jigsaw-workspace').dispatchEvent('wheel', { clientX: point.x, clientY: point.y, deltaY, bubbles: true, cancelable: true });
  await frame(page);
}
async function touch(page, type, id, point) {
  await page.locator('#jigsaw-workspace').dispatchEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 91, button: 0, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
}
async function saveAndRead(page) {
  await page.locator('#jigsaw-save').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-save').disabled && document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
  return page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    return (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(id)).document;
  });
}
async function compareUnculledPixels(page) {
  return page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { createJigsawLayout, sliceJigsawPieces } = await import('/js/creation/jigsaw-workspace.mjs');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    const game = (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(id)).document;
    const layout = createJigsawLayout(game.layout);
    // Decode the fixture's immutable source instead of reconstructing a subtly
    // different half-width block (the source intentionally includes one extra column).
    const sourceImage=new Image();sourceImage.src=game.source.dataUrl;await sourceImage.decode();
    const sourceCanvas=document.createElement('canvas');sourceCanvas.width=layout.width;sourceCanvas.height=layout.height;
    const sourceContext=sourceCanvas.getContext('2d');sourceContext.drawImage(sourceImage,0,0,layout.width,layout.height);
    const rgba=sourceContext.getImageData(0,0,layout.width,layout.height).data;
    const pieces = new Map(sliceJigsawPieces({ width: layout.width, height: layout.height, rgba }, layout).map((piece) => [piece.pieceId, piece]));
    const board = document.querySelector('#jigsaw-board'); const actual = board.getContext('2d');
    const reference = document.createElement('canvas'); reference.width = board.width; reference.height = board.height;
    const ctx = reference.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.setTransform(actual.getTransform());
    for (const group of game.groups) {
      if (group.inTray) continue;
      ctx.save(); ctx.translate(group.x, group.y); ctx.rotate(group.rotation * Math.PI / 2);
      for (const id of group.pieceIds) {
        const piece = pieces.get(id); const canvas = document.createElement('canvas'); canvas.width = piece.bounds.width; canvas.height = piece.bounds.height;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(piece.rgba), canvas.width, canvas.height), 0, 0);
        ctx.drawImage(canvas, piece.bounds.x, piece.bounds.y);
      }
      ctx.restore();
    }
    const expected = ctx.getImageData(0, 0, board.width, board.height).data;
    const rendered = actual.getImageData(0, 0, board.width, board.height).data;
    let changed = 0; for (let i = 0; i < expected.length; i += 1) if (expected[i] !== rendered[i]) changed += 1;
    return changed;
  });
}

try {
  for (const [viewport, dpr] of [[{ width: 320, height: 568 }, 1], [{ width: 568, height: 320 }, 2], [{ width: 1280, height: 800 }, 2]]) {
    const { context, page, errors } = await fixture(viewport, dpr);
    const box = await page.locator('#jigsaw-board').boundingBox();
    const anchor = { x: Math.round(box.x + box.width * 0.72), y: Math.round(box.y + box.height * 0.32) };
    const original = await worldAt(page, anchor);
    await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -110); await frame(page);
    closePoint(await worldAt(page, anchor), original, 'real mouse wheel retains cursor world point');
    await wheel(page, anchor, 100); closePoint(await worldAt(page, anchor), original, 'zoom out retains cursor world point');
    const empty = { x: box.x + 8, y: box.y + 8 };
    await page.mouse.move(empty.x, empty.y); await page.mouse.down(); await page.mouse.move(empty.x + 35, empty.y + 20); await page.mouse.up(); await frame(page);
    const panned = await worldAt(page, anchor); await wheel(page, anchor, -100);
    closePoint(await worldAt(page, anchor), panned, 'cursor anchoring after pan');
    const pose = (await saveAndRead(page)).groups;
    const a = { x: Math.round(box.x + box.width * 0.25), y: Math.round(box.y + box.height * 0.6) };
    const b = { x: a.x + 40, y: a.y };
    const midpoint = { x: a.x + 20, y: a.y }; const pinchWorld = await worldAt(page, midpoint);
    await touch(page, 'pointerdown', 91, a); await touch(page, 'pointerdown', 92, b);
    const movedA = { x: a.x - 8, y: a.y - 4 }; const movedB = { x: b.x + 24, y: b.y + 12 };
    await touch(page, 'pointermove', 91, movedA); await touch(page, 'pointermove', 92, movedB); await frame(page);
    closePoint(await worldAt(page, { x: (movedA.x + movedB.x) / 2, y: (movedA.y + movedB.y) / 2 }), pinchWorld, 'pinch follows moving midpoint');
    await touch(page, 'pointerup', 92, movedB); await touch(page, 'pointerup', 91, movedA);
    assert.deepEqual((await saveAndRead(page)).groups, pose, 'pinch does not move or rotate puzzle pieces');
    const snapshot = await counts(page); await wheel(page, anchor, 0);
    assert.deepEqual(await counts(page), snapshot, 'zero wheel does not redraw');
    for (let i = 0; i < 40; i += 1) await wheel(page, anchor, -100);
    let state = await saveAndRead(page); assert.equal(state.viewport.scale, 12);
    const limit = await worldAt(page, anchor); await wheel(page, anchor, -100);
    closePoint(await worldAt(page, anchor), limit, 'clamped zoom retains its position');
    for (let i = 0; i < 70; i += 1) await wheel(page, anchor, 100);
    state = await saveAndRead(page); assert.equal(state.viewport.scale, 0.2);
    assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal overflow');
    assert.deepEqual(errors, []);
    pass(`${viewport.width}×${viewport.height} DPR${dpr}: cursor/pan/pinch anchors, no piece drift, zoom limits`);
    await context.close();
  }

  const { context, page, errors } = await fixture({ width: 1280, height: 800 }, 2, 192);
  const initial = await saveAndRead(page); assert.equal(initial.groups.length, 4096);
  await page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'); const store = createLocalDraftStore(createIndexedDbDraftAdapter());
    const revision = await store.load(id); const game = revision.document;
    const groups = game.groups.map((group, index) => ({ ...group, x: index < 128 ? 0 : 10000, y: index < 128 ? 0 : 10000, rotation: index % 4, inTray: false }));
    await store.save({ draftId: id, kind: 'jigsaw', ownerId: 'local-owner', document: { ...game, groups }, source: { type: 'jigsaw_game', assetId: game.source.assetId ?? null, revisionId: game.source.revisionId ?? null } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')==='false');
  // PXD may reopen its saved workspace automatically. Reach the source selector
  // before invoking the legacy draft fixture's explicit resume operation.
  if(await page.locator('#jigsaw-setup').evaluate(node=>node.hidden)) {
    await page.locator('.jigsaw-more > summary').click();await page.locator('#jigsaw-new').click();
  }
  await page.locator('#jigsaw-resume').click(); await frame(page);
  const placed = await saveAndRead(page);
  assert.equal(await compareUnculledPixels(page), 0, 'culling retains exact pixels for all four rotations and partly visible pieces');
  assert.ok(await page.locator('#jigsaw-board').evaluate((canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value)), 'visible rotated pieces render');
  const before = await counts(page); const box = await page.locator('#jigsaw-board').boundingBox();
  const anchor = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 };
  await wheel(page, anchor, -100); const after = await counts(page);
  assert.equal(after.canvases, before.canvases, 'zoom reuses cached piece canvases');
  assert.ok(after.draws - before.draws > 0 && after.draws - before.draws <= 128, 'offscreen pieces do not issue drawImage');
  await page.waitForTimeout(120); assert.deepEqual(await counts(page), after, 'idle workspace does not keep redrawing');
  assert.equal(await compareUnculledPixels(page), 0, 'zoomed culling matches an unculled reference exactly');
  assert.deepEqual((await saveAndRead(page)).groups, placed.groups, 'zoom preserves all 4096 piece poses');
  assert.deepEqual(errors, []);
  pass(`4096 pieces: ${after.draws - before.draws} draws per zoom, cached images, no idle redraw`);
  await context.close();
} finally { await browser.close(); }
console.log(`PASS all ${checks} scenarios`);
