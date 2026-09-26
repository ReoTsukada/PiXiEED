import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleLensFrame } from '../../js/pixel-studio/lens-direct-sampler.mjs';

test('direct Lens shrink averages each source tile without mixing adjacent output cells', () => {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const p = (y * 4 + x) * 4;
    data.set(x < 2 ? [200, 20, 20, 255] : [20, 30, 210, 255], p);
  }
  const source = { width: 4, height: 4, data };
  const sampled = sampleLensFrame(source, 2);
  assert.equal(sampled.width, 2);
  assert.equal(sampled.height, 2);
  assert.deepEqual(Array.from(sampled.data.slice(0, 8)), [200, 20, 20, 255, 20, 30, 210, 255]);
  assert.deepEqual(source.data, data);
});
