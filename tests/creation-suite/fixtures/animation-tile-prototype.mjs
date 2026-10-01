/** Independent tiled animation storage experiment; not imported by production code. */
export const TILE_SIZE = 32;
export const MAX_CANVAS_SIZE = 256;
export const MAX_COLORS = 32;
export const MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;

function validateDocumentSize(size) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_CANVAS_SIZE) throw new RangeError('Canvas size must be between 1 and 256');
}

function validatePalette(palette) {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_COLORS) throw new RangeError('Palette must contain between 1 and 32 colors');
}

function validateValue(state, value) {
  if (!Number.isInteger(value) || value < 0 || value > state.palette.length) throw new RangeError('Pixel palette index is outside the palette');
}

function tileDimensions(state, tileX, tileY) {
  const x = tileX * TILE_SIZE;
  const y = tileY * TILE_SIZE;
  return { x, y, width: Math.min(TILE_SIZE, state.size - x), height: Math.min(TILE_SIZE, state.size - y) };
}

function hash(bytes) {
  let result = 2166136261;
  for (const byte of bytes) { result ^= byte; result = Math.imul(result, 16777619); }
  return result >>> 0;
}

function equal(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }

function findTile(state, bytes) {
  const candidates = state.hashes.get(hash(bytes)) || [];
  return candidates.find((id) => {
    const entry = state.pool.get(id);
    return entry && equal(entry.bytes, bytes);
  }) || null;
}

function refsTo(state, tileId) {
  let refs = 0;
  for (const frame of state.frames) for (const id of frame.tiles.values()) if (id === tileId) refs += 1;
  return refs;
}

function removeUnused(state, tileId) {
  if (!tileId || refsTo(state, tileId) > 0) return;
  const entry = state.pool.get(tileId);
  if (!entry) return;
  state.pool.delete(tileId);
  const bucket = state.hashes.get(entry.hash) || [];
  const remaining = bucket.filter((id) => id !== tileId);
  if (remaining.length) state.hashes.set(entry.hash, remaining);
  else state.hashes.delete(entry.hash);
}

function tileBytesFor(state, frame, tileX, tileY) {
  const { width, height } = tileDimensions(state, tileX, tileY);
  const bytes = new Uint8Array(width * height);
  const tileId = frame.tiles.get(`${tileX},${tileY}`);
  const entry = tileId ? state.pool.get(tileId) : null;
  if (entry) bytes.set(entry.bytes);
  return { bytes, width, height };
}

function setTile(state, frame, tileX, tileY, bytes) {
  const key = `${tileX},${tileY}`;
  const previous = frame.tiles.get(key) || null;
  let next = bytes.some((value) => value !== 0) ? findTile(state, bytes) : null;
  const isNew = Boolean(bytes.some((value) => value !== 0) && !next);
  const previousWillBeFreed = Boolean(previous && previous !== next && refsTo(state, previous) === 1);
  const currentSize = getPayloadByteLength(state);
  const previousSize = previousWillBeFreed ? state.pool.get(previous).bytes.byteLength : 0;
  const nextSize = isNew ? bytes.byteLength : 0;
  if (currentSize - previousSize + nextSize > state.maxPayloadBytes) throw new RangeError('Animation tile payload budget exceeded');

  if (isNew) {
    next = `tile-${state.nextTileId++}`;
    const tileHash = hash(bytes);
    state.pool.set(next, { bytes: new Uint8Array(bytes), hash: tileHash });
    const bucket = state.hashes.get(tileHash) || [];
    bucket.push(next);
    state.hashes.set(tileHash, bucket);
    state.copiedBytes += bytes.byteLength;
  }
  if (next) frame.tiles.set(key, next);
  else frame.tiles.delete(key);
  if (previous && previous !== next) removeUnused(state, previous);
  return next;
}

export function createTileAnimation({ size = 16, palette = ['#000000'], maxPayloadBytes = MAX_PAYLOAD_BYTES } = {}) {
  validateDocumentSize(size);
  validatePalette(palette);
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes < 0 || maxPayloadBytes > MAX_PAYLOAD_BYTES) throw new RangeError('Payload budget must be between zero and 32 MiB');
  return {
    size,
    palette: [...palette],
    maxPayloadBytes,
    frames: [{ id: 'frame-1', name: 'Frame 1', tiles: new Map() }],
    pool: new Map(),
    hashes: new Map(),
    nextFrameId: 2,
    nextTileId: 1,
    copiedBytes: 0
  };
}

export function addFrame(state, sourceFrameId = state.frames.at(-1)?.id) {
  const source = state.frames.find((frame) => frame.id === sourceFrameId);
  if (!source) throw new TypeError('Unknown source frame');
  const frame = { id: `frame-${state.nextFrameId++}`, name: `${source.name} copy`, tiles: new Map(source.tiles) };
  state.frames.push(frame);
  return frame.id;
}

export function editPixel(state, { frameId, x, y, value }) {
  const frame = state.frames.find((item) => item.id === frameId);
  if (!frame) throw new TypeError('Unknown frame');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.size || y >= state.size) throw new RangeError('Pixel coordinate is outside the canvas');
  validateValue(state, value);
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  const { bytes, width } = tileBytesFor(state, frame, tileX, tileY);
  bytes[(y % TILE_SIZE) * width + (x % TILE_SIZE)] = value;
  const storedId = setTile(state, frame, tileX, tileY, bytes);
  return { tileId: storedId, tileBytes: bytes.byteLength };
}

/**
 * Replaces one frame as an in-memory pool transaction. This does not persist to disk,
 * and separate calls are not grouped into a larger document transaction.
 */
export function writeFrame(state, frameId, pixels) {
  const frame = state.frames.find((item) => item.id === frameId);
  if (!frame) throw new TypeError('Unknown frame');
  if (!pixels || typeof pixels.length !== 'number' || pixels.length !== state.size * state.size) throw new TypeError('Pixel count does not match canvas');
  for (let i = 0; i < pixels.length; i += 1) validateValue(state, pixels[i]);
  const updates = [];
  const across = Math.ceil(state.size / TILE_SIZE);
  for (let ty = 0; ty < across; ty += 1) for (let tx = 0; tx < across; tx += 1) {
    const { width, height } = tileDimensions(state, tx, ty);
    const bytes = new Uint8Array(width * height);
    for (let py = 0; py < height; py += 1) for (let px = 0; px < width; px += 1) bytes[py * width + px] = pixels[(ty * TILE_SIZE + py) * state.size + tx * TILE_SIZE + px];
    updates.push([tx, ty, bytes]);
  }
  const backupPool = new Map(state.pool);
  const backupHashes = new Map([...state.hashes].map(([key, values]) => [key, [...values]]));
  const backupFrame = new Map(frame.tiles);
  const backupNextTileId = state.nextTileId;
  const backupCopiedBytes = state.copiedBytes;
  try {
    for (const [tx, ty, bytes] of updates) setTile(state, frame, tx, ty, bytes);
  } catch (error) {
    state.pool = backupPool;
    state.hashes = backupHashes;
    frame.tiles = backupFrame;
    state.nextTileId = backupNextTileId;
    state.copiedBytes = backupCopiedBytes;
    throw error;
  }
}

export function renderFrame(state, frameId) {
  const frame = state.frames.find((item) => item.id === frameId);
  if (!frame) throw new TypeError('Unknown frame');
  const pixels = new Uint8Array(state.size * state.size);
  for (const [key, tileId] of frame.tiles) {
    const [tileX, tileY] = key.split(',').map(Number);
    const { x, y, width, height } = tileDimensions(state, tileX, tileY);
    const { bytes } = tileBytesFor(state, frame, tileX, tileY);
    for (let py = 0; py < height; py += 1) pixels.set(bytes.subarray(py * width, (py + 1) * width), (y + py) * state.size + x);
  }
  return pixels;
}

export function getPayloadByteLength(state) {
  let bytes = 0;
  for (const entry of state.pool.values()) bytes += entry.bytes.byteLength;
  return bytes;
}

export function resetCopiedBytes(state) { state.copiedBytes = 0; }
