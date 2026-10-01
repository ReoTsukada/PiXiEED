import test from 'node:test';
import assert from 'node:assert/strict';
import { stepGravitySand } from '../../js/home-sand.mjs';

const at = (grid, width, x, y) => grid[y * width + x];
const populated = (grid) => [...grid].filter(Boolean).length;

test('cardinal gravity moves a grain one cell in every cardinal direction', () => {
  for (const { gravity, start, end } of [
    { gravity: { x: 0, y: 1 }, start: [1, 1], end: [1, 2] },
    { gravity: { x: 0, y: -1 }, start: [1, 2], end: [1, 1] },
    { gravity: { x: 1, y: 0 }, start: [1, 1], end: [2, 1] },
    { gravity: { x: -1, y: 0 }, start: [2, 1], end: [1, 1] }
  ]) {
    const grid = new Uint8Array(16); grid[start[1] * 4 + start[0]] = 7;
    stepGravitySand(grid, 4, 4, gravity, { random: () => 1 });
    assert.equal(at(grid, 4, ...end), 7);
    assert.equal(populated(grid), 1);
  }
});

test('diagonal gravity follows all quadrants without wrapping at edges', () => {
  for (const { gravity, start, expected } of [
    { gravity: { x: 1, y: 1 }, start: [1, 1], expected: [2, 2] },
    { gravity: { x: -1, y: 1 }, start: [2, 1], expected: [1, 2] },
    { gravity: { x: 1, y: -1 }, start: [1, 2], expected: [2, 1] },
    { gravity: { x: -1, y: -1 }, start: [2, 2], expected: [1, 1] }
  ]) {
    const grid = new Uint8Array(16); grid[start[1] * 4 + start[0]] = 3;
    stepGravitySand(grid, 4, 4, gravity, { random: () => 0 });
    assert.equal(at(grid, 4, ...expected), 3);
    assert.equal(populated(grid), 1);
  }
  const edge = new Uint8Array(6); edge[2] = 1;
  stepGravitySand(edge, 3, 2, { x: 1, y: 0 });
  assert.equal(at(edge, 3, 0, 1), 0, 'right edge cannot wrap to the next row');
  assert.equal(populated(edge), 1, 'boundary slip conserves the grain');
});

test('flat gravity is still, grain mass and palette values are preserved', () => {
  const grid = new Uint8Array([0, 1, 2, 0, 3, 0, 4, 0, 0]); const before = [...grid];
  stepGravitySand(grid, 3, 3, { x: 0, y: 0 });
  assert.deepEqual([...grid], before);
  const mass = populated(grid); const colors = [...grid].filter(Boolean).sort();
  for (let i = 0; i < 100; i++) stepGravitySand(grid, 3, 3, { x: 0.3, y: 0.8 }, { random: () => 0.25 });
  assert.equal(populated(grid), mass);
  assert.deepEqual([...grid].filter(Boolean).sort(), colors);
});

test('a grain moves at most once per sweep', () => {
  const grid = new Uint8Array(25); grid[2] = 4;
  stepGravitySand(grid, 5, 5, { x: 0.1, y: 1 }, { random: () => 1 });
  assert.equal(at(grid, 5, 2, 1), 4, 'upstream traversal avoids a second move');
});

test('blocked lateral slides take only one downstream cell for each primary direction', () => {
  const cases = [
    { gravity: { x: -0.5, y: 1 }, source: [3, 2], fill: (g, w, h) => { for (let y = 3; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 9; }, expected: [2, 2] },
    { gravity: { x: -0.5, y: -1 }, source: [3, 5], fill: (g, w) => { for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) g[y * w + x] = 9; }, expected: [2, 5] },
    { gravity: { x: 1, y: -0.5 }, source: [2, 3], fill: (g, w, h) => { for (let x = 3; x < w; x++) for (let y = 0; y < h; y++) g[y * w + x] = 9; }, expected: [2, 2] },
    { gravity: { x: -1, y: -0.5 }, source: [5, 3], fill: (g, w, h) => { for (let x = 0; x < 5; x++) for (let y = 0; y < h; y++) g[y * w + x] = 9; }, expected: [5, 2] }
  ];
  for (const { gravity, source, fill, expected } of cases) {
    const width = 8; const height = 8; const grid = new Uint8Array(width * height);
    fill(grid, width, height);
    grid[source[1] * width + source[0]] = 1;
    stepGravitySand(grid, width, height, gravity, { random: () => 0 });
    assert.equal(at(grid, width, ...expected), 1, `one side-slip cell for gravity ${gravity.x},${gravity.y}`);
    assert.equal(populated(grid), 1 + grid.filter((v) => v === 9).length);
  }
});

test('a grain resting on a cardinal boundary does not wander sideways from numeric noise', () => {
  const field = new Uint8Array(16); field[13] = 3;
  for (let i = 0; i < 100; i++) stepGravitySand(field, 4, 4, { x: 1e-16, y: 1 }, { random: () => 0 });
  assert.equal(field[13], 3);
});

test('blocked primary motion can roll down a pile and reports the landing cell', () => {
  const grid = new Uint8Array(16); grid[5] = 2; grid[9] = 7; grid[6] = 8;
  const landings = [];
  stepGravitySand(grid, 4, 4, { x: 0.5, y: 1 }, { random: () => 0, onLand: (...args) => landings.push(args) });
  assert.equal(populated(grid), 3);
  assert.ok(landings.every(([x, y, value]) => x >= 0 && x < 4 && y >= 0 && y < 4 && value > 0));
});

test('invalid dimensions and short fields throw before touching the grid', () => {
  const grid = new Uint8Array([4, 5]);
  assert.throws(() => stepGravitySand(grid, -1, 2, { x: 0, y: 1 }), RangeError);
  assert.throws(() => stepGravitySand(grid, 2, 2, { x: 0, y: 1 }), RangeError);
  assert.throws(() => stepGravitySand([], 0, 0, { x: 0, y: 1 }), RangeError);
  assert.deepEqual([...grid], [4, 5]);
});

test('seeded motion conserves 1000 grains through 1000 sweeps', () => {
  const width = 40; const height = 30; const grid = new Uint8Array(width * height);
  let seed = 0x12345678;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let i = 0; i < 1000; i++) grid[i] = 1 + ((random() * 7) | 0);
  const expected = [...grid].filter(Boolean).sort(); const count = expected.length;
  for (let i = 0; i < 1000; i++) stepGravitySand(grid, width, height, { x: Math.sin(i) * 0.7, y: Math.cos(i) * 0.7 }, { random });
  assert.equal(populated(grid), count);
  assert.deepEqual([...grid].filter(Boolean).sort(), expected);
});
