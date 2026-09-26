import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GRID,
  clampLatitude,
  createGlobeCamera,
  createGlobeGrid,
  getCell,
  getCellById,
  getCellCorners,
  getLatitudeBand,
  getLongitudeCellCount,
  inversePhysicalScreenToGeo,
  inverseScreenToGeo,
  lookupCell,
  normalizeLongitude,
  parseCellId,
  projectCellCorners,
  projectGeoToScreen
} from '../../js/globe/geometry.mjs';

function angularLongitudeError(actual, expected) {
  return Math.abs(normalizeLongitude(actual - expected));
}

function assertGeoRoundTrip(camera, longitude, latitude, tolerance = 1e-8) {
  const projected = projectGeoToScreen(longitude, latitude, camera);
  assert.equal(projected.visible, true);
  const recovered = inverseScreenToGeo(projected.x, projected.y, camera);
  assert.ok(recovered, 'front-hemisphere point should inverse-pick');
  assert.ok(angularLongitudeError(recovered.longitude, longitude) < tolerance);
  assert.ok(Math.abs(recovered.latitude - latitude) < tolerance);
}

test('latitude bands cover the globe with adjacent boundaries and no gaps', () => {
  assert.equal(DEFAULT_GRID.latitudeStepDegrees, 0.25);
  assert.equal(DEFAULT_GRID.bandCount, 720);
  let previousSouth = 90;
  for (let band = 0; band < DEFAULT_GRID.bandCount; band += 1) {
    const info = getLatitudeBand(band);
    assert.ok(Math.abs(info.north - previousSouth) < 1e-12);
    assert.ok(info.north > info.south);
    assert.ok(info.longitudeCount >= 1);
    assert.ok(Math.abs(info.north - (90 - band * DEFAULT_GRID.latitudeStepDegrees)) < 1e-12);
    previousSouth = info.south;
  }
  assert.ok(Math.abs(previousSouth + 90) < 1e-12);

  for (const band of [0, 1, 240, 476, 477]) {
    const count = getLongitudeCellCount(band);
    const first = getCell(band, 0);
    const last = getCell(band, count - 1);
    assert.equal(first.bounds.west, -180);
    assert.ok(Math.abs(last.bounds.east - 180) < 1e-10);
    assert.ok(Math.abs((last.bounds.east - first.bounds.west) - 360) < 1e-10);
    for (let column = 1; column < count; column += 1) {
      const previous = getCell(band, column - 1);
      const current = getCell(band, column);
      assert.ok(Math.abs(previous.bounds.east - current.bounds.west) < 1e-12);
    }
  }
});

test('default grid is measurably denser than the legacy one-degree grid', () => {
  const legacy = createGlobeGrid({ version: 'legacy-one-degree', latitudeStepDegrees: 1 });
  const legacyCells = legacy.bands.reduce((total, band) => total + band.longitudeCount, 0);
  const preciseCells = DEFAULT_GRID.bands.reduce((total, band) => total + band.longitudeCount, 0);
  assert.ok(DEFAULT_GRID.bandCount > legacy.bandCount);
  assert.ok(preciseCells > legacyCells);
  assert.ok(Number.isInteger(180 / DEFAULT_GRID.latitudeStepDegrees));
});

test('default grid subdivides representative legacy cells by two on each axis', () => {
  const legacy = createGlobeGrid({ version: 'legacy-one-degree', latitudeStepDegrees: 1 });
  const precise = DEFAULT_GRID;
  assert.equal(precise.latitudeStepDegrees, legacy.latitudeStepDegrees / 4);
  for (const latitude of [0, 35, -35, 60, -60]) {
    const legacyCell = lookupCell(12.34, latitude, legacy);
    const preciseCell = lookupCell(12.34, latitude, precise);
    const legacyWidth = Math.cos(legacyCell.center.latitude * Math.PI / 180) * (legacyCell.bounds.east - legacyCell.bounds.west);
    const preciseWidth = Math.cos(preciseCell.center.latitude * Math.PI / 180) * (preciseCell.bounds.east - preciseCell.bounds.west);
    // The legacy grid rounds its column counts too, so it deviates from a true square by
    // up to ~6%; allow for that. The default grid is at most ~1.5% off square.
    assert.ok(Math.abs(preciseWidth * 4 - legacyWidth) < .08, `${latitude}° longitude subdivision ratio`);
  }
  assert.equal(getLongitudeCellCount(Math.floor(precise.bandCount / 2), precise), 1440);
});

test('cells are stable under zoom and longitude is periodic, including dateline', () => {
  const reference = lookupCell(179.999, 35.6);
  const wrappedPositive = lookupCell(539.999, 35.6);
  const wrappedNegative = lookupCell(-180.001, 35.6);
  assert.equal(reference.id, wrappedPositive.id);
  assert.equal(reference.id, wrappedNegative.id);
  assert.deepEqual(reference.bounds, wrappedPositive.bounds);
  assert.deepEqual(reference.center, wrappedPositive.center);

  const zoomed = createGlobeCamera({
    viewport: { width: 1000, height: 700, dpr: 2 },
    centerLongitude: 179,
    centerLatitude: 35,
    zoom: 8
  });
  const unzoomed = createGlobeCamera({
    viewport: { width: 1000, height: 700, dpr: 2 },
    centerLongitude: 179,
    centerLatitude: 35,
    zoom: 1
  });
  for (const camera of [unzoomed, zoomed]) {
    const projected = projectGeoToScreen(reference.center.longitude, reference.center.latitude, camera);
    assert.equal(projected.visible, true);
    const recovered = inverseScreenToGeo(projected.x, projected.y, camera);
    assert.ok(recovered);
    assert.equal(lookupCell(recovered.longitude, recovered.latitude).id, reference.id);
  }

  const customGrid = createGlobeGrid({ latitudeStepDegrees: 0.5 });
  assert.notEqual(customGrid.version, DEFAULT_GRID.version);
  assert.notEqual(lookupCell(10, 20, customGrid).id, lookupCell(10, 20).id);

  const parsed = parseCellId(reference.id);
  assert.equal(parsed.version, DEFAULT_GRID.version);
  assert.equal(getCellById(reference.id).id, reference.id);
});

test('adaptive longitude bands keep geographic cells compact away from the poles', () => {
  for (const latitude of [-60, -35, 0, 35, 60]) {
    const cell = lookupCell(12.34, latitude);
    const geographicWidth = Math.cos(cell.center.latitude * Math.PI / 180) * (cell.bounds.east - cell.bounds.west);
    const geographicHeight = cell.bounds.north - cell.bounds.south;
    assert.ok(geographicWidth / geographicHeight > .5 && geographicWidth / geographicHeight < 2.5, `${latitude}° aspect ${geographicWidth / geographicHeight}`);
  }
});

test('polar bands use finite explicit caps', () => {
  const north = lookupCell(1234, 90);
  const south = lookupCell(-1234, -90);
  assert.equal(north.band, 0);
  assert.equal(south.band, DEFAULT_GRID.bandCount - 1);
  assert.equal(north.longitudeCount, 5);
  assert.equal(south.longitudeCount, 5);
  assert.equal(north.polarCap, true);
  assert.equal(south.polarCap, true);
  assert.equal(clampLatitude(100), 90);
  assert.equal(clampLatitude(-100), -90);
});

test('orthographic inverse round-trips Japan, Europe, dateline, and polar views with offset center', () => {
  const views = [
    { centerLongitude: 139.7, centerLatitude: 35.7, point: [139.7, 35.7] },
    { centerLongitude: 10, centerLatitude: 50, point: [2.35, 48.86] },
    { centerLongitude: 179.8, centerLatitude: 0, point: [-179.7, 1.4] },
    { centerLongitude: -179.8, centerLatitude: -2, point: [179.4, -0.6] },
    { centerLongitude: 45, centerLatitude: 88, point: [45.5, 88.4] },
    { centerLongitude: -120, centerLatitude: -88, point: [-119.5, -88.4] }
  ];
  for (const view of views) {
    const camera = createGlobeCamera({
      viewport: { width: 1200, height: 800, dpr: 2, centerX: 731, centerY: 263 },
      ...view,
      zoom: 1.7
    });
    assertGeoRoundTrip(camera, ...view.point, 2e-7);
    const center = projectGeoToScreen(view.centerLongitude, view.centerLatitude, camera);
    assert.ok(Math.abs(center.x - 731) < 1e-9);
    assert.ok(Math.abs(center.y - 263) < 1e-9);
    assert.equal(center.physicalX, center.x * 2);
    assert.equal(center.physicalY, center.y * 2);
    const physicalRecovered = inversePhysicalScreenToGeo(center.physicalX, center.physicalY, camera);
    assert.ok(physicalRecovered);
    assert.ok(angularLongitudeError(physicalRecovered.longitude, view.centerLongitude) < 1e-8);
    assert.ok(Math.abs(physicalRecovered.latitude - view.centerLatitude) < 1e-8);
  }
});

test('far side has negative depth and is never returned by front-hemisphere picking', () => {
  const camera = createGlobeCamera({
    viewport: { width: 640, height: 480, dpr: 1 },
    centerLongitude: 0,
    centerLatitude: 0
  });
  const farSide = projectGeoToScreen(180, 0, camera);
  assert.equal(farSide.visible, false);
  assert.ok(farSide.depth < 0);
  const picked = inverseScreenToGeo(farSide.x, farSide.y, camera);
  assert.ok(picked);
  assert.ok(picked.depth > 0);
  assert.ok(angularLongitudeError(picked.longitude, 0) < 1e-8);
  assert.ok(Math.abs(picked.latitude) < 1e-8);
  assert.equal(inverseScreenToGeo(0, 0, camera), null);
});

test('cell corners are a single shared geometry authority for projection', () => {
  const cell = lookupCell(139.7, 35.7);
  const camera = createGlobeCamera({
    viewport: { width: 900, height: 600, dpr: 1.5, centerX: 503, centerY: 271 },
    centerLongitude: 139.7,
    centerLatitude: 35.7,
    zoom: 2
  });
  const corners = getCellCorners(cell);
  const projected = projectCellCorners(cell, camera);
  assert.equal(projected.length, 4);
  for (let index = 0; index < corners.length; index += 1) {
    const expected = projectGeoToScreen(corners[index].longitude, corners[index].latitude, camera);
    assert.deepEqual(projected[index], expected);
  }
});


test('projected cell corners remain geographic quads without screen stretching', () => {
  const cell = lookupCell(139.7, 35.7);
  const camera = createGlobeCamera({
    viewport: { width: 2000, height: 2000, dpr: 1, centerX: 1000, centerY: 1000 },
    centerLongitude: cell.center.longitude,
    centerLatitude: cell.center.latitude,
    zoom: 1
  });
  const corners = projectCellCorners(cell, camera);
  assert.ok(corners.every((corner) => corner.visible));
  const edgeLength = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const horizontal = (edgeLength(corners[0], corners[1]) + edgeLength(corners[3], corners[2])) / 2;
  const vertical = (edgeLength(corners[0], corners[3]) + edgeLength(corners[1], corners[2])) / 2;
  assert.ok(horizontal > 0 && vertical > 0);
  assert.notEqual(horizontal, vertical);
});
