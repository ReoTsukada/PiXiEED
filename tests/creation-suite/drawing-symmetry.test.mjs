import test from 'node:test';
import assert from 'node:assert/strict';
import { symmetryPoint, symmetryPoints, symmetryTransforms } from '../../js/creation/drawing-symmetry.mjs';

const key = (point) => `${point.x},${point.y}`;

test('each reflection uses the canvas-centered axis, including both 45 degree diagonals', () => {
  const source = { x: 1, y: 0 };
  const horizontal = symmetryTransforms({ horizontal: true });
  const vertical = symmetryTransforms({ vertical: true });
  const diagonalDown = symmetryTransforms({ diagonalDown: true });
  const diagonalUp = symmetryTransforms({ diagonalUp: true });
  assert.deepEqual(symmetryPoint(source, 5, 5, horizontal[1]), { x: 3, y: 0 });
  assert.deepEqual(symmetryPoint(source, 5, 5, vertical[1]), { x: 1, y: 4 });
  assert.deepEqual(symmetryPoint(source, 5, 5, diagonalDown[1]), { x: 0, y: 1 });
  assert.deepEqual(symmetryPoint(source, 5, 5, diagonalUp[1]), { x: 4, y: 3 });
  assert.deepEqual(symmetryPoint({ x: 1, y: 2 }, 5, 5, diagonalDown[1]), { x: 2, y: 1 });
  assert.deepEqual(symmetryPoint({ x: 1, y: 2 }, 5, 5, diagonalUp[1]), { x: 2, y: 3 });
});

test('rectangular diagonal maps are centered at 45 degrees and points clip only when requested', () => {
  const diagonalDown = symmetryTransforms({ diagonalDown: true })[1];
  const mapped = symmetryPoint({ x: 0, y: 0 }, 6, 3, diagonalDown);
  assert.deepEqual(mapped, { x: 2, y: -1 });
  assert.deepEqual(symmetryPoints({ x: 0, y: 0 }, 6, 3, { diagonalDown: true }), [{ x: 0, y: 0 }]);
  assert.deepEqual(symmetryPoints({ x: 0, y: 0 }, 6, 3, { diagonalDown: true }, { clip: false }), [{ x: 0, y: 0 }, mapped]);
});

test('combined toggles close into at most eight maps and suppress duplicate center points', () => {
  const flags = { horizontal: true, vertical: true, diagonalDown: true, diagonalUp: true };
  const transforms = symmetryTransforms(flags);
  assert.equal(transforms.length, 8);
  assert.equal(new Set(transforms.map((matrix) => matrix.flat().join(','))).size, 8);
  const orbit = symmetryPoints({ x: 1, y: 2 }, 7, 7, flags);
  assert.equal(orbit.length, 8);
  assert.equal(new Set(orbit.map(key)).size, 8);
  assert.deepEqual(symmetryPoints({ x: 3, y: 3 }, 7, 7, flags), [{ x: 3, y: 3 }]);
  assert.equal(symmetryTransforms({}).length, 1);
});

test('symmetry maps each matrix from the original coordinate instead of rounding cumulatively', () => {
  const flags = { diagonalDown: true, vertical: true };
  const transforms = symmetryTransforms(flags);
  const point = { x: 0.4, y: 1.2 };
  const direct = transforms.map((matrix) => symmetryPoint(point, 6, 3, matrix));
  assert.deepEqual(symmetryPoints(point, 6, 3, flags), direct.filter((mapped, index) => {
    const inBounds = mapped.x >= 0 && mapped.y >= 0 && mapped.x < 6 && mapped.y < 3;
    return inBounds && direct.findIndex((candidate) => key(candidate) === key(mapped)) === index;
  }));
});

test('moved axes share one origin, including combined diagonals and clipping', () => {
  const origin = { x: 4.5, y: 5.5 }, source = { x: 2, y: 4 };
  assert.deepEqual(symmetryPoints(source, 16, 16, { horizontal: true, origin }), [source, { x: 7, y: 4 }]);
  assert.deepEqual(symmetryPoints(source, 16, 16, { vertical: true, origin }), [source, { x: 2, y: 7 }]);
  assert.deepEqual(symmetryPoints(source, 16, 16, { diagonalDown: true, origin }), [source, { x: 3, y: 3 }]);
  assert.deepEqual(symmetryPoints(source, 16, 16, { diagonalUp: true, origin }), [source, { x: 6, y: 8 }]);
  const orbit = symmetryPoints(source, 16, 16, { horizontal: true, vertical: true, diagonalDown: true, diagonalUp: true, origin });
  assert.deepEqual(new Set(orbit.map(key)), new Set(['2,4', '7,4', '2,7', '7,7', '3,3', '6,3', '3,8', '6,8']));
  assert.deepEqual(symmetryPoints({ x: 15, y: 4 }, 16, 16, { horizontal: true, origin }), [{ x: 15, y: 4 }]);
  assert.throws(() => symmetryPoints(source, 16, 16, { horizontal: true, origin: { x: NaN, y: 0 } }), TypeError);
});
