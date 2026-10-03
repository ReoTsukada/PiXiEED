#!/usr/bin/env node
/** Browser checks for pixel PNG scale metadata and import/export round trips. */
import assert from 'node:assert/strict';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readPixelPngMetadata } from '../js/pixel-png-metadata.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Harness only accepts a localhost server');
const engine = process.env.PIXIEED_PIXEL_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine), 'PIXIEED_PIXEL_ENGINE must be chromium or webkit');
const defaultModule = engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwrightModule = process.env.PIXIEED_PLAYWRIGHT_MODULE || defaultModule;
const playwright = await import(playwrightModule.startsWith('/') ? pathToFileURL(playwrightModule).href : playwrightModule);
const webkitExecutable = process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh';
const browser = await playwright[engine].launch({
  headless: true,
  ...(engine === 'webkit' ? { executablePath: webkitExecutable } : {})
});
const failures = [];
let checks = 0;
function pass(name) { checks += 1; console.log(`PASS ${engine} ${name}`); }

try {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, acceptDownloads: true });
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    if (!['GET', 'HEAD'].includes(request.method())) failures.push(`Blocked external write: ${request.method()} ${url.origin}`);
    return route.abort();
  });
  context.on('page', (page) => page.on('pageerror', (error) => failures.push(`Page error: ${error.message}`)));
  const page = await context.newPage();
  await page.route('**/__pixel_roundtrip_harness__', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Pixel roundtrip harness</title>'
  }));
  await page.goto(`${origin}/__pixel_roundtrip_harness__`, { waitUntil: 'domcontentloaded' });

  const results = await page.evaluate(async () => {
    const metadata = await import('/js/pixel-png-metadata.mjs?pixel-roundtrip=1');
    const { normalizePixelFile } = await import('/js/pixel-scale.mjs?pixel-roundtrip=1');
    const { enlargedPng } = await import('/js/pixel-export.mjs?pixel-roundtrip=1');
    const { decodeDrawImageFile } = await import('/js/creation/draw-import.mjs?pixel-roundtrip=1');
    const { inspectPixelImage } = await import('/js/globe/post-image.mjs?pixel-roundtrip=1');
    const { encodeCameraPng } = await import('/js/pixel-studio/png-export.mjs?pixel-roundtrip=1');
    const { createAudioSong, resizeAudioCanvas } = await import('/js/creation/audio-core.mjs?pixel-roundtrip=1');
    const { exportAudioImage } = await import('/js/creation/audio-export.mjs?pixel-roundtrip=1');
    const { normalizeJigsawFile } = await import('/js/creation/jigsaw-file.mjs?pixel-roundtrip=1');

    const pixelBytes = (width, height, colorAt) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        data.set(colorAt(x, y), (y * width + x) * 4);
      }
      return data;
    };
    const makeFile = async (width, height, data, name = 'fixture.png') => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Canvas PNG encode failed')), 'image/png'));
      return new File([blob], name, { type: 'image/png' });
    };
    const readFilePixels = async (file) => {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
      } finally { bitmap.close?.(); }
    };
    const inflatePng = async (blob, bytesToAdd = 520 * 1024) => {
      const input = new Uint8Array(await blob.arrayBuffer());
      const type = new TextEncoder().encode('tEXt');
      const text = new Uint8Array(bytesToAdd); text[0] = 112; text[1] = 97; text[2] = 100; text[3] = 0;
      const crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c >>> 0; }
      let crc = 0xffffffff;
      for (const value of [...type, ...text]) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const chunk = new Uint8Array(12 + text.length); const view = new DataView(chunk.buffer);
      view.setUint32(0, text.length); chunk.set(type, 4); chunk.set(text, 8); view.setUint32(8 + text.length, crc);
      const iend = input.length - 12; const output = new Uint8Array(input.length + chunk.length);
      output.set(input.subarray(0, iend)); output.set(chunk, iend); output.set(input.subarray(iend), iend + chunk.length);
      return new File([output], 'over-512kb.png', { type: 'image/png' });
    };
    const distinctRgba = (data) => {
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
      return colors.size;
    };
    const exact = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    const outcomes = [];
    const jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = 96; jpegCanvas.height = 64;
    jpegCanvas.getContext('2d').putImageData(new ImageData(pixelBytes(96, 64, (x, y) => [x * 2, y * 3, (x + y) & 255, 255]), 96, 64), 0, 0);
    const jpegBlob = await new Promise((resolve) => jpegCanvas.toBlob(resolve, 'image/jpeg', 0.92));
    const jpegFile = new File([jpegBlob], 'scene.jpg', { type: 'image/jpeg' });
    const jpegOriginal = await readFilePixels(jpegFile);
    const jpegResult = await normalizePixelFile(jpegFile);
    const jigsawJpeg = await normalizeJigsawFile(jpegFile);
    outcomes.push(['JPEG-photo-import-keeps-dimensions-and-decoded-pixels', jpegResult.width === 96 && jpegResult.height === 64 && exact(jpegResult.data, jpegOriginal.data) && jigsawJpeg.width === 96 && jigsawJpeg.height === 64 && exact(jigsawJpeg.data, jpegOriginal.data)]);
    const flat = pixelBytes(16, 16, () => [33, 120, 201, 255]);
    const flatExport = await enlargedPng({ width: 16, height: 16, data: flat });
    const flatResult = await normalizePixelFile(new File([flatExport.blob], 'flat-enlarged.png', { type: 'image/png' }));
    const flatRepeat = await normalizePixelFile(flatResult.file);
    outcomes.push(['flat-16-export-and-repeat-import-remain-16', flatResult.width === 16 && flatResult.height === 16 && exact(flatResult.data, flat) && flatRepeat.width === 16 && flatRepeat.height === 16 && exact(flatRepeat.data, flat)]);

    const repeats = pixelBytes(16, 16, (x, y) => {
      const v = ((x >> 1) + (y >> 1)) % 4;
      return [[240, 20, 40, 255], [20, 220, 70, 255], [30, 80, 240, 255], [250, 220, 30, 255]][v];
    });
    const repeatsExport = await enlargedPng({ width: 16, height: 16, data: repeats });
    const repeatsResult = await normalizePixelFile(new File([repeatsExport.blob], 'repeat-enlarged.png', { type: 'image/png' }));
    const repeatsAgain = await normalizePixelFile(repeatsResult.file);
    outcomes.push(['logical-2px-repeat-export-and-repeat-import-remain-16', repeatsResult.width === 16 && repeatsResult.height === 16 && exact(repeatsResult.data, repeats) && repeatsAgain.width === 16 && repeatsAgain.height === 16 && exact(repeatsAgain.data, repeats)]);

    const transparent = pixelBytes(16, 16, (x, y) => (x + y) % 3 === 0 ? [0, 0, 0, 0] : [x * 13, y * 11, (x * 7 + y * 3) & 255, 255]);
    const transparentExport = await enlargedPng({ width: 16, height: 16, data: transparent });
    const transparentFile = new File([transparentExport.blob], 'transparent-enlarged.png', { type: 'image/png' });
    const transparentDecoded = await readFilePixels(await makeFile(16, 16, transparent));
    const transparentResult = await normalizePixelFile(transparentFile);
    const transparentMatches = exact(transparentResult.data, transparentDecoded.data);
    const alphaZeros = Array.from({ length: transparentDecoded.data.length / 4 }, (_, index) => transparentDecoded.data[index * 4 + 3]).filter((alpha) => alpha === 0).length;
    outcomes.push(['transparent-rgba-preserved', alphaZeros > 0 && transparentResult.width === 16 && transparentResult.height === 16 && transparentMatches, { alphaZeros, resultSize: [transparentResult.width, transparentResult.height], sourceSize: [transparentDecoded.width, transparentDecoded.height], firstResult: [...transparentResult.data.slice(0, 16)], firstSource: [...transparentDecoded.data.slice(0, 16)] }]);

    for (const size of [64, 128, 512]) {
      const data = pixelBytes(size, size, (x, y) => {
        const color = ((x >> 2) * 3 + (y >> 2) * 7) % 5;
        return [[18, 28, 38, 255], [72, 124, 39, 255], [220, 73, 44, 255], [33, 81, 204, 255], [234, 198, 36, 255]][color];
      });
      const exported = await enlargedPng({ width: size, height: size, data });
      const file = new File([exported.blob], `enlarged-${size}.png`, { type: 'image/png' });
      const result = await normalizePixelFile(file);
      const decoded = size === 512 ? await decodeDrawImageFile(file) : null;
      outcomes.push([`enlarged-${size}-edge-kept`, exported.width === 2048 && exported.height === 2048 && result.width === size && result.height === size && exact(result.data, data) && (!decoded || decoded.width === size && decoded.height === size && exact(decoded.data, data))]);
    }

    const rectData = pixelBytes(48, 16, (x, y) => {
      const n = (x * 3 + y * 5) % 7;
      return n === 0 ? [0, 0, 0, 0] : [n * 31, 255 - n * 19, (n * 43) % 256, 255];
    });
    const rectExport = await enlargedPng({ width: 48, height: 16, data: rectData });
    const rectMetadata = await metadata.readPixelPngMetadata(new Uint8Array(await rectExport.blob.arrayBuffer()));
    const rectNormalized = await normalizePixelFile(new File([rectExport.blob], 'rect-enlarged.png', { type: 'image/png' }));
    outcomes.push(['rect-2016x672-metadata-roundtrip', rectExport.width === 2016 && rectExport.height === 672 && rectMetadata?.width === 48 && rectMetadata?.height === 16 && rectMetadata?.scale === 42 && rectNormalized.width === 48 && rectNormalized.height === 16 && exact(rectNormalized.data, rectData)]);

    const drawDecoded = await decodeDrawImageFile(new File([rectExport.blob], 'draw-enlarged.png', { type: 'image/png' }));
    const postInspection = await inspectPixelImage(new File([rectExport.blob], 'post-enlarged.png', { type: 'image/png' }));
    outcomes.push(['draw-and-post-see-logical-rect', drawDecoded.width === 48 && drawDecoded.height === 16 && exact(drawDecoded.data, rectData) && postInspection.width === 48 && postInspection.height === 16 && postInspection.colorCount === distinctRgba(rectData)]);

    const largeLogical = pixelBytes(256, 256, (x, y) => {
      const n = (Math.imul(x + 17, 0x45d9f3b) ^ Math.imul(y + 29, 0x119de1f3)) >>> 0;
      const slot = n & 127; return [slot, (slot * 73) & 255, (slot * 151) & 255, 255];
    });
    const largeExport = await enlargedPng({ width: 256, height: 256, data: largeLogical });
    const inflated = await inflatePng(largeExport.blob);
    const largePost = await inspectPixelImage(inflated);
    outcomes.push(['over-512kb-post-normalizes-before-limits', inflated.size > 512 * 1024 && largePost.width === 256 && largePost.height === 256 && largePost.colorCount <= 128 && largePost.size <= 512 * 1024]);

    const unmarkedLogical = pixelBytes(32, 16, (x, y) => {
      const n = (x * 7 + y * 11) % 5; return [n * 41, 240 - n * 29, n * 13, 255];
    });
    const unmarkedCanvas = document.createElement('canvas'); unmarkedCanvas.width = 128; unmarkedCanvas.height = 64;
    const unmarkedSmall = document.createElement('canvas'); unmarkedSmall.width = 32; unmarkedSmall.height = 16;
    unmarkedSmall.getContext('2d').putImageData(new ImageData(unmarkedLogical, 32, 16), 0, 0);
    const unmarkedContext = unmarkedCanvas.getContext('2d'); unmarkedContext.imageSmoothingEnabled = false; unmarkedContext.drawImage(unmarkedSmall, 0, 0, 128, 64);
    const unmarkedBlob = await new Promise((resolve) => unmarkedCanvas.toBlob(resolve, 'image/png'));
    const unmarkedResult = await normalizePixelFile(new File([unmarkedBlob], 'unmarked-x4.png', { type: 'image/png' }));
    outcomes.push(['unmarked-integer-enlargement-normalizes', unmarkedResult.width === 32 && unmarkedResult.height === 16 && exact(unmarkedResult.data, unmarkedLogical)]);

    const gradient = pixelBytes(16, 16, (x, y) => [x * 13, y * 13, (x * 7 + y * 11) & 255, 255]);
    const gradientResult = await normalizePixelFile(await makeFile(16, 16, gradient, 'unmarked-gradient.png'));
    outcomes.push(['unmarked-gradient-keeps-all-pixels', gradientResult.width === 16 && gradientResult.height === 16 && exact(gradientResult.data, gradient)]);

    const claimedBase = pixelBytes(16, 16, (x, y) => [(x * 23 + y * 9) & 255, (x * 3 + y * 37) & 255, (x * 19 + y * 5) & 255, 255]);
    const claimedPng = await makeFile(16, 16, claimedBase);
    const falseClaim = await metadata.withPixelPngMetadata(claimedPng, { width: 8, height: 8, scale: 2 });
    const falseClaimResult = await normalizePixelFile(new File([falseClaim], 'false-metadata.png', { type: 'image/png' }));
    outcomes.push(['false-metadata-cannot-drop-nonuniform-pixels', falseClaimResult.width === 16 && falseClaimResult.height === 16 && exact(falseClaimResult.data, claimedBase)]);

    const cameraFrame = { width: 16, height: 16, data: pixelBytes(16, 16, (x, y) => [x * 13, y * 13, (x + y) * 7, 255]) };
    const cameraExport = await encodeCameraPng(cameraFrame);
    const cameraInfo = await metadata.readPixelPngMetadata(new Uint8Array(await cameraExport.blob.arrayBuffer()));
    const cameraResult = await normalizePixelFile(new File([cameraExport.blob], 'camera.png', { type: 'image/png' }));
    outcomes.push(['camera-export-metadata-fidelity', cameraInfo?.width === 16 && cameraInfo?.height === 16 && cameraInfo?.scale === 128 && cameraResult.width === 16 && cameraResult.height === 16 && exact(cameraResult.data, cameraFrame.data)]);

    const song = resizeAudioCanvas(createAudioSong({ songId: 'pixel-roundtrip-browser' }), 64);
    const audioPixels = pixelBytes(64, 16, (x, y) => [x * 3 & 255, y * 15, (x + y * 4) & 255, 255]);
    const audioExport = await exportAudioImage(song, { image: { width: 64, height: 16, rgba: audioPixels } });
    const audioInfo = await metadata.readPixelPngMetadata(new Uint8Array(await audioExport.blob.arrayBuffer()));
    const audioResult = await normalizePixelFile(new File([audioExport.blob], 'audio.png', { type: 'image/png' }));
    outcomes.push(['audio-64x16-export-keeps-64-columns', audioInfo?.width === 64 && audioInfo?.height === 16 && audioResult.width === 64 && audioResult.height === 16 && exact(audioResult.data, audioPixels)]);

    const oversizedHeader = new Uint8Array(24);
    oversizedHeader.set([137, 80, 78, 71, 13, 10, 26, 10]); oversizedHeader.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    new DataView(oversizedHeader.buffer).setUint32(16, 50000); new DataView(oversizedHeader.buffer).setUint32(20, 50000);
    let decoderCalls = 0; let rejectedBeforeDecode = false;
    try {
      await normalizePixelFile(new File([oversizedHeader], 'oversized-header.png', { type: 'image/png' }), {
        createImageBitmapImpl: async () => { decoderCalls += 1; throw new Error('decoder must not run'); }
      });
    } catch { rejectedBeforeDecode = decoderCalls === 0; }
    outcomes.push(['oversized-header-rejected-before-decoder', rejectedBeforeDecode]);

    const jigsawPixels = pixelBytes(64, 64, (x, y) => {
      const color = ((x >> 2) * 3 + (y >> 2) * 5) % 4;
      return [[22, 46, 90, 255], [180, 54, 39, 255], [37, 153, 94, 255], [232, 202, 69, 255]][color];
    });
    const jigsawExport = await enlargedPng({ width: 64, height: 64, data: jigsawPixels });
    const blobBase64 = async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return btoa(binary);
    };
    return { outcomes, drawPngBase64: await blobBase64(flatExport.blob), jigsawPngBase64: await blobBase64(jigsawExport.blob), jigsawPixels: [...jigsawPixels] };
  });

  for (const [name, passed, details] of results.outcomes) {
    if (!passed && details) console.error(`${engine} ${name}: ${JSON.stringify(details)}`);
    assert.equal(passed, true, name);
    pass(name);
  }

  const drawPage = page;
  await drawPage.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
  await drawPage.locator('#draw-size').selectOption('16');
  await drawPage.locator('#draw-import-file').setInputFiles({ name: 'flat-enlarged.png', mimeType: 'image/png', buffer: Buffer.from(results.drawPngBase64, 'base64') });
  await drawPage.waitForFunction(() => document.querySelector('#draw-status')?.textContent.includes('16×16'));
  assert.deepEqual(await drawPage.locator('#draw-canvas').evaluate((node) => [node.width, node.height]), [16, 16]);
  await drawPage.locator('#draw-save').click();
  await drawPage.waitForFunction(() => document.querySelector('#draw-status')?.textContent.includes('保存しました'));
  const [drawDownload] = await Promise.all([drawPage.waitForEvent('download'), drawPage.locator('#draw-export').click()]);
  const drawBytes = new Uint8Array(await readFile(await drawDownload.path()));
  const drawMetadata = readPixelPngMetadata(drawBytes);
  assert.deepEqual({ width: drawMetadata?.width, height: drawMetadata?.height, scale: drawMetadata?.scale }, { width: 16, height: 16, scale: 128 });
  assert.match(drawDownload.suggestedFilename(), /16x16@2048x2048\.png$/);
  const drawViewport = await drawPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, status: document.querySelector('#draw-status')?.textContent || '' }));
  assert.ok(drawViewport.scrollWidth <= drawViewport.width, `Draw horizontal overflow at ${drawViewport.width}px`);
  pass('Draw UI imports and saves a flat 16px enlarged PNG, then exports metadata-backed 2048px PNG at 320x568');

  const jigsawPage = await context.newPage();
  await jigsawPage.goto(`${origin}/jigsaw/`, { waitUntil: 'domcontentloaded' });
  await jigsawPage.locator('#jigsaw-source-kind').selectOption('file');
  await jigsawPage.locator('#jigsaw-file').setInputFiles({ name: 'jigsaw-64x64.png', mimeType: 'image/png', buffer: Buffer.from(results.jigsawPngBase64, 'base64') });
  await jigsawPage.waitForFunction(() => document.querySelector('#jigsaw-start')?.disabled === false);
  await jigsawPage.locator('#jigsaw-start').click();
  await jigsawPage.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden || document.querySelector('#jigsaw-status')?.textContent.includes('作れませんでした'));
  const jigsawStartDebug = await jigsawPage.evaluate(() => ({ status: document.querySelector('#jigsaw-status')?.textContent, pieceSize: document.querySelector('#jigsaw-grid-size')?.value, sourceKind: document.querySelector('#jigsaw-source-kind')?.value, file: document.querySelector('#jigsaw-file')?.files?.[0]?.name }));
  assert.equal(await jigsawPage.locator('#jigsaw-play').isVisible(), true, `Jigsaw did not start: ${JSON.stringify(jigsawStartDebug)}`);
  await jigsawPage.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('作成しました'));
  assert.match(await jigsawPage.locator('#jigsaw-source-label').textContent(), /64×64px/);
  await jigsawPage.locator('#jigsaw-save').click();
  await jigsawPage.waitForFunction(() => document.querySelector('#jigsaw-status')?.textContent.includes('配置を端末に保存しました'));
  const pxdTools = jigsawPage.locator('#pxd-tools');
  if (!(await pxdTools.evaluate((node) => node.open))) await pxdTools.locator(':scope > summary').click();
  const oldPointer = await jigsawPage.evaluate(() => localStorage.getItem('pixieed:pxd:last:jigsaw'));
  await saveCurrentProject(jigsawPage);
  await jigsawPage.waitForFunction((oldPointer) => {
    const current = localStorage.getItem('pixieed:pxd:last:jigsaw');
    return current && current !== oldPointer && !document.querySelector('#pxd-save').disabled;
  }, oldPointer);
  const jigsawPxd = await jigsawPage.evaluate(async () => {
    const pointer = JSON.parse(localStorage.getItem('pixieed:pxd:last:jigsaw'));
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
    const { readPxdPuzzle } = await import('/js/creation/pxd-puzzles.mjs');
    const { getPxdJson } = await import('/js/creation/pxd-codec.mjs');
    const project = await createPxdStore().load(pointer.projectId, pointer.revisionId);
    const image = await readPxdImage(project, 'jigsaw-main');
    const component = await readPxdPuzzle(project, 'jigsaw');
    return {
      projectId: pointer.projectId,
      hasPuzzle: Boolean(getPxdJson(project, 'puzzles/jigsaw.json')),
      imageWidth: image?.width,
      imageHeight: image?.height,
      imagePixels: [...(image?.rgba || [])],
      puzzleWidth: component.document.layout.width,
      puzzleHeight: component.document.layout.height,
      sourceType: component.document.source.type,
      sourceWidth: component.document.source.width,
      sourceHeight: component.document.source.height,
      portableSourceWidth: component.portableOriginalRefs.source.width,
      portableSourceHeight: component.portableOriginalRefs.source.height
    };
  });
  assert.ok(jigsawPxd.projectId && jigsawPxd.hasPuzzle);
  assert.deepEqual([jigsawPxd.imageWidth, jigsawPxd.imageHeight, jigsawPxd.puzzleWidth, jigsawPxd.puzzleHeight, jigsawPxd.sourceWidth, jigsawPxd.sourceHeight], [64, 64, 64, 64, 64, 64]);
  assert.equal(jigsawPxd.sourceType, 'file');
  assert.deepEqual(jigsawPxd.imagePixels, results.jigsawPixels);
  assert.deepEqual([jigsawPxd.portableSourceWidth, jigsawPxd.portableSourceHeight], [64, 64]);
  const jigsawViewport = await jigsawPage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, status: document.querySelector('#jigsaw-status')?.textContent || '' }));
  assert.ok(jigsawViewport.scrollWidth <= jigsawViewport.width, `Jigsaw horizontal overflow at ${jigsawViewport.width}px`);
  pass('Jigsaw UI normalizes an enlarged local PNG, assembles 64x64, and saves exact pixels plus dimensions to PXD at 320x568');

  assert.deepEqual(failures, [], 'External requests or browser errors');
  await context.close();
  console.log(`BROWSER: PASS (${engine}, ${checks} pixel PNG round-trip checks; isolated localhost, production and device behavior untested)`);
} finally {
  await browser.close();
}
