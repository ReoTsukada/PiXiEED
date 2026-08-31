import { strict as assert } from "node:assert";
import { asSha256, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";
import {
  asFp004EventId,
  type Fp004CommitRequest,
} from "../src/fp-004/contracts.ts";
import {
  Fp004RestartableInMemoryAdapter,
} from "../src/fp-004/durable-transaction.ts";
import {
  createFp004ProjectionConsumerEngine,
  type Fp004ProjectionAdapter,
} from "../src/fp-004/replay-consumer.ts";

function currentProof(): AuthorizationProofV1 {
  const issued = new Date(Date.now() - 1_000);
  const expires = new Date(Date.now() + 60_000);
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority:fp004-integration",
    proofId: "proof:fp004-integration",
    principalId: "principal:fp004-integration",
    resourceType: "PROJECT",
    resourceId: "project:fp004-integration",
    action: "project.write",
    capability: "PROJECT.WRITE",
    tenantId: "tenant:fp004-integration",
    correlationId: "correlation:fp004-integration",
    policyVersion: "authorization-policy-v1",
    grantId: "grant:fp004-integration",
    issuedAt: issued.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

function commitRequest(): Fp004CommitRequest {
  return {
    authorizationProof: currentProof(),
    expectedAuthorization: {
      principalId: "principal:fp004-integration",
      tenantId: "tenant:fp004-integration",
      resourceType: "PROJECT",
      resourceId: "project:fp004-integration",
      action: "project.write",
      capability: "PROJECT.WRITE",
    },
    idempotency: {
      scope: "project.write",
      key: "request:fp004-integration",
      requestHash: asSha256("a".repeat(64)),
    },
    event: {
      schemaVersion: "DURABLE_EVENT_V1",
      eventId: asFp004EventId("event:fp004-integration:1"),
      eventKind: "DOMAIN_FACT",
      aggregate: {
        tenantId: "tenant:fp004-integration",
        aggregateType: "PROJECT",
        aggregateId: "project:fp004-integration",
        aggregateVersion: 1,
        resourceType: "PROJECT",
        resourceId: "project:fp004-integration",
      },
      payloadHash: asSha256("b".repeat(64)),
      resultHash: asSha256("c".repeat(64)),
      correlationId: "correlation:fp004-integration",
      producerType: "core:fp004-integration",
    },
    stateReference: {
      resourceType: "PROJECT",
      resourceId: "project:fp004-integration",
      expectedRevision: "GENESIS",
      nextRevision: "project:fp004-integration:v1",
      stateHash: asSha256("c".repeat(64)),
    },
  };
}

Deno.test("FP-004 integration commits one canonical Event then keeps consumers and replay isolated", async () => {
  const transaction = new Fp004RestartableInMemoryAdapter({
    authorizationRevalidator: () => true,
  });
  const committed = await transaction.commit(commitRequest());
  assert.equal(committed.ok, true);
  if (!committed.ok) return;

  const calls = new Map<string, number>();
  const adapters: readonly Fp004ProjectionAdapter[] = [
    "FINANCE",
    "NOTIFICATION",
    "SEARCH",
  ].map(
    (consumerId) => ({
      consumerId: consumerId as Fp004ProjectionAdapter["consumerId"],
      project: (event, context) => {
        calls.set(consumerId, (calls.get(consumerId) ?? 0) + 1);
        assert.equal(context.sideEffectMode, "NONE");
        assert.equal(Object.isFrozen(event), true);
        return {
          ok: true as const,
          value: {
            projectionRevision: `projection:${consumerId}:v1`,
            projectionHash: event.resultHash,
          },
          diagnostics: [],
        };
      },
    }),
  );
  const consumers = createFp004ProjectionConsumerEngine(adapters);

  for (const consumerId of ["FINANCE", "NOTIFICATION", "SEARCH"] as const) {
    const applied = await consumers.consume(committed.value.event, consumerId);
    assert.equal(applied.ok, true);
  }
  const beforeReplayState = transaction.snapshot();
  const replay = await consumers.replay({
    replayRunId: "replay:fp004-integration",
    consumerId: "SEARCH",
    sideEffectMode: "NONE",
  }, [committed.value.event]);
  assert.equal(replay.ok, true);
  assert.equal(
    transaction.snapshot().events.length,
    beforeReplayState.events.length,
  );
  assert.equal(
    transaction.snapshot().states.length,
    beforeReplayState.states.length,
  );
  assert.equal(calls.get("FINANCE"), 1);
  assert.equal(calls.get("NOTIFICATION"), 1);
  assert.equal(calls.get("SEARCH"), 2);
});
