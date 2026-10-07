import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFineMapCellIndex, lookupMapCell, resolveMapLocation } from '../../js/globe/map-cells.mjs';

const source = JSON.parse(readFileSync(new URL('../../assets/maps/globe-land-mask-v1.json', import.meta.url), 'utf8'));

function legacyDecode(value) {
  return Uint8Array.from(globalThis.atob(value), character => character.charCodeAt(0));
}

function assertSameIndex(actual, expected) {
  for (const field of ['landMask', 'countryIndices', 'prefectureIndices', 'prefectureMask', 'mapRegionMask', 'unselectableMask']) {
    assert.deepEqual(actual[field], expected[field], `${field} should match the legacy-decoded index`);
  }
  assert.deepEqual(actual.mapRegions, expected.mapRegions);
  assert.equal(actual.cellCount, expected.cellCount);

  const picks = [
    [139.6917, 35.6895], // Tokyo
    [141.3545, 43.0621], // Sapporo
    [-122.4194, 37.7749], // San Francisco
    [0, 0], // ocean
    [179.9, -16.5],
  ];
  for (const [longitude, latitude] of picks) {
    const actualPick = lookupMapCell(longitude, latitude, actual);
    const expectedPick = lookupMapCell(longitude, latitude, expected);
    assert.equal(actualPick?.displayCellId ?? null, expectedPick?.displayCellId ?? null);
    assert.equal(actualPick?.countryId ?? null, expectedPick?.countryId ?? null);
    assert.equal(actualPick?.mapRegionId ?? null, expectedPick?.mapRegionId ?? null);
    assert.equal(resolveMapLocation(longitude, latitude, actual)?.mapRegionId ?? null,
      resolveMapLocation(longitude, latitude, expected)?.mapRegionId ?? null);
  }
}

test('browser atob copies all source bytes and preserves the full fine index and picks', () => {
  const nativeAtob = globalThis.atob;
  assert.equal(typeof nativeAtob, 'function', 'Node test runtime must expose atob for the browser-path fixture');
  const oldCountryBytes = legacyDecode(source.countryIndices);
  const oldPrefectureBytes = legacyDecode(source.prefectureIndices);
  assert.equal(oldCountryBytes.byteLength + oldPrefectureBytes.byteLength, 1_982_304);

  // Exercise both existing typed-array input branches for the reference index.
  const typedSource = {
    ...source,
    countryIndices: new Uint16Array(oldCountryBytes.buffer, oldCountryBytes.byteOffset, oldCountryBytes.byteLength / 2),
    prefectureIndices: oldPrefectureBytes,
  };
  const expected = createFineMapCellIndex(typedSource);

  const decodedLengths = [];
  globalThis.atob = value => {
    decodedLengths.push(value.length);
    return nativeAtob(value);
  };
  try {
    const actual = createFineMapCellIndex(source);
    assert.equal(decodedLengths.length, 2, 'both encoded source arrays should use atob');
    assertSameIndex(actual, expected);
  } finally {
    globalThis.atob = nativeAtob;
  }
});

test('browser atob failures propagate instead of being swallowed', () => {
  const nativeAtob = globalThis.atob;
  const failure = new Error('fixture atob failure');
  globalThis.atob = () => { throw failure; };
  try {
    assert.throws(() => createFineMapCellIndex({ ...source, countryIndices: 'invalid' }), error => error === failure);
  } finally {
    globalThis.atob = nativeAtob;
  }
});

test('Node Buffer fallback keeps the same source index when atob is unavailable', () => {
  const nativeAtob = globalThis.atob;
  const expectedSource = {
    ...source,
    countryIndices: legacyDecode(source.countryIndices),
    prefectureIndices: legacyDecode(source.prefectureIndices),
  };
  const expected = createFineMapCellIndex(expectedSource);
  try {
    globalThis.atob = undefined;
    const actual = createFineMapCellIndex(source);
    assertSameIndex(actual, expected);
  } finally {
    globalThis.atob = nativeAtob;
  }
});
