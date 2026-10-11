/**
 * Local camera/shared-palette QA. It uses uploaded synthetic PNGs only; no real
 * camera permission is requested and every non-local request is aborted.
 * The report distinguishes browser observations from cases that this UI cannot
 * synthesize (notably GIF handoff and half-alpha engine output).
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
const out = process.env.PIXIEED_CAMERA_PALETTE_OUTPUT || '/tmp/pixieed-camera-palette';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only localhost QA is allowed');
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL('/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true });
const reports = [];
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }]
  .filter(v => !process.env.PIXIEED_TEST_WIDTH || v.width === Number(process.env.PIXIEED_TEST_WIDTH));

const stablePalette = values => values.map(value => value.trim().toLowerCase()).filter(Boolean);
const rgbaColors = image => {
  const colors = [], seen = new Set();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 255) continue;
    const color = `#${image.data.slice(i, i + 3).map(n => n.toString(16).padStart(2, '0')).join('')}`;
    if (!seen.has(color)) { seen.add(color); colors.push(color); }
  }
  return colors;
};

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, hasTouch: true, acceptDownloads: true });
  const origin = new URL(base).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    window.__cameraQA = { permissionRequests: 0 };
    try {
      localStorage.setItem('pixieed:camera-palettes:v1', JSON.stringify([
        { id: 'qa-old', name: 'QA 保存パレット', colors: [[17, 31, 47], [89, 107, 131], [173, 191, 211]] }
      ]));
    } catch {}
    const media = navigator.mediaDevices;
    if (media) Object.defineProperty(media, 'getUserMedia', { configurable: true, value: async () => {
      window.__cameraQA.permissionRequests += 1;
      throw new Error('QA harness blocks camera permission requests');
    } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], checks = [], untested = { gifStillImageApply: 'UNTESTED', partialAlphaGuard: 'UNTESTED' };
  page.on('pageerror', error => errors.push(error.message));
  const ready = mode => page.waitForFunction(expected => document.documentElement.dataset.creationModesReady === 'true'
    && document.body.dataset.creationMode === expected
    && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'), mode);
  const switchMode = async mode => {
    if (await page.evaluate(() => document.body.dataset.creationMode) === mode) { await ready(mode); return; }
    if (await page.locator('#creation-mode-menu').count()) {
      await page.locator('#creation-mode-menu').evaluate(node => { node.open = true; });
      const target = page.locator(`button[data-creation-mode="${mode}"]`).first();
      if (await target.count()) await target.click();
    }
    await ready(mode);
  };
  const getPixels = selector => page.locator(selector).evaluate(canvas => {
    const { width, height } = canvas;
    return { width, height, data: Array.from(canvas.getContext('2d').getImageData(0, 0, width, height).data) };
  });
  const getPalette = async () => {
    if (await page.locator('#creation-project-settings-panel').isHidden().catch(() => true)) {
      await page.locator('#creation-project-settings-open').click();
    }
    const colors = stablePalette((await page.locator('#creation-project-palette').inputValue()).split('\n'));
    await page.locator('#creation-project-settings-panel button[aria-label="設定を閉じる"]').click();
    return colors;
  };
  const setPalette = async colors => {
    await page.locator('#creation-project-settings-open').click();
    await page.locator('#creation-project-palette').fill(colors.join('\n'));
    await page.locator('[data-project-action="preview"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-project-action="apply"]')?.disabled);
    await page.locator('[data-project-action="apply"]').click();
    await page.locator('#creation-project-settings-panel button[aria-label="設定を閉じる"]').click();
  };
  const syntheticPng = async ({ alpha = 255, variant = 0 } = {}) => page.evaluate(({ alpha, variant }) => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const colors = variant ? ['#ff00d4', '#00d9a6', '#f3c900', '#4825ee'] : ['#e74b35', '#168a56', '#367ee8', '#e6c341'];
    colors.forEach((color, i) => {
      ctx.fillStyle = color; ctx.globalAlpha = i === 0 ? alpha / 255 : 1;
      ctx.fillRect((i % 2) * 8, Math.floor(i / 2) * 8, 8, 8);
    });
    ctx.globalAlpha = 1;
    return canvas.toDataURL('image/png').split(',')[1];
  }, { alpha, variant });
  const loadCameraFixture = async options => {
    const png = await syntheticPng(options);
    await page.locator('#cameraImageInput').setInputFiles({ name: 'synthetic-palette.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && !document.querySelector('#capture')?.disabled);
  };
  const openCameraLooks = async () => {
    if (!await page.locator('#toolbarHome [data-tool="look"]').isVisible().catch(() => false)) {
      const back = page.locator('#toolbarContextBack');
      if (await back.isVisible().catch(() => false)) await back.click();
    }
    await page.locator('#toolbarHome [data-tool="look"]').click();
    await page.locator('#cameraPaletteFixed').waitFor({ state: 'visible' });
  };
  const chooseLook = async look => {
    await openCameraLooks();
    const choice = page.locator(`#looks [data-look="${look}"]`);
    if (await choice.isHidden().catch(() => true)) {
      const more = page.locator('#toolbarContextMore');
      if (await more.isVisible()) await more.click();
    }
    await choice.waitFor({ state: 'visible' });
    await choice.click();
    await page.waitForTimeout(250); // look changes restart the imported-image preview loop
    const back = page.locator('#toolbarContextBack');
    if (await back.isVisible().catch(() => false)) await back.click();
  };
  const retakeImportedImage = async () => {
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && !document.querySelector('#capture')?.disabled);
  };
  const ensureCameraPreview = async () => {
    if (await page.locator('#pixelStudio').getAttribute('data-mode').catch(() => null) === 'captured') {
      await retakeImportedImage();
    }
  };
  const capture = async () => {
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
      && !document.querySelector('#useCameraImage')?.disabled);
  };
  const applyImage = async () => {
    await page.locator('#useCameraImage').click();
    await page.waitForFunction(() => ['draw', 'audio'].includes(document.body.dataset.creationMode)
      && !document.querySelector('#creation-mode-menu')?.hasAttribute('aria-busy'));
  };
  const settingsError = async () => page.evaluate(() => [
    '#creation-camera-target', '#cameraImageStatus', '#stageMsg', '#info', '#draw-status', '.lc-toast', '[role="alert"]'
  ].map(selector => document.querySelector(selector)?.textContent?.trim() || '').filter(Boolean).join(' | '));

  try {
    await page.goto(`${base}/draw/`);
    await ready('draw');
    let palette = await getPalette();
    assert.ok(palette.length > 0 && palette.length <= 32, 'initial palette must be valid');
    if (palette.length > 28) {
      await setPalette(palette.slice(0, 4));
      palette = await getPalette();
      assert.ok(palette.length <= 28, 'test starts with room for camera colors');
    }
    const originalPalette = [...palette];
    const originalPixels = await getPixels('#draw-canvas');
    await switchMode('camera');
    assert.equal(await page.locator('#cameraPaletteFixed').count(), 1, 'integrated fixed-palette control is mounted');
    assert.equal(await page.locator('#cameraPaletteFixed').isChecked(), false, 'camera defaults to its own look');
    await loadCameraFixture({ variant: 0 }); // idle intentionally hides the original camera toolbar
    const capturedLooks = [];
    for (const look of ['gb', 'mono', 'gray', 'photo', 'c8', 'c16', 'my-qa-old']) {
      await chooseLook(look);
      await capture();
      const frame = await getPixels('#view');
      assert.ok(rgbaColors(frame).length > 0, `${look} produces a capturable image`);
      assert.deepEqual(await getPixels('#draw-canvas'), originalPixels, `${look} shutter leaves Draw unchanged`);
      assert.deepEqual(await getPalette(), originalPalette, `${look} preview/capture leaves palette unchanged`);
      capturedLooks.push(look);
      await retakeImportedImage();
    }
    assert.deepEqual(capturedLooks, ['gb', 'mono', 'gray', 'photo', 'c8', 'c16', 'my-qa-old']);
    checks.push('all six standard looks and seeded saved look captured with fixed palette OFF');
    await openCameraLooks();
    await page.locator('#cameraPaletteFixed').check();
    await page.waitForFunction(() => !document.querySelector('#capture').disabled);
    await page.screenshot({ path: `${out}/${viewport.width}-live-camera-colors.png` });
    await page.locator('#toolbarContextBack').click();
    await capture();
    const initialFixedFrame = await getPixels('#view');
    assert.ok(rgbaColors(initialFixedFrame).every(color => originalPalette.includes(color)), 'fixed preview uses current shared palette');
    assert.deepEqual(await getPalette(), originalPalette, 'fixed capture does not edit shared palette');
    await page.screenshot({ path: `${out}/${viewport.width}-captured.png` });
    checks.push('fixed palette ON capture uses only current shared colors');

    /* Keep the selected fixed frame as the first applied image, then verify
       shared-project history before exercising fixed OFF below. */
    const captured = initialFixedFrame;
    assert.deepEqual(await getPixels('#draw-canvas'), originalPixels, 'shutter does not apply to Draw');
    assert.deepEqual(await getPalette(), originalPalette, 'capture does not mutate shared palette');
    const outputColors = rgbaColors(captured);
    assert.ok(outputColors.length > 0, 'camera output contains opaque colors');
    checks.push('preview/capture leave shared artwork and palette unchanged');

    // Fixed ON: captured colors must be drawn from the existing palette and add none.
    const fixedPixels = captured;
    const fixedColors = outputColors;
    assert.ok(fixedColors.every(color => originalPalette.includes(color)), 'fixed output uses existing shared palette colors only');
    assert.deepEqual(await getPalette(), originalPalette);
    await applyImage();
    const fixedApplied = await getPixels('#draw-canvas');
    const fixedPaletteAfter = await getPalette();
    assert.deepEqual(fixedPaletteAfter, originalPalette, 'fixed mode never appends colors');
    await page.locator('#draw-undo').click();
    assert.deepEqual(await getPixels('#draw-canvas'), originalPixels, 'fixed apply undo restores pixels');
    assert.deepEqual(await getPalette(), originalPalette, 'fixed apply undo preserves palette');
    await page.locator('#draw-redo').click();
    assert.deepEqual(await getPixels('#draw-canvas'), fixedApplied, 'fixed apply redo restores pixels');
    assert.deepEqual(await getPalette(), originalPalette, 'fixed apply redo preserves palette');
    checks.push('fixed palette capture/apply, atomic Undo/Redo');

    // Unfixed image import: appended colors follow first-occurrence order, with no duplicates.
    await switchMode('camera');
    await retakeImportedImage(); // captured result keeps its imported source across mode exits
    await openCameraLooks();
    await page.locator('#cameraPaletteFixed').uncheck();
    await loadCameraFixture({ variant: 1 }); await capture();
    const unfixedFrame = await getPixels('#view');
    const expectedOutputColors = rgbaColors(unfixedFrame);
    await applyImage();
    const afterApply = await getPixels('#draw-canvas');
    palette = await getPalette();
    assert.deepEqual(palette.slice(0, originalPalette.length), originalPalette, 'original palette is stable prefix');
    const added = palette.slice(originalPalette.length);
    const newlyObserved = expectedOutputColors.filter(color => !originalPalette.includes(color));
    assert.deepEqual(added, newlyObserved, 'new colors append in output first-occurrence order');
    assert.equal(new Set(palette).size, palette.length, 'appended colors are deduplicated');
    assert.ok(palette.length <= 32, 'palette limit is respected');
    assert.notDeepEqual(afterApply.data, originalPixels.data, 'camera application changes shared pixels');
    await switchMode('audio');
    for (const color of added) {
      const index = palette.indexOf(color);
      const swatch = page.locator(`#draw-palette .draw-color[data-color-index="${index}"]`);
      assert.equal(await swatch.count(), 1, `Music palette exposes camera-added color ${color}`);
      assert.equal(await swatch.getAttribute('data-music-assigned'), 'false', `${color} starts unassigned in Music`);
    }
    await page.locator('#draw-undo').click();
    assert.deepEqual(await getPixels('#draw-canvas'), fixedApplied, 'unfixed apply undo restores the preceding fixed capture');
    assert.deepEqual(await getPalette(), originalPalette, 'unfixed apply undo restores preceding palette atomically');
    await page.locator('#draw-redo').click();
    assert.deepEqual(await getPixels('#draw-canvas'), afterApply, 'unfixed apply redo restores pixels');
    assert.deepEqual(await getPalette(), palette, 'unfixed apply redo restores palette atomically');
    checks.push('unfixed append order/dedup, Music assignment default, atomic Undo/Redo');

    // Reapply a captured output with the same colors: no palette growth.
    await switchMode('camera'); await ensureCameraPreview();
    await loadCameraFixture({ variant: 1 }); await openCameraLooks();
    await page.locator('#cameraPaletteFixed').uncheck().catch(() => {}); await capture();
    const repeatColors = rgbaColors(await getPixels('#view'));
    await applyImage();
    const repeatPalette = await getPalette();
    assert.deepEqual(repeatPalette, palette, 'repeated capture of same colors adds no entries');
    checks.push('repeated same-color capture does not grow palette');

    // Seed legacy palette again before a fresh load, then verify PXD save/reopen.
    await switchMode('draw');
    const savedPixels = await getPixels('#draw-canvas'), savedPalette = await getPalette();
    await page.locator('#project-open').click();
    await page.locator('#project-tab-current').click();
    const more = page.locator('#pxd-panel .project-more');
    if (!await more.evaluate(node => node.open)) await more.locator(':scope > summary').click();
    await page.locator('#pxd-save').click();
    await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'saved'
      || document.querySelector('#pxd-file-status')?.textContent.includes('保存'));
    await page.locator('#project-close').click().catch(() => {});
    await page.reload(); await ready('draw');
    assert.deepEqual(await getPixels('#draw-canvas'), savedPixels, 'PXD reload retains pixels');
    assert.deepEqual(await getPalette(), savedPalette, 'PXD reload retains palette order');
    checks.push('PXD save/reload retains camera-applied drawing and palette');


    // Overflow must fail without changing the shared drawing or palette.
    const overflowPalette = Array.from({ length: 32 }, (_, i) => `#${(0x101010 + i * 0x050503).toString(16).padStart(6, '0')}`);
    await switchMode('draw'); await setPalette(overflowPalette);
    const overflowPixelsBefore = await getPixels('#draw-canvas');
    const overflowPaletteBefore = await getPalette();
    await switchMode('camera'); await ensureCameraPreview();
    await loadCameraFixture({ variant: 1 }); await capture();
    await page.locator('#useCameraImage').click();
    await page.waitForTimeout(250);
    assert.deepEqual(await getPixels('#draw-canvas'), overflowPixelsBefore, 'overflow refusal leaves pixels untouched');
    assert.deepEqual(await getPalette(), overflowPaletteBefore, 'overflow refusal leaves palette untouched');
    const overflowMessage = await settingsError();
    assert.match(overflowMessage, /32|色|上限|palette/i, 'overflow refusal shows a user-visible reason');
    assert.match(await page.locator('#creation-camera-target').innerText(), /32色.*撮り直して/, 'overflow explanation appears with the captured result');
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'failed apply keeps captured frame available');
    checks.push('32-color overflow refused atomically with visible explanation');

    // A transparent source may be composited to opaque by the existing camera pipeline.
    await switchMode('camera'); await ensureCameraPreview(); await loadCameraFixture({ alpha: 128, variant: 0 }); await capture();
    const alphaValues = await page.locator('#view').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return [...new Set(Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]))].sort((a, b) => a - b);
    });
    if (alphaValues.some(alpha => alpha > 0 && alpha < 255)) {
      untested.partialAlphaGuard = 'OUTPUT_CONTAINS_PARTIAL_ALPHA';
      const beforePixels = await getPixels('#draw-canvas'), beforePalette = await getPalette();
      await page.locator('#useCameraImage').click(); await page.waitForTimeout(200);
      assert.deepEqual(await getPixels('#draw-canvas'), beforePixels);
      assert.deepEqual(await getPalette(), beforePalette);
      assert.match(await settingsError(), /半透明|透明|alpha/i);
      assert.match(await page.locator('#creation-camera-target').innerText(), /半透明/, 'partial-alpha refusal appears with the captured result');
      untested.partialAlphaGuard = 'REFUSED_AT_APPLY';
    } else {
      untested.partialAlphaGuard = alphaValues.every(alpha => alpha === 255)
        ? 'INPUT_PARTIAL_ALPHA_RENDERED_OPAQUE'
        : `ENGINE_OUTPUT_ALPHA_${alphaValues.join(',')}`;
    }
    checks.push('half-alpha PNG input observed; engine output alpha recorded');
    assert.equal(await page.evaluate(() => window.__cameraQA.permissionRequests), 0, 'no real camera permission request');
    assert.deepEqual(errors, [], 'no uncaught page errors');
    await page.screenshot({ path: `${out}/${viewport.width}-camera-palette-final.png` });
    reports.push({ viewport, passed: true, checks, untested, outputColors, fixedColors, added, alphaValues, errors });
  } catch (error) {
    const failure = {
      viewport, passed: false, checks, untested, error: error.stack, errors,
      url: page.url(), permissionRequests: await page.evaluate(() => window.__cameraQA?.permissionRequests ?? null).catch(() => null),
      mode: await page.locator('body').getAttribute('data-creation-mode').catch(() => null),
      status: await settingsError().catch(() => null)
    };
    reports.push(failure);
    await page.screenshot({ path: `${out}/${viewport.width}-failure.png` }).catch(() => {});
  }
  await context.close();
}
await browser.close();
const report = { base, generatedAt: new Date().toISOString(), externalRequests: 'ABORTED', realCamera: 'UNTESTED / no permission requested', gifStillImageApply: 'UNTESTED', viewports: reports };
await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (reports.some(result => !result.passed)) process.exitCode = 1;
