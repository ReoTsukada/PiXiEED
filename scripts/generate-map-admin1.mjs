#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_GRID, inverseMercatorY, mercatorY } from '../js/globe/geometry.mjs';
import { createFineMapCellIndex } from '../js/globe/map-cells.mjs';

const root = new URL('../', import.meta.url);
const source = JSON.parse(readFileSync(new URL('assets/maps/globe-land-mask-v1.json', root), 'utf8'));
const prefectureData = JSON.parse(readFileSync(new URL('assets/maps/map-prefectures-v1.json', root), 'utf8'));
const sourcePath = process.argv[2] || process.env.MAP_ADMIN1_SOURCE || '/tmp/pixieed-ne-10m-admin1.geojson';
const rawSource = readFileSync(sourcePath);
const sourceSha256 = createHash('sha256').update(rawSource).digest('hex');
const expectedSourceSha256 = '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5';
if (sourceSha256 !== expectedSourceSha256) throw new Error(`Unexpected Natural Earth source SHA256: ${sourceSha256}`);
const geo = JSON.parse(rawSource.toString('utf8'));
const resolution = 2048;
const sampleSide = 4;
const landAuthority = 'admin1-geometries';
const simplifyTolerance = 0.015;
const tau = Math.PI * 2;
const countryIndexById = new Map(source.countryIds.map((id, index) => [id, index]));
const fine = createFineMapCellIndex(source, { prefectureData });
const countryBytes = Buffer.from(source.countryIndices, 'base64');
const canonicalCountryIndices = new Uint16Array(source.cellCount);
for (let i = 0; i < source.cellCount; i++) canonicalCountryIndices[i] = countryBytes.readUInt16LE(i * 2);
const bandOffsets = [];
let offset = 0;
for (const band of DEFAULT_GRID.bands) { bandOffsets.push(offset); offset += band.longitudeCount; }

function polygonsOf(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function visitCoordinates(value, output = []) {
  if (Array.isArray(value) && typeof value[0] === 'number') output.push(value);
  else if (Array.isArray(value)) for (const child of value) visitCoordinates(child, output);
  return output;
}

let ringIntersections = new WeakMap();
function pointInRing(longitude, latitude, ring) {
  let byLatitude = ringIntersections.get(ring);
  if (!byLatitude) { byLatitude = new Map(); ringIntersections.set(ring, byLatitude); }
  let crossings = byLatitude.get(latitude);
  if (!crossings) {
    crossings = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > latitude) !== (yj > latitude)) crossings.push(((xj - xi) * (latitude - yi)) / (yj - yi) + xi);
    }
    crossings.sort((a, b) => a - b);
    byLatitude.set(latitude, crossings);
  }
  let low = 0, high = crossings.length;
  while (low < high) { const middle = (low + high) >>> 1; if (crossings[middle] <= longitude) low = middle + 1; else high = middle; }
  return ((crossings.length - low) & 1) === 1;
}

function pointInFeature(longitude, latitude, feature) {
  if (longitude < feature.bounds[0] || longitude > feature.bounds[2]
    || latitude < feature.bounds[1] || latitude > feature.bounds[3]) return false;
  for (const entry of feature.polygonEntries || polygonsOf(feature.geometry).map((rings) => ({ rings, bounds: boundsOf({ type: 'Polygon', coordinates: rings }) }))) {
    const [west, south, east, north] = entry.bounds;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    const polygon = entry.rings;
    if (!pointInRing(longitude, latitude, polygon[0])) continue;
    if (!polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole))) return true;
  }
  return false;
}

function segmentDistance(point, start, end) {
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (!length2) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplifyLine(points, tolerance) {
  if (points.length < 3) return points;
  let farthest = 0, split = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = segmentDistance(points[i], points[0], points.at(-1));
    if (distance > farthest) { farthest = distance; split = i; }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)];
  const a = simplifyLine(points.slice(0, split + 1), tolerance);
  const b = simplifyLine(points.slice(split), tolerance);
  return [...a.slice(0, -1), ...b];
}

function simplifyRing(ring) {
  const open = ring.slice(0, -1);
  if (open.length < 8) return ring;
  let farthest = 1, distance2 = 0;
  for (let i = 1; i < open.length; i++) {
    const dx = open[i][0] - open[0][0], dy = open[i][1] - open[0][1];
    if (dx * dx + dy * dy > distance2) { distance2 = dx * dx + dy * dy; farthest = i; }
  }
  const first = simplifyLine(open.slice(0, farthest + 1), simplifyTolerance);
  const second = simplifyLine([...open.slice(farthest), open[0]], simplifyTolerance);
  const result = [...first.slice(0, -1), ...second.slice(0, -1), open[0]];
  return result.length >= 4 ? result : ring;
}

function simplifyGeometry(geometry) {
  const polygons = polygonsOf(geometry).map((polygon) => polygon.map(simplifyRing));
  const coordinates = geometry.type === 'Polygon' ? polygons[0] : polygons;
  function rounded(value) {
    if (Array.isArray(value) && typeof value[0] === 'number') return value.map((n) => Number(n.toFixed(3)));
    return Array.isArray(value) ? value.map(rounded) : value;
  }
  return { type: geometry.type, coordinates: rounded(coordinates) };
}

function boundsOf(geometry) {
  const coords = visitCoordinates(geometry.coordinates);
  return [
    Math.min(...coords.map(([x]) => x)), Math.min(...coords.map(([, y]) => y)),
    Math.max(...coords.map(([x]) => x)), Math.max(...coords.map(([, y]) => y))
  ];
}

const japanRegions = source.prefectureIds.slice(1).map((prefectureId, i) => ({
  id: `prefecture:${prefectureId}`,
  label: source.prefectureLabels[i + 1],
  countryId: 'JPN',
  countryLabel: source.countryLabels[countryIndexById.get('JPN')],
  kind: 'prefecture'
}));
const groupedFeatures = new Map();
const duplicateIsoFallbackCount = { sameNameMerged: 0, adm1CodeFallback: 0, missingCodeSkipped: 0 };
for (const input of geo.features) {
  const properties = input.properties || {};
  const countryId = String(properties.adm0_a3 || '');
  const countryIndex = countryIndexById.get(countryId);
  if (!countryIndex || countryId === 'JPN' || !input.geometry) continue;
  const isoCode = String(properties.iso_3166_2 || '').trim();
  const adm1Code = String(properties.adm1_code || '').trim();
  const sourceName = String(properties.name || properties.name_en || properties.name_ja || '').trim();
  const identityName = sourceName.toLocaleLowerCase('en');
  const groupKey = `${countryId}\u0000${isoCode}\u0000${isoCode ? identityName || adm1Code : adm1Code || identityName}`;
  let group = groupedFeatures.get(groupKey);
  if (!group) {
    group = { countryId, countryLabel: source.countryLabels[countryIndex], isoCode, adm1Code, sourceName, label: String(properties.name_ja || properties.name_en || properties.name || isoCode || adm1Code), polygons: [] };
    groupedFeatures.set(groupKey, group);
  }
  else duplicateIsoFallbackCount.sameNameMerged++;
  if (adm1Code && (!group.adm1Code || adm1Code < group.adm1Code)) group.adm1Code = adm1Code;
  group.polygons.push(...polygonsOf(input.geometry));
}
const namesByIso = new Map();
for (const group of groupedFeatures.values()) {
  if (!group.isoCode) continue;
  const key = `${group.countryId}:${group.isoCode}`;
  namesByIso.set(key, (namesByIso.get(key) || 0) + 1);
}
const features = [];
const seenFeatureIds = new Set();
for (const group of groupedFeatures.values()) {
  if (!group.isoCode && !group.adm1Code) { duplicateIsoFallbackCount.missingCodeSkipped++; continue; }
  const isoHasDistinctNames = group.isoCode && namesByIso.get(`${group.countryId}:${group.isoCode}`) > 1;
  const subregionCode = isoHasDistinctNames ? group.adm1Code : group.isoCode || group.adm1Code;
  if (!subregionCode) { duplicateIsoFallbackCount.missingCodeSkipped++; continue; }
  const idCode = isoHasDistinctNames ? `NE-${subregionCode}` : subregionCode;
  if (isoHasDistinctNames) duplicateIsoFallbackCount.adm1CodeFallback++;
  const id = `admin1:${group.countryId}:${idCode}`;
  if (seenFeatureIds.has(id)) throw new Error(`Duplicate admin1 identity after code fallback: ${id}`);
  seenFeatureIds.add(id);
  const geometry = simplifyGeometry({ type: 'MultiPolygon', coordinates: group.polygons });
  features.push({
    id,
    label: group.label || group.isoCode || group.adm1Code,
    countryId: group.countryId,
    countryLabel: group.countryLabel,
    kind: 'admin1',
    geometry,
    bounds: boundsOf(geometry),
    isoCode: group.isoCode || null,
    sourceAdm1Code: group.adm1Code || null,
    sourceName: group.sourceName || null,
    duplicateIsoFallback: Boolean(isoHasDistinctNames)
  });
}
const countryFeatureCounts = new Map();
for (const feature of features) countryFeatureCounts.set(feature.countryId, (countryFeatureCounts.get(feature.countryId) || 0) + 1);
features.sort((a, b) => a.id.localeCompare(b.id));
const fallbackRegions = source.countryIds.slice(1).flatMap((countryId) => {
  if (countryId === 'JPN' || countryFeatureCounts.has(countryId)) return [];
  const index = countryIndexById.get(countryId);
  return [{ id: `country:${countryId}`, label: source.countryLabels[index], countryId, countryLabel: source.countryLabels[index], kind: 'country' }];
});
const mapRegions = [null, ...japanRegions, ...features.map(({ id, label, countryId, countryLabel, kind }) => ({ id, label, countryId, countryLabel, kind })), ...fallbackRegions];
if (new Set(mapRegions.slice(1).map(({ id }) => id)).size !== mapRegions.length - 1) throw new Error('Generated map region IDs must be unique.');
const regionIndex = new Map(mapRegions.slice(1).map((region, i) => [region.id, i + 1]));
for (const feature of features) feature.regionIndex = regionIndex.get(feature.id);
for (const feature of features) feature.polygonEntries = polygonsOf(feature.geometry).map((rings) => ({ rings, bounds: boundsOf({ type: 'Polygon', coordinates: rings }) }));
const featuresByCountry = new Map();
for (const feature of features) {
  if (!featuresByCountry.has(feature.countryId)) featuresByCountry.set(feature.countryId, []);
  featuresByCountry.get(feature.countryId).push(feature);
}
const spatialBins = new Map();
for (const feature of features) {
  const [west, south, east, north] = feature.bounds;
  for (let x = Math.floor(west / 4); x <= Math.floor(east / 4); x++) {
    for (let y = Math.floor(south / 4); y <= Math.floor(north / 4); y++) {
      const key = `${x}:${y}`;
      if (!spatialBins.has(key)) spatialBins.set(key, []);
      spatialBins.get(key).push(feature);
    }
  }
}

function sourceCountryIndex(row, column) {
  const mercator = Math.PI - (row + 0.5) / resolution * tau;
  const latitude = inverseMercatorY(mercator);
  const bandIndex = Math.max(0, Math.min(DEFAULT_GRID.bandCount - 1, Math.floor((90 - latitude) / DEFAULT_GRID.latitudeStepDegrees)));
  const band = DEFAULT_GRID.bands[bandIndex];
  const longitude = -180 + (column + 0.5) / resolution * 360;
  const sourceColumn = Math.max(0, Math.min(band.longitudeCount - 1, Math.floor((longitude + 180) / 360 * band.longitudeCount)));
  return canonicalCountryIndices[bandOffsets[bandIndex] + sourceColumn];
}

const countryOwnerAtTile = (row, column) => sourceCountryIndex.call(null, row, column);
const regionRaster = new Uint16Array(resolution * resolution);
const perRegionTiles = new Uint32Array(mapRegions.length);
let landTiles = 0;
const generationStartedAt = Date.now();
function sampleLocation(row, column, sy, sx) {
  return { longitude: -180 + (column + sx) / resolution * 360, latitude: inverseMercatorY(Math.PI - (row + sy) / resolution * tau) };
}
function regionAt(longitude, latitude, candidates, preferredCountry) {
  let first = 0;
  for (const feature of candidates) {
    if (!pointInFeature(longitude, latitude, feature)) continue;
    if (!first) first = feature.regionIndex;
    // Only resolve actual overlapping geometry with the legacy country hint.
    if (feature.countryId === preferredCountry) return feature.regionIndex;
  }
  return first;
}
const columnBins = Array.from({ length: resolution }, (_, column) => [
  Math.floor((-180 + column / resolution * 360) / 4),
  Math.floor((-180 + (column + 1) / resolution * 360) / 4)
]);
const quarterOffsets = [[.25,.25],[.25,.75],[.75,.25],[.75,.75]];
for (let row = 0; row < resolution; row++) {
  ringIntersections = new WeakMap();
  const latitude = inverseMercatorY(Math.PI - (row + .5) / resolution * tau);
  const southBin = Math.floor(inverseMercatorY(Math.PI - (row + 1) / resolution * tau) / 4);
  const northBin = Math.floor(inverseMercatorY(Math.PI - row / resolution * tau) / 4);
  for (let column = 0; column < resolution; column++) {
    const key = row * resolution + column;
    const prefectureIndex = fine.prefectureMask[key];
    if (prefectureIndex) {
      regionRaster[key] = prefectureIndex;
      perRegionTiles[prefectureIndex]++;
      continue;
    }
    const countryId = source.countryIds[countryOwnerAtTile(row, column)];
    const fallback = regionIndex.get(`country:${countryId}`);
    if (fallback) {
      regionRaster[key] = fallback;
      perRegionTiles[fallback]++;
      continue;
    }
    const [westBin, eastBin] = columnBins[column];
    let candidates;
    if (westBin === eastBin && southBin === northBin) candidates = spatialBins.get(`${westBin}:${southBin}`) || [];
    else {
      const nearby = new Set();
      for (let x = westBin; x <= eastBin; x++) for (let y = southBin; y <= northBin; y++) {
        for (const feature of spatialBins.get(`${x}:${y}`) || []) nearby.add(feature);
      }
      candidates = [...nearby].sort((a,b) => a.regionIndex - b.regionIndex);
    }
    if (!candidates.length) continue;
    const longitude = -180 + (column + .5) / resolution * 360;
    const centerOwner = regionAt(longitude, latitude, candidates, countryId);
    const sameOwner = centerOwner > 0 && quarterOffsets.every(([sy,sx]) => {
      const point = sampleLocation(row,column,sy,sx);
      return regionAt(point.longitude,point.latitude,candidates,countryId) === centerOwner;
    });
    const votes = new Map();
    if (sameOwner) votes.set(centerOwner, sampleSide ** 2);
    else for (let sy = 0; sy < sampleSide; sy++) for (let sx = 0; sx < sampleSide; sx++) {
      const point = sampleLocation(row,column,(sy+.5)/sampleSide,(sx+.5)/sampleSide);
      const owner = regionAt(point.longitude,point.latitude,candidates,countryId);
      if (owner) votes.set(owner,(votes.get(owner)||0)+1);
    }
    let winner = 0, maximum = 0, landVotes = 0;
    for (const [index, count] of votes) {
      landVotes += count;
      const preferred = mapRegions[index].countryId === countryId;
      const winnerPreferred = mapRegions[winner]?.countryId === countryId;
      if (count > maximum || count === maximum && (preferred && !winnerPreferred || preferred === winnerPreferred && index === centerOwner)) {
        winner = index; maximum = count;
      }
    }
    if (winner && landVotes >= sampleSide ** 2 / 2) { regionRaster[key] = winner; perRegionTiles[winner]++; }
  }
  if ((row + 1) % 64 === 0 || row === resolution - 1) console.log(JSON.stringify({ progressRows: row + 1, resolution, elapsedMs: Date.now() - generationStartedAt }));
}

let reservedSmallRegions = 0;
let reservationRow = -1;
for (const feature of features) {
  const targetIndex = feature.regionIndex;
  if (perRegionTiles[targetIndex]) continue;
  const candidateKeys = new Set();
  for (const entry of feature.polygonEntries) {
    const [west, south, east, north] = entry.bounds;
    const minColumn = Math.max(0, Math.floor((west + 180) / 360 * resolution));
    const maxColumn = Math.min(resolution - 1, Math.floor((east + 180) / 360 * resolution));
    const minRow = Math.max(0, Math.floor((Math.PI - mercatorY(north)) / tau * resolution));
    const maxRow = Math.min(resolution - 1, Math.floor((Math.PI - mercatorY(south)) / tau * resolution));
    for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) candidateKeys.add(row * resolution + column);
  }
  let bestKey = -1, bestVotes = 0, bestPreviousOwner = 0;
  for (const key of candidateKeys) {
    const row = Math.floor(key / resolution), column = key % resolution;
    if (fine.prefectureMask[key]) continue;
    const previousOwner = regionRaster[key];
    if (previousOwner && (mapRegions[previousOwner].countryId !== feature.countryId || perRegionTiles[previousOwner] <= 1)) continue;
    if (reservationRow !== row) { ringIntersections = new WeakMap(); reservationRow = row; }
    let votes = 0;
    for (let sy = 0; sy < sampleSide; sy++) for (let sx = 0; sx < sampleSide; sx++) {
      const point = sampleLocation(row, column, (sy + .5) / sampleSide, (sx + .5) / sampleSide);
      if (pointInFeature(point.longitude, point.latitude, feature)) votes++;
    }
    if (votes > bestVotes) { bestKey = key; bestVotes = votes; bestPreviousOwner = previousOwner; }
  }
  if (bestKey >= 0 && bestVotes > 0) {
    if (bestPreviousOwner) perRegionTiles[bestPreviousOwner]--;
    regionRaster[bestKey] = targetIndex;
    perRegionTiles[targetIndex]++;
    reservedSmallRegions++;
  }
}
const remainingZeroTileAdmin1Count = features.filter(({ regionIndex }) => perRegionTiles[regionIndex] === 0).length;
let addedLandTiles = 0, removedLandTiles = 0, changedCountryTiles = 0;
const countriesSeen = new Set();
for (let key = 0; key < regionRaster.length; key++) {
  const owner = regionRaster[key];
  if (owner) {
    landTiles++;
    const countryId = mapRegions[owner].countryId;
    countriesSeen.add(countryId);
    if (!fine.landMask[key]) addedLandTiles++;
    else if (countryId !== 'JPN' && source.countryIds[countryOwnerAtTile(Math.floor(key / resolution), key % resolution)] !== countryId) changedCountryTiles++;
  } else if (fine.landMask[key]) removedLandTiles++;
}
const missingCountries = source.countryIds.slice(1).filter(id => !countriesSeen.has(id));
if (missingCountries.length) throw new Error(`Geometry raster must preserve every country: ${missingCountries.join(', ')}`);
if (perRegionTiles.slice(1,48).some((count,i) => count !== fine.prefectureTiles.get(source.prefectureIds[i+1]).length)) throw new Error('Japanese prefecture tiles changed.');

const rowRuns = [];
for (let row = 0; row < resolution; row++) {
  const offset = row * resolution;
  let owner = 0, start = 0;
  for (let column = 0; column <= resolution; column++) {
    const next = column < resolution ? regionRaster[offset + column] : 0;
    if (next === owner) continue;
    if (owner) rowRuns.push([row, start, column - start, owner]);
    owner = next;
    start = column;
  }
}

const countryFeatureIds = new Set(features.map((feature) => feature.countryId));
const countryCounts = source.countryIds.slice(1).map((countryId) => ({
  countryId,
  admin1FeatureCount: countryFeatureCounts.get(countryId) || 0,
  fallback: !countryFeatureIds.has(countryId),
  zeroTileAdmin1Count: features.filter((feature) => feature.countryId === countryId && !perRegionTiles[feature.regionIndex]).length
}));
const simplifiedFeatures = features.map(({ id, countryId, geometry, bounds, regionIndex, isoCode, sourceAdm1Code, duplicateIsoFallback }) => ({
  type: 'Feature',
  properties: { id, countryId, regionIndex, ...(duplicateIsoFallback ? { iso3166_2: isoCode, sourceAdm1Code, duplicateIsoFallback: true } : {}) },
  geometry,
  bounds
}));
const sourceCommit = 'ca96624a56bd078437bca8184e78163e5039ad19';
const checksumRows = [mapRegions, rowRuns, simplifiedFeatures, countryCounts, landAuthority];
const checksumText = JSON.stringify([resolution, checksumRows]);
let checksumValue = 2166136261;
for (let i = 0; i < checksumText.length; i++) checksumValue = Math.imul(checksumValue ^ checksumText.charCodeAt(i), 16777619);
const data = {
  version: 'map-admin1-v1', projection: 'mercator', geometryVersion: DEFAULT_GRID.version, resolution, landAuthority,
  source: { url: 'https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_1_states_provinces.geojson', commit: sourceCommit, sha256: sourceSha256, featureCount: geo.features.length, processedFeatureCount: features.length },
  regionCount: mapRegions.length - 1, countryIds: source.countryIds, countryLabels: source.countryLabels,
  mapRegions, rowRuns, features: simplifiedFeatures, countryCounts, landTiles,
  diagnostics: { addedLandTiles, removedLandTiles, changedCountryTiles, duplicateIsoFallbackCount, reservedSmallRegions, remainingZeroTileAdmin1Count, zeroTileAdmin1Count: remainingZeroTileAdmin1Count, uncoveredLandTileCount: landTiles - regionRaster.reduce((sum, owner) => sum + (owner ? 1 : 0), 0) },
  checksum: `fnv1a32-${(checksumValue >>> 0).toString(16).padStart(8, '0')}`
};
const serialized = `${JSON.stringify(data)}\n`;
const bytes = Buffer.byteLength(serialized);
if (bytes > 8 * 1024 * 1024) throw new Error(`Generated asset exceeds 8 MiB (${bytes} bytes); increase simplification before writing.`);
writeFileSync(new URL('assets/maps/map-admin1-v1.json', root), serialized);
console.log(JSON.stringify({ resolution, sourceFeatureCount: geo.features.length, featureCount: features.length, regionCount: data.regionCount, rowRuns: rowRuns.length, landTiles, addedLandTiles, removedLandTiles, changedCountryTiles, countryCount: countriesSeen.size, coveredLandTiles: data.landTiles - data.diagnostics.uncoveredLandTileCount, reservedSmallRegions, remainingZeroTileAdmin1Count, countriesWithoutAdmin1: fallbackRegions.length, duplicateIsoFallbackCount, uncoveredLandTileCount: data.diagnostics.uncoveredLandTileCount, bytes, checksum: data.checksum, sourceSha256 }, null, 2));
