import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnimation, ensureAnimationNormalLayer, getAnimationCelDocument,
  getAnimationLayerPalette, NORMAL_MAP_PALETTE, serializeAnimationPool, writeAnimationCel
} from '../../js/creation/animation-core.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
import { getAudioAnimationUsedColorIds } from '../../js/creation/audio-animation.mjs';

test('shared palette changes remap art cels but preserve a deduplicated normal-map cel', () => {
  const palette = ['#ff0000', '#0000ff'];
  let animation = createAnimation({ width: 2, height: 1, palette });
  const frameId = animation.frames[0].id;
  const artLayerId = animation.layers[0].id;
  animation = ensureAnimationNormalLayer(animation);
  const normalLayerId = animation.layers.find(layer => layer.role === 'normal').id;

  // Identical encoded bytes intentionally share a pool tile across roles.
  const cel = Uint8Array.of(1, 2);
  animation = writeAnimationCel(animation, frameId, artLayerId, { width: 2, height: 1, pixels: cel });
  animation = writeAnimationCel(animation, frameId, normalLayerId, { width: 2, height: 1, pixels: cel });
  const sharedTiles = serializeAnimationPool(animation).filter(tile => tile.frameId === frameId);
  assert.equal(sharedTiles.find(tile => tile.layerId === artLayerId).tileId, sharedTiles.find(tile => tile.layerId === normalLayerId).tileId);

  const plan = planSharedProjectSettings(animation, { palette: [...palette].reverse() });
  assert.deepEqual(plan.animation.palette, [...palette].reverse());
  assert.deepEqual(getAnimationCelDocument(plan.animation, frameId, artLayerId).pixels, [1, 0]);
  assert.deepEqual(getAnimationCelDocument(plan.animation, frameId, normalLayerId).pixels, [0, 1]);
  assert.deepEqual(getAnimationLayerPalette(plan.animation, normalLayerId), NORMAL_MAP_PALETTE);
  assert.deepEqual(getAnimationLayerPalette(plan.animation, artLayerId), [...palette].reverse());
});

test('normal-map swatches do not consume shared audio color assignments', () => {
  let animation = createAnimation({ width: 2, height: 1, palette: ['#ff0000', '#0000ff'] });
  const frameId = animation.frames[0].id;
  const artLayerId = animation.layers[0].id;
  animation = ensureAnimationNormalLayer(animation);
  const normalLayerId = animation.layers.find(layer => layer.role === 'normal').id;
  animation = writeAnimationCel(animation, frameId, artLayerId, {
    width: 2, height: 1, pixels: Uint8Array.of(1, 0)
  });
  animation = writeAnimationCel(animation, frameId, normalLayerId, {
    width: 2, height: 1, pixels: Uint8Array.of(1, 2)
  });

  assert.deepEqual([...getAudioAnimationUsedColorIds(animation)], ['rgba-ff0000ff']);
});
