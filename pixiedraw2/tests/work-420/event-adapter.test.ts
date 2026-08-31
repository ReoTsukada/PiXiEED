import { strict as assert } from "node:assert";
import { Fp004CrashError } from "../../src/fp-004/durable-transaction.ts";
import {
  asFp004EventId,
  asFp004RecordId,
  FP004_SCHEMA_VERSION,
  type Fp004CanonicalEvent,
  type Fp004CommitRequest,
  type Fp004ProviderIdentity,
} from "../../src/fp-004/contracts.ts";
import {
  asSha256,
  type AuthorizationProofV1,
  hashCanonical,
} from "../../src/wp160-contracts.ts";
import { Work420TrustedEventAdapter } from "../../src/platform/work-420/event-adapter.ts";

const TENANT_ID = "tenant:work420:event";
const RESOURCE_TYPE = "DIRECT_WORK_REQUEST";
const RESOURCE_ID = "work420:event-request";
const PRINCIPAL_ID = "account:work420:event";
const NOW = new Date("2026-08-16T00:00:00.000Z");

function hashDigit(digit: string) {
  return asSha256(digit.repeat(64));
}

function proof(): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "work420-event-server",
    proofId: "work420:event:proof",
    principalId: PRINCIPAL_ID,
    resourceType: RESOURCE_TYPE,
    resourceId: RESOURCE_ID,
    action: "work420.event.commit",
    capability: "work420.event.commit",
    tenantId: TENANT_ID,
    correlationId: "work420:event:correlation",
    policyVersion: "authorization-policy-v1",
    grantId: "work420:event:grant",
    issuedAt: new Date(Date.now() - 1_000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function providerIdentity(
  version: number,
  payloadHash = hashDigit(String((version % 9) + 1)),
): Fp004ProviderIdentity {
  return {
    providerName: "test-provider",
    providerEventId: `provider:work420:${version}`,
    payloadHash,
    eventType: "PAID",
    providerSchemaVersion: "TEST_PROVIDER_V1",
  };
}

function eventFor(
  version: number,
  options: { readonly providerIdentity?: Fp004ProviderIdentity } = {},
): Fp004CanonicalEvent {
  return {
    schemaVersion: FP004_SCHEMA_VERSION,
    eventId: asFp004EventId(`work420:event:${version}`),
    eventKind: "DOMAIN_FACT",
    aggregate: {
      tenantId: TENANT_ID,
      aggregateType: "WORK420_DIRECT_WORK",
      aggregateId: "work420:aggregate",
      aggregateVersion: version,
      resourceType: RESOURCE_TYPE,
      resourceId: RESOURCE_ID,
    },
    payloadHash: hashDigit(String(((version + 3) % 9) + 1)),
    resultHash: hashDigit(String(((version + 4) % 9) + 1)),
    correlationId: "work420:event:correlation",
    producerType: "WORK420_COMPOSITION",
    ...(options.providerIdentity === undefined
      ? {}
      : { providerIdentity: options.providerIdentity }),
    transactionId: `tx:work420:event:${version}` as never,
    committedAt: NOW.toISOString(),
  };
}

function commitFor(
  version: number,
  options: {
    readonly providerIdentity?: Fp004ProviderIdentity;
    readonly requestHash?: ReturnType<typeof hashDigit>;
    readonly stateHash?: ReturnType<typeof hashDigit>;
    readonly event?: Fp004CanonicalEvent;
  } = {},
): Fp004CommitRequest {
  const event = options.event ?? eventFor(version, options);
  return {
    authorizationProof: proof(),
    expectedAuthorization: {
      principalId: PRINCIPAL_ID,
      tenantId: TENANT_ID,
      resourceType: RESOURCE_TYPE,
      resourceId: RESOURCE_ID,
      action: "work420.event.commit",
      capability: "work420.event.commit",
    },
    idempotency: {
      scope: "WORK420_EVENT",
      key: `work420:idempotency:${version}`,
      requestHash: options.requestHash ??
        hashDigit(String(((version + 5) % 9) + 1)),
    },
    event: {
      schemaVersion: FP004_SCHEMA_VERSION,
      eventId: event.eventId,
      eventKind: event.eventKind,
      aggregate: event.aggregate,
      payloadHash: event.payloadHash,
      resultHash: event.resultHash,
      correlationId: event.correlationId,
      producerType: event.producerType,
      ...(event.providerIdentity === undefined
        ? {}
        : { providerIdentity: event.providerIdentity }),
    },
    stateReference: {
      resourceType: RESOURCE_TYPE,
      resourceId: RESOURCE_ID,
      expectedRevision: version === 1
        ? "GENESIS"
        : `work420:revision:${version - 1}`,
      nextRevision: `work420:revision:${version}`,
      stateHash: options.stateHash ?? event.resultHash,
    },
  };
}

function adapter(options: {
  readonly faultInjector?: ConstructorParameters<
    typeof Work420TrustedEventAdapter
  >[0]["faultInjector"];
} = {}): Work420TrustedEventAdapter {
  return new Work420TrustedEventAdapter({
    clock: () => NOW,
    ...(options.faultInjector === undefined
      ? {}
      : { faultInjector: options.faultInjector }),
    authorizationRevalidator: async () => true,
    providerIngress: {
      principalId: PRINCIPAL_ID,
      tenantId: TENANT_ID,
      resourceType: RESOURCE_TYPE,
      resourceId: RESOURCE_ID,
      resolve(rawProviderPayload: unknown) {
        if (
          rawProviderPayload === null || typeof rawProviderPayload !== "object"
        ) throw new Error("provider payload");
        const value = rawProviderPayload as Record<string, unknown>;
        if (
          typeof value.providerEventId !== "string" ||
          typeof value.payloadHash !== "string" ||
          typeof value.eventType !== "string" ||
          typeof value.canonicalEventId !== "string"
        ) throw new Error("provider payload shape");
        return {
          principalId: PRINCIPAL_ID,
          providerIdentity: {
            providerName: "test-provider",
            providerEventId: value.providerEventId,
            payloadHash: asSha256(value.payloadHash),
            eventType: value.eventType,
            providerSchemaVersion: "TEST_PROVIDER_V1",
          },
          tenantId: TENANT_ID,
          resourceType: RESOURCE_TYPE,
          resourceId: RESOURCE_ID,
          canonicalEventId: asFp004EventId(value.canonicalEventId),
        };
      },
    },
  });
}

Deno.test("WORK-420 trusted event adapter enforces idempotency and ordered aggregate versions", async () => {
  const eventAdapter = adapter();
  const first = await eventAdapter.commitDomainEvent(commitFor(1));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const duplicate = await eventAdapter.commitDomainEvent(commitFor(1));
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.duplicate, true);

  const conflict = await eventAdapter.commitDomainEvent(
    commitFor(1, { requestHash: hashDigit("9") }),
  );
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.diagnostics[0]?.code, "IDEMPOTENCY_CONFLICT");
  }

  const gap = await eventAdapter.commitDomainEvent(commitFor(3));
  assert.equal(gap.ok, false);
  if (!gap.ok) assert.equal(gap.diagnostics[0]?.code, "AGGREGATE_GAP_HELD");
  assert.equal(eventAdapter.transactions.listGaps().length, 1);

  const second = await eventAdapter.commitDomainEvent(commitFor(2));
  assert.equal(second.ok, true);
  const third = await eventAdapter.commitDomainEvent(commitFor(3));
  assert.equal(third.ok, true);
  assert.equal(eventAdapter.transactions.listGaps().length, 0);

  const malformed = await eventAdapter.commitDomainEvent(
    commitFor(4, { stateHash: hashDigit("8") }),
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.diagnostics[0]?.code, "MALFORMED_SUCCESS");
  }
});

Deno.test("WORK-420 provider ingress rejects forged identity and preserves duplicate/conflict semantics", () => {
  const eventAdapter = adapter();
  const raw = {
    providerEventId: "provider:work420:raw-1",
    payloadHash: hashDigit("a"),
    eventType: "PAID",
    canonicalEventId: "work420:provider:event:1",
  };
  const first = eventAdapter.acceptProvider(raw);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value.duplicate, false);
  const duplicate = eventAdapter.acceptProvider(raw);
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.duplicate, true);
  const conflict = eventAdapter.acceptProvider({
    ...raw,
    payloadHash: hashDigit("b"),
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.diagnostics[0]?.code, "PROVIDER_IDENTITY_CONFLICT");
  }

  const forgedIngress = eventAdapter.leases.acceptProviderEvent({}, raw);
  assert.equal(forgedIngress.ok, false);
  if (!forgedIngress.ok) {
    assert.equal(
      forgedIngress.diagnostics[0]?.code,
      "PROVIDER_IDENTITY_INVALID",
    );
  }
});

Deno.test("WORK-420 crash boundaries do not expose partial commits", async () => {
  const points = [
    "BEFORE_TRANSACTION",
    "AFTER_STATE_WRITE",
    "AFTER_EVENT_OUTBOX_WRITE",
    "AFTER_COMMIT_BEFORE_RESPONSE",
  ] as const;
  for (const point of points) {
    const eventAdapter = adapter({
      faultInjector: (currentPoint) => {
        if (currentPoint === point) throw new Fp004CrashError(currentPoint);
      },
    });
    const result = await eventAdapter.commitDomainEvent(commitFor(1));
    assert.equal(result.ok, false, `${point} must fail closed`);
    const snapshot = eventAdapter.transactions.snapshot();
    if (point === "AFTER_COMMIT_BEFORE_RESPONSE") {
      assert.equal(snapshot.events.length, 1);
    } else {assert.equal(
        snapshot.events.length,
        0,
        `${point} must leave no event`,
      );}
  }
});

Deno.test("WORK-420 lease fencing, DLQ, and side-effect-free replay remain isolated", async () => {
  const eventAdapter = adapter();
  const committed = await eventAdapter.commitDomainEvent(commitFor(1));
  assert.equal(committed.ok, true);
  if (!committed.ok) return;
  const enqueued = eventAdapter.enqueueOutbox(committed.value.event);
  assert.equal(enqueued.ok, true);
  if (!enqueued.ok) return;
  const outboxId = enqueued.value.record.outboxId;
  const leaseOne = eventAdapter.leaseOutbox("worker:a", NOW, outboxId);
  assert.equal(leaseOne.ok, true);
  if (!leaseOne.ok) return;
  const denied = eventAdapter.leaseOutbox("worker:b", NOW, outboxId);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.diagnostics[0]?.code, "NOT_FOUND");
  const staleOwner = eventAdapter.completeOutbox(
    "worker:b",
    leaseOne.value.lease,
    { outcome: "SUCCESS", resultHash: committed.value.event.resultHash },
    NOW,
    outboxId,
  );
  assert.equal(staleOwner.ok, false);
  if (!staleOwner.ok) {
    assert.equal(staleOwner.diagnostics[0]?.code, "LEASE_STALE");
  }

  const later = new Date(NOW.getTime() + 31_000);
  const leaseTwo = eventAdapter.leaseOutbox("worker:b", later, outboxId);
  assert.equal(leaseTwo.ok, true);
  if (!leaseTwo.ok) return;
  const staleFence = eventAdapter.completeOutbox(
    "worker:a",
    leaseOne.value.lease,
    { outcome: "SUCCESS", resultHash: committed.value.event.resultHash },
    later,
    outboxId,
  );
  assert.equal(staleFence.ok, false);
  if (!staleFence.ok) {
    assert.equal(staleFence.diagnostics[0]?.code, "LEASE_STALE");
  }
  const poison = eventAdapter.completeOutbox(
    "worker:b",
    leaseTwo.value.lease,
    {
      outcome: "POISON",
      diagnostic: {
        code: "CONSUMER_FAILURE",
        message: "synthetic poison",
        recoverable: false,
      },
    },
    later,
    outboxId,
  );
  assert.equal(poison.ok, true);
  if (poison.ok) assert.equal(poison.value.record.state, "DLQ");

  const before = await hashCanonical(eventAdapter.snapshot());
  const replay = eventAdapter.replay({
    replayRunId: asFp004RecordId("work420:replay:1"),
    consumerId: "WORK420",
    sideEffectMode: "NONE",
  });
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.value.canonicalStateMutated, false);
  const after = await hashCanonical(eventAdapter.snapshot());
  assert.equal(before, after);
  const sideEffectReplay = eventAdapter.replay({
    replayRunId: asFp004RecordId("work420:replay:2"),
    consumerId: "WORK420",
    sideEffectMode: "ALLOW_PROVIDER_EFFECT" as never,
  });
  assert.equal(sideEffectReplay.ok, false);
  if (!sideEffectReplay.ok) {
    assert.equal(
      sideEffectReplay.diagnostics[0]?.code,
      "REPLAY_SIDE_EFFECT_FORBIDDEN",
    );
  }
});
