const DB_NAME = 'pixieed-tool-output-v1';
const DB_VERSION = 1;
const STORE_NAME = 'outputs';
export const TOOL_OUTPUT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MIME_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/apng': 'apng',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  // Retain access to PXD records staged by earlier releases; current PXD tools save directly.
  'application/octet-stream': 'pxd'
});
const RETURN_PATHS = new Set([
  '/draw/', '/audio/', '/pixel-camera.html', '/pixel-camera-studio.html', '/pixiee-lens/',
  '/jigsaw/', '/spot-difference/', '/hidden-object/'
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
  const allowed = ['width', 'height', 'outputWidth', 'outputHeight', 'durationSeconds', 'description', 'scale', 'defaultScale', 'frameCount', 'frameDelayMs', 'loopCount', 'sampleRate', 'loops', 'jpegQuality', 'aspectLocked', 'cameraSize', 'cameraRatio', 'cameraColors', 'cameraFinish', 'cameraFacing', 'cameraEdges', 'cameraPaletteMode', 'cameraGradientMode', 'cameraDitherPattern', 'cameraSurfaceSimplify', 'cameraZoom', 'cameraMiniature', 'cameraCustomLook', 'cameraTone'];
  const result = {};
  for (const key of allowed) {
    const value = metadata?.[key];
    if (key === 'description' && typeof value === 'string') result[key] = value.slice(0, 180);
    else if (key === 'aspectLocked' && typeof value === 'boolean') result[key] = value;
    else if (['cameraRatio', 'cameraColors', 'cameraFinish', 'cameraFacing', 'cameraPaletteMode', 'cameraGradientMode', 'cameraDitherPattern'].includes(key) && typeof value === 'string' && value.length <= 24) result[key] = value;
    else if (key === 'cameraCustomLook' && typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) result[key] = value;
    else if (['cameraEdges', 'cameraMiniature'].includes(key) && typeof value === 'boolean') result[key] = value;
    else if (key === 'cameraTone' && value && typeof value === 'object' && !Array.isArray(value)) {
      const tone = {};
      for (const name of ['brightness', 'exposure', 'saturation', 'shadows', 'contrast', 'whiteBalance', 'zoom']) {
        const amount = value[name];
        if (Number.isFinite(amount) && amount >= -100 && amount <= 100) tone[name] = Math.round(amount);
      }
      if (Object.keys(tone).length) result[key] = tone;
    }
    else if (key !== 'description' && Number.isFinite(value) && value >= 0) result[key] = Math.round(value * (key === 'durationSeconds' ? 10 : 1)) / (key === 'durationSeconds' ? 10 : 1);
  }
  return result;
}

function cloneMediaSource(mediaSource, mime) {
  if (mediaSource == null) return null;
  if (!String(mime || '').startsWith('image/')) {
    throw new TypeError('アニメーションの書き出し元を確認できません。');
  }
  if (!['gif-frames', 'rgba-frames'].includes(mediaSource?.kind) || !Array.isArray(mediaSource.frames) || !mediaSource.frames.length || mediaSource.frames.length > 600) return null;
  if (mediaSource.kind === 'gif-frames' && mediaSource.frames.length < 2) return null;
  const { width, height } = mediaSource.frames[0];
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) return null;
  if (width * height * mediaSource.frames.length > 8_000_000) return null;
  const valid = mediaSource.frames.every((frame) => frame?.width === width && frame?.height === height
    && ArrayBuffer.isView(frame.data) && frame.data.BYTES_PER_ELEMENT === 1 && frame.data.length === width * height * 4
    && (mediaSource.frames.length === 1 || (Number.isFinite(frame.delayMs ?? mediaSource.delayMs) && (frame.delayMs ?? mediaSource.delayMs) >= 1 && (frame.delayMs ?? mediaSource.delayMs) <= 3600000)));
  if (!valid) return null;
  const frames = mediaSource.frames.map((frame) => {
    const delayMs = frame.delayMs ?? mediaSource.delayMs;
    return { width, height, data: Uint8Array.from(frame.data), ...(Number.isFinite(delayMs) ? { delayMs } : {}) };
  });
  return { kind: mediaSource.kind, width, height, frames, loopCount: Number.isSafeInteger(mediaSource.loopCount) && mediaSource.loopCount >= 0 ? mediaSource.loopCount : 0 };
}

function cloneMediaSources(sources) {
  if (sources == null) return [];
  if (!Array.isArray(sources) || sources.length > 8) throw new TypeError('出力素材の数が上限を超えています。');
  const ids = new Set(); let totalPixels = 0;
  const cloned = sources.map((source) => {
    const id = String(source?.id || '');
    const label = String(source?.label || '').slice(0, 60);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id) || !label) throw new TypeError('出力素材を確認できません。');
    ids.add(id);
    if (source.kind === 'rgba-frames') {
      const storedMedia = source.mediaSource || {};
      const mediaSource = cloneMediaSource({ kind: 'rgba-frames', frames: source.frames || storedMedia.frames, loopCount: source.loopCount ?? storedMedia.loopCount }, 'image/png');
      if (!mediaSource) throw new TypeError('画像素材のフレームを確認できません。');
      totalPixels += mediaSource.width * mediaSource.height * mediaSource.frames.length;
      if (totalPixels > 12_000_000) throw new RangeError('出力素材が大きすぎます。アニメーションのコマ数を減らしてからお試しください。');
      return { id, label, kind: 'rgba-frames', mediaSource };
    }
    if (source.kind === 'audio-song' || source.kind === 'audio-video') {
      const song = source.song;
      let encoded;
      try { encoded = JSON.stringify(song); } catch { throw new TypeError('音楽素材を読み込めません。'); }
      if (!song || encoded.length > 2_000_000 || !Number.isFinite(song.tempo) || !Number.isFinite(song.loopTicks) || !Array.isArray(song.tracks)) throw new TypeError('音楽素材を確認できません。');
      let image = null;
      if (source.kind === 'audio-video') {
        image = cloneMediaSource({ kind: 'rgba-frames', frames: [source.image] }, 'image/png');
        if (!image) throw new TypeError('動画の画像素材を確認できません。');
        totalPixels += image.width * image.height;
        if (totalPixels > 12_000_000) throw new RangeError('出力素材が大きすぎます。画面へ戻って素材を減らしてください。');
      }
      return { id, label, kind: source.kind, song: JSON.parse(encoded), ...(image ? { image: image.frames[0] } : {}) };
    }
    throw new TypeError('未対応の出力素材です。');
  });
  return cloned;
}

function normalizeOutputItems(items, fallback) {
  if (!Array.isArray(items) || !items.length || items.length > 12) throw new TypeError('出力項目の数が上限を超えています。');
  const ids = new Set(); const blobs = new Set(); let totalBytes = 0;
  const normalized = items.map((item) => {
    const id = String(item?.id || '');
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) throw new TypeError('出力項目を確認できません。');
    ids.add(id);
    const file = assertBlobAndName(item.blob, item.filename);
    if (!blobs.has(item.blob)) { blobs.add(item.blob); totalBytes += item.blob.size; }
    if (totalBytes > 128 * 1024 * 1024) throw new RangeError('出力項目の合計が128MBを超えています。不要な項目を削除してください。');
    return { id, sourceId: String(item.sourceId || ''), mime: file.mime, extension: file.extension, filename: file.filename, blob: item.blob,
      metadata: safeMetadata(item.metadata) };
  });
  return normalized;
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
export async function stageToolOutput({ blob, filename, returnUrl, metadata = {}, mediaSource = null, mediaSources = null, title = '', source = '' } = {}, {
  indexedDBRef = globalThis.indexedDB,
  cryptoRef = globalThis.crypto,
  locationRef = globalThis.location,
  now = Date.now,
  ttlMs = TOOL_OUTPUT_TTL_MS
} = {}) {
  const file = assertBlobAndName(blob, filename);
  const safeReturn = safeReturnUrl(returnUrl, locationRef?.origin);
  const safeMediaSource = cloneMediaSource(mediaSource, file.mime);
  const safeMediaSources = cloneMediaSources(mediaSources);
  if (!Number.isFinite(ttlMs) || ttlMs < 60_000) throw new RangeError('出力の保存期間を確認できません。');
  const id = newOutputId(cryptoRef);
  const createdAt = now();
  const record = {
    schemaVersion: 1, id, createdAt, expiresAt: createdAt + ttlMs,
    blob, mime: file.mime, extension: file.extension, filename: file.filename,
    returnUrl: safeReturn, metadata: safeMetadata(metadata), mediaSource: safeMediaSource, mediaSources: safeMediaSources,
    outputs: [{ id: 'default', sourceId: safeMediaSources[0]?.id || '', mime: file.mime, extension: file.extension, filename: file.filename, blob, metadata: {} }],
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
    let outputs = Array.isArray(record.outputs) ? record.outputs : [{ id: 'default', sourceId: record.mediaSources?.[0]?.id || '', mime: record.mime, extension: record.extension, filename: currentFilename, blob: currentBlob, metadata: record.currentMetadata || {} }];
    outputs = normalizeOutputItems(outputs, { blob: currentBlob, filename: currentFilename });
    const safeMediaSources = cloneMediaSources(record.mediaSources);
    const legacyImageSource = !safeMediaSources.length && record.mime.startsWith('image/');
    if (outputs.some((item) => item.sourceId && !safeMediaSources.some((candidate) => candidate.id === item.sourceId) && !(legacyImageSource && item.sourceId === 'legacy'))) throw new Error('出力素材との関連を確認できません。');
    return { ...record, sourceBlob: record.blob, sourceFilename: record.filename, blob: currentBlob, filename: currentFilename,
      outputs, mediaSources: safeMediaSources,
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

/** Persist an independent output-item set while leaving the original staged file intact. */
export async function saveToolOutputItems(id, items, { indexedDBRef = globalThis.indexedDB, now = Date.now } = {}) {
  const normalized = normalizeOutputItems(items);
  const database = await openDatabase(indexedDBRef);
  try {
    await updateStoredRecord(database, id, (record) => {
      const sourceIds = new Set((record.mediaSources || []).map((source) => source.id));
      const legacyImageSource = sourceIds.size === 0 && record.mime.startsWith('image/');
      if (normalized.some((item) => item.sourceId && !sourceIds.has(item.sourceId) && !(legacyImageSource && item.sourceId === 'legacy'))) throw new Error('出力素材との関連を確認できません。');
      record.outputs = normalized;
      return true;
    }, now);
    const verified = await transactionResult(database, 'readonly', (store) => store.get(id));
    if (!Array.isArray(verified?.outputs) || verified.outputs.length !== normalized.length
      || verified.outputs.some((item, index) => item.blob?.size !== normalized[index].blob.size || item.filename !== normalized[index].filename)) {
      throw new Error('出力項目を端末内に保存できませんでした。前の出力は保持されています。');
    }
    return verified.outputs.map((item) => ({ ...item }));
  } finally { database.close?.(); }
}

export async function sendToolOutput(options, dependencies) {
  try {
    const staged = await stageToolOutput(options, dependencies);
    const locationRef = dependencies?.locationRef || globalThis.location;
    if (options?.returnOutputId === true) {
      const database = await openDatabase(dependencies?.indexedDBRef || globalThis.indexedDB);
      try {
        await updateStoredRecord(database, staged.id, (record) => {
          const url = new URL(record.returnUrl, locationRef.origin);
          url.searchParams.set('outputId', staged.id);
          record.returnUrl = safeReturnUrl(`${url.pathname}${url.search}${url.hash}`, locationRef.origin);
        }, dependencies?.now || Date.now);
      } finally { database.close?.(); }
    }
    if (typeof locationRef?.assign !== 'function') return { ok: false, reason: 'navigation_unavailable', staged };
    locationRef.assign(staged.url);
    return { ok: true, ...staged };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Flush pending editor autosaves before leaving, while keeping a file-save fallback. */
export async function sendToolOutputAfterSaving(options, workspace, isCurrent = () => true, dependencies) {
  try {
    try { await workspace?.assertCanSave?.(); }
    catch (error) { return { ok: false, reason: 'permission_blocked', error }; }
    if (workspace?.dirty) {
      if (typeof workspace.save !== 'function') throw new Error('編集内容を保存できません。元の画面で保存してからもう一度お試しください。');
      await workspace.save();
      if (workspace.dirty) throw new Error('編集内容の保存がまだ完了していません。元の画面で保存してからもう一度お試しください。');
    }
    if (!isCurrent()) return { ok: false, reason: 'source_changed' };
    const resolvedOptions = typeof options?.returnUrl === 'function'
      ? { ...options, returnUrl: options.returnUrl() }
      : options;
    return await sendToolOutput(resolvedOptions, dependencies);
  } catch (error) {
    return { ok: false, reason: 'project_save_failed', error };
  }
}

export const OUTPUT_RETURN_PATHS = RETURN_PATHS;
export const OUTPUT_MIME_EXTENSIONS = MIME_EXTENSIONS;
