#!/usr/bin/env node
/** Isolated browser acceptance for puzzle share readiness and clipboard fallback. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDrawDocument, encodePng } from '../js/creation/draw-core.mjs';
import { buildHiddenObjectHitBoxes } from '../js/creation/hidden-object-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const id = '123e4567-e89b-42d3-a456-426614174000';
const originalDoc = createDrawDocument(16);
const changedDoc = structuredClone(originalDoc);
changedDoc.pixels[4] = 1;
const originalPng = Buffer.from(encodePng(originalDoc));
const changedPng = Buffer.from(encodePng(changedDoc));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const candidate = resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const file = pathname.endsWith('/') ? resolve(candidate, 'index.html') : candidate;
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end('not found'); }
});

await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const checks = [];

function publicPayload(mode, project) {
  const originalImage = { url: `${project}/storage/v1/object/public/post-public/${id}/original.png`, width: 16, height: 16 };
  if (mode === 'spot-difference') return { ok: true, postId: id, puzzle: { postId: id, mode: 'spot_difference', title: '検証用の間違い探し', author: '検証作者', originalImage, changedImage: { ...originalImage, url: `${project}/storage/v1/object/public/post-public/${id}/changed.png` }, definition: { schemaVersion: 1, confirmed: true, width: 16, height: 16, candidates: [{ id: 'spot-1', pixels: [4] }] } } };
  const targets = [{ id: 'flower', name: '花', pixels: [] }];
  for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) targets[0].pixels.push(y * 16 + x);
  const hitBoxes = buildHiddenObjectHitBoxes(targets, 16, 16, 120);
  return { ok: true, postId: id, puzzle: { postId: id, mode: 'hidden_object', title: '検証用のもの探し', author: '検証作者', originalImage, definition: { schemaVersion: 1, confirmed: true, width: 16, height: 16, targets, hitBoxes } } };
}

async function inspectLayout(page, width, height, mode) {
  await page.setViewportSize({ width, height });
  await page.locator('#puzzle-share-copy').click({ trial: true });
  const imageLocator = page.locator('#pixfind-play-area');
  if (!(await imageLocator.isVisible())) {
    const geometry = await imageLocator.evaluate((node) => ({ rect: node.getBoundingClientRect().toJSON(), gameRows: getComputedStyle(document.querySelector('#pixfind-game')).gridTemplateRows, imageRow: getComputedStyle(document.querySelector('.pixfind-images')).gridRow }));
    assert.fail(`${mode} ${width}×${height} art is not visible before actionability check: ${JSON.stringify(geometry)}`);
  }
  await imageLocator.click({ trial: true, timeout: 2000 });
  if (await page.locator('#puzzle-share-url').isVisible()) {
    await page.locator('#puzzle-share-url').scrollIntoViewIfNeeded();
    await page.locator('#puzzle-share-url').click({ trial: true });
  }
  const layout = await page.locator('#puzzle-share').evaluate((panel) => {
    const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const image = document.querySelector('#pixfind-play-area');
    const nav = document.querySelector('.app-tabs');
    const button = panel.querySelector('button');
    const input = panel.querySelector('input');
    const hit = (node) => { const r = node.getBoundingClientRect(); const hitNode = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(hitNode && (node === hitNode || node.contains(hitNode))); };
    const found = panel.parentElement.querySelector('.pixfind-found-list');
    const game = panel.parentElement;
    return { panel: rect(panel), button: rect(button), buttonHit: hit(button), status: rect(panel.querySelector('[role="status"]')), input: rect(input), inputHit: input.hidden ? true : hit(input), image: rect(image), imageHit: hit(image), imageRow: getComputedStyle(image.parentElement).gridRow, shareRow: getComputedStyle(panel).gridRow, found: rect(found), foundRow: getComputedStyle(found).gridRow, foundStyle: { minHeight: getComputedStyle(found).minHeight, maxHeight: getComputedStyle(found).maxHeight, overflow: getComputedStyle(found).overflow }, game: rect(game), gameClass: game.className, bodyClass: document.body.className, nav: rect(nav), viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, rows: getComputedStyle(game).gridTemplateRows };
  });
  assert.ok(layout.panel.left >= -1 && layout.panel.right <= width + 1, `${mode} ${width}px share panel exceeds viewport`);
  assert.ok(layout.documentWidth <= width, `${mode} ${width}px page overflows horizontally`);
  assert.ok(layout.panel.height > 0 && layout.button.height >= 44, `${mode} ${width}×${height} share button is not reachable (rows: ${layout.rows})`);
  assert.ok(layout.image.height > 0 && layout.image.bottom <= layout.nav.top + 1, `${mode} ${width}×${height} artwork overlaps navigation or is not clickable (image=${JSON.stringify(layout.image)}, imageRow=${layout.imageRow}, shareRow=${layout.shareRow}, found=${JSON.stringify(layout.found)}, foundRow=${layout.foundRow}, foundStyle=${JSON.stringify(layout.foundStyle)}, game=${JSON.stringify(layout.game)}, gameClass=${layout.gameClass}, bodyClass=${layout.bodyClass}, nav=${JSON.stringify(layout.nav)}, rows=${layout.rows})`);
  for (const item of [layout.button, layout.status, ...(layout.input.height ? [layout.input] : [])]) assert.ok(item.left >= layout.panel.left - 1 && item.right <= layout.panel.right + 1, `${mode} ${width}px share control exceeds panel`);
  assert.ok(layout.button.bottom <= layout.status.top + 1 || layout.status.height === 0, `${mode} ${width}px button overlaps status`);
  if (layout.input.height) assert.ok(layout.status.bottom <= layout.input.top + 1, `${mode} ${width}px status overlaps fallback URL`);
  checks.push(`${mode} ${width}×${height}: share and fallback controls are clickable, artwork clears navigation`);
}

async function openPlayer(mode, viewport, apiStatus = 200) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (error) => { throw error; });
  await page.addInitScript(() => {
    window.__clipboardWrites = [];
    window.__clipboardReject = false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { if (window.__clipboardReject) throw new Error('permission denied'); window.__clipboardWrites.push(value); } } });
  });
  let scenario = 'not-found';
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (url.pathname.endsWith('/functions/v1/public-post-puzzle')) {
      const cors = { 'access-control-allow-origin': base, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (apiStatus !== 200) return route.fulfill({ status: apiStatus, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(publicPayload(mode, url.origin)) });
    }
    if (url.pathname.includes(`/storage/v1/object/public/post-public/${id}/`)) return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: url.pathname.endsWith('/changed.png') ? changedPng : originalPng });
    if (url.pathname === `/play/${mode}/puzzles/${id}/`) {
      if (scenario === 'not-found') return route.fulfill({ status: 404, contentType: 'text/html', body: 'not found' });
      if (scenario === 'incomplete') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><title>Preparing</title></head></html>' });
      const shareUrl = `${base}/play/${mode}/puzzles/${id}/`;
      const pageHtml = `<html><head><link rel="canonical" href="${shareUrl}"><meta property="og:url" content="${shareUrl}"><meta property="og:image" content="${shareUrl}ogp.png"><meta property="og:title" content="Test"><meta property="og:description" content="Test"></head></html>`;
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml });
    }
    if (url.pathname === `/play/${mode}/puzzles/${id}/ogp.png`) return route.fulfill({ status: scenario === 'image-404' ? 404 : 200, contentType: 'image/png', body: scenario === 'image-404' ? 'missing' : originalPng });
    if (url.origin === base) return route.continue();
    return route.abort();
  });
  const path = mode === 'spot-difference' ? 'spot-difference' : 'hidden-object';
  await page.goto(`${base}/play/${path}/?postPuzzle=${id}`, { waitUntil: 'domcontentloaded' });
  if (apiStatus === 200) {
    await page.waitForFunction(() => document.querySelector('#puzzle-share')?.hidden === false, null, { timeout: 15000 }).catch(async (error) => {
      console.error(`${mode} did not enable sharing:`, await page.evaluate(() => ({ status: document.querySelector('#pixfind-game-status')?.textContent, progress: document.querySelector('#pixfind-progress')?.textContent, title: document.querySelector('#pixfind-title')?.textContent })));
      throw error;
    });
  } else {
    await page.waitForFunction(() => document.querySelector('#pixfind-game-status')?.textContent.includes('現在利用できません'), null, { timeout: 8000 });
    assert.equal(await page.locator('#puzzle-share').evaluate((node) => node.hidden), true);
  }
  return { context, page, get scenario() { return scenario; }, set scenario(value) { scenario = value; } };
}

try {
  for (const mode of ['spot-difference', 'hidden-object']) {
    const harness = await openPlayer(mode, { width: 390, height: 844 });
    const { page } = harness;
    await page.locator('#puzzle-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-status').textContent.includes('まだ公開されていません'));
    assert.deepEqual(await page.evaluate(() => window.__clipboardWrites), [], `${mode}: 404 must not copy`);
    checks.push(`${mode}: 404 is reported as not ready, no copy`);

    harness.scenario = 'incomplete';
    await page.locator('#puzzle-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-status').textContent.includes('準備中'));
    assert.deepEqual(await page.evaluate(() => window.__clipboardWrites), [], `${mode}: incomplete HTML must not copy`);
    checks.push(`${mode}: incomplete HTML is reported as preparing, no copy`);

    harness.scenario = 'published';
    await page.locator('#puzzle-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-status').textContent.includes('コピーしました'));
    const expected = `${base}/play/${mode}/puzzles/${id}/`;
    assert.deepEqual(await page.evaluate(() => window.__clipboardWrites), [expected], `${mode}: copies the generated individual URL`);
    checks.push(`${mode}: verified page and OGP image copied`);

    harness.scenario = 'image-404';
    await page.locator('#puzzle-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-status').textContent.includes('共有画像はまだ準備中'));
    assert.equal((await page.evaluate(() => window.__clipboardWrites)).length, 1, `${mode}: missing OGP image must not copy`);
    checks.push(`${mode}: missing OGP image is not treated as ready`);

    harness.scenario = 'published';
    await page.evaluate(() => { window.__clipboardReject = true; });
    await page.locator('#puzzle-share-copy').click();
    await page.waitForFunction(() => document.querySelector('#puzzle-share-url')?.hidden === false);
    const fallback = await page.locator('#puzzle-share-url').evaluate((input) => ({ value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd }));
    assert.equal(fallback.value, expected, `${mode}: manual fallback contains only the verified URL`);
    assert.equal(fallback.focused, true, `${mode}: fallback is focused`);
    assert.equal(fallback.start, 0); assert.equal(fallback.end, expected.length);
    checks.push(`${mode}: clipboard denial selects the verified URL for retry`);
    for (const viewport of [[320, 568], [390, 440], [568, 320], [1280, 800]]) await inspectLayout(page, viewport[0], viewport[1], mode);
    await harness.context.close();

    const failed = await openPlayer(mode, { width: 390, height: 844 }, 404);
    await failed.page.waitForFunction(() => document.querySelector('#pixfind-game-status')?.textContent.includes('現在利用できません'));
    assert.equal(await failed.page.locator('#puzzle-share').evaluate((node) => node.hidden), true, `${mode}: fetch failure hides share controls`);
    await failed.context.close();
    checks.push(`${mode}: failed public-puzzle fetch keeps share controls hidden`);

    const local = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await local.goto(`${base}/play/${mode}/?${mode === 'spot-difference' ? 'localSpot' : 'localHidden'}=${id}`, { waitUntil: 'domcontentloaded' });
    await local.waitForFunction(() => document.querySelector('#pixfind-game-status')?.textContent.trim() || document.querySelector('#pixfind-status')?.textContent.trim(), null, { timeout: 8000 });
    await local.setViewportSize({ width: 390, height: 440 });
    assert.equal(await local.locator('#puzzle-share').evaluate((node) => node.hidden), true, `${mode}: local route never exposes share controls`);
    const localLayout = await local.evaluate(() => {
      const image = document.querySelector('#pixfind-play-area').getBoundingClientRect();
      const panel = document.querySelector('#puzzle-share').getBoundingClientRect();
      const nav = document.querySelector('.app-tabs').getBoundingClientRect();
      const game = document.querySelector('#pixfind-game');
      const rows = getComputedStyle(game).gridTemplateRows.split(' ').map(Number.parseFloat);
      return { image: { top: image.top, bottom: image.bottom, height: image.height }, panel: { height: panel.height }, navTop: nav.top, gameClass: game.className, gameHidden: game.hidden, pageClass: document.querySelector('.pixfind-page').className, bodyClass: document.body.className, status: document.querySelector('#pixfind-game-status').textContent, rows, lastRow: rows.at(-1) };
    });
    assert.equal(localLayout.panel.height, 0, `${mode}: hidden share panel reserves no grid height`);
    assert.ok(!localLayout.rows.slice(2).some((height) => height >= 43 && height <= 45), `${mode}: hidden share panel creates no blank 44px grid row (layout=${JSON.stringify(localLayout)})`);
    await local.close();
    checks.push(`${mode}: unavailable local trial hides share controls without reserving a blank row`);
  }
  console.log(`Puzzle share browser checks: ${checks.length} PASS (${checks.join('; ')})`);
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
