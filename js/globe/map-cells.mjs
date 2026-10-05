/** Uniform Web Mercator display tiles; posting IDs remain on the canonical v11 grid. */
import { DEFAULT_GRID, getCell, lookupCell, normalizeLongitude, mercatorY, inverseMercatorY, MERCATOR_MAX_LATITUDE } from './geometry.mjs';
import { JAPAN_COUNTRY_ID, getRegionForPrefecture } from './hierarchy.mjs';
import { createMembershipIndex, findExplicitMembership } from './topology.mjs';

export const MAP_CELL_VERSION = 'map-cells-v1';
export const FINE_MAP_RESOLUTION = 2048;
export const MAP_CELL_RESOLUTIONS = Object.freeze([128, 192, 256, 320, 384, 512, 768, 1024]);
const TAU = Math.PI * 2;
const assert = (condition, message) => { if (!condition) throw new RangeError(message); };
const ownerKey = (country, prefecture) => `${country}:${prefecture}`;
function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof Uint16Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  assert(typeof value === 'string', 'Encoded source bytes are required.');
  if (typeof atob === 'function') return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  return new Uint8Array(Buffer.from(value, 'base64'));
}
function checksum(resolution, rows) {
  const text = JSON.stringify([resolution, rows]); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function tileKey(longitude, latitude, resolution) {
  const column = Math.min(resolution - 1, Math.floor((normalizeLongitude(longitude) + 180) / 360 * resolution));
  const row = Math.max(0, Math.min(resolution - 1, Math.floor((Math.PI - mercatorY(latitude)) / TAU * resolution)));
  return row * resolution + column;
}
function requiredOwners(countryIds, prefectureIds) {
  const japan = countryIds.indexOf(JAPAN_COUNTRY_ID);
  assert(japan > 0 && prefectureIds.length === 48, 'All 47 Japanese prefectures are required.');
  return [...countryIds.flatMap((id, i) => i && i !== japan ? [ownerKey(i, 0)] : []), ...prefectureIds.slice(1).map((id, i) => ownerKey(japan, i + 1))];
}
function decodeSamples(source) {
  const total = DEFAULT_GRID.bands.reduce((sum, band) => sum + band.longitudeCount, 0);
  assert(source?.version === 'globe-land-mask-v1' && source.geometryVersion === DEFAULT_GRID.version && source.cellCount === total, 'Source raster must match the canonical v11 grid.');
  assert(source.countryIds?.[0] === '__water__' && source.prefectureIds?.[0] === '__none__', 'Invalid source ownership IDs.');
  requiredOwners(source.countryIds, source.prefectureIds);
  const countries = bytes(source.countryIndices), prefectures = bytes(source.prefectureIndices);
  assert(countries.length === total * 2 && prefectures.length === total, 'Invalid source raster lengths.');
  const samples = []; let offset = 0;
  for (const band of DEFAULT_GRID.bands) {
    const latitude = band.midLatitude;
    for (let column = 0; column < band.longitudeCount; column++, offset++) {
      const country = countries[offset * 2] | (countries[offset * 2 + 1] << 8), prefecture = prefectures[offset];
      assert(country < source.countryIds.length && prefecture < source.prefectureIds.length, 'Invalid source owner index.');
      if (!country || Math.abs(latitude) > MERCATOR_MAX_LATITUDE) continue;
      assert(!prefecture || source.countryIds[country] === JAPAN_COUNTRY_ID, 'Prefecture ownership must belong to Japan.');
      const longitude = -180 + (column + .5) * band.longitudeStepDegrees;
      samples.push({ longitude, latitude, band: band.band, column, country, prefecture });
    }
  }
  return { total, samples };
}
function bucketSamples(samples, resolution, required) {
  const buckets = new Map(), adjacency = new Map(required.map(owner => [owner, []]));
  for (const sample of samples) {
    const tile = tileKey(sample.longitude, sample.latitude, resolution);
    let bucket = buckets.get(tile); if (!bucket) { bucket = new Map(); buckets.set(tile, bucket); }
    const owner = ownerKey(sample.country, sample.prefecture);
    let group = bucket.get(owner); if (!group) { group = []; bucket.set(owner, group); }
    group.push(sample);
  }
  for (const [tile, bucket] of [...buckets].sort((a, b) => a[0] - b[0])) for (const owner of bucket.keys()) adjacency.get(owner)?.push(tile);
  const matched = new Map();
  function visit(owner, seen) {
    for (const tile of adjacency.get(owner)) {
      if (seen.has(tile)) continue; seen.add(tile);
      const previous = matched.get(tile);
      if (!previous || visit(previous, seen)) { matched.set(tile, owner); return true; }
    }
    return false;
  }
  const failures = [];
  const ordered = [...required].sort((a, b) => adjacency.get(a).length - adjacency.get(b).length || a.localeCompare(b));
  for (const owner of ordered) if (!visit(owner, new Set())) failures.push(owner);
  return { buckets, matched, failures };
}
/** Choose the coarsest tested uniform resolution with a distinct real tile for every owner. */
export function buildMapCells(source, { resolutions = MAP_CELL_RESOLUTIONS } = {}) {
  const { total, samples } = decodeSamples(source);
  const required = requiredOwners(source.countryIds, source.prefectureIds);
  let resolution, assignment;
  for (const candidate of resolutions) {
    assert(Number.isInteger(candidate) && candidate >= 2 && candidate <= 4096, 'Invalid display resolution.');
    const result = bucketSamples(samples, candidate, required);
    if (!result.failures.length) { resolution = candidate; assignment = result; break; }
  }
  assert(assignment, 'No uniform grid can preserve every country and prefecture at these resolutions.');
  const rows = [];
  for (const [tile, bucket] of [...assignment.buckets].sort((a, b) => a[0] - b[0])) {
    const owner = assignment.matched.get(tile) || [...bucket].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0][0];
    const row = Math.floor(tile / resolution), column = tile % resolution;
    const centerLongitude = -180 + (column + .5) / resolution * 360;
    const centerY = Math.PI - (row + .5) / resolution * TAU;
    const distance = sample => ((sample.longitude - centerLongitude) * Math.PI / 180) ** 2 + (mercatorY(sample.latitude) - centerY) ** 2;
    let representative = bucket.get(owner)[0], nearest = distance(representative);
    for (const sample of bucket.get(owner)) { const d = distance(sample); if (d < nearest) { nearest = d; representative = sample; } }
    rows.push([row, column, representative.band, representative.column, representative.country, representative.prefecture]);
  }
  return Object.freeze({ version: MAP_CELL_VERSION, projection: 'mercator', geometryVersion: DEFAULT_GRID.version, resolution, worldCellCount: resolution ** 2, cellCount: rows.length, sourceCellCount: total, sourceLandCellCount: samples.length, sourceChecksum: source.checksum, countryIds: [...source.countryIds], countryLabels: [...source.countryLabels], prefectureIds: [...source.prefectureIds], prefectureLabels: [...source.prefectureLabels], checksum: checksum(resolution, rows), cells: rows });
}
/** Validate and expand only the sparse land tiles needed by rendering and picking. */
export function createMapCellIndex(data, options = {}) {
  if (data?.version === 'globe-land-mask-v1') return createFineMapCellIndex(data, options);
  assert(data?.version === MAP_CELL_VERSION && data.projection === 'mercator' && data.geometryVersion === DEFAULT_GRID.version, 'Unsupported map-cell geometry.');
  const resolution = data.resolution;
  assert(Number.isInteger(resolution) && resolution >= 2 && resolution <= 4096, 'Invalid map-cell resolution.');
  assert(data.worldCellCount === resolution ** 2 && Array.isArray(data.cells) && data.cellCount === data.cells.length, 'Invalid map-cell count.');
  assert(data.countryIds?.[0] === '__water__' && data.prefectureIds?.[0] === '__none__', 'Invalid map owner IDs.');
  requiredOwners(data.countryIds, data.prefectureIds);
  assert(checksum(resolution, data.cells) === data.checksum, 'Map-cell checksum does not match.');
  const byTile = new Map(), canonicalIds = new Set(), countries = new Set(), prefectures = new Set();
  const cells = data.cells.map((row, offset) => {
    assert(Array.isArray(row) && row.length === 6 && row.every(Number.isInteger), 'Invalid map-cell record.');
    const [tileRow, tileColumn, band, column, countryIndex, prefectureIndex] = row;
    assert(tileRow >= 0 && tileRow < resolution && tileColumn >= 0 && tileColumn < resolution, 'Invalid tile coordinates.');
    assert(countryIndex > 0 && countryIndex < data.countryIds.length && prefectureIndex >= 0 && prefectureIndex < data.prefectureIds.length, 'Invalid tile ownership.');
    const countryId = data.countryIds[countryIndex], prefectureId = prefectureIndex ? data.prefectureIds[prefectureIndex] : null;
    assert(!prefectureId || countryId === JAPAN_COUNTRY_ID, 'Invalid prefecture country.');
    const cell = getCell(band, column, DEFAULT_GRID), key = tileRow * resolution + tileColumn;
    assert(Math.abs(cell.center.latitude) <= MERCATOR_MAX_LATITUDE && tileKey(cell.center.longitude, cell.center.latitude, resolution) === key, 'Representative must be inside its display tile.');
    assert(!byTile.has(key) && !canonicalIds.has(cell.id), 'Duplicate map cell.');
    const northMercator = Math.PI - tileRow / resolution * TAU, southMercator = Math.PI - (tileRow + 1) / resolution * TAU;
    const bounds = Object.freeze({ west: -180 + tileColumn / resolution * 360, east: -180 + (tileColumn + 1) / resolution * 360, north: inverseMercatorY(northMercator), south: inverseMercatorY(southMercator) });
    const record = Object.freeze({ index: offset + 1, displayCellId: `map:${MAP_CELL_VERSION}:${resolution}:${tileRow}:${tileColumn}`, row: tileRow, column: tileColumn, bounds, center: cell.center, cell, countryIndex, prefectureIndex, countryId, prefectureId, countryLabel: data.countryLabels?.[countryIndex] || countryId, prefectureLabel: prefectureId ? data.prefectureLabels?.[prefectureIndex] || prefectureId : null, regionId: prefectureId ? getRegionForPrefecture(prefectureId)?.id || null : null, northMercator, southMercator });
    byTile.set(key, record); canonicalIds.add(cell.id); countries.add(countryId); if (prefectureId) prefectures.add(prefectureId);
    return record;
  });
  assert(prefectures.size === 47 && data.prefectureIds.slice(1).every(id => prefectures.has(id)), 'All 47 prefectures must remain selectable.');
  assert(data.countryIds.slice(1).every(id => countries.has(id)), 'Every source country must remain selectable.');
  return Object.freeze({ ...data, cells: Object.freeze(cells), byTile });
}
export function lookupMapCell(longitude, latitude, index) {
  if (index?.landMask) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > MERCATOR_MAX_LATITUDE) return null;
    const key = tileKey(longitude, latitude, index.resolution);
    if (!index.landMask[key]) return null;
    return fineTileRecord(key, index);
  }
  if (!(index?.byTile instanceof Map)) throw new TypeError('A map-cell index is required.');
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > MERCATOR_MAX_LATITUDE) return null;
  return index.byTile.get(tileKey(longitude, latitude, index.resolution)) || null;
}



function decodePrefectureData(data, source, resolution) {
  assert(data?.version === 'map-prefectures-v1' && data.projection === 'mercator' && data.geometryVersion === DEFAULT_GRID.version, 'Unsupported prefecture mask.');
  assert(data.resolution === resolution && Array.isArray(data.prefectureIds) && data.prefectureIds.length === source.prefectureIds.length && data.prefectureIds.every((id, i) => id === source.prefectureIds[i]), 'Prefecture mask resolution or IDs do not match.');
  assert(Array.isArray(data.prefectureLabels) && data.prefectureLabels.length === data.prefectureIds.length && Array.isArray(data.rowRuns) && Array.isArray(data.features) && data.bounds?.length === 4 && data.bounds.every(Number.isFinite) && data.bounds[0] < data.bounds[2] && data.bounds[1] < data.bounds[3], 'Invalid prefecture mask payload.')
  assert(checksum(resolution, [data.prefectureIds, data.prefectureLabels, data.rowRuns, data.features, data.bounds]) === data.checksum, 'Prefecture mask checksum does not match.');
  const mask = new Uint8Array(resolution * resolution); let previous = -1, previousRow = -1, previousOwner = -1;
  for (const run of data.rowRuns) {
    assert(Array.isArray(run) && run.length === 4 && run.every(Number.isInteger), 'Invalid prefecture mask run.');
    const [row, start, length, owner] = run, key = row * resolution + start;
    assert(row >= 0 && row < resolution && start >= 0 && length > 0 && start + length <= resolution && owner > 0 && owner < data.prefectureIds.length && key > previous && !(row === previousRow && key === previous + 1 && owner === previousOwner), 'Invalid or overlapping prefecture mask run.');
    mask.fill(owner, key, key + length); previous = key + length - 1; previousRow = row; previousOwner = owner;
  }
  const membershipIndex = createMembershipIndex({ type: 'FeatureCollection', features: data.features }, { idProperty: 'code' });
  const ids = new Set(membershipIndex.features.map((feature) => feature.id));
  assert(membershipIndex.features.length === 47 && ids.size === 47 && data.prefectureIds.slice(1).every((id) => ids.has(id)), 'Prefecture membership geometry must cover all 47 prefectures exactly once.');
  const featureBounds = membershipIndex.features.map((feature) => {
    const coordinates = [];
    const visit = (value) => { if (Array.isArray(value) && typeof value[0] === 'number') coordinates.push(value); else if (Array.isArray(value)) for (const child of value) visit(child); };
    visit(feature.geometry.coordinates);
    return { feature, bounds: [Math.min(...coordinates.map(([x]) => x)), Math.min(...coordinates.map(([, y]) => y)), Math.max(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([, y]) => y))] };
  });
  const featureBins = new Map();
  for (const entry of featureBounds) { const [west, south, east, north] = entry.bounds; for (let x = Math.floor(west / 5); x <= Math.floor(east / 5); x++) for (let y = Math.floor(south / 5); y <= Math.floor(north / 5); y++) { const key = `${x}:${y}`; if (!featureBins.has(key)) featureBins.set(key, []); featureBins.get(key).push(entry.feature); } }
  return Object.freeze({ mask, membershipIndex, featureBins, bounds: Object.freeze([...data.bounds]) });
}

function decodeAdmin1Data(data, source, resolution) {
  assert(data?.version === 'map-admin1-v1' && data.projection === 'mercator' && data.geometryVersion === DEFAULT_GRID.version, 'Unsupported admin1 mask.');
  assert(data.resolution === resolution && Array.isArray(data.countryIds)
    && data.countryIds.length === source.countryIds.length
    && data.countryIds.every((id, i) => id === source.countryIds[i]), 'Admin1 mask resolution or country IDs do not match.');
  assert(Array.isArray(data.mapRegions) && data.mapRegions[0] === null
    && data.regionCount === data.mapRegions.length - 1
    && data.mapRegions.length <= 65536
    && Array.isArray(data.rowRuns) && Array.isArray(data.features)
    && Array.isArray(data.countryCounts), 'Invalid admin1 mask payload.');
  assert(data.landAuthority === undefined || data.landAuthority === 'admin1-geometries', 'Unsupported admin1 land authority.');
  const checksumRows = [data.mapRegions, data.rowRuns, data.features, data.countryCounts];
  if (data.landAuthority !== undefined) checksumRows.push(data.landAuthority);
  assert(checksum(resolution, checksumRows) === data.checksum, 'Admin1 mask checksum does not match.');
  assert(data.mapRegions.slice(1, 48).every((region, i) => region?.id === `prefecture:${source.prefectureIds[i + 1]}`
    && region.countryId === JAPAN_COUNTRY_ID && region.kind === 'prefecture'), 'Admin1 region table must retain all Japanese prefectures at indices 1-47.');
  const regionIds = new Set();
  for (const region of data.mapRegions.slice(1)) {
    assert(region && typeof region.id === 'string' && region.id && typeof region.label === 'string'
      && source.countryIds.includes(region.countryId)
      && ['prefecture', 'admin1', 'country'].includes(region.kind), 'Invalid admin1 region metadata.');
    assert(!regionIds.has(region.id), 'Duplicate admin1 region ID.');
    regionIds.add(region.id);
  }
  const mask = new Uint16Array(resolution * resolution);
  let previous = -1, previousRow = -1, previousOwner = -1;
  for (const run of data.rowRuns) {
    assert(Array.isArray(run) && run.length === 4 && run.every(Number.isInteger), 'Invalid admin1 mask run.');
    const [row, start, length, owner] = run;
    const key = row * resolution + start;
    assert(row >= 0 && row < resolution && start >= 0 && length > 0 && start + length <= resolution
      && owner > 0 && owner < data.mapRegions.length && key > previous
      && !(row === previousRow && key === previous + 1 && owner === previousOwner), 'Invalid or overlapping admin1 mask run.');
    mask.fill(owner, key, key + length);
    previous = key + length - 1;
    previousRow = row;
    previousOwner = owner;
  }
  const featureIds = new Set();
  const features = data.features.map((feature) => {
    const regionIndex = feature?.properties?.regionIndex;
    const region = data.mapRegions[regionIndex];
    assert(feature?.type === 'Feature' && region && feature.properties.id === region.id
      && feature.properties.countryId === region.countryId && region.kind === 'admin1'
      && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
      && Array.isArray(feature.bounds) && feature.bounds.length === 4 && feature.bounds.every(Number.isFinite), 'Invalid admin1 feature record.');
    assert(!featureIds.has(region.id), 'Duplicate admin1 feature geometry.');
    featureIds.add(region.id);
    return { id: region.id, properties: feature.properties, geometry: feature.geometry, bounds: feature.bounds };
  });
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const featureBins = new Map();
  for (const feature of features) {
    const [west, south, east, north] = feature.bounds;
    for (let x = Math.floor(west / 4); x <= Math.floor(east / 4); x++) {
      for (let y = Math.floor(south / 4); y <= Math.floor(north / 4); y++) {
        const key = `${x}:${y}`;
        if (!featureBins.has(key)) featureBins.set(key, []);
        featureBins.get(key).push(feature);
      }
    }
  }
  return Object.freeze({ mask, mapRegions: data.mapRegions, features, featureById, featureBins, countryCounts: data.countryCounts, landAuthority: data.landAuthority });
}

/** Exact-to-simplified-GeoJSON location ownership; sea remains null and foreign land uses the normal map lookup. */
export function resolveMapLocation(longitude, latitude, index) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > MERCATOR_MAX_LATITUDE) return null;
  longitude = normalizeLongitude(longitude);
  const displayCell = lookupMapCell(longitude, latitude, index);
  const patch = index?.prefectureData;
  if (patch) {
    const [west, south, east, north] = patch.bounds;
    if (longitude >= west && longitude <= east && latitude >= south && latitude <= north) {
      const features = patch.featureBins.get(`${Math.floor(longitude / 5)}:${Math.floor(latitude / 5)}`) || [];
      const match = features.length ? findExplicitMembership({ features }, longitude, latitude) : null;
      if (match) {
        const cell = lookupCell(longitude, latitude, DEFAULT_GRID);
        const countryIndex = index.countryIds.indexOf(JAPAN_COUNTRY_ID), prefectureIndex = index.prefectureIds.indexOf(match.id);
        const mapRegionIndex = prefectureIndex, mapRegion = index.mapRegions?.[mapRegionIndex];
        return Object.freeze({ ...(displayCell || {}), cell, center: displayCell?.center || cell.center, countryId: JAPAN_COUNTRY_ID, countryIndex, countryLabel: index.countryLabels[countryIndex], prefectureId: match.id, prefectureIndex, prefectureLabel: index.prefectureLabels[prefectureIndex], regionId: getRegionForPrefecture(match.id)?.id || null, mapRegionId: mapRegion?.id || `prefecture:${match.id}`, mapRegionIndex, mapRegionLabel: mapRegion?.label || index.prefectureLabels[prefectureIndex], mapRegionKind: 'prefecture' });
      }
      if (displayCell?.countryId === JAPAN_COUNTRY_ID) return null;
    }
  }
  const admin1 = index?.admin1Data;
  if (admin1) {
    const candidates = admin1.featureBins.get(`${Math.floor(longitude / 4)}:${Math.floor(latitude / 4)}`) || [];
    const matches = candidates.length ? findExplicitMembership({ features: candidates }, longitude, latitude) : null;
    const match = matches && matches.properties.countryId !== JAPAN_COUNTRY_ID ? matches : null;
    if (match) {
      const regionIndex = match.properties.regionIndex, region = index.mapRegions[regionIndex];
      const countryIndex = index.countryIds.indexOf(region.countryId), cell = lookupCell(longitude, latitude, DEFAULT_GRID);
      return Object.freeze({ ...(displayCell || {}), cell, center: displayCell?.center || cell.center, countryId: region.countryId, countryIndex, countryLabel: region.countryLabel, prefectureId: null, prefectureIndex: 0, prefectureLabel: null, regionId: null, mapRegionId: region.id, mapRegionIndex: regionIndex, mapRegionLabel: region.label, mapRegionKind: region.kind });
    }
  }
  return displayCell || null;
}

/** Dense pixels stay in typed arrays; only clicked cells become JS records. */
export function createFineMapCellIndex(source, { resolution = FINE_MAP_RESOLUTION, prefectureData = null, admin1Data = null } = {}) {
  const total = DEFAULT_GRID.bands.reduce((sum, band) => sum + band.longitudeCount, 0);
  assert(source?.version === 'globe-land-mask-v1' && source.geometryVersion === DEFAULT_GRID.version && source.cellCount === total, 'Fine map source must match canonical geometry.');
  assert(Number.isInteger(resolution) && resolution >= 2 && resolution <= 4096, 'Invalid fine map resolution.');
  requiredOwners(source.countryIds, source.prefectureIds);
  const countryBytes = bytes(source.countryIndices), prefectureIndices = bytes(source.prefectureIndices);
  assert(countryBytes.length === total * 2 && prefectureIndices.length === total, 'Invalid fine map raster length.');
  const countryIndices = new Uint16Array(total);
  for (let i = 0; i < total; i++) countryIndices[i] = countryBytes[i * 2] | countryBytes[i * 2 + 1] << 8;
  const bandOffsets = [], owners = new Map(); let offset = 0;
  const japanIndex = source.countryIds.indexOf(JAPAN_COUNTRY_ID);
  const patch = prefectureData ? decodePrefectureData(prefectureData, source, resolution) : null;
  const admin1Patch = admin1Data ? decodeAdmin1Data(admin1Data, source, resolution) : null;
  for (const band of DEFAULT_GRID.bands) { bandOffsets.push(offset); offset += band.longitudeCount; }
  const landMask = new Uint8Array(resolution * resolution);
  const prefectureMask = new Uint8Array(resolution * resolution);
  const mapRegionMask = new Uint16Array(resolution * resolution);
  const prefectureTileLists = new Map(source.prefectureIds.slice(1).map((id) => [id, []]));
  const mapRegions = admin1Patch ? [...admin1Patch.mapRegions] : [null, ...source.prefectureIds.slice(1).map((id, i) => ({ id: `prefecture:${id}`, label: source.prefectureLabels[i + 1], countryId: JAPAN_COUNTRY_ID, countryLabel: source.countryLabels[japanIndex], kind: 'prefecture' }))];
  const regionIndices = new Map(mapRegions.slice(1).map((region, i) => [region.id, i + 1]));
  const countryFallbackIndices = new Uint16Array(source.countryIds.length);
  for (let country = 1; country < source.countryIds.length; country++) {
    if (country === japanIndex) continue;
    const countryId = source.countryIds[country], id = `country:${countryId}`;
    let index = regionIndices.get(id);
    if (!index) {
      index = mapRegions.length;
      mapRegions.push({ id, label: source.countryLabels[country], countryId, countryLabel: source.countryLabels[country], kind: 'country' });
      regionIndices.set(id, index);
    }
    countryFallbackIndices[country] = index;
  }
  assert(mapRegions.length <= 65536, 'Map region count exceeds Uint16 mask capacity.');
  const geometryAuthority = admin1Patch?.landAuthority === 'admin1-geometries';
  const countryIndexById = new Map(source.countryIds.map((id, i) => [id, i]));
  const regionCountries = Uint16Array.from(mapRegions, region => region ? countryIndexById.get(region.countryId) : 0);
  const regionTileLists = new Map(mapRegions.slice(1).map((region) => [region.id, []]));
  const seenCountries = new Set(), seenPrefectures = new Set(); let cellCount = 0;
  for (let row = 0; row < resolution; row++) {
    const latitude = inverseMercatorY(Math.PI - (row + .5) / resolution * TAU);
    const band = Math.min(DEFAULT_GRID.bandCount - 1, Math.floor((90 - latitude) / DEFAULT_GRID.latitudeStepDegrees));
    const columns = DEFAULT_GRID.bands[band].longitudeCount;
    for (let column = 0; column < resolution; column++) {
      const sourceOffset = bandOffsets[band] + Math.min(columns - 1, Math.floor((column + .5) / resolution * columns));
      let country = countryIndices[sourceOffset], prefecture = prefectureIndices[sourceOffset];
      assert(country < source.countryIds.length && prefecture < source.prefectureIds.length, 'Invalid fine map ownership index.');
      const key = row * resolution + column;
      if (patch) {
        prefecture = patch.mask[key];
        if (prefecture) country = japanIndex;
        else if (country === japanIndex) country = 0;
      }
      let mapRegionIndex = 0;
      if (geometryAuthority) {
        // The same geometry controls land, country and administrative ownership.
        // The independent Japanese prefecture patch takes precedence where present.
        mapRegionIndex = patch && prefecture ? prefecture : admin1Patch.mask[key];
        country = regionCountries[mapRegionIndex];
        prefecture = country === japanIndex && mapRegionIndex <= 47 ? mapRegionIndex : 0;
        if (patch && country === japanIndex && !patch.mask[key]) { country = 0; prefecture = 0; mapRegionIndex = 0; }
      } else {
        if (admin1Patch?.mask[key]) assert(country > 0, 'Admin1 ownership cannot expand land into water.');
        if (admin1Patch) {
          mapRegionIndex = prefecture || admin1Patch.mask[key] || countryFallbackIndices[country];
          if (mapRegionIndex) assert(mapRegions[mapRegionIndex]?.countryId === source.countryIds[country], 'Admin1 tile ownership must match its source country.');
        } else mapRegionIndex = prefecture || countryFallbackIndices[country];
      }
      if (!country) continue;
      assert(!prefecture || source.countryIds[country] === JAPAN_COUNTRY_ID, 'Invalid fine map prefecture ownership.');
      landMask[key] = 1; cellCount++;
      prefectureMask[key] = prefecture;
      mapRegionMask[key] = mapRegionIndex;
      seenCountries.add(country); if (prefecture) { seenPrefectures.add(prefecture); prefectureTileLists.get(source.prefectureIds[prefecture])?.push(key); }
      if (mapRegionIndex) regionTileLists.get(mapRegions[mapRegionIndex]?.id)?.push(key);
      const owner = ownerKey(country, prefecture); if (!owners.has(owner)) owners.set(owner, key);
    }
  }
  assert(source.countryIds.slice(1).every((id, i) => seenCountries.has(i + 1)) && seenPrefectures.size === 47, 'Fine map must preserve every country and all 47 prefectures.');
  const prefectureTiles = new Map([...prefectureTileLists].map(([id, keys]) => [id, Uint32Array.from(keys)]));
  const mapRegionTiles = new Map([...regionTileLists].map(([id, keys]) => [id, Uint32Array.from(keys)]));
  const index = { version: 'map-grid-fine-v1', geometryVersion: DEFAULT_GRID.version, projection: 'mercator', resolution, worldCellCount: resolution ** 2, cellCount, sourceCellCount: total, sourceLandCellCount: countryIndices.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0), countryIds: source.countryIds, countryLabels: source.countryLabels, prefectureIds: source.prefectureIds, prefectureLabels: source.prefectureLabels, landMask, countryIndices, prefectureIndices, prefectureMask, prefectureTiles, mapRegionMask, mapRegions, mapRegionTiles, bandOffsets, prefectureData: patch, admin1Data: admin1Patch, recordCache: new Map() };
  // Diagnostic representatives only: the complete map remains a compact bitmap.
  index.cells = Object.freeze([...owners.values()].map(key => fineTileRecord(key, index)));
  return Object.freeze(index);
}
function fineTileRecord(key, index) {
  const cached = index.recordCache.get(key); if (cached) return cached;
  const row = Math.floor(key / index.resolution), column = key % index.resolution;
  const northMercator = Math.PI - row / index.resolution * TAU, southMercator = Math.PI - (row + 1) / index.resolution * TAU;
  const bounds = Object.freeze({ west: -180 + column / index.resolution * 360, east: -180 + (column + 1) / index.resolution * 360, north: inverseMercatorY(northMercator), south: inverseMercatorY(southMercator) });
  const center = Object.freeze({ longitude: (bounds.west + bounds.east) / 2, latitude: inverseMercatorY((northMercator + southMercator) / 2) });
  const cell = lookupCell(center.longitude, center.latitude), offset = index.bandOffsets[cell.band] + cell.column;
  const mapRegionIndex = index.mapRegionMask?.[key] || 0;
  const mapRegion = index.mapRegions?.[mapRegionIndex] || null;
  const geometryAuthority = index.admin1Data?.landAuthority === 'admin1-geometries';
  const countryIndex = geometryAuthority ? index.countryIds.indexOf(mapRegion.countryId) : index.prefectureData && index.prefectureMask[key] ? index.countryIds.indexOf(JAPAN_COUNTRY_ID) : index.countryIndices[offset];
  const prefectureIndex = index.prefectureData || geometryAuthority ? index.prefectureMask[key] : index.prefectureIndices[offset];
  const countryId = index.countryIds[countryIndex], prefectureId = prefectureIndex ? index.prefectureIds[prefectureIndex] : null;
  const record = Object.freeze({ index: key + 1, displayCellId: `map:${index.version}:${index.resolution}:${row}:${column}`, row, column, bounds, center, cell, countryIndex, prefectureIndex, countryId, prefectureId, countryLabel: index.countryLabels?.[countryIndex] || countryId, prefectureLabel: prefectureId ? index.prefectureLabels?.[prefectureIndex] || prefectureId : null, regionId: prefectureId ? getRegionForPrefecture(prefectureId)?.id || null : null, mapRegionId: mapRegion?.id || null, mapRegionIndex, mapRegionLabel: mapRegion?.label || null, mapRegionKind: mapRegion?.kind || null, northMercator, southMercator });
  index.recordCache.set(key, record);
  if (index.recordCache.size > 1024) index.recordCache.delete(index.recordCache.keys().next().value);
  return record;
}
