import { scheduleLocalWorkSave } from './local-work-save-hook.mjs';
import { decodePxd, encodePxd } from './pxd-codec.mjs';
import { sanitizeProjectTitle, summarizeProject } from './project-catalog.mjs?rev=20261016-color-capability-1';

const DATABASE_NAME = 'pixieed-pxd-v1';
const DATABASE_VERSION = 2;
const STORE_NAME = 'projects';
const CATALOG_NAME = 'project-catalog';
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const isQuotaError = (error) => error?.name === 'QuotaExceededError' || error?.code === 22;

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
  return { ...record, bytes, ...(summary === undefined ? {} : { summary }), ...(Number.isFinite(record.deletedAt) ? { deletedAt: record.deletedAt } : {}) };
}

// Catalog rows never contain PXD bytes or revision histories. This is a display
// index, not an authorization/integrity check: opening a work still decodes it.
function catalogRecord(row) {
  const latest = row?.history?.at(-1);
  if (!latest) return null;
  return { projectId: row.projectId, revisionId: latest.revisionId,
    updatedAt: latest.updatedAt ?? null, summary: latest.summary ?? null,
    ...(Number.isFinite(row.deletedAt) ? { deletedAt: row.deletedAt } : {}) };
}

function assertPurgeItems(items) {
  if (!Array.isArray(items) || !items.length) throw new PxdStoreError('PXD_STORE_DELETE_EMPTY');
  const seen = new Set();
  for (const item of items) {
    assertProjectId(item?.projectId); assertProjectId(item?.expectedRevisionId);
    if (seen.has(item.projectId)) throw new PxdStoreError('PXD_STORE_DELETE_DUPLICATE');
    seen.add(item.projectId);
  }
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
  const rows = new Map(); const purgedIds = new Set();
  return {
    async read(projectId, revisionId) {
      const row = rows.get(projectId);
      if (!row || row.deletedAt) return null;
      if (revisionId === undefined) return copyRecord(row.history.at(-1));
      return copyRecord(row.history.find((record) => record.revisionId === revisionId));
    },
    async listCatalog() {
      return [...rows.entries()].flatMap(([projectId, row]) => {
        const item = catalogRecord({ ...row, projectId });
        return item ? [structuredClone(item)] : [];
      });
    },
    async readLatest(projectId) {
      const row = rows.get(projectId); const latest = copyRecord(row?.history.at(-1));
      return latest ? { ...latest, projectId, ...(Number.isFinite(row.deletedAt) ? { deletedAt: row.deletedAt } : {}) } : null;
    },
    async purgeProjects(items) {
      assertPurgeItems(items);
      if (failWrites) throw new PxdStoreError('PXD_STORE_WRITE_FAILED');
      for (const { projectId, expectedRevisionId } of items) {
        if (rows.get(projectId)?.history.at(-1)?.revisionId !== expectedRevisionId) throw new PxdStoreConflictError();
      }
      for (const { projectId } of items) { rows.delete(projectId); purgedIds.add(projectId); }
    },
    async listLatest() {
      return [...rows.entries()].flatMap(([projectId, row]) => {
        const latest = copyRecord(row.history.at(-1));
        return latest ? [{ ...latest, projectId, ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}) }] : [];
      });
    },
    async compareAndSwap(projectId, expectedRevisionId, record) {
      if (failWrites) throw new PxdStoreError('PXD_STORE_WRITE_FAILED');
      const row = rows.get(projectId); const actual = row?.history.at(-1)?.revisionId ?? null;
      if (row?.deletedAt) throw new PxdStoreError('PXD_PROJECT_DELETED', 'このPXDプロジェクトは削除済みです。復元してから保存してください。');
      if (actual !== expectedRevisionId) throw new PxdStoreConflictError();
      if (purgedIds.has(projectId)) throw new PxdStoreError('PXD_PROJECT_DELETED', 'この作品は完全に削除されています。別の作品として複製してください。');
      if (row?.history.some((item) => item.revisionId === record.revisionId)) throw new PxdStoreError('PXD_REVISION_DUPLICATE');
      const history = [...(row?.history ?? []), copyRecord(record)];
      rows.set(projectId, { history });
    },
    async setDeleted(projectId, expectedRevisionId, deletedAt, restoreRecord = null) {
      const row = rows.get(projectId); const actual = row?.history.at(-1)?.revisionId ?? null;
      if (!row || actual !== expectedRevisionId) throw new PxdStoreConflictError();
      if (deletedAt === null && !row.deletedAt) throw new PxdStoreError('PXD_PROJECT_NOT_DELETED');
      const next = { ...row };
      if (deletedAt === null) {
        if (!restoreRecord || restoreRecord.projectId !== projectId || row.history.some((item) => item.revisionId === restoreRecord.revisionId)) throw new PxdStoreError('PXD_REVISION_DUPLICATE');
        next.history = [...row.history, copyRecord(restoreRecord)]; delete next.deletedAt;
      } else next.deletedAt = deletedAt;
      rows.set(projectId, next);
    },
    async listRevisionIds(projectId) { return (rows.get(projectId)?.history ?? []).map((item) => item.revisionId); }
  };
}

function openDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) throw new PxdStoreError('PXD_IDB_UNAVAILABLE');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let abandoned = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      if (!database.objectStoreNames.contains(CATALOG_NAME)) {
        const catalog = database.createObjectStore(CATALOG_NAME, { keyPath: 'projectId' });
        // One cursor pass on upgrade, in the same atomic versionchange transaction.
        // Originals (including deleted works and every historical revision) stay intact.
        const cursor = request.transaction.objectStore(STORE_NAME).openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const metadata = catalogRecord(current.value);
          if (metadata) catalog.put(metadata);
          current.continue();
        };
      }
    };
    request.onerror = () => reject(new PxdStoreError('PXD_IDB_OPEN_FAILED'));
    request.onblocked = () => {
      abandoned = true;
      reject(new PxdStoreError('PXD_IDB_BLOCKED', '別のタブで以前の作品保存が開いています。そのタブを閉じて、もう一度一覧を開いてください。'));
    };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      resolve(request.result);
    };
  });
}

function createIndexedDbAdapter(indexedDB = globalThis.indexedDB) {
  let databasePromise;
  const db = () => {
    if (!databasePromise) {
      databasePromise = openDatabase(indexedDB).then(database => {
        database.onversionchange = () => { database.close(); databasePromise = null; };
        database.onclose = () => { databasePromise = null; };
        return database;
      }).catch(error => { databasePromise = null; throw error; });
    }
    return databasePromise;
  };
  return {
    async read(projectId, revisionId) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(projectId);
        let result = null;
        request.onsuccess = () => {
          const row = request.result;
          const record = !row || row.deletedAt ? null : revisionId === undefined ? row.history?.at(-1) : row.history?.find((item) => item.revisionId === revisionId);
          result = copyRecord(record);
        };
        request.onerror = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
      });
    },
    async readLatest(projectId) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(projectId); let result = null;
        request.onsuccess = () => {
          const row = request.result; const latest = copyRecord(row?.history?.at(-1));
          result = latest ? { ...latest, projectId, ...(Number.isFinite(row.deletedAt) ? { deletedAt: row.deletedAt } : {}) } : null;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
      });
    },
    async listCatalog() {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(CATALOG_NAME, 'readonly');
        const request = transaction.objectStore(CATALOG_NAME).getAll(); let result = [];
        request.onsuccess = () => { result = request.result ?? []; };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(new PxdStoreError('PXD_IDB_READ_FAILED'));
      });
    },
    async cacheSummary(projectId, revisionId, summary) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(CATALOG_NAME, 'readwrite');
        const catalog = transaction.objectStore(CATALOG_NAME); const request = catalog.get(projectId);
        request.onsuccess = () => {
          const row = request.result;
          // A save/delete from another tab wins over this delayed legacy decode.
          if (row?.revisionId === revisionId) catalog.put({ ...row, summary });
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(new PxdStoreError('PXD_IDB_WRITE_FAILED'));
      });
    },
    async purgeProjects(items) {
      assertPurgeItems(items);
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME, CATALOG_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME); const catalog = transaction.objectStore(CATALOG_NAME);
        let pending = items.length; let conflict = false;
        for (const { projectId, expectedRevisionId } of items) {
          const request = store.get(projectId);
          request.onsuccess = () => {
            if (conflict) return;
            if (request.result?.history?.at(-1)?.revisionId !== expectedRevisionId) { conflict = true; transaction.abort(); return; }
            if (--pending) return;
            for (const item of items) {
              store.delete(item.projectId);
              // Keep only the ID collision guard; never retain the work, preview or history.
              catalog.put({ projectId: item.projectId, purgedAt: Date.now() });
            }
          };
        }
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(conflict ? new PxdStoreConflictError() : new PxdStoreError('PXD_IDB_WRITE_FAILED'));
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
            return latest ? [{ ...latest, projectId: row.projectId, ...(Number.isFinite(row.deletedAt) ? { deletedAt: row.deletedAt } : {}) }] : [];
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
        const transaction = database.transaction([STORE_NAME, CATALOG_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME); const request = store.get(projectId);
        const marker = transaction.objectStore(CATALOG_NAME).get(projectId);
        let conflict = false; let failure = false; let deleted = false; let purged = false; let writeError = null;
        let rowReady = false; let markerReady = false;
        request.onsuccess = () => { rowReady = true; writeIfReady(); };
        marker.onsuccess = () => { markerReady = true; writeIfReady(); };
        function writeIfReady() {
          if (!rowReady || !markerReady) return;
          const row = request.result; const current = row?.history?.at(-1)?.revisionId ?? null;
          if (current !== expectedRevisionId) { conflict = true; transaction.abort(); return; }
          if (Number.isFinite(marker.result?.purgedAt)) { purged = true; transaction.abort(); return; }
          if (row?.deletedAt) { deleted = true; transaction.abort(); return; }
          try {
            if (row?.history?.some((item) => item.revisionId === record.revisionId)) { failure = true; transaction.abort(); return; }
            const history = [...(row?.history ?? []), copyRecord(record)];
            const next = { projectId, history };
            const write = store.put(next);
            const catalogWrite = transaction.objectStore(CATALOG_NAME).put(catalogRecord(next));
            catalogWrite.onerror = () => { writeError = catalogWrite.error ?? writeError; };
            write.onerror = () => { writeError = write.error ?? writeError; };
          } catch (error) { failure = true; writeError = error; transaction.abort(); }
        };
        request.onerror = () => { failure = true; transaction.abort(); };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(conflict ? new PxdStoreConflictError() : purged ? new PxdStoreError('PXD_PROJECT_DELETED', 'この作品は完全に削除されています。別の作品として複製してください。') : deleted ? new PxdStoreError('PXD_PROJECT_DELETED', 'このPXDプロジェクトは削除済みです。復元してから保存してください。') : isQuotaError(writeError) || isQuotaError(transaction.error) ? new PxdStoreError('PXD_STORE_QUOTA', '端末の空き容量が足りないため保存できませんでした。今の編集内容は残っています。空き容量を確保してから、もう一度保存してください。') : new PxdStoreError('PXD_IDB_WRITE_FAILED'));
        transaction.onerror = (event) => { failure = true; if (!isQuotaError(writeError)) writeError = transaction.error ?? event?.target?.error ?? writeError; };
      });
    },
    async setDeleted(projectId, expectedRevisionId, deletedAt, restoreRecord = null) {
      const database = await db();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME, CATALOG_NAME], 'readwrite'); const store = transaction.objectStore(STORE_NAME);
        const request = store.get(projectId); let conflict = false; let notDeleted = false; let failure = false;
        request.onsuccess = () => {
          const row = request.result; const current = row?.history?.at(-1)?.revisionId ?? null;
          if (!row || current !== expectedRevisionId) { conflict = true; transaction.abort(); return; }
          if (deletedAt === null && !row.deletedAt) { notDeleted = true; transaction.abort(); return; }
          const next = { ...row };
          if (deletedAt === null) {
            if (!restoreRecord || restoreRecord.projectId !== projectId || row.history?.some((item) => item.revisionId === restoreRecord.revisionId)) { failure = true; transaction.abort(); return; }
            next.history = [...(row.history ?? []), copyRecord(restoreRecord)]; delete next.deletedAt;
          } else next.deletedAt = deletedAt;
          store.put(next);
          transaction.objectStore(CATALOG_NAME).put(catalogRecord(next));
        };
        request.onerror = () => { failure = true; transaction.abort(); };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(conflict ? new PxdStoreConflictError() : notDeleted ? new PxdStoreError('PXD_PROJECT_NOT_DELETED') : failure ? new PxdStoreError('PXD_REVISION_DUPLICATE') : new PxdStoreError('PXD_IDB_WRITE_FAILED'));
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
    /** Read one stored revision, including a deleted latest revision for capability checks. */
    async inspectProject(projectId, { revisionId, includeDeleted = false } = {}) {
      assertProjectId(projectId);
      if (revisionId !== undefined) assertProjectId(revisionId);
      let record = null;
      if (includeDeleted && (typeof persistence.readLatest === 'function' || typeof persistence.listLatest === 'function')) {
        record = typeof persistence.readLatest === 'function' ? await persistence.readLatest(projectId) : (await persistence.listLatest()).find((item) => item?.projectId === projectId) ?? null;
        if (record && revisionId !== undefined && record.revisionId !== revisionId) record = null;
      } else record = await persistence.read(projectId, revisionId);
      if (!record) return null;
      const project = await decodePxd(record.bytes);
      if (project.projectId !== projectId || project.revisionId !== record.revisionId) throw new PxdStoreError('PXD_STORE_RECORD_INVALID');
      return { project, revisionId: record.revisionId, ...(Number.isFinite(record.deletedAt) ? { deletedAt: record.deletedAt } : {}) };
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
      void scheduleLocalWorkSave({namespace:'pxd',id:project.projectId,revisionId,existingWork:expectedRevisionId!==null});
      return { ...savedProject, entries: savedProject.entries.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })) };
    },
    async purgeProjects(items) {
      assertPurgeItems(items);
      if (typeof persistence.purgeProjects !== 'function') throw new PxdStoreError('PXD_STORE_DELETE_UNAVAILABLE');
      await persistence.purgeProjects(items);
      return true;
    },
    async purgeProject(projectId, { expectedRevisionId } = {}) {
      return this.purgeProjects([{ projectId, expectedRevisionId }]);
    },
    async deleteProject(projectId, { expectedRevisionId } = {}) {
      assertProjectId(projectId);
      assertProjectId(expectedRevisionId);
      if (typeof persistence.setDeleted !== 'function') throw new PxdStoreError('PXD_STORE_DELETE_UNAVAILABLE');
      await persistence.setDeleted(projectId, expectedRevisionId, Date.now());
      return true;
    },
    async restoreProject(projectId, { expectedRevisionId } = {}) {
      assertProjectId(projectId);
      assertProjectId(expectedRevisionId);
      if (typeof persistence.setDeleted !== 'function') throw new PxdStoreError('PXD_STORE_DELETE_UNAVAILABLE');
      if (typeof persistence.listLatest !== 'function') throw new PxdStoreError('PXD_STORE_DELETE_UNAVAILABLE');
      const record = typeof persistence.readLatest === 'function' ? await persistence.readLatest(projectId) : (await persistence.listLatest()).find((item) => item?.projectId === projectId);
      if (!record || !Number.isFinite(record.deletedAt)) throw new PxdStoreError('PXD_PROJECT_NOT_DELETED');
      if (record.revisionId !== expectedRevisionId) throw new PxdStoreConflictError();
      const project = await decodePxd(record.bytes);
      if (project.projectId !== projectId || project.revisionId !== expectedRevisionId) throw new PxdStoreError('PXD_STORE_RECORD_INVALID');
      const revisionId = idFactory(projectId);
      assertProjectId(revisionId);
      if (revisionId === expectedRevisionId) throw new PxdStoreError('PXD_REVISION_DUPLICATE');
      const restoredProject = { ...project, revisionId };
      const restoreRecord = { projectId, revisionId, bytes: await encodePxd(restoredProject), updatedAt: Date.now(), summary: await summarizeProject(restoredProject) };
      await persistence.setDeleted(projectId, expectedRevisionId, null, restoreRecord);
      return { projectId, revisionId };
    },
    async listProjects({ includeDeleted = false } = {}) {
      if (typeof persistence.listLatest !== 'function' && typeof persistence.listCatalog !== 'function') throw new PxdStoreError('PXD_STORE_LIST_UNAVAILABLE');
      const metadataOnly = typeof persistence.listCatalog === 'function';
      const records = metadataOnly ? await persistence.listCatalog() : await persistence.listLatest();
      if (!Array.isArray(records)) throw new PxdStoreError('PXD_STORE_LIST_INVALID');
      const projects = []; const errors = [];
      for (const record of records) {
        if (Number.isFinite(record?.purgedAt)) continue;
        const projectId = record?.projectId;
        const errorRecord = { projectId: typeof projectId === 'string' ? projectId : null,
          ...(typeof record?.revisionId === 'string' ? { revisionId: record.revisionId } : {}) };
        try {
          assertProjectId(projectId);
          assertProjectId(record.revisionId);
          if (!includeDeleted && Number.isFinite(record.deletedAt)) continue;
          let summary = record.summary;
          if (!metadataOnly || !validSummary(summary) || !Object.hasOwn(summary, 'toolProject')) {
            const full = metadataOnly ? await persistence.readLatest(projectId) : record;
            if (!full || full.revisionId !== record.revisionId) continue; // changed while listing; next refresh picks it up
            const project = await decodePxd(full.bytes);
            if (project.projectId !== projectId || project.revisionId !== record.revisionId) throw new PxdStoreError('PXD_STORE_RECORD_INVALID');
            summary = await summarizeProject(project);
            // Cache failure must not hide an otherwise readable work (e.g. disk full).
            if (metadataOnly && typeof persistence.cacheSummary === 'function') await persistence.cacheSummary(projectId, record.revisionId, summary).catch(() => {});
          }
          const updatedAt = recordDate(record.updatedAt) ?? summary.createdAt ?? 0;
          if (!includeDeleted && Number.isFinite(record.deletedAt)) continue;
          projects.push({ projectId, revisionId: record.revisionId, updatedAt,
            ...(Number.isFinite(record.deletedAt) ? { deletedAt: record.deletedAt } : {}),
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
