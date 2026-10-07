import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  splitMapAdmin1Asset,
  splitMapPrefectureAsset,
  validateMapMaskAsset,
  validateMapGeometryAsset,
  hydrateMapMaskAsset,
} from '../../js/globe/map-asset-format.mjs';

const admin1 = JSON.parse(readFileSync(new URL('../../assets/maps/map-admin1-v1.json', import.meta.url), 'utf8'));
const prefectures = JSON.parse(readFileSync(new URL('../../assets/maps/map-prefectures-v1.json', import.meta.url), 'utf8'));
const adminSplit = splitMapAdmin1Asset(admin1);
const prefectureSplit = splitMapPrefectureAsset(prefectures);

test('v2 masks retain the compact authoritative fields and hydrate to exact v1 assets', () => {
  for (const [original, split, kind] of [
    [admin1, adminSplit, 'admin1'],
    [prefectures, prefectureSplit, 'prefectures'],
  ]) {
    const { mask, geometry } = split;
    assert.equal(validateMapMaskAsset(mask, kind), true);
    assert.equal(validateMapGeometryAsset(geometry, mask), true);
    assert.equal(mask.legacyChecksum, original.checksum);
    assert.equal(mask.geometryChecksum, geometry.checksum);
    assert.equal(geometry.maskChecksum, mask.checksum);
    assert.deepEqual(hydrateMapMaskAsset(mask, geometry), original);
    assert.equal('features' in mask, false);
  }

  assert.ok('source' in adminSplit.mask && 'diagnostics' in adminSplit.mask);
  assert.ok('countryIds' in adminSplit.mask && 'countryLabels' in adminSplit.mask);
  assert.ok('bounds' in prefectureSplit.mask && 'unselectableFeatures' in prefectureSplit.mask);
});

test('geometry assets retain the exact checked-in v1 feature arrays without further simplification', () => {
  assert.deepEqual(adminSplit.geometry.features, admin1.features);
  assert.deepEqual(prefectureSplit.geometry.features, prefectures.features);
  assert.equal('legacyFeatures' in adminSplit.geometry, false);
  assert.equal('legacyFeatures' in prefectureSplit.geometry, false);
  assert.deepEqual(hydrateMapMaskAsset(adminSplit.mask, adminSplit.geometry), admin1);
  assert.deepEqual(hydrateMapMaskAsset(prefectureSplit.mask, prefectureSplit.geometry), prefectures);
});

test('source v1 checksum is checked before splitting', () => {
  assert.throws(() => splitMapAdmin1Asset({ ...admin1, checksum: 'fnv1a32-00000000' }), /Original admin1 asset checksum/);
  assert.throws(() => splitMapPrefectureAsset({ ...prefectures, checksum: 'fnv1a32-00000000' }), /Original prefectures asset checksum/);
});

test('wrong kind, version, checksum, or mixed mask/geometry pairs are rejected', () => {
  assert.throws(() => validateMapMaskAsset(adminSplit.mask, 'prefectures'), /Invalid prefectures mask/);
  assert.throws(() => validateMapGeometryAsset(adminSplit.geometry, prefectureSplit.mask), /Mismatched prefectures geometry/);
  assert.throws(() => validateMapGeometryAsset({ ...adminSplit.geometry, version: 'bad' }, adminSplit.mask), /Mismatched admin1 geometry/);

  const tamperedMask = structuredClone(adminSplit.mask);
  tamperedMask.rowRuns[0][2] += 1;
  assert.throws(() => validateMapMaskAsset(tamperedMask, 'admin1'), /admin1 mask checksum/);

  const tamperedGeometry = structuredClone(adminSplit.geometry);
  tamperedGeometry.features[0].geometry.coordinates[0][0][0][0] += 0.001;
  assert.throws(() => validateMapGeometryAsset(tamperedGeometry, adminSplit.mask), /Mismatched admin1 geometry/);
});
