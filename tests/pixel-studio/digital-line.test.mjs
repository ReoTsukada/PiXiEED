import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDigitalLine } from '../../js/pixel-studio/digital-line.mjs';

function indices(points, width) {
  return points.map(([x, y]) => y * width + x);
}

function bresenham(x0, y0, x1, y1) {
  const points = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
  return points;
}

test('fits diagonal, vertical, and horizontal one-pixel paths deterministically', () => {
  const diagonal = indices(bresenham(3, 3, 12, 7), 20);
  const vertical = indices(Array.from({ length: 8 }, (_, i) => [6, i + 2]), 20);
  const horizontal = indices(Array.from({ length: 8 }, (_, i) => [i + 4, 9]), 20);
  for (const cells of [diagonal, vertical, horizontal]) {
    const fitted = fitDigitalLine(cells, 20, 16);
    assert.ok(fitted);
    assert.equal(fitted.path.length, fitted.span);
    assert.ok(fitted.path instanceof Uint32Array);
    assert.ok(fitted.residual < 0.5, `rasterized-line residual ${fitted.residual}`);
  }
  assert.deepEqual([...fitDigitalLine(diagonal, 20, 16).path], diagonal);
});

test('reduces a weak two-pixel horizontal candidate to one deterministic row', () => {
  const points = [];
  for (let x = 3; x <= 12; x++) points.push([x, 5], [x, 6]);
  const fitted = fitDigitalLine(indices(points, 20), 20, 16);
  assert.ok(fitted);
  assert.equal(fitted.span, 10);
  assert.deepEqual([...fitted.path], Array.from({ length: 10 }, (_, offset) => 6 * 20 + offset + 3));
  assert.equal(fitted.sourceCells.length, 20);
});

test('rejects curves, L shapes, branches, thick blobs, and large gaps', () => {
  const curve = indices([[2, 2], [3, 3], [4, 4], [5, 5], [6, 5], [7, 4], [8, 3], [9, 2]], 16);
  const elbow = indices([[2, 5], [3, 5], [4, 5], [5, 5], [5, 6], [5, 7], [5, 8]], 16);
  const branch = indices([[2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [6, 5], [6, 4]], 16);
  const thick = [];
  for (let x = 2; x <= 9; x++) for (let y = 4; y <= 6; y++) thick.push(y * 16 + x);
  const gap = indices([[1, 4], [2, 4], [3, 4], [4, 4], [9, 4], [10, 4], [11, 4], [12, 4]], 16);
  for (const cells of [curve, elbow, branch, thick, gap]) assert.equal(fitDigitalLine(cells, 16, 12), null);
});

test('is invariant to input order and does not mutate source cells', () => {
  const cells = indices(bresenham(2, 4, 11, 8), 16);
  const snapshot = [...cells];
  const forward = fitDigitalLine(cells, 16, 12);
  const reverse = fitDigitalLine([...cells].reverse(), 16, 12);
  assert.deepEqual([...forward.path], [...reverse.path]);
  assert.deepEqual([...forward.sourceCells], [...reverse.sourceCells]);
  assert.deepEqual(cells, snapshot);
});

test('rejects malformed dimensions, duplicate cells, and invalid indexes', () => {
  assert.throws(() => fitDigitalLine([], 0, 10), RangeError);
  assert.throws(() => fitDigitalLine([1, 1, 2], 4, 4), /duplicate/);
  assert.throws(() => fitDigitalLine([1, 1.5], 4, 4), /integers/);
  assert.throws(() => fitDigitalLine([-1], 4, 4), /outside/);
  assert.throws(() => fitDigitalLine([16], 4, 4), /outside/);
  assert.throws(() => fitDigitalLine({}, 4, 4), /array/);
});
