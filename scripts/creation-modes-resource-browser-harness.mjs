/** Local-only lifecycle instrumentation. Uses a synthetic canvas stream; never requests device access. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost QA is allowed');
const out = process.env.PIXIEED_RESOURCE_OUTPUT || '/tmp/pixieed-resource-qa';
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const report = { base, permissions: 'never granted', realCamera: 'UNTESTED', externalApi: 'blocked', scenarios: [], limitations: [
  'Only browser-observable and instrumented callbacks are measured; this is not a real camera/device test.',
  'RAF owner labels are inferred from the requesting JavaScript stack; unattributed calls are classified as other.',
  'GIF worker lifecycle is instrumented but GIF encode is not exercised in this focused run.',
  'No claim is made about browser compositor, GPU, OS media pipeline, or hardware activity.'
] };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (new URL(url).origin !== new URL(base).origin) return route.abort();
    if (/\/js\/pixel-studio\/frame-loop\.mjs(?:\?|$)/.test(url)) {
      const response = await route.fetch();
      let source = await response.text();
      source = source.replace('      const frame = await captureFrame({ signal: controller.signal, generation: token });', '      window.__resourceQA.frame.started++; window.__resourceQA.frame.inFlight++;\n      const frame = await captureFrame({ signal: controller.signal, generation: token });');
      source = source.replace('            publishFrame(result, { generation: token, frameId });', '            window.__resourceQA.frame.published++; if (!window.__resourceQA.frame.running) window.__resourceQA.frame.publishedWhileStopped++; publishFrame(result, { generation: token, frameId });');
      source = source.replace('      } finally {\n        if (activeController === controller) activeController = null;', '      } finally {\n        window.__resourceQA.frame.inFlight = Math.max(0, window.__resourceQA.frame.inFlight - 1);\n        if (activeController === controller) activeController = null;');
      source = source.replace('    start() {\n      wanted = true;', '    start() {\n      wanted = true; window.__resourceQA.frame.running = true;');
      source = source.replace('    stop() {\n      wanted = false;', '    stop() {\n      wanted = false; window.__resourceQA.frame.running = false; window.__resourceQA.frame.stops++;');
      return route.fulfill({ response, body: source });
    }
    if (/\/js\/creation\/audio-core\.mjs(?:\?|$)/.test(url)) {
      const response = await route.fetch(); let source = await response.text();
      source = source.replace('schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout',
        'schedule = ((fn, ms) => { const id = globalThis.setTimeout(() => { window.__resourceQA.audioTimers.delete(id); fn(); }, ms); window.__resourceQA.audioTimers.add(id); return id; }), cancel = (id => { window.__resourceQA.audioTimers.delete(id); globalThis.clearTimeout(id); })');
      return route.fulfill({ response, body: source });
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    const qa = window.__resourceQA = { rafPending: new Map(), rafRequested: 0, rafCancelled: 0, rafFired: 0,
      frame: { started: 0, inFlight: 0, published: 0, publishedWhileStopped: 0, running: false, stops: 0 },
      workers: { created: 0, terminated: 0, live: 0, messagesAfterTerminate: 0 }, audioTimers: new Set(), audio: { contexts: 0, closed: 0, createdNodes: new Set(), disconnectedNodes: new Set(), stoppedSources: new Set() },
      media: { requests: 0, stops: 0 } };
    const ownerFor = stack => /draw-music\.mjs/.test(stack) ? 'music' : /draw-page\.mjs|draw-virtual-cursor\.mjs|pixel-studio/.test(stack) ? 'draw' : /pixel-lens\/app\.mjs|creation-camera\.mjs/.test(stack) ? 'camera' : 'other';
    const rafCounts = { draw: 0, music: 0, camera: 0, other: 0 };
    const releaseRaf = id => { const owner = qa.rafPending.get(id); if (owner) { qa.rafPending.delete(id); rafCounts[owner]--; } };
    const nativeRaf = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { qa.rafRequested++; const owner = ownerFor(new Error().stack || ''); let id; id = nativeRaf(time => { releaseRaf(id); qa.rafFired++; callback(time); }); qa.rafPending.set(id, owner); rafCounts[owner]++; return id; };
    window.cancelAnimationFrame = id => { if (qa.rafPending.has(id)) { releaseRaf(id); qa.rafCancelled++; } return nativeCancel(id); };
    qa.rafOwnerPending = () => ({ ...rafCounts });
    const NativeWorker = window.Worker;
    if (NativeWorker) window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); this.__qaDead = false; qa.workers.created++; qa.workers.live++; }
      terminate() { if (!this.__qaDead) { this.__qaDead = true; qa.workers.terminated++; qa.workers.live--; } return super.terminate(); }
      postMessage(...args) { if (this.__qaDead) qa.workers.messagesAfterTerminate++; return super.postMessage(...args); }
    };
    const NativeContext = window.AudioContext || window.webkitAudioContext;
    if (NativeContext) window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); qa.audio.contexts++; }
      close() { qa.audio.closed++; return super.close(); }
      createOscillator(...args) { const node = super.createOscillator(...args); qa.audio.createdNodes.add(node); const stop = node.stop.bind(node), disconnect = node.disconnect.bind(node); node.stop = (...a) => { qa.audio.stoppedSources.add(node); return stop(...a); }; node.disconnect = (...a) => { qa.audio.disconnectedNodes.add(node); return disconnect(...a); }; return node; }
      createBufferSource(...args) { const node = super.createBufferSource(...args); qa.audio.createdNodes.add(node); const stop = node.stop.bind(node), disconnect = node.disconnect.bind(node); node.stop = (...a) => { qa.audio.stoppedSources.add(node); return stop(...a); }; node.disconnect = (...a) => { qa.audio.disconnectedNodes.add(node); return disconnect(...a); }; return node; }
      createGain(...args) { const node = super.createGain(...args); qa.audio.createdNodes.add(node); const disconnect = node.disconnect.bind(node); node.disconnect = (...a) => { qa.audio.disconnectedNodes.add(node); return disconnect(...a); }; return node; }
      createDynamicsCompressor(...args) { const node = super.createDynamicsCompressor(...args); qa.audio.createdNodes.add(node); const disconnect = node.disconnect.bind(node); node.disconnect = (...a) => { qa.audio.disconnectedNodes.add(node); return disconnect(...a); }; return node; }
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => {
      qa.media.requests++; const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, 32, 32); ctx.fillStyle = '#e75445'; ctx.fillRect(0, 0, 16, 32);
      const stream = canvas.captureStream(12); for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { qa.media.stops++; stop(); }; }
      return stream;
    }});
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const switchMode = async mode => {
    if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click();
    await page.locator(`[data-creation-mode="${mode}"]`).click();
    await page.waitForFunction(mode => document.body.dataset.creationMode === mode && !document.querySelector('#creation-mode-menu').hasAttribute('aria-busy'), mode);
  };
  const waitSettled = async () => { await page.waitForTimeout(250); return page.evaluate(() => {
    const q = window.__resourceQA; return { ...q, rafPending: q.rafPending.size, rafOwnersPending: q.rafOwnerPending(), audioTimers: q.audioTimers.size,
      audio: { contexts: q.audio.contexts, closed: q.audio.closed, nodesCreatedUnique: q.audio.createdNodes.size,
        nodesDisconnectedUnique: q.audio.disconnectedNodes.size, nodesPendingDisconnect: [...q.audio.createdNodes].filter(n => !q.audio.disconnectedNodes.has(n)).length,
        sourcesStoppedUnique: q.audio.stoppedSources.size } };
  }); };
  await page.goto(base + '/draw/'); await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true');

  // Exercise Audio transport and the position RAF, then leave Audio for Draw.
  const canvas = page.locator('#draw-canvas'); let box = await canvas.boundingBox();
  const logical = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
  await page.mouse.click(box.x + box.width * 2.5 / logical.width, box.y + box.height * 2.5 / logical.height);
  assert.ok(await canvas.evaluate(node => node.getContext('2d').getImageData(0, 0, node.width, node.height).data.some((value, index) => index % 4 === 3 && value > 0)), 'fixture must contain a painted pixel');
  await switchMode('audio');
  await page.locator('#draw-music-settings').evaluate(node => node.open = true);
  await page.locator('#draw-music-instrument').selectOption('triangle');
  await page.locator('#draw-music-settings').evaluate(node => node.open = false);
  await page.locator('#draw-music-play').click();
  await page.waitForFunction(() => document.querySelector('#draw-music-play').dataset.state === 'playing');
  await page.waitForTimeout(100); const audioBefore = await page.evaluate(() => { const q = window.__resourceQA; return { contexts: q.audio.contexts, closed: q.audio.closed,
    nodesCreatedUnique: q.audio.createdNodes.size, nodesDisconnectedUnique: q.audio.disconnectedNodes.size, nodesPendingDisconnect: [...q.audio.createdNodes].filter(n => !q.audio.disconnectedNodes.has(n)).length,
    sourcesStoppedUnique: q.audio.stoppedSources.size, timers: q.audioTimers.size, raf: q.rafPending.size, rafOwnersPending: q.rafOwnerPending() }; });
  await switchMode('draw'); const audioAfter = await waitSettled();
  assert.equal(await page.locator('#draw-music-play').getAttribute('data-state'), 'idle');
  assert.equal(audioAfter.audio.contexts, audioAfter.audio.closed, 'all created AudioContexts should close on exit');
  assert.equal(audioAfter.audioTimers, 0, 'audio-core scheduler timers should be canceled/drained');
  assert.equal(audioAfter.rafOwnersPending.music, 0, 'music-owned RAF must be drained on exit');
  assert.equal(audioAfter.audio.nodesPendingDisconnect, 0, 'all instrumented audio nodes must be disconnected');
  report.scenarios.push({ name: 'audio-play-to-draw', passed: true, beforeExit: audioBefore, afterSettle: audioAfter,
    assertions: ['transport state idle', 'AudioContext contexts equal closed', 'audio-core scheduled timers empty'] });

  // Exercise the Draw animation timeline and exit it for Camera.
  await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
  await page.locator('.animation-controls__frame-add').click();
  await page.locator('#draw-animation-play').click();
  await page.waitForFunction(() => document.querySelector('#draw-animation-play').getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(120);
  const drawBefore = await page.evaluate(() => ({ raf: window.__resourceQA.rafPending.size, rafOwnersPending: window.__resourceQA.rafOwnerPending(), requested: window.__resourceQA.rafRequested, fired: window.__resourceQA.rafFired }));
  assert.ok(drawBefore.rafOwnersPending.draw > 0, 'Draw animation playback must own an active RAF before switching');
  await switchMode('camera'); const cameraReady = await waitSettled();
  assert.equal(cameraReady.rafOwnersPending.draw, 0, 'Draw-owned animation RAF must be drained after switching to Camera');
  assert.equal(cameraReady.media.requests, 0, 'camera mode entry must not request camera permission');
  report.scenarios.push({ name: 'draw-animation-to-camera', passed: true, drawBefore, cameraAfterSettle: cameraReady,
    assertions: ['Draw animation had an owned RAF before switch', 'Draw-owned pending RAF is zero after camera switch', 'camera engine lazy-loaded without requesting getUserMedia'] });

  // Start synthetic preview; exiting camera must stop its stream, frame pump and all preview RAFs.
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'live' && document.querySelector('#pixelStudio').dataset.ready === 'true');
  await page.waitForTimeout(650);
  const cameraBefore = await page.evaluate(() => ({ frame: { ...window.__resourceQA.frame }, raf: window.__resourceQA.rafPending.size,
    media: { ...window.__resourceQA.media }, workers: { ...window.__resourceQA.workers } }));
  assert.ok(cameraBefore.frame.started > 0, 'instrumented camera frame loop should have run');
  await switchMode('draw'); const cameraAfter = await waitSettled();
  assert.equal(cameraAfter.frame.running, false); assert.equal(cameraAfter.frame.inFlight, 0);
  assert.equal(cameraAfter.rafOwnersPending.camera, 0, 'camera-owned pending RAF must be drained on exit');
  const settledPublished = cameraAfter.frame.published; await page.waitForTimeout(120);
  const stablePublished = await page.evaluate(() => window.__resourceQA.frame.published);
  assert.equal(stablePublished, settledPublished, 'no preview frame may publish after the exit settle window');
  assert.equal(cameraAfter.frame.publishedWhileStopped, 0, 'frame pump may not publish while stopped');
  assert.equal(cameraAfter.media.stops, cameraAfter.media.requests);
  assert.equal(await page.locator('#video').evaluate(v => v.srcObject === null), true);
  assert.equal(cameraAfter.workers.live, 0);
  report.scenarios.push({ name: 'camera-preview-to-draw', passed: true, beforeExit: cameraBefore, afterSettle: cameraAfter,
    assertions: ['frame loop stopped and no frame remained in flight after settle', 'no frame published while stopped or after settle window', 'synthetic stream tracks stopped', 'video srcObject released', 'no live Worker instances'] });

  await page.waitForTimeout(100); const final = await page.evaluate(() => { const q = window.__resourceQA; return { mode: document.body.dataset.creationMode,
    frame: { ...q.frame }, workers: { ...q.workers }, rafPending: q.rafPending.size, rafOwnersPending: q.rafOwnerPending(), audioTimersPending: q.audioTimers.size,
    audio: { contexts: q.audio.contexts, closed: q.audio.closed, nodesCreatedUnique: q.audio.createdNodes.size,
      nodesDisconnectedUnique: q.audio.disconnectedNodes.size, nodesPendingDisconnect: [...q.audio.createdNodes].filter(n => !q.audio.disconnectedNodes.has(n)).length,
      sourcesStoppedUnique: q.audio.stoppedSources.size } }; });
  assert.equal(final.mode, 'draw'); assert.deepEqual(errors, []);
  report.pageErrors = errors; report.finalSnapshot = final;
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); }
