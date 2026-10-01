import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([
  ['pixieed:pass:v1', JSON.stringify({ until: Date.now() - 60_000 })],
  ['pixieed:pass:no-ad-at:v1', 'old-at'],
  ['pixieed:pass:no-ad-day:v1', 'old-day']
]);
const writes = [];
globalThis.localStorage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { writes.push(['set', key, value]); store.set(key, String(value)); },
  removeItem(key) { writes.push(['remove', key]); store.delete(key); }
};
const pass = await import('../../js/pixieed-pass.mjs?pass-unlimited-contract');

test('legacy timed pass and every registered perk are unlimited without changing stored expiry', () => {
  const oldPass = store.get('pixieed:pass:v1');
  assert.equal(pass.PASS_HOURS, 1);
  assert.equal(pass.PASS_MAX_HOURS, 2);
  assert.equal(pass.hasPass(), true);
  for (const id of pass.PERKS.keys()) assert.equal(pass.hasPerk(id), true, id);
  pass.registerPerk('globe.big-post', '地球儀：256pxまで投稿');
  assert.equal(pass.hasPerk('globe.big-post'), true);
  assert.equal(pass.hasPerk('unknown.perk'), false);
  assert.equal(pass.passRemainingMs(), 0);
  assert.equal(store.get('pixieed:pass:v1'), oldPass);
  assert.deepEqual(writes, []);
});

test('Pro is read from its actual legacy value and never fabricated', () => {
  assert.equal(pass.hasPro(), false);
  store.set('pixieed:pro:v1', '1');
  assert.equal(pass.hasPro(), true);
  store.set('pixieed:pro:v1', '0');
  assert.equal(pass.hasPro(), false);
});

test('legacy mode diagnostic enum remains stable; neither mode starts an ad', () => {
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?adtest=1' }), 'offerwall');
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?ads=test' }), 'offerwall');
  assert.equal(pass.adMode({ hostname: 'localhost', search: '' }), 'test');
  assert.equal(typeof pass.showRewardedAd, 'function');
});
