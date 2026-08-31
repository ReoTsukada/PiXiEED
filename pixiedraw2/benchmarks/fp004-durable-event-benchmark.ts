/**
 * FP-004 isolated durability benchmark.
 *
 * This is a deterministic local synthetic fixture, not the FP-004 durable
 * implementation and not a production-SLO test. It intentionally has no
 * network, provider, DOM, Canvas, database, Storage, credential, or route
 * dependency. Replace/supplement it with the real adapter benchmark once the
 * adapter module exists; do not change shared contracts to make this harness
 * import a missing module.
 */

type SyntheticEvent = {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payloadHash: string;
};

type Lease = {
  readonly ownerId: string;
  readonly fencingToken: string;
  readonly expiresAt: number;
};

type OutboxState = "PENDING" | "LEASED" | "DISPATCHED";

type Outbox = {
  readonly event: SyntheticEvent;
  state: OutboxState;
  attemptCount: number;
  nextAttemptAt: number;
  lease?: Lease;
};

const FIXTURE_SIZES = [1, 10, 100, 1000] as const;
const LEASE_TTL_MS = 10;
const RETRY_BACKOFF_MS = 2;
const SYNTHETIC_TENANT = "tenant:fp004:synthetic";
const SYNTHETIC_PAYLOAD_HASH = "a".repeat(64);

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
  return sorted[index] ?? 0;
}

function measure(operation: () => void, repetitions: number): { readonly p50: number; readonly p95: number; readonly max: number } {
  const samples: number[] = [];
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) };
}

/** Clearly named fixture used only because no durable FP-004 adapter is in this worker scope. */
class IsolatedFp004DurabilityFixture {
  readonly state = new Map<string, string>();
  readonly events = new Map<string, SyntheticEvent>();
  readonly outbox = new Map<string, Outbox>();
  readonly idempotency = new Map<string, string>();
  readonly sideEffects = { provider: 0, notification: 0, finance: 0, search: 0 };
  private leaseSequence = 0;

  reset(): void {
    this.state.clear();
    this.events.clear();
    this.outbox.clear();
    this.idempotency.clear();
    this.sideEffects.provider = 0;
    this.sideEffects.notification = 0;
    this.sideEffects.finance = 0;
    this.sideEffects.search = 0;
    this.leaseSequence = 0;
  }

  seedEvents(count: number): readonly SyntheticEvent[] {
    const events: SyntheticEvent[] = [];
    for (let index = 1; index <= count; index += 1) {
      events.push({
        eventId: `evt:fp004:${index}`,
        aggregateId: `${SYNTHETIC_TENANT}:aggregate`,
        aggregateVersion: index,
        payloadHash: SYNTHETIC_PAYLOAD_HASH,
      });
    }
    return events;
  }

  commit(event: SyntheticEvent): void {
    const idempotencyKey = `${SYNTHETIC_TENANT}:command:${event.eventId}`;
    if (this.idempotency.has(idempotencyKey)) return;
    this.state.set(event.aggregateId, `revision:${event.aggregateVersion}`);
    this.events.set(event.eventId, event);
    this.outbox.set(event.eventId, {
      event,
      state: "PENDING",
      attemptCount: 0,
      nextAttemptAt: 0,
    });
    this.idempotency.set(idempotencyKey, event.eventId);
  }

  lease(eventId: string, ownerId: string, now: number): Lease {
    const record = this.outbox.get(eventId);
    if (!record) throw new Error(`Missing synthetic Outbox record: ${eventId}`);
    if (record.lease && record.lease.expiresAt > now && record.lease.ownerId !== ownerId) {
      throw new Error(`Synthetic lease conflict: ${eventId}`);
    }
    const lease = { ownerId, fencingToken: `lease:${++this.leaseSequence}`, expiresAt: now + LEASE_TTL_MS };
    record.state = "LEASED";
    record.lease = lease;
    record.attemptCount += 1;
    return lease;
  }

  acknowledge(eventId: string, lease: Lease, now: number): void {
    const record = this.outbox.get(eventId);
    if (!record || !record.lease || record.lease.fencingToken !== lease.fencingToken || record.lease.ownerId !== lease.ownerId || record.lease.expiresAt <= now) {
      throw new Error(`Synthetic stale lease acknowledgement: ${eventId}`);
    }
    record.state = "DISPATCHED";
  }

  retry(eventId: string, now: number): void {
    const record = this.outbox.get(eventId);
    if (!record) throw new Error(`Missing retry record: ${eventId}`);
    record.state = "PENDING";
    delete record.lease;
    record.nextAttemptAt = now + RETRY_BACKOFF_MS * Math.max(1, record.attemptCount);
  }

  replayProjection(): void {
    const beforeState = this.state.get(`${SYNTHETIC_TENANT}:aggregate`);
    const beforeEvents = this.events.size;
    const beforeOutbox = this.outbox.size;
    const sideEffectMode = "NONE" as const;
    if (sideEffectMode !== "NONE") throw new Error("Replay side-effect mode was not NONE");
    for (const event of this.events.values()) {
      void event;
      // Projection-only work is intentionally represented by a local read.
    }
    if (this.state.get(`${SYNTHETIC_TENANT}:aggregate`) !== beforeState || this.events.size !== beforeEvents || this.outbox.size !== beforeOutbox) {
      throw new Error("Replay mutated canonical fixture state");
    }
  }
}

function runFixture(eventCount: number) {
  const transactionFixture = new IsolatedFp004DurabilityFixture();
  const events = transactionFixture.seedEvents(eventCount);
  const transaction = measure(() => {
    transactionFixture.reset();
    for (const event of events) transactionFixture.commit(event);
  }, 3);
  if (transactionFixture.events.size !== eventCount || transactionFixture.outbox.size !== eventCount || transactionFixture.idempotency.size !== eventCount) {
    throw new Error(`Transaction invariant failed for ${eventCount} events`);
  }

  const leaseFixture = new IsolatedFp004DurabilityFixture();
  for (const event of events) leaseFixture.commit(event);
  let leaseClaims = 0;
  const lease = measure(() => {
    let now = 0;
    for (const event of events) {
      const token = leaseFixture.lease(event.eventId, "worker:fp004", now);
      leaseFixture.acknowledge(event.eventId, token, now);
      leaseClaims += 1;
      now += 1;
    }
  }, 3);
  if (leaseClaims !== eventCount * 3) throw new Error(`Lease invariant failed for ${eventCount} events`);

  const retryFixture = new IsolatedFp004DurabilityFixture();
  for (const event of events) retryFixture.commit(event);
  let retryTransitions = 0;
  const retry = measure(() => {
    for (const event of events) {
      retryFixture.retry(event.eventId, 0);
      retryTransitions += 1;
      const token = retryFixture.lease(event.eventId, "worker:retry", RETRY_BACKOFF_MS);
      retryFixture.acknowledge(event.eventId, token, RETRY_BACKOFF_MS);
      retryTransitions += 1;
    }
  }, 3);
  if (retryTransitions !== eventCount * 2 * 3) throw new Error(`Retry invariant failed for ${eventCount} events`);

  const replayFixture = new IsolatedFp004DurabilityFixture();
  for (const event of events) replayFixture.commit(event);
  const replay = measure(() => replayFixture.replayProjection(), 3);
  if (replayFixture.sideEffects.provider !== 0 || replayFixture.sideEffects.notification !== 0 || replayFixture.sideEffects.finance !== 0 || replayFixture.sideEffects.search !== 0) {
    throw new Error(`Replay side-effect invariant failed for ${eventCount} events`);
  }

  return {
    eventCount,
    transaction,
    lease,
    retry,
    replay,
    logicalCounters: {
      committedEvents: transactionFixture.events.size,
      outboxRecords: transactionFixture.outbox.size,
      leaseClaims: eventCount,
      retryTransitions: eventCount * 2,
      replaySideEffects: 0,
    },
    status: "MEASURED_LOCAL_SYNTHETIC" as const,
  };
}

const reports = FIXTURE_SIZES.map(runFixture);

console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "FP004_DURABLE_EVENT_ISOLATED_SYNTHETIC",
  adapter: "IsolatedFp004DurabilityFixture",
  measuredAt: new Date().toISOString(),
  status: "MEASURED_LOCAL_SYNTHETIC",
  metrics: ["transaction_ms", "lease_ms", "retry_ms", "replay_ms", "p50", "p95", "max", "logical_counters"],
  fixtureSizes: FIXTURE_SIZES,
  reports,
  claims: {
    productionSlo: false,
    productionEquivalent: false,
    browserDevice: false,
    durableAdapterCompletion: false,
  },
  notes: [
    "Fixture data, event order, hashes, owners, and operation sequence are deterministic; wall-clock measurements vary by host.",
    "This harness does not prove process restart persistence, cross-process concurrency, provider idempotency, RLS, or consumer behavior.",
    "Replace/supplement this fixture with the actual restartable FP-004 adapter benchmark when that module is available.",
  ],
}, null, 2));
