import test from 'node:test';
import assert from 'node:assert/strict';
import { freeWithoutAdAvailable, localDay, rewardedAdUnit, SAMPLE_REWARDED_AD_UNIT, useFreeWithoutAd } from '../../js/pixieed-pass.mjs';

test('when no ad can be shown, the pass is free once per local day', () => {
  const store = new Map();
  const read = (key) => store.get(key) ?? null; const write = (key, value) => { store.set(key, value); return true; };
  const morning = new Date(2026, 8, 29, 9).getTime(); const night = new Date(2026, 8, 29, 23, 59).getTime(); const next = new Date(2026, 8, 30, 0, 1).getTime();
  assert.equal(localDay(morning), '2026-09-29');
  assert.equal(freeWithoutAdAvailable(morning, read), true);
  useFreeWithoutAd(morning, write);
  assert.equal(freeWithoutAdAvailable(night, read), false);
  assert.equal(freeWithoutAdAvailable(next, read), true);
});

test('?ads=test uses Google\'s sample rewarded unit so the flow can be checked on a real phone', () => {
  const config = { rewardedAdUnitPath: '/23379831154/pixieed_rewarded' };
  assert.equal(rewardedAdUnit({ search: '?ads=test' }, config), SAMPLE_REWARDED_AD_UNIT);
  assert.equal(rewardedAdUnit({ search: '' }, config), '/23379831154/pixieed_rewarded');
});

test('the sheet gives the day\'s free hour only for a missing ad, never for a skipped one', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../../js/pixieed-pass.mjs', import.meta.url), 'utf8'));
  assert.match(source, /result !== 'closed' && result !== 'granted' && freeWithoutAdAvailable\(\)/);
  assert.match(source, /done\('nofill'\)/); assert.match(source, /done\('unsupported'\)/); assert.match(source, /done\('timeout'\)/);
});
