import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationLayer, createAnimation, ensureAnimationMusicLayer, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { composeAudioProjectionFrame, prepareAudioAnimationImport } from '../../js/creation/audio-animation.mjs';
import { replaceAudioSourceColor } from '../../js/creation/audio-color-edit.mjs';
import { assertCreationModeCompatible } from '../../js/creation/creation-modes.mjs';
import { chooseCameraPalette, planCameraReplacement, prepareCameraTarget } from '../../js/creation/draw-camera-core.mjs';
import { encodeGif } from '../../js/pixel-lens/gif.mjs';

const opaque = '#cc3366';
const partial = '#cc336680';

function paint(animation, layerId, colorIndex = 0, x = 0) {
  const document = { schemaVersion: 1, width: animation.width, height: animation.height,
    palette: [...animation.palette], pixels: Array(animation.width * animation.height).fill(0) };
  document.pixels[x] = colorIndex + 1;
  return writeAnimationCel(animation, animation.frames[0].id, layerId, document);
}

function rgbaFrame(alpha) { return { width: 1, height: 1, data: Uint8ClampedArray.of(204, 51, 102, alpha) }; }

test('GIF rejects every partial alpha with a named PNG/background guidance error, preserving binary transparency', () => {
  for (const alpha of [1, 127, 128, 243, 254]) {
    assert.throws(() => encodeGif([rgbaFrame(alpha)]), (error) => error.code === 'gif-partial-alpha-unsupported'
      && /PNG/.test(error.message) && /背景色/.test(error.message));
  }
  assert.ok(encodeGif([rgbaFrame(0)]) instanceof Uint8Array);
  assert.ok(encodeGif([rgbaFrame(255)]) instanceof Uint8Array);
});

test('camera plans preserve RGBA target and source without mutating the target', () => {
  const document = { schemaVersion: 1, width: 1, height: 1, palette: [partial], pixels: [0] };
  const before = structuredClone(document);
  const target = prepareCameraTarget(document);
  assert.deepEqual(chooseCameraPalette(document, null), [0]);
  const result = planCameraReplacement(target, Uint8ClampedArray.of(1, 2, 3, 128));
  assert.equal(result.document.palette[result.document.pixels[0]], '#01020380');
  assert.deepEqual(document, before);
});

test('mode transition blocks alpha-bearing artwork before switching to audio but allows an empty music layer', () => {
  let artwork = createAnimation({ width: 2, height: 1, palette: [partial] });
  artwork = paint(artwork, artwork.layers[0].id);
  assert.throws(() => assertCreationModeCompatible('audio', artwork), { code: 'audio-animation-alpha-unsupported' });
  assert.equal(assertCreationModeCompatible('draw', artwork), true);
  assert.equal(assertCreationModeCompatible('camera', artwork), true);

  let blank = createAnimation({ width: 2, height: 1, palette: [partial] });
  blank = ensureAnimationMusicLayer(blank);
  assert.equal(assertCreationModeCompatible('audio', blank), true);
  const projected = prepareAudioAnimationImport(createAudioSong(), blank);
  assert.equal(projected.noteCount, 0);
  assert.equal(projected.song.tracks.flatMap((track) => track.clips).flatMap((clip) => clip.notes).length, 0);
});

test('audio projection rejects partial source or layer opacity atomically and keeps exact opaque source indices', () => {
  let animation = createAnimation({ width: 2, height: 1, palette: [opaque, partial] });
  animation = paint(animation, animation.layers[0].id, 1);
  const song = createAudioSong(); const beforeSong = structuredClone(song);
  assert.throws(() => prepareAudioAnimationImport(song, animation, { colorToSlot: { 'rgba-cc336680': 'square' } }),
    (error) => error.code === 'audio-animation-alpha-unsupported' && /音符・作品を保持/.test(error.message));
  assert.deepEqual(song, beforeSong);
  assert.deepEqual(animation.palette, [opaque, partial]);

  let opacity = createAnimation({ width: 1, height: 1, palette: [opaque] });
  opacity = setLayerProperties(opacity, opacity.layers[0].id, { opacity: 0.5 });
  opacity = paint(opacity, opacity.layers[0].id);
  assert.throws(() => composeAudioProjectionFrame(opacity, opacity.frames[0].id), { code: 'audio-animation-alpha-unsupported' });

  let exact = createAnimation({ width: 1, height: 1, palette: [opaque] });
  exact = paint(exact, exact.layers[0].id);
  assert.deepEqual(composeAudioProjectionFrame(exact, exact.frames[0].id).pixels, [0]);
});

test('changing an alpha-bearing animation color ID fails before touching palette, notes, or link', () => {
  const alphaId = 'rgba-cc336680';
  const animation = createAnimation({ width: 1, height: 1, palette: [partial] });
  const initial = prepareAudioAnimationImport(createAudioSong(), animation);
  const song = initial.song; const link = initial.link;
  const before = { animation: structuredClone(animation), song: structuredClone(song), link: structuredClone(link) };
  assert.throws(() => replaceAudioSourceColor({ animation, link, song, colorId: alphaId, hex: '#3366cc' }),
    (error) => error.code === 'audio-animation-alpha-color-unsupported' && /音符・リンクは変更していません/.test(error.message));
  assert.deepEqual(animation, before.animation);
  assert.deepEqual(song, before.song);
  assert.deepEqual(link, before.link);
});
