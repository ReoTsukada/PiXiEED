import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

function makeFrame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const color = colorAt(x, y);
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = color[3] ?? 255;
  }
  return { width, height, data };
}
function makeSegmentation(width, height, labelAt) {
  const labels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) labels[y * width + x] = labelAt(x, y);
  return { width, height, labels };
}
function pixel(result, x, y) {
  const offset = (y * result.width + x) * 4;
  return [...result.data.subarray(offset, offset + 4)];
}

test('segmented adjacent regions keep sampled colors without a blended boundary', () => {
  const frame = makeFrame(8, 4, (x) => x < 4 ? [240, 20, 30] : [20, 40, 240]);
  const segmentation = makeSegmentation(8, 4, (x) => x < 4 ? 11 : 29);
  const result = createObjectRenderer({ size: 8, colors: 2 }).render(frame, segmentation);
  assert.equal(result.segmented, true);
  assert.equal(result.stats.quality, 'segmented');
  assert.equal(result.palette.length, 2);
  assert.deepEqual(pixel(result, 3, 1), [240, 20, 30, 255]);
  assert.deepEqual(pixel(result, 4, 1), [20, 40, 240, 255]);
  assert.ok(result.data.every((value, index) => index % 4 !== 3 || value === 255));
  for (let cell = 0; cell < result.indices.length; cell++) {
    const label = result.labels[cell];
    const color = result.palette[result.indices[cell]];
    assert.deepEqual(color, label === 11 ? [240, 20, 30] : [20, 40, 240]);
  }
});

test('same-grid one-pixel mask lines survive ownership selection', () => {
  const frame = makeFrame(8, 8, (x) => x === 3 ? [250, 10, 20] : [15, 30, 45]);
  const segmentation = makeSegmentation(8, 8, (x) => x === 3 ? 99 : 0);
  const result = createObjectRenderer({ size: 8, colors: 2 }).render(frame, segmentation);
  for (let y = 0; y < 8; y++) {
    assert.equal(result.labels[y * 8 + 3], 99);
    assert.deepEqual(pixel(result, 3, y), [250, 10, 20, 255]);
  }
});

test('replaced object IDs do not reuse the old object color', () => {
  const renderer = createObjectRenderer({ size: 4, colors: 2 });
  const segmentation = makeSegmentation(4, 4, (x, y) => x === 1 && y >= 1 && y <= 2 ? 7 : 0);
  renderer.render(makeFrame(4, 4, (x, y) => x === 1 && y >= 1 && y <= 2 ? [250, 0, 0] : [20, 20, 20]), segmentation);
  const replacementMask = makeSegmentation(4, 4, (x, y) => x === 1 && y >= 1 && y <= 2 ? 8 : 0);
  const next = renderer.render(makeFrame(4, 4, (x, y) => x === 1 && y >= 1 && y <= 2 ? [0, 230, 20] : [20, 20, 20]), replacementMask);
  assert.equal(next.labels[5], 8);
  assert.deepEqual(pixel(next, 1, 1), [0, 230, 20, 255]);
  assert.ok(!next.palette.some((color) => color[0] === 250 && color[1] === 0 && color[2] === 0));
});

test('small color noise holds stable indices but a scene cut updates immediately', () => {
  const renderer = createObjectRenderer({ size: 6, colors: 3 });
  const mask = makeSegmentation(12, 12, () => 1);
  const first = makeFrame(12, 12, (x, y) => {
    const noise = ((x * 7 + y * 11) % 5) - 2;
    return [100 + noise, 120 + noise, 140 + noise];
  });
  const second = makeFrame(12, 12, (x, y) => {
    const noise = ((x * 7 + y * 11 + 1) % 5) - 2;
    return [100 + noise, 120 + noise, 140 + noise];
  });
  const initial = renderer.render(first, mask);
  const stabilized = renderer.render(second, mask);
  assert.ok(stabilized.stats.temporalHeldCells > 0);
  assert.ok(stabilized.stats.temporalHeldCells <= stabilized.indices.length);
  for (let i = 0; i < stabilized.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(stabilized.data[i + channel] - initial.data[i + channel]) <= 12);
  }

  const cut = renderer.render(makeFrame(12, 12, () => [20, 220, 30]), mask);
  assert.equal(cut.stats.sceneCut, true);
  assert.ok(cut.palette.some((color) => color[0] === 20 && color[1] === 220 && color[2] === 30));
  assert.deepEqual(pixel(cut, 2, 2), [20, 220, 30, 255]);
});

test('uniform two-level noise holds exact output RGB and palette owner order may change safely', () => {
  const renderer = createObjectRenderer({ size: 8, colors: 3 });
  const oneRegion = makeSegmentation(8, 8, () => 4);
  const original = renderer.render(makeFrame(8, 8, () => [100, 110, 120]), oneRegion);
  const slightChange = renderer.render(makeFrame(8, 8, () => [102, 112, 122]), oneRegion);
  assert.deepEqual(slightChange.data, original.data);
  assert.ok(slightChange.stats.paletteHeldEntries > 0);

  const ordered = createObjectRenderer({ size: 10, colors: 2 });
  const firstMask = makeSegmentation(10, 1, (x) => x < 6 ? 1 : 2);
  const first = ordered.render(makeFrame(10, 1, (x) => x < 6 ? [90, 100, 110] : [210, 200, 190]), firstMask);
  const secondMask = makeSegmentation(10, 1, (x) => x < 4 ? 1 : 2);
  const second = ordered.render(makeFrame(10, 1, (x) => x < 4 ? [90, 100, 110] : [210, 200, 190]), secondMask);
  assert.deepEqual(second.palette, [[210, 200, 190], [90, 100, 110]], 'region priority swaps the global palette slots');
  assert.deepEqual(pixel(second, 1, 0), pixel(first, 1, 0));
  assert.deepEqual(pixel(second, 8, 0), pixel(first, 8, 0));
});

test('reset and source-size changes discard temporal history', () => {
  const renderer = createObjectRenderer({ size: 4, colors: 4 });
  const mask = makeSegmentation(4, 4, () => 3);
  const base = makeFrame(4, 4, () => [100, 110, 120]);
  renderer.render(base, mask);
  const smallNoise = renderer.render(makeFrame(4, 4, () => [103, 111, 118]), mask);
  assert.ok(smallNoise.stats.temporalHeldCells > 0);
  renderer.reset();
  const resetResult = renderer.render(makeFrame(4, 4, () => [104, 112, 119]), mask);
  assert.equal(resetResult.stats.temporalHeldCells, 0);

  const resizedMask = makeSegmentation(8, 8, () => 3);
  const resized = renderer.render(makeFrame(8, 8, () => [105, 113, 120]), resizedMask);
  assert.equal(resized.stats.temporalHeldCells, 0);
  assert.equal(resized.width, 4);
  assert.equal(resized.height, 4);
});

test('global color limit is enforced and over-budget regions are reported', () => {
  const frame = makeFrame(12, 4, (x, y) => [x * 17, y * 31, (x * 13 + y * 7) % 255]);
  const mask = makeSegmentation(12, 4, (x) => x + 1);
  const result = createObjectRenderer({ size: 12, colors: 3 }).render(frame, mask);
  assert.ok(result.palette.length <= 3);
  assert.ok(result.stats.regionCount > 3);
  assert.ok(result.stats.overBudgetRegionCount > 0);
  assert.equal(result.stats.quality, 'segmented-over-budget');
  assert.ok(result.indices.every((index) => index < 3));
  assert.ok(result.labels.every((label, index) => label === index % 12 + 1));
});

test('mismatched masks use nearest labels; absent masks explicitly fall back', () => {
  const frame = makeFrame(8, 2, (x) => x < 4 ? [30, 40, 50] : [190, 200, 210]);
  const smallMask = makeSegmentation(2, 1, (x) => x === 0 ? 4 : 5);
  const renderer = createObjectRenderer({ size: 8, colors: 2 });
  const segmented = renderer.render(frame, smallMask);
  assert.deepEqual([...segmented.labels.slice(0, 8)], [4, 4, 4, 4, 5, 5, 5, 5]);
  renderer.reset();
  const unsegmented = renderer.render(frame);
  assert.equal(unsegmented.segmented, false);
  assert.equal(unsegmented.stats.quality, 'unsegmented');
  assert.ok(unsegmented.labels.every((label) => label === 1));
});

test('input buffers are unchanged and malformed frames/masks are rejected', () => {
  const frame = makeFrame(4, 4, (x, y) => [x * 20, y * 20, x + y]);
  const frameBefore = new Uint8ClampedArray(frame.data);
  const mask = makeSegmentation(4, 4, (x) => x < 2 ? 1 : 2);
  const maskBefore = new Uint32Array(mask.labels);
  createObjectRenderer({ size: 4, colors: 4 }).render(frame, mask);
  assert.deepEqual(frame.data, frameBefore);
  assert.deepEqual(mask.labels, maskBefore);
  assert.throws(() => createObjectRenderer({ size: 0 }), RangeError);
  assert.throws(() => createObjectRenderer({ colors: 0 }), RangeError);
  assert.throws(() => createObjectRenderer({ size: 4 }).render({ width: 4, height: 4, data: new Uint8Array(3) }), TypeError);
  assert.throws(() => createObjectRenderer({ size: 4 }).render(frame, { width: 4, height: 4, labels: new Uint16Array(16) }), TypeError);
  assert.throws(() => createObjectRenderer({ size: 4 }).render(frame, { width: 4, height: 4, labels: new Uint32Array(15) }), TypeError);
  const manyIds = makeSegmentation(65, 1, (x) => x + 1);
  const wideFrame = makeFrame(65, 1, () => [1, 2, 3]);
  assert.throws(() => createObjectRenderer({ size: 1 }).render(wideFrame, manyIds), RangeError);
});
