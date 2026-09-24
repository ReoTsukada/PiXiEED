import test from 'node:test';
import assert from 'node:assert/strict';
import { isSampleWork, publicWorksOnly } from '../js/public-work-policy.mjs';

test('filters stale sample flags and known sample IDs despite missing sample metadata', () => {
  for (const value of [true, 'true', ' TRUE ', '1', 1]) assert.equal(isSampleWork({ id: 'work-x', sample: value }), true);
  for (const id of ['sea-cat', ' rainy-window ', 'NIGHT-LANTERN']) assert.equal(isSampleWork({ id }), true);
  assert.equal(isSampleWork({ id: 'user-art-9' }), false);
});

test('filters known sample artwork paths from relative and same-site absolute URLs, including query strings', () => {
  for (const image of [
    '/assets/artworks/sea-cat.jpg?rev=old-cache',
    'assets/artworks/rainy-window.jpg?width=400',
    'https://pixieed.jp/assets/artworks/night-lantern.jpg?cache=1'
  ]) assert.equal(isSampleWork({ id: 'legacy-work', image }), true);
  assert.equal(isSampleWork({ id: 'legitimate', image: 'https://elsewhere.example/assets/artworks/sea-cat.jpg' }), false);
  assert.equal(isSampleWork({ id: 'legitimate', image: '/assets/artworks/my-work.jpg' }), false);
});

test('publicWorksOnly retains official and user-submitted work without mutating the input', () => {
  const official = { id: 'official-1', title: 'Official', image: '/assets/artworks/official-1.jpg' };
  const user = { id: 'user-8', source: 'user', userSubmitted: true, image: '/uploads/user-8.png' };
  const staleSample = { id: 'cached-legacy', image: '/assets/artworks/sea-cat.jpg?old=1' };
  const staleId = { id: ' NIGHT-LANTERN ', sample: false };
  const input = [official, null, undefined, 'invalid', [], {}, user, staleSample, staleId];
  const before = input.slice();
  const result = publicWorksOnly(input);
  assert.deepEqual(result, [official, user]);
  assert.deepEqual(input, before);
  assert.equal(result[0], official);
  assert.equal(result[1], user);
});

test('false and zero flags do not exclude ordinary records and invalid list inputs are empty', () => {
  for (const sample of [false, 0, 'false', '0']) assert.equal(isSampleWork({ id: 'valid', sample }), false);
  assert.deepEqual(publicWorksOnly(null), []);
  assert.deepEqual(publicWorksOnly({ id: 'valid' }), []);
  assert.deepEqual(publicWorksOnly([{ id: '' }, { title: 'missing ID' }]), []);
});
