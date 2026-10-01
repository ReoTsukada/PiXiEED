import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, writeAnimationCel, addAnimationFrame, addAnimationLayer, setLayerProperties, hasAnimationCelContent } from '../../js/creation/animation-core.mjs';

test('cel content follows sparse paint, copy and erase without changing earlier snapshots', () => {
  let animation = createAnimation({ width: 64, height: 64, palette: ['#123456'] });
  const frameId = animation.frames[0].id, layerId = animation.layers[0].id;
  assert.equal(hasAnimationCelContent(animation, frameId, layerId), false);
  const empty = animation;
  const pixels = new Uint8Array(64 * 64); pixels[pixels.length - 1] = 1;
  animation = writeAnimationCel(animation, frameId, layerId, { width: 64, height: 64, pixels });
  assert.equal(hasAnimationCelContent(animation, frameId, layerId), true);
  assert.equal(hasAnimationCelContent(empty, frameId, layerId), false);
  animation = addAnimationFrame(animation);
  const copyFrameId = animation.frames[1].id;
  assert.equal(hasAnimationCelContent(animation, copyFrameId, layerId), true);
  const painted = animation;
  animation = writeAnimationCel(animation, copyFrameId, layerId, { width: 64, height: 64, pixels: new Uint8Array(64 * 64) });
  assert.equal(hasAnimationCelContent(animation, copyFrameId, layerId), false);
  assert.equal(hasAnimationCelContent(animation, frameId, layerId), true);
  assert.equal(hasAnimationCelContent(painted, copyFrameId, layerId), true);
  animation = addAnimationLayer(animation);
  assert.equal(hasAnimationCelContent(animation, frameId, animation.layers[1].id), false);
  animation = setLayerProperties(animation, layerId, { visible: false, locked: true });
  assert.equal(hasAnimationCelContent(animation, frameId, layerId), true, 'hidden or locked artwork still receives a content mark');
  assert.throws(() => hasAnimationCelContent(animation, 'missing-frame', layerId));
});
