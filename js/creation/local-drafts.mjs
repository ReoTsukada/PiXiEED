import { hashCanonical, validateAsset } from './asset-contract.mjs';

const DB_NAME = 'pixieed-creation-drafts-v1';
const STORE_NAME = 'drafts';

/** Another save (another tab, or a second save from this page) got there first. Nothing was written. */
export class LocalDraftConflictError extends Error {
  constructor() { super('別の画面でこの作品が保存されました。最新の保存版を開き直してから保存してください。今の編集内容は画面に残っています。'); this.name = 'LocalDraftConflictError'; this.code = 'LOCAL_DRAFT_CONFLICT'; }
}

/** The device ran out of storage. Nothing was written; the edit stays on screen. */
export class LocalDraftQuotaError extends Error {
  constructor() { super('端末の空き容量が足りないため保存できませんでした。今の編集内容は画面に残っています。'); this.name = 'LocalDraftQuotaError'; this.code = 'LOCAL_DRAFT_QUOTA'; }
}

const headOf = (record) => record?.revisions?.at(-1)?.revisionId ?? null;
const isQuota = (error) => error?.name === 'QuotaExceededError' || error?.code === 22;

function copy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryDraftAdapter() {
  const records = new Map();
  return {
    async get(id) { return records.has(id) ? copy(records.get(id)) : null; },
    async put(record) { records.set(record.draftId, copy(record)); },
    /** Write `record` only while the stored head is still `expectedHead` (null: no record yet). */
    async compareAndSwap(draftId, expectedHead, record) {
      if (headOf(records.get(draftId)) !== expectedHead) throw new LocalDraftConflictError();
      records.set(draftId, copy(record));
    }
  };
}

export function createIndexedDbDraftAdapter(indexedDb = globalThis.indexedDB, dbName = DB_NAME) {
  if (!indexedDb) throw new Error('IndexedDB is unavailable');
  const database = new Promise((resolve, reject) => {
    const request = indexedDb.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'draftId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local draft storage'));
  });
  return {
    async get(id) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ? copy(request.result) : null);
        request.onerror = () => reject(request.error || new Error('Could not read local draft'));
      });
    },
    async put(record) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(copy(record));
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(isQuota(transaction.error) ? new LocalDraftQuotaError() : transaction.error || new Error('Could not save local draft'));
      });
    },
    /** Read the head and write in one transaction, so two saves can never both append to the same head. */
    async compareAndSwap(draftId, expectedHead, record) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite'); const store = transaction.objectStore(STORE_NAME);
        let conflict = false;
        const request = store.get(draftId);
        request.onsuccess = () => {
          if (headOf(request.result) !== expectedHead) { conflict = true; transaction.abort(); return; }
          try { store.put(copy(record)); } catch { transaction.abort(); }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(conflict ? new LocalDraftConflictError() : isQuota(transaction.error) ? new LocalDraftQuotaError() : transaction.error || new Error('Could not save local draft'));
      });
    }
  };
}

async function validateRecord(record) {
  if (!record || record.schemaVersion !== 1 || typeof record.draftId !== 'string' || !Array.isArray(record.revisions) || !record.revisions.length) throw new TypeError('Invalid or unsupported local draft');
  for (const revision of record.revisions) {
    if (revision.schemaVersion !== 1 || typeof revision.revisionId !== 'string' || !revision.document || typeof revision.document !== 'object') throw new TypeError('Invalid local draft revision');
    const { documentHash, ...payload } = revision;
    if (!/^[a-f0-9]{64}$/.test(documentHash) || revision.hashScheme !== 'sha256-canonical-v1' || !payload.asset) throw new TypeError('Invalid local draft hash metadata');
    validateAsset(payload.asset);
    if (payload.asset.hashScheme !== 'sha256-canonical-v1' || payload.asset.contentHash !== documentHash || payload.asset.revisionId !== revision.revisionId || payload.asset.assetId !== record.assetId) throw new TypeError('Local draft content does not match its immutable revision');
    if (await hashCanonical(revision.document) !== documentHash) throw new TypeError('Local draft document hash does not match saved content');
  }
  return record;
}

export function createLocalDraftStore(adapter = createIndexedDbDraftAdapter(), { idFactory = () => globalThis.crypto.randomUUID() } = {}) {
  async function load(draftId) {
    const record = await adapter.get(draftId);
    if (!record) return null;
    await validateRecord(record);
    return copy(record.revisions.at(-1));
  }

  // Adapters without an atomic swap (older test doubles) get a read-check-write fallback.
  const swap = typeof adapter.compareAndSwap === 'function'
    ? (draftId, head, record) => adapter.compareAndSwap(draftId, head, record)
    : async (draftId, head, record) => { if (headOf(await adapter.get(draftId)) !== head) throw new LocalDraftConflictError(); await adapter.put(record); };

  /**
   * Append a revision. `expectedRevisionId` is the saved version the edit started from
   * (null for a new draft): when another save has moved the head since, nothing is written and
   * LocalDraftConflictError is thrown so the page can keep the edit. Without it, the save is
   * appended to whatever is newest, retrying if another save lands in between, so no history
   * is ever dropped.
   */
  async function save({ draftId = idFactory(), kind, ownerId = 'local-owner', document, source = { type: 'hand_drawn', assetId: null, revisionId: null }, preview = null, expectedRevisionId }) {
    if (typeof draftId !== 'string' || !draftId || !document || typeof document !== 'object') throw new TypeError('Draft id and document are required');
    if (expectedRevisionId !== undefined && expectedRevisionId !== null && typeof expectedRevisionId !== 'string') throw new TypeError('expectedRevisionId must be a revision id or null');
    const documentHash = await hashCanonical(document);
    const snapshot = copy(document);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const previous = await adapter.get(draftId);
      if (previous) await validateRecord(previous);
      const head = headOf(previous);
      if (expectedRevisionId !== undefined && expectedRevisionId !== head) throw new LocalDraftConflictError();
      const revisionId = idFactory();
      const asset = validateAsset({
        schemaVersion: 1, assetId: previous?.assetId || idFactory(), revisionId,
        contentHash: documentHash, hashScheme: 'sha256-canonical-v1', kind, source,
        owner: { type: 'local', id: ownerId }, visibility: 'draft', reusePermission: 'owner_only', preview
      });
      const revision = { schemaVersion: 1, revisionId, hashScheme: 'sha256-canonical-v1', documentHash, asset, document: snapshot };
      const record = { schemaVersion: 1, draftId, assetId: asset.assetId, revisions: [...(previous?.revisions || []), revision] };
      await validateRecord(record);
      try { await swap(draftId, head, record); return copy(revision); }
      catch (error) {
        if (error instanceof LocalDraftConflictError && expectedRevisionId === undefined) continue;
        if (isQuota(error)) throw new LocalDraftQuotaError();
        throw error;
      }
    }
    throw new LocalDraftConflictError();
  }

  /** The newest saved revision id, to pass back as `expectedRevisionId`. */
  async function head(draftId) { return headOf(await adapter.get(draftId)); }

  return Object.freeze({ save, load, head });
}
