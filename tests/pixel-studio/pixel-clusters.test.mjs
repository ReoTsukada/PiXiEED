import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPixelClusters } from '../../js/pixel-studio/pixel-clusters.mjs';

const palette = [[100, 100, 100], [104, 100, 100]];

function fixture({ width = 7, height = 7, candidate = 1, sourceCenter = [102, 100, 100] } = {}) {
  const count = width * height;
  const indices = new Uint8Array(count);
  const objects = new Uint32Array(count).fill(1);
  const materials = new Float64Array(count).fill(1);
  const sourceRgb = new Uint8Array(count * 3);
  for (let cell = 0; cell < count; cell++) sourceRgb.set([100, 100, 100], cell * 3);
  const center = Math.floor(height / 2) * width + Math.floor(width / 2);
  indices[center] = candidate;
  sourceRgb.set(sourceCenter, center * 3);
  return { width, height, indices, objects, materials, sourceRgb, center };
}

test('removes one weak, isolated speck in a flat same-material area without blending', () => {
  const input = fixture();
  const before = input.indices.slice();
  const result = cleanPixelClusters({ ...input, palette });
  assert.equal(result.removedCells, 1);
  assert.equal(result.indices[input.center], 0);
  assert.deepEqual([...result.indices].filter((value) => value === 1), []);
  assert.deepEqual(input.indices, before);
});

test('keeps an isolated high-contrast detail such as an eye', () => {
  const input = fixture({ sourceCenter: [190, 40, 35] });
  const result = cleanPixelClusters({ ...input, palette });
  assert.equal(result.removedCells, 0);
  assert.equal(result.indices[input.center], 1);
});

test('preserves horizontal and diagonal one-pixel strokes', () => {
  for (const points of [
    [[2, 3], [3, 3], [4, 3]],
    [[2, 2], [3, 3], [4, 4]],
  ]) {
    const input = fixture();
    input.indices.fill(0);
    for (const [x, y] of points) input.indices[y * input.width + x] = 1;
    const result = cleanPixelClusters({ ...input, palette });
    assert.equal(result.removedCells, 0);
    for (const [x, y] of points) assert.equal(result.indices[y * input.width + x], 1);
  }
});

test('does not borrow a majority across object or material boundaries', () => {
  for (const split of ['object', 'material']) {
    const input = fixture();
    input.indices.fill(0);
    input.indices[input.center] = 1;
    for (let cell = 0; cell < input.indices.length; cell++) {
      if (cell === input.center) continue;
      if (split === 'object') input.objects[cell] = 2;
      else input.materials[cell] = 2;
    }
    const result = cleanPixelClusters({ ...input, palette });
    assert.equal(result.removedCells, 0, split);
    assert.equal(result.indices[input.center], 1, split);
  }
});

test('honors protectedCells and leaves all inputs unchanged', () => {
  const input = fixture();
  const protectedCells = new Uint8Array(input.indices.length);
  protectedCells[input.center] = 1;
  const snapshot = Object.fromEntries(['indices', 'objects', 'materials', 'sourceRgb'].map((key) => [key, input[key].slice()]));
  const result = cleanPixelClusters({ ...input, palette, protectedCells });
  assert.equal(result.removedCells, 0);
  assert.equal(result.indices[input.center], 1);
  for (const key of Object.keys(snapshot)) assert.deepEqual(input[key], snapshot[key], key);
  assert.notEqual(result.indices, input.indices);
});

test('rejects malformed arrays and invalid palette indexes', () => {
  const input = fixture();
  assert.throws(() => cleanPixelClusters({ ...input, palette, objects: new Uint8Array(input.objects) }), /objects/);
  assert.throws(() => cleanPixelClusters({ ...input, palette, protectedCells: new Uint8Array(1) }), /protectedCells/);
  input.indices[input.center] = 2;
  assert.throws(() => cleanPixelClusters({ ...input, palette }), /out of range/);
});

test('accepts compact Uint32 material-region identifiers without coercion', () => {
  const input = fixture();
  input.materials = new Uint32Array(input.materials);
  const result = cleanPixelClusters({ ...input, palette });
  assert.equal(result.removedCells, 1);
  assert.equal(input.materials instanceof Uint32Array, true);
});
