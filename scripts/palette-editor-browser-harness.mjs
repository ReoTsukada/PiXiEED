/** Local-only regressions for color sheets, autosave, source recoloring and sound assignment. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
async function seed(page, tool) {
  return page.evaluate(async tool => {
    const { createPxdProject } = await import('/js/creation/pxd-codec.mjs');
    const { putPxdSharedImage } = await import('/js/creation/pxd-project.mjs');
    const { importToolProject } = await import('/js/creation/tool-project-import.mjs');
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
    const colors = [[230, 80, 70], [250, 220, 90], [60, 170, 110], [80, 150, 210], [160, 76, 175]];
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) rgba.set([...colors[Math.min(4, Math.floor(x / 3.5))], 255], (y * 16 + x) * 4);
    const input = await putPxdSharedImage(createPxdProject({ manifest: { title: '色と音の検証' } }), { width: 16, height: 16, rgba });
    const project = await createToolProjectStore(tool).save(await importToolProject(input, tool), { expectedRevisionId: null });
    const other = tool === 'draw' ? 'audio' : 'draw';
    const copy = await createToolProjectStore(other).save(await importToolProject(project, other), { expectedRevisionId: null });
    return { id: project.projectId, revision: project.revisionId, copyId: copy.projectId };
  }, tool);
}
async function snapshot(page, id) {
  return page.evaluate(async id => {
    const project = await (await import('/js/creation/pxd-store.mjs')).createPxdStore().load(id);
    const { componentImageRole } = await import('/js/creation/project-components.mjs');
    const role = componentImageRole(project, project.manifest.toolProject.tool);
    const image = await (await import('/js/creation/pxd-project.mjs')).readPxdImage(project, role);
    const { readPxdAudioState, readPxdAudioLink } = await import('/js/creation/pxd-draw-audio.mjs');
    return { id: project.projectId, revision: project.revisionId, rgba: Array.from(image.rgba), song: readPxdAudioState(project), link: readPxdAudioLink(project) };
  }, id);
}
async function saved(page) { await page.waitForFunction(() => document.querySelector('#project-open').dataset.state === 'saved'); }
async function fits(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(), header = document.querySelector('.site-header').getBoundingClientRect(), nav = document.querySelector('.app-tabs').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= header.bottom && r.bottom <= nav.top + 1
      && document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1;
  });
}
const canvasPixels = (page, selector) => page.locator(selector).evaluate(c => Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data));
async function paletteAppearance(page, tool) {
  return page.evaluate(tool => {
    const isDraw = tool === 'draw';
    const palette = document.querySelector(isDraw ? '#draw-palette' : '#audio-tracks');
    const tile = palette.querySelector(isDraw ? '.draw-color:not(.draw-color--transparent)' : '[data-color-id]');
    const selected = palette.querySelector('[aria-pressed="true"]');
    const current = document.querySelector(isDraw ? '.draw-current' : '#audio-current');
    const pick = (el, keys) => Object.fromEntries(keys.map(key => [key, getComputedStyle(el)[key]]));
    return {
      tile: pick(tile, ['width', 'height', 'borderRadius', 'borderWidth']),
      selected: selected && pick(selected, ['borderColor', 'boxShadow', 'transform']),
      current: pick(current, ['width', 'height', 'borderRadius']),
      currentSwatch: pick(current.querySelector('span'), ['width', 'height', 'borderWidth', 'borderColor', 'borderRadius', 'boxShadow']),
      row: { gap: getComputedStyle(palette.parentElement).gap, columns: getComputedStyle(palette.parentElement).gridTemplateColumns.split(' ').length, leadingColumn: getComputedStyle(palette.parentElement).gridTemplateColumns.split(' ').length === 2 ? getComputedStyle(palette.parentElement).gridTemplateColumns.split(' ')[0] : 'fluid' },
      palette: pick(palette, ['gridAutoFlow', 'gridAutoColumns', 'gap', 'padding', 'overflowX', 'overflowY'])
    };
  }, tool);
}
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/draw/`); await page.waitForFunction(() => !document.querySelector('#main').inert);
    const draw = await seed(page, 'draw');
    await page.goto(`${base}/draw/?` + new URLSearchParams({ pxd: draw.id, pxdRevision: draw.revision }));
    await page.waitForFunction(() => !document.querySelector('#main').inert);
    const drawCopy = await snapshot(page, draw.copyId), drawBefore = await canvasPixels(page, '#draw-canvas');
    const drawPaletteAppearance = await paletteAppearance(page, 'draw');
    if (viewport.width === 390 || viewport.width === 1280) await page.screenshot({ path: `/tmp/pixieed-draw-palette-${viewport.width}.png` });
    await page.locator('.draw-current').click();
    await page.locator('.dce-quick button[aria-label="#ff4d4d"]').click();
    await saved(page); await page.waitForTimeout(1200); // Exceed another autosave interval while the sheet remains open.
    assert.equal(await page.locator('#draw-color-editor').isVisible(), true, 'Autosave leaves color editing open');
    assert.equal(await fits(page, '#draw-color-editor'), true, 'Color editor stays between fixed navigation and header');
    const drawAfter = await canvasPixels(page, '#draw-canvas'); assert.notDeepEqual(drawAfter, drawBefore);
    assert.deepEqual((await snapshot(page, draw.id)).rgba, drawAfter, 'Autosave includes the pending palette edit');
    await page.locator('#dce-done').click(); await page.locator('#draw-undo').click();
    assert.deepEqual(await canvasPixels(page, '#draw-canvas'), drawBefore, 'One Undo restores the complete color edit');
    await saved(page); assert.deepEqual(await snapshot(page, draw.copyId), drawCopy, 'Another tool project remains untouched');
    const swatch = page.locator('.draw-color[data-color-index="1"]'); const box = await swatch.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.locator('#draw-color-editor').waitFor({ state: 'visible' });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250); assert.equal(await page.locator('#draw-color-editor').isVisible(), true, 'Long-press release does not close editing');
    await page.locator('#dce-done').click();
    assert.deepEqual(errors, []); console.log(`PASS Draw ${viewport.width}x${viewport.height}: autosave, pending color persistence, Undo, project isolation, touch release, sheet fit`);
    await page.goto(`${base}/audio/`); await page.waitForFunction(() => !document.querySelector('#main').inert);
    await page.locator('#audio-tracks [data-color-id="rgba-4c82c3ff"]').click();
    const blankMusic = await canvasPixels(page, '#audio-pixel-canvas');
    await page.locator('#audio-current').click();
    await page.locator('#audio-hue').evaluate(el => { el.value = '190'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await saved(page);
    assert.equal(await page.locator('#audio-palette-settings').evaluate(el => el.open), true);
    assert.deepEqual(await canvasPixels(page, '#audio-pixel-canvas'), blankMusic, 'Editing an unused palette color never paints the blank canvas');
    assert.equal(await page.locator('#audio-tracks [data-color-id]').count(), 4, 'All four initial colors stay available');
    await page.locator('#audio-palette-close').click();
    await page.locator('.audio-track-choice--add').click();
    assert.equal(await page.locator('#audio-palette-settings').evaluate(el => el.open), true, 'Adding a color opens the custom editor');
    assert.equal(await page.locator('input[type="color"]').count(), 0, 'Color editing uses the site editor');
    await page.locator('#audio-hue').evaluate(el => { el.value = '110'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await saved(page);
    assert.deepEqual(await canvasPixels(page, '#audio-pixel-canvas'), blankMusic);
    assert.equal(await page.locator('#audio-tracks [data-color-id]').count(), 5);
    await page.locator('#audio-palette-close').click();
    const audio = await seed(page, 'audio');
    await page.goto(`${base}/audio/?` + new URLSearchParams({ pxd: audio.id, pxdRevision: audio.revision }));
    await page.waitForFunction(() => !document.querySelector('#main').inert);
    const audioCopy = await snapshot(page, audio.copyId);
    await page.locator('#audio-tracks [data-color-id]').first().waitFor();
    await page.waitForTimeout(180);
    assert.deepEqual(await paletteAppearance(page, 'audio'), drawPaletteAppearance, 'Draw and Audio share swatch, selection and responsive palette layout');
    if (viewport.width === 390 || viewport.width === 1280) await page.screenshot({ path: `/tmp/pixieed-audio-palette-${viewport.width}.png` });
    await page.locator('#audio-tempo').evaluate(el => { el.value = '121'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await saved(page);
    const audioBefore = await snapshot(page, audio.id);
    const timing = song => song.tracks.map(track => ({ trackId: track.trackId, instrument: track.instrument, clips: track.clips.map(clip => ({ clipId: clip.clipId, startTick: clip.startTick, notes: clip.notes.map(({ colorId, sourceCell, ...note }) => ({ ...note, sourceCell: sourceCell && Object.fromEntries(Object.entries(sourceCell).filter(([key]) => key !== 'colorId')) })) })) }));
    await page.locator('#audio-current').click();
    await page.locator('#audio-hue').evaluate(el => { el.value = '270'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await saved(page); await page.waitForTimeout(1200);
    assert.equal(await page.locator('#audio-palette-settings').evaluate(el => el.open), true, 'Music autosave leaves color editing open');
    assert.equal(await fits(page, '.audio-palette-settings__body'), true, 'Music sheet fits around fixed navigation');
    const recolored = await snapshot(page, audio.id);
    assert.notDeepEqual(recolored.rgba, audioBefore.rgba, 'Image source colors really change');
    assert.deepEqual(recolored.rgba, await canvasPixels(page, '#audio-pixel-canvas'));
    assert.deepEqual(timing(recolored.song), timing(audioBefore.song), 'RGB editing retains all note timing, pitch and velocity');
    assert.equal(recolored.song.tempo, 121);
    await page.locator('#audio-palette-close').click();
    const plainColor = page.locator('#audio-tracks [data-color-id="rgba-a04cafff"]');
    assert.equal(await plainColor.locator('img').count(), 0, 'An unassigned color is a plain swatch');
    await plainColor.click(); await plainColor.click();
    await page.locator('[data-audio-editor-view="sound"]').click();
    assert.equal(await page.locator('#audio-sound-slots > button').count(), 4);
    const slots = await page.locator('#audio-sound-slots > button').evaluateAll(buttons => buttons.map(b => ({ text: b.textContent, images: b.querySelectorAll('img').length, label: b.getAttribute('aria-label'), width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })));
    for (const slot of slots) { assert.equal(slot.text, ''); assert.equal(slot.images, 1); assert.ok(slot.label && slot.width >= 44 && slot.height >= 44); }
    const firstSound = page.locator('#audio-sound-slots > button').first(); const slotId = await firstSound.getAttribute('data-sound-slot');
    await firstSound.click(); await saved(page);
    assert.equal((await snapshot(page, audio.id)).link.colorToSlot['rgba-a04cafff'], slotId, 'One sound icon assigns the chosen color');
    assert.equal(await plainColor.locator('img').count(), 1, 'A mapped color displays its instrument icon');
    const instrument = page.locator('.audio-instrument-group[open] button[data-instrument][aria-pressed="false"]').first();
    const instrumentId = await instrument.getAttribute('data-instrument');
    await instrument.click(); await saved(page);
    assert.equal((await snapshot(page, audio.id)).song.pixelPalette.find(slot => slot.slotId === slotId).instrument, instrumentId);
    assert.equal(await fits(page, '.audio-palette-settings__body'), true);
    assert.equal(await page.locator('.audio-instrument-choices button[aria-pressed="true"]').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)', 'Selected instrument text remains legible');
    await page.locator('#audio-sound-unassign').click(); await saved(page);
    assert.equal((await snapshot(page, audio.id)).link.colorToSlot['rgba-a04cafff'], null);
    assert.equal(await plainColor.locator('img').count(), 0, 'Removing a sound restores a plain swatch');
    await page.locator(`.audio-instrument-choices [data-instrument="${instrumentId}"]`).click(); await saved(page);
    assert.equal((await snapshot(page, audio.id)).link.colorToSlot['rgba-a04cafff'], slotId, 'Choosing an instrument directly also assigns it to an unassigned color');
    await page.locator('#audio-palette-close').click();
    const play = page.locator('#audio-play-toggle');
    assert.equal((await play.textContent()).trim(), ''); assert.ok(await play.locator('svg').count());
    await play.click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').dataset.state === 'playing');
    assert.equal(await play.getAttribute('aria-label'), '曲を停止'); await play.click();
    assert.equal(await play.getAttribute('aria-label'), '曲を再生');
    const latest = await snapshot(page, audio.id); assert.deepEqual(await snapshot(page, audio.copyId), audioCopy);
    // Plain entry intentionally creates a blank project. Reopen through the actual project picker.
    await page.goto(`${base}/audio/`); await page.locator('#project-open').click();
    await page.locator('#project-tab-library').click();
    await page.locator(`.project-card[data-project-id="${audio.id}"]`).click();
    await saved(page); await page.waitForFunction(() => !document.querySelector('#main').inert);
    assert.deepEqual(await canvasPixels(page, '#audio-pixel-canvas'), latest.rgba, 'Reopened project retains edited source colors');
    assert.deepEqual(errors, []);
    if (viewport.width === 390) {
      await page.locator('#audio-tracks [data-color-id="rgba-a04cafff"]').click();
      if (!await page.locator('#audio-palette-settings').evaluate(el => el.open)) await page.locator('#audio-current').click();
      await page.locator('[data-audio-editor-view="sound"]').click();
      await page.screenshot({ path: '/tmp/pixieed-audio-color-sound.png' });
    }
    console.log(`PASS Audio ${viewport.width}x${viewport.height}: RGB/timing persistence, icon assignment, instruments, play/stop, project isolation, reopen, sheet fit`);
    await context.close();
  }
} finally { await browser.close(); }
