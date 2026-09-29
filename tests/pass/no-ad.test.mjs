import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFreeWithoutAd, freeWithoutAdAvailable, freeWithoutAdWaitMs, rewardedAdUnit, SAMPLE_REWARDED_AD_UNIT, shouldGrantFreeWithoutAd, useFreeWithoutAd } from '../../js/pixieed-pass.mjs?test=no-ad-cooldown';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  }
});
const NO_AD_KEY = 'pixieed:pass:no-ad-at:v1';

test('the free pass is available once per local day and resets at local midnight', () => {
  const usedAt = new Date(2026, 8, 29, 9, 0).getTime();
  assert.equal(freeWithoutAdAvailable(usedAt, (key) => store.get(key) ?? null), true);
  assert.equal(useFreeWithoutAd(usedAt, (key, value) => { store.set(key, value); return true; }), true);
  const read = (key) => store.get(key) ?? null;
  assert.equal(freeWithoutAdWaitMs(usedAt + 60_000, read), 14 * 60 * 60_000 + 59 * 60_000);
  assert.equal(freeWithoutAdAvailable(usedAt + 60_000, read), false);
  const beforeMidnight = new Date(2026, 8, 29, 23, 59, 59, 999).getTime();
  const midnight = new Date(2026, 8, 30, 0, 0).getTime();
  assert.equal(freeWithoutAdAvailable(beforeMidnight, read), false);
  assert.equal(freeWithoutAdWaitMs(beforeMidnight, read), 1);
  assert.equal(freeWithoutAdWaitMs(midnight, read), 0);
  assert.equal(freeWithoutAdAvailable(midnight, read), true);
});

test('a new module instance reads the saved daily claim from storage', async () => {
  store.clear();
  const usedAt = Date.now();
  assert.equal(useFreeWithoutAd(usedAt), true);
  const reloaded = await import('../../js/pixieed-pass.mjs?test=no-ad-reload');
  assert.equal(reloaded.freeWithoutAdAvailable(usedAt), false);
  const nextMidnight = new Date(usedAt); nextMidnight.setHours(24, 0, 0, 0);
  assert.equal(reloaded.freeWithoutAdAvailable(nextMidnight.getTime()), true);
});

test('the old daily key remains compatible and a consumed free pass cannot be claimed again', async () => {
  store.clear();
  const now = new Date(2026, 8, 29, 12).getTime();
  store.set('pixieed:pass:no-ad-day:v1', '2026-09-29');
  const read = (key) => store.get(key) ?? null;
  assert.equal(freeWithoutAdAvailable(now, read), false);
  let grants = 0;
  assert.equal(await claimFreeWithoutAd(() => { grants++; }, { now: () => now, readKey: read }), false);
  assert.equal(grants, 0);
  store.set('pixieed:pass:no-ad-day:v1', '2026-09-28');
  assert.equal(freeWithoutAdAvailable(now, read), true);
  for (const invalid of ['NaN', 'Infinity', '-Infinity', '-1', '', 'not-a-time']) {
    store.set(NO_AD_KEY, invalid);
    assert.equal(freeWithoutAdAvailable(now, read), true, invalid);
  }
  store.set('pixieed:pass:no-ad-day:v1', '2026-09-28');
  store.set(NO_AD_KEY, String(now));
  assert.equal(freeWithoutAdAvailable(now, read), false);
  const nextMidnight = new Date(now); nextMidnight.setHours(24, 0, 0, 0);
  assert.equal(freeWithoutAdAvailable(nextMidnight.getTime(), read), true);
  assert.doesNotThrow(() => freeWithoutAdWaitMs(Number.NaN, read));
});

test('a failed localStorage write uses this page\'s receipt date even if stored time is future-dated', async () => {
  const isolated = await import('../../js/pixieed-pass.mjs?test=no-ad-memory-fallback');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const futureValues = new Map();
  try {
    const usedAt = Date.now();
    futureValues.set(NO_AD_KEY, String(usedAt + 10 * 24 * 60 * 60_000));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem(key) { return futureValues.get(key) ?? null; }, setItem() { throw new Error('blocked'); } } });
    assert.equal(isolated.useFreeWithoutAd(usedAt), false);
    assert.equal(isolated.freeWithoutAdAvailable(usedAt), false);
    const nextMidnight = new Date(usedAt); nextMidnight.setHours(24, 0, 0, 0);
    assert.equal(isolated.freeWithoutAdAvailable(nextMidnight.getTime()), true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('simultaneous no-ad claims share the pass lock and grant only one free hour', async () => {
  store.clear();
  let tail = Promise.resolve();
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } } } });
  try {
    let grants = 0;
    const now = Date.now();
    const read = (key) => store.get(key) ?? null;
    const write = (key, value) => { store.set(key, String(value)); return true; };
    const options = { now: () => now, readKey: read, writeKey: write };
    const results = await Promise.all([
      claimFreeWithoutAd(() => { grants++; }, options),
      claimFreeWithoutAd(() => { grants++; }, options)
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(grants, 1);
    assert.equal(Number(store.get(NO_AD_KEY)), now);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});

test('only no-fill, unsupported, and timed-out ads qualify for the free fallback', () => {
  assert.equal(shouldGrantFreeWithoutAd('nofill'), true);
  assert.equal(shouldGrantFreeWithoutAd('unsupported'), true);
  assert.equal(shouldGrantFreeWithoutAd('timeout'), true);
  assert.equal(shouldGrantFreeWithoutAd('closed'), false);
  assert.equal(shouldGrantFreeWithoutAd('granted'), false);
});

test('?ads=test uses Google\'s sample rewarded unit so the flow can be checked on a real phone', () => {
  const config = { rewardedAdUnitPath: '/23379831154/pixieed_rewarded' };
  assert.equal(rewardedAdUnit({ search: '?ads=test' }, config), SAMPLE_REWARDED_AD_UNIT);
  assert.equal(rewardedAdUnit({ search: '' }, config), '/23379831154/pixieed_rewarded');
});
