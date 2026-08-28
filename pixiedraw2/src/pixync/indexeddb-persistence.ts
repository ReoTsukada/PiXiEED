/**
 * PIXYNC-DRAW2-130 browser persistence adapter.
 *
 * This adapter provides a project-scoped IndexedDB snapshot boundary. It
 * serializes operations issued through one adapter instance and provides
 * transaction-scoped snapshot CAS for browser tabs sharing one IndexedDB
 * database. It does not provide transport or process fencing.
 */

import type {
  PixyncDurableSnapshot,
  PixyncSnapshotPersistencePort,
} from "./durability.ts";

export const PIXYNC_INDEXEDDB_PERSISTENCE_SCHEMA =
  "PIXYNC_DRAW2_INDEXEDDB_SNAPSHOT_V1" as const;

export const PIXYNC_INDEXEDDB_PERSISTENCE_STATUS = Object.freeze(
  {
    schema: PIXYNC_INDEXEDDB_PERSISTENCE_SCHEMA,
    productionReady: false,
    crossTabConcurrency: "TRANSACTION_CAS",
    crossProcessConcurrency: "UNTESTED",
    atomicReplaceScope: "SINGLE_ADAPTER_INSTANCE_QUEUE",
    compareAndSwapScope: "INDEXEDDB_READWRITE_TRANSACTION",
    deletionBarrier: "SEPARATE_TOMBSTONE_STORE",
  } as const,
);

export interface PixyncIndexedDbPersistenceOptions {
  readonly dbName?: string;
  readonly indexedDB?: PixyncIndexedDbFactory;
}

type PixyncIndexedDbEvent = unknown;
type PixyncIndexedDbHandler =
  | ((event: PixyncIndexedDbEvent) => void)
  | null;

interface PixyncIndexedDbRequest<T> {
  result: T;
  error: unknown;
  onsuccess: PixyncIndexedDbHandler;
  onerror: PixyncIndexedDbHandler;
}

interface PixyncIndexedDbOpenRequest
  extends PixyncIndexedDbRequest<PixyncIndexedDbDatabase> {
  transaction: PixyncIndexedDbTransaction | null;
  onupgradeneeded: PixyncIndexedDbHandler;
  onblocked: PixyncIndexedDbHandler;
}

interface PixyncIndexedDbObjectStore {
  get(key: string): PixyncIndexedDbRequest<unknown>;
  delete(key: string): PixyncIndexedDbRequest<unknown>;
  put(
    value: PixyncIndexedDbSnapshotRecord | PixyncIndexedDbDeletedProjectRecord,
  ): PixyncIndexedDbRequest<unknown>;
}

interface PixyncIndexedDbTransaction {
  error: unknown;
  readonly objectStore: (name: string) => PixyncIndexedDbObjectStore;
  abort(): void;
  onerror: PixyncIndexedDbHandler;
  onabort: PixyncIndexedDbHandler;
  oncomplete: PixyncIndexedDbHandler;
}

interface PixyncIndexedDbDatabase {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(
    name: string,
    options: { readonly keyPath: string },
  ): unknown;
  transaction(
    storeName: string | readonly string[],
    mode: "readonly" | "readwrite",
  ): PixyncIndexedDbTransaction;
  close(): void;
  onversionchange: PixyncIndexedDbHandler;
}

export interface PixyncIndexedDbFactory {
  open(name: string, version: number): PixyncIndexedDbOpenRequest;
}

export class PixyncIndexedDbPersistenceError extends Error {
  readonly code:
    | "INDEXEDDB_UNAVAILABLE"
    | "OPEN_FAILED"
    | "UPGRADE_FAILED"
    | "STORE_MISSING"
    | "TRANSACTION_FAILED"
    | "TRANSACTION_ABORTED"
    | "SNAPSHOT_CONFLICT"
    | "PROJECT_DELETED"
    | "PROJECT_MISMATCH"
    | "RECORD_MALFORMED";

  constructor(
    code: PixyncIndexedDbPersistenceError["code"],
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixyncIndexedDbPersistenceError";
    this.code = code;
  }
}

const DB_VERSION = 2;
const STORE_NAME = "snapshots";
const DELETED_STORE_NAME = "deletedProjects";

interface PixyncIndexedDbSnapshotRecord {
  readonly projectId: string;
  readonly snapshot: PixyncDurableSnapshot;
}

interface PixyncIndexedDbDeletedProjectRecord {
  readonly projectId: string;
  readonly deletedAt: string;
}

interface PixyncIndexedDbReadResult {
  readonly record: PixyncIndexedDbSnapshotRecord | undefined;
  readonly deleted: boolean;
}

function clone<T>(value: T): T {
  if (typeof structuredClone !== "function") {
    throw new PixyncIndexedDbPersistenceError(
      "INDEXEDDB_UNAVAILABLE",
      "structuredClone is required by the IndexedDB persistence boundary.",
    );
  }
  return structuredClone(value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

function asError(
  error: unknown,
  code: PixyncIndexedDbPersistenceError["code"],
  fallback: string,
): PixyncIndexedDbPersistenceError {
  if (error instanceof PixyncIndexedDbPersistenceError) return error;
  return new PixyncIndexedDbPersistenceError(
    code,
    errorMessage(error, fallback),
    {
      cause: error,
    },
  );
}

function resolveFactory(
  injected?: PixyncIndexedDbFactory,
): PixyncIndexedDbFactory {
  if (injected !== undefined) return injected;
  const candidate = (globalThis as typeof globalThis & {
    indexedDB?: unknown;
  }).indexedDB;
  if (candidate === undefined) {
    throw new PixyncIndexedDbPersistenceError(
      "INDEXEDDB_UNAVAILABLE",
      "IndexedDB is unavailable; inject an IDBFactory in this host.",
    );
  }
  return candidate as PixyncIndexedDbFactory;
}

function openDatabase(
  factory: PixyncIndexedDbFactory,
  dbName: string,
): Promise<PixyncIndexedDbDatabase> {
  return new Promise((resolve, reject) => {
    let request: PixyncIndexedDbOpenRequest;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    };
    try {
      request = factory.open(dbName, DB_VERSION);
      request.onerror = () => rejectOnce(request.error);
      request.onblocked = () =>
        rejectOnce(
          new PixyncIndexedDbPersistenceError(
            "OPEN_FAILED",
            "IndexedDB open was blocked by another connection.",
          ),
        );
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          const upgrade = request.transaction;
          if (upgrade !== null) {
            upgrade.onabort = () =>
              rejectOnce(
                new PixyncIndexedDbPersistenceError(
                  "UPGRADE_FAILED",
                  "IndexedDB schema upgrade was aborted.",
                ),
              );
            upgrade.onerror = () =>
              rejectOnce(
                asError(
                  upgrade.error,
                  "UPGRADE_FAILED",
                  "IndexedDB schema upgrade failed.",
                ),
              );
          }
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
          }
          if (!db.objectStoreNames.contains(DELETED_STORE_NAME)) {
            db.createObjectStore(DELETED_STORE_NAME, { keyPath: "projectId" });
          }
        } catch (error) {
          try {
            request.transaction?.abort();
          } catch {
            // The request error/abort event remains the authoritative result.
          }
          rejectOnce(
            asError(
              error,
              "UPGRADE_FAILED",
              "IndexedDB schema upgrade failed.",
            ),
          );
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        if (
          !request.result.objectStoreNames.contains(STORE_NAME) ||
          !request.result.objectStoreNames.contains(DELETED_STORE_NAME)
        ) {
          request.result.close();
          rejectOnce(
            new PixyncIndexedDbPersistenceError(
              "STORE_MISSING",
              "IndexedDB snapshot object store is missing.",
            ),
          );
          return;
        }
        request.result.onversionchange = () => request.result.close();
        settled = true;
        resolve(request.result);
      };
    } catch (error) {
      rejectOnce(asError(error, "OPEN_FAILED", "IndexedDB open failed."));
    }
  });
}

function withDatabase<T>(
  factory: PixyncIndexedDbFactory,
  dbName: string,
  operation: (db: PixyncIndexedDbDatabase) => Promise<T>,
): Promise<T> {
  return openDatabase(factory, dbName).then(async (db) => {
    try {
      return await operation(db);
    } finally {
      db.close();
    }
  });
}

function transactionError(
  transaction: PixyncIndexedDbTransaction,
  aborted: boolean,
): PixyncIndexedDbPersistenceError {
  return asError(
    transaction.error,
    aborted ? "TRANSACTION_ABORTED" : "TRANSACTION_FAILED",
    aborted
      ? "IndexedDB transaction was aborted."
      : "IndexedDB transaction failed.",
  );
}

function readRecord(
  db: PixyncIndexedDbDatabase,
  projectId: string,
): Promise<PixyncIndexedDbReadResult> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    try {
      transaction = db.transaction(
        [STORE_NAME, DELETED_STORE_NAME],
        "readonly",
      );
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      const deletedRequest = transaction.objectStore(DELETED_STORE_NAME).get(
        projectId,
      );
      let record: PixyncIndexedDbSnapshotRecord | undefined;
      let requestFinished = false;
      let deleted = false;
      let deletedRequestFinished = false;
      let settled = false;
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        requestFinished = true;
        record = request.result as PixyncIndexedDbSnapshotRecord | undefined;
      };
      deletedRequest.onerror = () => rejectOnce(deletedRequest.error);
      deletedRequest.onsuccess = () => {
        deletedRequestFinished = true;
        deleted = deletedRequest.result !== undefined;
      };
      transaction.onerror = () =>
        rejectOnce(transactionError(transaction, false));
      transaction.onabort = () =>
        rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestFinished || !deletedRequestFinished) {
          rejectOnce(
            new Error("IndexedDB read completed without all request results."),
          );
          return;
        }
        settled = true;
        resolve({ record, deleted });
      };
    } catch (error) {
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
    }
  });
}

function readDeletionMarker(
  db: PixyncIndexedDbDatabase,
  projectId: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(
        asError(
          error,
          "TRANSACTION_FAILED",
          "IndexedDB deletion marker read failed.",
        ),
      );
    };
    try {
      transaction = db.transaction(DELETED_STORE_NAME, "readonly");
      const request = transaction.objectStore(DELETED_STORE_NAME).get(
        projectId,
      );
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        // The transaction completion is authoritative; keep the value in a
        // local variable so a same-tick request error cannot resolve early.
        const deleted = request.result !== undefined;
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(deleted);
        };
      };
      transaction.onerror = () =>
        rejectOnce(transactionError(transaction, false));
      transaction.onabort = () =>
        rejectOnce(transactionError(transaction, true));
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function writeRecord(
  db: PixyncIndexedDbDatabase,
  record: PixyncIndexedDbSnapshotRecord,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    let deletedProject: PixyncIndexedDbDeletedProjectRecord | undefined;
    let conflict: PixyncIndexedDbPersistenceError | undefined;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(
        asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."),
      );
    };
    try {
      transaction = db.transaction(
        [STORE_NAME, DELETED_STORE_NAME],
        "readwrite",
      );
      const snapshots = transaction.objectStore(STORE_NAME);
      const deletedProjects = transaction.objectStore(DELETED_STORE_NAME);
      const deletionRead = deletedProjects.get(record.projectId);
      deletionRead.onerror = () => rejectOnce(deletionRead.error);
      deletionRead.onsuccess = () => {
        deletedProject = deletionRead.result as
          | PixyncIndexedDbDeletedProjectRecord
          | undefined;
        if (deletedProject !== undefined) {
          conflict = new PixyncIndexedDbPersistenceError(
            "PROJECT_DELETED",
            "PiXYNC IndexedDB project has been deleted.",
          );
          transaction.abort();
          return;
        }
        try {
          const request = snapshots.put(clone(record));
          request.onerror = () => rejectOnce(request.error);
        } catch (error) {
          rejectOnce(error);
          try {
            transaction.abort();
          } catch {
            // The transaction error remains authoritative.
          }
        }
      };
      transaction.onerror = () => {
        if (conflict === undefined) {
          rejectOnce(transactionError(transaction, false));
        }
      };
      transaction.onabort = () =>
        rejectOnce(conflict ?? transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
    }
  });
}

function deleteRecord(
  db: PixyncIndexedDbDatabase,
  projectId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB delete failed."));
    };
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).delete(projectId);
      request.onerror = () => rejectOnce(request.error);
      transaction.onerror = () =>
        rejectOnce(transactionError(transaction, false));
      transaction.onabort = () =>
        rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function removeRecord(
  db: PixyncIndexedDbDatabase,
  projectId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(
        asError(
          error,
          "TRANSACTION_FAILED",
          "IndexedDB project removal failed.",
        ),
      );
    };
    try {
      transaction = db.transaction(
        [STORE_NAME, DELETED_STORE_NAME],
        "readwrite",
      );
      const snapshotDelete = transaction.objectStore(STORE_NAME).delete(
        projectId,
      );
      const deletionPut = transaction.objectStore(DELETED_STORE_NAME).put({
        projectId,
        deletedAt: new Date().toISOString(),
      });
      snapshotDelete.onerror = () => rejectOnce(snapshotDelete.error);
      deletionPut.onerror = () => rejectOnce(deletionPut.error);
      transaction.onerror = () =>
        rejectOnce(transactionError(transaction, false));
      transaction.onabort = () =>
        rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function compareAndSwapRecord(
  db: PixyncIndexedDbDatabase,
  projectId: string,
  snapshot: PixyncDurableSnapshot,
  expectedSnapshotHash: string | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixyncIndexedDbTransaction;
    let conflict: PixyncIndexedDbPersistenceError | undefined;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB CAS failed."));
    };
    try {
      transaction = db.transaction(
        [STORE_NAME, DELETED_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(STORE_NAME);
      const deletedProjects = transaction.objectStore(DELETED_STORE_NAME);
      const deletionRead = deletedProjects.get(projectId);
      deletionRead.onerror = () => rejectOnce(deletionRead.error);
      deletionRead.onsuccess = () => {
        if (deletionRead.result !== undefined) {
          conflict = new PixyncIndexedDbPersistenceError(
            "PROJECT_DELETED",
            "PiXYNC IndexedDB project has been deleted.",
          );
          transaction.abort();
          return;
        }
        const read = store.get(projectId);
        read.onerror = () => rejectOnce(read.error);
        read.onsuccess = () => {
          try {
            const current = normalizeRecord(
              read.result as PixyncIndexedDbSnapshotRecord | undefined,
              projectId,
            );
            if ((current?.snapshotHash ?? null) !== expectedSnapshotHash) {
              conflict = new PixyncIndexedDbPersistenceError(
                "SNAPSHOT_CONFLICT",
                "PiXYNC IndexedDB snapshot changed in another writer.",
              );
              transaction.abort();
              return;
            }
            const write = store.put({ projectId, snapshot: clone(snapshot) });
            write.onerror = () => rejectOnce(write.error);
          } catch (error) {
            if (
              error instanceof PixyncIndexedDbPersistenceError &&
              error.code === "SNAPSHOT_CONFLICT"
            ) conflict = error;
            try {
              transaction.abort();
            } catch {
              rejectOnce(error);
            }
          }
        };
      };
      transaction.onerror = () => {
        if (conflict === undefined) {
          rejectOnce(transactionError(transaction, false));
        }
      };
      transaction.onabort = () =>
        rejectOnce(conflict ?? transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function normalizeRecord(
  record: PixyncIndexedDbSnapshotRecord | undefined,
  projectId: string,
): PixyncDurableSnapshot | undefined {
  if (record === undefined) return undefined;
  if (
    record === null || typeof record !== "object" ||
    record.projectId !== projectId || !("snapshot" in record)
  ) {
    throw new PixyncIndexedDbPersistenceError(
      "RECORD_MALFORMED",
      "IndexedDB snapshot record is malformed or belongs to another project.",
    );
  }
  return clone(record.snapshot);
}

/**
 * A project-bound persistence port. Methods on one instance share a Promise
 * queue; independent instances/tabs coordinate only through compareAndSwap.
 */
export class PixyncIndexedDbSnapshotPersistence
  implements PixyncSnapshotPersistencePort {
  readonly projectId: string;
  readonly dbName: string;
  readonly #factory: PixyncIndexedDbFactory;
  #deleted = false;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(
    projectId: string,
    options: PixyncIndexedDbPersistenceOptions = {},
  ) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new PixyncIndexedDbPersistenceError(
        "PROJECT_MISMATCH",
        "IndexedDB persistence projectId is required.",
      );
    }
    this.projectId = projectId;
    this.dbName = options.dbName ?? "pixync-draw2";
    if (this.dbName.length === 0) {
      throw new PixyncIndexedDbPersistenceError(
        "OPEN_FAILED",
        "IndexedDB database name is required.",
      );
    }
    this.#factory = resolveFactory(options.indexedDB);
  }

  load(): Promise<PixyncDurableSnapshot | undefined> {
    return this.#enqueue(async () => {
      const result = await withDatabase(
        this.#factory,
        this.dbName,
        (db) => readRecord(db, this.projectId),
      );
      if (result.deleted) {
        this.#deleted = true;
        return undefined;
      }
      return normalizeRecord(result.record, this.projectId);
    });
  }

  /** Reads only the deletion marker so cached callers can detect another tab's removal. */
  isDeleted(): Promise<boolean> {
    return this.#enqueue(async () => {
      if (this.#deleted) return true;
      const deleted = await withDatabase(
        this.#factory,
        this.dbName,
        (db) => readDeletionMarker(db, this.projectId),
      );
      if (deleted) this.#deleted = true;
      return deleted;
    });
  }

  atomicReplace(snapshot: PixyncDurableSnapshot): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#deleted) {
        throw new PixyncIndexedDbPersistenceError(
          "PROJECT_DELETED",
          "PiXYNC IndexedDB project has been deleted.",
        );
      }
      if (snapshot.projectId !== this.projectId) {
        throw new PixyncIndexedDbPersistenceError(
          "PROJECT_MISMATCH",
          "IndexedDB snapshot belongs to another project.",
        );
      }
      const record: PixyncIndexedDbSnapshotRecord = {
        projectId: this.projectId,
        snapshot: clone(snapshot),
      };
      await withDatabase(
        this.#factory,
        this.dbName,
        (db) => writeRecord(db, record),
      );
    });
  }

  compareAndSwap(
    snapshot: PixyncDurableSnapshot,
    expectedSnapshotHash: string | null,
  ): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#deleted) {
        throw new PixyncIndexedDbPersistenceError(
          "PROJECT_DELETED",
          "PiXYNC IndexedDB project has been deleted.",
        );
      }
      if (snapshot.projectId !== this.projectId) {
        throw new PixyncIndexedDbPersistenceError(
          "PROJECT_MISMATCH",
          "IndexedDB snapshot belongs to another project.",
        );
      }
      if (
        expectedSnapshotHash !== null &&
        (typeof expectedSnapshotHash !== "string" ||
          expectedSnapshotHash.length === 0)
      ) {
        throw new PixyncIndexedDbPersistenceError(
          "RECORD_MALFORMED",
          "IndexedDB expected snapshot hash is invalid.",
        );
      }
      await withDatabase(
        this.#factory,
        this.dbName,
        (db) =>
          compareAndSwapRecord(
            db,
            this.projectId,
            clone(snapshot),
            expectedSnapshotHash,
          ),
      );
    });
  }

  /** Removes this project's local snapshot; safe to call again during retry. */
  clear(): Promise<void> {
    return this.#enqueue(async () => {
      await withDatabase(
        this.#factory,
        this.dbName,
        (db) => deleteRecord(db, this.projectId),
      );
    });
  }

  /** Permanently removes this project's snapshot and blocks late writers. */
  remove(): Promise<boolean> {
    return this.#enqueue(async () => {
      if (this.#deleted) return true;
      await withDatabase(
        this.#factory,
        this.dbName,
        (db) => removeRecord(db, this.projectId),
      );
      this.#deleted = true;
      return true;
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function createPixyncIndexedDbPersistence(
  projectId: string,
  options: PixyncIndexedDbPersistenceOptions = {},
): PixyncIndexedDbSnapshotPersistence {
  return new PixyncIndexedDbSnapshotPersistence(projectId, options);
}
