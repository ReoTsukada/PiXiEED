/** Browser acceptance for the Draw canvas-size panel. Run only after the panel integration is ready. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(baseUrl).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname), 'The harness only accepts a local test server');
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];
const outDir = '/tmp/pixieed-canvas-settings-20261004';
const result = { baseUrl, viewports: [], resizeCases: {}, pageErrors: [], checks: 0 };
let checks = 0;
function check(condition, message) { checks += 1; assert.ok(condition, message); }
function equal(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message); }

async function openPage(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: viewport.width < 600,
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.pageErrors.push({ viewport: viewport.name, message: error.message }));
  await page.route('**/*', route => {
    try { return new URL(route.request().url()).origin === origin ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  await page.goto(`${baseUrl}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    return canvas && canvas.width > 0 && canvas.height > 0 && canvas.dataset.tool === 'pen' && !document.querySelector('#main')?.inert;
  }, null, { timeout: 15000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page };
}

async function rectSnapshot(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    };
    const panel = document.querySelector('.draw-canvas-panel');
    const style = panel ? getComputedStyle(panel) : null;
    const panelRect = rect('.draw-canvas-panel');
    return {
      time: performance.now(),
      open: Boolean(document.querySelector('.draw-import')?.open),
      panel: panelRect,
      visible: Boolean(panelRect && panelRect.width && panelRect.height && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0),
      panelDisplay: style?.display ?? null,
      panelVisibility: style?.visibility ?? null,
      panelOpacity: Number(style?.opacity ?? 0),
      canvas: rect('#draw-canvas'),
      header: rect('.site-header'),
      nav: rect('.app-tabs'),
      viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
    };
  });
}

async function armSummaryClickTrace(page) {
  await page.evaluate(() => {
    window.__drawCanvasPanelClickFrames = null;
    const snapshot = () => {
      const rect = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x:r.x, y:r.y, width:r.width, height:r.height, top:r.top, right:r.right, bottom:r.bottom, left:r.left };
      };
      const panel = document.querySelector('.draw-canvas-panel'), p = rect('.draw-canvas-panel');
      const style = panel ? getComputedStyle(panel) : null;
      return { frame:performance.now(), open:Boolean(document.querySelector('.draw-import')?.open), panel:p,
        visible:Boolean(p && p.width && p.height && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0), panelOpacity:Number(style?.opacity ?? 0),
        canvas:rect('#draw-canvas'), header:rect('.site-header'), nav:rect('.app-tabs'),
        viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth} };
    };
    const listener = event => {
      if (!event.target.closest?.('.draw-import > summary')) return;
      document.removeEventListener('click', listener, true);
      const frames = [snapshot()];
      const next = () => requestAnimationFrame(() => {
        frames.push(snapshot());
        if (frames.length < 5) next(); else window.__drawCanvasPanelClickFrames = frames;
      });
      next();
    };
    document.addEventListener('click', listener, true);
  });
}
async function summaryClickFrames(page) {
  await page.waitForFunction(() => Array.isArray(window.__drawCanvasPanelClickFrames) && window.__drawCanvasPanelClickFrames.length === 5, null, { timeout:5000 });
  return page.evaluate(() => window.__drawCanvasPanelClickFrames);
}

async function sampleRafGeometry(page, count = 4) {
  return page.evaluate(async frameCount => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    };
    const snapshot = () => {
      const panel = document.querySelector('.draw-canvas-panel'), p = rect('.draw-canvas-panel');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        frame: performance.now(), open: Boolean(document.querySelector('.draw-import')?.open), panel: p,
        visible: Boolean(p && p.width && p.height && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0), panelOpacity: Number(style?.opacity ?? 0),
        canvas: rect('#draw-canvas'), header: rect('.site-header'), nav: rect('.app-tabs'),
        viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
      };
    };
    const frames = [snapshot()];
    for (let i = 0; i < frameCount; i += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames.push(snapshot());
    }
    return frames;
  }, count);
}

function rectClose(actual, expected, tolerance = 1) {
  if (!actual || !expected) return false;
  return ['x', 'y', 'width', 'height'].every(key => Math.abs(actual[key] - expected[key]) <= tolerance);
}
function assertStableFrames(frames, label) {
  const visible = frames.filter(frame => frame.visible);
  check(visible.length > 0, `${label}: panel did not become visible in the observed frames`);
  check(visible.every(frame => frame.panelOpacity === 1), `${label}: panel must be opaque from its first visible frame`);
  const settled = visible.at(-1).panel;
  check(visible.every(frame => rectClose(frame.panel, settled)), `${label}: panel flashed/moved after becoming visible: ${JSON.stringify(frames)}`);
  const canvasRects = frames.map(frame => frame.canvas).filter(Boolean);
  check(canvasRects.every(frame => rectClose(frame, canvasRects[0])), `${label}: canvas moved while the panel opened: ${JSON.stringify(frames)}`);
  for (const frame of visible) {
    check(frame.panel.left >= -1 && frame.panel.right <= frame.viewport.width + 1, `${label}: panel exceeds viewport width: ${JSON.stringify(frame)}`);
    check(frame.viewport.scrollWidth <= frame.viewport.width + 1, `${label}: opening the panel caused horizontal page overflow: ${JSON.stringify(frame.viewport)}`);
  }
}

async function assertPanelStructure(page, label) {
  const data = await page.evaluate(() => {
    const panel = document.querySelector('.draw-canvas-panel');
    const output = document.querySelector('#draw-output');
    const fileSelectors = ['#draw-import-local', '#draw-copy-last', '#draw-resume', '#draw-shelf'];
    const files = Object.fromEntries(fileSelectors.map(selector => {
      const node = document.querySelector(selector);
      return [selector, { exists: Boolean(node), insideOutput: Boolean(node && output?.contains(node)), insidePanel: Boolean(node && panel?.contains(node)) }];
    }));
    const controls = [...(panel?.querySelectorAll('button, input, select, textarea, summary') ?? [])]
      .filter(node => !node.disabled && node.getClientRects().length)
      .map(node => ({ id: node.id || null, label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 48), rect: (() => { const r = node.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; })() }));
    const panelRect = panel?.getBoundingClientRect();
    return {
      panelExists: Boolean(panel),
      panelRect: panelRect ? { left:panelRect.left, right:panelRect.right, width:panelRect.width } : null,
      scrollWidth: panel?.scrollWidth ?? null, clientWidth: panel?.clientWidth ?? null,
      fileControls: files, controls,
      required: Object.fromEntries(['#draw-canvas-dimensions', '#draw-canvas-width', '#draw-canvas-height', '#draw-canvas-ratio', '#draw-canvas-form', '#draw-canvas-apply'].map(selector => [selector, Boolean(document.querySelector(selector))])),
    };
  });
  check(data.panelExists, `${label}: .draw-canvas-panel is missing`);
  check(data.scrollWidth <= data.clientWidth + 1, `${label}: panel has horizontal overflow: ${JSON.stringify(data)}`);
  check(data.panelRect.left >= -1 && data.panelRect.right <= (await page.evaluate(() => innerWidth)) + 1, `${label}: panel is outside the viewport: ${JSON.stringify(data.panelRect)}`);
  for (const [selector, info] of Object.entries(data.fileControls)) {
    check(info.exists && info.insideOutput && !info.insidePanel, `${label}: ${selector} must remain in #draw-output, outside the size panel: ${JSON.stringify(info)}`);
  }
  for (const [selector, exists] of Object.entries(data.required)) check(exists, `${label}: missing ${selector}`);
  for (let i = 0; i < data.controls.length; i += 1) for (let j = i + 1; j < data.controls.length; j += 1) {
    const a = data.controls[i].rect, b = data.controls[j].rect;
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    check(!(overlapX > 1 && overlapY > 1), `${label}: controls overlap (${data.controls[i].id ?? data.controls[i].label} / ${data.controls[j].id ?? data.controls[j].label})`);
  }
  return data;
}

async function imageState(page) {
  return page.locator('#draw-canvas').evaluate(canvas => {
    const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: Array.from(data) };
  });
}
function pixelIndex(width, x, y) { return (y * width + x) * 4; }
function assertNearestNeighbor(source, resized, label) {
  for (let y = 0; y < resized.height; y += 1) for (let x = 0; x < resized.width; x += 1) {
    const sx = Math.min(source.width - 1, Math.floor((x + .5) * source.width / resized.width));
    const sy = Math.min(source.height - 1, Math.floor((y + .5) * source.height / resized.height));
    const si = pixelIndex(source.width, sx, sy), di = pixelIndex(resized.width, x, y);
    const actual = resized.rgba.slice(di, di + 4), expected = source.rgba.slice(si, si + 4);
    if (actual.some((value, channel) => value !== expected[channel])) {
      const ink = state => {
        const points = [];
        for (let py = 0; py < state.height; py += 1) for (let px = 0; px < state.width; px += 1) {
          const offset = pixelIndex(state.width, px, py);
          if (state.rgba[offset + 3]) points.push({ x:px, y:py, rgba:state.rgba.slice(offset, offset + 4) });
        }
        return points.slice(0, 16);
      };
      assert.deepEqual(actual, expected, `${label}: pixel (${x},${y}) should map to source (${sx},${sy}); actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)}, sourceInk=${JSON.stringify(ink(source))}, resizedInk=${JSON.stringify(ink(resized))}`);
    }
  }
  checks += 1;
}
async function waitSize(page, width, height) {
  await page.waitForFunction(([w,h]) => {
    const c = document.querySelector('#draw-canvas'); return c?.width === w && c?.height === h;
  }, [width, height], { timeout: 5000 });
}
async function openSizePanel(page) {
  const details = page.locator('.draw-import');
  if (!(await details.evaluate(node => node.open))) await page.locator('.draw-import > summary').click();
  await page.waitForFunction(() => document.querySelector('.draw-import')?.open === true && document.querySelector('.draw-canvas-panel'));
}
async function selectPreset(page, size) {
  await openSizePanel(page);
  const preset = page.locator(`[data-draw-size="${size}"]`);
  await preset.waitFor({ state: 'visible' });
  await preset.click();
  const canvasSize = await page.locator('#draw-canvas').evaluate(canvas => [canvas.width, canvas.height]);
  const longEdge = Math.max(...canvasSize);
  await page.waitForFunction(expected => {
    const canvas = document.querySelector('#draw-canvas'); return Math.max(canvas?.width ?? 0, canvas?.height ?? 0) === expected;
  }, size, { timeout: 5000 });
}
async function applySize(page) {
  await page.locator('#draw-canvas-apply').click();
}
async function closeSizePanel(page) {
  if (await page.locator('.draw-import').evaluate(node => node.open)) {
    await page.locator('.draw-import > summary').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.draw-import')?.open === false);
  }
}
async function undoTo(page, width, height, expectedRgba) {
  await closeSizePanel(page);
  await page.locator('#draw-undo').click();
  await waitSize(page, width, height);
  const restored = await imageState(page);
  equal(restored.rgba, expectedRgba, `Undo must restore exact ${width}x${height} pixels`);
  return restored;
}
async function drawOnePixel(page) {
  const baseline = await imageState(page);
  const palette = page.locator('#draw-palette .draw-color[data-color-index="0"]');
  if (await palette.count()) {
    if (await palette.getAttribute('aria-pressed') !== 'true') await palette.click();
  }
  const canvas = page.locator('#draw-canvas'), box = await canvas.boundingBox();
  assert.ok(box, 'canvas should be visible before drawing');
  await page.mouse.click(box.x + box.width * (3.5 / baseline.width), box.y + box.height * (5.5 / baseline.height));
  await page.waitForFunction(() => !document.querySelector('#draw-undo')?.disabled, null, { timeout: 5000 });
  const after = await imageState(page);
  assert.notDeepEqual(after.rgba, baseline.rgba, 'pen input should change at least one pixel');
  return { baseline, after };
}

try {
  for (const viewport of viewports) {
    const { context, page } = await openPage(viewport);
    try {
      const before = await rectSnapshot(page);
      await armSummaryClickTrace(page);
      await page.locator('.draw-import > summary').click();
      const frames = await summaryClickFrames(page);
      assertStableFrames(frames, `${viewport.name} panel open`);
      const structure = await assertPanelStructure(page, viewport.name);
      result.viewports.push({ name: viewport.name, before, frames, structure });
      if (viewport.name === '390x844') {
        await page.locator('.draw-import > summary').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.draw-import')?.open === false);
        const drawn = await drawOnePixel(page);
        await selectPreset(page, 32);
        await waitSize(page, 32, 32);
        const enlarged = await imageState(page);
        assertNearestNeighbor(drawn.after, enlarged, '16→32 preset');
        result.resizeCases.preset32 = { dimensions: [enlarged.width, enlarged.height], changed: true };
        await undoTo(page, 16, 16, drawn.after.rgba);

        await openSizePanel(page);
        await page.locator('#draw-canvas-ratio').uncheck();
        await page.locator('#draw-canvas-width').fill('24');
        await page.locator('#draw-canvas-height').fill('12');
        await applySize(page);
        await waitSize(page, 24, 12);
        const custom = await imageState(page);
        assertNearestNeighbor(drawn.after, custom, '16×16→24×12 custom');
        result.resizeCases.custom24x12 = { dimensions: [custom.width, custom.height], changed: true };
        await undoTo(page, 16, 16, drawn.after.rgba);

        await openSizePanel(page);
        await page.locator('#draw-canvas-ratio').check();
        await page.locator('#draw-canvas-width').fill('32');
        equal(await page.locator('#draw-canvas-height').inputValue(), '32', 'fixed 1:1 ratio should update height with width');
        await applySize(page);
        await waitSize(page, 32, 32);
        const fixed = await imageState(page);
        assertNearestNeighbor(drawn.after, fixed, 'fixed ratio 32×32');
        result.resizeCases.fixedRatio32 = { dimensions: [fixed.width, fixed.height], changed: true };
        await undoTo(page, 16, 16, drawn.after.rgba);

        await openSizePanel(page);
        await page.locator('#draw-canvas-ratio').uncheck();
        for (const invalid of ['0', '257', '1.5']) {
          await page.locator('#draw-canvas-width').fill(invalid);
          const invalidBefore = await imageState(page);
          await applySize(page).catch(() => {});
          await page.waitForTimeout(30);
          const invalidAfter = await imageState(page);
          equal([invalidAfter.width, invalidAfter.height, invalidAfter.rgba], [invalidBefore.width, invalidBefore.height, invalidBefore.rgba], `invalid width ${invalid} must not alter pixels`);
          result.resizeCases.invalidInputs ??= [];
          result.resizeCases.invalidInputs.push({ value: invalid, unchanged: true });
          await page.locator('#draw-canvas-width').fill('16');
          await page.locator('#draw-canvas-height').fill('16');
        }

        // Reposition an already-open panel after a responsive viewport change; compare the first
        // visible frame to the settled geometry and ensure the canvas itself does not jump per-frame.
        const oldViewport = { width: viewport.width, height: viewport.height };
        await page.setViewportSize({ width: 320, height: 568 });
        const resizeFrames = await sampleRafGeometry(page, 4);
        assertStableFrames(resizeFrames, '390→320 viewport resize with panel open');
        result.resizeCases.viewportResize = { from: oldViewport, to: { width: 320, height: 568 }, frames: resizeFrames };

        // Native keyboard activation should open exactly once, retain the panel, and fit without a
        // delayed layout jump (the same bounded geometry check as pointer activation).
        await page.locator('.draw-import > summary').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('.draw-import')?.open === false);
        await armSummaryClickTrace(page);
        await page.locator('.draw-import > summary').focus();
        await page.keyboard.press('Enter');
        const keyboardFrames = await summaryClickFrames(page);
        check(keyboardFrames.at(-1).open, 'Enter on the size-panel summary should open it');
        assertStableFrames(keyboardFrames, 'keyboard summary open/fit');
        result.resizeCases.keyboardSummary = { opensOnce: true, frames: keyboardFrames };
        await mkdir(outDir, { recursive: true });
        await page.screenshot({ path: `${outDir}/draw-canvas-settings-320x568.png`, fullPage: true });
      }
    } finally { await context.close(); }
  }
  equal(result.pageErrors, [], 'browser should have no uncaught page errors');
  result.checks = checks;
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/results.json`, JSON.stringify(result, null, 2));
  console.log(`PASS draw-canvas-settings (${checks} checks, ${viewports.length} viewports)`);
} finally { await browser.close(); }
