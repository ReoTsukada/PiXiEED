import { strict as assert } from "node:assert";
import {
  createFp004ProjectionConsumerEngine,
  FP004_CONSUMER_IDS,
  type Fp004ProjectionAdapter,
  type Fp004ProjectionContext,
} from "../src/fp-004/replay-consumer.ts";
import {
  asFp004EventId,
  asFp004RecordId,
  asFp004TransactionId,
  type Fp004CanonicalEvent,
  fp004Failure,
  fp004Success,
} from "../src/fp-004/contracts.ts";
import type { ContentHash } from "../src/wp160-contracts.ts";

const HASH_A = "a".repeat(64) as ContentHash;
const HASH_B = "b".repeat(64) as ContentHash;

function event(
  eventId: string,
  version = 1,
  overrides: Partial<Fp004CanonicalEvent> = {},
): Fp004CanonicalEvent {
  return {
    schemaVersion: "DURABLE_EVENT_V1",
    eventId: asFp004EventId(eventId),
    eventKind: "DOMAIN_FACT",
    aggregate: {
      tenantId: "tenant-fixture",
      aggregateType: "project",
      aggregateId: "aggregate-fixture",
      aggregateVersion: version,
      resourceType: "project",
      resourceId: "resource-fixture",
    },
    payloadHash: HASH_A,
    resultHash: HASH_B,
    correlationId: "correlation-fixture",
    producerType: "core-fixture",
    transactionId: asFp004TransactionId(`tx-${eventId}`),
    committedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function adapters(
  calls: Record<string, number>,
  sideEffectCalls: {
    provider: number;
    financial: number;
    notification: number;
    publication: number;
  },
  replayFlags: Record<string, boolean> = {},
): readonly Fp004ProjectionAdapter[] {
  return FP004_CONSUMER_IDS.map((consumerId) => ({
    consumerId,
    providerMutation: () => {
      sideEffectCalls.provider += 1;
    },
    financialMutation: () => {
      sideEffectCalls.financial += 1;
    },
    notificationMutation: () => {
      sideEffectCalls.notification += 1;
    },
    publicationMutation: () => {
      sideEffectCalls.publication += 1;
    },
    project: (
      canonicalEvent: Fp004CanonicalEvent,
      context: Fp004ProjectionContext,
    ) => {
      calls[consumerId] = (calls[consumerId] ?? 0) + 1;
      assert.equal(context.sideEffectMode, "NONE");
      replayFlags[consumerId] = context.isReplay;
      assert.equal(Object.hasOwn(context, "canonicalState"), false);
      assert.equal(Object.hasOwn(canonicalEvent, "payload"), false);
      assert.equal(Object.isFrozen(canonicalEvent), true);
      assert.equal(Object.isFrozen(canonicalEvent.aggregate), true);
      return fp004Success({
        projectionRevision: `${consumerId.toLowerCase()}:projection:v1`,
        projectionHash: canonicalEvent.payloadHash,
      });
    },
  })) as unknown as readonly Fp004ProjectionAdapter[];
}

Deno.test("FP004-REPLAY-001 projection replay is side-effect-free and duplicate-safe", async () => {
  const calls: Record<string, number> = {};
  const sideEffectCalls = {
    provider: 0,
    financial: 0,
    notification: 0,
    publication: 0,
  };
  const canonicalState = Object.freeze({ revision: "canonical:v1" });
  const replayFlags: Record<string, boolean> = {};
  const engine = createFp004ProjectionConsumerEngine(
    adapters(calls, sideEffectCalls, replayFlags),
  );
  const first = await engine.replay({
    replayRunId: asFp004RecordId("replay-finance-1"),
    consumerId: "FINANCE",
    sideEffectMode: "NONE",
  }, [event("event-1"), event("event-2")]);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.value.projected, 2);
    assert.equal(first.value.duplicates, 0);
  }
  const duplicate = await engine.replay({
    replayRunId: asFp004RecordId("replay-finance-1"),
    consumerId: "FINANCE",
    sideEffectMode: "NONE",
  }, [event("event-1"), event("event-2")]);
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.duplicates, 2);
  assert.equal(calls.FINANCE, 2);
  assert.equal(replayFlags.FINANCE, true);
  assert.deepEqual(sideEffectCalls, {
    provider: 0,
    financial: 0,
    notification: 0,
    publication: 0,
  });
  assert.deepEqual(canonicalState, { revision: "canonical:v1" });
  const state = engine.getState("FINANCE");
  assert.equal(state.ok, true);
  if (state.ok) assert.deepEqual(state.value.appliedEventIds, []);
});

Deno.test("FP004-REPLAY-001 replay rebuilds each projection adapter independently", async () => {
  const calls: Record<string, number> = {};
  const sideEffectCalls = {
    provider: 0,
    financial: 0,
    notification: 0,
    publication: 0,
  };
  const engine = createFp004ProjectionConsumerEngine(
    adapters(calls, sideEffectCalls),
  );
  for (const consumerId of FP004_CONSUMER_IDS) {
    const result = await engine.replay({
      replayRunId: asFp004RecordId(`replay-${consumerId.toLowerCase()}`),
      consumerId,
      sideEffectMode: "NONE",
    }, [event(`event-${consumerId.toLowerCase()}`)]);
    assert.equal(result.ok, true);
  }
  assert.deepEqual(calls, { FINANCE: 1, NOTIFICATION: 1, SEARCH: 1 });
  for (const consumerId of FP004_CONSUMER_IDS) {
    const state = engine.getState(consumerId);
    assert.equal(state.ok, true);
    if (state.ok) assert.equal(state.value.appliedEventIds.length, 0);
  }
});

Deno.test("FP004-RECOVERY-001 maintains independent bounded retry and DLQ state", async () => {
  let financeCalls = 0;
  const stable = adapters({}, {
    provider: 0,
    financial: 0,
    notification: 0,
    publication: 0,
  });
  const finance: Fp004ProjectionAdapter = {
    consumerId: "FINANCE",
    project: () => {
      financeCalls += 1;
      return fp004Failure(
        "CONSUMER_FAILURE",
        "fixture failure",
        true,
        "fixture",
      );
    },
  };
  const engine = createFp004ProjectionConsumerEngine([
    finance,
    stable[1]!,
    stable[2]!,
  ], {
    maxAttempts: 2,
    now: () => new Date("2026-08-10T00:00:00.000Z"),
  });
  const first = await engine.consume(event("retry-event"), "FINANCE");
  assert.equal(first.ok, false);
  const retry = engine.getState("FINANCE");
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.value.retry.length, 1);
    assert.equal(retry.value.dlq.length, 0);
    assert.equal(retry.value.retry[0]?.attemptCount, 1);
  }
  const second = await engine.consume(event("retry-event"), "FINANCE");
  assert.equal(second.ok, false);
  const dlq = engine.getState("FINANCE");
  assert.equal(dlq.ok, true);
  if (dlq.ok) {
    assert.equal(dlq.value.retry.length, 0);
    assert.equal(dlq.value.dlq.length, 1);
    assert.equal(dlq.value.dlq[0]?.outcome, "POISON");
  }
  assert.equal(financeCalls, 2);
  const notification = await engine.consume(
    event("retry-event"),
    "NOTIFICATION",
  );
  assert.equal(notification.ok, true);
  assert.equal(engine.getState("NOTIFICATION").ok, true);
});

Deno.test("FP004-SEC-001 rejects unknown consumer, schema, and permissive replay mode", async () => {
  const engine = createFp004ProjectionConsumerEngine(
    adapters({}, {
      provider: 0,
      financial: 0,
      notification: 0,
      publication: 0,
    }),
  );
  const unknownConsumer = await engine.consume(
    event("unknown-consumer"),
    "AUDIT",
  );
  assert.equal(unknownConsumer.ok, false);
  if (!unknownConsumer.ok) {
    assert.equal(unknownConsumer.diagnostics[0]?.code, "CONSUMER_FAILURE");
  }
  const unknownSchema = await engine.consume({
    ...event("unknown-schema"),
    schemaVersion: "DURABLE_EVENT_V9",
  }, "SEARCH");
  assert.equal(unknownSchema.ok, false);
  if (!unknownSchema.ok) {
    assert.equal(unknownSchema.diagnostics[0]?.code, "SCHEMA_UNSUPPORTED");
  }
  const permissive = await engine.replay({
    replayRunId: asFp004RecordId("replay-permissive"),
    consumerId: "SEARCH",
    sideEffectMode: "ALLOW_PROVIDER_EFFECT",
  }, [event("permissive-event")]);
  assert.equal(permissive.ok, false);
  if (!permissive.ok) {
    assert.equal(
      permissive.diagnostics[0]?.code,
      "REPLAY_SIDE_EFFECT_FORBIDDEN",
    );
  }
});

Deno.test("FP004-SEC-001 rejects event identity reuse and preserves bounded privacy diagnostics", async () => {
  const calls: Record<string, number> = {};
  const engine = createFp004ProjectionConsumerEngine(
    adapters(calls, {
      provider: 0,
      financial: 0,
      notification: 0,
      publication: 0,
    }),
  );
  const first = await engine.consume(event("same-event", 1), "SEARCH");
  assert.equal(first.ok, true);
  const conflict = await engine.consume(event("same-event", 2), "SEARCH");
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.diagnostics[0]?.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(
      conflict.diagnostics[0]?.message.includes("same-event"),
      false,
    );
    assert.equal((conflict.diagnostics[0]?.message.length ?? 0) <= 1_024, true);
  }
  assert.equal(calls.SEARCH, 1);
  const oversizedPayload = {
    ...event("raw-payload"),
    payload: new Uint8Array([1, 2, 3]),
  };
  const rejected = await engine.consume(oversizedPayload, "SEARCH");
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.diagnostics[0]?.code, "SCHEMA_UNSUPPORTED");
  }
});

Deno.test("FP004-RECOVERY-001 quarantines malformed projection success without retry", async () => {
  const malformed: Fp004ProjectionAdapter = {
    consumerId: "SEARCH",
    project: () => ({ ok: true, diagnostics: [] } as never),
  };
  const stable = adapters({}, {
    provider: 0,
    financial: 0,
    notification: 0,
    publication: 0,
  });
  const engine = createFp004ProjectionConsumerEngine([
    stable[0]!,
    stable[1]!,
    malformed,
  ]);
  const result = await engine.consume(event("malformed-projection"), "SEARCH");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "MALFORMED_SUCCESS");
  }
  const state = engine.getState("SEARCH");
  assert.equal(state.ok, true);
  if (state.ok) {
    assert.equal(state.value.retry.length, 0);
    assert.equal(state.value.dlq[0]?.outcome, "NON_RETRYABLE_FAILURE");
    assert.equal(state.value.dlq[0]?.lastDiagnostic.code, "MALFORMED_SUCCESS");
  }
});
