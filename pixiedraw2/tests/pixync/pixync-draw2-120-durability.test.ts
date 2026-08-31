import { strict as assert } from "node:assert";
import {
  createPixyncDraft,
  type PixyncAggregate,
  type PixyncCommittedOperation,
  PixyncError,
  type PixyncOperationDraft,
  PixyncOrderKeeper,
} from "../../src/pixync/index.ts";
import { committedOperationFingerprint } from "../../src/pixync/core.ts";
import {
  PixyncDurabilityCrashError,
  type PixyncDurabilityCrashPoint,
  PixyncDurabilityError,
  type PixyncDurabilityOptions,
  PixyncDurableJournal,
  type PixyncDurableSnapshot,
  type PixyncIncomingIdentity,
  PixyncInMemorySnapshotPersistence,
  type PixyncSnapshotPersistencePort,
} from "../../src/pixync/durability.ts";

// Preflight-only invalid-input anchors remain explicit and repository-bound.
// AUTHORITY-ROOT-001 CALLER_INJECTION_REJECTED REJECT
// RESOLVER-IDENTITY-001 CANONICAL_IDENTITY_MISMATCH REJECT
// CALLER-STATE-001 CALLER_STATE_NOT_AUTHORITY REJECT
// EVENT-ID-001 CANONICAL_EVENT_ID_REQUIRED REJECT
// REPLAY-REVOKE-001 LIFECYCLE_TRANSITION_NOT_AUTHORIZED REJECT

const PROJECT = "pixync-draw2-120";
let time = Date.parse("2026-08-23T00:00:00.000Z");
const now = () => new Date(time);

async function draft(
  operationId: string,
  aggregate: PixyncAggregate = "draw",
  clientSequence = 1,
): Promise<PixyncOperationDraft> {
  return createPixyncDraft({
    operationId,
    projectId: PROJECT,
    aggregate,
    actorId: "actor-120",
    clientId: `client-${aggregate}`,
    clientSequence,
    baseProjectRevision: 0,
    aggregateRevision: clientSequence - 1,
    payload: { command: `${aggregate}.command`, value: clientSequence },
  });
}

async function committed(
  operationId: string,
  projectRevision: number,
  aggregate: PixyncAggregate = "draw",
  aggregateRevision = projectRevision,
): Promise<PixyncCommittedOperation> {
  const value = await createPixyncDraft({
    operationId,
    projectId: PROJECT,
    aggregate,
    actorId: "actor-120",
    clientId: `remote-${aggregate}`,
    clientSequence: projectRevision,
    baseProjectRevision: projectRevision - 1,
    aggregateRevision: aggregateRevision - 1,
    payload: { command: `${aggregate}.remote`, value: projectRevision },
  });
  return {
    ...value,
    aggregateRevision,
    projectRevision,
    committedAt: new Date(time).toISOString(),
  };
}

async function incomingIdentity(
  operation: PixyncCommittedOperation,
): Promise<PixyncIncomingIdentity> {
  return {
    operationId: operation.operationId,
    fingerprint: await committedOperationFingerprint(operation),
    projectRevision: operation.projectRevision,
  };
}

async function open(
  persistence: PixyncSnapshotPersistencePort =
    new PixyncInMemorySnapshotPersistence(),
  options: PixyncDurabilityOptions = {},
) {
  return PixyncDurableJournal.open(PROJECT, persistence, { now, ...options });
}

function crashAt(point: PixyncDurabilityCrashPoint) {
  let armed = true;
  return (actual: PixyncDurabilityCrashPoint) => {
    if (armed && actual === point) {
      armed = false;
      throw new PixyncDurabilityCrashError(actual);
    }
  };
}

function adapter(applied: string[], fail = false) {
  return {
    aggregate: "draw" as const,
    apply: (operation: PixyncCommittedOperation) => {
      if (fail) throw new Error("adapter failure");
      applied.push(operation.operationId);
    },
  };
}

async function receiveJournal(
  journal: Awaited<ReturnType<typeof open>>,
  operation: PixyncCommittedOperation,
  applied: string[],
  fail = false,
  identity?: PixyncIncomingIdentity,
) {
  await journal.acceptIncoming(operation, identity);
  const lease = await journal.leaseInbox("worker", now());
  assert.ok(lease);
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: [adapter(applied, fail), { aggregate: "audio", apply() {} }, {
      aggregate: "game",
      apply() {},
    }],
  });
  return { lease, keeper };
}

Deno.test("PIXYNC-DRAW2-120-01 enqueue restart resend", async () => {
  time = Date.parse("2026-08-23T00:00:00.000Z");
  const persistence = new PixyncInMemorySnapshotPersistence();
  const journal = await open(persistence, { leaseMs: 10 });
  const value = await journal.enqueue(await draft("outbox-restart"));
  assert.equal(value.record.state, "PENDING");
  time += 11;
  const restarted = await open(persistence, { leaseMs: 10 });
  const lease = await restarted.leaseOutbox("worker-a", now());
  assert.ok(lease);
  assert.equal(lease.record.operationId, "outbox-restart");
  assert.equal(lease.lease.attempt, 1);
});

Deno.test("PIXYNC-DRAW2-120-02 duplicate fingerprint is idempotent", async () => {
  const journal = await open();
  const value = await journal.enqueue(await draft("duplicate"));
  const duplicate = await journal.enqueue(await draft("duplicate"));
  assert.equal(value.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(journal.snapshot().outbox.length, 1);
});

Deno.test("PIXYNC-DRAW2-120-03 same operation ID different fingerprint conflicts", async () => {
  const journal = await open();
  await journal.enqueue(await draft("conflict"));
  await assert.rejects(
    async () =>
      journal.enqueue(
        await createPixyncDraft({
          operationId: "conflict",
          projectId: PROJECT,
          aggregate: "draw",
          actorId: "actor-120",
          clientId: "client-draw",
          clientSequence: 1,
          baseProjectRevision: 0,
          aggregateRevision: 0,
          payload: { command: "changed" },
        }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "IDEMPOTENCY_CONFLICT",
  );
});

Deno.test("PIXYNC-DRAW2-120-03b Outbox ACK conflicts with an Inbox revision", async () => {
  const journal = await open();
  await journal.acceptIncoming(await committed("remote-revision-owner", 1));
  await journal.enqueue(await draft("local-revision-claim"));
  const lease = await journal.leaseOutbox("worker", now());
  assert.ok(lease);

  await assert.rejects(
    async () =>
      journal.acknowledgeOutbox(
        "local-revision-claim",
        lease.lease.token,
        1,
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "REVISION_CONFLICT",
  );

  const snapshot = journal.snapshot();
  assert.equal(snapshot.vault.committed.length, 0);
  assert.equal(snapshot.outbox[0]?.state, "LEASED");
});

Deno.test("PIXYNC-DRAW2-120-04 stale lease fencing rejects old token", async () => {
  time = Date.parse("2026-08-23T00:00:00.000Z");
  const journal = await open(undefined, { leaseMs: 10 });
  await journal.enqueue(await draft("stale"));
  const first = await journal.leaseOutbox("worker-a", now());
  assert.ok(first);
  time += 11;
  const second = await journal.leaseOutbox("worker-b", now());
  assert.ok(second);
  await assert.rejects(
    () => journal.failOutbox("stale", first.lease.token, true),
    /stale/i,
  );
  assert.equal(second.lease.attempt, 2);
});

Deno.test("PIXYNC-DRAW2-120-05 ACK loss resend is idempotent", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const journal = await open(persistence);
  await journal.enqueue(await draft("ack-loss"));
  const lease = await journal.leaseOutbox("worker", now());
  assert.ok(lease);
  await journal.acknowledgeOutbox("ack-loss", lease.lease.token, 1);
  const resent = await (await open(persistence)).acknowledgeOutbox(
    "ack-loss",
    lease.lease.token,
    1,
  );
  assert.equal(resent.duplicate, true);
  assert.equal(resent.record.state, "DISPATCHED");
});

Deno.test("PIXYNC-DRAW2-120-06 unconfirmed draft cannot be deleted", async () => {
  const journal = await open();
  await journal.enqueue(await draft("unconfirmed"));
  assert.equal(await journal.pruneConfirmed(), 0);
  await assert.rejects(() =>
    journal.acknowledgeOutbox("unconfirmed", "wrong", 1)
  );
  assert.equal(journal.snapshot().vault.draft.length, 1);
  assert.equal(journal.snapshot().outbox[0]?.state, "PENDING");
});

Deno.test(
  "PIXYNC-DRAW2-120-06b pre-persist crashes expose no partial enqueue",
  async () => {
    for (
      const point of ["BEFORE_COMMIT", "AFTER_STAGE_BEFORE_PERSIST"] as const
    ) {
      const persistence = new PixyncInMemorySnapshotPersistence();
      const journal = await open(persistence, {
        faultInjector: crashAt(point),
      });
      const operation = await draft(`pre-persist-${point}`);
      await assert.rejects(
        () => journal.enqueue(operation),
        (error: unknown) =>
          error instanceof PixyncDurabilityCrashError &&
          error.crashPoint === point,
      );

      const persisted = persistence.snapshot();
      assert.ok(persisted);
      for (const snapshot of [persisted, journal.snapshot()]) {
        assert.equal(snapshot.vault.draft.length, 0);
        assert.equal(snapshot.vault.committed.length, 0);
        assert.equal(snapshot.outbox.length, 0);
        assert.equal(snapshot.inbox.length, 0);
        assert.equal(snapshot.revision, 0);
        assert.equal(snapshot.confirmedProjectRevision, 0);
      }
    }
  },
);

Deno.test("PIXYNC-DRAW2-120-07 persist response crash survives restart", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const crashing = await open(persistence, {
    faultInjector: crashAt("AFTER_PERSIST_BEFORE_RESPONSE"),
  });
  await assert.rejects(
    async () => crashing.enqueue(await draft("persisted-before-response")),
    PixyncDurabilityCrashError,
  );
  const restarted = await open(persistence);
  assert.equal(
    restarted.snapshot().outbox[0]?.operationId,
    "persisted-before-response",
  );
  assert.equal(crashing.snapshot().outbox.length, 0);
});

Deno.test("PIXYNC-DRAW2-120-08 incoming duplicate applies once", async () => {
  const journal = await open();
  const operation = await committed("incoming-once", 1);
  const identity = await incomingIdentity(operation);
  await assert.rejects(
    () =>
      journal.acceptIncoming(operation, {
        ...identity,
        fingerprint: "0".repeat(64),
      }),
    (error: unknown) =>
      error instanceof PixyncDurabilityError &&
      error.code === "INBOX_CONFLICT",
  );
  const applied: string[] = [];
  const first = await receiveJournal(
    journal,
    operation,
    applied,
    false,
    identity,
  );
  assert.equal(
    await journal.applyInbox(
      "incoming-once",
      first.lease.lease.token,
      first.keeper,
    ),
    "applied",
  );
  assert.equal((await journal.acceptIncoming(operation)).duplicate, true);
  assert.deepEqual(applied, ["incoming-once"]);
});

Deno.test("PIXYNC-DRAW2-120-09 gap-held is replayed in project order", async () => {
  const journal = await open();
  const op2 = await committed("gap-2", 2, "draw", 2);
  const op1 = await committed("gap-1", 1, "draw", 1);
  const applied: string[] = [];
  const second = await receiveJournal(journal, op2, applied);
  assert.equal(
    await journal.applyInbox("gap-2", second.lease.lease.token, second.keeper),
    "gap-held",
  );
  const first = await receiveJournal(journal, op1, applied);
  assert.equal(
    await journal.applyInbox("gap-1", first.lease.lease.token, first.keeper),
    "applied",
  );
  const retry = await journal.leaseInbox("worker", now());
  assert.ok(retry);
  assert.equal(
    await journal.applyInbox("gap-2", retry.lease.token, first.keeper),
    "applied",
  );
  assert.deepEqual(applied, ["gap-1", "gap-2"]);
});

Deno.test("PIXYNC-DRAW2-120-10 adapter failure is retryable", async () => {
  const journal = await open(undefined, { retryDelayMs: 1 });
  const operation = await committed("apply-retry", 1);
  const applied: string[] = [];
  const first = await receiveJournal(journal, operation, applied, true);
  await assert.rejects(() =>
    journal.applyInbox("apply-retry", first.lease.lease.token, first.keeper)
  );
  assert.equal(journal.snapshot().confirmedProjectRevision, 0);
  time += 2;
  const retry = await journal.leaseInbox("worker-2", now());
  assert.ok(retry);
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: [adapter(applied), { aggregate: "audio", apply() {} }, {
      aggregate: "game",
      apply() {},
    }],
  });
  assert.equal(
    await journal.applyInbox("apply-retry", retry.lease.token, keeper),
    "applied",
  );
  assert.deepEqual(applied, ["apply-retry"]);
});

Deno.test("PIXYNC-DRAW2-120-11 apply-before-ack receipt recovers without reapply", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const crashing = await open(persistence, {
    faultInjector: crashAt("AFTER_APPLY_BEFORE_ACK"),
  });
  const operation = await committed("apply-before-ack", 1);
  const applied: string[] = [];
  const first = await receiveJournal(crashing, operation, applied);
  await assert.rejects(
    () =>
      crashing.applyInbox(
        "apply-before-ack",
        first.lease.lease.token,
        first.keeper,
      ),
    PixyncDurabilityCrashError,
  );
  const restarted = await open(persistence);
  assert.equal(
    restarted.snapshot().inbox[0]?.receipt?.operationId,
    "apply-before-ack",
  );
  const keeper = new PixyncOrderKeeper({
    projectId: PROJECT,
    adapters: [adapter([]), { aggregate: "audio", apply() {} }, {
      aggregate: "game",
      apply() {},
    }],
  });
  assert.equal(
    await restarted.applyInbox(
      "apply-before-ack",
      first.lease.lease.token,
      keeper,
    ),
    "recovered",
  );
  assert.deepEqual(applied, ["apply-before-ack"]);
});

Deno.test("PIXYNC-DRAW2-120-12 tampered restore rejects fingerprint", async () => {
  const persistence = new PixyncInMemorySnapshotPersistence();
  const journal = await open(persistence);
  await journal.enqueue(await draft("tampered"));
  const snapshot = persistence.snapshot()!;
  const bad: PixyncDurableSnapshot = {
    ...snapshot,
    vault: {
      ...snapshot.vault,
      draft: [{ ...snapshot.vault.draft[0]!, fingerprint: "0".repeat(64) }],
    },
  };
  await assert.rejects(() =>
    open(new PixyncInMemorySnapshotPersistence(bad))
  );
  const badHash: PixyncDurableSnapshot = {
    ...snapshot,
    snapshotHash: "0".repeat(64),
  };
  await assert.rejects(() =>
    open(new PixyncInMemorySnapshotPersistence(badHash))
  );
  await assert.rejects(
    () =>
      createPixyncDraft({
        operationId: "forbidden-payload",
        projectId: PROJECT,
        aggregate: "draw",
        actorId: "actor-120",
        clientId: "client-draw",
        clientSequence: 1,
        baseProjectRevision: 0,
        aggregateRevision: 0,
        payload: { snapshot: { value: true } },
      }),
    (error: unknown) =>
      error instanceof PixyncError && error.code === "PAYLOAD_FORBIDDEN",
  );
});

Deno.test("PIXYNC-DRAW2-120-12b incoming identity and revision conflicts are durable", async () => {
  const journal = await open();
  const original = await committed("incoming-conflict", 1);
  await journal.acceptIncoming(original);
  const changedIdentity = { ...original, projectRevision: 2 };
  const identityConflict = await journal.acceptIncoming(changedIdentity);
  assert.equal(identityConflict.conflict, true);
  const revisionConflict = await journal.acceptIncoming(
    await committed("other-at-one", 1),
  );
  assert.equal(revisionConflict.conflict, true);
  assert.equal(
    journal.snapshot().inbox.filter((item) => item.state === "CONFLICT").length,
    2,
  );
});

Deno.test("PIXYNC-DRAW2-120-13 three aggregate revisions remain durable", async () => {
  const journal = await open();
  for (
    const [index, aggregate] of (["draw", "audio", "game"] as const).entries()
  ) {
    const item = await journal.enqueue(
      await draft(`aggregate-${aggregate}`, aggregate, 1),
    );
    const lease = await journal.leaseOutbox("worker", now());
    assert.ok(lease);
    await journal.acknowledgeOutbox(
      item.record.operationId,
      lease.lease.token,
      index + 1,
    );
  }
  const snapshot = journal.snapshot();
  assert.equal(snapshot.schemaVersion, "PIXYNC_DRAW2_DURABLE_SNAPSHOT_V1");
  assert.equal(snapshot.projectId, PROJECT);
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.confirmedProjectRevision, 3);
  assert.deepEqual(
    snapshot.vault.committed.map((item) => item.envelope.aggregate),
    ["draw", "audio", "game"],
  );
  assert.equal(await journal.pruneConfirmed(), 3);
  assert.equal(journal.snapshot().outbox.length, 0);
});

Deno.test("PIXYNC-DRAW2-120-14 retry limit reaches DLQ and capability stays non-production", async () => {
  const journal = await open(undefined, { maxAttempts: 1 });
  await journal.enqueue(await draft("dlq"));
  const lease = await journal.leaseOutbox("worker", now());
  assert.ok(lease);
  assert.equal(
    (await journal.failOutbox("dlq", lease.lease.token, true)).record.state,
    "DLQ",
  );
  assert.deepEqual(journal.capability, {
    processDurable: false,
    productionReady: false,
    indexedDb: "UNTESTED",
    file: "UNTESTED",
  });
});

Deno.test("PIXYNC-DRAW2-120-15 atomicReplace failure leaves memory unchanged", async () => {
  let calls = 0;
  const persistence: PixyncSnapshotPersistencePort = {
    load: () => undefined,
    atomicReplace: (snapshot) => {
      calls++;
      if (calls > 1) throw new Error("atomic replace failed");
      void snapshot;
    },
  };
  const journal = await open(persistence);
  await assert.rejects(
    async () => journal.enqueue(await draft("atomic-failure")),
    /atomic replace failed/,
  );
  assert.equal(journal.snapshot().outbox.length, 0);
});

Deno.test("PIXYNC-DRAW2-120-REGRESSION predecessor core envelope rejects mutation", async () => {
  const value = await draft("regression");
  await assert.rejects(
    () =>
      import("../../src/pixync/core.ts").then(({ validatePixyncDraft }) =>
        validatePixyncDraft({ ...value, payload: { changed: true } })
      ),
    (error: unknown) =>
      error instanceof PixyncError && error.code === "PAYLOAD_HASH_MISMATCH",
  );
});
