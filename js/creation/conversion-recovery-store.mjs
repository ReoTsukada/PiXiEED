const DB_NAME = 'pixieed-conversion-recovery-v1';
const STORE_NAME = 'workspaces';
const SCHEMA_VERSION = 1;
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_TEXT = 32 * 1024 * 1024;
const MAX_CONTAINER_ENTRIES = 1024;
const MAX_DEPTH = 100;

export class ConversionRecoveryConflictError extends Error {
  constructor() { super('別の画面で復旧データが更新されました。最新の保存版を読み込んでください。'); this.name = 'ConversionRecoveryConflictError'; this.code = 'CONVERSION_RECOVERY_CONFLICT'; }
}

export class ConversionRecoveryQuotaError extends Error {
  constructor(cause) { super('端末の空き容量が足りないため復旧データを保存できませんでした。', { cause }); this.name = 'ConversionRecoveryQuotaError'; this.code = 'CONVERSION_RECOVERY_QUOTA'; }
}

const copy = value => structuredClone(value);
const safeId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
const quotaError = error => error?.name === 'QuotaExceededError' || error?.code === 22;
const abortError = () => { const error = new Error('保存を中止しました。'); error.name = 'AbortError'; return error; };

function validateSnapshot(snapshot) {
  let bytes = 0, text = 0, nodes = 0;
  const seen = new WeakSet();
  function visit(value, depth) {
    if (++nodes > 100_000 || depth > MAX_DEPTH) throw new RangeError('復旧データの構造が大きすぎます。');
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'string') { text += value.length; if (text > MAX_TEXT) throw new RangeError('復旧データ内の文章が上限を超えています。'); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('復旧データに不正な数値があります。'); return; }
    if (typeof value !== 'object') throw new TypeError('復旧データに保存できない値があります。');
    if (seen.has(value)) throw new TypeError('復旧データに循環参照があります。');
    if (typeof File !== 'undefined' && value instanceof File) throw new TypeError('復旧データにはファイル本体ではなく正規化したローカルデータを渡してください。');
    if (typeof Blob !== 'undefined' && value instanceof Blob) { bytes += value.size; if (bytes > MAX_BYTES) throw new RangeError('復旧データは合計256MBまで保存できます。'); return; }
    if (value instanceof ArrayBuffer) { bytes += value.byteLength; if (bytes > MAX_BYTES) throw new RangeError('復旧データは合計256MBまで保存できます。'); return; }
    if (ArrayBuffer.isView(value)) { bytes += value.byteLength; if (bytes > MAX_BYTES) throw new RangeError('復旧データは合計256MBまで保存できます。'); return; }
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new TypeError('復旧データはプレーンなオブジェクトである必要があります。');
    seen.add(value);
    const keys = Object.keys(value);
    if (keys.length > MAX_CONTAINER_ENTRIES) throw new RangeError('復旧データの項目数が上限を超えています。');
    for (const key of keys) { text += key.length; if (text > MAX_TEXT) throw new RangeError('復旧データ内の文章が上限を超えています。'); visit(value[key], depth + 1); }
    seen.delete(value);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('復旧データの形式が正しくありません。');
  visit(snapshot, 0);
}

function validateRecord(record, id) {
  if (!record || record.schemaVersion !== SCHEMA_VERSION || record.id !== id || !safeId(record.id)
    || typeof record.revision !== 'string' || !record.revision || !Number.isFinite(record.updatedAt)
    || !record.snapshot || typeof record.snapshot !== 'object') throw new TypeError('復旧データの保存版に対応していないか、壊れています。');
  validateSnapshot(record.snapshot);
}

function openDatabase(indexedDBRef) {
  if (!indexedDBRef?.open) return Promise.reject(new Error('IndexedDBを利用できません。'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDBRef.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onblocked = () => { if (!settled) { settled = true; reject(new Error('復旧データベースが別の画面で使用中です。')); } };
    request.onerror = () => { if (!settled) { settled = true; reject(request.error || new Error('復旧データベースを開けませんでした。')); } };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (settled) db.close(); else { settled = true; resolve(db); }
    };
  });
}

async function withDatabase(indexedDBRef, operation) {
  const db = await openDatabase(indexedDBRef);
  try { return await operation(db); } finally { db.close(); }
}

export function createIndexedDbConversionRecoveryAdapter(indexedDBRef = globalThis.indexedDB) {
  return Object.freeze({
    async load(id) {
      if (!safeId(id)) throw new TypeError('復旧IDが正しくありません。');
      return withDatabase(indexedDBRef, db => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        let result = null;
        request.onsuccess = () => { result = request.result ? copy(request.result) : null; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('復旧データを読み込めませんでした。'));
      }));
    },
    async compareAndSwap(id, expectedRevision, record, { signal } = {}) {
      if (!safeId(id)) throw new TypeError('復旧IDが正しくありません。');
      if (signal?.aborted) throw abortError();
      validateRecord(record, id);
      const storedRecord = copy(record);
      try {
        return await withDatabase(indexedDBRef, db => new Promise((resolve, reject) => {
          if (signal?.aborted) { reject(abortError()); return; }
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          let conflict = false, failure = null, completed = false;
          const abort = () => { if (!completed) { try { tx.abort(); } catch {} } };
          const cleanup = () => signal?.removeEventListener('abort', abort);
          const request = store.get(id);
          request.onsuccess = () => {
            if (signal?.aborted) { abort(); return; }
            const currentRevision = request.result?.revision ?? null;
            if (currentRevision !== expectedRevision) { conflict = true; abort(); return; }
            try {
              const put = store.put(storedRecord);
              put.onerror = () => { failure = put.error || failure; };
            } catch (error) { failure = error; abort(); }
          };
          signal?.addEventListener('abort', abort, { once: true });
          tx.oncomplete = () => { completed = true; cleanup(); resolve(); };
          tx.onerror = tx.onabort = () => {
            completed = true; cleanup();
            const error = failure || tx.error || request.error;
            reject(conflict ? new ConversionRecoveryConflictError() : signal?.aborted ? abortError() : quotaError(error) ? new ConversionRecoveryQuotaError(error) : error || new Error('復旧データを保存できませんでした。'));
          };
        }));
      } catch (error) {
        if (error instanceof ConversionRecoveryConflictError || error instanceof ConversionRecoveryQuotaError || error?.name === 'AbortError') throw error;
        if (quotaError(error)) throw new ConversionRecoveryQuotaError(error);
        throw error;
      }
    },
  });
}

export function createMemoryConversionRecoveryAdapter() {
  const records = new Map();
  return Object.freeze({
    async load(id) { return records.has(id) ? copy(records.get(id)) : null; },
    async compareAndSwap(id, expectedRevision, record, { signal } = {}) {
      if (signal?.aborted) throw abortError();
      validateRecord(record, id);
      if ((records.get(id)?.revision ?? null) !== expectedRevision) throw new ConversionRecoveryConflictError();
      if (signal?.aborted) throw abortError();
      records.set(id, copy(record));
    },
  });
}

export function createConversionRecoveryStore(adapter, { idFactory = () => globalThis.crypto.randomUUID(), now = () => Date.now() } = {}) {
  if (!adapter || typeof adapter.load !== 'function' || typeof adapter.compareAndSwap !== 'function') throw new TypeError('復旧保存アダプターが必要です。');
  return Object.freeze({
    async load(id) {
      if (!safeId(id)) throw new TypeError('復旧IDが正しくありません。');
      const record = await adapter.load(id);
      if (record === null) return null;
      validateRecord(record, id);
      return copy(record);
    },
    async save(id, snapshot, { expectedRevision = null, signal } = {}) {
      if (!safeId(id)) throw new TypeError('復旧IDが正しくありません。');
      if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !expectedRevision)) throw new TypeError('復旧版番号が正しくありません。');
      if (signal?.aborted) throw abortError();
      validateSnapshot(snapshot);
      const frozenSnapshot = copy(snapshot); // Synchronous: capture the user state before any database wait.
      const record = { schemaVersion: SCHEMA_VERSION, id, revision: idFactory(), updatedAt: now(), snapshot: frozenSnapshot };
      validateRecord(record, id);
      await adapter.compareAndSwap(id, expectedRevision, record, { signal });
      return copy(record);
    },
  });
}
