import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  const autosaveErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  page.on('console', message => {
    const text = message.text();
    if (/Autosave failed|missing project payload/i.test(text)) {
      autosaveErrors.push(text);
    }
  });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'layer-add-history-runtime');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });

  const frameAddDomReuse = await page.evaluate(async () => {
    const frameProbe = document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]');
    const bodyProbe = document.querySelector('.timeline-cell--body[data-timeline-frame-index="0"]');
    for (let index = 0; index < 5; index += 1) {
      document.getElementById('addFrame')?.click();
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    await new Promise(resolve => window.setTimeout(resolve, 200));
    return {
      frameHeader: document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]') === frameProbe,
      bodyCell: document.querySelector('.timeline-cell--body[data-timeline-frame-index="0"]') === bodyProbe,
    };
  });
  assert.equal(frameAddDomReuse.frameHeader, true, 'adding frames must retain existing frame header DOM');
  assert.equal(frameAddDomReuse.bodyCell, true, 'adding frames must retain existing body-cell DOM');
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );
  const readCurrentAutosaveRevision = async () => await page.evaluate(async () => {
    const session = window.__pixieedrawGetActiveProjectSession?.() || null;
    const projectId = session?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-autosave-v2-experimental');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (storeName, key) => new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    try {
      const current = await read('localProjectCurrentManifests', projectId);
      const manifest = await read('localProjectManifests', current?.manifestKey || '');
      const journal = await read('localProjectJournals', manifest?.project?.journalRef?.key || '');
      return {
        projectId,
        revision: Number(manifest?.revision) || 0,
        checkpointKey: manifest?.project?.checkpointRef?.key || '',
        ops: Array.isArray(journal?.ops) ? journal.ops : [],
      };
    } finally {
      database.close();
    }
  });
  const beforeLayerAddAutosave = await readCurrentAutosaveRevision();
  const frameAddOps = beforeLayerAddAutosave.ops.filter(op => op?.kind === 'frame-add');
  assert.equal(frameAddOps.length, 5, 'each blank frame add must be persisted as a structural journal operation');
  assert.ok(
    frameAddOps.every(op => op.frames?.every(entry => entry.frame?.layers?.every(layer => (
      layer.indices == null && layer.indicesImplicitTransparent === true
    )))),
    'blank frame journal entries must not contain full pixel buffers'
  );
  const layerAddDomReuse = await page.evaluate(async () => {
    const frameProbe = document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]');
    const bodyProbe = document.querySelector('.timeline-cell--body[data-timeline-frame-index="0"]');
    document.getElementById('addLayer')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 200));
    return {
      frameHeader: document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]') === frameProbe,
      bodyCellRetained: Array.from(document.querySelectorAll('.timeline-cell--body')).includes(bodyProbe),
    };
  });
  assert.equal(layerAddDomReuse.frameHeader, true, 'adding a layer must retain existing frame header DOM');
  assert.equal(layerAddDomReuse.bodyCellRetained, true, 'adding a layer must move instead of recreate existing body cells');
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );
  const afterLayerAddAutosave = await readCurrentAutosaveRevision();
  assert.ok(
    afterLayerAddAutosave.revision > beforeLayerAddAutosave.revision,
    'layer add must advance the autosave revision'
  );
  assert.equal(
    afterLayerAddAutosave.checkpointKey,
    beforeLayerAddAutosave.checkpointKey,
    'blank layer add must reuse the existing checkpoint'
  );
  const layerAddOp = afterLayerAddAutosave.ops.find(op => op?.kind === 'layer-add');
  assert.ok(layerAddOp, 'blank layer add must be persisted as a structural journal operation');
  assert.equal(layerAddOp.layers.length, 6);
  assert.ok(
    layerAddOp.layers.every(entry => (
      entry?.layer?.indices == null
      && entry?.layer?.indicesImplicitTransparent === true
    )),
    'blank layer journal entries must not contain full pixel buffers'
  );
  await page.waitForTimeout(100);
  const afterAdd = await page.evaluate(() => ({
    frames: document.querySelectorAll('.timeline-cell--frame-header').length,
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
    undoEnabled: !document.getElementById('undoAction')?.disabled,
  }));
  assert.equal(afterAdd.frames, 6);
  assert.equal(afterAdd.layers, 2);
  assert.equal(afterAdd.undoEnabled, true);

  await page.evaluate(() => document.getElementById('undoAction')?.click());
  await page.waitForTimeout(100);
  const afterUndo = await page.evaluate(() => ({
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
    redoEnabled: !document.getElementById('redoAction')?.disabled,
  }));
  assert.equal(afterUndo.layers, 1);
  assert.equal(afterUndo.redoEnabled, true);

  await page.evaluate(() => document.getElementById('redoAction')?.click());
  await page.waitForTimeout(100);
  const afterRedo = await page.evaluate(() => ({
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
    undoEnabled: !document.getElementById('undoAction')?.disabled,
  }));
  assert.equal(afterRedo.layers, 2);
  assert.equal(afterRedo.undoEnabled, true);

  await page.evaluate(() => document.getElementById('undoAction')?.click());
  await page.waitForTimeout(100);
  await page.evaluate(() => document.getElementById('undoAction')?.click());
  await page.waitForTimeout(100);
  const afterFrameUndo = await page.evaluate(() => ({
    frames: document.querySelectorAll('.timeline-cell--frame-header').length,
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
  }));
  assert.equal(afterFrameUndo.frames, 5);
  assert.equal(afterFrameUndo.layers, 1);

  await page.evaluate(() => document.getElementById('redoAction')?.click());
  await page.waitForTimeout(100);
  const afterFrameRedo = await page.evaluate(() => ({
    frames: document.querySelectorAll('.timeline-cell--frame-header').length,
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
  }));
  assert.equal(afterFrameRedo.frames, 6);
  assert.equal(afterFrameRedo.layers, 1);
  await page.evaluate(() => document.getElementById('redoAction')?.click());
  await page.waitForTimeout(100);

  const timelineDomReused = await page.evaluate(async () => {
    const probe = document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]');
    const target = document.querySelector('.timeline-frame-button[data-timeline-frame-index="1"]');
    if (!probe || !target) return false;
    probe.dataset.timelineReuseProbe = 'keep';
    target.click();
    await new Promise(resolve => window.setTimeout(resolve, 100));
    return document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]') === probe
      && probe.dataset.timelineReuseProbe === 'keep';
  });
  assert.equal(timelineDomReused, true, 'frame selection must reuse the existing timeline matrix DOM');

  const timelineLayerDomReused = await page.evaluate(async () => {
    const probe = document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]');
    const activeLayerIndex = document.querySelector('.timeline-slot.is-active')?.dataset.timelineLayerIndex || '';
    const targets = Array.from(document.querySelectorAll('.timeline-layer-tag[data-timeline-layer-index]'));
    const target = targets.find(node => node.dataset.timelineLayerIndex !== activeLayerIndex) || targets[0];
    if (!probe || !target) return false;
    probe.dataset.timelineLayerReuseProbe = 'keep';
    target.click();
    await new Promise(resolve => window.setTimeout(resolve, 100));
    return document.querySelector('.timeline-cell--frame-header[data-timeline-frame-index="0"]') === probe
      && probe.dataset.timelineLayerReuseProbe === 'keep';
  });
  assert.equal(timelineLayerDomReused, true, 'layer selection must reuse the existing timeline matrix DOM');

  const compositeCache = await page.evaluate(async () => {
    const before = (await window.__pixieedrawGetMemoryDiagnostics?.())
      ?.activeDocument?.canvasCompositeCache || { hits: 0, entries: 0 };
    for (const frameIndex of [0, 1, 0]) {
      document.querySelector(
        `.timeline-frame-button[data-timeline-frame-index="${frameIndex}"]`
      )?.click();
      await new Promise(resolve => window.setTimeout(resolve, 120));
    }
    const after = (await window.__pixieedrawGetMemoryDiagnostics?.())
      ?.activeDocument?.canvasCompositeCache || { hits: 0, entries: 0 };
    return { before, after };
  });
  assert.ok(
    compositeCache.after.hits > compositeCache.before.hits,
    'returning to an unchanged frame must reuse a cached composite image'
  );
  assert.ok(compositeCache.after.entries >= 1);

  const deferredLayerSlot = page.locator(
    '.timeline-slot[data-timeline-frame-index="0"][data-timeline-layer-index="1"]'
  );
  await deferredLayerSlot.evaluate(node => node.click());
  await page.waitForTimeout(50);
  const activeDeferredSlot = await deferredLayerSlot.evaluate(node => node.classList.contains('is-active'));
  assert.equal(activeDeferredSlot, true, 'an inactive blank layer must materialize when selected');
  const cacheBeforeDraw = (await page.evaluate(async () => (
    (await window.__pixieedrawGetMemoryDiagnostics?.())?.activeDocument?.canvasCompositeCache
  ))) || { entries: 0, bytes: 0 };
  const canvas = page.locator('#drawingCanvas');
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox && canvasBox.width > 0 && canvasBox.height > 0, 'drawing canvas must remain available');
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(250);
  const cacheAfterDraw = (await page.evaluate(async () => (
    (await window.__pixieedrawGetMemoryDiagnostics?.())?.activeDocument?.canvasCompositeCache
  ))) || { entries: 0, bytes: 0 };
  assert.ok(
    cacheAfterDraw.bytes < cacheBeforeDraw.bytes,
    'editing a frame must invalidate its cached composite image'
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(autosaveErrors, []);
  console.log(JSON.stringify({
    afterAdd,
    afterUndo,
    afterRedo,
    afterFrameUndo,
    afterFrameRedo,
    frameAddDomReuse,
    layerAddDomReuse,
    layerAddAutosave: {
      beforeRevision: beforeLayerAddAutosave.revision,
      afterRevision: afterLayerAddAutosave.revision,
      checkpointReused: afterLayerAddAutosave.checkpointKey === beforeLayerAddAutosave.checkpointKey,
      opCount: afterLayerAddAutosave.ops.length,
      layerCount: layerAddOp.layers.length,
      frameAddOpCount: frameAddOps.length,
    },
    timelineDomReused,
    timelineLayerDomReused,
    compositeCache,
    cacheBeforeDraw,
    cacheAfterDraw,
    activeDeferredSlot,
  }, null, 2));
} finally {
  await browser.close();
}
