import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JAPAN_PREFECTURES,
  JAPAN_REGION_GROUPS,
  assertCompleteJapanRegions,
  createJapanHierarchy,
  getRegionForPrefecture
} from '../../js/globe/hierarchy.mjs';

test('Japan hierarchy has the requested labels and covers all 47 prefectures once', () => {
  assert.deepEqual(JAPAN_REGION_GROUPS.map((region) => region.label), [
    '北海道', '東北', '関東', '北陸・甲信越', '東海', '近畿', '中国', '四国', '九州・沖縄'
  ]);
  const codes = JAPAN_REGION_GROUPS.flatMap((region) => region.codes);
  assert.equal(new Set(codes).size, 47);
  assert.deepEqual(codes, JAPAN_PREFECTURES.map(([code]) => code));
  assert.equal(assertCompleteJapanRegions(), true);
});

test('explicit region membership keeps key prefectures in geographic order', () => {
  assert.equal(getRegionForPrefecture('01').id, 'hokkaido');
  assert.equal(getRegionForPrefecture('13').id, 'kanto');
  assert.equal(getRegionForPrefecture('14').id, 'kanto');
  assert.equal(getRegionForPrefecture('47').id, 'kyushu-okinawa');
  assert.equal(getRegionForPrefecture('01').label, '北海道');
  assert.deepEqual(JAPAN_REGION_GROUPS.find((region) => region.id === 'hokuriku-koshinetsu').codes, ['15', '16', '17', '18', '19', '20']);
  assert.deepEqual(JAPAN_REGION_GROUPS.find((region) => region.id === 'tokai').codes, ['21', '22', '23', '24']);
});

test('createJapanHierarchy rejects missing, duplicate, or unknown prefecture membership', () => {
  const records = JAPAN_PREFECTURES.map(([code, name]) => ({ code, name }));
  assert.equal(createJapanHierarchy(records).prefectures.length, 47);
  assert.throws(() => createJapanHierarchy(records.slice(1)), /exactly the 47/);
  assert.throws(() => createJapanHierarchy([...records.slice(0, 46), { code: '01', name: '重複' }]), /exactly the 47|must not overlap/);
});
