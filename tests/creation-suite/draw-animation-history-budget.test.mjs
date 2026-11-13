import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnimationLayer, createAnimation, estimateRetainedAnimationBytes, setAnimationDrawRewardBonusColors, setAnimationFrameDuration, writeAnimationCel,
} from '../../js/creation/animation-core.mjs';
import { createRetainedAnimationBytesCounter } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationHistory } from '../../js/creation/draw-animation-history.mjs';

const layerId = (animation) => animation.layers[0].id;
function edited(animation, value, x = 0) {
  return writeAnimationCel(animation, animation.frames[0].id, layerId(animation), {
    width: animation.width, height: animation.height,
    pixels: Array.from({ length: animation.width * animation.height }, (_, i) => i === x ? value : 0),
  });
}
function legacyTrim(past, future, current, maxBytes, maxEntries) {
  while (past.length + future.length > maxEntries) { if (past.length) past.shift(); else future.shift(); }
  const extraBytes = () => estimateRetainedAnimationBytes([...past, ...future, current]) - estimateRetainedAnimationBytes([current]);
  while (extraBytes() > maxBytes) { if (past.length) past.shift(); else if (future.length) future.shift(); else break; }
}

test('trim-local counter matches estimator for duplicate snapshots and distinct shared tile buffers', () => {
  let a = createAnimation({ width: 64, height: 32, palette: ['#123456', '#abcdef'] });
  a = edited(a, 1, 0);
  let b = edited(a, 2, 1);
  const snapshots = [a, a, b, a];
  const counter = createRetainedAnimationBytesCounter(snapshots);
  assert.equal(counter.bytes, estimateRetainedAnimationBytes(snapshots), 'duplicate snapshot metadata counts per occurrence, tile arrays count by identity');
  counter.remove(a);
  assert.equal(counter.bytes, estimateRetainedAnimationBytes([a, b, a]));
  counter.remove(a);
  assert.equal(counter.bytes, estimateRetainedAnimationBytes([b, a]));
  counter.remove(b);
  counter.remove(a);
  assert.equal(counter.bytes, 0);
  assert.throws(() => counter.remove(a), /履歴外/);
  const sameContent = edited(createAnimation({ width: 64, height: 32, palette: ['#123456', '#abcdef'] }), 1, 0);
  assert.equal(estimateRetainedAnimationBytes([a, sameContent]), estimateRetainedAnimationBytes([a]) + estimateRetainedAnimationBytes([sameContent]),
    'equal-content tile buffers from separate animations are distinct by object identity');
  assert.equal(createRetainedAnimationBytesCounter([a, sameContent]).bytes,
    estimateRetainedAnimationBytes([a]) + estimateRetainedAnimationBytes([sameContent]),
    'the trim-local counter also keeps equal-content but identity-distinct buffers separate');
});

test('bonus metadata is measured anew when mutable metadata on one snapshot changes', () => {
  let a = createAnimation({ width: 2, height: 1, palette: ['#123456', '#abcdef'] });
  const before = estimateRetainedAnimationBytes([a]);
  setAnimationDrawRewardBonusColors(a, ['#123456ff']);
  const after = estimateRetainedAnimationBytes([a]);
  assert.ok(after > before);
  const counter = createRetainedAnimationBytesCounter([a, a]);
  assert.equal(counter.bytes, estimateRetainedAnimationBytes([a, a]));
  setAnimationDrawRewardBonusColors(a, ['#123456ff', '#abcdef80']);
  assert.ok(estimateRetainedAnimationBytes([a, a]) > counter.bytes, 'a later counter sees updated same-object bonus metadata');
  assert.equal(createRetainedAnimationBytesCounter([a, a]).bytes, estimateRetainedAnimationBytes([a, a]), 'a fresh trim-local counter reads current bonus metadata');
});

test('Draw history max-entry and byte trims retain legacy removal order', () => {
  let a = createAnimation({ width: 32, height: 32, palette: ['#123456', '#abcdef'] });
  const versions = [a];
  for (let i = 0; i < 8; i++) { a = edited(a, (i % 2) + 1, i); versions.push(a); }
  for (const maxBytes of [0, 400, 2_000, 20_000]) {
    const maxEntries = 3, past = [], future = []; let current = versions[0];
    const history = createDrawAnimationHistory(current, { maxBytes, maxEntries });
    for (const next of versions.slice(1)) {
      history.commit(next); past.push(current); future.length = 0; current = next;
      legacyTrim(past, future, current, maxBytes, maxEntries);
      assert.deepEqual(history.snapshot(), { current, past: [...past], future: [...future] });
    }
  }
});

test('Draw history byte cap keeps exact-boundary history and trims one byte below it', () => {
  const initial = edited(createAnimation({ width: 64, height: 32, palette: ['#123456', '#abcdef'] }), 1, 0);
  const next = edited(initial, 2, 1);
  const extra = estimateRetainedAnimationBytes([initial, next]) - estimateRetainedAnimationBytes([next]);
  const exact = createDrawAnimationHistory(initial, { maxBytes: extra, maxEntries: 4 });
  exact.commit(next);
  assert.deepEqual(exact.snapshot().past, [initial], 'the measured boundary is inclusive');
  const under = createDrawAnimationHistory(initial, { maxBytes: extra - 1, maxEntries: 4 });
  under.commit(next);
  assert.deepEqual(under.snapshot().past, [], 'one byte below the boundary evicts the old snapshot');
});

test('default 4 MiB Draw history trim matches the naive estimator near its metadata boundary', () => {
  let current = addAnimationLayer(createAnimation({ width: 16, height: 16, palette: ['#123456'] }), { name: 'x'.repeat(43_000) });
  const frameId = current.frames[0].id, history = createDrawAnimationHistory(current);
  assert.ok(estimateRetainedAnimationBytes([current]) < 1024 * 1024, 'each metadata-only snapshot remains below 1 MiB');
  const past = [], future = [], maxBytes = 4 * 1024 * 1024, maxEntries = 100;
  for (let i = 0; i < 110; i++) {
    const next = setAnimationFrameDuration(current, frameId, 100 + (i % 59) + 1);
    history.commit(next);
    past.push(current); future.length = 0; current = next;
    legacyTrim(past, future, current, maxBytes, maxEntries);
    const snapshot = history.snapshot();
    assert.equal(snapshot.current, current);
    assert.deepEqual(snapshot.past, past);
    assert.deepEqual(snapshot.future, future);
  }
  assert.ok(history.snapshot().past.length < maxEntries, 'the default 4 MiB metadata budget evicts snapshots');
  assert.ok(estimateRetainedAnimationBytes([...history.snapshot().past, current]) - estimateRetainedAnimationBytes([current]) <= maxBytes);
});

test('undo temporarily preserves redo beyond byte budget; redo, branch, restore, reset and errors keep existing semantics', () => {
  let a = createAnimation({ width: 32, height: 32, palette: ['#123456', '#abcdef'] });
  const v1 = edited(a, 1), v2 = edited(v1, 2, 1), v3 = edited(v2, 1, 2);
  const history = createDrawAnimationHistory(a, { maxBytes: 0, maxEntries: 4 });
  history.commit(v1); history.commit(v2);
  assert.equal(history.canUndo, false, 'zero extra-byte budget trims past snapshots');
  const full = createAnimation({ width: 64, height: 64, palette: ['#123456', '#abcdef'] });
  const large = writeAnimationCel(full, full.frames[0].id, full.layers[0].id, {
    width: 64, height: 64, pixels: new Array(64 * 64).fill(1),
  });
  const roomy = createDrawAnimationHistory(full, { maxBytes: 1_000, maxEntries: 4 });
  roomy.commit(large);
  assert.equal(roomy.undo(), true);
  const undoState = roomy.snapshot();
  assert.deepEqual(undoState, { current: full, past: [], future: [large] }, 'undo itself does not trim redo');
  assert.ok(estimateRetainedAnimationBytes([full, ...undoState.future]) - estimateRetainedAnimationBytes([full]) > 1_000,
    'redo memory can temporarily exceed the cap after undo');
  assert.equal(roomy.redo(), true);
  const branch = createDrawAnimationHistory(a, { maxBytes: 100_000, maxEntries: 4 });
  branch.commit(v1); branch.commit(v2);
  assert.equal(branch.undo(), true);
  assert.deepEqual(branch.snapshot(), { current: v1, past: [a], future: [v2] }, 'undo preserves redo');
  assert.equal(branch.redo(), true);
  assert.equal(branch.current, v2);
  assert.equal(branch.undo(), true);
  branch.commit(v3);
  assert.deepEqual(branch.snapshot(), { current: v3, past: [a, v1], future: [] }, 'branch commit discards redo');
  const before = branch.snapshot();
  assert.throws(() => branch.restore({ past: [a], current: a, future: ['bad'] }));
  assert.deepEqual(branch.snapshot(), before, 'failed restore is atomic');
  assert.throws(() => branch.commit({ invalid: true }));
  assert.deepEqual(branch.snapshot(), before, 'invalid commit leaves history unchanged');
  assert.throws(() => branch.reset({ invalid: true }));
  assert.deepEqual(branch.snapshot(), before, 'invalid reset leaves history unchanged');
  const budgeted = createDrawAnimationHistory(a, { maxBytes: 0, maxEntries: 4 });
  const budgetBefore = budgeted.snapshot();
  assert.throws(() => budgeted.restore({ past: [a], current: v1, future: [] }), /保存上限/);
  assert.deepEqual(budgeted.snapshot(), budgetBefore, 'over-budget restore is atomic');
  const handoff = { past: [a, v1], current: v2, future: [v3] };
  branch.restore(handoff);
  assert.deepEqual(branch.snapshot(), { past: [a, v1], current: v2, future: [v3] });
});
