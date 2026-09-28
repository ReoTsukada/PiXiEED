import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location = { search: '' };
const { showRewardedAd } = await import('../../js/pixieed-pass.mjs');

function makeAdHarness({ unsupported = false, deferCommand = false, beforeDefine = () => {} } = {}) {
  const callbacks = new Map();
  const commandQueue = [];
  const destroyed = [];
  const slot = { addService() { return this; } };
  const pubads = {
    addEventListener(type, callback) { callbacks.set(type, callback); },
    removeEventListener(type, callback) { if (callbacks.get(type) === callback) callbacks.delete(type); }
  };
  const googletag = {
    cmd: { push(callback) { if (deferCommand) commandQueue.push(callback); else callback(); } },
    enums: { OutOfPageFormat: { REWARDED: 'rewarded' } },
    defineOutOfPageSlot() { beforeDefine(); return unsupported ? null : slot; },
    pubads: () => pubads,
    enableServices() {}, display() {},
    destroySlots(slots) { destroyed.push(...slots); }
  };
  return { callbacks, commandQueue, destroyed, slot, googletag };
}

async function beginAd(harness, search) {
  globalThis.location.search = search;
  globalThis.document = { querySelector: () => ({}) };
  globalThis.googletag = harness.googletag;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let nextTimer = 1;
  globalThis.setTimeout = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const result = showRewardedAd('/23379831154/pixieed_rewarded');
  await Promise.resolve();
  return {
    result, timers,
    restore() { globalThis.setTimeout = previousSetTimeout; globalThis.clearTimeout = previousClearTimeout; }
  };
}

test('only diagnostic render nofill retains a slot briefly and cleanup runs on expiry or retry', async () => {
  const normal = makeAdHarness();
  let run = await beginAd(normal, '');
  normal.callbacks.get('slotRenderEnded')({ slot: normal.slot, isEmpty: true });
  assert.equal(await run.result, 'nofill');
  run.restore();
  assert.deepEqual(normal.destroyed, [normal.slot]);
  assert.equal(normal.callbacks.size, 0);

  const diagnostic = makeAdHarness();
  run = await beginAd(diagnostic, '?dfpdeb=anything');
  diagnostic.callbacks.get('slotRenderEnded')({ slot: diagnostic.slot, isEmpty: true });
  assert.equal(await run.result, 'nofill');
  assert.equal(diagnostic.destroyed.length, 0);
  assert.equal(diagnostic.callbacks.size, 0);
  const expiry = [...run.timers.values()].find((timer) => timer.delay === 5 * 60 * 1000);
  assert.ok(expiry, 'diagnostic slot has a finite cleanup timer');
  run.restore();

  const retry = makeAdHarness();
  run = await beginAd(retry, '');
  assert.deepEqual(diagnostic.destroyed, [diagnostic.slot], 'starting the next request destroys the retained slot');
  retry.callbacks.get('rewardedSlotReady')({ slot: retry.slot, makeRewardedVisible: () => true });
  retry.callbacks.get('rewardedSlotClosed')({ slot: retry.slot });
  assert.equal(await run.result, 'closed');
  run.restore();
  assert.deepEqual(retry.destroyed, [retry.slot]);
  assert.equal(retry.callbacks.size, 0);

  const expiring = makeAdHarness();
  run = await beginAd(expiring, '?dfpdeb');
  expiring.callbacks.get('slotRenderEnded')({ slot: expiring.slot, isEmpty: true });
  assert.equal(await run.result, 'nofill');
  const timer = [...run.timers.values()].find((item) => item.delay === 5 * 60 * 1000);
  run.restore();
  timer.callback();
  assert.deepEqual(expiring.destroyed, [expiring.slot], 'the diagnostic timeout destroys the retained slot');
});

test('diagnostic mode still cleans granted, unsupported, invisible, and timeout outcomes', async () => {
  const granted = makeAdHarness();
  let run = await beginAd(granted, '?dfpdeb');
  granted.callbacks.get('rewardedSlotReady')({ slot: granted.slot, makeRewardedVisible: () => true });
  granted.callbacks.get('rewardedSlotGranted')({ slot: granted.slot });
  granted.callbacks.get('rewardedSlotClosed')({ slot: granted.slot });
  assert.equal(await run.result, 'granted');
  run.restore();
  assert.deepEqual(granted.destroyed, [granted.slot]);
  assert.equal(granted.callbacks.size, 0);

  const unsupported = makeAdHarness({ unsupported: true });
  run = await beginAd(unsupported, '?dfpdeb');
  assert.equal(await run.result, 'unsupported');
  run.restore();
  assert.deepEqual(unsupported.destroyed, []);

  const invisible = makeAdHarness();
  run = await beginAd(invisible, '?dfpdeb');
  invisible.callbacks.get('rewardedSlotReady')({ slot: invisible.slot, makeRewardedVisible: () => false });
  assert.equal(await run.result, 'nofill');
  run.restore();
  assert.deepEqual(invisible.destroyed, [invisible.slot]);
  assert.equal(invisible.callbacks.size, 0);

  const timedOut = makeAdHarness();
  run = await beginAd(timedOut, '?dfpdeb');
  const timeout = [...run.timers.values()].find((timer) => timer.delay === 10000);
  run.restore();
  timeout.callback();
  assert.equal(await run.result, 'timeout');
  assert.deepEqual(timedOut.destroyed, [timedOut.slot]);
  assert.equal(timedOut.callbacks.size, 0);
});

test('queued GPT work cleans a slot retained after the retry began', async () => {
  const first = makeAdHarness();
  let firstRun = await beginAd(first, '?dfpdeb');
  firstRun.restore();

  const retry = makeAdHarness({ deferCommand: true, beforeDefine: () => assert.deepEqual(first.destroyed, [first.slot]) });
  const retryRun = await beginAd(retry, '?dfpdeb');
  first.callbacks.get('slotRenderEnded')({ slot: first.slot, isEmpty: true });
  assert.equal(await firstRun.result, 'nofill');
  retry.commandQueue.shift()();
  retry.callbacks.get('rewardedSlotReady')({ slot: retry.slot, makeRewardedVisible: () => true });
  retry.callbacks.get('rewardedSlotClosed')({ slot: retry.slot });
  assert.equal(await retryRun.result, 'closed');
  retryRun.restore();
  assert.deepEqual(first.destroyed, [first.slot]);
  assert.deepEqual(retry.destroyed, [retry.slot]);
});
