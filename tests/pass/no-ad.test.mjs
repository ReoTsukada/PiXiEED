import test from 'node:test';
import assert from 'node:assert/strict';
import { claimDailyFree, claimFreeWithoutAd, freeWithoutAdAvailable, freeWithoutAdWaitMs, shouldGrantFreeWithoutAd, useFreeWithoutAd } from '../../js/pixieed-pass.mjs?test=no-ad-cooldown';

const store = new Map();
const read = (key) => store.get(key) ?? null;
const write = (key, value) => { store.set(key, String(value)); return true; };
const NO_AD_KEY = 'pixieed:pass:no-ad-at:v1';

test('legacy daily-state diagnostics still read stored records without altering them', () => {
  const usedAt = new Date(2026, 8, 29, 9, 0).getTime();
  assert.equal(freeWithoutAdAvailable(usedAt, read), true);
  store.set(NO_AD_KEY, String(usedAt));
  const before = new Map(store);
  assert.equal(freeWithoutAdWaitMs(usedAt + 60_000, read), 14 * 60 * 60_000 + 59 * 60_000);
  assert.equal(freeWithoutAdAvailable(usedAt + 60_000, read), false);
  const beforeMidnight = new Date(2026, 8, 29, 23, 59, 59, 999).getTime();
  const midnight = new Date(2026, 8, 30, 0, 0).getTime();
  assert.equal(freeWithoutAdWaitMs(beforeMidnight, read), 1);
  assert.equal(freeWithoutAdAvailable(midnight, read), true);
  assert.deepEqual([...store], [...before]);
});

test('legacy free-claim helpers remain inert and preserve their existing storage', async () => {
  store.clear();
  store.set('pixieed:pass:no-ad-day:v1', '2026-09-29');
  const before = new Map(store);
  let grants = 0;
  assert.equal(useFreeWithoutAd(Date.now(), write), false);
  assert.equal(await claimFreeWithoutAd(() => { grants++; }), false);
  assert.equal(claimDailyFree(), false);
  assert.equal(grants, 0);
  assert.deepEqual([...store], [...before]);
});

test('date reader handles invalid values and old day key without writes', () => {
  const now = new Date(2026, 8, 29, 12).getTime();
  store.set('pixieed:pass:no-ad-day:v1', '2026-09-29');
  const before = new Map(store);
  assert.equal(freeWithoutAdAvailable(now, read), false);
  for (const invalid of ['NaN', 'Infinity', '-Infinity', '-1', '', 'not-a-time']) {
    store.set(NO_AD_KEY, invalid);
    assert.equal(freeWithoutAdAvailable(now, read), false, invalid);
  }
  assert.doesNotThrow(() => freeWithoutAdWaitMs(Number.NaN, read));
  store.clear();
  for (const result of ['nofill', 'unsupported', 'timeout', 'closed', 'granted']) {
    assert.equal(shouldGrantFreeWithoutAd(result), false);
  }
  assert.ok(before.size > 0);
});
