import {
  createCore110Fixture,
} from "../../src/core/core-110/adapter-fixtures.ts";
import {
  createCore110Command,
} from "../../src/core/core-110/conformance-runner.ts";
import { asFp004RecordId } from "../../src/fp-004/contracts.ts";

const ITERATIONS = 25;
const HASH = "a".repeat(64);

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * fraction),
  );
  return Number((sorted[index] ?? 0).toFixed(3));
}

function summary(values: readonly number[]) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    samples: values.length,
  };
}

async function measure(
  operation: (iteration: number) => Promise<void>,
): Promise<ReturnType<typeof summary>> {
  const values: number[] = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const start = performance.now();
    await operation(iteration);
    values.push(performance.now() - start);
  }
  return summary(values);
}

async function benchmarkAdapter(
  adapterClass: "IN_MEMORY" | "PRODUCTION_EQUIVALENT",
) {
  const queueDepths: number[] = [];
  const sideEffects: number[] = [];
  const command = await measure(async () => {
    await createCore110Command();
  });
  const commit = await measure(async (iteration) => {
    const fixture = await createCore110Fixture({ adapterClass });
    await fixture.execute(
      await createCore110Command({ eventId: `bench-event-${iteration}` }),
    );
    queueDepths.push(fixture.lease.snapshot().outbox.length);
    sideEffects.push(fixture.spies.snapshot().externalTotal);
  });
  const consume = await measure(async (iteration) => {
    const fixture = await createCore110Fixture({ adapterClass });
    await fixture.execute(
      await createCore110Command({
        operation: "FINANCE",
        eventId: `bench-consume-${iteration}`,
        canonical: true,
        consumerId: "FINANCE",
      }),
    );
    sideEffects.push(fixture.spies.snapshot().externalTotal);
  });
  const retry = await measure(async () => {
    const fixture = await createCore110Fixture({ adapterClass });
    await fixture.execute(await createCore110Command());
    const id = asFp004RecordId("outbox:event-1");
    const leased = fixture.lease.leaseOutbox("bench-worker", new Date(), {
      outboxId: id,
    });
    if (leased.ok) {
      fixture.lease.completeOutbox(
        "bench-worker",
        leased.value.lease.fencingToken,
        {
          outcome: "RETRYABLE_FAILURE",
          diagnostic: {
            code: "CONSUMER_FAILURE",
            message: "retry",
            recoverable: true,
          },
        },
        new Date(),
        id,
      );
    }
    queueDepths.push(fixture.lease.snapshot().outbox.length);
  });
  const replay = await measure(async (iteration) => {
    const fixture = await createCore110Fixture({ adapterClass });
    await fixture.execute(
      await createCore110Command({ eventId: `bench-replay-${iteration}` }),
    );
    fixture.durable.replay({
      replayRunId: asFp004RecordId(`bench-replay-run-${iteration}`),
      consumerId: "SEARCH",
      sideEffectMode: "NONE",
    });
    sideEffects.push(fixture.spies.snapshot().externalTotal);
  });
  const memory = typeof Deno.memoryUsage === "function"
    ? Deno.memoryUsage()
    : undefined;
  return {
    adapterClass,
    qualification: "SYNTHETIC_REFERENCE_ONLY",
    productionPerformanceClaim: false,
    iterations: ITERATIONS,
    latencyMs: { command, commit, consume, retry, replay },
    queueDepth: {
      max: Math.max(...queueDepths, 0),
      p95: percentile(queueDepths, 0.95),
    },
    memory: memory === undefined ? "UNTESTED" : memory,
    sideEffectCounts: {
      max: Math.max(...sideEffects, 0),
      total: sideEffects.reduce((sum, value) => sum + value, 0),
    },
  };
}

const results = [
  await benchmarkAdapter("IN_MEMORY"),
  await benchmarkAdapter("PRODUCTION_EQUIVALENT"),
];
console.log(JSON.stringify(
  {
    benchmark: "CORE-110_V1",
    generatedAt: new Date().toISOString(),
    note:
      "Synthetic isolated fixtures only; these numbers do not qualify production performance.",
    results,
    untested: [
      "production database/provider, device, staging, and network performance",
    ],
  },
  null,
  2,
));
