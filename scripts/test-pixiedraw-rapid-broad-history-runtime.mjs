import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__rapidBroadPointerPerf = [];
    // Synthetic browser events below still traverse the production DOM
    // listeners. Pointer capture is a browser-owned state transition that
    // cannot be established by dispatchEvent, so make only that edge a no-op
    // for this isolated performance probe.
    HTMLCanvasElement.prototype.setPointerCapture = () => {};
    HTMLCanvasElement.prototype.releasePointerCapture = () => {};
    const originalInfo = console.info.bind(console);
    console.info = (...args) => {
      const details = args[1];
      if (args[0] === '[pixiedraw:performance]' && details?.phase === 'pixiedraw:pointerup:brush-commit') {
        window.__rapidBroadPointerPerf.push(details);
      }
      originalInfo(...args);
    };
  });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_500);
  if (await page.locator('#pixisyncResumeNoticeDialog[open]').count()) {
    await page.locator('#pixisyncResumeNoticeClose').click({ timeout: 5_000 });
  }

  await page.locator('#startupActionNew').click({ timeout: 5_000 });
  await page.waitForSelector('#newProjectDialog[open]', { timeout: 5_000 });
  await page.fill('#newProjectName', 'rapid-broad-history-runtime');
  await page.fill('#newProjectWidth', '256');
  await page.fill('#newProjectHeight', '256');
  await page.click('#confirmNewProject', { timeout: 5_000 });
  await page.waitForFunction(
    () => !document.getElementById('newProjectDialog')?.open,
    null,
    { timeout: 15_000 }
  );
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );

  await page.evaluate(() => {
    const brush = document.getElementById('brushSize');
    if (brush) {
      brush.value = '12';
      brush.dispatchEvent(new Event('input', { bubbles: true }));
      brush.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelector('button[data-tool="pen"]')?.click();
  });
  assert.equal(await page.locator('#brushSize').inputValue(), '12');

  const canvas = page.locator('#drawingCanvas');
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox && canvasBox.width > 0 && canvasBox.height > 0, 'wide test canvas must be visible');
  const strokeCount = Math.max(4, Math.round(Number(process.env.PIXIEEDRAW_RAPID_STROKE_COUNT) || 180));
  const drawMetrics = await page.evaluate(({ strokeCount }) => {
    const target = document.getElementById('drawingCanvas');
    const rect = target?.getBoundingClientRect();
    if (!target || !rect) throw new Error('rapid test canvas rect unavailable');
    const point = (x, y, type, pointerId, buttons) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
    }));
    const startedAt = performance.now();
    for (let index = 0; index < strokeCount; index += 1) {
      const ratio = (index + 1) / (strokeCount + 1);
      const y = rect.y + rect.height * ratio;
      const pointerId = (index % 2) + 1;
      const startX = rect.x + rect.width * 0.04;
      const endX = rect.x + rect.width * 0.96;
      point(startX, y, 'pointerdown', pointerId, 1);
      for (let step = 1; step <= 12; step += 1) {
        point(startX + ((endX - startX) * step / 12), y, 'pointermove', pointerId, 1);
      }
      point(endX, y, 'pointerup', pointerId, 0);
    }
    return { elapsedMs: Math.round(performance.now() - startedAt) };
  }, { strokeCount });
  const drawElapsedMs = drawMetrics.elapsedMs;
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(5_000);

  const result = await page.evaluate(async projectId => {
    const diagnostics = await window.__pixieedrawGetMemoryDiagnostics?.();
    const readColdMeta = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('pixieedraw-cold-history-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!database.objectStoreNames.contains('projectMeta')) return null;
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(['projectMeta'], 'readonly');
          const request = transaction.objectStore('projectMeta').get(projectId);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    };
    return {
      diagnostics,
      coldMeta: await readColdMeta(),
      session: window.__pixieedrawGetActiveProjectSession?.() || null,
      pointerPerf: Array.isArray(window.__rapidBroadPointerPerf)
        ? window.__rapidBroadPointerPerf.map(entry => ({
            elapsedMs: Number(entry?.elapsedMs) || 0,
            rasterWriteMs: Number(entry?.timings?.rasterWriteMs) || 0,
            createUndoEntryMs: Number(entry?.timings?.createUndoEntryMs) || 0,
          }))
        : [],
    };
  }, await page.evaluate(() => window.__pixieedrawGetActiveProjectSession?.()?.projectId || ''));

  assert.deepEqual(pageErrors, [], 'rapid broad drawing must not emit page errors');
  assert.equal(result.session?.dirty, false, 'rapid broad drawing must eventually autosave');
  assert.ok(
    result.diagnostics?.activeDocument?.historyPast <= 80,
    'live Undo history must stay within the desktop entry limit'
  );
  assert.equal(
    result.diagnostics?.historyRetention?.coldEntriesPerDirection,
    64,
    'cold history must expose the finite desktop retention cap'
  );
  assert.ok(
    !result.coldMeta || Number(result.coldMeta.pastCount) <= 64,
    'cold IndexedDB history must stay within its configured tail after repeated broad drawing'
  );
  assert.ok(
    Number(result.diagnostics?.editorMiB?.past) <= 64,
    'typed broad history must participate in the in-memory byte budget'
  );
  const maxPointerUpMs = result.pointerPerf.length
    ? Math.max(...result.pointerPerf.map(entry => entry.elapsedMs))
    : null;
  const maxRasterWriteMs = result.pointerPerf.length
    ? Math.max(...result.pointerPerf.map(entry => entry.rasterWriteMs))
    : null;

  console.log(JSON.stringify({
    strokeCount,
    drawElapsedMs,
    pageErrors,
    projectId: result.session?.projectId || '',
    historyPast: result.diagnostics?.activeDocument?.historyPast || 0,
    coldPastCount: Number(result.coldMeta?.pastCount) || 0,
    coldEntriesPerDirection: result.diagnostics?.historyRetention?.coldEntriesPerDirection || 0,
    coldEntryMaxMiB: result.diagnostics?.historyRetention?.coldEntryMaxMiB || 0,
    editorPastMiB: result.diagnostics?.editorMiB?.past || 0,
    pointerPerfSamples: result.pointerPerf.length,
    maxPointerUpMs,
    maxRasterWriteMs,
    autosaveDirty: result.session?.dirty,
  }, null, 2));
} finally {
  await browser.close();
}
