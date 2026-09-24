import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialRegionTracker } from '../../js/pixel-studio/material-regions.mjs';

function grid(width, height, value = 0) {
  return new Float64Array(width * height).fill(value);
}

function paint(keys, width, x0, y0, x1, y1, key) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) keys[y * width + x] = key;
}

test('distant same-family materials remain separate connected regions', () => {
  const width = 20, height = 10;
  const keys = grid(width, height, 0);
  paint(keys, width, 2, 3, 6, 7, 70);
  paint(keys, width, 14, 3, 18, 7, 70);
  const result = createMaterialRegionTracker().partition(keys, width, height);

  assert.equal(result.regionCount, 3);
  assert.notEqual(result.labels[3 * width + 3], result.labels[3 * width + 15]);
  assert.equal(result.labels[3 * width + 3], result.labels[6 * width + 5]);
});

test('small rectangle movement preserves its ID when enough same-family cells overlap', () => {
  const width = 12, height = 8;
  const tracker = createMaterialRegionTracker();
  const first = grid(width, height, 0);
  paint(first, width, 3, 2, 6, 5, 101);
  const before = tracker.partition(first, width, height);
  const objectId = before.labels[2 * width + 3];

  const next = grid(width, height, 0);
  paint(next, width, 4, 2, 7, 5, 101);
  const after = tracker.partition(next, width, height);
  assert.equal(after.labels[2 * width + 4], objectId);
});

test('a changed family cannot inherit the previous region ID', () => {
  const width = 10, height = 8;
  const tracker = createMaterialRegionTracker();
  const first = grid(width, height, 0);
  paint(first, width, 3, 2, 7, 6, 33);
  const old = tracker.partition(first, width, height).labels[3 * width + 4];
  const changed = grid(width, height, 0);
  paint(changed, width, 3, 2, 7, 6, 34);
  const next = tracker.partition(changed, width, height).labels[3 * width + 4];

  assert.notEqual(next, old);
});

test('a tiny same-family island near a larger component merges locally', () => {
  const width = 12, height = 8;
  const keys = grid(width, height, 0);
  paint(keys, width, 1, 2, 5, 6, 42);
  keys[3 * width + 7] = 42;
  const result = createMaterialRegionTracker().partition(keys, width, height);

  assert.equal(result.componentCount, 3);
  assert.equal(result.mergedCount, 1);
  assert.equal(result.labels[3 * width + 7], result.labels[3 * width + 4]);
});

test('a protected tiny island is not merged into a nearby same-family region', () => {
  const width = 12, height = 8;
  const keys = grid(width, height, 0);
  paint(keys, width, 1, 2, 5, 6, 42);
  const tiny = 3 * width + 7;
  keys[tiny] = 42;
  const protectedCells = new Uint8Array(width * height);
  protectedCells[tiny] = 1;
  const result = createMaterialRegionTracker().partition(keys, width, height, { protectedCells });

  assert.equal(result.componentCount, 3);
  assert.equal(result.mergedCount, 0);
  assert.notEqual(result.labels[tiny], result.labels[3 * width + 4]);
});

test('reset restarts region IDs and geometry changes do not reuse stale IDs', () => {
  const tracker = createMaterialRegionTracker();
  const first = grid(4, 4, 0);
  const firstId = tracker.partition(first, 4, 4).labels[0];
  tracker.reset();
  const resetId = tracker.partition(first, 4, 4).labels[0];
  assert.equal(firstId, 1);
  assert.equal(resetId, 1);

  const wider = grid(5, 4, 0);
  const changedGeometry = tracker.partition(wider, 5, 4);
  assert.notEqual(changedGeometry.labels[0], resetId);
});

test('the partitioner rejects malformed dimensions and non-integer family keys', () => {
  const tracker = createMaterialRegionTracker();
  assert.throws(() => tracker.partition(grid(2, 2), 0, 2), RangeError);
  assert.throws(() => tracker.partition(new Float64Array([0, 1]), 2, 2), TypeError);
  assert.throws(() => tracker.partition(new Float64Array([0, 1.5, 0, 0]), 2, 2), TypeError);
  assert.throws(() => tracker.partition(new Float64Array([0, -1, 0, 0]), 2, 2), TypeError);
  assert.throws(() => tracker.partition(grid(2, 2), 2, 2, { protectedCells: new Uint8Array(1) }), /protectedCells/);
  assert.throws(() => tracker.partition(grid(2, 2), 2, 2, { protectedCells: new Uint8Array([0, 0, 2, 0]) }), /must be 0 or 1/);
});
