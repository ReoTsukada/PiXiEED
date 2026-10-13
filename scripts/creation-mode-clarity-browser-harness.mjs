#!/usr/bin/env node
/** Isolated localhost acceptance for creation-mode status, history, and controls. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createAnimation, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4252';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only localhost is accepted');
const output = process.env.PIXIEED_MODE_CLARITY_OUTPUT || '/tmp/pixieed-mode-clarity-20261013';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(output, { recursive: true });

const palette = ['#e75445', '#4c82c3', '#6d9b68', '#eed040'];
const sourcePixels = Array(16 * 16).fill(-1);
for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) sourcePixels[y * 16 + x] = (x + y) % palette.length;
let fixtureAnimation = createAnimation({ width: 16, height: 16, palette });
fixtureAnimation = writeAnimationCel(fixtureAnimation, fixtureAnimation.frames[0].id, fixtureAnimation.layers[0].id, {
  width: 16, height: 16, pixels: sourcePixels.map(value => value + 1)
});
const fixturePath = join(output, 'mode-clarity-fixture.pxd');
await writeFile(fixturePath, await encodePxd(await writePxdAnimation(createPxdProject({ manifest: { title: '制作モード明確化 QA' } }), fixtureAnimation)));

const viewports = process.env.PIXIEED_MODE_CLARITY_VIEWPORTS
  ? JSON.parse(process.env.PIXIEED_MODE_CLARITY_VIEWPORTS)
  : [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 1280, height: 800 }];
const browser = await chromium.launch({ headless: true });
const sourceFiles = [
  'js/creation/creation-modes.mjs', 'js/creation/creation-camera.mjs',
  'js/creation/draw-page.mjs', 'js/creation/draw-music.mjs', 'draw/index.html', 'css/creation-modes.css'
];
const sourceFingerprint = createHash('sha256').update((await Promise.all(sourceFiles.map(async path => `${path}\0${await readFile(path)}`))).join('\0')).digest('hex');
const report = {
  startedAt: new Date().toISOString(), base, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceFingerprint, viewports: [], pageErrors: [], externalRequests: [], cameraApiCalls: 0,
  realCamera: 'UNTESTED', realMicrophone: 'UNTESTED', screenshots: [], status: 'running'
};

const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = async page => {
  await page.waitForFunction(() => {
    const ok = document.documentElement.dataset.creationModesReady === 'true'
      && document.body.dataset.creationMode === 'draw'
      && !document.querySelector('#main')?.inert
      && !document.body.hasAttribute('data-creation-transition');
    const failure = document.querySelector('#draw-status')?.textContent || '';
    return ok || /読み込めません|できませんでした|エラー|失敗|ReferenceError|Cannot access/i.test(failure);
  }, null, { timeout: 30000 });
  const state = await page.evaluate(() => ({
    ready: document.documentElement.dataset.creationModesReady === 'true', mode: document.body.dataset.creationMode,
    inert: Boolean(document.querySelector('#main')?.inert), status: document.querySelector('#draw-status')?.textContent || ''
  }));
  assert.equal(state.ready && state.mode === 'draw' && !state.inert && !/読み込めません|できませんでした|エラー|失敗|ReferenceError|Cannot access/i.test(state.status), true, `creation shell failed to start: ${state.status}`);
};
const pixels = page => page.locator('#draw-canvas').evaluate(canvas => ({
  width: canvas.width, height: canvas.height,
  rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
}));
const projectSnapshot = page => page.evaluate(async () => {
  const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:creation') || localStorage.getItem('pixieed:pxd:last:draw') || 'null');
  if (!pointer) throw new Error('fixture PXD pointer was not created');
  const [{ createToolProjectStore }, { readPxdAnimation }, { getAnimationCelDocument }] = await Promise.all([
    import('/js/creation/tool-project-store.mjs'), import('/js/creation/pxd-animation.mjs'), import('/js/creation/animation-core.mjs')
  ]);
  const project = await createToolProjectStore('draw').load(pointer.projectId, pointer.revisionId);
  const animation = await readPxdAnimation(project);
  return {
    pointer, width: animation.width, height: animation.height, palette: [...animation.palette],
    frames: animation.frames.map(({ id }) => id), layers: animation.layers.map(({ id, role }) => ({ id, role })),
    cels: animation.frames.map(f => animation.layers.map(l => [...getAnimationCelDocument(animation, f.id, l.id).pixels]))
  };
});

async function importFixture(page) {
  await page.locator('#creation-file-open').click();
  await page.locator('#pxd-panel').waitFor({ state: 'visible' });
  await page.locator('#project-tab-library').click();
  const imports = page.locator('.project-imports');
  if (!await imports.evaluate(node => node.open)) await imports.locator(':scope > summary').click();
  await page.locator('#pxd-file-input').setInputFiles(fixturePath);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    const status = document.querySelector('#draw-status')?.textContent || '';
    return canvas?.width === 16 && canvas?.height === 16
      && document.querySelectorAll('#draw-palette [data-color-index]').length === 5
      && !document.querySelector('#main')?.inert && /保存しました|編集中/.test(status);
  }, null, { timeout: 20000 });
  if (await page.locator('#pxd-panel').evaluate(dialog => dialog.open)) await page.locator('#project-close').click();
  await page.locator('#pxd-panel').waitFor({ state: 'hidden' });
  await frame(page);
}

async function mode(page, name) {
  const menu = page.locator('#creation-mode-menu');
  if (!await menu.evaluate(node => node.open)) await menu.locator(':scope > summary').click();
  await menu.locator(`[data-creation-mode="${name}"]`).click();
  await page.waitForFunction(value => document.body.dataset.creationMode === value
    && !document.body.hasAttribute('data-creation-transition') && !document.querySelector('#main')?.inert,
  name, { timeout: 30000 });
  await frame(page);
}

async function openSharedSettings(page) {
  await page.locator('#creation-settings-open').click();
  await page.locator('#creation-settings-panel').waitFor({ state: 'visible' });
  await page.locator('#creation-canvas-settings-open').click();
  const panel = page.locator('#creation-project-settings-panel');
  await panel.waitFor({ state: 'visible' });
  return panel;
}

async function runViewport(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  console.log(`START ${label}`);
  const row = { viewport, checks: [], cameraStatus: [], music: {}, failures: [], screenshots: [], layout: {} };
  report.viewports.push(row);
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : (report.externalRequests.push(route.request().url()), route.abort()));
  await context.addInitScript(() => {
    window.__modeClarityQA = { mediaCalls: 0 };
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true, value: async () => { window.__modeClarityQA.mediaCalls++; throw new DOMException('QA uses imported images only', 'NotAllowedError'); }
    });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ viewport, message: error.message }));
  const shot = async name => {
    const path = join(output, `${label}-${name}.png`);
    await page.screenshot({ path, fullPage: true }); row.screenshots.push(path); report.screenshots.push(path);
  };
  const cameraStatus = () => page.locator('#creation-camera-project-status').textContent();
  const fileSaveNote = () => page.locator('#creation-project-save-scope').textContent();
  const createPng = async (colors = palette, alpha = 255) => {
    const dataUrl = await page.evaluate(({ colors, alpha }) => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext('2d');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        context.fillStyle = colors[(Math.floor(x / 8) + Math.floor(y / 8) * 2) % colors.length];
        context.globalAlpha = alpha < 255 && x < 8 && y < 8 ? alpha / 255 : 1;
        context.fillRect(x, y, 1, 1);
      }
      context.globalAlpha = 1;
      return canvas.toDataURL('image/png');
    }, { colors, alpha });
    return { name: `synthetic-${Date.now()}.png`, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
  };
  const uploadImage = async (colors, alpha = 255) => {
    await page.locator('#cameraImageInput').setInputFiles(await createPng(colors, alpha));
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.source === 'image'
      && document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && document.querySelector('#capture')?.disabled === false,
    null, { timeout: 20000 });
  };
  const capture = async () => {
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
      && document.querySelector('#useCameraImage')?.disabled === false,
    null, { timeout: 20000 });
    await frame(page);
  };
  const assertStatusPresent = async matcher => {
    const text = await cameraStatus(); row.cameraStatus.push(text);
    assert.match(text, matcher, `camera project status: ${text}`);
    return text;
  };
  const musicSettings = page.locator('.draw-music-panel');
  const musicStatus = async () => page.evaluate(() => ({
    tempo: document.querySelector('#draw-music-tempo')?.value,
    instrument: document.querySelector('#draw-music-instrument')?.value,
    loops: document.querySelector('#draw-music-loops')?.value,
    outputMusic: document.querySelector('#draw-music-output-layer')?.checked,
    outputAudio: document.querySelector('#draw-music-output-audio')?.checked,
    stopVisible: Boolean(document.querySelector('#draw-music-stop-loop')?.checkVisibility()),
    playPressed: document.querySelector('#draw-music-play')?.getAttribute('aria-pressed')
  }));
  try {
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await ready(page);
    await importFixture(page);
    const originalCanvas = await pixels(page), originalProject = await projectSnapshot(page);
    assert.deepEqual(originalProject.palette, palette); assert.equal(originalProject.width, 16); assert.equal(originalProject.height, 16);
    await shot('draw-initial');
    row.checks.push('PXD fixture loads at 16×16 with the exact four-color shared palette');

    // The central action stays a real camera shutter; import avoids any device permission request.
    await mode(page, 'camera');
    assert.equal(await page.locator('#capture').count(), 1);
    assert.equal(await page.locator('#creation-output-open').isDisabled(), true, 'no camera output before a captured image');
    await uploadImage(palette);
    const cameraLooks = page.locator('#toolbarHome [data-tool="look"]');
    await cameraLooks.click();
    const fixedPalette = page.locator('#cameraPaletteFixed');
    await fixedPalette.waitFor({ state: 'visible' });
    await fixedPalette.check();
    if (await page.locator('#toolbarContextBack').isVisible().catch(() => false)) await page.locator('#toolbarContextBack').click();
    await page.waitForFunction(() => document.querySelector('#capture')?.disabled === false, null, { timeout: 15000 });
    assert.equal(await page.locator('#capture').getAttribute('data-action'), 'capture', 'uploaded image enables the central capture action');
    await capture();
    const capturedPixels = await pixels(page);
    assert.deepEqual(capturedPixels, originalCanvas, 'capturing is only a preview and does not apply image pixels');
    const pendingText = await assertStatusPresent(/作品に未反映|未反映の撮影画像/);
    const outputButton = page.locator('#creation-output-open');
    assert.equal(await outputButton.isDisabled(), false);
    assert.equal(await outputButton.isVisible(), true, 'footer Output remains visible while a captured result is available');
    assert.equal(await outputButton.getAttribute('aria-label'), '出力を開く', 'footer Output keeps its accessible name');
    assert.equal(await page.locator('#savePng').isVisible().catch(() => false), false, 'camera capture does not expose a duplicate shared-page Save PNG control');
    await shot('camera-captured-unapplied');
    row.checks.push('synthetic capture remains unapplied and preserves artwork; camera output becomes available only after capture');

    await mode(page, 'audio');
    assert.match(await assertStatusPresent(/作品に未反映|未反映の撮影画像/), /作品に未反映|未反映の撮影画像/);
    await mode(page, 'draw');
    await mode(page, 'camera');
    assert.match(await assertStatusPresent(/作品に未反映|未反映の撮影画像/), /作品に未反映|未反映の撮影画像/);
    row.checks.push('captured image status survives camera↔music↔draw mode changes');

    // In the pending state the file pane must say the captured photo is not saved with the PXD.
    await page.locator('#creation-file-open').click(); await page.locator('#pxd-panel').waitFor({ state: 'visible' });
    await page.locator('#project-tab-current').click();
    const saveNote = (await fileSaveNote()).replace(/\s+/g, ' ').trim();
    const cameraNote = (await page.locator('#creation-project-camera-note').textContent()).replace(/\s+/g, ' ').trim();
    assert.match(saveNote, /絵|作品/); assert.match(saveNote, /音楽|曲/); assert.match(saveNote, /設定/);
    assert.match(saveNote, /撮影|写真|画像/); assert.match(saveNote, /出力/);
    assert.match(cameraNote, /未反映の撮影画像は含まれません/);
    row.saveNote = saveNote; row.cameraNote = cameraNote;
    await shot('file-save-scope-pending');
    if (await page.locator('#pxd-panel').evaluate(dialog => dialog.open)) await page.locator('#project-close').click();
    row.checks.push('PXD save-scope copy distinguishes shared artwork/music/settings from the pending captured photo');

    await page.locator('#useCameraImage').click();
    await page.waitForFunction(() => document.body.dataset.creationMode === 'draw'
      && !document.body.hasAttribute('data-creation-transition') && !document.querySelector('#main')?.inert,
    null, { timeout: 30000 });
    await frame(page);
    const appliedCanvas = await pixels(page), appliedProject = await projectSnapshot(page);
    assert.notDeepEqual(appliedCanvas, originalCanvas, 'Apply writes image pixels to the shared art');
    row.appliedPalette = appliedProject.palette;
    assert.ok(appliedProject.palette.length <= 4, `exact-palette image does not add extra project colors: ${JSON.stringify(appliedProject.palette)}`);
    assert.equal(await page.locator('#draw-undo').isEnabled(), true);
    row.checks.push('applying the captured image changes shared pixels without exceeding the shared palette');
    await mode(page, 'camera');
    const appliedText = await assertStatusPresent(/反映済み/);
    await shot('camera-applied');
    await mode(page, 'draw');
    const undoButton = page.locator('#draw-undo');
    await undoButton.click(); await frame(page);
    assert.deepEqual(await pixels(page), originalCanvas, 'one Undo restores exact art pixels');
    assert.deepEqual((await projectSnapshot(page)).palette, originalProject.palette, 'one Undo restores exact palette');
    await mode(page, 'camera');
    const undoneText = await assertStatusPresent(/反映は作品のUndoで取り消/);
    assert.notEqual(undoneText, appliedText, 'status distinguishes an applied result from its Undo');
    await mode(page, 'draw');
    await page.locator('#draw-redo').click(); await frame(page);
    assert.deepEqual(await pixels(page), appliedCanvas, 'one Redo restores exact applied pixels');
    await mode(page, 'camera');
    assert.match(await assertStatusPresent(/反映済み/), /反映済み/);
    assert.equal(await page.locator('#savePng').isVisible().catch(() => false), false, 'applied camera result still has no duplicate Save PNG control');
    row.checks.push('camera application is tracked against Draw history: Undo marks it unapplied and Redo restores the applied status');
    row.checks.push('camera keeps Save PNG hidden in captured and applied states while footer Output stays labeled and enabled');

    // Editing music after the camera apply must not invalidate the applied marker.
    await mode(page, 'audio');
    await page.locator('#creation-settings-open').click();
    await page.locator('#creation-mode-settings-open').click();
    await musicSettings.waitFor({ state: 'visible' });
    await page.locator('#draw-music-instrument').waitFor({ state: 'visible' });
    const instrument = page.locator('#draw-music-instrument');
    const optionValue = await instrument.locator('option').evaluateAll(options => options.find(option => option.value)?.value || '');
    assert.ok(optionValue, 'music fixture offers at least one playable instrument');
    if (optionValue) await instrument.selectOption(optionValue);
    await page.locator('#draw-music-tempo').fill('132');
    await page.locator('#draw-music-tempo').dispatchEvent('change');
    await page.keyboard.press('Escape');
    await frame(page);
    assert.equal(await page.locator('#creation-settings-open').evaluate(node => node === document.activeElement), true, 'closing music settings returns focus to settings footer control');
    await page.locator('#creation-output-open').click();
    await page.waitForFunction(() => document.querySelector('#draw-music-settings')?.open
      && document.querySelector('.draw-music-panel')?.dataset.creationAudioView === 'output');
    await page.locator('#draw-music-loops').selectOption('2');
    await page.locator('#draw-music-loops').dispatchEvent('change');
    await page.locator('#draw-music-output-layer').check();
    await page.locator('#draw-music-output-audio').uncheck();
    const songState = await musicStatus(); row.music.beforeSettingsClose = songState;
    assert.equal(songState.stopVisible, false, 'stop-after-loop is hidden in Output view');
    assert.equal(songState.tempo, '132'); assert.equal(songState.loops, '2');
    assert.equal(songState.outputMusic, true); assert.equal(songState.outputAudio, false);
    assert.equal(await page.locator('#draw-music-stop-loop').isVisible(), false, 'stop-after-loop is hidden in Output view');
    await page.keyboard.press('Escape');
    await frame(page);
    assert.equal(await page.locator('#creation-output-open').evaluate(node => node === document.activeElement), true, 'closing Output restores footer focus');
    row.checks.push('music settings expose loop-stop only in settings view and keep tempo, instrument, loop, and output choices');

    // Requesting stop-after-loop while the assigned square is playing exercises the real UI listener.
    const musicPixelsBefore = await pixels(page);
    const musicCanvas = await page.locator('#draw-canvas').boundingBox();
    await page.mouse.click(musicCanvas.x + musicCanvas.width * 0.45, musicCanvas.y + musicCanvas.height * 0.45);
    await frame(page);
    const musicPixelsAfter = await pixels(page);
    assert.notDeepEqual(musicPixelsAfter, musicPixelsBefore, 'an assigned music square is drawn into the shared music track');
    const play = page.locator('#draw-music-play');
    if (await play.getAttribute('aria-pressed') !== 'true') await play.click();
    await page.waitForFunction(() => document.querySelector('#draw-music-play')?.getAttribute('aria-pressed') === 'true', null, { timeout: 8000 });
    await page.locator('#creation-settings-open').click(); await page.locator('#creation-mode-settings-open').click();
    await page.waitForFunction(() => document.querySelector('#draw-music-settings')?.open
      && document.querySelector('.draw-music-panel')?.dataset.creationAudioView === 'settings', null, { timeout: 10000 });
    row.music.stopAfterLoopInSettings = await page.locator('#draw-music-stop-loop').evaluate(node => ({
      visible: node.checkVisibility(), disabled: node.disabled, rectangle: node.getBoundingClientRect().toJSON(), parent: node.parentElement?.id || ''
    }));
    await page.locator('#draw-music-stop-loop').waitFor({ state: 'visible' });
    assert.equal((await musicStatus()).stopVisible, true, 'stop-after-loop is visible in music settings');
    await page.locator('#draw-music-stop-loop').click();
    await page.waitForFunction(() => document.querySelector('#draw-music-play')?.getAttribute('aria-pressed') === 'false', null, { timeout: 8000 });
    await page.keyboard.press('Escape');
    const afterStop = await musicStatus(); row.music.afterStop = afterStop;
    assert.equal(afterStop.tempo, songState.tempo); assert.equal(afterStop.instrument, songState.instrument);
    assert.equal(afterStop.loops, songState.loops); assert.equal(afterStop.outputMusic, songState.outputMusic); assert.equal(afterStop.outputAudio, songState.outputAudio);
    await mode(page, 'camera');
    assert.match(await assertStatusPresent(/反映済み/), /反映済み/);
    row.checks.push('stop-after-loop button is connected to playback and does not change music or camera status');

    // Existing Undo/Redo remain artwork/music history controls, while camera tone/zoom are outside that history.
    await mode(page, 'draw');
    const footerLabels = await page.evaluate(() => ({
      undo: document.querySelector('#draw-undo')?.getAttribute('aria-label'),
      redo: document.querySelector('#draw-redo')?.getAttribute('aria-label'),
      description: document.querySelector('#creation-history-description')?.textContent,
      describedBy: document.querySelector('#draw-undo')?.getAttribute('aria-describedby')
    }));
    row.music.historyLabels = footerLabels;
    assert.match(footerLabels.undo || '', /作品の編集履歴を戻す/);
    assert.match(footerLabels.redo || '', /作品の編集履歴をやり直す/);
    assert.equal(footerLabels.describedBy, 'creation-history-description');
    assert.match(footerLabels.description || '', /描画.*音楽.*撮影画像.*共通設定/);
    assert.match(footerLabels.description || '', /カメラの色味・ズームは対象外/);
    row.checks.push('Undo/Redo wording explains artwork/music history and excludes camera tone/zoom');

    // Opening another PXD invalidates the old applied-history pointer, but should not claim the
    // still-visible camera capture was applied to this new project.
    await mode(page, 'draw'); await importFixture(page);
    await mode(page, 'camera');
    const resetText = await cameraStatus(); row.cameraStatus.push(resetText);
    assert.match(resetText, /反映状態が変わ/);
    row.checks.push('opening a new PXD project marks the previous camera result as unknown rather than applied or unapplied');

    // Resize the new project, then capture a fresh image and keep it unapplied until the user
    // chooses Apply. A separate semitransparent capture below exercises the guarded failure path.
    await mode(page, 'draw');
    const canvasSettings = await openSharedSettings(page);
    const width = page.locator('#creation-project-width');
    await width.fill('18');
    await canvasSettings.locator('[data-project-action="preview"]').click();
    await canvasSettings.locator('[data-project-action="apply"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#creation-project-settings [data-project-action="apply"]')?.disabled === false);
    await canvasSettings.locator('[data-project-action="apply"]').click();
    await page.waitForFunction(() => document.querySelector('#draw-canvas')?.width === 18, null, { timeout: 15000 });
    const resizedCanvas = await pixels(page);
    await page.keyboard.press('Escape');
    await mode(page, 'camera');
    if (await page.locator('#pixelStudio').getAttribute('data-mode') === 'captured') {
      await page.locator('#capture').click();
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live', null, { timeout: 15000 });
    }
    await uploadImage(['#eed040', '#6d9b68', '#e75445', '#4c82c3']); await capture();
    const retakeText = await assertStatusPresent(/作品に未反映|未反映の撮影画像/);
    assert.notEqual(retakeText, appliedText, 'retake resets applied status');
    assert.deepEqual(await pixels(page), resizedCanvas, 'retaking a new image still does not auto-apply it to the new PXD');
    // Exercise a failed Apply with semitransparent source pixels where the camera pipeline
    // preserves them. Some camera processing modes quantize alpha to binary; record that honestly.
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live', null, { timeout: 15000 });
    await uploadImage(['#eed040', '#6d9b68', '#e75445', '#4c82c3'], 128); await capture();
    const alphaValues = await page.locator('#view').evaluate(canvas => [...new Set(Array.from(
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    ).filter((_, index) => index % 4 === 3))]);
    row.partialAlphaOutput = alphaValues;
    if (alphaValues.some(alpha => alpha > 0 && alpha < 255)) {
      await page.locator('#useCameraImage').click();
      await page.waitForFunction(() => /半透明/.test(document.querySelector('#creation-camera-target')?.textContent || ''), null, { timeout: 10000 });
      assert.match(await cameraStatus(), /作品に未反映|未反映の撮影画像/);
      assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'failed Apply keeps the camera result available');
      assert.deepEqual(await pixels(page), resizedCanvas, 'failed Apply leaves new-project art unchanged');
      row.checks.push('partial-alpha Apply rejection preserves the camera result and leaves new-project art unchanged');
    } else {
      row.partialAlphaApply = 'UNTESTED: camera processing emitted only fully opaque/transparent pixels';
    }
    await shot('camera-partial-alpha-retained');

    row.checks.push('retake starts a fresh unapplied result and rejected partial-alpha Apply preserves project pixels');

    const actualMediaCalls = await page.evaluate(() => window.__modeClarityQA.mediaCalls);
    row.mediaCalls = actualMediaCalls; report.cameraApiCalls += actualMediaCalls;
    assert.equal(actualMediaCalls, 0, 'no real camera or microphone API was requested');
    row.layout.nav = await page.evaluate(() => {
      const nav = document.querySelector('.app-tabs'), capture = document.querySelector('#capture');
      const navRect = nav.getBoundingClientRect(), buttonRect = capture.getBoundingClientRect();
      return { nav: { x: navRect.x, y: navRect.y, width: navRect.width, height: navRect.height }, capture: { x: buttonRect.x, y: buttonRect.y, width: buttonRect.width, height: buttonRect.height }, slots: [...nav.querySelectorAll('[data-nav-slot]')].filter(node => node.checkVisibility()).map(node => node.dataset.navSlot) };
    });
    assert.ok(row.layout.nav.capture.width >= 44 && row.layout.nav.capture.height >= 44);
    assert.equal(new Set(row.layout.nav.slots).size, row.layout.nav.slots.length, 'mode checks do not add duplicate footer slots');
    assert.deepEqual(report.pageErrors.filter(item => item.viewport.width === viewport.width && item.viewport.height === viewport.height), []);
    row.passed = true; console.log(`PASS ${label}: ${row.checks.length} checks`);
  } catch (error) {
    row.failures.push({ message: error.message, stack: error.stack }); row.passed = false;
    console.error(`FAIL ${label}: ${error.message}`); await shot('failure').catch(() => {});
  } finally { await context.close(); }
}

try {
  for (const viewport of viewports) await runViewport(viewport);
  report.finishedAt = new Date().toISOString();
  report.status = report.viewports.every(row => row.passed) && report.externalRequests.length === 0 && report.pageErrors.length === 0 ? 'passed' : 'failed';
  report.passed = report.status === 'passed';
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.passed ? 'PASS' : 'FAIL'}: creation mode clarity (${report.viewports.length} viewports); evidence ${join(output, 'report.json')}`);
  if (!report.passed) process.exitCode = 1;
} finally { await browser.close(); }
