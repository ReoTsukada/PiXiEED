import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rawPixelCellAt } from '../../js/creation/pixel-input.mjs?rev=20261001-connected-editor-1';

const source = await readFile(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');

function extractFunction(name, parameters, argumentsFor) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = bodyStart; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) {
      return new Function(...parameters, `return (${source.slice(start, i + 1)});`)(...parameters.map((_, index) => argumentsFor[index]));
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const getPointFromEvent = extractFunction('pointFromEvent', ['rawPixelCellAt', 'canvas', 'documentData'], [
  rawPixelCellAt,
  { getBoundingClientRect() { throw new Error('point conversion should use provided rect'); } },
  { width: 20, height: 10 },
]);

test('one event geometry snapshot maps all coalesced and dispatched samples exactly', () => {
  let rectReads = 0, styleWrites = 0;
  const rect = { left: 10.25, top: 20.5, width: 100, height: 50 };
  const canvas = { getBoundingClientRect() { rectReads++; return rect; } };
  const dimensions = { width: 20, height: 10 };
  const point = extractFunction('pointFromEvent', ['rawPixelCellAt', 'canvas', 'documentData'], [rawPixelCellAt, canvas, dimensions]);
  const exact = extractFunction('exactSelectionPoint', ['canvas', 'documentData'], [canvas, dimensions]);
  const exactForHandle = extractFunction('exactSelectionPoint', ['canvas', 'documentData'], [canvas, dimensions]);
  const handle = extractFunction('selectionHandleAtEvent', ['selectionControls', 'selectionFrame', 'selectionContains', 'exactSelectionPoint'], [
    { hit(p) { return p.x === 2 ? 'pivot' : null; } }, () => null, () => false, exactForHandle,
  ]);
  const samples = [
    { clientX: 10.25, clientY: 20.5, pressure: 0.1 },
    { clientX: 35.25, clientY: 45.5, pressure: 0.3 },
    { clientX: 110.25, clientY: 70.5, pressure: 0.9 },
  ];
  const capturedCanvasRect = canvas.getBoundingClientRect();
  const capturedBoardRect = { left: 0, top: 0, width: 160, height: 100 };
  styleWrites++; // represents showCursor's first DOM write after both rect reads
  const mapped = samples.map((sample) => point(sample, capturedCanvasRect));
  assert.deepEqual(mapped, [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 20, y: 10 }]);
  assert.deepEqual(exact(samples[1], capturedCanvasRect), { x: 5, y: 5 });
  assert.equal(handle({ clientX: 20.25, clientY: 20.5, pointerType: 'mouse' }, capturedCanvasRect), 'pivot');
  assert.equal(rectReads, 1);
  assert.equal(styleWrites, 1);
  assert.deepEqual(samples.map((s) => s.pressure), [0.1, 0.3, 0.9]);
  assert.equal(capturedBoardRect.left, 0);
});

test('each subsequent move takes a fresh rect; default pointer conversion still reads live geometry', () => {
  const rects = [
    { left: 0.25, top: 0.5, width: 20, height: 10 },
    { left: 5.25, top: 2.5, width: 40, height: 20 },
  ];
  let index = 0;
  const canvas = { getBoundingClientRect() { return rects[index++]; } };
  const point = extractFunction('pointFromEvent', ['rawPixelCellAt', 'canvas', 'documentData'], [rawPixelCellAt, canvas, { width: 20, height: 10 }]);
  const event = { clientX: 10.25, clientY: 5.5 };
  const firstRect = canvas.getBoundingClientRect();
  assert.deepEqual(point(event, firstRect), { x: 10, y: 5 });
  const secondRect = canvas.getBoundingClientRect();
  assert.deepEqual(point(event, secondRect), { x: 2, y: 1 });
  assert.deepEqual(point(event), { x: -1, y: -1 });
  assert.equal(index, 3);
});

test('actual sample dispatcher preserves coalesced order, endpoint event, and pressure-bearing event', () => {
  const rect = { left: 0, top: 0, width: 100, height: 50 };
  const canvas = { getBoundingClientRect() { throw new Error('snapshot must be reused'); } };
  const dimensions = { width: 20, height: 10 };
  const point = extractFunction('pointFromEvent', ['rawPixelCellAt', 'canvas', 'documentData'], [rawPixelCellAt, canvas, dimensions]);
  const seen = [];
  const applyDrawPoint = (p, event, deferred, passedRect) => seen.push({ p, event, deferred, passedRect });
  const dispatch = extractFunction('applyPointerMoveSamples', ['drawing', 'drawingPointerId', 'effectiveTool', 'pointFromEvent', 'applyDrawPoint'], [
    true, 7, () => 'pen', point, applyDrawPoint,
  ]);
  const coalesced = [
    { clientX: 10, clientY: 5, pressure: 0.2 },
    { clientX: 60, clientY: 30, pressure: 0.7 },
  ];
  const endpoint = { pointerId: 7, clientX: 90, clientY: 45, pressure: 0.9, getCoalescedEvents: () => coalesced };
  dispatch(endpoint, rect);
  assert.deepEqual(seen.map((entry) => entry.p), [{ x: 2, y: 1 }, { x: 12, y: 6 }, { x: 18, y: 9 }]);
  assert.deepEqual(seen.map((entry) => entry.event), [null, null, endpoint]);
  assert.deepEqual(seen.map((entry) => entry.deferred), [true, true, true]);
  assert.deepEqual(seen.map((entry) => entry.passedRect), [rect, rect, rect]);
  assert.deepEqual(coalesced.map((sample) => sample.pressure), [0.2, 0.7]);
  assert.equal(endpoint.pressure, 0.9);
});

test('pointermove snapshots canvas and board before cursor writes and preserves sample dispatch order', () => {
  const at = (needle) => source.indexOf(needle, source.indexOf('function handleCanvasPointerMove'));
  assert.ok(at('const geometry = { canvasRect: canvas.getBoundingClientRect(), boardRect:') < at('showCursor(event, geometry)'));
  assert.ok(at('showCursor(event, geometry)') < at('applyPointerMoveSamples(event, geometry.canvasRect)'));
  const apply = source.slice(source.indexOf('function applyPointerMoveSamples'), source.indexOf('function handleCanvasPointerMove'));
  assert.ok(apply.indexOf('for (const sample of samples)') < apply.indexOf('applyDrawPoint(pointFromEvent(event, canvasRect), event'));
  assert.match(apply, /getCoalescedEvents\(\)/);
  assert.match(apply, /applyDrawPoint\(pointFromEvent\(event, canvasRect\), event, coalescedTool, canvasRect\)/);
  assert.match(source.slice(source.indexOf('function handleCanvasPointerMove'), source.indexOf('canvas.addEventListener(\'pointermove\'')), /applyPointerMoveSamples\(event, geometry\.canvasRect\)/);
});
