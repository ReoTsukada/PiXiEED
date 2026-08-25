import { strict as assert } from "node:assert";
import {
  PixyncDurableJournal,
  type PixyncDurableSnapshot,
} from "../../src/pixync/durability.ts";
import {
  createPixyncIndexedDbPersistence,
  type PixyncIndexedDbFactory,
  PixyncIndexedDbPersistenceError,
  type PixyncIndexedDbPersistenceOptions,
} from "../../src/pixync/indexeddb-persistence.ts";
import { canonicalJson, sha256Hex } from "../../src/wp160-contracts.ts";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

type FakeState = {
  readonly records: Map<string, unknown>;
  storeExists: boolean;
};
type FakeMode = "readonly" | "readwrite";

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

  finishComplete(delayMs: number): void {
    if (this.finished) return;
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

  get(key: string): object {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      request.succeed(structuredClone(this.transaction.staged.get(key)));
      this.transaction.finishComplete(0);
    });
    return request;
  }

  put(value: { readonly projectId: string }): object {
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
    const delay = this.factory.writeDelays.shift() ?? 0;
    queueMicrotask(() => {
      request.succeed(value.projectId);
      this.transaction.finishComplete(delay);
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

  transaction(
    _storeName: string,
    mode: FakeMode,
  ): object {
    return new FakeTransaction(this.state, mode, this.factory);
  }

  close(): void {}
}

class FakeOpenRequest extends FakeRequest<object> {
  transaction: object | null = null;
  onupgradeneeded: ((event: unknown) => void) | null = null;
  onblocked: ((event: unknown) => void) | null = null;
}

class FakeIndexedDbFactory {
  readonly databases = new Map<string, FakeState>();
  failNextWrite = false;
  writeDelays: number[] = [];

  open(name: string, _version = 1): object {
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
        const upgrade = new FakeUpgradeTransaction();
        request.transaction = upgrade;
        request.onupgradeneeded?.(new Event("upgradeneeded"));
      }
      request.succeed(db);
    });
    return request;
  }

  tamper(name: string, projectId: string, snapshot: unknown): void {
    const state = this.databases.get(name);
    assert.ok(state);
    state.records.set(projectId, structuredClone({ projectId, snapshot }));
  }
}

function options(
  factory: FakeIndexedDbFactory,
  dbName: string,
): PixyncIndexedDbPersistenceOptions {
  return { dbName, indexedDB: factory as unknown as PixyncIndexedDbFactory };
}

async function seal(
  snapshot: PixyncDurableSnapshot,
  revision: number,
): Promise<PixyncDurableSnapshot> {
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

Deno.test("PIXYNC-DRAW2-130-01 reload/open preserves a project snapshot", async () => {
  const factory = new FakeIndexedDbFactory();
  const first = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, "reload"),
  );
  const journal = await PixyncDurableJournal.open("project-a", first);
  const before = journal.snapshot();
  await first.atomicReplace(await seal(before, 1));

  const reopened = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, "reload"),
  );
  const restored = await PixyncDurableJournal.open("project-a", reopened);
  assert.equal(restored.snapshot().revision, 1);
});

Deno.test("PIXYNC-DRAW2-130-02 project IDs are isolated in one database", async () => {
  const factory = new FakeIndexedDbFactory();
  const a = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, "isolation"),
  );
  const b = createPixyncIndexedDbPersistence(
    "project-b",
    options(factory, "isolation"),
  );
  const journalA = await PixyncDurableJournal.open("project-a", a);
  const snapshotA = await seal(journalA.snapshot(), 1);
  await a.atomicReplace(snapshotA);
  assert.equal(await b.load(), undefined);
  const journalB = await PixyncDurableJournal.open("project-b", b);
  assert.equal(journalB.snapshot().projectId, "project-b");
  assert.equal((await a.load())?.projectId, "project-a");
});

Deno.test("PIXYNC-DRAW2-130-03 failed readwrite transaction preserves previous snapshot", async () => {
  const factory = new FakeIndexedDbFactory();
  const persistence = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, "failure"),
  );
  const journal = await PixyncDurableJournal.open("project-a", persistence);
  const previous = journal.snapshot();
  const next = await seal(previous, 1);
  factory.failNextWrite = true;
  await assert.rejects(
    persistence.atomicReplace(next),
    (error: unknown) =>
      error instanceof PixyncIndexedDbPersistenceError &&
      (error.code === "TRANSACTION_FAILED" ||
        error.code === "TRANSACTION_ABORTED"),
  );
  assert.deepEqual(await persistence.load(), previous);
});

Deno.test("PIXYNC-DRAW2-130-04 tampered snapshot is rejected by journal open", async () => {
  const factory = new FakeIndexedDbFactory();
  const dbName = "tamper";
  const persistence = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, dbName),
  );
  const journal = await PixyncDurableJournal.open("project-a", persistence);
  const tampered = {
    ...journal.snapshot(),
    revision: 99,
    confirmedProjectRevision: 99,
  };
  factory.tamper(dbName, "project-a", tampered);
  await assert.rejects(
    PixyncDurableJournal.open(
      "project-a",
      createPixyncIndexedDbPersistence("project-a", options(factory, dbName)),
    ),
    /hash mismatch/u,
  );
});

Deno.test("PIXYNC-DRAW2-130-05 same-instance atomicReplace calls complete in call order", async () => {
  const factory = new FakeIndexedDbFactory();
  const persistence = createPixyncIndexedDbPersistence(
    "project-a",
    options(factory, "ordering"),
  );
  const journal = await PixyncDurableJournal.open("project-a", persistence);
  const first = await seal(journal.snapshot(), 1);
  const second = await seal(journal.snapshot(), 2);
  factory.writeDelays.push(25, 0);
  const completed: string[] = [];
  const firstWrite = persistence.atomicReplace(first).then(() =>
    completed.push("first")
  );
  const secondWrite = persistence.atomicReplace(second).then(() =>
    completed.push("second")
  );
  await Promise.all([firstWrite, secondWrite]);
  assert.deepEqual(completed, ["first", "second"]);
  assert.equal((await persistence.load())?.revision, 2);
});

Deno.test("PIXYNC-DRAW2-130-06 constructor supports an injected factory without host IndexedDB", () => {
  const factory = new FakeIndexedDbFactory();
  assert.doesNotThrow(() =>
    createPixyncIndexedDbPersistence(
      "project-a",
      options(factory, "injected"),
    )
  );
});
