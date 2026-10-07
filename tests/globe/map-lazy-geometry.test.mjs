import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachMapGeometry, attachMapGeometryAsync, createFineMapCellIndex, lookupMapCell, resolveMapLocation } from '../../js/globe/map-cells.mjs';
import { createMapGeometryLoader } from '../../js/globe/map-geometry-loader.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const source = read('../../assets/maps/globe-land-mask-v1.json');
const legacyPrefectures = read('../../assets/maps/map-prefectures-v1.json');
const legacyAdmin1 = read('../../assets/maps/map-admin1-v1.json');
const prefectureMask = read('../../assets/maps/map-prefectures-mask-v2.json');
const prefectureGeometry = read('../../assets/maps/map-prefectures-geometry-v2.json');
const admin1Mask = read('../../assets/maps/map-admin1-mask-v2.json');
const admin1Geometry = read('../../assets/maps/map-admin1-geometry-v2.json');

const legacy = createFineMapCellIndex(source, { prefectureData: legacyPrefectures, admin1Data: legacyAdmin1 });
const pending = createFineMapCellIndex(source, { prefectureData: prefectureMask, admin1Data: admin1Mask });
const attached = attachMapGeometry(pending, { prefectures: prefectureGeometry, admin1: admin1Geometry });
const typedArrays = ['landMask', 'countryIndices', 'prefectureIndices', 'prefectureMask', 'mapRegionMask', 'unselectableMask'];

function assertSameTileMap(actual, expected) {
  assert.equal(actual.size, expected.size);
  for (const [key, values] of expected) assert.deepEqual(actual.get(key), values, `tile list for ${key}`);
}

function locationSummary(location) {
  if (!location) return null;
  return {
    countryId: location.countryId,
    mapRegionId: location.mapRegionId,
    mapRegionIndex: location.mapRegionIndex,
    mapRegionKind: location.mapRegionKind,
    prefectureId: location.prefectureId,
    cellId: location.cell?.id,
  };
}

test('v2 pending mask exactly matches every v1 display and ownership structure', () => {
  assert.equal(pending.precisionReady, false);
  assert.equal(legacy.precisionReady, true);
  for (const field of typedArrays) assert.deepEqual(pending[field], legacy[field], field);
  assert.deepEqual(pending.mapRegions, legacy.mapRegions);
  assert.deepEqual(pending.cells, legacy.cells);
  assertSameTileMap(pending.prefectureTiles, legacy.prefectureTiles);
  assertSameTileMap(pending.countryTiles, legacy.countryTiles);
  assertSameTileMap(pending.mapRegionTiles, legacy.mapRegionTiles);
});

test('mask-only geometry resolution stays pending, and attachment restores legacy resolution and picks', () => {
  const points = [
    [139.6917, 35.6895], // Tokyo
    [139.702, 35.5308], // Japan prefecture boundary area
    [141.3545, 43.0618], // Hokkaido
    [147.8775, 44.9919], // unselectable northern islands
    [-69.345703125, 47.338822694822], // USA admin1 boundary/coast sample
    [-95.009765625, 49.32512199104002], // USA state boundary sample
    [-122.4194, 37.7749], // California
    [151.2093, -33.8688], // Australia
    [0, 0], // open water
  ];

  for (const [longitude, latitude] of points) {
    assert.equal(resolveMapLocation(longitude, latitude, pending), null, `precision pending at ${longitude},${latitude}`);
    const beforePick = lookupMapCell(longitude, latitude, pending);
    const oldPick = lookupMapCell(longitude, latitude, legacy);
    assert.deepEqual(beforePick && [beforePick.displayCellId, beforePick.countryId, beforePick.mapRegionId],
      oldPick && [oldPick.displayCellId, oldPick.countryId, oldPick.mapRegionId]);

    const actual = resolveMapLocation(longitude, latitude, attached);
    const expected = resolveMapLocation(longitude, latitude, legacy);
    assert.deepEqual(locationSummary(actual), locationSummary(expected), `attached location at ${longitude},${latitude}`);
  }
});

test('attachment shares every display array and tile map without rebuilding raster ownership', () => {
  for (const field of typedArrays) assert.equal(attached[field], pending[field], `${field} identity`);
  assert.equal(attached.mapRegions, pending.mapRegions);
  assert.equal(attached.cells, pending.cells);
  assert.equal(attached.prefectureTiles, pending.prefectureTiles);
  assert.equal(attached.countryTiles, pending.countryTiles);
  assert.equal(attached.mapRegionTiles, pending.mapRegionTiles);
  assert.equal(attached.precisionReady, true);
});

test('tampered or mismatched geometry attachment fails atomically', () => {
  const originalLandMask = pending.landMask;
  const tamperedAdmin1 = structuredClone(admin1Geometry);
  tamperedAdmin1.features[0].geometry.coordinates[0][0][0][0] += 0.001;
  assert.throws(() => attachMapGeometry(pending, { prefectures: prefectureGeometry, admin1: tamperedAdmin1 }), /Mismatched admin1 geometry/);
  assert.equal(pending.precisionReady, false);
  assert.equal(resolveMapLocation(-122.4194, 37.7749, pending), null);
  assert.equal(pending.landMask, originalLandMask);

  assert.throws(() => attachMapGeometry(pending, { prefectures: admin1Geometry, admin1: admin1Geometry }), /Mismatched prefectures geometry/);
  assert.equal(pending.precisionReady, false);
  assert.equal(pending.admin1Data.precisionReady, false);
  assert.equal(pending.prefectureData.precisionReady, false);
});

test('cooperative attachment is equivalent and leaves the old index pending until completion', async () => {
  const flight = attachMapGeometryAsync(pending, { prefectures: prefectureGeometry, admin1: admin1Geometry });
  assert.equal(pending.precisionReady, false);
  const next = await flight;
  assert.equal(next.landMask, pending.landMask);
  for (const [lon, lat] of [[136.899095, 35.171497], [-122.4194, 37.7749], [0, 0]]) assert.deepEqual(locationSummary(resolveMapLocation(lon, lat, next)), locationSummary(resolveMapLocation(lon, lat, legacy)));
  const stale = { ...admin1Geometry, maskChecksum: 'fnv1a32-00000000' };
  await assert.rejects(attachMapGeometryAsync(pending, { prefectures: prefectureGeometry, admin1: stale }), /Mismatched admin1/);
  assert.equal(pending.precisionReady, false);
});

test('abort during cooperative attachment leaves the pending index unchanged', async () => {
  const controller = new AbortController();
  const originalSetTimeout = globalThis.setTimeout;
  const originalArrays = Object.fromEntries(typedArrays.map(field => [field, pending[field]]));
  let yields = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 0 && ++yields === 4) controller.abort();
    return originalSetTimeout(callback, delay, ...args);
  };
  try {
    await assert.rejects(
      attachMapGeometryAsync(pending, { prefectures: prefectureGeometry, admin1: admin1Geometry }, { signal: controller.signal }),
      /Map geometry load cancelled/
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
  assert.equal(controller.signal.aborted, true);
  assert.equal(yields, 4);
  assert.equal(pending.precisionReady, false);
  assert.equal(resolveMapLocation(-122.4194, 37.7749, pending), null);
  for (const field of typedArrays) assert.equal(pending[field], originalArrays[field], `${field} identity after abort`);
});

test('loader timeout aborts async apply, allows retry, and rejects late stale completion', async () => {
  const gates = [];
  const waiters = [];
  const commits = [];
  const loader = createMapGeometryLoader({
    assets: [{ kind: 'fixture', url: '/fixture.json', checksum: 'fixture' }],
    timeoutMs: 60,
    fetchJson: async () => ({ fixture: true }),
    apply(_payload, { signal }) {
      const attempt = gates.length + 1;
      let release;
      const blocked = new Promise(resolve => { release = resolve; });
      const completion = blocked.then(() => {
        if (signal.aborted) throw new Error(`apply ${attempt} observed abort`);
        commits.push(attempt);
      });
      gates.push({ attempt, release, completion, signal });
      for (const resolve of waiters.splice(0)) resolve();
      return completion;
    },
  });
  const waitForGate = async count => {
    while (gates.length < count) await new Promise(resolve => waiters.push(resolve));
    return gates[count - 1];
  };

  const firstLoad = loader.load();
  const first = await waitForGate(1);
  await assert.rejects(firstLoad, /Map geometry timed out/);
  assert.equal(first.signal.aborted, true);
  assert.equal(loader.getState(), 'error');

  const retryLoad = loader.load({ reload: true });
  const retry = await waitForGate(2);
  first.release();
  await assert.rejects(first.completion, /apply 1 observed abort/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loader.getState(), 'loading', 'late old completion cannot mark the retry ready');
  assert.deepEqual(commits, [], 'aborted old apply did not commit');

  retry.release();
  assert.equal(await retryLoad, true);
  assert.equal(loader.getState(), 'ready');
  assert.deepEqual(commits, [2]);
  loader.destroy();
});
