#!/usr/bin/env node
/**
 * Local-only PXD browser acceptance harness. It uses an already running
 * localhost site, blocks every non-local request, and writes no repository
 * fixtures. Run with PIXIEED_PLAYWRIGHT_MODULE and PIXIEED_PXD_ENGINE.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdBytes, setPxdJson } from '../js/creation/pxd-codec.mjs';
import { imageToDrawDocument, putPxdImage, putPxdDrawDocument, readPxdImage } from '../js/creation/pxd-project.mjs';
import { createAudioSong, setAudioPixel } from '../js/creation/audio-core.mjs';
import { preparePxdAudioImageImport, writePxdAudioState } from '../js/creation/pxd-draw-audio.mjs';

const origin = process.env.PIXIEED_PXD_ORIGIN || 'http://127.0.0.1:4173';
const engineName = process.env.PIXIEED_PXD_ENGINE || 'chromium';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engineName === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(playwrightPath.startsWith('.') || playwrightPath.startsWith('/') ? pathToFileURL(playwrightPath).href : playwrightPath);
const browserType = playwright[engineName];
assert.ok(browserType, `Unknown browser engine: ${engineName}`);
const requested = (process.env.PIXIEED_PXD_CASES || 'store,draw,audio,audio-image,responsive,unknown').split(',').map((value) => value.trim()).filter(Boolean);
const knownCases = new Set(['store', 'draw', 'audio', 'audio-image', 'responsive', 'unknown']);
assert.ok(requested.length > 0, 'PIXIEED_PXD_CASES must select at least one test case');
for (const selected of requested) assert.ok(knownCases.has(selected), `Unknown PXD case: ${selected}`);
const checks = [];
function check(name, detail = '') { checks.push({ name, detail }); console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); }
function sameBytes(actual, expected, message) { assert.deepEqual([...actual], [...expected], message); }

async function makeFixture() {
  const projectId = `browser-pxd-${process.pid}-${Date.now()}`;
  let project = createPxdProject({ projectId, revisionId: 'browser-pxd-fixture-rev', manifest: { unknownManifest: { keep: ['opaque', 7] } } });
  project = setPxdJson(project, 'future/future.json', { unknownSchema: { nested: true }, rgba: [1, 2, 3, 0] });
  project = setPxdBytes(project, 'future/blob.bin', new Uint8Array([0, 255, 1, 128, 0, 19]));
  project.opaquePayloads = [{ bytes: new Uint8Array([0, 41, 0, 255, 77]) }];
  project = setPxdJson(project, 'puzzles/future.json', { mode: 'future-mode', version: 77, extra: { preserve: true } });
  const width = 32; const height = 16; const rgba = new Uint8Array(width * height * 4);
  const colors = [[0, 0, 0, 0], [226, 55, 65, 255], [34, 119, 91, 255], [36, 91, 211, 255], [227, 181, 29, 255], [141, 48, 181, 255], [21, 162, 199, 112]];
  // Rectangular source with 6 distinct colors, including transparent and partial alpha.
  for (let i = 0; i < width * height; i += 1) rgba.set(colors[i % colors.length], i * 4);
  // This source pixel is sampled for audio cell (15, 0); it is intentionally unmapped.
  rgba.set([9, 13, 17, 255], (31 * 4));
  const image = { width, height, rgba };
  project = await putPxdImage(project, image, 'main');
  project = await putPxdDrawDocument(project, imageToDrawDocument(image));
  let song = createAudioSong({ songId: 'browser-song' });
  song = setAudioPixel(song, { trackId: 'track-square', pitch: 84, startTick: 0, noteId: 'fixture-note' });
  project = await writePxdAudioState(project, song);
  // Explicit unknown descriptor fields must survive browser import and saves.
  project.entries = project.entries.map((entry) => entry.path === 'future/blob.bin' ? { ...entry, futureDescriptor: { keep: true } } : entry);
  return { bytes: await encodePxd(project), projectId, expectedImage: image };
}

function makeSourceImage() {
  const width = 32; const height = 16; const rgba = new Uint8Array(width * height * 4);
  const colors = [[0, 0, 0, 0], [226, 55, 65, 255], [34, 119, 91, 255], [36, 91, 211, 255], [227, 181, 29, 255], [141, 48, 181, 255], [21, 162, 199, 112]];
  for (let i = 0; i < width * height; i += 1) rgba.set(colors[i % colors.length], i * 4);
  return { width, height, rgba };
}

async function makeMainOnlyFixture() {
  const projectId = `browser-audio-pxd-${process.pid}-${Date.now()}`;
  const image = makeSourceImage();
  const project = await putPxdImage(createPxdProject({ projectId, revisionId: 'audio-main-fixture-rev', manifest: { futureMainImage: { keep: true } } }), image, 'main');
  const plan = preparePxdAudioImageImport(createAudioSong({ songId: 'audio-main-preview' }), image);
  const unmapped = Object.entries(plan.link.colorToSlot).find(([, slotId]) => !slotId);
  assert.ok(unmapped, 'fixture must contain a visible color with no Audio slot');
  const unmappedColorId = unmapped[0];
  const findCell = (predicate) => {
    for (let index = 0; index < plan.image.rgba.length / 4; index += 1) {
      const offset = index * 4;
      const colorId = `rgba-${[0, 1, 2, 3].map((channel) => plan.image.rgba[offset + channel].toString(16).padStart(2, '0')).join('')}`;
      if (predicate({ index, offset, colorId })) return { index, offset, colorId, x: index % plan.image.width, y: Math.floor(index / plan.image.width) };
    }
    return null;
  };
  const unmappedCell = findCell(({ colorId }) => colorId === unmappedColorId);
  const replacementCell = findCell(({ offset, colorId }) => plan.image.rgba[offset + 3] > 0 && colorId !== unmappedColorId && plan.link.colorToSlot[colorId]);
  assert.ok(unmappedCell && replacementCell, 'fixture requires both an unmapped and mapped working cell');
  const noteAtUnmapped = plan.song.tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.pitch === plan.link.rowPitchMap[unmappedCell.y] && note.startTick === unmappedCell.x * plan.link.ticksPerCell)));
  assert.equal(noteAtUnmapped, false, 'unmapped source cell must start silent');
  return {
    bytes: await encodePxd(project), projectId, expectedMain: image, expectedWorking: plan.image,
    unmappedColorId, unmappedCell, replacementCell, replacementColorId: replacementCell.colorId,
    rowPitchMap: plan.link.rowPitchMap, ticksPerCell: plan.link.ticksPerCell
  };
}

async function addLocalOnlyGuards(context) {
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort('blockedbyclient');
  });
}

async function loadProject(page, projectId, revisionId) {
  const bytes = await page.evaluate(async ({ projectId, revisionId }) => {
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { encodePxd } = await import('/js/creation/pxd-codec.mjs');
    const store = createPxdStore();
    const project = revisionId === null ? await store.load(projectId) : await store.load(projectId, revisionId);
    return [...await encodePxd(project)];
  }, { projectId, revisionId });
  return decodePxd(new Uint8Array(bytes));
}

async function loadImage(page, projectId, revisionId, role = 'main') {
  return page.evaluate(async ({ projectId, revisionId, role }) => {
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { readPxdImage } = await import('/js/creation/pxd-project.mjs');
    const project = await createPxdStore().load(projectId, revisionId);
    const image = await readPxdImage(project, role);
    return image && { width: image.width, height: image.height, rgba: [...image.rgba] };
  }, { projectId, revisionId, role });
}

async function readSavedPointer(page, tool) {
  return page.evaluate((tool) => JSON.parse(localStorage.getItem(`pixieed:pxd:last:${tool}`) || 'null'), tool);
}

async function savePxdAndWait(page, tool) {
  const before = await readSavedPointer(page, tool);
  await page.locator('#pxd-save').click();
  await page.waitForFunction(({ tool, before }) => {
    const pointer = JSON.parse(localStorage.getItem(`pixieed:pxd:last:${tool}`) || 'null');
    const button = document.querySelector('#pxd-save');
    return Boolean(pointer?.revisionId && (!before || pointer.projectId !== before.projectId || pointer.revisionId !== before.revisionId) && button && !button.disabled);
  }, { tool, before }, { timeout: 12000 });
  return readSavedPointer(page, tool);
}

async function readPngCell(page, path, cell, grid = { width: 16, height: 16 }) {
  return page.evaluate(async ({ bytes, cell, grid }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0);
    const xScale = bitmap.width / grid.width; const yScale = bitmap.height / grid.height;
    const x = Math.min(bitmap.width - 1, Math.floor((cell.x + 0.5) * xScale));
    const y = Math.min(bitmap.height - 1, Math.floor((cell.y + 0.5) * yScale));
    const rgba = [...context.getImageData(x, y, 1, 1).data]; bitmap.close();
    return { width: canvas.width, height: canvas.height, rgba };
  }, { bytes: [...await readFile(path)], cell, grid });
}

async function openPxdPanel(page, tool = 'draw') {
  if (tool === 'draw') {
    const importDetails = page.locator('.draw-import');
    if (await importDetails.count() && !(await importDetails.evaluate((node) => node.open))) await importDetails.locator(':scope > summary').click();
  } else if (tool === 'audio') {
    const moreDetails = page.locator('#audio-more');
    if (await moreDetails.count() && !(await moreDetails.evaluate((node) => node.open))) await moreDetails.locator(':scope > summary').click();
  }
  const details = page.locator('#pxd-tools');
  if (!(await details.evaluate((node) => node.open))) await details.locator(':scope > summary').click();
}

async function checkDrawCase(context, page, fixture) {
  page.on('pageerror', (error) => console.error(`BROWSER_PAGE_ERROR ${error.stack || error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') console.error(`BROWSER_CONSOLE_ERROR ${message.text()}`); });
  page.on('requestfailed', (request) => console.error(`BROWSER_REQUEST_FAILED ${request.url()} ${request.failure()?.errorText || ''}`));
  await page.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#draw-canvas');
  await page.locator('#pxd-file-input').waitFor({ state: 'attached', timeout: 12000 });
  await page.locator('#pxd-file-input').setInputFiles({ name: 'browser-fixture.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture.bytes) });
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('PXDの作品を開きました'));
  await openPxdPanel(page, 'draw');
  check('PXD import in a fresh browser context');

  await savePxdAndWait(page, 'draw');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('作品をこの端末に保存しました'));
  let pointer = await readSavedPointer(page, 'draw');
  assert.ok(pointer?.projectId && pointer?.revisionId);
  let project = await loadProject(page, pointer.projectId, pointer.revisionId);
  assert.deepEqual(project.manifest.unknownManifest, { keep: ['opaque', 7] });
  assert.deepEqual(project.entries.find((item) => item.path === 'future/blob.bin').futureDescriptor, { keep: true });
  assert.deepEqual(getPxdJson(project, 'future/future.json'), { unknownSchema: { nested: true }, rgba: [1, 2, 3, 0] });
  assert.deepEqual(getPxdJson(project, 'puzzles/future.json'), { mode: 'future-mode', version: 77, extra: { preserve: true } });
  assert.deepEqual([...project.opaquePayloads[0].bytes], [0, 41, 0, 255, 77]);
  const untouched = await loadImage(page, pointer.projectId, pointer.revisionId);
  assert.equal(untouched.width, fixture.expectedImage.width);
  assert.equal(untouched.height, fixture.expectedImage.height);
  sameBytes(untouched.rgba, fixture.expectedImage.rgba, 'imported original RGBA must be exact');
  check('PXD round-trip preserves rectangular RGBA, alpha, future JSON and unknown descriptors');

  // Make a deterministic one-cell Draw edit and ensure only that original cell changes.
  const paletteButtons = page.locator('#draw-palette .draw-color:not(.draw-color--transparent)');
  await paletteButtons.nth(4).click();
  const canvas = page.locator('#draw-canvas'); const rect = await canvas.boundingBox();
  await page.mouse.click(rect.x + rect.width * 0.015, rect.y + rect.height * 0.03);
  await openPxdPanel(page, 'draw');
  await savePxdAndWait(page, 'draw');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('作品をこの端末に保存しました'));
  pointer = await readSavedPointer(page, 'draw');
  project = await loadProject(page, pointer.projectId, pointer.revisionId);
  const changed = await loadImage(page, pointer.projectId, pointer.revisionId);
  const changedAt = 0;
  assert.notDeepEqual(changed.rgba.slice(changedAt, changedAt + 4), fixture.expectedImage.rgba.slice(changedAt, changedAt + 4), 'the drawn cell should change');
  sameBytes(changed.rgba.slice(4), fixture.expectedImage.rgba.slice(4), 'all other imported pixels should remain unchanged');
  assert.deepEqual(project.entries.find((item) => item.path === 'future/blob.bin').futureDescriptor, { keep: true });
  check('one-cell Draw edit preserves all other image bytes and unknown payload metadata');

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#pxd-export').click()]);
  const exported = await decodePxd(new Uint8Array(await readFile(await download.path())));
  const exportedImage = await readPxdImage(exported);
  assert.notDeepEqual(exportedImage.rgba.slice(0, 4), fixture.expectedImage.rgba.slice(0, 4));
  assert.deepEqual(exportedImage.rgba.slice(4), fixture.expectedImage.rgba.slice(4));
  assert.deepEqual([...exported.opaquePayloads[0].bytes], [0, 41, 0, 255, 77]);
  pointer = await readSavedPointer(page, 'draw');
  check('edited PXD file export decodes and retains the exact edited RGBA plus opaque bytes');

  // Audio routing runs as a separately selectable case while the page integration is landing.
  return { projectId: pointer.projectId, revisionId: pointer.revisionId };
}

async function checkResponsiveCase(context) {
  const page = await context.newPage();
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.draw-import > summary').click();
    const details = page.locator('#pxd-tools');
    await details.locator(':scope > summary').click();
    const report = await page.evaluate(() => {
      const panel = document.querySelector('.pxd-panel');
      const buttons = [...panel.querySelectorAll('button')].filter((button) => !button.hidden && button.getClientRects().length);
      const rects = buttons.map((button) => { const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; });
      let overlap = false;
      for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
        if (Math.min(rects[i].right, rects[j].right) > Math.max(rects[i].x, rects[j].x) + 1 && Math.min(rects[i].bottom, rects[j].bottom) > Math.max(rects[i].y, rects[j].y) + 1) overlap = true;
      }
      const box = panel.getBoundingClientRect();
      return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, overlap, shortButtons: rects.filter((r) => r.height < 44).length, panelFits: box.width <= innerWidth + 1 };
    });
    assert.equal(report.overflowX, false, `horizontal overflow at ${viewport.width}×${viewport.height}`);
    assert.equal(report.overlap, false, `overlapping PXD controls at ${viewport.width}×${viewport.height}`);
    assert.equal(report.shortButtons, 0, `PXD buttons are below 44px at ${viewport.width}×${viewport.height}`);
    assert.equal(report.panelFits, true, `PXD panel exceeds width at ${viewport.width}×${viewport.height}`);
  }
  await page.close();
  check('PXD panel controls at 320×568 and 568×320', 'no overlap, horizontal overflow, or undersized buttons');
}

async function checkStoreCase(context, fixture) {
  const pageA = await context.newPage(); const pageB = await context.newPage();
  await Promise.all([pageA.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' }), pageB.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' })]);
  const initialRevision = await pageA.evaluate(async (encoded) => {
    const { decodePxd } = await import('/js/creation/pxd-codec.mjs');
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const project = await decodePxd(new Uint8Array(encoded));
    return (await createPxdStore().save(project, { expectedRevisionId: null })).revisionId;
  }, [...fixture.bytes]);
  const id = fixture.projectId;
  const writer = (page, winner) => page.evaluate(async ({ id, rev, winner }) => {
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { setPxdJson } = await import('/js/creation/pxd-codec.mjs');
    const store = createPxdStore(); const project = await store.load(id, rev);
    return store.save(setPxdJson(project, 'future/race.json', { winner }), { expectedRevisionId: rev });
  }, { id, rev: initialRevision, winner });
  const results = await Promise.allSettled([writer(pageA, 'tab-a'), writer(pageB, 'tab-b')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'exactly one same-revision writer wins');
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1, 'stale concurrent writer is rejected');
  const latest = await loadProject(pageA, id, null);
  assert.ok(latest.revisionId !== initialRevision);
  const old = await loadProject(pageB, id, initialRevision);
  assert.equal(old.revisionId, initialRevision);
  assert.equal(old.entries.some((entry) => entry.path === 'future/race.json'), false);
  assert.deepEqual(getPxdJson(old, 'future/future.json'), { unknownSchema: { nested: true }, rgba: [1, 2, 3, 0] });
  assert.deepEqual([...old.opaquePayloads[0].bytes], [0, 41, 0, 255, 77]);
  await Promise.all([pageA.close(), pageB.close()]);
  check('real IndexedDB CAS across two tabs; stale concurrent write rejected and prior snapshot intact');
}

async function checkAudioCase(context, fixture) {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`BROWSER_PAGE_ERROR ${error.stack || error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') console.error(`BROWSER_CONSOLE_ERROR ${message.text()}`); });
  await page.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#draw-canvas');
  await page.locator('#pxd-file-input').waitFor({ state: 'attached', timeout: 12000 });
  await page.locator('#pxd-file-input').setInputFiles({ name: 'audio-fixture.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture.bytes) });
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('PXDの作品を開きました'));
  await openPxdPanel(page, 'draw');
  await page.locator('#pxd-to-audio').click();
  await page.waitForURL(/\/audio\/\?pxd=/, { timeout: 12000 });
  await page.waitForSelector('#audio-pixel-canvas');
  const query = new URL(page.url()).searchParams;
  const project = await loadProject(page, query.get('pxd'), query.get('pxdRevision'));
  assert.equal(getPxdJson(project, 'audio/state.json').songId, 'browser-song');
  const original = await loadImage(page, query.get('pxd'), query.get('pxdRevision'));
  assert.equal(original.width, 32); assert.equal(original.height, 16);
  const canvas = page.locator('#audio-pixel-canvas');
  assert.deepEqual(await canvas.evaluate((node) => [node.width, node.height]), [16, 16]);
  const rect = await canvas.boundingBox();
  await page.mouse.click(rect.x + rect.width * 0.95, rect.y + rect.height * 0.06);
  await openPxdPanel(page, 'audio');
  await savePxdAndWait(page, 'audio');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('端末に保存しました'));
  const saved = await readSavedPointer(page, 'audio');
  assert.ok(saved?.projectId && saved?.revisionId);
  const savedProject = await loadProject(page, saved.projectId, saved.revisionId);
  const song = getPxdJson(savedProject, 'audio/state.json');
  assert.ok(song.tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.pitch === 84 && note.startTick === 15 * 120))), 'Audio cell edit should persist as a note');
  const workingImage = await loadImage(page, saved.projectId, saved.revisionId, 'audio');
  assert.equal(workingImage.width, 16); assert.equal(workingImage.height, 16);
  assert.ok(workingImage.rgba[15 * 4 + 3] > 0, 'Audio note cell should have a visible pixel');
  const savedMain = await loadImage(page, saved.projectId, saved.revisionId, 'main');
  sameBytes(savedMain.rgba, fixture.expectedImage.rgba, 'editing the audio role must preserve main image RGBA');
  await page.locator('#pxd-to-draw').click();
  await page.waitForURL(/\/draw\/\?pxd=/, { timeout: 12000 });
  await page.waitForSelector('#draw-canvas');
  assert.deepEqual(await page.locator('#draw-canvas').evaluate((node) => [node.width, node.height]), [32, 16]);
  await page.close();
  check('PXD Draw → Audio → Draw flow persists the edited audio cell and preserves the exact main image');
}

async function checkAudioImageCase(context, fixture) {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`BROWSER_PAGE_ERROR ${error.stack || error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') console.error(`BROWSER_CONSOLE_ERROR ${message.text()}`); });
  await page.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#draw-canvas');
  await page.locator('#pxd-file-input').waitFor({ state: 'attached', timeout: 12000 });
  await page.locator('#pxd-file-input').setInputFiles({ name: 'main-image-only.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture.bytes) });
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('PXDの作品を開きました'));
  await openPxdPanel(page, 'draw');
  await page.locator('#pxd-to-audio').click();
  await page.waitForURL(/\/audio\/\?pxd=/, { timeout: 12000 });
  await page.locator('#pxd-conversion-apply').waitFor({ state: 'visible', timeout: 12000 });
  const previewCaptions = await page.locator('.pxd-comparison figcaption').allTextContents();
  assert.ok(previewCaptions.some((text) => text.includes('32 × 16')));
  assert.ok(previewCaptions.some((text) => text.includes('16 × 16')));
  await page.locator('#pxd-conversion-apply').click();
  await page.waitForSelector('#audio-pixel-canvas');
  await openPxdPanel(page, 'audio');
  const query = new URL(page.url()).searchParams;
  await savePxdAndWait(page, 'audio');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('端末に保存しました'));
  let pointer = await readSavedPointer(page, 'audio');
  let project = await loadProject(page, pointer.projectId, pointer.revisionId);
  let song = getPxdJson(project, 'audio/state.json');
  let link = getPxdJson(project, 'audio/link.json');
  let working = await loadImage(page, pointer.projectId, pointer.revisionId, 'audio');
  assert.equal(working.width, 16); assert.equal(working.height, 16);
  const unmappedHex = `#${fixture.unmappedColorId.slice(5)}`;
  const unmappedBytes = fixture.expectedWorking.rgba.slice((fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4, (fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4 + 4);
  sameBytes(working.rgba.slice((fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4, (fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4 + 4), unmappedBytes, 'unmapped RGBA must remain visible in saved working image');
  assert.equal(link.colorToSlot[fixture.unmappedColorId], null);
  assert.equal(song.tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.pitch === fixture.rowPitchMap[fixture.unmappedCell.y] && note.startTick === fixture.unmappedCell.x * fixture.ticksPerCell))), false);
  const canvasSample = await page.locator('#audio-pixel-canvas').evaluate((canvas, cell) => [...canvas.getContext('2d').getImageData(cell.x, cell.y, 1, 1).data], fixture.unmappedCell);
  assert.deepEqual(canvasSample, [...unmappedBytes], 'unmapped pixel should be visible on the actual Audio canvas');
  check('main-only 6-color PXD conversion preview preserves an unmapped color as a visible silent cell');

  const [firstPng] = await Promise.all([page.waitForEvent('download'), page.locator('#audio-export-image').click()]);
  const firstPngCell = await readPngCell(page, await firstPng.path(), fixture.unmappedCell);
  assert.deepEqual(firstPngCell.rgba, [...unmappedBytes], 'Audio PNG must retain the visible original pixel, including alpha');
  check('Audio PNG export contains the original unmapped pixel instead of dropping it');

  await page.locator('#audio-palette-settings > summary').click();
  const targetSelect = page.locator(`.audio-pxd-color select[aria-label="${unmappedHex.toLowerCase()}の音色割り当て"]`);
  if (!(await targetSelect.count())) {
    const state = await page.locator('.audio-pxd-colors').evaluate((node) => ({ hidden: node.hidden, text: node.textContent, html: node.innerHTML.slice(0, 600) }));
    throw new Error(`Audio color assignment UI did not render ${unmappedHex}: ${JSON.stringify(state)}`);
  }
  await targetSelect.waitFor({ state: 'visible' });
  assert.equal(await targetSelect.inputValue(), '', 'unmapped color selector starts at silent');
  const targetSlot = await targetSelect.evaluate((select) => [...select.options].find((option) => option.value)?.value || '');
  assert.ok(targetSlot, 'a color slot must be selectable');
  await targetSelect.selectOption(targetSlot);
  await page.waitForFunction((hex) => document.querySelector('#audio-status')?.textContent.includes(`${hex.toUpperCase()}を`) && document.querySelector('#audio-status')?.textContent.includes('設定しました'), unmappedHex);
  await openPxdPanel(page, 'audio');
  await savePxdAndWait(page, 'audio');
  pointer = await readSavedPointer(page, 'audio');
  project = await loadProject(page, pointer.projectId, pointer.revisionId);
  song = getPxdJson(project, 'audio/state.json'); link = getPxdJson(project, 'audio/link.json');
  working = await loadImage(page, pointer.projectId, pointer.revisionId, 'audio');
  assert.equal(link.colorToSlot[fixture.unmappedColorId], targetSlot, 'color-to-slot change persists');
  assert.deepEqual(working.rgba.slice((fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4, (fixture.unmappedCell.y * 16 + fixture.unmappedCell.x) * 4 + 4), [...unmappedBytes]);
  assert.ok(song.tracks.some((track) => track.instrument === targetSlot && track.clips.some((clip) => clip.notes.some((note) => note.pitch === fixture.rowPitchMap[fixture.unmappedCell.y] && note.startTick === fixture.unmappedCell.x * fixture.ticksPerCell))), 'assigning an Audio slot creates the corresponding pixel note');
  check('mapping an initially silent color creates its cell note without recoloring the source');

  await page.locator('#pxd-to-audio-image').click();
  await page.waitForURL(/\/draw\/\?pxd=.*pxdImage=audio/, { timeout: 12000 });
  await page.waitForSelector('#draw-canvas');
  const mappedHex = `#${fixture.unmappedColorId.slice(5)}`.toLowerCase();
  const paletteValues = await page.evaluate(() => [...document.querySelectorAll('#draw-palette .draw-color:not(.draw-color--transparent)')].map((button) => button.style.getPropertyValue('--draw-color').trim().toLowerCase()));
  const drawPaletteIndex = paletteValues.findIndex((value) => value === mappedHex);
  assert.ok(drawPaletteIndex >= 0, 'Draw palette must expose the exact mapped RGBA color');
  const drawButtons = page.locator('#draw-palette .draw-color:not(.draw-color--transparent)');
  await drawButtons.nth(drawPaletteIndex).click();
  const drawCanvas = page.locator('#draw-canvas'); const drawRect = await drawCanvas.boundingBox();
  await page.mouse.click(drawRect.x + drawRect.width * (fixture.replacementCell.x + 0.5) / 16, drawRect.y + drawRect.height * (fixture.replacementCell.y + 0.5) / 16);
  await openPxdPanel(page, 'draw');
  await savePxdAndWait(page, 'draw');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('端末に保存しました'));
  pointer = await readSavedPointer(page, 'draw');
  project = await loadProject(page, pointer.projectId, pointer.revisionId);
  working = await loadImage(page, pointer.projectId, pointer.revisionId, 'audio');
  link = getPxdJson(project, 'audio/link.json'); song = getPxdJson(project, 'audio/state.json');
  const replacementOffset = (fixture.replacementCell.y * 16 + fixture.replacementCell.x) * 4;
  sameBytes(working.rgba.slice(replacementOffset, replacementOffset + 4), [...unmappedBytes], 'Draw editing an Audio role must keep exact mapped source RGBA');
  assert.equal(link.colorToSlot[fixture.unmappedColorId], targetSlot);
  assert.ok(song.tracks.some((track) => track.instrument === targetSlot && track.clips.some((clip) => clip.notes.some((note) => note.pitch === fixture.rowPitchMap[fixture.replacementCell.y] && note.startTick === fixture.replacementCell.x * fixture.ticksPerCell))), 'Draw-to-Audio sync must use the saved color map');
  const main = await loadImage(page, pointer.projectId, pointer.revisionId, 'main');
  sameBytes(main.rgba, fixture.expectedMain.rgba, 'editing the Audio role must preserve original main pixels');
  await openPxdPanel(page, 'draw');
  await page.locator('#pxd-to-audio').click();
  await page.waitForURL(/\/audio\/\?pxd=/, { timeout: 12000 });
  await page.waitForSelector('#audio-pixel-canvas');
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('PXDの作品を開きました'));
  const finalQuery = new URL(page.url()).searchParams;
  const finalProject = await loadProject(page, finalQuery.get('pxd'), finalQuery.get('pxdRevision'));
  assert.equal(getPxdJson(finalProject, 'audio/link.json').colorToSlot[fixture.unmappedColorId], targetSlot);
  await page.close();
  check('Draw edits the Audio image role and reopening Audio restores the same exact color map and cell note');
}

const response = await fetch(origin, { redirect: 'manual' });
assert.ok(response.status > 0 && response.status < 500, `Local server unavailable at ${origin}: ${response.status}`);
const fixture = await makeFixture();
const audioImageFixture = requested.includes('audio-image') ? await makeMainOnlyFixture() : null;
const launchOptions = { headless: true };
if (engineName === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE) launchOptions.executablePath = process.env.PIXIEED_WEBKIT_EXECUTABLE;
const browser = await browserType.launch(launchOptions);
let failures = [];
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1024, height: 820 }, reducedMotion: 'reduce' });
  await addLocalOnlyGuards(context);
  if (requested.includes('store')) await checkStoreCase(context, fixture);
  if (requested.includes('draw') || requested.includes('unknown')) {
    const page = await context.newPage(); page.on('pageerror', (error) => failures.push(error.message));
    await checkDrawCase(context, page, fixture); await page.close();
  }
  if (requested.includes('responsive')) await checkResponsiveCase(context);
  if (requested.includes('audio')) await checkAudioCase(context, fixture);
  if (requested.includes('audio-image')) await checkAudioImageCase(context, audioImageFixture);
  assert.ok(checks.length > 0, 'selected PXD cases completed zero checks');
  assert.deepEqual(failures, [], `browser page errors: ${failures.join('\n')}`);
  await context.close();
} finally {
  await browser.close();
}
console.log(`\nPXD browser harness ${engineName}: ${checks.length} checks passed.`);
