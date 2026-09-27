import test from 'node:test';
import assert from 'node:assert/strict';

// minimal browser stand-ins (the module only needs storage, timers and events)
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis; globalThis.addEventListener ??= () => {};
const pass = await import('../../js/pixieed-pass.mjs');

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
