import type {
  AuthorizationProofV1,
  ContentHash,
} from "../../wp160-contracts.ts";
import type {
  CanonicalTenantMembershipRegistryV1,
  ServerAuthorityRequestContextV1,
} from "../../server/authority-contracts.ts";
import type {
  Fp004CanonicalEvent,
  Fp004CommitRequest,
  Fp004CommitResult,
  Fp004EventDraft,
  Fp004LeaseToken,
  Fp004RecordId,
  Fp004Result,
} from "../../fp-004/contracts.ts";
import type {
  Fp004CompletionResult,
  Fp004Delivery,
  Fp004InboxAcceptance,
  Fp004LeasedOutbox,
  Fp004ProviderInboxResolution,
} from "../../fp-004/inbox-outbox-lease.ts";
import type { StoragePolicyV1 } from "../../fp-005/contracts.ts";
import type {
  CanonicalSchemaRecord,
  SchemaIdentityInput,
  SchemaRegistry,
} from "../../fp-007/schema-registry.ts";

export const CORE100_SCHEMA_VERSION = "CORE-100_V1" as const;
export const CORE100_FLAG = "core-100" as const;
export const CORE100_DEFAULT_FLAGS = Object.freeze({ [CORE100_FLAG]: false });

export const CORE100_OPERATIONS = [
  "COMMIT",
  "INBOX_ACCEPT",
  "OUTBOX_DISPATCH",
  "FINANCE",
  "NOTIFICATION",
  "SEARCH",
] as const;

export type Core100Operation = typeof CORE100_OPERATIONS[number];

export const CORE100_CONSUMER_IDS = [
  "FINANCE",
  "NOTIFICATION",
  "SEARCH",
] as const;

export type Core100ConsumerId = typeof CORE100_CONSUMER_IDS[number];

export type Core100ErrorCode =
  | "FEATURE_DISABLED"
  | "UNKNOWN_FEATURE"
  | "AUTHORITY_DENIED"
  | "CONTEXT_INVALID"
  | "CAPABILITY_UNSUPPORTED"
  | "ADAPTER_UNAVAILABLE"
  | "MALFORMED_SUCCESS"
  | "SCHEMA_UNSUPPORTED"
  | "INPUT_INVALID"
  | "CONSUMER_MISMATCH";

export interface Core100Diagnostic {
  readonly code: Core100ErrorCode;
  readonly message: string;
  readonly path?: string;
}

export type Core100Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Core100Diagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly Core100Diagnostic[] };

export interface Core100ServerContext {
  /** Runtime-branded by the CORE-100 server-only boundary. */
  readonly authorityContext: ServerAuthorityRequestContextV1;
  /** Copied and scope-bound by the same server-only boundary. */
  readonly authorizationProof: AuthorizationProofV1;
}

export interface Core100ServerContextFactoryInput {
  readonly authorityContext: ServerAuthorityRequestContextV1;
  readonly action: string;
  readonly capability: string;
  readonly now?: number;
}

export type Core100CommandEvent = Fp004EventDraft | Fp004CanonicalEvent;

export interface Core100Command {
  readonly schemaVersion: typeof CORE100_SCHEMA_VERSION;
  /** FP-007 identity only; the canonical schema body is resolved server-side. */
  readonly schema: SchemaIdentityInput;
  readonly operation: Core100Operation;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly idempotencyKey: string;
  readonly requestHash: ContentHash;
  readonly event: Core100CommandEvent;
  readonly stateReference: Fp004CommitRequest["stateReference"];
  readonly inbox?: Fp004ProviderInboxResolution;
  readonly outbox?: {
    readonly eventId: Core100CommandEvent["eventId"];
    readonly ownerId: string;
    readonly outboxId?: Fp004RecordId;
    readonly idempotency: Core100IdempotencyOwnership;
  };
  readonly consumerId?: Core100ConsumerId;
}

export interface Core100DurableTransactionAdapter {
  readonly adapterId: string;
  readonly capabilities: readonly Core100Operation[];
  commit(request: Fp004CommitRequest): Promise<Fp004Result<Fp004CommitResult>>;
}

export interface Core100OutboxLeaseRequest {
  readonly eventId: Core100CommandEvent["eventId"];
  readonly ownerId: string;
  readonly idempotency: Core100IdempotencyOwnership;
}

export interface Core100OutboxCompletionRequest {
  readonly outboxId: Fp004RecordId;
  readonly ownerId: string;
  readonly fencingToken: Fp004LeaseToken;
  readonly delivery: Fp004Delivery;
  readonly idempotency: Core100IdempotencyOwnership;
}

export interface Core100OutboxTransportRequest {
  readonly operation: "OUTBOX_DISPATCH";
  readonly eventId: Core100CommandEvent["eventId"];
  readonly resultHash: ContentHash;
  readonly outboxId: Fp004RecordId;
  readonly ownerId: string;
  readonly fencingToken: Fp004LeaseToken;
  readonly idempotency: Core100IdempotencyOwnership;
}

export interface Core100IdempotencyOwnership {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: ContentHash;
}

export interface Core100InboxOutboxAdapter {
  readonly adapterId: string;
  readonly capabilities: readonly Core100Operation[];
  acceptInbox(
    request: Fp004ProviderInboxResolution,
  ): Promise<Fp004Result<Fp004InboxAcceptance>>;
  leaseOutbox(
    request: Core100OutboxLeaseRequest,
  ): Promise<Fp004Result<Fp004LeasedOutbox>>;
  completeOutbox(
    request: Core100OutboxCompletionRequest,
  ): Promise<Fp004Result<Fp004CompletionResult>>;
}

export interface Core100PrivacyStoragePolicyAdapter {
  readonly policy: StoragePolicyV1;
  validate(command: Core100Command): Core100Result<void>;
}

export interface Core100SchemaBuildPolicyAdapter {
  readonly schemaRegistry: SchemaRegistry;
  resolve(input: SchemaIdentityInput): CanonicalSchemaRecord | null;
}

export interface Core100ProviderTransportAdapter {
  readonly providerId: string;
  readonly capabilities: readonly Core100Operation[];
  send(
    request: Core100OutboxTransportRequest,
  ): Promise<Fp004Result<Fp004Delivery>>;
}

export interface Core100ConsumerRequest<C extends Core100ConsumerId> {
  readonly consumerId: C;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly event: Fp004CanonicalEvent;
  readonly idempotency: Core100IdempotencyOwnership;
}

export interface Core100ConsumerResult {
  readonly consumerId: Core100ConsumerId;
  readonly projectionRevision: string;
  readonly projectionHash: ContentHash;
  readonly idempotency: Core100IdempotencyOwnership;
}

export interface Core100FinanceConsumer {
  readonly consumerId: "FINANCE";
  consume(
    request: Core100ConsumerRequest<"FINANCE">,
  ): Promise<Fp004Result<Core100ConsumerResult>>;
}

export interface Core100NotificationConsumer {
  readonly consumerId: "NOTIFICATION";
  consume(
    request: Core100ConsumerRequest<"NOTIFICATION">,
  ): Promise<Fp004Result<Core100ConsumerResult>>;
}

export interface Core100SearchConsumer {
  readonly consumerId: "SEARCH";
  consume(
    request: Core100ConsumerRequest<"SEARCH">,
  ): Promise<Fp004Result<Core100ConsumerResult>>;
}

export type Core100ExecutionResult =
  | Fp004CommitResult
  | Fp004InboxAcceptance
  | Fp004CompletionResult
  | Core100ConsumerResult;

export interface Core100Dependencies {
  readonly durable: Core100DurableTransactionAdapter;
  readonly inboxOutbox: Core100InboxOutboxAdapter;
  readonly membershipRegistry: CanonicalTenantMembershipRegistryV1;
  readonly privacyStorage: Core100PrivacyStoragePolicyAdapter;
  readonly schemaBuild: Core100SchemaBuildPolicyAdapter;
  readonly transport: Core100ProviderTransportAdapter | null;
  readonly finance: Core100FinanceConsumer;
  readonly notification: Core100NotificationConsumer;
  readonly search: Core100SearchConsumer;
}
