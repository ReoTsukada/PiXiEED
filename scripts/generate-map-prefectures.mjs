#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_GRID, mercatorY } from '../js/globe/geometry.mjs';

const root = new URL('../', import.meta.url);
const source = JSON.parse(readFileSync(new URL('assets/maps/globe-land-mask-v1.json', root), 'utf8'));
const geo = JSON.parse(readFileSync(new URL('assets/maps/japan-prefectures.geojson', root), 'utf8'));
const RESOLUTION = 2048;
const SUBDIVISIONS = 8;
const SIMPLIFY_TOLERANCE_DEGREES = 0.002;
const TAU = Math.PI * 2;
const polygonsOf = (geometry) => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

// Keep the Northern Territories visible in the source dataset, but outside the
// selectable Hokkaido region. The attribution is unresolved; leaving these
// detached island polygons unassigned avoids presenting either claim as settled.
const UNASSIGNED_HOKKAIDO_ISLAND_BOUNDS = Object.freeze([145.2, 43.15, 150, 46]);
function selectableGeometry(feature) {
  if (feature.properties.code !== '01' || feature.geometry.type !== 'MultiPolygon') return { geometry: feature.geometry, unselectable: null };
  const [westLimit, southLimit, eastLimit, northLimit] = UNASSIGNED_HOKKAIDO_ISLAND_BOUNDS;
  const selected = [], unselectable = [];
  for (const polygon of feature.geometry.coordinates) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const ring of polygon) for (const [longitude, latitude] of ring) {
      west = Math.min(west, longitude); south = Math.min(south, latitude);
      east = Math.max(east, longitude); north = Math.max(north, latitude);
    }
    if (west >= westLimit && south >= southLimit && east <= eastLimit && north <= northLimit) unselectable.push(polygon);
    else selected.push(polygon);
  }
  return {
    geometry: { type: 'MultiPolygon', coordinates: selected },
    unselectable: unselectable.length ? { type: 'Feature', properties: { code: '01' }, geometry: { type: 'MultiPolygon', coordinates: unselectable } } : null
  };
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (!length2) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplifyOpenLine(points, tolerance) {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let splitAt = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], points[0], points.at(-1));
    if (distance > maxDistance) { maxDistance = distance; splitAt = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  const first = simplifyOpenLine(points.slice(0, splitAt + 1), tolerance);
  const second = simplifyOpenLine(points.slice(splitAt), tolerance);
  return [...first.slice(0, -1), ...second];
}

function simplifyRing(ring) {
  const open = ring.slice(0, -1);
  if (open.length < 8) return ring;
  let farthest = 1;
  let maxDistance2 = 0;
  for (let i = 1; i < open.length; i++) {
    const dx = open[i][0] - open[0][0];
    const dy = open[i][1] - open[0][1];
    const distance2 = dx * dx + dy * dy;
    if (distance2 > maxDistance2) { maxDistance2 = distance2; farthest = i; }
  }
  const first = simplifyOpenLine(open.slice(0, farthest + 1), SIMPLIFY_TOLERANCE_DEGREES);
  const second = simplifyOpenLine([...open.slice(farthest), open[0]], SIMPLIFY_TOLERANCE_DEGREES);
  const simplified = [...first.slice(0, -1), ...second.slice(0, -1), open[0]];
  return simplified.length >= 4 ? simplified : ring;
}

function simplifyGeometry(geometry) {
  const polygons = polygonsOf(geometry).map((polygon) => polygon.map(simplifyRing));
  const simplified = geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
  const roundCoordinates = (value) => {
    if (Array.isArray(value) && typeof value[0] === 'number') return value.map((coordinate) => Number(coordinate.toFixed(4)));
    return Array.isArray(value) ? value.map(roundCoordinates) : value;
  };
  return { type: simplified.type, coordinates: roundCoordinates(simplified.coordinates) };
}

function visitCoordinates(value, output = []) {
  if (Array.isArray(value) && typeof value[0] === 'number') output.push(value);
  else if (Array.isArray(value)) for (const child of value) visitCoordinates(child, output);
  return output;
}

function insideRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude)
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideFeature(longitude, latitude, feature) {
  for (const polygon of polygonsOf(feature.geometry)) {
    if (!insideRing(longitude, latitude, polygon[0])) continue;
    if (!polygon.slice(1).some((hole) => insideRing(longitude, latitude, hole))) return true;
  }
  return false;
}

const unselectableFeatures = [];
const features = geo.features.map((feature) => {
  const selected = selectableGeometry(feature);
  if (selected.unselectable) unselectableFeatures.push(selected.unselectable);
  const geometry = selected.geometry;
  const coordinates = visitCoordinates(geometry.coordinates);
  return {
    id: String(feature.properties.code),
    label: feature.properties['name:ja'] || feature.properties.name,
    geometry,
    bounds: [
      Math.min(...coordinates.map(([x]) => x)), Math.min(...coordinates.map(([, y]) => y)),
      Math.max(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([, y]) => y))
    ]
  };
});
const prefectureIds = ['__none__', ...features.map(({ id }) => id)];
const prefectureLabels = ['海', ...features.map(({ label }) => label)];
const spatialBins = new Map();
for (const feature of features) {
  const [west, south, east, north] = feature.bounds;
  for (let x = Math.floor(west / 5); x <= Math.floor(east / 5); x++) {
    for (let y = Math.floor(south / 5); y <= Math.floor(north / 5); y++) {
      const key = `${x}:${y}`;
      if (!spatialBins.has(key)) spatialBins.set(key, []);
      spatialBins.get(key).push(feature);
    }
  }
}
function ownerAt(longitude, latitude) {
  for (const feature of spatialBins.get(`${Math.floor(longitude / 5)}:${Math.floor(latitude / 5)}`) || []) {
    const [west, south, east, north] = feature.bounds;
    if (longitude >= west && longitude <= east && latitude >= south && latitude <= north
      && insideFeature(longitude, latitude, feature)) return feature.id;
  }
  return null;
}
const bounds = [
  Math.min(...features.map(({ bounds: b }) => b[0])), Math.min(...features.map(({ bounds: b }) => b[1])),
  Math.max(...features.map(({ bounds: b }) => b[2])), Math.max(...features.map(({ bounds: b }) => b[3]))
];
const firstRow = Math.max(0, Math.floor((Math.PI - mercatorY(bounds[3])) / TAU * RESOLUTION) - 1);
const lastRow = Math.min(RESOLUTION - 1, Math.ceil((Math.PI - mercatorY(bounds[1])) / TAU * RESOLUTION) + 1);
const firstColumn = Math.max(0, Math.floor((bounds[0] + 180) / 360 * RESOLUTION) - 1);
const lastColumn = Math.min(RESOLUTION - 1, Math.ceil((bounds[2] + 180) / 360 * RESOLUTION) + 1);
const raster = new Uint8Array(RESOLUTION * RESOLUTION);
const candidatesByPrefecture = new Map(prefectureIds.slice(1).map((id) => [prefectureIds.indexOf(id), new Map()]));
for (let row = firstRow; row <= lastRow; row++) {
  for (let column = firstColumn; column <= lastColumn; column++) {
    const counts = new Map();
    for (let sy = 0; sy < SUBDIVISIONS; sy++) for (let sx = 0; sx < SUBDIVISIONS; sx++) {
      const longitude = -180 + (column + (sx + 0.5) / SUBDIVISIONS) / RESOLUTION * 360;
      const mercator = Math.PI - (row + (sy + 0.5) / SUBDIVISIONS) / RESOLUTION * TAU;
      const latitude = Math.atan(Math.sinh(mercator)) * 180 / Math.PI;
      const id = ownerAt(longitude, latitude);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    let nextOwner = 0;
    let votes = 0;
    let totalLandVotes = 0;
    for (const [id, count] of counts) {
      totalLandVotes += count;
      if (count > votes || (count === votes && id < prefectureIds[nextOwner])) {
        nextOwner = prefectureIds.indexOf(id);
        votes = count;
      }
    }
    const key = row * RESOLUTION + column;
    if (nextOwner && totalLandVotes >= (SUBDIVISIONS * SUBDIVISIONS) / 2) raster[key] = nextOwner;
    for (const [id, count] of counts) {
      const ownerIndex = prefectureIds.indexOf(id);
      if (ownerIndex) candidatesByPrefecture.get(ownerIndex).set(key, count);
    }
  }
}
const majorityCounts = new Uint32Array(prefectureIds.length);
const keeperTileByOwner = new Int32Array(prefectureIds.length);
keeperTileByOwner.fill(-1);
for (let key = 0; key < raster.length; key++) {
  const owner = raster[key];
  if (!owner) continue;
  majorityCounts[owner]++;
  if (keeperTileByOwner[owner] < 0) keeperTileByOwner[owner] = key;
}
const missingOwners = prefectureIds.slice(1).map((_, i) => i + 1).filter((owner) => majorityCounts[owner] === 0);
const adjacency = new Map(missingOwners.map((owner) => {
  const tiles = [...candidatesByPrefecture.get(owner)]
    .filter(([key]) => !raster[key] || key !== keeperTileByOwner[raster[key]])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([key]) => key);
  return [owner, tiles];
}));
const matchedTiles = new Map();
function matchOwner(owner, visited) {
  for (const key of adjacency.get(owner) || []) {
    if (visited.has(key)) continue;
    visited.add(key);
    const previous = matchedTiles.get(key);
    if (!previous || matchOwner(previous, visited)) {
      matchedTiles.set(key, owner);
      return true;
    }
  }
  return false;
}
for (const owner of [...missingOwners].sort((a, b) => adjacency.get(a).length - adjacency.get(b).length || a - b)) {
  if (!matchOwner(owner, new Set())) throw new Error(`Cannot preserve prefecture ${prefectureIds[owner]} without nearest-cell inference.`);
}
for (const [key, owner] of matchedTiles) raster[key] = owner;
const rowRuns = [];
let landTiles = 0;
for (let row = 0; row < RESOLUTION; row++) {
  let owner = 0, runStart = 0;
  for (let column = 0; column <= RESOLUTION; column++) {
    const next = column < RESOLUTION ? raster[row * RESOLUTION + column] : 0;
    if (next === owner) continue;
    if (owner) { rowRuns.push([row, runStart, column - runStart, owner]); landTiles += column - runStart; }
    owner = next;
    runStart = column;
  }
}
const simplifiedFeatures = features.map(({ id, label, geometry }) => ({
  type: 'Feature', properties: { code: id, 'name:ja': label }, geometry: simplifyGeometry(geometry)
}));
let hash = 2166136261;
const checksumInput = JSON.stringify([RESOLUTION, [prefectureIds, prefectureLabels, rowRuns, simplifiedFeatures, bounds, unselectableFeatures]]);
for (let i = 0; i < checksumInput.length; i++) hash = Math.imul(hash ^ checksumInput.charCodeAt(i), 16777619);
const data = {
  version: 'map-prefectures-v1', projection: 'mercator', geometryVersion: DEFAULT_GRID.version,
  resolution: RESOLUTION, prefectureIds, prefectureLabels, bounds, rowRuns, unselectableFeatures,
  features: simplifiedFeatures, checksum: `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`
};
writeFileSync(new URL('assets/maps/map-prefectures-v1.json', root), `${JSON.stringify(data)}\n`);
console.log(JSON.stringify({ resolution: RESOLUTION, rowRuns: rowRuns.length, landTiles, featureCount: features.length, bytes: Buffer.byteLength(JSON.stringify(data)), checksum: data.checksum }));
