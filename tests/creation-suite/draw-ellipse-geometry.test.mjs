import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { drawShapePixels } from '../../js/creation/draw-tool-operations.mjs';

function raster(width, height, options = {}, from = { x: 2, y: 2 }, to = { x: from.x + width - 1, y: from.y + height - 1 }) {
  const size = Math.max(width, height) + 4;
  const document = createDrawDocument(Math.min(512, Math.max(16, 2 ** Math.ceil(Math.log2(size)))));
  const changed = drawShapePixels(document, from, to, 2, { shape: 'ellipse', ...options });
  assert.equal(new Set(changed).size, changed.length);
  return { document, points: new Set([...changed].map(index => `${index % document.width - Math.min(from.x, to.x)},${Math.floor(index / document.width) - Math.min(from.y, to.y)}`)) };
}
function rows(points, width, height) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => points.has(`${x},${y}`) ? '#' : '.').join(''));
}
function connected(points, diagonal = false) {
  const seen = new Set(), queue = [[...points][0]];
  for (const key of queue) {
    if (seen.has(key)) continue;
    seen.add(key); const [x, y] = key.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !diagonal && dx && dy) continue;
      const next = `${x + dx},${y + dy}`;
      if (points.has(next) && !seen.has(next)) queue.push(next);
    }
  }
  return seen.size === points.size;
}

test('reported circles have balanced flat poles instead of isolated top and bottom spikes', () => {
  for (const diameter of [7, 8, 9, 10, 16, 23, 24, 25, 32, 64]) {
    for (const options of [{ filled: true }, { brushSize: 1 }, { brushSize: 3 }]) {
      const { points } = raster(diameter, diameter, options);
      const top = [...points].filter(key => key.endsWith(',0')).map(key => Number(key.split(',')[0])).sort((a, b) => a - b);
      const left = [...points].filter(key => key.startsWith('0,')).map(key => Number(key.split(',')[1])).sort((a, b) => a - b);
      assert.ok(top.length >= 3, `${diameter}px ${JSON.stringify(options)} must not have a one/two pixel spike`);
      assert.deepEqual(top, left, `${diameter}px circle has the same silhouette on both axes`);
    }
  }
});

test('small-circle fill snapshots define pixel-center rounding at odd and even sizes', () => {
  assert.deepEqual(rows(raster(4, 4, { filled: true }).points, 4, 4), ['.##.', '####', '####', '.##.']);
  assert.deepEqual(rows(raster(5, 5, { filled: true }).points, 5, 5), ['.###.', '#####', '#####', '#####', '.###.']);
});

test('all 1–64px ellipses are mirror/transpose symmetric, contiguous, bounded and closed', () => {
  for (let width = 1; width <= 64; width++) for (let height = 1; height <= 64; height++) {
    const fill = raster(width, height, { filled: true }).points;
    const transposed = raster(height, width, { filled: true }).points;
    const outline = raster(width, height).points;
    const label = `${width}x${height}`;
    assert.ok(connected(fill), `${label}: 4-connected fill`);
    assert.ok(connected(outline, true), `${label}: 8-connected outline`);
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) if (fill.has(`${x},${y}`)) row.push(x);
      assert.ok(row.length, `${label}: nonempty row ${y}`);
      assert.equal(row.length, row.at(-1) - row[0] + 1, `${label}: continuous row ${y}`);
    }
    for (const key of fill) {
      const [x, y] = key.split(',').map(Number);
      assert.ok(x >= 0 && x < width && y >= 0 && y < height, label);
      assert.ok(fill.has(`${width - 1 - x},${y}`), `${label}: horizontal symmetry`);
      assert.ok(fill.has(`${x},${height - 1 - y}`), `${label}: vertical symmetry`);
      assert.ok(transposed.has(`${y},${x}`), `${label}: transposed symmetry`);
      const boundary = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => !fill.has(`${a},${b}`));
      assert.equal(outline.has(key), boundary, `${label}: exact closed fill boundary at ${key}`);
    }
    assert.equal(transposed.size, fill.size, label);
    assert.ok([...outline].every(key => fill.has(key)), label);
    for (const [axis, bound] of [[0, 0], [0, width - 1], [1, 0], [1, height - 1]]) {
      assert.ok([...outline].some(key => Number(key.split(',')[axis]) === bound), `${label}: touches bound`);
    }
  }
});

test('thickness, reverse drags and extreme aspect ratios keep concentric, monotone outlines', () => {
  for (const [width, height] of [[3, 48], [48, 3], [4, 64], [64, 4], [23, 24], [24, 23], [32, 32], [1, 512], [512, 1], [3, 512], [512, 3]]) {
    const from = { x: 0, y: 0 }, to = { x: width - 1, y: height - 1 };
    const fill = raster(width, height, { filled: true }, from, to).points;
    let previous = new Set();
    for (const brushSize of [1, 2, 3, 4, 8, 16]) {
      const outline = raster(width, height, { brushSize }, from, to).points;
      const reverse = raster(width, height, { brushSize }, to, from).points;
      const transpose = raster(height, width, { brushSize }, { x: 0, y: 0 }, { x: height - 1, y: width - 1 }).points;
      assert.deepEqual(outline, reverse);
      assert.deepEqual(outline, raster(width, height, { brushSize }, { x: width - 1, y: 0 }, { x: 0, y: height - 1 }).points);
      assert.deepEqual(outline, raster(width, height, { brushSize }, { x: 0, y: height - 1 }, { x: width - 1, y: 0 }).points);
      assert.ok(connected(outline, true));
      assert.ok([...outline].every(key => fill.has(key)));
      assert.ok([...previous].every(key => outline.has(key)), `${width}x${height}: increasing thickness cannot remove pixels`);
      for (const key of outline) {
        const [x, y] = key.split(',').map(Number);
        assert.ok(outline.has(`${width - 1 - x},${y}`));
        assert.ok(outline.has(`${x},${height - 1 - y}`));
        assert.ok(transpose.has(`${y},${x}`));
      }
      previous = outline;
    }
  }
});

test('clipping preserves the original ellipse instead of recomputing a clipped shape', () => {
  for (const options of [{ filled: true }, { brushSize: 1 }, { brushSize: 3 }]) {
    const reference = createDrawDocument(64), clipped = createDrawDocument(16);
    drawShapePixels(reference, { x: 20, y: 20 }, { x: 44, y: 38 }, 2, { shape: 'ellipse', ...options });
    drawShapePixels(clipped, { x: -10, y: -7 }, { x: 14, y: 11 }, 2, { shape: 'ellipse', ...options });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      assert.equal(clipped.pixels[y * 16 + x], reference.pixels[(y + 27) * 64 + x + 30]);
    }
  }
});
