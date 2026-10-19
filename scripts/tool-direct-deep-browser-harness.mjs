/** Synthetic, localhost-only direct-runtime QA for concurrency, recovery and viewport lifecycle. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_DIRECT_OUTPUT || '/tmp/pixieed-stage2/acceptance';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(modulePath).href);
const engine = process.env.PIXIEED_BROWSER_ENGINE || 'chromium';
assert.ok(['chromium','webkit'].includes(engine));
await mkdir(out, { recursive: true });
const browser = await playwright[engine].launch({ headless: true, ...(process.env.PIXIEED_WEBKIT_EXECUTABLE && engine === 'webkit' ? { executablePath:process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
const report = { engine, engineVersion: browser.version(), base, externalRequestsSent: 0, blockedRequests: [], cases: [], failures: [], cleanupWarnings: [], limitations: [
  'Synthetic selected engine only; hardware camera, physical mobile keyboards, and installed Safari app are untested.',
  'The harness permits only same-origin GET/HEAD requests and uses fresh isolated browser storage.'
] };
if (engine === 'webkit') report.limitations.push('With the available WebKit 2272 and Playwright 1.62.1, page.close() remains pending even on about:blank; disposable pages are released with awaited BrowserContext.close(). A bounded isolated reproduction is recorded at /tmp/pixieed-stage4/webkit/close-diagnostic.json.');
const selectedCases = new Set((process.env.PIXIEED_DIRECT_DEEP_CASES || '').split(',').map(value => value.trim()).filter(Boolean));

async function context(row, { delayedCamera = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  const cameraDelay = { release: null, hit: null, hitPromise: null };
  if (delayedCamera) cameraDelay.hitPromise = new Promise(resolve => { cameraDelay.hit = resolve; });
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
      const blocked = { method: request.method(), url: request.url() }; row.blocked.push(blocked); report.blockedRequests.push(blocked); return route.abort();
    }
    if (url.pathname === '/js/creation/creation-camera.mjs' && delayedCamera) {
      const response = await route.fetch(); cameraDelay.hit();
      await new Promise(resolve => { cameraDelay.release = resolve; });
      return route.fulfill({ response });
    }
    return route.continue();
  });
  await ctx.addInitScript(() => {
    window.__qaFailIdbWrite = false;
    window.__qaMedia = { requests:0, constraints:[] };
    if (navigator.mediaDevices) {
      const syntheticMediaDevices = {
        getSupportedConstraints: () => ({ zoom:true }),
        getUserMedia: async constraints => {
          window.__qaMedia.requests++;
          window.__qaMedia.constraints.push(constraints);
          throw new DOMException('Synthetic QA permission denial', 'NotAllowedError');
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable:true, enumerable:true, value:syntheticMediaDevices });
      if (navigator.mediaDevices !== syntheticMediaDevices || navigator.mediaDevices.getUserMedia !== syntheticMediaDevices.getUserMedia) {
        throw new Error('Deep QA fixture failed to replace navigator.mediaDevices; native media must remain unreachable');
      }
    }
    const syntheticPermissions = { query:async () => ({ state:'denied' }) };
    Object.defineProperty(navigator, 'permissions', { configurable:true, enumerable:true, value:syntheticPermissions });
    if (navigator.permissions !== syntheticPermissions || navigator.permissions.query !== syntheticPermissions.query) {
      throw new Error('Deep QA fixture failed to replace navigator.permissions; browser permission state must remain unreachable');
    }
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__qaFailIdbWrite) {
        window.__qaFailIdbWrite = false;
        throw new DOMException('Synthetic IndexedDB write failure', 'UnknownError');
      }
      return originalPut.apply(this, args);
    };
  });
  return { ctx, cameraDelay };
}

async function ready(page, mode = 'draw') {
  await page.waitForFunction(expected => {
    const host = window.__PIXIEED_CREATION_HOST__;
    return document.documentElement.dataset.toolDirect === 'work' && host?.active
      && host.runtime?.state?.ready && host.runtime.state.mode === expected
      && document.querySelector('[data-embed-start]')?.getAttribute('aria-busy') === 'false';
  }, mode);
  assert.equal(await page.locator('iframe').count(), 0);
  return page.evaluateHandle(() => window.__PIXIEED_CREATION_HOST__.runtime);
}
async function open(page, mode = 'draw', search = 'runtime=direct&workspace=1') {
  await page.goto(`${base}/${mode}/?${search}`);
  return ready(page, mode);
}
async function paint(page, x, y) {
  const canvas = page.locator('#draw-canvas'), box = await canvas.boundingBox();
  const size = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
  await page.mouse.click(box.x + (x + .5) * box.width / size.width, box.y + (y + .5) * box.height / size.height);
}
const snapshot = runtime => runtime.evaluate(rt => rt.getState());
function row(name) { const value = { name, checks: [], errors: [], blocked: [] }; report.cases.push(value); return value; }
function done(value, text) { value.checks.push(text); }
async function boundedCleanup(operation, label, timeoutMs = 5000) {
  let timer;
  const result = await Promise.race([
    Promise.resolve(operation).then(() => ({ ok:true }), error => ({ ok:false, error:String(error) })),
    new Promise(resolve => { timer=setTimeout(() => resolve({ ok:false, timeout:true }), timeoutMs); })
  ]);
  clearTimeout(timer);
  if (!result.ok) report.cleanupWarnings.push({ cleanup:label, ...(result.timeout ? { warning:`${label} did not settle within ${timeoutMs}ms.` } : { error:result.error }) });
  return result.ok;
}

async function run(name, body, options) {
  if (selectedCases.size && !selectedCases.has(name)) return;
  const result = row(name), { ctx, cameraDelay } = await context(result, options);
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => result.errors.push(error.message));
  try { await body({ page, ctx, cameraDelay, result }); assert.deepEqual(result.errors, []); result.bodyComplete=true; console.log('BODY_COMPLETE', name, result.checks.length); }
  catch (error) {
    result.failure = error.stack || String(error); report.failures.push(name);
    result.diagnostics = await page.evaluate(() => ({ mode:document.body.dataset.creationMode, status:document.querySelector('#draw-music-status')?.textContent, output:document.querySelector('#draw-music-settings')?.open, wavDisabled:document.querySelector('#draw-music-wav')?.disabled, active:window.__PIXIEED_CREATION_HOST__?.active })).catch(() => null);
    console.error('FAIL', name, error.message);
    await page.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true }).catch(() => {});
  }
  finally {
    await writeFile(`${out}/direct-deep-results.json`, JSON.stringify(report, null, 2));
    await boundedCleanup(ctx.close(), `context.close:${name}`);
    await writeFile(`${out}/direct-deep-results.json`, JSON.stringify(report, null, 2));
  }
}

async function readHead(page, projectId) {
  return page.evaluate(async id => {
    const request = indexedDB.open('pixieed-pxd-v1', 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const row = await new Promise((resolve, reject) => { const get = db.transaction('projects').objectStore('projects').get(id); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    db.close(); return row?.history?.at(-1)?.revisionId || null;
  }, projectId);
}

await run('same-project-two-tab-conflict-and-duplicate-recovery', async ({ page, ctx, result }) => {
  const first = await open(page);
  await paint(page, 2, 2); await first.evaluate(rt => rt.draw.workspace.save());
  const original = await page.evaluate(() => ({ ...window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.currentProject }));
  const pointer = await page.evaluate(() => ({ projectId: new URL(location.href).searchParams.get('pxd'), revisionId: new URL(location.href).searchParams.get('pxdRevision') }));
  assert.ok(pointer.projectId && pointer.revisionId);

  const secondPage = await ctx.newPage(); secondPage.setDefaultTimeout(20000);
  const second = await open(secondPage, 'draw', `runtime=direct&workspace=1&pxd=${encodeURIComponent(pointer.projectId)}&pxdRevision=${encodeURIComponent(pointer.revisionId)}`);
  const baseState = await snapshot(first), secondBase = await snapshot(second);
  assert.equal(secondBase.image.hash, baseState.image.hash, 'both tabs load the same saved pixels');
  assert.equal(secondBase.timeline.hash, baseState.timeline.hash, 'both tabs load the same saved timeline');
  await paint(page, 3, 3); const firstLocal = await snapshot(first);
  await paint(secondPage, 6, 5); const secondLocal = await snapshot(second);
  assert.notEqual(firstLocal.image.hash, secondLocal.image.hash);

  await first.evaluate(rt => rt.draw.workspace.save());
  const firstRevision = await page.evaluate(() => new URL(location.href).searchParams.get('pxdRevision'));
  assert.notEqual(firstRevision, pointer.revisionId);
  assert.equal(await readHead(page, pointer.projectId), firstRevision, 'first tab owns the latest CAS revision');
  const conflict = await second.evaluate(rt => rt.draw.workspace.save().then(() => null, error => error.code));
  assert.equal(conflict, 'PXD_STORE_CONFLICT');
  assert.deepEqual(await snapshot(second), secondLocal, 'conflict leaves second-tab artwork untouched');
  assert.equal(await second.evaluate(rt => rt.draw.workspace.dirty), true);
  assert.equal(await readHead(page, pointer.projectId), firstRevision, 'conflicting tab cannot overwrite the first saved revision');
  done(result, 'two tabs mutate the same revision; compare-and-swap rejects the second save and retains its art');

  await secondPage.locator('#creation-file-open').click();
  await secondPage.locator('#project-tab-library').click();
  await secondPage.locator(`#project-${pointer.projectId}`).waitFor({ state: 'visible' });
  await secondPage.locator(`#project-${pointer.projectId}`).click();
  await secondPage.waitForFunction(id => {
    const node = document.querySelector('#pxd-file-status');
    return !document.querySelector('#pxd-panel')?.open && node?.textContent.includes('別の作品に保存');
  }, pointer.projectId);
  const ids = await page.evaluate(async () => {
    const request = indexedDB.open('pixieed-pxd-v1', 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise((resolve, reject) => { const get = db.transaction('projects').objectStore('projects').getAll(); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    db.close(); return rows.map(item => item.projectId);
  });
  assert.ok(ids.includes(pointer.projectId));
  assert.ok(ids.some(id => id !== pointer.projectId), 'recovery created a separate saved project');
  assert.equal(await readHead(page, pointer.projectId), firstRevision, 'original project stays at first tab revision');
  done(result, 'duplicate recovery saves conflicted edits as a separate project and retains original head');
  result.twoTabBodyComplete=true;
  // WebKit 2272 does not settle the WebDriver browsingContext.close command
  // issued by Playwright Page.close(), including for about:blank. The case
  // ends here; run() awaits ctx.close(), which closes both disposable pages.
}, {});

await run('existing-project-indexeddb-write-failure-and-retry', async ({ page, result }) => {
  const runtime = await open(page);
  await paint(page, 2, 2); await runtime.evaluate(rt => rt.draw.workspace.save());
  const pointer = await page.evaluate(() => ({ projectId: new URL(location.href).searchParams.get('pxd'), revisionId: new URL(location.href).searchParams.get('pxdRevision') }));
  const oldHead = await readHead(page, pointer.projectId); assert.equal(oldHead, pointer.revisionId);
  await paint(page, 4, 6); const edited = await snapshot(runtime);
  await page.evaluate(() => { window.__qaFailIdbWrite = true; });
  const errorCode = await runtime.evaluate(rt => rt.draw.workspace.save().then(() => null, error => error.code));
  assert.equal(errorCode, 'PXD_IDB_WRITE_FAILED');
  assert.deepEqual(await snapshot(runtime), edited, 'failed save keeps the exact edited image and timeline');
  assert.equal(await runtime.evaluate(rt => rt.draw.workspace.dirty), true);
  assert.equal(await readHead(page, pointer.projectId), oldHead, 'failed IndexedDB write leaves old revision intact');
  const currentUrlRevision = await page.evaluate(() => new URL(location.href).searchParams.get('pxdRevision'));
  assert.equal(currentUrlRevision, oldHead);
  done(result, 'synthetic IndexedDB object-store write failure preserves art, dirty state, pointer and old head');
  await runtime.evaluate(rt => rt.draw.workspace.save());
  const retryHead = await readHead(page, pointer.projectId);
  assert.ok(retryHead && retryHead !== oldHead, 'retry writes a new revision after failure');
  assert.equal(await runtime.evaluate(rt => rt.draw.workspace.dirty), false);
  done(result, 'explicit retry saves retained edits to a new revision');
}, {});

await run('retained-history-pointer-mode-query-and-reload', async ({ page, result }) => {
  const opaqueSearch = 'runtime=direct&keep=alpha&keep=beta';
  await page.goto(`${base}/draw/?${opaqueSearch}#history-retention`);
  await page.locator('[data-embed-start]').click();
  const runtime = await ready(page, 'draw');
  await paint(page, 2, 2); await runtime.evaluate(rt => rt.draw.workspace.save());
  const rev1 = await page.evaluate(() => new URL(location.href).searchParams.get('pxdRevision'));
  assert.ok(rev1);
  await page.locator('[data-shell-explanation]').click();
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');

  await page.locator('[data-embed-start]').click(); await ready(page, 'draw');
  await paint(page, 7, 5); await runtime.evaluate(rt => rt.draw.workspace.save());
  const rev2 = await page.evaluate(() => new URL(location.href).searchParams.get('pxdRevision'));
  assert.ok(rev2 && rev2 !== rev1);
  const latest = await snapshot(runtime);
  await page.locator('[data-shell-explanation]').click();
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');

  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'work' && window.__PIXIEED_CREATION_HOST__?.active);
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
  const staleExplanation = await page.evaluate(() => ({
    revision: new URL(location.href).searchParams.get('pxdRevision'),
    workspace: new URL(location.href).searchParams.has('workspace')
  }));
  assert.equal(staleExplanation.revision, rev2, 'popstate hide synchronizes the explanation entry to the retained latest revision');
  assert.equal(staleExplanation.workspace, false);
  await page.locator('[data-embed-start]').click(); await ready(page, 'draw');
  const resumedUrl = await page.evaluate(() => { const url = new URL(location.href); return { revision:url.searchParams.get('pxdRevision'), keep:url.searchParams.getAll('keep'), hash:url.hash }; });
  assert.equal(resumedUrl.revision, rev2, 'resume replaces the stale project pointer with the retained latest revision');
  assert.deepEqual(resumedUrl.keep, ['alpha', 'beta']);
  assert.equal(resumedUrl.hash, '#history-retention');
  assert.deepEqual(await snapshot(runtime), latest, 'resume restores current revision artwork rather than stale history pixels');
  done(result, 'browser back to an old explanation entry synchronizes its project pointer to the latest saved revision');

  await page.reload(); await ready(page, 'draw');
  assert.deepEqual(await page.evaluate(() => ({ revision:new URL(location.href).searchParams.get('pxdRevision'), keep:new URL(location.href).searchParams.getAll('keep'), hash:location.hash })), { revision:rev2, keep:['alpha','beta'], hash:'#history-retention' });
  const reloaded = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.getState());
  assert.deepEqual({ image:reloaded.image, timeline:reloaded.timeline }, { image:latest.image, timeline:latest.timeline }, 'reload restores exact latest saved pixels and timeline');
  done(result, 'reload opens exact latest saved revision, image and timeline');

  await page.goto(`${base}/audio/?runtime=direct&workspace=1&keep=gamma&keep=delta#mode-retention`);
  const audioRuntime = await ready(page, 'audio');
  await audioRuntime.evaluate(rt => rt.modes.switchMode('draw'));
  await page.waitForFunction(() => document.body.dataset.creationMode === 'draw');
  await page.locator('[data-shell-explanation]').click();
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
  assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('mode')), 'draw', 'hide stores explicit Draw mode even on the audio route');
  await page.locator('[data-embed-start]').click(); await ready(page, 'draw');
  assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('mode')), 'draw');
  assert.deepEqual(await page.evaluate(() => new URL(location.href).searchParams.getAll('keep')), ['gamma','delta']);
  assert.equal(await page.evaluate(() => location.hash), '#mode-retention');
  await page.reload(); await ready(page, 'draw');
  assert.equal(await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.state.mode), 'draw', 'audio route reload must honor retained explicit Draw mode');
  done(result, 'audio route retains explicit Draw mode through explanation, resume and reload');
}, {});

await run('input-undo-tab-trap-and-rapid-async-switch-hide', async ({ page, cameraDelay, result }) => {
  const runtime = await open(page);
  await paint(page, 2, 2); const painted = await snapshot(runtime);
  await page.locator('#creation-file-open').click();
  await page.locator('#project-tab-library').click();
  const search = page.locator('#project-search'); await search.fill('synthetic search'); await search.focus();
  await page.keyboard.press('Control+z');
  assert.deepEqual(await snapshot(runtime), painted, 'Ctrl+Z in a text input must not undo the drawing');
  assert.equal(await search.evaluate(node => node === document.activeElement), true);
  done(result, 'text-field undo stays in the field and does not reach the drawing timeline');
  await page.locator('#pxd-panel').evaluate(dialog => { if (dialog.open) dialog.close(); });

  await page.evaluate(() => {
    const modes = window.__PIXIEED_CREATION_HOST__?.runtime?.modes;
    if (!modes) throw new Error('direct runtime is missing');
    window.__qaCameraSwitch = modes.switchMode('camera');
  });
  await cameraDelay.hitPromise;
  await page.evaluate(() => {
    const modes = window.__PIXIEED_CREATION_HOST__.runtime.modes;
    window.__qaRapid = Promise.all([window.__qaCameraSwitch, modes.switchMode('audio'), modes.switchMode('draw')]);
  });
  await page.locator('[data-shell-explanation]').click();
  await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
  cameraDelay.release();
  await page.evaluate(() => window.__qaRapid);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.state.mode), 'draw');
  assert.equal(await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.active), false);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#pixelStudio').length), 0, 'stale camera load must not append an active camera UI while hidden');
  assert.equal(await page.evaluate(() => window.__qaMedia.requests), 0, 'stale camera mode initialization must not request hardware media');
  done(result, 'rapid mode requests followed by hide during delayed camera initialization cancel stale mode and UI');

  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[data-direct-owned]'))), false, 'Tab must not enter hidden editor nodes');
  }
  done(result, 'repeated Tab navigation while hidden never focuses editor nodes');

  await page.locator('[data-embed-start]').click(); await ready(page, 'draw');
  await page.setViewportSize({ width: 844, height: 320 }); await page.waitForTimeout(120);
  const bounds = await page.evaluate(() => {
    const read = selector => { const n = document.querySelector(selector); if (!n) return null; const r = n.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    return { width: innerWidth, height: innerHeight, bar:read('.tool-direct__bar'), nav:read('.app-tabs'), mode:read('#creation-mode-menu'), viewport:read('.draw-viewport'), pageWidth:document.documentElement.scrollWidth };
  });
  assert.ok(bounds.bar && bounds.bar.left >= -1 && bounds.bar.right <= bounds.width + 1 && bounds.bar.bottom <= bounds.height + 1, JSON.stringify(bounds));
  assert.ok(bounds.nav && bounds.nav.left >= -1 && bounds.nav.right <= bounds.width + 1 && bounds.nav.top >= -1 && bounds.nav.bottom <= bounds.height + 1, JSON.stringify(bounds));
  assert.ok(bounds.pageWidth <= bounds.width + 1, JSON.stringify(bounds));
  done(result, `320px-high rotated/keyboard-like viewport keeps shell bar/nav bounded: ${JSON.stringify(bounds)}`);
}, { delayedCamera: true });

await run('png-decoded-rgba-matches-real-draw-image', async ({ page, result }) => {
  const runtime = await open(page);
  await paint(page, 2, 2); await paint(page, 3, 4);
  const source = await runtime.evaluate(rt => {
    const image = rt.draw.getImage();
    return { width:image.width, height:image.height, rgba:Array.from(image.rgba) };
  });
  const downloadEvent = page.waitForEvent('download'); await page.locator('#creation-output-open').click();
  const download = await downloadEvent, pngPath = `${out}/direct-rgba-check.png`; await download.saveAs(pngPath);
  const base64 = (await readFile(pngPath)).toString('base64');
  const comparison = await page.evaluate(async ({ source, base64 }) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently:true }); ctx.drawImage(image, 0, 0); const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const differences = [];
    for (let y=0; y<source.height; y++) for (let x=0; x<source.width; x++) {
      const sx=Math.min(canvas.width-1,Math.floor((x+.5)*canvas.width/source.width)), sy=Math.min(canvas.height-1,Math.floor((y+.5)*canvas.height/source.height));
      const si=(y*source.width+x)*4, ai=(sy*canvas.width+sx)*4;
      for (let c=0;c<4;c++) if (source.rgba[si+c] !== actual[ai+c]) { if (differences.length<8) differences.push({x,y,channel:c,source:source.rgba[si+c],actual:actual[ai+c]}); break; }
    }
    return { width:canvas.width,height:canvas.height,sourceWidth:source.width,sourceHeight:source.height,differences };
  }, { source, base64 });
  assert.ok(comparison.width >= source.width && comparison.height >= source.height);
  assert.deepEqual(comparison.differences, [], JSON.stringify(comparison));
  done(result, `decoded PNG dimensions ${comparison.width}×${comparison.height}; sampled nearest-neighbor RGBA exactly matches draw image`);
}, {});

await run('wav-header-and-rendered-frame-count', async ({ page, result }) => {
  const runtime = await open(page, 'audio');
  await runtime.evaluate(rt => rt.draw.selectMusicLayer());
  const settings = page.locator('#draw-music-settings');
  await settings.evaluate(node => { node.open = true; });
  // Assign a voice to a concrete palette color, then place one note on the
  // reserved music cel through the real Draw API. Ordinary art pixels do not
  // become notes in the shared-track model.
  await page.locator('#draw-palette [data-color-index="2"]').click();
  await settings.evaluate(node => {
    node.open = true;
    for (const [selector, value] of [['#draw-music-instrument', 'triangle'], ['#draw-music-loops', '1']]) {
      const control = node.querySelector(selector); control.value = value; control.dispatchEvent(new Event('change', { bubbles:true }));
    }
  });
  await runtime.evaluate(rt => {
    const doc = rt.draw.getDocument();
    const pixels = new Array(doc.width * doc.height).fill(-1);
    pixels[Math.floor(doc.height / 2) * doc.width + 2] = 2;
    rt.draw.applyMusicPage({ ...doc, pixels }, { record:true, select:true });
  });
  const noteState = await snapshot(runtime);
  assert.ok(noteState.timeline.hash, 'music mode exposes a timeline snapshot');
  const musicInputs = await page.evaluate(() => ({ mode:document.body.dataset.creationMode, instrument:document.querySelector('#draw-music-instrument')?.value, status:document.querySelector('#draw-music-status')?.textContent }));
  result.musicInputs = musicInputs;
  result.musicTimeline = noteState.timeline;
  const wavDownload = page.waitForEvent('download');
  await settings.evaluate(node => node.querySelector('#draw-music-wav').click());
  const download = await wavDownload, wavPath = `${out}/synthetic-music.wav`;
  await download.saveAs(wavPath);
  const output = { filename:download.suggestedFilename(), bytes:Array.from(await readFile(wavPath)) };
  assert.match(output.filename, /\.wav$/i);
  const bytes = new Uint8Array(output.bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(String.fromCharCode(...bytes.subarray(0,4)), 'RIFF'); assert.equal(String.fromCharCode(...bytes.subarray(8,12)), 'WAVE');
  assert.equal(view.getUint16(20,true),1,'PCM format');
  const channels=view.getUint16(22,true), sampleRate=view.getUint32(24,true), bits=view.getUint16(34,true), dataSize=view.getUint32(40,true);
  const frames=dataSize/(channels*(bits/8));
  assert.equal(channels,2); assert.equal(sampleRate,44100); assert.equal(bits,16); assert.ok(Number.isInteger(frames)&&frames>0);
  assert.equal(bytes.byteLength,44+dataSize);
  done(result, `staged WAV ${output.filename} valid: stereo ${sampleRate}Hz 16-bit PCM, ${frames} frames (${(frames/sampleRate).toFixed(2)}s)`);
}, {});

try { /* test bodies above run in sequence */ }
finally {
  await boundedCleanup(browser.close(), 'browser.close');
  await writeFile(`${out}/direct-deep-results.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases:report.cases.length, failures:report.failures, blockedRequests:report.blockedRequests.length, output:out }));
if (report.failures.length || report.blockedRequests.length) process.exitCode = 1;
