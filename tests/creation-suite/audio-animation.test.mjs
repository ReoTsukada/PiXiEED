import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, addAnimationLayer, composeAnimationFrame, createAnimation, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { AUDIO_BAR_TICKS, AUDIO_MAX_LOOP_TICKS, AUDIO_PIXEL_TICKS, collectAudioEvents, createAudioSong, extendAudioLoopForImage, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, prepareAudioAnimationImport, setAudioAnimationPixel, validateAudioAnimationBinding } from '../../js/creation/audio-animation.mjs';

const RED = '#ff0000';
const BLUE = '#0000ff';
const RED_ID = 'rgba-ff0000ff';
const BLUE_ID = 'rgba-0000ffff';

function blankDoc(width, height) { return { schemaVersion: 1, width, height, palette: [RED, BLUE], pixels: Array(width * height).fill(0) }; }
function paint(animation, frameId, layerId, entries) {
  const document = blankDoc(animation.width, animation.height);
  for (const [x, y, paletteIndex] of entries) document.pixels[y * animation.width + x] = paletteIndex + 1;
  return writeAnimationCel(animation, frameId, layerId, document);
}

test('explicit import places ordered frames on an independent PPQ timeline and keeps frame durations out of audio time', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first, durationMs: 9000 });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[15, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0], [1, 0, 1]]);
  const song = createAudioSong({ tempo: 120 });
  const result = prepareAudioAnimationImport(song, animation, { colorToSlot: { [RED_ID]: 'square' } });

  assert.equal(result.link.rulesVersion, AUDIO_ANIMATION_LINK_VERSION);
  assert.equal(result.link.imageRole, 'audio');
  assert.equal(result.link.sequenceTicks, 32 * AUDIO_PIXEL_TICKS);
  assert.equal(result.song.loopTicks, AUDIO_BAR_TICKS * 2);
  assert.equal(result.durationSeconds, 4);
  assert.equal(result.link.colorToSlot[RED_ID], 'square');
  assert.equal(result.link.colorToSlot[BLUE_ID], null, 'colors without an existing mapping remain silent');
  const notes = result.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.deepEqual(notes.map(({ startTick, sourceCell }) => [startTick, sourceCell.frameId, sourceCell.x]), [
    [15 * AUDIO_PIXEL_TICKS, first, 15],
    [16 * AUDIO_PIXEL_TICKS, second, 16]
  ]);
  assert.deepEqual(collectAudioEvents(result.song, { joinAdjacent: true }).map(({ startTick, durationTicks }) => [startTick, durationTicks]), [
    [15 * AUDIO_PIXEL_TICKS, 2 * AUDIO_PIXEL_TICKS]
  ]);
  assert.equal(validateAudioAnimationBinding(result.song, animation, result.link), result.song);
});

test('hidden layers stay silent and animation refresh preserves manual song notes and valid color mappings', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const baseLayer = animation.layers[0].id;
  animation = addAnimationLayer(animation, { visible: false });
  const hiddenLayer = animation.layers[1].id;
  animation = paint(animation, animation.frames[0].id, baseLayer, [[0, 0, 0]]);
  animation = paint(animation, animation.frames[0].id, hiddenLayer, [[1, 0, 1]]);
  const song = setAudioPixel(createAudioSong(), { trackId: 'track-triangle', pitch: 60, startTick: 0, noteId: 'manual-note' });
  const result = prepareAudioAnimationImport(song, animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'noise' } });
  const notes = result.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.ok(notes.some(({ noteId }) => noteId === 'manual-note'));
  assert.deepEqual(notes.filter(({ sourceCell }) => sourceCell?.kind === 'audio-animation').map(({ colorId }) => colorId), [RED_ID]);
  assert.equal(result.link.colorToSlot[BLUE_ID], 'noise');
});

test('sequence projects do not join the last cell back to the first, and adjacent color changes stay separate', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[0, 0, 0], [15, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0], [1, 0, 1]]);
  const result = prepareAudioAnimationImport(createAudioSong(), animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'square' } });
  const events = collectAudioEvents(result.song, { joinAdjacent: true });
  assert.deepEqual(events.map(({ startTick, durationTicks, pitch }) => [startTick, durationTicks, pitch]), [
    [0, AUDIO_PIXEL_TICKS, 66],
    [15 * AUDIO_PIXEL_TICKS, 2 * AUDIO_PIXEL_TICKS, 66],
    [17 * AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS, 66]
  ]);
});

test('sequence length supports 128 frames at 256 columns while staying within a bounded song loop', () => {
  const song = createAudioSong();
  const grown = extendAudioLoopForImage(song, 256, { frameCount: 128 });
  assert.equal(grown.loopTicks, AUDIO_BAR_TICKS * 2048);
  assert.equal(grown.loopTicks, AUDIO_MAX_LOOP_TICKS);
  assert.throws(() => extendAudioLoopForImage(song, 256, { frameCount: 129 }), /1〜128枚/);
});

test('malformed composed pixels and stale sequence metadata fail closed', () => {
  const animation = createAnimation({ width: 16, height: 1, palette: [RED] });
  assert.throws(() => prepareAudioAnimationImport(createAudioSong(), animation, {
    composeFrame: () => ({ schemaVersion: 1, width: 16, height: 1, palette: [RED], pixels: [257, ...Array(15).fill(-1)] })
  }), /不正な色番号/);
  const result = prepareAudioAnimationImport(createAudioSong(), animation);
  assert.throws(() => validateAudioAnimationBinding(result.song, animation, { ...result.link, frameIds: ['stale-frame'] }), /保存情報が一致しません/);
});

test('painting transparent and indexed animation pixels preserves every other palette color', () => {
  let animation = createAnimation({ width: 3, height: 1, palette: [RED, BLUE] });
  const frameId = animation.frames[0].id; const layerId = animation.layers[0].id;
  animation = paint(animation, frameId, layerId, [[0, 0, 0], [1, 0, 1]]);
  const link = createAudioAnimationLink(createAudioSong(), animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'noise' } });
  const erased = setAudioAnimationPixel(animation, link, { frameId, layerId, x: 0, y: 0, active: false });
  assert.equal(composeAnimationFrame(erased.animation, frameId).pixels[0], -1);
  assert.equal(composeAnimationFrame(erased.animation, frameId).pixels[1], 1);
  const painted = setAudioAnimationPixel(erased.animation, link, { frameId, layerId, x: 2, y: 0, colorId: RED_ID, active: true });
  assert.deepEqual([...composeAnimationFrame(painted.animation, frameId).pixels], [-1, 1, 0]);
});
