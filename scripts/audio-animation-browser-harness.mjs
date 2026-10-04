/** Focused browser acceptance for Audio's frame-only animation workflow. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only a local test server is allowed');
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const outDir = '/tmp/pixieed-audio-animation-20261004';
const viewports = [{ width: 390, height: 844 }, { width: 844, height: 390 }];
const result = { base, viewports, checks: 0, pageErrors: [], consoleErrors: [], sourceHashes: {}, cases: [] };
const check = (value, message, evidence) => { result.checks += 1; assert.ok(value, message + (evidence === undefined ? '' : `: ${JSON.stringify(evidence)}`)); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// PXD codecs may sort object keys when serializing. Compare semantic values,
// not JSON property insertion order.
const eq = (a, b) => isDeepStrictEqual(a, b);

async function makeDrawAnimationProject(page) {
  return page.evaluate(async () => {
    const anim = await import('/js/creation/animation-core.mjs');
    const pxd = await import('/js/creation/pxd-codec.mjs');
    const images = await import('/js/creation/pxd-project.mjs');
    const pxdAnim = await import('/js/creation/pxd-animation.mjs');
    const storeApi = await import('/js/creation/tool-project-store.mjs');
    const palette = ['#e53935', '#1565c0', '#43a047'];
    let animation = anim.createAnimation({ width: 16, height: 16, palette });
    const first = animation.frames[0].id;
    animation = anim.addAnimationFrame(animation, { sourceFrameId: first, durationMs: 180 });
    const second = animation.frames[1].id;
    animation = anim.addAnimationLayer(animation, { name: 'Hidden original', visible: false, locked: true });
    const hidden = animation.layers[1].id;
    const cel = (points) => { const pixels = Array(256).fill(0); for (const [x, y, value] of points) pixels[y * 16 + x] = value; return { schemaVersion: 1, width: 16, height: 16, palette, pixels }; };
    animation = anim.writeAnimationCel(animation, first, animation.layers[0].id, cel([[2, 2, 1], [5, 5, 1], [6, 6, 1]]));
    animation = anim.writeAnimationCel(animation, first, hidden, cel([[5, 5, 2], [10, 10, 3]]));
    animation = anim.writeAnimationCel(animation, second, animation.layers[0].id, cel([[3, 3, 1], [5, 5, 1]]));
    animation = anim.writeAnimationCel(animation, second, hidden, cel([[5, 5, 2], [11, 11, 3]]));
    const composed = animation.frames.map(frame => Array.from(anim.composeAnimationFrame(animation, frame.id).pixels));
    const cels = animation.frames.map(frame => animation.layers.map(layer => Array.from(anim.getAnimationCelDocument(animation, frame.id, layer.id).pixels)));
    const image = anim.composeAnimationFrame(animation, first);
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.pixels.length; i++) {
      const colorIndex = image.pixels[i];
      if (colorIndex >= 0) { const color = palette[colorIndex].slice(1); rgba.set([0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16)).concat(255), i * 4); }
    }
    const manifest = { title: 'Audio frame acceptance source', lastMode: 'draw', toolProject: { schemaVersion: 1, tool: 'draw' },
      editorState: { draw: { imageRole: 'main', frameId: second } } };
    let project = pxd.createPxdProject({ manifest });
    project = await images.putPxdSharedImage(project, { width: 16, height: 16, rgba });
    project = await pxdAnim.writePxdAnimation(project, animation, { role: 'main', posterFrameId: first });
    const store = storeApi.createToolProjectStore('draw');
    const saved = await store.save(project, { expectedRevisionId: null });
    return { projectId: saved.projectId, revisionId: saved.revisionId, first, second, selected: second, layers: animation.layers, frames: animation.frames,
      composed, cels, sourceSnapshot: JSON.stringify({ manifest: project.manifest, entries: project.entries }) };
  });
}

async function importDrawIntoAudio(page, source) {
  return page.evaluate(async ({ id, revisionId }) => {
    const storeApi = await import('/js/creation/tool-project-store.mjs');
    const importer = await import('/js/creation/tool-project-import.mjs');
    const { readPxdAnimation, writePxdAnimation } = await import('/js/creation/pxd-animation.mjs');
    const { readPxdAudioState, readPxdAudioLink, writePxdAudioState } = await import('/js/creation/pxd-draw-audio.mjs');
    const { setAudioPixel } = await import('/js/creation/audio-core.mjs');
    const draw = await storeApi.createToolProjectStore('draw').load(id, revisionId);
    const sourceBefore = structuredClone(draw);
    let imported = await importer.importToolProject(draw, 'audio');
    const animation = await readPxdAnimation(imported, 'audio');
    const link = readPxdAudioLink(imported); let song = readPxdAudioState(imported);
    song = setAudioPixel(song, { trackId: song.tracks[0].trackId, pitch: 48, startTick: 15 * 120, noteId: 'manual-audio-note' });
    imported = await writePxdAudioState(imported, song, { link, animation });
    const saved = await storeApi.createToolProjectStore('audio').save(imported, { expectedRevisionId: null });
    const sourceAfter = await storeApi.createToolProjectStore('draw').load(id, revisionId);
    const stable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
    return { projectId: saved.projectId, revisionId: saved.revisionId, sourceStable: stable };
  }, { id: source.projectId, revisionId: source.revisionId });
}

async function makeStaticAudioProject(page) {
  return page.evaluate(async () => {
    const { createAudioSong, setAudioPixel } = await import('/js/creation/audio-core.mjs');
    const { prepareSharedAudioImageImport, writePxdAudioState } = await import('/js/creation/pxd-draw-audio.mjs');
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const width = 16, height = 16, rgba = new Uint8ClampedArray(width * height * 4);
    rgba.set([229, 57, 53, 255], (2 * width + 2) * 4);
    const image = { width, height, rgba };
    const initialSong = createAudioSong({ songId: 'audio-static-conversion-fixture' });
    const plan = prepareSharedAudioImageImport(initialSong, image);
    const song = setAudioPixel(plan.song, { trackId: plan.song.tracks[0].trackId, pitch: 48, startTick: 15 * 120, noteId: 'manual-static-note' });
    let project = await writePxdAudioState(createPxdProject({ manifest: { title: 'Static Audio frame conversion fixture', lastMode: 'audio', toolProject: { schemaVersion: 1, tool: 'audio' } } }), song, { image: plan.image, link: plan.link });
    const saved = await createToolProjectStore('audio').save(project, { expectedRevisionId: null });
    return { projectId: saved.projectId, revisionId: saved.revisionId };
  });
}

async function saveCurrent(page) {
  const output = page.locator('#audio-output');
  if (!(await output.evaluate(node => node.open))) await output.locator(':scope > summary').click();
  await page.locator('#audio-save').click();
  await page.waitForFunction(() => document.querySelector('#audio-save')?.disabled === false && document.querySelector('#project-open')?.dataset.state === 'saved', null, { timeout: 12000 });
}

async function inspectProject(page, id) {
  return page.evaluate(async projectId => {
    const { createPxdStore } = await import('/js/creation/pxd-store.mjs');
    const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
    const { readPxdAudioState, readPxdAudioLink } = await import('/js/creation/pxd-draw-audio.mjs');
    const { composeAnimationFrame, getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
    const project = await createPxdStore().load(projectId);
    const animation = await readPxdAnimation(project, 'audio');
    const song = readPxdAudioState(project); const link = readPxdAudioLink(project);
    return { revisionId: project.revisionId, selectedFrameId: project.manifest?.editorState?.audio?.frameId, frames: animation?.frames, layers: animation?.layers, palette: animation?.palette,
      cels: animation?.frames.map(frame => animation.layers.map(layer => Array.from(getAnimationCelDocument(animation, frame.id, layer.id).pixels))),
      composed: animation?.frames.map(frame => Array.from(composeAnimationFrame(animation, frame.id).pixels)), song, link,
      frameIds: animation?.frames.map(frame => frame.id) };
  }, id);
}
async function inspectDrawSource(page, id, revisionId) {
  return page.evaluate(async ({ id, revisionId }) => {
    const store = await import('/js/creation/tool-project-store.mjs');
    const pxdAnimation = await import('/js/creation/pxd-animation.mjs');
    const core = await import('/js/creation/animation-core.mjs');
    const project = await store.createToolProjectStore('draw').load(id, revisionId);
    const animation = await pxdAnimation.readPxdAnimation(project, 'main');
    return { layers: animation.layers, frames: animation.frames, cels: animation.frames.map(frame => animation.layers.map(layer => Array.from(core.getAnimationCelDocument(animation, frame.id, layer.id).pixels))),
      composed: animation.frames.map(frame => Array.from(core.composeAnimationFrame(animation, frame.id).pixels)), selectedFrameId: project.manifest?.editorState?.draw?.frameId };
  }, { id, revisionId });
}

async function canvasPixels(page) {
  return page.locator('#audio-pixel-canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height,
    rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) }));
}
function displayRGBA(pixels, palette) {
  const out = [];
  for (const index of pixels) out.push(...(index < 0 ? [255, 255, 255, 255] : [...palette[index].slice(1).match(/../g).map(v => parseInt(v, 16)), 255]));
  return out;
}
async function waitReady(page) {
  await page.waitForFunction(() => document.querySelector('#main') && !document.querySelector('#main').inert && document.querySelector('#audio-pixel-canvas'), null, { timeout: 15000 });
  await page.waitForFunction(() => { const c = document.querySelector('#audio-pixel-canvas'); return c && c.width >= 2 && c.height >= 2; }, null, { timeout: 8000 });
}
async function openFramePanel(page) {
  const trigger = page.locator('#audio-animation-controls [data-action="toggle-frames"]');
  await trigger.waitFor({ state: 'visible', timeout: 6000 });
  if ((await page.locator('#audio-animation-controls-panel').count()) && await page.locator('#audio-animation-controls-panel').isVisible()) return;
  await trigger.click();
  await page.locator('#audio-animation-controls-panel.animation-controls__workspace-panel.is-frame-only').waitFor({ state: 'visible', timeout: 5000 });
}
async function frameContextAction(page, frame, action) {
  await frame.click({ button: 'right' });
  const menuAction = page.locator(`[data-frame-menu-action="${action}"]`);
  await menuAction.waitFor({ state: 'visible', timeout: 3500 });
  assert.equal(await menuAction.isEnabled(), true, `Frame action ${action} is enabled`);
  await menuAction.click();
  await page.waitForFunction(() => !document.querySelector('[data-frame-menu]') || document.querySelector('[data-frame-menu]')?.hidden, null, { timeout: 5000 });
}
async function frameButtons(page) { return page.locator('#audio-animation-controls-panel [data-action="select-frame"]'); }
async function waitSelected(page, index) {
  await page.waitForFunction(i => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]')[i]?.getAttribute('aria-selected') === 'true', index, { timeout: 5000 });
}
async function panelGeometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#audio-animation-controls-panel'); const canvas = document.querySelector('#audio-pixel-canvas');
    const p = panel?.getBoundingClientRect(), c = canvas?.getBoundingClientRect();
    return { visible: Boolean(panel && !panel.hidden && p.width && p.height), panel: p && { x:p.x,y:p.y,width:p.width,height:p.height },
      canvas: c && { x:c.x,y:c.y,width:c.width,height:c.height }, scrollWidth: document.documentElement.scrollWidth, innerWidth,
      innerHeight, headerBottom: document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0,
      navTop: document.querySelector('.app-tabs')?.getBoundingClientRect().top ?? innerHeight,
      frameStrip: panel?.querySelector('.animation-controls__frames') && { scrollWidth: panel.querySelector('.animation-controls__frames').scrollWidth, clientWidth: panel.querySelector('.animation-controls__frames').clientWidth },
      buttons: [...(panel?.querySelectorAll('button') || [])].filter(button => !button.hidden).map(button => { const rect = button.getBoundingClientRect(); return { label: button.getAttribute('aria-label') || button.textContent.trim(), width: rect.width, height: rect.height }; }),
      hasLayerUI: Boolean(panel?.querySelector('[data-action="toggle-layers"], [data-action="add-layer"], .animation-controls__layers')) };
  });
}

try {
  await mkdir(outDir, { recursive: true });
  for (const path of ['audio/index.html', 'css/creation-audio.css', 'js/creation/audio-page.mjs', 'js/creation/animation-controls.mjs', 'js/creation/audio-animation.mjs', 'js/creation/pxd-animation.mjs', 'js/creation/project-components.mjs', 'js/creation/tool-project-import.mjs', 'js/creation/pxd-draw-audio.mjs', 'js/creation/tool-project-store.mjs']) {
    result.sourceHashes[path] = sha(await readFile(new URL('../' + path, import.meta.url)));
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: viewport.width < 600 });
      const page = await context.newPage();
      page.on('pageerror', error => result.pageErrors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(`${viewport.width}x${viewport.height}: ${message.text()}`); });
      await page.route('**/*', route => { try { return new URL(route.request().url()).origin === origin ? route.continue() : route.abort(); } catch { return route.abort(); } });
      await page.goto(base + '/audio/', { waitUntil: 'domcontentloaded' }); await waitReady(page);
      const blankLauncher = page.locator('#audio-animation-controls [data-action="toggle-frames"]');
      await blankLauncher.waitFor({ state: 'visible', timeout: 6000 }); await blankLauncher.click();
      await page.locator('#audio-animation-controls-panel.animation-controls__workspace-panel.is-frame-only').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('#audio-animation-controls-panel [data-action="add-frame"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]').length === 2, null, { timeout: 5000 });
      check(true, 'Blank Audio project can open the common frame panel and create its first frame');
      await page.goto(base + '/audio/', { waitUntil: 'domcontentloaded' }); await waitReady(page);
      const drawSource = await makeDrawAnimationProject(page);
      const imported = await importDrawIntoAudio(page, drawSource);
      check(imported.sourceStable, 'Explicit Draw-to-Audio import does not mutate its source PXD project');
      result.cases.push({ viewport, fixture: { audioId: imported.projectId, drawId: drawSource.projectId, frameIds: [drawSource.first, drawSource.second], layers: drawSource.layers } });
      await page.goto(`${base}/audio/?pxd=${encodeURIComponent(imported.projectId)}&pxdRevision=${encodeURIComponent(imported.revisionId)}`, { waitUntil: 'domcontentloaded' }); await waitReady(page);
      await page.waitForFunction(() => document.querySelector('#audio-animation-panel')?.hidden === false && document.querySelector('#audio-animation-controls [data-action="toggle-frames"]'), null, { timeout: 10000 });
      const before = await inspectProject(page, imported.projectId);
      check(before.frames.length === 2 && before.layers.length === 2, 'Imported PXD retains the Draw source layer data until Audio saves its flattened working copy', { frames: before.frames.length, layers: before.layers });
      check(drawSource.layers.length === 2 && drawSource.layers[1].visible === false && drawSource.layers[1].locked === true, 'Source Draw keeps its hidden locked layer metadata');
      check(eq(before.composed[0], drawSource.composed[0]) && eq(before.composed[1], drawSource.composed[1]), 'Audio composition includes visible imported layers and excludes the hidden layer');
      const initialCanvas = await canvasPixels(page);
      check(eq(initialCanvas.rgba, displayRGBA(before.composed[1], before.palette)), 'Initial Audio canvas uses the source project’s selected frame composite');
      check(before.selectedFrameId === drawSource.second, 'Selected Draw frame identity is carried into the Audio project', before.selectedFrameId);
      const originalNotes = before.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes));
      check(originalNotes.some(note => note.sourceCell?.kind === 'audio-animation' && note.sourceCell.frameId === drawSource.first), 'First-frame artwork projects to source-cell notes');
      check(originalNotes.some(note => note.sourceCell?.kind === 'audio-animation' && note.sourceCell.frameId === drawSource.second), 'Second-frame artwork projects to source-cell notes');
      const manualNote = originalNotes.find(note => note.noteId === 'manual-audio-note');
      check(Boolean(manualNote && !manualNote.sourceCell), 'Manual song note is preserved alongside projected artwork', manualNote);
      check(before.composed[0][10 * 16 + 10] === -1 && !originalNotes.some(note => note.sourceCell?.localX === 10 && note.sourceCell?.y === 10), 'Pixels from the hidden Draw layer are absent from Audio image and notes');
      const projectedKeys = originalNotes.filter(note => note.sourceCell?.kind === 'audio-animation').map(note => `${note.sourceCell.frameId}/${note.sourceCell.localX}/${note.sourceCell.y}`);
      check(new Set(projectedKeys).size === projectedKeys.length, 'Each artwork cell is projected to at most one source note');
      result.cases.at(-1).initial = { pageSize: await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth })), canvas: initialCanvas, notes: originalNotes.length };

      await openFramePanel(page);
      let geometry = await panelGeometry(page); check(geometry.visible && geometry.scrollWidth <= geometry.innerWidth + 1, 'Frame panel is visible within the viewport without horizontal page overflow', geometry);
      check(!geometry.hasLayerUI, 'Frame-only Audio panel exposes no layer controls');
      check(geometry.panel.y >= geometry.headerBottom - 1 && geometry.panel.y + geometry.panel.height <= geometry.navTop + 1, 'Frame panel stays between the header and bottom navigation', geometry);
      check(geometry.buttons.filter(button => button.width && button.height).every(button => button.width >= 43 && button.height >= 43), 'Visible frame controls retain touch-sized hit areas', geometry.buttons);
      const originalCanvasRect = geometry.canvas;
      let frames = await frameButtons(page); check(await frames.count() === 2, 'Frame strip starts with both imported frames');
      await page.screenshot({ path: `${outDir}/audio-frame-panel-${viewport.width}x${viewport.height}.png` });
      await frames.nth(0).click(); await waitSelected(page, 0);
      check(eq((await canvasPixels(page)).rgba, displayRGBA(before.composed[0], before.palette)), 'Selecting frame one changes the canvas to its full composite');
      await page.locator('#audio-animation-controls-panel [data-action="next-frame"]').click(); await waitSelected(page, 1);
      await page.locator('#audio-animation-controls-panel [data-action="previous-frame"]').click(); await waitSelected(page, 0);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#audio-animation-controls-panel')?.hidden === true, null, { timeout: 3000 });
      check(true, 'Escape closes the frame panel');
      await openFramePanel(page);

      // Frame context actions: blank, duplicate, reorder and delete, each against serialized PXD state.
      frames = await frameButtons(page); await frameContextAction(page, frames.nth(1), 'blank');
      await page.waitForFunction(() => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]').length === 3, null, { timeout: 5000 });
      let visibleFrameIds = await frames.evaluateAll(nodes => nodes.map(node => node.dataset.frameId));
      const blankFrameId = visibleFrameIds[2];
      frames = await frameButtons(page); await frameContextAction(page, frames.nth(2), 'duplicate');
      await page.waitForFunction(() => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]').length === 4, null, { timeout: 5000 });
      visibleFrameIds = await (await frameButtons(page)).evaluateAll(nodes => nodes.map(node => node.dataset.frameId));
      check(visibleFrameIds[2] === blankFrameId && visibleFrameIds[3] !== blankFrameId, 'Blank and duplicate actions insert frames into the strip');
      const duplicateFrameId = visibleFrameIds[3];
      frames = await frameButtons(page); await frameContextAction(page, frames.nth(3), 'left');
      await page.waitForFunction(id => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]')[2]?.dataset.frameId === id, duplicateFrameId, { timeout: 5000 });
      frames = await frameButtons(page); await frameContextAction(page, frames.nth(2), 'delete');
      await page.waitForFunction(() => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]').length === 3, null, { timeout: 5000 });
      const orderAfterEdit = await (await frameButtons(page)).evaluateAll(nodes => nodes.map(node => node.dataset.frameId));
      check(orderAfterEdit.includes(blankFrameId) && !orderAfterEdit.includes(duplicateFrameId), 'Reorder and delete update frame identity order in the strip', orderAfterEdit);
      const panelAfterOps = await panelGeometry(page); check(panelAfterOps.canvas.width === originalCanvasRect.width && panelAfterOps.canvas.height === originalCanvasRect.height, 'Opening and using the frame panel does not resize the Audio canvas', { before: originalCanvasRect, after: panelAfterOps.canvas });
      check(panelAfterOps.scrollWidth <= panelAfterOps.innerWidth + 1, 'Frame operations leave no horizontal viewport overflow', panelAfterOps);

      // Editing is performed on the selected blank frame; source artwork and notes in other frames remain intact.
      const canvas = page.locator('#audio-pixel-canvas');
      frames = await frameButtons(page);
      const currentCount = await frames.count();
      const blankIndexSafe = await frames.evaluateAll((nodes, id) => nodes.findIndex(node => node.dataset.frameId === id), blankFrameId);
      check(blankIndexSafe >= 0 && blankIndexSafe < currentCount, 'The blank frame remains after duplicate, reorder, and delete');
      await frames.nth(blankIndexSafe).click(); await waitSelected(page, blankIndexSafe);
      const selectedFrame = blankFrameId;
      const blankCanvas = await canvasPixels(page);
      check(blankCanvas.rgba.every((value, index) => index % 4 === 3 ? value === 255 : value === 255), 'Selected blank frame displays only the white canvas background before painting');
      const canvasBox = await canvas.boundingBox(); assert.ok(canvasBox, 'Audio canvas is laid out');
      const clickCell = async (x, y) => canvas.click({ position: { x: canvasBox.width * (x + .5) / 16, y: canvasBox.height * (y + .5) / 16 } });
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      await clickCell(12, 12);
      await openFramePanel(page);
      check(await (await frameButtons(page)).count() === 3, 'Frame strip remains usable after cel editing');
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      await saveCurrent(page);
      let state = await inspectProject(page, imported.projectId);
      check(state.layers.length === 1, 'Saving Audio persists the visible composite as one working layer');
      check(state.composed[0][10 * 16 + 10] === -1 && state.composed[1][11 * 16 + 11] === -1, 'Flattened Audio frames omit hidden-layer pixels');
      const savedNotesAfterEdit = state.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes));
      check(savedNotesAfterEdit.every(note => note.noteId === 'manual-audio-note' || note.sourceCell?.kind === 'audio-animation'), 'Saved artwork notes are frame-linked and manual notes remain distinct');
      check(state.frames.length === 3 && state.composed[2][0] === -1, 'Blank frame remains transparent outside its edited pixel');
      const selectedCelIndex = state.frameIds.indexOf(selectedFrame);
      check(selectedCelIndex >= 0 && state.composed[selectedCelIndex][12 * 16 + 12] >= 0, 'Painting updates the selected Audio frame cel');
      check(eq(state.composed[0], before.composed[0]) && eq(state.composed[1], before.composed[1]), 'Editing a new frame leaves both imported source frames unchanged');
      const notesAfterEdit = state.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes));
      check(notesAfterEdit.some(note => note.sourceCell?.frameId === drawSource.first) && notesAfterEdit.some(note => note.sourceCell?.frameId === drawSource.second), 'Editing another frame preserves both imported frames’ song notes');
      check(notesAfterEdit.some(note => note.noteId === 'manual-audio-note'), 'Editing preserves the manual song note');

      // Erasing the visible red cell where the original hidden layer overlaps leaves transparent canvas.
      await openFramePanel(page); frames = await frameButtons(page); await frames.nth(0).click(); await waitSelected(page, 0);
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      await page.locator('#audio-tool-pen').click();
      const overlapRect = await canvas.boundingBox(); assert.ok(overlapRect, 'Canvas remains available for erase test');
      await canvas.click({ position: { x: overlapRect.width * 5.5 / 16, y: overlapRect.height * 5.5 / 16 } });
      await page.waitForFunction(() => { const c=document.querySelector('#audio-pixel-canvas'); const p=c?.getContext('2d').getImageData(5,5,1,1).data; return p && p[0]===255 && p[1]===255 && p[2]===255; }, null, { timeout: 3000 });
      check(JSON.stringify((await canvasPixels(page)).rgba.slice((5 * 16 + 5) * 4, (5 * 16 + 5) * 4 + 4)) === JSON.stringify([255, 255, 255, 255]), 'Erasing an overlapped visible pixel leaves a transparent composite, not the hidden source pixel');
      await page.locator('#audio-tool-pen').click();
      await openFramePanel(page); frames = await frameButtons(page);
      const restoredBlankIndex = await frames.evaluateAll((nodes, id) => nodes.findIndex(node => node.dataset.frameId === id), blankFrameId);
      check(restoredBlankIndex >= 0, 'Edited blank frame remains available after erasing the first frame');
      await frames.nth(restoredBlankIndex).click(); await waitSelected(page, restoredBlankIndex);
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      await saveCurrent(page);
      const afterErase = await inspectProject(page, imported.projectId);
      check(afterErase.composed[0][5 * 16 + 5] === -1, 'Erasing removes the visible pixel from the Audio working frame');
      check(afterErase.layers.length === 1 && drawSource.layers.length === 2, 'Flattened Audio edit does not change the original Draw layer structure');
      check(eq(afterErase.composed[1], state.composed[1]), 'Erasing the first frame leaves the second frame unchanged');

      // Playback follows audio frame timing, then restores the user's editing-frame selection on stop.
      const selectedCanvas = await canvasPixels(page);
      const play = page.locator('#audio-play-toggle'); await play.click();
      await page.waitForFunction(() => document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed') === 'true', null, { timeout: 6000 });
      await page.waitForFunction(() => document.querySelector('#audio-animation-controls-panel [data-action="select-frame"][aria-selected="true"]')?.dataset.index === '0', null, { timeout: 4000 });
      const playingFrameOne = await canvasPixels(page);
      check(eq(playingFrameOne.rgba, displayRGBA(afterErase.composed[0], afterErase.palette)), 'Playback begins on frame one and renders its saved composite');
      const playheadOne = await page.locator('#audio-playhead').evaluate(node => ({ hidden: node.hidden, left: node.style.left }));
      await page.waitForFunction(() => document.querySelector('#audio-animation-controls-panel [data-action="select-frame"][aria-selected="true"]')?.dataset.index === '1', null, { timeout: 5000 });
      const playingFrameTwo = await canvasPixels(page);
      check(eq(playingFrameTwo.rgba, displayRGBA(afterErase.composed[1], afterErase.palette)), 'Playback advances to frame two at its audio timeline boundary');
      const playheadTwo = await page.locator('#audio-playhead').evaluate(node => ({ hidden: node.hidden, left: node.style.left }));
      check(!playheadOne.hidden && !playheadTwo.hidden && playheadOne.left !== playheadTwo.left, 'Playhead advances while playback changes frames', { playheadOne, playheadTwo });
      await play.click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
      await page.waitForFunction(id => document.querySelector('#audio-animation-controls-panel [data-action="select-frame"][aria-selected="true"]')?.dataset.frameId === id, selectedFrame, { timeout: 5000 });
      check(eq((await canvasPixels(page)).rgba, selectedCanvas.rgba), 'Stopping playback restores the pre-play editing frame and its canvas');
      await saveCurrent(page);
      const saved = await inspectProject(page, imported.projectId);
      check(eq(saved.frames, afterErase.frames) && eq(saved.layers, afterErase.layers) && eq(saved.composed, afterErase.composed), 'Save persists all frames, flattened layer metadata and cel pixels');
      check(eq(saved.song, afterErase.song) && eq(saved.link, afterErase.link), 'Save preserves projected and manual song data plus its animation link');
      await page.reload({ waitUntil: 'domcontentloaded' }); await waitReady(page);
      const reloaded = await inspectProject(page, imported.projectId);
      check(eq(reloaded.frames, saved.frames) && eq(reloaded.layers, saved.layers) && eq(reloaded.composed, saved.composed), 'Reload restores every frame and cel');
      check(eq(reloaded.song, saved.song) && eq(reloaded.link, saved.link), 'Reload restores audio notes and animation binding');
      await openFramePanel(page);
      const selected = await page.locator('#audio-animation-controls-panel [data-action="select-frame"][aria-selected="true"]').getAttribute('data-frame-id');
      check(selected === selectedFrame, 'Reload restores the selected editing frame', { expected: selectedFrame, actual: selected });
      check(reloaded.selectedFrameId === selectedFrame, 'Saved project editor state records the selected frame identity', reloaded.selectedFrameId);
      const sourceAfterEdit = await inspectDrawSource(page, drawSource.projectId, drawSource.revisionId);
      check(eq(sourceAfterEdit.layers, drawSource.layers) && eq(sourceAfterEdit.cels, drawSource.cels) && eq(sourceAfterEdit.composed, drawSource.composed), 'Audio frame edits leave original Draw layer flags and pixels unchanged');
      await page.screenshot({ path: `${outDir}/audio-frame-reloaded-${viewport.width}x${viewport.height}.png` });

      // Color/sound popover remains fixed and exclusive with the frame workspace.
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      const paletteDetails = page.locator('#audio-palette-settings');
      await page.locator('#audio-current').click();
      const colorPanel = page.locator('#audio-color-editor-panel');
      await colorPanel.waitFor({ state: 'visible', timeout: 5000 });
      const colorRect = await colorPanel.boundingBox();
      await colorPanel.locator('[data-dce-view="sound"]').click();
      const soundBody = page.locator('#audio-palette-settings .audio-palette-settings__body');
      await soundBody.waitFor({ state: 'visible', timeout: 5000 });
      const soundRect = await soundBody.boundingBox();
      check(colorRect && soundRect && Math.abs(colorRect.x - soundRect.x) < 1 && Math.abs(colorRect.y - soundRect.y) < 1 && Math.abs(colorRect.width - soundRect.width) < 1 && Math.abs(colorRect.height - soundRect.height) < 1, 'Color and sound editors share the same fixed panel bounds', { colorRect, soundRect });
      await page.locator('#audio-animation-controls [data-action="toggle-frames"]').click();
      await page.locator('#audio-animation-controls-panel').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('#audio-palette-settings')?.open === false, null, { timeout: 3000 });
      check(!(await paletteDetails.evaluate(node => node.open)), 'Opening frame controls closes the floating color/sound panel');
      await page.screenshot({ path: `${outDir}/audio-frame-panel-${viewport.width}x${viewport.height}.png` });
      await page.locator('#audio-animation-controls-panel [data-action="close-animation"]').click();
      await page.locator('#audio-current').click();
      await colorPanel.waitFor({ state: 'visible', timeout: 5000 });
      const colorRectAfter = await colorPanel.boundingBox();
      check(colorRect && colorRectAfter && Math.abs(colorRect.x - colorRectAfter.x) < 1 && Math.abs(colorRect.y - colorRectAfter.y) < 1, 'Color panel keeps the same fixed position after frame controls close', { colorRect, colorRectAfter });
      await page.locator('#audio-color-editor-panel [data-dce-view="sound"]').click();
      await soundBody.waitFor({ state: 'visible', timeout: 5000 });

      if (viewport.width === 390) {
        // Static image projects expose the same frame launcher and lazily create the first animation frame.
        const staticFixture = await makeStaticAudioProject(page);
        await page.goto(`${base}/audio/?pxd=${encodeURIComponent(staticFixture.projectId)}&pxdRevision=${encodeURIComponent(staticFixture.revisionId)}`, { waitUntil: 'domcontentloaded' }); await waitReady(page);
        const staticBefore = await inspectProject(page, staticFixture.projectId);
        check(!staticBefore.frames, 'Static PXD fixture starts without animation frames');
        const staticLauncher = page.locator('#audio-animation-controls [data-action="toggle-frames"]');
        await staticLauncher.waitFor({ state: 'visible', timeout: 6000 }); await staticLauncher.click();
        await page.locator('#audio-animation-controls-panel.animation-controls__workspace-panel.is-frame-only').waitFor({ state: 'visible', timeout: 5000 });
        await page.locator('#audio-animation-controls-panel [data-action="add-frame"]').click();
        await page.waitForFunction(() => document.querySelectorAll('#audio-animation-controls-panel [data-action="select-frame"]').length === 2, null, { timeout: 5000 });
        await saveCurrent(page);
        const converted = await inspectProject(page, staticFixture.projectId);
        check(converted.frames?.length === 2, 'First add action promotes the static image and creates its next frame');
        check(converted.song.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes)).some(note => note.noteId === 'manual-static-note'), 'Static conversion preserves manually authored Audio notes');
        check(converted.composed?.[0]?.[2 * 16 + 2] >= 0 && converted.composed?.[1]?.[2 * 16 + 2] >= 0, 'Static image pixels are copied into the promoted and duplicated animation cels');
      }
      check(result.pageErrors.length === 0, 'No page errors in this viewport', result.pageErrors);
      result.cases.at(-1).final = { viewport, frameCount: reloaded.frames.length, layerCount: reloaded.layers.length, checks: result.checks };
      await context.close();
    }
  } finally { await browser.close(); }
  check(result.pageErrors.length === 0, 'All viewports completed without page errors', result.pageErrors);
  await writeFile(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify({ checks: result.checks, cases: result.cases.map(item => item.final), pageErrors: result.pageErrors, consoleErrors: result.consoleErrors, sourceHashes: result.sourceHashes }, null, 2) + '\n');
} catch (error) {
  result.failure = { message: error.message, stack: error.stack };
  await mkdir(outDir, { recursive: true }); await writeFile(`${outDir}/failure.json`, JSON.stringify(result, null, 2));
  throw error;
}
