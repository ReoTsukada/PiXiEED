import { createAnimationFromSerialized, getAnimationCelDocument, getAnimationUsedColorIndices, serializeAnimationPool, validateAnimation } from './animation-core.mjs';
import { chooseCameraPalette } from './draw-camera-core.mjs';

export const DRAW_CAMERA_HANDOFF_TTL = 15 * 60 * 1000;
export const DRAW_CAMERA_HANDOFF_PREFIX = 'pixieed:draw-camera:v1:';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function getNow(value) { const time = typeof value === 'function' ? value() : value ?? Date.now(); if (!Number.isFinite(time) || time < 0) throw new TypeError('Invalid handoff clock'); return time; }
function getStorage(value) {
  if (value) return value;
  try { return globalThis.sessionStorage; } catch { return null; }
}
function newId() {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID().toLowerCase();
  if (!crypto?.getRandomValues) throw new Error('このブラウザーでは安全な撮影IDを作成できません。');
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function safeJson(value, label) {
  if (value === undefined) return null;
  let encoded; try { encoded = JSON.stringify(value); } catch { throw new TypeError(`${label} must be JSON serializable`); }
  if (encoded === undefined) throw new TypeError(`${label} must be JSON serializable`);
  return JSON.parse(encoded);
}
function checksum(record) {
  const copy = { ...record }; delete copy.identity;
  const source = JSON.stringify(copy); let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < source.length; i += 1) { const code = source.charCodeAt(i); a = Math.imul(a ^ code, 0x01000193) >>> 0; b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0; }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
function seal(record) { record.identity = checksum(record); return record; }
function idFromSearch(search, key, { toDraw = false } = {}) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const allowed = toDraw ? ['to', key] : [key, 'cancel'];
  if ([...params.keys()].some((name) => !allowed.includes(name)) || allowed.some((name) => params.getAll(name).length > 1)) return null;
  if (toDraw && params.get('to') !== 'draw') return null;
  const id = params.get(key); return id && UUID.test(id) ? { id: id.toLowerCase(), cancel: params.get('cancel') === '1' } : null;
}
function bytesToBase64(bytes) {
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out = '';
  for (let i = 0; i < bytes.length; i += 3) { const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0, bits = (a << 16) | (b << 8) | c; out += alphabet[(bits >>> 18) & 63] + alphabet[(bits >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(bits >>> 6) & 63] : '=') + (i + 2 < bytes.length ? alphabet[bits & 63] : '='); }
  return out;
}
function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length % 4 || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(value)) throw new TypeError('Invalid base64 tile');
  if (typeof globalThis.atob === 'function') { const binary = globalThis.atob(value), bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return bytes; }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; const out = new Uint8Array(value.length * 3 / 4 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)); let cursor = 0;
  for (let i = 0; i < value.length; i += 4) { const bits = (alphabet.indexOf(value[i]) << 18) | (alphabet.indexOf(value[i + 1]) << 12) | ((alphabet.indexOf(value[i + 2]) & 63) << 6) | (alphabet.indexOf(value[i + 3]) & 63); if (cursor < out.length) out[cursor++] = bits >>> 16; if (cursor < out.length) out[cursor++] = bits >>> 8; if (cursor < out.length) out[cursor++] = bits; }
  return out;
}
export function encodeDrawCameraAnimation(animation) {
  validateAnimation(animation);
  const meta = safeJson(animation, 'animation');
  const ids = new Map(); let nextId = 0;
  const tiles = serializeAnimationPool(animation).map((tile) => {
    if (!ids.has(tile.tileId)) ids.set(tile.tileId, `tile-${nextId++}`);
    return { frameId: tile.frameId, layerId: tile.layerId, tileId: ids.get(tile.tileId), x: tile.x, y: tile.y, width: tile.width, height: tile.height, data: tile.bytes ? bytesToBase64(tile.bytes) : null };
  });
  return { schemaVersion: 1, meta, tiles };
}
export function decodeDrawCameraAnimation(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.meta || !Array.isArray(snapshot.tiles)) throw new TypeError('Invalid animation snapshot');
  const payloads = new Map();
  const tiles = snapshot.tiles.map((tile) => {
    let bytes;
    if (tile.data !== null) { bytes = base64ToBytes(tile.data); payloads.set(tile.tileId, bytes); }
    else bytes = payloads.get(tile.tileId);
    if (!bytes) throw new TypeError('Invalid shared animation tile snapshot');
    return { frameId: tile.frameId, layerId: tile.layerId, x: tile.x, y: tile.y, width: tile.width, height: tile.height, bytes };
  });
  return createAnimationFromSerialized(snapshot.meta, tiles);
}
export const restoreDrawCameraAnimation = decodeDrawCameraAnimation;
function animationSnapshot(animation) { return encodeDrawCameraAnimation(animation); }
function selectedCells(mask, width, height) {
  if (mask == null) return Array.from({ length: width * height }, (_, index) => index);
  if (!(mask instanceof Uint8Array) || mask.length !== width * height || mask.some((value) => value !== 0 && value !== 1)) throw new TypeError('Invalid camera selection mask');
  const cells = []; for (let i = 0; i < mask.length; i += 1) if (mask[i]) cells.push(i);
  if (!cells.length) throw new TypeError('Camera selection is empty');
  return cells;
}
function validateRecord(record, id, currentTime = null) {
  if (!record || record.version !== 1 || record.id !== id || !UUID.test(record.id) || !Number.isFinite(record.createdAt) || !Number.isFinite(record.expiresAt)
    || record.expiresAt - record.createdAt !== DRAW_CAMERA_HANDOFF_TTL || record.identity !== checksum(record)) throw new TypeError('Handoff identity check failed');
  if (currentTime !== null && record.createdAt > currentTime) throw new TypeError('Handoff request is from the future');
  const animation = restoreDrawCameraAnimation(record.animation);
  const { frameId, layerId } = record.target || {};
  if (!animation.frames.some((frame) => frame.id === frameId)) throw new TypeError('Handoff frame does not belong to animation');
  const layer = animation.layers.find((item) => item.id === layerId);
  if (!layer) throw new TypeError('Handoff layer does not belong to animation');
  if (layer.locked) throw new TypeError('Camera target layer is locked');
  if (record.target.mask != null && (!Array.isArray(record.target.mask) || record.target.mask.length !== animation.width * animation.height || record.target.mask.some((value) => value !== 0 && value !== 1))) throw new TypeError('Handoff selection mask is invalid');
  const mask = record.target.mask == null ? null : Uint8Array.from(record.target.mask);
  const cells = selectedCells(mask, animation.width, animation.height);
  if (!Array.isArray(record.target.allowedIndices) || !record.target.allowedIndices.length || record.target.allowedIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= animation.palette.length)) throw new TypeError('Handoff palette selection is invalid');
  if (new Set(record.target.allowedIndices).size !== record.target.allowedIndices.length) throw new TypeError('Handoff palette selection contains duplicates');
  const document = getAnimationCelDocument(animation, frameId, layerId);
  const expected = chooseCameraPalette(document, mask, getAnimationUsedColorIndices(animation, { excludeFrameId: frameId, excludeLayerId: layerId }));
  if (expected.length !== record.target.allowedIndices.length || expected.some((index, position) => index !== record.target.allowedIndices[position])) throw new TypeError('Handoff camera palette does not match artwork budget');
  if (record.result != null) {
    if (!record.result || !Array.isArray(record.result.indices) || record.result.indices.length !== cells.length || !Number.isFinite(record.result.completedAt)
      || record.result.completedAt < record.createdAt || record.result.completedAt >= record.expiresAt
      || currentTime !== null && record.result.completedAt > currentTime
      || record.result.indices.some((index) => !Number.isInteger(index) || !record.target.allowedIndices.includes(index))) throw new TypeError('Handoff result is invalid');
  }
  return { animation, frameId, layerId, mask, cells };
}
function readStored(storage, id, currentTime = null) {
  if (!storage?.getItem) throw new Error('撮影の一時保存を利用できません。');
  const source = storage.getItem(`${DRAW_CAMERA_HANDOFF_PREFIX}${id}`);
  if (!source) return null;
  let record; try { record = JSON.parse(source); } catch { return null; }
  try { return { record, ...validateRecord(record, id, currentTime) }; } catch { return null; }
}
function recordFromRequest(request, storage, now = null) {
  if (!request || typeof request !== 'object') throw new TypeError('Camera completion requires its validated request snapshot');
  const id = request.id;
  if (!id || !UUID.test(id)) throw new TypeError('Invalid camera request');
  const stored = readStored(storage, id.toLowerCase(), now);
  if (!stored || request.identity !== stored.record.identity || request.requestId !== stored.record.id || request.expiresAt !== stored.record.expiresAt) throw new TypeError('撮影依頼の対象が一致しません。');
  {
    const sameMask = JSON.stringify(request.mask == null ? null : [...request.mask]) === JSON.stringify(stored.record.target.mask);
    const sameAllowed = JSON.stringify(request.allowedIndices) === JSON.stringify(stored.record.target.allowedIndices);
    const sameAnimation = request.animation && JSON.stringify(encodeDrawCameraAnimation(request.animation)) === JSON.stringify(stored.record.animation);
    if (request.frameId !== stored.frameId || request.layerId !== stored.layerId || !sameMask || !sameAllowed || !sameAnimation
      || JSON.stringify(request.view) !== JSON.stringify(stored.record.view)
      || JSON.stringify(request.project) !== JSON.stringify(stored.record.project)
      || Object.hasOwn(stored.record, 'history') !== Object.hasOwn(request, 'history')
      || Object.hasOwn(stored.record, 'history') && JSON.stringify(request.history) !== JSON.stringify(stored.record.history)) throw new TypeError('撮影対象のスナップショットが変更されています。');
    if (!request.cells || request.cells.length !== stored.cells.length || stored.cells.some((cell, i) => request.cells[i] !== cell)) throw new TypeError('撮影範囲が変更されています。');
  }
  return stored;
}

/** Store an exact snapshot before navigating; any quota failure throws without changing Draw. */
export function beginDrawCamera({ animation, frameId, layerId, mask = null, view = null, project = null, history = undefined, allowedIndices, storage: suppliedStorage, now } = {}) {
  validateAnimation(animation);
  if (!animation.frames.some((frame) => frame.id === frameId)) throw new TypeError('カメラ対象のコマがありません。');
  const targetLayer = animation.layers.find((layer) => layer.id === layerId);
  if (!targetLayer) throw new TypeError('カメラ対象のレイヤーがありません。');
  if (targetLayer.locked) throw new TypeError('ロック中のレイヤーは撮影対象にできません。');
  const cells = selectedCells(mask, animation.width, animation.height);
  if (!Array.isArray(allowedIndices) || !allowedIndices.length || allowedIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= animation.palette.length) || new Set(allowedIndices).size !== allowedIndices.length) throw new TypeError('カメラに使うパレット色が不正です。');
  const targetDocument = getAnimationCelDocument(animation, frameId, layerId);
  const expectedIndices = chooseCameraPalette(targetDocument, mask, getAnimationUsedColorIndices(animation, { excludeFrameId: frameId, excludeLayerId: layerId }));
  if (expectedIndices.length !== allowedIndices.length || expectedIndices.some((index, position) => index !== allowedIndices[position])) throw new TypeError('撮影パレットは作品全体の色数に合わせてください。');
  const at = getNow(now), storage = getStorage(suppliedStorage);
  if (!storage?.setItem || !storage?.getItem) throw new Error('このタブで撮影の一時保存を利用できません。');
  const id = newId();
  const record = seal({ version: 1, id, createdAt: at, expiresAt: at + DRAW_CAMERA_HANDOFF_TTL, animation: animationSnapshot(animation),
    target: { frameId, layerId, mask: mask == null ? null : [...mask], allowedIndices: [...allowedIndices] },
    view: safeJson(view, 'view'), project: safeJson(project, 'project'), ...(history === undefined ? {} : { history: safeJson(history, 'history') }), result: null });
  const key = `${DRAW_CAMERA_HANDOFF_PREFIX}${id}`, encoded = JSON.stringify(record);
  try {
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) throw new Error('撮影の一時保存を確認できません。');
  } catch (error) {
    try { storage.removeItem?.(key); } catch {}
    throw error;
  }
  return `/pixel-camera.html?to=draw&drawRequest=${id}`;
}

/** Camera-page entry: strict query and record checks; expired requests cannot capture. */
export function readDrawCameraRequest({ search, storage: suppliedStorage, now } = {}) {
  const query = idFromSearch(search, 'drawRequest', { toDraw: true }); if (!query) return null;
  const at = getNow(now), stored = readStored(getStorage(suppliedStorage), query.id, at); if (!stored || at >= stored.record.expiresAt) return null;
  return { id: query.id, requestId: query.id, identity: stored.record.identity, animation: stored.animation, frameId: stored.frameId, layerId: stored.layerId,
    mask: stored.mask, cells: Uint32Array.from(stored.cells), allowedIndices: [...stored.record.target.allowedIndices], view: safeJson(stored.record.view, 'view'),
    project: safeJson(stored.record.project, 'project'), ...(Object.hasOwn(stored.record, 'history') ? { history: safeJson(stored.record.history, 'history') } : {}), expiresAt: stored.record.expiresAt };
}

/** Validate captured signed slots against the immutable selection and permitted palette. */
export function completeDrawCamera(request, indices, { storage: suppliedStorage, now } = {}) {
  const at = getNow(now), storage = getStorage(suppliedStorage), stored = recordFromRequest(request, storage, at);
  if (at >= stored.record.expiresAt) throw new RangeError('撮影依頼の有効期限が切れました。');
  if (!indices || indices.length !== stored.cells.length || Array.from(indices).some((value) => !Number.isInteger(value) || value < 0 || !stored.record.target.allowedIndices.includes(value))) throw new TypeError('撮影結果が対象範囲またはパレットと一致しません。');
  const next = { ...stored.record, result: { indices: Array.from(indices), completedAt: at } }; seal(next);
  const key = `${DRAW_CAMERA_HANDOFF_PREFIX}${next.id}`, prior = JSON.stringify(stored.record), encoded = JSON.stringify(next);
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded) { try { storage.setItem(key, prior); } catch {} throw new Error('撮影結果の一時保存を確認できません。'); }
  return `/draw/?drawCamera=${next.id}`;
}

export function drawCameraCancelUrl(requestOrSearch) {
  let id;
  if (typeof requestOrSearch === 'string' || requestOrSearch instanceof URLSearchParams) id = idFromSearch(requestOrSearch, 'drawRequest', { toDraw: true })?.id;
  else id = requestOrSearch?.id;
  if (!id || !UUID.test(id)) throw new TypeError('Invalid camera request');
  return `/draw/?drawCamera=${id.toLowerCase()}&cancel=1`;
}

/** Return to Draw and consume only an unaltered, UUID-matched record. Expired results restore without capture. */
export function takeDrawCameraReturn({ search, storage: suppliedStorage, now, consume = true } = {}) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const query = idFromSearch(params, 'drawCamera'); if (!query || params.has('cancel') && params.get('cancel') !== '1') return null;
  const at = getNow(now), storage = getStorage(suppliedStorage), stored = readStored(storage, query.id, at); if (!stored) return null;
  const expired = at >= stored.record.expiresAt, cancelled = query.cancel;
  const indices = !cancelled && !expired && stored.record.result ? Int16Array.from(stored.record.result.indices) : null;
  if (consume) consumeDrawCameraRequest(query.id, { storage, now: at });
  return { id: query.id, requestId: query.id, identity: stored.record.identity, animation: stored.animation, frameId: stored.frameId, layerId: stored.layerId, mask: stored.mask,
    cells: Uint32Array.from(stored.cells), allowedIndices: [...stored.record.target.allowedIndices], view: safeJson(stored.record.view, 'view'), project: safeJson(stored.record.project, 'project'),
    ...(Object.hasOwn(stored.record, 'history') ? { history: safeJson(stored.record.history, 'history') } : {}), indices,
    cancelled: Boolean(cancelled || expired || !indices), expired };
}

/** Acknowledge a return only after the caller has restored the snapshot successfully. */
export function consumeDrawCameraRequest(requestOrId, { storage: suppliedStorage, now } = {}) {
  const id = typeof requestOrId === 'string' ? requestOrId : requestOrId?.requestId ?? requestOrId?.id;
  if (!id || !UUID.test(id)) return false;
  const storage = getStorage(suppliedStorage), stored = readStored(storage, id.toLowerCase(), now == null ? null : getNow(now));
  if (!stored || (typeof requestOrId === 'object' && requestOrId?.identity && requestOrId.identity !== stored.record.identity)) return false;
  storage.removeItem(`${DRAW_CAMERA_HANDOFF_PREFIX}${id.toLowerCase()}`); return true;
}
