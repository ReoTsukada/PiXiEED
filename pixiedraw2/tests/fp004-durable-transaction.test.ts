import { strict as assert } from "node:assert";
import {
  FP004_REFERENCE_ADAPTER_CAPABILITY,
  type Fp004AdapterOptions,
  Fp004CrashError,
  Fp004RestartableInMemoryAdapter,
  validateFp004CommitResult,
} from "../src/fp-004/durable-transaction.ts";
import {
  asFp004EventId,
  asFp004LeaseToken,
  asFp004RecordId,
  type Fp004CommitRequest,
  type Fp004Diagnostic,
  type Fp004ProviderIdentity,
} from "../src/fp-004/contracts.ts";
import type {
  AuthorizationProofV1,
  ContentHash,
} from "../src/wp160-contracts.ts";

const hash = (suffix: string): ContentHash => {
  const hex = [...suffix].map((character) =>
    character.charCodeAt(0).toString(16)
  ).join("");
  return hex.padEnd(64, "0").slice(0, 64) as ContentHash;
};
// Keep the fixture valid regardless of when the conformance suite is run.
// The adapter clock is intentionally fixed to this captured instant so retries
// and snapshot restoration remain deterministic within a test run.
const fixtureNow = new Date();
const now = fixtureNow.toISOString();
const expiresAt = new Date(fixtureNow.getTime() + 30 * 60 * 1_000)
  .toISOString();

function proof(
  overrides: Partial<AuthorizationProofV1> = {},
): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority-1",
    proofId: "proof-1",
    principalId: "principal-1",
    resourceType: "project",
    resourceId: "project-1",
    action: "project.write",
    capability: "PROJECT.WRITE",
    tenantId: "tenant-1",
    correlationId: "correlation-1",
    policyVersion: "authorization-policy-v1",
    grantId: "grant-1",
    issuedAt: now,
    expiresAt,
    ...overrides,
  };
}

function provider(
  overrides: Partial<Fp004ProviderIdentity> = {},
): Fp004ProviderIdentity {
  return {
    providerName: "fixture-provider",
    providerEventId: "provider-event-1",
    payloadHash: hash("payload"),
    eventType: "fixture.completed",
    providerSchemaVersion: "provider-v1",
    ...overrides,
  };
}

function request(
  overrides: Partial<Fp004CommitRequest> = {},
): Fp004CommitRequest {
  const base: Fp004CommitRequest = {
    authorizationProof: proof(),
    expectedAuthorization: {
      principalId: "principal-1",
      tenantId: "tenant-1",
      resourceType: "project",
      resourceId: "project-1",
      action: "project.write",
      capability: "PROJECT.WRITE",
    },
    idempotency: {
      scope: "project.write",
      key: "request-1",
      requestHash: hash("request"),
    },
    event: {
      schemaVersion: "DURABLE_EVENT_V1",
      eventId: asFp004EventId("event-1"),
      eventKind: "DOMAIN_FACT",
      aggregate: {
        tenantId: "tenant-1",
        aggregateType: "project",
        aggregateId: "project-aggregate-1",
        aggregateVersion: 1,
        resourceType: "project",
        resourceId: "project-1",
      },
      payloadHash: hash("payload"),
      resultHash: hash("state-1"),
      correlationId: "correlation-1",
      producerType: "fixture-core",
    },
    stateReference: {
      resourceType: "project",
      resourceId: "project-1",
      expectedRevision: "GENESIS",
      nextRevision: "project-revision-1",
      stateHash: hash("state-1"),
    },
  };
  return {
    ...base,
    ...overrides,
    expectedAuthorization: {
      ...base.expectedAuthorization,
      ...(overrides.expectedAuthorization ?? {}),
    },
    idempotency: { ...base.idempotency, ...(overrides.idempotency ?? {}) },
    event: { ...base.event, ...(overrides.event ?? {}) },
    stateReference: {
      ...base.stateReference,
      ...(overrides.stateReference ?? {}),
    },
  };
}

function adapter(
  options: Fp004AdapterOptions = {},
): Fp004RestartableInMemoryAdapter {
  return new Fp004RestartableInMemoryAdapter({
    clock: () => new Date(now),
    authorizationRevalidator: () => true,
    ...options,
  });
}

function assertFailure(result: { readonly ok: boolean }, code: string): void {
  assert.equal(result.ok, false);
  const failureResult = result as {
    readonly ok: false;
    readonly diagnostics: readonly { readonly code: string }[];
  };
  if (failureResult.ok === false) {
    assert.equal(failureResult.diagnostics[0]?.code, code);
  }
}

Deno.test("FP004-EVT-001 atomic commit and retry-after-commit preserve one canonical result", async () => {
  let crashed = false;
  const store = adapter({
    faultInjector: (point) => {
      if (point === "AFTER_COMMIT_BEFORE_RESPONSE" && !crashed) {
        crashed = true;
        throw new Fp004CrashError(point);
      }
    },
  });
  await assert.rejects(() => store.commit(request()), Fp004CrashError);
  const retry = await store.commit(request());
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.value.duplicate, true);
    assert.equal(retry.value.event.eventId, "event-1");
    assert.equal(retry.value.outbox.eventId, retry.value.event.eventId);
  }
  assert.equal(store.snapshot().events.length, 1);
  assert.equal(store.snapshot().outbox.length, 1);
  assert.equal(store.snapshot().idempotency.length, 1);
  assert.equal(store.snapshot().states.length, 1);

  const restored = Fp004RestartableInMemoryAdapter.fromSnapshot(
    store.snapshot(),
    {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    },
  );
  const afterRestart = await restored.commit(request());
  assert.equal(afterRestart.ok, true);
  if (afterRestart.ok) assert.equal(afterRestart.value.duplicate, true);

  const distinctEventAfterRestart = await restored.commit(request({
    event: {
      ...request().event,
      eventId: asFp004EventId("event-after-restart"),
    },
  }));
  assert.equal(distinctEventAfterRestart.ok, true);
  if (distinctEventAfterRestart.ok) {
    assert.equal(distinctEventAfterRestart.value.duplicate, true);
    assert.equal(distinctEventAfterRestart.value.event.eventId, "event-1");
  }
  assert.equal(restored.snapshot().events.length, 1);
});

Deno.test("FP004-SEC-001 tampered snapshot is rejected before existing state is cleared", async () => {
  const store = adapter();
  assert.equal((await store.commit(request())).ok, true);
  const before = store.snapshot();
  const tampered = structuredClone(before);
  (tampered.states as Array<typeof tampered.states[number]>)[0] = {
    ...tampered.states[0]!,
    stateHash: hash("tampered-state"),
  };
  assert.throws(() => store.restore(tampered), /snapshot is invalid/);
  assert.deepEqual(store.snapshot(), before);
});

Deno.test("FP004-EVT-001 concurrent same-command submission has one commit", async () => {
  const store = adapter({
    authorizationRevalidator: async () => {
      await Promise.resolve();
      return true;
    },
  });
  const results = await Promise.all([
    store.commit(request()),
    store.commit(request()),
  ]);
  assert.equal(
    results.filter((result) => result.ok && !result.value.duplicate).length,
    1,
  );
  assert.equal(
    results.filter((result) => result.ok && result.value.duplicate).length,
    1,
  );
  assert.equal(store.snapshot().events.length, 1);
});

Deno.test("FP004-EVT-001 pre-commit crash points leave all durable maps unchanged", async () => {
  for (
    const point of [
      "BEFORE_TRANSACTION",
      "AFTER_STATE_WRITE",
      "AFTER_EVENT_OUTBOX_WRITE",
    ] as const
  ) {
    const store = adapter({
      faultInjector: (actual) => {
        if (actual === point) throw new Fp004CrashError(actual);
      },
    });
    await assert.rejects(() => store.commit(request()), Fp004CrashError);
    const snapshot = store.snapshot();
    assert.equal(snapshot.states.length, 0, point);
    assert.equal(snapshot.events.length, 0, point);
    assert.equal(snapshot.outbox.length, 0, point);
    assert.equal(snapshot.idempotency.length, 0, point);
  }
});

Deno.test("FP004-EVT-002 provider identity duplicate and conflict are fail closed", async () => {
  const store = adapter();
  const first = await store.commit(request({
    event: {
      ...request().event,
      eventKind: "PROVIDER_CALLBACK",
      providerIdentity: provider(),
    },
  }));
  assert.equal(first.ok, true);
  const duplicate = await store.commit(request({
    idempotency: {
      ...request().idempotency,
      key: "request-2",
      requestHash: hash("request-2"),
    },
    event: {
      ...request().event,
      eventKind: "PROVIDER_CALLBACK",
      providerIdentity: provider(),
    },
  }));
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.duplicate, true);
  const conflict = await store.commit(request({
    idempotency: {
      ...request().idempotency,
      key: "request-3",
      requestHash: hash("request-3"),
    },
    event: {
      ...request().event,
      eventKind: "PROVIDER_CALLBACK",
      providerIdentity: provider({ payloadHash: hash("changed") }),
    },
  }));
  assertFailure(conflict, "IDEMPOTENCY_CONFLICT");
  assertFailure(
    await store.commit(request({
      event: { ...request().event, eventKind: "PROVIDER_CALLBACK" },
    })),
    "PROVIDER_IDENTITY_INVALID",
  );
});

Deno.test("FP004-ORDER-001 enforces next version, stale, gap, and same-version conflict", async () => {
  const store = adapter();
  assert.equal((await store.commit(request())).ok, true);
  assertFailure(
    await store.commit(request({
      idempotency: {
        ...request().idempotency,
        key: "stale",
        requestHash: hash("stale"),
      },
      event: {
        ...request().event,
        eventId: asFp004EventId("event-stale"),
        aggregate: { ...request().event.aggregate, aggregateVersion: 1 },
      },
      stateReference: {
        ...request().stateReference,
        expectedRevision: "project-revision-1",
        nextRevision: "project-revision-2",
      },
    })),
    "AGGREGATE_VERSION_STALE",
  );
  assertFailure(
    await store.commit(request({
      idempotency: {
        ...request().idempotency,
        key: "gap",
        requestHash: hash("gap"),
      },
      event: {
        ...request().event,
        eventId: asFp004EventId("event-gap"),
        aggregate: { ...request().event.aggregate, aggregateVersion: 3 },
      },
      stateReference: {
        ...request().stateReference,
        expectedRevision: "project-revision-1",
        nextRevision: "project-revision-3",
      },
    })),
    "AGGREGATE_GAP_HELD",
  );
  assert.equal(store.listGaps().length, 1);
  const recovered = await store.commit(request({
    idempotency: {
      ...request().idempotency,
      key: "recovery",
      requestHash: hash("recovery"),
    },
    event: {
      ...request().event,
      eventId: asFp004EventId("event-recovery"),
      aggregate: { ...request().event.aggregate, aggregateVersion: 2 },
    },
    stateReference: {
      ...request().stateReference,
      expectedRevision: "project-revision-1",
      nextRevision: "project-revision-2",
    },
  }));
  assert.equal(recovered.ok, true);
  const gapEvent = await store.commit(request({
    idempotency: {
      ...request().idempotency,
      key: "gap-retry",
      requestHash: hash("gap-retry"),
    },
    event: {
      ...request().event,
      eventId: asFp004EventId("event-gap"),
      aggregate: { ...request().event.aggregate, aggregateVersion: 3 },
    },
    stateReference: {
      ...request().stateReference,
      expectedRevision: "project-revision-2",
      nextRevision: "project-revision-3",
    },
  }));
  assert.equal(gapEvent.ok, true);
  assert.equal(store.listGaps().length, 0);
  assertFailure(
    await store.commit(request({
      idempotency: {
        ...request().idempotency,
        key: "conflict",
        requestHash: hash("conflict"),
      },
      event: {
        ...request().event,
        eventId: asFp004EventId("event-conflict"),
        aggregate: { ...request().event.aggregate, aggregateVersion: 1 },
      },
    })),
    "AGGREGATE_VERSION_STALE",
  );
});

Deno.test("FP004-SEC-001 missing/false revalidation and malformed success fail closed", async () => {
  assertFailure(
    await new Fp004RestartableInMemoryAdapter().commit(request()),
    "AUTHORIZATION_DENIED",
  );
  assertFailure(
    await adapter({ authorizationRevalidator: () => false }).commit(request()),
    "AUTHORIZATION_DENIED",
  );
  assertFailure(validateFp004CommitResult({ ok: true }), "MALFORMED_SUCCESS");
  assertFailure(
    validateFp004CommitResult({ ok: true, value: { committed: true } }),
    "MALFORMED_SUCCESS",
  );
  assert.equal(FP004_REFERENCE_ADAPTER_CAPABILITY.processDurable, false);
  assert.equal(FP004_REFERENCE_ADAPTER_CAPABILITY.productionDurable, false);
});

Deno.test("FP004-INBOX-001 restartable Inbox and fencing reject stale worker", async () => {
  const first = adapter();
  const accepted = await first.acceptInbox({
    providerIdentity: provider({ providerEventId: "inbox-event" }),
    tenantId: "tenant-1",
    resourceType: "project",
    resourceId: "project-1",
  });
  assert.equal(accepted.ok, true);
  const restored = Fp004RestartableInMemoryAdapter.fromSnapshot(
    first.snapshot(),
    { clock: () => new Date(now) },
  );
  const id = "inbox:fixture-provider:inbox-event";
  const lease = restored.leaseInbox({ id, ownerId: "worker-a" });
  assert.equal(lease.ok, true);
  if (lease.ok) {
    const stale = {
      ...lease.value.lease,
      fencingToken: asFp004LeaseToken("wrong-token"),
    };
    assertFailure(restored.acknowledgeInbox(id, stale), "LEASE_STALE");
    assert.equal(restored.acknowledgeInbox(id, lease.value.lease).ok, true);
  }
});

Deno.test("FP004-RECOVERY-001 retry attempts are counted once per lease and stop at the bound", async () => {
  const store = adapter();
  const committed = await store.commit(request());
  assert.equal(committed.ok, true);
  if (!committed.ok) return;
  const diagnostic: Fp004Diagnostic = {
    code: "CONSUMER_FAILURE",
    message: "synthetic retry",
    recoverable: true,
  };
  for (const expectedAttempt of [1, 2, 3]) {
    const leased = store.leaseOutbox({
      id: committed.value.outbox.outboxId,
      ownerId: `worker-${expectedAttempt}`,
    });
    assert.equal(leased.ok, true);
    if (!leased.ok) return;
    assert.equal(leased.value.record.attemptCount, expectedAttempt);
    const failed = store.failOutbox(
      committed.value.outbox.outboxId,
      leased.value.lease,
      "RETRYABLE_FAILURE",
      diagnostic,
    );
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    assert.equal(failed.value.attemptCount, expectedAttempt);
    assert.equal(failed.value.state, expectedAttempt === 3 ? "DLQ" : "PENDING");
  }
  assertFailure(
    store.leaseOutbox({
      id: committed.value.outbox.outboxId,
      ownerId: "worker-after-bound",
    }),
    "LEASE_DENIED",
  );
});

Deno.test("FP004-REPLAY-001 replay is projection-shaped and side-effect-free", async () => {
  const store = adapter();
  await store.commit(request());
  const result = store.replay({
    replayRunId: asFp004RecordId("replay-1"),
    consumerId: "search",
    sideEffectMode: "NONE",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.eventIds, ["event-1"]);
    assert.equal(result.value.canonicalStateMutated, false);
  }
  assertFailure(
    store.replay({
      replayRunId: asFp004RecordId("replay-2"),
      consumerId: "finance",
      sideEffectMode: "ALLOW_PROVIDER_EFFECT" as never,
    }),
    "REPLAY_SIDE_EFFECT_FORBIDDEN",
  );
});
