const DB_NAME = 'pixieed-tool-output-v1';
const DB_VERSION = 1;
const STORE_NAME = 'outputs';
export const TOOL_OUTPUT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MIME_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/gif': 'gif',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
});
const RETURN_PATHS = new Set([
  '/draw/', '/audio/', '/pixel-camera.html', '/pixel-camera-studio.html', '/pixiee-lens/'
]);
const ID_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

function mimeOf(blob) { return String(blob?.type || '').split(';', 1)[0].trim().toLowerCase(); }
function extensionOf(filename) { return String(filename || '').split('.').pop().toLowerCase(); }

export function sanitizeOutputFilename(value, extension) {
  const suffix = String(extension || '').replace(/^\./, '').toLowerCase();
  if (!Object.values(MIME_EXTENSIONS).includes(suffix)) throw new TypeError('ファイル形式を確認できません。');
  let base = String(value || '').split(/[\\/]/).pop().trim().replace(/\.[a-z0-9]{1,8}$/i, '');
  base = base.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').slice(0, 80).trim();
  if (!base || base === '.' || base === '..') base = 'pixieed-output';
  return `${base}.${suffix}`;
}

function assertBlobAndName(blob, filename) {
  if (!blob || typeof blob.size !== 'number' || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1) {
    throw new TypeError('書き出すファイルがありません。');
  }
  const mime = mimeOf(blob);
  const extension = MIME_EXTENSIONS[mime];
  if (!extension || extensionOf(filename) !== extension) throw new TypeError('このファイル形式にはまだ対応していません。元の保存を続けてください。');
  return { mime, extension, filename: sanitizeOutputFilename(filename, extension) };
}

function safeReturnUrl(value, origin = globalThis.location?.origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || !origin) throw new TypeError('編集画面への戻り先を確認できません。');
  const url = new URL(value, origin);
  if (url.origin !== origin || !RETURN_PATHS.has(url.pathname)) throw new TypeError('編集画面への戻り先を確認できません。');
  return `${url.pathname}${url.search}${url.hash}`;
}

function openDatabase(indexedDBRef = globalThis.indexedDB) {
  if (!indexedDBRef?.open) return Promise.reject(new Error('端末内の出力保存を利用できません。元の保存を続けてください。'));
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDBRef.open(DB_NAME, DB_VERSION); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('端末内の出力を開けませんでした。'));
    request.onblocked = () => reject(new Error('別のタブが出力保存を使用中です。少し待ってからもう一度お試しください。'));
  });
}

function transactionResult(database, mode, run) {
  return new Promise((resolve, reject) => {
    let transaction; let request; let value;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      request = run(transaction.objectStore(STORE_NAME));
    } catch (error) { reject(error); return; }
    if (request) {
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => { try { transaction.abort(); } catch {} };
    }
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || request?.error || new Error('端末内の出力を確認できませんでした。'));
  });
}

function updateStoredRecord(database, id, update, now = Date.now) {
  return new Promise((resolve, reject) => {
    let transaction; let request; let failure = null; let result;
    try { transaction = database.transaction(STORE_NAME, 'readwrite'); request = transaction.objectStore(STORE_NAME).get(id); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => {
      const record = request.result;
      try {
        if (!record || record.expiresAt <= now() || record.id !== id) throw new Error('出力が見つかりません。編集画面からもう一度書き出してください。');
        result = update(record);
        transaction.objectStore(STORE_NAME).put(record);
      } catch (error) { failure = error; try { transaction.abort(); } catch {} }
    };
    request.onerror = () => { failure = request.error || new Error('端末内の出力を確認できませんでした。'); try { transaction.abort(); } catch {} };
    transaction.oncomplete = () => failure ? reject(failure) : resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || request.error || new Error('端末内の出力を更新できませんでした。'));
  });
}

function newOutputId(cryptoRef = globalThis.crypto) {
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
  if (!cryptoRef?.getRandomValues) throw new Error('安全な出力IDを作成できません。元の保存を続けてください。');
  const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function outputPageUrl(id, origin = globalThis.location?.origin) {
  if (!ID_PATTERN.test(id) || !origin) throw new TypeError('出力ページを開けません。');
  return new URL(`/output/?id=${encodeURIComponent(id)}`, origin).href;
}

function safeMetadata(metadata = {}) {
  const allowed = ['width', 'height', 'outputWidth', 'outputHeight', 'durationSeconds', 'description', 'scale', 'defaultScale', 'frameCount', 'frameDelayMs', 'loopCount', 'sampleRate', 'loops', 'aspectLocked'];
  const result = {};
  for (const key of allowed) {
    const value = metadata?.[key];
    if (key === 'description' && typeof value === 'string') result[key] = value.slice(0, 180);
    else if (key === 'aspectLocked' && typeof value === 'boolean') result[key] = value;
    else if (key !== 'description' && Number.isFinite(value) && value >= 0) result[key] = Math.round(value * (key === 'durationSeconds' ? 10 : 1)) / (key === 'durationSeconds' ? 10 : 1);
  }
  return result;
}

function cloneMediaSource(mediaSource, mime) {
  if (mediaSource == null) return null;
  if (mime !== 'image/gif') {
    throw new TypeError('アニメーションの書き出し元を確認できません。');
  }
  if (mediaSource?.kind !== 'gif-frames' || !Array.isArray(mediaSource.frames) || mediaSource.frames.length < 2 || mediaSource.frames.length > 600) return null;
  const { width, height } = mediaSource.frames[0];
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) return null;
  if (width * height * mediaSource.frames.length > 8_000_000) return null;
  const valid = mediaSource.frames.every((frame) => frame?.width === width && frame?.height === height
    && ArrayBuffer.isView(frame.data) && frame.data.BYTES_PER_ELEMENT === 1 && frame.data.length === width * height * 4
    && Number.isFinite(frame.delayMs ?? mediaSource.delayMs) && (frame.delayMs ?? mediaSource.delayMs) >= 20 && (frame.delayMs ?? mediaSource.delayMs) <= 655350);
  if (!valid) return null;
  const frames = mediaSource.frames.map((frame) => {
    const delayMs = frame.delayMs ?? mediaSource.delayMs;
    return { width, height, data: Uint8Array.from(frame.data), delayMs };
  });
  return { kind: 'gif-frames', width, height, frames, loopCount: mediaSource.loopCount === 0 ? 0 : null };
}

async function removeExpired(database, now) {
  await new Promise((resolve, reject) => {
    let transaction;
    try { transaction = database.transaction(STORE_NAME, 'readwrite'); }
    catch (error) { reject(error); return; }
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!Number.isFinite(cursor.value?.expiresAt) || cursor.value.expiresAt <= now) cursor.delete();
      cursor.continue();
    };
    request.onerror = () => { try { transaction.abort(); } catch {} };
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error || new Error('期限切れの出力を整理できませんでした。'));
  });
}

/** Store finished files locally and return an opaque URL; image data never enters the URL. */
export async function stageToolOutput({ blob, filename, returnUrl, metadata = {}, mediaSource = null, title = '', source = '' } = {}, {
  indexedDBRef = globalThis.indexedDB,
  cryptoRef = globalThis.crypto,
  locationRef = globalThis.location,
  now = Date.now,
  ttlMs = TOOL_OUTPUT_TTL_MS
} = {}) {
  const file = assertBlobAndName(blob, filename);
  const safeReturn = safeReturnUrl(returnUrl, locationRef?.origin);
  const safeMediaSource = cloneMediaSource(mediaSource, file.mime);
  if (!Number.isFinite(ttlMs) || ttlMs < 60_000) throw new RangeError('出力の保存期間を確認できません。');
  const id = newOutputId(cryptoRef);
  const createdAt = now();
  const record = {
    schemaVersion: 1, id, createdAt, expiresAt: createdAt + ttlMs,
    blob, mime: file.mime, extension: file.extension, filename: file.filename,
    returnUrl: safeReturn, metadata: safeMetadata(metadata), mediaSource: safeMediaSource,
    title: String(title || '').slice(0, 100), source: String(source || '').slice(0, 60)
  };
  const database = await openDatabase(indexedDBRef);
  try {
    await removeExpired(database, createdAt);
    await transactionResult(database, 'readwrite', (store) => store.add(record));
    const verified = await transactionResult(database, 'readonly', (store) => store.get(id));
    if (!verified || verified.id !== id || verified.blob?.size !== blob.size || verified.filename !== record.filename) {
      throw new Error('端末内の出力を確認できません。元の保存を続けてください。');
    }
    return { id, url: outputPageUrl(id, locationRef.origin), expiresAt: record.expiresAt, filename: record.filename };
  } finally { database.close?.(); }
}

/** Read without consuming the entry, so reloads, Back, and duplicated tabs remain safe. */
export async function readToolOutput(id, { indexedDBRef = globalThis.indexedDB, now = Date.now } = {}) {
  if (!ID_PATTERN.test(String(id || ''))) throw new TypeError('出力を特定できません。編集画面からもう一度書き出してください。');
  const database = await openDatabase(indexedDBRef);
  try {
    const record = await transactionResult(database, 'readonly', (store) => store.get(id));
    if (!record || record.schemaVersion !== 1 || record.id !== id || !record.blob || !Number.isFinite(record.expiresAt)) throw new Error('出力が見つかりません。編集画面へ戻ってもう一度書き出してください。');
    if (record.expiresAt <= now()) throw new Error('この出力は期限切れです。編集画面へ戻ってもう一度書き出してください。');
    const validated = assertBlobAndName(record.blob, record.filename);
    if (record.mime !== validated.mime || record.extension !== validated.extension) throw new Error('出力の形式を確認できません。編集画面へ戻ってもう一度書き出してください。');
    let currentBlob = record.currentBlob || record.blob;
    let currentFilename = record.currentFilename || record.filename;
    if (record.currentBlob || record.currentFilename) {
      const current = assertBlobAndName(currentBlob, currentFilename);
      if (current.mime !== record.mime || current.extension !== record.extension) throw new Error('出力設定を確認できません。編集画面へ戻ってもう一度書き出してください。');
    }
    return { ...record, sourceBlob: record.blob, sourceFilename: record.filename, blob: currentBlob, filename: currentFilename,
      metadata: safeMetadata({ ...record.metadata, ...record.currentMetadata }), mediaSource: cloneMediaSource(record.mediaSource, record.mime) };
  } finally { database.close?.(); }
}

/** Persist a rendered variant without replacing the original, so reloads and retries stay recoverable. */
export async function saveToolOutputVariant(id, blob, metadata = {}, { indexedDBRef = globalThis.indexedDB, now = Date.now } = {}) {
  const database = await openDatabase(indexedDBRef);
  try {
    await updateStoredRecord(database, id, (value) => {
      const original = assertBlobAndName(value.blob, value.filename);
      const variant = assertBlobAndName(blob, value.filename);
      if (variant.mime !== original.mime || variant.extension !== original.extension) throw new TypeError('元のファイル形式と異なる設定です。');
      value.currentBlob = blob;
      value.currentMetadata = safeMetadata(metadata);
      return true;
    }, now);
    const verified = await transactionResult(database, 'readonly', (store) => store.get(id));
    if (!verified?.currentBlob || verified.currentBlob.size !== blob.size) throw new Error('設定後のファイルを端末内に保存できません。前の出力はそのまま使えます。');
    return true;
  } finally { database.close?.(); }
}

export async function saveToolOutputFilename(id, filename, { indexedDBRef = globalThis.indexedDB, now = Date.now } = {}) {
  const database = await openDatabase(indexedDBRef);
  try {
    await updateStoredRecord(database, id, (record) => { record.currentFilename = sanitizeOutputFilename(filename, record.extension); return true; }, now);
    const current = await transactionResult(database, 'readonly', (store) => store.get(id));
    if (!current?.currentFilename) throw new Error('ファイル名を端末内に保存できませんでした。');
    return current.currentFilename;
  } finally { database.close?.(); }
}

export async function sendToolOutput(options, dependencies) {
  try {
    const staged = await stageToolOutput(options, dependencies);
    const locationRef = dependencies?.locationRef || globalThis.location;
    if (typeof locationRef?.assign !== 'function') return { ok: false, reason: 'navigation_unavailable', staged };
    locationRef.assign(staged.url);
    return { ok: true, ...staged };
  } catch (error) {
    return { ok: false, error };
  }
}

export const OUTPUT_RETURN_PATHS = RETURN_PATHS;
export const OUTPUT_MIME_EXTENSIONS = MIME_EXTENSIONS;
