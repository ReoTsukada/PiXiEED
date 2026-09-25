import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoundarySampler } from '../../js/pixel-studio/boundary-sampler.mjs';

function frame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const [r, g, b, a = 255] = colorAt(x, y);
    data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = a;
  }
  return { width, height, data };
}

function segmentation(width, height, labelAt) {
  return { width, height, labels: Uint32Array.from({ length: width * height }, (_, i) => labelAt(i % width, Math.floor(i / width))) };
}

function rgbAt(result, x, y) {
  const p = (y * result.width + x) * 4;
  return [...result.data.subarray(p, p + 4)];
}

test('unsegmented output is the exact center source RGB with opaque alpha and no input mutation', () => {
  const input = frame(7, 5, (x, y) => [x * 20, y * 30, (x + y) * 11, (x + y) % 2 ? 0 : 80]);
  const before = new Uint8ClampedArray(input.data);
  const result = createBoundarySampler({ size: 4 }).render(input);
  assert.deepEqual([result.width, result.height], [4, 3]);
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
    const sx = Math.min(input.width - 1, Math.floor((x + 0.5) * input.width / result.width));
    const sy = Math.min(input.height - 1, Math.floor((y + 0.5) * input.height / result.height));
    const p = (sy * input.width + sx) * 4;
    assert.deepEqual(rgbAt(result, x, y), [...input.data.subarray(p, p + 3), 255]);
  }
  assert.deepEqual(input.data, before);
  assert.deepEqual(result.stats, { quality: 'unsegmented', shading: 'source-sampled', dither: 'none',
    paletteLocked: false, temporalHeldCells: 0, boundaryCells: 0 });
});

test('a segmented boundary uses the majority owner, including background zero', () => {
  const input = frame(4, 1, (x) => [[11, 12, 13], [21, 22, 23], [31, 32, 33], [41, 42, 43]][x]);
  const draw = createBoundarySampler({ size: 1 });
  const backgroundWins = draw.render(input, segmentation(4, 1, (x) => [0, 0, 0, 7][x]));
  assert.equal(backgroundWins.labels[0], 0, 'three background samples outvote the object');
  assert.deepEqual(rgbAt(backgroundWins, 0, 0), [21, 22, 23, 255], 'the nearest sample owned by background is selected');
  assert.equal(backgroundWins.stats.boundaryCells, 1);

  const tie = draw.render(input, segmentation(4, 1, (x) => [0, 0, 7, 7][x]));
  assert.equal(tie.labels[0], 7, 'the center source label breaks an equal vote');
  assert.deepEqual(rgbAt(tie, 0, 0), [31, 32, 33, 255]);
});

test('ties without center majority use a stable lower-label fallback', () => {
  const input = frame(5, 1, (x) => [[61, 0, 0], [62, 0, 0], [63, 0, 0], [64, 0, 0], [65, 0, 0]][x]);
  const mask = segmentation(5, 1, (x) => [2, 2, 4, 3, 3][x]);
  const draw = createBoundarySampler({ size: 1 });
  const first = draw.render(input, mask), second = draw.render(input, mask);
  assert.deepEqual(first, second);
  assert.equal(first.labels[0], 2, 'the center label is underrepresented, so the lower tied owner wins');
  assert.deepEqual(rgbAt(first, 0, 0), [62, 0, 0, 255]);
});

test('same-owner cells retain exact real center samples and do not blend source colors', () => {
  const input = frame(8, 4, (x, y) => [x * 23, y * 47, (x * 3 + y * 7) % 256]);
  const mask = segmentation(8, 4, (x) => x < 4 ? 5 : 9);
  const result = createBoundarySampler({ size: 4 }).render(input, mask);
  assert.equal(result.stats.boundaryCells, 0);
  const sx = Math.floor((0 + 0.5) * input.width / result.width);
  const sy = Math.floor((1 + 0.5) * input.height / result.height);
  assert.deepEqual([...result.data.subarray((1 * result.width + 0) * 4, (1 * result.width + 0) * 4 + 3)],
    [...input.data.subarray((sy * input.width + sx) * 4, (sy * input.width + sx) * 4 + 3)]);
  for (let cell = 0; cell < result.width * result.height; cell++) {
    const color = result.data.subarray(cell * 4, cell * 4 + 3);
    let found = false;
    for (let source = 0; source < input.width * input.height; source++) {
      const sourceLabel = mask.labels[source];
      if (sourceLabel === result.labels[cell] && color[0] === input.data[source * 4] &&
          color[1] === input.data[source * 4 + 1] && color[2] === input.data[source * 4 + 2]) { found = true; break; }
    }
    assert.ok(found, 'each output triplet exists in its selected owner');
  }
});

test('preserves more than 256 source colors without quantization', () => {
  const input = frame(17, 17, (x, y) => {
    const index = y * 17 + x;
    return [index & 255, index >> 8, (index * 29) & 255];
  });
  const result = createBoundarySampler({ size: 17 }).render(input);
  const colors = new Set();
  for (let p = 0; p < result.data.length; p += 4) colors.add(`${result.data[p]},${result.data[p + 1]},${result.data[p + 2]}`);
  assert.ok(colors.size > 256, `retains ${colors.size} distinct RGB colors`);
  assert.deepEqual(result.data.filter((_, i) => i % 4 !== 3), input.data.filter((_, i) => i % 4 !== 3));
});

test('moving objects use only the new frame and match a fresh renderer exactly', () => {
  const width = 16, height = 8;
  const makeScene = (left) => ({
    frame: frame(width, height, (x, y) => x >= left && x < left + 4 ? [245, 52 + y, 28] : [25, 37 + y, 54]),
    mask: segmentation(width, height, (x) => x >= left && x < left + 4 ? 8 : 0)
  });
  const draw = createBoundarySampler({ size: 8 });
  draw.render(...Object.values(makeScene(2)));
  const moved = makeScene(10);
  const result = draw.render(moved.frame, moved.mask);
  const fresh = createBoundarySampler({ size: 8 }).render(moved.frame, moved.mask);
  assert.deepEqual(result.data, fresh.data);
  assert.deepEqual(result.labels, fresh.labels);
  assert.equal(result.labels[1], 0, 'the old object position is now background');
  assert.equal(result.labels[5], 8, 'the new object position uses the current label');
  const currentSource = (3 * width + 11) * 4;
  assert.deepEqual(rgbAt(result, 5, 1), [...moved.frame.data.subarray(currentSource, currentSource + 3), 255]);
});

test('validates options, frame bounds, and segmentation labels', () => {
  for (const size of [0, 513, 1.5]) assert.throws(() => createBoundarySampler({ size }), RangeError);
  const draw = createBoundarySampler();
  assert.throws(() => draw.render(null), TypeError);
  assert.throws(() => draw.render({ width: 2, height: 2, data: new Uint8Array(3) }), TypeError);
  assert.throws(() => draw.render({ width: 0, height: 2, data: new Uint8Array(0) }), TypeError);
  const input = frame(2, 2, () => [1, 2, 3]);
  assert.throws(() => draw.render(input, { width: 2, height: 2, labels: new Uint16Array(4) }), TypeError);
  assert.throws(() => draw.render(input, { width: 2, height: 2, labels: new Uint32Array(3) }), TypeError);
  assert.throws(() => draw.render(input, { width: 8193, height: 1, labels: new Uint32Array(1) }), TypeError);
});
