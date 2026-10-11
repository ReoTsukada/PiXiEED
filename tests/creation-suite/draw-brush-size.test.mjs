import test from 'node:test';
import assert from 'node:assert/strict';
import { beginDrawStroke, cancelDrawStroke, commitDrawStroke, createDrawDocument, createDrawHistory, floodFill, strokePixels } from '../../js/creation/draw-core.mjs';
import { drawShapePixels, sprayPixels } from '../../js/creation/draw-tool-operations.mjs';
import { normalizeDrawInputSettings } from '../../js/creation/draw-input-settings.mjs';

const coords = (indices, width) => [...indices].map((index) => [index % width, Math.floor(index / width)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

test('integer square brush stamps preserve size one and use a stable even-size anchor', () => {
  const one = createDrawDocument(16);
  assert.deepEqual(coords(strokePixels(one, { x: 3, y: 4 }, { x: 3, y: 4 }, 2), 16), [[3, 4]]);
  const two = createDrawDocument(16);
  assert.deepEqual(coords(strokePixels(two, { x: 3, y: 4 }, { x: 3, y: 4 }, 2, { brushSize: 2 }), 16), [[3,4],[4,4],[3,5],[4,5]]);
  const three = createDrawDocument(16);
  assert.deepEqual(coords(strokePixels(three, { x: 3, y: 4 }, { x: 3, y: 4 }, 2, { brushSize: 3 }), 16), [[2,3],[3,3],[4,3],[2,4],[3,4],[4,4],[2,5],[3,5],[4,5]]);
});

test('brushTransform rotates and reflects even-size anchors with each symmetry matrix', () => {
  const cases = [
    { matrix: [[-1, 0], [0, 1]], center: { x: 12, y: 4 } },
    { matrix: [[1, 0], [0, -1]], center: { x: 3, y: 11 } },
    { matrix: [[0, 1], [1, 0]], center: { x: 4, y: 3 } },
    { matrix: [[0, -1], [-1, 0]], center: { x: 11, y: 12 } }
  ];
  for (const brushSize of [1, 2, 3, 4, 16]) for (const { matrix, center } of cases) {
    const document = createDrawDocument(16);
    const start = -Math.floor((brushSize - 1) / 2); const end = start + brushSize - 1;
    const expected = [];
    for (let dy = start; dy <= end; dy += 1) for (let dx = start; dx <= end; dx += 1) {
      const x = center.x + matrix[0][0] * dx + matrix[0][1] * dy;
      const y = center.y + matrix[1][0] * dx + matrix[1][1] * dy;
      if (x >= 0 && y >= 0 && x < 16 && y < 16) expected.push([x, y]);
    }
    const changed = strokePixels(document, center, center, 2, { brushSize, brushTransform: matrix });
    assert.deepEqual(coords(changed, 16), expected.sort((a, b) => a[1] - b[1] || a[0] - b[0]), `size ${brushSize}, transform ${JSON.stringify(matrix)}`);
    assert.equal(new Set(changed).size, changed.length, 'clipped or mirrored writes remain unique');
  }
});

test('brushTransform rejects matrices that are not signed orthogonal transforms', () => {
  const document = createDrawDocument(16);
  for (const brushTransform of [[[1, 1], [0, 1]], [[1, 0], [1, 0]], [[2, 0], [0, 1]], [[1, 0]]]) {
    assert.throws(() => strokePixels(document, { x: 4, y: 4 }, { x: 4, y: 4 }, 2, { brushTransform }), /signed orthogonal/);
  }
});

test('thick fast lines clip to canvas, respect masks and retain sparse cancellation and undo', () => {
  const doc = createDrawDocument(16); const mask = Uint8Array.from({ length: 256 }, (_, i) => i % 16 < 8 ? 1 : 0);
  const history = createDrawHistory(doc); const tracker = beginDrawStroke(doc, { trusted: true });
  const changed = strokePixels(doc, { x: -1_000_000_000, y: 7 }, { x: 1_000_000_000, y: 7 }, 2, { trusted: true, tracker, mask, brushSize: 4 });
  assert.ok(changed.length > 0);
  assert.ok([...changed].every((i) => mask[i] && doc.pixels[i] === 2));
  assert.ok(coords(changed, 16).every(([x]) => x >= 0 && x < 8));
  assert.equal(commitDrawStroke(doc, history, tracker), true);
  assert.equal(history.undo(), true); assert.ok(doc.pixels.every((p) => p === -1));
  assert.equal(history.redo(), true);
  const cancel = beginDrawStroke(doc, { trusted: true });
  strokePixels(doc, { x: 8, y: 8 }, { x: 8, y: 8 }, 3, { trusted: true, tracker: cancel, brushSize: 5 });
  cancelDrawStroke(doc, cancel); assert.ok(doc.pixels.every((p) => p === -1 || p === 2));
});

test('thick outline shapes stay within bounds and filled aliases keep their existing fill', () => {
  const rect = createDrawDocument(16);
  const border = drawShapePixels(rect, { x: 2, y: 3 }, { x: 9, y: 10 }, 2, { shape: 'rectangle', brushSize: 2 });
  const points = coords(border, 16);
  assert.ok(points.every(([x, y]) => x >= 2 && x <= 9 && y >= 3 && y <= 10));
  assert.ok(points.every(([x, y]) => x < 4 || x > 7 || y < 5 || y > 8));
  const ellipse = createDrawDocument(16);
  const ellipseOutline = drawShapePixels(ellipse, { x: 2, y: 2 }, { x: 11, y: 11 }, 2, { shape: 'ellipse', brushSize: 3 });
  assert.ok(coords(ellipseOutline, 16).every(([x, y]) => x >= 2 && x <= 11 && y >= 2 && y <= 11));
  const fill = createDrawDocument(16);
  assert.equal(drawShapePixels(fill, { x: 2, y: 2 }, { x: 5, y: 5 }, 2, { shape: 'rectangle', filled: true, brushSize: 4 }).length, 16);
  const aliasFill = createDrawDocument(16);
  const baselineEllipseFill = createDrawDocument(16);
  const expectedFill = drawShapePixels(baselineEllipseFill, { x: 2, y: 2 }, { x: 5, y: 5 }, 2, { shape: 'ellipse', filled: true });
  assert.deepEqual([...drawShapePixels(aliasFill, { x: 2, y: 2 }, { x: 5, y: 5 }, 2, { shape: 'ellipse', filled: true, brushSize: 4 })], [...expectedFill]);
});

test('spray retains radius based API and its legacy radius two default footprint', () => {
  const doc = createDrawDocument(16);
  const values = [0, 0, 0.1, 0.3, 0.25, 0.8, 0.5, 0.9]; let cursor = 0;
  const defaulted = sprayPixels(doc, { x: 8, y: 8 }, { x: 8, y: 8 }, 1, { random: () => values[cursor++ % values.length] });
  assert.ok(defaulted.length > 1);
  const point = createDrawDocument(16);
  assert.deepEqual(coords(sprayPixels(point, { x: 8, y: 8 }, { x: 8, y: 8 }, 1, { radius: 0, random: () => 0.5 }), 16), [[8,8]]);
});

test('noncontiguous flood compares normalized RGBA, honors masks, and rejects invalid seeds', () => {
  const doc = createDrawDocument(16);
  doc.palette.push(doc.palette[0], '#ff000000');
  doc.pixels.fill(1);
  doc.pixels[0] = 0; doc.pixels[1] = doc.palette.length - 2; doc.pixels[2] = 1;
  doc.pixels[3] = -1; doc.pixels[4] = doc.palette.length - 1;
  doc.pixels[16] = 0;
  const mask = new Uint8Array(256); mask.fill(1); mask[16] = 0; mask[4] = 0;
  const changed = floodFill(doc, 0, 0, 2, { contiguous: false, mask });
  assert.deepEqual([...changed].sort((a, b) => a - b), [0, 1]);
  assert.equal(doc.pixels[2], 1); assert.equal(doc.pixels[3], -1); assert.equal(doc.pixels[4], doc.palette.length - 1);
  assert.deepEqual(floodFill(doc, -1, 0, 3, { contiguous: false }), []);
  assert.deepEqual(floodFill(doc, 4, 0, 3, { contiguous: false, mask }), []);
  const transparent = floodFill(doc, 3, 0, 0, { contiguous: false });
  assert.deepEqual([...transparent].sort((a, b) => a - b), [3, 4]);
});

test('version one bindings accept per-side brush and flood options while retaining historical defaults', () => {
  const palette = ['#000000', '#ffffff'];
  const settings = normalizeDrawInputSettings({ version: 1, unknownSafeValue: 'keep', bindings: { left: { tool: 'line', color: 0, brushSize: 16, contiguous: false }, right: { tool: 'spray', color: 1, sprayRadius: 0 } } }, palette);
  assert.equal(settings.bindings.left.brushSize, 16); assert.equal(settings.bindings.left.contiguous, false);
  assert.equal(settings.bindings.right.spraySize, 1); assert.equal(settings.bindings.right.brushSize, 1); assert.equal(settings.bindings.right.contiguous, true);
  assert.equal(settings.unknownSafeValue, 'keep');
});
