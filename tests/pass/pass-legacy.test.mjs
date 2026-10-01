import test from 'node:test';
import assert from 'node:assert/strict';

test('legacy expiry and daily claim records are preserved without loading or granting a pass', async () => {
  const values = new Map([
    ['pixieed:pass:v1', JSON.stringify({ until: 1 })],
    ['pixieed:pass:no-ad-at:v1', 'old-at'],
    ['pixieed:pass:no-ad-day:v1', 'old-day']
  ]);
  const before = new Map(values);
  const writes = [];
  globalThis.localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push(['set', key, value]); values.set(key, String(value)); },
    removeItem(key) { writes.push(['remove', key]); values.delete(key); }
  };
  const pass = await import('../../js/pixieed-pass.mjs?legacy-no-grant-test');
  assert.equal(pass.hasPass(), true, 'expiry no longer gates the registered benefits');
  assert.equal(pass.passRemainingMs(), 0);
  assert.equal(await pass.grantFromAd(), false);
  assert.equal(await pass.claimDailyFree(), false);
  assert.deepEqual([...values], [...before]);
  assert.deepEqual(writes, []);
});
