#!/usr/bin/env node
/** Local-only acceptance for selection-dependent draw controls and layout. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4252';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'only localhost is accepted');
const output = process.env.PIXIEED_SELECTION_CONTROLS_OUTPUT || '/tmp/pixieed-selection-contextual-20261013';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(output, { recursive: true });

const palette = ['#e75445', '#4c82c3', '#6d9b68'];
const pixels = Array(16 * 16).fill(-1);
const pattern = [0, 1, -1, 2, -1, 0, -1, -1, 2, -1, 1, 0];
for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
  pixels[(y + 4) * 16 + x + 3] = pattern[y * 4 + x];
  pixels[(y + 4) * 16 + x + 9] = 2;
}
let animation = createAnimation({ width: 16, height: 16, palette });
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, {
  width: 16, height: 16, pixels: pixels.map(value => value + 1)
});
const fixturePath = join(output, 'selection-controls-fixture.pxd');
await writeFile(fixturePath, await encodePxd(await writePxdAnimation(createPxdProject({ manifest: { title: 'Selection controls QA fixture' } }), animation)));

const defaultViewports = [
  { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  { width: 568, height: 320 }, { width: 1280, height: 800 }, { width: 1366, height: 768 },
  { width: 1366, height: 720 }, { width: 1920, height: 1080 }
];
const viewports = process.env.PIXIEED_SELECTION_CONTROLS_VIEWPORTS ? JSON.parse(process.env.PIXIEED_SELECTION_CONTROLS_VIEWPORTS) : defaultViewports;
const browser = await chromium.launch({ headless: true });
const report = {
  startedAt: new Date().toISOString(), base, viewportCases: [], externalRequests: [], pageErrors: [],
  realCamera: 'UNTESTED', realMicrophone: 'UNTESTED', screenshots: [], status: 'running'
};
const selector = {
  controls: '#draw-selection-controls', slots: '#draw-selection-controls [data-selection-slot]',
  deselect: '.draw-feature-actions .draw-selection-controls__deselect', canvas: '#draw-canvas'
};
const waitReady = async page => {
  await page.waitForFunction(() => {
    const ready = document.documentElement.dataset.creationModesReady === 'true'
      && document.body.dataset.creationMode === 'draw'
      && !document.querySelector('#main')?.inert
      && !document.body.hasAttribute('data-creation-transition');
    const status = document.querySelector('#draw-status')?.textContent || '';
    return ready || /できませんでした|読み込めません|エラー|失敗|ReferenceError|Cannot access/i.test(status);
  }, null, { timeout: 30000 });
  const readyState = await page.evaluate(() => ({ ready: document.documentElement.dataset.creationModesReady === 'true', mode: document.body.dataset.creationMode, inert: Boolean(document.querySelector('#main')?.inert), status: document.querySelector('#draw-status')?.textContent || '' }));
  assert.equal(readyState.ready && readyState.mode === 'draw' && !readyState.inert, true, `draw startup failed: ${readyState.status}`);
}
const delayFrame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function runViewport(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  console.log(`START ${label}`);
  const row = { viewport, checks: [], states: {}, layout: {}, failures: [], screenshots: [] };
  report.viewportCases.push(row);
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (report.externalRequests.push(route.request().url()), route.abort()));
  await context.addInitScript(() => {
    window.__selectionHarness = { mediaRequests: 0 };
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true, value: async () => { window.__selectionHarness.mediaRequests++; throw new DOMException('QA fixture does not use a camera', 'NotAllowedError'); }
    });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ viewport, message: error.message }));
  const snapPixels = async () => { await delayFrame(page); return page.locator(selector.canvas).evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)); };
  const point = async (x, y) => {
    const rect = await page.locator(selector.canvas).boundingBox();
    assert.ok(rect, 'canvas is measurable');
    return { x: rect.x + x * rect.width / 16, y: rect.y + y * rect.height / 16 };
  };
  const drag = async (a, b, button = 'left', modifier) => {
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(a.x, a.y); await page.mouse.down({ button });
    await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up({ button });
    if (modifier) await page.keyboard.up(modifier);
    await delayFrame(page);
  };
  const key = async keyName => { await page.locator(selector.canvas).focus(); await page.keyboard.press(keyName); await delayFrame(page); };
  const visibleSlotState = () => page.locator(selector.controls).evaluate(root => ({
    pending: root.dataset.pending, mode: root.dataset.mode,
    slots: [...root.querySelectorAll('[data-selection-slot]')].map(button => ({
      slot: button.dataset.selectionSlot, action: button.dataset.selectionAction, kind: button.dataset.slotKind,
      visible: button.checkVisibility(), hidden: button.hidden, disabled: button.disabled,
      label: button.getAttribute('aria-label'), tabIndex: button.tabIndex
    })),
    deselect: (() => { const button = document.querySelector('.draw-feature-actions .draw-selection-controls__deselect'); return button ? { visible: button.checkVisibility(), hidden: button.hidden, tabIndex: button.tabIndex, focus: document.activeElement === button } : null; })()
  }));
  const action = async name => {
    const target = page.locator(`${selector.controls} [data-selection-action="${name}"]`).first();
    await target.waitFor({ state: 'visible' }); await target.click(); await delayFrame(page);
  };
  const selectionBoxVisible = () => page.locator('.draw-selection').isVisible().catch(() => false);
  const rects = async () => page.evaluate(() => {
    const names = ['#main', '.draw-board', '#draw-canvas', '#draw-palette', '#draw-undo', '#draw-redo', '.draw-fixed-left', '.draw-feature-actions'];
    return Object.fromEntries(names.map(selector => {
      const node = document.querySelector(selector); if (!node) return [selector, null];
      const rect = node.getBoundingClientRect();
      return [selector, Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(rect[key] * 100) / 100]))];
    }));
  });
  const savePxd = async () => {
    await page.locator('#creation-file-open').click(); await page.locator('#pxd-panel').waitFor({ state: 'visible' });
    await page.locator('#project-tab-current').click();
    const more = page.locator('.project-more'); if (!await more.evaluate(node => node.open)) await more.locator(':scope > summary').click();
    await page.locator('#pxd-save').click();
    await page.waitForFunction(() => /保存し直しました/.test(document.querySelector('#pxd-file-status')?.textContent || ''), null, { timeout: 15000 });
    const saved = await page.evaluate(async () => {
      const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
      const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
      const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
      const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
      const project = pointer && await createToolProjectStore('draw').load(pointer.projectId, pointer.revisionId);
      const animation = project && await readPxdAnimation(project);
      const cel = animation && getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id);
      return { pointer, title: project?.manifest.title, pixels: cel?.pixels ?? null };
    });
    if (await page.locator('#pxd-panel').evaluate(dialog => dialog.open)) await page.locator('#project-close').click();
    await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
    return saved;
  };
  try {
    await page.goto(`${base}/draw/`); await waitReady(page);
    const baselinePath = join(output, `${label}-no-selection.png`);
    await page.screenshot({ path: baselinePath, fullPage: true }); row.screenshots.push(baselinePath); report.screenshots.push(baselinePath);
    await page.locator('#creation-file-open').click(); await page.locator('#pxd-panel').waitFor({ state: 'visible' });
    await page.locator('#project-tab-library').click();
    const imports = page.locator('.project-imports'); if (!await imports.evaluate(node => node.open)) await imports.locator(':scope > summary').click();
    await page.locator('#pxd-file-input').setInputFiles(fixturePath);
    await page.waitForFunction(() => document.querySelectorAll('#draw-palette [data-color-index]').length >= 4 && !document.querySelector('#main')?.inert, null, { timeout: 20000 });
    if (await page.locator('#pxd-panel').evaluate(dialog => dialog.open)) await page.locator('#project-close').click();
    await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
    await key('0'); await key('Escape');
    const original = await snapPixels();

    row.states.none = await visibleSlotState(); row.layout.none = await rects();
    assert.equal(row.states.none.deselect?.visible, false, 'selection deselect is absent when nothing is selected');
    assert.ok(row.states.none.slots.every(slot => !slot.visible), 'empty operation slots do not remain exposed');
    assert.ok(await page.locator('.draw-color-adjustment-open').isVisible(), 'color adjustment stays usable');
    assert.ok(await page.locator('.draw-text-opener').isVisible(), 'text stays usable');
    assert.ok(await page.locator('#draw-brush-size-open').isVisible(), 'brush settings stay usable');
    assert.ok(await page.locator('#draw-brush-size-open').isEnabled(), 'brush size remains enabled');
    row.layout.featuresNone = await page.evaluate(() => Object.fromEntries(['.draw-color-adjustment-open', '.draw-text-opener', '#draw-brush-size-open'].map(selector => { const n=document.querySelector(selector),r=n.getBoundingClientRect();return [selector,{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width)}]; })));
    row.checks.push('no-selection state hides empty slots and keeps color/text/brush/size controls');

    await key('v');
    row.states.toolOnly = await visibleSlotState();
    assert.equal(row.states.toolOnly.deselect?.visible, false, 'select tool without bounds has no clear action');
    assert.ok(row.states.toolOnly.slots.every(slot => !slot.visible || !['copy', 'cut'].includes(slot.action)), 'no meaningless copy/cut for an empty selection');
    row.layout.toolOnly = await rects();
    row.checks.push('selection tool without bounds exposes no copy/cut or deselect');

    const rangeStart = await point(3.5, 4.5), rangeEnd = await point(6.5, 6.5);
    await drag(rangeStart, rangeEnd);
    assert.equal(await selectionBoxVisible(), true, 'selection bounds are visible after range gesture');
    row.states.bounds = await visibleSlotState(); row.layout.bounds = await rects();
    assert.equal(row.states.bounds.deselect?.visible, true, 'clear action is visible with bounds');
    assert.ok(row.states.bounds.slots.some(slot => slot.visible && slot.action === 'copy'));
    assert.ok(row.states.bounds.slots.some(slot => slot.visible && slot.action === 'cut'));
    const boundsPath = join(output, `${label}-selected-bounds.png`);
    await page.screenshot({ path: boundsPath, fullPage: true }); row.screenshots.push(boundsPath); report.screenshots.push(boundsPath);
    row.checks.push('bounded selection exposes clear/copy/cut actions');

    // Clear through a physical click and check pixels are untouched, then
    // prove the selected range remains meaningful after switching tools.
    await page.keyboard.press('b'); await delayFrame(page);
    assert.equal(await selectionBoxVisible(), true, 'bounds persist after changing away from select tool');
    const beforeDeselect = await snapPixels();
    await page.locator(selector.deselect).click(); await delayFrame(page);
    assert.equal(await selectionBoxVisible(), false); assert.deepEqual(await snapPixels(), beforeDeselect);
    row.states.afterDeselect = await visibleSlotState();
    assert.equal(row.states.afterDeselect.deselect?.visible, false);
    assert.notEqual(await page.evaluate(() => document.activeElement?.classList?.contains('draw-selection-controls__deselect')), true, 'focus is not left on the hidden deselect control');
    row.checks.push('switch-to-pen preserves bounds; clear hides itself, releases focus and preserves pixels');

    // Pick a transparent region. It still has a useful explicit clear action.
    await key('v'); await drag(await point(.5, .5), await point(2.5, 2.5));
    row.states.transparentBounds = await visibleSlotState();
    assert.equal(row.states.transparentBounds.deselect?.visible, true, 'transparent bounds remain explicitly clearable');
    const transparentPixels = await snapPixels(); await page.locator(selector.deselect).click(); await delayFrame(page);
    assert.deepEqual(await snapPixels(), transparentPixels);
    row.checks.push('transparent-only bounds can be cleared without changing art');

    // Make a nonempty selection, copy, paste, cancel, then paste and confirm.
    const staleStart = await point(9.5, 4.5), staleEnd = await point(12.5, 6.5);
    await key('v'); await drag(staleStart, staleEnd);
    const copySource = await snapPixels(); await action('copy');
    assert.deepEqual(await snapPixels(), copySource, 'copy does not alter source pixels');
    assert.ok((await visibleSlotState()).slots.some(slot => slot.visible && slot.action === 'paste'));
    await action('paste');
    const pasteFrame = await page.locator('.draw-selection').evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), width: Number(node.dataset.width), height: Number(node.dataset.height) }));
    await drag(await point(pasteFrame.x + pasteFrame.width / 2, pasteFrame.y + pasteFrame.height / 2), await point(pasteFrame.x + pasteFrame.width / 2 + 2, pasteFrame.y + pasteFrame.height / 2), 'left', 'Alt');
    row.states.pending = await visibleSlotState(); row.layout.pending = await rects();
    assert.deepEqual(row.states.pending.slots.filter(slot => slot.visible).map(slot => slot.action), ['confirm', 'cancel']);
    assert.equal(row.states.pending.deselect?.visible, false, 'pending placement uses confirmation only');
    const pendingPath = join(output, `${label}-pending-transform.png`);
    await page.screenshot({ path: pendingPath, fullPage: true }); row.screenshots.push(pendingPath); report.screenshots.push(pendingPath);
    assert.notDeepEqual(await snapPixels(), copySource, 'paste preview contains placed pixels');
    const preview = await snapPixels(); await action('cancel');
    assert.deepEqual(await snapPixels(), copySource, 'cancel restores source pixels');
    row.checks.push('copy/paste pending state exposes only confirm/cancel; cancel preserves source pixels');

    await action('paste');
    const confirmFrame = await page.locator('.draw-selection').evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), width: Number(node.dataset.width), height: Number(node.dataset.height) }));
    await drag(await point(confirmFrame.x + confirmFrame.width / 2, confirmFrame.y + confirmFrame.height / 2), await point(confirmFrame.x + confirmFrame.width / 2 + 2, confirmFrame.y + confirmFrame.height / 2), 'left', 'Alt');
    await action('confirm');
    const pasted = await snapPixels(); assert.notDeepEqual(pasted, copySource);
    await key(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.deepEqual(await snapPixels(), copySource, 'Undo reverses confirmed paste');
    const undoState = await visibleSlotState();
    assert.equal(undoState.deselect?.visible, true, 'Undo restores bounds and matching clear state');
    await key(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    assert.deepEqual(await snapPixels(), pasted, 'Redo restores confirmed paste pixels');
    const redoState = await visibleSlotState(); assert.equal(redoState.deselect?.visible, true);
    row.checks.push('confirm/Undo/Redo restores exact paste pixels and synchronized selection state');

    // A Cut is one real pixel transaction with a matching undo/redo state.
    await key('Escape'); await key('v');
    if (!await selectionBoxVisible()) await drag(rangeStart, rangeEnd);
    const beforeCut = await snapPixels(); await action('cut'); const afterCut = await snapPixels();
    assert.notDeepEqual(afterCut, beforeCut, 'cut clears source art');
    await key(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.deepEqual(await snapPixels(), beforeCut, 'Undo restores cut source pixels');
    assert.equal((await visibleSlotState()).deselect?.visible, true);
    await key(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
    assert.deepEqual(await snapPixels(), afterCut, 'Redo reapplies cut');
    row.checks.push('Cut plus Undo/Redo restores exact pixels and range state');

    // Geometry should be stable across no selection, selected, and pending
    // states. The feature row may reclaim brush columns but its left edge and
    // its first two controls should stay anchored.
    const stableSelectors = ['#main', '.draw-board', '#draw-canvas', '#draw-palette', '#draw-undo', '#draw-redo', '.draw-fixed-left', '.draw-feature-actions'];
    for (const name of stableSelectors) {
      assert.deepEqual(row.layout.bounds[name], row.layout.none[name], `${name} geometry stable with selection`);
      assert.deepEqual(row.layout.pending[name], row.layout.none[name], `${name} geometry stable while pending`);
    }
    for (const state of ['none', 'bounds', 'pending']) for (const name of ['#draw-undo', '#draw-redo']) {
      const rect = row.layout[state][name];
      assert.ok(rect.y >= 0 && rect.y + rect.height <= viewport.height,
        `${name} remains fully visible in the viewport (${state}, ${viewport.width}x${viewport.height})`);
    }
    const featurePositions = await page.evaluate(() => Object.fromEntries(['.draw-color-adjustment-open', '.draw-text-opener', '#draw-brush-size-open'].map(selector => {
      const node = document.querySelector(selector), r = node.getBoundingClientRect(); return [selector, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) }];
    })));
    row.layout.featureControls = featurePositions;
    assert.equal(featurePositions['.draw-color-adjustment-open'].x, row.layout.featuresNone['.draw-color-adjustment-open'].x, 'color feature stays at the same position');
    assert.equal(featurePositions['.draw-text-opener'].x, row.layout.featuresNone['.draw-text-opener'].x, 'text feature stays at the same position');
    assert.equal(featurePositions['#draw-brush-size-open'].x, row.layout.featuresNone['#draw-brush-size-open'].x, 'brush feature left edge stays fixed');
    assert.ok(featurePositions['#draw-brush-size-open'].width < row.layout.featuresNone['#draw-brush-size-open'].width, 'visible clear action reclaims a brush column');
    row.checks.push('editor/palette/undo/redo geometry stays fixed in all selection states');

    if (viewport.width >= 1000) {
      const beforeResizePixels = await snapPixels();
      const beforeResizeTool = await page.locator('.draw-tool-menu [data-draw-tool][aria-pressed="true"]').first().getAttribute('data-draw-tool');
      const beforeResizeSelection = await page.locator('.draw-selection').evaluate(node => ({
        x: node.dataset.x, y: node.dataset.y, width: node.dataset.width, height: node.dataset.height
      }));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => !document.body.classList.contains('draw-desktop-active'), null, { timeout: 10000 });
      assert.equal(await page.locator('#draw-canvas').isVisible(), true, 'canvas is restored in compact layout');
      assert.deepEqual(await snapPixels(), beforeResizePixels, 'leaving desktop layout preserves exact pixels');
      assert.equal(await page.locator('.draw-tool-menu [data-draw-tool][aria-pressed="true"]').first().getAttribute('data-draw-tool'), beforeResizeTool);
      assert.equal(await page.locator('.draw-selection').isVisible(), true, 'selection bounds stay visible in compact layout');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForFunction(() => document.body.classList.contains('draw-desktop-active'), null, { timeout: 10000 });
      assert.deepEqual(await snapPixels(), beforeResizePixels, 'returning to desktop layout preserves exact pixels');
      assert.equal(await page.locator('.draw-tool-menu [data-draw-tool][aria-pressed="true"]').first().getAttribute('data-draw-tool'), beforeResizeTool);
      const afterResizeSelection = await page.locator('.draw-selection').evaluate(node => ({
        x: node.dataset.x, y: node.dataset.y, width: node.dataset.width, height: node.dataset.height
      }));
      assert.deepEqual(afterResizeSelection, beforeResizeSelection, 'selection bounds survive desktop/compact restoration');
      row.checks.push('desktop/compact resize restores tool, canvas, selection, and exact pixels');
    }

    // Hidden context actions must not remain keyboard targets. The visible
    // deselect disappears after clearing and leaves focus away from hidden UI.
    await page.locator(selector.deselect).focus();
    const focusedBeforeClear = await page.evaluate(() => document.activeElement?.classList?.contains('draw-selection-controls__deselect'));
    assert.equal(focusedBeforeClear, true);
    await page.locator(selector.deselect).click(); await delayFrame(page);
    const focusState = await page.evaluate(() => ({ id: document.activeElement?.id, hiddenActionFocused: document.activeElement?.matches('#draw-selection-controls [hidden], .draw-selection-controls__deselect[hidden]') || false }));
    assert.equal(focusState.hiddenActionFocused, false);
    assert.equal((await visibleSlotState()).deselect?.visible, false);
    row.checks.push('clear action leaves no focus inside hidden controls');

    // Hold a copy button through an input-side/tool change. A stale native
    // release must not invoke whichever action now occupies that slot.
    await key('v'); await drag(staleStart, staleEnd);
    const copyButton = page.locator(`${selector.controls} [data-selection-action="copy"]`).first();
    const copyRect = await copyButton.boundingBox(); assert.ok(copyRect);
    await page.mouse.move(copyRect.x + copyRect.width / 2, copyRect.y + copyRect.height / 2);
    await page.mouse.down();
    await page.locator(selector.canvas).focus();
    await page.keyboard.press('b'); await delayFrame(page);
    const activeToolWhileHeld = await page.locator('[data-draw-tool="pen"]').getAttribute('aria-pressed');
    assert.equal(activeToolWhileHeld, 'true', 'canvas-focused shortcut changes to pen while pointer is held');
    await page.mouse.up(); await delayFrame(page);
    assert.ok(!(await visibleSlotState()).slots.some(slot => slot.visible && slot.action === 'paste'), 'release after a selection state change did not invoke copy');
    row.checks.push('native pointer release after keyboard tool change does not invoke stale copy');
    if ((await visibleSlotState()).deselect?.visible) await page.locator(selector.deselect).click();

    // Pending mode changes are cancelled explicitly before switching between
    // audio/camera/draw; the PXD artwork remains the same on return.
    await key('v'); await drag(staleStart, staleEnd);
    await action('copy'); await action('paste');
    assert.equal((await visibleSlotState()).pending, 'true');
    await action('cancel');
    const beforeModes = await snapPixels();
    for (const mode of ['audio', 'camera', 'draw']) {
      if (!await page.locator('#creation-mode-menu').evaluate(node => node.open)) await page.locator('#creation-mode-menu > summary').click();
      await page.locator(`#creation-mode-menu [data-creation-mode="${mode}"]`).click();
      await page.waitForFunction(m => document.body.dataset.creationMode === m && !document.body.hasAttribute('data-creation-transition'), mode, { timeout: 30000 });
    }
    assert.deepEqual(await snapPixels(), beforeModes);
    row.checks.push('cancelled pending transaction and mode round trip preserves artwork');

    // Save through the current project pane, .project-more and #pxd-save.
    const savedPixels = await snapPixels();
    const saved = await savePxd(); row.saved = saved;
    assert.equal(saved.title, 'Selection controls QA fixture');
    assert.ok(saved.pointer?.projectId);
    await page.reload(); await waitReady(page);
    assert.deepEqual(await snapPixels(), savedPixels, 'reload restores saved pixels');
    assert.equal(await page.locator('#creation-file-open').isVisible(), true);
    row.checks.push('current PXD project saves and reloads through the workspace controls');

    const mediaRequests = await page.evaluate(() => window.__selectionHarness.mediaRequests);
    assert.equal(mediaRequests, 0); row.mediaRequests = mediaRequests;
    assert.deepEqual(report.pageErrors.filter(error => error.viewport === viewport), []);
    row.passed = true;
  } catch (error) {
    row.passed = false; row.failures.push({ message: error.message, stack: error.stack });
    console.error(`FAIL ${label}: ${error.message}`);
    const path = join(output, `${label}-failure.png`);
    await page.screenshot({ path, fullPage: true }).catch(() => {}); row.screenshots.push(path); report.screenshots.push(path);
  } finally {
    await context.close();
    console.log(`${row.passed ? 'PASS' : 'DONE'} ${label}: ${row.checks.length} checks`);
  }
}

try {
  for (const viewport of viewports) await runViewport(viewport);
  report.finishedAt = new Date().toISOString();
  report.passed = report.viewportCases.every(row => row.passed);
  report.status = report.passed ? 'passed' : 'failed';
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (!report.passed) {
  console.error(`Selection controls failed at ${report.viewportCases.filter(row => !row.passed).map(row => `${row.viewport.width}x${row.viewport.height}`).join(', ')}`);
  process.exitCode = 1;
} else console.log(`PASS: selection controls (${report.viewportCases.length} viewports); evidence ${join(output, 'report.json')}`);
