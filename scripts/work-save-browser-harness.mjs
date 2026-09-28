#!/usr/bin/env node
/** Local ownership fixtures only; no requests reach live accounts or storage. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { supabaseConfig } from '../data/site-config.js';
import { createPxdProject, decodePxd, encodePxd } from '../js/creation/pxd-codec.mjs';
import { putPxdDrawDocument } from '../js/creation/pxd-project.mjs';
import { writePxdPuzzle } from '../js/creation/pxd-puzzles.mjs';
import { createJigsawLayout, createJigsawWorkspace } from '../js/creation/jigsaw-workspace.mjs';
import { encodePng } from '../js/creation/draw-core.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_WORK_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const runtime = engine === 'webkit' ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs' : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(runtime).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const apiOrigin = new URL(supabaseConfig.url).origin;
const drawing = { schemaVersion: 1, width: 16, height: 16, palette: ['#447766', '#ddaa88'], pixels: Array.from({ length: 256 }, (_, i) => i % 17 === 0 ? 1 : 0) };
const png = encodePng(drawing);
const fingerprint = Buffer.from(await crypto.subtle.digest('SHA-256', png)).toString('hex');
const source = (id) => ({ type: 'public', postId: `map:${id}`, title: id === ownId ? '自分の作品' : '他の人の作品', url: `${apiOrigin}/storage/v1/object/public/post-public/${id}/original.png`, fingerprint, width: 16, height: 16 });
async function publicProject(id, hybrid = false) {
  const game = createJigsawWorkspace({ gameId: `fixture-${id}`, source: source(id), layout: createJigsawLayout({ width: 16, height: 16, pieceSize: 8, seed: id }) });
  let project = await writePxdPuzzle(null, { tool: 'jigsaw', document: game });
  if (hybrid) project = await putPxdDrawDocument(project, drawing);
  return encodePxd(project);
}
const failures = []; let checks = 0;
async function context(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript(({ actor, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'local-fixture-token', expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: actor }));
  }, { actor, origin });
  await ctx.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    if (url.origin !== apiOrigin) return route.abort();
    if (request.method() !== 'GET') { failures.push(`Unexpected external ${request.method()}`); return route.abort(); }
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': origin } });
    if (url.pathname === '/auth/v1/user') return json({ id: actor });
    if (url.pathname === '/rest/v1/post_map_points') {
      const id = url.searchParams.get('post_id')?.replace(/^eq\./, '');
      return json([ownId, otherId].filter((item) => !id || id === item).map((item) => ({ post_id: item, title: source(item).title, public_image_path: `${item}/original.png`, published_at: '2026-09-28T00:00:00Z' })));
    }
    if (url.pathname === '/rest/v1/user_posts') return json(url.searchParams.get('id') === `eq.${ownId}` ? [{ id: ownId, author_id: actor, status: 'published' }] : []);
    if (url.pathname.startsWith('/rest/v1/')) return json([]);
    if (url.pathname.startsWith('/storage/v1/object/public/post-public/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png), headers: { 'Access-Control-Allow-Origin': origin } });
    return route.abort();
  });
  ctx.on('page', (page) => page.on('pageerror', (error) => failures.push(error.message)));
  return ctx;
}
async function panel(page) {
  for (const selector of ['.draw-import', '.audio-more']) {
    const outer = page.locator(selector);
    if (await outer.count() && !await outer.evaluate((node) => node.open)) await outer.locator(':scope > summary').click();
  }
  if (!await page.locator('#pxd-tools').evaluate((node) => node.open)) await page.locator('#pxd-tools > summary').click();
}
async function importFile(page, path, bytes) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pxd-file-input').setInputFiles({ name: 'fixture.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
}
function pass(name) { checks += 1; console.log(`PASS ${engine} ${name}`); }
try {
  const other = await context({ width: 320, height: 568 }); const page = await other.newPage();
  await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#jigsaw-public-version').options.length === 2);
  await page.locator('#jigsaw-source-kind').selectOption('public');
  await page.locator('#jigsaw-public-version').selectOption({ index: 1 });
  await page.locator('#jigsaw-start').click(); await page.locator('#jigsaw-play').waitFor({ state: 'visible' });
  await page.locator('#jigsaw-save').click();
  await page.waitForFunction(() => document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
  assert.ok(await page.evaluate(() => localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1')));
  await panel(page); await page.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('遊ぶ専用'));
  assert.equal(await page.locator('#pxd-export').isDisabled(), true);
  assert.equal(await page.locator('#pxd-to-draw').isDisabled(), true);
  let downloads = 0; page.on('download', () => downloads += 1);
  for (const selector of ['#pxd-export', '#pxd-to-audio']) {
    await page.locator(selector).evaluate((node) => { node.disabled = false; node.click(); });
    await page.waitForFunction(() => !document.querySelector('#pxd-open').disabled);
  }
  assert.equal(downloads, 0); assert.match(page.url(), /\/jigsaw\/$/);
  assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:pxd:last:jigsaw')), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `/tmp/pixieed-work-save-${engine}.png` });
  pass('other author can play/save progress, but PXD/transfer stay blocked even after UI manipulation'); await other.close();

  const own = await context(); const ownerPage = await own.newPage();
  await importFile(ownerPage, '/jigsaw/', await publicProject(ownId));
  await ownerPage.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('作品を開きました'));
  await panel(ownerPage); await ownerPage.locator('#pxd-export').waitFor({ state: 'visible' });
  const [download] = await Promise.all([ownerPage.waitForEvent('download'), ownerPage.locator('#pxd-export').click()]);
  const exported = await decodePxd(new Uint8Array(await readFile(await download.path())));
  assert.ok(exported.entries.some((entry) => entry.path === 'puzzles/jigsaw.json'));
  await ownerPage.evaluate(() => localStorage.removeItem('PiXiEED:supabase-session:v1'));
  let afterLogout = 0; ownerPage.on('download', () => afterLogout += 1);
  await ownerPage.locator('#pxd-export').evaluate((node) => node.click());
  await ownerPage.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('遊ぶ専用'));
  assert.equal(afterLogout, 0); pass('verified owner exports; logout immediately revokes further export'); await own.close();

  for (const [path, saveSelector] of [['/draw/', '#draw-export'], ['/audio/', '#audio-export-image'], ['/pixel-camera.html', '#savePng']]) {
    const mixed = await context(); const mixedPage = await mixed.newPage(); let saves = 0; mixedPage.on('download', () => saves += 1);
    await importFile(mixedPage, path, await publicProject(otherId, true));
    await mixedPage.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('遊ぶ専用'));
    await mixedPage.locator(saveSelector).evaluate((node) => node.click());
    assert.equal(saves, 0);
    if (path !== '/pixel-camera.html') await panel(mixedPage);
    assert.equal(await mixedPage.locator('#pxd-export').isDisabled(), true);
    pass(`mixed public PXD cannot become ${path} image/export`); await mixed.close();
  }
  const camera = await context(); const cameraPage = await camera.newPage();
  await importFile(cameraPage, '/pixel-camera.html', await publicProject(ownId, true));
  await cameraPage.waitForFunction(() => document.querySelector('#pxd-file-status').textContent.includes('作品を開きました'));
  const [photo] = await Promise.all([cameraPage.waitForEvent('download'), cameraPage.locator('#savePng').click()]);
  assert.match(photo.suggestedFilename(), /\.png$/);
  await cameraPage.evaluate(() => localStorage.removeItem('PiXiEED:supabase-session:v1'));
  let cameraDownloads = 0; cameraPage.on('download', () => cameraDownloads += 1);
  await cameraPage.locator('#savePng').click();
  await cameraPage.waitForFunction(() => document.body.textContent.includes('他の人の投稿作品は遊ぶ専用'));
  assert.equal(cameraDownloads, 0); pass('camera PNG saves for verified owner and is revoked after logout'); await camera.close();
  assert.deepEqual(failures, []);
  console.log(`BROWSER: PASS (${engine}, ${checks} ownership cases; mocked identity/storage, production untested)`);
} finally { await browser.close(); }
