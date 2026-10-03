#!/usr/bin/env node
/** Isolated localhost acceptance for PXD puzzle editing and captured camera images. */
import assert from 'node:assert/strict';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdBytes } from '../js/creation/pxd-codec.mjs';
import { putPxdDrawDocument, readPxdImage } from '../js/creation/pxd-project.mjs';
import { documentRgba } from '../js/creation/draw-core.mjs';
import { createAudioSong } from '../js/creation/audio-core.mjs';
import { preparePxdAudioImageImport, writePxdAudioState } from '../js/creation/pxd-draw-audio.mjs';

const origin = process.env.PIXIEED_PXD_ORIGIN || 'http://127.0.0.1:4173';
const engine = process.env.PIXIEED_PXD_ENGINE || 'chromium';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit' ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs' : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
const checks = [];
const failures = [];
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
const drawing = { schemaVersion: 1, width: 16, height: 16, palette: ['#447766', '#ddaa88', '#993355'], pixels: Array.from({ length: 256 }, (_, i) => i === 0 ? 1 : i % 19 === 0 ? 2 : 0) };
let fixture = await putPxdDrawDocument(createPxdProject(), drawing);
fixture = setPxdBytes(fixture, 'future/component.bin', new Uint8Array([255, 0, 12, 1]));
const bytes = await encodePxd(fixture);
async function newContext() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.route('**/*', (route) => route.request().url().startsWith(origin) || /^(blob:|data:)/.test(route.request().url()) ? route.continue() : route.abort());
  context.on('page', (page) => {
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method()) && !request.url().startsWith(origin)) failures.push(`External write: ${request.method()}`); });
  });
  return context;
}
async function importFile(page, route, payload = bytes) {
  await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pxd-file-input').waitFor({ state: 'attached' });
  await page.locator('#pxd-file-input').setInputFiles({ name: 'owned-project.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(payload) });
  await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('PXDの作品を開きました'), { timeout: 12000 });
}
async function openPanel(page) {
  for (const selector of ['.draw-import', '.audio-more']) {
    const outer = page.locator(selector);
    if (await outer.count() && !(await outer.evaluate((node) => node.open))) await outer.locator(':scope > summary').click();
  }
  if (!(await page.locator('#pxd-tools').evaluate((node) => node.open))) await page.locator('#pxd-tools > summary').click();
}
async function saved(page, tool) {
  const before = await page.evaluate((tool) => localStorage.getItem(`pixieed:pxd:last:${tool}`), tool);
  await openPanel(page); await saveCurrentProject(page);
  await page.waitForFunction(({ before, tool }) => {
    const value = localStorage.getItem(`pixieed:pxd:last:${tool}`);
    return value && value !== before && !document.querySelector('#pxd-save').disabled;
  }, { before, tool });
  const payload = await page.evaluate(async (tool) => {
    const pointer = JSON.parse(localStorage.getItem(`pixieed:pxd:last:${tool}`));
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { encodePxd } = await import('/js/creation/pxd-codec.mjs');
    return [...await encodePxd(await createPxdStore().load(pointer.projectId, pointer.revisionId))];
  }, tool);
  return decodePxd(new Uint8Array(payload));
}
async function exported(page) {
  await openPanel(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#pxd-export').click()]);
  return new Uint8Array(await readFile(await download.path()));
}
async function tapCell(page, selector, x, y) {
  const box = await page.locator(selector).boundingBox();
  const size = await page.locator(selector).evaluate((node) => [node.width, node.height]);
  await page.mouse.click(box.x + (x + 0.5) * box.width / size[0], box.y + (y + 0.5) * box.height / size[1]);
}
function preserves(project) { assert.deepEqual([...project.entries.find((entry) => entry.path === 'future/component.bin').bytes], [255, 0, 12, 1]); }

try {
  const context = await newContext(); const page = await context.newPage();
  await importFile(page, '/spot-difference/');
  await page.locator('#spot-editor').waitFor({ state: 'visible' });
  let project = await saved(page, 'spot_difference');
  assert.equal(getPxdJson(project, 'puzzles/spot_difference.json').document.candidates.length, 0);
  await page.locator('#pxd-to-spot-after').click(); await page.waitForURL(/\/draw\/\?pxd=/);
  await page.waitForFunction(() => document.querySelector('#draw-canvas')?.width === 16);
  await page.locator('#draw-palette .draw-color:not(.draw-color--transparent)').nth(2).click();
  await tapCell(page, '#draw-canvas', 0, 0);
  project = await saved(page, 'draw');
  assert.equal(getPxdJson(project, 'puzzles/spot_difference.json').sourceChanged, true);
  assert.deepEqual([...(await readPxdImage(project, 'spot-before')).rgba], [...documentRgba(drawing)]);
  await page.locator('#pxd-to-spot_difference').click(); await page.waitForURL(/\/spot-difference\/\?pxd=/);
  await page.locator('#spot-editor').waitFor({ state: 'visible' });
  project = await saved(page, 'spot_difference');
  const puzzle = getPxdJson(project, 'puzzles/spot_difference.json').document;
  assert.equal(puzzle.confirmed, false); assert.equal(puzzle.candidates.length, 1);
  preserves(project); pass('Draw edit → Spot re-detection keeps original image and requires answer confirmation');
  const spotBytes = await exported(page);
  const fresh = await newContext(); const spotPage = await fresh.newPage();
  await importFile(spotPage, '/spot-difference/', spotBytes); const reopened = await saved(spotPage, 'spot_difference');
  assert.equal(getPxdJson(reopened, 'puzzles/spot_difference.json').document.candidates.length, 1);
  assert.notEqual(getPxdJson(reopened, 'puzzles/spot_difference.json').document.before.draftId, puzzle.before.draftId);
  preserves(reopened); pass('Spot file recreates owned sources in a fresh browser without original local drafts');
  await fresh.close(); await context.close();

  const hiddenContext = await newContext(); const hiddenPage = await hiddenContext.newPage();
  await importFile(hiddenPage, '/hidden-object/'); await hiddenPage.locator('#hidden-editor').waitFor({ state: 'visible' });
  await hiddenPage.locator('.hidden-settings > summary').click(); await hiddenPage.locator('#hidden-name').fill('花'); await hiddenPage.locator('#hidden-add').click();
  await tapCell(hiddenPage, '#hidden-canvas', 1, 1);
  const hiddenProject = await saved(hiddenPage, 'hidden_object');
  const target = getPxdJson(hiddenProject, 'puzzles/hidden_object.json').document.targets[0];
  assert.equal(target.name, '花'); assert.deepEqual(target.pixels, [17]);
  const hiddenBytes = await exported(hiddenPage); const hiddenFresh = await newContext(); const hiddenOther = await hiddenFresh.newPage();
  await importFile(hiddenOther, '/hidden-object/', hiddenBytes); const recovered = await saved(hiddenOther, 'hidden_object');
  assert.deepEqual(getPxdJson(recovered, 'puzzles/hidden_object.json').document.targets[0], target);
  preserves(recovered); pass('Hidden target name and exact mask survive export/import in a fresh browser');
  await hiddenFresh.close(); await hiddenContext.close();

  const jigContext = await newContext(); const jigPage = await jigContext.newPage();
  await importFile(jigPage, '/jigsaw/'); await jigPage.locator('#jigsaw-play').waitFor({ state: 'visible' });
  const jigProject = await saved(jigPage, 'jigsaw'); const jig = getPxdJson(jigProject, 'puzzles/jigsaw.json').document;
  assert.ok(jig.groups.length > 1); assert.ok(jig.groups.some((group) => group.q !== 0));
  const jigBytes = await exported(jigPage); const jigFresh = await newContext(); const jigOther = await jigFresh.newPage();
  await importFile(jigOther, '/jigsaw/', jigBytes); const jigRecovered = await saved(jigOther, 'jigsaw');
  const nextJig = getPxdJson(jigRecovered, 'puzzles/jigsaw.json').document;
  assert.deepEqual(nextJig.groups, jig.groups); assert.deepEqual(nextJig.tray, jig.tray);
  assert.deepEqual([...(await readPxdImage(jigRecovered, 'jigsaw-main')).rgba], [...documentRgba(drawing)]);
  preserves(jigRecovered); pass('Jigsaw image, rotations, rigid groups and tray survive portable PXD round trip');
  await jigFresh.close(); await jigContext.close();

  if (engine === 'chromium') {
    const musicContext = await newContext(); const musicPage = await musicContext.newPage();
    const raw = { width: 16, height: 16, rgba: documentRgba(drawing) };
    const plan = preparePxdAudioImageImport(createAudioSong({ songId: 'pinch-linked-song' }), raw);
    const linked = await writePxdAudioState(fixture, plan.song, { image: plan.image, link: plan.link });
    await importFile(musicPage, '/audio/', await encodePxd(linked));
    const beforePinch = await saved(musicPage, 'audio');
    await musicPage.keyboard.press('Escape');
    const canvasBox = await musicPage.locator('#audio-pixel-canvas').boundingBox();
    const cx = canvasBox.x + canvasBox.width / 2; const cy = canvasBox.y + canvasBox.height / 2;
    const touch = await musicContext.newCDPSession(musicPage);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: cx - 30, y: cy }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: cx - 30, y: cy }, { id: 2, x: cx + 30, y: cy }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: cx - 70, y: cy }, { id: 2, x: cx + 70, y: cy }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
    const afterPinch = await saved(musicPage, 'audio');
    assert.deepEqual(getPxdJson(afterPinch, 'audio/state.json'), getPxdJson(beforePinch, 'audio/state.json'));
    assert.deepEqual(getPxdJson(afterPinch, 'audio/link.json'), getPxdJson(beforePinch, 'audio/link.json'));
    assert.deepEqual([...(await readPxdImage(afterPinch, 'audio')).rgba], [...(await readPxdImage(beforePinch, 'audio')).rgba]);
    pass('Injected two-finger pinch restores linked pixels, notes and color assignments together');
    await musicContext.addInitScript(() => {
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
      const context = canvas.getContext('2d');
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
        const stream = canvas.captureStream(10);
        const paint = () => { ['#d82a3f', '#29ab71', '#365bd3', '#ead334', '#b331cc', '#22b8d2'].forEach((color, i) => { context.fillStyle = color; context.fillRect(i * 16, 0, 16, 96); }); requestAnimationFrame(paint); };
        paint(); return stream;
      } });
    });
    await musicPage.keyboard.press('Escape');
    await musicPage.locator('#audio-take-photo').click(); await musicPage.waitForURL(/\/pixel-camera\.html\?to=audio/, { waitUntil: 'domcontentloaded' });
    await musicPage.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.ready === 'true');
    assert.equal(await musicPage.locator('#view').evaluate((node) => node.width), 16);
    await musicPage.locator('#capture').click(); await musicPage.waitForURL(/\/audio\//, { waitUntil: 'domcontentloaded' });
    await musicPage.waitForFunction(() => document.querySelectorAll('.audio-pxd-color').length > 4);
    const afterPhoto = await saved(musicPage, 'audio');
    const photoLink = getPxdJson(afterPhoto, 'audio/link.json');
    assert.ok(Object.values(photoLink.colorToSlot).some((slot) => slot === null));
    assert.deepEqual([...(await readPxdImage(afterPhoto, 'main')).rgba], [...documentRgba(drawing)]);
    preserves(afterPhoto);
    pass('Synthetic 16-color camera returns immediately to its PXD song; extra colors stay available and original image stays intact');
    await musicContext.close();
  }

  const camContext = await newContext(); const camPage = await camContext.newPage();
  await importFile(camPage, '/pixel-camera.html');
  await camPage.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured');
  assert.deepEqual(await camPage.locator('#view').evaluate((node) => [node.width, node.height]), [16, 16]);
  const camProject = await saved(camPage, 'camera');
  assert.deepEqual([...(await readPxdImage(camProject)).rgba], [...documentRgba(drawing)]); preserves(camProject);
  const camBytes = await exported(camPage); const camFresh = await newContext(); const camOther = await camFresh.newPage();
  await importFile(camOther, '/pixel-camera.html', camBytes); const restoredCamera = await saved(camOther, 'camera');
  assert.deepEqual([...(await readPxdImage(restoredCamera)).rgba], [...documentRgba(drawing)]);
  assert.equal(getPxdJson(restoredCamera, 'camera/state.json').logicalPixels, true);
  pass('Captured camera image saves logical pixels and reopens without live-camera permission');
  await camFresh.close(); await camContext.close();
  assert.deepEqual(failures, [], 'Browser script errors or external writes');
  console.log(JSON.stringify({ engine, passed: checks.length, failed: 0 }));
} finally { await browser.close(); }
