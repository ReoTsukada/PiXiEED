import { createPxdProject, getPxdJson, setPxdBytes, setPxdJson, PXD_MAX_BYTES } from './pxd-codec.mjs';
import { ANIMATION_METADATA_BUDGET, ANIMATION_PIXEL_BUDGET, ANIMATION_SCHEMA_VERSION, createAnimationFromSerialized, serializeAnimationPool, validateAnimation } from './animation-core.mjs';

const encoder = new TextEncoder();
const rolePattern = /^[a-z][a-z0-9-]{0,47}$/;
const statePath = (role) => `animations/${role}/state.json`;
const poolPath = (role) => `animations/${role}/cels.bin`;
const fail = (code, message) => { const error = new TypeError(message); error.code = code; throw error; };
function assertRole(role) { if (typeof role !== 'string' || !rolePattern.test(role)) throw new TypeError('アニメーションの保存場所を確認できません。'); }
function animationRoles(project) {
  const roles = new Set();
  for (const entry of project?.entries ?? []) { const match = /^animations\/([a-z][a-z0-9-]{0,47})\/(state\.json|cels\.bin)$/.exec(entry.path); if (match) roles.add(match[1]); }
  return [...roles];
}
function measureExisting(project, replacingRole = null) {
  let pixels = 0; let metadata = 0;
  for (const role of animationRoles(project)) {
    if (role === replacingRole) continue;
    const state = project.entries.find((entry) => entry.path === statePath(role));
    const pool = project.entries.find((entry) => entry.path === poolPath(role));
    if (!state || !pool) fail('PXD_ANIMATION_CORRUPT', 'アニメーションの保存部品が揃っていません。原本は保持しています。');
    metadata += state.bytes.byteLength; pixels += pool.bytes.byteLength;
  }
  return { pixels, metadata };
}
async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('PXD_CRYPTO_UNAVAILABLE', '画素の安全性を確認できません。');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}
function sameBytes(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }

function makeState(animation, descriptors) {
  return { ...animation, schemaVersion: ANIMATION_SCHEMA_VERSION, cels: descriptors };
}

/** Add or replace one role's timeline while preserving every unrelated PXD entry and field. */
export async function writePxdAnimation(project, animation, { role = 'main', posterFrameId } = {}) {
  assertRole(role); validateAnimation(animation);
  if (posterFrameId !== undefined && !animation.frames.some(({ id }) => id === posterFrameId)) throw new TypeError('表紙にするコマがありません。');
  project ||= createPxdProject();
  const other = measureExisting(project, role);
  const poolParts = []; const descriptors = []; const slotsByTileId = new Map(); const dedup = new Map(); let poolLength = 0;
  for (const tile of serializeAnimationPool(animation)) {
    let slot = slotsByTileId.get(tile.tileId);
    if (!slot) {
      const digest = await sha256(tile.bytes); slot = dedup.get(digest)?.find(({ bytes }) => sameBytes(bytes, tile.bytes));
      if (!slot) { slot = { offset: poolLength, length: tile.bytes.length, bytes: new Uint8Array(tile.bytes), digest }; poolParts.push(slot.bytes); poolLength += slot.length; const candidates = dedup.get(digest) ?? []; candidates.push(slot); dedup.set(digest, candidates); }
      slotsByTileId.set(tile.tileId, slot);
      if (other.pixels + poolLength > ANIMATION_PIXEL_BUDGET) throw new RangeError('絵と音楽の画素プール合計が32MiBを超えます。');
    }
    const cel = descriptors.find(({ frameId, layerId }) => frameId === tile.frameId && layerId === tile.layerId) ?? { frameId: tile.frameId, layerId: tile.layerId, tiles: [] };
    if (!descriptors.includes(cel)) descriptors.push(cel);
    cel.tiles.push({ x: tile.x, y: tile.y, width: tile.width, height: tile.height, offset: slot.offset, length: slot.length, sha256: slot.digest });
  }
  if (other.pixels + poolLength > ANIMATION_PIXEL_BUDGET) throw new RangeError('絵と音楽の画素プール合計が32MiBを超えます。');
  const state = makeState(animation, descriptors);
  if (posterFrameId !== undefined) state.posterFrameId = posterFrameId;
  const stateBytes = encoder.encode(JSON.stringify(state));
  if (other.metadata + stateBytes.byteLength > ANIMATION_METADATA_BUDGET) throw new RangeError('絵と音楽のアニメーション情報合計が1MiBを超えます。');
  if (stateBytes.byteLength + poolLength > PXD_MAX_BYTES) throw new RangeError('アニメーションがPXD全体の容量上限を超えます。');
  const pool = new Uint8Array(poolLength); let cursor = 0; for (const bytes of poolParts) { pool.set(bytes, cursor); cursor += bytes.length; }
  // setPxdJson/setPxdBytes are immutable; if either validation fails the input project is untouched.
  let next = setPxdJson(project, statePath(role), state);
  next = setPxdBytes(next, poolPath(role), pool);
  return next;
}

/** Decode one timeline only after validating all descriptor ranges, hashes, and aggregate budgets. */
export async function readPxdAnimation(project, role = 'main') {
  assertRole(role);
  const stateEntry = project?.entries?.find((entry) => entry.path === statePath(role));
  const poolEntry = project?.entries?.find((entry) => entry.path === poolPath(role));
  if (!stateEntry && !poolEntry) return null;
  if (!stateEntry || !poolEntry) fail('PXD_ANIMATION_CORRUPT', 'アニメーションの保存部品が揃っていません。原本は保持しています。');
  const totals = measureExisting(project);
  if (totals.pixels > ANIMATION_PIXEL_BUDGET || totals.metadata > ANIMATION_METADATA_BUDGET) throw new RangeError('アニメーションの保存容量が上限を超えています。');
  const state = getPxdJson(project, statePath(role));
  if (state?.schemaVersion !== ANIMATION_SCHEMA_VERSION) fail('PXD_ANIMATION_VERSION', 'このアニメーション保存版には対応していません。原本は保持しています。');
  const pool = poolEntry.bytes; const seen = new Set(); const tileRows = [];
  // Validate JSON metadata and every offset/length before allocating per-tile copies.
  if (!Number.isInteger(state.width) || !Number.isInteger(state.height) || state.width < 1 || state.height < 1 || state.width > 256 || state.height > 256
    || !Array.isArray(state.palette) || state.palette.length < 1 || state.palette.length > 32 || state.palette.some((color) => typeof color !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color) || color.length === 9 && color.slice(7).toLowerCase() !== 'ff')
    || !Array.isArray(state.frames) || state.frames.length < 1 || state.frames.length > 128
    || !Array.isArray(state.layers) || state.layers.length < 1 || state.layers.length > 8
    || !Array.isArray(state.cels)) throw new TypeError('アニメーションのコマ一覧が壊れています。');
  const frameIds = new Set(); for (const frame of state.frames) {
    if (!frame || typeof frame.id !== 'string' || frameIds.has(frame.id) || !Number.isFinite(frame.durationMs) || frame.durationMs < 1 || frame.durationMs > 60000) throw new TypeError('フレーム情報が壊れています。'); frameIds.add(frame.id);
  }
  const layerIds = new Set(); for (const layer of state.layers) {
    if (!layer || typeof layer.id !== 'string' || layerIds.has(layer.id) || typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean') throw new TypeError('レイヤー情報が壊れています。'); layerIds.add(layer.id);
  }
  if (state.posterFrameId !== undefined && !frameIds.has(state.posterFrameId)) throw new TypeError('表紙コマの参照が壊れています。');
  const celIds = new Set();
  for (const cel of state.cels) {
    if (!cel || typeof cel.frameId !== 'string' || typeof cel.layerId !== 'string' || !Array.isArray(cel.tiles)) throw new TypeError('アニメーションのコマ情報が壊れています。');
    const celIdentity = `${cel.frameId}\u0000${cel.layerId}`;
    if (!frameIds.has(cel.frameId) || !layerIds.has(cel.layerId) || celIds.has(celIdentity)) throw new TypeError('コマまたはレイヤーの参照が壊れています。'); celIds.add(celIdentity);
    for (const tile of cel.tiles) {
      const { x, y, width, height, offset, length, sha256: digest } = tile ?? {};
      const expectedWidth = Math.min(32, state.width - x); const expectedHeight = Math.min(32, state.height - y);
      if (![x, y, width, height, offset, length].every(Number.isSafeInteger) || x < 0 || y < 0 || x % 32 || y % 32 || x >= state.width || y >= state.height
        || width !== expectedWidth || height !== expectedHeight || length !== width * height || offset < 0 || offset + length > pool.byteLength || !/^[a-f0-9]{64}$/.test(digest ?? '')) throw new TypeError('アニメーションの画素範囲が壊れています。');
      const position = `${celIdentity}\u0000${x},${y}`; if (seen.has(position)) throw new TypeError('同じ位置に複数の画素タイルがあります。'); seen.add(position);
      const view = pool.subarray(offset, offset + length);
      if (await sha256(view) !== digest) throw new TypeError('アニメーションの画素検査に失敗しました。原本は保持しています。');
      let nonblank = false; let invalidValue = false; for (const value of view) { if (value) nonblank = true; if (value > state.palette.length) invalidValue = true; }
      if (!nonblank || invalidValue) throw new TypeError('アニメーションの色番号が壊れています。');
      tileRows.push({ frameId: cel.frameId, layerId: cel.layerId, x, y, width, height, offset, length, digest });
    }
  }
  const intervals = new Map(); for (const tile of tileRows) intervals.set(`${tile.offset}:${tile.length}`, { start: tile.offset, end: tile.offset + tile.length });
  let end = 0; for (const interval of [...intervals.values()].sort((a, b) => a.start - b.start)) { if (interval.start !== end) throw new TypeError('アニメーション画素プールに欠落または余分なbytesがあります。'); end = interval.end; }
  if (end !== pool.byteLength) throw new TypeError('アニメーション画素プールに余分なbytesがあります。');
  // Hash-verified bytes are copied only after the entire descriptor table passed validation.
  const tiles = tileRows.map((tile) => ({ frameId: tile.frameId, layerId: tile.layerId, x: tile.x, y: tile.y, width: tile.width, height: tile.height, bytes: pool.subarray(tile.offset, tile.offset + tile.length) }));
  const metadata = { ...state }; delete metadata.cels;
  return createAnimationFromSerialized(metadata, tiles);
}
