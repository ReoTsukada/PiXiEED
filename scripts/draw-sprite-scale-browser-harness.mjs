#!/usr/bin/env node
/** PXD-backed browser regressions for Draw sprite scaling. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createAnimation, addAnimationFrame, addAnimationLayer, writeAnimationCel,
  setLayerProperties, setAnimationFrameDuration, getAnimationCelDocument
} from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = process.env.PIXIEED_SPRITE_SCALE_OUTPUT || '/tmp/pixieed-draw-sprite-scale-20261009';
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}/`)) throw new Error('path');
    response.setHeader('Content-Type', `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`);
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const base = `http://127.0.0.1:${server.address().port}`;

function makeFixture(width = 16, height = 16, colorCount = 4) {
  let a = createAnimation({ width, height, palette: Array.from({ length: colorCount }, (_, i) => ['#e75445', '#4c82c3', '#6d9b68', '#f1c75b'][i] || `#${(0x222222 + i * 0x030507).toString(16).padStart(6, '0')}`) });
  a = addAnimationLayer(a, { name: 'Hidden layer' });
  a = addAnimationLayer(a, { name: 'Locked layer' });
  a = addAnimationFrame(a, { copy: false, durationMs: 275 });
  a = addAnimationFrame(a, { copy: false, durationMs: 425 });
  a = setAnimationFrameDuration(a, a.frames[0].id, 125);
  a = setLayerProperties(a, a.layers[1].id, { visible: false });
  a = setLayerProperties(a, a.layers[2].id, { locked: true });
  for (let fi = 0; fi < a.frames.length; fi++) for (let li = 0; li < a.layers.length; li++) {
    const cells = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // A transparent checker with separated color regions and an irregular island mask.
      if ((x + y + fi + li) % 5 === 0 || (x < Math.max(2, width / 4) && y < Math.max(2, height / 4) && (x + y) % 3 === 0)) continue;
      const color = (x < width / 2 ? 1 : 2) + ((x >= width * 3 / 4 && y >= height * 3 / 4) ? 1 : 0);
      cells[y * width + x] = Math.min(color, colorCount);
    }
    a = writeAnimationCel(a, a.frames[fi].id, a.layers[li].id, { width, height, pixels: cells });
  }
  return a;
}
const fixtures = { source: makeFixture(16, 16, 4), odd: makeFixture(17, 15, 4), limit: makeFixture(32, 32, 32) };
let pendingFixture = createAnimation({ width: 16, height: 16, palette: ['#e75445', '#4c82c3'] });
pendingFixture = addAnimationFrame(pendingFixture, { copy: false, durationMs: 240 });
for (const frame of pendingFixture.frames) {
  const pixels = new Uint8Array(16 * 16);
  for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) if ((x + y) % 4 !== 0) pixels[y * 16 + x] = (x + y) % 2 + 1;
  pendingFixture = writeAnimationCel(pendingFixture, frame.id, pendingFixture.layers[0].id, { width: 16, height: 16, pixels });
}
fixtures.pending = pendingFixture;
async function writeFixture(name, animation) {
  await writeFile(`${output}/${name}.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));
}
for (const [name, fixture] of Object.entries(fixtures)) await writeFixture(name, fixture);

const snapshot = a => ({ width: a.width, height: a.height, palette: [...a.palette], frames: a.frames.map(frame => ({ ...frame })),
  layers: a.layers.map(layer => ({ ...layer })), cels: a.frames.flatMap(frame => a.layers.map(layer => ({ frameId: frame.id, layerId: layer.id,
    pixels: [...getAnimationCelDocument(a, frame.id, layer.id).pixels] }))) });
const scalePixels = (pixels, sw, sh, dw, dh) => Array.from({ length: dw * dh }, (_, i) => {
  const x = i % dw, y = Math.floor(i / dw);
  // Nearest-neighbor center sampling, independently computed for fixture comparisons.
  const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
  const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
  return pixels[sy * sw + sx];
});
const scaleSnapshot = (before, percent) => {
  const width = Math.max(1, Math.round(before.width * percent / 100)), height = Math.max(1, Math.round(before.height * percent / 100));
  return { ...before, width, height, cels: before.cels.map(cel => ({ ...cel, pixels: scalePixels(cel.pixels, before.width, before.height, width, height) })) };
};

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568, dpr: 3 }, { width: 390, height: 844, dpr: 3 }, { width: 1280, height: 800, dpr: 1 }];
const viewportMatch = process.env.PIXIEED_SPRITE_SCALE_VIEWPORT_MATCH;
const results = [], failures = [];

try {
  for (const viewport of viewports) {
    if (viewportMatch && !`${viewport.width}x${viewport.height}`.includes(viewportMatch)) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.dpr, hasTouch: true, acceptDownloads: true });
    const page = await context.newPage(), checks = [], errors = []; let panelMetrics = null;
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const load = async name => {
      if (await page.locator('.draw-import').evaluate(node => node.open).catch(() => false)) await closeCanvasPanel();
      await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
      const imports = page.locator('.project-imports'); if (!await imports.evaluate(node => node.open)) await imports.locator(':scope > summary').click();
      await page.locator('#pxd-file-input').setInputFiles(`${output}/${name}.pxd`);
      const dimensions = name === 'odd' ? [17, 15] : name === 'limit' ? [32, 32] : [16, 16];
      await page.waitForFunction(([w, h]) => { const c = document.querySelector('#draw-canvas'); return c?.width === w && c?.height === h && !document.querySelector('#main')?.inert; }, dimensions);
      if (await page.locator('#pxd-panel').evaluate(node => node.open)) await page.locator('#project-close').click();
    };
    const closeCanvasPanel = async () => {
      await page.locator('.draw-import').evaluate(node => { node.open = false; }); await page.waitForTimeout(350);
    };
    const stored = async () => page.evaluate(async () => {
      const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
      const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
      const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
      const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw'));
      const project = await createToolProjectStore('draw').load(ref.projectId, ref.revisionId), animation = await readPxdAnimation(project);
      return { snapshot: { width: animation.width, height: animation.height, palette: animation.palette, frames: animation.frames.map(frame => ({ ...frame })),
        layers: animation.layers.map(layer => ({ ...layer })), cels: animation.frames.flatMap(frame => animation.layers.map(layer => ({ frameId: frame.id, layerId: layer.id,
          pixels: [...getAnimationCelDocument(animation, frame.id, layer.id).pixels] }))) }, editorState: project.manifest?.editorState?.draw, project };
    });
    const save = async () => { await page.locator('#pxd-save').evaluate(node => node.click()); await page.waitForFunction(() => !document.querySelector('#main')?.inert); return stored(); };
    const locateForm = async () => {
      const form = page.locator('#draw-sprite-scale-form');
      if (await form.count() && await form.isVisible()) return form;
      const importSummary = page.locator('#draw-import-summary');
      if (await importSummary.count() && !await form.isVisible()) await importSummary.click();
      if (await form.count() && !await form.isVisible()) {
        const ancestors = await form.evaluate(node => { const result = []; for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.matches('details')) result.push(parent.id); return result; }).catch(() => []);
        for (const id of ancestors) { const detail = page.locator(`#${id}`); if (!await detail.evaluate(node => node.open)) await detail.locator(':scope > summary').click(); }
      }
      await form.waitFor({ state: 'visible' }); return form;
    };
    const point = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + (x + .5) * r.width / Number(await page.locator('#draw-canvas').evaluate(node => node.width)), y: r.y + (y + .5) * r.height / Number(await page.locator('#draw-canvas').evaluate(node => node.height)) }; };
    const drag = async (a, b) => { const p = await point(...a), q = await point(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(60); };
    const chooseSelection = async mode => {
      if (!await page.locator('#draw-tool-picker').evaluate(node => node.open)) await page.locator('#draw-tool-summary').click();
      await page.locator(`[data-draw-tool="select"][data-selection-mode="${mode}"]`).click(); await page.waitForTimeout(40);
    };
    const selectUnlockedLayer = async () => {
      const toggle = page.locator('#draw-animation-controls [data-action="toggle-layers"]');
      if (await toggle.count() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      const rows = page.locator('#draw-animation-controls .animation-controls__layer');
      for (let i = 0; i < await rows.count(); i++) {
        const row = rows.nth(i), lock = row.locator('[data-action="lock"]');
        if (await lock.getAttribute('aria-pressed') === 'false') { await row.locator('[data-action="select-layer"]').click(); return; }
      }
      throw new Error('fixture has no unlocked layer');
    };
    const group = async (name, callback) => {
      try { await callback(); checks.push(name); console.log('PASS', `${viewport.width}x${viewport.height}`, name); }
      catch (error) {
        const geometry = await page.evaluate(() => Object.fromEntries(['#draw-canvas-options', '#draw-sprite-scale-form', '#draw-sprite-scale-percent', '#draw-sprite-scale-apply', '.site-header', '.app-tabs']
          .map(selector => { const n = document.querySelector(selector); const r = n?.getBoundingClientRect(); return [selector, r ? { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null]; })));
        failures.push({ viewport, name, error: error.stack, geometry }); console.error('FAIL', `${viewport.width}x${viewport.height}`, name, error.message, geometry); await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png` }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {});
      }
    };

    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main')?.inert);
      await load('source');
      assert.equal(await page.locator('#draw-sprite-scale-form').count(), 1, 'sprite scaling form is mounted');

      await group('fixture round-trip retains transparent pixels, frames, hidden/locked layers, durations and palette', async () => {
        const loaded = await save(); assert.deepEqual(loaded.snapshot, snapshot(fixtures.source));
        assert.equal(loaded.snapshot.frames[0].durationMs, 125); assert.equal(loaded.snapshot.frames[1].durationMs, 275);
        assert.equal(loaded.snapshot.layers[1].visible, false); assert.equal(loaded.snapshot.layers[2].locked, true);
      });
      await group('presets and preview are touch reachable and the panel stays on screen', async () => {
        const form = await locateForm(), panel = page.locator('#draw-canvas-options'), box = await panel.boundingBox();
        const safe = await page.evaluate(() => ({ headerBottom: document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0,
          navTop: document.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight, height: innerHeight }));
        assert.ok(box && box.x >= 0 && box.y >= safe.headerBottom - 1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= safe.navTop + 1,
          `canvas settings panel fits between header and bottom nav (${JSON.stringify({ box, safe })})`);
        const preset = page.locator('[data-draw-sprite-scale="1000"]'); await preset.scrollIntoViewIfNeeded(); await preset.waitFor({ state: 'visible' });
        const r = await preset.boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
        assert.equal(await page.locator('#draw-sprite-scale-percent').inputValue(), '1000');
        assert.equal(await preset.getAttribute('aria-pressed'), 'true', 'selected preset is announced');
        const scaleStyles = await page.evaluate(() => ({ input: getComputedStyle(document.querySelector('#draw-sprite-scale-percent')), preset: getComputedStyle(document.querySelector('[data-draw-sprite-scale="1000"]')), apply: getComputedStyle(document.querySelector('#draw-sprite-scale-apply')) }));
        assert.equal(scaleStyles.input.backgroundColor, 'rgb(16, 26, 35)', 'percentage field keeps a dark readable surface');
        assert.equal(scaleStyles.input.color, 'rgb(255, 255, 255)', 'percentage field text remains readable');
        assert.equal(scaleStyles.preset.backgroundColor, 'rgb(255, 211, 90)', 'selected preset has a visible highlight');
        assert.equal(scaleStyles.apply.backgroundColor, 'rgb(255, 211, 90)', 'enabled Apply uses the selected-action color');
        assert.ok(await page.locator('#draw-sprite-scale-preview').isVisible());
        assert.match(await page.locator('#draw-sprite-scale-preview').textContent(), /160\s*×\s*160/);
        assert.ok(await page.locator('#draw-sprite-scale-reason').isVisible());
        const percentInput = page.locator('#draw-sprite-scale-percent'); await percentInput.scrollIntoViewIfNeeded();
        const inputRect = await percentInput.boundingBox(); await page.touchscreen.tap(inputRect.x + inputRect.width / 2, inputRect.y + inputRect.height / 2);
        await percentInput.fill('1000'); assert.match(await page.locator('#draw-sprite-scale-preview').textContent(), /160\s*×\s*160/, 'touch-focused percentage input updates preview');
        await page.locator('#draw-sprite-scale-apply').scrollIntoViewIfNeeded();
        for (const selector of ['#draw-sprite-scale-percent', '#draw-sprite-scale-apply']) {
          const button = await page.locator(selector).boundingBox(); assert.ok(button && button.y >= safe.headerBottom - 1 && button.y + button.height <= safe.navTop + 1, `${selector} scrolls into safe viewport`);
        }
        panelMetrics = await page.evaluate(() => {
          const panel = document.querySelector('#draw-canvas-options'), rect = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          const vv = window.visualViewport, header = document.querySelector('.site-header'), nav = document.querySelector('.app-tabs');
          return { panel: rect(panel), header: rect(header), bottomNav: rect(nav), visualViewport: vv && { offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, width: vv.width, height: vv.height },
            safe: { top: header.getBoundingClientRect().bottom, bottom: nav.getBoundingClientRect().top }, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
            scrollTop: panel.scrollTop, form: rect(document.querySelector('#draw-sprite-scale-form')), percentInput: rect(document.querySelector('#draw-sprite-scale-percent')),
            apply: rect(document.querySelector('#draw-sprite-scale-apply')) };
        });
        console.log('PANEL_GEOMETRY', `${viewport.width}x${viewport.height}`, JSON.stringify(panelMetrics));
        await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-sprite-scale-panel.png` });
      });
      await group('100 percent is a no-op and 1000 percent scales every cel with nearest-neighbor blocks', async () => {
        let before = (await save()).snapshot, undoBefore = await page.locator('#draw-undo').isEnabled();
        await locateForm(); await page.locator('[data-draw-sprite-scale="100"]').click();
        assert.equal(await page.locator('#draw-sprite-scale-apply').isDisabled(), true, '100 percent is presented as a no-op');
        await page.waitForTimeout(80); assert.deepEqual((await save()).snapshot, before, '100 percent keeps source data identical');
        assert.equal(await page.locator('#draw-undo').isEnabled(), undoBefore, '100 percent does not add an undo entry');
        const savedRevision = await page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pxd:last:draw')).revisionId);
        await page.locator('[data-draw-sprite-scale="1000"]').click();
        await page.locator('#draw-sprite-scale-percent').focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 160 && document.querySelector('#draw-canvas').height === 160);
        // Read autosaved project state before invoking Save.
        await page.waitForFunction(previous => {
          const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw') || 'null');
          return ref && ref.revisionId !== previous;
        }, savedRevision, { timeout: 10000 });
        const expected = scaleSnapshot(before, 1000), actual = (await stored()).snapshot;
        assert.deepEqual(actual, expected); assert.equal(await page.locator('#draw-undo').isEnabled(), true);
        await closeCanvasPanel();
      });
      await group('one Undo and Redo reverse and restore the entire scaling transaction', async () => {
        await load('source'); const source = snapshot(fixtures.source); await locateForm();
        await page.locator('[data-draw-sprite-scale="200"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 32);
        await closeCanvasPanel();
        await page.locator('#draw-undo').click(); await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 16);
        assert.deepEqual((await save()).snapshot, source);
        await page.locator('#draw-redo').click(); await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 32);
        assert.deepEqual((await save()).snapshot, scaleSnapshot(source, 200));
        await closeCanvasPanel();
      });

      await group('50 and 25 percent shrink cleanly and odd dimensions round to nearest pixel', async () => {
        await load('source'); const source = snapshot(fixtures.source);
        await locateForm(); await page.locator('[data-draw-sprite-scale="50"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 8); assert.deepEqual((await save()).snapshot, scaleSnapshot(source, 50));
        await closeCanvasPanel(); await page.locator('#draw-undo').click(); await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 16);
        await locateForm(); await page.locator('[data-draw-sprite-scale="25"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 4); assert.deepEqual((await save()).snapshot, scaleSnapshot(source, 25));
        await load('odd'); const odd = snapshot(fixtures.odd); await locateForm();
        await page.locator('[data-draw-sprite-scale="50"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 9 && document.querySelector('#draw-canvas').height === 8);
        assert.deepEqual((await save()).snapshot, scaleSnapshot(odd, 50));
        await load('odd'); await locateForm(); await page.locator('#draw-sprite-scale-percent').fill('1'); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 1 && document.querySelector('#draw-canvas').height === 1);
        assert.deepEqual((await save()).snapshot, scaleSnapshot(odd, 1));
      });

      await group('32 by 32 scaling to 320 is rejected without changing saved data or history', async () => {
        await load('limit'); const source = snapshot(fixtures.limit);
        await locateForm(); await page.locator('[data-draw-sprite-scale="50"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 16); const valid = scaleSnapshot(source, 50);
        assert.deepEqual((await save()).snapshot, valid);
        await closeCanvasPanel(); await page.locator('#draw-undo').click(); await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 32);
        await locateForm(); await page.locator('[data-draw-sprite-scale="1000"]').click();
        assert.equal(await page.locator('#draw-sprite-scale-apply').isDisabled(), true, '320px dimension preview disables apply');
        assert.equal(await page.locator('#draw-canvas').evaluate(node => node.width), 32); assert.deepEqual((await save()).snapshot, source);
        assert.match(await page.locator('#draw-sprite-scale-reason').textContent(), /256/);
        assert.equal(await page.locator('#draw-undo').isEnabled(), false); assert.equal(await page.locator('#draw-redo').isEnabled(), true);
        await closeCanvasPanel(); await page.locator('#draw-redo').click(); await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 16);
        assert.deepEqual((await save()).snapshot, valid, 'rejected scale leaves the prior Redo entry intact');
      });

      await group('irregular selection mask and pivot metadata scale with the sprite', async () => {
        await load('source'); await chooseSelection('color');
        const p = await point(1, 1); await page.mouse.click(p.x, p.y); await page.waitForTimeout(50);
        const before = await page.locator('.draw-selection-mask').evaluate(canvas => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, out = [];
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (data[((y * 4 + 1) * canvas.width + x * 4 + 1) * 4 + 3]) out.push(`${x},${y}`); return out;
        });
        assert.ok(before.length > 0 && before.length < 256, 'fixture yields an irregular, transparent selection mask');
        const pivotBefore = await page.locator('[data-selection-control="pivot"]').evaluate(node => ({ x: Number(node.dataset.canvasX), y: Number(node.dataset.canvasY) }));
        await locateForm(); await page.locator('[data-draw-sprite-scale="200"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas').width === 32);
        const after = await page.locator('.draw-selection-mask').evaluate(canvas => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, out = [];
          for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (data[((y * 4 + 1) * canvas.width + x * 4 + 1) * 4 + 3]) out.push(`${x},${y}`); return out;
        });
        const expected = before.flatMap(value => { const [x, y] = value.split(',').map(Number); return [`${2*x},${2*y}`, `${2*x+1},${2*y}`, `${2*x},${2*y+1}`, `${2*x+1},${2*y+1}`]; }).sort();
        assert.deepEqual(after.sort(), expected); const pivotAfter = await page.locator('[data-selection-control="pivot"]').evaluate(node => ({ x: Number(node.dataset.canvasX), y: Number(node.dataset.canvasY) }));
        assert.ok(Math.abs(pivotAfter.x - pivotBefore.x * 2) < .01 && Math.abs(pivotAfter.y - pivotBefore.y * 2) < .01);
      });

      await group('pending transforms and playback block sprite scaling', async () => {
        await load('pending'); await chooseSelection('rectangle'); await drag([2, 2], [5, 5]);
        const a = await point(3, 4), b = await point(7, 7);
        await page.keyboard.down('Alt'); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt');
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
        await locateForm(); await page.locator('[data-draw-sprite-scale="200"]').click();
        assert.equal(await page.locator('#draw-sprite-scale-apply').isDisabled(), true, 'pending transform disables scale apply');
        assert.equal(await page.locator('#draw-canvas').evaluate(node => node.width), 16, 'pending transform keeps the image dimensions fixed');
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        const play = page.locator('#draw-animation-play, [data-action="play"]');
        assert.ok(await play.count(), 'animation playback control exists'); await play.first().click(); await page.waitForTimeout(80);
        await locateForm(); await page.locator('[data-draw-sprite-scale="200"]').click();
        assert.equal(await page.locator('#draw-sprite-scale-apply').isDisabled(), true, 'playback disables scale apply');
        assert.equal(await page.locator('#draw-canvas').evaluate(node => node.width), 16, 'playback cannot begin a scale transaction');
      });

      await group('autosaved scale survives reload and output handoff retains animation dimensions', async () => {
        await load('source'); const source = snapshot(fixtures.source), savedRevision = await page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pxd:last:draw')).revisionId);
        await locateForm(); await page.locator('[data-draw-sprite-scale="1000"]').click(); await page.locator('#draw-sprite-scale-apply').click();
        await page.waitForFunction(() => document.querySelector('#draw-canvas')?.width === 160 && document.querySelector('#draw-canvas')?.height === 160);
        await page.waitForFunction(previous => { const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw') || 'null'); return ref && ref.revisionId !== previous; }, savedRevision, { timeout: 10000 });
        const expected = scaleSnapshot(source, 1000); assert.deepEqual((await stored()).snapshot, expected, 'scale autosaves before explicit Save');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && document.querySelector('#draw-canvas')?.width === 160 && !document.querySelector('#main')?.inert);
        assert.deepEqual((await stored()).snapshot, expected, 'autosaved scale survives reload');
        await closeCanvasPanel(); await page.locator('#draw-export').evaluate(node => node.click()); await page.waitForURL(/\/output\/work\/?\?id=/);
        try {
          await page.waitForFunction(() => !document.querySelector('#output-layout')?.hidden && [...document.querySelectorAll('#output-source option')].some(option => option.value === 'animation'), { timeout: 10000 });
          await page.locator('#output-source').selectOption('animation');
          await page.waitForFunction(() => document.querySelector('#output-metadata')?.textContent.includes('160'), { timeout: 10000 });
          assert.match(await page.locator('#output-metadata').textContent(), /160\s*[×x]\s*160/, 'output handoff uses scaled animation dimensions');
        } catch (error) {
          error.message += `; output URL=${page.url()} title=${await page.title()} status=${await page.locator('#output-status, #output-import-status, #output-copy').allTextContents().catch(() => [])}`;
          throw error;
        }
      });

      assert.deepEqual(errors, []); results.push({ viewport, checks, errors, panelMetrics });
    } catch (error) {
      failures.push({ viewport, name: 'setup', error: error.stack }); await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-setup-failure.png` }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); await new Promise(resolveClose => server.close(resolveClose));
}
const report = { base, generatedAt: new Date().toISOString(), nearestNeighbor: 'destination-center samples the source; output dimensions use Math.round and a 1px minimum', results, failures };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ results: results.map(result => ({ viewport: `${result.viewport.width}x${result.viewport.height}`, checks: result.checks.length })), failures: failures.length, report: `${output}/report.json` }, null, 2));
if (failures.length) process.exitCode = 1;
