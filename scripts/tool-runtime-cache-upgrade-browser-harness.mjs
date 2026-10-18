/**
 * Local-only browser test for an old cached iframe editor upgrading to the
 * same-origin direct runtime. Uses a real HTTP server and browser HTTP cache;
 * intentionally does not use Playwright request routing.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const oldRoot = process.env.PIXIEED_STAGE1_ROOT || '/tmp/pixieed-stage2/stage1-source';
const oldLabel = process.env.PIXIEED_CACHE_OLD_LABEL || (oldRoot.includes('/stage3/') ? 'stage3' : 'stage1');
const oldPhase = `old-${oldLabel}`;
const out = process.env.PIXIEED_CACHE_UPGRADE_OUTPUT || '/tmp/pixieed-stage3/cache';
const coreFreshUrls = [
  '/js/creation/creation-runtime.mjs?rev=20261018-direct-runtime-2',
  '/js/creation/draw-page.mjs?rev=20261018-direct-runtime-2',
  '/js/creation/project-workspace.mjs?rev=20261018-direct-runtime-2',
];
const freshUrlOverride = process.env.PIXIEED_CACHE_EXPECT_FRESH_URLS;
const expectedFreshURLs = freshUrlOverride
  ? (freshUrlOverride.trim().startsWith('[') ? JSON.parse(freshUrlOverride) : freshUrlOverride.split(',').map(value => value.trim()).filter(Boolean))
  : coreFreshUrls;
assert.ok(Array.isArray(expectedFreshURLs) && expectedFreshURLs.every(value => typeof value === 'string' && value.startsWith('/')), 'expected fresh URLs must be exact same-origin path+query strings');
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const oldEntryPath = path.join(oldRoot, 'js/creation/draw-entry.mjs');
const newEntryPath = path.join(repo, 'js/creation/draw-entry.mjs');
const sha = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const { decodePxd } = await import(pathToFileURL(path.join(repo, 'js/creation/pxd-codec.mjs')).href);
const mimeTypes = new Map([
  ['.html','text/html; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'], ['.js','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'], ['.json','application/json; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.webp','image/webp'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.ico','image/x-icon'],
  ['.woff2','font/woff2'], ['.woff','font/woff'], ['.mp3','audio/mpeg'], ['.wav','audio/wav'], ['.webm','video/webm'],
]);
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; form-action 'none'; base-uri 'self'";
await mkdir(out, { recursive: true });
const logs = [];
let sourceRoot = oldRoot;
let phase = oldPhase;
const rootReal = new Map([[oldPhase, await realpath(oldRoot)], ['current', await realpath(repo)]]);
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (url.pathname === '/_qa/phase') {
    res.writeHead(204, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'null' }); res.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (pathname.includes('\0') || pathname.split('/').includes('..')) { res.writeHead(400); res.end(); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const abs = path.resolve(sourceRoot, `.${pathname}`);
  try {
    const actual = await realpath(abs);
    if (!actual.startsWith(`${rootReal.get(phase)}${path.sep}`)) { res.writeHead(404); res.end(); return; }
    const body = await readFile(actual);
    const ext = path.extname(actual).toLowerCase();
    const versioned = ['.js','.mjs','.css','.svg','.png','.webp','.jpg','.jpeg','.woff','.woff2','.json'].includes(ext);
    res.writeHead(200, {
      'Content-Type': mimeTypes.get(ext) || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': versioned ? 'public, max-age=600' : 'no-store',
    });
    logs.push({ phase, method: req.method, url: `${pathname}${url.search}`, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
let browser;
const report = {
  engine: null, base, oldEntrySha256: await sha(oldEntryPath), currentEntrySha256: await sha(newEntryPath),
  oldRoot: await realpath(oldRoot), expectedFreshURLs,
  externalRequests: [], oldProject: null, cache: {}, variants: [], limitations: [
    'Local Chromium HTTP cache and static localhost fixture do not model CDN/browser cache headers, compression, service workers, or production network timing.',
    'PXD content is synthetic. No user profile, camera, microphone, analytics, ads, external requests, persistence outside this isolated browser context, or hardware is exercised.',
    'The tested runtime parity covers draw/camera/audio launch, saved pixels/revision, undo/redo and a local PXD download; it does not prove every editor layer, frame, modal, or device workflow.',
    'Unversioned JavaScript URLs are listed separately; this run cannot prove cache invalidation for those paths under deployed caching policy.',
  ], failures: [], serverLog: logs,
};

function setSource(kind) {
  phase = kind;
  sourceRoot = kind === oldPhase ? oldRoot : repo;
}
async function waitWork(page, variant) {
  if (variant === 'direct') {
    await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.active === true
      && window.__PIXIEED_CREATION_HOST__?.runtime?.state?.ready === true
      && document.querySelector('.tool-direct__status')?.textContent === '', null, { timeout: 30000 });
    return page;
  }
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe');
    try { return frame?.contentWindow?.__PIXIEED_TOOL_EMBED_BRIDGE__ && frame.contentDocument?.documentElement?.dataset?.drawReady === 'true'; }
    catch { return false; }
  }, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'), null, { timeout: 30000 });
  const frame = page.frames().find(item => item.url().includes('/draw/editor.html'));
  assert.ok(frame, 'iframe editor frame exists');
  return frame;
}
async function state(doc) {
  return doc === undefined
    ? await browserContext.pages()[0].evaluate(async () => await window.__PIXIEED_CREATION_HOST__.getState())
    : await doc.evaluate(async () => window.__PIXIEED_CREATION_HOST__
      ? await window.__PIXIEED_CREATION_HOST__.getState()
      : await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
}
let browserContext;
async function activeDocument(page, variant) {
  return variant === 'direct' ? page : page.frames().find(item => item.url().includes('/draw/editor.html'));
}
async function paint(page, doc, offset = 0) {
  const canvas = doc.locator('#draw-canvas');
  const box = await canvas.boundingBox();
  assert.ok(box, 'canvas is visible');
  const [width, height] = await canvas.evaluate(node => [node.width, node.height]);
  const point = (x, y) => ({ x: box.x + (x + .5) * box.width / width, y: box.y + (y + .5) * box.height / height });
  const start = point(3 + offset, 4), end = point(5 + offset, 6);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up();
  await doc.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function openWorkspace(doc) {
  await doc.locator('#draw-output').evaluate(node => { node.open = true; });
  await doc.locator('[data-output-project]').evaluate(node => node.click());
  await doc.locator('#pxd-panel[open]').waitFor({ state: 'visible', timeout: 15000 });
  await doc.locator('#project-tab-current').click();
  const more = doc.locator('#pxd-panel .project-more > summary');
  if (await more.count()) await more.evaluate(node => node.click());
}
async function saveProject(doc) {
  await doc.locator('#draw-output').evaluate(node => { node.open = true; });
  await doc.locator('#draw-save').evaluate(node => node.click());
  await doc.waitForFunction(() => {
    try { const value = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw') || 'null'); return value?.projectId && value?.revisionId; }
    catch { return false; }
  }, { timeout: 20000 });
  return await doc.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pxd:last:draw')));
}
async function verifyUpgrade(page, variant, mode, pointer, baseline) {
  // Keep both modes explicit: direct is the candidate, while runtime=iframe
  // exercises the retained fallback after the local default flips to direct.
  const suffix = new URLSearchParams({ runtime: variant, mode, pxd: pointer.projectId, pxdRevision: pointer.revisionId, __qa: `${variant}-${mode}` });
  await page.goto(`${base}/draw/?${suffix}`);
  if (variant === 'iframe') await page.locator('[data-embed-start]').click();
  else await page.locator('[data-embed-start]').click();
  const doc = await waitWork(page, variant);
  await doc.waitForFunction(async expectedMode => {
    const state = window.__PIXIEED_CREATION_HOST__
      ? await window.__PIXIEED_CREATION_HOST__.getState()
      : await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState();
    return state.mode === expectedMode;
  }, mode, { timeout: 30000 });
  const before = await doc.evaluate(async () => window.__PIXIEED_CREATION_HOST__
    ? await window.__PIXIEED_CREATION_HOST__.getState()
    : await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
  assert.equal(before.mode, mode, `${variant}/${mode}: selected mode`);
  if (mode !== 'audio') assert.equal(before.image.hash, baseline.image.hash, `${variant}/${mode}: exact saved RGBA hash`);
  assert.equal(before.timeline.hash, baseline.timeline.hash, `${variant}/${mode}: exact saved timeline hash`);
  const entryUrl = variant === 'direct'
    ? await doc.evaluate(() => window.__qaDocumentEntryUrl || location.href)
    : await page.evaluate(() => window.__qaDocumentEntryUrl || location.href);
  assert.equal(new URL(entryUrl).searchParams.get('pxd'), pointer.projectId, `${variant}/${mode}: opens the saved project`);
  assert.equal(new URL(entryUrl).searchParams.get('pxdRevision'), pointer.revisionId, `${variant}/${mode}: starts from the exact saved revision`);

  const headerControlUrl = `${base}/js/tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1`;
  const hostMetrics = await page.evaluate(url => ({
    headerControlResourceCount: performance.getEntriesByName(url).length,
    headerControlInstances: document.querySelectorAll('.px-tool-header-controls').length,
    runtimePublicApi: window.__PIXIEED_CREATION_HOST__?.kind || null,
    iframeCount: document.querySelectorAll('iframe').length,
    unversionedModuleUrls: performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => /\/js\/[^?#]+\.mjs(?:[?#]|$)/.test(name) && !new URL(name).searchParams.has('rev')),
  }), headerControlUrl);
  if (variant === 'direct') {
    assert.equal(hostMetrics.runtimePublicApi, 'direct');
    assert.equal(hostMetrics.iframeCount, 0);
    assert.equal(hostMetrics.headerControlResourceCount, 1, 'direct host imports the canonical shared controls module once');
    assert.equal(hostMetrics.headerControlInstances, 1, 'direct host mounts one shared header-controls instance');
  } else {
    assert.equal(hostMetrics.iframeCount, 1);
  }
  const docMetrics = await doc.evaluate(() => ({
    headerControlInstances: document.querySelectorAll('.px-tool-header-controls').length,
    runtimeApi: window.__PIXIEED_CREATION_HOST__?.kind || null,
    unversionedModuleUrls: performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(name => /\/js\/[^?#]+\.mjs(?:[?#]|$)/.test(name) && !new URL(name).searchParams.has('rev')),
  }));
  if (variant === 'iframe') assert.ok(docMetrics.headerControlInstances <= 1, 'iframe mounts at most one controls host');
  const currentPointer = await doc.evaluate(() => {
    const params = new URLSearchParams(location.search);
    return { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
  });
  report.variants.push({ variant, mode, imageHash: before.image.hash, timelineHash: before.timeline.hash,
    openedProjectId: pointer.projectId, openedRevisionId: pointer.revisionId, entryUrl,
    currentProjectId: currentPointer.projectId, currentRevisionId: currentPointer.revisionId, hostMetrics, docMetrics });
  await page.screenshot({ path: `${out}/${variant}-${mode}-after-upgrade.png`, fullPage: false });
  return { doc, before, currentPointer };
}

async function exportCurrentPxd(page, pointer) {
  const inspect = async label => {
    const value = await page.evaluate(async () => {
      const w = window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace;
      const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
      const current = w.currentProject, saved = w.persistedProject;
      const head = await createToolProjectStore('draw').load(current.projectId);
      return { currentId:current.projectId, currentRevision:current.revisionId, savedId:saved?.projectId, savedRevision:saved?.revisionId, headRevision:head?.revisionId, dirty:w.dirty, busy:w.busy, restoreError:w.restoreError, status:document.querySelector('#pxd-file-status')?.textContent };
    });
    (report.exportDiagnostics ||= []).push({label,...value});
    await writeFile(`${out}/export-diagnostics.json`,JSON.stringify(report.exportDiagnostics,null,2));
  };
  const suffix = new URLSearchParams({ runtime: 'direct', mode: 'draw', pxd: pointer.projectId, pxdRevision: pointer.revisionId, __qa: 'final-pxd-export' });
  await page.goto(`${base}/draw/?${suffix}`);
  await page.locator('[data-embed-start]').click();
  const doc = await waitWork(page, 'direct');
  await doc.waitForFunction(async () => (await window.__PIXIEED_CREATION_HOST__.getState()).mode === 'draw', null, { timeout: 30000 });
  const before = await doc.evaluate(async () => await window.__PIXIEED_CREATION_HOST__.getState());
  await inspect('restored');
  assert.equal(before.image.hash, report.oldProject.imageHash, 'final export opens the saved project pixels');
  await paint(page, doc, 8);
  const edited = await doc.evaluate(async () => await window.__PIXIEED_CREATION_HOST__.getState());
  assert.notEqual(edited.image.hash, before.image.hash, 'post-upgrade synthetic stroke changes pixels');
  await doc.locator('#draw-undo').click();
  await doc.waitForFunction(async expected => (await window.__PIXIEED_CREATION_HOST__.getState()).image.hash === expected, before.image.hash, { timeout: 15000 });
  await doc.locator('#draw-redo').click();
  await doc.waitForFunction(async expected => (await window.__PIXIEED_CREATION_HOST__.getState()).image.hash === expected, edited.image.hash, { timeout: 15000 });
  await doc.locator('#draw-undo').click();
  await doc.waitForFunction(async expected => (await window.__PIXIEED_CREATION_HOST__.getState()).image.hash === expected, before.image.hash, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await inspect('after-edit-undo-autosave');
  const currentPointer = await page.evaluate(() => {
    const params = new URLSearchParams(location.search);
    return { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
  });
  await openWorkspace(doc);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    doc.locator('#pxd-export').click()
  ]);
  await inspect('after-export-click');
  const savePath = `${out}/direct-draw-upgrade.pxd`;
  await download.saveAs(savePath);
  const bytes = await readFile(savePath);
  assert.ok(bytes.length > 100, 'PXD export produced a non-empty file');
  const decoded = await decodePxd(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  assert.equal(decoded.format, 'PXD', 'downloaded PXD container decodes');
  assert.equal(decoded.version, 3, 'downloaded PXD container uses the current format');
  assert.equal(decoded.projectId, currentPointer.projectId, 'decoded PXD export preserves the active project identity');
  assert.ok(decoded.entries.length > 0, 'decoded PXD export contains project entries');
  return { bytes: bytes.length, path: savePath, openedProjectId: pointer.projectId, openedRevisionId: pointer.revisionId,
    currentProjectId: currentPointer.projectId, currentRevisionId: currentPointer.revisionId, imageHash: before.image.hash,
    decoded: { format: decoded.format, version: decoded.version, projectId: decoded.projectId, revisionId: decoded.revisionId, entryCount: decoded.entries.length } };
}

try {
  browser = await chromium.launch({ headless: true });
  report.engine = browser.version();
  browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await browserContext.addInitScript(() => { window.__qaDocumentEntryUrl = location.href; });
  browserContext.on('request', request => {
    if (new URL(request.url()).origin !== base) report.externalRequests.push(request.url());
  });
  const page = await browserContext.newPage(); page.setDefaultTimeout(25000);
  const cdp = await browserContext.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const cacheHits = [];
  cdp.on('Network.requestServedFromCache', event => cacheHits.push(event.requestId));
  const networkRows = new Map();
  cdp.on('Network.requestWillBeSent', event => networkRows.set(event.requestId, { url: event.request.url, servedFromCache: false }));
  cdp.on('Network.requestServedFromCache', event => { const row = networkRows.get(event.requestId); if (row) row.servedFromCache = true; });
  cdp.on('Network.responseReceived', event => {
    const row = networkRows.get(event.requestId);
    if (row && (event.response.fromDiskCache || event.response.fromServiceWorker)) row.servedFromCache = true;
  });

  // Prime actual old-root iframe assets and create a synthetic saved PXD.
  await page.goto(`${base}/draw/?runtime=iframe&__qa=${oldLabel}-prime`);
  await page.locator('[data-embed-start]').click();
  const oldDoc = await waitWork(page, 'iframe');
  const original = await oldDoc.evaluate(async () => await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
  await paint(page, oldDoc);
  const painted = await oldDoc.evaluate(async () => await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
  assert.notEqual(painted.image.hash, original.image.hash, 'synthetic old-runtime stroke painted');
  await oldDoc.locator('#draw-undo').waitFor({ state: 'attached' });
  const pointer = await saveProject(oldDoc);
  assert.ok(pointer.projectId && pointer.revisionId);
  const baseline = await oldDoc.evaluate(async () => await window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
  assert.equal(baseline.image.hash, painted.image.hash);
  report.oldProject = { pointer, imageHash: baseline.image.hash, timelineHash: baseline.timeline.hash, originalImageHash: original.image.hash };
  await page.screenshot({ path: `${out}/stage1-saved-project.png` });

  // Keep the same browser context, origin and HTTP cache; only the server root changes.
  setSource('current');
  await page.goto(`${base}/draw/?__qa=stage2-current-shell`);
  await page.waitForSelector('[data-embed-start]');
  const oldEntryUrl = '/js/creation/mode-entry.mjs?rev=20261016-tool-shell-1';
  const canonicalOldRequests = logs.filter(row => row.phase === oldPhase && row.url === oldEntryUrl);
  assert.ok(canonicalOldRequests.length, `${oldLabel} primed canonical old module ${oldEntryUrl}`);

  for (const variant of ['direct', 'iframe']) {
    for (const mode of ['draw', 'camera', 'audio']) {
      await verifyUpgrade(page, variant, mode, pointer, baseline);
    }
  }
  // Audio mode can persist its selected mode as a new revision. Fork the
  // observed latest PXD into an isolated QA project before edit/undo/export so
  // the comparison fixture itself remains untouched and no stale cross-tab
  // revision can contaminate the final mutation check.
  const latestRevision = report.variants.at(-1)?.currentRevisionId || pointer.revisionId;
  const forkPointer = await page.evaluate(async ({ projectId, revisionId }) => {
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const store = createToolProjectStore('draw');
    const source = await store.load(projectId, revisionId);
    if (!source) throw new Error('Could not load exact PXD source for isolated QA fork');
    const fork = store.cloneAsToolProject(source, { title: 'Direct runtime cache QA fork' });
    const saved = await store.save(fork, { expectedRevisionId: null });
    return { projectId: saved.projectId, revisionId: saved.revisionId };
  }, { projectId: pointer.projectId, revisionId: latestRevision });
  report.export = await exportCurrentPxd(page, forkPointer);

  const cacheHitUrls = [...networkRows.values()].filter(row => row.servedFromCache).map(row => row.url);
  const normalizedCacheHits = cacheHitUrls.map(value => { const parsed = new URL(value); return `${parsed.pathname}${parsed.search}`; });
  const oldCanonicalHit = normalizedCacheHits.includes(oldEntryUrl);
  const currentNewRuntime = logs.filter(row => row.phase === 'current'
    && /^\/js\/creation\/(creation-runtime|draw-page|project-workspace)\.mjs\?rev=20261018-direct-runtime-2(?:&|$)/.test(row.url));
  assert.ok(oldCanonicalHit, `unchanged canonical module served from HTTP cache: ${oldEntryUrl}`);
  const freshAssetEvidence = [];
  for (const url of expectedFreshURLs) {
    const currentRow = logs.find(row => row.phase === 'current' && row.url === url);
    assert.ok(currentRow, `configured fresh asset was fetched from current source: ${url}`);
    assert.ok(!logs.some(row => row.phase === oldPhase && row.url === url), `configured fresh asset was not primed from old root: ${url}`);
    const pathname = new URL(url, base).pathname;
    const currentSha256 = await sha(path.join(repo, pathname));
    assert.equal(currentRow.sha256, currentSha256, `configured fresh asset response matches current source SHA: ${url}`);
    freshAssetEvidence.push({ url, sourceSha256: currentSha256, servedSha256: currentRow.sha256, servedFromCurrentRoot: true });
  }
  const coreCacheEvidence = [];
  for (const url of coreFreshUrls.filter(value => !expectedFreshURLs.includes(value))) {
    const oldRow = logs.find(row => row.phase === oldPhase && row.url === url);
    assert.ok(oldRow, `unchanged core asset was primed from ${oldLabel}: ${url}`);
    assert.ok(normalizedCacheHits.includes(url), `unchanged core asset remained an HTTP cache hit: ${url}`);
    const oldSha256 = await sha(path.join(oldRoot, new URL(url, base).pathname));
    assert.equal(oldRow.sha256, oldSha256, `unchanged core response matches ${oldLabel} source SHA: ${url}`);
    coreCacheEvidence.push({ url, sourceSha256: oldSha256, servedSha256: oldRow.sha256, servedFromOldRootCache: true });
  }
  const sharedControlsLogs = logs.filter(row => row.url.startsWith('/js/tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1'));
  const sharedControlsOld = sharedControlsLogs.find(row => row.phase === oldPhase);
  const sharedControlsCurrent = sharedControlsLogs.find(row => row.phase === 'current');
  if (sharedControlsOld) {
    const sharedControlsUrl = sharedControlsOld.url;
    assert.ok(normalizedCacheHits.includes(sharedControlsUrl), 'unchanged shared header-controls module remains an HTTP cache hit');
    assert.equal(sharedControlsOld.sha256, await sha(path.join(oldRoot, new URL(sharedControlsUrl, base).pathname)), 'cached header-controls response matches old-root source');
  } else assert.ok(sharedControlsCurrent, 'shared header-controls module loaded from current source when absent from old-root cache');
  assert.equal(new Set(sharedControlsLogs.map(row => row.sha256)).size, 1, 'all responses for canonical shared controls URL share one body hash');
  assert.equal(report.externalRequests.length, 0, 'no external browser requests were issued');
  const unversionedModuleUrls = [...new Set(report.variants.flatMap(row => row.hostMetrics.unversionedModuleUrls.concat(row.docMetrics.unversionedModuleUrls || [])))].sort();
  report.cache = {
    oldRoot: report.oldRoot,
    expectedFreshURLs,
    freshAssetsFromCurrentRoot: freshAssetEvidence,
    unchangedCoreAssetsFromOldRootCache: coreCacheEvidence,
    oldCanonicalModuleUrl: oldEntryUrl,
    oldCanonicalRequestCount: canonicalOldRequests.length,
    browserHttpCacheHitForCanonicalOldModule: oldCanonicalHit,
    newRuntimeFetchedFromCurrentRoot: currentNewRuntime.map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 })),
    sharedHeaderControlsResponses: sharedControlsLogs.map(({ phase, url, bytes, sha256 }) => ({ phase, url, bytes, sha256 })),
    cacheHitUrls: normalizedCacheHits,
    unversionedModuleUrls,
    noPlaywrightRequestRouting: true,
  };
  await writeFile(`${out}/server-log.json`, JSON.stringify(logs, null, 2));
  await writeFile(`${out}/cache-upgrade-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    result: 'PASS', engine: report.engine, oldRoot: report.oldRoot, expectedFreshURLs, oldEntrySha256: report.oldEntrySha256, currentEntrySha256: report.currentEntrySha256,
    project: report.oldProject, variants: report.variants.length, oldCanonicalModuleHttpCacheHit: oldCanonicalHit,
    newRuntimeModuleCount: currentNewRuntime.length, sharedControlsResponses: sharedControlsLogs.length,
    externalRequests: report.externalRequests.length, unversionedModuleUrls: report.cache.unversionedModuleUrls,
    evidence: out,
  }, null, 2));
} catch (error) {
  report.failures.push({ message: error?.message || String(error), stack: error?.stack || null });
  await browserContext?.pages()[0]?.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${out}/server-log.json`, JSON.stringify(logs, null, 2)).catch(() => {});
  await writeFile(`${out}/cache-upgrade-results.json`, JSON.stringify(report, null, 2)).catch(() => {});
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browserContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
