/**
 * PIXISYNC-DRAW2-130 browser persistence adapter.
 *
 * This adapter provides a project-scoped IndexedDB snapshot boundary. It
 * serializes operations issued through one adapter instance and provides
 * transaction-scoped snapshot CAS for browser tabs sharing one IndexedDB
 * database. It does not provide transport or process fencing.
 */

import type {
  PixisyncDurableSnapshot,
  PixisyncSnapshotPersistencePort,
} from "./durability.ts";

export const PIXISYNC_INDEXEDDB_PERSISTENCE_SCHEMA =
  "PIXSYNC_DRAW2_INDEXEDDB_SNAPSHOT_V1" as const;

export const PIXISYNC_INDEXEDDB_PERSISTENCE_STATUS = Object.freeze(
  {
    schema: PIXISYNC_INDEXEDDB_PERSISTENCE_SCHEMA,
    productionReady: false,
    crossTabConcurrency: "TRANSACTION_CAS",
    crossProcessConcurrency: "UNTESTED",
    atomicReplaceScope: "SINGLE_ADAPTER_INSTANCE_QUEUE",
    compareAndSwapScope: "INDEXEDDB_READWRITE_TRANSACTION",
  } as const,
);

export interface PixisyncIndexedDbPersistenceOptions {
  readonly dbName?: string;
  readonly indexedDB?: PixisyncIndexedDbFactory;
}

type PixisyncIndexedDbEvent = unknown;
type PixisyncIndexedDbHandler =
  | ((event: PixisyncIndexedDbEvent) => void)
  | null;

interface PixisyncIndexedDbRequest<T> {
  result: T;
  error: unknown;
  onsuccess: PixisyncIndexedDbHandler;
  onerror: PixisyncIndexedDbHandler;
}

interface PixisyncIndexedDbOpenRequest
  extends PixisyncIndexedDbRequest<PixisyncIndexedDbDatabase> {
  transaction: PixisyncIndexedDbTransaction | null;
  onupgradeneeded: PixisyncIndexedDbHandler;
  onblocked: PixisyncIndexedDbHandler;
}

interface PixisyncIndexedDbObjectStore {
  get(key: string): PixisyncIndexedDbRequest<unknown>;
  put(
    value: PixisyncIndexedDbSnapshotRecord,
  ): PixisyncIndexedDbRequest<unknown>;
}

interface PixisyncIndexedDbTransaction {
  error: unknown;
  readonly objectStore: (name: string) => PixisyncIndexedDbObjectStore;
  abort(): void;
  onerror: PixisyncIndexedDbHandler;
  onabort: PixisyncIndexedDbHandler;
  oncomplete: PixisyncIndexedDbHandler;
}

interface PixisyncIndexedDbDatabase {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(
    name: string,
    options: { readonly keyPath: string },
  ): unknown;
  transaction(
    storeName: string,
    mode: "readonly" | "readwrite",
  ): PixisyncIndexedDbTransaction;
  close(): void;
  onversionchange: PixisyncIndexedDbHandler;
}

export interface PixisyncIndexedDbFactory {
  open(name: string, version: number): PixisyncIndexedDbOpenRequest;
}

export class PixisyncIndexedDbPersistenceError extends Error {
  readonly code:
    | "INDEXEDDB_UNAVAILABLE"
    | "OPEN_FAILED"
    | "UPGRADE_FAILED"
    | "STORE_MISSING"
    | "TRANSACTION_FAILED"
    | "TRANSACTION_ABORTED"
    | "SNAPSHOT_CONFLICT"
    | "PROJECT_MISMATCH"
    | "RECORD_MALFORMED";

  constructor(
    code: PixisyncIndexedDbPersistenceError["code"],
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixisyncIndexedDbPersistenceError";
    this.code = code;
  }
}

const DB_VERSION = 1;
const STORE_NAME = "snapshots";

interface PixisyncIndexedDbSnapshotRecord {
  readonly projectId: string;
  readonly snapshot: PixisyncDurableSnapshot;
}

function clone<T>(value: T): T {
  if (typeof structuredClone !== "function") {
    throw new PixisyncIndexedDbPersistenceError(
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
  code: PixisyncIndexedDbPersistenceError["code"],
  fallback: string,
): PixisyncIndexedDbPersistenceError {
  if (error instanceof PixisyncIndexedDbPersistenceError) return error;
  return new PixisyncIndexedDbPersistenceError(
    code,
    errorMessage(error, fallback),
    {
      cause: error,
    },
  );
}

function resolveFactory(
  injected?: PixisyncIndexedDbFactory,
): PixisyncIndexedDbFactory {
  if (injected !== undefined) return injected;
  const candidate = (globalThis as typeof globalThis & {
    indexedDB?: unknown;
  }).indexedDB;
  if (candidate === undefined) {
    throw new PixisyncIndexedDbPersistenceError(
      "INDEXEDDB_UNAVAILABLE",
      "IndexedDB is unavailable; inject an IDBFactory in this host.",
    );
  }
  return candidate as PixisyncIndexedDbFactory;
}

function openDatabase(
  factory: PixisyncIndexedDbFactory,
  dbName: string,
): Promise<PixisyncIndexedDbDatabase> {
  return new Promise((resolve, reject) => {
    let request: PixisyncIndexedDbOpenRequest;
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
          new PixisyncIndexedDbPersistenceError(
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
                new PixisyncIndexedDbPersistenceError(
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
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.close();
          rejectOnce(
            new PixisyncIndexedDbPersistenceError(
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
  factory: PixisyncIndexedDbFactory,
  dbName: string,
  operation: (db: PixisyncIndexedDbDatabase) => Promise<T>,
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
  transaction: PixisyncIndexedDbTransaction,
  aborted: boolean,
): PixisyncIndexedDbPersistenceError {
  return asError(
    transaction.error,
    aborted ? "TRANSACTION_ABORTED" : "TRANSACTION_FAILED",
    aborted
      ? "IndexedDB transaction was aborted."
      : "IndexedDB transaction failed.",
  );
}

function readRecord(
  db: PixisyncIndexedDbDatabase,
  projectId: string,
): Promise<PixisyncIndexedDbSnapshotRecord | undefined> {
  return new Promise((resolve, reject) => {
    let transaction: PixisyncIndexedDbTransaction;
    try {
      transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(projectId);
      let record: PixisyncIndexedDbSnapshotRecord | undefined;
      let requestFinished = false;
      let settled = false;
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
      };
      request.onerror = () => rejectOnce(request.error);
      request.onsuccess = () => {
        requestFinished = true;
        record = request.result as PixisyncIndexedDbSnapshotRecord | undefined;
      };
      transaction.onerror = () =>
        rejectOnce(transactionError(transaction, false));
      transaction.onabort = () =>
        rejectOnce(transactionError(transaction, true));
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestFinished) {
          rejectOnce(
            new Error("IndexedDB read completed without a request result."),
          );
          return;
        }
        settled = true;
        resolve(record);
      };
    } catch (error) {
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB read failed."));
    }
  });
}

function writeRecord(
  db: PixisyncIndexedDbDatabase,
  record: PixisyncIndexedDbSnapshotRecord,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixisyncIndexedDbTransaction;
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(clone(record));
      let settled = false;
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
      };
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
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB write failed."));
    }
  });
}

function compareAndSwapRecord(
  db: PixisyncIndexedDbDatabase,
  projectId: string,
  snapshot: PixisyncDurableSnapshot,
  expectedSnapshotHash: string | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let transaction: PixisyncIndexedDbTransaction;
    let conflict: PixisyncIndexedDbPersistenceError | undefined;
    let settled = false;
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(asError(error, "TRANSACTION_FAILED", "IndexedDB CAS failed."));
    };
    try {
      transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(projectId);
      read.onerror = () => rejectOnce(read.error);
      read.onsuccess = () => {
        try {
          const current = normalizeRecord(
            read.result as PixisyncIndexedDbSnapshotRecord | undefined,
            projectId,
          );
          if ((current?.snapshotHash ?? null) !== expectedSnapshotHash) {
            conflict = new PixisyncIndexedDbPersistenceError(
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
            error instanceof PixisyncIndexedDbPersistenceError &&
            error.code === "SNAPSHOT_CONFLICT"
          ) conflict = error;
          try {
            transaction.abort();
          } catch {
            rejectOnce(error);
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
      rejectOnce(error);
    }
  });
}

function normalizeRecord(
  record: PixisyncIndexedDbSnapshotRecord | undefined,
  projectId: string,
): PixisyncDurableSnapshot | undefined {
  if (record === undefined) return undefined;
  if (
    record === null || typeof record !== "object" ||
    record.projectId !== projectId || !("snapshot" in record)
  ) {
    throw new PixisyncIndexedDbPersistenceError(
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
export class PixisyncIndexedDbSnapshotPersistence
  implements PixisyncSnapshotPersistencePort {
  readonly projectId: string;
  readonly dbName: string;
  readonly #factory: PixisyncIndexedDbFactory;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(
    projectId: string,
    options: PixisyncIndexedDbPersistenceOptions = {},
  ) {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new PixisyncIndexedDbPersistenceError(
        "PROJECT_MISMATCH",
        "IndexedDB persistence projectId is required.",
      );
    }
    this.projectId = projectId;
    this.dbName = options.dbName ?? "pixisync-draw2";
    if (this.dbName.length === 0) {
      throw new PixisyncIndexedDbPersistenceError(
        "OPEN_FAILED",
        "IndexedDB database name is required.",
      );
    }
    this.#factory = resolveFactory(options.indexedDB);
  }

  load(): Promise<PixisyncDurableSnapshot | undefined> {
    return this.#enqueue(async () => {
      const record = await withDatabase(
        this.#factory,
        this.dbName,
        (db) => readRecord(db, this.projectId),
      );
      return normalizeRecord(record, this.projectId);
    });
  }

  atomicReplace(snapshot: PixisyncDurableSnapshot): Promise<void> {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixisyncIndexedDbPersistenceError(
          "PROJECT_MISMATCH",
          "IndexedDB snapshot belongs to another project.",
        );
      }
      const record: PixisyncIndexedDbSnapshotRecord = {
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
    snapshot: PixisyncDurableSnapshot,
    expectedSnapshotHash: string | null,
  ): Promise<void> {
    return this.#enqueue(async () => {
      if (snapshot.projectId !== this.projectId) {
        throw new PixisyncIndexedDbPersistenceError(
          "PROJECT_MISMATCH",
          "IndexedDB snapshot belongs to another project.",
        );
      }
      if (
        expectedSnapshotHash !== null &&
        (typeof expectedSnapshotHash !== "string" ||
          expectedSnapshotHash.length === 0)
      ) {
        throw new PixisyncIndexedDbPersistenceError(
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

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function createPixisyncIndexedDbPersistence(
  projectId: string,
  options: PixisyncIndexedDbPersistenceOptions = {},
): PixisyncIndexedDbSnapshotPersistence {
  return new PixisyncIndexedDbSnapshotPersistence(projectId, options);
}
