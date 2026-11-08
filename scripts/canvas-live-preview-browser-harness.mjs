import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const root = process.env.PIXIEED_BUILD_ROOT;
assert.ok(root && resolve(root) === root, 'Set PIXIEED_BUILD_ROOT to an absolute local integrated build path.');
const out = process.env.PIXIEED_CANVAS_BROWSER_OUTPUT || '/tmp/pixieed-integrated-canvas-browser';
await mkdir(out, { recursive: true });
const types = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
};
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    const url = new URL(req.url, 'http://localhost');
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(`${root}/`)) return res.writeHead(403).end();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found');
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = {
  status: 'PASS', buildRoot: root, cases: [], blockedRequests: [],
  limitations: [
    'Only a local integrated build is served; browser requests outside the local server are aborted, service workers are blocked, and each case uses a fresh ephemeral context.',
    'The artwork and project storage are synthetic and confined to disposable browser contexts. No real user profile/storage, public website, production media, native phone keyboard, or physical device is tested.'
  ]
};
const waitReady = page => page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.state?.active === true
  && !document.querySelector('#main')?.inert && !document.body.hasAttribute('data-creation-transition'));
const contextFor = async viewport => {
  const context = await browser.newContext({
    viewport, hasTouch: viewport.width < 800, isMobile: viewport.width < 800,
    deviceScaleFactor: viewport.width < 800 ? 2 : 1, serviceWorkers: 'block'
  });
  await context.route('**/*', route => {
    let url;
    try { url = new URL(route.request().url()); } catch { report.blockedRequests.push(route.request().url()); return route.abort(); }
    if (url.origin === base) return route.continue();
    report.blockedRequests.push(url.href);
    return route.abort();
  });
  return context;
};
async function startSyntheticWork(page) {
  await page.goto(`${base}/tools/start/draw/?workspace=1`);
  await page.locator('#project-start-new').click();
  await waitReady(page);
  await page.evaluate(async () => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs?rev=20261016-color-capability-1');
    const width = 16, height = 16, rgba = new Uint8Array(width * height * 4);
    // Stay within the ordinary shared-canvas color policy while using a varied synthetic pattern.
    const palette = [[38, 50, 56, 255], [231, 84, 69, 255], [242, 184, 75, 255], [76, 130, 195, 255]];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const color = palette[(Math.floor(x / 4) + Math.floor(y / 4)) % palette.length];
      rgba.set(color, offset);
    }
    const project = await putPxdSharedImage(createPxdProject({ manifest: { title: 'Canvas live-preview test' } }), { width, height, rgba });
    await window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.importProject(project);
  });
  await page.waitForFunction(() => {
    const draw = window.__PIXIEED_CREATION_HOST__?.runtime?.draw;
    return draw?.getTimeline?.().width === 16 && draw.getTimeline().height === 16
      && draw.workspace?.persisted === true && draw.workspace?.dirty === false && draw.workspace?.busy === false;
  });
}
async function openCanvasSettings(page) {
  await page.locator('#creation-settings-open').click();
  await page.locator('#creation-canvas-settings-open').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('#creation-project-settings-panel');
    return panel && !panel.hidden;
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#creation-project-settings-panel canvas');
    return canvas?.width === 16 && canvas?.height === 16;
  });
}
async function activeSnapshot(page) {
  return page.evaluate(async () => {
    const draw = window.__PIXIEED_CREATION_HOST__.runtime.draw;
    const timeline = draw.getTimeline();
    const { serializeAnimationPool } = await import('/js/creation/animation-core.mjs?rev=20261016-color-capability-1');
    const tiles = serializeAnimationPool(timeline).map(tile => ({ frameId: tile.frameId, layerId: tile.layerId, tileId: tile.tileId,
      x: tile.x, y: tile.y, width: tile.width, height: tile.height, bytes: tile.bytes ? [...tile.bytes] : null }));
    const data = JSON.stringify({ width: timeline.width, height: timeline.height, palette: timeline.palette, frames: timeline.frames, layers: timeline.layers, tiles });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
    return { width: timeline.width, height: timeline.height, hash: [...digest].map(x => x.toString(16).padStart(2, '0')).join('') };
  });
}
async function activeCanonicalSnapshot(page) {
  return page.evaluate(async () => {
    const draw = window.__PIXIEED_CREATION_HOST__.runtime.draw;
    const timeline = draw.getTimeline();
    const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs?rev=20261016-color-capability-1');
    const cels = timeline.frames.flatMap(frame => timeline.layers.map(layer => ({ frameId: frame.id, layerId: layer.id,
      pixels: Array.from(getAnimationCelDocument(timeline, frame.id, layer.id).pixels) })));
    const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
    const state = { width: timeline.width, height: timeline.height, palette: timeline.palette, frames: timeline.frames, layers: timeline.layers, cels };
    const data = JSON.stringify(sortKeys(state));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
    return { width: timeline.width, height: timeline.height, hash: [...digest].map(x => x.toString(16).padStart(2, '0')).join(''), state };
  });
}
async function storedSnapshot(page) {
  return page.evaluate(async () => {
    const draw = window.__PIXIEED_CREATION_HOST__.runtime.draw;
    const id = draw.workspace.currentProject?.projectId;
    if (!id) throw new Error('Synthetic project ID is unavailable.');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261107-gallery-1');
    const { readPxdSharedImage } = await import('/js/creation/pxd-project.mjs?rev=20261016-color-capability-1');
    const project = await (await createToolProjectStore('draw')).load(id);
    const image = await readPxdSharedImage(project);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', image.rgba));
    return { projectId: project.projectId, revisionId: project.revisionId, width: image.width, height: image.height,
      hash: [...digest].map(x => x.toString(16).padStart(2, '0')).join('') };
  });
}
async function storedAnimationSnapshot(page) {
  return page.evaluate(async () => {
    const draw = window.__PIXIEED_CREATION_HOST__.runtime.draw;
    const id = draw.workspace.currentProject?.projectId;
    if (!id) throw new Error('Synthetic project ID is unavailable.');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261107-gallery-1');
    const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs?rev=20261016-color-capability-1');
    const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs?rev=20261016-color-capability-1');
    const project = await (await createToolProjectStore('draw')).load(id);
    const timeline = await readPxdAnimation(project, 'main');
    if (!timeline) throw new Error('Saved synthetic animation is missing.');
    const cels = timeline.frames.flatMap(frame => timeline.layers.map(layer => ({ frameId: frame.id, layerId: layer.id,
      pixels: Array.from(getAnimationCelDocument(timeline, frame.id, layer.id).pixels) })));
    const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
    const data = JSON.stringify(sortKeys({ width: timeline.width, height: timeline.height, palette: timeline.palette, frames: timeline.frames, layers: timeline.layers, cels }));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
    return { projectId: project.projectId, revisionId: project.revisionId, width: timeline.width, height: timeline.height,
      hash: [...digest].map(x => x.toString(16).padStart(2, '0')).join('') };
  });
}
async function drawRealStroke(page, yFraction) {
  const canvas = page.locator('#draw-canvas');
  await page.evaluate(() => {
    window.__canvasQaPointerEvidence = [];
    document.addEventListener('pointerdown', event => {
      if (event.target?.id === 'draw-canvas') window.__canvasQaPointerEvidence.push({ trusted: event.isTrusted, pointerType: event.pointerType });
    }, true);
  });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'drawing canvas is visible before real stroke');
  const start = { x: box.x + box.width * 0.22, y: box.y + box.height * yFraction };
  const end = { x: box.x + box.width * 0.78, y: box.y + box.height * yFraction };
  const before = await activeSnapshot(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const after = await activeSnapshot(page), canonical = await activeCanonicalSnapshot(page);
  assert.notEqual(after.hash, before.hash, 'trusted mouse stroke changes the active animation pixels');
  const evidence = await page.evaluate(() => window.__canvasQaPointerEvidence);
  assert.ok(evidence.some(event => event.trusted && event.pointerType === 'mouse'), 'drawing used trusted Chromium mouse input');
  return { active: after, canonical };
}
async function viewportGestureChecks(page) {
  return page.evaluate(() => {
    const w = window, canvas = document.querySelector('#draw-canvas'), board = document.querySelector('.draw-board'), label = document.querySelector('#draw-zoom-label');
    if (!canvas || !board || !label) throw new Error('Draw viewport test controls are missing.');
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const hash = target => {
      const bytes = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let value = 2166136261;
      for (const byte of bytes) value = Math.imul(value ^ byte, 16777619);
      return value >>> 0;
    };
    const pointer = (type, id, x, y, pointerType = 'touch') => canvas.dispatchEvent(new w.PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType, isPrimary: id === 11,
      clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1
    }));
    const rect = canvas.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const original = hash(canvas), records = [], updates = [];
    const observer = new w.MutationObserver(batch => records.push(...batch));
    observer.observe(board, { subtree: true, attributes: true, attributeFilter: ['width', 'height'] });
    observer.observe(label, { childList: true });
    let operationStart = 0;
    const begin = () => { observer.takeRecords(); records.length = 0; operationStart = performance.now(); };
    const end = name => {
      records.push(...observer.takeRecords());
      const result = {
        name, cpuMs: performance.now() - operationStart,
        viewUpdates: records.filter(record => record.target === label && record.type === 'childList').length,
        backingWrites: records.filter(record => record.type === 'attributes' && record.target.matches('.draw-pixel-background,.draw-pixel-lines')).length
      };
      updates.push(result); return result;
    };
    const checkCount = (result, labelText) => assert(result.viewUpdates === 1 && result.backingWrites === 0,
      `${labelText} should render once without resetting overlay backing buffers; got ${JSON.stringify(result)}`);
    const wheel = delta => board.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: delta, deltaMode: 0 }));
    try {
      const checks = [];
      const zoomBefore = new w.DOMMatrix(w.getComputedStyle(canvas).transform);
      begin(); wheel(-100); const wheelResult = end('wheel zoom'); checkCount(wheelResult, 'wheel zoom');
      const zoomAfter = new w.DOMMatrix(w.getComputedStyle(canvas).transform);
      assert(zoomAfter.a > zoomBefore.a, 'wheel zoom changes canvas scale'); checks.push('wheel zoom one render, no overlay reset');

      const pinchRect = canvas.getBoundingClientRect(), sourcePoint = { x: (cx - pinchRect.left) / pinchRect.width, y: (cy - pinchRect.top) / pinchRect.height };
      pointer('pointerdown', 11, cx - 50, cy); pointer('pointerdown', 22, cx + 50, cy);
      begin(); pointer('pointermove', 11, cx - 65, cy + 8); const pinchFirst = end('first pinch contact'); checkCount(pinchFirst, 'first pinch move');
      begin(); pointer('pointermove', 22, cx + 75, cy + 8); const pinchSecond = end('second pinch contact'); checkCount(pinchSecond, 'second pinch move');
      const afterRect = canvas.getBoundingClientRect(), midpoint = { x: cx + 5, y: cy + 8 };
      assert(Math.abs(afterRect.left + sourcePoint.x * afterRect.width - midpoint.x) < 0.02, 'two-contact pinch X anchor moved');
      assert(Math.abs(afterRect.top + sourcePoint.y * afterRect.height - midpoint.y) < 0.02, 'two-contact pinch Y anchor moved');
      pointer('pointerup', 11, cx - 65, cy + 8); pointer('pointerup', 22, cx + 75, cy + 8);
      assert(hash(canvas) === original, 'pinch changed artwork pixels'); checks.push('two-contact pinch anchor and one render per contact without overlay reset');

      canvas.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, key: ' ', code: 'Space' }));
      pointer('pointerdown', 31, cx, cy, 'mouse'); begin(); pointer('pointermove', 31, cx + 19, cy - 13, 'mouse');
      const panResult = end('space mouse pan'); checkCount(panResult, 'Space+mouse pan');
      pointer('pointerup', 31, cx + 19, cy - 13, 'mouse'); canvas.dispatchEvent(new w.KeyboardEvent('keyup', { bubbles: true, key: ' ', code: 'Space' }));
      checks.push('Space+mouse pan one render without overlay reset');

      pointer('pointerdown', 11, cx - 40, cy); pointer('pointerdown', 22, cx + 40, cy);
      pointer('pointermove', 11, cx - 55, cy); pointer('pointercancel', 11, cx - 55, cy); pointer('pointercancel', 22, cx + 40, cy);
      assert(hash(canvas) === original, 'cancelled gesture changed artwork pixels'); checks.push('pointercancel discards gesture without artwork changes');

      canvas.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, key: '0', code: 'Digit0' }));
      canvas.dispatchEvent(new w.KeyboardEvent('keyup', { bubbles: true, key: '0', code: 'Digit0' }));
      pointer('pointerdown', 11, cx - 50, cy); pointer('pointerdown', 22, cx + 50, cy);
      pointer('pointermove', 11, cx - 30, cy + 15); pointer('pointermove', 22, cx + 70, cy + 15);
      const atOne = new w.DOMMatrix(w.getComputedStyle(canvas).transform);
      assert(Math.abs(atOne.a - 1) < 0.0001 && Math.abs(atOne.e - 20) < 0.02 && Math.abs(atOne.f - 15) < 0.02, '1× pinch translation regressed');
      pointer('pointerup', 11, cx - 30, cy + 15); pointer('pointerup', 22, cx + 70, cy + 15);
      assert(hash(canvas) === original, 'viewport operations changed artwork pixels'); checks.push('1× pinch translation, releases, and unchanged artwork hash');
      return { checks, updates, artworkHashBefore: original, artworkHashAfter: hash(canvas), zoomBefore: zoomBefore.a, zoomAfter: zoomAfter.a };
    } finally { observer.disconnect(); }
  });
}
async function reloadSavedSyntheticProject(page, expectedActive, expectedImage, expectedAnimation) {
  const url = new URL(page.url());
  assert.ok(url.searchParams.get('pxd') && url.searchParams.get('pxdRevision'), 'saved work is addressable by explicit project/revision after save');
  await page.reload();
  // An explicit start route intentionally returns to the chooser on reload.
  await page.locator('#project-start-picker').waitFor({ state: 'visible' });
  await page.locator(`.project-gallery__tile[data-project-id="${expectedImage.projectId}"]`).click();
  await waitReady(page);
  await page.waitForFunction(({ projectId, revisionId }) => {
    const workspace = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace;
    return workspace?.currentProject?.projectId === projectId && workspace?.persistedProject?.revisionId === revisionId
      && workspace?.busy === false && workspace?.dirty === false;
  }, { projectId: expectedImage.projectId, revisionId: expectedImage.revisionId });
  assert.deepEqual(await activeCanonicalSnapshot(page), expectedActive, 'reload restores exact frame/layer metadata and all cel pixels');
  assert.deepEqual(await storedSnapshot(page), expectedImage, 'reload leaves the exact saved shared image unchanged');
  assert.deepEqual(await storedAnimationSnapshot(page), expectedAnimation, 'reload restores the exact saved animation data');
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#creation-project-settings-panel');
    const footer = panel?.querySelector('.creation-project-settings__footer');
    const p = panel?.getBoundingClientRect(), f = footer?.getBoundingClientRect();
    const actions = [...(panel?.querySelectorAll('[data-project-action]') || [])].map(node => node.dataset.projectAction);
    return {
      previewCanvasCount: panel?.querySelectorAll('canvas').length ?? 0, actions,
      panel: p && { x: p.x, y: p.y, width: p.width, height: p.height, clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth },
      footer: f && { x: f.x, y: f.y, width: f.width, height: f.height },
      footerInsidePanel: Boolean(p && f && f.left >= p.left - 1 && f.right <= p.right + 1 && f.top >= p.top - 1 && f.bottom <= p.bottom + 1),
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      panelNoHorizontalOverflow: Boolean(panel && panel.scrollWidth <= panel.clientWidth + 1)
    };
  });
}
async function waitPreview(page, width, height) {
  await page.waitForFunction(({ width, height }) => {
    const panel = document.querySelector('#creation-project-settings-panel');
    const canvas = panel?.querySelector('canvas');
    return canvas?.width === width && canvas?.height === height;
  }, { width, height });
}
async function openPanelForFailure(page) {
  if (await page.locator('#creation-project-settings-panel').count()) return;
  await page.locator('#creation-settings-open').click().catch(() => {});
  await page.locator('#creation-canvas-settings-open').click().catch(() => {});
}
async function runViewport(viewport) {
  const name = `canvas-live-preview-${viewport.width}x${viewport.height}`;
  const context = await contextFor(viewport), page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const caseReport = { name, viewport, status: 'PASS', checks: [] };
  try {
    await startSyntheticWork(page);
    const original = await activeSnapshot(page), saved = await storedSnapshot(page);
    assert.deepEqual(original, { ...original, width: 16, height: 16 });
    assert.deepEqual(saved, { ...saved, width: 16, height: 16 });
    await openCanvasSettings(page);
    await page.waitForTimeout(180);
    const layout = await layoutSnapshot(page);
    assert.equal(layout.previewCanvasCount, 1, 'settings panel contains exactly one preview canvas');
    assert.deepEqual(layout.actions.sort(), ['apply', 'cancel'], 'settings panel exposes only Cancel and Apply');
    assert.equal(layout.panelNoHorizontalOverflow, true, 'settings panel has no horizontal overflow');
    assert.equal(layout.footerInsidePanel, true, 'action footer stays inside the panel');
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `page has no horizontal overflow (${layout.documentWidth}px > ${layout.viewportWidth}px)`);
    caseReport.layout = layout;
    caseReport.checks.push('one preview canvas, Cancel and Apply only, footer inside panel, no horizontal overflow');
    await page.screenshot({ path: `${out}/${name}-panel.png` });

    const width = page.locator('#creation-project-width'), height = page.locator('#creation-project-height');
    const apply = page.locator('[data-project-action="apply"]'), cancel = page.locator('[data-project-action="cancel"]');
    assert.equal(await width.inputValue(), '16');
    assert.equal(await height.inputValue(), '16');
    await width.fill('8'); await height.fill('8');
    await waitPreview(page, 8, 8);
    await page.waitForFunction(() => !document.querySelector('[data-project-action="apply"]')?.disabled);
    assert.deepEqual(await activeSnapshot(page), original, 'auto preview leaves the active animation and pixel pool unchanged');
    assert.deepEqual(await storedSnapshot(page), saved, 'auto preview leaves the stored project revision and pixels unchanged');
    caseReport.checks.push('automatic 16×16 to 8×8 crop preview leaves active pixels and stored project unchanged');

    await cancel.click();
    await page.waitForFunction(() => document.querySelector('#creation-project-settings-panel')?.hidden === true);
    assert.deepEqual(await activeSnapshot(page), original, 'Cancel does not mutate the active work');
    await openCanvasSettings(page);
    await page.waitForTimeout(180);
    assert.equal(await width.inputValue(), '16', 'Cancel/reopen restores the current width');
    assert.equal(await height.inputValue(), '16', 'Cancel/reopen restores the current height');
    await waitPreview(page, 16, 16);
    assert.equal(await apply.isDisabled(), true, 'Cancel/reopen has no stale Apply operation');
    assert.deepEqual(await activeSnapshot(page), original, 'Cancel/reopen keeps the original animation and pixels');
    caseReport.checks.push('Cancel discards preview; reopen restores current dimensions and pixels');

    await width.fill('8'); await height.fill('8');
    await width.fill('12'); await width.fill('10');
    await waitPreview(page, 10, 8);
    await page.waitForTimeout(220);
    assert.equal(await page.locator('#creation-project-settings-panel canvas').evaluate(canvas => `${canvas.width}x${canvas.height}`), '10x8', 'rapid edits settle on the newest preview');
    assert.deepEqual(await activeSnapshot(page), original, 'rapid previews do not mutate the active work');
    await width.fill('');
    await page.waitForTimeout(220);
    assert.equal(await width.inputValue(), '', 'blank numeric input stays blank');
    assert.equal(await apply.isDisabled(), true, 'blank numeric input disables Apply');
    await waitPreview(page, 16, 16);
    await width.evaluate(input => { input.value = 'not-a-number'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(220);
    assert.equal(await width.inputValue(), '', 'nonnumeric input is not repopulated');
    assert.equal(await apply.isDisabled(), true, 'nonnumeric input cannot leave a stale Apply enabled');
    assert.deepEqual(await activeSnapshot(page), original, 'invalid numeric input does not mutate active pixels');
    caseReport.checks.push('rapid edits use latest preview; blank/nonnumeric input stays invalid and cannot apply');

    await width.fill('8'); await height.fill('8');
    await waitPreview(page, 8, 8);
    await page.waitForFunction(() => !document.querySelector('[data-project-action="apply"]')?.disabled);
    assert.deepEqual(await activeSnapshot(page), original, 'active work remains unchanged until Apply');
    await apply.click();
    await page.waitForFunction(() => {
      const timeline = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.getTimeline?.();
      return timeline?.width === 8 && timeline?.height === 8;
    });
    assert.notEqual((await activeSnapshot(page)).hash, original.hash, 'Apply changes the active animation');
    await page.locator('#draw-undo').click();
    await page.waitForFunction(() => {
      const timeline = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.getTimeline?.();
      return timeline?.width === 16 && timeline?.height === 16;
    });
    assert.deepEqual(await activeSnapshot(page), original, 'Undo restores all original animation metadata and pixels');
    caseReport.checks.push('Apply crops the active work; Undo restores the original animation and pixel pool');

    // Undo uses the same edit-history control as the app and may dismiss the settings panel.
    await openCanvasSettings(page);
    assert.equal(await page.locator('#creation-project-width').inputValue(), '16');
    assert.equal(await page.locator('#creation-project-height').inputValue(), '16');
    await page.locator('#creation-project-tab-scale').click();
    const scale = page.locator('#creation-project-scale-percent');
    await scale.fill('200');
    await waitPreview(page, 32, 32);
    await page.waitForFunction(() => !document.querySelector('[data-project-action="apply"]')?.disabled);
    assert.deepEqual(await activeSnapshot(page), original, 'scale preview does not mutate active pixels');
    await apply.click();
    await page.waitForFunction(() => {
      const timeline = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.getTimeline?.();
      return timeline?.width === 32 && timeline?.height === 32;
    });
    await page.locator('#draw-undo').click();
    await page.waitForFunction(() => {
      const timeline = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.getTimeline?.();
      return timeline?.width === 16 && timeline?.height === 16;
    });
    assert.deepEqual(await activeSnapshot(page), original, 'scale Undo restores the original animation and pixels');
    caseReport.checks.push('200% scale Apply and Undo return to the original animation and pixel pool');
    await page.waitForFunction(() => {
      const workspace = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace;
      return workspace?.dirty === false && workspace?.busy === false;
    }, undefined, { timeout: 6000 });
    const afterUndoSaved = await storedSnapshot(page);
    assert.equal(afterUndoSaved.width, 16, 'post-Undo autosave retains original width');
    assert.equal(afterUndoSaved.height, 16, 'post-Undo autosave retains original height');
    assert.equal(afterUndoSaved.hash, saved.hash, 'post-Undo autosave retains original pixels');
    caseReport.checks.push('eventual autosave after Undo retains original 16×16 pixels');

    // Draw/save/reopen and viewport gesture checks use only this disposable synthetic work.
    const firstStroke = await drawRealStroke(page, 0.33);
    const firstSave = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save());
    await page.waitForFunction(() => {
      const workspace = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace;
      return workspace?.busy === false && workspace?.dirty === false;
    });
    const firstImage = await storedSnapshot(page), firstAnimation = await storedAnimationSnapshot(page);
    assert.equal(firstSave.projectId, firstImage.projectId);
    assert.equal(firstSave.revisionId, firstImage.revisionId);
    assert.deepEqual({ width: firstAnimation.width, height: firstAnimation.height, hash: firstAnimation.hash },
      { width: firstStroke.canonical.width, height: firstStroke.canonical.height, hash: firstStroke.canonical.hash }, 'saved PXD animation exactly matches live frame/layer metadata and every cel pixel');
    await reloadSavedSyntheticProject(page, firstStroke.canonical, firstImage, firstAnimation);
    caseReport.checks.push('trusted mouse stroke saves and reloads the same PXD project/revision and animation');

    const beforeView = await activeSnapshot(page), beforeViewCanonical = await activeCanonicalSnapshot(page);
    const beforeViewImage = await storedSnapshot(page), beforeViewAnimation = await storedAnimationSnapshot(page);
    assert.deepEqual(beforeViewCanonical, firstStroke.canonical, 'reopened work matches the first saved stroke before viewport checks');
    const gestureMetrics = await viewportGestureChecks(page);
    assert.deepEqual(await activeSnapshot(page), beforeView, 'wheel, pan, pinch, and cancel leave all active pixels and animation data unchanged');
    assert.deepEqual(await storedSnapshot(page), beforeViewImage, 'viewport gestures leave stored image bytes and revision unchanged');
    assert.deepEqual(await storedAnimationSnapshot(page), beforeViewAnimation, 'viewport gestures leave saved animation bytes and revision unchanged');
    caseReport.viewportGestures = gestureMetrics;
    caseReport.checks.push('wheel zoom, Space+mouse pan, two-contact pinch and cancel leave active and saved artwork unchanged');
    caseReport.checks.push('wheel/pan/pinch each match expected single-render, zero-overlay-backing-write counts');

    const secondStroke = await drawRealStroke(page, 0.72);
    const secondSave = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.save());
    await page.waitForFunction(() => {
      const workspace = window.__PIXIEED_CREATION_HOST__?.runtime?.draw?.workspace;
      return workspace?.busy === false && workspace?.dirty === false;
    });
    const secondImage = await storedSnapshot(page), secondAnimation = await storedAnimationSnapshot(page);
    assert.equal(secondSave.projectId, firstImage.projectId, 'second stroke updates the same synthetic project');
    assert.notEqual(secondSave.revisionId, firstImage.revisionId, 'second stroke creates a newer saved revision');
    assert.equal(secondImage.revisionId, secondSave.revisionId);
    assert.deepEqual({ width: secondAnimation.width, height: secondAnimation.height, hash: secondAnimation.hash },
      { width: secondStroke.canonical.width, height: secondStroke.canonical.height, hash: secondStroke.canonical.hash }, 'second saved PXD animation matches live frame/layer metadata and every cel pixel');
    await reloadSavedSyntheticProject(page, secondStroke.canonical, secondImage, secondAnimation);
    caseReport.checks.push('another trusted stroke saves a newer revision and reopens with exact pixels/animation');

    assert.deepEqual(errors, [], 'no page errors');
    caseReport.checks.push('no page errors');
    await page.screenshot({ path: `${out}/${name}-final.png` });
  } catch (error) {
    caseReport.status = 'FAIL';
    caseReport.error = error.stack || String(error);
    caseReport.errors = errors;
    await openPanelForFailure(page);
    caseReport.layout = await layoutSnapshot(page).catch(() => null);
    caseReport.active = await activeSnapshot(page).catch(() => null);
    caseReport.stored = await storedSnapshot(page).catch(() => null);
    await page.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true }).catch(() => {});
    report.status = 'FAIL';
  } finally {
    report.cases.push(caseReport);
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
}
try {
  const allViewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }];
  const selectedViewports = process.env.PIXIEED_CANVAS_VIEWPORTS
    ? allViewports.filter(viewport => process.env.PIXIEED_CANVAS_VIEWPORTS.split(',').includes(`${viewport.width}x${viewport.height}`)) : allViewports;
  assert.ok(selectedViewports.length, 'PIXIEED_CANVAS_VIEWPORTS must select a supported viewport.');
  for (const viewport of selectedViewports) await runViewport(viewport);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
if (report.status !== 'PASS') process.exitCode = 1;
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ name, status, checks, error }) => ({ name, status, checks, error })), blockedRequests: report.blockedRequests, report: `${out}/report.json` }, null, 2));
