/**
 * Dependency-free geographic cells and orthographic globe geometry.
 *
 * Cells are bounded by meridians and parallels on the sphere. They are never
 * stretched into screen-space squares: the renderer projects the same four
 * geographic corners that lookupCell() and picking use.
 */

export const GLOBE_GEOMETRY_VERSION = 'v11-meridian-parallel-quarter-degree';
export const DEFAULT_LATITUDE_STEP_DEGREES = 0.25;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const VECTOR_EPSILON = 1e-12;
const VISIBILITY_EPSILON = 1e-10;

export const DEFAULT_GRID = createGlobeGrid();

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
  return number;
}

// Column counts are nested divisors of the equatorial count (halving first, then
// thirds/fifths near the poles), so every meridian that bounds a cell in a coarser
// row is also a boundary in all finer rows. Cells therefore sit on shared longitude
// lines instead of shifting row by row; the price is cells that are up to ~1.4x
// wider or narrower than square just either side of each halving latitude.
function longitudeCountChain(base) {
  const chain = new Set();
  // Thirteen interleaved families (12/24 .. 24/24 of base) keep each size step under ~8%
  // and cells within ~1.04x of square.
  for (const start of Array.from({ length: 13 }, (_, index) => (base * (index + 12)) / 24)) {
    if (!Number.isInteger(start)) continue;
    let count = start;
    for (const factor of [2, 3, 5]) {
      chain.add(count);
      while (count % factor === 0 && count / factor >= 4) { count /= factor; chain.add(count); }
    }
  }
  return [...chain].sort((x, y) => y - x);
}

function compactLongitudeCount(value, base, min = 4) {
  const chain = longitudeCountChain(base).filter((count) => count >= min);
  const target = Math.max(min, value);
  let best = chain[0];
  for (const count of chain) if (Math.abs(Math.log(count / target)) < Math.abs(Math.log(best / target))) best = count;
  return best;
}

/** Create a deterministic adaptive geographic grid. */
export function createGlobeGrid({ version = GLOBE_GEOMETRY_VERSION, latitudeStepDegrees = DEFAULT_LATITUDE_STEP_DEGREES } = {}) {
  const requestedVersion = String(version).trim();
  const step = finite(latitudeStepDegrees, 'latitudeStepDegrees');
  const bandCount = 180 / step;
  if (!requestedVersion || requestedVersion.includes(':')) throw new RangeError('Grid version must be a non-empty string without colon characters.');
  if (step <= 0 || !Number.isInteger(bandCount)) throw new RangeError('latitudeStepDegrees must be positive and divide 180 exactly.');
  const normalizedVersion = Math.abs(step - DEFAULT_LATITUDE_STEP_DEGREES) < 1e-12 ? requestedVersion : `${requestedVersion}-step${String(step).replace('.', 'p')}`;
  const bands = Array.from({ length: bandCount }, (_, band) => {
    const north = 90 - band * step;
    const south = north - step;
    const midLatitude = (north + south) / 2;
    const rawCount = (360 * Math.cos(midLatitude * DEG_TO_RAD)) / step;
    const longitudeCount = compactLongitudeCount(rawCount, Math.round(360 / step), 4);
    return Object.freeze({ band, north, south, midLatitude, latitudeStepDegrees: step, longitudeCount, longitudeStepDegrees: 360 / longitudeCount, polarCap: band === 0 || band === bandCount - 1 });
  });
  return Object.freeze({ version: normalizedVersion, latitudeStepDegrees: step, bandCount, northLatitude: 90, southLatitude: -90, bands: Object.freeze(bands) });
}

function assertGrid(grid) {
  if (!grid || typeof grid !== 'object' || !Number.isInteger(grid.bandCount) || !Array.isArray(grid.bands)) throw new TypeError('A grid created by createGlobeGrid is required.');
  return grid;
}
function assertBand(band, grid) {
  const index = Number(band);
  if (!Number.isInteger(index) || index < 0 || index >= grid.bandCount) throw new RangeError(`Band must be an integer from 0 through ${grid.bandCount - 1}.`);
  return index;
}
function assertColumn(column, longitudeCount) {
  const index = Number(column);
  if (!Number.isInteger(index) || index < 0 || index >= longitudeCount) throw new RangeError(`Column must be an integer from 0 through ${longitudeCount - 1}.`);
  return index;
}

export function normalizeLongitude(longitude) {
  const value = finite(longitude, 'longitude');
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}
export function clampLatitude(latitude) { return Math.min(90, Math.max(-90, finite(latitude, 'latitude'))); }
export function getLongitudeCellCount(band, grid = DEFAULT_GRID) { return assertGrid(grid).bands[assertBand(band, grid)].longitudeCount; }
export function getLatitudeBand(band, grid = DEFAULT_GRID) { return Object.freeze({ ...assertGrid(grid).bands[assertBand(band, grid)] }); }

function formatCellId(grid, band, column) { return `globe:${grid.version}:${band}:${column}`; }
export function getCellId(band, column, grid = DEFAULT_GRID) {
  const safeGrid = assertGrid(grid); const safeBand = assertBand(band, safeGrid); const safeColumn = assertColumn(column, getLongitudeCellCount(safeBand, safeGrid));
  return formatCellId(safeGrid, safeBand, safeColumn);
}
export function parseCellId(id) {
  const match = /^globe:([^:]+):(\d+):(\d+)$/.exec(String(id));
  if (!match) throw new RangeError('Invalid globe cell id.');
  return Object.freeze({ version: match[1], band: Number(match[2]), column: Number(match[3]) });
}
export function getCellBounds(band, column, grid = DEFAULT_GRID) {
  const safeGrid = assertGrid(grid); const safeBand = assertBand(band, safeGrid); const info = safeGrid.bands[safeBand]; const safeColumn = assertColumn(column, info.longitudeCount);
  const west = -180 + safeColumn * info.longitudeStepDegrees;
  return Object.freeze({ west, east: west + info.longitudeStepDegrees, north: info.north, south: info.south });
}
export function getCell(band, column, grid = DEFAULT_GRID) {
  const safeGrid = assertGrid(grid); const safeBand = assertBand(band, safeGrid); const info = safeGrid.bands[safeBand]; const safeColumn = assertColumn(column, info.longitudeCount); const bounds = getCellBounds(safeBand, safeColumn, safeGrid);
  const id = formatCellId(safeGrid, safeBand, safeColumn);
  return Object.freeze({ id, cellId: id, version: safeGrid.version, band: safeBand, column: safeColumn, bounds, center: Object.freeze({ longitude: normalizeLongitude((bounds.west + bounds.east) / 2), latitude: (bounds.north + bounds.south) / 2 }), longitudeCount: info.longitudeCount, longitudeStepDegrees: info.longitudeStepDegrees, latitudeStepDegrees: safeGrid.latitudeStepDegrees, polarCap: info.polarCap });
}
export function getCellById(id, grid = DEFAULT_GRID) {
  const safeGrid = assertGrid(grid); const parsed = parseCellId(id);
  if (parsed.version !== safeGrid.version) throw new RangeError('Cell id belongs to another grid version.');
  return getCell(parsed.band, parsed.column, safeGrid);
}
export function lookupCell(longitude, latitude, grid = DEFAULT_GRID) {
  const safeGrid = assertGrid(grid); const safeLatitude = clampLatitude(latitude); const band = Math.min(safeGrid.bandCount - 1, Math.max(0, Math.floor((90 - safeLatitude) / safeGrid.latitudeStepDegrees))); const info = safeGrid.bands[band]; const safeLongitude = normalizeLongitude(longitude); const column = Math.min(info.longitudeCount - 1, Math.max(0, Math.floor((safeLongitude + 180) / info.longitudeStepDegrees)));
  return getCell(band, column, safeGrid);
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length < VECTOR_EPSILON) throw new RangeError('Cannot normalize a zero vector.');
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}
function geoToUnitVector(longitude, latitude) {
  const lambda = normalizeLongitude(longitude) * DEG_TO_RAD; const phi = clampLatitude(latitude) * DEG_TO_RAD; const cosPhi = Math.cos(phi);
  return { x: cosPhi * Math.sin(lambda), y: Math.sin(phi), z: cosPhi * Math.cos(lambda) };
}
function unitVectorToGeo(vector) { const normalized = normalizeVector(vector); return Object.freeze({ longitude: normalizeLongitude(Math.atan2(normalized.x, normalized.z) * RAD_TO_DEG), latitude: Math.asin(Math.min(1, Math.max(-1, normalized.y))) * RAD_TO_DEG }); }
function quaternionNormalize(quaternion) {
  const values = [quaternion.x, quaternion.y, quaternion.z, quaternion.w].map((value) => finite(value, 'quaternion component')); const length = Math.hypot(...values);
  if (length < VECTOR_EPSILON) throw new RangeError('Camera quaternion cannot be zero.');
  return Object.freeze({ x: values[0] / length, y: values[1] / length, z: values[2] / length, w: values[3] / length });
}
function quaternionConjugate(quaternion) { return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w }; }
function rotateVectorByQuaternion(vector, quaternion) {
  const doubled = { x: quaternion.x * 2, y: quaternion.y * 2, z: quaternion.z * 2 }; const xx = quaternion.x * doubled.x; const yy = quaternion.y * doubled.y; const zz = quaternion.z * doubled.z; const xy = quaternion.x * doubled.y; const xz = quaternion.x * doubled.z; const yz = quaternion.y * doubled.z; const wx = quaternion.w * doubled.x; const wy = quaternion.w * doubled.y; const wz = quaternion.w * doubled.z;
  return { x: (1 - yy - zz) * vector.x + (xy - wz) * vector.y + (xz + wy) * vector.z, y: (xy + wz) * vector.x + (1 - xx - zz) * vector.y + (yz - wx) * vector.z, z: (xz - wy) * vector.x + (yz + wx) * vector.y + (1 - xx - yy) * vector.z };
}
function quaternionFromBasis(right, up, forward) {
  const m00 = right.x; const m01 = up.x; const m02 = forward.x; const m10 = right.y; const m11 = up.y; const m12 = forward.y; const m20 = right.z; const m21 = up.z; const m22 = forward.z; const trace = m00 + m11 + m22; let quaternion;
  if (trace > 0) { const scale = Math.sqrt(trace + 1) * 2; quaternion = { w: .25 * scale, x: (m21 - m12) / scale, y: (m02 - m20) / scale, z: (m10 - m01) / scale }; }
  else if (m00 > m11 && m00 > m22) { const scale = Math.sqrt(1 + m00 - m11 - m22) * 2; quaternion = { w: (m21 - m12) / scale, x: .25 * scale, y: (m01 + m10) / scale, z: (m02 + m20) / scale }; }
  else if (m11 > m22) { const scale = Math.sqrt(1 + m11 - m00 - m22) * 2; quaternion = { w: (m02 - m20) / scale, x: (m01 + m10) / scale, y: .25 * scale, z: (m12 + m21) / scale }; }
  else { const scale = Math.sqrt(1 + m22 - m00 - m11) * 2; quaternion = { w: (m10 - m01) / scale, x: (m02 + m20) / scale, y: (m12 + m21) / scale, z: .25 * scale }; }
  return quaternionNormalize(quaternion);
}
export function getViewQuaternion(centerLongitude = 0, centerLatitude = 0) {
  const longitude = normalizeLongitude(centerLongitude) * DEG_TO_RAD; const latitude = clampLatitude(centerLatitude) * DEG_TO_RAD; const sinLongitude = Math.sin(longitude); const cosLongitude = Math.cos(longitude); const sinLatitude = Math.sin(latitude); const cosLatitude = Math.cos(latitude);
  return quaternionFromBasis({ x: cosLongitude, y: 0, z: -sinLongitude }, { x: -sinLatitude * sinLongitude, y: cosLatitude, z: -sinLatitude * cosLongitude }, { x: cosLatitude * sinLongitude, y: sinLatitude, z: cosLatitude * cosLongitude });
}
function readViewport(options) {
  const viewport = options.viewport || {}; const width = finite(viewport.width ?? options.width, 'viewport.width'); const height = finite(viewport.height ?? options.height, 'viewport.height'); const dpr = finite(viewport.dpr ?? options.dpr ?? 1, 'viewport.dpr'); const centerX = finite(viewport.centerX ?? viewport.screenCenterX ?? options.centerX ?? width / 2, 'viewport.centerX'); const centerY = finite(viewport.centerY ?? viewport.screenCenterY ?? options.centerY ?? height / 2, 'viewport.centerY');
  if (width <= 0 || height <= 0 || dpr <= 0) throw new RangeError('Viewport width, height, and dpr must be positive.');
  return Object.freeze({ width, height, dpr, centerX, centerY, physicalWidth: width * dpr, physicalHeight: height * dpr, physicalCenterX: centerX * dpr, physicalCenterY: centerY * dpr });
}
export function createGlobeCamera({ viewport, width, height, dpr, centerX, centerY, centerLongitude = 0, centerLatitude = 0, zoom = 1, radius, orientation, rotation } = {}) {
  const safeViewport = readViewport({ viewport, width, height, dpr, centerX, centerY }); const safeZoom = finite(zoom, 'zoom'); const safeRadius = radius === undefined ? Math.min(safeViewport.width, safeViewport.height) / 2 : finite(radius, 'radius');
  if (safeZoom <= 0 || safeRadius <= 0) throw new RangeError('Camera zoom and radius must be positive.'); const longitude = normalizeLongitude(centerLongitude); const latitude = clampLatitude(centerLatitude);
  return Object.freeze({ viewport: safeViewport, centerLongitude: longitude, centerLatitude: latitude, zoom: safeZoom, radius: safeRadius, scale: safeRadius * safeZoom, orientation: quaternionNormalize(orientation || rotation || getViewQuaternion(longitude, latitude)) });
}
export function projectGeoToScreen(longitude, latitude, camera) {
  if (!camera?.viewport || !camera.orientation || !Number.isFinite(camera.scale)) throw new TypeError('A camera created by createGlobeCamera is required.');
  const world = geoToUnitVector(longitude, latitude); const cameraVector = rotateVectorByQuaternion(world, quaternionConjugate(camera.orientation)); const { centerX, centerY, dpr } = camera.viewport; const x = centerX + cameraVector.x * camera.scale; const y = centerY - cameraVector.y * camera.scale;
  return Object.freeze({ x, y, physicalX: x * dpr, physicalY: y * dpr, depth: cameraVector.z, visible: cameraVector.z >= -VISIBILITY_EPSILON, cameraCoordinates: Object.freeze(cameraVector) });
}
export function inverseScreenToGeo(x, y, camera) {
  if (!camera?.viewport || !camera.orientation || !Number.isFinite(camera.scale)) throw new TypeError('A camera created by createGlobeCamera is required.'); const screenX = finite(x, 'screen x'); const screenY = finite(y, 'screen y'); const { centerX, centerY } = camera.viewport; const normalizedX = (screenX - centerX) / camera.scale; const normalizedY = (centerY - screenY) / camera.scale; const radialSquared = normalizedX * normalizedX + normalizedY * normalizedY;
  if (radialSquared > 1 + VISIBILITY_EPSILON) return null; const depth = Math.sqrt(Math.max(0, 1 - Math.min(1, radialSquared))); const world = rotateVectorByQuaternion({ x: normalizedX, y: normalizedY, z: depth }, camera.orientation);
  return Object.freeze({ ...unitVectorToGeo(world), depth, visible: true, screen: Object.freeze({ x: screenX, y: screenY }) });
}
export function inversePhysicalScreenToGeo(x, y, camera) { return inverseScreenToGeo(finite(x, 'physical x') / camera.viewport.dpr, finite(y, 'physical y') / camera.viewport.dpr, camera); }
export function getCellCorners(cell) {
  if (!cell?.bounds) throw new TypeError('A cell returned by getCell is required.'); const { west, east, north, south } = cell.bounds;
  return Object.freeze([{ longitude: west, latitude: north }, { longitude: east, latitude: north }, { longitude: east, latitude: south }, { longitude: west, latitude: south }].map(Object.freeze));
}
export function projectCellCorners(cell, camera) { return Object.freeze(getCellCorners(cell).map(({ longitude, latitude }) => projectGeoToScreen(longitude, latitude, camera))); }
