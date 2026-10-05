#!/usr/bin/env node
// Synthetic profile end-to-end checks. Supabase is intercepted; no production request or mutation is made.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePng } from '../js/creation/draw-core.mjs';

const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const project = 'https://kyyiuakrqomzlikfaire.supabase.co';
const ownerId = '22222222-2222-4222-8222-222222222222';
const guestId = '33333333-3333-4333-8333-333333333333';
const publishedId = '11111111-1111-4111-8111-111111111111';
const pendingId = '44444444-4444-4444-8444-444444444444';
const cleanupId = '55555555-5555-4555-8555-555555555555';
const deletedId = '66666666-6666-4666-8666-666666666666';
const mapLikeId = '77777777-7777-4777-8777-777777777777';
const accountSessionKey = 'PiXiEED:legacy-owner-session:v1';
const deviceSessionKey = 'PiXiEED:supabase-session:v1';

function png(width, height, colorIndex = 2) {
  const palette = ['#263238', '#f4f2ec', '#e75445', '#f2b84b'];
  const pixels = Array(width * height).fill(-1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((x + y) % 3 === 0) pixels[y * width + x] = colorIndex;
    }
  }
  return encodePng({ schemaVersion: 1, width, height, palette, pixels });
}

const landscapePng = png(192, 96, 2);
const portraitPng = png(96, 192, 3);
const imageBody = (bytes) => Buffer.from(bytes);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const safe = normalize(pathname).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
    let file = join(process.cwd(), safe || 'index.html');
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); }
    catch { /* fall through to normal read error */ }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const origin = new URL(base).origin;
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
const accountRows = [
  { id: publishedId, author_id: ownerId, title: '横長の公開作品', caption: '地図から開けます', status: 'published', post_kind: 'pixel_art', created_at: '2026-10-05T03:00:00Z', image_width: 192, image_height: 96, image_path: `${ownerId}/published.png`, submission_puzzle_mode: null, deleted_at: null, delete_cleanup_completed_at: null },
  { id: pendingId, author_id: ownerId, title: '縦長のパズル作品', caption: '内容を確認中', status: 'pending', post_kind: 'pixel_camera', created_at: '2026-10-04T03:00:00Z', image_width: 96, image_height: 192, image_path: `${ownerId}/pending.png`, submission_puzzle_mode: 'hidden_object', deleted_at: null, delete_cleanup_completed_at: null },
  { id: cleanupId, author_id: ownerId, title: '画像削除の再試行', caption: '', status: 'hidden', post_kind: 'pixel_art', created_at: '2026-10-03T03:00:00Z', image_width: 96, image_height: 96, image_path: `${ownerId}/cleanup.png`, submission_puzzle_mode: null, deleted_at: '2026-10-06T00:00:00Z', delete_cleanup_completed_at: null },
  { id: deletedId, author_id: ownerId, title: '削除済み', caption: '', status: 'hidden', post_kind: 'pixel_art', created_at: '2026-10-02T03:00:00Z', image_width: 16, image_height: 16, image_path: `${ownerId}/deleted.png`, submission_puzzle_mode: null, deleted_at: '2026-10-06T00:00:00Z', delete_cleanup_completed_at: '2026-10-06T00:01:00Z' },
];
const guestRows = [
  { id: '88888888-8888-4888-8888-888888888888', author_id: guestId, title: 'ゲストの作品', caption: '', status: 'pending', post_kind: 'pixel_art', created_at: '2026-10-01T03:00:00Z', image_width: 16, image_height: 16, image_path: `${guestId}/guest.png`, submission_puzzle_mode: null, deleted_at: null, delete_cleanup_completed_at: null },
];
const authorProfiles = new Map([[ownerId, ''], [guestId, '']]);

function responseJson(route, data, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' }, body: JSON.stringify(data) });
}

async function setupPage(viewport, { account = false, device = false, failListOnce = false, holdFirstAccountList = false, deleteModes = [] } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width <= 390 ? 2 : 1 });
  await context.addInitScript(({ accountKey, deviceKey, accountValue, deviceValue, account, device }) => {
    localStorage.clear();
    if (account) localStorage.setItem(accountKey, JSON.stringify(accountValue));
    if (device) localStorage.setItem(deviceKey, JSON.stringify(deviceValue));
  }, {
    accountKey: accountSessionKey, deviceKey: deviceSessionKey,
    accountValue: { access_token: 'account-token', refresh_token: 'account-refresh', expires_at: 4102444800, user_id: ownerId },
    deviceValue: { access_token: 'device-token', refresh_token: 'device-refresh', expires_at: 4102444800, user_id: guestId },
    account, device,
  });
  const state = { failListOnce, held: false, holdFirstAccountList, releaseAccountList: null, accountListStarted: null, deleteModes: [...deleteModes], deleted: new Set(), cleanupStarted: false, rows: structuredClone(accountRows) };
  if (holdFirstAccountList) state.accountListStarted = new Promise((resolve) => { state.signalAccountList = resolve; });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== project) {
      const type = route.request().resourceType();
      if (type === 'script') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (type === 'stylesheet') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if (type === 'image') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
      return responseJson(route, { ok: true, events: [], stores: [], works: [] });
    }
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' } });
    const path = url.pathname;
    const token = route.request().headers().authorization?.replace(/^Bearer\s+/i, '') || '';
    const isDevice = token === 'device-token';
    if (path === '/auth/v1/user') {
      if (isDevice) return responseJson(route, { id: guestId, is_anonymous: true, user_metadata: {} });
      if (token === 'account-token') return responseJson(route, { id: ownerId, is_anonymous: false, user_metadata: { display_name: 'テスト作者' } });
      return responseJson(route, { message: 'unauthorized' }, 401);
    }
    if (path === '/auth/v1/token') return responseJson(route, { access_token: isDevice ? 'device-token' : 'account-token', refresh_token: 'refresh', expires_at: 4102444800, user_id: isDevice ? guestId : ownerId });
    if (path === '/rest/v1/social_posts') return responseJson(route, []);
    if (path === '/rest/v1/user_posts') {
      if (state.failListOnce) { state.failListOnce = false; return responseJson(route, { message: 'synthetic list failure' }, 503); }
      if (state.holdFirstAccountList && !isDevice && !state.held && (url.searchParams.get('select') || '').includes('author_name')) {
        state.held = true;
        state.signalAccountList?.();
        await new Promise((resolve) => { state.releaseAccountList = resolve; });
      }
      const rows = isDevice ? guestRows : state.rows;
      let filtered = rows.filter((row) => row.author_id === (isDevice ? guestId : ownerId) && !state.deleted.has(row.id));
      const exactId = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (exactId) filtered = filtered.filter((row) => row.id === exactId);
      return responseJson(route, filtered);
    }
    if (path === '/rest/v1/post_map_points') {
      const ids = url.searchParams.get('post_id') || '';
      return responseJson(route, ids.includes(publishedId) ? [{ post_id: publishedId, public_image_path: `${ownerId}/published.png`, published_at: '2026-10-05T03:00:00Z' }] : []);
    }
    if (path === '/rest/v1/post_likes') return responseJson(route, [{ post_id: mapLikeId }]);
    if (path === '/rest/v1/post_author_profiles') {
      const authorId = url.searchParams.get('author_id')?.replace(/^eq\./, '');
      return responseJson(route, authorProfiles.has(authorId) ? [{ author_id: authorId, display_name: authorProfiles.get(authorId) }] : []);
    }
    if (path === '/functions/v1/set-author-name' && method === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}');
      const authorId = isDevice ? guestId : ownerId;
      authorProfiles.set(authorId, String(payload.name || ''));
      for (const row of [...state.rows, ...guestRows]) if (row.author_id === authorId) row.author_name = String(payload.name || '');
      return responseJson(route, { ok: true, name: String(payload.name || '') });
    }
    if (path.startsWith('/storage/v1/object/sign/post-quarantine/')) {
      if (method === 'POST') return responseJson(route, { signedURL: `${project}${path}?token=synthetic` });
      const image = path.includes('pending.png') || path.includes('guest.png') ? portraitPng : landscapePng;
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: await imageBody(image) });
    }
    if (path.startsWith('/storage/v1/object/public/post-public/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: await imageBody(landscapePng) });
    }
    if (path === '/functions/v1/delete-post' && method === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}');
      const mode = state.deleteModes.shift() || 'success';
      if (mode === 'cleanup') {
        state.cleanupStarted = true;
        const row = state.rows.find((entry) => entry.id === payload.postId);
        if (row) row.deleted_at = '2026-10-06T04:00:00Z';
        return responseJson(route, { ok: true, deleted: true, cleanupPending: true }, 503);
      }
      if (mode === 'success') {
        state.deleted.add(payload.postId);
        const row = state.rows.find((entry) => entry.id === payload.postId);
        if (row) { row.deleted_at = '2026-10-06T04:00:00Z'; row.delete_cleanup_completed_at = '2026-10-06T04:01:00Z'; }
        return responseJson(route, { ok: true, deleted: true });
      }
      return responseJson(route, { ok: false, deleted: false }, 500);
    }
    return responseJson(route, { message: `Unexpected synthetic request: ${method} ${path}` }, 404);
  });
  return { context, page, state };
}

const check = (name) => checks.push(name);
const assertNoPageErrors = () => assert.deepEqual(errors.splice(0), [], 'no page errors');

try {
  // Signed-out home and posts pages use the actual profile HTML and preserve a clear posting/login path.
  for (const [path, viewport] of [['/profile/', { width: 320, height: 568 }], ['/profile/?view=posts', { width: 390, height: 844 }]]) {
    const { context, page } = await setupPage(viewport);
    try {
      await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-my-posts-root]').waitFor();
      await page.getByText('投稿した絵はまだありません').waitFor();
      await page.getByRole('link', { name: '作品を投稿する' }).first().waitFor();
      assertNoPageErrors();
      assert.equal(await page.locator('[data-author-profiles-root]').isVisible(), false, 'signed-out author settings stay hidden');
      check(`signed-out ${path} ${viewport.width}px`);
    } finally { await context.close(); }
  }

  // Home overview account/session counts, private and public thumbnails, and full-fit detail images.
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const { context, page } = await setupPage(viewport, { account: true, device: true });
    try {
      await page.goto(`${base}/profile/`, { waitUntil: 'domcontentloaded' });
      await page.locator('.profile-post-card').first().waitFor();
      await page.getByText('テスト作者の投稿した作品や、見つけた絵をまとめて確認できます。').waitFor();
      assert.equal(await page.locator('[data-profile-post-count]').textContent(), '4');
      await page.waitForFunction(() => document.querySelector('[data-profile-like-count]')?.textContent === '1', null, { timeout: 10000 });
      assert.equal(await page.locator('[data-post-id="66666666-6666-4666-8666-666666666666"]').count(), 0);
      await page.getByText('パズル内容確認中').waitFor();
      await page.getByText('画像の削除待ち').waitFor();
      const overviewStats = await page.locator('.profile-summary').boundingBox();
      assert.ok(overviewStats.width <= viewport.width - 24, `summary fits ${viewport.width}px`);
      const cards = page.locator('.profile-post-card');
      const landscapeCard = cards.filter({ hasText: '横長の公開作品' }).first();
      await landscapeCard.getByRole('button', { name: '詳細を見る' }).click();
      const dialog = page.locator('[data-profile-post-dialog]');
      await dialog.waitFor({ state: 'visible' });
      const image = dialog.locator('.profile-post-dialog__image');
      await image.waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector('.profile-post-dialog__image');
        return image?.complete && image.naturalWidth === 192 && image.naturalHeight === 96;
      });
      const fit = await page.evaluate(() => {
        const wrap = document.querySelector('.profile-post-dialog__image-wrap').getBoundingClientRect();
        const image = document.querySelector('.profile-post-dialog__image').getBoundingClientRect();
        const node = document.querySelector('.profile-post-dialog__image');
        return { wrap: { width: wrap.width, height: wrap.height }, image: { width: image.width, height: image.height }, objectFit: getComputedStyle(node).objectFit, naturalRatio: node.naturalWidth / node.naturalHeight };
      });
      assert.ok(fit.image.width <= fit.wrap.width + 1 && fit.image.height <= fit.wrap.height + 1, `landscape contain fit: ${JSON.stringify(fit)}`);
      assert.equal(fit.objectFit, 'contain', `landscape preserves full image: ${JSON.stringify(fit)}`);
      assert.ok(Math.abs(fit.image.width - fit.wrap.width) < 1 && Math.abs(fit.image.height - fit.wrap.height) < 1, `landscape uses available frame: ${JSON.stringify(fit)}`);
      await dialog.getByRole('link', { name: '地図で見る' }).waitFor();
      await dialog.getByRole('button', { name: '閉じる' }).click();
      if (viewport.width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: '/tmp/profile-overview-mobile.png', fullPage: false });
      }
      const pending = cards.filter({ hasText: '縦長のパズル作品' }).first();
      await pending.getByRole('button', { name: '詳細を見る' }).click();
      await dialog.locator('.profile-post-dialog__image').waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector('.profile-post-dialog__image');
        return image?.complete && image.naturalWidth === 96 && image.naturalHeight === 192;
      });
      const portrait = await page.evaluate(() => {
        const frame = document.querySelector('.profile-post-dialog__image-wrap').getBoundingClientRect();
        const image = document.querySelector('.profile-post-dialog__image').getBoundingClientRect();
        const node = document.querySelector('.profile-post-dialog__image');
        return { frame: { width: frame.width, height: frame.height }, image: { width: image.width, height: image.height }, objectFit: getComputedStyle(node).objectFit, naturalRatio: node.naturalWidth / node.naturalHeight };
      });
      assert.ok(portrait.image.width <= portrait.frame.width + 1 && portrait.image.height <= portrait.frame.height + 1, `portrait contain fit: ${JSON.stringify(portrait)}`);
      assert.equal(portrait.objectFit, 'contain', `portrait preserves full image: ${JSON.stringify(portrait)}`);
      await dialog.getByRole('button', { name: '閉じる' }).click();
      assertNoPageErrors();
      check(`home ${viewport.width}px, public/private PNG fit ${fit.image.width.toFixed(0)}x${fit.image.height.toFixed(0)} / ${portrait.image.width.toFixed(0)}x${portrait.image.height.toFixed(0)}`);
    } finally { await context.close(); }
  }

  // A long synthetic caption keeps the profile dialog scrolling while its close control stays clickable.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    const { context, page, state } = await setupPage(viewport, { account: true });
    try {
      state.rows[0].caption = '長い合成キャプションです。'.repeat(2400);
      await page.goto(`${base}/profile/?view=posts`, { waitUntil: 'domcontentloaded' });
      const card = page.locator(`[data-post-id="${publishedId}"]`);
      await card.waitFor();
      await card.getByRole('button', { name: '詳細を見る' }).click();
      const dialog = page.locator('[data-profile-post-dialog]');
      await dialog.waitFor({ state: 'visible' });
      const maxScroll = await dialog.evaluate((node) => node.scrollHeight - node.clientHeight);
      assert.ok(maxScroll > 300, `long caption creates dialog scroll range at ${viewport.width}x${viewport.height}: ${maxScroll}`);
      const positions = [];
      for (const point of ['top', 'middle', 'bottom']) {
        const stateAtPoint = await dialog.evaluate((node, point) => {
          const max = node.scrollHeight - node.clientHeight;
          node.scrollTop = point === 'top' ? 0 : point === 'middle' ? max / 2 : max;
          const close = node.querySelector('.profile-post-dialog__close');
          const rect = close.getBoundingClientRect();
          const dialogRect = node.getBoundingClientRect();
          const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          const hit = document.elementFromPoint(center.x, center.y);
          return {
            scrollTop: node.scrollTop,
            width: rect.width,
            height: rect.height,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom },
            viewport: { width: innerWidth, height: innerHeight },
            hit: hit === close || close.contains(hit),
          };
        }, point);
        assert.ok(stateAtPoint.width >= 44 && stateAtPoint.height >= 44, `profile close touch size ${point}: ${JSON.stringify(stateAtPoint)}`);
        assert.ok(stateAtPoint.rect.left >= 0 && stateAtPoint.rect.right <= viewport.width && stateAtPoint.rect.top >= 0 && stateAtPoint.rect.bottom <= viewport.height, `profile close is in viewport ${point}: ${JSON.stringify(stateAtPoint)}`);
        assert.ok(stateAtPoint.rect.left >= stateAtPoint.dialog.left && stateAtPoint.rect.right <= stateAtPoint.dialog.right && stateAtPoint.rect.top >= stateAtPoint.dialog.top && stateAtPoint.rect.bottom <= stateAtPoint.dialog.bottom, `profile close is in dialog ${point}: ${JSON.stringify(stateAtPoint)}`);
        assert.ok(stateAtPoint.hit, `profile close receives elementFromPoint ${point}: ${JSON.stringify(stateAtPoint)}`);
        positions.push(`${point}@${Math.round(stateAtPoint.scrollTop)}`);
      }
      const closeRect = await dialog.locator('.profile-post-dialog__close').boundingBox();
      await page.mouse.click(closeRect.x + closeRect.width / 2, closeRect.y + closeRect.height / 2);
      await dialog.waitFor({ state: 'hidden' });
      assertNoPageErrors();
      check(`profile detail close top/middle/bottom ${viewport.width}x${viewport.height} (${positions.join(', ')})`);
    } finally { await context.close(); }
  }

  // The actual globe prototype stylesheet keeps both scroll-panel headers and their close buttons exposed.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      for (const fixture of [
        {
          panel: '.sheet', close: '.sheet__close',
          content: '<aside class="sheet viewer" data-panel="sheet"><header class="sheet__head"><h2>作品シート</h2><button class="sheet__close" type="button" aria-label="閉じる" data-probe-close>×</button></header><div style="height:1800px;flex:none">合成スクロール本文</div></aside>',
        },
        {
          panel: '.map-events-panel', close: '.map-events-panel__close',
          content: '<aside class="map-events-panel" data-panel="events"><header class="map-events-panel__head"><h2>イベント一覧</h2><button class="map-events-panel__close" type="button" data-probe-close>×</button></header><div class="map-events-panel__list">' + '<article class="map-event-card">合成イベント</article>'.repeat(40) + '</div></aside>',
        },
      ]) {
        await page.setContent(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${base}/css/globe-prototype.css"></head><body><main class="globe-stage" style="height:100dvh;min-height:0;border:0;border-radius:0">${fixture.content}</main></body></html>`);
        await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/globe-prototype.css')));
        const panel = page.locator(fixture.panel);
        const maxScroll = await panel.evaluate((node) => node.scrollHeight - node.clientHeight);
        assert.ok(maxScroll > 200, `${fixture.panel} has real scroll range at ${viewport.width}x${viewport.height}: ${maxScroll}`);
        for (const point of ['top', 'middle', 'bottom']) {
          const stateAtPoint = await panel.evaluate((node, point) => {
            const max = node.scrollHeight - node.clientHeight;
            node.scrollTop = point === 'top' ? 0 : point === 'middle' ? max / 2 : max;
            const close = node.querySelector('[data-probe-close]');
            const rect = close.getBoundingClientRect();
            const panelRect = node.getBoundingClientRect();
            const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const hit = document.elementFromPoint(center.x, center.y);
            return { scrollTop: node.scrollTop, width: rect.width, height: rect.height, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom }, viewport: { width: innerWidth, height: innerHeight }, hit: hit === close || close.contains(hit) };
          }, point);
          assert.ok(stateAtPoint.width >= 44 && stateAtPoint.height >= 44, `${fixture.panel} close touch size ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.rect.left >= 0 && stateAtPoint.rect.right <= viewport.width && stateAtPoint.rect.top >= 0 && stateAtPoint.rect.bottom <= viewport.height, `${fixture.panel} close is in viewport ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.rect.left >= stateAtPoint.panel.left && stateAtPoint.rect.right <= stateAtPoint.panel.right && stateAtPoint.rect.top >= stateAtPoint.panel.top && stateAtPoint.rect.bottom <= stateAtPoint.panel.bottom, `${fixture.panel} close is in panel ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.hit, `${fixture.panel} close receives elementFromPoint ${point}: ${JSON.stringify(stateAtPoint)}`);
          if (point === 'bottom') {
            const closeRect = await panel.locator(fixture.close).boundingBox();
            await page.mouse.click(closeRect.x + closeRect.width / 2, closeRect.y + closeRect.height / 2);
          }
        }
        check(`${fixture.panel} close top/middle/bottom ${viewport.width}x${viewport.height}`);
      }
      assertNoPageErrors();
    } finally { await context.close(); }
  }

  // The unpublished room preview keeps product/help close buttons exposed over long synthetic dialog content.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    try {
      await page.goto(`${base}/books/room-preview.html`, { waitUntil: 'domcontentloaded' });
      await page.locator('#room-help').waitFor();
      await page.waitForFunction(() => {
        const select = document.querySelector('#room-product-select');
        return select && [...select.options].some((option) => option.value === 'product-dot-classroom');
      });
      for (const kind of ['help', 'product']) {
        if (kind === 'help') {
          await page.locator('#room-help').click();
          await page.locator('#room-help-dialog').evaluate((dialog) => {
            const step = dialog.querySelector('.room-help-steps li');
            step.textContent = '長い合成ヘルプ本文です。'.repeat(1200);
          });
        } else {
          await page.locator('#room-product-select').selectOption('product-dot-classroom');
          await page.locator('#room-product-open').click();
          await page.locator('#room-product-dialog').waitFor({ state: 'visible' });
          await page.locator('#room-product-description').evaluate((node) => { node.textContent = '長い合成商品説明です。'.repeat(1200); });
        }
        const dialog = page.locator(kind === 'help' ? '#room-help-dialog' : '#room-product-dialog');
        const scrollArea = dialog.locator('.room-dialog__layout');
        const maxScroll = await scrollArea.evaluate((node) => node.scrollHeight - node.clientHeight);
        assert.ok(maxScroll > 200, `room ${kind} has scroll range at ${viewport.width}x${viewport.height}: ${maxScroll}`);
        for (const point of ['top', 'middle', 'bottom']) {
          const stateAtPoint = await scrollArea.evaluate((node, point) => {
            const max = node.scrollHeight - node.clientHeight;
            node.scrollTop = point === 'top' ? 0 : point === 'middle' ? max / 2 : max;
            const close = node.parentElement.querySelector('.room-dialog__close');
            const rect = close.getBoundingClientRect();
            const dialogRect = node.parentElement.getBoundingClientRect();
            const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const hit = document.elementFromPoint(center.x, center.y);
            return { scrollTop: node.scrollTop, width: rect.width, height: rect.height, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom }, viewport: { width: innerWidth, height: innerHeight }, hit: hit === close || close.contains(hit) };
          }, point);
          assert.ok(stateAtPoint.width >= 44 && stateAtPoint.height >= 44, `room ${kind} close touch size ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.rect.left >= 0 && stateAtPoint.rect.right <= viewport.width && stateAtPoint.rect.top >= 0 && stateAtPoint.rect.bottom <= viewport.height, `room ${kind} close is in viewport ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.rect.left >= stateAtPoint.dialog.left && stateAtPoint.rect.right <= stateAtPoint.dialog.right && stateAtPoint.rect.top >= stateAtPoint.dialog.top && stateAtPoint.rect.bottom <= stateAtPoint.dialog.bottom, `room ${kind} close is in dialog ${point}: ${JSON.stringify(stateAtPoint)}`);
          assert.ok(stateAtPoint.hit, `room ${kind} close receives elementFromPoint ${point}: ${JSON.stringify(stateAtPoint)}`);
        }
        const closeRect = await dialog.locator('.room-dialog__close').boundingBox();
        await page.mouse.click(closeRect.x + closeRect.width / 2, closeRect.y + closeRect.height / 2);
        await dialog.waitFor({ state: 'hidden' });
      }
      assertNoPageErrors();
      check(`books preview help/product close top/middle/bottom ${viewport.width}x${viewport.height}`);
    } finally { await context.close(); }
  }

  // Author names are stored by verified session scope and projected back onto existing artwork.
  {
    const { context, page } = await setupPage({ width: 390, height: 844 }, { account: true, device: true });
    try {
      await page.goto(`${base}/profile/?view=posts`, { waitUntil: 'domcontentloaded' });
      const accountForm = page.locator('[data-author-scope="account"]');
      const deviceForm = page.locator('[data-author-scope="device"]');
      await accountForm.waitFor();
      await deviceForm.waitFor();
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const nav = document.querySelector('.mobile-nav');
        if (nav) { nav.style.position = 'static'; nav.style.inset = 'auto'; }
      });
      await page.screenshot({ path: '/tmp/profile-posts-mobile.png', fullPage: true });
      const authorControl = await accountForm.locator('input').evaluate((input) => {
        const rect = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        const button = input.closest('form').querySelector('button').getBoundingClientRect();
        return { inputHeight: rect.height, visible: style.visibility === 'visible' && rect.width > 0, background: style.backgroundColor, border: style.borderStyle, buttonHeight: button.height };
      });
      assert.ok(authorControl.visible && authorControl.inputHeight >= 44 && authorControl.buttonHeight >= 44, `author form touch controls: ${JSON.stringify(authorControl)}`);
      assert.notEqual(authorControl.background, 'rgba(0, 0, 0, 0)', `author form has a visible input surface: ${JSON.stringify(authorControl)}`);
      assert.notEqual(authorControl.border, 'none', `author form input border: ${JSON.stringify(authorControl)}`);
      const accountName = '<b>作者</b>';
      await accountForm.locator('input').fill(accountName);
      await page.evaluate(() => document.dispatchEvent(new Event('pixieed:profile-rendered')));
      assert.equal(await accountForm.locator('input').inputValue(), accountName, 'draft survives profile data rerender');
      await accountForm.getByRole('button', { name: '保存' }).click();
      await accountForm.getByText('作者名を保存しました。投稿済みの作品にも反映されます。').waitFor();
      await page.getByText(accountName, { exact: true }).first().waitFor();
      assert.equal(await page.locator('.profile-post-card__author').filter({ hasText: accountName }).locator('b').count(), 0, 'author name is rendered as text');
      assert.equal(authorProfiles.get(ownerId), accountName, 'account token updates the account profile');
      const fortyEmoji = '😀'.repeat(40);
      await deviceForm.locator('input').fill(fortyEmoji);
      await deviceForm.getByRole('button', { name: '保存' }).click();
      await deviceForm.getByText('作者名を保存しました。投稿済みの作品にも反映されます。').waitFor();
      assert.equal(authorProfiles.get(guestId), fortyEmoji, 'device token updates the device profile');
      assert.equal(await page.locator(`[data-post-id="${guestRows[0].id}"] .profile-post-card__author`).textContent(), fortyEmoji);
      await deviceForm.locator('input').fill('界'.repeat(41));
      await deviceForm.getByRole('button', { name: '保存' }).click();
      await deviceForm.getByText('作者名は改行を含めず、前後の空白を除いて1〜40文字で入力してください。').waitFor();
      assert.equal(authorProfiles.get(guestId), fortyEmoji, '41 Unicode code points are rejected without a request');
      assertNoPageErrors();
      check('account/device author names, safe text, and Unicode length validation');
    } finally { await context.close(); }
  }

  // Deletion cancel is non-mutating; explicit confirmation removes a post from the list.
  {
    const { context, page, state } = await setupPage({ width: 390, height: 844 }, { account: true, deleteModes: ['success'] });
    try {
      await page.goto(`${base}/profile/?view=posts`, { waitUntil: 'domcontentloaded' });
      await page.locator('.profile-post-card').first().waitFor();
      const item = page.locator(`[data-post-id="${publishedId}"]`);
      await item.getByRole('button', { name: '詳細を見る' }).click();
      assert.equal(await page.locator('[data-delete-confirm]').isVisible(), false, 'confirmation is initially hidden');
      await page.getByRole('button', { name: '削除する' }).click();
      await page.getByRole('button', { name: '戻る' }).click();
      assert.equal(state.deleted.size, 0, 'cancel leaves the post unchanged');
      assert.equal(await page.locator('[data-delete-confirm]').isVisible(), false, 'cancel hides confirmation');
      await page.getByRole('button', { name: '削除する' }).click();
      await page.getByRole('button', { name: '投稿を削除' }).click();
      await page.locator(`[data-post-id="${publishedId}"]`).waitFor({ state: 'detached' });
      assert.equal(state.deleted.size, 1);
      assertNoPageErrors();
      check('delete confirmation and successful removal');
    } finally { await context.close(); }
  }

  // A storage cleanup failure leaves an owned, retryable deletion row with no image request.
  {
    const { context, page, state } = await setupPage({ width: 390, height: 844 }, { account: true, deleteModes: ['cleanup', 'success'] });
    try {
      await page.goto(`${base}/profile/?view=posts`, { waitUntil: 'domcontentloaded' });
      const retryCard = page.locator(`[data-post-id="${cleanupId}"]`);
      await retryCard.waitFor();
      await retryCard.getByRole('button', { name: '詳細を見る' }).click();
      await page.getByRole('button', { name: '削除を完了する' }).click();
      await page.getByRole('button', { name: '投稿を削除' }).click();
      await page.getByText('投稿の公開は停止しました。画像の削除を完了するため、もう一度削除を押してください。').waitFor();
      assert.equal(state.cleanupStarted, true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const retryAfterReload = page.locator(`[data-post-id="${cleanupId}"]`);
      await retryAfterReload.waitFor();
      await retryAfterReload.getByRole('button', { name: '詳細を見る' }).click();
      await page.getByText('公開は停止済みです。画像の削除を完了してください。').waitFor();
      await page.getByRole('button', { name: '削除を完了する' }).click();
      await page.getByRole('button', { name: '投稿を削除' }).click();
      await page.locator(`[data-post-id="${cleanupId}"]`).waitFor({ state: 'detached' });
      assertNoPageErrors();
      check('cleanup-pending reload and retry');
    } finally { await context.close(); }
  }

  // A list failure is explicit and retryable rather than being presented as an empty profile.
  {
    const { context, page } = await setupPage({ width: 390, height: 844 }, { account: true, failListOnce: true });
    try {
      await page.goto(`${base}/profile/`, { waitUntil: 'domcontentloaded' });
      await page.getByText('投稿を読み込めませんでした。再読み込みしてください。').waitFor();
      assert.equal(await page.getByText('投稿した絵はまだありません').count(), 0);
      await page.getByRole('button', { name: 'もう一度読み込む' }).click();
      await page.getByText('横長の公開作品').waitFor();
      assertNoPageErrors();
      check('list failure and explicit retry');
    } finally { await context.close(); }
  }

  // A late account response cannot resurrect private cards after sign-out; device posts remain scoped.
  {
    const { context, page, state } = await setupPage({ width: 390, height: 844 }, { account: true, device: true, holdFirstAccountList: true });
    try {
      await page.goto(`${base}/profile/?view=posts`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'ログアウト' }).waitFor();
      await state.accountListStarted;
      await page.getByRole('button', { name: 'ログアウト' }).click();
      await page.locator(`[data-post-id="${guestRows[0].id}"]`).waitFor();
      assert.equal(await page.locator(`[data-post-id="${publishedId}"]`).count(), 0);
      assert.equal(await page.locator('[data-author-scope="account"]').count(), 0);
      assert.equal(await page.locator('[data-author-scope="device"]').count(), 1);
      state.releaseAccountList?.();
      await page.waitForTimeout(80);
      assert.equal(await page.locator(`[data-post-id="${publishedId}"]`).count(), 0, 'late private account result ignored');
      assert.equal(await page.locator(`[data-post-id="${guestRows[0].id}"]`).count(), 1, 'device guest post retained');
      assertNoPageErrors();
      check('logout clears private UI and ignores stale response');
    } finally { state.releaseAccountList?.(); await context.close(); }
  }

  console.log(JSON.stringify({ status: 'PASS', checks, screenshots: ['/tmp/profile-posts-mobile.png', '/tmp/profile-overview-mobile.png'], syntheticSupabase: true, production: 'UNTESTED' }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
