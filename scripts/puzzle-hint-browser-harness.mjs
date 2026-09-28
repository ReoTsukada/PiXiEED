#!/usr/bin/env node
/** Local acceptance for per-puzzle free hints, shared-pass repeats, and touch layout. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';
import { createDrawDocument, encodePng } from '../js/creation/draw-core.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost fixtures are allowed');
const engine = process.env.PIXIEED_HINT_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(playwrightPath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? {
  executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh',
} : {}) });
const apiOrigin = new URL(supabaseConfig.url).origin;
const fixtureId = '55555555-5555-4555-8555-555555555555';
const imageRoot = `${apiOrigin}/storage/v1/object/public/pixfind-puzzles/puzzles/${fixtureId}`;
const before = createDrawDocument(16); before.pixels.fill(0); before.pixels[0] = 1;
const after = createDrawDocument(16); after.pixels.fill(0); after.pixels[0] = 1; after.pixels[85] = 2;
const beforePng = Buffer.from(encodePng(before)); const afterPng = Buffer.from(encodePng(after));
let checks = 0;

async function routeLocalOnly(context) {
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
}

async function setupPixfindApi(context) {
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== apiOrigin) return route.abort();
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'apikey,content-type', 'Access-Control-Allow-Methods': 'GET,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/rest/v1/social_posts') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify([{ id: 'hint-post', status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: fixtureId }]) });
    if (url.pathname === '/rest/v1/pixfind_puzzles') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify([{ id: fixtureId, slug: 'hint-fixture', label: 'ヒント確認', author_name: 'fixture', original_url: `${imageRoot}/original.png`, diff_url: `${imageRoot}/changed.png`, thumbnail_url: `${imageRoot}/original.png`, mode: 'spot_difference', targets: [], regions: null }]) });
    if (url.pathname.endsWith('/original.png')) return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: beforePng });
    if (url.pathname.endsWith('/changed.png')) return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: afterPng });
    return route.abort();
  });
}

async function pixfind(viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion });
  await setupPixfindApi(context);
  await context.addInitScript(() => {
    window.hintArcCount = 0;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) { if (this.canvas.id === 'pixfind-overlay') window.hintArcCount += 1; return arc.apply(this, args); };
  });
  const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/pixfind/?puzzle=${fixtureId}`, { waitUntil: 'domcontentloaded' });
  const hint = page.locator('#pixfind-hint'); await hint.waitFor({ state: 'visible' });
  assert.equal(await hint.getAttribute('data-hint-short'), '無料');
  await hint.click(); await page.waitForFunction(() => window.hintArcCount > 0);
  assert.equal(await hint.getAttribute('data-hint-short'), 'パス');
  await page.waitForTimeout(2750);
  const afterFree = await page.evaluate(() => window.hintArcCount);
  await hint.click(); await page.locator('.px-pass').waitFor({ state: 'visible' }); await page.locator('.px-pass-no').click();
  await page.waitForTimeout(120); assert.equal(await page.evaluate(() => window.hintArcCount), afterFree, 'cancel must not display or consume another hint');
  await page.evaluate(() => localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 60_000 })));
  await hint.click(); await page.waitForFunction((count) => window.hintArcCount > count, afterFree);
  await page.evaluate(() => localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() - 1 })));
  await page.waitForTimeout(2750);
  await hint.click(); await page.locator('.px-pass').waitFor({ state: 'visible' }); await page.locator('.px-pass-no').click();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#pixfind-hint').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#pixfind-hint').getAttribute('data-hint-short'), 'パス', 'the public puzzle free hint survives reload');
  const box = await hint.boundingBox(); const nav = await page.locator('.app-tabs').boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `44px hit target: ${box.width}x${box.height}`);
  assert.ok(box.y + box.height <= nav.y || box.y >= nav.y + nav.height, 'hint button does not overlap shared navigation');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine} Pixfind ${viewport.width}x${viewport.height} (${reducedMotion}): first free, cancel, active pass, expired pass re-gate, reload, 44px navigation-safe button`); checks += 1;
  await context.close();
}

async function jigsaw(viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion }); await routeLocalOnly(context);
  await context.addInitScript(() => {
    window.hintRectCount = 0;
    const strokeRect = CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (...args) { if (this.canvas.id === 'jigsaw-board') window.hintRectCount += 1; return strokeRect.apply(this, args); };
  });
  const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d'); const image = context.createImageData(32, 32);
    for (let index = 0; index < image.data.length; index += 4) { const value = (index / 4 * 73) % 256; image.data.set([value, value * 13 % 256, value * 31 % 256, 255], index); }
    context.putImageData(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#jigsaw-source-kind').evaluate((select) => { select.value = 'file'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#jigsaw-file').setInputFiles({ name: 'hint-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await page.waitForTimeout(200); await page.locator('#jigsaw-start').click(); await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
  const hint = page.locator('#jigsaw-hint'); await hint.waitFor({ state: 'visible' });
  const box = await hint.boundingBox(); const nav = await page.locator('.app-tabs').boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `44px hit target: ${box.width}x${box.height}`);
  assert.ok(box.y + box.height <= nav.y || box.y >= nav.y + nav.height, 'hint button does not overlap shared navigation');
  assert.ok(await hint.evaluate((node) => { const rect = node.getBoundingClientRect(); const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return top === node || node.contains(top); }), 'hint button center is tappable');
  assert.equal(await hint.getAttribute('data-hint-short'), '無料'); await hint.click(); await page.waitForFunction(() => window.hintRectCount > 0);
  assert.equal(await hint.getAttribute('data-hint-short'), 'パス');
  await page.locator('#jigsaw-tray .is-hint-target').waitFor({ state: 'visible' });
  await page.locator('#jigsaw-save').click(); await page.waitForFunction(() => document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
  // A valid solved local draft fixture exercises the finished-game gate on resume.
  await page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const store = createLocalDraftStore(createIndexedDbDraftAdapter()); const id = localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1');
    const document = (await store.load(id)).document;
    await store.save({ draftId: id, kind: 'jigsaw', ownerId: 'local-owner', document: { ...document, groups: [{ groupId: 'hint-solved', pieceIds: document.pieceOrder, x: 0, y: 0, rotation: 0, inTray: false }] }, source: { type: 'jigsaw_game', assetId: null, revisionId: null } });
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#jigsaw-resume').click(); await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#jigsaw-complete').hidden === false);
  assert.equal(await hint.isDisabled(), true, 'a completed puzzle cannot request hints'); assert.deepEqual(errors, []);
  console.log(`PASS ${engine} Jigsaw ${viewport.width}x${viewport.height} (${reducedMotion}): placement and tray hint, completion stops hints, 44px navigation-safe/tappable button`); checks += 1;
  await context.close();
}

async function localRevisionKeys() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await routeLocalOnly(context);
  const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/play/spot-difference/`, { waitUntil: 'domcontentloaded' });
  const fixtures = await page.evaluate(async () => {
    const { createDrawDocument } = await import('/js/creation/draw-core.mjs');
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { confirmDifferenceCandidates, detectDifferenceCandidates } = await import('/js/creation/spot-difference-core.mjs');
    const { confirmHiddenObjectTargets, createHiddenObjectDraft } = await import('/js/creation/hidden-object-core.mjs');
    const adapter = createIndexedDbDraftAdapter(); const store = createLocalDraftStore(adapter);
    const drawId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; const spotId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; const hiddenId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const before = createDrawDocument(16); before.pixels.fill(0); before.pixels[0] = 1;
    const after = createDrawDocument(16); after.pixels.fill(0); after.pixels[0] = 1; after.pixels[85] = 2;
    const first = await store.save({ draftId: drawId, kind: 'pixel_art', document: before, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const second = await store.save({ draftId: drawId, kind: 'pixel_art', document: after, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const ref = (revision) => ({ draftId: drawId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
    const candidateSet = detectDifferenceCandidates(before, after);
    const spotDocument = confirmDifferenceCandidates({ schemaVersion: 1, gameId: spotId, width: 16, height: 16, before: ref(first), after: ref(second), candidates: candidateSet.candidates, confirmed: false, publication: 'draft', published: false });
    const spotSaved = await store.save({ draftId: spotId, kind: 'spot_difference', document: spotDocument, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    const hiddenDocument = confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: hiddenId, source: ref(first), width: 16, height: 16, targets: [{ id: 'star', name: '星', pixels: [85] }] }));
    const hiddenSaved = await store.save({ draftId: hiddenId, kind: 'hidden_object', document: hiddenDocument, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    return { spotId, hiddenId, spotRevision: spotSaved.revisionId, hiddenRevision: hiddenSaved.revisionId, spotDocument, spotSource: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } };
  });
  await page.goto(`${base}/pixfind/?localSpot=${fixtures.spotId}`, { waitUntil: 'domcontentloaded' });
  const hint = page.locator('#pixfind-hint'); await hint.waitFor({ state: 'visible' }); await hint.click();
  const spotKey = `pixieed:puzzle-hint:v1:pixfind:local:spot-difference:${fixtures.spotId}:${fixtures.spotRevision}`;
  await page.waitForFunction((key) => sessionStorage.getItem(key) === 'used', spotKey);
  await page.evaluate(async ({ id, document, source }) => {
    const { createLocalDraftStore, createIndexedDbDraftAdapter } = await import('/js/creation/local-drafts.mjs');
    await createLocalDraftStore(createIndexedDbDraftAdapter()).save({ draftId: id, kind: 'spot_difference', document, source });
  }, { id: fixtures.spotId, document: fixtures.spotDocument, source: fixtures.spotSource });
  const newSpotRevision = await page.evaluate(async (id) => {
    const { createLocalDraftStore, createIndexedDbDraftAdapter } = await import('/js/creation/local-drafts.mjs');
    return (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(id)).revisionId;
  }, fixtures.spotId);
  assert.notEqual(newSpotRevision, fixtures.spotRevision);
  await page.reload({ waitUntil: 'domcontentloaded' }); await hint.waitFor({ state: 'visible' });
  assert.equal(await hint.getAttribute('data-hint-short'), '無料', 'a new saved local Spot revision gets its own allowance');
  await hint.click(); await page.waitForFunction((key) => sessionStorage.getItem(key) === 'used', `pixieed:puzzle-hint:v1:pixfind:local:spot-difference:${fixtures.spotId}:${newSpotRevision}`);
  await page.goto(`${base}/pixfind/?localHidden=${fixtures.hiddenId}`, { waitUntil: 'domcontentloaded' });
  await hint.waitFor({ state: 'visible' }); await hint.click();
  await page.waitForFunction((key) => sessionStorage.getItem(key) === 'used', `pixieed:puzzle-hint:v1:pixfind:local:hidden-object:${fixtures.hiddenId}:${fixtures.hiddenRevision}`);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine} local Spot/Hidden keys include stable draft and saved revision IDs`); checks += 1;
  await context.close();
}

try {
  for (const [viewport, motion] of [[{ width: 320, height: 568 }, 'no-preference'], [{ width: 568, height: 320 }, 'reduce']]) {
    await pixfind(viewport, motion); await jigsaw(viewport, motion);
  }
  await localRevisionKeys();
} finally { await browser.close(); }
console.log(`PASS ${engine}: ${checks} puzzle hint browser scenarios (mocked local service fixtures; no publication or production writes)`);
