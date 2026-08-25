import { strict as assert } from "node:assert";
import {
  asFp004EventId,
  asFp004LeaseToken,
  asFp004TransactionId,
  type Fp004CanonicalEvent,
} from "../src/fp-004/contracts.ts";
import { asSha256 } from "../src/wp160-contracts.ts";
import {
  createFp004ServerProviderIngress,
  Fp004InboxOutboxLeaseAdapter,
  type Fp004ProviderInboxResolution,
  InMemoryFp004LeasePersistence,
} from "../src/fp-004/inbox-outbox-lease.ts";

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));
const HASH_C = asSha256("c".repeat(64));

function clockAt(iso = "2026-08-10T00:00:00.000Z") {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    moveMs: (milliseconds: number) => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

interface FixtureProviderPayload {
  readonly payloadHash: string;
  readonly providerEventId?: string;
  readonly principalId?: string;
  readonly tenantId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly canonicalEventId?: string;
}

function providerPayload(
  payloadHash = HASH_A,
  providerEventId = "evt-001",
): FixtureProviderPayload {
  return { payloadHash, providerEventId };
}

function testIngress(overrides: {
  readonly resolvedPrincipalId?: string;
  readonly resolvedTenantId?: string;
  readonly resolvedResourceType?: string;
  readonly resolvedResourceId?: string;
} = {}) {
  const principalId = "principal-a";
  const tenantId = "tenant-a";
  const resourceType = "payment";
  const resourceId = "payment-001";
  return createFp004ServerProviderIngress({
    principalId,
    tenantId,
    resourceType,
    resourceId,
    resolve(rawProviderPayload): Fp004ProviderInboxResolution {
      if (
        rawProviderPayload === null || typeof rawProviderPayload !== "object"
      ) {
        throw new Error("unverified fixture payload");
      }
      const raw = rawProviderPayload as FixtureProviderPayload;
      if (
        typeof raw.payloadHash !== "string" ||
        typeof raw.providerEventId !== "string"
      ) {
        throw new Error("unverified fixture identity");
      }
      return {
        principalId: overrides.resolvedPrincipalId ?? principalId,
        providerIdentity: {
          providerName: "fixture-provider",
          providerEventId: raw.providerEventId,
          payloadHash: asSha256(raw.payloadHash),
          eventType: "PAYMENT_CAPTURED",
          providerSchemaVersion: "provider-v1",
        },
        tenantId: overrides.resolvedTenantId ?? tenantId,
        resourceType: overrides.resolvedResourceType ?? resourceType,
        resourceId: overrides.resolvedResourceId ?? resourceId,
        canonicalEventId: asFp004EventId("event:payment-001"),
      };
    },
  });
}

const TEST_INGRESS = testIngress();

function canonicalEvent(resultHash = HASH_B): Fp004CanonicalEvent {
  return {
    schemaVersion: "DURABLE_EVENT_V1",
    eventId: asFp004EventId("event:outbox-001"),
    eventKind: "DOMAIN_FACT",
    aggregate: {
      tenantId: "tenant-a",
      aggregateType: "payment",
      aggregateId: "payment-001",
      aggregateVersion: 1,
      resourceType: "payment",
      resourceId: "payment-001",
    },
    payloadHash: HASH_A,
    resultHash,
    correlationId: "correlation-001",
    producerType: "fixture-core",
    transactionId: asFp004TransactionId("tx:outbox-001"),
    committedAt: "2026-08-10T00:00:00.000Z",
  };
}

function assertFailure(
  result: { ok: boolean; diagnostics: readonly { code: string }[] },
  code: string,
): void {
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, code);
}

Deno.test("FP004-INBOX-001 accepts durably, acknowledges duplicates, and quarantines identity conflicts", () => {
  const time = clockAt();
  const persistence = new InMemoryFp004LeasePersistence();
  const adapter = new Fp004InboxOutboxLeaseAdapter(persistence, {
    now: time.now,
  });

  const accepted = adapter.acceptProviderEvent(TEST_INGRESS, providerPayload());
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.value.duplicate, false);
  assert.equal(accepted.value.acknowledgement, "PENDING_LEASE");
  assert.equal(accepted.value.inbox.state, "ACCEPTED");

  const restarted = new Fp004InboxOutboxLeaseAdapter(persistence, {
    now: time.now,
  });
  const duplicate = restarted.acceptProviderEvent(
    TEST_INGRESS,
    providerPayload(),
  );
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.value.duplicate, true);
  assert.equal(duplicate.value.acknowledgement, "DUPLICATE_PENDING_LEASE");
  assert.equal(duplicate.value.inbox.inboxId, accepted.value.inbox.inboxId);

  const conflictingPayload = restarted.acceptProviderEvent(
    TEST_INGRESS,
    providerPayload(HASH_C),
  );
  assertFailure(conflictingPayload, "PROVIDER_IDENTITY_CONFLICT");
  assert.equal(restarted.snapshot().inbox.length, 1);
  assert.equal(restarted.snapshot().conflicts.length, 1);
  assert.equal(
    restarted.snapshot().inbox[0]?.providerIdentity.payloadHash,
    HASH_A,
  );

  const lease = restarted.leaseInbox("worker-a", time.now());
  assert.equal(lease.ok, true);
  if (!lease.ok) return;
  const completed = restarted.acknowledgeInbox(
    "worker-a",
    lease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    lease.value.record.inboxId,
  );
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.acknowledged, true);
  assert.equal(completed.value.sideEffectAllowed, false);

  const duplicateAfterCompletion = restarted.acceptProviderEvent(
    TEST_INGRESS,
    providerPayload(),
  );
  assert.equal(duplicateAfterCompletion.ok, true);
  if (!duplicateAfterCompletion.ok) return;
  const duplicateLease = restarted.leaseInbox("worker-b", time.now(), {
    inboxId: duplicateAfterCompletion.value.inbox.inboxId,
    allowCompletedDuplicate: true,
  });
  assert.equal(duplicateLease.ok, true);
  if (!duplicateLease.ok) return;
  const duplicateAck = restarted.acknowledgeInbox(
    "worker-b",
    duplicateLease.value.lease.fencingToken,
    {
      outcome: "DUPLICATE",
    },
    time.now(),
    duplicateLease.value.record.inboxId,
  );
  assert.equal(duplicateAck.ok, true);
  if (duplicateAck.ok) assert.equal(duplicateAck.value.duplicate, true);
});

Deno.test("FP004-RECOVERY-001 restores Inbox/Outbox and reclaims expired leases with a new fence", () => {
  const time = clockAt();
  const persistence = new InMemoryFp004LeasePersistence();
  const adapter = new Fp004InboxOutboxLeaseAdapter(persistence, {
    now: time.now,
    policy: {
      leaseMs: 100,
      maxAttempts: 3,
      baseBackoffMs: 10,
      maxBackoffMs: 20,
    },
  });
  const enqueued = adapter.enqueueOutbox(canonicalEvent());
  assert.equal(enqueued.ok, true);
  if (!enqueued.ok) return;
  const duplicateEnqueue = adapter.enqueueOutbox(canonicalEvent());
  assert.equal(duplicateEnqueue.ok, true);
  if (duplicateEnqueue.ok) assert.equal(duplicateEnqueue.value.duplicate, true);
  const conflictingEnqueue = adapter.enqueueOutbox(canonicalEvent(HASH_C));
  assertFailure(conflictingEnqueue, "IDEMPOTENCY_CONFLICT");
  const firstLease = adapter.leaseOutbox("worker-a", time.now());
  assert.equal(firstLease.ok, true);
  if (!firstLease.ok) return;
  const inbox = adapter.acceptProviderEvent(TEST_INGRESS, providerPayload());
  assert.equal(inbox.ok, true);
  if (!inbox.ok) return;
  const inboxLease = adapter.leaseInbox("worker-a", time.now());
  assert.equal(inboxLease.ok, true);
  if (!inboxLease.ok) return;

  time.moveMs(101);
  const restarted = new Fp004InboxOutboxLeaseAdapter(persistence, {
    now: time.now,
    policy: {
      leaseMs: 100,
      maxAttempts: 3,
      baseBackoffMs: 10,
      maxBackoffMs: 20,
    },
  });
  const secondLease = restarted.leaseOutbox("worker-b", time.now());
  assert.equal(secondLease.ok, true);
  if (!secondLease.ok) return;
  assert.notEqual(
    secondLease.value.lease.fencingToken,
    firstLease.value.lease.fencingToken,
  );
  const staleOutbox = restarted.completeOutbox(
    "worker-a",
    firstLease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    firstLease.value.record.outboxId,
  );
  assertFailure(staleOutbox, "LEASE_STALE");
  assert.equal(restarted.snapshot().outbox[0]?.state, "LEASED");
  assert.equal(
    restarted.snapshot().outbox[0]?.eventId,
    firstLease.value.record.eventId,
  );

  const secondInboxLease = restarted.leaseInbox("worker-b", time.now());
  assert.equal(secondInboxLease.ok, true);
  if (!secondInboxLease.ok) return;
  assert.notEqual(
    secondInboxLease.value.lease.fencingToken,
    inboxLease.value.lease.fencingToken,
  );
  const staleInbox = restarted.acknowledgeInbox(
    "worker-a",
    inboxLease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    inboxLease.value.record.inboxId,
  );
  assertFailure(staleInbox, "LEASE_STALE");

  const outboxCompleted = restarted.completeOutbox(
    "worker-b",
    secondLease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    secondLease.value.record.outboxId,
  );
  assert.equal(outboxCompleted.ok, true);
  const inboxCompleted = restarted.acknowledgeInbox(
    "worker-b",
    secondInboxLease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    secondInboxLease.value.record.inboxId,
  );
  assert.equal(inboxCompleted.ok, true);
  if (outboxCompleted.ok && inboxCompleted.ok) {
    assert.equal(outboxCompleted.value.sideEffectAllowed, false);
    assert.equal(inboxCompleted.value.acknowledged, true);
  }
});

Deno.test("FP004-EVT-002 bounds exponential retry, persists backoff, and moves poison work to DLQ", () => {
  const time = clockAt();
  const adapter = new Fp004InboxOutboxLeaseAdapter(
    new InMemoryFp004LeasePersistence(),
    {
      now: time.now,
      policy: {
        leaseMs: 100,
        maxAttempts: 3,
        baseBackoffMs: 10,
        maxBackoffMs: 20,
      },
    },
  );
  const enqueued = adapter.enqueueOutbox(canonicalEvent());
  assert.equal(enqueued.ok, true);
  if (!enqueued.ok) return;

  const first = adapter.leaseOutbox("worker-a", time.now());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const retry1 = adapter.completeOutbox(
    "worker-a",
    first.value.lease.fencingToken,
    {
      outcome: "RETRYABLE_FAILURE",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "temporary",
        recoverable: true,
      },
    },
    time.now(),
    first.value.record.outboxId,
  );
  assert.equal(retry1.ok, true);
  if (!retry1.ok) return;
  assert.equal(retry1.value.record.state, "PENDING");
  assert.equal(
    Date.parse(retry1.value.record.nextAttemptAt),
    Date.parse("2026-08-10T00:00:00.010Z"),
  );

  const tooSoon = adapter.leaseOutbox("worker-a", time.now());
  assertFailure(tooSoon, "NOT_FOUND");
  time.moveMs(10);
  const second = adapter.leaseOutbox("worker-a", time.now());
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const retry2 = adapter.completeOutbox(
    "worker-a",
    second.value.lease.fencingToken,
    {
      outcome: "RETRYABLE_FAILURE",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "still temporary",
        recoverable: true,
      },
    },
    time.now(),
    second.value.record.outboxId,
  );
  assert.equal(retry2.ok, true);
  if (!retry2.ok) return;
  assert.equal(
    Date.parse(
      (retry2.value.record as { nextAttemptAt: string }).nextAttemptAt,
    ),
    Date.parse("2026-08-10T00:00:00.030Z"),
  );

  time.moveMs(20);
  const third = adapter.leaseOutbox("worker-a", time.now());
  assert.equal(third.ok, true);
  if (!third.ok) return;
  const poisoned = adapter.completeOutbox(
    "worker-a",
    third.value.lease.fencingToken,
    {
      outcome: "POISON",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "poison fixture",
        recoverable: false,
      },
    },
    time.now(),
    third.value.record.outboxId,
  );
  assert.equal(poisoned.ok, true);
  if (!poisoned.ok) return;
  assert.equal(poisoned.value.record.state, "DLQ");
  assert.equal(adapter.snapshot().deadLetters.length, 1);

  const inboxPersistence = new InMemoryFp004LeasePersistence();
  const inboxAdapter = new Fp004InboxOutboxLeaseAdapter(inboxPersistence, {
    now: time.now,
    policy: {
      leaseMs: 100,
      maxAttempts: 2,
      baseBackoffMs: 10,
      maxBackoffMs: 20,
    },
  });
  const inboxAccepted = inboxAdapter.acceptProviderEvent(
    TEST_INGRESS,
    providerPayload(HASH_A, "evt-retry"),
  );
  assert.equal(inboxAccepted.ok, true);
  if (!inboxAccepted.ok) return;
  const inboxFirst = inboxAdapter.leaseInbox("worker-inbox", time.now());
  assert.equal(inboxFirst.ok, true);
  if (!inboxFirst.ok) return;
  const inboxRetry = inboxAdapter.acknowledgeInbox(
    "worker-inbox",
    inboxFirst.value.lease.fencingToken,
    {
      outcome: "RETRYABLE_FAILURE",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "temporary inbox failure",
        recoverable: true,
      },
    },
    time.now(),
    inboxFirst.value.record.inboxId,
  );
  assert.equal(inboxRetry.ok, true);
  assert.equal(inboxAdapter.snapshot().inboxNextAttemptAt.length, 1);
  const inboxRestarted = new Fp004InboxOutboxLeaseAdapter(inboxPersistence, {
    now: time.now,
    policy: {
      leaseMs: 100,
      maxAttempts: 2,
      baseBackoffMs: 10,
      maxBackoffMs: 20,
    },
  });
  const inboxTooSoon = inboxRestarted.leaseInbox("worker-inbox", time.now());
  assertFailure(inboxTooSoon, "NOT_FOUND");
  time.moveMs(10);
  const inboxSecond = inboxRestarted.leaseInbox("worker-inbox", time.now());
  assert.equal(inboxSecond.ok, true);
  if (!inboxSecond.ok) return;
  const inboxPoison = inboxRestarted.acknowledgeInbox(
    "worker-inbox",
    inboxSecond.value.lease.fencingToken,
    {
      outcome: "POISON",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "poison inbox fixture",
        recoverable: false,
      },
    },
    time.now(),
    inboxSecond.value.record.inboxId,
  );
  assert.equal(inboxPoison.ok, true);
  if (inboxPoison.ok) assert.equal(inboxPoison.value.record.state, "DLQ");
});

Deno.test("FP004-SEC-001 rejects forged ingress capabilities, mismatched context, and lease-less results", () => {
  const time = clockAt();
  const callerShapedInput = {
    origin: "PROVIDER_ADAPTER",
    providerIdentity: {
      providerName: "fixture-provider",
      providerEventId: "evt-001",
      payloadHash: HASH_A,
      eventType: "PAYMENT_CAPTURED",
      providerSchemaVersion: "provider-v1",
    },
    tenantId: "tenant-a",
    resourceType: "payment",
    resourceId: "payment-001",
    canonicalEventId: "event:payment-001",
  };
  const forgedIngresses: unknown[] = [
    structuredClone(TEST_INGRESS),
    { ...TEST_INGRESS },
    JSON.parse(JSON.stringify(TEST_INGRESS)) as unknown,
    new Proxy(TEST_INGRESS, {}),
    structuredClone(callerShapedInput),
    { ...callerShapedInput },
    JSON.parse(JSON.stringify(callerShapedInput)) as unknown,
    new Proxy(callerShapedInput, {}),
  ];
  for (const forgedIngress of forgedIngresses) {
    const adapter = new Fp004InboxOutboxLeaseAdapter(
      new InMemoryFp004LeasePersistence(),
      { now: time.now },
    );
    const rejected = adapter.acceptProviderEvent(
      forgedIngress,
      providerPayload(),
    );
    assertFailure(rejected, "PROVIDER_IDENTITY_INVALID");
    assert.equal(adapter.snapshot().inbox.length, 0);
    assert.equal(adapter.snapshot().conflicts.length, 0);
    assert.equal(adapter.snapshot().outbox.length, 0);
  }

  const callerAdapter = new Fp004InboxOutboxLeaseAdapter(
    new InMemoryFp004LeasePersistence(),
    { now: time.now },
  );
  const callerRejected = callerAdapter.acceptProviderEvent(
    callerShapedInput,
    providerPayload(),
  );
  assertFailure(callerRejected, "PROVIDER_IDENTITY_INVALID");
  assert.equal(callerAdapter.snapshot().inbox.length, 0);
  assert.equal(callerAdapter.snapshot().conflicts.length, 0);
  assert.equal(callerAdapter.snapshot().outbox.length, 0);

  for (
    const override of [
      { resolvedPrincipalId: "principal-b" },
      { resolvedTenantId: "tenant-b" },
      { resolvedResourceId: "payment-b" },
    ]
  ) {
    const mismatchAdapter = new Fp004InboxOutboxLeaseAdapter(
      new InMemoryFp004LeasePersistence(),
      { now: time.now },
    );
    const mismatch = mismatchAdapter.acceptProviderEvent(
      testIngress(override),
      providerPayload(),
    );
    assertFailure(mismatch, "AUTHORIZATION_DENIED");
    assert.equal(mismatchAdapter.snapshot().inbox.length, 0);
    assert.equal(mismatchAdapter.snapshot().conflicts.length, 0);
    assert.equal(mismatchAdapter.snapshot().outbox.length, 0);
  }

  const adapter = new Fp004InboxOutboxLeaseAdapter(
    new InMemoryFp004LeasePersistence(),
    { now: time.now },
  );
  const callerFieldsIgnored = adapter.acceptProviderEvent(TEST_INGRESS, {
    ...providerPayload(),
    principalId: "principal-attacker",
    tenantId: "tenant-attacker",
    resourceType: "asset",
    resourceId: "asset-attacker",
    canonicalEventId: "event:attacker",
  });
  assert.equal(callerFieldsIgnored.ok, true);
  if (callerFieldsIgnored.ok) {
    assert.equal(callerFieldsIgnored.value.inbox.tenantId, "tenant-a");
    assert.equal(callerFieldsIgnored.value.inbox.resourceType, "payment");
    assert.equal(callerFieldsIgnored.value.inbox.resourceId, "payment-001");
  }

  const invalidPayload = adapter.acceptProviderEvent(TEST_INGRESS, {
    payloadHash: "not-a-hash",
    providerEventId: "",
  });
  assertFailure(invalidPayload, "PROVIDER_IDENTITY_INVALID");
  assert.equal(adapter.snapshot().inbox.length, 1);
  assert.equal(adapter.snapshot().conflicts.length, 0);

  const enqueued = adapter.enqueueOutbox(canonicalEvent());
  assert.equal(enqueued.ok, true);
  if (!enqueued.ok) return;
  const noLease = adapter.completeOutbox(
    "worker-a",
    asFp004LeaseToken("fence:999"),
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    enqueued.value.record.outboxId,
  );
  assertFailure(noLease, "LEASE_STALE");

  const lease = adapter.leaseOutbox("worker-a", time.now());
  assert.equal(lease.ok, true);
  if (!lease.ok) return;
  const malformed = adapter.completeOutbox(
    "worker-a",
    lease.value.lease.fencingToken,
    { ok: true },
    time.now(),
    lease.value.record.outboxId,
  );
  assertFailure(malformed, "MALFORMED_SUCCESS");
  assert.equal(adapter.snapshot().outbox[0]?.state, "LEASED");
  time.moveMs(30_001);
  const expired = adapter.completeOutbox(
    "worker-a",
    lease.value.lease.fencingToken,
    {
      outcome: "SUCCESS",
      resultHash: HASH_B,
    },
    time.now(),
    lease.value.record.outboxId,
  );
  assertFailure(expired, "LEASE_STALE");
  assert.equal(adapter.snapshot().outbox[0]?.state, "PENDING");
});
