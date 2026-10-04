import test from 'node:test';
import assert from 'node:assert/strict';
import { beginDrawStroke, cancelDrawStroke, commitDrawStroke, createDrawDocument, createDrawHistory } from '../../js/creation/draw-core.mjs?rev=20261001-animation-1';
import { drawShapePixels, moveSelectionPixels, selectionBounds, sprayPixels } from '../../js/creation/draw-tool-operations.mjs';

const coords = (indices, width) => [...indices].map((index) => [index % width, Math.floor(index / width)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

test('rectangle geometry normalizes reversed corners, fills and clips to the canvas', () => {
  const document = createDrawDocument(16);
  const outline = drawShapePixels(document, { x: 3, y: 4 }, { x: 1, y: 2 }, 2);
  assert.deepEqual(coords(outline, 16), [[1,2],[2,2],[3,2],[1,3],[3,3],[1,4],[2,4],[3,4]]);
  const filled = createDrawDocument(16);
  const changed = drawShapePixels(filled, { x: -2, y: -1 }, { x: 1, y: 1 }, 3, { filled: true });
  assert.equal(changed.length, 4);
  assert.deepEqual(coords(changed, 16), [[0,0],[1,0],[0,1],[1,1]]);
});

test('ellipse outline and fill are bounded and a degenerate ellipse becomes a line', () => {
  const outlineDoc = createDrawDocument(16);
  const outline = drawShapePixels(outlineDoc, { x: 2, y: 2 }, { x: 6, y: 6 }, 1, { shape: 'ellipse' });
  assert.ok(outline.length > 0 && outline.length < 25);
  assert.ok(coords(outline, 16).every(([x,y]) => x >= 2 && x <= 6 && y >= 2 && y <= 6));
  const filledDoc = createDrawDocument(16);
  const filled = drawShapePixels(filledDoc, { x: 2, y: 2 }, { x: 6, y: 6 }, 1, { shape: 'ellipse', filled: true });
  assert.ok(filled.length > outline.length);
  const reversedDoc = createDrawDocument(16);
  assert.deepEqual([...drawShapePixels(reversedDoc, { x: 6, y: 6 }, { x: 2, y: 2 }, 1, { shape: 'ellipse' })].sort((a, b) => a - b), [...outline].sort((a, b) => a - b));
  const clippedDoc = createDrawDocument(16);
  const clipped = drawShapePixels(clippedDoc, { x: -2, y: -2 }, { x: 2, y: 2 }, 1, { shape: 'ellipse', filled: true });
  assert.ok(clipped.length > 0 && coords(clipped, 16).every(([x, y]) => x >= 0 && x <= 2 && y >= 0 && y <= 2));
  const lineDoc = createDrawDocument(16);
  assert.deepEqual(coords(drawShapePixels(lineDoc, { x: 4, y: 1 }, { x: 4, y: 4 }, 1, { shape: 'ellipse', filled: true }), 16), [[4,1],[4,2],[4,3],[4,4]]);
});

test('ellipse outlines reach every drag-bounds side for odd, even, and thin sizes', () => {
  for (let width = 2; width <= 16; width += 1) for (let height = 2; height <= 16; height += 1) {
    const document = createDrawDocument(32);
    const changed = drawShapePixels(document, { x: 7, y: 6 }, { x: 7 + width - 1, y: 6 + height - 1 }, 2, { shape: 'ellipse' });
    const points = coords(changed, 32);
    assert.ok(points.some(([x]) => x === 7), `left bound missing for ${width}x${height}`);
    assert.ok(points.some(([x]) => x === 7 + width - 1), `right bound missing for ${width}x${height}`);
    assert.ok(points.some(([, y]) => y === 6), `top bound missing for ${width}x${height}`);
    assert.ok(points.some(([, y]) => y === 6 + height - 1), `bottom bound missing for ${width}x${height}`);
  }
  const thin = createDrawDocument(16);
  assert.deepEqual(coords(drawShapePixels(thin, { x: 5, y: 2 }, { x: 5, y: 7 }, 2, { shape: 'ellipse' }), 16), [[5,2],[5,3],[5,4],[5,5],[5,6],[5,7]]);
  const flat = createDrawDocument(16);
  assert.deepEqual(coords(drawShapePixels(flat, { x: 2, y: 5 }, { x: 7, y: 5 }, 2, { shape: 'ellipse' }), 16), [[2,5],[3,5],[4,5],[5,5],[6,5],[7,5]]);
});

test('shape mirror reflects pixels and returns unique changed indices', () => {
  const document = createDrawDocument(16);
  const changed = drawShapePixels(document, { x: 1, y: 1 }, { x: 2, y: 2 }, 4, { filled: true, mirror: true });
  assert.equal(changed.length, 8);
  assert.deepEqual(coords(changed, 16), [[1,1],[2,1],[13,1],[14,1],[1,2],[2,2],[13,2],[14,2]]);
});

test('spray follows a line reproducibly with injected randomness and mirrored dots', () => {
  const first = createDrawDocument(16); const second = createDrawDocument(16);
  const random = () => 0.5;
  const a = sprayPixels(first, { x: 2, y: 5 }, { x: 5, y: 5 }, 6, { radius: 2, random, mirror: true });
  const b = sprayPixels(second, { x: 2, y: 5 }, { x: 5, y: 5 }, 6, { radius: 2, random, mirror: true });
  assert.deepEqual([...a], [...b]);
  assert.ok(a.length > 0);
  for (const [x, y] of coords(a, 16)) assert.ok(coords(a, 16).some(([otherX, otherY]) => otherX === 15 - x && otherY === y));
});

test('shape and spray operations apply diagonal symmetry and preserve legacy horizontal mirror', () => {
  const shape = createDrawDocument(16);
  const shapeChanged = drawShapePixels(shape, { x: 1, y: 0 }, { x: 1, y: 0 }, 3, { symmetry: { diagonalDown: true } });
  assert.deepEqual(coords(shapeChanged, 16), [[1,0],[0,1]]);

  const spray = createDrawDocument(16);
  const sprayChanged = sprayPixels(spray, { x: 1, y: 0 }, { x: 1, y: 0 }, 4, { radius: 0, random: () => 0.5, symmetry: { diagonalUp: true } });
  assert.deepEqual(coords(sprayChanged, 16), [[1,0],[15,14]]);

  const legacy = createDrawDocument(16);
  assert.deepEqual(coords(drawShapePixels(legacy, { x: 1, y: 1 }, { x: 1, y: 1 }, 2, { mirror: true }), 16), [[1,1],[14,1]]);
});

test('selectionBounds clips inclusive drags and rejects a selection outside the canvas', () => {
  assert.deepEqual(selectionBounds({ x: -2, y: 3 }, { x: 2, y: 5 }, 8, 8), { x: 0, y: 3, width: 3, height: 3 });
  assert.deepEqual(selectionBounds({ x: 5, y: 6 }, { x: 3, y: 4 }, 8, 8), { x: 3, y: 4, width: 3, height: 3 });
  assert.equal(selectionBounds({ x: -9, y: 0 }, { x: -8, y: 1 }, 8, 8), null);
  assert.equal(selectionBounds({ x: Infinity, y: 0 }, { x: 1, y: 1 }, 8, 8), null);
});

test('selection move snapshots overlapping content and transparent cells erase destination pixels', () => {
  const document = createDrawDocument(16);
  document.pixels.splice(0, 4, 0, -1, 1, 2);
  const original = [...document.pixels];
  const changed = moveSelectionPixels(document, original, { x: 0, y: 0, width: 2, height: 1 }, 1, 0);
  assert.deepEqual(document.pixels.slice(0, 4), [-1, 0, -1, 2]);
  assert.deepEqual([...changed].sort((a, b) => a - b), [0, 1, 2]);
});

test('selection move clips the destination at canvas edges', () => {
  const document = createDrawDocument(16);
  document.pixels[14] = 3; document.pixels[15] = 4;
  const original = [...document.pixels];
  moveSelectionPixels(document, original, { x: 14, y: 0, width: 2, height: 1 }, 1, 0);
  assert.deepEqual(document.pixels.slice(14, 16), [-1, 3]);
});

test('new operations participate in sparse undo and cancellation tracking', () => {
  const document = createDrawDocument(16); const history = createDrawHistory(document);
  const cancelled = beginDrawStroke(document, { trusted: true });
  drawShapePixels(document, { x: 1, y: 1 }, { x: 3, y: 3 }, 2, { filled: true, symmetry: { diagonalDown: true, horizontal: true }, tracker: cancelled });
  cancelDrawStroke(document, cancelled);
  assert.ok(document.pixels.every((pixel) => pixel === -1));

  const tracker = beginDrawStroke(document, { trusted: true });
  sprayPixels(document, { x: 4, y: 4 }, { x: 4, y: 4 }, 2, { radius: 0, symmetry: { vertical: true }, tracker });
  assert.equal(commitDrawStroke(document, history, tracker), true);
  assert.equal(history.undo(), true); assert.ok(document.pixels.every((pixel) => pixel === -1));
  assert.equal(history.redo(), true); assert.equal(document.pixels[4 * 16 + 4], 2); assert.equal(document.pixels[11 * 16 + 4], 2);
});

test('invalid shape, radius, and pixel values fail closed', () => {
  const document = createDrawDocument(16);
  assert.throws(() => drawShapePixels(document, { x: 0, y: 0 }, { x: 1, y: 1 }, 0, { shape: 'triangle' }), RangeError);
  assert.throws(() => sprayPixels(document, { x: 0, y: 0 }, { x: 1, y: 1 }, 0, { radius: 17 }), RangeError);
  assert.throws(() => drawShapePixels(document, { x: 0, y: 0 }, { x: 1, y: 1 }, 99), TypeError);
});
