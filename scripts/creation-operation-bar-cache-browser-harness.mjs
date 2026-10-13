#!/usr/bin/env node
/**
 * Two-phase, real HTTP-cache regression for camera placement while preserving
 * the operation-bar cache. The same isolated Chromium context crosses from
 * the published 2f646775 baseline to the working tree. No Playwright routing
 * is used because it disables HTTP cache.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.env.PIXIEED_CACHE_BASELINE || '2f6467750ab08bc418a904dbaa2e9fb764eca502';
const operationBarRevision = '20261012-operation-bar-1';
const cameraPlacementRevision = '20261013-camera-placement-1';
const defaultTargets = [
  'css/creation-modes.css', 'js/creation/audio-entry.mjs', 'js/creation/audio-page.mjs',
  'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs', 'js/creation/draw-entry.mjs',
  'js/creation/draw-page.mjs', 'js/creation/jigsaw-page.mjs', 'js/creation/pixfind-play.mjs',
  'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs', 'js/tool-result-view.mjs',
  'js/creation/draw-selection-panel.mjs', 'css/draw-selection-features.css', 'css/draw-compact-controls.css',
  'js/creation/camera-placement-preview.mjs'
];
const targets = defaultTargets;
const cameraPlacementTargets = new Set([
  'css/creation-modes.css', 'js/creation/camera-placement-preview.mjs',
  'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs',
  'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs',
  'js/pixel-lens/app.mjs', 'js/pixel-lens/entry.mjs'
]);
const expectedRevision = path => cameraPlacementTargets.has(path) ? cameraPlacementRevision : operationBarRevision;
const output = process.env.PIXIEED_OPERATION_CACHE_OUTPUT || '/tmp/pixieed-operation-bar-20261012/cache-upgrade';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();

await mkdir(output, { recursive: true });
const beforeFiles = git('ls-tree', '-r', '--name-only', baseline).split('\n').filter(p => /\.(?:html|mjs|js|css)$/.test(p));
const afterFiles = [...new Set([...git('ls-files').split('\n').filter(p => /\.(?:html|mjs|js|css)$/.test(p)), ...targets])];
const beforeBytes = new Map();
const readBefore = path => {
  if (!beforeBytes.has(path)) beforeBytes.set(path, execFileSync('git', ['show', `${baseline}:${path}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }));
  return beforeBytes.get(path);
};
const resolveSpecifier = (owner, spec) => {
  const raw = spec.split(/[?#]/, 1)[0];
  if (!raw || raw.startsWith('#') || /^(?:https?:|data:|blob:|javascript:)/i.test(raw)) return null;
  if (raw.startsWith('/')) return posix.normalize(raw.slice(1));
  if (raw.startsWith('.')) return posix.normalize(posix.join(posix.dirname(owner), raw));
  return null;
};
const specifierRx = /(?:"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`)/g;
async function refsAt(files, read, target, revOnly = false) {
  const found = new Set();
  for (const owner of files) {
    let text;
    try { text = String(await read(owner)); } catch { continue; }
    for (const match of text.matchAll(specifierRx)) {
      const value = match[1] || match[2] || match[3];
      if (!value || !value.includes(target.split('/').at(-1))) continue;
      const resolved = resolveSpecifier(owner, value);
      if (resolved !== target) continue;
      if (revOnly && !new URL(value, 'http://local.invalid').searchParams.has('rev')) continue;
      const cleanValue = value.replace(/\$\{[^}]+\}/g, '1');
      found.add(cleanValue.startsWith('/') ? cleanValue : `/${resolved}${cleanValue.includes('?') ? cleanValue.slice(cleanValue.indexOf('?')) : ''}`);
    }
  }
  return [...found];
}
const oldRefs = {}, currentRefs = {}, targetHashes = { old: {}, current: {} };
for (const path of targets) {
  const existsAtBaseline = beforeFiles.includes(path);
  oldRefs[path] = existsAtBaseline ? await refsAt(beforeFiles, async p => readBefore(p), path, true) : [];
  currentRefs[path] = await refsAt(afterFiles, async p => readFile(resolve(root, p)), path, true);
  assert.ok(currentRefs[path].length, `current production reference exists: ${path}`);
  if (existsAtBaseline) targetHashes.old[path] = hash(readBefore(path));
  targetHashes.current[path] = hash(await readFile(resolve(root, path)));
  if (existsAtBaseline && !oldRefs[path].length) oldRefs[path] = [`/${path}?rev=baseline-${baseline.slice(0, 8)}`];
}

let phase = 'before';
const requests = [];
const mime = path => /\.(?:m?js)$/.test(path) ? 'text/javascript; charset=utf-8'
  : path.endsWith('.css') ? 'text/css; charset=utf-8'
  : path.endsWith('.html') ? 'text/html; charset=utf-8'
  : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : 'application/octet-stream';
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const path = u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname;
  const relative = path.replace(/^\//, '');
  let bytes;
  try {
    bytes = phase === 'before' ? readBefore(relative) : await readFile(resolve(root, relative));
    res.statusCode = 200;
  } catch {
    bytes = Buffer.from('Not found'); res.statusCode = 404;
  }
  requests.push({ phase, url: u.pathname + u.search, status: res.statusCode, sha256: hash(bytes), bytes: bytes.length });
  res.setHeader('Cache-Control', path.endsWith('.html') ? 'no-store' : 'public, max-age=600');
  res.setHeader('Content-Type', mime(path));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; worker-src 'self' blob:; img-src 'self' data: blob:");
  res.end(bytes);
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const startedAt = new Date().toISOString();
const report = {
  baseline, revisions: { operationBar: operationBarRevision, cameraPlacement: cameraPlacementRevision }, startedAt, output, base, routing: false,
  cacheControl: 'public, max-age=600', htmlCacheControl: 'no-store',
  isolatedContext: true, userProfileStorage: false, hardwarePermissions: false,
  externalNetwork: 'blocked by Chromium CDP and same-origin CSP', oldRefs, currentRefs,
  targetHashes, checks: [], errors: [], cache: { servedFromCache: [], requests: [] },
  requests, screenshots: [], status: 'running'
};
let context;
try {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__cacheHarness = { mediaCalls: 0 };
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { window.__cacheHarness.mediaCalls++; throw new DOMException('Synthetic test has no camera device', 'NotAllowedError'); }
    });
  });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
  const requestIds = new Map();
  cdp.on('Network.requestWillBeSent', e => requestIds.set(e.requestId, e.request.url));
  cdp.on('Network.requestServedFromCache', e => report.cache.servedFromCache.push(requestIds.get(e.requestId)));
  cdp.on('Network.responseReceived', e => report.cache.requests.push({ url: e.response.url, status: e.response.status, fromDiskCache: e.response.fromDiskCache, fromServiceWorker: e.response.fromServiceWorker }));
  page.on('pageerror', e => report.errors.push({ message: e.message, stack: e.stack }));
  page.on('request', req => { if (new URL(req.url()).origin !== base) report.errors.push({ externalRequestAttempt: req.url() }); });
  const ready = mode => page.waitForFunction(m => document.documentElement.dataset.drawReady === 'true'
    && document.documentElement.dataset.creationModesReady === 'true'
    && document.body.dataset.creationMode === m
    && !document.body.hasAttribute('data-creation-transition')
    && !document.querySelector('#main')?.inert, mode, { timeout: 35000 });
  async function switchMode(mode) {
    if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click();
    await page.locator(`button[data-creation-mode="${mode}"]`).click();
    await ready(mode);
  }
  const snapshot = () => page.evaluate(() => {
    const canvas = document.querySelector('#draw-canvas');
    const image = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
    return {
      mode: document.body.dataset.creationMode,
      canvas: canvas ? { width: canvas.width, height: canvas.height, rgba: Array.from(image.data) } : null,
      frameCount: document.querySelectorAll('[data-action="select-frame"]').length,
      pointer: JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null'),
      url: location.pathname + location.search + location.hash
    };
  });
  const clickFirstVisible = async (...selectors) => {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count() && await locator.isVisible().catch(() => false) && await locator.isEnabled().catch(() => false)) {
        await locator.click(); return selector;
      }
    }
    throw new Error(`No visible enabled control found: ${selectors.join(', ')}`);
  };
  const saveEditedProject = async () => {
    const initial = await page.evaluate(() => ({
      pointer: JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null'),
      state: document.querySelector('#project-open')?.dataset.state
    }));
    const needsRevision = initial.state !== 'saved';
    await clickFirstVisible('#creation-file-open', '#project-open');
    await page.locator('#pxd-panel').waitFor({ state: 'visible' });
    await page.locator('#project-tab-current').click();
    const morePanel = page.locator('#project-current-pane .project-more');
    const more = morePanel.locator(':scope > summary');
    if (await more.count() && await more.isVisible().catch(() => false)
      && !await morePanel.evaluate(node => node.open)) await more.click();
    const projectSave = page.locator('#pxd-save');
    const shouldSave = await projectSave.isEnabled().catch(() => false);
    if (shouldSave) await projectSave.click();
    await page.waitForFunction(({ before, needsRevision }) => {
      const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null');
      return pointer?.revisionId && (!needsRevision || pointer.revisionId !== before?.pointer?.revisionId)
        && document.querySelector('#project-open')?.dataset.state === 'saved'
        && !document.querySelector('#main')?.inert;
    }, { before: initial, needsRevision }, { timeout: 15000 });
    const after = await page.evaluate(() => ({
      pointer: JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null'),
      state: document.querySelector('#project-open')?.dataset.state
    }));
    (report.projectSaves ||= []).push({ before: initial, needsRevision, saveButtonEnabled: shouldSave, after });
    if (await page.locator('#project-close').isVisible().catch(() => false)) await page.locator('#project-close').click();
    await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
  };

  // Seed an actual saved PXD project in the isolated context, then let the
  // baseline production editor restore it through its ordinary startup path.
  await page.goto(`${base}/draw/`, { waitUntil: 'load' });
  report.fixture = await page.evaluate(async () => {
    const core = await import('/js/creation/animation-core.mjs?rev=20261012-animation-core-contract-1');
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { writePxdAnimation } = await import('/js/creation/pxd-animation.mjs?rev=20261012-animation-core-contract-1');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261001-free-tools-1');
    let animation = core.createAnimation({ width: 16, height: 16, palette: ['#e75445', '#4c82c3'] });
    const pixels = Array.from({ length: 256 }, (_, i) => i === 0 || i === 17 ? 1 : i === 34 ? 2 : 0);
    animation = core.writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: 16, height: 16, pixels });
    animation = core.addAnimationFrame(animation, { copy: true });
    let project = createPxdProject({ manifest: { title: 'Operation bar HTTP cache fixture', toolProject: { tool: 'draw', schemaVersion: 1 }, lastMode: 'draw' } });
    project = await writePxdAnimation(project, animation, { role: 'main', posterFrameId: animation.frames[0].id });
    const saved = await createToolProjectStore('draw').save(project);
    const pointer = { projectId: saved.projectId, revisionId: saved.revisionId };
    localStorage.setItem('pixieed:pxd:last:draw', JSON.stringify(pointer));
    localStorage.setItem('pixieed:pxd:last:creation', JSON.stringify(pointer));
    window.__cacheHarness.initialRevision = pointer.revisionId;
    return { pointer, projectId: saved.projectId, revisionId: saved.revisionId, frameCount: animation.frames.length, animationIdentity: typeof core.createAnimation };
  });
  phase = 'before';
  await page.reload({ waitUntil: 'load' }); await ready('draw');
  report.before = await snapshot();
  assert.equal(report.before.canvas.width, 16);
  assert.equal(report.before.canvas.height, 16);
  assert.equal(report.before.frameCount, 2);
  assert.equal(report.before.pointer.projectId, report.fixture.projectId);
  report.checks.push('baseline HTTP page restores isolated two-frame PXD fixture and exact canvas pixels');

  // Make a real pointer edit and save it using the editor's own output action.
  const canvasBox = await page.locator('#draw-canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.64, canvasBox.y + canvasBox.height * 0.61);
  const painted = await snapshot();
  assert.notDeepEqual(painted.canvas.rgba, report.before.canvas.rgba, 'actual canvas pointer input changes pixels');
  await saveEditedProject();
  const beforeProject = await page.evaluate(async pointer => {
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261001-free-tools-1');
    const current = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null');
    const store = createToolProjectStore('draw');
    const project = await store.load(current.projectId, current.revisionId);
    const original = await store.load(pointer.projectId, pointer.revisionId);
    return { current, title: project?.manifest?.title, originalRetained: Boolean(original), projectId: project?.projectId };
  }, report.fixture.pointer);
  assert.equal(beforeProject.projectId, report.fixture.projectId);
  assert.equal(beforeProject.originalRetained, true);
  report.beforeSaved = beforeProject;
  report.checks.push('baseline actual pointer edit saved as PXD while original revision stayed addressable');

  // Warm every available baseline reference URL through fetch with normal cache
  // semantics. A new target has no old URL or hash to warm.
  const warmed = await page.evaluate(async urls => {
    const out = [];
    for (const [target, candidates] of Object.entries(urls)) {
      if (!candidates.length) continue;
      const url = candidates[0];
      const response = await fetch(url, { cache: 'default' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      out.push({ target, url, status: response.status, sha256: await crypto.subtle.digest('SHA-256', bytes).then(hash => [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('')) });
    }
    return out;
  }, oldRefs);
  for (const row of warmed) {
    assert.equal(row.status, 200, `baseline reference responds: ${row.url}`);
    assert.equal(row.sha256, targetHashes.old[row.target], `baseline response matches old source: ${row.target}`);
  }
  report.warmedOldRefs = warmed;
  report.checks.push(`warmed ${warmed.length} baseline target URLs over real HTTP; ${targets.length - warmed.length} targets were absent from baseline`);

  // Flip only the source served by the local origin. HTML is no-store, all
  // module/CSS URLs remain cacheable, and the same browser context is reused.
  phase = 'after';
  await page.goto(`${base}/draw/`, { waitUntil: 'load' }); await ready('draw');
  report.afterInitial = await snapshot();
  assert.deepEqual(report.afterInitial.canvas.rgba, painted.canvas.rgba, 'operation-bar startup restores the saved drawing');
  assert.equal(report.afterInitial.pointer.projectId, report.fixture.projectId);
  report.checks.push('fresh current HTML loads new entry graph and retains baseline PXD pixels/project pointer');

  const newlyIntroduced = targets.filter(path => !oldRefs[path].length);
  for (const target of newlyIntroduced) {
    const [url] = currentRefs[target];
    const response = await page.evaluate(async url => {
      const response = await fetch(url, { cache: 'default' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { status: response.status, sha256: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') };
    }, url);
    assert.equal(response.status, 200, `new target fetched over HTTP: ${url}`);
    assert.equal(response.sha256, targetHashes.current[target], `new target body matches current source: ${target}`);
  }
  if (newlyIntroduced.length) report.checks.push(`fetched ${newlyIntroduced.length} newly introduced targets at current revision`);

  const nav = await page.evaluate(() => {
    const n = document.querySelector('.app-tabs');
    return { className: n?.className, label: n?.getAttribute('aria-label'), buttons: [...(n?.querySelectorAll('[data-nav-slot]') || [])].map(x => ({ id: x.id, slot: x.dataset.navSlot, rect: (() => { const r=x.getBoundingClientRect(); return {width:r.width,height:r.height}; })() })) };
  });
  assert.equal(nav.buttons.length, 5);
  assert.ok(nav.buttons.every(b => b.rect.width >= 44 && b.rect.height >= 44));
  report.operationBar = nav;
  report.checks.push('new operation bar exposes five in-page controls with at least 44px hit areas');

  for (const mode of ['audio', 'camera', 'draw']) await switchMode(mode);
  const afterModes = await snapshot();
  assert.deepEqual(afterModes.canvas.rgba, painted.canvas.rgba, 'pixels survive the draw/audio/camera mode path');
  assert.equal(afterModes.pointer.projectId, report.fixture.projectId);
  report.checks.push('draw → audio → camera → draw keeps PXD project and exact drawing pixels');

  // No real camera API is called. Upload one generated data URL and exercise
  // capture/file-dialog/retake against synthetic pixels only.
  await switchMode('camera');
  const upload = await page.locator('#cameraImageInput').count();
  assert.equal(upload, 1);
  await page.locator('#cameraImageInput').setInputFiles({
    name: 'synthetic-camera-fixture.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r2cAAAAASUVORK5CYII=', 'base64')
  });
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live' && !document.querySelector('#capture')?.disabled, null, { timeout: 20000 });
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured', null, { timeout: 15000 });
  await page.locator('#creation-file-open').click();
  await page.locator('#pxd-panel').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'opening/closing file manager must not restart camera mode');
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live', null, { timeout: 15000 });
  report.checks.push('synthetic image upload/capture/file modal/retake works without a hardware request');

  // Direct requests for each current URL must return the current source. Old
  // URLs must still return their cached baseline bytes without server requests.
  const fetchedCurrent = await page.evaluate(async urls => {
    const out = [];
    for (const [target, candidates] of Object.entries(urls)) {
      const url = candidates[0]; const response = await fetch(url, { cache: 'default' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      out.push({ target, url, status: response.status, sha256: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return out;
  }, currentRefs);
  for (const row of fetchedCurrent) {
    assert.equal(row.status, 200);
    assert.equal(row.sha256, targetHashes.current[row.target], `new response matches current source: ${row.target}`);
    assert.equal(new URL(row.url, 'http://local.invalid').searchParams.get('rev'), expectedRevision(row.target));
  }
  report.fetchedCurrent = fetchedCurrent;
  const warmedOldAgain = await page.evaluate(async urls => {
    const out = [];
    for (const [target, candidates] of Object.entries(urls)) {
      if (!candidates.length) continue;
      const url = candidates[0]; const response = await fetch(url, { cache: 'force-cache' });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      out.push({ target, url, status: response.status, sha256: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return out;
  }, oldRefs);
  for (const row of warmedOldAgain) {
    assert.equal(row.status, 200);
    assert.equal(row.sha256, targetHashes.old[row.target]);
  }
  report.recheckedOldRefs = warmedOldAgain;
  const oldRequestsAfterSwitch = requests.filter(r => r.phase === 'after' && oldRefs[targets.find(t => r.url.startsWith(`/${t}?`))]?.includes(r.url));
  assert.equal(oldRequestsAfterSwitch.length, 0, 'cached old URLs should not be re-fetched from the new source');
  const isCacheHit = url => report.cache.servedFromCache.some(cachedUrl => cachedUrl?.endsWith(url))
    || report.cache.requests.some(event => {
      if (event.fromDiskCache !== true || event.fromServiceWorker === true) return false;
      const cached = new URL(event.url);
      return `${cached.pathname}${cached.search}` === url;
    });
  const oldRefsSet = new Set(Object.values(oldRefs).flat());
  const oldCacheEvents = [
    ...report.cache.servedFromCache.filter(url => url && [...oldRefsSet].some(ref => url.endsWith(ref))),
    ...report.cache.requests.filter(event => event.fromDiskCache === true && event.fromServiceWorker !== true
      && oldRefsSet.has(`${new URL(event.url).pathname}${new URL(event.url).search}`))
  ];
  assert.ok(oldCacheEvents.length > 0, 'Chromium reports cache-hit events for warmed old URLs');
  for (const target of cameraPlacementTargets) {
    assert.ok(requests.some(r => r.phase === 'after' && r.url === currentRefs[target][0]), `camera-placement URL requested in current phase: ${target}`);
  }
  for (const target of targets.filter(path => !cameraPlacementTargets.has(path))) {
    assert.equal(targetHashes.current[target], targetHashes.old[target], `unchanged operation-bar target retains baseline bytes: ${target}`);
    assert.ok(oldRefs[target].includes(currentRefs[target][0]), `unchanged target retains its baseline URL: ${target}`);
    assert.ok(isCacheHit(currentRefs[target][0]), `unchanged target reuses its warmed HTTP cache entry: ${target}`);
  }
  report.checks.push('camera-placement URLs load fresh current bytes; unchanged operation-bar URLs remain byte-identical and cache-served');

  // mode-scope is intentionally not in the changed target set, so its same
  // URL should be reused from cache across the HTML reload.
  const modeScopeUrl = `${base}/js/creation/mode-scope.mjs?rev=20261001-independent-editors-1`;
  assert.ok(requests.some(r => r.phase === 'before' && r.url === new URL(modeScopeUrl).pathname + new URL(modeScopeUrl).search));
  assert.ok(isCacheHit(new URL(modeScopeUrl).pathname + new URL(modeScopeUrl).search), 'unchanged mode-scope module reused from HTTP cache');
  report.checks.push('unchanged mode-scope module remains reused from real HTTP cache');

  // The core contract check asserts both the versioned façade identity and
  // the shared WeakMap-backed cel document when both URLs coexist.
  report.coreContract = await page.evaluate(async () => {
    const bare = await import('/js/creation/animation-core.mjs');
    const versioned = await import('/js/creation/animation-core.mjs?rev=20261012-animation-core-contract-1');
    let animation = bare.createAnimation({ width: 3, height: 2, palette: ['#ffffff'] });
    animation = versioned.writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: 3, height: 2, pixels: [1, 0, 0, 0, 1, 0] });
    const document = bare.getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id);
    return { sameCreate: bare.createAnimation === versioned.createAnimation, sameWrite: bare.writeAnimationCel === versioned.writeAnimationCel, pixels: Array.from(document.pixels), ensure: typeof bare.ensureAnimationMusicLayer };
  });
  assert.equal(report.coreContract.sameCreate, true);
  assert.equal(report.coreContract.sameWrite, true);
  assert.deepEqual(report.coreContract.pixels, [0, -1, -1, -1, 0, -1]);
  assert.equal(report.coreContract.ensure, 'function');
  report.checks.push('bare/versioned animation core share exact functions and cel storage');

  // Save from the editor after the hot swap, reload the same URL, and confirm
  // the project identity, saved revision and pixels remain stable.
  await switchMode('draw');
  await saveEditedProject();
  report.savedCurrent = await page.evaluate(async pointer => {
    const current = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || 'null');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261001-free-tools-1');
    const store = createToolProjectStore('draw');
    return { current, originalRetained: Boolean(await store.load(pointer.projectId, pointer.revisionId)), currentProject: await store.load(current.projectId, current.revisionId) };
  }, report.fixture.pointer);
  assert.equal(report.savedCurrent.current.projectId, report.fixture.projectId);
  assert.equal(report.savedCurrent.originalRetained, true);
  await page.screenshot({ path: join(output, 'after-operation-bar-cache-upgrade.png'), fullPage: true });
  report.screenshots.push(join(output, 'after-operation-bar-cache-upgrade.png'));
  await page.reload({ waitUntil: 'load' }); await ready('draw');
  report.afterReload = await snapshot();
  assert.equal(report.afterReload.pointer.projectId, report.fixture.projectId);
  assert.deepEqual(report.afterReload.canvas.rgba, painted.canvas.rgba);
  assert.equal(await page.evaluate(() => window.__cacheHarness.mediaCalls), 0);
  assert.deepEqual(report.errors, [], 'no JS page errors or blocked external request attempts');
  report.checks.push('new source save/reload preserves PXD project, exact pixels and original revision; no media access');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  report.requests = requests;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close();
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
console.log(`PASS: operation-bar real HTTP cache upgrade (${report.checks.length} checks); evidence ${join(output, 'report.json')}`);
