import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VIEW,
  DEFAULT_MAX_RENDER_CELLS,
  LOD_SETTINGS,
  MAX_BACKING_DPR,
  clearSelection,
  createLodState,
  createRenderInvalidationState,
  createRasterIndex,
  createRenderPlan,
  createViewState,
  enumerateVisibleRenderCells,
  getCanvasBackingSize,
  getFocusTransition,
  getSelectionStageLabel,
  pickRenderedCellAt,
  prepareGeoJsonFeatures,
  resolveLodLevel,
  updateLodState
} from '../../js/globe/renderer.mjs';
import { createGlobeCamera, lookupCell, projectCellCorners } from '../../js/globe/geometry.mjs';

function camera(overrides = {}) { return createGlobeCamera({ viewport: { width: 1000, height: 700, dpr: 2 }, ...overrides }); }
function fixtureIndex() {
  const world = prepareGeoJsonFeatures({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ADM0_A3: 'TST', NAME: 'Testland' }, geometry: { type: 'Polygon', coordinates: [[[-40, -30], [40, -30], [40, 30], [-40, 30], [-40, -30]]] } }] });
  return createRasterIndex({ worldFeatures: world });
}

test('LOD uses hysteresis for world, country, region, prefecture, and cell', () => {
  let state = createLodState('world');
  state = updateLodState(state, 1); assert.equal(state.level, 'country');
  state = updateLodState(state, 2.3); assert.equal(state.level, 'region');
  state = updateLodState(state, 4.8); assert.equal(state.level, 'prefecture');
  state = updateLodState(state, 9); assert.equal(state.level, 'cell');
  assert.equal(resolveLodLevel(8, state.level), 'cell');
  assert.equal(updateLodState(state, 7).level, 'prefecture');
  assert.equal(getSelectionStageLabel('world'), '世界');
});

test('focus transitions keep the central zoom model', () => {
  assert.deepEqual(getFocusTransition({ lodLevel: 'country', countryId: 'JPN' }), { centerLongitude: 139.6917, centerLatitude: 35.6895, zoom: 3.8, targetLod: 'region' });
  assert.equal(getFocusTransition({ lodLevel: 'country', countryId: 'USA' }), null);
  assert.deepEqual(getFocusTransition({ lodLevel: 'prefecture', center: { longitude: 139.7, latitude: 35.6 } }), { centerLongitude: 139.7, centerLatitude: 35.6, zoom: 10, targetLod: 'cell' });
});

test('render cells are spherical geographic quadrilaterals, not screen squares', () => {
  const plan = createRenderPlan({ camera: camera({ centerLongitude: 0, centerLatitude: 0, zoom: 2 }), lodState: createLodState('country'), rasterIndex: fixtureIndex(), maxCandidates: 500 });
  assert.ok(plan.cells.length > 0 && plan.cells.length <= 500);
  assert.equal(plan.featureMode, 'spherical-meridian-parallel-quads');
  assert.ok(plan.cells.every((cell) => cell.corners.length === 4 && cell.cell.bounds.north > cell.cell.bounds.south));
  assert.ok(plan.cells.some((cell) => Math.abs(cell.hitRegion.width - cell.hitRegion.height) > .01));
});

test('adaptive bands and shared geographic authority keep the visible plan bounded', () => {
  const index = fixtureIndex();
  const plan = createRenderPlan({ camera: camera({ centerLongitude: 0, centerLatitude: 0, zoom: 3 }), lodState: createLodState('region'), rasterIndex: index, maxCandidates: 1600 });
  assert.ok(plan.inspectedCells > 0);
  assert.ok(plan.cells.length <= 1600);
  assert.ok(plan.inspectedBands > 0);
  assert.ok(plan.grid.bands.some((band) => band.longitudeCount !== plan.grid.bands[Math.floor(plan.grid.bandCount / 2)].longitudeCount));
  assert.deepEqual(LOD_SETTINGS.cell, { label: '投稿セル', stride: 1 });
});

test('half-degree visible benchmark stays complete for representative mobile and desktop views', async (t) => {
  const { benchmarkGridDensity } = await import('../../js/globe/renderer.mjs');
  for (const viewport of [{ width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 2 }]) {
    const result = benchmarkGridDensity({ camera: camera({ viewport, centerLongitude: 139.7, centerLatitude: 35.7, zoom: 1.15 }), prefetchDegrees: 4 });
    const halfDegree = result.find((entry) => entry.latitudeStepDegrees === .5);
    assert.ok(halfDegree);
    assert.ok(halfDegree.inspectedCandidates > halfDegree.drawnCells);
    assert.equal(halfDegree.truncated, false);
    assert.ok(halfDegree.drawnCells <= DEFAULT_MAX_RENDER_CELLS * 1.5);
    t.diagnostic(`${viewport.width}x${viewport.height}: candidates=${halfDegree.inspectedCandidates}, drawn=${halfDegree.drawnCells}, truncated=${halfDegree.truncated}`);
  }
});

test('picking uses inverse sphere coordinates and the same cell id as rendering', () => {
  const plan = createRenderPlan({ camera: camera({ centerLongitude: 0, centerLatitude: 0, zoom: 3 }), lodState: createLodState('region'), rasterIndex: fixtureIndex(), maxCandidates: 600 });
  const cell = plan.cells[Math.floor(plan.cells.length / 2)];
  const picked = pickRenderedCellAt(cell.x, cell.y, plan);
  assert.equal(picked.cellId, cell.cellId);
  assert.equal(plan.pickIndex.get(cell.cellId), cell);
  assert.equal(lookupCell(picked.pickedGeo.longitude, picked.pickedGeo.latitude, plan.grid).id, cell.cellId);
  assert.equal(pickRenderedCellAt(-2000, -2000, plan), null);
});

test('content density is a data color, while empty sample data stays unhighlighted', () => {
  const base = lookupCell(0, 0);
  const counts = new Map([[base.id, 9]]);
  const plan = createRenderPlan({ camera: camera({ centerLongitude: 0, centerLatitude: 0, zoom: 3 }), lodState: createLodState('cell'), rasterIndex: fixtureIndex(), activeLayer: 'posts', contentCounts: counts, maxCandidates: 600 });
  assert.ok(plan.cells.every((cell) => cell.densityColor === null || cell.contentCount > 0));
  assert.equal(createRenderPlan({ camera: camera(), lodState: createLodState('country'), rasterIndex: fixtureIndex(), maxCandidates: 50 }).cells.some((cell) => cell.contentCount > 0), false);
});

test('cell geometry projects its exact four geographic corners', () => {
  const cell = lookupCell(139.7, 35.7); const currentCamera = camera({ centerLongitude: 139.7, centerLatitude: 35.7, zoom: 2 }); const projected = projectCellCorners(cell, currentCamera);
  assert.equal(projected.length, 4); assert.ok(projected.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test('canvas backing pixels do not change the CSS viewport contract', () => {
  assert.equal(MAX_BACKING_DPR, 2);
  assert.deepEqual(getCanvasBackingSize({ width: 375, height: 260, dpr: 2.5 }), { width: 375, height: 260, dpr: 2, requestedDpr: 2.5, physicalWidth: 750, physicalHeight: 520 });
});

test('hover/selection repaint invalidation does not rebuild the render plan', () => {
  const state = createRenderInvalidationState();
  assert.equal(state.needsPlan(), true);
  state.markPlanBuilt();
  state.markRepainted();
  state.invalidateRepaint();
  assert.equal(state.needsPlan(), false);
  assert.equal(state.needsRepaint(), true);
  state.markRepainted();
  assert.deepEqual(state.snapshot(), { planBuilds: 1, repaints: 2, planDirty: false, repaintDirty: false });
  state.invalidatePlan();
  assert.equal(state.needsPlan(), true);
});

test('view remains centre-fixed when zoom changes', () => {
  const view = createViewState(DEFAULT_VIEW); const zoomed = createViewState({ ...view, zoom: 8 });
  assert.equal(zoomed.centerLongitude, view.centerLongitude); assert.equal(zoomed.centerLatitude, view.centerLatitude);
});

test('selection reset is null and no cell listener surface is required', () => { assert.equal(clearSelection({ cellId: 'any' }), null); });
