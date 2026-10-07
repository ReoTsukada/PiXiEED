#!/usr/bin/env node
// Exercises live map picks while the event list is open; every external request is blocked.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4189';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'browser harness must target a local server');
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
const storeModule = `let posts=[];const listeners=new Set();globalThis.__replacePosts=list=>{posts=list;for(const fn of listeners)fn();};export function createSupabaseGlobeStore(){return {ready:Promise.resolve(),list:()=>posts,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};}export function createSupabaseGlobeAuth(){return {getUser:()=>null,subscribe:()=>()=>{}};}`;
const future = (id, name, prefecture) => ({ id, name, prefecture, startDate: '2099-01-01', endDate: '2099-01-01', dateLabel: '2099年1月1日', status: 'upcoming', checkedAt: '2026-10-07T00:00:00Z', sourceUrl: 'https://example.test/event' });
const past = (id, name, prefecture) => ({ id, name, prefecture, startDate: '2020-01-01', endDate: '2020-01-01', dateLabel: '2020年1月1日', status: 'ended', sourceUrl: 'https://example.test/event' });
const publicEvents = [
  ...Array.from({ length: 8 }, (_, i) => future(`a-${i}`, `A event ${i + 1}`, '北海道')),
  past('a-past', 'A past event', '北海道'),
  future('b-1', 'B event 1', '神奈川県'), future('b-2', 'B event 2', '神奈川県'),
  future('c-1', 'C event 1', '埼玉県'), future('c-2', 'C event 2', '埼玉県')
];
let catalogPayload = { version: 1, updatedAt: '2026-10-07T00:00:00Z', events: [] };
let delayNextCatalog = false;
let catalogRequestArrived;
let releaseCatalog;

async function frames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function pickPrefecture(page, code, input, { settle = true } = {}) {
  const target = await page.evaluate(async codeValue => {
    const renderer = __PIXIEED_GLOBE__;
    const canvas = document.querySelector('#globeCanvas');
    const rep = renderer.getMapCellRepresentatives().find(item => String(item.prefectureId).padStart(2, '0') === codeValue && item.center);
    if (!rep) throw new Error(`No map representative for prefecture ${codeValue}`);
    renderer.setView({ centerLongitude: rep.center.longitude, centerLatitude: rep.center.latitude, zoom: 24 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const camera = renderer.getSnapshot().camera;
    const rect = canvas.getBoundingClientRect();
    const logicalWidth = canvas.clientWidth || rect.width;
    const logicalHeight = canvas.clientHeight || rect.height;
    const scaleX = logicalWidth / rect.width;
    const scaleY = logicalHeight / rect.height;
    const panel = document.querySelector('.map-events-panel');
    let x = camera.viewport.centerX, y = camera.viewport.centerY;
    if (!panel.hidden) {
      const box = panel.getBoundingClientRect();
      const left = (box.left - rect.left) * scaleX;
      const top = (box.top - rect.top) * scaleY;
      if (x * rect.width / logicalWidth >= box.left - rect.left && x * rect.width / logicalWidth <= box.right - rect.left && y * rect.height / logicalHeight >= box.top - rect.top && y * rect.height / logicalHeight <= box.bottom - rect.top) {
        if (box.width > innerWidth * .7) y = Math.max(20, top - 28);
        else x = Math.max(20, left - 28);
      }
    }
    const mercatorY = latitude => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
    const inverseMercatorY = value => (2 * Math.atan(Math.exp(value)) - Math.PI / 2) * 180 / Math.PI;
    const centerLongitude = rep.center.longitude - (x - camera.viewport.centerX) / camera.scale * 180 / Math.PI;
    const centerMercatorY = mercatorY(rep.center.latitude) + (y - camera.viewport.centerY) / camera.scale;
    renderer.setView({ centerLongitude, centerLatitude: inverseMercatorY(centerMercatorY), zoom: 24 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const actualCamera = renderer.getSnapshot().camera;
    const actualRect = canvas.getBoundingClientRect();
    const localX = actualCamera.viewport.centerX + ((rep.center.longitude - actualCamera.centerLongitude + 540) % 360 - 180) * Math.PI / 180 * actualCamera.scale;
    const targetMercator = mercatorY(rep.center.latitude);
    const localY = actualCamera.viewport.centerY - (targetMercator - actualCamera.centerMercatorY) * actualCamera.scale;
    const picked = renderer.pickAt(localX, localY);
    return {
      x: actualRect.left + localX * actualRect.width / (canvas.clientWidth || actualRect.width),
      y: actualRect.top + localY * actualRect.height / (canvas.clientHeight || actualRect.height),
      localX, localY, expected: codeValue, picked: picked?.prefectureId || null,
      region: picked?.mapRegionId || null, label: picked?.prefectureLabel || picked?.mapRegionLabel || null
    };
  }, code);
  assert.equal(String(target.picked).padStart(2, '0'), code, `physical target resolves to requested prefecture: ${JSON.stringify(target)}`);
  if (input === 'touch') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: target.x, y: target.y, radiusX: 1, radiusY: 1, force: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.click(target.x, target.y);
  }
  if (settle) await frames(page);
  return target;
}

async function pickSea(page, input) {
  const point = await page.evaluate(async () => {
    const renderer = __PIXIEED_GLOBE__, canvas = document.querySelector('#globeCanvas');
    const longitude = 150, latitude = 0;
    renderer.setView({ centerLongitude: longitude, centerLatitude: latitude, zoom: 24 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const camera = renderer.getSnapshot().camera, rect = canvas.getBoundingClientRect();
    const panel = document.querySelector('.map-events-panel'); let x = camera.viewport.centerX, y = camera.viewport.centerY;
    if (!panel.hidden) {
      const box = panel.getBoundingClientRect();
      if (box.width > innerWidth * .7 && rect.top + y >= box.top && rect.top + y <= box.bottom) y = Math.max(20, box.top - rect.top - 28);
      else if (box.width <= innerWidth * .7 && rect.left + x >= box.left && rect.left + x <= box.right) x = Math.max(20, box.left - rect.left - 28);
    }
    const mercatorY = value => Math.log(Math.tan(Math.PI / 4 + value * Math.PI / 360));
    const inverseMercatorY = value => (2 * Math.atan(Math.exp(value)) - Math.PI / 2) * 180 / Math.PI;
    renderer.setView({ centerLongitude: longitude - (x - camera.viewport.centerX) / camera.scale * 180 / Math.PI, centerLatitude: inverseMercatorY(mercatorY(latitude) + (y - camera.viewport.centerY) / camera.scale), zoom: 24 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const current = renderer.getSnapshot().camera, r = canvas.getBoundingClientRect();
    const pointX = current.viewport.centerX + ((longitude - current.centerLongitude + 540) % 360 - 180) * Math.PI / 180 * current.scale;
    const pointY = current.viewport.centerY - (mercatorY(latitude) - current.centerMercatorY) * current.scale;
    return { x: r.left + pointX * r.width / (canvas.clientWidth || r.width), y: r.top + pointY * r.height / (canvas.clientHeight || r.height), pick: renderer.pickAt(pointX, pointY) };
  });
  assert.equal(point.pick, null, 'open-ocean test point has no selectable land cell');
  if (input === 'touch') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else await page.mouse.click(point.x, point.y);
  await frames(page);
}

try {
  for (const backend of ['gpu', 'canvas']) for (const input of ['mouse', 'touch']) {
    const viewport = input === 'touch' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const context = await browser.newContext({ viewport, hasTouch: input === 'touch', isMobile: input === 'touch', deviceScaleFactor: input === 'touch' ? 2 : 1, serviceWorkers: 'block' });
    catalogPayload = { version: 1, updatedAt: '2026-10-07T00:00:00Z', events: [] };
    delayNextCatalog = false; catalogRequestArrived = null; releaseCatalog = null;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/js/globe/post-supabase.mjs') return route.fulfill({ contentType: 'text/javascript', body: storeModule });
      if (url.pathname === '/data/pixel-art-events.json') {
        if (delayNextCatalog) {
          delayNextCatalog = false;
          catalogRequestArrived?.();
          await new Promise(resolve => { releaseCatalog = resolve; });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogPayload) });
      }
      if (url.hostname === 'script.google.com') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: publicEvents, works: [], stores: [] }) });
      if (url.origin !== new URL(base).origin) return route.abort();
      return route.continue();
    });
    await context.addInitScript(forceCanvas => {
      if (typeof WebGL2RenderingContext !== 'undefined') for (const name of ['texImage2D', 'texSubImage2D']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) { window.__selectionTextureUploads = (window.__selectionTextureUploads || 0) + 1; return original.apply(this, args); };
      }
      if (forceCanvas) { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (name, ...args) { return name === 'webgl2' ? null : original.call(this, name, ...args); }; }
    }, backend === 'canvas');
    const requests = [];
    context.on('request', request => { if (new URL(request.url()).origin === new URL(base).origin) requests.push(request.url()); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${backend}/${input}: ${error.message}`));
    try {
      await page.goto(`${base}/globe-prototype.html?embed=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => globalThis.__PIXIEED_MAP_EVENTS__ && globalThis.__PIXIEED_POSTS__);
      await page.evaluate(() => __PIXIEED_MAP_EVENTS__.ready);
      await frames(page);
      assert.equal(await page.evaluate(() => __PIXIEED_MAP_EVENTS__.getEvents().length), publicEvents.length);
      const baselineRequests = requests.length;
      const posts = ['北海道', '神奈川県', '埼玉県'].map((prefecture, i) => ({ id: `post-${i}`, title: `Post ${i}`, pin: { latitude: [43.06, 35.45, 35.9][i], longitude: [141.35, 139.65, 139.65][i] }, image: { dataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/%3E', width: 2, height: 2 }, author: { id: 'fixture', name: 'Fixture' } }));
      await page.evaluate(items => __replacePosts(items), posts);
      await page.locator('[data-map-content="events"]').click();
      await frames(page);
      await page.locator('.map-events-dock__all').click();
      assert.equal(await page.locator('.map-events-panel').isVisible(), true);
      assert.equal(await page.locator('.map-events-panel__close').evaluate(el => document.activeElement === el), true, 'opening the panel focuses its close button');

      // Rapid actual taps on three distinct prefectures in one camera view.
      const triplet = await page.evaluate(async () => {
        const renderer = __PIXIEED_GLOBE__, canvas = document.querySelector('#globeCanvas'), panel = document.querySelector('.map-events-panel');
        const codes = ['13', '14', '11'];
        const reps = codes.map(code => renderer.getMapCellRepresentatives().find(item => String(item.prefectureId).padStart(2, '0') === code && item.center));
        if (reps.some(item => !item)) throw new Error('Missing Tokyo/Kanagawa/Saitama representative');
        const longitude = reps.reduce((sum, item) => sum + item.center.longitude, 0) / reps.length;
        const latitude = reps.reduce((sum, item) => sum + item.center.latitude, 0) / reps.length;
        const mercatorY = value => Math.log(Math.tan(Math.PI / 4 + value * Math.PI / 360));
        const inverseMercatorY = value => (2 * Math.atan(Math.exp(value)) - Math.PI / 2) * 180 / Math.PI;
        let result = null;
        for (const zoom of [24, 22, 20, 18, 16]) {
          renderer.setView({ centerLongitude: longitude, centerLatitude: latitude, zoom });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const camera = renderer.getSnapshot().camera, rect = canvas.getBoundingClientRect();
          const logicalWidth = canvas.clientWidth || rect.width, logicalHeight = canvas.clientHeight || rect.height;
          const panelBox = panel.getBoundingClientRect();
          const safe = { left: rect.left + 8, right: rect.right - 8, top: rect.top + 8, bottom: rect.bottom - 8 };
          if (panelBox.width > innerWidth * .7) safe.bottom = Math.min(safe.bottom, panelBox.top - 8);
          else safe.right = Math.min(safe.right, panelBox.left - 8);
          if (safe.right <= safe.left || safe.bottom <= safe.top) continue;
          const x = ((safe.left + safe.right) / 2 - rect.left) * logicalWidth / rect.width;
          const y = ((safe.top + safe.bottom) / 2 - rect.top) * logicalHeight / rect.height;
          renderer.setView({ centerLongitude: longitude - (x - camera.viewport.centerX) / camera.scale * 180 / Math.PI, centerLatitude: inverseMercatorY(mercatorY(latitude) + (y - camera.viewport.centerY) / camera.scale), zoom });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const current = renderer.getSnapshot().camera, r = canvas.getBoundingClientRect();
          const points = reps.map((item, index) => {
            const px = current.viewport.centerX + ((item.center.longitude - current.centerLongitude + 540) % 360 - 180) * Math.PI / 180 * current.scale;
            const py = current.viewport.centerY - (mercatorY(item.center.latitude) - current.centerMercatorY) * current.scale;
            const cssX = r.left + px * r.width / logicalWidth, cssY = r.top + py * r.height / logicalHeight;
            const picked = renderer.pickAt(px, py), hit = document.elementFromPoint(cssX, cssY);
            return { code: codes[index], picked: picked?.prefectureId || null, x: cssX, y: cssY, hit: hit?.id || hit?.className || hit?.tagName || null };
          });
          if (points.every(point => point.picked && point.x >= safe.left && point.x <= safe.right && point.y >= safe.top && point.y <= safe.bottom && point.hit === 'globeCanvas')) { result = points; break; }
        }
        if (!result) throw new Error(`Could not fit all triplet picks in the exposed canvas: ${JSON.stringify({ codes, viewport: renderer.getSnapshot().camera.viewport, panel: panel.getBoundingClientRect().toJSON() })}`);
        return result;
      });
      assert.deepEqual(triplet.map(item => String(item.picked).padStart(2, '0')), ['13', '14', '11'], `${backend}/${input}: triplet targets are distinct: ${JSON.stringify(triplet)}`);
      assert.ok(triplet.every(point => point.hit === 'globeCanvas'), `${backend}/${input}: triplet taps hit the exposed canvas: ${JSON.stringify(triplet)}`);
      for (const point of triplet) {
        if (input === 'touch') {
          const session = await context.newCDPSession(page);
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1 }] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await session.detach();
        } else await page.mouse.click(point.x, point.y);
      }
      await frames(page);
      const rapidSelection = await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().selected?.prefectureId || null);
      assert.equal(rapidSelection, '11', `${backend}/${input}: rapid A→B→C picks leave the renderer on C; targets=${JSON.stringify(triplet)}, selected=${rapidSelection}`);
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /埼玉県のイベント/);
      assert.deepEqual(await page.locator('.map-event-card h3').allTextContents(), ['C event 1', 'C event 2'], 'rapid picks leave cards scoped to C');
      const focusAfterRapidPicks = await page.evaluate(() => document.activeElement.id === 'globeCanvas' ? 'canvas' : document.activeElement.classList.contains('map-events-panel__close') ? 'close' : 'other');
      if (input === 'mouse') assert.equal(focusAfterRapidPicks, 'canvas', 'mouse map picks naturally focus the canvas without stealing focus to a panel control');
      else assert.ok(['canvas', 'close'].includes(focusAfterRapidPicks), 'touch map picks do not focus an unexpected control');
      assert.equal(requests.length, baselineRequests, 'map picks do not trigger new network requests');

      // A → B → C was deliberately completed without camera movement or per-pick assertions.
      await page.locator('.map-events-panel__filters [data-event-period="all"]').click();
      await pickPrefecture(page, '01', input);
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /北海道のイベント/);
      assert.equal(await page.locator('.map-event-card').count(), 9, 'all filter includes A future and past events');
      await page.locator('.map-events-panel__filters [data-event-period="future"]').click();
      assert.equal(await page.locator('.map-events-panel__filters [data-event-period="future"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.map-event-card').count(), 8);
      await page.locator('.map-events-panel').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await frames(page);
      const sameScopeScroll = await page.locator('.map-events-panel').evaluate(el => el.scrollTop);
      await pickPrefecture(page, '01', input);
      assert.equal(await page.locator('.map-events-panel').evaluate(el => el.scrollTop), sameScopeScroll, 'repicking the same region preserves panel scroll');
      assert.equal(await page.locator('.map-events-panel__filters [data-event-period="future"]').getAttribute('aria-pressed'), 'true', 'scope updates preserve period filter');
      assert.equal(await page.locator('.map-event-card').count(), 8);
      await pickPrefecture(page, '14', input);
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /神奈川県のイベント/);
      assert.equal(await page.locator('.map-events-panel').evaluate(el => el.scrollTop), 0, 'a changed scope resets panel scroll');
      assert.deepEqual(await page.locator('.map-event-card h3').allTextContents(), ['B event 1', 'B event 2']);

      // A delayed catalog replacement must repaint the current C scope, not restore a stale or global scope.
      await page.locator('.map-events-panel__filters [data-event-period="all"]').click();
      const catalogArrived = new Promise(resolve => { catalogRequestArrived = resolve; });
      delayNextCatalog = true;
      const refresh = page.evaluate(() => __PIXIEED_MAP_EVENTS__.refreshData());
      await catalogArrived;
      await pickPrefecture(page, '11', input);
      catalogPayload = { version: 1, updatedAt: '2026-10-07T00:01:00Z', events: [future('c-refresh', 'C refreshed event', '埼玉県'), future('b-refresh', 'B refreshed event', '神奈川県')] };
      releaseCatalog();
      await refresh;
      await frames(page);
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /埼玉県のイベント/);
      assert.deepEqual(await page.locator('.map-event-card h3').allTextContents(), ['C event 1', 'C event 2', 'C refreshed event'], 'late refresh adds current-scope content without changing scope');

      // An eventless region replaces stale cards with its own empty state.
      await page.locator('.map-events-panel__all').click();
      await pickPrefecture(page, '46', input);
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /鹿児島県のイベント · 0件/);
      assert.match(await page.locator('.map-events-panel').textContent(), /この地域の公開イベントはありません/);
      assert.equal(await page.locator('.map-event-card').count(), 0);

      // Closing keeps the existing source focus contract; picks while closed never reopen the panel.
      await page.locator('.map-events-panel__close').click();
      assert.equal(await page.locator('.map-events-panel').isVisible(), false);
      await pickPrefecture(page, '11', input);
      assert.equal(await page.locator('.map-events-panel').isVisible(), false, 'hidden panel stays hidden after a map pick');
      await page.locator('#viewCellPosts').click();
      assert.match(await page.locator('.map-events-panel__head h2').textContent(), /埼玉県のイベント/);
      await page.locator('.map-events-panel__close').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'viewCellPosts', 'region action focus is restored after close');

      // Open from the dock, pick, then close: fallback avoids focusing a dock button hidden by has-selection.
      await page.locator('#clearCellSelection').click();
      await page.locator('.map-events-dock__all').click();
      await pickPrefecture(page, '01', input);
      await page.locator('.map-events-panel__close').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'viewCellPosts', 'dock focus falls back to the visible selected-region action');

      // Sea returns null and closes the stale regional list without restoring focus to a hidden control.
      await page.locator('#clearCellSelection').click();
      await page.locator('.map-events-dock__all').click();
      await pickPrefecture(page, '01', input);
      await pickSea(page, input);
      assert.equal(await page.locator('.map-events-panel').isVisible(), false, 'null map pick closes the event panel');
      assert.equal(await page.locator('.map-event-card:visible').count(), 0, 'null pick hides stale regional cards with the closed panel');
      assert.equal(await page.evaluate(() => __PIXIEED_GLOBE__.getSnapshot().selected), null, 'sea selection clears renderer identity');

      // Returning to posts closes the event panel and leaves the ordinary post layer available.
      await page.locator('[data-map-content="posts"]').click();
      assert.equal(await page.locator('.map-events-panel').isVisible(), false);
      assert.equal(await page.locator('.post-dock').isVisible(), true);
      assert.equal(await page.locator('.time-capsule,[data-astro-view],.orrery-canvas,.scope-hud').count(), 0, 'map does not start telescope controls');
      assert.equal(await page.evaluate(() => Boolean(globalThis.__PIXIEED_ASTRO__)), false, 'ordinary map pick testing does not initialize astronomy');
      assert.equal(await page.evaluate(() => __PIXIEED_POSTS__.getPosts().length), 3, 'fixture posts remain available');

      assert.equal(requests.length, baselineRequests + 1, 'the sole request since baseline was the explicit delayed catalog refresh');
      const telescope = await context.newPage();
      await telescope.goto(`${base}/globe-prototype.html?embed=1&tool=telescope`, { waitUntil: 'domcontentloaded' });
      await telescope.waitForFunction(() => globalThis.__PIXIEED_GLOBE__);
      assert.equal(await telescope.evaluate(() => Boolean(globalThis.__PIXIEED_MAP_EVENTS__)), false, 'standalone telescope does not initialize event selection UI');
      assert.equal(await telescope.locator('.map-events-panel').count(), 0);
      await telescope.close();
      checks.push(`${backend}/${input}: rapid Tokyo→Kanagawa→Saitama physical picks; scoped cards/renderer match; filter and same-region scroll persist; changed scope resets scroll; late catalog update preserves scope; eventless and sea/null handling; closed panel remains closed; focus, posts and telescope behavior`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks }, null, 2));
} finally { await browser.close(); }
