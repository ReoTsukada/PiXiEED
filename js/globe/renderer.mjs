/**
 * PiXiEED geographic globe prototype.
 *
 * The sphere is drawn on one Canvas. Cells are geographic quadrilateral
 * patches bounded by meridians and parallels; they are not DOM buttons or
 * screen-space squares. One pointer system resolves a screen point back to a
 * cell, then to the current logical country/region/prefecture level.
 */

import {
  DEFAULT_GRID,
  clampLatitude,
  createGlobeCamera,
  createGlobeGrid,
  getCell,
  inverseScreenToGeo,
  lookupCell,
  normalizeLongitude,
  projectCellCorners,
  projectGeoToScreen
} from './geometry.mjs?v=20260921-grid11-1';
import { normalizeMembershipFeatures, pointInGeometry } from './topology.mjs?v=20260920-g4-precision-1';
import { JAPAN_COUNTRY_ID, JAPAN_REGION_GROUPS, getRegionForPrefecture } from './hierarchy.mjs?v=20260920-g4-precision-1';
import { createWebGLRenderer } from './webgl-renderer.mjs?v=20260921-astro-4';
import { WORLD_LAND_MASK } from '../../assets/maps/world-land-mask-v1.mjs?v=20260920-webgl2-1';

export const GLOBE_RENDERER_VERSION = 'g6-webgl2-analytic-half-degree-v1';
export const DEFAULT_VIEW = Object.freeze({ centerLongitude: 139.6917, centerLatitude: 35.6895, zoom: 1.15 });
export const DEFAULT_ZOOM_RANGE = Object.freeze({ min: 0.68, max: 24 });
export const DEFAULT_PREFETCH_DEGREES = 4;
export const DEFAULT_MAX_RENDER_CELLS = 72000;
export const DEFAULT_CELL_CACHE_LIMIT = 65536;
export const MAX_BACKING_DPR = 2;
export const LOD_THRESHOLDS = Object.freeze({ worldToCountry: .86, countryToWorld: .72, countryToRegion: 2.05, regionToCountry: 1.72, regionToPrefecture: 4.35, prefectureToRegion: 3.82, prefectureToCell: 8.2, cellToPrefecture: 7.35 });
// LOD changes the logical button represented by the cells, not the visible
// land density. Skipping columns at distant levels creates comb-like gaps.
export const LOD_SETTINGS = Object.freeze({ world: Object.freeze({ label: '世界', stride: 1 }), country: Object.freeze({ label: '国', stride: 1 }), region: Object.freeze({ label: '地域', stride: 1 }), prefecture: Object.freeze({ label: '都道府県', stride: 1 }), cell: Object.freeze({ label: '投稿セル', stride: 1 }) });
const LOD_LEVELS = Object.freeze(['world', 'country', 'region', 'prefecture', 'cell']);
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function finite(value, name) { const number = Number(value); if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`); return number; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function assertLevel(level) { if (!LOD_LEVELS.includes(level)) throw new RangeError(`Unknown globe LOD level: ${level}`); return level; }
function emptyFeatures(value) { return Array.isArray(value) ? value : []; }

export function clampZoom(zoom, range = DEFAULT_ZOOM_RANGE) {
  const min = finite(range.min, 'zoom range min'); const max = finite(range.max, 'zoom range max');
  if (min <= 0 || max < min) throw new RangeError('Invalid zoom range.');
  return clamp(finite(zoom, 'zoom'), min, max);
}
export function createViewState({ centerLongitude = DEFAULT_VIEW.centerLongitude, centerLatitude = DEFAULT_VIEW.centerLatitude, zoom = DEFAULT_VIEW.zoom, zoomRange = DEFAULT_ZOOM_RANGE } = {}) {
  return Object.freeze({ centerLongitude: normalizeLongitude(finite(centerLongitude, 'centerLongitude')), centerLatitude: clampLatitude(finite(centerLatitude, 'centerLatitude')), zoom: clampZoom(zoom, zoomRange), zoomRange: Object.freeze({ min: zoomRange.min, max: zoomRange.max }) });
}
export function withZoom(view, zoom) { const current = createViewState(view); return createViewState({ ...current, zoom: clampZoom(zoom, current.zoomRange) }); }
export function withCenter(view, centerLongitude, centerLatitude) { const current = createViewState(view); return createViewState({ ...current, centerLongitude, centerLatitude }); }

export function resolveLodLevel(zoom, previousLevel = 'country', thresholds = LOD_THRESHOLDS) {
  const value = finite(zoom, 'zoom'); let level = assertLevel(previousLevel);
  if (level === 'world' && value >= thresholds.countryToWorld) level = 'country';
  else if (level === 'country') {
    if (value >= thresholds.countryToRegion) level = 'region';
    else if (value <= thresholds.worldToCountry) level = 'world';
  } else if (level === 'region') {
    if (value >= thresholds.regionToPrefecture) level = 'prefecture';
    else if (value <= thresholds.regionToCountry) level = 'country';
  } else if (level === 'prefecture') {
    if (value >= thresholds.prefectureToCell) level = 'cell';
    else if (value <= thresholds.prefectureToRegion) level = 'region';
  } else if (level === 'cell' && value <= thresholds.cellToPrefecture) level = 'prefecture';
  return level;
}
export function createLodState(level = 'country') { return Object.freeze({ level: assertLevel(level) }); }
export function updateLodState(state, zoom, thresholds = LOD_THRESHOLDS) { return createLodState(resolveLodLevel(zoom, typeof state === 'string' ? state : state?.level || 'country', thresholds)); }

export function getCanvasBackingSize({ width, height, dpr = 1, maxDpr = MAX_BACKING_DPR }) {
  const cssWidth = finite(width, 'canvas width'); const cssHeight = finite(height, 'canvas height'); const devicePixelRatio = finite(dpr, 'device pixel ratio');
  const cap = finite(maxDpr, 'maximum device pixel ratio');
  if (cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0 || cap <= 0) throw new RangeError('Canvas dimensions, device pixel ratio, and its cap must be positive.');
  const effectiveDpr = Math.min(devicePixelRatio, cap);
  return Object.freeze({ width: cssWidth, height: cssHeight, dpr: effectiveDpr, requestedDpr: devicePixelRatio, physicalWidth: Math.max(1, Math.round(cssWidth * effectiveDpr)), physicalHeight: Math.max(1, Math.round(cssHeight * effectiveDpr)) });
}

function coordinateBounds(geometry) {
  let west = 180; let east = -180; let north = -90; let south = 90;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (const [longitude, latitude] of ring) { west = Math.min(west, longitude); east = Math.max(east, longitude); north = Math.max(north, latitude); south = Math.min(south, latitude); }
  return Object.freeze({ west, east, north, south });
}
export function prepareGeoJsonFeatures(source, { idProperty = 'ADM0_A3' } = {}) {
  if (!source || (Array.isArray(source) && source.length === 0)) return Object.freeze([]);
  const records = normalizeMembershipFeatures(source, { idProperty });
  return Object.freeze(records.map((record) => Object.freeze({ ...record, bounds: coordinateBounds(record.geometry) })));
}
function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Raster data must contain a base64 payload.');
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  throw new Error('This runtime cannot decode base64 raster data.');
}
function cellCountForGrid(grid) { return grid.bands.reduce((sum, band) => sum + band.longitudeCount, 0); }
export function validateRasterData(source, grid = DEFAULT_GRID) {
  if (!source || source.version !== 'globe-land-mask-v1') throw new RangeError('Unsupported globe raster version.');
  if (source.geometryVersion !== grid.version || source.latitudeStepDegrees !== grid.latitudeStepDegrees) throw new RangeError('Globe raster does not match the authoritative grid.');
  if (source.textureWidth !== 1440 || source.textureHeight !== 720) throw new RangeError('Globe raster texture dimensions must be 1440x720.');
  if (source.cellCount !== cellCountForGrid(grid)) throw new RangeError('Globe raster cell count does not match the authoritative grid.');
  const countryIndices = source.countryIndices instanceof Uint16Array ? source.countryIndices : decodeBase64(source.countryIndices);
  const prefectureIndices = source.prefectureIndices instanceof Uint8Array ? source.prefectureIndices : decodeBase64(source.prefectureIndices);
  if (countryIndices.byteLength !== source.cellCount * 2) throw new RangeError('Globe country raster length is invalid.');
  if (prefectureIndices.byteLength !== source.cellCount) throw new RangeError('Globe prefecture raster length is invalid.');
  if (source.countryIndicesEncoding !== 'base64-u16-le' || source.prefectureIndicesEncoding !== 'base64-u8') throw new RangeError('Unknown globe raster encoding.');
  return Object.freeze({ countryIndices, prefectureIndices });
}
export function decodeRasterData(source, grid = DEFAULT_GRID) {
  const decoded = validateRasterData(source, grid);
  const countryBytes = decoded.countryIndices instanceof Uint16Array
    ? new Uint8Array(decoded.countryIndices.buffer, decoded.countryIndices.byteOffset, decoded.countryIndices.byteLength)
    : decoded.countryIndices;
  const countryIndices = new Uint16Array(countryBytes.buffer.slice(countryBytes.byteOffset, countryBytes.byteOffset + countryBytes.byteLength));
  return Object.freeze({ ...source, ...decoded, countryIndices, prefectureIndices: new Uint8Array(decoded.prefectureIndices) });
}
function longitudeBin(longitude) { return clamp(Math.floor((normalizeLongitude(longitude) + 180) / 20), 0, 17); }
function latitudeBin(latitude) { return clamp(Math.floor((clampLatitude(latitude) + 90) / 20), 0, 8); }
function bboxContains(bounds, longitude, latitude) { if (latitude < bounds.south || latitude > bounds.north) return false; if (bounds.east - bounds.west >= 180) return true; if (bounds.west <= bounds.east) return longitude >= bounds.west && longitude <= bounds.east; return longitude >= bounds.west || longitude <= bounds.east; }
function buildBins(features) {
  const bins = new Map();
  features.forEach((feature, featureIndex) => {
    const bounds = feature.bounds || coordinateBounds(feature.geometry); const west = longitudeBin(bounds.west); const east = longitudeBin(bounds.east); const south = latitudeBin(bounds.south); const north = latitudeBin(bounds.north);
    const longitudeBins = bounds.east - bounds.west >= 180 ? Array.from({ length: 18 }, (_, index) => index) : west <= east ? Array.from({ length: east - west + 1 }, (_, index) => west + index) : [...Array.from({ length: 18 - west }, (_, index) => west + index), ...Array.from({ length: east + 1 }, (_, index) => index)];
    for (const longitudeIndex of longitudeBins) for (let latitudeIndex = south; latitudeIndex <= north; latitudeIndex += 1) { const key = `${longitudeIndex}:${latitudeIndex}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(featureIndex); }
  });
  return bins;
}
function createFeatureIndex(features) { const normalized = Object.freeze(Array.from(features || []).map((feature) => Object.freeze({ ...feature, bounds: feature.bounds || coordinateBounds(feature.geometry) }))); return { features: normalized, bins: buildBins(normalized), values: new Map(), stats: { candidateChecks: 0, pointInPolygonCalls: 0, cacheHits: 0, cacheMisses: 0 } }; }
function classifyFeature(index, longitude, latitude) {
  if (!index) return null; const candidates = index.bins.get(`${longitudeBin(longitude)}:${latitudeBin(latitude)}`) || [];
  for (const featureIndex of candidates) { const feature = index.features[featureIndex]; if (!bboxContains(feature.bounds, longitude, latitude)) continue; index.stats.candidateChecks += 1; index.stats.pointInPolygonCalls += 1; if (pointInGeometry(feature.geometry, longitude, latitude)) return feature; }
  return null;
}
export function createLandMaskCache(features = []) { return createFeatureIndex(features); }
export function getCachedLandState(cache, cell) {
  if (!cache || !cell?.id) return 'unknown'; if (cache.values.has(cell.id)) { cache.stats.cacheHits += 1; return cache.values.get(cell.id); }
  cache.stats.cacheMisses += 1; const state = classifyFeature(cache, cell.center.longitude, cell.center.latitude) ? 'land' : 'water'; cache.values.set(cell.id, state); return state;
}
export function createRasterIndex({ worldFeatures = [], prefectureFeatures = [], rasterData = null, grid = DEFAULT_GRID } = {}) {
  const world = Array.isArray(worldFeatures) ? worldFeatures : prepareGeoJsonFeatures(worldFeatures); const prefectures = Array.isArray(prefectureFeatures) ? prefectureFeatures : prepareGeoJsonFeatures(prefectureFeatures, { idProperty: 'code' });
  const raster = rasterData ? decodeRasterData(rasterData, grid) : null;
  const bandOffsets = [];
  let offset = 0;
  for (const band of grid.bands) { bandOffsets.push(offset); offset += band.longitudeCount; }
  return Object.freeze({ world: createFeatureIndex(world), prefectures: createFeatureIndex(prefectures), raster, bandOffsets, ownership: new Map(), ownershipStats: { hits: 0, misses: 0, rasterLookups: 0 } });
}
function ownerForCell(index, cell) {
  if (!index) return null; if (index.ownership.has(cell.id)) { index.ownershipStats.hits += 1; return index.ownership.get(cell.id); }
  index.ownershipStats.misses += 1;
  if (index.raster) {
    const rasterIndex = index.bandOffsets[cell.band] + cell.column;
    const countryNumber = index.raster.countryIndices[rasterIndex] || 0;
    const prefectureNumber = index.raster.prefectureIndices[rasterIndex] || 0;
    const countryId = countryNumber ? index.raster.countryIds?.[countryNumber] || null : null;
    const prefectureId = prefectureNumber ? index.raster.prefectureIds?.[prefectureNumber] || null : null;
    const countryLabel = countryNumber ? index.raster.countryLabels?.[countryNumber] || countryId : null;
    const prefectureLabel = prefectureNumber ? index.raster.prefectureLabels?.[prefectureNumber] || prefectureId : null;
    const country = countryId ? Object.freeze({ id: countryId, properties: Object.freeze({ ADM0_A3: countryId, NAME: countryLabel }) }) : null;
    const prefecture = prefectureId ? Object.freeze({ id: prefectureId, properties: Object.freeze({ code: prefectureId, name: prefectureLabel, 'name:ja': prefectureLabel }) }) : null;
    const region = prefecture ? getRegionForPrefecture(prefecture.id) : null;
    const owner = country ? Object.freeze({ countryId, prefectureId, regionId: region?.id || null, prefecture, country }) : null;
    index.ownershipStats.rasterLookups += 1;
    index.ownership.set(cell.id, owner);
    return owner;
  }
  const { longitude, latitude } = cell.center; const prefecture = classifyFeature(index.prefectures, longitude, latitude); const country = classifyFeature(index.world, longitude, latitude); const region = prefecture ? getRegionForPrefecture(prefecture.id) : null;
  const owner = prefecture ? Object.freeze({ countryId: JAPAN_COUNTRY_ID, prefectureId: prefecture.id, regionId: region?.id || null, prefecture, country }) : country ? Object.freeze({ countryId: country.id, prefectureId: null, regionId: null, prefecture: null, country }) : null;
  index.ownership.set(cell.id, owner); return owner;
}
function getOwnershipStats(index) {
  return Object.freeze({
    ownershipCacheHits: index?.ownershipStats?.hits || 0,
    ownershipCacheMisses: index?.ownershipStats?.misses || 0,
    worldCacheHits: index?.world?.stats?.cacheHits || 0,
    worldCacheMisses: index?.world?.stats?.cacheMisses || 0,
    prefectureCacheHits: index?.prefectures?.stats?.cacheHits || 0,
    prefectureCacheMisses: index?.prefectures?.stats?.cacheMisses || 0,
    rasterLookups: index?.ownershipStats?.rasterLookups || 0,
    pointInPolygonCalls: (index?.world?.stats?.pointInPolygonCalls || 0) + (index?.prefectures?.stats?.pointInPolygonCalls || 0)
  });
}
function ownerId(owner, level) { if (!owner) return null; if (level === 'world') return 'world'; if (level === 'country' || owner.countryId !== JAPAN_COUNTRY_ID) return owner.countryId; if (level === 'region') return owner.regionId; return owner.prefectureId; }
function ownerLabel(owner, level) { if (!owner) return null; if (level === 'world') return '世界'; if (level === 'country' || owner.countryId !== JAPAN_COUNTRY_ID) return owner.country?.properties?.NAME || owner.countryId; if (level === 'region') return JAPAN_REGION_GROUPS.find((region) => region.id === owner.regionId)?.label || owner.regionId; return owner.prefecture?.properties?.['name:ja'] || owner.prefecture?.properties?.name || owner.prefectureId; }

function createGeoWindow(camera, prefetchDegrees) {
  // The visible geographic radius is the globe radius, not the viewport
  // corners. Using the viewport corners widened the window unnecessarily and
  // made the half-degree grid inspect far more cells than could be visible.
  const extent = Math.min(180, Math.asin(clamp(1 / camera.zoom, 0, 1)) * RAD_TO_DEG + finite(prefetchDegrees, 'prefetchDegrees'));
  return Object.freeze({ centerLongitude: camera.centerLongitude, centerLatitude: camera.centerLatitude, latitudeMin: clampLatitude(camera.centerLatitude - extent), latitudeMax: clampLatitude(camera.centerLatitude + extent), angularExtent: extent });
}

export function benchmarkGridDensity({ camera, latitudeSteps = [1, 0.75, 0.5], ...options } = {}) {
  if (!camera?.viewport) throw new TypeError('A globe camera is required.');
  return Object.freeze(latitudeSteps.map((latitudeStepDegrees) => {
    const grid = createGlobeGrid({ version: `benchmark-step-${String(latitudeStepDegrees).replace('.', 'p')}`, latitudeStepDegrees });
    const plan = enumerateVisibleRenderCells(camera, { ...options, grid, maxCandidates: options.maxCandidates ?? Number.MAX_SAFE_INTEGER });
    return Object.freeze({ latitudeStepDegrees, totalCells: grid.bands.reduce((sum, band) => sum + band.longitudeCount, 0), inspectedCandidates: plan.inspectedCells, drawnCells: plan.cells.length, truncated: plan.truncated, rejectedBackside: plan.rejectedBackside, rejectedOutside: plan.rejectedOutside });
  }));
}
function clampBandRange(window, grid) { return { first: clamp(Math.floor((90 - window.latitudeMax) / grid.latitudeStepDegrees), 0, grid.bandCount - 1), last: clamp(Math.ceil((90 - window.latitudeMin) / grid.latitudeStepDegrees), 0, grid.bandCount - 1) }; }
function colorForCount(count, activeLayer) {
  if (!activeLayer || !count) return null;
  if (count >= 8) return '#f05b56'; if (count >= 4) return '#f3c95c'; if (count >= 2) return '#58c58d'; return '#73d9e3';
}
function polygonBounds(points) { let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); } return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }; }
function polygonInViewport(points, viewport, padding = 4) { const box = polygonBounds(points); return box.x + box.width >= -padding && box.x <= viewport.width + padding && box.y + box.height >= -padding && box.y <= viewport.height + padding; }

export function createBoundedCellCache(limit = DEFAULT_CELL_CACHE_LIMIT) {
  const maxEntries = Math.max(1, Math.floor(finite(limit, 'cell cache limit')));
  const values = new Map();
  let hits = 0;
  let misses = 0;
  return Object.freeze({
    get(band, column, grid) {
      const key = `${grid.version}:${band}:${column}`;
      const cached = values.get(key);
      if (cached) { hits += 1; return cached; }
      misses += 1;
      const cell = getCell(band, column, grid);
      values.set(key, cell);
      while (values.size > maxEntries) values.delete(values.keys().next().value);
      return cell;
    },
    snapshot() { return Object.freeze({ hits, misses, size: values.size, limit: maxEntries }); }
  });
}

function visibleLongitudeHalfSpan(latitude, camera) {
  const phi = latitude * DEG_TO_RAD;
  const centerPhi = camera.centerLatitude * DEG_TO_RAD;
  const numerator = -0.02 - Math.sin(phi) * Math.sin(centerPhi);
  const denominator = Math.cos(phi) * Math.cos(centerPhi);
  if (denominator < 1e-8) return numerator <= 0 ? 180 : 0;
  const cosineLimit = numerator / denominator;
  if (cosineLimit <= -1) return 180;
  if (cosineLimit > 1) return 0;
  return Math.acos(cosineLimit) * RAD_TO_DEG;
}

function longitudeSegments(centerLongitude, halfSpan) {
  if (halfSpan >= 180) return [[-180, 180]];
  const start = centerLongitude - halfSpan;
  const end = centerLongitude + halfSpan;
  if (start < -180) return [[start + 360, 180], [-180, end]];
  if (end > 180) return [[start, 180], [-180, end - 360]];
  return [[start, end]];
}

function columnRangesForBand(band, camera, prefetchDegrees) {
  const halfSpan = Math.min(180, visibleLongitudeHalfSpan(band.midLatitude, camera) + prefetchDegrees);
  if (halfSpan <= 0) return [];
  const step = band.longitudeStepDegrees;
  return longitudeSegments(camera.centerLongitude, halfSpan).map(([west, east]) => Object.freeze({
    first: clamp(Math.floor((west + 180) / step) - 1, 0, band.longitudeCount - 1),
    last: clamp(Math.ceil((east + 180) / step) + 1, 0, band.longitudeCount - 1)
  })).filter((range) => range.first <= range.last);
}

export function enumerateVisibleRenderCells(camera, { lodLevel = 'country', rasterIndex = null, grid = DEFAULT_GRID, prefetchDegrees = DEFAULT_PREFETCH_DEGREES, maxCandidates = DEFAULT_MAX_RENDER_CELLS, activeLayer = null, contentCounts = null, cellCache = null } = {}) {
  const level = assertLevel(lodLevel); const window = createGeoWindow(camera, prefetchDegrees); const range = clampBandRange(window, grid); const candidates = []; const countMap = contentCounts instanceof Map ? contentCounts : new Map(Object.entries(contentCounts || {}));
  let inspectedCells = 0; let projectedCandidates = 0; let rejectedBackside = 0; let rejectedOutside = 0; let ownershipChecks = 0;
  const settings = LOD_SETTINGS[level];
  for (let bandIndex = range.first; bandIndex <= range.last; bandIndex += 1) {
    const band = grid.bands[bandIndex];
    for (const columnRange of columnRangesForBand(band, camera, prefetchDegrees)) for (let column = columnRange.first; column <= columnRange.last; column += settings.stride) {
      inspectedCells += 1; const cell = cellCache?.get(bandIndex, column, grid) || getCell(bandIndex, column, grid); const projectedCenter = projectGeoToScreen(cell.center.longitude, cell.center.latitude, camera); projectedCandidates += 1;
      if (projectedCenter.depth < -.02) { rejectedBackside += 1; continue; }
      const corners = projectCellCorners(cell, camera);
      if (!polygonInViewport(corners, camera.viewport, 8)) { rejectedOutside += 1; continue; }
      ownershipChecks += 1; const owner = rasterIndex ? ownerForCell(rasterIndex, cell) : null; if (rasterIndex && !owner) continue;
      const contentCount = countMap.get(cell.id) || 0; const densityColor = colorForCount(contentCount, activeLayer);
      candidates.push(Object.freeze({ id: cell.id, cellId: cell.id, lodLevel: level, ownerLevel: level, ownerId: ownerId(owner, level), ownerLabel: ownerLabel(owner, level), countryId: owner?.countryId || null, regionId: owner?.regionId || null, prefectureId: owner?.prefectureId || null, center: cell.center, bounds: cell.bounds, corners, x: projectedCenter.x, y: projectedCenter.y, depth: projectedCenter.depth, opacity: clamp((projectedCenter.depth + .08) / .4, .08, 1), contentCount, densityColor, hitRegion: polygonBounds(corners), cell }));
      if (candidates.length >= maxCandidates) break;
    }
    if (candidates.length >= maxCandidates) break;
  }
  return Object.freeze({ cells: Object.freeze(candidates), window, inspectedCells, inspectedBands: range.last - range.first + 1, projectedCandidates, rejectedBackside, rejectedOutside, ownershipChecks, truncated: candidates.length >= maxCandidates, candidateCount: candidates.length, grid, lodLevel: level, settings, activeLayer, step: Object.freeze({ latitudeDegrees: grid.latitudeStepDegrees, adaptiveLongitudeBands: true, visibleLongitudeWindow: true }) });
}

export function createRenderPlan({ camera, lodState = createLodState(), rasterIndex = null, grid = DEFAULT_GRID, prefetchDegrees = DEFAULT_PREFETCH_DEGREES, maxCandidates = DEFAULT_MAX_RENDER_CELLS, activeLayer = null, contentCounts = null, cellCache = null } = {}) {
  if (!camera?.viewport) throw new TypeError('A globe camera is required.'); const nextLod = updateLodState(lodState, camera.zoom); const plan = enumerateVisibleRenderCells(camera, { lodLevel: nextLod.level, rasterIndex, grid, prefetchDegrees, maxCandidates, activeLayer, contentCounts, cellCache });
  const pickIndex = new Map(plan.cells.map((cell) => [cell.cellId, cell]));
  return Object.freeze({ version: GLOBE_RENDERER_VERSION, featureMode: 'spherical-meridian-parallel-quads', usesFeatureFill: false, lodLevel: nextLod.level, camera, cameraCenter: Object.freeze({ longitude: camera.centerLongitude, latitude: camera.centerLatitude }), zoom: camera.zoom, cells: plan.cells, pickIndex, window: plan.window, grid: plan.grid, settings: plan.settings, activeLayer, candidateCount: plan.candidateCount, inspectedCells: plan.inspectedCells, inspectedBands: plan.inspectedBands, projectedCandidates: plan.projectedCandidates, rejectedBackside: plan.rejectedBackside, rejectedOutside: plan.rejectedOutside, ownershipChecks: plan.ownershipChecks, ownershipStats: getOwnershipStats(rasterIndex), cellCache: cellCache?.snapshot?.() || null, truncated: plan.truncated });
}

export function pickRenderedCellAt(x, y, plan) {
  if (!plan?.camera || !plan.grid) return null; const geo = inverseScreenToGeo(finite(x, 'screen x'), finite(y, 'screen y'), plan.camera); if (!geo) return null; const cell = lookupCell(geo.longitude, geo.latitude, plan.grid); const rendered = plan.pickIndex?.get(cell.id) || null; return rendered ? Object.freeze({ ...rendered, screenX: x, screenY: y, pickedGeo: geo }) : null;
}
export function pickCellAt(x, y, cameraOrPlan, options = {}) { return cameraOrPlan?.cells ? pickRenderedCellAt(x, y, cameraOrPlan) : pickRenderedCellAt(x, y, options.plan || createRenderPlan({ camera: cameraOrPlan, ...options })); }
export function clearSelection() { return null; }
const SELECTION_STAGE_LABELS = Object.freeze({ world: '世界', country: '国', region: '地域', prefecture: '都道府県', cell: '投稿セル' });
export function getSelectionStageLabel(level) { return SELECTION_STAGE_LABELS[level] || '選択'; }
export function getFocusTransition(selection) {
  if (!selection?.lodLevel) return null; if (selection.lodLevel === 'world') return Object.freeze({ centerLongitude: selection.center?.longitude || 0, centerLatitude: selection.center?.latitude || 0, zoom: 1.15, targetLod: 'country' });
  if (selection.lodLevel === 'country') { if (selection.countryId !== JAPAN_COUNTRY_ID) return null; return Object.freeze({ centerLongitude: 139.6917, centerLatitude: 35.6895, zoom: 3.8, targetLod: 'region' }); }
  if (!selection.center || !Number.isFinite(selection.center.longitude) || !Number.isFinite(selection.center.latitude)) return null;
  if (selection.lodLevel === 'region') return Object.freeze({ centerLongitude: selection.center.longitude, centerLatitude: selection.center.latitude, zoom: 6.5, targetLod: 'prefecture' });
  if (selection.lodLevel === 'prefecture') return Object.freeze({ centerLongitude: selection.center.longitude, centerLatitude: selection.center.latitude, zoom: 10, targetLod: 'cell' });
  return Object.freeze({ centerLongitude: selection.center.longitude, centerLatitude: selection.center.latitude, zoom: 14, targetLod: 'cell' });
}

export function createRenderInvalidationState() {
  let planDirty = true;
  let repaintDirty = true;
  let planBuilds = 0;
  let repaints = 0;
  return Object.freeze({
    invalidatePlan() { planDirty = true; repaintDirty = true; },
    invalidateRepaint() { repaintDirty = true; },
    needsPlan() { return planDirty; },
    needsRepaint() { return repaintDirty; },
    markPlanBuilt() { planDirty = false; planBuilds += 1; },
    markRepainted() { repaintDirty = false; repaints += 1; },
    snapshot() { return Object.freeze({ planBuilds, repaints, planDirty, repaintDirty }); }
  });
}

function appendCellPath(context, cell) {
  if (cell.corners.length < 3) return false;
  context.moveTo(cell.corners[0].x, cell.corners[0].y);
  for (let index = 1; index < cell.corners.length; index += 1) context.lineTo(cell.corners[index].x, cell.corners[index].y);
  context.closePath();
  return true;
}
function cellFill(cell) { return cell.densityColor || (cell.countryId === JAPAN_COUNTRY_ID ? '#5faeb8' : '#5d8fa8'); }
function cellOpacity(cell) { return clamp(Math.round(cell.opacity * 8) / 8, .125, 1); }
function drawCell(context, cell, selected) {
  if (!appendCellPath(context, cell)) return;
  context.globalAlpha = selected ? 1 : cell.opacity;
  context.fillStyle = cellFill(cell);
  context.fill();
  context.strokeStyle = selected ? '#fff1a6' : 'rgba(7, 31, 45, .42)';
  context.lineWidth = selected ? 1.25 : .42;
  context.stroke();
  context.globalAlpha = 1;
}
function drawCellBatches(context, cells, selectedId, hoveredId) {
  const buckets = new Map();
  const emphasized = [];
  for (const cell of cells) {
    if (cell.cellId === selectedId || cell.cellId === hoveredId) {
      emphasized.push(cell);
      continue;
    }
    const opacity = cellOpacity(cell);
    const key = `${cellFill(cell)}|${opacity}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { fill: cellFill(cell), opacity, cells: [] }; buckets.set(key, bucket); }
    bucket.cells.push(cell);
  }
  for (const bucket of buckets.values()) {
    context.beginPath();
    for (const cell of bucket.cells) appendCellPath(context, cell);
    context.globalAlpha = bucket.opacity;
    context.fillStyle = bucket.fill;
    context.fill();
    context.strokeStyle = 'rgba(7, 31, 45, .42)';
    context.lineWidth = .42;
    context.stroke();
  }
  context.globalAlpha = 1;
  for (const cell of emphasized) { context.beginPath(); drawCell(context, cell, true); }
  return Object.freeze({ batchCount: buckets.size, emphasizedCount: emphasized.length });
}
function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
function reducedMotion() { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

export function createGlobeRenderer(canvas, { initialView = DEFAULT_VIEW, onPick = () => {}, onHover = () => {}, onStateChange = () => {}, backgroundElement = null, spaceTexture = '', worldFeatures = [], regionFeatures = [], prefectureFeatures = [], rasterData = null, forceCanvas = false, grid = DEFAULT_GRID, activeLayer = null, contentCounts = null } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A Canvas element is required.');
  let initialRaster = null;
  if (rasterData) {
    try { initialRaster = decodeRasterData(rasterData, grid); } catch (error) { console.warn('Globe raster asset is invalid; using Canvas 2D fallback.', error); }
  }
  // Setting canvas.width/height after a WebGL context has been initialised
  // resets its drawing buffer. Establish the backing size first so the
  // shader program, VAO and mask texture created below remain valid.
  const initialRect = canvas.getBoundingClientRect();
  const initialBacking = getCanvasBackingSize({
    width: initialRect.width || canvas.clientWidth || 640,
    height: initialRect.height || canvas.clientHeight || 480,
    dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    maxDpr: forceCanvas ? MAX_BACKING_DPR : 1.35
  });
  canvas.width = initialBacking.physicalWidth;
  canvas.height = initialBacking.physicalHeight;
  let webgl = null;
  try { webgl = !forceCanvas && (!rasterData || initialRaster) ? createWebGLRenderer(canvas, { grid, rasterData: initialRaster, skyUrl: spaceTexture || new URL('../../assets/backgrounds/pixieed-space-panorama-v1.png', import.meta.url).href, onSkyReady: () => repaint() }) : null; } catch (error) { console.warn('WebGL2 globe renderer unavailable; using Canvas 2D fallback.', error); }
  const context = webgl ? null : canvas.getContext('2d');
  if (!context && !webgl) throw new Error('Canvas 2D/WebGL2 context is unavailable.');
  if (backgroundElement && spaceTexture) backgroundElement.style.setProperty('--space-texture', `url(${JSON.stringify(spaceTexture)})`);
  let view = createViewState(initialView); let lodState = createLodState(); let selected = null; let hovered = null; let frame = null; let focusFrame = null; let suppressClick = false; let drag = null; let backing = initialBacking; let camera; let plan; let observer = null; let layer = activeLayer; let counts = contentCounts; let lastBatchMetrics = Object.freeze({ backend: webgl ? 'webgl2' : 'canvas2d', drawCalls: 0, frameMs: 0, batchCount: 0, emphasizedCount: 0 });
  const invalidation = createRenderInvalidationState();
  const initialPrefectures = prefectureFeatures.length ? prefectureFeatures : regionFeatures; let rasterIndex = createRasterIndex({ worldFeatures: emptyFeatures(worldFeatures), prefectureFeatures: emptyFeatures(initialPrefectures), rasterData: initialRaster, grid });
  const cellCache = createBoundedCellCache();
  function canvasSize() { const rect = canvas.getBoundingClientRect(); const requestedDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1; return getCanvasBackingSize({ width: rect.width || canvas.clientWidth || 640, height: rect.height || canvas.clientHeight || 480, dpr: requestedDpr, maxDpr: webgl ? 1.35 : MAX_BACKING_DPR }); }
  function createWebGLPlan() { return Object.freeze({ version: GLOBE_RENDERER_VERSION, backend: 'webgl2', drawCalls: 1, featureMode: 'analytic-sphere-0.25-degree-mask', lodLevel: lodState.level, camera, cameraCenter: Object.freeze({ longitude: camera.centerLongitude, latitude: camera.centerLatitude }), zoom: camera.zoom, cells: Object.freeze([]), pickIndex: new Map(), grid, settings: LOD_SETTINGS[lodState.level], activeLayer: layer, candidateCount: 0, inspectedCells: 0, projectedCandidates: 0, ownershipChecks: 0, truncated: false, mask: Object.freeze({ version: initialRaster?.version || WORLD_LAND_MASK.version, width: initialRaster?.textureWidth || WORLD_LAND_MASK.width, height: initialRaster?.textureHeight || WORLD_LAND_MASK.height }) }); }
  function rebuild() { backing = canvasSize(); if (canvas.width !== backing.physicalWidth) canvas.width = backing.physicalWidth; if (canvas.height !== backing.physicalHeight) canvas.height = backing.physicalHeight; camera = createGlobeCamera({ viewport: backing, ...view }); lodState = updateLodState(lodState, view.zoom); plan = webgl ? createWebGLPlan() : createRenderPlan({ camera, lodState, rasterIndex, grid, activeLayer: layer, contentCounts: counts, cellCache }); invalidation.markPlanBuilt(); }
  function repaint() { if (webgl) { lastBatchMetrics = webgl.draw({ camera, selected, hovered }); invalidation.markRepainted(); onStateChange({ view, plan, camera, selected, hovered, metrics: lastBatchMetrics }); return; } context.setTransform(backing.dpr, 0, 0, backing.dpr, 0, 0); context.clearRect(0, 0, backing.width, backing.height); const { centerX, centerY } = camera.viewport; const radius = camera.scale; context.save(); context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2); context.clip(); lastBatchMetrics = { backend: 'canvas2d', drawCalls: 0, frameMs: 0, ...drawCellBatches(context, plan.cells, selected?.cellId, hovered?.cellId) }; context.restore(); context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2); context.strokeStyle = 'rgba(190, 232, 238, .78)'; context.lineWidth = 1.1; context.stroke(); invalidation.markRepainted(); onStateChange({ view, plan, camera, selected, hovered, metrics: lastBatchMetrics }); }
  function draw() { if (invalidation.needsPlan()) rebuild(); else if (webgl && backing) { camera = createGlobeCamera({ viewport: backing, ...view }); lodState = updateLodState(lodState, view.zoom); plan = Object.freeze({ ...plan, camera, lodLevel: lodState.level, cameraCenter: Object.freeze({ longitude: camera.centerLongitude, latitude: camera.centerLatitude }), zoom: camera.zoom, settings: LOD_SETTINGS[lodState.level] }); } if (invalidation.needsRepaint()) repaint(); }
  function requestDraw({ rebuildPlan = true } = {}) { if (rebuildPlan) invalidation.invalidatePlan(); else invalidation.invalidateRepaint(); if (frame !== null) return; if (typeof requestAnimationFrame !== 'function') { draw(); return; } frame = requestAnimationFrame(() => { frame = null; draw(); }); }
  function cancelFocusAnimation() { if (focusFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(focusFrame); focusFrame = null; }
  function updateView(next) { cancelFocusAnimation(); view = createViewState({ ...view, ...next }); requestDraw({ rebuildPlan: !webgl }); }
  function animateFocus(next) { cancelFocusAnimation(); if (reducedMotion() || typeof requestAnimationFrame !== 'function') { view = createViewState({ ...view, ...next }); requestDraw({ rebuildPlan: !webgl }); return; } const start = view; const started = now(); const duration = 260; const longitudeDelta = normalizeLongitude(next.centerLongitude - start.centerLongitude); const tick = (time) => { if (focusFrame === null) return; const progress = Math.min(1, Math.max(0, (time - started) / duration)); const eased = 1 - ((1 - progress) ** 3); view = createViewState({ ...view, centerLongitude: normalizeLongitude(start.centerLongitude + longitudeDelta * eased), centerLatitude: start.centerLatitude + (next.centerLatitude - start.centerLatitude) * eased, zoom: start.zoom + (next.zoom - start.zoom) * eased }); requestDraw({ rebuildPlan: !webgl }); if (progress >= 1) { focusFrame = null; return; } focusFrame = requestAnimationFrame(tick); }; focusFrame = requestAnimationFrame(tick); }
  function pickWebGLCell(x, y) { if (!webgl || !camera) return null; const geo = inverseScreenToGeo(x, y, camera); if (!geo) return null; const cell = lookupCell(geo.longitude, geo.latitude, grid); const owner = ownerForCell(rasterIndex, cell); if (rasterIndex.raster && !owner) return null; return Object.freeze({ ...cell, cell, id: cell.id, cellId: cell.id, lodLevel: lodState.level, ownerLevel: lodState.level, ownerId: ownerId(owner, lodState.level), ownerLabel: ownerLabel(owner, lodState.level) || '土地セル', countryId: owner?.countryId || null, regionId: owner?.regionId || null, prefectureId: owner?.prefectureId || null, x, y, screenX: x, screenY: y, depth: geo.depth, opacity: 1, pickedGeo: geo }); }
  function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function onPointerDown(event) { cancelFocusAnimation(); const point = pointerPosition(event); canvas.setPointerCapture?.(event.pointerId); drag = { pointerId: event.pointerId, x: point.x, y: point.y, moved: false }; }
  function onPointerMove(event) { const point = pointerPosition(event); if (!drag || drag.pointerId !== event.pointerId) { const nextHover = webgl ? pickWebGLCell(point.x, point.y) : pickRenderedCellAt(point.x, point.y, plan); if (nextHover?.cellId !== hovered?.cellId) { hovered = nextHover; onHover(hovered); requestDraw({ rebuildPlan: false }); } return; } const dx = point.x - drag.x; const dy = point.y - drag.y; drag.x = point.x; drag.y = point.y; drag.moved = drag.moved || Math.hypot(dx, dy) > 2; updateView({ centerLongitude: view.centerLongitude - dx / Math.max(1, camera.scale) * RAD_TO_DEG, centerLatitude: clampLatitude(view.centerLatitude + dy / Math.max(1, camera.scale) * RAD_TO_DEG) }); }
  function endPointer(event, cancelled = false) { if (!drag || drag.pointerId !== event.pointerId) return; if (drag.moved && !cancelled) suppressClick = true; drag = null; }
  // Trackpads emit dozens of wheel events with momentum, and pinch gestures arrive
  // as ctrl+wheel. Applying every event's delta directly let one swipe run the zoom
  // away. Deltas are clamped, one gesture (events less than 140ms apart) is limited
  // to about 3x, and the result is applied at a bounded rate per frame.
  const WHEEL_MAX_EVENT = 48; const WHEEL_GESTURE_MAX = 1.1; const WHEEL_GESTURE_GAP_MS = 140; const WHEEL_MAX_STEP = 0.08;
  let wheelPending = 0; let wheelTimer = null; let wheelGesture = 0; let wheelLast = -Infinity;
  function flushWheel() {
    wheelTimer = null; const step = clamp(wheelPending, -WHEEL_MAX_STEP, WHEEL_MAX_STEP); wheelPending -= step;
    if (Math.abs(step) > 1e-5) updateView({ zoom: clampZoom(view.zoom * Math.exp(step), view.zoomRange) });
    if (Math.abs(wheelPending) > 1e-4) wheelTimer = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flushWheel) : setTimeout(flushWheel, 16); else wheelPending = 0;
  }
  function onWheel(event) {
    event.preventDefault();
    const at = now(); if (at - wheelLast > WHEEL_GESTURE_GAP_MS) wheelGesture = 0; wheelLast = at;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = clamp(finite(event.deltaY, 'wheel delta') * unit, -WHEEL_MAX_EVENT, WHEEL_MAX_EVENT);
    const nextGesture = clamp(wheelGesture - delta * (event.ctrlKey ? .012 : .0012), -WHEEL_GESTURE_MAX, WHEEL_GESTURE_MAX);
    wheelPending += nextGesture - wheelGesture; wheelGesture = nextGesture;
    if (wheelTimer === null) wheelTimer = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flushWheel) : setTimeout(flushWheel, 16);
  }
  function onClick(event) { if (suppressClick) { suppressClick = false; return; } const point = pointerPosition(event); selected = webgl ? pickWebGLCell(point.x, point.y) : pickRenderedCellAt(point.x, point.y, plan); onPick(selected); requestDraw({ rebuildPlan: false }); }
  function onKeyDown(event) { if (event.key === '+' || event.key === '=') { event.preventDefault(); updateView({ zoom: clampZoom(view.zoom * 1.22, view.zoomRange) }); } else if (event.key === '-' || event.key === '_') { event.preventDefault(); updateView({ zoom: clampZoom(view.zoom * .82, view.zoomRange) }); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); updateView({ centerLongitude: view.centerLongitude + (event.key === 'ArrowLeft' ? -8 : 8) }); } }
  const onPointerCancel = (event) => endPointer(event, true);
  const onLostPointerCapture = (event) => endPointer(event, true);
  canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', onPointerCancel); canvas.addEventListener('lostpointercapture', onLostPointerCapture); canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('click', onClick); canvas.addEventListener('keydown', onKeyDown);
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => requestDraw()); observer.observe(canvas); } draw();
  return Object.freeze({ draw, resize: () => requestDraw(), setData({ worldFeatures: nextWorld = worldFeatures, regionFeatures: nextRegions = regionFeatures, prefectureFeatures: nextPrefectures = prefectureFeatures } = {}) { if (!webgl) { const nextPrefectureSource = nextPrefectures?.length ? nextPrefectures : nextRegions; rasterIndex = createRasterIndex({ worldFeatures: Array.isArray(nextWorld) ? nextWorld : prepareGeoJsonFeatures(nextWorld), prefectureFeatures: Array.isArray(nextPrefectureSource) ? nextPrefectureSource : prepareGeoJsonFeatures(nextPrefectureSource, { idProperty: 'code' }) }); } requestDraw(); }, setAstronomy(next) { webgl?.setAstronomy(next); requestDraw(); }, setLayer(nextLayer, nextCounts = counts) { layer = nextLayer || null; counts = nextCounts; requestDraw(); }, setView(nextView) { updateView(nextView); }, focusSelection(selection) { const transition = getFocusTransition(selection); if (transition) animateFocus(transition); return transition; }, zoomIn() { updateView({ zoom: clampZoom(view.zoom * 1.22, view.zoomRange) }); }, zoomOut() { updateView({ zoom: clampZoom(view.zoom * .82, view.zoomRange) }); }, resetView() { selected = clearSelection(); onPick(null); updateView(DEFAULT_VIEW); }, pickAt(x, y) { return webgl ? pickWebGLCell(x, y) : pickRenderedCellAt(x, y, plan); }, getSnapshot() { return Object.freeze({ view, camera, plan, selected, hovered, metrics: Object.freeze({ backend: webgl ? 'webgl2' : 'canvas2d', ...invalidation.snapshot(), ...lastBatchMetrics, cellCache: cellCache.snapshot() }) }); }, destroy() { if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); cancelFocusAnimation(); observer?.disconnect(); webgl?.destroy(); canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerup', endPointer); canvas.removeEventListener('pointercancel', onPointerCancel); canvas.removeEventListener('lostpointercapture', onLostPointerCapture); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('click', onClick); canvas.removeEventListener('keydown', onKeyDown); } });
}
