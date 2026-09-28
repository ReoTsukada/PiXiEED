import { AUDIO_PIXEL_TICKS, validateAudioSong } from './audio-core.mjs?rev=20260928-dot-music-1';

export const AUDIO_CAMERA_REQUEST_KEY = 'pixieed:audio-camera-request:v1';
export const AUDIO_CAMERA_RETURN_KEY = 'pixieed:audio-camera-return:v1';
export const AUDIO_CAMERA_HANDOFF_TTL_MS = 15 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WIDTHS = new Set([16, 32, 64, 128]);
const HEIGHT = 16;
const PXD_ID = /^[A-Za-z0-9_-]{1,128}$/;
function validPxdPointer(pointer) { return pointer === undefined || Boolean(pointer && PXD_ID.test(pointer.projectId || '') && PXD_ID.test(pointer.revisionId || '') && Object.keys(pointer).every((key) => key === 'projectId' || key === 'revisionId')); }
function returnQuery(record, cancelled = false) {
  const query = new URLSearchParams({ camera: record.requestId });
  if (cancelled) query.set('cancelled', '1');
  if (record.pxd) { query.set('pxd', record.pxd.projectId); query.set('pxdRevision', record.pxd.revisionId); }
  return `/audio/?${query}`;
}

function cloneSong(song) {
  validateAudioSong(song);
  return JSON.parse(JSON.stringify(song));
}

function canvasWidth(song) {
  const width = song?.loopTicks / AUDIO_PIXEL_TICKS;
  return WIDTHS.has(width) ? width : null;
}

function requestRecord(storage, now, { allowExpired = false } = {}) {
  try {
    const record = JSON.parse(storage.getItem(AUDIO_CAMERA_REQUEST_KEY) || 'null');
    if (!record || record.version !== 1 || !UUID.test(String(record.requestId || '')) ||
        !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.expiresAt) ||
        record.createdAt > now || (!allowExpired && record.expiresAt <= now) ||
        record.expiresAt - record.createdAt !== AUDIO_CAMERA_HANDOFF_TTL_MS ||
        !WIDTHS.has(record.width) || record.height !== HEIGHT || canvasWidth(record.song) !== record.width || !validPxdPointer(record.pxd)) return null;
    validateAudioSong(record.song);
    return record;
  } catch { return null; }
}

function returnRecord(storage, now) {
  try {
    const record = JSON.parse(storage.getItem(AUDIO_CAMERA_RETURN_KEY) || 'null');
    if (!record || record.version !== 1 || !UUID.test(String(record.requestId || '')) ||
        !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.expiresAt) ||
        record.createdAt > now || record.expiresAt <= now ||
        record.expiresAt - record.createdAt !== AUDIO_CAMERA_HANDOFF_TTL_MS ||
        !WIDTHS.has(record.width) || record.height !== HEIGHT ||
        !Array.isArray(record.palette) || record.palette.length < 1 || record.palette.length > 128 ||
        record.palette.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) ||
        new Set(record.palette.map((color) => color.toLowerCase())).size !== record.palette.length ||
        !Array.isArray(record.rgba) || record.rgba.length !== record.width * record.height * 4) return null;
    validateAudioSong(record.song);
    if (record.rgba.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
    return record;
  } catch { return null; }
}

function uuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new Error('この端末でカメラ受け渡しIDを作成できません。');
}

function readSingleUuidParam(search, name) {
  try {
    const params = new URLSearchParams(search || '');
    const values = params.getAll(name);
    return values.length === 1 && UUID.test(values[0]) ? values[0] : null;
  } catch { return null; }
}

function parseStrictAudioRequest(search) {
  try {
    const params = new URLSearchParams(search || '');
    const entries = [...params.entries()];
    if (entries.length !== 2 || params.getAll('to').length !== 1 || params.get('to') !== 'audio' ||
        params.getAll('audioRequest').length !== 1 || !UUID.test(params.get('audioRequest'))) return null;
    return params.get('audioRequest');
  } catch { return null; }
}

/** Save the current private Audio song and return the camera URL for a one-shot local transfer. */
export function beginAudioCamera({ song, pxd, storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !Number.isSafeInteger(now) || !validPxdPointer(pxd)) throw new TypeError('カメラ受け渡しを保存できません。');
  const savedSong = cloneSong(song);
  const width = canvasWidth(savedSong);
  if (!width) throw new RangeError('音楽キャンバスは16/32/64/128pxである必要があります。');
  const requestId = uuid();
  storage.setItem(AUDIO_CAMERA_REQUEST_KEY, JSON.stringify({
    version: 1, requestId, createdAt: now, expiresAt: now + AUDIO_CAMERA_HANDOFF_TTL_MS,
    width, height: HEIGHT, song: savedSong, ...(pxd ? { pxd: { ...pxd } } : {})
  }));
  storage.removeItem(AUDIO_CAMERA_RETURN_KEY);
  return `/pixel-camera.html?to=audio&audioRequest=${encodeURIComponent(requestId)}`;
}

/** Read and validate a one-shot camera request. No image data is stored in the URL. */
export function readAudioCameraRequest({ search = globalThis.location?.search || '', storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !Number.isSafeInteger(now)) return null;
  const requestId = parseStrictAudioRequest(search);
  if (!requestId) return null;
  const record = requestRecord(storage, now);
  if (!record || record.requestId !== requestId) return null;
  try {
    if (JSON.stringify(cloneSong(record.song)) !== JSON.stringify(record.song)) return null;
    return { requestId, width: record.width, height: record.height, song: cloneSong(record.song), ...(record.pxd ? { pxd: { ...record.pxd } } : {}) };
  } catch { return null; }
}

/** Return only the fixed Audio cancellation URL when the URL ID matches a saved request. */
export function audioCameraCancelUrl({ search = globalThis.location?.search || '', storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !Number.isSafeInteger(now)) return '/audio/';
  const requestId = parseStrictAudioRequest(search);
  if (!requestId) return '/audio/';
  const record = requestRecord(storage, now, { allowExpired: true });
  return record?.requestId === requestId
    ? returnQuery(record, true)
    : '/audio/';
}

/** Store the frozen camera frame and return only to the fixed Audio route. */
export function completeAudioCamera(request, frame, { storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !request || !UUID.test(String(request.requestId || '')) || !Number.isSafeInteger(now)) throw new TypeError('音楽への画像受け渡しを確認できません。');
  const current = requestRecord(storage, now);
  if (!current || current.requestId !== request.requestId || current.width !== request.width || current.height !== request.height ||
      JSON.stringify(current.song) !== JSON.stringify(cloneSong(request.song))) throw new Error('音楽への受け渡し期限が切れました。曲へ戻って撮り直してください。');
  if (!frame || frame.width !== current.width || frame.height !== HEIGHT || frame.data?.length !== current.width * HEIGHT * 4 ||
      !Array.isArray(frame.palette) || frame.palette.length < 1 || frame.palette.length > 128) throw new TypeError('撮影画像の寸法または色パレットが不正です。');
  const palette = frame.palette.map((color) => {
    if (!Array.isArray(color) || color.length < 3 || color.slice(0, 3).some((value) => !Number.isInteger(value) || value < 0 || value > 255)) throw new TypeError('撮影画像のパレットが不正です。');
    return `#${color.slice(0, 3).map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  });
  if (new Set(palette.map((color) => color.toLowerCase())).size !== palette.length) throw new TypeError('撮影画像の色が重複しています。');
  const record = {
    version: 1, requestId: current.requestId, createdAt: current.createdAt, expiresAt: current.expiresAt,
    width: current.width, height: HEIGHT, song: current.song, palette,
    rgba: Array.from(frame.data)
  };
  if (record.rgba.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) throw new TypeError('撮影画像のRGBA画素が不正です。');
  for (let offset = 3; offset < record.rgba.length; offset += 4) if (record.rgba[offset] !== 255) throw new TypeError('撮影画像に透明画素があります。');
  storage.setItem(AUDIO_CAMERA_RETURN_KEY, JSON.stringify(record));
  return returnQuery(current);
}

/** Consume only the matching return record and convert it to a Draw-compatible pixel document. */
export function takeAudioCameraReturn({ search = globalThis.location?.search || '', storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !Number.isSafeInteger(now)) return null;
  const requestId = readSingleUuidParam(search, 'camera');
  if (!requestId) return null;
  const request = requestRecord(storage, now);
  const record = returnRecord(storage, now);
  if (!request || !record || request.requestId !== requestId || record.requestId !== requestId ||
      request.width !== record.width || request.height !== record.height || JSON.stringify(request.song) !== JSON.stringify(record.song)) return null;
  if (request.createdAt !== record.createdAt || request.expiresAt !== record.expiresAt) return null;
  const colorIndexes = new Map(record.palette.map((color, index) => [color.toLowerCase(), index]));
  const pixels = new Array(record.width * HEIGHT);
  for (let pixel = 0; pixel < pixels.length; pixel += 1) {
    const offset = pixel * 4;
    const key = `#${record.rgba.slice(offset, offset + 3).map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const colorIndex = colorIndexes.get(key);
    if (colorIndex === undefined || record.rgba[offset + 3] !== 255) return null;
    pixels[pixel] = colorIndex;
  }
  const document = { schemaVersion: 1, width: record.width, height: HEIGHT, palette: [...record.palette], pixels };
  storage.removeItem(AUDIO_CAMERA_REQUEST_KEY);
  storage.removeItem(AUDIO_CAMERA_RETURN_KEY);
  return { song: cloneSong(record.song), document, ...(request.pxd ? { pxd: { ...request.pxd } } : {}) };
}

/** Recover the saved song after the author cancels the camera, then consume only that request. */
export function readAudioCameraDraft({ search = globalThis.location?.search || '', storage = globalThis.sessionStorage, now = Date.now() } = {}) {
  if (!storage || !Number.isSafeInteger(now)) return null;
  const requestId = readSingleUuidParam(search, 'camera');
  if (!requestId) return null;
  const request = requestRecord(storage, now, { allowExpired: true });
  if (!request || request.requestId !== requestId) return null;
  storage.removeItem(AUDIO_CAMERA_REQUEST_KEY);
  try {
    const result = JSON.parse(storage.getItem(AUDIO_CAMERA_RETURN_KEY) || 'null');
    if (result?.requestId === requestId) storage.removeItem(AUDIO_CAMERA_RETURN_KEY);
  } catch { /* an unreadable response is never returned */ }
  return { song: cloneSong(request.song), width: request.width, height: request.height, ...(request.pxd ? { pxd: { ...request.pxd } } : {}) };
}
