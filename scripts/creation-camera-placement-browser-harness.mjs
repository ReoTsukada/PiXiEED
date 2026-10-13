/** Shared-shell camera target QA. All captures use uploaded synthetic PNGs. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAnimation, ensureAnimationMusicLayer, writeAnimationCel, addAnimationFrame, addAnimationLayer } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';
import { putPxdImage } from '../js/creation/pxd-project.mjs';
import { createCameraPlacementMapping, createCameraPlacementRenderer } from '../js/creation/camera-placement-preview.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4252';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost QA is allowed');
const out = process.env.PIXIEED_CAMERA_PLACEMENT_OUTPUT || '/tmp/pixieed-camera-placement-20261013';
await mkdir(out, { recursive: true });
const startedAt = new Date().toISOString();
const sourceFiles = ['js/creation/creation-camera.mjs', 'js/creation/draw-page.mjs', 'js/creation/draw-camera-core.mjs', 'js/creation/camera-placement-preview.mjs', 'js/creation/animation-core.mjs', 'js/pixel-lens/app.mjs', 'pixel-camera.html', 'css/creation-modes.css'];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
let head = 'UNAVAILABLE'; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const W = 16, H = 16;
const colors = ['#ed2518', '#204de8', '#39ba51', '#eed040'];
let animation = ensureAnimationMusicLayer(createAnimation({ width: W, height: H, palette: colors }));
const f0 = animation.frames[0].id, l0 = animation.layers.find(layer => layer.role !== 'music').id;
const artLayer = (snapshot, index) => snapshot.layers.filter(layer => layer.role !== 'music')[index];
const lower0 = Array(W * H).fill(3), upper0 = Array(W * H).fill(-1);
// Transparent holes beneath the active cel make alpha preservation observable
// in both the stage preview and the copied captured-result preview.
for (const [x, y] of [[0, 8], [5, 5], [9, 9], [11, 11]]) lower0[y * W + x] = -1;
for (const [x, y, color] of [[1, 1, 1], [4, 4, 1], [6, 6, 1], [8, 8, 2], [13, 13, 2], [14, 13, 2]]) upper0[y * W + x] = color;
animation = writeAnimationCel(animation, f0, l0, { width: W, height: H, pixels: Uint8Array.from(lower0, value => value + 1) });
animation = addAnimationLayer(animation, { name: 'Active foreground' });
const l1 = animation.layers.filter(layer => layer.role !== 'music')[1].id;
animation = writeAnimationCel(animation, f0, l1, { width: W, height: H, pixels: Uint8Array.from(upper0, value => value + 1) });
animation = addAnimationLayer(animation, { name: 'Top accent' });
const l2 = animation.layers.filter(layer => layer.role !== 'music')[2].id;
const accent0 = Array.from({ length: W * H }, (_, i) => (i % W === 0 || i % W === W - 1 || Math.floor(i / W) === 0 || Math.floor(i / W) === H - 1) && i % 3 === 0 ? 2 : -1);
animation = writeAnimationCel(animation, f0, l2, { width: W, height: H, pixels: Uint8Array.from(accent0, value => value + 1) });
animation = addAnimationFrame(animation, { copy: false });
const f1 = animation.frames[1].id;
const lower1 = Array.from({ length: W * H }, (_, i) => i % 5 === 0 ? 2 : 3);
const upper1 = Array.from({ length: W * H }, (_, i) => i % 7 === 0 ? 1 : -1);
const accent1 = Array.from({ length: W * H }, (_, i) => (i % 4 === 0 && i % W > 3 && i % W < 12) ? 3 : -1);
animation = writeAnimationCel(animation, f1, l0, { width: W, height: H, pixels: Uint8Array.from(lower1, value => value + 1) });
animation = writeAnimationCel(animation, f1, l1, { width: W, height: H, pixels: Uint8Array.from(upper1, value => value + 1) });
animation = writeAnimationCel(animation, f1, l2, { width: W, height: H, pixels: Uint8Array.from(accent1, value => value + 1) });
await writeFile(`${out}/target-animation.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));

let rectangular = ensureAnimationMusicLayer(createAnimation({ width:32, height:16, palette:colors }));
const rectangularFrame = rectangular.frames[0].id, rectangularLayer = rectangular.layers[0].id;
const rectangularPixels = Array.from({ length:32 * 16 }, (_, i) => i % 32 < 2 || i % 32 > 29 ? -1 : (Math.floor(i / 32) + i % 32) % 4);
for (const i of [5 * 32 + 12, 6 * 32 + 12]) rectangularPixels[i] = -1;
rectangular = writeAnimationCel(rectangular, rectangularFrame, rectangularLayer, { width:32, height:16, pixels:Uint8Array.from(rectangularPixels, value => value + 1) });
await writeFile(`${out}/rectangular-animation.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), rectangular)));

const readOnlyProject = await putPxdImage(createPxdProject(), {
  width: 513, height: 1,
  rgba: new Uint8Array(Array.from({ length: 513 }, (_, i) => [i % 256, (i * 3) % 256, (i * 7) % 256, 255]).flat())
}, 'main');
await writeFile(`${out}/readonly-image.pxd`, await encodePxd(readOnlyProject));

// Exercise the renderer's intended lifecycle independently of UI frame painting:
// snapshot/map once, then reuse mapping, sample and output buffers for every frame.
const perfEvidence = [];
for (const size of [128, 256, 512]) {
  const mask = new Uint8Array(size * size), active = new Int16Array(size * size), below = new Int16Array(size * size), above = new Int16Array(size * size);
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    below[i] = (x + y) % 4; active[i] = (x * 3 + y) % 4; above[i] = (x % 31 === 0 && y % 31 === 0) ? 2 : -1;
    if (x > size * .12 && x < size * .88 && y > size * .12 && y < size * .88 && (x + y) % 5 !== 0) { mask[i] = 1; cells.push(i); }
  }
  let left = size, top = size, right = 0, bottom = 0;
  for (const i of cells) { const x = i % size, y = Math.floor(i / size); left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  const bounds = { x:left, y:top, width:right-left+1, height:bottom-top+1 };
  const mapping = createCameraPlacementMapping({ sourceWidth:320, sourceHeight:240, width:size, height:size, bounds, cells, mask });
  const renderer = createCameraPlacementRenderer({ width:size, height:size, palette:colors, below, active, above, activeVisible:true, activeLocked:false, allowedIndices:[0,1,2,3] }, mapping);
  const frame = { width:320, height:240, data:new Uint8ClampedArray(320 * 240 * 4) };
  for (let i = 0; i < frame.data.length; i += 4) { frame.data[i] = i % 251; frame.data[i+1] = (i * 3) % 251; frame.data[i+2] = (i * 7) % 251; frame.data[i+3] = 255; }
  const sampled = mapping.sampled, offsets = mapping.sourceOffsets, samples = [];
  const t0 = performance.now(); let output = null;
  for (let f = 0; f < 6; f++) { frame.data[0] = f; output = renderer.render(frame); samples.push(output); }
  const elapsedMs = performance.now() - t0;
  assert.ok(samples.every(item => item === output), `${size}px: renderer reuses the same output buffer across frames`);
  assert.equal(mapping.sampled, sampled, `${size}px: mapped sample buffer remains cached`);
  assert.equal(mapping.sourceOffsets, offsets, `${size}px: source mapping remains cached`);
  assert.ok(output.some((value, index) => index % 4 === 3 && value > 0), `${size}px: cached placement renders opaque composite pixels`);
  perfEvidence.push({ size, cells:cells.length, frames:6, elapsedMs:Number(elapsedMs.toFixed(2)), reusedOutputBuffer:true, reusedMapping:true, actualCameraHardware:'UNTESTED' });
}

const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(runtime));
const browser = await chromium.launch({ headless: true });
const reports = [];
const requestedWidths = new Set((process.env.PIXIEED_TEST_WIDTHS || '').split(',').map(value => value.trim()).filter(Boolean).map(Number).filter(Number.isFinite));
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]
  .filter(v => requestedWidths.size ? requestedWidths.has(v.width) : (!process.env.PIXIEED_TEST_WIDTH || v.width === Number(process.env.PIXIEED_TEST_WIDTH)));

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
  const openProjects = async () => {
    const launcher = page.locator('#creation-file-open');
    if (await launcher.isVisible().catch(() => false)) await launcher.click();
    else await page.locator('#project-open').click();
    await page.locator('#pxd-panel').waitFor({ state: 'visible' });
  };
  const loadPxd = async (file, size = [W, H]) => {
    const priorPointer = await currentPointer();
    await openProjects(); await page.locator('#project-tab-library').click();
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
  const saveProject = async ({ force = false } = {}) => {
    const before = await currentPointer();
    const needsRevision = force || await page.locator('#project-open').getAttribute('data-state').then(state => state !== 'saved');
    if (needsRevision) {
      if (!await page.locator('#pxd-panel').evaluate(node => node.open).catch(() => false)) await openProjects();
      if (await page.locator('#project-tab-current').count() && await page.locator('#project-current-pane').isHidden()) await page.locator('#project-tab-current').click();
      const projectMore = page.locator('.project-more');
      if (await projectMore.count() && !await projectMore.evaluate(node => node.open)) await projectMore.locator(':scope > summary').click();
      await page.locator('#pxd-save').click();
    }
    await page.waitForFunction(({ before, needsRevision, force }) => {
      const params = new URLSearchParams(location.search);
      let pointer = null;
      if (params.getAll('pxd').length === 1 && params.getAll('pxdRevision').length === 1) pointer = { projectId: params.get('pxd'), revisionId: params.get('pxdRevision') };
      else if (params.get('modeProjectTool') === 'draw' && params.getAll('modePxd').length === 1 && params.getAll('modePxdRevision').length === 1) pointer = { projectId: params.get('modePxd'), revisionId: params.get('modePxdRevision') };
      else for (const key of ['pixieed:pxd:last:creation', 'pixieed:pxd:last:draw']) { try { pointer = JSON.parse(localStorage.getItem(key) || 'null'); if (pointer?.projectId && pointer?.revisionId) break; } catch {} }
      const saved = document.querySelector('#project-open')?.dataset.state === 'saved' && !document.querySelector('#main')?.inert;
      const pointerChanged = pointer?.projectId !== before?.projectId || pointer?.revisionId !== before?.revisionId;
      const editorStateSaved = force && /保存し直しました/.test(document.querySelector('#pxd-file-status')?.textContent || '');
      return saved && pointer?.projectId && pointer?.revisionId && (!needsRevision || pointerChanged || editorStateSaved);
    }, { before, needsRevision, force });
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
  const viewPixels = async () => {
    const copied = page.locator('.px-tool-result[data-tool-result-view="camera-result"] canvas.px-tool-result__preview:visible');
    const canvas = await copied.count() ? copied : page.locator('#view');
    return canvas.evaluate(node => {
      const { width, height } = node, data = node.getContext('2d').getImageData(0, 0, width, height).data;
      return { width, height, rgba: Array.from(data) };
    });
  };
  const exportedPng = () => page.evaluate(async () => {
    const link = document.querySelector('#savePng');
    if (!link?.href || link.getAttribute('aria-disabled') === 'true') throw new Error('Captured-image export is not ready');
    const response = await fetch(link.href); if (!response.ok) throw new Error('Captured-image export could not be read');
    return { filename:link.download, bytes:Array.from(new Uint8Array(await response.arrayBuffer())) };
  });
  const expectedPlacementView = (snapshot, mask) => page.evaluate(async ({ pointer, frameId, layerId, mask }) => {
    const [{ createToolProjectStore }, { readPxdAnimation }, core, cameraCore, preview] = await Promise.all([
      import('/js/creation/tool-project-store.mjs'), import('/js/creation/pxd-animation.mjs'),
      import('/js/creation/animation-core.mjs?rev=20261012-animation-core-contract-1'),
      import('/js/creation/draw-camera-core.mjs?rev=20261012-animation-core-contract-1'),
      import('/js/creation/camera-placement-preview.mjs?rev=20261013-camera-placement-1')
    ]);
    const project = await createToolProjectStore('draw').load(pointer.projectId, pointer.revisionId);
    const animation = await readPxdAnimation(project), frame = animation.frames.find(item => item.id === frameId);
    const layerIndex = animation.layers.findIndex(item => item.id === layerId), layer = animation.layers[layerIndex];
    if (!frame || !layer || layerIndex < 0) throw new Error('Placement target frame or layer is missing from the saved project');
    const active = core.getAnimationCelDocument(animation, frameId, layerId);
    const targetMask = mask ? new Uint8Array(animation.width * animation.height) : null;
    if (targetMask) for (const index of mask) targetMask[index] = 1;
    const target = cameraCore.prepareCameraTarget(active, targetMask);
    const lower = core.composeAnimationFrame(animation, frameId, { layerIds:animation.layers.slice(0, layerIndex).map(item => item.id) });
    const upper = core.composeAnimationFrame(animation, frameId, { layerIds:animation.layers.slice(layerIndex + 1).map(item => item.id) });
    const link = document.querySelector('#savePng'), blob = await fetch(link.href).then(response => response.blob());
    const bitmap = await createImageBitmap(blob), camera = document.createElement('canvas'); camera.width = bitmap.width; camera.height = bitmap.height;
    const context = camera.getContext('2d', { willReadFrequently:true }); context.drawImage(bitmap, 0, 0); bitmap.close();
    const raw = context.getImageData(0, 0, camera.width, camera.height);
    const mapping = preview.createCameraPlacementMapping({ sourceWidth:camera.width, sourceHeight:camera.height, width:animation.width, height:animation.height,
      bounds:target.bounds, cells:target.cells, mask:targetMask });
    const renderer = preview.createCameraPlacementRenderer({ width:animation.width, height:animation.height, palette:[...animation.palette],
      below:Int16Array.from(lower.pixels), active:Int16Array.from(active.pixels), above:Int16Array.from(upper.pixels),
      activeVisible:Boolean(layer.visible), activeLocked:Boolean(layer.locked), musicOnly:layer.role === 'music',
      allowedIndices:[...animation.palette.keys()] }, mapping);
    const expected = renderer.render({ width:camera.width, height:camera.height, data:new Uint8ClampedArray(raw.data), paletteFixed:Boolean(document.querySelector('#cameraPaletteFixed')?.checked) });
    return { width:animation.width, height:animation.height, rgba:Array.from(expected) };
  }, { pointer:snapshot.pointer, frameId:snapshot.frameId, layerId:snapshot.layerId, mask });
  const importProject = async () => {
    await mode('draw');
    await loadPxd(`${out}/target-animation.pxd`);
    const state = await saveProject();
    assert.equal(state.frames.length, 2); assert.equal(state.layers.filter(layer => layer.role !== 'music').length, 3); assert.equal(state.layers.filter(layer => layer.role === 'music').length, 1); assert.equal(state.palette.length, 4);
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
    await selectCel(state.frames[0].id, artLayer(state, 1).id);
    return saveProject({ force:true });
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
  const pointFor = async (x, y, width, height) => {
    const box = await page.locator('#draw-canvas').boundingBox();
    return { x: box.x + (x + .5) * box.width / width, y: box.y + (y + .5) * box.height / height };
  };
  const point = (x, y) => pointFor(x, y, W, H);
  const dragGridPath = async (coords, width, height) => {
    const points = await Promise.all(coords.map(([x, y]) => pointFor(x, y, width, height)));
    await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.up(); await page.waitForTimeout(80);
  };
  const dragMousePath = coords => dragGridPath(coords, W, H);
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
  const makeCameraPng = async ({ transparentHole = true } = {}) => page.evaluate(transparentHole => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const colors = ['#ff00d4', '#00d9a6', '#f3c900', '#4825ee'];
    for (let x = 0; x < 16; x++) {
      const color = x < 3 ? colors[0] : x < 9 ? colors[1] : x < 12 ? colors[2] : colors[3];
      ctx.fillStyle = color; ctx.fillRect(x, 0, 1, 16);
    }
    ctx.fillStyle = colors[0]; ctx.fillRect(1, 12, 3, 2);
    // Non-zoom runs also include a transparent source hole for the RGBA path.
    // Zoom runs keep alpha fully opaque so interpolation does not trigger the
    // intentional partial-alpha application guard.
    if (transparentHole) ctx.clearRect(6, 6, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  }, transparentHole);
  const cameraMode = async () => {
    await mode('camera');
    assert.equal(new URL(page.url()).pathname, '/draw/', 'camera runs inside the creation route');
    assert.equal(await page.locator('.lc-back[href="/tools/"]').count(), 0, 'standalone tool-list back link is not mounted in creation shell');
  };
  const screenshotSlug = value => String(value || 'camera').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const uploadAndCapture = async ({ exerciseZoom = false, screenshotLabel = 'camera' } = {}) => {
    const png = await makeCameraPng({ transparentHole:!exerciseZoom });
    await page.locator('#cameraImageInput').setInputFiles({ name: 'synthetic-target.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && !document.querySelector('#capture')?.disabled);
    let unzoomedExport = null;
    // A photographic source palette ensures the test image is not silently reduced to the Draw fixture palette.
    const look = page.locator('#toolbarHome [data-tool="look"]');
    if (await look.isVisible().catch(() => false)) {
      await look.click();
      const photo = page.locator('#looks [data-look="photo"]');
      if (await photo.isVisible().catch(() => false)) await photo.click();
      const back = page.locator('#toolbarContextBack'); if (await back.isVisible().catch(() => false)) await back.click();
    }
    if (exerciseZoom) {
      await page.locator('#capture').click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
        && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false');
      unzoomedExport = await exportedPng();
      const retake = page.locator('.px-tool-result[data-tool-result-view="camera-result"] .px-tool-result__return');
      await retake.click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live' && !document.querySelector('#capture')?.disabled);
      const before = await viewPixels();
      await page.locator('#stage').press('+');
      await page.waitForFunction(() => Number(document.querySelector('#toolbarHome [data-tool="zoom"] b')?.textContent?.replace(/[^\d.]/g, '')) > 1);
      const requestedZoom = await page.locator('#toolbarHome [data-tool="zoom"] b').textContent();
      await page.waitForTimeout(350);
      assert.notDeepEqual((await viewPixels()).rgba, before.rgba, 'keyboard zoom changes the live placement preview');
      checks.push({ name:'camera zoom changes the live placement preview', requestedZoom });
    }
    await page.screenshot({ path:`${out}/${viewport.width}x${viewport.height}-${screenshotSlug(screenshotLabel)}-live.png`, fullPage:true });
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
      && !document.querySelector('#useCameraImage')?.disabled
      && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false');
    if (exerciseZoom) {
      const firstExport = await exportedPng();
      assert.notDeepEqual(firstExport.bytes, unzoomedExport.bytes, 'requested zoom changes the processed captured PNG while preserving its source input');
      const retake = page.locator('.px-tool-result[data-tool-result-view="camera-result"] .px-tool-result__return');
      await retake.click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live' && !document.querySelector('#capture')?.disabled);
      await page.locator('#capture').click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
        && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false');
      assert.deepEqual(await exportedPng(), firstExport, 'retake of the same synthetic source preserves source-only PNG bytes');
      checks.push({ name:'retake preserves the uploaded source while refreshing the placement preview' });
    }
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
  const applyScenario = async ({ name, select, frameIndex = 0, layerIndex = 1, whole = false, exerciseZoom = false }) => {
    const before = await importProject();
    await select();
    const mask = whole ? Array.from({ length: W * H }, (_, index) => index) : await readMask(); assert.ok(mask.length > 0, `${name}: current selection mask is nonempty`);
    const targetBefore = await saveProject({ force:true });
    await cameraMode(); await uploadAndCapture({ exerciseZoom, screenshotLabel:name });
    const expectedPreview = await expectedPlacementView(targetBefore, whole ? null : mask);
    const actualPreview = await viewPixels();
    if (!whole && frameIndex === 0 && layerIndex === 1 && name.includes('rectangle')) {
      const transparentOutside = (8 * W + 0) * 4 + 3;
      assert.equal(expectedPreview.rgba[transparentOutside], 0, 'golden composite retains a transparent source-layer hole outside the selected region');
      const alpha = await page.locator('#view').evaluate(canvas => canvas.getContext('2d').getContextAttributes().alpha);
      assert.equal(alpha, true, 'integrated camera preview canvas retains alpha for transparent placement holes');
      checks.push({ name:'integrated camera preview canvas retains transparent RGBA output' });
    }
    assert.deepEqual(actualPreview, expectedPreview, `${name}: visible camera preview equals the Draw composite after placement`);
    const placementStatus = page.locator('#creation-camera-placement');
    assert.match(await placementStatus.textContent(), /作品への配置プレビュー/, `${name}: target status explains the preview`);
    const visibleBoundary = page.locator('#cameraPlacementResultOverlay:visible');
    assert.equal(await visibleBoundary.count() > 0, !whole, `${name}: result has a distinct visible selection-boundary overlay`);
    if (!whole) {
      const boundaryStats = await visibleBoundary.evaluate(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) opaque++;
        return { width:canvas.width, height:canvas.height, opaque };
      });
      assert.equal(boundaryStats.width, W * 4); assert.equal(boundaryStats.height, H * 4); assert.ok(boundaryStats.opaque > 0, `${name}: boundary includes visible selection edges`);
    }
    await page.screenshot({ path:`${out}/${viewport.width}x${viewport.height}-${screenshotSlug(name)}-captured.png`, fullPage:true });
    const geometry = await page.evaluate(() => {
      const rect = selector => { const node = document.querySelector(selector); if (!node || node.hidden) return null; const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; };
      return { status:rect('#creation-camera-placement'), controls:rect('.lc-bottom') };
    });
    if (geometry.status && geometry.controls) assert.ok(geometry.status.bottom <= geometry.controls.y || geometry.status.y >= geometry.controls.bottom, `${name}: placement status does not overlap camera controls`);
    if (viewport.width === 568 && viewport.height === 320) {
      const landscapeGeometry = await page.evaluate(() => {
        const result = document.querySelector('.px-tool-result[data-tool-result-view="camera-result"]');
        const group = result?.querySelector('.px-tool-result__action-group');
        const apply = result?.querySelector('#useCameraImage');
        const retake = result?.querySelector('.px-tool-result__return');
        const header = document.querySelector('.site-header, .lc-top');
        const footer = document.querySelector('.app-tabs');
        const adRow = result?.querySelector('.px-tool-result__ad-row');
        const box = node => {
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { top:r.top, right:r.right, bottom:r.bottom, left:r.left, height:r.height, width:r.width };
        };
        const attrs = node => node ? [...node.attributes].map(attr => [attr.name, attr.value]).sort(([a],[b]) => a.localeCompare(b)) : null;
        const actionItems = group ? [...group.querySelectorAll('button,a')].map(node => ({
          id:node.id, text:node.textContent.trim(), hidden:node.hidden, disabled:node.disabled,
          box:box(node), parent:node.parentElement?.className || ''
        })) : [];
        const headerBox = box(header), footerBox = box(footer), groupBox = box(group), applyBox = box(apply);
        const groupStyle = group ? getComputedStyle(group) : null;
        const scroll = group ? { top:group.scrollTop, height:group.scrollHeight, clientHeight:group.clientHeight,
          overflowY:groupStyle.overflowY } : null;
        const adBefore = attrs(adRow);
        retake?.focus();
        retake?.scrollIntoView({ block:'nearest', inline:'nearest' });
        const retakeBox = box(retake), focused = document.activeElement === retake;
        const scrollAfterFocus = group ? group.scrollTop : null;
        return { headerBox, footerBox, groupBox, applyBox, actionItems, scroll, retakeBox, focused, scrollAfterFocus,
          adBefore, adAfter:attrs(adRow), resultVisible:!!result && getComputedStyle(result).display !== 'none' };
      });
      checks.push({ name:'short-landscape geometry evidence', ...landscapeGeometry });
      assert.ok(landscapeGeometry.resultVisible, `${name}: captured camera result is visible in short landscape`);
      assert.ok(landscapeGeometry.groupBox && landscapeGeometry.applyBox && landscapeGeometry.headerBox && landscapeGeometry.footerBox,
        `${name}: short landscape result, first map/apply action, and fixed header/footer are present`);
      assert.ok(['auto','scroll'].includes(landscapeGeometry.scroll?.overflowY)
        && landscapeGeometry.scroll.height > landscapeGeometry.scroll.clientHeight,
        `${name}: captured actions are in a genuinely scrollable action group`);
      assert.ok(landscapeGeometry.applyBox.top >= landscapeGeometry.headerBox.bottom - 1
        && landscapeGeometry.applyBox.bottom <= landscapeGeometry.footerBox.top + 1,
        `${name}: initial map/apply action is visible below the fixed header and above the fixed footer`);
      assert.ok(landscapeGeometry.focused && landscapeGeometry.retakeBox,
        `${name}: Retake accepts keyboard focus`);
      assert.ok(landscapeGeometry.retakeBox.top >= landscapeGeometry.headerBox.bottom - 1
        && landscapeGeometry.retakeBox.bottom <= landscapeGeometry.footerBox.top + 1,
        `${name}: focusing Retake reveals it between the fixed header and footer`);
      assert.deepEqual(landscapeGeometry.adAfter, landscapeGeometry.adBefore,
        `${name}: the landscape result geometry check leaves ad-row attributes unchanged`);
      checks.at(-1).name = 'short-landscape result actions scroll and remain clear of fixed UI';
    }
    await applyCaptured();
    const after = await saveProject();
    const targetLayerIndex = targetBefore.layers.findIndex(layer => layer.id === artLayer(targetBefore, layerIndex).id);
    const metrics = assertOnlyMaskChanged(targetBefore, after, frameIndex, targetLayerIndex, mask, name);
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
    assert.equal(initial.frames.length, 2); assert.equal(initial.layers.filter(layer => layer.role !== 'music').length, 3); assert.equal(initial.layers.filter(layer => layer.role === 'music').length, 1);
    assert.equal(new URL(page.url()).pathname, '/draw/');
    assert.equal(await page.locator('#draw-camera:visible').count(), 0, 'legacy standalone camera action is not visible in Draw');
    checks.push({ name: 'creation routes preserve /draw/ while camera mode is selected from the mode menu' });

    const rectRun = await applyScenario({ name: 'mouse rectangle includes transparent selected cel cells', exerciseZoom:true, select: async () => {
      await selectCel(initial.frames[0].id, artLayer(initial, 1).id); await rectangle([3, 3], [12, 12]);
    } });
    assert.ok(rectRun.metrics.selectedWasTransparent > 0, 'rectangle includes transparent cells in the active cel');
    assert.ok(rectRun.metrics.transparentNowOpaque > 0, 'camera writes opaque pixels into selected transparent cells');

    await applyScenario({ name: 'same-color selection covers disconnected matching pixels only', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, artLayer(fresh, 1).id);
      await setSelectionMode('color');
      const p = await point(4, 4); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100);
      const mask = await readMask();
      assert.ok(mask.includes(1 * W + 1) && mask.includes(4 * W + 4) && mask.includes(6 * W + 6), 'same-color selection includes separated pixels of the selected color');
      assert.ok(!mask.includes(8 * W + 8), 'same-color selection excludes another palette color');
    } });

    await applyScenario({ name: 'touch lasso irregular selection', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, artLayer(fresh, 1).id);
      await setSelectionMode('lasso'); await touchPath([[2, 2], [10, 3], [7, 10], [3, 8], [2, 2]]);
    } });

    await applyScenario({ name: 'multi-region Shift lasso selection', select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, artLayer(fresh, 1).id);
      await setSelectionMode('lasso'); await dragMousePath([[1, 2], [5, 2], [4, 6], [1, 2]]);
      const first = await readMask(); assert.ok(first.length > 0);
      await page.keyboard.down('Shift'); await dragMousePath([[10, 9], [15, 10], [13, 15], [10, 9]]); await page.keyboard.up('Shift');
      const union = await readMask(); assert.ok(union.length > first.length, 'Shift lasso unions a second disjoint region');
      assert.ok(union.some(i => i % W < 6) && union.some(i => i % W > 9), 'mask retains both separated regions');
    } });

    // The captured image survives mode changes; application targets the current
    // frame, layer, and selection at the moment the user applies it.
    const baseline = await importProject();
    await selectCel(baseline.frames[0].id, artLayer(baseline, 1).id); await rectangle([2, 2], [7, 7]);
    const capturedTarget = await readMask();
    const projectBeforeCamera = await saveProject({ force:true }), drawPixelsBeforeCamera = await currentPixels();
    assert.equal(projectBeforeCamera.layerId, artLayer(baseline, 1).id, 'pre-camera project snapshot retains the explicitly selected active foreground layer');
    assert.equal(projectBeforeCamera.frameId, baseline.frames[0].id, 'pre-camera project snapshot retains the explicitly selected frame');
    await cameraMode(); await uploadAndCapture({ screenshotLabel:'current-target-retarget' });
    const rawCapturedView = await viewPixels();
    assert.ok(rawCapturedView.width > 0 && rawCapturedView.height > 0, 'camera source view is rendered after synthetic capture');
    const sourceExportBeforeRetarget = await exportedPng();
    const stripPointer = ({ pointer, ...snapshot }) => snapshot;
    assert.deepEqual(stripPointer(await saveProject({ force:true })), stripPointer(projectBeforeCamera), 'live preview and capture do not mutate any project cels, palette, frame or layer');
    assert.deepEqual(stripPointer(await saveProject({ force:true })), stripPointer(projectBeforeCamera), 'camera preview updates remain separate from persisted artwork');
    await mode('draw');
    const newTargetFrame = baseline.frames[1].id, newTargetLayer = artLayer(baseline, 0).id;
    await selectCel(newTargetFrame, newTargetLayer); await rectangle([9, 9], [14, 14]);
    const newMask = await readMask(); assert.ok(newMask.length > 0);
    const beforeApply = await saveProject({ force:true });
    await cameraMode();
    assert.deepEqual(await viewPixels(), await expectedPlacementView(beforeApply, newMask), 'retargeted preview matches the current frame/layer/selection that Apply will change');
    assert.deepEqual(await exportedPng(), sourceExportBeforeRetarget, 'retargeting the captured image does not contaminate its standalone PNG export');
    assert.equal(await page.locator('#useCameraImage').isDisabled(), false, 'current target enables apply action');
    const currentTargetStatus = (await page.locator('#creation-camera-target').textContent()).trim();
    assert.ok(currentTargetStatus, 'target status describes the current target');
    assert.ok(currentTargetStatus.includes(`フレーム2・${artLayer(baseline, 0).name}・選択範囲`), 'target status names the newly selected frame, layer, and selection');
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'captured image survives mode switch');
    const staleFrame = await page.locator('#view').evaluate(canvas => [canvas.width, canvas.height]);
    assert.ok(staleFrame[0] > 1 && staleFrame[1] > 1, 'captured image remains available for a fresh target');
    await applyCaptured();
    const afterApply = await saveProject();
    assert.notDeepEqual(await currentPixels(), drawPixelsBeforeCamera, 'applied placement changes the Draw composite');
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
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[1].id, artLayer(fresh, 0).id);
      assert.equal((await readMask()).length, 0, 'freshly opened frame has no selection');
    } });
    await applyScenario({ name: 'hidden active layer stays hidden and other cels are preserved', whole: true, select: async () => {
      const fresh = await projectSnapshot(); await selectCel(fresh.frames[0].id, artLayer(fresh, 1).id);
      const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]'); await launch.click();
      await page.locator(`#draw-animation-controls-panel [data-action="select-layer"][data-layer-id="${artLayer(fresh, 1).id}"]`).click({ button: 'right' });
      await page.locator('[data-frame-menu-action="visibility"]').click(); await launch.click();
      assert.equal((await readMask()).length, 0);
    } });

    // A non-square target verifies that the copied boundary and captured
    // preview share the same object-fit:contain content rectangle.
    await loadPxd(`${out}/rectangular-animation.pxd`, [32, 16]);
    const rectangularState = await saveProject();
    await selectCel(rectangularState.frames[0].id, rectangularState.layers.find(layer => layer.role !== 'music').id);
    await setSelectionMode('rectangle');
    await dragGridPath([[6, 3], [24, 12]], 32, 16);
    const rectangularMask = await readMask(); assert.ok(rectangularMask.length > 0);
    const rectangularTarget = await saveProject();
    await cameraMode(); await uploadAndCapture();
    assert.deepEqual(await viewPixels(), await expectedPlacementView(rectangularTarget, rectangularMask), 'rectangular captured preview matches exact target composite pixels');
    const rectEvidence = await page.evaluate(() => {
      const preview = document.querySelector('.px-tool-result[data-tool-result-view="camera-result"] canvas.px-tool-result__preview');
      const overlay = document.querySelector('#cameraPlacementResultOverlay');
      const picture = preview?.closest('.px-tool-result__picture');
      if (!preview || !overlay || !picture) return null;
      const css = node => getComputedStyle(node).objectFit;
      const box = picture.getBoundingClientRect();
      const contain = (width, height) => {
        const scale = Math.min(box.width / width, box.height / height);
        return { width:width * scale, height:height * scale };
      };
      return { previewSize:[preview.width, preview.height], overlaySize:[overlay.width, overlay.height], previewFit:css(preview), overlayFit:css(overlay),
        previewRect:contain(preview.width, preview.height), overlayRect:contain(overlay.width, overlay.height) };
    });
    assert.ok(rectEvidence, 'rectangular captured result and boundary canvases are present');
    assert.deepEqual(rectEvidence.previewSize, [32, 16]); assert.deepEqual(rectEvidence.overlaySize, [128, 64]);
    assert.equal(rectEvidence.previewFit, 'contain'); assert.equal(rectEvidence.overlayFit, 'contain');
    assert.ok(Math.abs(rectEvidence.previewRect.width - rectEvidence.overlayRect.width) < .01
      && Math.abs(rectEvidence.previewRect.height - rectEvidence.overlayRect.height) < .01, 'preview and boundary occupy the same contained content rectangle');
    await page.screenshot({ path:`${out}/${viewport.width}x${viewport.height}-rectangular-captured.png`, fullPage:true });
    checks.push({ name:'rectangular captured preview and boundary use the same contained aspect ratio', ...rectEvidence });
    await mode('draw');

    // The pre-existing lock/read-only protections must prevent shared-canvas application.
    const lockState = await importProject();
    await selectCel(lockState.frames[0].id, artLayer(lockState, 1).id);
    const launch = page.locator('#draw-animation-controls [data-action="toggle-frames"]'); await launch.click();
    await page.locator(`#draw-animation-controls-panel [data-action="select-layer"][data-layer-id="${artLayer(lockState, 1).id}"]`).click({ button: 'right' });
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
    await page.screenshot({ path: `${out}/${viewport.width}x${viewport.height}-camera-placement-after.png`, fullPage: true });
    reports.push({ viewport, passed: true, checks, errors, browser: 'synthetic image upload only', production: 'UNTESTED' });
  } catch (error) {
    failures.push({ error: error.stack, mode: await page.evaluate(() => document.body.dataset.creationMode).catch(() => null),
      lensMode: await page.locator('#pixelStudio').getAttribute('data-mode').catch(() => null),
      applyMessage: await page.locator('#creation-camera-target').textContent().catch(() => null),
      projectMessage: await page.locator('#creation-camera-project-status').textContent().catch(() => null),
      drawStatus: await page.locator('#draw-status').textContent().catch(() => null),
      applyDisabled: await page.locator('#useCameraImage').isDisabled().catch(() => null), url: page.url() });
    await page.screenshot({ path: `${out}/${viewport.width}x${viewport.height}-failure.png`, fullPage: true }).catch(() => {});
    reports.push({ viewport, passed: false, checks, failures, errors, browser: 'synthetic image upload only', production: 'UNTESTED' });
  }
  await context.close();
}
await browser.close();
const result = { base, startedAt, finishedAt:new Date().toISOString(), head, sourceHashes, externalRequests:'ABORTED', physicalCamera:'UNTESTED / no permission requested', rendererPerformance:perfEvidence, results:reports };
await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (reports.some(report => !report.passed)) process.exitCode = 1;
