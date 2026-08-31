/**
 * FP-004 isolated restartable transaction-shaped reference adapter.
 *
 * This is intentionally not a production durable store. It uses Maps while
 * running, and an explicit serializable snapshot for restart tests. The
 * capability declaration is part of the API so callers cannot mistake this
 * adapter for process- or provider-durable persistence.
 */

import {
  asFp004EventId,
  asFp004LeaseToken,
  asFp004RecordId,
  asFp004TransactionId,
  FP004_SCHEMA_VERSION,
  type Fp004AggregateHead,
  type Fp004AggregateRef,
  type Fp004CanonicalEvent,
  type Fp004CommitRequest,
  type Fp004CommitResult,
  type Fp004ConsumerOutcome,
  type Fp004Diagnostic,
  type Fp004DispatchState,
  type Fp004ErrorCode,
  type Fp004EventDraft,
  fp004Failure,
  type Fp004GapRecord,
  type Fp004IdempotencyRecord,
  type Fp004InboxRecord,
  type Fp004InboxState,
  type Fp004Lease,
  type Fp004OutboxRecord,
  type Fp004ProviderIdentity,
  type Fp004ReplayRequest,
  type Fp004Result,
  fp004Success,
  hasExpiredLease,
  isFp004Hash,
  isFp004SafeIdentifier,
  isValidFp004Aggregate,
} from "./contracts.ts";
import { requireAuthorizationProofV1 } from "../wp160-contracts.ts";

const INITIAL_REVISION = "GENESIS";
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DIAGNOSTIC_LENGTH = 256;
const DEFAULT_MAX_ATTEMPTS = 3;

export type Fp004CrashPoint =
  | "BEFORE_TRANSACTION"
  | "AFTER_STATE_WRITE"
  | "AFTER_EVENT_OUTBOX_WRITE"
  | "AFTER_COMMIT_BEFORE_RESPONSE";

export type Fp004FaultInjector = (point: Fp004CrashPoint) => void;

export interface Fp004AdapterCapability {
  readonly adapterId: "FP004_RESTARTABLE_IN_MEMORY_REFERENCE";
  readonly storage: "MAP_MEMORY_WITH_EXPLICIT_SNAPSHOT";
  readonly restartable: true;
  readonly atomicCommit: true;
  readonly processDurable: false;
  readonly productionDurable: false;
  readonly productionEquivalent: false;
  readonly productionReady: false;
}

export const FP004_REFERENCE_ADAPTER_CAPABILITY: Fp004AdapterCapability = Object
  .freeze({
    adapterId: "FP004_RESTARTABLE_IN_MEMORY_REFERENCE",
    storage: "MAP_MEMORY_WITH_EXPLICIT_SNAPSHOT",
    restartable: true,
    atomicCommit: true,
    processDurable: false,
    productionDurable: false,
    productionEquivalent: false,
    productionReady: false,
  });

export type Fp004AdapterStatus =
  | "IMPLEMENTED_ISOLATED_REFERENCE_ONLY"
  | "UNTESTED_PRODUCTION_EQUIVALENT";

export const FP004_REFERENCE_ADAPTER_STATUS =
  "IMPLEMENTED_ISOLATED_REFERENCE_ONLY" as const satisfies Fp004AdapterStatus;

export interface Fp004StateReferenceRecord {
  readonly schemaVersion: typeof FP004_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: string;
  readonly stateHash: string;
  readonly eventId: Fp004CanonicalEvent["eventId"];
  readonly transactionId: Fp004CanonicalEvent["transactionId"];
}

export interface Fp004ConsumerFailure {
  readonly consumerId: string;
  readonly eventId: Fp004CanonicalEvent["eventId"];
  readonly outcome: Exclude<Fp004ConsumerOutcome, "SUCCESS" | "DUPLICATE">;
  readonly diagnostic: Fp004Diagnostic;
}

export interface Fp004DurableSnapshot {
  readonly schemaVersion: typeof FP004_SCHEMA_VERSION;
  readonly adapterStatus: typeof FP004_REFERENCE_ADAPTER_STATUS;
  readonly states: readonly Fp004StateReferenceRecord[];
  readonly events: readonly Fp004CanonicalEvent[];
  readonly outbox: readonly Fp004OutboxRecord[];
  readonly inbox: readonly Fp004InboxRecord[];
  readonly idempotency: readonly Fp004IdempotencyRecord[];
  readonly aggregateHeads: readonly Fp004AggregateHead[];
  readonly gaps: readonly Fp004GapRecord[];
  readonly consumerFailures: readonly Fp004ConsumerFailure[];
}

export interface Fp004AuthorizationRevalidationInput {
  readonly request: Fp004CommitRequest;
  readonly proof: Fp004CommitRequest["authorizationProof"];
}

export type Fp004AuthorizationRevalidator = (
  input: Fp004AuthorizationRevalidationInput,
) => boolean | Promise<boolean>;

export interface Fp004AdapterOptions {
  readonly clock?: () => Date;
  readonly maxAttempts?: number;
  readonly faultInjector?: Fp004FaultInjector;
  readonly authorizationRevalidator?: Fp004AuthorizationRevalidator;
}

export interface Fp004InboxAcceptanceRequest {
  readonly providerIdentity: Fp004ProviderIdentity;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface Fp004ReplayResult {
  readonly replayRunId: string;
  readonly consumerId: string;
  readonly eventIds: readonly Fp004CanonicalEvent["eventId"][];
  readonly sideEffectMode: "NONE";
  readonly canonicalStateMutated: false;
}

export interface Fp004LeaseRequest {
  readonly id: string;
  readonly ownerId: string;
  readonly now?: Date;
}

export interface Fp004LeaseResult<T> {
  readonly record: T;
  readonly lease: Fp004Lease;
}

export class Fp004CrashError extends Error {
  readonly code = "TRANSACTION_ABORTED" as const;
  readonly crashPoint: Fp004CrashPoint;

  constructor(crashPoint: Fp004CrashPoint) {
    super(`FP-004 injected crash at ${crashPoint}.`);
    this.name = "Fp004CrashError";
    this.crashPoint = crashPoint;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(
  value: unknown,
  max = MAX_IDENTIFIER_LENGTH,
): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    isFp004SafeIdentifier(value);
}

function diagnostic(
  code: Fp004ErrorCode,
  message: string,
  recoverable = false,
): Fp004Diagnostic {
  return {
    code,
    message: message.slice(0, MAX_DIAGNOSTIC_LENGTH),
    recoverable,
  };
}

function failure<T = never>(
  code: Fp004ErrorCode,
  message: string,
  recoverable = false,
): Fp004Result<T> {
  return { ok: false, diagnostics: [diagnostic(code, message, recoverable)] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function bindingKey(
  tenantId: string,
  resourceType: string,
  resourceId: string,
): string {
  return `${tenantId}|${resourceType}|${resourceId}`;
}

function aggregateKey(
  tenantId: string,
  aggregateType: string,
  aggregateId: string,
): string {
  return `${tenantId}|${aggregateType}|${aggregateId}`;
}

function idempotencyKey(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  scope: string,
  key: string,
): string {
  return `${tenantId}|${resourceType}|${resourceId}|${scope}|${key}`;
}

function providerKey(identity: Fp004ProviderIdentity): string {
  return `${identity.providerName}|${identity.providerEventId}`;
}

function inboxId(identity: Fp004ProviderIdentity): Fp004InboxRecord["inboxId"] {
  return asFp004RecordId(
    `inbox:${identity.providerName}:${identity.providerEventId}`.slice(
      0,
      MAX_IDENTIFIER_LENGTH,
    ),
  );
}

function outboxId(eventId: string): Fp004OutboxRecord["outboxId"] {
  return asFp004RecordId(`outbox:${eventId}`.slice(0, MAX_IDENTIFIER_LENGTH));
}

function transactionId(eventId: string): Fp004CanonicalEvent["transactionId"] {
  return asFp004TransactionId(`tx:${eventId}`.slice(0, MAX_IDENTIFIER_LENGTH));
}

function leaseToken(
  kind: "inbox" | "outbox",
  id: string,
  attempt: number,
): Fp004Lease["fencingToken"] {
  return asFp004LeaseToken(
    `fence:${kind}:${attempt}:${id}`.slice(0, MAX_IDENTIFIER_LENGTH),
  );
}

function sameProviderIdentity(
  left: Fp004ProviderIdentity,
  right: Fp004ProviderIdentity,
): boolean {
  return left.providerName === right.providerName &&
    left.providerEventId === right.providerEventId &&
    left.payloadHash === right.payloadHash &&
    left.eventType === right.eventType &&
    left.providerSchemaVersion === right.providerSchemaVersion;
}

function sameAggregateBinding(
  left: Fp004CanonicalEvent,
  right: Fp004CanonicalEvent,
): boolean {
  return left.aggregate.tenantId === right.aggregate.tenantId &&
    left.aggregate.aggregateType === right.aggregate.aggregateType &&
    left.aggregate.aggregateId === right.aggregate.aggregateId &&
    left.aggregate.aggregateVersion === right.aggregate.aggregateVersion &&
    left.aggregate.resourceType === right.aggregate.resourceType &&
    left.aggregate.resourceId === right.aggregate.resourceId;
}

function eventEquivalent(
  left: Fp004CanonicalEvent,
  right: Fp004EventDraft,
): boolean {
  return left.schemaVersion === right.schemaVersion &&
    left.eventId === right.eventId &&
    left.eventKind === right.eventKind &&
    sameAggregateBinding(left, right as Fp004CanonicalEvent) &&
    left.payloadHash === right.payloadHash &&
    left.resultHash === right.resultHash &&
    left.causationId === right.causationId &&
    left.correlationId === right.correlationId &&
    left.producerType === right.producerType &&
    (left.providerIdentity === undefined &&
        right.providerIdentity === undefined ||
      left.providerIdentity !== undefined &&
        right.providerIdentity !== undefined &&
        sameProviderIdentity(left.providerIdentity, right.providerIdentity));
}

function validateProviderIdentity(
  identity: unknown,
): identity is Fp004ProviderIdentity {
  if (!isRecord(identity)) return false;
  return boundedText(identity.providerName) &&
    boundedText(identity.providerEventId) &&
    typeof identity.payloadHash === "string" &&
    isFp004Hash(identity.payloadHash) &&
    boundedText(identity.eventType) &&
    boundedText(identity.providerSchemaVersion);
}

function validateDraft(event: Fp004EventDraft): Fp004Result<true> {
  if (!isRecord(event) || event.schemaVersion !== FP004_SCHEMA_VERSION) {
    return failure(
      "SCHEMA_UNSUPPORTED",
      "Event schema is missing or unsupported.",
    );
  }
  if (
    !boundedText(event.eventId) || !boundedText(event.correlationId) ||
    !boundedText(event.producerType)
  ) {
    return failure(
      "EVENT_INVALID",
      "Event identity and producer references must be bounded.",
    );
  }
  if (
    !isValidFp004Aggregate(event.aggregate) ||
    !isFp004Hash(event.payloadHash) || !isFp004Hash(event.resultHash)
  ) {
    return failure("EVENT_INVALID", "Event aggregate and hashes are invalid.");
  }
  if (
    event.causationId !== undefined &&
    (!boundedText(event.causationId) || event.causationId === event.eventId)
  ) {
    return failure(
      "EVENT_INVALID",
      "Event causation must be bounded and acyclic.",
    );
  }
  if (
    event.eventKind === "PROVIDER_CALLBACK" &&
    !validateProviderIdentity(event.providerIdentity)
  ) {
    return failure(
      "PROVIDER_IDENTITY_INVALID",
      "Provider callbacks require a validated provider identity.",
    );
  }
  if (
    event.providerIdentity !== undefined &&
    !validateProviderIdentity(event.providerIdentity)
  ) {
    return failure(
      "PROVIDER_IDENTITY_INVALID",
      "Provider identity is malformed.",
    );
  }
  return fp004Success(true);
}

function validateCommitShape(request: Fp004CommitRequest): Fp004Result<true> {
  if (
    !isRecord(request) || !isRecord(request.expectedAuthorization) ||
    !isRecord(request.idempotency) || !isRecord(request.stateReference)
  ) {
    return failure("EVENT_INVALID", "Commit request shape is invalid.");
  }
  const auth = request.expectedAuthorization;
  if (
    (auth.principalId !== null && !boundedText(auth.principalId)) ||
    !boundedText(auth.tenantId) || !boundedText(auth.resourceType) ||
    !boundedText(auth.resourceId) || !boundedText(auth.action) ||
    !boundedText(auth.capability)
  ) {
    return failure("AUTHORIZATION_DENIED", "Authorization binding is invalid.");
  }
  const idem = request.idempotency;
  if (
    !boundedText(idem.scope) || !boundedText(idem.key) ||
    !isFp004Hash(idem.requestHash)
  ) {
    return failure(
      "EVENT_INVALID",
      "Idempotency scope, key, or request hash is invalid.",
    );
  }
  const state = request.stateReference;
  if (
    !boundedText(state.resourceType) || !boundedText(state.resourceId) ||
    !boundedText(state.expectedRevision) || !boundedText(state.nextRevision) ||
    !isFp004Hash(state.stateHash) ||
    state.expectedRevision === state.nextRevision
  ) {
    return failure(
      "EVENT_INVALID",
      "State reference is invalid or has no revision change.",
    );
  }
  return validateDraft(request.event);
}

const FP004_ERROR_CODES = new Set<Fp004ErrorCode>([
  "AUTHORIZATION_DENIED",
  "EVENT_INVALID",
  "ENVELOPE_TOO_LARGE",
  "PRIVACY_BOUNDARY_VIOLATION",
  "IDEMPOTENCY_CONFLICT",
  "PROVIDER_IDENTITY_CONFLICT",
  "PROVIDER_IDENTITY_INVALID",
  "AGGREGATE_VERSION_STALE",
  "AGGREGATE_GAP_HELD",
  "AGGREGATE_VERSION_CONFLICT",
  "LEASE_DENIED",
  "LEASE_STALE",
  "REPLAY_SIDE_EFFECT_FORBIDDEN",
  "MALFORMED_SUCCESS",
  "SCHEMA_UNSUPPORTED",
  "TRANSACTION_ABORTED",
  "NOT_FOUND",
  "CONSUMER_FAILURE",
]);

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validNonNegativeAttempt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validAggregate(value: unknown): value is Fp004AggregateRef {
  if (!isRecord(value)) return false;
  try {
    return isValidFp004Aggregate(value as unknown as Fp004AggregateRef);
  } catch {
    return false;
  }
}

function validLease(value: unknown): value is Fp004Lease {
  if (!isRecord(value)) return false;
  return boundedText(value.ownerId) && boundedText(value.fencingToken) &&
    validDate(value.acquiredAt) && validDate(value.expiresAt) &&
    Date.parse(value.expiresAt) > Date.parse(value.acquiredAt) &&
    validPositiveInteger(value.attempt);
}

function validDiagnostic(value: unknown): value is Fp004Diagnostic {
  if (!isRecord(value)) return false;
  return typeof value.code === "string" &&
    FP004_ERROR_CODES.has(value.code as Fp004ErrorCode) &&
    typeof value.message === "string" && value.message.length > 0 &&
    value.message.length <= MAX_DIAGNOSTIC_LENGTH &&
    typeof value.recoverable === "boolean" &&
    (value.path === undefined || boundedText(value.path));
}

function validCanonicalEvent(value: unknown): value is Fp004CanonicalEvent {
  if (!isRecord(value)) return false;
  const draft = validateDraft(value as unknown as Fp004EventDraft);
  return draft.ok && boundedText(value.transactionId) &&
    validDate(value.committedAt);
}

function validState(value: unknown): value is Fp004StateReferenceRecord {
  if (!isRecord(value)) return false;
  return value.schemaVersion === FP004_SCHEMA_VERSION &&
    boundedText(value.tenantId) &&
    boundedText(value.resourceType) && boundedText(value.resourceId) &&
    boundedText(value.revision) && typeof value.stateHash === "string" &&
    isFp004Hash(value.stateHash) &&
    boundedText(value.eventId) && boundedText(value.transactionId);
}

function validOutbox(value: unknown): value is Fp004OutboxRecord {
  if (!isRecord(value)) return false;
  const states: readonly Fp004DispatchState[] = [
    "PENDING",
    "LEASED",
    "DISPATCHED",
    "DLQ",
  ];
  return boundedText(value.outboxId) && boundedText(value.eventId) &&
    validAggregate(value.aggregate) &&
    states.includes(value.state as Fp004DispatchState) &&
    validNonNegativeAttempt(value.attemptCount) &&
    validDate(value.nextAttemptAt) &&
    (value.lease === undefined || validLease(value.lease)) &&
    (value.lastDiagnostic === undefined ||
      validDiagnostic(value.lastDiagnostic));
}

function validInbox(value: unknown): value is Fp004InboxRecord {
  if (!isRecord(value)) return false;
  const states: readonly Fp004InboxState[] = [
    "ACCEPTED",
    "LEASED",
    "COMPLETED",
    "RETRYABLE",
    "DLQ",
    "CONFLICT",
  ];
  const outcomes: readonly Fp004ConsumerOutcome[] = [
    "SUCCESS",
    "DUPLICATE",
    "RETRYABLE_FAILURE",
    "NON_RETRYABLE_FAILURE",
    "POISON",
  ];
  return boundedText(value.inboxId) &&
    validateProviderIdentity(value.providerIdentity) &&
    boundedText(value.tenantId) && boundedText(value.resourceType) &&
    boundedText(value.resourceId) &&
    states.includes(value.state as Fp004InboxState) &&
    validNonNegativeAttempt(value.attemptCount) &&
    (value.canonicalEventId === undefined ||
      boundedText(value.canonicalEventId)) &&
    (value.lease === undefined || validLease(value.lease)) &&
    (value.outcome === undefined ||
      outcomes.includes(value.outcome as Fp004ConsumerOutcome)) &&
    (value.lastDiagnostic === undefined ||
      validDiagnostic(value.lastDiagnostic));
}

function validIdempotency(value: unknown): value is Fp004IdempotencyRecord {
  if (!isRecord(value)) return false;
  return boundedText(value.idempotencyId) && typeof value.scope === "string" &&
    value.scope.length > 0 &&
    boundedText(value.key) && typeof value.requestHash === "string" &&
    isFp004Hash(value.requestHash) &&
    typeof value.resultHash === "string" && isFp004Hash(value.resultHash) &&
    boundedText(value.eventId) && boundedText(value.transactionId);
}

function validAggregateHead(value: unknown): value is Fp004AggregateHead {
  if (!isRecord(value)) return false;
  return boundedText(value.tenantId) && boundedText(value.aggregateType) &&
    boundedText(value.aggregateId) &&
    validPositiveInteger(value.version) && boundedText(value.eventId);
}

function validGap(value: unknown): value is Fp004GapRecord {
  if (!isRecord(value)) return false;
  return boundedText(value.gapId) && validAggregate(value.aggregate) &&
    boundedText(value.heldEventId) &&
    validPositiveInteger(value.expectedVersion) &&
    value.aggregate.aggregateVersion > value.expectedVersion;
}

function validConsumerFailure(value: unknown): value is Fp004ConsumerFailure {
  if (!isRecord(value)) return false;
  const outcomes: readonly Fp004ConsumerFailure["outcome"][] = [
    "RETRYABLE_FAILURE",
    "NON_RETRYABLE_FAILURE",
    "POISON",
  ];
  return boundedText(value.consumerId) && boundedText(value.eventId) &&
    outcomes.includes(value.outcome as Fp004ConsumerFailure["outcome"]) &&
    validDiagnostic(value.diagnostic);
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  const keys = new Set<string>();
  for (const value of values) {
    const current = key(value);
    if (keys.has(current)) return false;
    keys.add(current);
  }
  return true;
}

function validateSnapshot(value: unknown): value is Fp004DurableSnapshot {
  if (
    !isRecord(value) || value.schemaVersion !== FP004_SCHEMA_VERSION ||
    value.adapterStatus !== FP004_REFERENCE_ADAPTER_STATUS
  ) return false;
  if (
    !Array.isArray(value.states) || !Array.isArray(value.events) ||
    !Array.isArray(value.outbox) || !Array.isArray(value.inbox) ||
    !Array.isArray(value.idempotency) || !Array.isArray(value.aggregateHeads) ||
    !Array.isArray(value.gaps) || !Array.isArray(value.consumerFailures)
  ) return false;
  const states = value.states as readonly unknown[];
  const events = value.events as readonly unknown[];
  const outbox = value.outbox as readonly unknown[];
  const inbox = value.inbox as readonly unknown[];
  const idempotency = value.idempotency as readonly unknown[];
  const heads = value.aggregateHeads as readonly unknown[];
  const gaps = value.gaps as readonly unknown[];
  const failures = value.consumerFailures as readonly unknown[];
  if (
    !states.every(validState) || !events.every(validCanonicalEvent) ||
    !outbox.every(validOutbox) ||
    !inbox.every(validInbox) || !idempotency.every(validIdempotency) ||
    !heads.every(validAggregateHead) ||
    !gaps.every(validGap) || !failures.every(validConsumerFailure)
  ) return false;
  const stateRecords = states as readonly Fp004StateReferenceRecord[];
  const eventRecords = events as readonly Fp004CanonicalEvent[];
  const outboxRecords = outbox as readonly Fp004OutboxRecord[];
  const inboxRecords = inbox as readonly Fp004InboxRecord[];
  const idempotencyRecords = idempotency as readonly Fp004IdempotencyRecord[];
  const headRecords = heads as readonly Fp004AggregateHead[];
  const gapRecords = gaps as readonly Fp004GapRecord[];
  if (
    !uniqueBy(
      stateRecords,
      (record) =>
        bindingKey(record.tenantId, record.resourceType, record.resourceId),
    ) ||
    !uniqueBy(eventRecords, (record) => record.eventId) ||
    !uniqueBy(outboxRecords, (record) => record.outboxId) ||
    !uniqueBy(inboxRecords, (record) => record.inboxId) ||
    !uniqueBy(idempotencyRecords, (record) => record.idempotencyId) ||
    !uniqueBy(headRecords, (record) =>
      aggregateKey(
        record.tenantId,
        record.aggregateType,
        record.aggregateId,
      )) ||
    !uniqueBy(gapRecords, (record) => record.gapId)
  ) return false;
  const eventById = new Map(
    eventRecords.map((record) => [record.eventId, record]),
  );
  const stateByBinding = new Map(
    stateRecords.map((
      record,
    ) => [
      bindingKey(record.tenantId, record.resourceType, record.resourceId),
      record,
    ]),
  );
  for (const state of stateRecords) {
    const event = eventById.get(state.eventId);
    if (
      event === undefined || event.transactionId !== state.transactionId ||
      event.resultHash !== state.stateHash ||
      event.aggregate.tenantId !== state.tenantId ||
      event.aggregate.resourceType !== state.resourceType ||
      event.aggregate.resourceId !== state.resourceId
    ) return false;
  }
  for (const record of outboxRecords) {
    const event = eventById.get(record.eventId);
    if (
      event === undefined ||
      JSON.stringify(record.aggregate) !== JSON.stringify(event.aggregate)
    ) return false;
  }
  const idempotencyCompositeKeys = new Set<string>();
  for (const record of idempotencyRecords) {
    const parts = record.scope.split("|");
    if (parts.length !== 4 || parts.some((part) => !boundedText(part))) {
      return false;
    }
    const composite = `${record.scope}|${record.key}`;
    if (idempotencyCompositeKeys.has(composite)) return false;
    idempotencyCompositeKeys.add(composite);
    const event = eventById.get(record.eventId);
    if (
      event === undefined || event.transactionId !== record.transactionId ||
      event.resultHash !== record.resultHash ||
      event.aggregate.tenantId !== parts[0] ||
      event.aggregate.resourceType !== parts[1] ||
      event.aggregate.resourceId !== parts[2]
    ) return false;
  }
  for (const record of inboxRecords) {
    if (record.canonicalEventId !== undefined) {
      const event = eventById.get(record.canonicalEventId);
      if (
        event === undefined || event.providerIdentity === undefined ||
        !sameProviderIdentity(
          event.providerIdentity,
          record.providerIdentity,
        ) ||
        event.aggregate.tenantId !== record.tenantId ||
        event.aggregate.resourceType !== record.resourceType ||
        event.aggregate.resourceId !== record.resourceId
      ) return false;
    }
  }
  for (const head of headRecords) {
    const event = eventById.get(head.eventId);
    if (
      event === undefined || event.aggregate.tenantId !== head.tenantId ||
      event.aggregate.aggregateType !== head.aggregateType ||
      event.aggregate.aggregateId !== head.aggregateId ||
      event.aggregate.aggregateVersion !== head.version
    ) return false;
  }
  for (const gap of gapRecords) {
    const event = eventById.get(gap.heldEventId);
    if (
      event !== undefined &&
      JSON.stringify(event.aggregate) !== JSON.stringify(gap.aggregate)
    ) return false;
  }
  for (const event of eventRecords) {
    const providerIdentity = event.providerIdentity;
    if (providerIdentity !== undefined) {
      const matching = inboxRecords.filter((record) =>
        providerKey(record.providerIdentity) === providerKey(providerIdentity)
      );
      if (
        matching.some((record) =>
          !sameProviderIdentity(record.providerIdentity, providerIdentity)
        )
      ) return false;
    }
  }
  return stateByBinding.size === stateRecords.length;
}

export function validateFp004CommitResult(
  value: unknown,
): Fp004Result<Fp004CommitResult> {
  if (!isRecord(value) || value.ok === true || value.ok === false) {
    return failure(
      "MALFORMED_SUCCESS",
      "A durable result must contain committed transaction records, not a bare status.",
    );
  }
  const result = value as Partial<Fp004CommitResult>;
  if (
    !boundedText(result.transactionId) || !isRecord(result.event) ||
    !isRecord(result.outbox) || !isRecord(result.idempotency) ||
    typeof result.duplicate !== "boolean"
  ) {
    return failure(
      "MALFORMED_SUCCESS",
      "Durable result is missing transaction, Event, Outbox, or idempotency evidence.",
    );
  }
  const event = result.event as Partial<Fp004CanonicalEvent>;
  const outbox = result.outbox as Partial<Fp004OutboxRecord>;
  const idem = result.idempotency as Partial<Fp004IdempotencyRecord>;
  if (
    event.transactionId !== result.transactionId ||
    !boundedText(event.eventId) ||
    !isFp004Hash(event.payloadHash ?? "") ||
    !isFp004Hash(event.resultHash ?? "") ||
    !isRecord(event.aggregate) ||
    !isValidFp004Aggregate(event.aggregate as never) ||
    outbox.eventId !== event.eventId || !boundedText(outbox.outboxId) ||
    !boundedText(idem.idempotencyId) || idem.eventId !== event.eventId ||
    idem.transactionId !== result.transactionId ||
    !isFp004Hash(idem.requestHash ?? "") ||
    !isFp004Hash(idem.resultHash ?? "")
  ) {
    return failure(
      "MALFORMED_SUCCESS",
      "Durable result records are inconsistent.",
    );
  }
  return fp004Success(result as Fp004CommitResult);
}

export const validateDurableCommitResult = validateFp004CommitResult;

export class Fp004RestartableInMemoryAdapter {
  readonly capability = FP004_REFERENCE_ADAPTER_CAPABILITY;
  readonly status = FP004_REFERENCE_ADAPTER_STATUS;

  private readonly states = new Map<string, Fp004StateReferenceRecord>();
  private readonly events = new Map<string, Fp004CanonicalEvent>();
  private readonly outbox = new Map<string, Fp004OutboxRecord>();
  private readonly inbox = new Map<string, Fp004InboxRecord>();
  private readonly idempotency = new Map<string, Fp004IdempotencyRecord>();
  private readonly aggregateHeads = new Map<string, Fp004AggregateHead>();
  private readonly gaps = new Map<string, Fp004GapRecord>();
  private readonly providerEvents = new Map<string, string>();
  private readonly consumerFailures: Fp004ConsumerFailure[] = [];
  private readonly clock: () => Date;
  private readonly maxAttempts: number;
  private readonly faultInjector: Fp004FaultInjector | undefined;
  private readonly authorizationRevalidator:
    | Fp004AuthorizationRevalidator
    | undefined;

  constructor(options?: Fp004AdapterOptions, snapshot?: Fp004DurableSnapshot) {
    this.clock = options?.clock ?? (() => new Date());
    const configuredMaxAttempts = options?.maxAttempts;
    this.maxAttempts = Number.isSafeInteger(configuredMaxAttempts) &&
        (configuredMaxAttempts ?? 0) > 0
      ? configuredMaxAttempts!
      : DEFAULT_MAX_ATTEMPTS;
    this.faultInjector = options?.faultInjector;
    this.authorizationRevalidator = options?.authorizationRevalidator;
    if (snapshot !== undefined) this.restore(snapshot);
  }

  static fromSnapshot(
    snapshot: Fp004DurableSnapshot,
    options: Fp004AdapterOptions = {},
  ): Fp004RestartableInMemoryAdapter {
    return new Fp004RestartableInMemoryAdapter(options, snapshot);
  }

  snapshot(): Fp004DurableSnapshot {
    return Object.freeze({
      schemaVersion: FP004_SCHEMA_VERSION,
      adapterStatus: FP004_REFERENCE_ADAPTER_STATUS,
      states: [...this.states.values()].map(clone),
      events: [...this.events.values()].map(clone),
      outbox: [...this.outbox.values()].map(clone),
      inbox: [...this.inbox.values()].map(clone),
      idempotency: [...this.idempotency.values()].map(clone),
      aggregateHeads: [...this.aggregateHeads.values()].map(clone),
      gaps: [...this.gaps.values()].map(clone),
      consumerFailures: this.consumerFailures.map(clone),
    });
  }

  restore(snapshot: Fp004DurableSnapshot): void {
    if (!validateSnapshot(snapshot)) {
      throw new Error("FP-004 snapshot is invalid or unsupported.");
    }
    this.states.clear();
    this.events.clear();
    this.outbox.clear();
    this.inbox.clear();
    this.idempotency.clear();
    this.aggregateHeads.clear();
    this.gaps.clear();
    this.providerEvents.clear();
    this.consumerFailures.splice(0, this.consumerFailures.length);
    for (const state of snapshot.states) {
      this.states.set(
        bindingKey(state.tenantId, state.resourceType, state.resourceId),
        clone(state),
      );
    }
    for (const event of snapshot.events) {
      this.events.set(event.eventId, clone(event));
      if (event.providerIdentity !== undefined) {
        this.providerEvents.set(
          providerKey(event.providerIdentity),
          event.eventId,
        );
      }
    }
    for (const record of snapshot.outbox) {
      this.outbox.set(record.outboxId, clone(record));
    }
    for (const record of snapshot.inbox) {
      this.inbox.set(record.inboxId, clone(record));
    }
    for (const record of snapshot.idempotency) {
      this.idempotency.set(`${record.scope}|${record.key}`, clone(record));
    }
    for (const head of snapshot.aggregateHeads) {
      this.aggregateHeads.set(
        aggregateKey(head.tenantId, head.aggregateType, head.aggregateId),
        clone(head),
      );
    }
    for (const gap of snapshot.gaps) this.gaps.set(gap.gapId, clone(gap));
    this.consumerFailures.push(...snapshot.consumerFailures.map(clone));
  }

  private inject(point: Fp004CrashPoint, override?: Fp004FaultInjector): void {
    const injector = override ?? this.faultInjector;
    if (injector !== undefined) injector(point);
  }

  private now(): Date {
    const value = this.clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error("FP-004 clock returned an invalid Date.");
    }
    return new Date(value.getTime());
  }

  async commit(
    request: Fp004CommitRequest,
    options: { readonly faultInjector?: Fp004FaultInjector } = {},
  ): Promise<Fp004Result<Fp004CommitResult>> {
    this.inject("BEFORE_TRANSACTION", options.faultInjector);
    const shape = validateCommitShape(request);
    if (!shape.ok) return shape;
    const auth = request.expectedAuthorization;
    const event = request.event;
    if (
      event.aggregate.tenantId !== auth.tenantId ||
      event.aggregate.resourceType !== auth.resourceType ||
      event.aggregate.resourceId !== auth.resourceId ||
      request.stateReference.resourceType !== auth.resourceType ||
      request.stateReference.resourceId !== auth.resourceId
    ) {
      return failure(
        "AUTHORIZATION_DENIED",
        "Event, state, and authorization bindings do not match.",
      );
    }
    try {
      requireAuthorizationProofV1(request.authorizationProof, {
        principalId: auth.principalId,
        tenantId: auth.tenantId,
        resourceType: auth.resourceType,
        resourceId: auth.resourceId,
        action: auth.action,
        capability: auth.capability,
      });
    } catch {
      return failure(
        "AUTHORIZATION_DENIED",
        "Current AuthorizationProofV1 is absent, expired, denied, or mis-bound.",
      );
    }
    if (this.authorizationRevalidator === undefined) {
      return failure(
        "AUTHORIZATION_DENIED",
        "Server authorization revalidation is required before commit.",
      );
    }
    let authorized = false;
    try {
      authorized = await this.authorizationRevalidator({
        request,
        proof: request.authorizationProof,
      });
    } catch {
      authorized = false;
    }
    if (authorized !== true) {
      return failure(
        "AUTHORIZATION_DENIED",
        "Server authorization revalidation failed closed.",
      );
    }

    const scopeKey = idempotencyKey(
      auth.tenantId,
      auth.resourceType,
      auth.resourceId,
      request.idempotency.scope,
      request.idempotency.key,
    );
    const existingIdempotency = this.idempotency.get(scopeKey);
    if (existingIdempotency !== undefined) {
      if (existingIdempotency.requestHash !== request.idempotency.requestHash) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different request hash.",
        );
      }
      const prior = this.resultForEvent(existingIdempotency.eventId);
      return prior === undefined
        ? failure(
          "MALFORMED_SUCCESS",
          "Idempotency record has no canonical result.",
        )
        : fp004Success({ ...prior, duplicate: true });
    }

    const eventWithExistingId = this.events.get(event.eventId);
    if (eventWithExistingId !== undefined) {
      return eventEquivalent(eventWithExistingId, event)
        ? this.resultForEvent(event.eventId) === undefined
          ? failure(
            "MALFORMED_SUCCESS",
            "Event identity has no complete canonical result.",
          )
          : fp004Success({
            ...this.resultForEvent(event.eventId)!,
            duplicate: true,
          })
        : failure(
          "IDEMPOTENCY_CONFLICT",
          "Event identity is already bound to a different canonical fact.",
        );
    }

    if (event.providerIdentity !== undefined) {
      const providerKeyValue = providerKey(event.providerIdentity);
      const providerEventId = this.providerEvents.get(providerKeyValue);
      if (providerEventId !== undefined) {
        const existing = this.events.get(providerEventId);
        return existing !== undefined && eventEquivalent(existing, event)
          ? fp004Success({
            ...this.resultForEvent(providerEventId)!,
            duplicate: true,
          })
          : failure(
            "IDEMPOTENCY_CONFLICT",
            "Provider identity is already bound to a conflicting event.",
          );
      }
      const existingInbox = this.inbox.get(inboxId(event.providerIdentity));
      if (
        existingInbox !== undefined &&
        (existingInbox.providerIdentity.payloadHash !==
            event.providerIdentity.payloadHash ||
          existingInbox.tenantId !== auth.tenantId ||
          existingInbox.resourceType !== auth.resourceType ||
          existingInbox.resourceId !== auth.resourceId)
      ) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "Provider identity conflicts with the accepted Inbox record.",
        );
      }
    }

    const aggregateKeyValue = aggregateKey(
      event.aggregate.tenantId,
      event.aggregate.aggregateType,
      event.aggregate.aggregateId,
    );
    const currentHead = this.aggregateHeads.get(aggregateKeyValue);
    const expectedVersion = (currentHead?.version ?? 0) + 1;
    if (event.aggregate.aggregateVersion < expectedVersion) {
      return failure(
        "AGGREGATE_VERSION_STALE",
        "Aggregate version is stale and cannot roll state backward.",
      );
    }
    if (event.aggregate.aggregateVersion > expectedVersion) {
      const gap = {
        gapId: asFp004RecordId(
          `gap:${event.eventId}`.slice(0, MAX_IDENTIFIER_LENGTH),
        ),
        aggregate: clone(event.aggregate),
        heldEventId: asFp004EventId(event.eventId),
        expectedVersion,
      } satisfies Fp004GapRecord;
      this.gaps.set(gap.gapId, gap);
      return failure(
        "AGGREGATE_GAP_HELD",
        `Aggregate gap held; expected version ${expectedVersion}.`,
        true,
      );
    }
    if (
      currentHead !== undefined &&
      currentHead.version === event.aggregate.aggregateVersion &&
      currentHead.eventId !== event.eventId
    ) {
      return failure(
        "AGGREGATE_VERSION_CONFLICT",
        "Another event already owns this aggregate version.",
      );
    }

    const currentState = this.states.get(
      bindingKey(auth.tenantId, auth.resourceType, auth.resourceId),
    );
    const expectedRevision = currentState?.revision ?? INITIAL_REVISION;
    if (request.stateReference.expectedRevision !== expectedRevision) {
      return failure(
        "AGGREGATE_VERSION_STALE",
        "State revision is stale and cannot be overwritten.",
      );
    }
    if (event.resultHash !== request.stateReference.stateHash) {
      return failure(
        "MALFORMED_SUCCESS",
        "Canonical result hash and committed state hash do not match.",
      );
    }
    if (
      event.causationId !== undefined &&
      this.causationDepth(event.causationId) >= 16
    ) {
      return failure(
        "EVENT_INVALID",
        "Causation depth exceeds the FP-004 bound.",
      );
    }

    const committedAt = this.now().toISOString();
    const committedEvent: Fp004CanonicalEvent = {
      ...clone(event),
      transactionId: transactionId(event.eventId),
      committedAt,
    };
    const nextState: Fp004StateReferenceRecord = {
      schemaVersion: FP004_SCHEMA_VERSION,
      tenantId: auth.tenantId,
      resourceType: auth.resourceType,
      resourceId: auth.resourceId,
      revision: request.stateReference.nextRevision,
      stateHash: request.stateReference.stateHash,
      eventId: committedEvent.eventId,
      transactionId: committedEvent.transactionId,
    };
    const nextOutbox: Fp004OutboxRecord = {
      outboxId: outboxId(event.eventId),
      eventId: committedEvent.eventId,
      aggregate: clone(committedEvent.aggregate),
      state: "PENDING",
      attemptCount: 0,
      nextAttemptAt: committedAt,
    };
    const nextIdempotency: Fp004IdempotencyRecord = {
      idempotencyId: asFp004RecordId(
        `idem:${event.eventId}`.slice(0, MAX_IDENTIFIER_LENGTH),
      ),
      scope:
        `${auth.tenantId}|${auth.resourceType}|${auth.resourceId}|${request.idempotency.scope}`,
      key: request.idempotency.key,
      requestHash: request.idempotency.requestHash,
      resultHash: request.stateReference.stateHash,
      eventId: committedEvent.eventId,
      transactionId: committedEvent.transactionId,
    };
    const nextHead: Fp004AggregateHead = {
      tenantId: committedEvent.aggregate.tenantId,
      aggregateType: committedEvent.aggregate.aggregateType,
      aggregateId: committedEvent.aggregate.aggregateId,
      version: committedEvent.aggregate.aggregateVersion,
      eventId: committedEvent.eventId,
    };
    let nextInbox: Fp004InboxRecord | undefined;
    if (committedEvent.providerIdentity !== undefined) {
      const existing = this.inbox.get(inboxId(committedEvent.providerIdentity));
      nextInbox = {
        inboxId: existing?.inboxId ?? inboxId(committedEvent.providerIdentity),
        providerIdentity: clone(committedEvent.providerIdentity),
        tenantId: auth.tenantId,
        resourceType: auth.resourceType,
        resourceId: auth.resourceId,
        state: existing?.state ?? "ACCEPTED",
        canonicalEventId: committedEvent.eventId,
        attemptCount: existing?.attemptCount ?? 0,
        ...(existing?.lease === undefined
          ? {}
          : { lease: clone(existing.lease) }),
        ...(existing?.outcome === undefined
          ? {}
          : { outcome: existing.outcome }),
        ...(existing?.lastDiagnostic === undefined
          ? {}
          : { lastDiagnostic: clone(existing.lastDiagnostic) }),
      };
    }

    // All writes are staged in local values. Faults before this point cannot
    // expose a partial Map mutation; the next block is the atomic publish.
    this.inject("AFTER_STATE_WRITE", options.faultInjector);
    this.inject("AFTER_EVENT_OUTBOX_WRITE", options.faultInjector);
    this.states.set(
      bindingKey(auth.tenantId, auth.resourceType, auth.resourceId),
      nextState,
    );
    this.events.set(committedEvent.eventId, committedEvent);
    this.outbox.set(nextOutbox.outboxId, nextOutbox);
    this.idempotency.set(scopeKey, nextIdempotency);
    this.aggregateHeads.set(aggregateKeyValue, nextHead);
    if (committedEvent.providerIdentity !== undefined) {
      this.providerEvents.set(
        providerKey(committedEvent.providerIdentity),
        committedEvent.eventId,
      );
      if (nextInbox !== undefined) this.inbox.set(nextInbox.inboxId, nextInbox);
    }
    this.gaps.delete(
      asFp004RecordId(`gap:${event.eventId}`.slice(0, MAX_IDENTIFIER_LENGTH)),
    );
    const result = {
      transactionId: committedEvent.transactionId,
      event: committedEvent,
      outbox: nextOutbox,
      idempotency: nextIdempotency,
      duplicate: false,
    } satisfies Fp004CommitResult;
    this.inject("AFTER_COMMIT_BEFORE_RESPONSE", options.faultInjector);
    return validateFp004CommitResult(result);
  }

  private causationDepth(causationId: string): number {
    let depth = 0;
    let current: string | undefined = causationId;
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current) && depth <= 16) {
      visited.add(current);
      const event = this.events.get(current);
      current = event?.causationId;
      depth += 1;
    }
    return visited.has(current ?? "") ? 16 : depth;
  }

  private resultForEvent(eventId: string): Fp004CommitResult | undefined {
    const event = this.events.get(eventId);
    const outbox = [...this.outbox.values()].find((value) =>
      value.eventId === eventId
    );
    const idempotency = [...this.idempotency.values()].find((value) =>
      value.eventId === eventId
    );
    if (
      event === undefined || outbox === undefined || idempotency === undefined
    ) return undefined;
    return {
      transactionId: event.transactionId,
      event: clone(event),
      outbox: clone(outbox),
      idempotency: clone(idempotency),
      duplicate: false,
    };
  }

  async acceptInbox(
    request: Fp004InboxAcceptanceRequest,
  ): Promise<Fp004Result<Fp004InboxRecord>> {
    if (
      !boundedText(request.tenantId) || !boundedText(request.resourceType) ||
      !boundedText(request.resourceId) ||
      !validateProviderIdentity(request.providerIdentity)
    ) {
      return failure(
        "PROVIDER_IDENTITY_INVALID",
        "Inbox acceptance requires a bounded provider identity and resource binding.",
      );
    }
    const key = providerKey(request.providerIdentity);
    const existing = this.inbox.get(inboxId(request.providerIdentity));
    if (existing !== undefined) {
      if (
        existing.tenantId !== request.tenantId ||
        existing.resourceType !== request.resourceType ||
        existing.resourceId !== request.resourceId ||
        !sameProviderIdentity(
          existing.providerIdentity,
          request.providerIdentity,
        )
      ) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "Provider identity conflicts with the existing Inbox record.",
        );
      }
      return fp004Success(clone(existing));
    }
    if (this.providerEvents.has(key)) {
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "Provider identity is already canonicalized.",
      );
    }
    const record: Fp004InboxRecord = {
      inboxId: inboxId(request.providerIdentity),
      providerIdentity: clone(request.providerIdentity),
      tenantId: request.tenantId,
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      state: "ACCEPTED",
      attemptCount: 0,
    };
    this.inbox.set(record.inboxId, record);
    return fp004Success(clone(record));
  }

  leaseOutbox(
    request: Fp004LeaseRequest,
  ): Fp004Result<Fp004LeaseResult<Fp004OutboxRecord>> {
    const record = this.outbox.get(request.id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Outbox record was not found.");
    }
    if (!boundedText(request.ownerId)) {
      return failure("LEASE_DENIED", "Lease owner is invalid.");
    }
    const now = request.now ?? this.now();
    if (record.state === "DISPATCHED" || record.state === "DLQ") {
      return failure("LEASE_DENIED", "Outbox record is no longer leaseable.");
    }
    if (record.lease !== undefined && !hasExpiredLease(record.lease, now)) {
      return failure(
        "LEASE_DENIED",
        "Outbox lease is owned by another active worker.",
      );
    }
    const attempt = record.attemptCount + 1;
    const lease: Fp004Lease = {
      ownerId: request.ownerId,
      fencingToken: leaseToken("outbox", request.id, attempt),
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30_000).toISOString(),
      attempt,
    };
    const next = {
      ...record,
      state: "LEASED" as const,
      attemptCount: attempt,
      lease,
    };
    this.outbox.set(request.id, next);
    return fp004Success({ record: clone(next), lease: clone(lease) });
  }

  acknowledgeOutbox(
    id: string,
    lease: Fp004Lease,
  ): Fp004Result<Fp004OutboxRecord> {
    const record = this.outbox.get(id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Outbox record was not found.");
    }
    if (!this.leaseMatches(record.lease, lease)) {
      return failure(
        "LEASE_STALE",
        "Only the current unexpired Outbox lease may acknowledge.",
      );
    }
    const { lease: _lease, ...withoutLease } = record;
    const next: Fp004OutboxRecord = { ...withoutLease, state: "DISPATCHED" };
    this.outbox.set(id, next);
    return fp004Success(clone(next));
  }

  failOutbox(
    id: string,
    lease: Fp004Lease,
    outcome: Exclude<Fp004ConsumerOutcome, "SUCCESS" | "DUPLICATE">,
    value: Fp004Diagnostic,
  ): Fp004Result<Fp004OutboxRecord> {
    const record = this.outbox.get(id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Outbox record was not found.");
    }
    if (!this.leaseMatches(record.lease, lease)) {
      return failure(
        "LEASE_STALE",
        "Only the current unexpired Outbox lease may fail or retry.",
      );
    }
    // attemptCount is incremented when a delivery lease is acquired. A
    // failure releases that lease; it must not consume a second attempt.
    const terminal = outcome === "POISON" ||
      outcome === "NON_RETRYABLE_FAILURE" ||
      record.attemptCount >= this.maxAttempts;
    const { lease: _lease, ...withoutLease } = record;
    const next: Fp004OutboxRecord = {
      ...withoutLease,
      state: terminal ? "DLQ" : "PENDING",
      nextAttemptAt: terminal ? record.nextAttemptAt : new Date(
        this.now().getTime() + (2 ** Math.min(record.attemptCount, 8)) * 1000,
      ).toISOString(),
      lastDiagnostic: clone(value),
    };
    this.outbox.set(id, next);
    this.consumerFailures.push({
      consumerId: "outbox",
      eventId: record.eventId,
      outcome,
      diagnostic: clone(value),
    });
    return fp004Success(clone(next));
  }

  leaseInbox(
    request: Fp004LeaseRequest,
  ): Fp004Result<Fp004LeaseResult<Fp004InboxRecord>> {
    const record = this.inbox.get(request.id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Inbox record was not found.");
    }
    if (!boundedText(request.ownerId)) {
      return failure("LEASE_DENIED", "Lease owner is invalid.");
    }
    const now = request.now ?? this.now();
    if (
      record.state === "COMPLETED" || record.state === "DLQ" ||
      record.state === "CONFLICT"
    ) return failure("LEASE_DENIED", "Inbox record is no longer leaseable.");
    if (record.lease !== undefined && !hasExpiredLease(record.lease, now)) {
      return failure(
        "LEASE_DENIED",
        "Inbox lease is owned by another active worker.",
      );
    }
    const attempt = record.attemptCount + 1;
    const lease: Fp004Lease = {
      ownerId: request.ownerId,
      fencingToken: leaseToken("inbox", request.id, attempt),
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30_000).toISOString(),
      attempt,
    };
    const next: Fp004InboxRecord = {
      ...record,
      state: "LEASED",
      lease,
      attemptCount: attempt,
    };
    this.inbox.set(request.id, next);
    return fp004Success({ record: clone(next), lease: clone(lease) });
  }

  acknowledgeInbox(
    id: string,
    lease: Fp004Lease,
    outcome: "SUCCESS" | "DUPLICATE" = "SUCCESS",
  ): Fp004Result<Fp004InboxRecord> {
    const record = this.inbox.get(id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Inbox record was not found.");
    }
    if (!this.leaseMatches(record.lease, lease)) {
      return failure(
        "LEASE_STALE",
        "Only the current unexpired Inbox lease may acknowledge.",
      );
    }
    const { lease: _lease, ...withoutLease } = record;
    const next: Fp004InboxRecord = {
      ...withoutLease,
      state: "COMPLETED",
      outcome,
    };
    this.inbox.set(id, next);
    return fp004Success(clone(next));
  }

  failInbox(
    id: string,
    lease: Fp004Lease,
    outcome: Exclude<Fp004ConsumerOutcome, "SUCCESS" | "DUPLICATE">,
    value: Fp004Diagnostic,
  ): Fp004Result<Fp004InboxRecord> {
    const record = this.inbox.get(id);
    if (record === undefined) {
      return failure("NOT_FOUND", "Inbox record was not found.");
    }
    if (!this.leaseMatches(record.lease, lease)) {
      return failure(
        "LEASE_STALE",
        "Only the current unexpired Inbox lease may fail or retry.",
      );
    }
    const terminal = outcome === "POISON" ||
      outcome === "NON_RETRYABLE_FAILURE" ||
      record.attemptCount >= this.maxAttempts;
    const { lease: _lease, ...withoutLease } = record;
    const next: Fp004InboxRecord = {
      ...withoutLease,
      state: terminal ? "DLQ" : "RETRYABLE",
      outcome,
      ...(value === undefined ? {} : { lastDiagnostic: clone(value) }),
    };
    this.inbox.set(id, next);
    this.consumerFailures.push({
      consumerId: "inbox",
      eventId: record.canonicalEventId ?? asFp004EventId("unknown-event"),
      outcome,
      diagnostic: clone(value),
    });
    return fp004Success(clone(next));
  }

  private leaseMatches(
    current: Fp004Lease | undefined,
    provided: Fp004Lease,
  ): boolean {
    return current !== undefined && provided.ownerId === current.ownerId &&
      provided.fencingToken === current.fencingToken &&
      !hasExpiredLease(current, this.now());
  }

  replay(
    request: Fp004ReplayRequest,
    sourceCursor?: string,
  ): Fp004Result<Fp004ReplayResult> {
    if (
      !boundedText(request.replayRunId) || !boundedText(request.consumerId) ||
      request.sideEffectMode !== "NONE"
    ) {
      return failure(
        "REPLAY_SIDE_EFFECT_FORBIDDEN",
        "Replay requires a bounded consumer and sideEffectMode=NONE.",
      );
    }
    const events = [...this.events.values()]
      .filter((event) =>
        sourceCursor === undefined || event.eventId >= sourceCursor
      )
      .map((event) => event.eventId);
    return fp004Success({
      replayRunId: request.replayRunId,
      consumerId: request.consumerId,
      eventIds: events,
      sideEffectMode: "NONE",
      canonicalStateMutated: false,
    });
  }

  getState(
    tenantId: string,
    resourceType: string,
    resourceId: string,
  ): Fp004StateReferenceRecord | undefined {
    return clone(
      this.states.get(bindingKey(tenantId, resourceType, resourceId)),
    );
  }

  getEvent(eventId: string): Fp004CanonicalEvent | undefined {
    return clone(this.events.get(eventId));
  }

  getInbox(id: string): Fp004InboxRecord | undefined {
    return clone(this.inbox.get(id));
  }

  getOutbox(id: string): Fp004OutboxRecord | undefined {
    return clone(this.outbox.get(id));
  }

  getAggregateHead(
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
  ): Fp004AggregateHead | undefined {
    return clone(
      this.aggregateHeads.get(
        aggregateKey(tenantId, aggregateType, aggregateId),
      ),
    );
  }

  listGaps(): readonly Fp004GapRecord[] {
    return [...this.gaps.values()].map(clone);
  }

  listConsumerFailures(): readonly Fp004ConsumerFailure[] {
    return this.consumerFailures.map(clone);
  }
}

export type Fp004DurableTransactionAdapter = Fp004RestartableInMemoryAdapter;
