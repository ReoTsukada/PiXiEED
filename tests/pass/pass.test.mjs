import test from 'node:test';
import assert from 'node:assert/strict';

// minimal browser stand-ins (the module only needs storage, timers and events)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis; globalThis.addEventListener ??= () => {};
const pass = await import('../../js/pixieed-pass.mjs');

test('the public site shows the Offerwall; only localhost uses the stand-in ad', () => {
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?adtest=1' }), 'offerwall');
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?ads=test' }), 'offerwall');
  assert.equal(pass.adMode({ hostname: 'localhost', search: '' }), 'test');
  assert.equal(pass.showRewardedAd, undefined, 'Ad Manager rewarded ads are gone');
});

test('one pass, one hour, every perk — including ones registered later', () => {
  assert.equal(pass.PASS_HOURS, 1);
  assert.equal(pass.hasPass(), false);
  assert.equal(pass.hasPerk('camera.gif-long'), false);
  assert.equal(pass.hasPerk('audio.canvas-wide'), false);
  assert.equal(pass.hasPerk('audio.instruments-extra'), false);
  store.set('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 1 * 3600 * 1000 }));
  assert.equal(pass.hasPass(), true);
  assert.equal(pass.hasPerk('camera.gif-long'), true);
  assert.equal(pass.hasPerk('audio.canvas-wide'), true);
  assert.equal(pass.hasPerk('audio.instruments-extra'), true);
  pass.registerPerk('globe.big-post', '地球儀：256pxまで投稿');
  assert.equal(pass.hasPerk('globe.big-post'), true, 'a service added later is covered by the same pass');
  assert.equal(pass.hasPerk('unknown.perk'), false);
  const left = pass.passRemainingMs();
  assert.ok(left > 0.99 * 3600 * 1000 && left <= 1 * 3600 * 1000);
});

test('the pass runs out; Pro never does', () => {
  store.set('pixieed:pass:v1', JSON.stringify({ until: Date.now() - 1 }));
  assert.equal(pass.hasPass(), false);
  store.set('pixieed:pro:v1', '1');
  assert.equal(pass.hasPass(), true);
  assert.equal(pass.passRemainingMs(), Infinity);
  store.delete('pixieed:pro:v1');
});
