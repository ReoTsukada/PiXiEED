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

function objects(width, height, idAt = () => 1) {
  const labels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) labels[y * width + x] = idAt(x, y);
  return { width, height, labels };
}

function centerRgb(result, x, y) {
  const p = (y * result.width + x) * 4;
  return [...result.data.slice(p, p + 3)];
}

test('a moving weak-color boundary releases its old tone and matches a fresh render', () => {
  const width = 12, height = 8;
  const segmentation = objects(width, height, () => 5);
  const before = frame(width, height, (x) => x < 5 ? [76, 76, 76] : [82, 82, 82]);
  const after = frame(width, height, (x) => x < 7 ? [76, 76, 76] : [82, 82, 82]);
  const renderer = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' });
  const previous = renderer.render(before, segmentation);
  const moved = renderer.render(after, segmentation);
  const fresh = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' }).render(after, segmentation);

  assert.deepEqual(new Set([...Array(previous.width * previous.height)].map((_, cell) => centerRgb(previous, cell % width, Math.floor(cell / width)).join(','))), new Set(['82,82,82']));
  assert.deepEqual(moved.data, fresh.data, 'no prior tone or palette color remains after the edge crosses cells');
  assert.ok(moved.stats.motionReleasedCells > 0);
  assert.deepEqual(new Set([...Array(moved.width * moved.height)].map((_, cell) => centerRgb(moved, cell % width, Math.floor(cell / width)).join(','))), new Set(['76,76,76']));
});

test('stationary near-equal-luminance texture is stable under independent RGB plus or minus two noise', () => {
  const width = 48, height = 48;
  const samples = [
    [150, 90, 60], [152, 88, 60], [148, 92, 60],
    [180, 108, 72], [182, 106, 72], [178, 110, 72],
    [210, 126, 84], [212, 124, 84], [208, 128, 84]
  ];
  const makeTexture = (noisy) => frame(width, height, (x, y) => {
    const gx = Math.floor(x / 3), gy = Math.floor(y / 3);
    const tone = (gx + gy) % 3;
    const source = samples[tone * 3 + (gx * 2 + gy) % 3];
    const delta = noisy ? [((gx + gy) % 3 - 1) * 2, ((2 * gx + gy) % 3 - 1) * 2, ((gx + 2 * gy) % 3 - 1) * 2] : [0, 0, 0];
    return [source[0] + delta[0], source[1] + delta[1], source[2] + delta[2], 255];
  });
  const segmentation = objects(width, height);
  const renderer = createObjectRenderer({ size: 16, colors: 24, shading: 'three-tone' });
  const first = renderer.render(makeTexture(false), segmentation);
  const noisy = renderer.render(makeTexture(true), segmentation);

  assert.deepEqual(noisy.data, first.data);
  assert.equal(noisy.stats.motionReleasedCells, 0);
  assert.ok(noisy.stats.maxMaterialColors <= 3);
});

test('protected isolated detail survives cluster cleanup and is counted in stats', () => {
  const width = 9, height = 9, center = 5 * width + 5;
  const input = frame(width, height, (x, y) => {
    const brightCluster = x < 4 && y < 4;
    const protectedDot = x === 5 && y === 5;
    return brightCluster || protectedDot ? [120, 120, 120] : [100, 100, 100];
  });
  const segmentation = objects(width, height);
  const protectedCells = new Uint8Array(width * height);
  protectedCells[center] = 1;
  const plain = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' }).render(input, segmentation);
  const detailed = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' }).render(input, segmentation, { protectedCells });

  assert.deepEqual(centerRgb(plain, 5, 5), [100, 100, 100], 'unprotected low-contrast speck is cleaned');
  assert.deepEqual(centerRgb(detailed, 5, 5), [120, 120, 120], 'protected detail keeps its existing palette tone');
  assert.equal(detailed.stats.protectedDetailCells, 1);
  assert.equal(detailed.stats.removedNoiseCells, 0);
  assert.ok(detailed.stats.maxMaterialColors <= 3);
});

test('strong thin strokes and adjacent object boundaries remain distinct', () => {
  const width = 10, height = 7;
  const segmentation = objects(width, height, (x, y) => x === 2 && y >= 2 && y <= 4 ? 3 : x < 5 ? 1 : 2);
  const input = frame(width, height, (x, y) => x === 2 && y >= 2 && y <= 4 ? [250, 250, 250] : x < 5 ? [220, 24, 32] : [20, 48, 232]);
  const result = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' }).render(input, segmentation);

  for (let y = 2; y <= 4; y++) {
    assert.equal(result.labels[y * width + 2], 3);
    assert.deepEqual(centerRgb(result, 2, y), [250, 250, 250]);
  }
  assert.equal(result.labels[3 * width + 4], 1);
  assert.equal(result.labels[3 * width + 5], 2);
  assert.deepEqual(centerRgb(result, 4, 3), [220, 24, 32]);
  assert.deepEqual(centerRgb(result, 5, 3), [20, 48, 232]);
});

test('a new three-tone choice must persist for two frames before replacing the held tone', () => {
  const width = 12, height = 12;
  const makeFrame = (target) => frame(width, height, (x, y) => {
    if (x === 5 && y === 5) return [target, target, target];
    if (Math.abs(x - 5) <= 1 && Math.abs(y - 5) <= 1) {
      return ((x + y) % 2) ? [100, 100, 100] : [110, 110, 110];
    }
    const bucket = (x * 7 + y * 11) % 20;
    return bucket < 6 ? [90, 90, 90] : bucket < 13 ? [100, 100, 100] : [110, 110, 110];
  });
  const renderer = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' });
  const initial = renderer.render(makeFrame(104));
  const firstRequest = renderer.render(makeFrame(108));
  const confirmed = renderer.render(makeFrame(108));

  assert.deepEqual(centerRgb(initial, 5, 5), [100, 100, 100]);
  assert.deepEqual(centerRgb(firstRequest, 5, 5), [100, 100, 100], 'one changed-frame request is not enough');
  assert.deepEqual(centerRgb(confirmed, 5, 5), [110, 110, 110], 'the repeated tone request releases the old value');
  assert.ok(confirmed.stats.maxMaterialColors <= 3);
});
