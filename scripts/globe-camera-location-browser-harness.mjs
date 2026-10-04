#!/usr/bin/env node
/** Browser regression for geolocated camera handoff and fail-closed posting. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only a local PiXiEED server is allowed');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
const fixturePath = '/__globe-camera-location-fixture.html';
const fixture = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/globe-prototype.css"></head><body><main id="globeStage" class="globe-stage" style="position:relative;width:100vw;height:100vh"></main><script type="module">
import { initPostUi } from '/js/globe/post-ui.mjs?rev=20261004-camera-location-1';
import { createGlobeCamera, lookupCell } from '/js/globe/geometry.mjs';
import { pendingHandoff, openHandoffComposer, CAMERA_HANDOFF_KEY } from '/js/globe/post-handoff.mjs';
import { buildGlobePostPayload } from '/js/globe/post-supabase.mjs';
const stage = document.querySelector('#globeStage');
const view = { centerLongitude: 139.69, centerLatitude: 35.68, zoom: 1, zoomRange: { min: .25, max: 24 } };
const renderer = { getSnapshot() { return { view, camera: createGlobeCamera({ viewport: { width: innerWidth, height: innerHeight, dpr: 1 }, ...view }) }; }, setView(next) { Object.assign(view, next); } };
window.__addedPosts = [];
const store = { ready: Promise.resolve(), list: () => window.__addedPosts, subscribe: () => () => {}, async add(post) { window.__addedPosts.push(structuredClone(post)); return { ...post, id: 'browser-fixture', status: 'published' }; } };
const auth = { getUser: () => ({ id: 'fixture-user', name: '検証' }), subscribe: () => () => {} };
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
const ctx = canvas.getContext('2d'); ctx.fillStyle = '#234567'; ctx.fillRect(0, 0, 8, 16); ctx.fillStyle = '#dc8420'; ctx.fillRect(8, 0, 8, 16);
localStorage.setItem(CAMERA_HANDOFF_KEY, JSON.stringify({ source: 'pixel-camera', dataUrl: canvas.toDataURL('image/png'), createdAt: Date.now() }));
window.__postUi = initPostUi({ renderer, stage, store, auth });
window.__cellAt = (latitude, longitude) => lookupCell(longitude, latitude);
window.__payloadForLastPost = () => buildGlobePostPayload(window.__addedPosts.at(-1));
if (new URLSearchParams(location.search).has('seed-pin')) window.__postUi.setPin({ latitude: 40, longitude: -73, source: 'cell' });
const handoff = pendingHandoff(); if (!handoff || !openHandoffComposer(handoff, window.__postUi)) throw new Error('camera handoff did not open');
</script></body></html>`;

async function newFixture(viewport, { geolocation = 'grant', delayed = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true });
  if (geolocation === 'grant') {
    await context.grantPermissions(['geolocation'], { origin });
    await context.setGeolocation({ latitude: 35.6895123, longitude: 139.6917654, accuracy: 2 });
  } else if (geolocation === 'deny') await context.grantPermissions([], { origin });
  if (geolocation === 'unsupported') await context.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined }));
  if (delayed) await context.addInitScript(() => {
    const callbacks = [];
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure, options) { callbacks.push({ success, failure, options }); }, __callbacks: callbacks } });
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === fixturePath) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`${base}${fixturePath}?from=pixel-camera${geolocation === 'timeout' ? '&seed-pin=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.composer').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-art-image]')?.getAttribute('src')?.startsWith('data:image/png'), null, { timeout: 10000 });
  return { context, page };
}

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { context, page } = await newFixture(viewport);
    try {
      await page.waitForFunction(() => document.querySelector('[data-smart-status]')?.dataset.state === 'ok', null, { timeout: 10000 });
      const actual = { latitude: 35.6895123, longitude: 139.6917654 };
      const state = await page.evaluate(() => window.__postUi.getState());
      assert.equal(state.pin.latitude, actual.latitude, 'exact granted latitude drives the draft pin');
      assert.equal(state.pin.longitude, actual.longitude, 'exact granted longitude drives the draft pin');
      const expectedCell = await page.evaluate((point) => window.__cellAt(point.latitude, point.longitude).id, actual);
      assert.equal(state.pin.cellId, expectedCell, 'draft cell is looked up from the granted position');
      const placeControls = page.locator('.composer [data-place-actions], .composer .place__actions');
      await placeControls.scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.composer [data-geolocate]').isVisible(), true, 'current-location action remains reachable');
      assert.equal(await page.locator('.composer [data-pick-globe]').isVisible(), viewport.width <= 680, 'globe placement action follows the responsive design');
      const hiddenPuzzle = await page.locator('.composer [data-puzzle-panel]').evaluate((node) => ({ hidden: node.hidden, display: getComputedStyle(node).display }));
      assert.equal(hiddenPuzzle.hidden, true, 'puzzle-only panel stays hidden for a camera post');
      assert.equal(hiddenPuzzle.display, 'none', 'hidden puzzle panel takes no layout space');
      const sheet = page.locator('.composer');
      assert.ok(await sheet.evaluate((node) => node.scrollHeight >= node.clientHeight), 'composer content is scrollable when it exceeds the sheet');
      await page.locator('.composer [data-submit]').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.composer [data-submit]').isVisible(), true, 'submit action remains reachable at the end of the composer');
      const submitRect = await page.locator('.composer [data-submit]').evaluate((node) => node.getBoundingClientRect().toJSON());
      const sheetRect = await sheet.evaluate((node) => node.getBoundingClientRect().toJSON());
      assert.ok(submitRect.top >= sheetRect.top && submitRect.bottom <= sheetRect.bottom, 'submit control stays within the composer sheet');
      checks.push({ name: `location controls, scrolling, and hidden puzzle panel (${viewport.width}x${viewport.height})`, pass: true });
      assert.equal(await page.locator('[data-submit]').isDisabled(), true, 'location and image alone do not bypass required title');
      await page.locator('[data-title]').fill(`現在地の作品 ${viewport.width}`);
      assert.equal(await page.locator('[data-submit]').isDisabled(), false, 'camera handoff becomes ready after a title is entered');
      await page.locator('[data-submit]').click();
      await page.waitForFunction(() => document.querySelector('[data-done]')?.hidden === false, null, { timeout: 10000 });
      const posted = await page.evaluate(() => ({ record: window.__addedPosts[0], payload: window.__payloadForLastPost() }));
      assert.equal(posted.record.pin.cellId, expectedCell, 'final store record preserves the current-position cell');
      assert.deepEqual(posted.payload.location.globeCell.id, expectedCell, 'wire payload resolves the same cell');
      assert.equal('latitude' in posted.payload.location, false, 'exact latitude is excluded from public payload');
      assert.equal('longitude' in posted.payload.location, false, 'exact longitude is excluded from public payload');
      checks.push({ name: `granted geolocation → current cell → cell-only payload (${viewport.width}x${viewport.height})`, pass: true, cellId: expectedCell });
    } finally { await context.close(); }
  }

  {
    const { context, page } = await newFixture({ width: 390, height: 844 }, { geolocation: 'deny' });
    try {
      await page.waitForFunction(() => document.querySelector('[data-smart-status]')?.dataset.state === 'error', null, { timeout: 10000 });
      assert.equal((await page.evaluate(() => window.__postUi.getState())).pin, null, 'denied location leaves no fallback pin');
      assert.equal(await page.locator('[data-submit]').isDisabled(), true, 'denied location cannot be posted to a default cell');
      assert.match(await page.locator('[data-smart-status]').textContent(), /現在地|許可/);
      checks.push({ name: 'denied geolocation leaves post unplaced and disabled', pass: true });
    } finally { await context.close(); }
  }

  {
    const { context, page } = await newFixture({ width: 390, height: 844 }, { geolocation: 'unsupported' });
    try {
      await page.waitForFunction(() => document.querySelector('[data-smart-status]')?.dataset.state === 'error', null, { timeout: 10000 });
      assert.equal((await page.evaluate(() => window.__postUi.getState())).pin, null, 'unsupported geolocation leaves no fallback pin');
      assert.equal(await page.locator('[data-submit]').isDisabled(), true, 'unsupported geolocation cannot be posted to a default cell');
      assert.match(await page.locator('[data-smart-status]').textContent(), /使えません|現在地/);
      checks.push({ name: 'unsupported geolocation leaves post unplaced and disabled', pass: true });
    } finally { await context.close(); }
  }

  {
    const { context, page } = await newFixture({ width: 390, height: 844 }, { delayed: true, geolocation: 'timeout' });
    try {
      await page.waitForFunction(() => navigator.geolocation.__callbacks.length === 1, null, { timeout: 10000 });
      assert.equal((await page.evaluate(() => window.__postUi.getState())).pin, null, 'camera handoff cleared its previous pin before requesting location');
      await page.evaluate(() => navigator.geolocation.__callbacks[0].failure({ code: 3 }));
      await page.waitForFunction(() => document.querySelector('[data-smart-status]')?.dataset.state === 'error', null, { timeout: 5000 });
      assert.equal((await page.evaluate(() => window.__postUi.getState())).pin, null, 'timeout leaves no previous or fallback pin');
      assert.equal(await page.locator('[data-submit]').isDisabled(), true, 'timeout keeps submit disabled');
      await page.locator('.composer [data-geolocate]').scrollIntoViewIfNeeded();
      await page.locator('.composer [data-geolocate]').click();
      await page.waitForFunction(() => navigator.geolocation.__callbacks.length === 2);
      await page.evaluate(() => navigator.geolocation.__callbacks[1].success({ coords: { latitude: 35.6895123, longitude: 139.6917654 } }));
      await page.waitForFunction(() => document.querySelector('[data-smart-status]')?.dataset.state === 'ok');
      const state = await page.evaluate(() => window.__postUi.getState());
      assert.equal(state.pin.latitude, 35.6895123, 'retry accepts the granted latitude');
      assert.equal(state.pin.longitude, 139.6917654, 'retry accepts the granted longitude');
      checks.push({ name: 'timeout clears old pin and retry can succeed', pass: true });
    } finally { await context.close(); }
  }

  {
    const { context, page } = await newFixture({ width: 390, height: 844 }, { delayed: true });
    try {
      await page.waitForFunction(() => navigator.geolocation.__callbacks.length === 1, null, { timeout: 10000 });
      await page.evaluate(() => window.__postUi.setPin({ latitude: 40, longitude: -73, source: 'cell' }));
      await page.evaluate(() => navigator.geolocation.__callbacks[0].success({ coords: { latitude: 35.6895123, longitude: 139.6917654 } }));
      await page.waitForTimeout(100);
      let state = await page.evaluate(() => window.__postUi.getState());
      assert.equal(state.pin.latitude, 40, 'a later location response cannot replace a user-selected pin');
      assert.equal(state.pin.longitude, -73, 'a later location response cannot replace a user-selected pin');
      await page.locator('.composer [data-geolocate]').scrollIntoViewIfNeeded();
      await page.locator('.composer [data-geolocate]').click();
      await page.waitForFunction(() => navigator.geolocation.__callbacks.length === 2);
      await page.locator('.composer [data-close]').click();
      await page.evaluate(() => navigator.geolocation.__callbacks.at(-1).success({ coords: { latitude: 1, longitude: 2 } }));
      state = await page.evaluate(() => window.__postUi.getState());
      assert.equal(state.pin.latitude, 40, 'closing the composer does not permit a late response to alter its pin');
      checks.push({ name: 'late location callback preserves manually selected pin', pass: true });
    } finally { await context.close(); }
  }

  assert.deepEqual(errors, [], `browser page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ status: 'PASS', checks }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', checks, error: error?.stack || String(error), pageErrors: errors }, null, 2));
  process.exitCode = 1;
} finally { await browser.close(); }
