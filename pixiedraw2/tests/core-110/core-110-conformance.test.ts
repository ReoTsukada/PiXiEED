import { asFp004RecordId } from "../../src/fp-004/contracts.ts";
import type { Fp004Delivery } from "../../src/fp-004/inbox-outbox-lease.ts";
import {
  compareCanonicalResults,
} from "../../src/core/core-110/result-comparator.ts";
import {
  createCore110Command,
} from "../../src/core/core-110/conformance-runner.ts";
import {
  createCore110Fixture,
  createCore110LocatorFixture,
  createCore110PrivatePayloadLeakFixture,
} from "../../src/core/core-110/adapter-fixtures.ts";
import { createCore110FailureControls } from "../../src/core/core-110/failure-controls.ts";
import {
  type Core110Scenario,
  runCore110Conformance,
} from "../../src/core/core-110/conformance-runner.ts";
import { serializeCore110Evidence } from "../../src/core/core-110/evidence-serializer.ts";
import {
  canonicalEvidenceIdentityMaterial,
} from "../../src/core/core-110/evidence-serializer.ts";

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message = "values differ",
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

function assertCode(value: unknown, code: string): void {
  assert(
    value !== null && typeof value === "object",
    "result is not an object",
  );
  const result = value as {
    readonly ok?: unknown;
    readonly diagnostics?: readonly { readonly code?: unknown }[];
  };
  assert(result.ok === false, "expected typed failure");
  assert(result.diagnostics?.[0]?.code === code, `expected ${code}`);
}

async function commit(
  fixture: Awaited<ReturnType<typeof createCore110Fixture>>,
  eventId = "event-1",
) {
  return await fixture.execute(await createCore110Command({ eventId }));
}

for (const adapterClass of ["IN_MEMORY", "PRODUCTION_EQUIVALENT"] as const) {
  Deno.test(`CORE110 authorization revocation has no commit side effects: ${adapterClass}`, async () => {
    const fixture = await createCore110Fixture({ adapterClass });
    const accepted = await fixture.execute(
      await createCore110Command({
        operation: "INBOX_ACCEPT",
        eventId: "provider-event-1",
      }),
    );
    assert(accepted.ok, "provider acceptance should be durable");
    fixture.controls.configure({ authorizationRevoked: true });
    const result = await commit(fixture);
    assertCode(result, "AUTHORITY_DENIED");
    const snapshot = fixture.durable.snapshot();
    assert(snapshot.events.length === 0, "revoked commit created an event");
    assert(snapshot.states.length === 0, "revoked commit mutated state");
    assert(snapshot.outbox.length === 0, "revoked commit created outbox");
  });

  Deno.test(`CORE110 duplicate provider delivery and idempotency conflict: ${adapterClass}`, async () => {
    const fixture = await createCore110Fixture({ adapterClass });
    const first = await fixture.execute(
      await createCore110Command({
        operation: "INBOX_ACCEPT",
        eventId: "provider-event-1",
      }),
    );
    const duplicate = await fixture.execute(
      await createCore110Command({
        operation: "INBOX_ACCEPT",
        eventId: "provider-event-1",
      }),
    );
    assert(
      first.ok && duplicate.ok,
      "duplicate provider delivery must be typed",
    );
    if (duplicate.ok) {
      assert(
        (duplicate.value as { readonly duplicate?: unknown }).duplicate ===
          true,
        "duplicate was not marked",
      );
    }
    const conflicting = await fixture.execute(
      await createCore110Command({
        operation: "INBOX_ACCEPT",
        eventId: "provider-event-1",
        providerIdentity: {
          providerName: "core110-provider",
          providerEventId: "provider-event-1",
          payloadHash: "b".repeat(64) as never,
          eventType: "payment.completed",
          providerSchemaVersion: "1",
        },
      }),
    );
    assertCode(conflicting, "ADAPTER_UNAVAILABLE");
    assert(
      fixture.lease.snapshot().inbox.length === 1,
      "conflict created another inbox record",
    );

    const committed = await commit(fixture);
    assert(committed.ok, "first commit failed");
    const idemConflict = await fixture.execute(
      await createCore110Command({
        eventId: "event-2",
        idempotencyKey: "idempotency-event-1",
        requestHash: "b".repeat(64) as never,
      }),
    );
    assertCode(idemConflict, "ADAPTER_UNAVAILABLE");
    assert(
      fixture.durable.snapshot().events.length === 1,
      "idempotency conflict committed a second event",
    );
  });

  Deno.test(`CORE110 malformed provider success never throws: ${adapterClass}`, async () => {
    let providerAttempts = 0;
    for (
      const kind of [
        "MALFORMED_SUCCESS",
        "UNKNOWN_STATUS",
        "IDENTITY_HASH_MISMATCH",
      ] as const
    ) {
      const fixture = await createCore110Fixture({ adapterClass });
      assert((await commit(fixture)).ok, "seed commit failed");
      fixture.controls.configure({ providerResponse: { kind } });
      const result = await fixture.execute(
        await createCore110Command({
          operation: "OUTBOX_DISPATCH",
        }),
      );
      assertCode(
        result,
        kind === "IDENTITY_HASH_MISMATCH"
          ? "ADAPTER_UNAVAILABLE"
          : "MALFORMED_SUCCESS",
      );
      providerAttempts += fixture.spies.snapshot().provider;
    }
    assert(
      providerAttempts === 3,
      "provider spy did not count exactly one attempt per malformed response",
    );
  });
}

Deno.test("CORE110 aggregate gap, stale, and same-version conflict fail closed", async () => {
  const gapFixture = await createCore110Fixture();
  const gap = await gapFixture.execute(
    await createCore110Command({ aggregateVersion: 2 }),
  );
  assertCode(gap, "ADAPTER_UNAVAILABLE");
  assert(
    gapFixture.durable.snapshot().gaps.length === 1,
    "gap was not durable",
  );

  const staleFixture = await createCore110Fixture();
  assert((await commit(staleFixture)).ok, "stale seed commit failed");
  const stale = await staleFixture.execute(
    await createCore110Command({
      eventId: "event-stale",
      aggregateVersion: 1,
      expectedRevision: "revision-1",
      nextRevision: "revision-stale",
    }),
  );
  assertCode(stale, "ADAPTER_UNAVAILABLE");

  const conflictFixture = await createCore110Fixture();
  assert((await commit(conflictFixture)).ok, "same-version seed commit failed");
  const sameVersion = await conflictFixture.execute(
    await createCore110Command({
      eventId: "event-same-version",
      aggregateVersion: 1,
      expectedRevision: "revision-1",
    }),
  );
  assertCode(sameVersion, "ADAPTER_UNAVAILABLE");
  assert(
    conflictFixture.durable.snapshot().events.length === 1,
    "aggregate rejection committed state",
  );
});

Deno.test("CORE110 lease theft fences an active worker", async () => {
  const fixture = await createCore110Fixture();
  assert((await commit(fixture)).ok, "seed commit failed");
  const outboxId = asFp004RecordId("outbox:event-1");
  const firstAt = new Date();
  const secondAt = new Date(firstAt.getTime() + 20);
  const first = fixture.lease.leaseOutbox("worker-a", firstAt, { outboxId });
  assert(first.ok, "first lease failed");
  if (!first.ok) return;
  const second = fixture.lease.leaseOutbox("worker-b", secondAt, { outboxId });
  assert(second.ok, "expired lease was not reclaimable");
  if (!second.ok) return;
  const stale = fixture.lease.completeOutbox(
    "worker-a",
    first.value.lease.fencingToken,
    { outcome: "SUCCESS", resultHash: "a".repeat(64) } satisfies Fp004Delivery,
    secondAt,
    outboxId,
  );
  assertCode(stale, "LEASE_STALE");
  assert(
    fixture.spies.snapshot().externalTotal === 0,
    "lease fencing caused an external side effect",
  );
});

Deno.test("CORE110 lease expiry is independently reclaimable and fenced", async () => {
  const fixture = await createCore110Fixture();
  assert((await commit(fixture)).ok, "seed commit failed");
  const outboxId = asFp004RecordId("outbox:event-1");
  const firstAt = new Date();
  const secondAt = new Date(firstAt.getTime() + 20);
  const first = fixture.lease.leaseOutbox("worker-expiring", firstAt, {
    outboxId,
  });
  assert(first.ok, "first lease failed");
  if (!first.ok) return;
  const reclaimed = fixture.lease.leaseOutbox("worker-reclaimer", secondAt, {
    outboxId,
  });
  assert(reclaimed.ok, "expired lease was not reclaimed");
  const stale = fixture.lease.completeOutbox(
    "worker-expiring",
    first.value.lease.fencingToken,
    { outcome: "SUCCESS", resultHash: "a".repeat(64) } satisfies Fp004Delivery,
    secondAt,
    outboxId,
  );
  assertCode(stale, "LEASE_STALE");
  assert(
    fixture.spies.snapshot().externalTotal === 0,
    "expired lease leaked a side effect",
  );
});

for (
  const crashPoint of [
    "BEFORE_TRANSACTION",
    "AFTER_STATE_WRITE",
    "AFTER_EVENT_OUTBOX_WRITE",
    "AFTER_COMMIT_BEFORE_RESPONSE",
  ] as const
) {
  Deno.test(`CORE110 FP-004 crash recovery ${crashPoint}`, async () => {
    const fixture = await createCore110Fixture();
    fixture.controls.configure({ crashPoint });
    const first = await commit(fixture);
    assertCode(first, "ADAPTER_UNAVAILABLE");
    fixture.controls.configure({ crashPoint: undefined });
    const restarted = await fixture.restart();
    const recovered = await commit(restarted);
    assert(recovered.ok, "restart did not recover commit");
    assert(
      restarted.durable.snapshot().events.length === 1,
      "recovery created a second event",
    );
  });
}

Deno.test("CORE110 outbox pause, bounded retry, poison, DLQ, and replay are side-effect free", async () => {
  const fixture = await createCore110Fixture();
  assert((await commit(fixture)).ok, "seed commit failed");
  fixture.controls.configure({ pauseOutbox: true });
  const paused = await fixture.execute(
    await createCore110Command({ operation: "OUTBOX_DISPATCH" }),
  );
  assertCode(paused, "ADAPTER_UNAVAILABLE");
  assert(
    fixture.spies.snapshot().provider === 0,
    "paused outbox called provider",
  );

  const outboxId = asFp004RecordId("outbox:event-1");
  const retryBase = new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retryAt = new Date(retryBase.getTime() + attempt * 200);
    const leased = fixture.lease.leaseOutbox(
      "retry-worker",
      retryAt,
      { outboxId },
    );
    assert(leased.ok, "retry lease failed");
    if (!leased.ok) return;
    const failed = fixture.lease.completeOutbox(
      "retry-worker",
      leased.value.lease.fencingToken,
      {
        outcome: "RETRYABLE_FAILURE",
        diagnostic: {
          code: "CONSUMER_FAILURE",
          message: "retry",
          recoverable: true,
        },
      },
      retryAt,
      outboxId,
    );
    assert(failed.ok, "retry completion failed");
  }
  assert(
    fixture.lease.snapshot().outbox[0]?.state === "DLQ",
    "retry exhaustion did not reach DLQ",
  );
  const replay = fixture.durable.replay({
    replayRunId: asFp004RecordId("replay-1"),
    consumerId: "SEARCH",
    sideEffectMode: "NONE",
  });
  assert(replay.ok, "replay failed");
  if (replay.ok) {
    assert(
      replay.value.canonicalStateMutated === false &&
        replay.value.sideEffectMode === "NONE",
      "replay was not side-effect free",
    );
  }
  assert(
    fixture.spies.snapshot().externalTotal === 0,
    "retry/replay created an external side effect",
  );

  const poisonFixture = await createCore110Fixture();
  assert((await commit(poisonFixture)).ok, "poison seed commit failed");
  const poisonId = asFp004RecordId("outbox:event-1");
  const poisonLease = poisonFixture.lease.leaseOutbox(
    "poison-worker",
    new Date(),
    { outboxId: poisonId },
  );
  assert(poisonLease.ok, "poison lease failed");
  if (poisonLease.ok) {
    const poisoned = poisonFixture.lease.completeOutbox(
      "poison-worker",
      poisonLease.value.lease.fencingToken,
      {
        outcome: "POISON",
        diagnostic: {
          code: "CONSUMER_FAILURE",
          message: "poison",
          recoverable: false,
        },
      },
      new Date(),
      poisonId,
    );
    assert(poisoned.ok, "poison completion failed");
    assert(
      poisonFixture.lease.snapshot().outbox[0]?.state === "DLQ",
      "poison was not quarantined",
    );
  }
});

Deno.test("CORE110 schema/policy mismatch and unsupported capability fail closed", async () => {
  const schemaFixture = await createCore110Fixture();
  schemaFixture.controls.configure({ schemaMismatch: true });
  assertCode(await commit(schemaFixture), "SCHEMA_UNSUPPORTED");

  const policyFixture = await createCore110Fixture();
  policyFixture.controls.configure({ privacyMismatch: true });
  assertCode(await commit(policyFixture), "AUTHORITY_DENIED");

  const capabilityFixture = await createCore110Fixture({
    controls: createCore110FailureControls({
      unsupportedCapabilities: ["COMMIT"],
    }),
  });
  assertCode(await commit(capabilityFixture), "ADAPTER_UNAVAILABLE");
});

Deno.test("CORE110 cross-tenant locator is denied without payload leak", async () => {
  const fixture = await createCore110Fixture();
  const policy = fixture.dependencies.privacyStorage as unknown as {
    validateLocator(
      locator: unknown,
      expected: { tenantId: string; resourceType: string; resourceId: string },
    ): { ok: boolean; diagnostics: readonly { message: string }[] };
  };
  const denied = policy.validateLocator(
    createCore110LocatorFixture("other-tenant"),
    {
      tenantId: "core110-tenant",
      resourceType: "draw",
      resourceId: "core110-asset",
    },
  );
  assert(denied.ok === false, "cross-tenant locator was accepted");
  assert(
    !denied.diagnostics[0]?.message.includes("private.bin"),
    "locator leaked private payload",
  );
});

Deno.test("CORE110 invalid private locator is denied without path or payload diagnostics", async () => {
  const fixture = await createCore110Fixture();
  const policy = fixture.dependencies.privacyStorage as unknown as {
    validateLocator(
      locator: unknown,
      expected: { tenantId: string; resourceType: string; resourceId: string },
    ): {
      ok: boolean;
      diagnostics: readonly {
        code?: string;
        message?: string;
        path?: string;
      }[];
    };
  };
  const result = policy.validateLocator(
    createCore110PrivatePayloadLeakFixture(),
    {
      tenantId: "core110-tenant",
      resourceType: "draw",
      resourceId: "core110-asset",
    },
  );
  const diagnosticText = JSON.stringify(result.diagnostics);
  assert(result.ok === false, "invalid private locator was accepted");
  assert(
    !diagnosticText.includes("private/core110-secret.bin"),
    "private path leaked",
  );
  assert(
    !diagnosticText.includes("CORE110_PRIVATE_PAYLOAD"),
    "private payload leaked",
  );
});

Deno.test("CORE110 result/error identity is deterministic across adapter classes", async () => {
  const leftFixture = await createCore110Fixture({ adapterClass: "IN_MEMORY" });
  const rightFixture = await createCore110Fixture({
    adapterClass: "PRODUCTION_EQUIVALENT",
  });
  leftFixture.controls.configure({ schemaMismatch: true });
  rightFixture.controls.configure({ schemaMismatch: true });
  const left = await commit(leftFixture);
  const right = await commit(rightFixture);
  const comparison = await compareCanonicalResults(left, right);
  assert(comparison.equal, "error identity diverged across adapters");
});

Deno.test("CORE110 deliberately failing adapter cannot bypass Core-100", async () => {
  const fixture = await createCore110Fixture({ adapterClass: "UNTESTED" });
  const result = await commit(fixture);
  assertCode(result, "ADAPTER_UNAVAILABLE");
  assert(
    fixture.deliberatelyFailing,
    "UNTESTED fixture is not explicitly failing",
  );
  assert(
    fixture.durable.snapshot().events.length === 0,
    "failing adapter mutated durable state",
  );
});

Deno.test("CORE110 unsupported capability is configured before root and has no side effects", async () => {
  const fixture = await createCore110Fixture({
    controls: createCore110FailureControls({
      unsupportedCapabilities: ["COMMIT"],
    }),
  });
  assert(
    fixture.controls.unsupportedCapabilities.includes("COMMIT"),
    "unsupported capability was not configured",
  );
  assert(
    !fixture.dependencies.durable.capabilities.includes("COMMIT"),
    "root retained unsupported COMMIT capability",
  );
  const result = await commit(fixture);
  assertCode(result, "ADAPTER_UNAVAILABLE");
  assert(
    fixture.spies.snapshot().externalTotal === 0,
    "unsupported operation had side effects",
  );
});

Deno.test("CORE110 evidence identity ignores time and input order", async () => {
  const scenarios: readonly Core110Scenario[] = [{
    acceptanceId: "CORE110-SCOPE-001",
    failureId: "SCHEMA_POLICY_MISMATCH",
    fixtureId: "identity-schema-mismatch",
    command:
      "deno test --no-remote --check tests/core-110/core-110-conformance.test.ts",
    async run(fixture) {
      fixture.controls.configure({ schemaMismatch: true });
      const result = await commit(fixture);
      return {
        result,
        expected: "SCHEMA_UNSUPPORTED",
        actual: result.ok
          ? "SUCCESS"
          : result.diagnostics[0]?.code ?? "UNKNOWN",
      };
    },
  }];
  const report = await runCore110Conformance(
    scenarios,
    (adapterClass) => createCore110Fixture({ adapterClass }),
  );
  const first = await serializeCore110Evidence({
    rows: report.rows,
    commands: ["command-z", "command-a"],
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const second = await serializeCore110Evidence({
    rows: [...report.rows].reverse(),
    commands: ["command-a", "command-z"],
    generatedAt: "2026-02-02T00:00:00.000Z",
  });
  assertEquals(first.document.commands, ["command-a", "command-z"]);
  assert(
    first.document.generatedAt !== second.document.generatedAt,
    "display time did not vary",
  );
  assertEquals(
    first.document.baselineIdentity,
    second.document.baselineIdentity,
  );
  assertEquals(first.document.resultHash, second.document.resultHash);
  assertEquals(
    canonicalEvidenceIdentityMaterial(first.document),
    canonicalEvidenceIdentityMaterial(second.document),
  );
});

Deno.test("CORE110 shared conformance runner emits adapter-separated evidence", async () => {
  const scenarios: readonly Core110Scenario[] = [{
    acceptanceId: "CORE110-SCOPE-001",
    failureId: "SCHEMA_POLICY_MISMATCH",
    fixtureId: "scope-schema-mismatch",
    command:
      "deno test --no-remote --check tests/core-110/core-110-conformance.test.ts",
    async run(fixture) {
      fixture.controls.configure({ schemaMismatch: true });
      const result = await commit(fixture);
      return {
        result,
        expected: "SCHEMA_UNSUPPORTED",
        actual: result.ok
          ? "SUCCESS"
          : result.diagnostics[0]?.code ?? "UNKNOWN",
      };
    },
  }];
  const report = await runCore110Conformance(
    scenarios,
    (adapterClass) => createCore110Fixture({ adapterClass }),
  );
  assert(
    report.rows.length === 2,
    "runner did not execute all adapter classes",
  );
  const evidence = await serializeCore110Evidence({
    rows: report.rows,
    commands: scenarios.map((scenario) => scenario.command),
    untested: ["real production provider/RLS/device checks"],
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(
    evidence.document.independentReview === "PENDING",
    "evidence forged review approval",
  );
  assert(
    evidence.document.rows.every((row) => row.adapterClass !== "UNTESTED"),
    "adapter class was collapsed",
  );
});
