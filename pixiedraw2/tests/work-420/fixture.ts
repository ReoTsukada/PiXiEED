import {
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
  type ContentHash,
  hashCanonical,
} from "../../src/wp160-contracts.ts";
import {
  asFinancialProviderEventId,
  type FinancialAuthorityResolutionV1,
  FP003_FINANCIAL_ACTION,
  FP003_FINANCIAL_CAPABILITY,
  FP003_FINANCIAL_RESOURCE_TYPE,
  FP003_FINANCIAL_SCHEMA_VERSION,
  type VerifiedProviderEventV1,
} from "../../src/fp003-financial-integrity-core.ts";
import {
  asDirectWorkAcceptanceId,
  asDirectWorkAgreementId,
  asDirectWorkDeliveryId,
  asDirectWorkLedgerEntryId,
  asDirectWorkMilestoneId,
  asDirectWorkPaymentEventId,
  asDirectWorkPaymentId,
  asDirectWorkQuoteId,
  asDirectWorkRequestId,
  asDirectWorkRightsDecisionId,
  createDirectWorkRequest,
  type DirectWorkAcceptance,
  type DirectWorkAgreement,
  type DirectWorkDelivery,
  type DirectWorkLedgerEntry,
  type DirectWorkMilestone,
  type DirectWorkPayment,
  type DirectWorkPaymentEvent,
  type DirectWorkQuote,
  type DirectWorkRequest,
  type DirectWorkRightsDecision,
  type Money,
  type QuoteLine,
} from "../../src/wp220-direct-work-core.ts";
import type {
  CanonicalTenantMembershipRegistryV1,
  ServerTenantContextV1,
  ServerTenantMembershipCandidateV1,
} from "../../src/server/internal/authenticated-context.ts";
import type { CanonicalRecordEnvelopeV2 } from "../../src/server/authority-contracts.ts";
import {
  WORK420_SCHEMA_VERSION,
  type Work420AcceptanceAuthority,
  type Work420AgreementAuthority,
  type Work420Authority,
  type Work420CanonicalRegistry,
  type Work420CurrentAggregate,
  type Work420DeliveryAuthority,
  type Work420LedgerAuthority,
  type Work420MilestoneAuthority,
  type Work420Operation,
  type Work420PaymentAuthority,
  type Work420PaymentEventAuthority,
  type Work420QuoteAuthority,
  type Work420RightsAuthority,
} from "../../src/platform/work-420/contracts.ts";
import { contextForSeed } from "../fixtures/fp003aa-server-auth-fixture.ts";

const TENANT_ID = "tenant:work420";
const REQUESTER_ID = "account:work420:requester";
const CREATOR_ID = "account:work420:creator";
const MONEY: Money = Object.freeze({
  amountMinor: 2_500,
  currency: "JPY",
  roundingPolicyVersion: "MINOR_UNIT_REJECT_V1",
});

let fixtureSequence = 0;

function hashDigit(digit: string): ContentHash {
  return asSha256(digit.repeat(64), `WORK420_${digit}`);
}

function proofFor(input: {
  readonly principalId: string | null;
  readonly tenantId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
}): AuthorizationProofV1 {
  const safeId = input.resourceId.replace(/[^A-Za-z0-9._:/-]/g, "_");
  const now = Date.now();
  return Object.freeze({
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "work420-isolated-server-registry",
    proofId: `work420:proof:${safeId}:${input.action}`,
    principalId: input.principalId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    capability: input.capability,
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    tenantId: input.tenantId,
    correlationId: `work420:correlation:${safeId}`,
    grantId: `work420:grant:${safeId}`,
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  });
}

function proofForExpected(
  expected: AuthorizationProofExpectation,
  fallback: {
    readonly tenantId: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly action: string;
    readonly capability: string;
  },
): AuthorizationProofV1 {
  return proofFor({
    principalId: expected.principalId ?? null,
    tenantId: expected.tenantId ?? fallback.tenantId,
    resourceType: expected.resourceType ?? fallback.resourceType,
    resourceId: expected.resourceId ?? fallback.resourceId,
    action: expected.action ?? fallback.action,
    capability: expected.capability ?? fallback.capability,
  });
}

function tenantContext(
  principalId: string | null = null,
): ServerTenantContextV1 {
  return {
    schemaVersion: "SERVER_TENANT_CONTEXT_V1",
    tenantId: TENANT_ID,
    principalId,
    source: "SERVER_REGISTRY",
  };
}

function membershipKey(input: {
  readonly principalId: string;
  readonly membershipId: string;
  readonly tenantId: string;
}): string {
  return `${input.principalId}|${input.membershipId}|${input.tenantId}`;
}

export class Work420MembershipRegistry
  implements CanonicalTenantMembershipRegistryV1 {
  readonly #revoked = new Set<string>();

  async getCurrent(input: {
    readonly principalId: string;
    readonly membershipId: string;
    readonly tenantId: string;
  }): Promise<ServerTenantMembershipCandidateV1 | null> {
    if (this.#revoked.has(membershipKey(input))) return null;
    return {
      membershipId: input.membershipId,
      principalId: input.principalId,
      tenantId: input.tenantId,
      membershipRevision: `${input.membershipId}:v1`,
      status: "ACTIVE",
    };
  }

  revoke(principalId: string, tenantId = TENANT_ID): void {
    this.#revoked.add(membershipKey({
      principalId,
      membershipId: `membership:${principalId}:${tenantId}`,
      tenantId,
    }));
  }

  restore(principalId: string, tenantId = TENANT_ID): void {
    this.#revoked.delete(membershipKey({
      principalId,
      membershipId: `membership:${principalId}:${tenantId}`,
      tenantId,
    }));
  }
}

async function envelope<T extends object>(
  record: T,
  resourceType: string,
  resourceId: string,
  revision: string,
): Promise<CanonicalRecordEnvelopeV2<T>> {
  return Object.freeze({
    ref: Object.freeze({
      schemaVersion: "CANONICAL_RECORD_REF_V2" as const,
      resourceType,
      resourceId,
      tenantId: TENANT_ID,
      revision,
      canonicalHash: await hashCanonical(record),
      origin: "SERVER_REGISTRY" as const,
    }),
    record,
  });
}

function requestIdFor(
  suffix: string,
): ReturnType<typeof asDirectWorkRequestId> {
  return asDirectWorkRequestId(`work420:request:${suffix}`);
}

function currentDeliveryAttempt(aggregate: Work420CurrentAggregate): number {
  return aggregate.delivery?.record.attempt ?? 0;
}

export class Work420FixtureRegistry implements Work420CanonicalRegistry {
  readonly membershipRegistry: Work420MembershipRegistry;
  readonly requestId: ReturnType<typeof asDirectWorkRequestId>;
  readonly tenantId = TENANT_ID;
  readonly requesterId = REQUESTER_ID;
  readonly creatorId = CREATOR_ID;
  readonly termsHash = hashDigit("b");
  readonly amount = MONEY;
  readonly #idempotency = new Map<
    string,
    { requestHash: ContentHash; aggregate: Work420CurrentAggregate }
  >();
  #aggregate: Work420CurrentAggregate;
  malformedAuthority = false;
  malformedCommit = false;
  revokeOnResolveAuthorityPrincipal: string | null = null;
  commitCount = 0;
  resolveCurrentCount = 0;

  private constructor(input: {
    readonly requestId: ReturnType<typeof asDirectWorkRequestId>;
    readonly aggregate: Work420CurrentAggregate;
    readonly membershipRegistry: Work420MembershipRegistry;
    readonly acceptanceDecision: "ACCEPTED" | "REJECTED";
  }) {
    this.requestId = input.requestId;
    this.#aggregate = input.aggregate;
    this.membershipRegistry = input.membershipRegistry;
    this.#acceptanceDecision = input.acceptanceDecision;
  }

  static async create(input: {
    readonly suffix?: string;
    readonly acceptanceDecision?: "ACCEPTED" | "REJECTED";
  } = {}): Promise<Work420FixtureRegistry> {
    const suffix = input.suffix ?? `${++fixtureSequence}`;
    const requestId = requestIdFor(suffix);
    const requestProof = proofFor({
      principalId: REQUESTER_ID,
      tenantId: TENANT_ID,
      resourceType: "DIRECT_WORK_REQUEST",
      resourceId: requestId,
      action: "direct-work.request.create",
      capability: "direct-work.request.create",
    });
    const requestResult = createDirectWorkRequest({
      requestId,
      requesterAccountId: REQUESTER_ID,
      creatorAccountId: CREATOR_ID,
      scopeHash: hashDigit("a"),
      createdAt: new Date().toISOString(),
      recordVersion: 1,
      authorizationProof: requestProof,
      authorizationProofResolver: ({ expected }) =>
        proofForExpected(expected, {
          tenantId: TENANT_ID,
          resourceType: "DIRECT_WORK_REQUEST",
          resourceId: requestId,
          action: "direct-work.request.create",
          capability: "direct-work.request.create",
        }),
    });
    if (!requestResult.ok) {
      throw new Error(
        `WORK420_FIXTURE_REQUEST_FAILED:${requestResult.diagnostics[0]?.code}`,
      );
    }
    const request = requestResult.value;
    const requestEnvelope = await envelope(
      request,
      "DIRECT_WORK_REQUEST",
      request.requestId,
      "request:v1",
    );
    const aggregate: Work420CurrentAggregate = Object.freeze({
      schemaVersion: WORK420_SCHEMA_VERSION,
      tenantContext: tenantContext(),
      aggregateVersion: 1,
      revision: "work420:v1",
      currentHeads: Object.freeze({
        requestRevision: requestEnvelope.ref.revision,
      }),
      request: requestEnvelope,
      deliveryHistory: Object.freeze([]),
      acceptanceHistory: Object.freeze([]),
      ledgerHistory: Object.freeze([]),
    });
    return new Work420FixtureRegistry({
      requestId,
      aggregate,
      membershipRegistry: new Work420MembershipRegistry(),
      acceptanceDecision: input.acceptanceDecision ?? "ACCEPTED",
    });
  }

  get current(): Work420CurrentAggregate {
    return this.#aggregate;
  }

  setCurrent(aggregate: Work420CurrentAggregate): void {
    this.#aggregate = aggregate;
  }

  async context(principalId = REQUESTER_ID) {
    return await contextForSeed({
      request: { requestId: this.requestId },
      tenantContext: { tenantId: TENANT_ID, principalId },
    });
  }

  async resolveCurrent(): Promise<Work420CurrentAggregate | null> {
    this.resolveCurrentCount += 1;
    return this.#aggregate;
  }

  async resolveAuthority(input: {
    readonly operation: Work420Operation;
    readonly principalId: string;
  }): Promise<Work420Authority | null> {
    if (this.malformedAuthority) return { operation: "UNKNOWN" } as never;
    if (this.revokeOnResolveAuthorityPrincipal === input.principalId) {
      this.membershipRegistry.revoke(input.principalId);
      this.revokeOnResolveAuthorityPrincipal = null;
    }
    const current = this.#aggregate;
    const request = current.request.record;
    const quote = current.quote?.record;
    const agreement = current.agreement?.record;
    const milestone = current.milestone?.record;
    const delivery = current.delivery?.record;
    const acceptance = current.acceptance?.record;
    const payment = current.payment?.record;
    const operation = input.operation;
    if (operation === "SUBMIT_REQUEST") return { operation };
    if (operation === "ISSUE_QUOTE") {
      const line: QuoteLine = Object.freeze({
        lineId: "work420:quote-line:1",
        deliverableHash: hashDigit("c"),
        amount: MONEY,
      });
      return {
        operation,
        quoteId: asDirectWorkQuoteId("work420:quote:1"),
        creatorAccountId: CREATOR_ID,
        lines: Object.freeze([line]),
        termsHash: this.termsHash,
        royaltyRuleVersion: "WORK420_ROYALTY_V1",
      } satisfies Work420QuoteAuthority;
    }
    if (operation === "ACCEPT_QUOTE") {
      return { operation, requesterAccountId: REQUESTER_ID };
    }
    if (operation === "CREATE_AGREEMENT") {
      return {
        operation,
        agreementId: asDirectWorkAgreementId("work420:agreement:1"),
        termsHash: quote?.termsHash ?? this.termsHash,
      } satisfies Work420AgreementAuthority;
    }
    if (
      operation === "SIGN_AGREEMENT_REQUESTER" ||
      operation === "SIGN_AGREEMENT_CREATOR"
    ) {
      return { operation, actorAccountId: input.principalId };
    }
    if (operation === "CREATE_MILESTONE") {
      return {
        operation,
        milestoneId: asDirectWorkMilestoneId("work420:milestone:1"),
        sequence: 1,
        deliverableHash: hashDigit("c"),
        amount: MONEY,
      } satisfies Work420MilestoneAuthority;
    }
    if (
      operation === "START_MILESTONE" || operation === "MARK_DELIVERY_PENDING"
    ) {
      return { operation };
    }
    if (
      operation === "SUBMIT_DELIVERY" ||
      operation === "CREATE_RECOVERY_DELIVERY"
    ) {
      const attempt = operation === "CREATE_RECOVERY_DELIVERY"
        ? currentDeliveryAttempt(current) + 1
        : 1;
      const deliveryId = asDirectWorkDeliveryId(`work420:delivery:${attempt}`);
      const result: Work420DeliveryAuthority = {
        operation,
        deliveryId,
        revisionHash: attempt === 1 ? hashDigit("d") : hashDigit("e"),
        packageReference: `work420:package:${attempt}`,
        attempt,
        ...(operation === "CREATE_RECOVERY_DELIVERY" && delivery !== undefined
          ? { previousDeliveryId: delivery.deliveryId }
          : {}),
      };
      return result;
    }
    if (operation === "DECIDE_ACCEPTANCE") {
      const decision = current.acceptance === undefined &&
          currentDeliveryAttempt(current) === 1
        ? (this.acceptanceDecision ?? "ACCEPTED")
        : (this.acceptanceDecision ?? "ACCEPTED");
      const result: Work420AcceptanceAuthority = {
        operation,
        acceptanceId: asDirectWorkAcceptanceId(
          `work420:acceptance:${currentDeliveryAttempt(current)}`,
        ),
        actorAccountId: REQUESTER_ID,
        decision,
        ...(decision === "REJECTED" ? { reasonHash: hashDigit("f") } : {}),
      };
      return result;
    }
    if (operation === "DECIDE_RIGHTS") {
      return {
        operation,
        rightsDecisionId: asDirectWorkRightsDecisionId("work420:rights:1"),
        licenseSnapshotHash: hashDigit("1"),
        rights: ["PERSONAL_USE", "COMMERCIAL_USE"],
        decidedByAccountId: input.principalId,
        status: "GRANTED",
      } satisfies Work420RightsAuthority;
    }
    if (operation === "CREATE_PAYMENT") {
      return {
        operation,
        paymentId: asDirectWorkPaymentId("work420:payment:1"),
        provider: "OPAQUE_PROVIDER",
        environment: "TEST",
      } satisfies Work420PaymentAuthority;
    }
    if (operation === "APPLY_PAYMENT_EVENT") {
      if (payment === undefined || quote === undefined) return null;
      const type = payment.status === "PENDING" ? "AUTHORIZED" : "PAID";
      const eventId = asDirectWorkPaymentEventId(
        `work420:payment-event:${type.toLowerCase()}`,
      );
      const event: DirectWorkPaymentEvent = Object.freeze({
        eventId,
        paymentId: payment.paymentId,
        requestId: request.requestId,
        sequence: payment.appliedEvents.length + 1,
        type,
        fingerprint: type === "AUTHORIZED" ? hashDigit("2") : hashDigit("3"),
        accountId: REQUESTER_ID,
        quoteSnapshotHash: quote.termsHash,
        environment: payment.environment,
      });
      const providerEvent: VerifiedProviderEventV1 | undefined = type === "PAID"
        ? Object.freeze({
          schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
          eventId: asFinancialProviderEventId(String(event.eventId)),
          payloadFingerprint: event.fingerprint,
          sourceKind: "DIRECT_WORK_PAYMENT",
          sourceId: payment.paymentId,
          eventType: "PAID",
          environment: payment.environment,
        })
        : undefined;
      return {
        operation,
        event,
        ...(providerEvent === undefined ? {} : { providerEvent }),
      } satisfies Work420PaymentEventAuthority;
    }
    if (operation === "MATERIALIZE_LEDGER") {
      if (
        payment === undefined || current.sourceEvent === undefined ||
        current.providerEvent === undefined
      ) return null;
      const financialProof = this.resolveAuthorizationProof({
        principalId: REQUESTER_ID,
        tenantId: TENANT_ID,
        resourceType: FP003_FINANCIAL_RESOURCE_TYPE,
        resourceId: payment.paymentId,
        action: FP003_FINANCIAL_ACTION,
        capability: FP003_FINANCIAL_CAPABILITY,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      });
      const financialAuthority: FinancialAuthorityResolutionV1 = {
        schemaVersion: FP003_FINANCIAL_SCHEMA_VERSION,
        sourceKind: "DIRECT_WORK_PAYMENT",
        sourceId: payment.paymentId,
        requestId: request.requestId,
        paymentId: payment.paymentId,
        providerEventId: current.providerEvent.eventId,
        payloadFingerprint: current.providerEvent.payloadFingerprint,
        environment: current.providerEvent.environment,
        settlementState: current.providerEvent.eventType,
        gross: payment.amount,
        feeSchedule: {
          feeScheduleId: "work420:fee-schedule:1",
          feeScheduleVersion: "work420:fee-schedule:v1",
          platformFeeBps: 1_000,
          royaltyRecipients: [{
            recipientAccountId: CREATOR_ID,
            allocationBps: 9_000,
          }],
        },
      };
      return {
        operation,
        sourceEvent: current.sourceEvent,
        providerEvent: current.providerEvent,
        financialProof,
        financialAuthority,
      } satisfies Work420LedgerAuthority;
    }
    return null;
  }

  resolveAuthorizationProof(
    input: Parameters<Work420CanonicalRegistry["resolveAuthorizationProof"]>[0],
  ): AuthorizationProofV1 {
    return proofFor({
      principalId: input.principalId,
      tenantId: input.tenantId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      capability: input.capability,
    });
  }

  async lookupIdempotency(input: {
    readonly tenantId: string;
    readonly requestId: ReturnType<typeof asDirectWorkRequestId>;
    readonly key: string;
    readonly requestHash: ContentHash;
  }): Promise<
    | {
      readonly requestHash: ContentHash;
      readonly aggregate: Work420CurrentAggregate;
    }
    | "CONFLICT"
    | null
  > {
    const found = this.#idempotency.get(
      `${input.tenantId}|${input.requestId}|${input.key}`,
    );
    if (found === undefined) return null;
    return found.requestHash === input.requestHash ? found : "CONFLICT";
  }

  async commit(input: Parameters<Work420CanonicalRegistry["commit"]>[0]) {
    this.commitCount += 1;
    const membership = await this.membershipRegistry.getCurrent({
      principalId: input.membership.principalId,
      membershipId: input.membership.membershipId,
      tenantId: input.membership.tenantId,
    });
    if (
      membership === null ||
      membership.status !== "ACTIVE" ||
      membership.principalId !== input.membership.principalId ||
      membership.membershipId !== input.membership.membershipId ||
      membership.tenantId !== input.membership.tenantId ||
      membership.membershipRevision !== input.membership.membershipRevision ||
      input.membership.tenantId !== input.tenantContext.tenantId ||
      input.membership.principalId !== input.tenantContext.principalId
    ) {
      return {
        ok: false as const,
        code: "PERMISSION_DENIED",
        message: "fixture membership changed before commit",
      };
    }
    if (this.malformedCommit) {
      return {
        ok: false as const,
        code: "MALFORMED_SUCCESS",
        message: "fixture malformed commit",
      };
    }
    if (input.expectedAggregateVersion !== this.#aggregate.aggregateVersion) {
      return {
        ok: false as const,
        code: "STALE_CURRENT_RECORD",
        message: "fixture stale",
      };
    }
    if (
      input.aggregate.aggregateVersion !== input.expectedAggregateVersion + 1
    ) {
      return {
        ok: false as const,
        code: "STALE_CURRENT_RECORD",
        message: "fixture version",
      };
    }
    this.#aggregate = input.aggregate;
    this.#idempotency.set(
      `${input.tenantContext.tenantId}|${input.requestId}|${input.idempotencyKey}`,
      {
        requestHash: input.requestHash,
        aggregate: input.aggregate,
      },
    );
    return {
      ok: true as const,
      value: { aggregate: input.aggregate, changed: true, duplicate: false },
    };
  }

  get acceptanceDecision(): "ACCEPTED" | "REJECTED" {
    return this.#acceptanceDecision;
  }

  #acceptanceDecision: "ACCEPTED" | "REJECTED";
}

export interface Work420Fixture {
  readonly registry: Work420FixtureRegistry;
  readonly requestId: ReturnType<typeof asDirectWorkRequestId>;
  readonly requesterId: string;
  readonly creatorId: string;
}

export async function createWork420Fixture(input: {
  readonly suffix?: string;
  readonly acceptanceDecision?: "ACCEPTED" | "REJECTED";
} = {}): Promise<Work420Fixture> {
  const registry = await Work420FixtureRegistry.create(input);
  return {
    registry,
    requestId: registry.requestId,
    requesterId: REQUESTER_ID,
    creatorId: CREATOR_ID,
  };
}

export async function contextForFixture(
  fixture: Work420Fixture,
  principalId = fixture.requesterId,
) {
  return await fixture.registry.context(principalId);
}

export function commandFor(
  operation: Work420Operation,
  idempotencyKey = `work420:command:${operation}:${Date.now()}`,
  claims?: Record<string, unknown>,
) {
  return {
    operation,
    idempotencyKey,
    ...(claims === undefined ? {} : { claims }),
  };
}

export function currentRecord<T extends object>(
  aggregate: Work420CurrentAggregate,
  key:
    | "request"
    | "quote"
    | "agreement"
    | "milestone"
    | "delivery"
    | "acceptance"
    | "rights"
    | "payment"
    | "ledger",
): CanonicalRecordEnvelopeV2<T> | undefined {
  return aggregate[key] as CanonicalRecordEnvelopeV2<T> | undefined;
}

export type Work420FixtureRecord =
  | DirectWorkRequest
  | DirectWorkQuote
  | DirectWorkAgreement
  | DirectWorkMilestone
  | DirectWorkDelivery
  | DirectWorkAcceptance
  | DirectWorkRightsDecision
  | DirectWorkPayment
  | DirectWorkLedgerEntry;

export { CREATOR_ID, hashDigit, REQUESTER_ID, TENANT_ID };
