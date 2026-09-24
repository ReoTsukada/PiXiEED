import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

function frame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const [r, g, b, a = 255] = colorAt(x, y);
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  return { width, height, data };
}

function verticalLine({ x = 20, y0 = 12, y1 = 51, color = [0, 0, 0] } = {}) {
  return frame(64, 64, (sx, sy) => sx === x && sy >= y0 && sy <= y1 ? color : [220, 220, 220]);
}

function labels(width, height, idAt = () => 1) {
  const values = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) values[y * width + x] = idAt(x, y);
  return { width, height, labels: values };
}

function rgbAt(result, x, y) {
  const p = (y * result.width + x) * 4;
  return [...result.data.slice(p, p + 3)];
}

function assertRendererBounds(result) {
  const colors = new Set();
  for (let p = 0; p < result.data.length; p += 4) {
    assert.equal(result.data[p + 3], 255);
    colors.add(`${result.data[p]},${result.data[p + 1]},${result.data[p + 2]}`);
  }
  assert.ok(colors.size <= 48, `expected <=48 visible RGB colors, received ${colors.size}`);
  assert.ok(result.stats.maxMaterialColors <= 3);
}

test('a source-subpixel vertical stroke becomes a connected background-toned one-pixel line', () => {
  const input = verticalLine();
  const original = new Uint8ClampedArray(input.data);
  const result = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' }).render(input);
  const yValues = [];
  for (let y = 0; y < result.height; y++) {
    if (rgbAt(result, 10, y).join(',') !== '220,220,220') yValues.push(y);
  }

  assert.deepEqual(input.data, original, 'rendering must not alter source bytes');
  assert.equal(result.stats.straightLineCount, 1);
  assert.ok(yValues.length >= 18, `expected a nearly full connected stroke, got ${yValues.length} cells`);
  assert.deepEqual(yValues, Array.from({ length: yValues.length }, (_, i) => yValues[0] + i), 'the digital stroke is 8-connected without gaps');
  assert.notDeepEqual(rgbAt(result, 10, yValues[0]), [0, 0, 0], 'subpixel coverage should not become a pure-black stroke');
  assert.ok(rgbAt(result, 10, yValues[0])[0] > 0 && rgbAt(result, 10, yValues[0])[0] < 220,
    'the line color should lie between black and its gray surface');
  assertRendererBounds(result);
});

test('semantic object boundaries stay separate while an interior thin line is regularized', () => {
  const segmentation = labels(64, 64, (x) => x < 32 ? 11 : 22);
  const input = frame(64, 64, (x, y) => {
    if (x === 20 && y >= 12 && y <= 51) return [0, 0, 0];
    return x < 32 ? [220, 24, 32] : [20, 48, 232];
  });
  const result = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' }).render(input, segmentation);

  assert.equal(result.labels[16 * result.width + 15], 11);
  assert.equal(result.labels[16 * result.width + 16], 22);
  assert.deepEqual(rgbAt(result, 15, 16), [220, 24, 32]);
  assert.deepEqual(rgbAt(result, 16, 16), [20, 48, 232]);
  assert.ok(result.stats.straightLineCount >= 1);
  assertRendererBounds(result);
});

test('repeated frames are stable, and moving or removing a line leaves no old synthesized pixels', () => {
  const makeInput = (position) => verticalLine(position === null ? { y0: 0, y1: -1 } : { x: position });
  const renderer = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' });
  const segmentation = labels(64, 64);
  const firstInput = makeInput(20);
  const first = renderer.render(firstInput, segmentation);
  const repeat = renderer.render(firstInput, segmentation);
  assert.deepEqual(repeat.data, first.data, 'identical input frames must render identically');

  const movedInput = makeInput(28);
  const moved = renderer.render(movedInput, segmentation);
  const freshMoved = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' }).render(movedInput, segmentation);
  assert.deepEqual(moved.data, freshMoved.data, 'a moved stroke must not retain its previous line tone or palette');
  assert.equal(rgbAt(moved, 10, 16).join(','), '220,220,220', 'the prior line column is cleared');
  assert.ok(moved.stats.straightLineCount >= 1);

  const removedInput = makeInput(null);
  const removed = renderer.render(removedInput, segmentation);
  const freshRemoved = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' }).render(removedInput, segmentation);
  assert.deepEqual(removed.data, freshRemoved.data, 'a disappeared stroke must not leave temporal residue');
  assert.equal(removed.stats.straightLineCount, 0);
  assertRendererBounds(removed);
});

test('a protected face-detail cell is excluded from line straightening', () => {
  const input = verticalLine({ y0: 20, y1: 43 });
  const protectedCells = new Uint8Array(32 * 32);
  protectedCells[16 * 32 + 10] = 1;
  const result = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' }).render(input);
  const protectedResult = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone' })
    .render(input, null, { protectedCells });

  assert.equal(protectedResult.stats.protectedDetailCells, 1);
  assert.deepEqual(rgbAt(result, 10, 16), [110, 110, 110], 'the unprotected line receives its measured half-coverage tone');
  assert.deepEqual(rgbAt(protectedResult, 10, 16), [0, 0, 0], 'the protected source feature is not softened into the line');
  assert.ok(protectedResult.stats.straightLineCells < result.stats.straightLineCells,
    'the protected cell is omitted from the straightened path');
  assertRendererBounds(result);
  assertRendererBounds(protectedResult);
});
