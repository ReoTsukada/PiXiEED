import test from 'node:test';
import assert from 'node:assert/strict';
import { beginDrawStroke, cancelDrawStroke, commitDrawStroke, createDrawDocument, createDrawHistory, strokePixels } from '../../js/creation/draw-core.mjs';
import { drawShapePixels, selectionBounds, sprayPixels } from '../../js/creation/draw-tool-operations.mjs';
import { pixelLineCells } from '../../js/creation/pixel-input.mjs?rev=20261001-connected-editor-1';

const coords = (indices, width) => [...indices].map((index) => [index % width, Math.floor(index / width)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

test('ordinary stroke coordinates keep the shared Bresenham pixel sequence', () => {
  const document = createDrawDocument(16);
  const expected = [...pixelLineCells({ x: -2, y: 1 }, { x: 8, y: 6 })]
    .filter(({ x, y }) => x >= 0 && y >= 0 && x < 16 && y < 16).map(({ x, y }) => y * 16 + x);
  assert.deepEqual(strokePixels(document, { x: -2, y: 1 }, { x: 8, y: 6 }, 2), expected);
});

test('distant pen segments crossing the canvas are clipped before rasterization', () => {
  const document = createDrawDocument(16);
  const tracker = beginDrawStroke(document, { trusted: true });
  const changed = strokePixels(document, { x: -1_000_000_000, y: 8 }, { x: 1_000_000_000, y: 8 }, 3, { trusted: true, tracker, mask: Uint8Array.from({ length: 256 }, (_, i) => i % 16 < 8) });
  assert.equal(changed.length, 8);
  assert.deepEqual(coords(changed, 16), Array.from({ length: 8 }, (_, x) => [x, 8]));
  assert.equal(commitDrawStroke(document, createDrawHistory(document), tracker), true);
});

test('distant strokes preserve canvas boundary cells and work on a 1x1 canvas', () => {
  const edge = createDrawDocument(16);
  const changed = strokePixels(edge, { x: -1_000_000_000, y: 15 }, { x: 15, y: 15 }, 2);
  assert.deepEqual(changed, Array.from({ length: 16 }, (_, x) => 240 + x));

  const single = { schemaVersion: 1, width: 1, height: 1, palette: ['#263238'], pixels: [-1] };
  assert.deepEqual(strokePixels(single, { x: -1_000_000_000, y: 0 }, { x: 1_000_000_000, y: 0 }, 0), [0]);
  assert.equal(single.pixels[0], 0);
});

test('distant spray retains canvas crossings and brush-radius margin', () => {
  const plain = createDrawDocument(16);
  const changed = sprayPixels(plain, { x: -1_000_000_000, y: 8 }, { x: 1_000_000_000, y: 8 }, 1, { radius: 0 });
  assert.equal(changed.length, 16);
  const brushed = createDrawDocument(16);
  const randomValues = [0.5, 1]; let cursor = 0;
  sprayPixels(brushed, { x: -1_000_000_000, y: 8 }, { x: 1_000_000_000, y: 8 }, 1, { radius: 2, random: () => randomValues[cursor++ % randomValues.length] });
  assert.ok(brushed.pixels.some((value, index) => value === 1 && index % 16 === 0));
});

test('far finite shape and selection drags retain rectangle intent and intersect canvas bounds', () => {
  assert.deepEqual(selectionBounds({ x: -1_000_000_000, y: -1_000_000_000 }, { x: 1_000_000_000, y: 1_000_000_000 }, 16, 16), { x: 0, y: 0, width: 16, height: 16 });
  const filled = createDrawDocument(16);
  assert.equal(drawShapePixels(filled, { x: -1_000_000_000, y: -1_000_000_000 }, { x: 1_000_000_000, y: 1_000_000_000 }, 2, { filled: true }).length, 256);
  const outline = createDrawDocument(16);
  assert.equal(drawShapePixels(outline, { x: -1_000_000_000, y: -1_000_000_000 }, { x: 1_000_000_000, y: 1_000_000_000 }, 2).length, 0);
});

test('outside-only distant strokes and selections leave the canvas untouched', () => {
  const document = createDrawDocument(16);
  assert.deepEqual(strokePixels(document, { x: -1_000_000_000, y: -1_000_000_000 }, { x: -1_000_000_000, y: 1_000_000_000 }, 1), []);
  assert.equal(selectionBounds({ x: -1_000_000_000, y: 0 }, { x: -900_000_000, y: 15 }, 16, 16), null);
  assert.ok(document.pixels.every((value) => value === -1));
});

test('distant strokes preserve symmetry and sparse undo and cancellation', () => {
  const document = createDrawDocument(16); const history = createDrawHistory(document);
  const tracker = beginDrawStroke(document, { trusted: true });
  sprayPixels(document, { x: -1_000_000_000, y: 3 }, { x: 1_000_000_000, y: 3 }, 4, { radius: 0, symmetry: { vertical: true }, tracker });
  assert.ok(document.pixels.slice(12 * 16, 13 * 16).some((value) => value === 4));
  assert.equal(commitDrawStroke(document, history, tracker), true);
  assert.equal(history.undo(), true);
  assert.ok(document.pixels.every((value) => value === -1));

  const cancelled = beginDrawStroke(document, { trusted: true });
  strokePixels(document, { x: -1_000_000_000, y: 9 }, { x: 1_000_000_000, y: 9 }, 2, { trusted: true, tracker: cancelled });
  cancelDrawStroke(document, cancelled);
  assert.ok(document.pixels.every((value) => value === -1));
});
