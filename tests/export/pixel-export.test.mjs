import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXPORT_LONG_EDGE, exportScale, saveFile } from '../../js/pixel-export.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('pictures leave PiXiEED enlarged by a whole number, about 2048px on the long edge', () => {
  assert.equal(EXPORT_LONG_EDGE, 2048);
  assert.equal(exportScale(16, 16), 128); assert.equal(exportScale(64, 32), 32); assert.equal(exportScale(48, 16), 42);
  assert.equal(exportScale(4096, 10), 1);
  assert.throws(() => exportScale(0, 16), RangeError);
});

test('phones get the share sheet; a cancelled share saves nothing; elsewhere it downloads', async () => {
  globalThis.File ??= class File extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name; } };
  const blob = new Blob(['x'], { type: 'image/png' });
  let shared = null;
  const phone = { canShare: () => true, share: async (data) => { shared = data; } };
  assert.equal(await saveFile(blob, 'a.png', { navigatorRef: phone, preferShare: true }), 'shared');
  assert.equal(shared.files[0].name, 'a.png');
  const cancel = { canShare: () => true, share: async () => { throw Object.assign(new Error('no'), { name: 'AbortError' }); } };
  assert.equal(await saveFile(blob, 'a.png', { navigatorRef: cancel, preferShare: true }), 'cancelled');
  const clicks = []; const documentRef = { body: { append() {} }, createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }) };
  assert.equal(await saveFile(blob, 'b.png', { navigatorRef: phone, preferShare: false, documentRef }), 'downloaded');
  assert.deepEqual(clicks, ['b.png']);
});

test('normal exports and creative tools stay available without perk gates', async () => {
  const draw = await read('js/creation/draw-page.mjs'); const audio = await read('js/creation/audio-page.mjs');
  const camera = await read('js/pixel-lens/app.mjs'); const pixfind = await read('js/creation/pixfind-play.mjs');
  assert.match(draw, /enlargedPng\(/);
  assert.match(draw, /\$\('#draw-timelapse-detail'\)\.addEventListener\('click', \(\) => exportTimelapse\(true\)\)/);
  assert.doesNotMatch(draw, /requestPass|px-perk/);
  assert.match(audio, /saveFile\(blob, `pixieed-dot-music-/); assert.match(audio, /renderAudioWav\(songSnapshot\)/);
  assert.match(camera, /saveFile\(blob, (?:link\.download|snapshot\.filename)/);
  assert.match(pixfind, /createPuzzleHintController\(\{ onState:/);
  assert.doesNotMatch(pixfind, /requestPass|px-perk/);
  assert.match(await read('draw/index.html'), /id="draw-timelapse-detail"/);
  assert.doesNotMatch(await read('draw/index.html'), /id="draw-timelapse-detail"[^>]*px-perk/);
  assert.match(await read('audio/index.html'), /id="audio-export-sound"/);
  for (const game of ['spot-difference', 'hidden-object']) {
    const html = await read(`play/${game}/index.html`);
    assert.match(html, /id="pixfind-hint"/);
    assert.doesNotMatch(html, /id="pixfind-hint"[^>]*px-perk/);
  }
});
