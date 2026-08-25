/**
 * WORK-420 isolated Direct Work composition contracts.
 *
 * This file is an internal/server-facing reference boundary.  It carries
 * canonical references, hashes, and bounded hints only.  It does not expose a
 * route, Provider SDK, database client, Storage client, or public projection.
 */

import type {
  AuthorizationProofV1,
  ContentHash,
} from "../../wp160-contracts.ts";
import type {
  FinancialAuthorityResolutionV1,
  VerifiedProviderEventV1,
} from "../../fp003-financial-integrity-core.ts";
import type {
  DirectWorkAcceptance,
  DirectWorkAcceptanceId,
  DirectWorkAgreement,
  DirectWorkAgreementId,
  DirectWorkDelivery,
  DirectWorkDeliveryId,
  DirectWorkLedgerEntry,
  DirectWorkLedgerEntryId,
  DirectWorkLicenseRight,
  DirectWorkMilestone,
  DirectWorkMilestoneId,
  DirectWorkPayment,
  DirectWorkPaymentEvent,
  DirectWorkPaymentId,
  DirectWorkQuote,
  DirectWorkQuoteId,
  DirectWorkRequest,
  DirectWorkRequestId,
  DirectWorkRightsDecision,
  DirectWorkRightsDecisionId,
  Money,
  QuoteLine,
} from "../../wp220-direct-work-core.ts";
import type {
  CanonicalRecordEnvelopeV2,
} from "../../server/authority-contracts.ts";
import type {
  CanonicalTenantMembershipRegistryV1,
  ServerAuthorityRequestContextV1,
  ServerTenantContextV1,
} from "../../server/internal/authenticated-context.ts";

export const WORK420_SCHEMA_VERSION =
  "WORK420_DIRECT_WORK_COMPOSITION_V1" as const;
export const WORK420_EVENT_ADAPTER_SCHEMA_VERSION =
  "WORK420_TRUSTED_EVENT_ADAPTER_V1" as const;

export type Work420RecordKind =
  | "REQUEST"
  | "QUOTE"
  | "AGREEMENT"
  | "MILESTONE"
  | "DELIVERY"
  | "ACCEPTANCE"
  | "RIGHTS"
  | "PAYMENT"
  | "LEDGER";

export type Work420Operation =
  | "SUBMIT_REQUEST"
  | "ISSUE_QUOTE"
  | "ACCEPT_QUOTE"
  | "CREATE_AGREEMENT"
  | "SIGN_AGREEMENT_REQUESTER"
  | "SIGN_AGREEMENT_CREATOR"
  | "CREATE_MILESTONE"
  | "START_MILESTONE"
  | "SUBMIT_DELIVERY"
  | "MARK_DELIVERY_PENDING"
  | "DECIDE_ACCEPTANCE"
  | "CREATE_RECOVERY_DELIVERY"
  | "DECIDE_RIGHTS"
  | "CREATE_PAYMENT"
  | "APPLY_PAYMENT_EVENT"
  | "MATERIALIZE_LEDGER";

export type Work420PaymentEventOperation = Extract<
  Work420Operation,
  "APPLY_PAYMENT_EVENT"
>;

/**
 * All fields here are caller claims at most.  The composition root compares
 * them with server-resolved values or rejects them; it never uses them to
 * choose a record, amount, license, recipient, or Provider identity.
 */
export interface Work420UntrustedClaims {
  readonly requestId?: string;
  readonly aggregateId?: string;
  readonly parentId?: string;
  readonly quoteId?: string;
  readonly quoteRevision?: string;
  readonly agreementId?: string;
  readonly agreementRevision?: string;
  readonly milestoneId?: string;
  readonly milestoneRevision?: string;
  readonly deliveryId?: string;
  readonly deliveryRevision?: string;
  readonly acceptanceId?: string;
  readonly acceptanceRevision?: string;
  readonly rightsDecisionId?: string;
  readonly rightsRevision?: string;
  readonly paymentId?: string;
  readonly paymentRevision?: string;
  readonly ledgerEntryId?: string;
  readonly ledgerRevision?: string;
  readonly termsHash?: ContentHash;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly recipientAccountId?: string;
  readonly royaltyRateBps?: number;
  readonly licenseSnapshotHash?: ContentHash;
  readonly rights?: readonly string[];
  readonly acceptanceDecision?: "ACCEPTED" | "REJECTED";
  readonly sourceEventId?: string;
  readonly providerEventId?: string;
  readonly providerPayloadFingerprint?: ContentHash;
}

export interface Work420Command {
  readonly operation: Work420Operation;
  readonly claims?: Work420UntrustedClaims;
  readonly idempotencyKey?: string;
}

export interface Work420CurrentHeads {
  readonly requestRevision: string;
  readonly quoteRevision?: string;
  readonly agreementRevision?: string;
  readonly milestoneRevision?: string;
  readonly deliveryRevision?: string;
  readonly acceptanceRevision?: string;
  readonly rightsRevision?: string;
  readonly paymentRevision?: string;
  readonly ledgerRevision?: string;
}

export interface Work420CurrentAggregate {
  readonly schemaVersion: typeof WORK420_SCHEMA_VERSION;
  readonly tenantContext: ServerTenantContextV1;
  readonly aggregateVersion: number;
  readonly revision: string;
  readonly currentHeads: Work420CurrentHeads;
  readonly request: CanonicalRecordEnvelopeV2<DirectWorkRequest>;
  readonly quote?: CanonicalRecordEnvelopeV2<DirectWorkQuote>;
  readonly agreement?: CanonicalRecordEnvelopeV2<DirectWorkAgreement>;
  readonly milestone?: CanonicalRecordEnvelopeV2<DirectWorkMilestone>;
  readonly delivery?: CanonicalRecordEnvelopeV2<DirectWorkDelivery>;
  readonly acceptance?: CanonicalRecordEnvelopeV2<DirectWorkAcceptance>;
  readonly rights?: CanonicalRecordEnvelopeV2<DirectWorkRightsDecision>;
  readonly payment?: CanonicalRecordEnvelopeV2<DirectWorkPayment>;
  readonly ledger?: CanonicalRecordEnvelopeV2<DirectWorkLedgerEntry>;
  readonly deliveryHistory: readonly CanonicalRecordEnvelopeV2<
    DirectWorkDelivery
  >[];
  readonly acceptanceHistory: readonly CanonicalRecordEnvelopeV2<
    DirectWorkAcceptance
  >[];
  readonly ledgerHistory: readonly CanonicalRecordEnvelopeV2<
    DirectWorkLedgerEntry
  >[];
  readonly sourceEvent?: DirectWorkPaymentEvent;
  readonly providerEvent?: VerifiedProviderEventV1;
}

export interface Work420QuoteAuthority {
  readonly operation: "ISSUE_QUOTE";
  readonly quoteId: DirectWorkQuoteId;
  readonly creatorAccountId: string;
  readonly lines: readonly QuoteLine[];
  readonly termsHash: ContentHash;
  readonly royaltyRuleVersion: string;
}

export interface Work420AgreementAuthority {
  readonly operation: "CREATE_AGREEMENT";
  readonly agreementId: DirectWorkAgreementId;
  readonly termsHash: ContentHash;
}

export interface Work420MilestoneAuthority {
  readonly operation: "CREATE_MILESTONE";
  readonly milestoneId: DirectWorkMilestoneId;
  readonly sequence: number;
  readonly deliverableHash: ContentHash;
  readonly amount: Money;
}

export interface Work420DeliveryAuthority {
  readonly operation: "SUBMIT_DELIVERY" | "CREATE_RECOVERY_DELIVERY";
  readonly deliveryId: DirectWorkDeliveryId;
  readonly revisionHash: ContentHash;
  readonly packageReference?: string;
  readonly attempt: number;
  readonly previousDeliveryId?: DirectWorkDeliveryId;
}

export interface Work420AcceptanceAuthority {
  readonly operation: "DECIDE_ACCEPTANCE";
  readonly acceptanceId: DirectWorkAcceptanceId;
  readonly actorAccountId: string;
  readonly decision: "ACCEPTED" | "REJECTED";
  readonly reasonHash?: ContentHash;
}

export interface Work420RightsAuthority {
  readonly operation: "DECIDE_RIGHTS";
  readonly rightsDecisionId: DirectWorkRightsDecisionId;
  readonly licenseSnapshotHash: ContentHash;
  readonly rights: readonly DirectWorkLicenseRight[];
  readonly decidedByAccountId: string;
  readonly status: "GRANTED" | "REJECTED";
}

export interface Work420PaymentAuthority {
  readonly operation: "CREATE_PAYMENT";
  readonly paymentId: DirectWorkPaymentId;
  readonly provider: DirectWorkPayment["provider"];
  readonly environment: DirectWorkPayment["environment"];
}

export interface Work420PaymentEventAuthority {
  readonly operation: Work420PaymentEventOperation;
  readonly event: DirectWorkPaymentEvent;
  readonly providerEvent?: VerifiedProviderEventV1;
}

export interface Work420LedgerAuthority {
  readonly operation: "MATERIALIZE_LEDGER";
  readonly sourceEvent: DirectWorkPaymentEvent;
  readonly providerEvent: VerifiedProviderEventV1;
  readonly financialProof: AuthorizationProofV1;
  readonly financialAuthority: FinancialAuthorityResolutionV1;
}

export type Work420Authority =
  | { readonly operation: "SUBMIT_REQUEST" }
  | Work420QuoteAuthority
  | { readonly operation: "ACCEPT_QUOTE"; readonly requesterAccountId: string }
  | Work420AgreementAuthority
  | {
    readonly operation: "SIGN_AGREEMENT_REQUESTER" | "SIGN_AGREEMENT_CREATOR";
    readonly actorAccountId: string;
  }
  | Work420MilestoneAuthority
  | { readonly operation: "START_MILESTONE" }
  | Work420DeliveryAuthority
  | { readonly operation: "MARK_DELIVERY_PENDING" }
  | Work420AcceptanceAuthority
  | Work420RightsAuthority
  | Work420PaymentAuthority
  | Work420PaymentEventAuthority
  | Work420LedgerAuthority;

export interface Work420IdempotencyLookup {
  readonly requestHash: ContentHash;
  readonly aggregate: Work420CurrentAggregate;
}

export interface Work420CommitMembershipIdentity {
  readonly membershipId: string;
  readonly principalId: string;
  readonly tenantId: string;
  readonly membershipRevision: string;
}

export interface Work420CommitInput {
  readonly tenantContext: ServerTenantContextV1;
  readonly membership: Work420CommitMembershipIdentity;
  readonly requestId: DirectWorkRequestId;
  readonly expectedAggregateVersion: number;
  readonly requestHash: ContentHash;
  readonly idempotencyKey: string;
  readonly aggregate: Work420CurrentAggregate;
}

export type Work420CommitResult =
  | {
    readonly ok: true;
    readonly value: {
      readonly aggregate: Work420CurrentAggregate;
      readonly changed: boolean;
      readonly duplicate: boolean;
    };
  }
  | {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
  };

export interface Work420CanonicalRegistry {
  readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  resolveCurrent(input: {
    readonly tenantContext: ServerTenantContextV1;
    readonly requestId: DirectWorkRequestId;
    readonly operation: Work420Operation;
  }): Promise<Work420CurrentAggregate | null>;
  resolveAuthority(input: {
    readonly tenantContext: ServerTenantContextV1;
    readonly requestId: DirectWorkRequestId;
    readonly operation: Work420Operation;
    readonly principalId: string;
  }): Promise<Work420Authority | null>;
  resolveAuthorizationProof(input: {
    readonly principalId: string | null;
    readonly tenantId: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly action: string;
    readonly capability: string;
    readonly policyVersion: string;
  }): AuthorizationProofV1;
  lookupIdempotency(input: {
    readonly tenantId: string;
    readonly requestId: DirectWorkRequestId;
    readonly key: string;
    readonly requestHash: ContentHash;
  }): Promise<Work420IdempotencyLookup | "CONFLICT" | null>;
  commit(input: Work420CommitInput): Promise<Work420CommitResult>;
}

export type Work420DiagnosticCode =
  | "FEATURE_DISABLED"
  | "UNKNOWN_FLAG"
  | "KILL_SWITCH_ACTIVE"
  | "COMMAND_SCHEMA_INVALID"
  | "PRIVATE_DATA_REJECTED"
  | "SERVER_CONTEXT_INVALID"
  | "REGISTRY_UNAVAILABLE"
  | "REGISTRY_INVALID_RESPONSE"
  | "CURRENT_RECORD_NOT_FOUND"
  | "STALE_CURRENT_RECORD"
  | "TENANT_CONTEXT_MISMATCH"
  | "CANONICAL_RECORD_INVALID"
  | "CANONICAL_RECORD_HASH_MISMATCH"
  | "AGGREGATE_GRAPH_INVALID"
  | "CROSS_RECORD_MISMATCH"
  | "PARENT_ID_MISMATCH"
  | "TERMS_HASH_MISMATCH"
  | "INVALID_STATE_TRANSITION"
  | "PERMISSION_DENIED"
  | "CALLER_CLAIM_MISMATCH"
  | "CALLER_AUTHORITY_REJECTED"
  | "MONEY_INVALID"
  | "MONEY_MISMATCH"
  | "ACCEPTANCE_REQUIRED"
  | "DELIVERY_REQUIRED"
  | "RIGHTS_REQUIRED"
  | "PROVIDER_EVENT_INVALID"
  | "PAYMENT_BINDING_MISMATCH"
  | "LEDGER_BINDING_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_NOOP"
  | "MALFORMED_SUCCESS";

export interface Work420Diagnostic {
  readonly code: Work420DiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type Work420Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Work420Diagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly Work420Diagnostic[];
  };

export interface Work420TransitionResult {
  readonly schemaVersion: typeof WORK420_SCHEMA_VERSION;
  readonly operation: Work420Operation;
  readonly status: "APPLIED" | "IDEMPOTENT_NOOP";
  readonly changed: boolean;
  readonly aggregate: Work420CurrentAggregate;
  readonly audit: Work420PublicAuditSummary;
}

export interface Work420EventAdapterCapability {
  readonly adapterId: "WORK420_FP004_REFERENCE_ADAPTER";
  readonly storage: "IN_MEMORY_REFERENCE_ONLY";
  readonly processDurable: false;
  readonly crossProcessDurable: false;
  readonly providerIntegrated: false;
  readonly productionReady: false;
}

export const WORK420_EVENT_ADAPTER_CAPABILITY: Work420EventAdapterCapability =
  Object.freeze({
    adapterId: "WORK420_FP004_REFERENCE_ADAPTER",
    storage: "IN_MEMORY_REFERENCE_ONLY",
    processDurable: false,
    crossProcessDurable: false,
    providerIntegrated: false,
    productionReady: false,
  });

export interface Work420PublicAuditSummary {
  readonly schemaVersion: typeof WORK420_SCHEMA_VERSION;
  readonly domain: "DIRECT_WORK";
  readonly requestId: string;
  readonly aggregateVersion: number;
  readonly operation: Work420Operation;
  readonly status: "APPLIED" | "IDEMPOTENT_NOOP";
  readonly deliveryRevisionCount: number;
  readonly ledgerRevisionCount: number;
  readonly hasSensitiveFields: false;
  readonly publicProjectionAllowed: false;
}

export type {
  AuthorizationProofV1,
  CanonicalRecordEnvelopeV2,
  ContentHash,
  DirectWorkAcceptance,
  DirectWorkAcceptanceId,
  DirectWorkAgreement,
  DirectWorkAgreementId,
  DirectWorkDelivery,
  DirectWorkDeliveryId,
  DirectWorkLedgerEntry,
  DirectWorkLedgerEntryId,
  DirectWorkLicenseRight,
  DirectWorkMilestone,
  DirectWorkMilestoneId,
  DirectWorkPayment,
  DirectWorkPaymentEvent,
  DirectWorkPaymentId,
  DirectWorkQuote,
  DirectWorkQuoteId,
  DirectWorkRequest,
  DirectWorkRequestId,
  DirectWorkRightsDecision,
  DirectWorkRightsDecisionId,
  FinancialAuthorityResolutionV1,
  Money,
  QuoteLine,
  ServerAuthorityRequestContextV1,
  ServerTenantContextV1,
};
