import {
  asSha256,
  type AuthorizationProofV1,
  hashCanonical,
  requireAuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import {
  asDirectWorkLedgerEntryId,
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
} from "../../src/wp220-direct-work-core.ts";
import type {
  CollaborativeRevenueAuthorityV1,
  FinancialAuthorityResolutionV1,
  VerifiedProviderEventV1,
} from "../../src/fp003-financial-integrity-core.ts";
import type {
  CanonicalRecordEnvelopeV2,
  CanonicalRegistryAdapter,
  CanonicalTenantMembershipRegistryV1,
  CurrentDirectWorkChain,
  PrincipalAuthorityResolution,
  SecureLedgerCommand,
  ServerTenantContextV1,
} from "../../src/server/authority-contracts.ts";
import type { ServerTenantMembershipCandidateV1 } from "../../src/server/internal/authenticated-context.ts";

type StoredRecord = {
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: string;
  readonly record: unknown;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function envelope<T>(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  revision: string,
  record: T,
): Promise<CanonicalRecordEnvelopeV2<T>> {
  return hashCanonical(record).then((canonicalHash) => ({
    ref: {
      schemaVersion: "CANONICAL_RECORD_REF_V2",
      resourceType,
      resourceId,
      tenantId,
      revision,
      canonicalHash,
      origin: "SERVER_REGISTRY",
    },
    record: clone(record),
  }));
}

function revision(value: number, label: string): string {
  return `${label}:v${value}`;
}

export interface SeedDirectWorkChain {
  readonly tenantContext: ServerTenantContextV1;
  readonly request: DirectWorkRequest;
  readonly quote: DirectWorkQuote;
  readonly agreement: DirectWorkAgreement;
  readonly milestone: DirectWorkMilestone;
  readonly delivery: DirectWorkDelivery;
  readonly acceptance: DirectWorkAcceptance;
  readonly rights: DirectWorkRightsDecision;
  readonly payment: DirectWorkPayment;
  readonly sourceEvent: DirectWorkPaymentEvent;
  readonly providerEvent: VerifiedProviderEventV1;
  readonly financialProof: AuthorizationProofV1;
  readonly financialAuthority: FinancialAuthorityResolutionV1;
  readonly canonicalPrincipalId: string | null;
}

export class InMemoryTenantMembershipRegistry
  implements CanonicalTenantMembershipRegistryV1 {
  private readonly current = new Map<
    string,
    ServerTenantMembershipCandidateV1
  >();

  private key(principalId: string, membershipId: string): string {
    return `${principalId}:${membershipId}`;
  }

  upsert(membership: ServerTenantMembershipCandidateV1): void {
    this.current.set(
      this.key(membership.principalId, membership.membershipId),
      Object.freeze({ ...membership }),
    );
  }

  setStatus(
    principalId: string,
    membershipId: string,
    status: ServerTenantMembershipCandidateV1["status"],
  ): void {
    const key = this.key(principalId, membershipId);
    const current = this.current.get(key);
    if (current === undefined) return;
    this.current.set(
      key,
      Object.freeze({
        ...current,
        membershipRevision: `${current.membershipRevision}:next`,
        status,
      }),
    );
  }

  async getCurrent(input: {
    readonly principalId: string;
    readonly membershipId: string;
    readonly tenantId: string;
  }): Promise<ServerTenantMembershipCandidateV1 | null> {
    const current = this.current.get(
      this.key(input.principalId, input.membershipId),
    );
    if (current === undefined || current.tenantId !== input.tenantId) {
      return null;
    }
    return Object.freeze({ ...current });
  }
}

export class InMemoryAuthoritativeRegistry implements CanonicalRegistryAdapter {
  readonly membershipRegistry = new InMemoryTenantMembershipRegistry();
  private readonly current = new Map<string, StoredRecord>();
  private readonly chains = new Map<string, SeedDirectWorkChain>();
  private readonly principals = new Map<string, PrincipalAuthorityResolution>();
  private readonly collaborative = new Map<
    string,
    CollaborativeRevenueAuthorityV1
  >();

  private key(
    tenantId: string,
    resourceType: string,
    resourceId: string,
  ): string {
    return `${tenantId}:${resourceType}:${resourceId}`;
  }

  private chainKey(tenantId: string, requestId: string): string {
    return this.key(tenantId, "DIRECT_WORK_REQUEST", requestId);
  }

  async put<T>(
    tenantContext: ServerTenantContextV1,
    resourceType: string,
    resourceId: string,
    revisionValue: string,
    record: T,
  ): Promise<void> {
    this.current.set(
      this.key(tenantContext.tenantId, resourceType, resourceId),
      {
        tenantId: tenantContext.tenantId,
        resourceType,
        resourceId,
        revision: revisionValue,
        record: clone(record),
      },
    );
  }

  setPrincipal(
    resourceType: string,
    resourceId: string,
    resolution: PrincipalAuthorityResolution,
  ): void {
    this.principals.set(`${resourceType}:${resourceId}`, resolution);
  }

  setCollaborativeAuthority(authority: CollaborativeRevenueAuthorityV1): void {
    this.collaborative.set(authority.productRevisionId, clone(authority));
  }

  async seedDirectWorkChain(seed: SeedDirectWorkChain): Promise<void> {
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_REQUEST",
      seed.request.requestId,
      revision(seed.request.recordVersion, "request"),
      seed.request,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_QUOTE",
      seed.quote.quoteId,
      revision(seed.quote.quoteRecordVersion, "quote"),
      seed.quote,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_AGREEMENT",
      seed.agreement.agreementId,
      revision(seed.agreement.agreementRecordVersion, "agreement"),
      seed.agreement,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_MILESTONE",
      seed.milestone.milestoneId,
      revision(seed.milestone.milestoneRecordVersion, "milestone"),
      seed.milestone,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_DELIVERY",
      seed.delivery.deliveryId,
      revision(seed.delivery.deliveryRecordVersion, "delivery"),
      seed.delivery,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_ACCEPTANCE",
      seed.acceptance.acceptanceId,
      revision(seed.acceptance.acceptanceRecordVersion, "acceptance"),
      seed.acceptance,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_RIGHTS",
      seed.rights.rightsDecisionId,
      revision(seed.rights.rightsRecordVersion, "rights"),
      seed.rights,
    );
    await this.put(
      seed.tenantContext,
      "DIRECT_WORK_PAYMENT",
      seed.payment.paymentId,
      revision(seed.payment.paymentRecordVersion, "payment"),
      seed.payment,
    );
    this.chains.set(
      this.chainKey(seed.tenantContext.tenantId, seed.request.requestId),
      clone(seed),
    );
    if (seed.canonicalPrincipalId !== null) {
      this.membershipRegistry.upsert({
        membershipId:
          `membership:${seed.canonicalPrincipalId}:${seed.tenantContext.tenantId}`,
        principalId: seed.canonicalPrincipalId,
        tenantId: seed.tenantContext.tenantId,
        membershipRevision:
          `membership:${seed.canonicalPrincipalId}:${seed.tenantContext.tenantId}:v1`,
        status: "ACTIVE",
      });
    }
  }

  async resolveTenantContext(
    input: { readonly resourceType: string; readonly resourceId: string },
  ): Promise<ServerTenantContextV1 | null> {
    if (input.resourceType === "DIRECT_WORK_REQUEST") {
      const matches = [...this.chains.values()].filter((chain) =>
        chain.request.requestId === input.resourceId
      );
      // An unqualified ID that exists in more than one Tenant is ambiguous;
      // the Server Composition Root must supply the authenticated context.
      if (matches.length === 1) return clone(matches[0]!.tenantContext);
      return null;
    }
    const principal = this.principals.get(
      `${input.resourceType}:${input.resourceId}`,
    );
    if (principal !== undefined) return clone(principal.tenantContext);
    if (
      input.resourceType === "COLLABORATIVE_REVENUE_AUTHORITY" &&
      this.collaborative.has(input.resourceId)
    ) {
      return {
        schemaVersion: "SERVER_TENANT_CONTEXT_V1",
        tenantId: "tenant-fp003z",
        principalId: null,
        source: "SERVER_REGISTRY",
      };
    }
    return null;
  }

  async getCurrent<T>(
    tenantContext: ServerTenantContextV1,
    resourceType: string,
    resourceId: string,
  ): Promise<CanonicalRecordEnvelopeV2<T> | null> {
    const stored = this.current.get(
      this.key(tenantContext.tenantId, resourceType, resourceId),
    );
    if (stored === undefined) return null;
    return envelope(
      stored.tenantId,
      stored.resourceType,
      stored.resourceId,
      stored.revision,
      stored.record as T,
    );
  }

  async resolvePrincipal(
    input: {
      readonly tenantContext: ServerTenantContextV1;
      readonly callerProof: unknown;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly claimedPrincipalId?: string | null;
    },
  ): Promise<PrincipalAuthorityResolution> {
    const resolution = this.principals.get(
      `${input.resourceType}:${input.resourceId}`,
    );
    if (resolution === undefined) throw new Error("AUTHORITY_RECORD_NOT_FOUND");
    if (resolution.tenantContext.tenantId !== input.tenantContext.tenantId) {
      throw new Error("TENANT_CONTEXT_MISMATCH");
    }
    if (
      input.claimedPrincipalId !== undefined &&
      input.claimedPrincipalId !== resolution.canonicalPrincipalId
    ) throw new Error("PRINCIPAL_BINDING_MISMATCH");
    requireAuthorizationProofV1(input.callerProof, {
      principalId: resolution.canonicalPrincipalId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      tenantId: input.tenantContext.tenantId,
    });
    requireAuthorizationProofV1(resolution.proof, {
      principalId: resolution.canonicalPrincipalId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      tenantId: input.tenantContext.tenantId,
    });
    return {
      canonicalPrincipalId: resolution.canonicalPrincipalId,
      tenantContext: clone(input.tenantContext),
      proof: clone(resolution.proof),
    };
  }

  async getCurrentDirectWorkChain(
    input: {
      readonly tenantContext: ServerTenantContextV1;
      readonly membershipId: string;
      readonly membershipRevision: string;
      readonly requestId: string;
      readonly paymentId: string;
      readonly sourceEventId: string;
      readonly providerEventId: string;
    },
  ): Promise<CurrentDirectWorkChain | null> {
    const membership = await this.membershipRegistry.getCurrent({
      principalId: input.tenantContext.principalId ?? "",
      membershipId: input.membershipId,
      tenantId: input.tenantContext.tenantId,
    });
    if (
      membership === null ||
      membership.status !== "ACTIVE" ||
      membership.principalId !== input.tenantContext.principalId ||
      membership.membershipId !== input.membershipId ||
      membership.membershipRevision !== input.membershipRevision
    ) return null;
    const seed = this.chains.get(
      this.chainKey(input.tenantContext.tenantId, input.requestId),
    );
    if (
      seed === undefined ||
      seed.tenantContext.principalId !== input.tenantContext.principalId ||
      seed.payment.paymentId !== input.paymentId ||
      seed.sourceEvent.eventId !== input.sourceEventId ||
      seed.providerEvent.eventId !== input.providerEventId
    ) return null;
    const [
      request,
      quote,
      agreement,
      milestone,
      delivery,
      acceptance,
      rights,
      payment,
    ] = await Promise.all([
      this.getCurrent<DirectWorkRequest>(
        input.tenantContext,
        "DIRECT_WORK_REQUEST",
        seed.request.requestId,
      ),
      this.getCurrent<DirectWorkQuote>(
        input.tenantContext,
        "DIRECT_WORK_QUOTE",
        seed.quote.quoteId,
      ),
      this.getCurrent<DirectWorkAgreement>(
        input.tenantContext,
        "DIRECT_WORK_AGREEMENT",
        seed.agreement.agreementId,
      ),
      this.getCurrent<DirectWorkMilestone>(
        input.tenantContext,
        "DIRECT_WORK_MILESTONE",
        seed.milestone.milestoneId,
      ),
      this.getCurrent<DirectWorkDelivery>(
        input.tenantContext,
        "DIRECT_WORK_DELIVERY",
        seed.delivery.deliveryId,
      ),
      this.getCurrent<DirectWorkAcceptance>(
        input.tenantContext,
        "DIRECT_WORK_ACCEPTANCE",
        seed.acceptance.acceptanceId,
      ),
      this.getCurrent<DirectWorkRightsDecision>(
        input.tenantContext,
        "DIRECT_WORK_RIGHTS",
        seed.rights.rightsDecisionId,
      ),
      this.getCurrent<DirectWorkPayment>(
        input.tenantContext,
        "DIRECT_WORK_PAYMENT",
        seed.payment.paymentId,
      ),
    ]);
    if (
      [
        request,
        quote,
        agreement,
        milestone,
        delivery,
        acceptance,
        rights,
        payment,
      ].some((value) => value === null)
    ) return null;
    return {
      tenantContext: clone(seed.tenantContext),
      request: request!,
      quote: quote!,
      agreement: agreement!,
      milestone: milestone!,
      delivery: delivery!,
      acceptance: acceptance!,
      rights: rights!,
      payment: payment!,
      currentHeads: {
        requestRevision: request!.ref.revision,
        quoteRevision: quote!.ref.revision,
        agreementRevision: agreement!.ref.revision,
        milestoneRevision: milestone!.ref.revision,
        deliveryRevision: delivery!.ref.revision,
        acceptanceRevision: acceptance!.ref.revision,
        rightsRevision: rights!.ref.revision,
        paymentRevision: payment!.ref.revision,
      },
      sourceEvent: clone(seed.sourceEvent),
      providerEvent: clone(seed.providerEvent),
      financial: {
        proof: clone(seed.financialProof),
        authority: clone(seed.financialAuthority),
      },
      canonicalPrincipalId: seed.canonicalPrincipalId,
    };
  }

  async getCurrentMarketSettlement(
    _input: {
      readonly tenantContext: ServerTenantContextV1;
      readonly productId: string;
      readonly purchaseId: string;
      readonly providerEventId: string;
    },
  ): Promise<null> {
    return null;
  }

  async getCollaborativeRevenueAuthority(
    input: {
      readonly tenantContext: ServerTenantContextV1;
      readonly productRevisionId: string;
    },
  ): Promise<
    CanonicalRecordEnvelopeV2<CollaborativeRevenueAuthorityV1> | null
  > {
    const authority = this.collaborative.get(input.productRevisionId);
    if (authority === undefined) return null;
    return envelope(
      input.tenantContext.tenantId,
      "COLLABORATIVE_REVENUE_AUTHORITY",
      input.productRevisionId,
      "collaborative-revenue:v1",
      authority,
    );
  }

  async materializeLedger(
    command: SecureLedgerCommand,
  ): Promise<
    { readonly ok: true; readonly value: DirectWorkLedgerEntry } | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    }
  > {
    const membership = await this.membershipRegistry.getCurrent({
      principalId: command.tenantContext.principalId ?? "",
      membershipId: command.membershipId,
      tenantId: command.tenantContext.tenantId,
    });
    if (
      membership === null ||
      membership.status !== "ACTIVE" ||
      membership.principalId !== command.tenantContext.principalId ||
      membership.membershipId !== command.membershipId ||
      membership.membershipRevision !== command.membershipRevision
    ) {
      return {
        ok: false,
        code: "STALE_MEMBERSHIP",
        message:
          "Tenant membership is no longer current for Ledger materialization.",
      };
    }
    const paymentEnvelope = await this.getCurrent<DirectWorkPayment>(
      command.tenantContext,
      "DIRECT_WORK_PAYMENT",
      command.paymentId,
    );
    const seed = [...this.chains.values()].find((value) =>
      value.payment.paymentId === command.paymentId &&
      value.tenantContext.tenantId === command.tenantContext.tenantId &&
      value.tenantContext.principalId === command.tenantContext.principalId
    );
    if (
      paymentEnvelope === null || seed === undefined ||
      seed.tenantContext.tenantId !== command.tenantContext.tenantId
    ) {
      return {
        ok: false,
        code: "STALE_PAYMENT",
        message: "Payment is not current in the Tenant-scoped Server Registry.",
      };
    }
    if (paymentEnvelope.ref.revision !== command.expectedRevision) {
      return {
        ok: false,
        code: "STALE_PAYMENT",
        message: "Payment revision is not current in the Server Registry.",
      };
    }
    if (seed.sourceEvent.eventId !== command.sourceEventId) {
      return {
        ok: false,
        code: "PROVIDER_EVENT_INVALID",
        message:
          "Provider Event is not the Server Registry event for this Payment.",
      };
    }
    const payment = paymentEnvelope.record;
    const event = seed.sourceEvent;
    const applied = payment.appliedEvents.find((value) =>
      value.eventId === event.eventId &&
      value.fingerprint === event.fingerprint && value.type === event.type
    );
    if (
      applied === undefined || event.paymentId !== payment.paymentId ||
      event.requestId !== payment.requestId
    ) {
      return {
        ok: false,
        code: "LEDGER_INVALID",
        message: "Payment Event is not reconciled against the current Payment.",
      };
    }
    if (event.type !== "PAID" && event.type !== "REFUNDED") {
      return {
        ok: false,
        code: "LEDGER_INVALID",
        message: "Only PAID or REFUNDED Provider Events can derive Ledger.",
      };
    }
    const value = {
      ledgerEntryId: asDirectWorkLedgerEntryId(command.ledgerEntryId),
      requestId: payment.requestId,
      paymentId: payment.paymentId,
      sourceEventId: event.eventId,
      entryType: event.type === "REFUNDED"
        ? "REVERSAL" as const
        : "SALE" as const,
      direction: event.type === "REFUNDED"
        ? "DEBIT" as const
        : "CREDIT" as const,
      amount: payment.amount,
    };
    return {
      ok: true,
      value: { ...value, immutableHash: await hashCanonical(value) },
    };
  }
}

export const TEST_REGISTRY_HASH = asSha256("f".repeat(64));
