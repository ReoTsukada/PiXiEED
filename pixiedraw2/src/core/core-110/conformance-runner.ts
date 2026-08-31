import type { ContentHash } from "../../wp160-contracts.ts";
import type {
  Fp004CanonicalEvent,
  Fp004EventDraft,
  Fp004ProviderIdentity,
} from "../../fp-004/contracts.ts";
import type {
  Core100Command,
  Core100Operation,
  Core100Result,
} from "../core-100/contracts.ts";
import {
  CORE110_ACCEPTANCE_IDS,
  type Core110AdapterClass,
  type Core110EvidenceRow,
  type Core110FailureId,
  type Core110Fixture,
} from "./contracts.ts";
import { canonicalResultIdentity } from "./result-comparator.ts";
import { core110SchemaIdentity } from "./adapter-fixtures.ts";

const HASH = "a".repeat(64) as ContentHash;

export interface Core110CommandOptions {
  readonly operation?: Core100Operation;
  readonly eventId?: string;
  readonly aggregateVersion?: number;
  readonly expectedRevision?: string;
  readonly nextRevision?: string;
  readonly idempotencyKey?: string;
  readonly requestHash?: ContentHash;
  readonly providerIdentity?: Fp004ProviderIdentity;
  readonly consumerId?: "FINANCE" | "NOTIFICATION" | "SEARCH";
  readonly canonical?: boolean;
}

function providerIdentity(
  suffix = "1",
  payloadHash = HASH,
): Fp004ProviderIdentity {
  return {
    providerName: "core110-provider",
    providerEventId: `provider-event-${suffix}`,
    payloadHash,
    eventType: "payment.completed",
    providerSchemaVersion: "1",
  };
}

export async function createCore110Command(
  options: Core110CommandOptions = {},
): Promise<Core100Command> {
  const operation = options.operation ?? "COMMIT";
  const eventId = options.eventId ?? "event-1";
  const aggregateVersion = options.aggregateVersion ?? 1;
  const identity = options.providerIdentity;
  const draft: Fp004EventDraft = {
    schemaVersion: "DURABLE_EVENT_V1",
    eventId: eventId as never,
    eventKind: identity === undefined ? "DOMAIN_FACT" : "PROVIDER_CALLBACK",
    aggregate: {
      tenantId: "core110-tenant",
      aggregateType: "draw",
      aggregateId: "core110-asset",
      aggregateVersion,
      resourceType: "draw",
      resourceId: "core110-asset",
    },
    payloadHash: HASH,
    resultHash: HASH,
    correlationId: "core110-correlation",
    producerType: "core110-fixture",
    ...(identity === undefined ? {} : { providerIdentity: identity }),
  };
  const event: Fp004EventDraft | Fp004CanonicalEvent = options.canonical
    ? {
      ...draft,
      transactionId: `tx:${eventId}` as never,
      committedAt: "2026-01-01T00:00:00.000Z",
    }
    : draft;
  const schema = await core110SchemaIdentity();
  const base: Core100Command = {
    schemaVersion: "CORE-100_V1",
    schema,
    operation,
    tenantId: "core110-tenant",
    resourceType: "draw",
    resourceId: "core110-asset",
    action: "draw.commit",
    capability: "draw.commit",
    idempotencyKey: options.idempotencyKey ?? `idempotency-${eventId}`,
    requestHash: options.requestHash ?? HASH,
    event,
    stateReference: {
      resourceType: "draw",
      resourceId: "core110-asset",
      expectedRevision: options.expectedRevision ?? "GENESIS",
      nextRevision: options.nextRevision ?? `revision-${aggregateVersion}`,
      stateHash: HASH,
    },
  };
  if (operation === "INBOX_ACCEPT") {
    const acceptedIdentity = identity ?? providerIdentity();
    return {
      ...base,
      inbox: {
        principalId: "core110-user",
        providerIdentity: acceptedIdentity,
        tenantId: "core110-tenant",
        resourceType: "draw",
        resourceId: "core110-asset",
        canonicalEventId: eventId as never,
      },
    };
  }
  if (operation === "OUTBOX_DISPATCH") {
    return {
      ...base,
      outbox: {
        eventId: eventId as never,
        ownerId: "core110-worker",
        idempotency: {
          scope: "CORE-100:OUTBOX",
          key: options.idempotencyKey ?? `outbox-${eventId}`,
          requestHash: options.requestHash ?? HASH,
        },
      },
    };
  }
  if (
    operation === "FINANCE" || operation === "NOTIFICATION" ||
    operation === "SEARCH"
  ) {
    return {
      ...base,
      consumerId: options.consumerId ?? operation,
    };
  }
  return base;
}

export interface Core110ScenarioObservation {
  readonly result: unknown;
  readonly expected: string;
  readonly actual: string;
  readonly restartTranscript?: readonly string[];
  readonly status?: "PASS" | "FAIL" | "UNTESTED";
}

export interface Core110Scenario {
  readonly acceptanceId: typeof CORE110_ACCEPTANCE_IDS[number];
  readonly failureId: Core110FailureId;
  readonly fixtureId: string;
  readonly command: string;
  run(fixture: Core110Fixture): Promise<Core110ScenarioObservation>;
}

export interface Core110ConformanceReport {
  readonly rows: readonly Core110EvidenceRow[];
  readonly resultHashes: Readonly<Record<string, string>>;
}

export type Core110FixtureFactory = (
  adapterClass: Core110AdapterClass,
  scenario?: Core110Scenario,
) => Promise<Core110Fixture>;

export async function runCore110Conformance(
  scenarios: readonly Core110Scenario[],
  factory: Core110FixtureFactory,
  adapterClasses: readonly Core110AdapterClass[] = [
    "IN_MEMORY",
    "PRODUCTION_EQUIVALENT",
  ],
): Promise<Core110ConformanceReport> {
  const rows: Core110EvidenceRow[] = [];
  const resultHashes: Record<string, string> = {};
  for (const adapterClass of adapterClasses) {
    for (const scenario of scenarios) {
      const fixture = await factory(adapterClass, scenario);
      let observation: Core110ScenarioObservation;
      try {
        observation = await scenario.run(fixture);
      } catch (error) {
        observation = {
          result: { thrown: error instanceof Error ? error.name : "unknown" },
          expected: "typed failure result",
          actual: "runner caught thrown adapter failure",
          status: "FAIL",
        };
      }
      const identity = await canonicalResultIdentity(observation.result);
      const key = `${adapterClass}:${scenario.failureId}`;
      resultHashes[key] = identity.resultHash;
      const evidenceStatus = adapterClass === "UNTESTED"
        ? "UNTESTED"
        : observation.status ?? "PASS";
      rows.push({
        acceptanceId: scenario.acceptanceId,
        fixtureId: scenario.fixtureId,
        adapterId: fixture.adapterId,
        adapterClass,
        failureId: scenario.failureId,
        command: scenario.command,
        exitCode: observation.status === "FAIL" ? 1 : 0,
        resultHash: identity.resultHash,
        sideEffectCounts: fixture.spies.snapshot(),
        restartTranscript: observation.restartTranscript ?? [],
        result: evidenceStatus,
        expected: observation.expected,
        actual: observation.actual,
        reviewer: "PENDING",
      });
    }
  }
  return { rows, resultHashes };
}

export function errorCode(result: Core100Result<unknown>): string | undefined {
  return result.ok ? undefined : result.diagnostics[0]?.code;
}

export function asResult(value: unknown): Core100Result<unknown> {
  return value as Core100Result<unknown>;
}
