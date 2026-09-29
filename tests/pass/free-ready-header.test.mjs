import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHeaderPassState } from '../../js/site-header.mjs';

const HOUR = 60 * 60 * 1000;

test('daily free hour is marked available only when its wait reaches zero', () => {
  const available = deriveHeaderPassState({ remainingMs: 0, freeWaitMs: 0 });
  assert.equal(available.freeReady, true);
  assert.equal(available.displayLabel, '無料1時間');
  assert.equal(available.freeDescription, '今日の無料1時間を受け取れます');
  const beforeMidnight = deriveHeaderPassState({ remainingMs: 0, freeWaitMs: 1 });
  assert.equal(beforeMidnight.freeReady, false);
  assert.equal(beforeMidnight.displayLabel, '+1時間', 'a claimed daily free hour keeps the existing ad extension label');
  assert.match(beforeMidnight.freeDescription, /^明日、無料1時間を受け取れます（あと1分）$/);
  assert.equal(deriveHeaderPassState({ remainingMs: 0, freeWaitMs: 24 * HOUR }).freeReady, false);
});

test('active pass gauge keeps its time while showing the daily free hour', () => {
  const state = deriveHeaderPassState({ remainingMs: HOUR + 30 * 60 * 1000, freeWaitMs: 0 });
  assert.equal(state.freeReady, true);
  assert.equal(state.displayLabel, '1:30', 'active duration remains the main label while free is ready');
  assert.equal(state.gauge.active, true);
  assert.equal(state.gauge.label, '1:30');
  assert.equal(state.gauge.clock, '1:30');
  assert.equal(state.gauge.bank, 2);
});

test('Pro hides the daily free state and retains the existing Pro gauge', () => {
  const state = deriveHeaderPassState({ remainingMs: HOUR, pro: true, freeWaitMs: 0 });
  assert.equal(state.gauge.pro, true);
  assert.equal(state.gauge.label, 'Pro');
  assert.equal(state.freeReady, false);
  assert.equal(state.displayLabel, 'Pro');
  assert.equal(state.freeDescription, '');
});
