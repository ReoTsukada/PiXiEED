/** Sparse, copy-on-write cel storage shared by the animation editors. */
export const ANIMATION_SCHEMA_VERSION = 1;
export const ANIMATION_TILE_SIZE = 32;
export const ANIMATION_MAX_DIMENSION = 256;
export const ANIMATION_MAX_LAYERS = 8;
export const ANIMATION_MAX_FRAMES = 128;
export const ANIMATION_MAX_COLORS = 32;
export const ANIMATION_PIXEL_BUDGET = 32 * 1024 * 1024;
export const ANIMATION_METADATA_BUDGET = 1024 * 1024;

const internals = new WeakMap();
const validatedSnapshots = new WeakSet();
let nextId = 1;
const newId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(nextId++).toString(36)}`}`;
const fail = (code, message) => { const error = new TypeError(message); error.code = code; throw error; };
const keyOf = (frameId, layerId) => `${frameId}\u0000${layerId}`;
const tileKey = (x, y) => `${x},${y}`;
const hashBytes = (bytes) => { let hash = 2166136261; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); };
const bytesEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const containsOutOfRangeValue = (bytes, max) => { for (const value of bytes) if (value > max) return true; return false; };
const colorValid = (value) => typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value) && (value.length !== 9 || value.slice(7).toLowerCase() === 'ff');
function dimensions(width, height) { if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= ANIMATION_MAX_DIMENSION)) throw new RangeError('キャンバスは1〜256pxで指定してください。'); }
function assertPalette(palette) { if (!Array.isArray(palette) || palette.length < 1 || palette.length > ANIMATION_MAX_COLORS || palette.some((color) => !colorValid(color))) throw new TypeError('パレットは不透明色32色以内で指定してください。'); }
function copyMetadata(value) { return structuredClone(value); }
function freezeMetadata(value) { if (Object.isFrozen(value)) return value; for (const item of Object.values(value)) if (item && typeof item === 'object') freezeMetadata(item); return Object.freeze(value); }

function makeAnimation(meta, celMaps, pool, { share = false, trusted = true } = {}) {
  const state = { ...meta, schemaVersion: ANIMATION_SCHEMA_VERSION, width: meta.width, height: meta.height,
    palette: [...meta.palette], frames: meta.frames.map((frame) => ({ ...frame })), layers: meta.layers.map((layer) => ({ ...layer })) };
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > ANIMATION_METADATA_BUDGET) throw new RangeError('アニメーション情報の保存上限を超えています。');
  freezeMetadata(state.palette); state.frames.forEach(Object.freeze); state.layers.forEach(Object.freeze);
  Object.freeze(state.frames); Object.freeze(state.layers); Object.freeze(state);
  const privatePool = share ? new Map(pool) : new Map([...pool].map(([id, entry]) => [id, { hash: entry.hash, bytes: new Uint8Array(entry.bytes) }]));
  const hashIndex = new Map();
  for (const [id, entry] of privatePool) { const ids = hashIndex.get(entry.hash) ?? []; ids.push(id); hashIndex.set(entry.hash, ids); }
  internals.set(state, { cels: share ? new Map(celMaps) : new Map([...celMaps].map(([key, tiles]) => [key, new Map(tiles)])), pool: privatePool, hashIndex });
  if (trusted) validatedSnapshots.add(state);
  return state;
}
function internal(animation) { validateAnimation(animation); return internals.get(animation); }
function cloneState(animation) { const data = internal(animation); return makeAnimation(animation, data.cels, data.pool, { share: true }); }
function ensureCell(animation, frameId, layerId) {
  if (!animation.frames.some((item) => item.id === frameId)) throw new TypeError('指定したフレームがありません。');
  if (!animation.layers.some((item) => item.id === layerId)) throw new TypeError('指定したレイヤーがありません。');
}
function dimensionsFor(animation, tx, ty) { const x = tx * ANIMATION_TILE_SIZE; const y = ty * ANIMATION_TILE_SIZE; return { x, y, width: Math.min(ANIMATION_TILE_SIZE, animation.width - x), height: Math.min(ANIMATION_TILE_SIZE, animation.height - y) }; }
function blankTile(animation, tx, ty) { const { width, height } = dimensionsFor(animation, tx, ty); return new Uint8Array(width * height); }
function payloadSize(pool) { let total = 0; for (const entry of pool.values()) total += entry.bytes.byteLength; return total; }
function gc(pool, hashIndex, cels) {
  const referenced = new Set(); for (const tiles of cels.values()) for (const id of tiles.values()) referenced.add(id);
  for (const [id, entry] of pool) if (!referenced.has(id)) {
    pool.delete(id); const ids = hashIndex.get(entry.hash)?.filter((candidate) => candidate !== id) ?? [];
    if (ids.length) hashIndex.set(entry.hash, ids); else hashIndex.delete(entry.hash);
  }
}
function internTile(pool, hashIndex, bytes) {
  if (!bytes.some(Boolean)) return null;
  const hash = hashBytes(bytes);
  for (const id of hashIndex.get(hash) ?? []) { const entry = pool.get(id); if (entry && bytesEqual(entry.bytes, bytes)) return id; }
  const id = newId('tile'); pool.set(id, { hash, bytes: new Uint8Array(bytes) }); const ids = hashIndex.get(hash) ?? []; ids.push(id); hashIndex.set(hash, ids); return id;
}
function normalizedPixels(animation, source) {
  if (!source || typeof source.length !== 'number' || source.length !== animation.width * animation.height) throw new TypeError('画素数がキャンバスの大きさと一致しません。');
  const pixels = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) { const value = source[index]; if (!Number.isInteger(value) || value < 0 || value > animation.palette.length) throw new RangeError('画素に未対応の色番号があります。'); pixels[index] = value; }
  return pixels;
}
function tileFromPixels(animation, pixels, tx, ty) {
  const { x, y, width, height } = dimensionsFor(animation, tx, ty); const bytes = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) bytes.set(pixels.subarray((y + row) * animation.width + x, (y + row) * animation.width + x + width), row * width);
  return bytes;
}
function writeCelMaps(animation, cels, pool, hashIndex, frameId, layerId, source) {
  ensureCell(animation, frameId, layerId);
  const pixels = normalizedPixels(animation, source); const key = keyOf(frameId, layerId); const tiles = new Map();
  const columns = Math.ceil(animation.width / ANIMATION_TILE_SIZE); const rows = Math.ceil(animation.height / ANIMATION_TILE_SIZE);
  for (let ty = 0; ty < rows; ty += 1) for (let tx = 0; tx < columns; tx += 1) {
    const bytes = tileFromPixels(animation, pixels, tx, ty); const id = internTile(pool, hashIndex, bytes); if (id) tiles.set(tileKey(tx, ty), id);
  }
  cels.set(key, tiles); gc(pool, hashIndex, cels);
  if (payloadSize(pool) > ANIMATION_PIXEL_BUDGET) throw new RangeError('アニメーション画素の保存上限を超えます。');
}
function renderPixels(animation, frameId, layerId, { visibleOnly = false, composition = null } = {}) {
  ensureCell(animation, frameId, layerId); const pixels = new Uint8Array(animation.width * animation.height); const data = internal(animation);
  const tiles = data.cels.get(keyOf(frameId, layerId)) ?? new Map();
  for (const [key, id] of tiles) {
    const [tx, ty] = key.split(',').map(Number); const { x, y, width, height } = dimensionsFor(animation, tx, ty); const bytes = data.pool.get(id)?.bytes;
    if (!bytes || bytes.length !== width * height) fail('PXD_ANIMATION_CORRUPT', 'アニメーションのタイルが壊れています。');
    for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
      const value = bytes[row * width + column]; if (value > animation.palette.length) fail('PXD_ANIMATION_CORRUPT', 'アニメーションの色番号が壊れています.');
      if (composition) { if (value) pixels[(y + row) * animation.width + x + column] = value; }
      else pixels[(y + row) * animation.width + x + column] = value;
    }
  }
  return pixels;
}
function docFromPixels(animation, pixels) { return { schemaVersion: 1, width: animation.width, height: animation.height, palette: [...animation.palette], pixels: Array.from(pixels, (value) => value - 1) }; }

export function createAnimation({ width = 16, height = 16, palette = ['#000000'] } = {}) {
  dimensions(width, height); assertPalette(palette);
  const meta = { width, height, palette: [...palette], frames: [{ id: newId('frame'), durationMs: 100 }], layers: [{ id: newId('layer'), name: 'Layer 1', visible: true, locked: false }] };
  return makeAnimation(meta, new Map(), new Map());
}
export function createAnimationFromDraw(document) {
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.palette) || !Array.isArray(document.pixels)) throw new TypeError('描画データの形式に対応していません。');
  dimensions(document.width, document.height);
  if (document.palette.some((color) => typeof color === 'string' && color.length === 9 && color.slice(7).toLowerCase() !== 'ff')) throw new RangeError('半透明・透明の旧パレットは安全にアニメーションへ変換できません。元の静止画を保持してください。');
  const palette = [...document.palette]; assertPalette(palette);
  const animation = createAnimation({ width: document.width, height: document.height, palette });
  const pixels = document.pixels.map((value) => { if (!Number.isInteger(value) || value < -1 || value >= document.palette.length) throw new RangeError('描画データの色番号が不正です。'); return value + 1; });
  return writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: animation.width, height: animation.height, pixels });
}
export function cloneAnimation(animation) { return cloneState(animation); }
export function validateAnimation(animation) {
  if (validatedSnapshots.has(animation)) return animation;
  if (!animation || animation.schemaVersion !== ANIMATION_SCHEMA_VERSION || !Number.isInteger(animation.width) || !Number.isInteger(animation.height)) throw new TypeError('アニメーション形式に対応していません。');
  dimensions(animation.width, animation.height); assertPalette(animation.palette);
  if (!Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > ANIMATION_MAX_FRAMES || !Array.isArray(animation.layers) || animation.layers.length < 1 || animation.layers.length > ANIMATION_MAX_LAYERS) throw new RangeError('コマまたはレイヤーの上限を超えています。');
  const ids = new Set();
  for (const frame of animation.frames) { if (!frame || typeof frame.id !== 'string' || ids.has(frame.id) || !Number.isFinite(frame.durationMs) || frame.durationMs < 1 || frame.durationMs > 60000) throw new TypeError('フレーム情報が不正です。'); ids.add(frame.id); }
  ids.clear(); for (const layer of animation.layers) { if (!layer || typeof layer.id !== 'string' || ids.has(layer.id) || typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean') throw new TypeError('レイヤー情報が不正です。'); ids.add(layer.id); }
  const data = internals.get(animation); if (!data) throw new TypeError('このアニメーションは内部状態を持ちません。');
  for (const [key, tiles] of data.cels) { const [frameId, layerId] = key.split('\u0000'); ensureCell(animation, frameId, layerId); if (!(tiles instanceof Map)) throw new TypeError('アニメーションの参照表が壊れています。'); for (const [position, id] of tiles) { const [tx, ty] = position.split(',').map(Number); const { width, height } = dimensionsFor(animation, tx, ty); const entry = data.pool.get(id); if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx * ANIMATION_TILE_SIZE >= animation.width || ty * ANIMATION_TILE_SIZE >= animation.height || !entry || entry.bytes.length !== width * height) throw new TypeError('アニメーションのタイル参照が壊れています。'); } }
  for (const entry of data.pool.values()) if (containsOutOfRangeValue(entry.bytes, animation.palette.length)) throw new TypeError('アニメーションのタイル参照が壊れています。');
  if (payloadSize(data.pool) > ANIMATION_PIXEL_BUDGET) throw new RangeError('アニメーション画素の保存上限を超えています。');
  validatedSnapshots.add(animation);
  return animation;
}
export function getAnimationCelDocument(animation, frameId, layerId) { return docFromPixels(animation, renderPixels(animation, frameId, layerId)); }
/** Return whether a cel has any non-transparent sparse tiles without materializing its pixel array. */
export function hasAnimationCelContent(animation, frameId, layerId) {
  ensureCell(animation, frameId, layerId);
  return internal(animation).cels.get(keyOf(frameId, layerId))?.size > 0;
}
/** Return legacy Draw palette indices used outside one optionally active cel (transparent is -1). */
export function getAnimationUsedColorIndices(animation, { excludeFrameId, excludeLayerId } = {}) {
  validateAnimation(animation);
  if ((excludeFrameId === undefined) !== (excludeLayerId === undefined)) throw new TypeError('除外するコマとレイヤーを両方指定してください。');
  if (excludeFrameId !== undefined) ensureCell(animation, excludeFrameId, excludeLayerId);
  const used = new Set(); const checkedTiles = new Set(); const data = internal(animation);
  const expectedTileCount = Math.ceil(animation.width / ANIMATION_TILE_SIZE) * Math.ceil(animation.height / ANIMATION_TILE_SIZE);
  for (const frame of animation.frames) for (const layer of animation.layers) {
    if (frame.id === excludeFrameId && layer.id === excludeLayerId) continue;
    const tiles = data.cels.get(keyOf(frame.id, layer.id));
    if (!tiles?.size || tiles.size < expectedTileCount) used.add(-1);
    for (const id of tiles?.values() ?? []) {
      if (checkedTiles.has(id)) continue;
      checkedTiles.add(id);
      const bytes = data.pool.get(id)?.bytes;
      if (!bytes) fail('PXD_ANIMATION_CORRUPT', 'アニメーションのタイルが壊れています。');
      for (const value of bytes) { if (value === 0) used.add(-1); else used.add(value - 1); }
    }
  }
  return used;
}
export function composeAnimationFrame(animation, frameId, { layerIds } = {}) {
  if (!animation.frames.some((frame) => frame.id === frameId)) throw new TypeError('指定したフレームがありません。');
  const pixels = new Uint8Array(animation.width * animation.height);
  const selected = layerIds === undefined ? null : new Set(layerIds);
  if (selected && [...selected].some((id) => !animation.layers.some((layer) => layer.id === id))) throw new TypeError('合成するレイヤーを確認してください。');
  for (const layer of animation.layers) if (layer.visible && (!selected || selected.has(layer.id))) { const next = renderPixels(animation, frameId, layer.id); for (let i = 0; i < pixels.length; i += 1) if (next[i]) pixels[i] = next[i]; }
  return docFromPixels(animation, pixels);
}
export function writeAnimationCel(animation, frameId, layerId, document) {
  validateAnimation(animation); if (document?.width !== animation.width || document?.height !== animation.height) throw new RangeError('コマの大きさはキャンバスと一致させてください。');
  const source = document.pixels; const result = cloneState(animation); const data = internals.get(result);
  writeCelMaps(result, data.cels, data.pool, data.hashIndex, frameId, layerId, source); return result;
}
export function addAnimationFrame(animation, { sourceFrameId = animation.frames.at(-1)?.id, durationMs, copy = true } = {}) {
  validateAnimation(animation); if (animation.frames.length >= ANIMATION_MAX_FRAMES) throw new RangeError('コマは128枚までです.');
  if (!animation.frames.some(({ id }) => id === sourceFrameId)) throw new TypeError('複製元のコマがありません。');
  if (typeof copy !== 'boolean') throw new TypeError('コマの複製設定が不正です。');
  const result = cloneState(animation); const source = result.frames.find(({ id }) => id === sourceFrameId); const frame = { id: newId('frame'), durationMs: durationMs ?? source.durationMs };
  const meta = { ...result, frames: [...result.frames, frame] }; const data = internals.get(result);
  if (copy) for (const layer of result.layers) { const tiles = data.cels.get(keyOf(sourceFrameId, layer.id)); if (tiles) data.cels.set(keyOf(frame.id, layer.id), new Map(tiles)); }
  return makeAnimation(meta, data.cels, data.pool, { share: true });
}
export function removeAnimationFrame(animation, frameId) {
  validateAnimation(animation); if (animation.frames.length <= 1) throw new RangeError('最後のコマは削除できません。'); if (!animation.frames.some(({ id }) => id === frameId)) throw new TypeError('指定したフレームがありません。');
  const result = cloneState(animation); const data = internals.get(result); for (const layer of result.layers) data.cels.delete(keyOf(frameId, layer.id)); gc(data.pool, data.hashIndex, data.cels); return makeAnimation({ ...result, frames: result.frames.filter(({ id }) => id !== frameId) }, data.cels, data.pool, { share: true });
}
export function moveAnimationFrame(animation, frameId, index) { validateAnimation(animation); const frames = [...animation.frames]; const from = frames.findIndex(({ id }) => id === frameId); if (from < 0 || !Number.isInteger(index) || index < 0 || index >= frames.length) throw new RangeError('コマの順序を確認してください。'); frames.splice(index, 0, frames.splice(from, 1)[0]); return makeAnimation({ ...animation, frames }, internal(animation).cels, internal(animation).pool, { share: true }); }
export function addAnimationLayer(animation, { name = `Layer ${animation.layers.length + 1}`, visible = true, locked = false } = {}) {
  validateAnimation(animation); if (animation.layers.length >= ANIMATION_MAX_LAYERS) throw new RangeError('レイヤーは8枚までです。');
  if (typeof name !== 'string' || typeof visible !== 'boolean' || typeof locked !== 'boolean') throw new TypeError('レイヤー情報が不正です。');
  return makeAnimation({ ...animation, layers: [...animation.layers, { id: newId('layer'), name, visible, locked }] }, internal(animation).cels, internal(animation).pool, { share: true });
}
export function removeAnimationLayer(animation, layerId) {
  validateAnimation(animation); if (animation.layers.length <= 1) throw new RangeError('最後のレイヤーは削除できません。'); if (!animation.layers.some(({ id }) => id === layerId)) throw new TypeError('指定したレイヤーがありません。');
  const result = cloneState(animation); const data = internals.get(result); for (const frame of result.frames) data.cels.delete(keyOf(frame.id, layerId)); gc(data.pool, data.hashIndex, data.cels); return makeAnimation({ ...result, layers: result.layers.filter(({ id }) => id !== layerId) }, data.cels, data.pool, { share: true });
}
export function moveAnimationLayer(animation, layerId, index) { validateAnimation(animation); const layers = [...animation.layers]; const from = layers.findIndex(({ id }) => id === layerId); if (from < 0 || !Number.isInteger(index) || index < 0 || index >= layers.length) throw new RangeError('レイヤーの順序を確認してください。'); layers.splice(index, 0, layers.splice(from, 1)[0]); return makeAnimation({ ...animation, layers }, internal(animation).cels, internal(animation).pool, { share: true }); }
export function setLayerProperties(animation, layerId, properties = {}) {
  validateAnimation(animation); const layer = animation.layers.find(({ id }) => id === layerId); if (!layer) throw new TypeError('指定したレイヤーがありません。');
  const updated = { ...layer, ...properties, id: layer.id }; if (typeof updated.name !== 'string' || typeof updated.visible !== 'boolean' || typeof updated.locked !== 'boolean') throw new TypeError('レイヤー情報が不正です。');
  return makeAnimation({ ...animation, layers: animation.layers.map((item) => item.id === layerId ? updated : item) }, internal(animation).cels, internal(animation).pool, { share: true });
}
export function setAnimationPalette(animation, palette) {
  validateAnimation(animation); assertPalette(palette);
  let maxUsed = 0; const data = internal(animation);
  for (const entry of data.pool.values()) for (const value of entry.bytes) if (value > maxUsed) maxUsed = value;
  if (palette.length < maxUsed) throw new RangeError('使用中の色があるためパレットを短くできません。');
  return makeAnimation({ ...animation, palette: [...palette] }, data.cels, data.pool, { share: true });
}
export function setAnimationFrameDuration(animation, frameId, durationMs) {
  validateAnimation(animation); if (!animation.frames.some(({ id }) => id === frameId)) throw new TypeError('指定したフレームがありません。');
  if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 60000) throw new RangeError('コマの時間は1〜60000msで指定してください。');
  return makeAnimation({ ...animation, frames: animation.frames.map((frame) => frame.id === frameId ? { ...frame, durationMs } : frame) }, internal(animation).cels, internal(animation).pool, { share: true });
}
export function resizeAnimation(animation, width, height, options = {}) {
  validateAnimation(animation); dimensions(width, height);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('サイズ変更オプションが不正です。');
  const { resample } = options;
  if (resample !== undefined && resample !== 'nearest') throw new TypeError('再標本化方式は nearest から選んでください。');
  const resized = { ...animation, width, height }; const cels = new Map(); const pool = new Map(); const hashIndex = new Map();
  for (const frame of animation.frames) for (const layer of animation.layers) {
    const doc = getAnimationCelDocument(animation, frame.id, layer.id); const pixels = new Uint8Array(width * height);
    if (resample === 'nearest') {
      for (let y = 0; y < height; y += 1) {
        const sourceY = Math.min(animation.height - 1, Math.floor((y + 0.5) * animation.height / height));
        for (let x = 0; x < width; x += 1) {
          const sourceX = Math.min(animation.width - 1, Math.floor((x + 0.5) * animation.width / width));
          pixels[y * width + x] = doc.pixels[sourceY * animation.width + sourceX] + 1;
        }
      }
    } else {
      for (let y = 0; y < Math.min(height, animation.height); y += 1) {
        const row = y * width, sourceRow = y * animation.width;
        for (let x = 0; x < Math.min(width, animation.width); x += 1) pixels[row + x] = doc.pixels[sourceRow + x] + 1;
      }
    }
    writeCelMaps(resized, cels, pool, hashIndex, frame.id, layer.id, pixels);
  }
  return makeAnimation(resized, cels, pool);
}

/** Copies the encoded pool; consumers cannot mutate a runtime's shared COW bytes. */
export function serializeAnimationPool(animation) {
  validateAnimation(animation); const data = internal(animation); const tiles = [];
  const copied = new Set();
  for (const frame of animation.frames) for (const layer of animation.layers) for (const [position, id] of data.cels.get(keyOf(frame.id, layer.id)) ?? []) {
    const [tx, ty] = position.split(',').map(Number); const { x, y, width, height } = dimensionsFor(animation, tx, ty); const firstReference = !copied.has(id); copied.add(id);
    tiles.push({ frameId: frame.id, layerId: layer.id, tileId: id, x, y, width, height, bytes: firstReference ? new Uint8Array(data.pool.get(id).bytes) : null });
  }
  return tiles;
}
/** Hydrate validated state and copied bytes from the PXD adapter. */
export function createAnimationFromSerialized(meta, serializedTiles) {
  if (!meta || meta.schemaVersion !== ANIMATION_SCHEMA_VERSION) fail('PXD_ANIMATION_VERSION', 'このアニメーション保存版には対応していません。原本は保持しています。');
  dimensions(meta.width, meta.height); assertPalette(meta.palette);
  meta = structuredClone(meta);
  const animation = makeAnimation(meta, new Map(), new Map(), { trusted: false }); validateAnimation(animation);
  if (!Array.isArray(serializedTiles)) throw new TypeError('タイル一覧が不正です。');
  const cels = new Map(); const pool = new Map(); const hashIndex = new Map();
  for (const tile of serializedTiles) {
    ensureCell(animation, tile.frameId, tile.layerId); if (!(tile.bytes instanceof Uint8Array)) throw new TypeError('タイル画素が不正です。');
    const { x, y, width, height } = tile; if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x % ANIMATION_TILE_SIZE || y % ANIMATION_TILE_SIZE || width !== Math.min(ANIMATION_TILE_SIZE, animation.width - x) || height !== Math.min(ANIMATION_TILE_SIZE, animation.height - y) || tile.bytes.length !== width * height || !tile.bytes.some(Boolean) || [...tile.bytes].some((value) => value > animation.palette.length)) throw new TypeError('タイル範囲または色番号が不正です。');
    const tx = x / ANIMATION_TILE_SIZE; const ty = y / ANIMATION_TILE_SIZE; const key = keyOf(tile.frameId, tile.layerId); const map = cels.get(key) ?? new Map(); const pos = tileKey(tx, ty); if (map.has(pos)) throw new TypeError('同じ位置に複数のタイルがあります。');
    const id = internTile(pool, hashIndex, tile.bytes); if (!id) throw new TypeError('空タイルは保存できません。'); map.set(pos, id); cels.set(key, map);
  }
  if (payloadSize(pool) > ANIMATION_PIXEL_BUDGET) throw new RangeError('アニメーション画素の保存上限を超えています。');
  return makeAnimation(meta, cels, pool, { share: true });
}

/** Estimate retained metadata plus distinct COW tile buffers without serializing/copying them. */
export function estimateRetainedAnimationBytes(animations) {
  const unique = new WeakSet(); let total = 0; const encoder = new TextEncoder();
  for (const animation of animations) {
    validateAnimation(animation); total += encoder.encode(JSON.stringify(animation)).byteLength;
    for (const { bytes } of internal(animation).pool.values()) if (!unique.has(bytes)) { unique.add(bytes); total += bytes.byteLength; }
  }
  return total;
}

/** A bounded undo timeline for immutable animation snapshots (frame, layer, palette and pixel edits). */
export function createAnimationHistory(initial, { maxBytes = 4 * 1024 * 1024, maxEntries = 100 } = {}) {
  validateAnimation(initial);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('Undo履歴の上限が不正です。');
  let current = initial; const past = []; const future = [];
  const trim = () => {
    while (past.length + future.length > maxEntries) { if (past.length) past.shift(); else future.shift(); }
    const extraBytes = () => estimateRetainedAnimationBytes([...past, ...future, current]) - estimateRetainedAnimationBytes([current]);
    while (extraBytes() > maxBytes) { if (past.length) past.shift(); else if (future.length) future.shift(); else break; }
  };
  return {
    get current() { return current; }, get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
    commit(next) { validateAnimation(next); if (next === current) return false; future.length = 0; past.push(current); current = next; trim(); return true; },
    undo() { if (!past.length) return false; future.push(current); current = past.pop(); return true; },
    redo() { if (!future.length) return false; past.push(current); current = future.pop(); trim(); return true; },
    reset(next) { validateAnimation(next); current = next; past.length = 0; future.length = 0; }
  };
}
