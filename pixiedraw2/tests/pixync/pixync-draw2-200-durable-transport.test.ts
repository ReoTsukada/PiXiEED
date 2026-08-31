import { strict as assert } from "node:assert";
import {
  committedOperationFingerprint,
  createPixyncDraft,
  operationFingerprint,
} from "../../src/pixync/core.ts";
import type {
  PixyncAggregate,
  PixyncAggregateAdapter,
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "../../src/pixync/contracts.ts";
import {
  PixyncDurabilityCrashError,
  type PixyncDurabilityCrashPoint,
  PixyncDurabilityError,
  PixyncDurableJournal,
  PixyncInMemorySnapshotPersistence,
  type PixyncSnapshotPersistencePort,
} from "../../src/pixync/durability.ts";
import {
  PixyncDurableTransportCoordinator,
} from "../../src/pixync/durable-transport.ts";
import { PixyncOrderKeeper } from "../../src/pixync/in-memory.ts";
import {
  type PixyncTransportAck,
  PixyncTransportAdapter,
  type PixyncTransportBinding,
  type PixyncTransportProvider,
  type PixyncTransportProviderConnection,
  type PixyncTransportProviderOpenInput,
  type PixyncTransportProviderOpenResult,
} from "../../src/pixync/transport.ts";

// Repository-bound preflight anchors.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const PROJECT = "pixync-draw2-200";
const CLIENT = "client-200";
const ACTOR = "actor-200";
let time = Date.parse("2026-08-23T00:00:00.000Z");
const now = () => new Date(time);

async function draft(
  operationId: string,
  options: Partial<{
    aggregate: PixyncAggregate;
    clientSequence: number;
    aggregateRevision: number;
    baseProjectRevision: number;
    projectId: string;
  }> = {},
): Promise<PixyncOperationDraft> {
  return createPixyncDraft({
    operationId,
    projectId: options.projectId ?? PROJECT,
    aggregate: options.aggregate ?? "draw",
    actorId: ACTOR,
    clientId: CLIENT,
    clientSequence: options.clientSequence ?? 1,
    baseProjectRevision: options.baseProjectRevision ?? 0,
    aggregateRevision: options.aggregateRevision ?? 0,
    payload: { command: "draw.stroke", value: operationId },
  });
}

function adapters(
  applied: string[],
  shouldFail: () => boolean = () => false,
): readonly PixyncAggregateAdapter[] {
  return ("draw|audio|game".split("|") as PixyncAggregate[]).map((
    aggregate,
  ) => ({
    aggregate,
    apply: (operation) => {
      if (shouldFail()) throw new Error("synthetic apply failure");
      applied.push(operation.operationId);
    },
  }));
}

type OpenRecord = {
  readonly input: PixyncTransportProviderOpenInput;
  readonly connection: PixyncTransportProviderConnection;
};

class FakeProvider implements PixyncTransportProvider {
  readonly opens: OpenRecord[] = [];
  readonly committed: PixyncCommittedOperation[] = [];
  readonly submitted: string[] = [];
  fetchCount = 0;
  role: PixyncTransportBinding["role"] = "editor";
  serverRevision = 0;
  readonly aggregateRevisions = { draw: 0, audio: 0, game: 0 };
  beforeSubmit: (() => void) | undefined;
  failNextSubmit: Error | undefined;

  async open(
    input: PixyncTransportProviderOpenInput,
  ): Promise<PixyncTransportProviderOpenResult> {
    const connection: PixyncTransportProviderConnection = {
      submit: async (operation) => {
        this.beforeSubmit?.();
        if (this.failNextSubmit !== undefined) {
          const error = this.failNextSubmit;
          this.failNextSubmit = undefined;
          throw error;
        }
        this.submitted.push(operation.operationId);
        const existing = this.committed.find((item) =>
          item.operationId === operation.operationId
        );
        if (existing !== undefined) {
          return this.ack(existing, operation, "DUPLICATE");
        }
        this.serverRevision += 1;
        this.aggregateRevisions[operation.aggregate] += 1;
        const committed: PixyncCommittedOperation = {
          ...operation,
          projectRevision: this.serverRevision,
          aggregateRevision: operation.aggregateRevision ||
            this.aggregateRevisions[operation.aggregate],
          committedAt: "2026-08-23T00:00:00.321Z",
        };
        this.committed.push(committed);
        return this.ack(committed, operation, "COMMITTED");
      },
      fetchSince: async (afterProjectRevision) => {
        this.fetchCount += 1;
        return this.committed.filter((item) =>
          item.projectRevision > afterProjectRevision
        );
      },
      close: async () => {},
    };
    this.opens.push({ input, connection });
    return {
      binding: {
        projectId: input.projectId,
        roomId: "room-200",
        actorId: ACTOR,
        clientId: input.clientId,
        role: this.role,
        sessionGeneration: input.sessionGeneration,
      },
      connection,
    };
  }

  async ack(
    committed: PixyncCommittedOperation,
    submitted: PixyncOperationDraft,
    kind: "COMMITTED" | "DUPLICATE",
  ): Promise<PixyncTransportAck> {
    return {
      kind,
      operationId: submitted.operationId,
      projectId: submitted.projectId,
      projectRevision: committed.projectRevision,
      aggregateRevision: committed.aggregateRevision,
      submissionFingerprint: await operationFingerprint(submitted),
      committedFingerprint: await committedOperationFingerprint(committed),
      operation: committed,
    };
  }

  async emit(operation: PixyncCommittedOperation): Promise<void> {
    const open = this.opens.at(-1);
    assert.ok(open);
    await open.input.onAuthoritativeOperation({
      origin: "AUTHORITATIVE_TAIL",
      operation,
    });
  }
}

async function openCoordinator(
  persistence: PixyncSnapshotPersistencePort,
  provider: FakeProvider,
  options: {
    applied?: string[];
    shouldFail?: () => boolean;
    faultInjector?: (point: PixyncDurabilityCrashPoint) => void;
  } = {},
) {
  const journal = await PixyncDurableJournal.open(PROJECT, persistence, {
    now,
    leaseMs: 10,
    retryDelayMs: 1,
    ...(options.faultInjector === undefined
      ? {}
      : { faultInjector: options.faultInjector }),
  });
  const applied = options.applied ?? [];
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: adapters(applied, options.shouldFail),
    initialState: journal.orderKeeperInitialState(),
  });
  const transport = new PixyncTransportAdapter(provider);
  await transport.connect({
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: provider.opens.length,
    onOperation: () => {},
  });
  return {
    journal,
    keeper,
    transport,
    coordinator: new PixyncDurableTransportCoordinator({
      journal,
      transport,
      orderKeeper: keeper,
      workerId: "worker-200",
      now,
    }),
  };
}

function crashOnce(
  target: PixyncDurabilityCrashPoint,
  armed = true,
): {
  injector: (point: PixyncDurabilityCrashPoint) => void;
  arm: () => void;
} {
  let active = armed;
  return {
    injector: (point) => {
      if (active && point === target) {
        active = false;
        throw new PixyncDurabilityCrashError(point);
      }
    },
    arm: () => {
      active = true;
    },
  };
}

Deno.test("PIXYNC-DRAW2-200-01 enqueue is persisted before transport submit", async () => {
  time = Date.parse("2026-08-23T00:00:00.000Z");
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  let observed: Awaited<ReturnType<typeof persistence.load>>;
  provider.beforeSubmit = () => {
    observed = persistence.load();
  };
  const { coordinator } = await openCoordinator(persistence, provider);
  const operation = await draft("enqueue-before-submit");
  await coordinator.submit(operation);
  assert.equal(
    observed?.vault.draft[0]?.envelope.operationId,
    operation.operationId,
  );
  assert.equal(observed?.outbox[0]?.state, "LEASED");
});

Deno.test("PIXYNC-DRAW2-200-02 authoritative ACK envelope is exact and server assigns aggregate revision", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const { coordinator, journal } = await openCoordinator(persistence, provider);
  const operation = await draft("authoritative-envelope");
  const ack = await coordinator.submit(operation);
  assert.equal(ack.operation.aggregateRevision, 1);
  assert.equal(ack.operation.committedAt, "2026-08-23T00:00:00.321Z");
  assert.deepEqual(
    journal.snapshot().vault.committed[0]?.envelope,
    ack.operation,
  );
  assert.equal(journal.snapshot().vault.draft.length, 0);
  assert.deepEqual(
    journal.snapshot().vault.committed[0]?.envelope,
    provider.committed[0],
  );
});

Deno.test("PIXYNC-DRAW2-200-03 ACK crash is reconciled after restart without reapply", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const crash = crashOnce("AFTER_PERSIST_BEFORE_RESPONSE", false);
  const firstApplied: string[] = [];
  const first = await openCoordinator(persistence, provider, {
    applied: firstApplied,
    faultInjector: crash.injector,
  });
  provider.beforeSubmit = crash.arm;
  await assert.rejects(
    async () => first.coordinator.submit(await draft("ack-crash")),
    (error: unknown) => error instanceof PixyncDurabilityCrashError,
  );
  assert.equal(persistence.snapshot()?.vault.committed.length, 1);
  assert.equal(firstApplied.length, 0);

  const restartedApplied: string[] = [];
  const restarted = await openCoordinator(persistence, provider, {
    applied: restartedApplied,
  });
  await restarted.coordinator.reconcile();
  assert.deepEqual(restartedApplied, ["ack-crash"]);
  assert.deepEqual(firstApplied, []);
});

Deno.test("PIXYNC-DRAW2-200-04 remote tail persists before apply and restart drains it", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const crash = crashOnce("AFTER_PERSIST_BEFORE_RESPONSE", false);
  const applied: string[] = [];
  const current = await openCoordinator(persistence, provider, {
    applied,
    faultInjector: crash.injector,
  });
  const remoteDraft = await draft("remote-tail");
  provider.serverRevision = 1;
  provider.aggregateRevisions.draw = 0;
  const remote = {
    ...remoteDraft,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  };
  crash.arm();
  await assert.rejects(
    () =>
      current.coordinator.receiveRemote({
        origin: "AUTHORITATIVE_TAIL",
        operation: remote,
      }),
    PixyncDurabilityCrashError,
  );
  assert.equal(persistence.snapshot()?.inbox[0]?.state, "ACCEPTED");
  assert.deepEqual(applied, []);
  const restartedApplied: string[] = [];
  const restarted = await openCoordinator(persistence, provider, {
    applied: restartedApplied,
  });
  await restarted.coordinator.reconcile();
  assert.deepEqual(restartedApplied, ["remote-tail"]);
});

Deno.test("PIXYNC-DRAW2-200-05 self echo and duplicate ACK apply exactly once", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const applied: string[] = [];
  const { coordinator } = await openCoordinator(persistence, provider, {
    applied,
  });
  const operation = await draft("self-echo");
  const first = await coordinator.submit(operation);
  await provider.emit(first.operation);
  const second = await coordinator.submit(operation);
  assert.equal(second.kind, "DUPLICATE");
  assert.deepEqual(applied, ["self-echo"]);
  assert.deepEqual(provider.submitted, ["self-echo"]);
});

Deno.test("PIXYNC-DRAW2-200-06 gap catch-up persists and applies in order", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const applied: string[] = [];
  const { coordinator } = await openCoordinator(persistence, provider, {
    applied,
  });
  const firstDraft = await draft("gap-one");
  const secondDraft = await draft("gap-two");
  const first: PixyncCommittedOperation = {
    ...firstDraft,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  };
  const second: PixyncCommittedOperation = {
    ...secondDraft,
    projectRevision: 2,
    aggregateRevision: 2,
    committedAt: "2026-08-23T00:00:00.321Z",
  };
  await coordinator.receiveRemote({
    origin: "AUTHORITATIVE_TAIL",
    operation: second,
  });
  assert.deepEqual(applied, []);
  await coordinator.receiveRemote({
    origin: "AUTHORITATIVE_TAIL",
    operation: first,
  });
  assert.deepEqual(applied, ["gap-one", "gap-two"]);
});

Deno.test("PIXYNC-DRAW2-200-07 Broadcast is only a hint for authoritative catch-up", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const applied: string[] = [];
  const current = await openCoordinator(persistence, provider, { applied });
  await current.transport.close("rebind-through-coordinator");
  await current.coordinator.connect({
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: 1,
  });
  const remoteDraft = await draft("broadcast-hint-audio", {
    aggregate: "audio",
  });
  provider.committed.push({
    ...remoteDraft,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  });
  provider.serverRevision = 1;
  provider.opens.at(-1)!.input.onBroadcastHint();
  await current.coordinator.settleBroadcastHints();
  assert.deepEqual(applied, ["broadcast-hint-audio"]);
  assert.equal(provider.fetchCount, 1);
});

Deno.test("PIXYNC-DRAW2-200 reconnect recovery requests authoritative catch-up", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const applied: string[] = [];
  const current = await openCoordinator(persistence, provider, { applied });
  await current.transport.close("rebind-through-coordinator");
  await current.coordinator.connect({
    projectId: PROJECT,
    clientId: CLIENT,
    sessionGeneration: 1,
  });
  const remoteDraft = await draft("reconnect-catch-up", {
    aggregate: "game",
  });
  provider.committed.push({
    ...remoteDraft,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  });
  provider.serverRevision = 1;
  const open = provider.opens.at(-1)!;
  open.input.onStatus("RECONNECTING");
  open.input.onStatus("SUBSCRIBED");
  await current.coordinator.settleBroadcastHints();
  assert.deepEqual(applied, ["reconnect-catch-up"]);
  assert.equal(provider.fetchCount, 1);
});

Deno.test("PIXYNC-DRAW2-200-07 stale lease rejects authoritative ACK", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const journal = await PixyncDurableJournal.open(PROJECT, persistence, {
    now,
    leaseMs: 10,
  });
  const operation = await draft("stale-authoritative");
  await journal.enqueue(operation);
  const first = await journal.leaseOutbox("worker-a", now());
  assert.ok(first);
  time += 11;
  const second = await journal.leaseOutbox("worker-b", now());
  assert.ok(second);
  const committed = {
    ...operation,
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  };
  const ack = {
    kind: "COMMITTED" as const,
    operationId: operation.operationId,
    projectId: PROJECT,
    projectRevision: 1,
    aggregateRevision: 1,
    submissionFingerprint: await operationFingerprint(operation),
    committedFingerprint: await committedOperationFingerprint(committed),
    operation: committed,
  };
  await assert.rejects(
    () =>
      journal.acknowledgeOutboxAuthoritative(
        operation.operationId,
        first.lease.token,
        ack,
      ),
    (error: unknown) =>
      error instanceof PixyncDurabilityError && error.code === "LEASE_STALE",
  );
});

Deno.test("PIXYNC-DRAW2-200-08 aggregate apply failure is retryable", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  let fail = true;
  const provider = new FakeProvider();
  const applied: string[] = [];
  const current = await openCoordinator(persistence, provider, {
    applied,
    shouldFail: () => fail,
  });
  await assert.rejects(async () =>
    current.coordinator.receiveRemote({
      origin: "AUTHORITATIVE_TAIL",
      operation: {
        ...(await draft("apply-retry")),
        projectRevision: 1,
        aggregateRevision: 1,
        committedAt: "2026-08-23T00:00:00.321Z",
      },
    })
  );
  assert.equal(persistence.snapshot()?.inbox[0]?.state, "RETRYABLE");
  fail = false;
  time += 2;
  await current.coordinator.reconcile();
  assert.deepEqual(applied, ["apply-retry"]);
});

Deno.test("PIXYNC-DRAW2-200-09 restored keeper does not reapply completed receipts and accepts next revision", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  const firstApplied: string[] = [];
  const first = await openCoordinator(persistence, provider, {
    applied: firstApplied,
  });
  await first.coordinator.submit(await draft("restore-one"));
  const restoredJournal = await PixyncDurableJournal.open(
    PROJECT,
    persistence,
    { now, leaseMs: 10, retryDelayMs: 1 },
  );
  const initial = restoredJournal.orderKeeperInitialState();
  assert.equal(initial.projectRevision, 1);
  const restoredApplied: string[] = [];
  const restored = await openCoordinator(persistence, provider, {
    applied: restoredApplied,
  });
  await restored.coordinator.reconcile();
  assert.deepEqual(restoredApplied, []);
  await restored.coordinator.submit(
    await draft("restore-two", { clientSequence: 2, baseProjectRevision: 1 }),
  );
  assert.deepEqual(restoredApplied, ["restore-two"]);
  assert.equal(restored.keeper.snapshot().projectRevision, 2);
});

Deno.test("PIXYNC-DRAW2-200-10 substituted committed ACK and cross-project ACK are rejected", async () => {
  for (const substitution of ["actor", "project"] as const) {
    const persistence = new PixyncInMemorySnapshotPersistence();
    const journal = await PixyncDurableJournal.open(PROJECT, persistence, {
      now,
    });
    const operation = await draft(`reject-${substitution}`);
    await journal.enqueue(operation);
    const lease = await journal.leaseOutbox("worker", now());
    assert.ok(lease);
    const changed = substitution === "actor"
      ? { ...operation, actorId: "substituted-actor" }
      : { ...operation, projectId: "other-project" };
    const committed = {
      ...changed,
      projectRevision: 1,
      aggregateRevision: 1,
      committedAt: "2026-08-23T00:00:00.321Z",
    };
    const ack = {
      kind: "COMMITTED" as const,
      operationId: operation.operationId,
      projectId: committed.projectId,
      projectRevision: 1,
      aggregateRevision: 1,
      submissionFingerprint: await operationFingerprint(operation),
      committedFingerprint: await committedOperationFingerprint(committed),
      operation: committed,
    };
    await assert.rejects(
      () =>
        journal.acknowledgeOutboxAuthoritative(
          operation.operationId,
          lease.lease.token,
          ack,
        ),
      (error: unknown) =>
        error instanceof PixyncDurabilityError &&
        error.code === "INBOX_CONFLICT",
    );
    assert.equal(journal.snapshot().vault.committed.length, 0);
  }
});

Deno.test("PIXYNC-DRAW2-200-11 all durability failure injectors are exercised", async () => {
  for (
    const point of ["BEFORE_COMMIT", "AFTER_STAGE_BEFORE_PERSIST"] as const
  ) {
    const persistence = new PixyncInMemorySnapshotPersistence();
    const journal = await PixyncDurableJournal.open(PROJECT, persistence, {
      now,
      faultInjector: crashOnce(point).injector,
    });
    await assert.rejects(
      async () => journal.enqueue(await draft(`inject-${point}`)),
      (error: unknown) =>
        error instanceof PixyncDurabilityCrashError &&
        error.crashPoint === point,
    );
    assert.equal(journal.snapshot().outbox.length, 0);
  }
  const persistence = new PixyncInMemorySnapshotPersistence();
  let first = true;
  const journal = await PixyncDurableJournal.open(PROJECT, persistence, {
    now,
    faultInjector: (point) => {
      if (first && point === "AFTER_APPLY_BEFORE_ACK") {
        first = false;
        throw new PixyncDurabilityCrashError(point);
      }
    },
  });
  const operation = {
    ...(await draft("inject-AFTER_APPLY_BEFORE_ACK")),
    projectRevision: 1,
    aggregateRevision: 1,
    committedAt: "2026-08-23T00:00:00.321Z",
  };
  await journal.acceptIncoming(operation);
  const lease = await journal.leaseInbox("worker", now());
  assert.ok(lease);
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: adapters([]),
  });
  await assert.rejects(
    () => journal.applyInbox(operation.operationId, lease.lease.token, keeper),
    PixyncDurabilityCrashError,
  );
  assert.equal(
    journal.snapshot().inbox[0]?.receipt?.operationId,
    operation.operationId,
  );
});

Deno.test("PIXYNC-DRAW2-200-12 reconcile resends a retryable Outbox operation", async () => {
  time = Date.parse("2026-08-23T00:00:00.000Z");
  const persistence = new PixyncInMemorySnapshotPersistence();
  const provider = new FakeProvider();
  provider.failNextSubmit = new Error("synthetic offline");
  const applied: string[] = [];
  const current = await openCoordinator(persistence, provider, { applied });
  const operation = await draft("retryable-outbox");
  await assert.rejects(() => current.coordinator.submit(operation));
  assert.equal(current.journal.snapshot().outbox[0]?.state, "PENDING");
  time += 3;
  await current.coordinator.reconcile();
  assert.equal(current.journal.snapshot().outbox[0]?.state, "DISPATCHED");
  assert.deepEqual(applied, ["retryable-outbox"]);
  assert.deepEqual(provider.submitted, ["retryable-outbox"]);
});

Deno.test(
  "PIXYNC-DRAW2-200-13 repeated commits compact completed durable records",
  async () => {
    time = Date.parse("2026-08-23T00:00:00.000Z");
    const persistence = new PixyncInMemorySnapshotPersistence();
    const provider = new FakeProvider();
    const current = await openCoordinator(persistence, provider);
    const total = 160;
    const firstDraft = await draft("compact-1", {
      clientSequence: 1,
      aggregateRevision: 0,
      baseProjectRevision: 0,
    });
    for (let index = 1; index <= total; index += 1) {
      await current.coordinator.submit(
        index === 1
          ? firstDraft
          : await draft(`compact-${index}`, {
            clientSequence: index,
            aggregateRevision: 0,
            baseProjectRevision: index - 1,
          }),
      );
    }

    const snapshot = current.journal.snapshot();
    assert.equal(snapshot.revision, total);
    assert.equal(snapshot.appliedOperationFingerprints.length, total);
    assert.equal(snapshot.inbox.length, 0);
    assert.ok(snapshot.vault.committed.length <= 8);
    assert.ok(snapshot.outbox.length <= 8);
    assert.ok(JSON.stringify(snapshot).length < 512 * 1024);

    const restoredJournal = await PixyncDurableJournal.open(
      PROJECT,
      persistence,
      { now, leaseMs: 10, retryDelayMs: 1 },
    );
    assert.equal(
      restoredJournal.orderKeeperInitialState().projectRevision,
      total,
    );
    const restored = await openCoordinator(persistence, provider);
    await restored.coordinator.reconcile();
    const duplicate = await restored.coordinator.submit(firstDraft);
    assert.equal(duplicate.kind, "DUPLICATE");
    await restored.coordinator.submit(
      await draft("compact-next", {
        clientSequence: total + 1,
        aggregateRevision: 0,
        baseProjectRevision: total,
      }),
    );
    assert.equal(restored.keeper.snapshot().projectRevision, total + 1);
  },
);
