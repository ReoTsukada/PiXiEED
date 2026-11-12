#!/usr/bin/env node
/** Actual admin UI with synthetic identity/API/PNG only. All external network is intercepted or blocked. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const out = process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-home-review-ui/browser';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    let file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (file !== root && !file.startsWith(root + '/')) throw Error();
    if ((await stat(file)).isDirectory()) file += '/index.html';
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ttf': 'font/ttf' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
function png(n){const size=24;const bytes=Buffer.alloc(size*(1+size*4));for(let y=0;y<size;y++)for(let x=0;x<size;x++){let c=[[229,238,216],[234,225,239],[221,236,235]][n%3];if(n===0){if(y>7&&y<20&&x>=5+Math.max(0,y-16)&&x<=18-Math.max(0,y-16))c=(x+y)%5===0?[255,226,136]:[217,103,98];if(y>=4&&y<=9&&x>=9&&x<=14)c=[75,137,82];}if(n===1){if(x>=5&&x<=18&&y>=8&&y<=20||y>=4&&y<=9&&(x>=5&&x<=9||x>=14&&x<=18))c=[226,177,82];if(y===13&&(x===9||x===15))c=[54,71,57];if(y===16&&x===12)c=[190,100,105];}if(n===2){if(y>7&&Math.abs(x-8)<y-6||y>9&&Math.abs(x-17)<y-8)c=x<13?[92,149,118]:[51,110,91];if((x-18)**2+(y-4)**2<9)c=[246,210,110];}const i=y*(size*4+1)+1+x*4;bytes.set([...c,255],i);}function chunk(type,data){const name=Buffer.from(type),all=Buffer.concat([name,data]);let crc=0xffffffff;for(const b of all){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,all,tail]);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]);}const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const imageId = 'b0000000-0000-4000-8000-000000000001';
function artwork(n, reviewState = 'pending') {
  const bytes = png(n % 3), postId = uuid(n);
  return { postId, id: `map:${postId}`, title: ['いちごの午後', 'ひなたのねこ', '山のむこう'][n % 3], authorName: 'テスト作者', imagePath: `${postId}/${imageId}.png`, imageBytes: bytes.length, imageSha256: createHash('sha256').update(bytes).digest('hex'), publishedAt: '2026-11-10T12:00:00Z', eligible: true, reviewState, snapshotToken: 'b'.repeat(64) };
}
const report = { status: 'RUNNING', cases: [], limitations: ['Local Chromium only; synthetic sessions, API, and PNG. No live account, Edge/DB, Google Sheets, deployment, Safari, or physical device verification.'] };
async function setup(width = 390, options = {}) {
  const state = { mode: 'ready', imageMode: 'ready', postMode: 'ready', delayGet: 0, delayImage: 0, delayPost: 0, delayAuth: 0, rows: [artwork(1), artwork(2), artwork(3, 'approved'), artwork(4, 'held')], ...options };
  const hits = { get: [], posts: [], auth: [], moderation: [], images: [], blocked: [], outbound: [] }, errors = [];
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, serviceWorkers: 'block' });
  await context.addInitScript(({ noSession }) => {
    if (!noSession && !sessionStorage.getItem('qa:seeded')) { sessionStorage.setItem('PiXiEED:admin-supabase-session:v1', JSON.stringify({ access_token: 'synthetic-admin-token', user: { email: 'admin@example.test' } })); sessionStorage.setItem('qa:seeded', 'yes'); }
    window.google = { accounts: { oauth2: { initTokenClient: ({ callback }) => ({ requestAccessToken: () => callback({ access_token: 'synthetic-google-token' }) }) } } };
  }, { noSession: options.noSession });
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(value) });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base) {
      if (url.pathname === '/data/admin-config.js') return route.fulfill({ contentType: 'text/javascript', body: `export const adminConfig = { googleOAuthClientId:'synthetic-client', spreadsheetId:'synthetic-sheet', adminEmail:'admin@example.test', sheets:{works:'Works',stores:'Stores',storeWorks:'StoreWorks',events:'Events',eventSources:'EventSources',analyticsDaily:'AnalyticsDaily'} };` });
      if (url.pathname === '/qa-other.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Local navigation fixture</body></html>' });
      return route.continue();
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/oauth2/v3/userinfo') return json(route, { email: 'admin@example.test' });
    if (url.hostname === 'sheets.googleapis.com') return json(route, { values: [] });
    if (url.hostname === 'kyyiuakrqomzlikfaire.supabase.co') {
      if (url.pathname === '/auth/v1/token') { hits.auth.push({ body: req.postDataJSON(), headers: req.headers() }); await new Promise(resolve => setTimeout(resolve, state.delayAuth)); return json(route, { access_token: 'synthetic-admin-token-2', user: { email: 'admin@example.test' } }); }
      if (url.pathname === '/functions/v1/moderate-post') { hits.moderation.push(req.postDataJSON()); return json(route, { ok: true, posts: [] }); }
      if (url.pathname === '/functions/v1/home-artwork-review') {
        if (req.method() === 'GET') {
          hits.get.push({ url: url.href, headers: req.headers() });
          const mode = state.mode, filter = url.searchParams.get('state'), after = url.searchParams.get('after');
          let rows = state.rows.filter(row => filter === 'all' || row.reviewState === filter);
          if (after) rows = rows.filter(row => row.postId > after);
          const page = rows.slice(0, 24), nextCursor = rows.length > 24 ? page.at(-1).postId : null;
          await new Promise(resolve => setTimeout(resolve, state.delayGet));
          if (mode === '401' || mode === '403') return json(route, { error: 'denied' }, Number(mode));
          if (mode === 'error') return json(route, { error: 'unavailable' }, 503);
          if (mode === 'malformed') return json(route, { ok: true, artworks: [{ ...page[0], snapshotToken: 'invalid' }], nextCursor: null });
          return json(route, { ok: true, artworks: mode === 'empty' ? [] : page, nextCursor });
        }
        const body = req.postDataJSON(); hits.posts.push(body); await new Promise(resolve => setTimeout(resolve, state.delayPost));
        if (state.postMode === 'network') return route.abort('failed');
        if (state.postMode === '409' || state.postMode === '403') return json(route, { error: 'changed' }, Number(state.postMode));
        const row = state.rows.find(row => row.postId === body.postId); row.reviewState = body.action === 'approve' ? 'approved' : 'held';
        return json(route, { ok: true, postId: row.postId, reviewState: row.reviewState });
      }
      if (url.pathname.startsWith('/storage/v1/object/public/post-public/')) {
        hits.images.push(url.href); const mode = state.imageMode; await new Promise(resolve => setTimeout(resolve, state.delayImage));
        if (mode === 'broken') return route.fulfill({ status: 404, body: '' });
        if (mode === 'decode') return route.fulfill({ contentType: 'image/png', body: Buffer.from('not-a-png') });
        const id = url.pathname.split('/').at(-2), n = Number(id.slice(-12));
        return route.fulfill({ contentType: 'image/png', body: png(mode === 'changed' ? (n + 1) % 3 : n % 3) });
      }
    }
    hits.blocked.push(url.href); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/admin/'); await page.locator('[data-admin-login]').click();
  const host = page.locator('[data-admin-home-review]'); await host.waitFor();
  const ready = () => host.locator('.home-review__verified').waitFor();
  return { page, host, context, state, hits, errors, ready };
}
async function checkThree(host) { for (const input of await host.locator('input[type=checkbox]').all()) await input.check(); }
async function logCase(name, fn) { await fn(); report.cases.push({ name, passed: true }); console.log('PASS', name); }
try {
  for (const width of [320, 390, 1280]) await logCase(`actual admin panel: ${width}px, approval, cancellation, safe text`, async () => {
    const q = await setup(width); const { page, host, context, hits, errors, state } = q;
    await q.ready(); const approve = host.locator('[data-home-approve]'); assert.equal(await approve.isDisabled(), true);
    await host.locator('input').nth(0).check(); await host.locator('input').nth(1).check(); assert.equal(await approve.isDisabled(), true); await host.locator('input').nth(2).check(); assert.equal(await approve.isDisabled(), false);
    await approve.click(); await host.locator('[data-home-cancel]').click(); assert.equal(hits.posts.length, 0); assert.equal(await host.locator('dialog').count(), 0);
    await approve.click(); await page.keyboard.press('Escape'); assert.equal(hits.posts.length, 0); assert.equal(await host.locator('dialog').count(), 0);
    assert.equal(await host.locator('img').evaluate(image => getComputedStyle(image).objectFit), 'contain');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.evaluate(() => document.activeElement?.blur());
    await host.locator('.home-review__card').evaluate(card => window.scrollTo(0, card.getBoundingClientRect().top + scrollY - document.querySelector('.admin-header').getBoundingClientRect().height - 12));
    await page.screenshot({ path: join(out, `home-review-${width}.png`), fullPage: false });
    if (width === 390) {
      await page.screenshot({ path: join(out, 'home-review-mobile-art-390x844.png'), fullPage: false });
      await host.locator('.home-review__detail').evaluate(detail => window.scrollTo(0, detail.getBoundingClientRect().top + scrollY - document.querySelector('.admin-header').getBoundingClientRect().height - 36));
      await page.screenshot({ path: join(out, 'home-review-mobile-390x844.png'), fullPage: false });
    }
    await approve.click(); await host.locator('[data-home-confirm]').evaluate(button => { button.click(); button.click(); }); await q.ready();
    assert.equal(hits.posts.length, 1); assert.equal(hits.posts[0].action, 'approve'); for (const key of ['confirmedStillImage', 'confirmedRights', 'confirmedContent']) assert.equal(hits.posts[0][key], true);
    await host.locator('[data-home-filter=approved]').click(); await q.ready(); assert.equal(await host.locator('[data-home-approve]').count(), 0);
    await host.locator('[data-home-hold]').click(); assert.match(await host.locator('dialog').innerText(), /元の投稿の公開状態は変更しません/); await host.locator('[data-home-confirm]').click(); await q.ready(); assert.equal(hits.posts.at(-1).action, 'hold'); assert.equal(Object.hasOwn(hits.posts.at(-1), 'confirmedRights'), false);
    await host.locator('[data-home-filter=held]').click(); await q.ready(); assert.equal(await host.locator('[data-home-hold]').count(), 0);
    state.rows[0].title = '<img src=x onerror="window.bad=1">'; state.rows[0].reviewState = 'pending'; await host.locator('[data-home-filter=pending]').click(); await q.ready(); assert.equal(await host.locator('h3').innerText(), state.rows[0].title); assert.equal(await page.evaluate(() => window.bad), undefined); assert.equal(await host.locator('img').count(), 1);
    assert.ok(hits.get.every(hit => hit.headers.authorization === 'Bearer synthetic-admin-token')); assert.deepEqual(errors, []); await context.close();
  });
  await logCase('24-row pagination and one-image navigation', async () => {
    const q = await setup(390, { rows: Array.from({ length: 26 }, (_, index) => artwork(index + 1)) }); const { host, hits, context } = q; await q.ready(); assert.equal(hits.images.length, 1);
    await host.getByRole('button', { name: '次の作品', exact: true }).click(); await q.ready(); assert.equal(hits.images.length, 2);
    await host.getByRole('button', { name: '次のページ', exact: true }).click(); await q.ready(); assert.match(await host.locator('[data-home-pagination]').innerText(), /2ページ目/); assert.equal(new URL(hits.get.at(-1).url).searchParams.get('after'), uuid(24));
    await host.getByRole('button', { name: '前のページ', exact: true }).click(); await q.ready(); assert.match(await host.locator('[data-home-pagination]').innerText(), /1ページ目/); await context.close();
  });
  for (const mode of ['empty', 'error', 'malformed', '401', '403']) await logCase(`list ${mode} clears candidates`, async () => {
    const q = await setup(390, { mode }); const { host, page, context } = q;
    await page.waitForFunction(() => { const e = document.querySelector('[data-home-status]'); return e && !e.textContent.includes('読み込んでいます'); });
    assert.equal(await host.locator('[data-home-post]').count(), 0); assert.equal(await host.locator('[data-home-approve]').count(), 0);
    if (mode === '401' || mode === '403') { assert.equal(await page.evaluate(() => sessionStorage.getItem('PiXiEED:admin-supabase-session:v1')), null); await page.locator('[data-moderation-login]').waitFor(); }
    if (mode === 'empty') assert.match(await host.innerText(), /ホーム掲載を許可した公開作品/);
    await context.close();
  });
  for (const imageMode of ['broken', 'changed', 'decode']) await logCase(`image ${imageMode} cannot be approved`, async () => {
    const q = await setup(390, { imageMode }); if (imageMode === 'decode') { q.state.rows[0].imageBytes = 9; q.state.rows[0].imageSha256 = createHash('sha256').update('not-a-png').digest('hex'); await q.host.locator('[data-home-refresh]').click(); }
    await q.host.locator('.home-review__image-stage .is-error').waitFor(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true); assert.equal(q.hits.posts.length, 0); await q.context.close();
  });
  await logCase('slow image stays disabled and stale image cannot replace newer card', async () => {
    const q = await setup(390, { delayImage: 1200 }); await q.host.locator('[data-home-post]').waitFor(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true);
    await q.host.getByRole('button', { name: '次の作品', exact: true }).click(); await q.ready(); assert.equal(await q.host.locator('[data-home-post]').getAttribute('data-home-post'), uuid(2)); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true); await q.context.close();
  });
  for (const postMode of ['409', 'network', '403']) await logCase(`write ${postMode} fails closed with no duplicate`, async () => {
    const q = await setup(390, { postMode, delayPost: 100 }); await q.ready(); await checkThree(q.host); await q.host.locator('[data-home-approve]').click(); await q.host.locator('[data-home-confirm]').evaluate(button => { button.click(); button.click(); });
    if (postMode === '403') { await q.page.locator('[data-moderation-login]').waitFor(); assert.equal(await q.host.locator('[data-home-post]').count(), 0); }
    else { await q.host.locator('[data-home-status].is-error').waitFor(); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true); assert.equal(await q.host.locator('[data-home-filter=held]').isDisabled(), true); q.state.postMode = 'ready'; await q.host.locator('[data-home-refresh]').click(); await q.ready(); assert.equal(await q.host.locator('input:checked').count(), 0); }
    assert.equal(q.hits.posts.length, 1); await q.context.close();
  });
  await logCase('logout clears cards synchronously; delayed GET cannot restore them; shared sign-in works', async () => {
    const q = await setup(); await q.ready(); q.state.delayGet = 700; await q.host.locator('[data-home-refresh]').click();
    await q.page.locator('[data-moderation-logout]').click(); assert.equal(await q.host.locator('[data-home-post]').count(), 0); await q.page.waitForTimeout(900); assert.equal(await q.host.locator('[data-home-post]').count(), 0);
    await q.page.locator('[data-moderation-email]').fill('admin@example.test'); await q.page.locator('[data-moderation-password]').fill('synthetic-password-only'); await q.page.locator('[data-moderation-login] button').click(); await q.ready();
    assert.equal(q.hits.auth.length, 1); assert.equal(q.hits.auth[0].headers.authorization, undefined); assert.equal(q.hits.auth[0].headers.apikey.startsWith('sb_publishable_'), true); assert.ok(q.hits.get.at(-1).headers.authorization.endsWith('synthetic-admin-token-2')); assert.deepEqual(q.errors, []); await q.context.close();
  });
  await logCase('reload and browser Back discard unchecked review decisions', async () => {
    const q = await setup(); await q.ready(); await checkThree(q.host); await q.page.reload(); await q.page.locator('[data-admin-login]').click(); await q.ready(); assert.equal(await q.host.locator('input:checked').count(), 0);
    await q.page.goto(base + '/qa-other.html'); await q.page.goBack(); await q.page.locator('[data-admin-login]').click(); await q.ready(); assert.equal(await q.host.locator('input:checked').count(), 0); assert.deepEqual(q.errors, []); await q.context.close();
  });
  await logCase('pagehide aborts pending write and stale completion cannot restore hidden cards', async () => {
    const q = await setup(390, { delayPost: 700 }); await q.ready(); await checkThree(q.host); await q.host.locator('[data-home-approve]').click(); await q.host.locator('[data-home-confirm]').click();
    await q.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))); assert.equal(await q.host.locator('[data-home-post]').count(), 0); await q.page.waitForTimeout(850); assert.equal(await q.host.locator('[data-home-post]').count(), 0);
    await q.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await q.ready(); assert.equal(q.hits.posts.length, 1); await q.context.close();
  });
  await logCase('empty public author cannot be approved or replaced with email', async () => {
    const rows = [artwork(1)]; rows[0].authorName = ''; rows[0].email = 'private@example.test'; const q = await setup(390, { rows }); await q.ready(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true); assert.match(await q.host.innerText(), /公開作品名・公開作者名を設定/); assert.doesNotMatch(await q.host.innerText(), /private@example/); await q.context.close();
  });
  await logCase('withdrawn approved candidate is image-free, hold-only and cannot regain approval', async () => {
    const row = { ...artwork(1, 'approved'), eligible: false }; delete row.imagePath; delete row.imageBytes; delete row.imageSha256; delete row.publishedAt;
    const q = await setup(390, { rows: [row] }); await q.host.locator('[data-home-filter=approved]').click(); await q.host.locator('[data-home-post]').waitFor();
    assert.equal(q.hits.images.length, 0); assert.equal(await q.host.locator('img').count(), 0); assert.equal(await q.host.locator('[data-home-approve]').count(), 0); assert.match(await q.host.locator('.home-review__badge').innerText(), /承認済み・掲載対象外/);
    await q.host.locator('[data-home-hold]').click(); await q.host.locator('[data-home-confirm]').click(); await q.host.locator('[data-home-filter=held]').click(); await q.host.locator('[data-home-post]').waitFor();
    assert.equal(q.hits.posts.length, 1); assert.equal(q.hits.posts[0].action, 'hold'); assert.equal(q.hits.images.length, 0); assert.equal(await q.host.locator('[data-home-approve]').count(), 0); await q.context.close();
  });
  await logCase('legacy display names and one malformed row do not poison remaining candidates', async () => {
    const rows = [{ ...artwork(1), authorName: '  ' }, { ...artwork(2), title: '😀'.repeat(31) }, { ...artwork(3), snapshotToken: 'bad' }, artwork(4)];
    const q = await setup(390, { rows }); await q.ready(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true); assert.match(await q.host.locator('[data-home-status]').innerText(), /1点は表示していません/);
    await q.host.getByRole('button', { name: '次の作品', exact: true }).click(); await q.ready(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), true);
    await q.host.getByRole('button', { name: '次の作品', exact: true }).click(); await q.ready(); await checkThree(q.host); assert.equal(await q.host.locator('[data-home-approve]').isDisabled(), false); assert.equal(await q.host.locator('[data-home-post]').getAttribute('data-home-post'), uuid(4)); await q.context.close();
  });
  await logCase('login navigation guide and interrupted sign-in cannot revive session', async () => {
    const q = await setup(390, { noSession: true, delayAuth: 600 }); assert.equal(q.hits.get.length, 0); assert.equal(await q.host.locator('[data-home-post]').count(), 0);
    await q.host.locator('[data-home-login-guide]').click(); assert.equal(await q.page.locator('[data-moderation-email]').evaluate(input => document.activeElement === input), true);
    await q.page.locator('[data-moderation-email]').fill('admin@example.test'); await q.page.locator('[data-moderation-password]').fill('synthetic-password'); await q.page.locator('[data-moderation-login] button').click();
    await q.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))); await q.page.waitForTimeout(750);
    assert.equal(await q.page.evaluate(() => sessionStorage.getItem('PiXiEED:admin-supabase-session:v1')), null); assert.equal(await q.host.locator('[data-home-post]').count(), 0);
    await q.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await q.page.locator('[data-moderation-login]').waitFor(); assert.equal(q.hits.get.length, 0); assert.deepEqual(q.errors, []); await q.context.close();
  });
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; console.error(error); process.exitCode = 1; }
finally { await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve)); }
