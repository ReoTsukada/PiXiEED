import { strict as assert } from "node:assert";
import {
  createPixisyncDraft,
  type PixisyncOperationDraft,
} from "../../src/pixisync/index.ts";
import {
  PixisyncDurableJournal,
  type PixisyncDurableSnapshot,
  PixisyncInMemorySnapshotPersistence,
  type PixisyncSnapshotPersistencePort,
} from "../../src/pixisync/durability.ts";
import {
  createPixisyncIndexedDbPersistence,
  type PixisyncIndexedDbFactory,
  type PixisyncIndexedDbPersistenceOptions,
} from "../../src/pixisync/indexeddb-persistence.ts";
import { canonicalJson, sha256Hex } from "../../src/wp160-contracts.ts";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const PROJECT = "pixisync-draw2-170";

type FakeMode = "readonly" | "readwrite";
type FakeState = {
  readonly records: Map<string, unknown>;
  storeExists: boolean;
};

class FakeRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.(new Event("success")));
  }

  fail(message: string): void {
    this.error = new DOMException(message, "UnknownError");
    queueMicrotask(() => this.onerror?.(new Event("error")));
  }
}

class FakeStoreNames {
  constructor(private readonly state: FakeState) {}

  contains(name: string): boolean {
    return name === "snapshots" && this.state.storeExists;
  }
}

class FakeTransaction {
  error: unknown = null;
  onerror: ((event: unknown) => void) | null = null;
  onabort: ((event: unknown) => void) | null = null;
  oncomplete: ((event: unknown) => void) | null = null;
  readonly staged: Map<string, unknown>;
  private finished = false;
  private completionScheduled = false;

  constructor(
    private readonly state: FakeState,
    private readonly mode: FakeMode,
    private readonly factory: FakeIndexedDbFactory,
  ) {
    this.staged = new Map(state.records);
  }

  objectStore(name: string): FakeObjectStore {
    if (name !== "snapshots" || !this.state.storeExists) {
      throw new Error("missing store");
    }
    return new FakeObjectStore(this, this.mode, this.factory);
  }

  abort(): void {
    this.finishAbort("Transaction aborted.");
  }

  finishComplete(delayMs = 0): void {
    if (this.finished || this.completionScheduled) return;
    this.completionScheduled = true;
    setTimeout(() => {
      if (this.finished) return;
      this.finished = true;
      for (const [key, value] of this.staged) {
        this.state.records.set(key, structuredClone(value));
      }
      this.oncomplete?.(new Event("complete"));
    }, delayMs);
  }

  finishAbort(message: string): void {
    if (this.finished) return;
    this.finished = true;
    this.error = new DOMException(message, "AbortError");
    queueMicrotask(() => this.onabort?.(new Event("abort")));
  }
}

class FakeObjectStore {
  constructor(
    private readonly transaction: FakeTransaction,
    private readonly mode: FakeMode,
    private readonly factory: FakeIndexedDbFactory,
  ) {}

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      request.succeed(structuredClone(this.transaction.staged.get(key)));
      // A readwrite CAS that does not put still completes after comparison.
      this.transaction.finishComplete();
    });
    return request;
  }

  put(value: { readonly projectId: string }): FakeRequest<unknown> {
    if (this.mode !== "readwrite") throw new Error("write mode required");
    const request = new FakeRequest<unknown>();
    if (this.factory.failNextWrite) {
      this.factory.failNextWrite = false;
      queueMicrotask(() => {
        request.fail("Injected transaction failure.");
        this.transaction.finishAbort("Injected transaction failure.");
      });
      return request;
    }
    this.transaction.staged.set(value.projectId, structuredClone(value));
    queueMicrotask(() => {
      request.succeed(value.projectId);
      this.transaction.finishComplete();
    });
    return request;
  }
}

class FakeUpgradeTransaction {
  error: unknown = null;
  onerror: ((event: unknown) => void) | null = null;
  onabort: ((event: unknown) => void) | null = null;

  abort(): void {
    this.onabort?.(new Event("abort"));
  }
}

class FakeDatabase {
  readonly objectStoreNames: FakeStoreNames;
  onversionchange: ((event: unknown) => void) | null = null;

  constructor(
    private readonly state: FakeState,
    private readonly factory: FakeIndexedDbFactory,
  ) {
    this.objectStoreNames = new FakeStoreNames(state);
  }

  createObjectStore(): object {
    this.state.storeExists = true;
    return {};
  }

  transaction(_storeName: string, mode: FakeMode): FakeTransaction {
    this.factory.transactionModes.push(mode);
    return new FakeTransaction(this.state, mode, this.factory);
  }

  close(): void {}
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  transaction: FakeUpgradeTransaction | null = null;
  onupgradeneeded: ((event: unknown) => void) | null = null;
  onblocked: ((event: unknown) => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly databases = new Map<string, FakeState>();
  readonly transactionModes: FakeMode[] = [];
  failNextWrite = false;

  open(name: string, _version = 1): FakeOpenRequest {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      let state = this.databases.get(name);
      const isNew = state === undefined;
      if (state === undefined) {
        state = { records: new Map(), storeExists: false };
        this.databases.set(name, state);
      }
      const db = new FakeDatabase(state, this);
      request.result = db;
      if (isNew) {
        request.transaction = new FakeUpgradeTransaction();
        request.onupgradeneeded?.(new Event("upgradeneeded"));
      }
      request.succeed(db);
    });
    return request;
  }

  persisted(
    dbName: string,
    projectId: string,
  ): PixisyncDurableSnapshot | undefined {
    const state = this.databases.get(dbName);
    const record = state?.records.get(projectId) as
      | { readonly snapshot?: PixisyncDurableSnapshot }
      | undefined;
    return record?.snapshot === undefined
      ? undefined
      : structuredClone(record.snapshot);
  }
}

function options(
  factory: FakeIndexedDbFactory,
  dbName: string,
): PixisyncIndexedDbPersistenceOptions {
  return { dbName, indexedDB: factory as unknown as PixisyncIndexedDbFactory };
}

function persistence(
  factory: FakeIndexedDbFactory,
  projectId = PROJECT,
  dbName = "cas",
) {
  return createPixisyncIndexedDbPersistence(
    projectId,
    options(factory, dbName),
  );
}

async function seal(
  snapshot: PixisyncDurableSnapshot,
  revision: number,
): Promise<PixisyncDurableSnapshot> {
  const { snapshotHash: _snapshotHash, ...withoutHash } = snapshot;
  const body = {
    ...withoutHash,
    revision,
    confirmedProjectRevision: revision,
  };
  return {
    ...body,
    snapshotHash: await sha256Hex(canonicalJson(body)),
  };
}

async function draft(
  projectId: string,
  operationId: string,
): Promise<PixisyncOperationDraft> {
  return createPixisyncDraft({
    operationId,
    projectId,
    aggregate: "draw",
    actorId: "actor-170",
    clientId: operationId,
    clientSequence: 1,
    baseProjectRevision: 0,
    aggregateRevision: 0,
    payload: { command: "draw.pixel", operationId },
  });
}

type CasPersistence = PixisyncSnapshotPersistencePort & {
  compareAndSwap(
    snapshot: PixisyncDurableSnapshot,
    expectedSnapshotHash: string | null,
  ): void | Promise<void>;
};

async function compareAndSwap(
  persistencePort: PixisyncSnapshotPersistencePort,
  snapshot: PixisyncDurableSnapshot,
  expectedSnapshotHash: string | null,
): Promise<void> {
  const candidate = persistencePort as unknown as Partial<CasPersistence>;
  assert.equal(
    typeof candidate.compareAndSwap,
    "function",
    "PIXISYNC-DRAW2-170 requires optional compareAndSwap on the implementation.",
  );
  await candidate.compareAndSwap!(snapshot, expectedSnapshotHash);
}

function isSnapshotConflict(error: unknown): boolean {
  return (error as { readonly code?: unknown })?.code === "SNAPSHOT_CONFLICT";
}

function isTransactionFailure(error: unknown): boolean {
  const code = (error as { readonly code?: unknown })?.code;
  return code === "TRANSACTION_FAILED" || code === "TRANSACTION_ABORTED";
}

class CasOnlyPersistence implements PixisyncSnapshotPersistencePort {
  #snapshot: PixisyncDurableSnapshot | undefined;
  readonly expectedHashes: Array<string | null> = [];

  load(): PixisyncDurableSnapshot | undefined {
    return this.#snapshot === undefined
      ? undefined
      : structuredClone(this.#snapshot);
  }

  atomicReplace(): never {
    throw new Error("atomicReplace must not be used when CAS is available");
  }

  compareAndSwap(
    snapshot: PixisyncDurableSnapshot,
    expectedSnapshotHash: string | null,
  ): void {
    this.expectedHashes.push(expectedSnapshotHash);
    if ((this.#snapshot?.snapshotHash ?? null) !== expectedSnapshotHash) {
      const error = new Error("PiXiSYNC snapshot compare-and-swap conflict.") as
        & Error
        & {
          code?: string;
        };
      error.code = "SNAPSHOT_CONFLICT";
      throw error;
    }
    this.#snapshot = structuredClone(snapshot);
  }
}

Deno.test("PIXISYNC-DRAW2-170-01 CAS uses one readwrite transaction", async () => {
  const factory = new FakeIndexedDbFactory();
  const port = persistence(factory);
  const journal = await PixisyncDurableJournal.open(PROJECT, port);
  const base = journal.snapshot();
  factory.transactionModes.length = 0;
  await compareAndSwap(port, await seal(base, 1), base.snapshotHash);
  assert.deepEqual(factory.transactionModes, ["readwrite"]);
  assert.deepEqual(factory.persisted("cas", PROJECT)?.revision, 1);
});

Deno.test("PIXISYNC-DRAW2-170-02 same-base adapters have one CAS winner", async () => {
  const factory = new FakeIndexedDbFactory();
  const seed = persistence(factory);
  const base = (await PixisyncDurableJournal.open(PROJECT, seed)).snapshot();
  const first = persistence(factory);
  const second = persistence(factory);
  const [firstBase, secondBase] = await Promise.all([
    first.load(),
    second.load(),
  ]);
  assert.equal(firstBase?.snapshotHash, base.snapshotHash);
  assert.equal(secondBase?.snapshotHash, base.snapshotHash);
  await compareAndSwap(first, await seal(base, 1), base.snapshotHash);
  const staleSnapshot = await seal(base, 2);
  await assert.rejects(
    () => compareAndSwap(second, staleSnapshot, base.snapshotHash),
    isSnapshotConflict,
  );
  assert.equal(factory.persisted("cas", PROJECT)?.revision, 1);
});

Deno.test("PIXISYNC-DRAW2-170-03 different projects do not conflict", async () => {
  const factory = new FakeIndexedDbFactory();
  const projectA = persistence(factory, "project-a");
  const projectB = persistence(factory, "project-b");
  const baseA = (await PixisyncDurableJournal.open("project-a", projectA))
    .snapshot();
  const baseB = (await PixisyncDurableJournal.open("project-b", projectB))
    .snapshot();
  await compareAndSwap(projectA, await seal(baseA, 1), baseA.snapshotHash);
  await compareAndSwap(projectB, await seal(baseB, 1), baseB.snapshotHash);
  assert.equal(factory.persisted("cas", "project-a")?.revision, 1);
  assert.equal(factory.persisted("cas", "project-b")?.revision, 1);
});

Deno.test("PIXISYNC-DRAW2-170-04 journal uses current hash and preserves stale memory", async () => {
  const factory = new FakeIndexedDbFactory();
  const firstPort = persistence(factory);
  await PixisyncDurableJournal.open(PROJECT, firstPort);
  const first = await PixisyncDurableJournal.open(
    PROJECT,
    persistence(factory),
  );
  const second = await PixisyncDurableJournal.open(
    PROJECT,
    persistence(factory),
  );
  const secondBefore = second.snapshot();
  await first.enqueue(await draft(PROJECT, "first-writer"));
  const staleDraft = await draft(PROJECT, "stale-writer");
  await assert.rejects(
    () => second.enqueue(staleDraft),
    isSnapshotConflict,
  );
  assert.deepEqual(second.snapshot(), secondBefore);
  assert.equal(
    factory.persisted("cas", PROJECT)?.snapshotHash,
    first.snapshot().snapshotHash,
  );
});

Deno.test("PIXISYNC-DRAW2-170-05 initial journal creation uses expected null", async () => {
  const persistencePort = new CasOnlyPersistence();
  const journal = await PixisyncDurableJournal.open(PROJECT, persistencePort);
  assert.ok(journal.snapshot().snapshotHash.length > 0);
  assert.deepEqual(persistencePort.expectedHashes, [null]);
});

Deno.test("PIXISYNC-DRAW2-170-06 transaction abort preserves storage and journal memory", async () => {
  const factory = new FakeIndexedDbFactory();
  const port = persistence(factory);
  const journal = await PixisyncDurableJournal.open(PROJECT, port);
  const before = journal.snapshot();
  factory.failNextWrite = true;
  const pendingDraft = await draft(PROJECT, "aborted-writer");
  await assert.rejects(
    () => journal.enqueue(pendingDraft),
    isTransactionFailure,
  );
  assert.deepEqual(journal.snapshot(), before);
  assert.deepEqual(await port.load(), before);
});

Deno.test("PIXISYNC-DRAW2-170-07 journals without CAS retain legacy fallback", async () => {
  const persistencePort = new PixisyncInMemorySnapshotPersistence();
  const journal = await PixisyncDurableJournal.open(PROJECT, persistencePort);
  await journal.enqueue(await draft(PROJECT, "legacy-writer"));
  assert.equal(journal.snapshot().vault.draft.length, 1);
});
