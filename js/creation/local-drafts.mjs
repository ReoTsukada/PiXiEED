import { hashCanonical, validateAsset } from './asset-contract.mjs';

const DB_NAME = 'pixieed-creation-drafts-v1';
const STORE_NAME = 'drafts';

function copy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryDraftAdapter() {
  const records = new Map();
  return {
    async get(id) { return records.has(id) ? copy(records.get(id)) : null; },
    async put(record) { records.set(record.draftId, copy(record)); }
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
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Could not save local draft'));
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

  async function save({ draftId = idFactory(), kind, ownerId = 'local-owner', document, source = { type: 'hand_drawn', assetId: null, revisionId: null }, preview = null }) {
    if (typeof draftId !== 'string' || !draftId || !document || typeof document !== 'object') throw new TypeError('Draft id and document are required');
    const previous = await adapter.get(draftId);
    if (previous) await validateRecord(previous);
    const documentHash = await hashCanonical(document);
    const revisionId = idFactory();
    const asset = validateAsset({
      schemaVersion: 1, assetId: previous?.assetId || idFactory(), revisionId,
      contentHash: documentHash, hashScheme: 'sha256-canonical-v1', kind, source,
      owner: { type: 'local', id: ownerId }, visibility: 'draft', reusePermission: 'owner_only', preview
    });
    const revision = { schemaVersion: 1, revisionId, hashScheme: 'sha256-canonical-v1', documentHash, asset, document: copy(document) };
    const record = { schemaVersion: 1, draftId, assetId: asset.assetId, revisions: [...(previous?.revisions || []), revision] };
    await validateRecord(record);
    await adapter.put(record);
    return copy(revision);
  }

  return Object.freeze({ save, load });
}
