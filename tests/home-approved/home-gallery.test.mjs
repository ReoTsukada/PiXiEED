import test from 'node:test';
import assert from 'node:assert/strict';
import { placedOfficialWorks } from '../../js/home-gallery.mjs';

test('home gallery applies official public-work policy and requires public map placement', () => {
  const eligible = { id: 'official-1', title: '公開作品', image: '/assets/artworks/official-1.png', location: { lat: 35, lng: 139 } };
  const data = {
    works: [
      eligible,
      { id: 'unplaced', title: '未配置', image: '/art.png' },
      { id: 'store-placed', title: 'お店と出会う作品', image: '/store.png', stores: ['listed-store'] },
      { id: 'paid', image: '/paid.png', location: { lat: 35, lng: 139 }, sale_price_yen: 500 },
      { id: 'sea-cat', image: '/assets/artworks/sea-cat.jpg', location: { lat: 35, lng: 139 } },
      { id: 'community-copy', image: '/community.png', location: { lat: 35, lng: 139 }, userSubmitted: true }
    ],
    stores: [{ id: 'listed-store', location: { lat: 35, lng: 139 } }]
  };
  assert.deepEqual(placedOfficialWorks(data).map((item) => item.id), ['official-1', 'store-placed']);
  assert.equal(placedOfficialWorks(data)[0].href, '/globe/?art=official-1');
});

test('home gallery has no submitted items when the official public catalog is empty', () => {
  assert.deepEqual(placedOfficialWorks({ works: [], stores: [] }), []);
});
