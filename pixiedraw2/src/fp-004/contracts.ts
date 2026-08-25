/**
 * FP-004 durable-event contracts.
 *
 * This file is an isolated Core boundary. It carries references and hashes
 * only; it must never carry raw project/media bytes, credentials, or PII.
 */

import type { AuthorizationProofV1, ContentHash } from "../wp160-contracts.ts";

export const FP004_SCHEMA_VERSION = "DURABLE_EVENT_V1" as const;
export const FP004_MAX_ENVELOPE_BYTES = 65_536;
export const FP004_MAX_CAUSATION_DEPTH = 16;
export const FP004_MAX_DIAGNOSTIC_BYTES = 1_024;

export type Fp004RecordId = string & { readonly __brand: "Fp004RecordId" };
export type Fp004EventId = string & { readonly __brand: "Fp004EventId" };
export type Fp004TransactionId = string & {
  readonly __brand: "Fp004TransactionId";
};
export type Fp004LeaseToken = string & { readonly __brand: "Fp004LeaseToken" };

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function asFp004RecordId(value: string): Fp004RecordId {
  if (!SAFE_ID.test(value)) {
    throw new Error("FP-004 record id must be a stable bounded identifier.");
  }
  return value as Fp004RecordId;
}

export function asFp004EventId(value: string): Fp004EventId {
  if (!SAFE_ID.test(value)) {
    throw new Error("FP-004 event id must be a stable bounded identifier.");
  }
  return value as Fp004EventId;
}

export function asFp004TransactionId(value: string): Fp004TransactionId {
  if (!SAFE_ID.test(value)) {
    throw new Error(
      "FP-004 transaction id must be a stable bounded identifier.",
    );
  }
  return value as Fp004TransactionId;
}

export function asFp004LeaseToken(value: string): Fp004LeaseToken {
  if (!SAFE_ID.test(value)) {
    throw new Error("FP-004 lease token must be a stable bounded identifier.");
  }
  return value as Fp004LeaseToken;
}

export type Fp004ErrorCode =
  | "AUTHORIZATION_DENIED"
  | "EVENT_INVALID"
  | "ENVELOPE_TOO_LARGE"
  | "PRIVACY_BOUNDARY_VIOLATION"
  | "IDEMPOTENCY_CONFLICT"
  | "PROVIDER_IDENTITY_CONFLICT"
  | "PROVIDER_IDENTITY_INVALID"
  | "AGGREGATE_VERSION_STALE"
  | "AGGREGATE_GAP_HELD"
  | "AGGREGATE_VERSION_CONFLICT"
  | "LEASE_DENIED"
  | "LEASE_STALE"
  | "REPLAY_SIDE_EFFECT_FORBIDDEN"
  | "MALFORMED_SUCCESS"
  | "SCHEMA_UNSUPPORTED"
  | "TRANSACTION_ABORTED"
  | "NOT_FOUND"
  | "CONSUMER_FAILURE";

export interface Fp004Diagnostic {
  readonly code: Fp004ErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly path?: string;
}

export type Fp004Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Fp004Diagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly Fp004Diagnostic[] };

export function fp004Success<T>(
  value: T,
  diagnostics: readonly Fp004Diagnostic[] = [],
): Fp004Result<T> {
  return { ok: true, value, diagnostics };
}

export function fp004Failure<T = never>(
  code: Fp004ErrorCode,
  message: string,
  recoverable = false,
  path?: string,
): Fp004Result<T> {
  const diagnostic: Fp004Diagnostic = {
    code,
    message,
    recoverable,
    ...(path === undefined ? {} : { path }),
  };
  return { ok: false, diagnostics: [diagnostic] };
}

export type Fp004EventKind = "DOMAIN_FACT" | "PROVIDER_CALLBACK" | "PROJECTION";
export type Fp004DispatchState = "PENDING" | "LEASED" | "DISPATCHED" | "DLQ";
export type Fp004InboxState =
  | "ACCEPTED"
  | "LEASED"
  | "COMPLETED"
  | "RETRYABLE"
  | "DLQ"
  | "CONFLICT";
export type Fp004ConsumerOutcome =
  | "SUCCESS"
  | "DUPLICATE"
  | "RETRYABLE_FAILURE"
  | "NON_RETRYABLE_FAILURE"
  | "POISON";
export type Fp004SideEffectMode = "NONE" | "ALLOW_PROVIDER_EFFECT";

export interface Fp004AggregateRef {
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface Fp004ProviderIdentity {
  readonly providerName: string;
  readonly providerEventId: string;
  readonly payloadHash: ContentHash;
  readonly eventType: string;
  readonly providerSchemaVersion: string;
}

export interface Fp004EventDraft {
  readonly schemaVersion: typeof FP004_SCHEMA_VERSION;
  readonly eventId: Fp004EventId;
  readonly eventKind: Fp004EventKind;
  readonly aggregate: Fp004AggregateRef;
  readonly payloadHash: ContentHash;
  readonly resultHash: ContentHash;
  readonly causationId?: Fp004EventId;
  readonly correlationId: string;
  readonly producerType: string;
  readonly providerIdentity?: Fp004ProviderIdentity;
}

export interface Fp004CanonicalEvent extends Fp004EventDraft {
  readonly transactionId: Fp004TransactionId;
  readonly committedAt: string;
}

export interface Fp004OutboxRecord {
  readonly outboxId: Fp004RecordId;
  readonly eventId: Fp004EventId;
  readonly aggregate: Fp004AggregateRef;
  readonly state: Fp004DispatchState;
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
  readonly lease?: Fp004Lease | undefined;
  readonly lastDiagnostic?: Fp004Diagnostic | undefined;
}

export interface Fp004InboxRecord {
  readonly inboxId: Fp004RecordId;
  readonly providerIdentity: Fp004ProviderIdentity;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly state: Fp004InboxState;
  readonly canonicalEventId?: Fp004EventId;
  readonly attemptCount: number;
  readonly lease?: Fp004Lease | undefined;
  readonly outcome?: Fp004ConsumerOutcome | undefined;
  readonly lastDiagnostic?: Fp004Diagnostic | undefined;
}

export interface Fp004IdempotencyRecord {
  readonly idempotencyId: Fp004RecordId;
  readonly scope: string;
  readonly key: string;
  readonly requestHash: ContentHash;
  readonly resultHash: ContentHash;
  readonly eventId: Fp004EventId;
  readonly transactionId: Fp004TransactionId;
}

export interface Fp004AggregateHead {
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly eventId: Fp004EventId;
}

export interface Fp004GapRecord {
  readonly gapId: Fp004RecordId;
  readonly aggregate: Fp004AggregateRef;
  readonly heldEventId: Fp004EventId;
  readonly expectedVersion: number;
}

export interface Fp004Lease {
  readonly ownerId: string;
  readonly fencingToken: Fp004LeaseToken;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly attempt: number;
}

export interface Fp004ReplayRequest {
  readonly replayRunId: Fp004RecordId;
  readonly consumerId: string;
  readonly sourceCursor?: Fp004EventId;
  readonly sideEffectMode: "NONE";
}

export interface Fp004CommitRequest {
  readonly authorizationProof: AuthorizationProofV1;
  readonly expectedAuthorization: {
    readonly principalId: string | null;
    readonly tenantId: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly action: string;
    readonly capability: string;
  };
  readonly idempotency: {
    readonly scope: string;
    readonly key: string;
    readonly requestHash: ContentHash;
  };
  readonly event: Fp004EventDraft;
  readonly stateReference: {
    readonly resourceType: string;
    readonly resourceId: string;
    readonly expectedRevision: string;
    readonly nextRevision: string;
    readonly stateHash: ContentHash;
  };
}

export interface Fp004CommitResult {
  readonly transactionId: Fp004TransactionId;
  readonly event: Fp004CanonicalEvent;
  readonly outbox: Fp004OutboxRecord;
  readonly idempotency: Fp004IdempotencyRecord;
  readonly duplicate: boolean;
}

export function isFp004SafeIdentifier(value: string): boolean {
  return SAFE_ID.test(value);
}

export function isFp004Hash(value: string): value is ContentHash {
  return SHA256.test(value);
}

export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidFp004Aggregate(ref: Fp004AggregateRef): boolean {
  return isFp004SafeIdentifier(ref.tenantId) &&
    isFp004SafeIdentifier(ref.aggregateType) &&
    isFp004SafeIdentifier(ref.aggregateId) &&
    isFp004SafeIdentifier(ref.resourceType) &&
    isFp004SafeIdentifier(ref.resourceId) &&
    isPositiveSafeInteger(ref.aggregateVersion);
}

export function hasExpiredLease(lease: Fp004Lease, now: Date): boolean {
  const expiresAt = Date.parse(lease.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}
