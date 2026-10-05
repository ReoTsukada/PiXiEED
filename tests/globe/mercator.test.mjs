import test from 'node:test';
import assert from 'node:assert/strict';
import { MERCATOR_MAX_LATITUDE, createMercatorCamera, inverseMercatorY, mercatorY, normalizeLongitude, lookupCell, projectCellCorners, projectGeoToScreen, projectGeoCopiesToScreen, inverseScreenToGeo } from '../../js/globe/geometry.mjs';
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
test('Mercator forward/inverse round trips with geographic ID and DPR preservation', () => {
  near(MERCATOR_MAX_LATITUDE, 85.0511287798066);
  const camera = createMercatorCamera({ width: 1200, height: 700, dpr: 2, centerLongitude: 179, centerLatitude: 35, zoom: 4 });
  for (const lat of [-85.01, -70.12, .12, 35.12, 70.12, 85.01]) for (const lon of [-179.99, -120.12, .12, 139.69, 179.99]) {
    near(inverseMercatorY(mercatorY(lat)), lat);
    const point = projectGeoToScreen(lon, lat, camera); const geo = inverseScreenToGeo(point.x, point.y, camera);
    near(normalizeLongitude(geo.longitude - lon), 0); near(geo.latitude, lat);
    near(point.physicalX, point.x * 2); near(point.physicalY, point.y * 2);
    assert.equal(lookupCell(geo.longitude, geo.latitude).id, lookupCell(lon, lat).id);
  }
});
test('world copies wrap repeatedly and all copies pick the same geographic cell', () => {
  const camera = createMercatorCamera({ width: 1200, height: 700, zoom: .68 });
  const points = projectGeoCopiesToScreen(179.9, 0, camera);
  assert.equal(points.length, 2); near(points[1].x - points[0].x, camera.worldSize);
  for (const point of points) assert.equal(lookupCell(...[inverseScreenToGeo(point.x, point.y, camera).longitude, 0]).id, lookupCell(179.9, 0).id);
  for (const laps of [-1000, -3, 0, 3, 1000]) near(inverseScreenToGeo(points[0].x + laps * camera.worldSize, points[0].y, camera).longitude, 179.9);
  const seam = createMercatorCamera({ width: 1200, height: 700, zoom: 2, centerLongitude: 179 });
  near(projectGeoToScreen(-179, 0, seam).x - projectGeoToScreen(179, 0, seam).x, seam.worldSize * 2 / 360);
});
test('dateline corners stay together rather than spanning a whole world', () => {
  for (const longitude of [0, 179.999, -179.999]) {
    const camera = createMercatorCamera({ width: 1200, height: 700, centerLongitude: longitude, zoom: 2 });
    const corners = projectCellCorners(lookupCell(179.99, 0), camera);
    assert.ok(Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x)) < camera.worldSize / 100);
  }
});
test('poles are finite, north/south stop at the map bounds, and tall viewports remain filled', () => {
  for (const [width, height] of [[390, 844], [1280, 800], [844, 390]]) for (const latitude of [-90, 0, 90]) {
    const camera = createMercatorCamera({ width, height, zoom: .68, centerLatitude: latitude });
    assert.ok(camera.worldSize >= height); assert.ok(Number.isFinite(camera.centerLatitude));
    assert.ok(inverseScreenToGeo(width / 2, 0, camera)); assert.ok(inverseScreenToGeo(width / 2, height, camera));
    assert.equal(projectGeoToScreen(0, 90, camera).visible, false);
    assert.equal(inverseScreenToGeo(width / 2, height / 2 - (Math.PI - camera.centerMercatorY) * camera.scale - 1, camera), null);
  }
});


test('flat-map initial Japan view preserves its latitude on tall and wide screens', async () => {
  const { DEFAULT_MAP_VIEW } = await import('../../js/globe/renderer.mjs');
  for (const [width, height] of [[390, 844], [700, 910], [1280, 736]]) {
    const camera = createMercatorCamera({ viewport: { width, height, dpr: 1 }, ...DEFAULT_MAP_VIEW });
    near(camera.centerLatitude, DEFAULT_MAP_VIEW.centerLatitude);
    near(camera.centerLongitude, DEFAULT_MAP_VIEW.centerLongitude);
  }
});
