import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExplicitMapPlacement, isSampleWork, isSaleWork, publicWorksOnly } from '../js/public-work-policy.mjs';

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

test('keeps sale records in source data but excludes them from public official works', () => {
  const saleByDistribution = { id: 'paid-1', distribution_mode: 'paid', sale_price_yen: 4500 };
  const saleByPrice = { id: 'paid-2', salePriceYen: 150 };
  const ordinary = { id: 'art-1', priceLabel: '地図で見つけた絵' };
  const source = [saleByDistribution, saleByPrice, ordinary];

  assert.equal(isSaleWork(saleByDistribution), true);
  assert.equal(isSaleWork(saleByPrice), true);
  assert.deepEqual(publicWorksOnly(source), [ordinary]);
  assert.deepEqual(source, [saleByDistribution, saleByPrice, ordinary]);
});

test('a gallery placement needs an explicit point or a linked place coordinate', () => {
  assert.equal(hasExplicitMapPlacement({ prefecture: '東京都' }), false);
  assert.equal(hasExplicitMapPlacement({ mapPosition: { x: 45, y: 60 } }), false);
  assert.equal(hasExplicitMapPlacement({ mapPositionSpace: 'world', mapPosition: { x: 45, y: 60 } }), true);
  assert.equal(hasExplicitMapPlacement({ location: { lat: 35.6, lng: 139.5 } }), true);
  assert.equal(hasExplicitMapPlacement({ location: { lat: null, lng: null } }), false);
  assert.equal(hasExplicitMapPlacement({ mapPosition: { x: 'outside', y: 60 } }), false);
  assert.equal(hasExplicitMapPlacement({ mapPositionSpace: 'world', mapPosition: { x: 45, y: null } }), false);
});
