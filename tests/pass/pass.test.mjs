import test from 'node:test';
import assert from 'node:assert/strict';

// minimal browser stand-ins (the module only needs storage, timers and events)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis; globalThis.addEventListener ??= () => {};
const pass = await import('../../js/pixieed-pass.mjs');

test('the public site never grants a test-ad pass from a URL parameter', () => {
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?adtest=1' }), 'rewarded');
  assert.equal(pass.adMode({ hostname: 'localhost', search: '' }), 'test');
});

test('only the requested ad can grant a reward, and its listeners are removed', async () => {
  const originalDocument = globalThis.document;
  const originalGoogletag = globalThis.googletag;
  const callbacks = new Map();
  const slot = { addService() { return this; } };
  const otherSlot = {};
  const destroyed = [];
  const pubads = {
    addEventListener(type, callback) { callbacks.set(type, callback); },
    removeEventListener(type, callback) { if (callbacks.get(type) === callback) callbacks.delete(type); }
  };
  globalThis.document = { querySelector: () => ({}) };
  globalThis.googletag = {
    cmd: { push(callback) { callback(); } },
    enums: { OutOfPageFormat: { REWARDED: 'rewarded' } },
    defineOutOfPageSlot: () => slot,
    pubads: () => pubads,
    enableServices() {},
    display() {},
    destroySlots(slots) { destroyed.push(...slots); }
  };
  try {
    const closed = pass.showRewardedAd('/23379831154/pixieed_rewarded');
    await Promise.resolve();
    callbacks.get('rewardedSlotGranted')({ slot: otherSlot });
    callbacks.get('rewardedSlotReady')({ slot, makeRewardedVisible: () => true });
    callbacks.get('rewardedSlotClosed')({ slot });
    assert.equal(await closed, 'closed');
    assert.equal(callbacks.size, 0);
    assert.deepEqual(destroyed, [slot]);

    const granted = pass.showRewardedAd('/23379831154/pixieed_rewarded');
    await Promise.resolve();
    callbacks.get('rewardedSlotReady')({ slot, makeRewardedVisible: () => true });
    callbacks.get('rewardedSlotGranted')({ slot });
    callbacks.get('rewardedSlotClosed')({ slot });
    assert.equal(await granted, 'granted');
    assert.equal(callbacks.size, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.googletag = originalGoogletag;
  }
});

test('one pass, three hours, every perk — including ones registered later', () => {
  assert.equal(pass.PASS_HOURS, 3);
  assert.equal(pass.hasPass(), false);
  assert.equal(pass.hasPerk('camera.gif-long'), false);
  store.set('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3 * 3600 * 1000 }));
  assert.equal(pass.hasPass(), true);
  assert.equal(pass.hasPerk('camera.gif-long'), true);
  pass.registerPerk('globe.big-post', '地球儀：256pxまで投稿');
  assert.equal(pass.hasPerk('globe.big-post'), true, 'a service added later is covered by the same pass');
  assert.equal(pass.hasPerk('unknown.perk'), false);
  const left = pass.passRemainingMs();
  assert.ok(left > 2.99 * 3600 * 1000 && left <= 3 * 3600 * 1000);
});

test('the pass runs out; Pro never does', () => {
  store.set('pixieed:pass:v1', JSON.stringify({ until: Date.now() - 1 }));
  assert.equal(pass.hasPass(), false);
  store.set('pixieed:pro:v1', '1');
  assert.equal(pass.hasPass(), true);
  assert.equal(pass.passRemainingMs(), Infinity);
  store.delete('pixieed:pro:v1');
});
