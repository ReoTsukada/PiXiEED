import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, createAnimation, getAnimationCelDocument, setAnimationFrameDuration, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { collectAudioEvents, createAudioSong } from '../../js/creation/audio-core.mjs';
import { createDrawMusicState, changeDrawMusicTempo, projectDrawMusic } from '../../js/creation/draw-music-core.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { projectLegacySharedAudioImage, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';

const GREEN = '#49643c';
const GREEN_ID = 'rgba-49643cff';

function paint(animation, entries) {
  const frame = animation.frames[0], layer = animation.layers[0];
  const cel = getAnimationCelDocument(animation, frame.id, layer.id);
  cel.pixels = Uint8Array.from(cel.pixels, value => value + 1);
  for (const [x, y] of entries) cel.pixels[y * animation.width + x] = 1;
  return writeAnimationCel(animation, frame.id, layer.id, cel);
}

test('Draw FPS edits update animation reference without changing music ticks or restarting its projection', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [GREEN] });
  animation = paint(animation, [[2, 0], [10, 0]]);
  const state = createDrawMusicState(null, animation);
  const originalEvents = collectAudioEvents(state.song);
  assert.equal(originalEvents.length, 2);

  const faster = setAnimationFrameDuration(animation, animation.frames[0].id, 50);
  const fpsUpdated = projectDrawMusic(state, faster);
  assert.notEqual(fpsUpdated, state);
  assert.equal(fpsUpdated.animation, faster, 'latest FPS metadata is retained');
  assert.deepEqual(fpsUpdated.song, state.song);
  assert.deepEqual(fpsUpdated.link, state.link);
  assert.deepEqual(collectAudioEvents(fpsUpdated.song), originalEvents);
  assert.equal(projectDrawMusic(fpsUpdated, faster), fpsUpdated, 'same timeline remains referentially stable');

  const bpmUpdated = changeDrawMusicTempo(fpsUpdated, 150);
  assert.equal(bpmUpdated.song.tempo, 150);
  assert.deepEqual(collectAudioEvents(bpmUpdated.song), originalEvents, 'BPM changes duration, not note tick placement');
  assert.equal(bpmUpdated.animation.frames[0].durationMs, 50, 'BPM changes do not rewrite Draw FPS metadata');
});

test('legacy compressed tick timing stays exact when the Draw frame duration changes', async () => {
  const width = 32;
  const song = createAudioSong({ songId: 'legacy-clock-test', tempo: 137 });
  const image = { width, height: 1, rgba: new Uint8Array(width * 4) };
  image.rgba.set([73, 100, 60, 255], (width - 8) * 4);
  const link = { rulesVersion: 'shared-canvas-v1', imageRole: 'audio', width, height: 1,
    ticksPerCell: 60, rowPitchMap: [60], colorToSlot: { [GREEN_ID]: 'square' } };
  const legacy = projectLegacySharedAudioImage(song, image, link);
  const project = await writePxdAudioState(createPxdProject(), legacy.song, { image: legacy.image, link: legacy.link });
  let animation = createAnimation({ width, height: 1, palette: [GREEN] });
  animation = paint(animation, [[width - 8, 0]]);
  const state = createDrawMusicState(project, animation);
  const exactSong = structuredClone(state.song), exactLink = structuredClone(state.link);
  const exactEvents = collectAudioEvents(state.song);

  const changedDuration = setAnimationFrameDuration(animation, animation.frames[0].id, 25);
  const next = projectDrawMusic(state, changedDuration);
  assert.equal(next.animation, changedDuration);
  assert.deepEqual(next.song, exactSong);
  assert.deepEqual(next.link, exactLink);
  assert.deepEqual(collectAudioEvents(next.song), exactEvents);
});
