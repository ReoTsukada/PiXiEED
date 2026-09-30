import test from 'node:test';
import assert from 'node:assert/strict';
import { passButtonMarkup, passButtonView } from '../../js/pass-button.mjs';

const MIN = 60 * 1000;

test('the header button shows the ad, the free hour, the hour running out, and Pro', () => {
  assert.deepEqual(passButtonView({ remainingMs: 0 }), { state: 'ad', main: '1時間', sub: '広告を見る', lit: 0, low: false, fraction: 0 });
  assert.equal(passButtonView({ remainingMs: 0, freeReady: true }).state, 'free');
  const full = passButtonView({ remainingMs: 60 * MIN, freeReady: true });
  assert.deepEqual([full.state, full.main, full.lit, full.low], ['active', '1:00', 12, false]);
  const half = passButtonView({ remainingMs: 30 * MIN });
  assert.deepEqual([half.main, half.lit], ['0:30', 6]);
  const low = passButtonView({ remainingMs: 4 * MIN });
  assert.deepEqual([low.main, low.lit, low.low], ['0:04', 1, true]);
  assert.equal(passButtonView({ remainingMs: 1 }).lit, 1, 'the last pixel stays lit until the hour is over');
  assert.equal(passButtonView({ remainingMs: Infinity, pro: true }).state, 'pro');
});

test('the markup has twelve bar pixels and all three icons', () => {
  assert.equal((passButtonMarkup.match(/<i style="--i:/g) || []).length, 12);
  for (const icon of ['pxb-coin', 'pxb-gift', 'pxb-glass']) assert.match(passButtonMarkup, new RegExp(`class="${icon}"`));
  assert.match(passButtonMarkup, /data-header-pass-label/);
});
