import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRecognizedBackground } from '../../js/pixel-studio/background-flatten.mjs';

const palette = [[24,24,24], [144,144,144], [192,192,192], [240,240,240]];
function sample(width = 11, height = 11) {
  const data = new Uint8ClampedArray(width * height * 4);
  const labels = new Uint32Array(width * height);
  for (let cell = 0; cell < labels.length; cell++) data.set([144,144,144,255], cell * 4);
  return { width, height, data, labels, segmented: true, palette, stats: { quality: 'segmented' } };
}
function paint(frame, x, y, color, owner = 0) {
  const cell = y * frame.width + x;
  frame.data.set([...color,255], cell * 4);
  frame.labels[cell] = owner;
}
function rgb(frame, x, y) {
  return [...frame.data.slice((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 3)];
}

test('flattens only small background color islands and keeps objects, borders and lights', () => {
  const frame = sample();
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) paint(frame,x,y,[192,192,192],7);
  paint(frame,5,5,[24,24,24],7);
  paint(frame,2,2,[24,24,24]);
  paint(frame,3,5,[24,24,24]);
  paint(frame,8,8,[240,240,240]);
  const before = new Uint8ClampedArray(frame.data);
  const out = flattenRecognizedBackground(frame);
  assert.deepEqual(rgb(out,2,2),[144,144,144]);
  assert.deepEqual(rgb(out,5,5),[24,24,24], 'foreground detail is untouched');
  assert.deepEqual(rgb(out,3,5),[24,24,24], 'one-cell outline of the object is untouched');
  assert.deepEqual(rgb(out,8,8),[240,240,240], 'isolated light is preserved');
  assert.deepEqual(frame.data,before, 'input remains unchanged');
  assert.equal(out.stats.backgroundFlattenedCells,1);
  assert.strictEqual(out.labels,frame.labels);
  assert.deepEqual(flattenRecognizedBackground(frame).data,out.data);
});

test('keeps a broad background color boundary and does nothing without reliable owners', () => {
  const frame = sample();
  for (let y = 0; y < frame.height; y++) for (let x = 6; x < frame.width; x++) paint(frame,x,y,[192,192,192]);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) paint(frame,x,y,[24,24,24],2);
  const out = flattenRecognizedBackground(frame);
  assert.deepEqual(rgb(out,5,8),[144,144,144]);
  assert.deepEqual(rgb(out,6,8),[192,192,192]);
  assert.equal(out.stats.backgroundFlattenedCells,0);

  const unsegmented = { ...frame, segmented:false };
  paint(unsegmented,8,8,[24,24,24]);
  const fallback = flattenRecognizedBackground(unsegmented);
  assert.deepEqual(rgb(fallback,8,8),[24,24,24]);
  assert.equal(fallback.stats.backgroundFlattenedCells,0);
});

test('rejects malformed palette pixels or owner maps', () => {
  const frame = sample();
  assert.throws(()=>flattenRecognizedBackground({...frame, labels:new Uint32Array(1)}),TypeError);
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) paint(frame,x,y,[192,192,192],3);
  frame.data[0] = 87;
  assert.throws(()=>flattenRecognizedBackground(frame),TypeError);
});
