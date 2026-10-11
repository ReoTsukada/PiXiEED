/** Local-only integration QA. Synthetic source streams never grant device permissions. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_MODES_OUTPUT || '/tmp/pixieed-creation-modes'; await mkdir(out, { recursive: true });
const { chromium, webkit } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const results = [], failures = [];
for (const name of (process.env.PIXIEED_BROWSER_ENGINES || 'chromium').split(',')) {
  const browser = await ({ chromium, webkit })[name].launch({ headless: true, ...(name === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
  try { for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }].filter(v => !process.env.PIXIEED_TEST_WIDTH || v.width === Number(process.env.PIXIEED_TEST_WIDTH))) {
    const context = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true });
    await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
    await context.addInitScript(() => {
      window.__media = { requests: 0, stops: 0, constraints: [], contexts: 0, closed: 0 };
      const Native = window.AudioContext || window.webkitAudioContext;
      if (Native) window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__media.contexts++; } close() { window.__media.closed++; return super.close(); } };
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async constraints => {
        window.__media.requests++; window.__media.constraints.push(constraints);
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#e75445'; ctx.fillRect(0, 0, 32, 64);
        const stream = canvas.captureStream(12); for (const track of stream.getTracks()) { const nativeStop = track.stop.bind(track); track.stop = () => { window.__media.stops++; nativeStop(); }; }
        return window.__delayMedia ? new Promise(resolve => { window.__resolveMedia = () => resolve(stream); }) : stream;
      }});
    });
    const page = await context.newPage(), errors = [], checks = [], timings = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    const label = `${name}-${viewport.width}x${viewport.height}`;
    const pixels = selector => page.locator(selector).evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    const switchMode = async mode => {
      const started = Date.now();
      if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click();
      await page.locator(`[data-creation-mode="${mode}"]`).click();
      await page.waitForFunction(mode => document.body.dataset.creationMode === mode && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'), mode);
      timings.push({ mode, uiReadyMs: Date.now() - started, modules: await page.evaluate(() => performance.getEntriesByType('resource').filter(x => /(?:draw-music|creation-camera|pixel-lens\/app)\.mjs/.test(x.name)).map(x => ({path:new URL(x.name).pathname, durationMs:x.duration, transferBytes:x.transferSize}))) });
      await page.waitForTimeout(60);
      const leaked = await page.locator('[data-mode-owner]').evaluateAll(nodes => nodes.filter(node => node.dataset.modeOwner !== document.body.dataset.creationMode && !(node.dataset.modeOwner === 'editor' && document.body.dataset.creationMode !== 'camera') && node.getClientRects().length && !(getComputedStyle(node).visibility === 'hidden' && node.inert)).map(node => node.id || node.className));
      assert.deepEqual(leaked, [], 'inactive mode controls must be hidden'); assert.equal(await page.locator('iframe').count(), 0);
    };
    const paint = async (selector, x, y) => { const r = await page.locator(selector).boundingBox(); const size = await page.locator(selector).evaluate(c => [c.width, c.height]); await page.mouse.click(r.x + (x + .5) * r.width / size[0], r.y + (y + .5) * r.height / size[1]); };
    try {
      await page.goto(base + '/draw/'); await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(x => /(?:draw-music|creation-camera|pixel-lens\/app)\.mjs/.test(x.name))), false);
      checks.push('camera and music engines are absent before first mode use');
      await paint('#draw-canvas', 2, 2); const initial = await pixels('#draw-canvas');
      assert.equal(initial.filter((v, i) => i % 4 === 3 && v).length, 1);
      await switchMode('audio'); assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#draw-palette').isVisible(), true); assert.equal(await page.locator('#audio-pixel-canvas').count(), 0); assert.equal(await page.locator('#draw-tool-picker').isVisible(), true);
      await paint('#draw-canvas', 3, 3); const songImage = await pixels('#draw-canvas');
      await page.locator('#draw-music-play').click(); await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'playing');
      await switchMode('draw'); assert.deepEqual(await pixels('#draw-canvas'), initial);
      assert.equal(await page.locator('#draw-music-play').getAttribute('data-state'), 'idle');
      await page.locator('#draw-undo').click(); assert.equal((await pixels('#draw-canvas')).filter((v, i) => i % 4 === 3 && v).length, 0);
      await page.locator('#draw-redo').click(); assert.deepEqual(await pixels('#draw-canvas'), initial);
      await switchMode('audio'); assert.deepEqual(await pixels('#draw-canvas'), songImage);
      await page.locator('#draw-undo').click(); assert.notDeepEqual(await pixels('#draw-canvas'), songImage);
      await page.locator('#draw-redo').click(); assert.deepEqual(await pixels('#draw-canvas'), songImage);
      await page.locator('#draw-canvas').focus(); await page.keyboard.press('Meta+z'); assert.notDeepEqual(await pixels('#draw-canvas'), songImage);
      await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await pixels('#draw-canvas'), songImage);
      await page.locator('#draw-music-play').click(); await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'playing');
      await page.locator('#draw-music-play').click(); await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'idle');
      checks.push('independent artwork and histories, audio play/stop and exit stop');
      for (let i = 0; i < 3; i++) { await switchMode('camera'); await switchMode('draw'); await switchMode('audio'); }
      assert.deepEqual(await pixels('#draw-canvas'), songImage); assert.equal(await page.evaluate(() => window.__media.requests), 0);
      checks.push('nine continuous mode switches, no implicit camera permission request');
      await switchMode('draw'); await page.locator('#creation-mode-menu summary').click(); await page.locator('[data-creation-transfer]').click();
      await page.waitForFunction(() => document.body.dataset.creationMode === 'audio');
      const transferred = await pixels('#draw-canvas'); assert.notDeepEqual(transferred, songImage);
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels('#draw-canvas'), songImage); await page.locator('#draw-redo').click(); assert.deepEqual(await pixels('#draw-canvas'), transferred);
      await switchMode('draw'); assert.deepEqual(await pixels('#draw-canvas'), initial); checks.push('explicit Draw to Audio copy is undoable and Draw remains intact');
      await switchMode('audio'); const beforeSettings = await pixels('#draw-canvas');
      await page.locator('#draw-music-settings summary').click();
      const priorInstrument = await page.locator('#draw-music-instrument').inputValue();
      await page.locator('#draw-music-instrument').selectOption('triangle');
      await page.locator('#draw-music-preview').click();
      await page.locator('#draw-music-tempo').fill('151'); await page.locator('#draw-music-tempo').press('Tab'); await page.locator('#draw-music-settings summary').click();
      await page.locator('#draw-undo').click(); assert.equal(await page.locator('#draw-music-tempo').inputValue(), '120');
      await page.locator('#draw-undo').click(); assert.equal(await page.locator('#draw-music-instrument').inputValue(), priorInstrument);
      await page.locator('#draw-redo').click(); assert.equal(await page.locator('#draw-music-instrument').inputValue(), 'triangle');
      await page.locator('#draw-redo').click(); assert.equal(await page.locator('#draw-music-tempo').inputValue(), '151');
      assert.deepEqual(await pixels('#draw-canvas'), beforeSettings);
      await page.locator('#draw-undo').click(); await page.locator('#draw-undo').click();
      await switchMode('draw');
      checks.push('color instrument assignment and tempo share full Draw Undo/Redo without changing pixels');

      // Select a rectangle: capture replaces only those cells, as one Draw undo action.
      await page.locator('#draw-canvas').focus(); await page.keyboard.press('v');
      const r = await page.locator('#draw-canvas').boundingBox(); await page.mouse.move(r.x + 4.5 * r.width / 16, r.y + 4.5 * r.height / 16); await page.mouse.down(); await page.mouse.move(r.x + 7.5 * r.width / 16, r.y + 7.5 * r.height / 16, { steps: 4 }); await page.mouse.up();
      await page.locator('#draw-camera').click(); await page.waitForFunction(() => document.body.dataset.creationMode === 'camera');
      assert.equal(new URL(page.url()).pathname, '/draw/'); assert.equal(await page.evaluate(() => window.__media.requests), 0);
      const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; const ctx = c.getContext('2d'); ctx.fillStyle = '#e75445'; ctx.fillRect(0, 0, 16, 16); return c.toDataURL().split(',')[1]; });
      await page.locator('#cameraImageInput').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => !document.querySelector('#capture').disabled);
      assert.equal(await page.locator('#toolbarHome [data-tool]').count(), 6);
      await page.locator('#toolbarHome [data-tool="look"]').click(); await page.locator('#looks [data-look="gb"]').click(); await page.locator('#toolbarContextBack').click();
      await page.locator('#toolbarHome [data-tool="dither"]').click(); await page.locator('#ditherKinds [data-value="net4"]').click(); await page.locator('#toolbarContextBack').click();
      await page.locator('#toolbarHome [data-tool="tone"]').click(); await page.locator('#toneSlider').fill('20'); await page.locator('#toolbarContextBack').click();
      await page.waitForTimeout(300);
      const cameraPixels = await pixels('#view'); await switchMode('audio'); await switchMode('camera');
      assert.equal(await page.locator('#looks [data-look="gb"]').getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('#ditherKinds [data-value="net4"]').getAttribute('aria-checked'), 'true');
      assert.equal(await page.locator('#toneSlider').inputValue(), '20');
      checks.push('original six camera controls, look/dither/tone settings retained');
      // Camera uses Audio as the destination after entering from Audio; the source image still survives.
      assert.equal(await page.locator('#capture').isDisabled(), false);
      await switchMode('draw'); await switchMode('camera'); assert.deepEqual(await pixels('#view'), cameraPixels);
      await page.screenshot({ path: `${out}/${label}-camera.png` });
      await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false'); await page.locator('#useCameraImage').click(); await page.waitForFunction(() => document.body.dataset.creationMode === 'draw');
      const captured = await pixels('#draw-canvas'); assert.notDeepEqual(captured, initial);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x < 4 || x > 7 || y < 4 || y > 7) assert.deepEqual(captured.slice((y * 16 + x) * 4, (y * 16 + x + 1) * 4), initial.slice((y * 16 + x) * 4, (y * 16 + x + 1) * 4));
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels('#draw-canvas'), initial); await page.locator('#draw-redo').click(); assert.deepEqual(await pixels('#draw-canvas'), captured);
      checks.push('image source survives switching, camera mask handoff and single-step Undo/Redo');
      await switchMode('camera'); await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'live'); const frameStart = await page.evaluate(() => performance.now()); await page.locator('#flipCamera').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.ready === 'true' && !document.querySelector('#capture').disabled);
      timings.push({kind:'synthetic-camera-frame-ready', elapsedMs: await page.evaluate(start => performance.now() - start, frameStart), realCamera:false});
      await switchMode('draw'); assert.equal(await page.evaluate(() => window.__media.requests), 1); assert.ok(await page.evaluate(() => window.__media.stops) >= 1);
      assert.equal(await page.locator('#video').evaluate(v => v.srcObject === null), true); assert.deepEqual(await pixels('#draw-canvas'), captured);
      checks.push('synthetic camera stream stops and releases video on exit without committing');
      await switchMode('camera'); await page.evaluate(() => { window.__delayMedia = true; }); await page.locator('#capture').click();
      await page.waitForFunction(() => typeof window.__resolveMedia === 'function'); await switchMode('draw'); await page.evaluate(() => window.__resolveMedia());
      await page.waitForFunction(() => window.__media.stops >= 2); assert.equal(await page.locator('#video').evaluate(v => v.srcObject === null), true);
      assert.deepEqual(await pixels('#draw-canvas'), captured); checks.push('late camera start resolves after exit, stops its stream and never replaces the artwork');
      await switchMode('audio'); await page.locator('#draw-camera').click();
      await page.waitForFunction(() => document.body.dataset.creationMode === 'camera');
      await page.locator('#cameraImageInput').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => !document.querySelector('#capture').disabled); await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false'); await page.locator('#useCameraImage').click();
      await page.waitForFunction(() => document.body.dataset.creationMode === 'audio'); assert.notDeepEqual(await pixels('#draw-canvas'), transferred);
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels('#draw-canvas'), transferred);
      await switchMode('draw'); assert.deepEqual(await pixels('#draw-canvas'), captured);
      checks.push('Camera to Audio handoff is undoable, preserves independent Draw pixels');
      await switchMode('audio'); await page.locator('#draw-palette [data-color-index="0"]').click();
      await page.locator('#draw-music-settings summary').click(); await page.locator('#draw-music-instrument').selectOption('triangle'); await page.locator('#draw-music-settings summary').click();
      await page.locator('#draw-music-play').click();
      await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'playing');
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'idle' && window.__media.closed === window.__media.contexts);
      await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(100); assert.equal(await page.locator('#draw-music-play').getAttribute('data-state'), 'idle');
      await switchMode('draw');
      checks.push('synthetic hidden-tab signal stops playback and closes all audio contexts without auto-resuming');
      const media = await page.evaluate(() => window.__media);
      // Common output remains the exact existing output workspace route.
      await page.locator('#draw-output summary').click(); await page.locator('#draw-export').click(); await page.waitForURL(/\/output\/work\//);
      assert.equal(new URL(page.url()).pathname, '/output/work/'); checks.push('Draw output uses /output/work/');
      await page.goBack(); await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
      await switchMode('audio'); assert.deepEqual(await pixels('#draw-canvas'), transferred); await page.screenshot({ path: `${out}/${label}-audio.png` });
      await page.locator('#draw-output summary').click(); await page.locator('#draw-export').click(); await page.waitForURL(/\/output\/work\//);
      checks.push('retained Audio restores from its own PXD selection and exports through /output/work/');
      await page.goBack(); await page.waitForFunction(() => document.body.dataset.creationMode === 'audio' && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy')); await switchMode('camera');
      const ownCapture = await pixels('#view');
      await page.locator('#savePng').click(); await page.waitForURL(/\/output\/work\//); await page.goBack();
      await page.waitForFunction(() => document.body.dataset.creationMode === 'camera' && document.querySelector('#pixelStudio').dataset.mode === 'captured');
      assert.deepEqual(await pixels('#view'), ownCapture); await switchMode('draw'); assert.deepEqual(await pixels('#draw-canvas'), captured);
      checks.push('Camera has its own saved project and returns from /output/work/ inside the same shell');
      if (viewport.width === 1280) {
        await switchMode('camera'); await page.locator('#capture').click();
        await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'live' && document.querySelector('#pixelStudio').dataset.ready === 'true');
        const shutter = await page.locator('#capture').boundingBox(); await page.mouse.move(shutter.x + shutter.width / 2, shutter.y + shutter.height / 2); await page.mouse.down(); await page.waitForTimeout(1400); await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'captured'); await switchMode('draw'); await page.waitForTimeout(400); assert.equal(await page.locator('body').getAttribute('data-tool-result-open'), null); await switchMode('camera');
        await page.waitForFunction(() => Number(document.querySelector('#pixelStudio').dataset.gifFrames) >= 2 && document.querySelector('#savePng').getAttribute('aria-disabled') === 'false', null, { timeout: 30000 });
        const frames = await page.locator('#pixelStudio').getAttribute('data-gif-frames'); await switchMode('draw'); await switchMode('camera');
        assert.equal(await page.locator('#pixelStudio').getAttribute('data-gif-frames'), frames);
        await page.locator('#savePng').click(); await page.waitForURL(/\/output\/work\//); await page.goBack();
        await page.waitForFunction(() => document.body.dataset.creationMode === 'camera' && Number(document.querySelector('#pixelStudio').dataset.gifFrames) >= 2);
        assert.equal(await page.locator('#pixelStudio').getAttribute('data-gif-frames'), frames);
        checks.push('original GIF recording/export, retention and output return');
      }
      await page.goto(base + '/audio/?standalone=1'); await page.waitForFunction(() => document.documentElement.dataset.audioReady === 'true' && !document.querySelector('#main').inert);
      const standaloneBlank = await pixels('#audio-pixel-canvas'); await paint('#audio-pixel-canvas', 5, 5);
      const standaloneMusic = await pixels('#audio-pixel-canvas'); assert.notDeepEqual(standaloneMusic, standaloneBlank);
      await page.locator('#audio-undo').click(); assert.deepEqual(await pixels('#audio-pixel-canvas'), standaloneBlank);
      await page.locator('#audio-redo').click(); assert.deepEqual(await pixels('#audio-pixel-canvas'), standaloneMusic);
      await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'playing');
      await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'idle');
      assert.equal(await page.locator('#creation-mode-menu').count(), 0);
      await page.locator('#audio-output summary').click(); await page.locator('#audio-export-image').click(); await page.waitForURL(/\/output\/work\//);
      checks.push('standalone Audio: draw, Undo/Redo, play/stop, existing output route');
      await page.goto(base + '/pixel-camera.html?standalone=1'); await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture' && !document.querySelector('#capture').disabled);
      await page.locator('#cameraImageInput').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.source === 'image' && document.querySelector('#pixelStudio').dataset.ready === 'true');
      const standalonePreview = await pixels('#view'); await page.locator('#capture').click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured' && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false');
      await page.locator('.px-tool-result__return').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live');
      assert.deepEqual(await pixels('#view'), standalonePreview);
      await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false');
      await page.locator('#savePng').click(); await page.waitForURL(/\/output\/work\//);
      checks.push('standalone Camera: imported image, capture, retake preserves pixels, existing output route');
      await page.goto(base + '/draw/'); await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');
      await page.locator('#draw-canvas').focus(); await page.keyboard.press('b'); await paint('#draw-canvas', 1, 1); const projectSource = await pixels('#draw-canvas');
      await page.locator('.project-bar[data-mode-owner="draw"] .project-bar__open').click();
      await page.locator('#project-tab-current').click(); await page.locator('#pxd-panel [data-project-transfer="audio"]').click();
      await page.waitForFunction(() => document.body.dataset.creationMode === 'audio' && !document.querySelector('#main').inert);
      assert.equal(new URL(page.url()).pathname, '/draw/'); await page.waitForFunction(() => document.querySelector('#audio-pxd-file-status')?.textContent.includes('新しい作品として')); const importedProject = await pixels('#draw-canvas'); assert.equal(projectSource[17 * 4 + 3], 255); assert.deepEqual(importedProject.slice(17 * 4, 18 * 4), projectSource.slice(17 * 4, 18 * 4));
      await switchMode('draw'); assert.deepEqual(await pixels('#draw-canvas'), projectSource);
      checks.push('existing PXD transfer creates a separate Audio project in the common shell and preserves Draw');
      if (viewport.width === 1280) {
        const workspace = () => page.locator('.animation-controls__workspace-panel').filter({ visible: true });
        await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
        await workspace().locator('[data-action="add-layer"]').click(); await workspace().locator('.animation-controls__frame-add').click();
        assert.equal(await workspace().locator('[data-action="select-cel"]').count(), 4);
        await switchMode('audio'); await switchMode('draw'); await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
        assert.equal(await workspace().locator('[data-action="select-cel"]').count(), 4);
        const layer = await workspace().locator('[data-action="select-layer"].is-selected').boundingBox();
        await page.mouse.move(layer.x + layer.width / 2, layer.y + layer.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
        await page.locator('[data-frame-menu-action="lock"]').filter({ visible: true }).click(); await switchMode('camera');
        assert.equal(await page.locator('#useCameraImage').isDisabled(), true); assert.equal(await page.locator('#capture').isDisabled(), false);
        checks.push('two layers/two frames retained across Audio, locked Draw permits independent Camera with apply disabled');
      }
      await page.goto(base + '/audio/'); await page.waitForFunction(() => document.body.dataset.creationMode === 'audio' && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'));
      assert.equal(new URL(page.url()).pathname, '/draw/'); assert.equal(await page.locator('#draw-canvas').count(), 1); assert.equal(await page.locator('#audio-pixel-canvas').count(), 0);
      await page.goto(base + '/pixel-camera.html'); await page.waitForFunction(() => document.body.dataset.creationMode === 'camera' && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'));
      assert.equal(new URL(page.url()).pathname, '/draw/'); assert.equal(await page.evaluate(() => window.__media.requests), 0); await switchMode('draw');
      checks.push('separate normal entrances open modes of the same Draw tool without requesting camera access');
      assert.deepEqual(errors, []); results.push({ label, checks, media, timings, errors }); console.log('PASS', label, checks.length, 'groups');
    } catch (error) { failures.push({ label, checks, error: error.stack, errors, state: await page.evaluate(() => ({mode: document.body.dataset.creationMode, busy: document.querySelector('#creation-mode-menu')?.getAttribute('aria-busy'), result: document.body.dataset.toolResultOpen, message: document.querySelector('.creation-mode-error')?.textContent, inert: document.querySelector('#main')?.inert, dialogs: [...document.querySelectorAll('dialog[open]')].map(n => n.id), camera: document.querySelector('#pixelStudio')?.dataset.mode })) }); await page.screenshot({ path: `${out}/${label}-failure.png` }).catch(() => {}); console.error('FAIL', label, error.message); }
    finally { await context.close(); await writeFile(`${out}/results.json`, JSON.stringify({ results, failures, realCamera: 'UNTESTED', permissions: 'never granted', externalRequests: 'blocked' }, null, 2)); }
  }} finally { await browser.close(); }
}
assert.deepEqual(failures, []); console.log('PASS', results.length, 'viewport cases');
