#!/usr/bin/env node
/**
 * Local-only gallery-first entry regression and cold-navigation comparison.
 * No external requests, real user data, camera, or publication is involved.
 * Configure PIXIEED_GALLERY_BASE_URL, PIXIEED_GALLERY_BASELINE_URL, and PIXIEED_GALLERY_OUTPUT.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_GALLERY_BASE_URL || 'http://127.0.0.1:4173';
const baseline = process.env.PIXIEED_GALLERY_BASELINE_URL || '';
const output = process.env.PIXIEED_GALLERY_OUTPUT || '/tmp/pixieed-gallery-first-entry';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const executablePath = process.env.PIXIEED_CHROME_EXECUTABLE;
const allowed = value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname);
assert.ok(allowed(base), 'gallery target must be localhost/127.0.0.1');
if (baseline) assert.ok(allowed(baseline), 'baseline target must be localhost/127.0.0.1');
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const report = {
  startedAt: new Date().toISOString(), browser: browser.version(), base, baseline: baseline || null,
  viewport: { width: 390, height: 844 }, samplesPerBuild: 5,
  cases: [], benchmarks: [], errors: [], blockedExternalReads: [], blockedWrites: [], limitations: [
    'Loopback Chromium with fresh isolated contexts and synthetic saved artwork only.',
    'Chooser-first actionable time and old editor-ready time are different user states; they are labeled separately and are not a like-for-like drawing-readiness claim.',
    'Encoded transfer and decoded JavaScript are local browser-resource measurements, not production network or device results.',
    'Physical camera, microphone, Safari, real user storage, and production are untested.'
  ]
};
const origin = value => new URL(value).origin;
const ensureLocal = url => {
  const u = new URL(url);
    if (u.origin !== origin(base) && u.origin !== origin(baseline || base)) throw new Error(`Blocked non-local origin: ${u.origin}`);
};

function installStorageReadProbe(context) {
  return context.addInitScript(() => {
    window.__galleryProjectReads = [];
    window.__galleryMediaRequests = 0;
    const media = navigator.mediaDevices;
    if (media?.getUserMedia) Object.defineProperty(media, 'getUserMedia', {
      configurable: true, value: async () => { window.__galleryMediaRequests++; throw new DOMException('Synthetic harness disables camera/microphone', 'NotAllowedError'); }
    });
    const proto = IDBObjectStore.prototype;
    for (const method of ['get', 'getKey', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor']) {
      const native = proto[method];
      if (typeof native !== 'function') continue;
      proto[method] = function (...args) {
        const db = this.transaction?.db?.name || '';
        const store = this.name || '';
        if (db === 'pixieed-pxd-v1' && store === 'projects') window.__galleryProjectReads.push({ method, store, at: performance.now() });
        if (db === 'pixieed-pxd-v1' && store === 'project-catalog' && method === 'getAll' && localStorage.getItem('__galleryFailCatalogOnce') === '1') {
          localStorage.removeItem('__galleryFailCatalogOnce');
          throw new DOMException('Synthetic one-shot catalog read failure', 'UnknownError');
        }
        return native.apply(this, args);
      };
    }
  });
}

async function newContext(target, galleryCssMode = 'normal') {
  const context = await browser.newContext({ viewport: report.viewport, serviceWorkers: 'block', acceptDownloads: false });
  await installStorageReadProbe(context);
  const requests = new Map();
  let cssSeen = false, releaseCss;
  const cssRequested = new Promise(resolve => { releaseCss = resolve; });
  let releaseHeldCss;
  const heldCss = new Promise(resolve => { releaseHeldCss = resolve; });
  await context.route('**/*', async route => {
    const req = route.request(), url = req.url();
    try { ensureLocal(url); } catch { report.blockedExternalReads.push(`${req.method()} ${url}`); return route.abort(); }
    if (!['GET', 'HEAD'].includes(req.method())) { report.blockedWrites.push(`${req.method()} ${url}`); return route.abort(); }
    const parsed = new URL(url);
    if (parsed.pathname === '/css/project-workspace.css' && parsed.searchParams.get('rev')?.includes('gallery-first')) {
      releaseCss();
      if (galleryCssMode === 'slow' && !cssSeen) { cssSeen = true; await heldCss; }
      if (galleryCssMode === 'fail-once' && !cssSeen) { cssSeen = true; return route.abort(); }
    }
    return route.continue();
  });
  context.on('page', page => {
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { url: event.request.url, method: event.request.method, type: event.type, bytes: 0, status: null }));
  cdp.on('Network.responseReceived', event => { const row = requests.get(event.requestId); if (row) row.status = event.response.status; });
  cdp.on('Network.loadingFinished', event => { const row = requests.get(event.requestId); if (row) row.bytes = event.encodedDataLength; });
  return { context, page, cdp, requests, target, cssRequested, releaseCss: releaseHeldCss };
}

async function findFrame(page, predicate) {
  for (const frame of [...page.frames()].reverse()) {
    try { if (await frame.evaluate(predicate)) return frame; } catch {}
  }
  return null;
}
async function findLocator(page, selector) {
  for (const frame of [...page.frames()].reverse()) {
    try { if (await frame.locator(selector).count()) return frame.locator(selector); } catch {}
  }
  throw new Error(`Selector not found in page or frames: ${selector}`);
}
async function waitSelector(page, selector, state = 'visible') {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    for (const frame of [...page.frames()].reverse()) {
      try { const node = frame.locator(selector); if (await node.count() && (state !== 'visible' || await node.isVisible())) return node; } catch {}
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for ${state} selector ${selector}`);
}
async function surfaceFrame(page) {
  return await findFrame(page, () => Boolean(document.querySelector('#project-start-picker')))
    || await hasRuntime(page) || page.mainFrame();
}
async function surfaceEvaluate(page, fn, ...args) { return (await surfaceFrame(page)).evaluate(fn, ...args); }
async function resetProjectReadProbe(page) { await Promise.all(page.frames().map(frame => frame.evaluate(() => { window.__galleryProjectReads = []; }).catch(() => {}))); }
async function readProjectReadCount(page) {
  const counts = await Promise.all(page.frames().map(frame => frame.evaluate(() => window.__galleryProjectReads?.length ?? 0).catch(() => 0)));
  return counts.reduce((sum, count) => sum + count, 0);
}
async function pageResourceStats(page) {
  const all = await Promise.all(page.frames().map(frame => frame.evaluate(() => {
    const scripts = performance.getEntriesByType('resource').filter(row => /\.m?js(?:\?|$)/.test(new URL(row.name).pathname));
    return { decodedScriptBytes: scripts.reduce((sum, row) => sum + (row.decodedBodySize || 0), 0), resourceScriptCount: scripts.length };
  }).catch(() => ({ decodedScriptBytes: 0, resourceScriptCount: 0 }))));
  return all.reduce((total, item) => ({ decodedScriptBytes: total.decodedScriptBytes + item.decodedScriptBytes, resourceScriptCount: total.resourceScriptCount + item.resourceScriptCount }), { decodedScriptBytes: 0, resourceScriptCount: 0 });
}
const hasRuntime = page => findFrame(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime?.state?.ready
  && !document.querySelector('#main')?.inert
  && !document.documentElement.hasAttribute('data-direct-loading')
  && document.documentElement.dataset.directLoading !== 'true'
  && !document.body.hasAttribute('data-creation-transition')
  && document.body.dataset.modeSwitching !== 'true'));
async function runtimeReady(page) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await hasRuntime(page)) return; await page.waitForTimeout(50); }
  throw new Error('Timed out waiting for editor runtime ready in page or iframe');
}
async function isChooserVisible(page) { try { return Boolean(await waitSelector(page, '#project-start-picker', 'visible')); } catch { return false; } }
async function clickNew(page) { await (await waitSelector(page, '#project-start-new')).click(); await runtimeReady(page); }
const runtimeInfo = async page => {
  const frame = await hasRuntime(page); if (!frame) return null;
  return frame.evaluate(async () => {
  const host = window.__PIXIEED_CREATION_HOST__, runtime = host?.runtime;
  if (!runtime) return null;
  const workspace = runtime.draw?.workspace;
  const state = await runtime.getState?.();
  return {
    mode: runtime.state?.mode ?? document.body.dataset.creationMode ?? null,
    ready: Boolean(runtime.state?.ready),
    projectId: workspace?.currentProject?.projectId ?? null,
    revisionId: workspace?.persistedProject?.revisionId ?? null,
    persisted: workspace?.persisted ?? null,
    dirty: workspace?.dirty ?? null,
    imageHash: state?.image?.hash ?? null
  };
  });
};
async function saveSynthetic(page, x = 4, y = 5) {
  const canvas = await waitSelector(page, '#draw-canvas');
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  const dims = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
  await page.mouse.click(box.x + (x + .5) * box.width / dims.width, box.y + (y + .5) * box.height / dims.height);
  const frame = await hasRuntime(page);
  assert.ok(frame, 'editor should be interactive before drawing');
  await frame.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace?.dirty === true);
  await frame.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save());
  await frame.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace?.persisted === true && !window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.busy);
  const result = await runtimeInfo(page);
  assert.ok(result.projectId && result.revisionId && result.imageHash, 'synthetic save should have project identity and pixels');
  return result;
}
async function getProjectRecordCount(page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some(db => db.name === 'pixieed-pxd-v1')) return 0;
    const req = indexedDB.open('pixieed-pxd-v1');
    const db = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction('projects'); const count = tx.objectStore('projects').count(); count.onsuccess = () => resolve(count.result); count.onerror = () => reject(count.error); }); }
    finally { db.close(); }
  });
}
async function seed(target, build) {
  const env = await newContext(target), { page } = env;
  await page.goto(target + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
  if (build === 'gallery') {
    await waitSelector(page, '#project-start-picker');
    assert.equal(await surfaceEvaluate(page, () => window.__PIXIEED_CREATION_HOST__?.runtime ?? null), null, 'no editor runtime before explicit New');
    await clickNew(page);
  } else await runtimeReady(page);
  const saved = await saveSynthetic(page);
  return { ...env, saved };
}

function collectNetwork(requests) {
  const list = [...requests.values()].filter(row => row.status !== null);
  const same = list.filter(row => [origin(base), origin(baseline || base)].includes(origin(row.url)));
  const scripts = same.filter(row => row.type === 'Script' || /\.m?js(?:\?|$)/.test(new URL(row.url).pathname));
  return { requestCount: same.length, encodedTransferBytes: same.reduce((sum, row) => sum + row.bytes, 0),
    scriptRequestCount: scripts.length, scriptEncodedBytes: scripts.reduce((sum, row) => sum + row.bytes, 0),
    editorHtmlRequests: same.filter(row => /\/editor\.html(?:\?|$)/.test(row.url)).length,
    runtimeRequests: same.filter(row => /creation-runtime/.test(row.url)).length };
}
async function navigationMetrics(env, build) {
  const { page, requests } = env; requests.clear();
  await env.cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await resetProjectReadProbe(page);
  const url = env.target + '/tools/start/draw/';
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (build === 'gallery') await waitSelector(page, '#project-start-picker');
  else await runtimeReady(page);
  if (build === 'gallery') await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
  const actionable = await page.evaluate(() => performance.now());
  const readsBeforeChoice = await readProjectReadCount(page);
  const chooserBeforeChoice = build === 'gallery' ? await isChooserVisible(page) : false;
  const runtimeBeforeChoice = await surfaceEvaluate(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime));
  const mediaBeforeChoice = await surfaceEvaluate(page, () => window.__galleryMediaRequests ?? -1);
  const beforeNetwork = collectNetwork(requests);
  const beforeResources = await pageResourceStats(page);
  let editorReadyMs = null;
  if (build === 'gallery') {
    const choiceStarted = Date.now();
    const tile = await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    await tile.waitFor({ state: 'visible' });
    await tile.click();
    await runtimeReady(page);
    editorReadyMs = Date.now() - choiceStarted;
  }
  const resourceStats = await pageResourceStats(page);
  const afterNetwork = collectNetwork(requests);
  const runtime = await runtimeInfo(page);
  return { build, actionableState: build === 'gallery' ? 'gallery chooser visible' : 'editor ready',
    syntheticFixturePixelHash: env.saved.imageHash,
    actionableMs: actionable, editorReadyAfterChoiceMs: editorReadyMs,
    chooserBeforeChoice, runtimeBeforeChoice, projectReadCallsBeforeChoice: readsBeforeChoice,
    mediaRequestsBeforeChoice: mediaBeforeChoice, ...beforeNetwork,
    decodedScriptBytesBeforeChoice: beforeResources.decodedScriptBytes,
    scriptRequestCountBeforeChoice: beforeResources.resourceScriptCount,
    afterChoiceRequestCount: afterNetwork.requestCount,
    afterChoiceEncodedTransferBytes: afterNetwork.encodedTransferBytes,
    afterChoiceDecodedScriptBytes: resourceStats.decodedScriptBytes,
    afterChoiceRuntimeRequests: afterNetwork.runtimeRequests,
    chosenProjectId: runtime?.projectId ?? null, chosenRevisionId: runtime?.revisionId ?? null };
}

async function runNewBuildRegressions() {
  const env = await seed(base, 'gallery');
  const { page } = env;
  try {
    // Clean entry after a saved project: display metadata only; defer PXD bytes and editor runtime.
    await resetProjectReadProbe(page);
    await page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
    await waitSelector(page, '#project-start-picker');
    await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    const pre = { reads: await readProjectReadCount(page), runtime: Boolean(await findFrame(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime))), chooser: await isChooserVisible(page), catalog: await (await findLocator(page, '.project-gallery__tile[data-project-id]')).count() };
    assert.equal(pre.reads, 0, 'must not read project bytes before selection');
    assert.equal(pre.runtime, false, 'must not load editor runtime before selection');
    assert.ok(pre.catalog >= 1, 'saved metadata should populate gallery');
    report.cases.push({ name: 'saved-metadata-no-project-read-before-choice', ...pre });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: join(output, `gallery-saved-${width}.png`), fullPage: true });
    }
    const tile = await findLocator(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    const title = await tile.getAttribute('title');
    const search = await findLocator(page, '#project-start-search');
    await search.fill(title.slice(0, Math.min(3, title.length)));
    await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    assert.equal(await (await findLocator(page, '.project-gallery__tile[data-project-id]')).count(), 1);
    await search.fill('no-such-synthetic-title');
    await page.waitForTimeout(50);
    assert.equal(await surfaceEvaluate(page, () => document.querySelectorAll('.project-gallery__tile[data-project-id]').length), 0);
    await search.fill('');
    await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    await page.waitForTimeout(120);
    const keyboardTile = await findLocator(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    await keyboardTile.evaluate(element => element.focus()); await page.keyboard.press('Space');
    await runtimeReady(page);
    const keyboardOpened = await runtimeInfo(page);
    assert.equal(keyboardOpened.projectId, env.saved.projectId, 'Space activates the read-only picker tile');
    assert.equal(keyboardOpened.revisionId, env.saved.revisionId);
    report.cases.push({ name: 'picker-search-and-keyboard-space-opens-exact-project', pass: true });
    await page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
    await waitSelector(page, '#project-start-picker');
    await page.keyboard.press('Escape');
    await waitSelector(page, '[data-embed-start]');
    await (await findLocator(page, '[data-embed-start]')).click();
    await waitSelector(page, '#project-start-picker');
    report.cases.push({ name: 'escape-close-and-reopen-picker', pass: true });

    // Valid remembered pointer and a malformed/broken pointer both remain unselected.
    for (const pointer of [
      { label: 'valid-pointer', value: { projectId: env.saved.projectId, revisionId: env.saved.revisionId } },
      { label: 'broken-pointer', value: { projectId: 'missing-project', revisionId: 'missing-revision' } }
    ]) {
      await page.evaluate(value => { localStorage.setItem('pixieed:pxd:last:draw', JSON.stringify(value)); localStorage.setItem('pixieed:pxd:last:creation', JSON.stringify(value)); localStorage.setItem('pixieed:pxd:last:direct-workspace:v1', JSON.stringify(value)); }, pointer.value);
      await resetProjectReadProbe(page);
      await page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
      await waitSelector(page, '#project-start-picker');
      assert.equal(Boolean(await findFrame(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime))), false, `${pointer.label} must not auto-restore`);
      assert.equal(await readProjectReadCount(page), 0, `${pointer.label} must not read project bytes before choice`);
      report.cases.push({ name: pointer.label + '-does-not-auto-open', pass: true });
    }
    await page.evaluate(() => localStorage.setItem('__galleryFailCatalogOnce', '1'));
    await page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
    await page.locator('#project-start-picker').waitFor({ state: 'visible' });
    await (await waitSelector(page, '#project-start-retry')).click();
    await waitSelector(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`);
    report.cases.push({ name: 'catalog-read-error-can-retry-without-losing-chooser', pass: true });
    await (await findLocator(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`)).click();
    await runtimeReady(page);
    const picked = await runtimeInfo(page);
    assert.equal(picked.projectId, env.saved.projectId, 'tile opens exact project identity');
    assert.equal(picked.revisionId, env.saved.revisionId, 'tile opens exact saved revision');
    assert.equal(picked.imageHash, env.saved.imageHash, 'tile opens exact pixels');
    assert.equal(await getProjectRecordCount(page), 1, 'open must not create a duplicate');
    report.cases.push({ name: 'explicit-tile-preserves-id-revision-pixels-no-duplicate', pass: true, projectId: picked.projectId, revisionId: picked.revisionId });

    // A self-generated project URL reload is a fresh entry and returns to the chooser.
    await resetProjectReadProbe(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitSelector(page, '#project-start-picker');
    assert.equal(Boolean(await findFrame(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime))), false);
    assert.equal(await readProjectReadCount(page), 0);
    report.cases.push({ name: 'self-generated-project-url-reload-returns-to-chooser', pass: true });

    // Opening via an explicit saved tile then returning from the explanation shell keeps dirty work.
    await (await findLocator(page, `.project-gallery__tile[data-project-id="${env.saved.projectId}"]`)).click();
    await runtimeReady(page);
    const before = await runtimeInfo(page);
    const canvas = await findLocator(page, '#draw-canvas'), box = await canvas.boundingBox();
    const dimensions = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
    await page.mouse.click(box.x + 12.5 * box.width / dimensions.width, box.y + 10.5 * box.height / dimensions.height);
    const activeEditor = await hasRuntime(page);
    await activeEditor.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace?.dirty === true);
    const dirty = await runtimeInfo(page);
    const explanation = await findLocator(page, '[data-shell-explanation]').catch(() => null);
    if (explanation) {
      await explanation.click();
      const start = await findLocator(page, '[data-embed-start]').catch(() => null);
      if (start) await start.click();
      await runtimeReady(page);
      const after = await runtimeInfo(page);
      assert.equal(after.projectId, before.projectId); assert.equal(after.imageHash, dirty.imageHash);
      assert.equal(after.dirty, true, 'explanation return preserves dirty canvas');
      report.cases.push({ name: 'retained-explanation-return-preserves-dirty-canvas-bypasses-picker', pass: true });
    } else report.cases.push({ name: 'retained-explanation-return', status: 'UNTESTED', reason: 'shell explanation control not present on local route' });
  } finally { await env.context.close(); }

  // A CSS load failure must offer retry; a canceled slow CSS load must never open a late modal.
  const cssFailure = await newContext(base, 'fail-once');
  try {
    await cssFailure.page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
    await Promise.race([cssFailure.cssRequested, cssFailure.page.waitForTimeout(12000).then(() => { throw new Error('Timed out waiting for picker CSS request'); })]);
    await (await waitSelector(cssFailure.page, '[data-direct-bootstrap-retry]')).click();
    await waitSelector(cssFailure.page, '#project-start-picker');
    report.cases.push({ name: 'picker-css-failure-retry-reopens-chooser', pass: true });
  } finally { await cssFailure.context.close(); }

  const slowCss = await newContext(base, 'slow');
  try {
    await slowCss.page.goto(base + '/tools/start/draw/', { waitUntil: 'domcontentloaded' });
    await Promise.race([slowCss.cssRequested, slowCss.page.waitForTimeout(12000).then(() => { throw new Error('Timed out waiting for delayed picker CSS request'); })]);
    await slowCss.page.keyboard.press('Escape');
    slowCss.releaseCss();
    await slowCss.page.waitForTimeout(200);
    assert.equal(await slowCss.page.locator('#project-start-picker[open]').count(), 0, 'canceled CSS must not open a late chooser');
    assert.equal(Boolean(await findFrame(slowCss.page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime))), false);
    const start = await findLocator(slowCss.page, '[data-embed-start]'); await start.click();
    await waitSelector(slowCss.page, '#project-start-picker');
    report.cases.push({ name: 'slow-picker-css-cancel-does-not-late-reopen-and-can-reopen', pass: true });
  } finally { slowCss.releaseCss(); await slowCss.context.close(); }

  // New from empty catalogs enters exactly one runtime. Camera/audio APIs stay synthetic and disabled.
  for (const mode of ['draw', 'audio', 'camera']) {
    const envMode = await newContext(base);
    try {
      const { page } = envMode;
      await page.goto(`${base}/tools/start/${mode}/`, { waitUntil: 'domcontentloaded' });
      await waitSelector(page, '#project-start-picker');
      assert.equal(Boolean(await findFrame(page, () => Boolean(window.__PIXIEED_CREATION_HOST__?.runtime))), false);
      await page.screenshot({ path: join(output, `gallery-empty-${mode}.png`), fullPage: true });
      assert.equal(await surfaceEvaluate(page, () => window.__galleryMediaRequests ?? 0), 0, 'no camera/microphone request before choice');
      const editorRequests = [...envMode.requests.values()].filter(row => /\/editor\.html(?:\?|$)|creation-runtime/.test(row.url));
      assert.equal(editorRequests.length, 0, `${mode} runtime assets must not load before New`);
      const begin = Date.now();
      if (mode === 'draw') await (await findLocator(page, '#project-start-new')).dblclick();
      else await clickNew(page);
      await runtimeReady(page);
      const elapsed = Date.now() - begin;
      const state = await runtimeInfo(page);
      if (mode !== 'draw') assert.equal(state.mode, mode, `New should enter ${mode} mode`);
      const mediaRequestsAfterChoice = await surfaceEvaluate(page, () => window.__galleryMediaRequests ?? 0);
      report.cases.push({ name: `empty-${mode}-new-starts-once-after-choice`, pass: true, editorReadyAfterChoiceMs: elapsed, mode: state.mode, syntheticMediaRequestsAfterChoice: mediaRequestsAfterChoice });
      if (mode === 'draw') {
        await page.waitForTimeout(100);
        const count = [...envMode.requests.values()].filter(row => /\/editor\.html(?:\?|$)/.test(row.url)).length;
        assert.ok(count <= 1, 'double New must not create a second editor document');
        report.cases.push({ name: 'double-new-keeps-single-runtime-document', pass: true, editorHtmlRequests: count });
      }
    } finally { await envMode.context.close(); }
  }
}

async function runBenchmark(build, target) {
  for (let sample = 1; sample <= 5; sample++) {
    const env = await seed(target, build);
    try {
      const row = await navigationMetrics(env, build);
      row.sample = sample;
      if (build === 'gallery') {
        assert.equal(row.chooserBeforeChoice, true);
        assert.equal(row.runtimeBeforeChoice, false);
        assert.equal(row.projectReadCallsBeforeChoice, 0);
      }
      report.benchmarks.push(row);
    } finally { await env.context.close(); }
  }
}

try {
  await runNewBuildRegressions();
  if (baseline) {
    await runBenchmark('baseline', baseline); await runBenchmark('gallery', base);
    const before = report.benchmarks.filter(row => row.build === 'baseline');
    const after = report.benchmarks.filter(row => row.build === 'gallery');
    for (let i = 0; i < Math.min(before.length, after.length); i++) assert.equal(after[i].syntheticFixturePixelHash, before[i].syntheticFixturePixelHash, `sample ${i + 1} must use the same synthetic pixel fixture`);
  }
  else report.cases.push({ name: 'comparison', status: 'UNTESTED', reason: 'Set PIXIEED_GALLERY_BASELINE_URL to the localhost baseline build.' });
  assert.deepEqual(report.errors, [], 'uncaught browser errors');
  assert.deepEqual(report.blockedWrites, [], 'harness must not dispatch non-GET/HEAD requests');
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.failure = error.stack;
  process.exitCode = 1;
} finally {
  if (report.benchmarks.length) {
    const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
    report.summary = {};
    for (const build of ['baseline', 'gallery']) {
      const rows = report.benchmarks.filter(row => row.build === build);
      if (rows.length) report.summary[build] = {
        actionableState: rows[0].actionableState,
        medianActionableMs: median(rows.map(row => row.actionableMs)),
        medianEditorReadyAfterChoiceMs: rows.filter(row => row.editorReadyAfterChoiceMs !== null).length ? median(rows.filter(row => row.editorReadyAfterChoiceMs !== null).map(row => row.editorReadyAfterChoiceMs)) : null,
        medianRequestCountBeforeChoice: median(rows.map(row => row.requestCount)), medianEncodedTransferBytesBeforeChoice: median(rows.map(row => row.encodedTransferBytes)),
        medianDecodedScriptBytesBeforeChoice: median(rows.map(row => row.decodedScriptBytesBeforeChoice)), medianProjectReadsBeforeChoice: median(rows.map(row => row.projectReadCallsBeforeChoice)),
        medianAfterChoiceEditorRuntimeRequests: median(rows.map(row => row.afterChoiceRuntimeRequests))
      };
    }
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

