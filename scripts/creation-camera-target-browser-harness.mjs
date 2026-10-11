/** Shared-shell camera target QA. All captures use uploaded synthetic PNGs. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel, addAnimationFrame, addAnimationLayer } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';
import { putPxdImage } from '../js/creation/pxd-project.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost QA is allowed');
const out = process.env.PIXIEEED_CAMERA_TARGET_OUTPUT || '/tmp/pixieed-camera-target';
await mkdir(out, { recursive: true });
const W = 16, H = 16;
const colors = ['#ed2518', '#204de8', '#39ba51', '#eed040'];
let animation = createAnimation({ width: W, height: H, palette: colors });
const f0 = animation.frames[0].id, l0 = animation.layers[0].id;
const lower0 = Array(W * H).fill(3), upper0 = Array(W * H).fill(-1);
for (const [x, y, color] of [[1, 1, 1], [4, 4, 1], [6, 6, 1], [8, 8, 2], [13, 13, 2], [14, 13, 2]]) upper0[y * W + x] = color;
animation = writeAnimationCel(animation, f0, l0, { width: W, height: H, pixels: Uint8Array.from(lower0, value => value + 1) });
animation = addAnimationLayer(animation, { name: 'Active foreground' });
const l1 = animation.layers[1].id;
animation = writeAnimationCel(animation, f0, l1, { width: W, height: H, pixels: Uint8Array.from(upper0, value => value + 1) });
animation = addAnimationFrame(animation, { copy: false });
const f1 = animation.frames[1].id;
const lower1 = Array.from({ length: W * H }, (_, i) => i % 5 === 0 ? 2 : 3);
const upper1 = Array.from({ length: W * H }, (_, i) => i % 7 === 0 ? 1 : -1);
animation = writeAnimationCel(animation, f1, l0, { width: W, height: H, pixels: Uint8Array.from(lower1, value => value + 1) });
animation = writeAnimationCel(animation, f1, l1, { width: W, height: H, pixels: Uint8Array.from(upper1, value => value + 1) });
await writeFile(`${out}/target-animation.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));

const readOnlyProject = await putPxdImage(createPxdProject(), {
  width: 513, height: 1,
  rgba: new Uint8Array(Array.from({ length: 513 }, (_, i) => [i % 256, (i * 3) % 256, (i * 7) % 256, 255]).flat())
}, 'main');
await writeFile(`${out}/readonly-image.pxd`, await encodePxd(readOnlyProject));

const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime));
const browser = await chromium.launch({ headless: true });
const reports = [];
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }]
  .filter(v => !process.env.PIXIEED_TEST_WIDTH || v.width === Number(process.env.PIXIEED_TEST_WIDTH));

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true });
  const origin = new URL(base).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.__cameraTargetQA = { permissionRequests: 0 };
    const media = navigator.mediaDevices;
    if (media) Object.defineProperty(media, 'getUserMedia', { configurable: true, value: async () => {
      window.__cameraTargetQA.permissionRequests += 1;
      throw new Error('Synthetic camera QA never requests physical-device permissions');
    } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const checks = [], failures = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = mode => page.waitForFunction(expected => document.documentElement.dataset.creationModesReady === 'true'
    && document.body.dataset.creationMode === expected
    && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'), mode);
  const mode = async name => {
    if (await page.evaluate(() => document.body.dataset.creationMode) === name) return ready(name);
    const menu = page.locator('#creation-mode-menu'); await menu.evaluate(node => { node.open = true; });
    await page.locator(`button[data-creation-mode="${name}"]`).click(); await ready(name);
  };
  const currentPointer = () => page.evaluate(() => {
    const params = new URLSearchParams(location.search);
    if (params.getAll('pxd').length === 1 && params.getAll('pxdRevision').length === 1) {
      return { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
    }
    if (params.get('modeProjectTool') === 'draw' && params.getAll('modePxd').length === 1 && params.getAll('modePxdRevision').length === 1) {
      return { projectId: params.get('modePxd'), revisionId: params.get('modePxdRevision') };
    }
    for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) {
      try { const pointer = JSON.parse(localStorage.getItem(key) || 'null'); if (pointer?.projectId && pointer?.revisionId) return pointer; } catch {}
    }
    return null;
  });
  const loadPxd = async (file, size = [W, H]) => {
    const priorPointer = await currentPointer();
    await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
    await page.locator('#pxd-file-input').setInputFiles(file);
    await page.waitForFunction(({ priorPointer, width, height }) => {
      const params = new URLSearchParams(location.search);
      let pointer = null;
      if (params.getAll('pxd').length === 1 && params.getAll('pxdRevision').length === 1) pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      else if (params.get('modeProjectTool') === 'draw' && params.getAll('modePxd').length === 1 && params.getAll('modePxdRevision').length === 1) pointer = { projectId: params.get('modePxd'), revisionId: params.get('modePxdRevision') };
      else for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) { try { pointer = JSON.parse(localStorage.getItem(key) || 'null'); if (pointer?.projectId && pointer?.revisionId) break; } catch {} }
      const sizeLabel = document.querySelector('#draw-size-label')?.textContent || '';
      return !document.querySelector('#main')?.inert && pointer?.projectId && pointer?.revisionId
        && (pointer.projectId !== priorPointer?.projectId || pointer.revisionId !== priorPointer?.revisionId)
        && sizeLabel.includes(`${width}×${height}`);
    }, { priorPointer, width: size[0], height: size[1] });
    if (await page.locator('#pxd-panel').evaluate(node => node.open)) await page.locator('#project-close').click();
  };
  const saveProject = async () => {
    const before = await currentPointer();
    const needsRevision = await page.locator('#project-open').getAttribute('data-state').then(state => state !== 'saved');
    if (needsRevision) await page.locator('#pxd-save').evaluate(node => node.click());
    await page.waitForFunction(({ before, needsRevision }) => {
      const params = new URLSearchParams(location.search);
      let pointer = null;
      if (params.getAll('pxd').length === 1 && params.getAll('pxdRevision').length === 1) pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      else if (params.get('modeProjectTool') === 'draw' && params.getAll('modePxd').length === 1 && params.getAll('modePxdRevision').length === 1) pointer = { projectId: params.get('modePxd'), revisionId: params.get('modePxdRevision') };
      else for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) { try { pointer = JSON.parse(localStorage.getItem(key) || 'null'); if (pointer?.projectId && pointer?.revisionId) break; } catch {} }
      const saved = document.querySelector('#project-open')?.dataset.state === 'saved' && !document.querySelector('#main')?.inert;
      return saved && pointer?.projectId && pointer?.revisionId && (!needsRevision || pointer.projectId !== before?.projectId || pointer.revisionId !== before?.revisionId);
    }, { before, needsRevision });
    const snapshot = await projectSnapshot();
    if (await page.locator('#pxd-panel').evaluate(node => node.open).catch(() => false)) await page.locator('#project-close').click();
    return snapshot;
  };
  const projectSnapshot = () => page.evaluate(async () => {
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
    const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
    const params = new URLSearchParams(location.search);
    let ref = null;
    if (params.getAll('pxd').length === 1 && params.getAll('pxdRevision').length === 1) ref = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
    else if (params.get('modeProjectTool') === 'draw' && params.getAll('modePxd').length === 1 && params.getAll('modePxdRevision').length === 1) ref = { projectId: params.get('modePxd'), revisionId: params.get('modePxdRevision') };
    else for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) { try { ref = JSON.parse(localStorage.getItem(key) || 'null'); if (ref?.projectId && ref?.revisionId) break; } catch {} }
    if (!ref) throw new Error('Draw PXD pointer is missing');
    const project = await createToolProjectStore('draw').load(ref.projectId, ref.revisionId);
    const model = await readPxdAnimation(project);
    const state = project.manifest?.editorState?.draw;
    return {
      pointer: ref, palette: model.palette, frames: model.frames.map(frame => ({ ...frame })),
      layers: model.layers.map(layer => ({ ...layer })), frameId: state?.frameId, layerId: state?.layerId,
      cels: model.frames.map(frame => model.layers.map(layer => [...getAnimationCelDocument(model, frame.id, layer.id).pixels]))
    };
  });
  const currentPixels = () => page.locator('#draw-canvas').evaluate(canvas => {
    const { width, height } = canvas, data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    return { width, height, rgba: Array.from(data) };
  });
  const importProject = async () => {
    await mode('draw');
    await loadPxd(`${out}/target-animation.pxd`);
    const state = await saveProject();
    assert.equal(state.frames.length, 2); assert.equal(state.layers.length, 2); assert.equal(state.palette.length, 4);
    const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]');
    if (!await page.locator('#draw-animation-controls-panel').isVisible().catch(() => false)) await launch.click();
    await page.locator('#draw-animation-controls-panel [data-action="select-cel"]').first().waitFor({ state: 'visible' });
    const domIds = await page.locator('#draw-animation-controls-panel').evaluate(root => ({
      frames: [...new Set([...root.querySelectorAll('[data-action="select-cel"]')].map(node => node.dataset.frameId))].sort(),
      layers: [...new Set([...root.querySelectorAll('[data-action="select-cel"]')].map(node => node.dataset.layerId))].sort()
    }));
    assert.deepEqual(domIds.frames, state.frames.map(frame => String(frame.id)).sort(), 'visible animation frame IDs match the PXD revision loaded from the active pointer');
    assert.deepEqual(domIds.layers, state.layers.map(layer => String(layer.id)).sort(), 'visible animation layer IDs match the PXD revision loaded from the active pointer');
    await launch.click().catch(() => {});
    await selectCel(state.frames[0].id, state.layers[1].id);
    return saveProject();
  };
  const selectCel = async (frameId, layerId) => {
    const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]');
    if (!await page.locator('#draw-animation-controls-panel').isVisible().catch(() => false)) await launch.click();
    const cel = page.locator(`#draw-animation-controls-panel [data-action="select-cel"][data-frame-id="${frameId}"][data-layer-id="${layerId}"]`);
    await cel.click();
    await page.waitForFunction(({ frameId, layerId }) => {
      const selected = document.querySelector('#draw-animation-controls-panel [data-action="select-cel"][aria-selected="true"]');
      return selected?.dataset.frameId === frameId && selected?.dataset.layerId === layerId;
    }, { frameId: String(frameId), layerId: String(layerId) });
    await launch.click().catch(() => {});
  };
  const openTools = async () => {
    const details = page.locator('#draw-tool-picker');
    if (!await details.evaluate(node => node.open)) await page.locator('#draw-tool-summary').click();
  };
  const setSelectionMode = async selectionMode => {
    await openTools();
    await page.locator(`.draw-select-tool-modes [data-selection-mode="${selectionMode}"]`).click();
    await page.waitForFunction(value => document.querySelector(`.draw-select-tool-modes [data-selection-mode="${value}"]`)?.getAttribute('aria-pressed') === 'true', selectionMode);
  };
  const point = async (x, y) => {
    const box = await page.locator('#draw-canvas').boundingBox();
    return { x: box.x + (x + .5) * box.width / W, y: box.y + (y + .5) * box.height / H };
  };
  const dragMousePath = async coords => {
    const points = await Promise.all(coords.map(([x, y]) => point(x, y)));
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.up(); await page.waitForTimeout(80);
  };
  const rectangle = async (a = [3, 3], b = [12, 12]) => {
    await setSelectionMode('rectangle');
    await dragMousePath([a, b]);
  };
  const readMask = () => page.locator('.draw-selection-mask').evaluate(canvas => {
    const frame = document.querySelector('.draw-selection');
    if (frame?.hidden) return [];
    const w = Number(document.querySelector('#draw-canvas').width), h = Number(document.querySelector('#draw-canvas').height);
    if (canvas.hidden) {
      const x = Number(frame.dataset.x), y = Number(frame.dataset.y), width = Number(frame.dataset.width), height = Number(frame.dataset.height), out = [];
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) if (cx + .5 >= x && cx + .5 < x + width && cy + .5 >= y && cy + .5 < y + height) out.push(cy * w + cx);
      return out;
    }
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[((y * 4 + 1) * canvas.width + x * 4 + 1) * 4 + 3] > 0) out.push(y * w + x);
    return out;
  });
  const makeCameraPng = async () => page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ['#ff00d4', '#00d9a6', '#f3c900', '#4825ee'].forEach((color, i) => {
      ctx.fillStyle = color; ctx.fillRect((i % 2) * 8, Math.floor(i / 2) * 8, 8, 8);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const cameraMode = async () => {
    await mode('camera');
    assert.equal(new URL(page.url()).pathname, '/draw/', 'camera runs inside the creation route');
    assert.equal(await page.locator('.lc-back[href="/tools/"]').count(), 0, 'standalone tool-list back link is not mounted in creation shell');
  };
  const uploadAndCapture = async () => {
    const png = await makeCameraPng();
    await page.locator('#cameraImageInput').setInputFiles({ name: 'synthetic-target.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && !document.querySelector('#capture')?.disabled);
    // A photographic source palette ensures the test image is not silently reduced to the Draw fixture palette.
    const look = page.locator('#toolbarHome [data-tool="look"]');
    if (await look.isVisible().catch(() => false)) {
      await look.click();
      const photo = page.locator('#looks [data-look="photo"]');
      if (await photo.isVisible().catch(() => false)) await photo.click();
      const back = page.locator('#toolbarContextBack'); if (await back.isVisible().catch(() => false)) await back.click();
    }
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
      && !document.querySelector('#useCameraImage')?.disabled);
  };
  const applyCaptured = async () => {
    await page.locator('#useCameraImage').click();
    await ready('draw');
  };
  const assertOnlyMaskChanged = (before, after, frameIndex, layerIndex, mask, label) => {
    let changedInside = 0, selectedWasTransparent = 0, transparentNowOpaque = 0;
    assert.deepEqual(after.layers, before.layers, `${label}: layer properties preserved`);
    assert.deepEqual(after.frames, before.frames, `${label}: frame properties preserved`);
    const targetBefore = before.cels[frameIndex][layerIndex], targetAfter = after.cels[frameIndex][layerIndex], selected = new Set(mask);
    for (let f = 0; f < before.frames.length; f++) for (let l = 0; l < before.layers.length; l++) {
      if (f !== frameIndex || l !== layerIndex) assert.deepEqual(after.cels[f][l], before.cels[f][l], `${label}: unrelated cel ${f}/${l} unchanged`);
    }
    for (let i = 0; i < targetBefore.length; i++) {
      if (!selected.has(i)) assert.equal(targetAfter[i], targetBefore[i], `${label}: target outside selection ${i} unchanged`);
      else {
        if (targetBefore[i] < 0) selectedWasTransparent++;
        if (targetBefore[i] < 0 && targetAfter[i] >= 0) transparentNowOpaque++;
        if (targetAfter[i] !== targetBefore[i]) changedInside++;
      }
    }
    assert.ok(changedInside > 0, `${label}: selected target pixels change`);
    return { changedInside, selectedWasTransparent, transparentNowOpaque };
  };
  const applyScenario = async ({ name, select, frameIndex = 0, layerIndex = 1, whole = false }) => {
    const before = await importProject();
    await select();
    const mask = whole ? Array.from({ length: W * H }, (_, index) => index) : await readMask(); assert.ok(mask.length > 0, `${name}: current selection mask is nonempty`);
    const targetBefore = await saveProject();
    await cameraMode(); await uploadAndCapture(); await applyCaptured();
    const after = await saveProject();
    const metrics = assertOnlyMaskChanged(targetBefore, after, frameIndex, layerIndex, mask, name);
    const prefix = targetBefore.palette;
    assert.deepEqual(after.palette.slice(0, prefix.length), prefix, `${name}: existing palette is a stable prefix`);
    assert.ok(after.palette.length <= 32, `${name}: palette limit`);
    await page.locator('#draw-undo').click();
    const undone = await saveProject(); assert.deepEqual(undone.cels, targetBefore.cels, `${name}: one Undo restores every cel`); assert.deepEqual(undone.palette, targetBefore.palette, `${name}: one Undo restores palette`);
    await page.locator('#draw-redo').click();
    const redone = await saveProject(); assert.deepEqual(redone.cels, after.cels, `${name}: one Redo restores every cel`); assert.deepEqual(redone.palette, after.palette, `${name}: one Redo restores palette`);
    checks.push({ name, maskCells: mask.length, ...metrics });
    return { before: targetBefore, after, mask, metrics };
  };
  const cdp = await context.newCDPSession(page);
  const touchPath = async coords => {
    const points = await Promise.all(coords.map(([x, y]) => point(x, y)));
    const touchPoints = points.map(p => ({ id: 71, x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoints[0]] });
    for (const p of touchPoints.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
  };

  try {
    await page.goto(`${base}/draw/`);
    await ready('draw');
    await loadPxd(`${out}/target-animation.pxd`);
    const initial = await saveProject();
    assert.equal(initial.frames.length, 2); assert.equal(initial.layers.length, 2);
    assert.equal(new URL(page.url()).pathname, '/draw/');
    assert.equal(await page.locator('#draw-camera:visible').count(), 0, 'legacy standalone camera action is not visible in Draw');
    checks.push({ name: 'creation routes preserve /draw/ while camera mode is selected from the mode menu' });

    const rectRun = await applyScenario({ name: 'mouse rectangle includes transparent selected cel cells', select: async () => {
      await selectCel(initial.frames[0].id, initial.layers[1].id); await rectangle([3, 3], [12, 12]);
    } });
    assert.ok(rectRun.metrics.selectedWasTransparent > 0, 'rectangle includes transparent cells in the active cel');
    assert.ok(rectRun.metrics.transparentNowOpaque > 0, 'camera writes opaque pixels into selected transparent cells');

    await applyScenario({ name: 'touch lasso irregular selection', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, fresh.layers[1].id);
      await setSelectionMode('lasso'); await touchPath([[2, 2], [10, 3], [7, 10], [3, 8], [2, 2]]);
    } });

    await applyScenario({ name: 'multi-region Shift lasso selection', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, fresh.layers[1].id);
      await setSelectionMode('lasso'); await dragMousePath([[1, 2], [5, 2], [4, 6], [1, 2]]);
      const first = await readMask(); assert.ok(first.length > 0);
      await page.keyboard.down('Shift'); await dragMousePath([[10, 9], [15, 10], [13, 15], [10, 9]]); await page.keyboard.up('Shift');
      const union = await readMask(); assert.ok(union.length > first.length, 'Shift lasso unions a second disjoint region');
      assert.ok(union.some(i => i % W < 6) && union.some(i => i % W > 9), 'mask retains both separated regions');
    } });

    await applyScenario({ name: 'virtual cursor selection mask', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, fresh.layers[1].id);
      await setSelectionMode('lasso');
      await page.locator('#draw-settings-summary').click(); await page.locator('#draw-virtual-toggle').click(); await page.keyboard.press('Escape');
      const board = await page.locator('.draw-board').boundingBox(), button = await page.locator('[data-virtual-left]').boundingBox();
      assert.ok(board && button, 'virtual pad and left-button controls are mounted');
      const pad = { id: 41, x: board.x + board.width / 2, y: board.y + board.height / 2, radiusX: 1, radiusY: 1, force: 1 };
      const press = { id: 42, x: button.x + button.width / 2, y: button.y + button.height / 2, radiusX: 1, radiusY: 1, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pad] }); await page.waitForTimeout(35);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pad, press] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...pad, x: pad.x + 48, y: pad.y + 48 }, press] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [press] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(100);
      assert.ok((await readMask()).length > 0, 'virtual cursor produces the live selection mask');
    } });

    await page.locator('#draw-settings-summary').click(); await page.locator('#draw-virtual-toggle').click(); await page.keyboard.press('Escape');

    // The captured image survives mode changes; application targets the current
    // frame, layer, and selection at the moment the user applies it.
    const baseline = await importProject();
    await selectCel(baseline.frames[0].id, baseline.layers[1].id); await rectangle([2, 2], [7, 7]);
    const capturedTarget = await readMask();
    await cameraMode(); await uploadAndCapture();
    await mode('draw');
    const newTargetFrame = baseline.frames[1].id, newTargetLayer = baseline.layers[0].id;
    await selectCel(newTargetFrame, newTargetLayer); await rectangle([9, 9], [14, 14]);
    const newMask = await readMask(); assert.ok(newMask.length > 0);
    const beforeApply = await saveProject();
    await cameraMode();
    assert.equal(await page.locator('#useCameraImage').isDisabled(), false, 'current target enables apply action');
    const currentTargetStatus = (await page.locator('#creation-camera-target').textContent()).trim();
    assert.ok(currentTargetStatus, 'target status describes the current target');
    assert.ok(currentTargetStatus.includes(`フレーム2・${baseline.layers[0].name}・選択範囲`), 'target status names the newly selected frame, layer, and selection');
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'captured image survives mode switch');
    const staleFrame = await page.locator('#view').evaluate(canvas => [canvas.width, canvas.height]);
    assert.ok(staleFrame[0] > 1 && staleFrame[1] > 1, 'captured image remains available for a fresh target');
    await applyCaptured();
    const afterApply = await saveProject();
    const targetFrameIndex = beforeApply.frames.findIndex(frame => frame.id === newTargetFrame);
    const targetLayerIndex = beforeApply.layers.findIndex(layer => layer.id === newTargetLayer);
    const retargetMetrics = assertOnlyMaskChanged(beforeApply, afterApply, targetFrameIndex, targetLayerIndex, newMask, 'apply-time current target');
    assert.deepEqual(afterApply.cels[0][1], beforeApply.cels[0][1], 'the previously selected frame/layer cel is unchanged');
    assert.deepEqual(afterApply.palette.slice(0, beforeApply.palette.length), beforeApply.palette, 'existing palette remains a stable prefix');
    assert.ok(afterApply.palette.length <= 32, 'palette limit');
    await page.locator('#draw-undo').click();
    const retargetUndo = await saveProject();
    assert.deepEqual(retargetUndo.cels, beforeApply.cels, 'one Undo restores all cels');
    assert.deepEqual(retargetUndo.palette, beforeApply.palette, 'one Undo restores palette');
    await page.locator('#draw-redo').click();
    const retargetRedo = await saveProject();
    assert.deepEqual(retargetRedo.cels, afterApply.cels, 'one Redo reapplies only the current target change');
    assert.deepEqual(retargetRedo.palette, afterApply.palette, 'one Redo restores palette atomically');
    checks.push({ name: 'captured image targets current frame/layer/selection at apply time', oldMaskCells: capturedTarget.length, newMaskCells: newMask.length, targetFrameIndex, targetLayerIndex, ...retargetMetrics });

    await applyScenario({ name: 'without selection only the current frame and layer change', whole: true, frameIndex: 1, layerIndex: 0, select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[1].id, fresh.layers[0].id);
      assert.equal((await readMask()).length, 0, 'freshly opened frame has no selection');
    } });
    await applyScenario({ name: 'hidden active layer stays hidden and other cels are preserved', whole: true, select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, fresh.layers[1].id);
      const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]'); await launch.click();
      await page.locator(`#draw-animation-controls-panel [data-action="select-layer"][data-layer-id="${fresh.layers[1].id}"]`).click({ button: 'right' });
      await page.locator('[data-frame-menu-action="visibility"]').click(); await launch.click();
      assert.equal((await readMask()).length, 0);
    } });

    // The pre-existing lock/read-only protections must prevent shared-canvas application.
    const lockState = await importProject();
    await selectCel(lockState.frames[0].id, lockState.layers[1].id);
    const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]'); await launch.click();
    await page.locator(`#draw-animation-controls-panel [data-action="select-layer"][data-layer-id="${lockState.layers[1].id}"]`).click({ button: 'right' });
    await page.locator('[data-frame-menu-action="lock"]').click(); await launch.click();
    await cameraMode();
    assert.equal(await page.locator('#useCameraImage').isDisabled(), true, 'locked active layer disables image application');
    checks.push({ name: 'locked active layer protection' });
    await mode('draw');
    await loadPxd(`${out}/readonly-image.pxd`, [513, 1]);
    const readonlyPixels = await currentPixels();
    const modeMenu = page.locator('#creation-mode-menu'); await modeMenu.evaluate(node => { node.open = true; });
    const cameraOption = page.locator('button[data-creation-mode="camera"]');
    assert.equal(await cameraOption.isDisabled(), false, 'mode option remains available; read-only policy is handled during transition');
    await cameraOption.click();
    await page.waitForFunction(() => !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'));
    const readonlyMode = await page.evaluate(() => document.body.dataset.creationMode);
    assert.equal(readonlyMode, 'camera');
    assert.equal(await page.locator('#useCameraImage').isDisabled(), true, 'read-only original cannot be changed by image application');
    const readonlyEntryMessage = await page.locator('#useCameraImage').getAttribute('title');
    assert.match(readonlyEntryMessage, /原本|編集可能/);
    await mode('draw');
    assert.deepEqual(await currentPixels(), readonlyPixels, 'camera mode leaves every original pixel and its size unchanged');
    checks.push({ name: 'read-only oversized original blocks camera application and preserves every pixel', resultingMode: readonlyMode, message: readonlyEntryMessage });

    assert.equal(await page.evaluate(() => window.__cameraTargetQA.permissionRequests), 0, 'no physical camera permission request');
    assert.deepEqual(errors, [], 'no uncaught page errors');
    await page.screenshot({ path: `${out}/${viewport.width}-camera-target-final.png` });
    reports.push({ viewport, passed: true, checks, errors, browser: 'synthetic image upload only', production: 'UNTESTED' });
  } catch (error) {
    failures.push({ error: error.stack, mode: await page.evaluate(() => document.body.dataset.creationMode).catch(() => null), url: page.url() });
    await page.screenshot({ path: `${out}/${viewport.width}-failure.png`, fullPage: true }).catch(() => {});
    reports.push({ viewport, passed: false, checks, failures, errors, browser: 'synthetic image upload only', production: 'UNTESTED' });
  }
  await context.close();
}
await browser.close();
const result = { base, externalRequests: 'ABORTED', physicalCamera: 'UNTESTED / no permission requested', results: reports };
await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (reports.some(report => !report.passed)) process.exitCode = 1;
