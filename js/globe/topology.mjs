/**
 * Dependency-free explicit GeoJSON membership and shared latitude-boundary
 * topology for the globe.
 *
 * Membership is intentionally adapter-driven: callers must name the feature
 * property that contains the stable region/country/prefecture id.  Geometry
 * proximity or nearest-feature inference is not part of this module.
 */

export const GLOBE_TOPOLOGY_VERSION = 'v1';

const LONGITUDE_EPSILON = 1e-10;
const SEGMENT_EPSILON = 1e-10;
const LATITUDE_EPSILON = 1e-12;

function assertFiniteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number.`);
  return number;
}

function normalizeLongitude(longitude) {
  const value = assertFiniteNumber(longitude, 'longitude');
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function assertLatitude(latitude) {
  const value = assertFiniteNumber(latitude, 'latitude');
  if (value < -90 || value > 90) throw new RangeError('latitude must be between -90 and 90.');
  return value;
}

function freezeArray(items) {
  return Object.freeze(items);
}

function freezeCoordinate(coordinate) {
  return Object.freeze([coordinate[0], coordinate[1]]);
}

function readCoordinate(coordinate, name) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    throw new TypeError(`${name} must be a [longitude, latitude] coordinate.`);
  }
  return freezeCoordinate([
    normalizeLongitude(coordinate[0]),
    assertLatitude(coordinate[1])
  ]);
}

function readRing(ring, name) {
  if (!Array.isArray(ring) || ring.length < 3) throw new TypeError(`${name} must contain at least three coordinates.`);
  const coordinates = ring.map((coordinate, index) => readCoordinate(coordinate, `${name}[${index}]`));
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (Math.abs(first[0] - last[0]) > LONGITUDE_EPSILON || Math.abs(first[1] - last[1]) > LATITUDE_EPSILON) {
    coordinates.push(first);
  }
  return freezeArray(coordinates);
}

function readPolygonCoordinates(coordinates, name) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new TypeError(`${name} must contain rings.`);
  return freezeArray(coordinates.map((ring, index) => readRing(ring, `${name}[${index}]`)));
}

function normalizeGeometry(geometry, name = 'geometry') {
  if (!geometry || typeof geometry !== 'object') throw new TypeError(`${name} is required.`);
  if (geometry.type === 'Polygon') {
    return Object.freeze({
      type: 'Polygon',
      coordinates: readPolygonCoordinates(geometry.coordinates, `${name}.coordinates`)
    });
  }
  if (geometry.type === 'MultiPolygon') {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new TypeError(`${name}.coordinates must contain polygons.`);
    }
    return Object.freeze({
      type: 'MultiPolygon',
      coordinates: freezeArray(geometry.coordinates.map((polygon, index) => (
        readPolygonCoordinates(polygon, `${name}.coordinates[${index}]`)
      )))
    });
  }
  throw new TypeError(`${name}.type must be Polygon or MultiPolygon.`);
}

function readFeatures(source) {
  if (!source || typeof source !== 'object') throw new TypeError('A GeoJSON Feature, FeatureCollection, or feature array is required.');
  if (Array.isArray(source)) return source;
  if (source.type === 'FeatureCollection') return source.features;
  if (source.type === 'Feature') return [source];
  throw new TypeError('Membership source must be a GeoJSON Feature, FeatureCollection, or feature array.');
}

function getExplicitId(feature, idProperty, index) {
  if (!feature || feature.type !== 'Feature') throw new TypeError(`features[${index}] must be a GeoJSON Feature.`);
  if (typeof idProperty === 'function') {
    const value = idProperty(feature);
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new TypeError(`features[${index}] has no explicit membership id.`);
    }
    return String(value).trim();
  }
  if (typeof idProperty !== 'string' || idProperty.trim() === '') {
    throw new TypeError('idProperty must be a non-empty property name or an explicit accessor function.');
  }
  const value = feature.properties?.[idProperty];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`features[${index}].properties.${idProperty} must contain an explicit membership id.`);
  }
  return String(value).trim();
}

function compareRecords(a, b) {
  return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.sourceIndex - b.sourceIndex;
}

/**
 * Normalize explicit Polygon/MultiPolygon membership records.
 *
 * `idProperty` is required. It is either the exact feature property name or
 * an accessor supplied by the caller; Feature.id and coordinate proximity are
 * deliberately not fallbacks.
 */
export function normalizeMembershipFeatures(source, { idProperty } = {}) {
  const features = readFeatures(source);
  if (!Array.isArray(features) || features.length === 0) throw new TypeError('Membership source must contain at least one feature.');
  const records = features.map((feature, sourceIndex) => Object.freeze({
    id: getExplicitId(feature, idProperty, sourceIndex),
    sourceIndex,
    geometry: normalizeGeometry(feature.geometry, `features[${sourceIndex}].geometry`),
    properties: Object.freeze({ ...(feature.properties || {}) })
  })).sort(compareRecords);
  return freezeArray(records);
}

/** Create an immutable explicit membership index. */
export function createMembershipIndex(source, options = {}) {
  const records = normalizeMembershipFeatures(source, options);
  return Object.freeze({
    version: GLOBE_TOPOLOGY_VERSION,
    idProperty: typeof options.idProperty === 'string' ? options.idProperty : null,
    features: records
  });
}

function unwrapRing(ring) {
  const unwrapped = [];
  let previous = ring[0][0];
  unwrapped.push([previous, ring[0][1]]);
  for (let index = 1; index < ring.length; index += 1) {
    let longitude = ring[index][0];
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    unwrapped.push([longitude, ring[index][1]]);
    previous = longitude;
  }
  return unwrapped;
}

function alignLongitude(longitude, reference) {
  let aligned = normalizeLongitude(longitude);
  while (aligned - reference > 180) aligned -= 360;
  while (aligned - reference < -180) aligned += 360;
  return aligned;
}

function pointOnSegment(px, py, ax, ay, bx, by) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  const scale = Math.max(1, Math.abs(px), Math.abs(py), Math.abs(ax), Math.abs(ay), Math.abs(bx), Math.abs(by));
  if (Math.abs(cross) > SEGMENT_EPSILON * scale) return false;
  return px >= Math.min(ax, bx) - SEGMENT_EPSILON
    && px <= Math.max(ax, bx) + SEGMENT_EPSILON
    && py >= Math.min(ay, by) - SEGMENT_EPSILON
    && py <= Math.max(ay, by) + SEGMENT_EPSILON;
}

function classifyRing(longitude, latitude, ring) {
  const coordinates = unwrapRing(ring);
  const pointX = alignLongitude(longitude, coordinates[0][0]);
  const pointY = latitude;
  let inside = false;
  for (let index = 0, previousIndex = coordinates.length - 1; index < coordinates.length; previousIndex = index, index += 1) {
    const [currentX, currentY] = coordinates[index];
    const [previousX, previousY] = coordinates[previousIndex];
    if (pointOnSegment(pointX, pointY, previousX, previousY, currentX, currentY)) return 'boundary';
    const crosses = (currentY > pointY) !== (previousY > pointY);
    if (crosses) {
      const intersectionX = previousX + ((pointY - previousY) * (currentX - previousX)) / (currentY - previousY);
      if (intersectionX > pointX) inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

function classifyPolygon(longitude, latitude, polygon) {
  const outer = classifyRing(longitude, latitude, polygon[0]);
  if (outer === 'outside') return 'outside';
  if (outer === 'boundary') return 'boundary';
  for (let index = 1; index < polygon.length; index += 1) {
    const hole = classifyRing(longitude, latitude, polygon[index]);
    if (hole === 'inside' || hole === 'boundary') return 'outside';
  }
  return 'inside';
}

function classifyGeometry(longitude, latitude, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let boundary = false;
  for (const polygon of polygons) {
    const result = classifyPolygon(longitude, latitude, polygon);
    if (result === 'inside') return 'inside';
    if (result === 'boundary') boundary = true;
  }
  return boundary ? 'boundary' : 'outside';
}

/**
 * Classify a point against one normalized Polygon/MultiPolygon.
 * Outer boundaries are included; hole interiors and hole boundaries are out.
 */
export function pointInGeometry(geometry, longitude, latitude) {
  const safeGeometry = normalizeGeometry(geometry);
  const safeLongitude = normalizeLongitude(longitude);
  const safeLatitude = assertLatitude(latitude);
  const result = classifyGeometry(safeLongitude, safeLatitude, safeGeometry);
  return result === 'inside' || result === 'boundary';
}

/**
 * Find explicit membership only. If overlapping features match, the sorted
 * explicit id order is the deterministic tie-breaker. No nearest inference is
 * performed.
 */
export function findExplicitMembership(index, longitude, latitude) {
  if (!index || !Array.isArray(index.features)) throw new TypeError('A membership index is required.');
  const safeLongitude = normalizeLongitude(longitude);
  const safeLatitude = assertLatitude(latitude);
  const matches = [];
  for (const feature of index.features) {
    const result = classifyGeometry(safeLongitude, safeLatitude, feature.geometry);
    if (result === 'inside' || result === 'boundary') matches.push({ feature, boundary: result === 'boundary' });
  }
  if (matches.length === 0) return null;
  const match = matches[0];
  return Object.freeze({
    id: match.feature.id,
    boundary: match.boundary,
    sourceIndex: match.feature.sourceIndex,
    properties: match.feature.properties
  });
}

/** Alias with lookup-oriented naming for callers that already use geometry lookup terminology. */
export const lookupMembership = findExplicitMembership;

function assertLongitudeCount(value, name) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`${name} must be a positive integer.`);
  return count;
}

function canonicalBreakpointId(longitude) {
  const normalized = Math.abs(longitude) < LONGITUDE_EPSILON ? 0 : longitude;
  if (Math.abs(normalized + 180) < LONGITUDE_EPSILON) return 'west-seam';
  if (Math.abs(normalized - 180) < LONGITUDE_EPSILON) return 'east-seam';
  return normalized.toFixed(12).replace(/0+$/, '').replace(/\.$/, '').replace('-', 'm').replace('.', 'p');
}

function makeBandBoundary(count, side, band) {
  const boundaries = [];
  for (let column = 0; column <= count; column += 1) {
    boundaries.push({
      longitude: -180 + (360 * column) / count,
      side,
      band,
      column
    });
  }
  return boundaries;
}

function uniqueSortedBreakpoints(candidates) {
  const sorted = [...candidates].sort((a, b) => (
    a.longitude - b.longitude
    || (a.side < b.side ? -1 : a.side > b.side ? 1 : 0)
    || a.column - b.column
  ));
  const unique = [];
  for (const candidate of sorted) {
    const previous = unique[unique.length - 1];
    if (previous && Math.abs(previous.longitude - candidate.longitude) <= LONGITUDE_EPSILON) continue;
    unique.push(candidate);
  }
  if (unique.length === 0 || Math.abs(unique[0].longitude + 180) > LONGITUDE_EPSILON) {
    unique.unshift({ longitude: -180, side: 'seam', band: null, column: 0 });
  }
  const last = unique[unique.length - 1];
  if (Math.abs(last.longitude - 180) > LONGITUDE_EPSILON) {
    unique.push({ longitude: 180, side: 'seam', band: null, column: 0 });
  } else {
    last.longitude = 180;
  }
  return unique;
}

function makeSharedSide({ side, band, count, breakpoints }) {
  const original = makeBandBoundary(count, side, band);
  const indices = original.map((boundary) => {
    const index = breakpoints.findIndex((point) => Math.abs(point.longitude - boundary.longitude) <= LONGITUDE_EPSILON);
    if (index < 0) throw new Error('Shared boundary failed to retain a source column boundary.');
    return index;
  });
  const columns = [];
  for (let column = 0; column < count; column += 1) {
    const startIndex = indices[column];
    const endIndex = indices[column + 1];
    columns.push(Object.freeze({
      id: `band:${band}:column:${column}`,
      column,
      startIndex,
      endIndex,
      breakpoints: freezeArray(breakpoints.slice(startIndex, endIndex + 1))
    }));
  }
  return Object.freeze({ side, band, longitudeCount: count, columnBoundaryIndices: freezeArray(indices), columns: freezeArray(columns) });
}

/**
 * Build one shared breakpoint list for the two sides of a latitude band
 * boundary. Both side descriptions reference that exact list, so T-junctions
 * use identical point objects and the dateline has one stable west/east pair.
 */
export function createSharedBoundaryTopology({
  boundaryId = 'anonymous',
  latitude = 0,
  northBand,
  southBand,
  northLongitudeCount,
  southLongitudeCount
} = {}) {
  const safeLatitude = assertLatitude(latitude);
  const north = northBand && typeof northBand === 'object'
    ? { band: Number(northBand.band), count: northBand.longitudeCount }
    : { band: Number(northBand), count: northLongitudeCount };
  const south = southBand && typeof southBand === 'object'
    ? { band: Number(southBand.band), count: southBand.longitudeCount }
    : { band: Number(southBand), count: southLongitudeCount };
  if (!Number.isInteger(north.band) || !Number.isInteger(south.band)) throw new TypeError('northBand and southBand must identify integer bands.');
  const northCount = assertLongitudeCount(north.count, 'northLongitudeCount');
  const southCount = assertLongitudeCount(south.count, 'southLongitudeCount');
  const raw = uniqueSortedBreakpoints([
    ...makeBandBoundary(northCount, 'north', north.band),
    ...makeBandBoundary(southCount, 'south', south.band)
  ]);
  const breakpoints = freezeArray(raw.map((candidate, index) => Object.freeze({
    id: `boundary:${String(boundaryId)}:point:${index}:${canonicalBreakpointId(candidate.longitude)}`,
    index,
    longitude: candidate.longitude,
    latitude: safeLatitude
  })));
  const topology = {
    version: GLOBE_TOPOLOGY_VERSION,
    id: `boundary:${String(boundaryId)}`,
    latitude: safeLatitude,
    breakpoints,
    north: null,
    south: null
  };
  topology.north = makeSharedSide({ side: 'north', band: north.band, count: northCount, breakpoints });
  topology.south = makeSharedSide({ side: 'south', band: south.band, count: southCount, breakpoints });
  return Object.freeze(topology);
}
