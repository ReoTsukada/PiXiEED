/**
 * FP-003Z server-only authority contracts.
 *
 * This module contains no Browser entry point and no caller/provider factory.
 * A Registry adapter is an internal server dependency; Browser commands carry
 * identifiers and expected revisions only.
 */

import type { AuthorizationProofV1, ContentHash } from "../wp160-contracts.ts";
import type {
  DirectWorkAcceptance,
  DirectWorkAgreement,
  DirectWorkDelivery,
  DirectWorkLedgerEntry,
  DirectWorkMilestone,
  DirectWorkPayment,
  DirectWorkPaymentEvent,
  DirectWorkQuote,
  DirectWorkRequest,
  DirectWorkRightsDecision,
} from "../wp220-direct-work-core.ts";
import type {
  CollaborativeRevenueAuthorityV1,
  ContributorRevenueAllocationV1,
  FinancialAuthorityResolutionV1,
  VerifiedProviderEventV1,
} from "../fp003-financial-integrity-core.ts";
import type {
  MarketProductProjection,
  PurchaseEvent,
  PurchaseRecord,
} from "../wp210-market-rights-core.ts";
import type {
  CanonicalTenantMembershipRegistryV1,
  ServerAuthorityRequestContextV1,
  ServerTenantContextV1,
} from "./internal/authenticated-context.ts";

export type {
  AuthenticatedServerPrincipalV1,
  AuthPrincipalProvider,
  CanonicalTenantMembershipRegistryV1,
  ServerAuthorityRequestContextV1,
  ServerAuthRequestV1,
  ServerAuthVerificationAdapter,
  ServerTenantContextV1,
  ServerTenantMembershipCandidateV1,
  ServerTenantMembershipV1,
  TenantMembershipResolver,
  VerifiedServerAuthSessionV1,
} from "./internal/authenticated-context.ts";

export const CANONICAL_RECORD_REF_SCHEMA_VERSION =
  "CANONICAL_RECORD_REF_V2" as const;

export const SERVER_TENANT_CONTEXT_SCHEMA_VERSION =
  "SERVER_TENANT_CONTEXT_V1" as const;
export const SERVER_AUTHORITY_REQUEST_CONTEXT_SCHEMA_VERSION =
  "SERVER_AUTHORITY_REQUEST_CONTEXT_V1" as const;

export function isServerTenantContext(
  value: unknown,
): value is ServerTenantContextV1 {
  if (value === null || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return context.schemaVersion === SERVER_TENANT_CONTEXT_SCHEMA_VERSION &&
    typeof context.tenantId === "string" &&
    context.tenantId.length > 0 &&
    (context.principalId === null || typeof context.principalId === "string") &&
    context.source === "SERVER_REGISTRY";
}

export interface CanonicalRecordRefV2 {
  readonly schemaVersion: typeof CANONICAL_RECORD_REF_SCHEMA_VERSION;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly tenantId: string;
  readonly revision: string;
  readonly canonicalHash: ContentHash;
  readonly origin: "SERVER_REGISTRY";
}

export interface CanonicalRecordEnvelopeV2<T> {
  readonly ref: CanonicalRecordRefV2;
  readonly record: T;
}

export interface PrincipalAuthorityResolution {
  readonly canonicalPrincipalId: string | null;
  readonly tenantContext: ServerTenantContextV1;
  readonly proof: AuthorizationProofV1;
}

export interface CurrentDirectWorkHeads {
  readonly requestRevision: string;
  readonly quoteRevision: string;
  readonly agreementRevision: string;
  readonly milestoneRevision: string;
  readonly deliveryRevision: string;
  readonly acceptanceRevision: string;
  readonly rightsRevision: string;
  readonly paymentRevision: string;
}

export interface CurrentDirectWorkChain {
  readonly tenantContext: ServerTenantContextV1;
  readonly request: CanonicalRecordEnvelopeV2<DirectWorkRequest>;
  readonly quote: CanonicalRecordEnvelopeV2<DirectWorkQuote>;
  readonly agreement: CanonicalRecordEnvelopeV2<DirectWorkAgreement>;
  readonly milestone: CanonicalRecordEnvelopeV2<DirectWorkMilestone>;
  readonly delivery: CanonicalRecordEnvelopeV2<DirectWorkDelivery>;
  readonly acceptance: CanonicalRecordEnvelopeV2<DirectWorkAcceptance>;
  readonly rights: CanonicalRecordEnvelopeV2<DirectWorkRightsDecision>;
  readonly payment: CanonicalRecordEnvelopeV2<DirectWorkPayment>;
  readonly currentHeads: CurrentDirectWorkHeads;
  readonly sourceEvent: DirectWorkPaymentEvent;
  readonly providerEvent: VerifiedProviderEventV1;
  readonly financial: {
    readonly proof: AuthorizationProofV1;
    readonly authority: FinancialAuthorityResolutionV1;
  };
  readonly canonicalPrincipalId: string | null;
}

export interface MarketSettlementAuthority {
  readonly tenantContext: ServerTenantContextV1;
  readonly product: CanonicalRecordEnvelopeV2<MarketProductProjection>;
  readonly purchase: CanonicalRecordEnvelopeV2<PurchaseRecord>;
  readonly paymentEvents: readonly PurchaseEvent[];
  readonly entitlementId: string;
  readonly providerEvent: VerifiedProviderEventV1;
  readonly canonicalPrincipalId: string | null;
  readonly financial: CurrentDirectWorkChain["financial"];
}

export interface SecureLedgerCommand {
  readonly tenantContext: ServerTenantContextV1;
  readonly membershipId: string;
  readonly membershipRevision: string;
  readonly paymentId: string;
  readonly expectedRevision: string;
  readonly sourceEventId: string;
  readonly ledgerEntryId: string;
}

export interface CanonicalRegistryAdapter {
  readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  /** Server lookup. Tenant scope is created by the Server Composition Root. */
  resolveTenantContext(
    input: { readonly resourceType: string; readonly resourceId: string },
  ): Promise<ServerTenantContextV1 | null>;
  getCurrent<T>(
    tenantContext: ServerTenantContextV1,
    resourceType: string,
    resourceId: string,
  ): Promise<CanonicalRecordEnvelopeV2<T> | null>;
  resolvePrincipal(input: {
    readonly tenantContext: ServerTenantContextV1;
    readonly callerProof: unknown;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly claimedPrincipalId?: string | null;
  }): Promise<PrincipalAuthorityResolution>;
  getCurrentDirectWorkChain(input: {
    readonly tenantContext: ServerTenantContextV1;
    readonly membershipId: string;
    readonly membershipRevision: string;
    readonly requestId: string;
    readonly paymentId: string;
    readonly sourceEventId: string;
    readonly providerEventId: string;
  }): Promise<CurrentDirectWorkChain | null>;
  getCurrentMarketSettlement(input: {
    readonly tenantContext: ServerTenantContextV1;
    readonly productId: string;
    readonly purchaseId: string;
    readonly providerEventId: string;
  }): Promise<MarketSettlementAuthority | null>;
  getCollaborativeRevenueAuthority(
    input: {
      readonly tenantContext: ServerTenantContextV1;
      readonly productRevisionId: string;
    },
  ): Promise<CanonicalRecordEnvelopeV2<CollaborativeRevenueAuthorityV1> | null>;
  materializeLedger(command: SecureLedgerCommand): Promise<
    | { readonly ok: true; readonly value: DirectWorkLedgerEntry }
    | { readonly ok: false; readonly code: string; readonly message: string }
  >;
}
