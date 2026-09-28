#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(BASE).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Localhost test server required');
const pwPath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!pwPath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright installation');
const { chromium, webkit } = await import(pathToFileURL(pwPath).href);
const viewports = [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }];
let checks = 0;
function pass(message) { checks += 1; console.log(`PASS ${message}`); }

async function localOnly(page) {
  const external = [];
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push({ url: route.request().url(), method: route.request().method() }); return route.abort();
  });
  return external;
}

async function makeDrawDraft(page, size = 16) {
  await page.goto(new URL('/draw/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.locator('#draw-import-file').waitFor();
  if (size !== 16) await page.locator('#draw-size').selectOption(String(size));
  const pngDataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const context = canvas.getContext('2d'); const image = context.createImageData(16, 16);
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const i = (y * 16 + x) * 4; const color = ((x >> 2) + (y >> 2)) % 4;
      image.data.set([[20, 50, 100, 255], [220, 60, 40, 255], [30, 170, 90, 255], [240, 190, 30, 255]][color], i);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  });
  await page.locator('#draw-import-file').setInputFiles({ name: 'local-jigsaw-fixture.png', mimeType: 'image/png', buffer: Buffer.from(pngDataUrl.split(',')[1], 'base64') });
  await page.locator('#draw-save').click();
  await page.waitForFunction(() => document.querySelector('#draw-status')?.textContent.includes('保存しました'));
  return page.evaluate(() => localStorage.getItem('pixieed.simple-draw.last-draft.v1'));
}

/** ジグソー keeps its own picture: bring the Draw picture in from the shelf (one tap). */
async function bringDrawPicture(page) {
  const chip = page.locator('#jigsaw-shelf .picture-shelf__item').first();
  await chip.waitFor({ state: 'visible' }); await chip.click();
  await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('持ってきました'));
}

async function storedJigsaw(page) {
  return page.evaluate(async () => {
    const open = indexedDB.open('pixieed-creation-drafts-v1', 1);
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    const row = await new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return row || null;
  });
}
async function drawRevisionHash(page, draftId) {
  return page.evaluate(async (id) => {
    const open = indexedDB.open('pixieed-creation-drafts-v1', 1);
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const record = await new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return record?.revisions?.at(-1)?.documentHash || null;
  }, draftId);
}

async function layoutInfo(page) {
  return page.evaluate(async () => {
    const { createJigsawLayout } = await import('/js/creation/jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1');
    const game = (await (async () => {
      const dbRequest = indexedDB.open('pixieed-creation-drafts-v1', 1);
      const db = await new Promise((resolve, reject) => { dbRequest.onsuccess = () => resolve(dbRequest.result); dbRequest.onerror = () => reject(dbRequest.error); });
      const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
      return new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onsuccess = () => resolve(request.result?.revisions?.at(-1)?.document); request.onerror = () => reject(request.error); });
    })());
    if (!game) return null;
    const layout = createJigsawLayout(game.layout);
    return { game, pieces: layout.pieces.map(({ pieceId, row, column, bounds, mask }) => ({ pieceId, row, column, bounds, alphaPixels: mask.reduce((sum, pixel) => sum + pixel, 0), boxPixels: mask.length })) };
  });
}

async function visibleControlLayout(page) {
  return page.evaluate(() => {
    const visible = [...document.querySelectorAll('#jigsaw-play button:not([hidden]),#jigsaw-play select:not([hidden]),#jigsaw-play [role="button"]')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const boxes = visible.map((el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.getAttribute('aria-label') || el.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1) overlaps.push([a.id, b.id]);
    }
    const smallTargets = boxes.filter((box) => box.width < 43.9 || box.height < 43.9);
    return { overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth, boxes, overlaps, smallTargets };
  });
}
async function canvasAlphaSummary(page) {
  return page.locator('#jigsaw-board').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0, left = canvas.width, top = canvas.height, right = -1, bottom = -1, sum = 0;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const alpha = data[(y * canvas.width + x) * 4 + 3]; if (!alpha) continue;
      count += 1; sum = (sum + alpha) >>> 0; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { count, sum, left, top, right, bottom, width: right >= left ? right - left + 1 : 0, height: bottom >= top ? bottom - top + 1 : 0 };
  });
}
async function seedAdjacentGroups(page, secondRotation) {
  return page.evaluate(async (rotation) => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { createJigsawLayout, validateJigsawWorkspace } = await import('/js/creation/jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    const store = createLocalDraftStore(createIndexedDbDraftAdapter()); const revision = await store.load(id); const prior = revision.document;
    const layout = createJigsawLayout(prior.layout); const first = layout.pieces.find((piece) => piece.row === 0 && piece.column === 0); const second = layout.pieces.find((piece) => piece.row === 0 && piece.column === 1);
    if (!first || !second) throw new Error('Adjacent fixture pieces are missing');
    const groups = prior.groups.map((group) => {
      if (group.pieceIds.includes(first.pieceId)) return { ...group, x: 0, y: 0, rotation: 0, inTray: false };
      if (group.pieceIds.includes(second.pieceId)) return { ...group, x: 0, y: 0, rotation, inTray: false };
      return { ...group, x: 0, y: 0, rotation: 0, inTray: true };
    });
    const document = validateJigsawWorkspace({ ...prior, groups }, layout);
    await store.save({ draftId: id, kind: 'jigsaw', ownerId: 'local-owner', document, source: { type: 'jigsaw_game', assetId: document.source.assetId, revisionId: document.source.revisionId } });
    return { id, first: first.pieceId, second: second.pieceId, firstGroup: `group-${first.pieceId}`, secondGroup: `group-${second.pieceId}` };
  }, secondRotation);
}

async function seedWholeImageGroup(page) {
  return page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { createJigsawLayout, validateJigsawWorkspace } = await import('/js/creation/jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'); const store = createLocalDraftStore(createIndexedDbDraftAdapter());
    const revision = await store.load(id); const prior = revision.document; const layout = createJigsawLayout(prior.layout);
    const ids = layout.pieces.map((piece) => piece.pieceId);
    const document = validateJigsawWorkspace({ ...prior, groups: [{ groupId: `group-${ids[0]}`, pieceIds: ids, x: 0, y: 0, rotation: 0, inTray: false }] }, layout);
    await store.save({ draftId: id, kind: 'jigsaw', ownerId: 'local-owner', document, source: { type: 'jigsaw_game', assetId: document.source.assetId ?? null, revisionId: document.source.revisionId ?? null } });
    return { id, width: layout.width, height: layout.height };
  });
}

async function testAspectRatio(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage(); const external = await localOnly(page); const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message)); await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' });
  const imageDataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 12; const ctx = canvas.getContext('2d');
    for (let y = 0; y < 12; y += 1) for (let x = 0; x < 24; x += 1) { ctx.fillStyle = (x + y) % 2 ? '#e75445' : '#4c82c3'; ctx.fillRect(x, y, 1, 1); }
    return canvas.toDataURL('image/png');
  });
  await page.locator('#jigsaw-source-kind').selectOption('file');
  await page.locator('#jigsaw-file').setInputFiles({ name: 'landscape-fixture.png', mimeType: 'image/png', buffer: Buffer.from(imageDataUrl.split(',')[1], 'base64') });
  await page.locator('#jigsaw-grid-size').selectOption('3'); await page.locator('#jigsaw-start').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden); await page.locator('#jigsaw-save').click();
  await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  const source = await seedWholeImageGroup(page); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#jigsaw-resume').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  await page.waitForFunction(() => { const canvas = document.querySelector('#jigsaw-board'); if (!canvas?.width) return false; const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); for (let i = 3; i < data.length; i += 4) if (data[i]) return true; return false; });
  const shape = await canvasAlphaSummary(page); const workspace = await page.locator('#jigsaw-workspace').boundingBox();
  assert.ok(Math.abs(shape.width / shape.height - 2) < 0.08, `${browserName}: 24×12 source retains its 2:1 ratio, got ${shape.width}×${shape.height}`);
  const cx = workspace.x + (shape.left + shape.right + 1) / 2 / 2; const cy = workspace.y + (shape.top + shape.bottom + 1) / 2 / 2;
  assert.ok(Math.abs(cx - (workspace.x + workspace.width / 2)) < 3 && Math.abs(cy - (workspace.y + workspace.height / 2)) < 3, `${browserName}: source remains centered in the workspace`);
  const canvas = await page.locator('#jigsaw-board').evaluate((node) => { const rect = node.getBoundingClientRect(); return { width: node.width, height: node.height, cssWidth: rect.width, cssHeight: rect.height }; });
  assert.equal(canvas.width, Math.round(canvas.cssWidth * 2)); assert.equal(canvas.height, Math.round(canvas.cssHeight * 2));
  assert.deepEqual(pageErrors, []); assert.ok(external.every((request) => request.method === 'GET'), 'external-origin preparation requests are blocked and no writes are attempted');
  assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1')), source.id);
  pass(`${browserName}: non-square source ratio, centering and DPR2 canvas backing`); await context.close();
}

async function testKeyboardAndPinch(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage(); const external = await localOnly(page); const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message)); await makeDrawDraft(page); await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' }); await bringDrawPicture(page);
  await page.waitForFunction(() => document.querySelectorAll('#jigsaw-source-version option').length > 0); await page.locator('#jigsaw-grid-size').selectOption('3');
  await page.locator('#jigsaw-start').scrollIntoViewIfNeeded(); await page.locator('#jigsaw-start').click(); await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  const trayPiece = page.locator('#jigsaw-tray [data-group-id]').first(); const groupId = await trayPiece.getAttribute('data-group-id');
  await trayPiece.focus(); await page.keyboard.press('Enter'); await page.locator('#jigsaw-workspace').focus(); await page.keyboard.press('Enter');
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  let game = (await storedJigsaw(page)).revisions.at(-1).document; let group = game.groups.find((item) => item.groupId === groupId);
  assert.equal(group.inTray, false, 'keyboard Enter places the focused selected tray group'); const starting = { x: group.x, y: group.y, rotation: group.rotation };
  const workspace = page.locator('#jigsaw-workspace'); await workspace.focus(); await page.keyboard.press('r'); await page.keyboard.press('ArrowRight');
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document; group = game.groups.find((item) => item.groupId === groupId);
  assert.equal(group.rotation, (starting.rotation + 1) % 4, 'keyboard R rotates the selected group by one quarter-turn');
  assert.notEqual(group.x, starting.x, 'keyboard arrow moves the selected group');
  const beforePinch = { x: group.x, y: group.y, rotation: group.rotation, scale: game.viewport?.scale ?? 1 };
  const board = await workspace.boundingBox(); const a = { x: board.x + 12, y: board.y + board.height - 14 }; const b = { x: board.x + 48, y: board.y + board.height - 14 };
  await workspace.dispatchEvent('pointerdown', { bubbles: true, pointerId: 91, pointerType: 'touch', isPrimary: true, button: 0, clientX: a.x, clientY: a.y });
  await workspace.dispatchEvent('pointerdown', { bubbles: true, pointerId: 92, pointerType: 'touch', isPrimary: false, button: 0, clientX: b.x, clientY: b.y });
  await workspace.dispatchEvent('pointermove', { bubbles: true, pointerId: 92, pointerType: 'touch', isPrimary: false, button: 0, clientX: b.x + 36, clientY: b.y });
  await workspace.dispatchEvent('pointerup', { bubbles: true, pointerId: 92, pointerType: 'touch', button: 0, clientX: b.x + 36, clientY: b.y });
  await workspace.dispatchEvent('pointerup', { bubbles: true, pointerId: 91, pointerType: 'touch', button: 0, clientX: a.x, clientY: a.y });
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document; group = game.groups.find((item) => item.groupId === groupId);
  assert.ok(game.viewport.scale > beforePinch.scale + 0.05, `two-pointer pinch changes persisted zoom from ${beforePinch.scale} to ${game.viewport.scale}`);
  assert.deepEqual({ x: group.x, y: group.y, rotation: group.rotation }, { x: beforePinch.x, y: beforePinch.y, rotation: beforePinch.rotation }, 'pinch zoom leaves group pose unchanged');
  assert.ok(external.every((request) => request.method === 'GET')); assert.deepEqual(pageErrors, []);
  pass(`${browserName}: keyboard placement/move/rotate and two-pointer pinch zoom`); await context.close();
}

async function testTrayPaging(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage(); const external = await localOnly(page); const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // かんたんドット絵 stops at 64px, so the 128px picture for 1,764 pieces comes in as an image file.
  await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' });
  const bigPng = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { g.fillStyle = `hsl(${(x + y) * 1.4},70%,55%)`; g.fillRect(x, y, 8, 8); } return c.toDataURL('image/png'); });
  await page.locator('#jigsaw-source-kind').selectOption('file');
  await page.locator('#jigsaw-file').setInputFiles({ name: 'paging-128.png', mimeType: 'image/png', buffer: Buffer.from(bigPng.split(',')[1], 'base64') });
  await page.locator('#jigsaw-grid-size').selectOption('3'); await page.locator('#jigsaw-start').click(); await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  const seeded = await layoutInfo(page);
  assert.equal(seeded.game.layout.width, 128); assert.equal(seeded.game.layout.columns * seeded.game.layout.rows, 1764);
  assert.equal(await page.locator('#jigsaw-tray [data-group-id]').count(), 80, 'tray renders no more than 80 groups at once');
  assert.match(await page.locator('#jigsaw-tray-page').textContent(), /^1 \/ 23$/);
  const firstPageIds = await page.locator('#jigsaw-tray [data-group-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.groupId));
  let pages = 1;
  while (await page.locator('#jigsaw-tray-next').isEnabled()) {
    await page.locator('#jigsaw-tray-next').click(); pages += 1;
    const count = await page.locator('#jigsaw-tray [data-group-id]').count(); assert.ok(count <= 80, `tray DOM remains bounded while paging; got ${count}`);
  }
  assert.equal(pages, 23); assert.equal(await page.locator('#jigsaw-tray [data-group-id]').count(), 4, 'last page contains only remaining groups');
  assert.match(await page.locator('#jigsaw-tray-page').textContent(), /^23 \/ 23$/);
  while (await page.locator('#jigsaw-tray-prev').isEnabled()) await page.locator('#jigsaw-tray-prev').click();
  assert.deepEqual(await page.locator('#jigsaw-tray [data-group-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.groupId)), firstPageIds, 'paging back restores the first shuffled tray page');
  assert.ok(external.every((request) => request.method === 'GET')); assert.deepEqual(pageErrors, []);
  pass(`${browserName}: 1,764 groups page through an 80-element tray cap`); await context.close();
}

async function pointerForPiece(page, pieceId, rotation = 0) {
  return page.evaluate(async ({ pieceId, rotation }) => {
    const { createJigsawLayout } = await import('/js/creation/jigsaw-workspace.mjs?rev=20260928-jigsaw-workspace-1');
    const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    const dbRequest = indexedDB.open('pixieed-creation-drafts-v1', 1);
    const db = await new Promise((resolve, reject) => { dbRequest.onsuccess = () => resolve(dbRequest.result); dbRequest.onerror = () => reject(dbRequest.error); });
    const record = await new Promise((resolve, reject) => { const req = db.transaction('drafts').objectStore('drafts').get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const game = record.revisions.at(-1).document; const layout = createJigsawLayout(game.layout); const piece = layout.pieces.find((item) => item.pieceId === pieceId);
    const candidates = [];
    for (let y = 0; y < piece.bounds.height; y += 1) for (let x = 0; x < piece.bounds.width; x += 1) if (piece.mask[y * piece.bounds.width + x]) candidates.push([piece.bounds.x + x + 0.5, piece.bounds.y + y + 0.5]);
    candidates.sort((a, b) => Math.hypot(a[0] - piece.x - piece.width / 2, a[1] - piece.y - piece.height / 2) - Math.hypot(b[0] - piece.x - piece.width / 2, b[1] - piece.y - piece.height / 2));
    let [wx, wy] = candidates[Math.floor(candidates.length / 2)];
    if (rotation === 1) [wx, wy] = [-wy, wx]; else if (rotation === 2) [wx, wy] = [-wx, -wy]; else if (rotation === 3) [wx, wy] = [wy, -wx];
    const rect = document.querySelector('#jigsaw-workspace').getBoundingClientRect();
    const fit = Math.min(rect.width / game.layout.width, rect.height / game.layout.height) * 0.88;
    return { x: rect.left + rect.width / 2 - game.layout.width * fit / 2 + wx * fit, y: rect.top + rect.height / 2 - game.layout.height * fit / 2 + wy * fit };
  }, { pieceId, rotation });
}

async function testMergeGestures(browser, browserName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage(); const external = await localOnly(page); const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await makeDrawDraft(page); await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' }); await bringDrawPicture(page);
  await page.waitForFunction(() => document.querySelectorAll('#jigsaw-source-version option').length > 0);
  await page.locator('#jigsaw-grid-size').selectOption('3'); await page.locator('#jigsaw-start').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));

  const ids = await seedAdjacentGroups(page, 1);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#jigsaw-resume').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  let point = await pointerForPiece(page, ids.second, 1);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  assert.equal(await page.locator('#jigsaw-rotate').isEnabled(), true, 'rotated board piece is hit-testable');
  assert.match(await page.locator('#jigsaw-selection').textContent(), /90°/, 'pointer selected the seeded quarter-turned piece specifically');
  await page.mouse.move(point.x + 9, point.y + 8, { steps: 2 }); await page.mouse.move(point.x, point.y, { steps: 2 }); await page.mouse.up();
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  let game = (await storedJigsaw(page)).revisions.at(-1).document;
  assert.equal(game.groups.length, 25, 'adjacent pieces with different quarter-turns do not merge after a real pointer drag');
  const cancelledPlaced = game.groups.find((group) => group.groupId === ids.secondGroup);
  assert.deepEqual({ x: cancelledPlaced.x, y: cancelledPlaced.y, rotation: cancelledPlaced.rotation, inTray: cancelledPlaced.inTray }, { x: 0, y: 0, rotation: 1, inTray: false }, 'mismatched quarter-turn stays unmerged at the aligned pose');
  point = await pointerForPiece(page, ids.second, 1);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 18, point.y + 12, { steps: 2 });
  await page.locator('#jigsaw-workspace').dispatchEvent('pointercancel', { bubbles: true, pointerId: 1, clientX: point.x + 18, clientY: point.y + 12, button: 0 }); await page.mouse.up();
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document;
  const cancelGroup = game.groups.find((group) => group.groupId === ids.secondGroup);
  assert.deepEqual({ x: cancelGroup.x, y: cancelGroup.y, rotation: cancelGroup.rotation, inTray: cancelGroup.inTray }, { x: 0, y: 0, rotation: 1, inTray: false }, 'pointercancel restores a placed group to its initial pose');

  const trayButton = page.locator('#jigsaw-tray [data-group-id]').first(); const trayId = await trayButton.getAttribute('data-group-id'); const trayBox = await trayButton.boundingBox(); const workspaceBox = await page.locator('#jigsaw-workspace').boundingBox();
  await page.mouse.move(trayBox.x + trayBox.width / 2, trayBox.y + trayBox.height / 2); await page.mouse.down();
  await page.mouse.move(workspaceBox.x + workspaceBox.width * 0.6, workspaceBox.y + workspaceBox.height * 0.4, { steps: 6 });
  await page.locator('#jigsaw-workspace').dispatchEvent('pointercancel', { bubbles: true, pointerId: 1, clientX: workspaceBox.x + workspaceBox.width * 0.6, clientY: workspaceBox.y + workspaceBox.height * 0.4, button: 0 }); await page.mouse.up();
  await page.waitForFunction((id) => Boolean(document.querySelector(`#jigsaw-tray [data-group-id="${id}"]`)), trayId);
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document;
  const cancelledTray = game.groups.find((group) => group.groupId === trayId);
  assert.equal(cancelledTray.inTray, true, 'pointercancel while transferring a tray piece restores it to the tray');

  await seedAdjacentGroups(page, 0); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#jigsaw-resume').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  point = await pointerForPiece(page, ids.second, 0);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  assert.equal(await page.locator('#jigsaw-rotate').isEnabled(), true, 'target piece is selected by a real pointer hit');
  await page.mouse.move(point.x + 9, point.y + 8, { steps: 2 }); await page.mouse.move(point.x, point.y, { steps: 2 }); await page.mouse.up();
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document;
  let merged = game.groups.find((group) => group.pieceIds.length === 2);
  assert.ok(merged && merged.pieceIds.includes(ids.first) && merged.pieceIds.includes(ids.second), 'correctly aligned adjacent pieces form one persisted group');
  const originalMembers = [...merged.pieceIds].sort(); const originalPose = { x: merged.x, y: merged.y };
  point = await pointerForPiece(page, ids.first, 0);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 18, point.y + 12, { steps: 4 }); await page.mouse.up();
  await page.locator('#jigsaw-rotate').click();
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  game = (await storedJigsaw(page)).revisions.at(-1).document;
  merged = game.groups.find((group) => group.pieceIds.length === 2);
  assert.deepEqual([...merged.pieceIds].sort(), originalMembers, 'moving and rotating the group keeps both pieces together');
  assert.notDeepEqual({ x: merged.x, y: merged.y }, originalPose, 'merged group can be moved as a unit');
  assert.equal(merged.rotation, 1, 'merged group can be rotated as a unit');
  assert.ok(external.every((request) => request.method === 'GET'), 'external-origin setup reads were blocked; no writes attempted'); assert.deepEqual(pageErrors, []);
  pass(`${browserName}: pointer-level wrong-rotation rejection, correct merge, merged-group move and rotate`);
  await context.close();
}

async function seedWorkspace(context, browserName, viewport) {
  const page = await context.newPage(); const external = await localOnly(page); const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const draftId = await makeDrawDraft(page);
  assert.ok(draftId, 'Draw save created a local draft');
  await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' });
  await bringDrawPicture(page);
  await page.waitForFunction(() => document.querySelectorAll('#jigsaw-source-version option').length > 0);
    await page.locator('#jigsaw-source-kind').selectOption('draw');
    await page.locator('#jigsaw-grid-size').selectOption('3');
    await page.locator('#jigsaw-start').scrollIntoViewIfNeeded();
    const startBox = await page.locator('#jigsaw-start').boundingBox();
    assert.ok(startBox && startBox.x >= 0 && startBox.y >= 0 && startBox.x + startBox.width <= viewport.width && startBox.y + startBox.height <= viewport.height, `${browserName}: setup start control is onscreen at ${viewport.width}×${viewport.height} (${JSON.stringify(startBox)})`);
    const startHit = await page.locator('#jigsaw-start').evaluate((button) => { const r = button.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === button || button.contains(hit); });
    assert.equal(startHit, true, `${browserName}: setup start control is not covered at ${viewport.width}×${viewport.height}`);
  await page.locator('#jigsaw-start').waitFor({ state: 'visible' });
  await page.locator('#jigsaw-start').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden, null, { timeout: 15000 });
  await page.locator('#jigsaw-tray [data-group-id]').first().waitFor();
  await page.locator('#jigsaw-save').click();
  await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
  const trayCount = await page.locator('#jigsaw-tray [data-group-id]').count();
  assert.equal(trayCount, 25, `${browserName}: a 16×16 Draw image at 3px yields 25 organic pieces`);
  const blankThumbs = await page.locator('#jigsaw-tray [data-group-id] canvas').evaluateAll((canvases) => canvases.map((canvas, index) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let alpha = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) alpha += 1;
    return alpha ? null : index;
  }).filter((index) => index !== null));
  assert.deepEqual(blankThumbs, [], `${browserName}: every randomized/rotated tray piece has visible pixels`);
  const seeded = await layoutInfo(page);
  assert.equal(seeded?.game?.schemaVersion, 2, 'saved play state uses v2 group workspace');
  const fixedDrawHash = await drawRevisionHash(page, draftId);
  assert.ok(fixedDrawHash); assert.equal(seeded.game.source.contentHash, fixedDrawHash, 'game binds the immutable Draw revision hash');
  assert.equal(seeded.pieces.length, 25);
  assert.ok(seeded.pieces.some((piece) => piece.alphaPixels < piece.boxPixels), 'piece alpha masks have transparent notches');
  assert.equal(new Set(seeded.game.groups.map((group) => group.rotation)).size > 1, true, 'tray begins with varied rotations');
  assert.ok(seeded.game.pieceOrder.some((id, index) => id !== seeded.game.groups[index]?.pieceIds[0]), 'tray order is shuffled');
  assert.equal(await page.locator('#jigsaw-tray [data-checkmark],#jigsaw-tray .checkmark').count(), 0, 'tray has no correctness checkmarks');
  return { page, external, pageErrors, draftId, gameId: seeded.game.gameId, fixedDrawHash };
}

async function runWorkspace(browser, browserName) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 }); const { page, external, pageErrors, draftId, gameId, fixedDrawHash } = await seedWorkspace(context, browserName, viewport);
    const firstButton = page.locator('#jigsaw-tray [data-group-id]').first(); const firstGroupId = await firstButton.getAttribute('data-group-id');
    const trayBox = await firstButton.boundingBox(); const workspaceBox = await page.locator('#jigsaw-workspace').boundingBox();
    await page.waitForFunction(() => { const canvas = document.querySelector('#jigsaw-board'); const rect = canvas.getBoundingClientRect(); return Math.abs(canvas.width - rect.width * Math.min(2, devicePixelRatio)) <= 1 && Math.abs(canvas.height - rect.height * Math.min(2, devicePixelRatio)) <= 1; });
    const canvasBacking = await page.locator('#jigsaw-board').evaluate((canvas) => ({ width: canvas.width, height: canvas.height, dpr: devicePixelRatio, rect: (() => { const box = canvas.getBoundingClientRect(); return { width: box.width, height: box.height }; })() }));
    assert.equal(canvasBacking.dpr, 2, `${browserName}: test context uses DPR 2`);
    assert.ok(Math.abs(canvasBacking.width - canvasBacking.rect.width * 2) <= 1 && Math.abs(canvasBacking.height - canvasBacking.rect.height * 2) <= 1, `${browserName}: backing canvas tracks the DPR 2 workspace size (${JSON.stringify(canvasBacking)})`);
    const alphaBefore = await canvasAlphaSummary(page);
    assert.equal(alphaBefore.count, 0, 'tray pieces are not duplicated on the workspace before placement');
    await page.mouse.move(trayBox.x + trayBox.width / 2, trayBox.y + trayBox.height / 2);
    await page.mouse.down(); await page.mouse.move(workspaceBox.x + workspaceBox.width * 0.68, workspaceBox.y + workspaceBox.height * 0.46, { steps: 8 });
    assert.equal(await page.locator('#jigsaw-tray [data-group-id]').count(), 24, 'a tray piece transfers exactly once after entering the workspace');
    await page.waitForFunction(() => { const canvas = document.querySelector('#jigsaw-board'); if (!canvas) return false; const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); for (let i = 3; i < data.length; i += 4) if (data[i]) return true; return false; }, null, { timeout: 1500 });
    const alphaDuringDrag = await canvasAlphaSummary(page);
    assert.ok(alphaDuringDrag.count > 0, 'the live drag preview appears on the workspace canvas');
    assert.equal(await page.locator(`#jigsaw-tray [data-group-id="${firstGroupId}"]`).count(), 0, 'the live preview is not duplicated by a tray clone');
    await page.mouse.up();
    await page.waitForFunction((id) => document.querySelector(`[data-group-id="${CSS.escape(id)}"]`) === null, firstGroupId);
    await page.waitForTimeout(120);
    const alphaAfterDrop = await canvasAlphaSummary(page);
    assert.ok(alphaAfterDrop.count > 0, 'placed piece paints once on the workspace canvas');
    await page.waitForTimeout(100);
    assert.deepEqual(await canvasAlphaSummary(page), alphaAfterDrop, 'completed drag leaves no ghost or residual canvas pixels');
    await page.locator('#jigsaw-rotate').click();
    await page.locator('#jigsaw-save').click();
    await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
    let saved = await storedJigsaw(page);
    let game = saved?.revisions?.at(-1)?.document;
    let group = game?.groups?.find((item) => item.groupId === firstGroupId);
    assert.equal(group?.inTray, false, `${browserName} ${viewport.width}x${viewport.height}: drag placed group freely`);
    const pose = { x: group.x, y: group.y, rotation: group.rotation };
    await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('端末に保存しました'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#jigsaw-resume').click();
    await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden, null, { timeout: 15000 });
    saved = await storedJigsaw(page); game = saved?.revisions?.at(-1)?.document; group = game?.groups?.find((item) => item.groupId === firstGroupId);
    assert.deepEqual({ x: group.x, y: group.y, rotation: group.rotation }, pose, 'reload keeps the same group pose and rotation');
    assert.equal(game.source.contentHash, fixedDrawHash, 'resuming preserves the same fixed Draw revision');
    const layout = await visibleControlLayout(page);
    assert.equal(layout.overflow, false, `${browserName}: no horizontal overflow at ${viewport.width}x${viewport.height}`);
    assert.deepEqual(layout.overlaps, [], `${browserName}: workspace controls do not overlap at ${viewport.width}x${viewport.height}`);
    assert.deepEqual(layout.smallTargets, [], `${browserName}: visible play controls retain 44px targets`);
    assert.ok(external.every((request) => request.method === 'GET'), 'external-origin setup requests are blocked; no network writes are attempted');
    assert.deepEqual(pageErrors, [], `browser has no uncaught page errors: ${pageErrors.join('; ')}`);
    assert.equal(await page.evaluate((id) => localStorage.getItem('pixieed.simple-draw.last-draft.v1'), draftId), draftId, 'jigsaw interactions preserve the source Draw draft pointer');
    pass(`${browserName} ${viewport.width}×${viewport.height}: local Draw, 25-piece masks, drag/rotate/save/resume`);
    await context.close();
  }
}

async function main() {
  const requestedEngine = process.env.PIXIEED_JIGSAW_ENGINE || process.env.PIXIEED_BROWSER_ENGINES;
  const allEngines = [['Chromium', chromium], ['WebKit', webkit]];
  const engineNames = requestedEngine ? requestedEngine.split(',').map((value) => value.trim().toLowerCase()) : allEngines.map(([name]) => name.toLowerCase());
  if (!engineNames.length || engineNames.some((name) => !allEngines.some(([available]) => available.toLowerCase() === name))) throw new Error(`Unknown or empty PIXIEED_JIGSAW_ENGINE: ${requestedEngine}`);
  const engines = allEngines.filter(([name]) => engineNames.includes(name.toLowerCase()));
  if (!engines.length) throw new Error('No browser engine selected');
  const caseNames = ['responsive', 'merge', 'aspect', 'keyboard', 'paging'];
  const requestedCases = new Set((process.env.PIXIEED_JIGSAW_CASES || caseNames.join(',')).split(',').map((value) => value.trim().toLowerCase()));
  if (!requestedCases.size || [...requestedCases].some((name) => !caseNames.includes(name))) throw new Error(`Unknown or empty PIXIEED_JIGSAW_CASES: ${process.env.PIXIEED_JIGSAW_CASES}`);
  for (const [name, launcher] of engines) {
    const browser = await launcher.launch({ headless: true, ...(name === 'WebKit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
    try {
      if (requestedCases.has('responsive')) await runWorkspace(browser, name.toLowerCase());
      if (requestedCases.has('merge')) await testMergeGestures(browser, name.toLowerCase());
      if (requestedCases.has('aspect')) await testAspectRatio(browser, name.toLowerCase());
      if (requestedCases.has('keyboard')) await testKeyboardAndPinch(browser, name.toLowerCase());
      if (requestedCases.has('paging')) await testTrayPaging(browser, name.toLowerCase());
    }
    finally { await browser.close(); }
  }
  console.log(`PASS all ${checks} browser scenarios`);
}
await main();
