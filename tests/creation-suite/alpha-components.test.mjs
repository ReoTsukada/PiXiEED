import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMATION_ALPHA_SCHEMA_VERSION,
  ANIMATION_COMPOSITING,
  ANIMATION_PALETTE_ENCODING,
  ANIMATION_PIXEL_ENCODING,
  composeAnimationFrameRgba,
  createAnimationFromSerialized,
  getAnimationCelDocument,
  writeAnimationCel
} from '../../js/creation/animation-core.mjs';
import { composeMusicProjectionFrame, createDrawMusicTrackState } from '../../js/creation/draw-music-core.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { prepareSharedAudioImageImport, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdSharedImage, readPxdImage } from '../../js/creation/pxd-project.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { replaceProjectComponentImage } from '../../js/creation/project-components.mjs';

const meta = (palette, layers) => ({
  schemaVersion: ANIMATION_ALPHA_SCHEMA_VERSION,
  pixelEncoding: ANIMATION_PIXEL_ENCODING,
  paletteEncoding: ANIMATION_PALETTE_ENCODING,
  compositing: ANIMATION_COMPOSITING,
  width: 1, height: 1, palette,
  frames: [{ id: 'frame-1', durationMs: 100 }],
  layers
});

function cel(animation, frameId, layerId, value) {
  const document = getAnimationCelDocument(animation, frameId, layerId);
  document.pixels[0] = value;
  return writeAnimationCel(animation, frameId, layerId, {
    ...document, pixels: Uint8Array.from(document.pixels, index => index + 1)
  });
}

test('RGBA projection keeps a palette-exact alpha swatch and accepts a blank reserved music layer', async () => {
  let animation = createAnimationFromSerialized(meta(['#e75445f3'], [
    { id: 'music-layer', name: 'Music', visible: true, locked: true, role: 'music' },
    { id: 'art-layer', name: 'Art', visible: true, locked: false }
  ]), []);
  animation = cel(animation, 'frame-1', 'art-layer', 0);
  const projectedFrame = composeMusicProjectionFrame(animation, 'frame-1');
  assert.deepEqual(projectedFrame.palette, ['#e75445f3']);
  assert.deepEqual(projectedFrame.pixels, [0]);

  const state = await createDrawMusicTrackState(null, animation);
  assert.equal(state.musicTrackMode, true);
  assert.equal(state.musicAnimation.frames.length, 1);
  assert.equal(state.song.tracks.every(track => track.clips.every(clip => clip.notes.length === 0)), true,
    'a blank shared music cel does not force indexing/composition of the alpha artwork');
});

test('source-over blends outside the source palette fail with a named error before music projection', () => {
  let animation = createAnimationFromSerialized(meta(['#ff000080', '#0000ff80'], [
    { id: 'bottom', name: 'Bottom', visible: true, locked: false },
    { id: 'top', name: 'Top', visible: true, locked: false }
  ]), []);
  animation = cel(animation, 'frame-1', 'bottom', 0);
  animation = cel(animation, 'frame-1', 'top', 1);
  const composed = composeAnimationFrameRgba(animation, 'frame-1');
  assert.deepEqual([...composed.rgba], [85, 0, 170, 192]);
  assert.throws(() => composeMusicProjectionFrame(animation, 'frame-1'), error =>
    error.code === 'DRAW_MUSIC_RGBA_PROJECTION_UNSUPPORTED');
});

test('audio replacement stores an exact RGBA animation poster without stale indexed sidecar', async () => {
  let project = createPxdProject({ projectId: 'alpha-audio-poster' });
  const blank = { width: 1, height: 1, rgba: new Uint8Array(4) };
  project = await putPxdSharedImage(project, blank);
  const song = createAudioSong({ songId: 'alpha-audio-song' });
  const audioPlan = prepareSharedAudioImageImport(song, blank, { rowPitchMap: [60] });
  project = await writePxdAudioState(project, audioPlan.song, { image: audioPlan.image, link: audioPlan.link });

  let animation = createAnimationFromSerialized(meta(['#e75445f3'], [
    { id: 'paint', name: 'Paint', visible: true, locked: false }
  ]), []);
  animation = cel(animation, 'frame-1', 'paint', 0);
  project = await writePxdAnimation(project, animation, { role: 'main', posterFrameId: 'frame-1' });
  const expected = new Uint8Array(composeAnimationFrameRgba(animation, 'frame-1').rgba);
  const replaced = await replaceProjectComponentImage(project, 'audio', blank);
  const poster = await readPxdImage(replaced, 'audio');
  assert.deepEqual(poster.rgba, expected);
  assert.equal(replaced.entries.some(entry => entry.path === 'images/audio/draw.json'), false,
    'the RGBA poster does not leave an inconsistent indexed Draw sidecar');
  assert.ok(await readPxdAnimation(replaced, 'audio'));
});
