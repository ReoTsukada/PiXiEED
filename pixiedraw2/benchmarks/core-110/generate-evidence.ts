import {
  createCore110Fixture,
  createCore110LocatorFixture,
  createCore110PrivatePayloadLeakFixture,
} from "../../src/core/core-110/adapter-fixtures.ts";
import { createCore110FailureControls } from "../../src/core/core-110/failure-controls.ts";
import {
  type Core110Scenario,
  createCore110Command,
  runCore110Conformance,
} from "../../src/core/core-110/conformance-runner.ts";
import { asFp004RecordId } from "../../src/fp-004/contracts.ts";
import type { Fp004Delivery } from "../../src/fp-004/inbox-outbox-lease.ts";
import { serializeCore110Evidence } from "../../src/core/core-110/evidence-serializer.ts";

const commandText =
  "deno test --no-remote --allow-read --allow-write --check pixiedraw2/tests/core-110";
const commit = async (
  fixture: Awaited<ReturnType<typeof createCore110Fixture>>,
) => await fixture.execute(await createCore110Command());
const MAX_OUTBOX_ATTEMPTS = 3;

function diagnosticCode(result: unknown): string | undefined {
  if (result === null || typeof result !== "object") return undefined;
  const record = result as {
    readonly ok?: unknown;
    readonly diagnostics?: readonly { readonly code?: unknown }[];
  };
  return record.ok === false &&
      typeof record.diagnostics?.[0]?.code === "string"
    ? record.diagnostics[0].code
    : undefined;
}

function scenario(
  failureId: Core110Scenario["failureId"],
  run: Core110Scenario["run"],
): Core110Scenario {
  return {
    acceptanceId: failureId === "SCHEMA_POLICY_MISMATCH" ||
        failureId === "UNSUPPORTED_CAPABILITY"
      ? "CORE110-SCOPE-001"
      : "CORE110-EVIDENCE-001",
    failureId,
    fixtureId: `core110-${failureId.toLowerCase()}`,
    command: commandText,
    run,
  };
}

const scenarios: readonly Core110Scenario[] = [
  scenario("AUTHORIZATION_REVOKED_BETWEEN_ACCEPT_COMMIT", async (fixture) => {
    await fixture.execute(
      await createCore110Command({ operation: "INBOX_ACCEPT" }),
    );
    fixture.controls.configure({ authorizationRevoked: true });
    const result = await commit(fixture);
    return { result, expected: "AUTHORITY_DENIED", actual: "typed result" };
  }),
  ...([
    "MALFORMED_SUCCESS",
    "UNKNOWN_STATUS",
    "IDENTITY_HASH_MISMATCH",
  ] as const).map((kind) =>
    scenario(
      kind === "MALFORMED_SUCCESS"
        ? "MALFORMED_PROVIDER_SUCCESS"
        : kind === "UNKNOWN_STATUS"
        ? "UNKNOWN_PROVIDER_STATUS"
        : "PROVIDER_IDENTITY_HASH_MISMATCH",
      async (fixture) => {
        await commit(fixture);
        fixture.controls.configure({ providerResponse: { kind } });
        const result = await fixture.execute(
          await createCore110Command({ operation: "OUTBOX_DISPATCH" }),
        );
        return { result, expected: "typed rejection", actual: "typed result" };
      },
    )
  ),
  scenario("DUPLICATE_PROVIDER_DELIVERY", async (fixture) => {
    await fixture.execute(
      await createCore110Command({ operation: "INBOX_ACCEPT" }),
    );
    const result = await fixture.execute(
      await createCore110Command({ operation: "INBOX_ACCEPT" }),
    );
    return {
      result,
      expected: "duplicate=true and one Inbox record",
      actual: "typed result",
    };
  }),
  scenario("IDEMPOTENCY_CONFLICT", async (fixture) => {
    await commit(fixture);
    const result = await fixture.execute(
      await createCore110Command({
        eventId: "event-2",
        idempotencyKey: "idempotency-event-1",
        requestHash: "b".repeat(64) as never,
      }),
    );
    return {
      result,
      expected: "no second canonical event",
      actual: "typed result",
    };
  }),
  scenario("AGGREGATE_GAP", async (fixture) => {
    const result = await fixture.execute(
      await createCore110Command({ aggregateVersion: 2 }),
    );
    return { result, expected: "durable gap hold", actual: "typed result" };
  }),
  scenario("AGGREGATE_STALE", async (fixture) => {
    await commit(fixture);
    const result = await fixture.execute(
      await createCore110Command({
        eventId: "event-stale",
        aggregateVersion: 1,
        expectedRevision: "revision-1",
      }),
    );
    return { result, expected: "stale rejection", actual: "typed result" };
  }),
  scenario("AGGREGATE_SAME_VERSION_CONFLICT", async (fixture) => {
    await commit(fixture);
    const result = await fixture.execute(
      await createCore110Command({
        eventId: "event-conflict",
        aggregateVersion: 1,
        expectedRevision: "revision-1",
      }),
    );
    return {
      result,
      expected: "same-version rejection",
      actual: "typed result",
    };
  }),
  scenario("LEASE_THEFT", async (fixture) => {
    await commit(fixture);
    const lease = fixture.lease.leaseOutbox("worker-a", new Date(), {
      outboxId: asFp004RecordId("outbox:event-1"),
    });
    const result = lease.ok
      ? fixture.lease.leaseOutbox("worker-b", new Date(), {
        outboxId: asFp004RecordId("outbox:event-1"),
      })
      : lease;
    return { result, expected: "active lease fencing", actual: "typed result" };
  }),
  scenario("LEASE_EXPIRY", async (fixture) => {
    await commit(fixture);
    const outboxId = asFp004RecordId("outbox:event-1");
    const firstAt = new Date(Date.now() + 1_000);
    const secondAt = new Date(firstAt.getTime() + 20);
    const first = fixture.lease.leaseOutbox("worker-expiring", firstAt, {
      outboxId,
    });
    const reclaimed = first.ok
      ? fixture.lease.leaseOutbox("worker-reclaimer", secondAt, { outboxId })
      : first;
    const stale = first.ok
      ? fixture.lease.completeOutbox(
        "worker-expiring",
        first.value.lease.fencingToken,
        {
          outcome: "SUCCESS",
          resultHash: "a".repeat(64),
        } satisfies Fp004Delivery,
        secondAt,
        outboxId,
      )
      : first;
    const sideEffects = fixture.spies.snapshot();
    const pass = first.ok && reclaimed.ok && !stale.ok &&
      diagnosticCode(stale) === "LEASE_STALE" &&
      sideEffects.externalTotal === 0;
    return {
      result: {
        ok: pass,
        value: {
          firstLease: first.ok,
          reclaimedAfterExpiry: reclaimed.ok,
          staleCompletionCode: diagnosticCode(stale) ?? "NONE",
          externalSideEffects: sideEffects.externalTotal,
        },
      },
      expected:
        "expired lease reclaimed; stale completion=LEASE_STALE; externalSideEffects=0",
      actual:
        `firstLease=${first.ok}; reclaimedAfterExpiry=${reclaimed.ok}; staleCompletion=${
          diagnosticCode(stale) ?? "NONE"
        }; externalSideEffects=${sideEffects.externalTotal}`,
      status: pass ? "PASS" : "FAIL",
    };
  }),
  ...([
    "BEFORE_TRANSACTION",
    "AFTER_STATE_WRITE",
    "AFTER_EVENT_OUTBOX_WRITE",
    "AFTER_COMMIT_BEFORE_RESPONSE",
  ] as const).map((point) =>
    scenario(
      point === "BEFORE_TRANSACTION"
        ? "CRASH_BEFORE_TRANSACTION"
        : point === "AFTER_STATE_WRITE"
        ? "CRASH_AFTER_STATE_WRITE"
        : point === "AFTER_EVENT_OUTBOX_WRITE"
        ? "CRASH_AFTER_EVENT_OUTBOX_WRITE"
        : "CRASH_AFTER_COMMIT_BEFORE_RESPONSE",
      async (fixture) => {
        fixture.controls.configure({ crashPoint: point });
        const result = await commit(fixture);
        fixture.controls.configure({ crashPoint: undefined });
        return {
          result,
          expected: "restartable typed failure",
          actual: "typed result",
          restartTranscript: [point, "snapshot", "restart"],
        };
      },
    )
  ),
  scenario("OUTBOX_PAUSE", async (fixture) => {
    await commit(fixture);
    fixture.controls.configure({ pauseOutbox: true });
    const result = await fixture.execute(
      await createCore110Command({ operation: "OUTBOX_DISPATCH" }),
    );
    return {
      result,
      expected: "provider side effects=0",
      actual: "typed result",
    };
  }),
  scenario("OUTBOX_RETRY_EXHAUSTION", async (fixture) => {
    await commit(fixture);
    const outboxId = asFp004RecordId("outbox:event-1");
    const retryBase = new Date(Date.now() + 1_000);
    let attempts = 0;
    for (let attempt = 0; attempt < MAX_OUTBOX_ATTEMPTS; attempt += 1) {
      const attemptAt = new Date(retryBase.getTime() + attempt * 10_000);
      const leased = fixture.lease.leaseOutbox("retry-worker", attemptAt, {
        outboxId,
      });
      if (!leased.ok) {
        break;
      }
      attempts += 1;
      fixture.lease.completeOutbox(
        "retry-worker",
        leased.value.lease.fencingToken,
        {
          outcome: "RETRYABLE_FAILURE",
          diagnostic: {
            code: "CONSUMER_FAILURE",
            message: "retry",
            recoverable: true,
          },
        } satisfies Fp004Delivery,
        attemptAt,
        outboxId,
      );
    }
    const snapshot = fixture.lease.snapshot();
    const terminal = snapshot.outbox.find((record) =>
      record.outboxId === outboxId
    );
    const sideEffects = fixture.spies.snapshot();
    const pass = attempts === MAX_OUTBOX_ATTEMPTS &&
      terminal?.state === "DLQ" &&
      sideEffects.externalTotal === 0;
    return {
      result: {
        ok: pass,
        value: {
          attempts,
          terminalState: terminal?.state ?? "MISSING",
          deadLetterCount: snapshot.deadLetters.length,
          externalSideEffects: sideEffects.externalTotal,
        },
      },
      expected:
        `lease/complete attempts=${MAX_OUTBOX_ATTEMPTS}, terminal=DLQ, externalSideEffects=0`,
      actual: `attempts=${attempts}/${MAX_OUTBOX_ATTEMPTS}; terminal=${
        terminal?.state ?? "MISSING"
      }; deadLetters=${snapshot.deadLetters.length}; externalSideEffects=${sideEffects.externalTotal}`,
      status: pass ? "PASS" : "FAIL",
    };
  }),
  scenario("OUTBOX_POISON", async (fixture) => {
    await commit(fixture);
    const outboxId = asFp004RecordId("outbox:event-1");
    const attemptAt = new Date(Date.now() + 1_000);
    const leased = fixture.lease.leaseOutbox("poison-worker", attemptAt, {
      outboxId,
    });
    const completed = leased.ok
      ? fixture.lease.completeOutbox(
        "poison-worker",
        leased.value.lease.fencingToken,
        {
          outcome: "POISON",
          diagnostic: {
            code: "CONSUMER_FAILURE",
            message: "poison",
            recoverable: false,
          },
        } satisfies Fp004Delivery,
        attemptAt,
        outboxId,
      )
      : leased;
    const snapshot = fixture.lease.snapshot();
    const terminal = snapshot.outbox.find((record) =>
      record.outboxId === outboxId
    );
    const sideEffects = fixture.spies.snapshot();
    const pass = leased.ok && completed.ok && terminal?.state === "DLQ" &&
      snapshot.deadLetters.some((record) => record.recordId === outboxId) &&
      sideEffects.externalTotal === 0;
    return {
      result: {
        ok: pass,
        value: {
          attempts: terminal?.attemptCount ?? 0,
          terminalState: terminal?.state ?? "MISSING",
          deadLetterCount: snapshot.deadLetters.length,
          externalSideEffects: sideEffects.externalTotal,
        },
      },
      expected: "lease/complete poison terminal=DLQ, externalSideEffects=0",
      actual: `attempts=${terminal?.attemptCount ?? 0}; terminal=${
        terminal?.state ?? "MISSING"
      }; deadLetters=${snapshot.deadLetters.length}; externalSideEffects=${sideEffects.externalTotal}`,
      status: pass ? "PASS" : "FAIL",
    };
  }),
  scenario("OUTBOX_DLQ_REPLAY", async (fixture) => {
    await commit(fixture);
    const result = fixture.durable.replay({
      replayRunId: asFp004RecordId("evidence-replay"),
      consumerId: "SEARCH",
      sideEffectMode: "NONE",
    });
    return {
      result,
      expected: "replay sideEffectMode=NONE",
      actual: "typed result",
    };
  }),
  scenario("SCHEMA_POLICY_MISMATCH", async (fixture) => {
    fixture.controls.configure({ schemaMismatch: true });
    const result = await commit(fixture);
    return { result, expected: "schema fail closed", actual: "typed result" };
  }),
  scenario("UNSUPPORTED_CAPABILITY", async (fixture) => {
    fixture.controls.configure({ unsupportedCapabilities: ["COMMIT"] });
    const result = await commit(fixture);
    const sideEffects = fixture.spies.snapshot();
    const capabilityConfigured = fixture.controls.unsupportedCapabilities
      .includes(
        "COMMIT",
      );
    const pass = capabilityConfigured && diagnosticCode(result) ===
        "ADAPTER_UNAVAILABLE" &&
      sideEffects.externalTotal === 0;
    return {
      result,
      expected:
        "controls.unsupportedCapabilities includes COMMIT; ADAPTER_UNAVAILABLE; externalSideEffects=0",
      actual: `unsupported=${
        fixture.controls.unsupportedCapabilities.join(",")
      }; code=${
        diagnosticCode(result) ?? "SUCCESS"
      }; externalSideEffects=${sideEffects.externalTotal}`,
      status: pass ? "PASS" : "FAIL",
    };
  }),
  scenario("CROSS_TENANT_LOCATOR", async (fixture) => {
    const policy = fixture.dependencies.privacyStorage as unknown as {
      validateLocator: (
        locator: unknown,
        expected: {
          tenantId: string;
          resourceType: string;
          resourceId: string;
        },
      ) => unknown;
    };
    const result = policy.validateLocator(
      createCore110LocatorFixture("other-tenant"),
      {
        tenantId: "core110-tenant",
        resourceType: "draw",
        resourceId: "core110-asset",
      },
    );
    return {
      result,
      expected: "tenant denial without payload",
      actual: "typed result",
    };
  }),
  scenario("PRIVATE_PAYLOAD_LEAK", async (fixture) => {
    const policy = fixture.dependencies.privacyStorage as unknown as {
      validateLocator: (locator: unknown, expected: {
        tenantId: string;
        resourceType: string;
        resourceId: string;
      }) => {
        ok: boolean;
        diagnostics: readonly {
          code?: string;
          message?: string;
          path?: string;
        }[];
      };
    };
    const locator = createCore110PrivatePayloadLeakFixture();
    const result = policy.validateLocator(locator, {
      tenantId: "core110-tenant",
      resourceType: "draw",
      resourceId: "core110-asset",
    });
    const diagnostics = JSON.stringify(result.diagnostics);
    const leaks = [
      "private/core110-secret.bin",
      "CORE110_PRIVATE_PAYLOAD",
      "payload",
    ].some((secret) => diagnostics.includes(secret));
    const pass = result.ok === false && !leaks;
    return {
      result: {
        ok: pass,
        value: {
          denied: result.ok === false,
          diagnosticCodes: result.diagnostics.map((diagnostic) =>
            diagnostic.code
          ),
          privatePayloadLeaked: leaks,
        },
      },
      expected:
        "invalid locator denied without private path/payload in diagnostics",
      actual: `denied=${
        result.ok === false
      }; privatePayloadLeaked=${leaks}; diagnostics=${diagnostics}`,
      status: pass ? "PASS" : "FAIL",
    };
  }),
];

const report = await runCore110Conformance(
  scenarios,
  (adapterClass, scenario) =>
    createCore110Fixture({
      adapterClass,
      deliberatelyFailing: adapterClass === "UNTESTED",
      controls: scenario?.failureId === "UNSUPPORTED_CAPABILITY"
        ? createCore110FailureControls({ unsupportedCapabilities: ["COMMIT"] })
        : undefined,
    }),
  ["IN_MEMORY", "PRODUCTION_EQUIVALENT", "UNTESTED"],
);
const evidence = await serializeCore110Evidence({
  rows: report.rows,
  commands: [
    commandText,
    "deno run --no-remote --allow-read --allow-write pixiedraw2/benchmarks/core-110/generate-evidence.ts",
    "deno run --no-remote pixiedraw2/benchmarks/core-110/run-conformance-benchmark.ts",
  ],
  untested: [
    "production database/provider access",
    "real RLS/Auth/Provider integration",
    "physical device and staging qualification",
    "real legacy PXD/PiXYNC/Commerce compatibility",
  ],
});
await Deno.writeTextFile(
  new URL("../../../docs/inventory/core-110-evidence.json", import.meta.url),
  evidence.json,
);
console.log(
  JSON.stringify({
    rows: evidence.document.rows.length,
    resultHash: evidence.document.resultHash,
    baselineIdentity: evidence.document.baselineIdentity,
  }),
);
