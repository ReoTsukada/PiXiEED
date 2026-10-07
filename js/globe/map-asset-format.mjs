const MASK_CHECKSUM_EXCLUDED = new Set(['checksum', 'geometryChecksum', 'legacyChecksum']);

function hash(value) {
  // The split generator preserves source field order; top-level payload keys are sorted.
  // Native serialization avoids recursively allocating a string for every coordinate.
  const text = JSON.stringify(value);
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return `fnv1a32-${(result >>> 0).toString(16).padStart(8, '0')}`;
}

function legacyChecksum(data, kind, features = data?.features) {
  if (kind === 'admin1') {
    const rows = [data.mapRegions, data.rowRuns, features, data.countryCounts];
    if (data.landAuthority !== undefined) rows.push(data.landAuthority);
    return hashLegacy(data.resolution, rows);
  }
  return hashLegacy(data.resolution, [data.prefectureIds, data.prefectureLabels, data.rowRuns, features, data.bounds, data.unselectableFeatures]);
}

function hashLegacy(resolution, rows) {
  const text = JSON.stringify([resolution, rows]);
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return `fnv1a32-${(result >>> 0).toString(16).padStart(8, '0')}`;
}

function shape(kind) {
  if (kind === 'admin1') return {
    oldVersion: 'map-admin1-v1', maskVersion: 'map-admin1-mask-v2', geometryVersion: 'map-admin1-geometry-v2',
    requiredMask: ['mapRegions', 'rowRuns', 'countryIds', 'countryLabels', 'countryCounts', 'regionCount'],
  };
  if (kind === 'prefectures') return {
    oldVersion: 'map-prefectures-v1', maskVersion: 'map-prefectures-mask-v2', geometryVersion: 'map-prefectures-geometry-v2',
    requiredMask: ['prefectureIds', 'prefectureLabels', 'bounds', 'rowRuns', 'unselectableFeatures'],
  };
  throw new TypeError(`Unknown map asset kind: ${kind}`);
}

function checksumPayload(value, omitted) {
  const payload = {};
  for (const key of Object.keys(value).sort()) if (!omitted.has(key)) payload[key] = value[key];
  return payload;
}

function split(full, kind) {
  const spec = shape(kind);
  if (!full || full.version !== spec.oldVersion || !Array.isArray(full.features)) throw new TypeError(`Expected ${spec.oldVersion} full asset.`);
  for (const key of spec.requiredMask) if (!(key in full)) throw new TypeError(`Missing ${kind} source field: ${key}`);
  const expectedLegacy = legacyChecksum(full, kind);
  if (full.checksum !== expectedLegacy) throw new RangeError(`Original ${kind} asset checksum does not match.`);
  const mask = {};
  for (const [key, value] of Object.entries(full)) if (key !== 'version' && key !== 'features' && key !== 'checksum') mask[key] = value;
  mask.version = spec.maskVersion;
  mask.legacyChecksum = full.checksum;

  const geometry = {
    version: spec.geometryVersion,
    projection: full.projection,
    geometryVersion: full.geometryVersion,
    resolution: full.resolution,
    features: full.features,
    maskChecksum: '',
  };
  mask.checksum = hash(checksumPayload(mask, MASK_CHECKSUM_EXCLUDED));
  geometry.maskChecksum = mask.checksum;
  geometry.checksum = hash(checksumPayload(geometry, new Set(['checksum'])));
  mask.geometryChecksum = geometry.checksum;

  validateMapMaskAsset(mask, kind);
  validateMapGeometryAsset(geometry, mask);
  return { mask, geometry };
}

function legacyPayload(mask, geometry, kind) {
  const spec = shape(kind);
  const hydrated = {};
  for (const [key, value] of Object.entries(mask)) if (!['version', 'checksum', 'geometryChecksum', 'legacyChecksum'].includes(key)) hydrated[key] = value;
  hydrated.version = spec.oldVersion;
  hydrated.features = geometry.features;
  return hydrated;
}

export function splitMapAdmin1Asset(full) { return split(full, 'admin1'); }
export function splitMapPrefectureAsset(full) { return split(full, 'prefectures'); }

export function validateMapMaskAsset(mask, kind = 'admin1') {
  const spec = shape(kind);
  if (!mask || mask.version !== spec.maskVersion || mask.projection !== 'mercator'
    || typeof mask.geometryVersion !== 'string' || !Number.isInteger(mask.resolution) || mask.resolution < 2
    || !/^fnv1a32-[0-9a-f]{8}$/.test(mask.checksum || '')
    || !/^fnv1a32-[0-9a-f]{8}$/.test(mask.geometryChecksum || '')
    || !/^fnv1a32-[0-9a-f]{8}$/.test(mask.legacyChecksum || '')) throw new TypeError(`Invalid ${kind} mask asset.`);
  for (const key of spec.requiredMask) if (!(key in mask)) throw new TypeError(`Missing ${kind} mask field: ${key}`);
  if (kind === 'admin1') {
    if (!Array.isArray(mask.mapRegions) || mask.mapRegions[0] !== null || mask.regionCount !== mask.mapRegions.length - 1
      || !Array.isArray(mask.countryIds) || !Array.isArray(mask.countryLabels) || mask.countryIds.length !== mask.countryLabels.length
      || !Array.isArray(mask.rowRuns) || !Array.isArray(mask.countryCounts)) throw new TypeError('Invalid admin1 mask metadata.');
  } else if (!Array.isArray(mask.prefectureIds) || !Array.isArray(mask.prefectureLabels)
    || mask.prefectureIds.length !== mask.prefectureLabels.length || mask.prefectureIds.length !== 48
    || !Array.isArray(mask.rowRuns) || !Array.isArray(mask.unselectableFeatures)
    || !Array.isArray(mask.bounds) || mask.bounds.length !== 4 || mask.bounds.some(value => !Number.isFinite(value))) {
    throw new TypeError('Invalid prefecture mask metadata.');
  }
  if (hash(checksumPayload(mask, MASK_CHECKSUM_EXCLUDED)) !== mask.checksum) throw new RangeError(`${kind} mask checksum does not match.`);
  return true;
}

function validateGeometryMetadata(geometry, mask) {
  const kind = mask?.version === 'map-admin1-mask-v2' ? 'admin1' : mask?.version === 'map-prefectures-mask-v2' ? 'prefectures' : null;
  if (!kind) throw new TypeError('A supported map mask asset is required.');
  validateMapMaskAsset(mask, kind);
  const spec = shape(kind);
  if (!geometry || geometry.version !== spec.geometryVersion || geometry.projection !== mask.projection
    || geometry.geometryVersion !== mask.geometryVersion || geometry.resolution !== mask.resolution
    || !Array.isArray(geometry.features) || geometry.maskChecksum !== mask.checksum
    || geometry.checksum !== mask.geometryChecksum) throw new RangeError(`Mismatched ${kind} geometry asset.`);

  if (kind === 'admin1') {
    const ids = new Set();
    for (const feature of geometry.features) {
      const regionIndex = feature?.properties?.regionIndex;
      const region = mask.mapRegions[regionIndex];
      if (feature?.type !== 'Feature' || !region || feature.properties.id !== region.id
        || feature.properties.countryId !== region.countryId || region.kind !== 'admin1'
        || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
        || !Array.isArray(feature.bounds) || feature.bounds.length !== 4 || feature.bounds.some(value => !Number.isFinite(value))
        || ids.has(region.id)) throw new TypeError('Invalid or duplicate admin1 geometry feature.');
      ids.add(region.id);
    }
    const requiredIds = mask.mapRegions.slice(1).filter(region => region?.kind === 'admin1').map(region => region.id);
    if (ids.size !== requiredIds.length || requiredIds.some(id => !ids.has(id))) throw new TypeError('Admin1 geometry IDs do not match its mask.');
  } else {
    if (geometry.features.length !== mask.prefectureIds.length - 1) throw new TypeError('Prefecture geometry count does not match its mask.');
    const ids = new Set();
    for (const feature of geometry.features) {
      const id = feature?.properties?.code;
      if (feature?.type !== 'Feature' || typeof id !== 'string' || !mask.prefectureIds.includes(id)
        || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) || ids.has(id)) throw new TypeError('Invalid or duplicate prefecture geometry feature.');
      ids.add(id);
    }
    if (mask.prefectureIds.slice(1).some(id => !ids.has(id))) throw new TypeError('Prefecture geometry IDs do not match its mask.');
  }
  return kind;
}

export function validateMapGeometryAsset(geometry, mask) {
  const kind = validateGeometryMetadata(geometry, mask);
  if (hash(checksumPayload(geometry, new Set(['checksum']))) !== geometry.checksum) throw new RangeError(`Mismatched ${kind} geometry asset.`);
  if (legacyChecksum(legacyPayload(mask, geometry, kind), kind) !== mask.legacyChecksum) throw new RangeError(`Legacy ${kind} checksum does not match the preserved features.`);
  return true;
}

export const yieldMapGeometry = () => new Promise(resolve => setTimeout(resolve, 0));

async function hashTextAsync(text, yieldControl) {
  let result = 2166136261;
  for (let start = 0; start < text.length; start += 262144) {
    const end = Math.min(start + 262144, text.length);
    for (let i = start; i < end; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
    await yieldControl();
  }
  return `fnv1a32-${(result >>> 0).toString(16).padStart(8, '0')}`;
}

/** Same checks as the sync path, yielding between bounded checksum chunks. */
export async function hydrateMapMaskAssetAsync(mask, geometry, { yieldControl = yieldMapGeometry } = {}) {
  await yieldControl();
  const kind = validateGeometryMetadata(geometry, mask);
  const geometryHash = await hashTextAsync(JSON.stringify(checksumPayload(geometry, new Set(['checksum']))), yieldControl);
  if (geometryHash !== geometry.checksum) throw new RangeError(`Mismatched ${kind} geometry asset.`);
  const hydrated = legacyPayload(mask, geometry, kind);
  const rows = kind === 'admin1' ? [hydrated.mapRegions, hydrated.rowRuns, hydrated.features, hydrated.countryCounts] : [hydrated.prefectureIds, hydrated.prefectureLabels, hydrated.rowRuns, hydrated.features, hydrated.bounds, hydrated.unselectableFeatures];
  if (kind === 'admin1' && hydrated.landAuthority !== undefined) rows.push(hydrated.landAuthority);
  if (await hashTextAsync(JSON.stringify([hydrated.resolution, rows]), yieldControl) !== mask.legacyChecksum) throw new RangeError(`Legacy ${kind} checksum does not match the preserved features.`);
  return { ...hydrated, checksum: mask.legacyChecksum };
}

export function hydrateMapMaskAsset(mask, geometry) {
  const kind = mask?.version === 'map-admin1-mask-v2' ? 'admin1' : mask?.version === 'map-prefectures-mask-v2' ? 'prefectures' : null;
  if (!kind) throw new TypeError('A supported map mask asset is required.');
  validateMapGeometryAsset(geometry, mask);
  const hydrated = {};
  for (const [key, value] of Object.entries(mask)) if (!['version', 'checksum', 'geometryChecksum', 'legacyChecksum'].includes(key)) hydrated[key] = value;
  hydrated.version = shape(kind).oldVersion;
  hydrated.features = geometry.features;
  hydrated.checksum = mask.legacyChecksum;
  return hydrated;
}
