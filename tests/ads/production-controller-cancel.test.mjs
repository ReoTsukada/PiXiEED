import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardedController } from '../../js/ads/rewarded-controller.mjs';

function harness() {
  let emit, resolveGrant, rejectGrant, grants = 0;
  const pendingGrant = new Promise((resolve, reject) => { resolveGrant = resolve; rejectGrant = reject; });
  const controller = createRewardedController({
    createAdapter: options => {
      emit = options.emit;
      return { prepare() { emit({ type: 'ready' }); }, show() { return true; }, destroy() {} };
    },
    onGrant() { grants++; return pendingGrant; },
    schedule: () => 1, cancelSchedule() {}
  });
  const abort = new AbortController();
  const result = controller.run({ optIn: true, onReady: ({ show }) => show(), signal: abort.signal });
  return { controller, abort, result, emit: type => emit({ type }), resolveGrant, rejectGrant, grants: () => grants };
}

test('cancel and AbortSignal cannot report cancellation after receipt persistence starts', async () => {
  const h = harness();
  h.emit('granted');
  assert.equal(h.grants(), 1);
  assert.equal(h.controller.cancel(), false);
  h.abort.abort();
  assert.equal(h.controller.state.phase, 'showing');
  h.emit('granted');
  assert.equal(h.grants(), 1, 'duplicate receipts do not persist twice');
  h.emit('closed');
  h.resolveGrant();
  assert.equal(await h.result, 'granted');
  assert.equal(h.controller.state.phase, 'granted');
  h.controller.dispose();
});

test('persistence failure after an ignored cancel remains an error', async () => {
  const h = harness();
  h.emit('granted');
  h.abort.abort();
  h.rejectGrant(new Error('storage unavailable'));
  assert.equal(await h.result, 'error');
  assert.equal(h.controller.state.phase, 'error');
  h.controller.dispose();
});

test('abort before a matching receipt cancels and ignores a later grant', async () => {
  const h = harness();
  h.abort.abort();
  assert.equal(await h.result, 'cancelled');
  h.emit('granted');
  assert.equal(h.grants(), 0);
  assert.equal(h.controller.state.rewarded, false);
  h.controller.dispose();
});
