import { decodePxd, encodePxd } from './pxd-codec.mjs';
import { sanitizeProjectTitle, summarizeProject } from './project-catalog.mjs?rev=20260930-shared-canvas-5';

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
  const bytes = record.bytes instanceof Uint8Array ? new Uint8Array(record.bytes)
    : record.bytes instanceof ArrayBuffer ? new Uint8Array(record.bytes.slice(0)) : new Uint8Array(0);
  let summary = record.summary;
  if (record.summary && typeof record.summary === 'object') {
    try {
      summary = { ...structuredClone(record.summary), thumbnail: record.summary.thumbnail
        ? { ...record.summary.thumbnail, rgb: new Uint8Array(record.summary.thumbnail.rgb ?? []) }
        : null };
    } catch { summary = undefined; }
  }
  return { ...record, bytes, ...(summary === undefined ? {} : { summary }) };
}

function recordDate(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 64) { const date = Date.parse(value); if (Number.isFinite(date)) return date; }
  return null;
}

function validSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)
      || typeof summary.name !== 'string' || summary.name !== sanitizeProjectTitle(summary.name)
      || !(summary.width === null || Number.isSafeInteger(summary.width) && summary.width > 0)
      || !(summary.height === null || Number.isSafeInteger(summary.height) && summary.height > 0)
      || typeof summary.hasDrawing !== 'boolean' || typeof summary.hasAudio !== 'boolean'
      || !(summary.createdAt === null || Number.isFinite(summary.createdAt))
      || !(summary.lastMode === null || typeof summary.lastMode === 'string' && summary.lastMode.length <= 32)) return false;
  if (summary.thumbnail === null) return true;
  const thumbnail = summary.thumbnail;
  return Boolean(thumbnail && Number.isSafeInteger(thumbnail.width) && thumbnail.width > 0 && thumbnail.width <= 28
    && Number.isSafeInteger(thumbnail.height) && thumbnail.height > 0 && thumbnail.height <= 28
    && thumbnail.rgb instanceof Uint8Array && thumbnail.rgb.length === thumbnail.width * thumbnail.height * 3
    && thumbnail.rgb.byteLength <= 28 * 28 * 3);
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
    async listLatest() {
      return [...rows.entries()].flatMap(([projectId, row]) => {
        const latest = copyRecord(row.history.at(-1));
        return latest ? [{ ...latest, projectId }] : [];
      });
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
    async listLatest() {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        let result = [];
        request.onsuccess = () => {
          result = (request.result ?? []).flatMap((row) => {
            const latest = copyRecord(row.history?.at(-1));
            return latest ? [{ ...latest, projectId: row.projectId }] : [];
          });
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
      const summary = await summarizeProject(savedProject);
      await persistence.compareAndSwap(project.projectId, expectedRevisionId, { projectId: project.projectId, revisionId, bytes, updatedAt: Date.now(), summary });
      return { ...savedProject, entries: savedProject.entries.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })) };
    },
    async listProjects() {
      if (typeof persistence.listLatest !== 'function') throw new PxdStoreError('PXD_STORE_LIST_UNAVAILABLE');
      const records = await persistence.listLatest();
      if (!Array.isArray(records)) throw new PxdStoreError('PXD_STORE_LIST_INVALID');
      const projects = []; const errors = [];
      for (const record of records) {
        const projectId = record?.projectId;
        const errorRecord = { projectId: typeof projectId === 'string' ? projectId : null,
          ...(typeof record?.revisionId === 'string' ? { revisionId: record.revisionId } : {}) };
        try {
          assertProjectId(projectId);
          assertProjectId(record.revisionId);
          const project = await decodePxd(record.bytes);
          if (project.projectId !== projectId || project.revisionId !== record.revisionId) throw new PxdStoreError('PXD_STORE_RECORD_INVALID');
          const summary = validSummary(record.summary) ? record.summary : await summarizeProject(project);
          const updatedAt = recordDate(record.updatedAt) ?? summary.createdAt ?? 0;
          projects.push({ projectId, revisionId: record.revisionId, updatedAt,
            summary: { ...summary, thumbnail: summary.thumbnail
              ? { ...summary.thumbnail, rgb: new Uint8Array(summary.thumbnail.rgb) }
              : null } });
        } catch (error) {
          errors.push({ ...errorRecord, code: error?.code || 'PXD_STORE_RECORD_INVALID' });
        }
      }
      projects.sort((left, right) => right.updatedAt - left.updatedAt || left.projectId.localeCompare(right.projectId));
      return { projects, errors };
    }
  };
}
