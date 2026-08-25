/**
 * OPS-440 public contract.
 *
 * This file is deliberately dependency-free.  It exposes only bounded
 * opaque references, event metadata, surfaces, commands, and safe results.
 * Server authority, resolver, policy, resource, and event-ingress types are
 * intentionally absent from this public root.
 */

export const OPS440_SCHEMA_VERSION = "OPS_440_CONTRACT_V1" as const;

declare const Ops440OpaqueIdBrand: unique symbol;
export type Ops440OpaqueId = string & {
  readonly [Ops440OpaqueIdBrand]: true;
};

export type Ops440Surface =
  | "DISCOVER"
  | "PUBLIC_SOCIAL"
  | "COMMUNITY"
  | "PUBLIC_CREATOR"
  | "PUBLIC_PROJECT"
  | "MARKET_BROWSE"
  | "PUBLIC_GAME"
  | "PUBLIC_LISTENING"
  | "PUBLIC_DISCOVERY"
  | "PUBLIC_FEED"
  | "MARKET_LISTING"
  | "PUBLIC_RESOURCE"
  | "DRAW2_EDITOR"
  | "GAME_EDITOR"
  | "AUDIO_EDITOR"
  | "ACTIVE_STUDIO"
  | "STUDIO"
  | "CHECKOUT"
  | "ENTITLEMENT"
  | "COMMISSION"
  | "ACCOUNT_PRIVATE"
  | "PROJECT_PRIVATE"
  | "DIRECT_WORK"
  | "PRIVATE_INBOX"
  | "ADMIN";

export type Ops440CommandKind =
  | "ADMIN_PROJECTION"
  | "ANALYTICS_EVENT"
  | "AD_INTENT"
  | "MODERATION_REFERENCE"
  | "REVENUE_SHADOW"
  | "EVENT_INGEST";

export type Ops440ModerationAction =
  | "REPORT"
  | "REVIEW"
  | "HIDE"
  | "REMOVE"
  | "RESTRICT"
  | "SUSPEND"
  | "APPEAL";

export type Ops440ModerationTarget =
  | "POST"
  | "COMMENT"
  | "PROJECT"
  | "MARKET_PRODUCT"
  | "COMMUNITY"
  | "COMMISSION";

export type Ops440Scalar = string | number | boolean;
export type Ops440ScalarMetadata = Readonly<Record<string, Ops440Scalar>>;

export interface Ops440EventMetadata {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly payloadHash: string;
  readonly providerName: string;
  readonly providerEventId: string;
  readonly providerSchemaVersion: string;
}

export interface Ops440AdminProjectionCommand {
  readonly kind: "ADMIN_PROJECTION";
  readonly projectionId: string;
  readonly scopeReference: string;
}

export interface Ops440AnalyticsEventCommand {
  readonly kind: "ANALYTICS_EVENT";
  readonly eventId: string;
  readonly eventName: string;
  readonly surface: Ops440Surface;
  readonly properties?: Ops440ScalarMetadata;
}

export interface Ops440AdIntentCommand {
  readonly kind: "AD_INTENT";
  readonly surface: Ops440Surface;
  readonly slotId: string;
}

export interface Ops440ModerationReferenceCommand {
  readonly kind: "MODERATION_REFERENCE";
  readonly moderationId: string;
  readonly targetType: Ops440ModerationTarget;
  readonly targetReference: string;
  readonly action: Ops440ModerationAction;
  readonly reasonCode: string;
}

export interface Ops440RevenueShadowCommand {
  readonly kind: "REVENUE_SHADOW";
  readonly projectionId: string;
  readonly scopeId: string;
}

export interface Ops440EventIngestCommand {
  readonly kind: "EVENT_INGEST";
  readonly surface: Ops440Surface;
  readonly event: Ops440EventMetadata;
  readonly outcome?: "SUCCESS" | "RETRYABLE_FAILURE" | "POISON";
}

export type Ops440Command =
  | Ops440AdminProjectionCommand
  | Ops440AnalyticsEventCommand
  | Ops440AdIntentCommand
  | Ops440ModerationReferenceCommand
  | Ops440RevenueShadowCommand
  | Ops440EventIngestCommand;

export type Ops440DiagnosticCode =
  | "INVALID_COMMAND"
  | "INVALID_IDENTIFIER"
  | "CALLER_INJECTION_REJECTED"
  | "BOUNDED_METADATA_REQUIRED"
  | "PRIVACY_BOUNDARY_VIOLATION"
  | "AUTHORITY_CONTEXT_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "CANONICAL_IDENTITY_MISMATCH"
  | "STALE_SERVER_DECISION"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "POLICY_UNKNOWN"
  | "OFFLINE_FAIL_CLOSED"
  | "CONSENT_REVOKED"
  | "PROVIDER_UNAVAILABLE"
  | "PRIVATE_SURFACE_NO_AD_INTENT"
  | "EVENT_IDENTITY_INVALID"
  | "EVENT_OUT_OF_ORDER"
  | "EVENT_REPLAY_NO_SIDE_EFFECT"
  | "RETRY_SCHEDULED"
  | "EVENT_DLQ"
  | "REVENUE_SHADOW_ONLY"
  | "CANONICAL_MUTATION_FORBIDDEN";

export interface Ops440Diagnostic {
  readonly code: Ops440DiagnosticCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly path?: string;
}

export interface Ops440AdminProjectionResult {
  readonly kind: "ADMIN_PROJECTION";
  readonly projectionId: string;
  readonly scopeReference: string;
  readonly readOnly: true;
  readonly mutatesCanonicalState: false;
  readonly containsPrivateContent: false;
}

export interface Ops440AnalyticsEventResult {
  readonly kind: "ANALYTICS_EVENT";
  readonly eventId: string;
  readonly eventName: string;
  readonly surface: Ops440Surface;
  readonly properties: Ops440ScalarMetadata;
  readonly privacySafe: true;
}

export interface Ops440AdIntentResult {
  readonly kind: "AD_INTENT";
  readonly surface: Ops440Surface;
  readonly slotId: string;
  readonly intent: "NONE" | "LAZY_PUBLIC_ADAPTER";
  readonly sdkLoad: "NONE" | "DEFERRED_LAZY_ADAPTER";
  readonly providerRequest: "NOT_REQUESTED" | "ON_DEMAND_ONLY";
  readonly layout: "RESERVED" | "NO_SLOT";
  readonly organicRankingMutated: false;
  readonly contributorAllocationMutated: false;
}

export interface Ops440ModerationReferenceResult {
  readonly kind: "MODERATION_REFERENCE";
  readonly moderationId: string;
  readonly targetReference: string;
  readonly action: Ops440ModerationAction;
  readonly reasonCode: string;
  readonly containsEvidenceBody: false;
  readonly automaticCanonicalMutation: false;
}

export interface Ops440RevenueShadowResult {
  readonly kind: "REVENUE_SHADOW";
  readonly projectionId: string;
  readonly scopeId: string;
  readonly currency: string;
  readonly revenueMinorUnits: number;
  readonly costMinorUnits: number;
  readonly netMinorUnits: number;
  readonly shadowOnly: true;
  readonly ledgerMutation: false;
  readonly payoutMutation: false;
  readonly royaltyMutation: false;
  readonly purchaseMutation: false;
  readonly entitlementMutation: false;
  readonly organicRankingMutated: false;
}

export interface Ops440EventIngestResult {
  readonly kind: "EVENT_INGEST";
  readonly eventId: string;
  readonly canonicalEventId: string;
  readonly duplicate: boolean;
  readonly sideEffectCount: 0;
  readonly attemptCount: number;
  readonly deadLetterCount: number;
}

export type Ops440ResultValue =
  | Ops440AdminProjectionResult
  | Ops440AnalyticsEventResult
  | Ops440AdIntentResult
  | Ops440ModerationReferenceResult
  | Ops440RevenueShadowResult
  | Ops440EventIngestResult;

export type Ops440Result =
  | {
    readonly ok: true;
    readonly schemaVersion: typeof OPS440_SCHEMA_VERSION;
    readonly value: Ops440ResultValue;
    readonly diagnostics: readonly Ops440Diagnostic[];
  }
  | {
    readonly ok: false;
    readonly schemaVersion: typeof OPS440_SCHEMA_VERSION;
    readonly diagnostics: readonly Ops440Diagnostic[];
  };
