#!/usr/bin/env node
/** Focused local-only checks for PixFind navigation and existing share panels. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';

if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(`Usage: node scripts/tool-navigation-play-panels-browser-harness.mjs [--help]\nRuns focused local navigation and share-panel checks against PIXIEED_BROWSER_BASE_URL (default http://127.0.0.1:4212).\nRequires project package playwright, or PIXIEED_PLAYWRIGHT_MODULE as a path, file URL, or package specifier.\nEvidence output: PIXIEED_TOOL_NAV_PLAY_OUTPUT (default ${join(tmpdir(), 'pixieed-tool-navigation-play-panels')}). No dependencies are installed automatically.`); process.exit(0); }
async function loadChromium() { const value = process.env.PIXIEED_PLAYWRIGHT_MODULE?.trim(), pathLike = value && /^(?:\/|\.{1,2}(?:\/|$)|[A-Za-z]:[\\/])/.test(value); const specifier = !value ? 'playwright' : value.startsWith('file:') ? value : pathLike ? pathToFileURL(resolve(value)).href : value; try { const api = await import(specifier); if (!api.chromium?.launch) throw new TypeError('module does not export chromium.launch'); return api.chromium; } catch (error) { console.error(`Unable to load Playwright (${value || 'project package "playwright"'}). Install it in the project with npm install --save-dev playwright, or set PIXIEED_PLAYWRIGHT_MODULE to a valid filesystem path, file URL, or package specifier. No dependency was installed. Cause: ${error.message}`); process.exit(1); } }

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4212';
const baseUrl = new URL(base);
if (!['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) throw new Error('Only a local fixture server is allowed.');
const origin = baseUrl.origin;
const supabaseOrigin = new URL(supabaseConfig.url).origin;
const output = process.env.PIXIEED_TOOL_NAV_PLAY_OUTPUT || join(tmpdir(), 'pixieed-tool-navigation-play-panels');
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }];
const modes = ['spot-difference', 'hidden-object'];
const ids = {
  'spot-difference': ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'],
  'hidden-object': ['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004'],
};
const width = 16;
const height = 16;
const evidence = { base: origin, viewports, screenshots: [], checks: [], pageErrors: [], fixtureRequests: [], interceptedExternalRequests: [], externalRequestSent: 0 };
await mkdir(output, { recursive: true });

function pass(name, details = {}) { evidence.checks.push({ name, ...details }); }
function safeName(value) { return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function fixturePng(mode, changed = false) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4; rgba[offset] = 245; rgba[offset + 1] = 245; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  for (const [x, y] of [[5, 5], [12, 12]]) {
    const offset = (y * width + x) * 4;
    if (mode === 'hidden-object') { rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; }
    else if (changed) { rgba[offset] = 40; rgba[offset + 1] = 120; rgba[offset + 2] = 70; }
  }
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
}

const rows = Object.fromEntries(modes.map(mode => [mode, ids[mode].map((uuid, index) => {
  const id = `pixfind-${mode === 'hidden-object' ? 'ho-' : 'sd-'}${uuid}`;
  const root = `${supabaseConfig.url}/storage/v1/object/public/pixfind-puzzles/puzzles/${id}`;
  return { id, slug: `fixture-${index}`, label: `Fixture ${index + 1}`, author_name: 'Local navigation fixture', mode,
    original_url: `${root}/original.png`, diff_url: `${root}/changed.png`, targets: mode === 'hidden-object' ? ['星', '月'] : undefined };
})]));
const posts = Object.fromEntries(modes.map(mode => [mode, rows[mode].map(row => ({ id: `${row.id}-post`, status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: row.id }))]));
const pngs = { 'spot-original': fixturePng('spot-difference'), 'spot-changed': fixturePng('spot-difference', true), 'hidden-object': fixturePng('hidden-object') };

async function newContext(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    if (url.origin === supabaseOrigin && request.method() === 'GET') {
      let frameUrl = '';
      try { frameUrl = request.frame().url(); } catch { /* detached or service request */ }
      const routeMode = frameUrl.includes('/play/hidden-object/') || url.pathname.includes('pixfind-ho-') ? 'hidden-object' : 'spot-difference';
      if (url.pathname.endsWith('/social_posts')) {
        evidence.fixtureRequests.push({ path: url.pathname, mode: routeMode, method: request.method() });
        return route.fulfill({ json: posts[routeMode], headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.pathname.endsWith('/pixfind_puzzles')) {
        evidence.fixtureRequests.push({ path: url.pathname, mode: routeMode, method: request.method() });
        return route.fulfill({ json: rows[routeMode], headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.pathname.includes('/storage/')) {
        const mode = url.pathname.includes('pixfind-ho-') ? 'hidden-object' : 'spot-difference';
        const body = mode === 'hidden-object' ? pngs['hidden-object'] : url.pathname.endsWith('/changed.png') ? pngs['spot-changed'] : pngs['spot-original'];
        evidence.fixtureRequests.push({ path: url.pathname, mode, method: request.method() });
        return route.fulfill({ contentType: 'image/png', body, headers: { 'access-control-allow-origin': '*' } });
      }
    }
    evidence.interceptedExternalRequests.push({ url: url.href, method: request.method(), disposition: 'aborted or fulfilled locally' });
    return route.abort();
  });
  await context.addInitScript(() => { window.__toolNavDocumentToken = Math.random().toString(36).slice(2); });
  return context;
}

function collectErrors(page) { page.on('pageerror', error => evidence.pageErrors.push({ url: page.url(), error: error.message })); }
async function screenshot(page, name) {
  const path = join(output, `${safeName(name)}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  evidence.screenshots.push(path);
}
async function waitForGame(page) {
  await page.locator('#pixfind-game').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('#pixfind-original');
    return image?.getAttribute('src') && image.complete && image.naturalWidth > 0;
  });
  await page.locator('#pixfind-original').evaluate(image => image.decode());
  await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('/'));
}
async function assertFiveSlotNav(page) {
  const shape = await page.locator('.app-tabs').evaluate(nav => ({
    children: [...nav.children].map(node => ({ tag: node.tagName, id: node.id, slot: node.getAttribute('data-operation-slot') })),
    centerId: nav.children[2]?.id,
    directLinks: nav.querySelectorAll(':scope > a[href], :scope > [data-operation-slot] a[href]').length,
    slotCount: nav.querySelectorAll(':scope > [data-operation-slot]').length,
  }));
  assert.equal(shape.children.length, 5, 'bottom operation bar has exactly five direct children');
  assert.equal(shape.centerId, 'pixfind-primary', 'the existing primary node remains the central direct child');
  assert.equal(shape.directLinks, 0, 'bottom operation bar contains no page-navigation links');
  assert.equal(shape.slotCount, 4, 'bottom bar has four peer slots');
  return shape;
}

async function seedLocalDrafts(page) {
  return page.evaluate(async () => {
    const { createDrawDocument } = await import('/js/creation/draw-core.mjs');
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const { confirmDifferenceCandidates, detectDifferenceCandidates } = await import('/js/creation/spot-difference-core.mjs');
    const { confirmHiddenObjectTargets, createHiddenObjectDraft } = await import('/js/creation/hidden-object-core.mjs');
    const store = createLocalDraftStore(createIndexedDbDraftAdapter());
    const drawId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const spotId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const hiddenId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const before = createDrawDocument(16); before.pixels.fill(0); before.pixels[0] = 1;
    const after = createDrawDocument(16); after.pixels.fill(0); after.pixels[0] = 1;
    for (let y = 5; y < 9; y += 1) for (let x = 5; x < 9; x += 1) after.pixels[y * 16 + x] = 2;
    const first = await store.save({ draftId: drawId, kind: 'pixel_art', document: before, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const second = await store.save({ draftId: drawId, kind: 'pixel_art', document: after, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
    const ref = revision => ({ draftId: drawId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
    const candidates = detectDifferenceCandidates(before, after).candidates;
    if (!candidates.length) throw new Error('Synthetic local difference produced no candidates');
    const spot = confirmDifferenceCandidates({ schemaVersion: 1, gameId: spotId, width: 16, height: 16, before: ref(first), after: ref(second), candidates, confirmed: true, publication: 'draft', published: false });
    await store.save({ draftId: spotId, kind: 'spot_difference', document: spot, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    const hidden = confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: hiddenId, source: ref(first), width: 16, height: 16, targets: [{ id: 'dot', name: 'ドット', pixels: [85] }] }));
    await store.save({ draftId: hiddenId, kind: 'hidden_object', document: hidden, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
    return { spotId, hiddenId };
  });
}

async function ordinaryRoute(page, mode, viewport) {
  const path = `/play/${mode}/`;
  const pageMode = mode === 'hidden-object' ? 'find-game' : 'spot-game';
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pixfind-list .pixfind-card button').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#pixfind-primary').evaluate(node => { window.__savedPixfindPrimary = node; });
  await page.locator('#pixfind-back').evaluate(node => { window.__savedPixfindBack = node; });
  const listToken = await page.evaluate(() => window.__toolNavDocumentToken);
  const listNav = await assertFiveSlotNav(page);
  assert.equal(await page.locator('#puzzle-create-link').isVisible(), true, 'the create link remains in the list content, not the operation bar');
  assert.equal(await page.locator('#pixfind-back').count(), 1, 'the native Back node remains unique before play');

  await page.locator('#pixfind-primary').click();
  await waitForGame(page);
  const activeNav = await assertFiveSlotNav(page);
  assert.equal(activeNav.children[2].id, 'pixfind-primary');
  assert.equal(await page.locator('.app-tabs #pixfind-back').count(), 1, 'same-page Back is moved into the bottom operation bar while playing');
  assert.equal(await page.locator('.px-tool-header-controls #pixfind-back').count(), 0, 'same-page Back is not duplicated in the header');
  assert.equal(await page.locator('#pixfind-back').evaluate(node => node === window.__savedPixfindBack), true, 'the existing Back node is retained');
  assert.equal(await page.locator('#pixfind-primary').evaluate(node => node === window.__savedPixfindPrimary), true, 'the existing center node is retained');
  await page.waitForFunction(() => document.querySelector('#puzzle-share')?.hidden === false);
  await page.locator('.app-tabs #puzzle-share-copy').waitFor({ state:'visible' });
  assert.equal(await page.locator('#puzzle-share').evaluate(node => node.hidden), false, 'the existing share panel becomes available for the synthetic public legacy puzzle');
  assert.equal(await page.locator('.app-tabs #puzzle-share-copy').isVisible(), true, 'the existing share action is visible in its slot; it is not clicked');

  const compare = page.locator('#pixfind-compare');
  if (await compare.count() && await compare.isVisible()) {
    const before = await compare.getAttribute('aria-pressed');
    await compare.click();
    assert.notEqual(await compare.getAttribute('aria-pressed'), before, 'visible compare control toggles its existing state');
    await compare.click();
    assert.equal(await compare.getAttribute('aria-pressed'), before, 'compare control returns to its initial state');
  }
  if (viewport.width >= 390) await screenshot(page, `${pageMode}-${viewport.width}-active-share-panel`);
  pass(`${mode} same-page active state`, { width: viewport.width, nav: activeNav, sharePanel: 'visible without copy/share activation' });

  const back = page.locator('.app-tabs #pixfind-back');
  await back.click();
  await page.waitForFunction(() => document.querySelector('#pixfind-game')?.hidden && !document.querySelector('#pixfind-list')?.hidden);
  assert.equal(await page.evaluate(() => window.__toolNavDocumentToken), listToken, 'Back to the ordinary list stays in the same document');
  assert.equal(new URL(page.url()).pathname, path, 'same-page Back keeps the play pathname');
  assert.equal(await page.locator('#pixfind-back').evaluate(node => node === window.__savedPixfindBack), true, 'same-page return restores the same Back node');
  assert.equal(await page.locator('#pixfind-primary').evaluate(node => node === window.__savedPixfindPrimary), true, 'same-page return retains the same primary node');
  const returnedNav = await assertFiveSlotNav(page);
  if (viewport.width >= 390) await screenshot(page, `${pageMode}-${viewport.width}-list-return`);
  pass(`${mode} same-page list return`, { width: viewport.width, nav: returnedNav, initialNav: listNav, documentUnchanged: true });

  await page.locator('#pixfind-primary').click();
  await waitForGame(page);
  assert.equal(await page.locator('.app-tabs #pixfind-back').count(), 1, 're-entry restores Back to the bottom bar');
  assert.equal(await page.locator('#pixfind-back').evaluate(node => node === window.__savedPixfindBack), true, 're-entry retains the same Back node');
  assert.equal(await page.locator('#pixfind-primary').evaluate(node => node === window.__savedPixfindPrimary), true, 're-entry retains the same primary node');
  pass(`${mode} same-page re-entry preserves operation node identity`, { width: viewport.width });
  return { path, pageMode };
}

async function localExitRoute(page, mode, id, viewport) {
  const query = mode === 'spot-difference' ? `localSpot=${id}` : `localHidden=${id}`;
  const destination = mode === 'spot-difference' ? '/spot-difference/' : '/hidden-object/';
  await page.goto(`${origin}/play/${mode}/?${query}`, { waitUntil: 'domcontentloaded' });
  await waitForGame(page);
  await page.locator('.px-tool-header-controls #pixfind-back').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.app-tabs #pixfind-back').count(), 0, 'local-draft Back remains in the header and is absent from the bottom bar');
  const tokenBefore = await page.evaluate(() => window.__toolNavDocumentToken);
  const navBefore = await assertFiveSlotNav(page);
  const navigation = page.waitForURL(url => url.pathname === destination, { timeout: 30_000 });
  await page.locator('.px-tool-header-controls #pixfind-back').click();
  await navigation;
  await page.waitForLoadState('domcontentloaded');
  const tokenAfter = await page.evaluate(() => window.__toolNavDocumentToken);
  assert.notEqual(tokenAfter, tokenBefore, 'local-draft Back performs a new document navigation');
  assert.equal(new URL(page.url()).pathname, destination, 'local-draft Back goes to its matching maker page');
  pass(`${mode} local-draft exit destination`, { width: viewport.width, destination, documentChanged: true, nav: navBefore });
}

try {
  for (const viewport of viewports) {
    // One fresh isolated browser context per viewport. The only non-local
    // origin is intercepted and served synthetic GET fixtures by Playwright.
    const context = await newContext(viewport);
    try {
      for (const mode of modes) {
        const page = await context.newPage();
        collectErrors(page);
        await ordinaryRoute(page, mode, viewport);
        await page.close();
      }
      const seedPage = await context.newPage(); collectErrors(seedPage);
      await seedPage.goto(`${origin}/play/spot-difference/`, { waitUntil: 'domcontentloaded' });
      const localIds = await seedLocalDrafts(seedPage);
      await localExitRoute(seedPage, 'spot-difference', localIds.spotId, viewport);
      await localExitRoute(seedPage, 'hidden-object', localIds.hiddenId, viewport);
      await seedPage.close();
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(join(output, 'results.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}

assert.deepEqual(evidence.pageErrors, [], 'focused pages should not raise uncaught page errors');
console.log(`PASS PixFind play navigation and share-panel harness: ${evidence.checks.length} checks; ${evidence.screenshots.length} screenshots`);
console.log(`Evidence: ${output}; externalRequestSent=${evidence.externalRequestSent}`);
