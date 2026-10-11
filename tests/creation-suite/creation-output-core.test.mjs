import test from 'node:test';
import assert from 'node:assert/strict';
import { composeOutputFrame } from '../../js/creation/creation-output-core.mjs';
import { createAnimation, ensureAnimationMusicLayer, writeAnimationCel, getAnimationCelDocument, setLayerProperties } from '../../js/creation/animation-core.mjs';

test('output excludes music by default and can include hidden music without changing layer visibility', () => {
  let animation = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 1, palette: ['#111111', '#eeeeee'] }));
  const [music, art] = animation.layers;
  const frameId = animation.frames[0].id;
  animation = writeAnimationCel(animation, frameId, music.id, { width: 2, height: 1, pixels: [1, 0] });
  animation = writeAnimationCel(animation, frameId, art.id, { width: 2, height: 1, pixels: [0, 1] });

  assert.deepEqual(composeOutputFrame(animation, frameId).pixels, [-1, 0]);
  assert.deepEqual(composeOutputFrame(animation, frameId, { includeMusic: true }).pixels, [0, 0]);
  assert.equal(animation.layers[0].visible, false);
  assert.deepEqual(getAnimationCelDocument(animation, frameId, music.id).pixels, [0, -1]);

  animation = setLayerProperties(animation, music.id, { visible: true });
  assert.deepEqual(composeOutputFrame(animation, frameId).pixels, [-1, 0]);
  assert.deepEqual(composeOutputFrame(animation, frameId, { includeMusic: true }).pixels, [0, 0]);
});

test('output without a music layer matches ordinary animation composition', () => {
  const animation = createAnimation({ width: 1, height: 1 });
  const frameId = animation.frames[0].id;
  assert.deepEqual(composeOutputFrame(animation, frameId).pixels, composeOutputFrame(animation, frameId, { includeMusic: true }).pixels);
});
