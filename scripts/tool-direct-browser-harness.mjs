/** Local-only direct-runtime acceptance. Uses fresh isolated storage and blocks all nonlocal/mutating requests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost browser target is allowed');
const out = process.env.PIXIEED_DIRECT_OUTPUT || '/tmp/pixieed-stage2/acceptance';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE
  || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(playwrightPath).href);
const engine = process.env.PIXIEED_BROWSER_ENGINE || 'chromium';
assert.ok(['chromium','webkit'].includes(engine));
await mkdir(out, { recursive: true });
const browser = await playwright[engine].launch({ headless: true, ...(process.env.PIXIEED_WEBKIT_EXECUTABLE && engine === 'webkit' ? { executablePath:process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
const report = {
  engine, engineVersion: browser.version(), exportVerification: process.env.PIXIEED_CAPTURE_EXPORT_BLOBS === '1' ? 'captured generated Blob bytes; native file reception untested' : 'native browser download bytes', base, externalRequestsSent: 0, blockedRequests: [],
  cases: [], failures: [], limitations: [
    'Selected automated engine only; installed Safari app, physical mobile keyboard/rotation, and hardware camera are untested.',
    'Only same-origin GET/HEAD requests are allowed; network writes and external traffic are blocked.'
  ]
};

const sentinel = {
  draw: JSON.stringify({ projectId: 'legacy-draw-sentinel', revisionId: 'legacy-draw-revision' }),
  creation: JSON.stringify({ projectId: 'legacy-shared-sentinel', revisionId: 'legacy-shared-revision' })
};
const captureExports = process.env.PIXIEED_CAPTURE_EXPORT_BLOBS === '1';
const selectedCases = new Set((process.env.PIXIEED_DIRECT_CASES || '').split(',').map(value => value.trim()).filter(Boolean));
const progressEnabled = process.env.PIXIEED_DIRECT_PROGRESS === '1';
const progress = (label, step) => { if (progressEnabled) console.log('STEP', label, step); };
async function exportToFile(page, action, destination) {
  if (!captureExports) {
    const pending = page.waitForEvent('download'); await action();
    await (await pending).saveAs(destination); return;
  }
  const before = await page.evaluate(() => window.__qaExports.length);
  await action(); await page.waitForFunction(count => window.__qaExports.length > count, before);
  const bytes = await page.evaluate(async index => [...new Uint8Array(await window.__qaExports[index].blob.arrayBuffer())], before);
  await writeFile(destination, Buffer.from(bytes));
}
async function newContext(viewport, row) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) {
      const blocked = { method: request.method(), url: request.url() };
      report.blockedRequests.push(blocked); row.blocked.push(blocked);
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(({ sentinelDraw, sentinelCreation }) => {
    localStorage.setItem('pixieed:pxd:last:draw', sentinelDraw);
    localStorage.setItem('pixieed:pxd:last:creation', sentinelCreation);
    // Explicitly opt this clean-room baseline out of newly supported legacy
    // pointer migration, while preserving any real remembered direct pointer.
    if (localStorage.getItem('pixieed:pxd:last:direct-workspace:v1') === null) localStorage.setItem('pixieed:pxd:last:direct-workspace:v1', 'null');
    window.__directQa = { mediaRequests: 0, audioContexts: 0 };
    window.__directQaPermissionQueries = 0;
    window.__directQaAsyncErrors = [];
    addEventListener('error', event => window.__directQaAsyncErrors.push(event.error?.stack || event.message || 'window error'));
    addEventListener('unhandledrejection', event => window.__directQaAsyncErrors.push(event.reason?.stack || String(event.reason)));
    window.__directQaMediaConstraints = [];
    if (navigator.mediaDevices) {
      const syntheticMediaDevices = {
        getSupportedConstraints: () => ({ zoom: true }),
        getUserMedia: async constraints => {
        window.__directQa.mediaRequests++;
        window.__directQaMediaConstraints.push(constraints);
        throw new DOMException('Synthetic QA permission denial', 'NotAllowedError');
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable:true, enumerable:true, value:syntheticMediaDevices });
      if (navigator.mediaDevices !== syntheticMediaDevices || navigator.mediaDevices.getUserMedia !== syntheticMediaDevices.getUserMedia) {
        throw new Error('QA safety fixture failed to replace navigator.mediaDevices; no media request may run');
      }
    }
    const syntheticPermissions = { query: async () => { window.__directQaPermissionQueries++; return { state:'denied' }; } };
    Object.defineProperty(navigator, 'permissions', { configurable:true, enumerable:true, value:syntheticPermissions });
    if (navigator.permissions !== syntheticPermissions || navigator.permissions.query !== syntheticPermissions.query) {
      throw new Error('QA safety fixture failed to replace navigator.permissions; no permission query may reach browser state');
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) window.AudioContext = class extends Audio {
      constructor(...args) { super(...args); window.__directQa.audioContexts++; }
    };
  }, { sentinelDraw: sentinel.draw, sentinelCreation: sentinel.creation });
  if (captureExports) await context.addInitScript(() => {
    window.__qaExports = []; const blobs = new Map();
    const create = URL.createObjectURL.bind(URL); URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      if (this.download && blobs.has(this.href)) { __qaExports.push({ name:this.download, blob:blobs.get(this.href) }); return; }
      return click.apply(this,args);
    };
  });
  return context;
}

async function waitDirect(page, mode) {
  await page.waitForFunction(expected => {
    const host = window.__PIXIEED_CREATION_HOST__;
    return document.documentElement.dataset.toolDirect === 'work' && host?.active
      && host.runtime?.state?.ready && host.runtime?.state?.mode === expected
      && document.querySelector('[data-embed-start]')?.getAttribute('aria-busy') === 'false';
  }, mode);
  assert.equal(await page.locator('iframe').count(), 0, 'direct runtime must not create an iframe');
  return page.evaluateHandle(() => window.__PIXIEED_CREATION_HOST__.runtime);
}
const state = runtime => runtime.evaluate(rt => rt.getState());
const check = (row, label) => row.checks.push(label);

async function runCase(mode, viewport) {
  const label = `${mode}-${viewport.width}`;
  if (selectedCases.size && !selectedCases.has(label)) return;
  const row = { label, viewport, checks: [], blocked: [], errors: [] };
  report.cases.push(row);
  const context = await newContext(viewport, row);
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => row.errors.push(error.message));
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin !== base) row.errors.push(`external request failed unexpectedly: ${request.url()}`);
  });
  try {
    const route = `/${mode}/?keep=one&keep=two#acceptance`;
    await page.goto(`${base}${route}`);
    progress(label, 'description-loaded');
    await page.locator('[data-embed-start]').waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    assert.equal(await page.locator('iframe').count(), 0);
    const initialResources = await page.evaluate(() => performance.getEntriesByType('resource').map(item => new URL(item.name).pathname));
    assert.equal(initialResources.some(path => /draw\/editor\.html|draw-page|creation-runtime|creation-camera|draw-music\.mjs|draw-runtime|\.wasm$/.test(path)), false,
      'description view must not request editor runtime or heavy media');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'intro must fit viewport width');
    const startBox = await page.locator('[data-embed-start]').boundingBox();
    assert.ok(startBox && startBox.y >= 0 && startBox.y + startBox.height <= viewport.height, 'start control must be reachable in the first viewport');
    const untouched = await page.evaluate(() => ({ ...window.__directQa }));
    assert.deepEqual(untouched, { mediaRequests: 0, audioContexts: 0 }, 'no media permission or AudioContext before explicit use');
    check(row, 'description-first view, reachable CTA, no iframe/editor/media preload; explanation is passive');

    await page.locator('[data-embed-start]').click();
    const runtimeHandle = await waitDirect(page, mode);
    progress(label, 'runtime-ready');
    await page.evaluate(() => {
      window.__qaRuntime = window.__PIXIEED_CREATION_HOST__.runtime;
      window.__qaDrawInstance = window.__qaRuntime.draw;
      window.__qaCanvas = document.querySelector('#draw-canvas');
    });
    assert.deepEqual(await page.evaluate(() => new URL(location.href).searchParams.getAll('keep')), ['one', 'two']);
    assert.equal(await page.evaluate(() => new URL(location.href).hash), '#acceptance');
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('workspace')), '1');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#draw-canvas').length), 1);
    const afterEntry = await page.evaluate(() => ({ ...window.__directQa }));
    if (mode === 'camera') {
      await page.waitForFunction(() => window.__directQa.mediaRequests === 1 && document.querySelector('#pixelStudio')?.dataset.mode === 'idle');
      assert.deepEqual(await page.evaluate(() => ({ ...window.__directQa })), { mediaRequests:1, audioContexts:0 }, 'one automatic request per explicit camera WORK entry; synthetic denial is safe');
      assert.ok(await page.locator('#cameraFallbackChoose').isEnabled(), 'denial preserves image import fallback');
      assert.deepEqual(await page.evaluate(() => window.__directQaMediaConstraints.map(value => value.audio)), [false], 'camera request must never ask for microphone access');
    } else assert.deepEqual(afterEntry, untouched);
    check(row, mode === 'camera'
      ? 'explicit start mounts camera once without iframe and attempts exactly one video-only request'
      : 'explicit start mounts requested mode once without iframe or media startup');

    const runtime = runtimeHandle;
    const drawMode = await runtime.evaluate(rt => rt.modes.switchMode('draw'));
    assert.equal(await page.evaluate(() => document.body.dataset.creationMode), 'draw');
    const beforeEdit = await state(runtime);
    const canvasBox = await page.locator('#draw-canvas').boundingBox();
    const canvasSize = await page.locator('#draw-canvas').evaluate(node => ({ width: node.width, height: node.height }));
    await page.mouse.click(canvasBox.x + canvasBox.width * 3.5 / canvasSize.width, canvasBox.y + canvasBox.height * 4.5 / canvasSize.height);
    const edited = await state(runtime);
    assert.notEqual(edited.image.hash, beforeEdit.image.hash, 'paint input should change image pixels');
    check(row, 'real draw edit produces observable snapshot');

    await page.locator('[data-shell-explanation]').click();
    await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation' && !window.__PIXIEED_CREATION_HOST__.active);
    assert.equal(await page.evaluate(() => document.activeElement.matches('[data-embed-start]')), true, 'close returns focus to start');
    const hiddenState = await state(runtime);
    await page.keyboard.press('Control+z');
    assert.deepEqual(await state(runtime), hiddenState, 'hidden editor must not receive global Undo shortcut');
    await page.goBack();
    await waitDirect(page, 'draw');
    assert.deepEqual(await state(runtime), edited, 'back reopens without changing pixels/timeline/history');
    assert.equal(await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime === window.__qaRuntime), true, 'Back must retain same runtime object');
    await page.goForward();
    await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
    assert.deepEqual(await state(runtime), edited, 'forward hides the retained editor without changing its timeline');
    await page.locator('[data-embed-start]').click();
    await waitDirect(page, 'draw');
    progress(label, 'retained-history-reopen-complete');
    assert.deepEqual(await state(runtime), edited, 'reopen reuses same real editor state');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#draw-canvas').length), 1);
    assert.equal(await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime === window.__qaRuntime), true);
    assert.equal(await page.evaluate(() => window.__qaRuntime.draw === window.__qaDrawInstance), true);
    assert.equal(await page.evaluate(() => document.querySelector('#draw-canvas') === window.__qaCanvas), true);
    check(row, 'hide/back/forward/reopen preserves pixels, history and instance identity');

    await runtime.evaluate(rt => rt.draw.workspace.save());
    progress(label, 'initial-project-save-complete');
    const savedPointer = await page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pxd:last:direct-workspace:v1') || 'null'));
    assert.ok(savedPointer?.projectId && savedPointer?.revisionId, 'save must persist isolated direct-workspace pointer');
    assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:pxd:last:draw')), sentinel.draw);
    assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:pxd:last:creation')), sentinel.creation);
    check(row, 'save uses direct-workspace key and leaves legacy pointer sentinels unchanged');

    if (mode === 'draw' && viewport.width === 1440) {
      const savedState = await state(runtime);
      const explicit = await context.newPage(); explicit.setDefaultTimeout(20000);
      await explicit.goto(`${base}/draw/?runtime=direct&workspace=1&pxd=${encodeURIComponent(savedPointer.projectId)}&pxdRevision=${encodeURIComponent(savedPointer.revisionId)}#explicit`);
      const explicitRuntime = await waitDirect(explicit, 'draw');
      progress(label, 'explicit-project-new-page-ready');
      assert.equal((await state(explicitRuntime)).image.hash, savedState.image.hash, 'explicit project pointer reload restores saved pixels');
      progress(label, 'explicit-project-state-verified');

      progress(label, 'opening-ordinary-new-page');
      const resumed = await context.newPage(); resumed.setDefaultTimeout(20000);
      await resumed.goto(`${base}/draw/?runtime=direct&workspace=1`);
      const resumedRuntime = await waitDirect(resumed, 'draw');
      progress(label, 'ordinary-fork-new-page-ready');
      const resumedProject = await resumedRuntime.evaluate(rt => rt.draw.workspace.currentProject?.projectId);
      assert.ok(resumedProject && resumedProject !== savedPointer.projectId, 'ordinary direct URL must fork the remembered project');
      assert.equal(await resumed.evaluate(() => localStorage.getItem('pixieed:pxd:last:draw')), sentinel.draw);
      assert.equal(await resumed.evaluate(() => localStorage.getItem('pixieed:pxd:last:creation')), sentinel.creation);
      check(row, 'explicit pointer reload restores saved state; ordinary new tab forks isolated direct workspace');
      progress(label, 'ordinary-project-state-verified');

      await page.locator('#creation-file-open').click();
      await page.locator('#project-tab-current').click();
      await page.locator('#pxd-panel .project-more > summary').click();
      const backupPath = `${out}/direct-project.pxd`;
      await exportToFile(page, () => page.locator('#pxd-export').click(), backupPath);
      progress(label, 'pxd-export-complete');
      const { decodePxd } = await import('../js/creation/pxd-codec.mjs');
      const decoded = await decodePxd(new Uint8Array(await readFile(backupPath)));
      assert.ok(decoded.entries.some(entry => entry.path === 'animations/main/state.json'));
      assert.ok(decoded.entries.some(entry => entry.path === 'audio/state.json'));
      check(row, 'project PXD backup downloads and decodes with real animation and audio state');
      await page.locator('#pxd-panel').evaluate(dialog => { if (dialog.open) dialog.close(); });
      await page.locator('[data-shell-explanation]').click();
      await page.locator('[data-embed-start]').waitFor({ state: 'visible' });
      await page.locator('[data-embed-start]').click();
      await waitDirect(page, 'draw');
      const pngPath = `${out}/direct-output.png`;
      await exportToFile(page, () => page.locator('#creation-output-open').click(), pngPath);
      progress(label, 'png-export-complete');
      assert.equal((await readFile(pngPath)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG export should produce PNG bytes');
      check(row, 'real PNG export returns valid bytes');
    }
    assert.deepEqual(row.errors, []);
    row.asyncErrors = await page.evaluate(() => window.__directQaAsyncErrors ?? []);
    assert.deepEqual(row.asyncErrors, [], 'no unhandled window errors or promise rejections');
    console.log('PASS', label, row.checks.length);
  } catch (error) {
    row.failure = error.stack || String(error); report.failures.push(label);
    console.error('FAIL', label, error.message);
    row.diagnostics = await page.evaluate(() => ({
      media: window.__directQa,
      permissionQueries: window.__directQaPermissionQueries,
      constraints: window.__directQaMediaConstraints,
      asyncErrors: window.__directQaAsyncErrors,
      mode: document.querySelector('#pixelStudio')?.dataset.mode ?? null,
      fallbackText: document.querySelector('#cameraFallbackChoose')?.textContent ?? null
    })).catch(() => null);
    await page.screenshot({ path: `${out}/${label}-failure.png`, fullPage: true }).catch(() => {});
  } finally {
    await context.close();
    await writeFile(`${out}/direct-results.json`, JSON.stringify(report, null, 2));
  }
}

try {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    for (const mode of ['draw', 'camera', 'audio']) await runCase(mode, viewport);
  }
  for (const mode of ['draw','camera','audio']) {
    const label = `home-default-${mode}`;
    if (selectedCases.size && !selectedCases.has(label)) continue;
    const row = { label, checks:[], blocked:[], errors:[] }; report.cases.push(row);
    const context = await newContext({width:390,height:844},row), page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror',error => row.errors.push(error.message));
    try {
      await page.goto(base + '/');
      const link = page.locator(`[data-static-tool="${mode === 'draw' ? 'editor' : mode === 'audio' ? 'sound' : 'camera'}"]`);
      assert.equal(await link.getAttribute('href'),`/${mode}/?workspace=1`); await link.click();
      const runtime = await waitDirect(page,mode); const before = await state(runtime);
      await page.locator('[data-shell-explanation]').click(); await page.locator('[data-embed-start]').click();
      await waitDirect(page,mode); assert.deepEqual(await state(runtime),before);
      if (mode === 'camera') {
        await page.waitForFunction(() => window.__directQa.mediaRequests === 1 && document.querySelector('#pixelStudio')?.dataset.mode === 'idle');
        assert.deepEqual(await page.evaluate(() => ({...window.__directQa})),{mediaRequests:1,audioContexts:0});
        assert.deepEqual(await page.evaluate(() => window.__directQaMediaConstraints.map(value => value.audio)),[false]);
      } else assert.deepEqual(await page.evaluate(() => ({...window.__directQa})),{mediaRequests:0,audioContexts:0});
      assert.deepEqual(row.errors,[]);
      row.asyncErrors = await page.evaluate(() => window.__directQaAsyncErrors ?? []);
      assert.deepEqual(row.asyncErrors, [], 'no unhandled window errors or promise rejections');
      check(row,mode==='camera'
        ? 'home CTA enters camera WORK with one video-only request and explanation resume does not repeat it'
        : 'home CTA enters default direct mode once with no media start, same work after explanation');
      console.log('PASS',row.label,row.checks.length);
    } catch(error) { row.failure=error.stack;report.failures.push(row.label);console.error('FAIL',row.label,error.message); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/direct-results.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, failures: report.failures, blockedRequests: report.blockedRequests.length, output: out }));
if (report.failures.length) process.exitCode = 1;
