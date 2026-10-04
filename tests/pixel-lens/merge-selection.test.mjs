import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMergeSource, rankMergeTargets } from '../../js/pixel-lens/merge-selection.mjs';

function frame(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

const rgb = (color, alpha = 255) => [...color, alpha];

test('raw-aware seed selection uses nearby observed dither colors instead of the center dither phase', () => {
  const palette = [[80, 60, 40], [120, 92, 64], [42, 126, 112]];
  const source = frame(5, 5, () => rgb([108, 82, 56]));
  const rendered = frame(5, 5, (x, y) => rgb((x + y) % 2 ? palette[1] : palette[0]));
  const seed = { x: 2, y: 2 };
  assert.equal(rendered.data[(seed.y * 5 + seed.x) * 4], palette[0][0], 'seed lies on the darker dither phase');
  const result = pickMergeSource({ source, rendered, palette, seed });
  assert.deepEqual(result, { sourceIndex: 1, seed }, 'the raw center is closer perceptually to the other locally observed palette color');
});

test('a tiny isolated bright accent remains the selected source rather than being outvoted by its neighborhood', () => {
  const palette = [[36, 42, 50], [250, 220, 70]];
  const source = frame(5, 5, (x, y) => rgb(x === 2 && y === 2 ? palette[1] : palette[0]));
  const rendered = frame(5, 5, (x, y) => rgb(x === 2 && y === 2 ? palette[1] : palette[0]));
  assert.deepEqual(pickMergeSource({ source, rendered, palette, seed: { x: 2, y: 2 } }), {
    sourceIndex: 1,
    seed: { x: 2, y: 2 }
  });
});

test('raw color boundary excludes palette colors observed only across the boundary', () => {
  const palette = [[112, 72, 48], [42, 126, 112]];
  const source = frame(5, 5, (x) => rgb(x < 2 ? palette[0] : palette[1]));
  const rendered = frame(5, 5, (x) => rgb(x < 2 ? palette[0] : palette[1]));
  assert.deepEqual(pickMergeSource({ source, rendered, palette, seed: { x: 1, y: 2 } }), {
    sourceIndex: 0,
    seed: { x: 1, y: 2 }
  });
});

test('transparent seed in either frame is rejected and transparent neighbors do not add candidates', () => {
  const palette = [[12, 24, 36], [220, 180, 90]];
  const source = frame(3, 3, () => rgb(palette[0]));
  const rendered = frame(3, 3, () => rgb(palette[0]));
  source.data.set(rgb(palette[1], 0), (1 * 3 + 1) * 4);
  assert.equal(pickMergeSource({ source, rendered, palette, seed: { x: 1, y: 1 } }), null);
  source.data.set(rgb(palette[0]), (1 * 3 + 1) * 4);
  rendered.data.set(rgb(palette[1], 0), (1 * 3 + 1) * 4);
  assert.equal(pickMergeSource({ source, rendered, palette, seed: { x: 1, y: 1 } }), null);
  rendered.data.set(rgb(palette[0]), (1 * 3 + 1) * 4);
  rendered.data.set(rgb(palette[1], 0), (0 * 3 + 0) * 4);
  const result = pickMergeSource({ source, rendered, palette, seed: { x: 1, y: 1 } });
  assert.equal(result.sourceIndex, 0, 'a transparent neighboring swatch is ignored');
});

test('seed is never snapped, and invalid frame, dimensions, palette, or coordinates fail closed', () => {
  const palette = [[10, 20, 30]];
  const source = frame(4, 4, () => rgb(palette[0]));
  const rendered = frame(4, 4, () => rgb(palette[0]));
  const seed = { x: 2, y: 1 };
  const picked = pickMergeSource({ source, rendered, palette, seed });
  assert.deepEqual(picked.seed, seed);
  assert.notEqual(picked.seed, seed, 'returned seed is a copy');
  assert.throws(() => pickMergeSource({ source, rendered, palette, seed: { x: 4, y: 1 } }), RangeError);
  assert.throws(() => pickMergeSource({ source, rendered: frame(3, 4, () => rgb(palette[0])), palette, seed }), RangeError);
  assert.throws(() => pickMergeSource({ source, rendered, palette: [], seed }), TypeError);
  assert.throws(() => pickMergeSource({ source: { width: 4, height: 4, data: new Uint8Array(5) }, rendered, palette, seed }), TypeError);
});

test('source candidates come only from palette entries observed nearby, with deterministic results', () => {
  const palette = [[0, 0, 0], [255, 255, 255], [108, 82, 56]];
  const source = frame(5, 5, () => rgb(palette[2]));
  const rendered = frame(5, 5, (x, y) => rgb((x + y) % 2 ? palette[0] : palette[1]));
  const args = { source, rendered, palette, seed: { x: 2, y: 2 } };
  const first = pickMergeSource(args);
  assert.ok([0, 1].includes(first.sourceIndex));
  assert.notEqual(first.sourceIndex, 2, 'a globally closest but locally unobserved palette entry is not introduced');
  assert.deepEqual(pickMergeSource(args), first);
});

test('target ranking counts only opaque rendered pixels inside the selected mask and preserves every id', () => {
  const palette = [[160, 20, 20], [20, 160, 20], [20, 20, 160], [220, 210, 30]];
  const rendered = frame(6, 1, (x) => rgb([palette[0], palette[1], palette[1], palette[2], palette[3], palette[2]][x], x === 3 ? 0 : 255));
  const mask = new Uint8Array([1, 1, 1, 1, 0, 0]);
  const result = rankMergeTargets({ rendered, palette, mask, sourceIndex: 0 });
  assert.deepEqual(result.map(({ index }) => index), [1, 2, 3, 0]);
  assert.deepEqual(result.map(({ count }) => count), [2, 0, 0, 1]);
  assert.deepEqual(result.filter(({ recommended }) => recommended).map(({ index }) => index), [1]);
});

test('target ranking is deterministic on equal counts and perceptual distances, and leaves source last', () => {
  const linearToSrgb = (linear) => (1.055 * linear ** (1 / 2.4) - 0.055) * 255;
  const midpointGray = linearToSrgb(0.5 ** 3);
  const palette = [[midpointGray, midpointGray, midpointGray], [0, 0, 0], [255, 255, 255]];
  const rendered = frame(2, 1, (x) => rgb(palette[x + 1]));
  const mask = new Uint8Array([1, 1]);
  const args = { rendered, palette, mask, sourceIndex: 0 };
  const first = rankMergeTargets(args);
  assert.deepEqual(first.map(({ index }) => index), [1, 2, 0]);
  assert.deepEqual(rankMergeTargets(args), first);
  assert.equal(first[0].recommended, true);
  assert.equal(first[1].recommended, false);
  assert.equal(first[2].recommended, false);
});

test('target ranking validates its mask and source index', () => {
  const palette = [[10, 20, 30], [30, 20, 10]];
  const rendered = frame(2, 1, () => rgb(palette[0]));
  assert.throws(() => rankMergeTargets({ rendered, palette, mask: new Uint8Array(1), sourceIndex: 0 }), TypeError);
  assert.throws(() => rankMergeTargets({ rendered, palette, mask: new Uint8Array(2), sourceIndex: 2 }), RangeError);
});

test('both helpers preserve all inputs and an empty region has no recommended target', () => {
  const palette = [[32, 48, 64], [210, 100, 60], [60, 150, 110]];
  const source = frame(3, 2, (x, y) => rgb((x + y) % 2 ? palette[1] : palette[0]));
  const rendered = frame(3, 2, (x, y) => rgb((x + y) % 2 ? palette[1] : palette[0]));
  const seed = { x: 1, y: 0 };
  const mask = new Uint8Array(6);
  const sourceBefore = new Uint8ClampedArray(source.data);
  const renderedBefore = new Uint8ClampedArray(rendered.data);
  const paletteBefore = palette.map((color) => color.slice());
  const seedBefore = { ...seed };
  const maskBefore = new Uint8Array(mask);

  const picked = pickMergeSource({ source, rendered, palette, seed });
  assert.ok(picked);
  assert.deepEqual(picked.seed, seedBefore);
  assert.notEqual(picked.seed, seed);
  const ranked = rankMergeTargets({ rendered, palette, mask, sourceIndex: picked.sourceIndex });

  assert.deepEqual(ranked.map(({ index }) => index).sort((a, b) => a - b), [0, 1, 2]);
  assert.ok(ranked.every(({ count, recommended }) => count === 0 && recommended === false));
  assert.equal(ranked.at(-1).index, picked.sourceIndex);
  assert.deepEqual(source.data, sourceBefore);
  assert.deepEqual(rendered.data, renderedBefore);
  assert.deepEqual(palette, paletteBefore);
  assert.deepEqual(seed, seedBefore);
  assert.deepEqual(mask, maskBefore);
});
