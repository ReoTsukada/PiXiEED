import { decodePxd, encodePxd } from './pxd-codec.mjs';

const DATABASE_NAME = 'pixieed-pxd-v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'projects';
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export class PxdStoreError extends Error {
  constructor(code, message = code) { super(message); this.name = 'PxdStoreError'; this.code = code; }
}

export class PxdStoreConflictError extends PxdStoreError {
  constructor() { super('PXD_STORE_CONFLICT', '別のタブで作品が更新されました。最新の保存版を開いてから、変更を保存してください。今の編集内容は残っています。'); this.name = 'PxdStoreConflictError'; }
}

function copyRecord(record) {
  if (!record) return null;
  return { ...record, bytes: new Uint8Array(record.bytes) };
}

function randomRevisionId() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `revision-${id}`;
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !ID_RE.test(projectId)) throw new PxdStoreError('PXD_PROJECT_ID_INVALID');
}

export function createMemoryPxdAdapter({ failWrites = false } = {}) {
  const rows = new Map();
  return {
    async read(projectId, revisionId) {
      const row = rows.get(projectId);
      if (!row) return null;
      if (revisionId === undefined) return copyRecord(row.history.at(-1));
      return copyRecord(row.history.find((record) => record.revisionId === revisionId));
    },
    async compareAndSwap(projectId, expectedRevisionId, record) {
      if (failWrites) throw new PxdStoreError('PXD_STORE_WRITE_FAILED');
      const row = rows.get(projectId); const actual = row?.history.at(-1)?.revisionId ?? null;
      if (actual !== expectedRevisionId) throw new PxdStoreConflictError();
      if (row?.history.some((item) => item.revisionId === record.revisionId)) throw new PxdStoreError('PXD_REVISION_DUPLICATE');
      const history = [...(row?.history ?? []), copyRecord(record)];
      rows.set(projectId, { history });
    },
    async listRevisionIds(projectId) { return (rows.get(projectId)?.history ?? []).map((item) => item.revisionId); }
  };
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) throw new PxdStoreError('PXD_IDB_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
    };
    request.onerror = () => reject(new PxdStoreError('PXD_IDB_OPEN_FAILED'));
    request.onblocked = () => reject(new PxdStoreError('PXD_IDB_BLOCKED'));
    request.onsuccess = () => resolve(request.result);
  });
}

function createIndexedDbAdapter(indexedDB = globalThis.indexedDB) {
  let databasePromise;
  const db = () => databasePromise ??= openDatabase(indexedDB);
  return {
    async read(projectId, revisionId) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(projectId);
        let result = null;
        request.onsuccess = () => {
          const row = request.result;
          const record = !row ? null : revisionId === undefined ? row.history?.at(-1) : row.history?.find((item) => item.revisionId === revisionId);
          result = copyRecord(record);
        };
        request.onerror = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
      });
    },
    async compareAndSwap(projectId, expectedRevisionId, record) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME); const request = store.get(projectId);
        let conflict = false; let failure = false;
        request.onsuccess = () => {
          const row = request.result; const current = row?.history?.at(-1)?.revisionId ?? null;
          if (current !== expectedRevisionId) { conflict = true; transaction.abort(); return; }
          try {
            if (row?.history?.some((item) => item.revisionId === record.revisionId)) { failure = true; transaction.abort(); return; }
            const history = [...(row?.history ?? []), copyRecord(record)];
            store.put({ projectId, history });
          } catch { failure = true; transaction.abort(); }
        };
        request.onerror = () => { failure = true; transaction.abort(); };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(conflict ? new PxdStoreConflictError() : new PxdStoreError('PXD_IDB_WRITE_FAILED'));
        transaction.onerror = () => { failure = true; };
      });
    }
  };
}

export function createPxdStore({ adapter, idFactory = randomRevisionId } = {}) {
  const persistence = adapter ?? createIndexedDbAdapter();
  if (typeof persistence.read !== 'function' || typeof persistence.compareAndSwap !== 'function' || typeof idFactory !== 'function') throw new PxdStoreError('PXD_STORE_ADAPTER_INVALID');
  return {
    async load(projectId, revisionId) {
      assertProjectId(projectId);
      if (revisionId !== undefined) assertProjectId(revisionId);
      const record = await persistence.read(projectId, revisionId);
      if (!record) return null;
      const project = await decodePxd(record.bytes);
      if (project.projectId !== projectId || project.revisionId !== record.revisionId) throw new PxdStoreError('PXD_STORE_RECORD_INVALID');
      return project;
    },
    async save(project, { expectedRevisionId = null } = {}) {
      assertProjectId(project?.projectId);
      if (expectedRevisionId !== null) assertProjectId(expectedRevisionId);
      const revisionId = idFactory(project.projectId);
      assertProjectId(revisionId);
      if (revisionId === project.revisionId) throw new PxdStoreError('PXD_REVISION_DUPLICATE');
      const savedProject = { ...project, revisionId };
      const bytes = await encodePxd(savedProject);
      await persistence.compareAndSwap(project.projectId, expectedRevisionId, { revisionId, bytes });
      return { ...savedProject, entries: savedProject.entries.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })) };
    }
  };
}
