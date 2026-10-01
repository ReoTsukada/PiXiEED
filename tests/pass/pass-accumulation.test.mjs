import test from 'node:test';
import assert from 'node:assert/strict';

const data = new Map([
  ['pixieed:pass:v1', JSON.stringify({ until: 1 })],
  ['pixieed:pass:no-ad-at:v1', 'legacy-at'],
  ['pixieed:pass:no-ad-day:v1', 'legacy-day'],
  ['pixieed:pro:v1', '0']
]);
const writes = [];
globalThis.localStorage = {
  getItem(key) { return data.has(key) ? data.get(key) : null; },
  setItem(key, value) { writes.push(['set', key, value]); data.set(key, String(value)); },
  removeItem(key) { writes.push(['remove', key]); data.delete(key); }
};
let domTouches = 0;
let timerTouches = 0;
const listeners = [];
globalThis.document = {
  get readyState() { domTouches++; return 'complete'; },
  addEventListener(...args) { domTouches++; listeners.push(args); },
  querySelectorAll() { domTouches++; return []; },
  createElement() { domTouches++; throw new Error('unexpected DOM use'); },
  body: { appendChild() { domTouches++; throw new Error('unexpected UI'); } }
};
globalThis.window = {
  addEventListener(...args) { domTouches++; listeners.push(args); },
  setTimeout() { timerTouches++; throw new Error('unexpected timer'); },
  setInterval() { timerTouches++; throw new Error('unexpected timer'); }
};
globalThis.MutationObserver = class { constructor() { domTouches++; throw new Error('unexpected observer'); } };
const pass = await import('../../js/pixieed-pass.mjs?pass-unlimited-tests');

test('all registered creative benefits remain available after any legacy expiry', () => {
  assert.equal(pass.hasPass(), true);
  for (const id of pass.PERKS.keys()) assert.equal(pass.hasPerk(id), true, id);
  pass.registerPerk('test.registered', 'registered later');
  assert.equal(pass.hasPerk('test.registered'), true);
  assert.equal(pass.hasPerk('unknown.perk'), false);
  assert.equal(pass.passRemainingMs(), 0);
});

test('pass requests and old rewarded-ad callbacks never open UI, monitor, schedule, or change stored data', async () => {
  const before = new Map(data);
  const beforeWrites = writes.length;
  const grant = await pass.requestPass({ perk: 'camera.gif-long', extend: true });
  assert.equal(grant, true);
  assert.equal(await pass.showRewardedAd({ onReady() { assert.fail('must not start a rewarded ad'); } }), 'none');
  assert.equal(await pass.grantFromAd(), false);
  assert.equal(await pass.showOfferwall({ onPresent() { assert.fail('must not call callback'); } }), 'none');
  assert.equal(await pass.claimDailyFree(), false);
  assert.equal(await pass.claimFreeWithoutAd(() => assert.fail('must not grant')), false);
  assert.equal(pass.useFreeWithoutAd(), false);
  assert.deepEqual([...data], [...before]);
  assert.equal(writes.length, beforeWrites);
  assert.equal(domTouches, 0);
  assert.equal(timerTouches, 0);
});

test('Pro status remains tied to its existing stored value, and public enums/helpers stay compatible', () => {
  assert.equal(pass.hasPro(), false);
  data.set('pixieed:pro:v1', '1');
  assert.equal(pass.hasPro(), true);
  data.set('pixieed:pro:v1', '0');
  assert.equal(pass.hasPro(), false);
  assert.equal(pass.PASS_HOURS, 1);
  assert.equal(pass.PASS_MAX_HOURS, 2);
  assert.equal(pass.adMode({ hostname: 'pixieed.jp', search: '?ads=test' }), 'offerwall');
  assert.equal(pass.adMode({ hostname: 'localhost', search: '' }), 'test');
  assert.equal(pass.safeReturn('/draw/?a=1#b'), '/draw/?a=1#b');
  assert.equal(pass.safeReturn('//evil.example/'), '/');
  assert.equal(pass.safeReturn('/pass/?return=/'), '/');
  assert.equal(pass.formatPassRemaining(61_000), '0:02');
  assert.equal(pass.formatPassRemaining(Infinity), 'Pro');
});

test('change subscriptions are inert and do not immediately call user code', () => {
  let calls = 0;
  const unsubscribe = pass.onPassChange(() => calls++);
  unsubscribe();
  assert.equal(calls, 0);
  assert.equal(domTouches, 0);
  assert.equal(timerTouches, 0);
});
