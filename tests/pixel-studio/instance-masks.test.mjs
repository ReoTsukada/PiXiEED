import test from 'node:test';
import assert from 'node:assert/strict';
import { composeVisibleLabels } from '../../js/pixel-studio/instance-masks.mjs';

const mask = (...values) => Uint8Array.from(values);
const confidence = (...values) => Float32Array.from(values);

test('single masks label their visible pixels and leave background at zero', () => {
  const result = composeVisibleLabels({
    width: 3,
    height: 1,
    instances: [{ id: 17, score: 0.8, mask: mask(1, 0, 1) }]
  });
  assert.deepEqual([...result.labels], [17, 0, 17]);
  assert.equal(result.width, 3);
  assert.equal(result.height, 1);
  assert.equal(result.ownership, 'visible-mask');
  assert.equal(result.overlapResolution, 'provided-order-or-confidence');
});

test('when both overlapping instances provide order, larger frontOrder wins over score', () => {
  const result = composeVisibleLabels({
    width: 2,
    height: 1,
    instances: [
      { id: 1, score: 1, frontOrder: 2, mask: mask(1, 1) },
      { id: 2, score: 0.1, frontOrder: 3, mask: mask(1, 0) }
    ]
  });
  assert.deepEqual([...result.labels], [2, 1]);
});

test('otherwise per-pixel confidence multiplied by instance score chooses owner', () => {
  const result = composeVisibleLabels({
    width: 2,
    height: 1,
    instances: [
      { id: 10, score: 0.9, mask: mask(1, 1), confidence: confidence(0.6, 0.9) },
      { id: 20, score: 0.7, mask: mask(1, 1), confidence: confidence(0.9, 0.8) }
    ]
  });
  assert.deepEqual([...result.labels], [20, 10]);
});

test('confidence below the hard visibility threshold is background; 0.5 is included', () => {
  const result = composeVisibleLabels({
    width: 2,
    height: 1,
    instances: [{ id: 3, score: 1, mask: mask(1, 1), confidence: confidence(0.499, 0.5) }]
  });
  assert.deepEqual([...result.labels], [0, 3]);
});

test('equal ownership scores resolve by smaller id independent of input order', () => {
  const a = { id: 7, score: 0.5, mask: mask(1) };
  const b = { id: 4, score: 0.5, mask: mask(1) };
  const first = composeVisibleLabels({ width: 1, height: 1, instances: [a, b] });
  const second = composeVisibleLabels({ width: 1, height: 1, instances: [b, a] });
  assert.deepEqual([...first.labels], [4]);
  assert.deepEqual(second.labels, first.labels);
});

test('inputs are not mutated and caller retains responsibility for stable IDs', () => {
  const sourceMask = mask(1, 0);
  const sourceConfidence = confidence(0.75, 0.25);
  const instance = { id: 9, score: 0.8, mask: sourceMask, confidence: sourceConfidence };
  const beforeMask = sourceMask.slice();
  const beforeConfidence = sourceConfidence.slice();
  composeVisibleLabels({ width: 2, height: 1, instances: [instance] });
  assert.deepEqual(sourceMask, beforeMask);
  assert.deepEqual(sourceConfidence, beforeConfidence);
  assert.equal(instance.id, 9);
});

test('rejects invalid dimensions, instance count, duplicate IDs, and malformed values', () => {
  assert.throws(() => composeVisibleLabels({ width: 0, height: 1, instances: [] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 2001, height: 2000, instances: [] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: Array(257).fill(null) }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(1) }, { id: 1, score: 1, mask: mask(1) }] }), /duplicate/);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 0, score: 1, mask: mask(1) }] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: NaN, mask: mask(1) }] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(1, 0) }] }), TypeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(2) }] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(1), confidence: confidence(1, 0) }] }), TypeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(1), confidence: confidence(Infinity) }] }), RangeError);
  assert.throws(() => composeVisibleLabels({ width: 1, height: 1, instances: [{ id: 1, score: 1, mask: mask(1), frontOrder: Infinity }] }), RangeError);
});

// Keep score ties exact: storing 0.9 in Float32 changes the tie on comparison.
test('non-integer confidence ties prefer the same lower identity', () => {
  const mask = new Uint8Array([1]);
  const result = composeVisibleLabels({width:1, height:1, instances:[
    {id:1,score:0.9,mask}, {id:2,score:0.9,mask}
  ]});
  assert.equal(result.labels[0],1);
});
