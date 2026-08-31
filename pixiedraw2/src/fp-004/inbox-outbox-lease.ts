/**
 * FP-004 isolated durable-shaped Inbox/Outbox lease adapter.
 *
 * This module deliberately stores references, hashes, and bounded diagnostics
 * only. It has no DOM, network, provider SDK, production database, or product
 * dependency. A caller supplies the persistence boundary so a new process can
 * restore the same snapshot and continue fencing safely.
 */

import type {
  Fp004CanonicalEvent,
  Fp004ConsumerOutcome,
  Fp004Diagnostic,
  Fp004EventId,
  Fp004InboxRecord,
  Fp004Lease,
  Fp004LeaseToken,
  Fp004OutboxRecord,
  Fp004ProviderIdentity,
  Fp004RecordId,
  Fp004Result,
} from "./contracts.ts";
import {
  asFp004LeaseToken,
  asFp004RecordId,
  FP004_MAX_DIAGNOSTIC_BYTES,
  FP004_SCHEMA_VERSION,
  fp004Failure,
  fp004Success,
  hasExpiredLease,
  isFp004Hash,
  isFp004SafeIdentifier,
  isPositiveSafeInteger,
} from "./contracts.ts";

const SNAPSHOT_VERSION = "FP004_LEASE_SNAPSHOT_V1" as const;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 100;
const DEFAULT_MAX_BACKOFF_MS = 10_000;
const MAX_OWNER_BYTES = 256;
const KNOWN_DIAGNOSTIC_CODES = new Set([
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

export type Fp004LeaseKind = "OUTBOX" | "INBOX";

export interface Fp004DeadLetterRecord {
  readonly deadLetterId: Fp004RecordId;
  readonly kind: Fp004LeaseKind;
  readonly recordId: Fp004RecordId;
  readonly eventId?: Fp004EventId;
  readonly providerName?: string;
  readonly providerEventId?: string;
  readonly attemptCount: number;
  readonly diagnostic: Fp004Diagnostic;
  readonly quarantinedAt: string;
}

export interface Fp004LeaseConflictRecord {
  readonly conflictId: Fp004RecordId;
  readonly providerIdentity: Fp004ProviderIdentity;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly canonicalEventId: Fp004EventId;
  readonly diagnostic: Fp004Diagnostic;
  readonly recordedAt: string;
}

/** JSON-safe state that a durable adapter can persist and later restore. */
export interface Fp004LeaseSnapshot {
  readonly snapshotVersion: typeof SNAPSHOT_VERSION;
  readonly outbox: readonly Fp004OutboxRecord[];
  readonly inbox: readonly Fp004InboxRecord[];
  readonly deadLetters: readonly Fp004DeadLetterRecord[];
  readonly conflicts: readonly Fp004LeaseConflictRecord[];
  readonly inboxNextAttemptAt: readonly {
    readonly inboxId: Fp004RecordId;
    readonly nextAttemptAt: string;
  }[];
  readonly outboxResultHashes: readonly {
    readonly outboxId: Fp004RecordId;
    readonly payloadHash: string;
    readonly resultHash: string;
  }[];
  readonly nextFencingSequence: number;
}

export interface Fp004LeasePersistence {
  load(): Fp004LeaseSnapshot | undefined;
  save(snapshot: Fp004LeaseSnapshot): void;
}

/** A deterministic local restart boundary for tests and isolated fixtures. */
export class InMemoryFp004LeasePersistence implements Fp004LeasePersistence {
  #snapshot: Fp004LeaseSnapshot | undefined;

  constructor(snapshot?: Fp004LeaseSnapshot) {
    this.#snapshot = snapshot === undefined ? undefined : clone(snapshot);
  }

  load(): Fp004LeaseSnapshot | undefined {
    return this.#snapshot === undefined ? undefined : clone(this.#snapshot);
  }

  save(snapshot: Fp004LeaseSnapshot): void {
    this.#snapshot = clone(snapshot);
  }
}

export interface Fp004LeasePolicy {
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

interface NormalizedPolicy {
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;
}

export interface Fp004ProviderInboxResolution {
  readonly principalId: string;
  readonly providerIdentity: Fp004ProviderIdentity;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly canonicalEventId: Fp004EventId;
  readonly receivedAt?: string;
}

declare const Fp004ProviderIngressBrand: unique symbol;

/** Opaque capability minted only by the server-composition factory below. */
export interface Fp004ProviderIngress {
  readonly [Fp004ProviderIngressBrand]: true;
}

export interface Fp004ServerProviderIngressBinding {
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resolve: (
    rawProviderPayload: unknown,
  ) => Fp004ProviderInboxResolution;
}

const ingressBindings = new WeakMap<
  object,
  Fp004ServerProviderIngressBinding
>();

/**
 * Server-composition boundary for tests and future provider adapters.
 * The returned capability is identity-checked by a private WeakMap; copied,
 * serialized, proxied, or caller-shaped objects are not accepted.
 */
export function createFp004ServerProviderIngress(
  binding: Fp004ServerProviderIngressBinding,
): Fp004ProviderIngress {
  if (
    !validBoundedText(binding.principalId) ||
    !validBoundedText(binding.tenantId) ||
    !validBoundedText(binding.resourceType) ||
    !validBoundedText(binding.resourceId) ||
    typeof binding.resolve !== "function"
  ) {
    throw new Error("FP-004 server provider ingress binding is invalid.");
  }
  const capability = Object.freeze({});
  ingressBindings.set(capability, Object.freeze({ ...binding }));
  return capability as Fp004ProviderIngress;
}

export interface Fp004InboxAcceptance {
  readonly inbox: Fp004InboxRecord;
  readonly duplicate: boolean;
  /** Acceptance is durable first; transport acknowledgement needs a lease. */
  readonly acknowledgement: "PENDING_LEASE" | "DUPLICATE_PENDING_LEASE";
}

export interface Fp004LeasedOutbox {
  readonly record: Fp004OutboxRecord;
  readonly lease: Fp004Lease;
}

export interface Fp004LeasedInbox {
  readonly record: Fp004InboxRecord;
  readonly lease: Fp004Lease;
  readonly duplicateAcknowledgement: boolean;
}

export interface Fp004OutboxEnqueueResult {
  readonly record: Fp004OutboxRecord;
  readonly duplicate: boolean;
}

export interface Fp004OutboxLeaseSelector {
  readonly outboxId?: Fp004RecordId;
}

export interface Fp004InboxLeaseSelector {
  readonly inboxId?: Fp004RecordId;
  readonly providerName?: string;
  readonly providerEventId?: string;
  /** Only a targeted completed record can be leased for duplicate ack. */
  readonly allowCompletedDuplicate?: boolean;
}

export interface Fp004SuccessDelivery {
  readonly outcome: "SUCCESS";
  readonly resultHash: string;
  readonly sideEffectReference?: string;
}

export interface Fp004DuplicateDelivery {
  readonly outcome: "DUPLICATE";
  readonly resultHash?: string;
}

export interface Fp004FailureDelivery {
  readonly outcome: "RETRYABLE_FAILURE" | "NON_RETRYABLE_FAILURE" | "POISON";
  readonly diagnostic: Fp004Diagnostic;
}

export type Fp004Delivery =
  | Fp004SuccessDelivery
  | Fp004DuplicateDelivery
  | Fp004FailureDelivery;

export interface Fp004CompletionResult {
  readonly record: Fp004OutboxRecord | Fp004InboxRecord;
  readonly outcome: Fp004ConsumerOutcome;
  readonly acknowledged: boolean;
  readonly sideEffectAllowed: false;
  readonly duplicate: boolean;
}

export interface Fp004AdapterOptions {
  readonly policy?: Fp004LeasePolicy;
  readonly now?: () => Date;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function nowIso(value: Date): string {
  if (!validDate(value)) {
    throw new Error("FP-004 clock must provide a valid Date.");
  }
  return value.toISOString();
}

function parseDate(value: string): Date | undefined {
  const parsed = new Date(value);
  return validDate(parsed) ? parsed : undefined;
}

function validBoundedText(value: string): boolean {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_OWNER_BYTES &&
    isFp004SafeIdentifier(value);
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && isFp004SafeIdentifier(value);
}

function diagnostic(
  code: Fp004Diagnostic["code"],
  message: string,
  recoverable: boolean,
  path?: string,
): Fp004Diagnostic {
  const bounded = message.slice(0, FP004_MAX_DIAGNOSTIC_BYTES);
  return {
    code,
    message: bounded,
    recoverable,
    ...(path === undefined ? {} : { path }),
  };
}

function providerKey(
  identity: Pick<Fp004ProviderIdentity, "providerName" | "providerEventId">,
): string {
  return `${identity.providerName}:${identity.providerEventId}`;
}

function outboxKey(record: Fp004OutboxRecord): string {
  return record.outboxId;
}

function sameProviderBinding(
  existing: Fp004InboxRecord,
  input: Fp004ProviderInboxResolution,
): boolean {
  const identity = existing.providerIdentity;
  return identity.providerName === input.providerIdentity.providerName &&
    identity.providerEventId === input.providerIdentity.providerEventId &&
    identity.payloadHash === input.providerIdentity.payloadHash &&
    identity.eventType === input.providerIdentity.eventType &&
    identity.providerSchemaVersion ===
      input.providerIdentity.providerSchemaVersion &&
    existing.tenantId === input.tenantId &&
    existing.resourceType === input.resourceType &&
    existing.resourceId === input.resourceId &&
    existing.canonicalEventId === input.canonicalEventId;
}

function backoffMs(policy: NormalizedPolicy, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const multiplier = Math.min(2 ** exponent, Number.MAX_SAFE_INTEGER);
  return Math.min(policy.maxBackoffMs, policy.baseBackoffMs * multiplier);
}

function withDelay(now: Date, delayMs: number): string {
  return new Date(now.getTime() + delayMs).toISOString();
}

function validDiagnostic(value: unknown): value is Fp004Diagnostic {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Fp004Diagnostic>;
  return typeof candidate.code === "string" &&
    KNOWN_DIAGNOSTIC_CODES.has(candidate.code) &&
    typeof candidate.message === "string" &&
    candidate.message.length > 0 &&
    candidate.message.length <= FP004_MAX_DIAGNOSTIC_BYTES &&
    typeof candidate.recoverable === "boolean" &&
    (candidate.path === undefined || validBoundedText(candidate.path));
}

function validDelivery(value: unknown): value is Fp004Delivery {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Fp004Delivery>;
  if (candidate.outcome === "SUCCESS") {
    return typeof candidate.resultHash === "string" &&
      isFp004Hash(candidate.resultHash) &&
      (candidate.sideEffectReference === undefined ||
        validBoundedText(candidate.sideEffectReference));
  }
  if (candidate.outcome === "DUPLICATE") {
    return candidate.resultHash === undefined ||
      (typeof candidate.resultHash === "string" &&
        isFp004Hash(candidate.resultHash));
  }
  return (candidate.outcome === "RETRYABLE_FAILURE" ||
    candidate.outcome === "NON_RETRYABLE_FAILURE" ||
    candidate.outcome === "POISON") &&
    validDiagnostic(candidate.diagnostic);
}

function validatePolicy(input: Fp004LeasePolicy | undefined): NormalizedPolicy {
  const policy = {
    leaseMs: input?.leaseMs ?? DEFAULT_LEASE_MS,
    maxAttempts: input?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    baseBackoffMs: input?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS,
    maxBackoffMs: input?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
  };
  if (
    !isPositiveSafeInteger(policy.leaseMs) ||
    !isPositiveSafeInteger(policy.maxAttempts) ||
    !Number.isSafeInteger(policy.baseBackoffMs) || policy.baseBackoffMs < 0 ||
    !Number.isSafeInteger(policy.maxBackoffMs) ||
    policy.maxBackoffMs < policy.baseBackoffMs
  ) {
    throw new Error("FP-004 lease policy must be bounded positive integers.");
  }
  return policy;
}

function emptySnapshot(): Fp004LeaseSnapshot {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    outbox: [],
    inbox: [],
    deadLetters: [],
    conflicts: [],
    inboxNextAttemptAt: [],
    outboxResultHashes: [],
    nextFencingSequence: 1,
  };
}

function validateSnapshot(snapshot: Fp004LeaseSnapshot): void {
  if (
    snapshot.snapshotVersion !== SNAPSHOT_VERSION ||
    !Array.isArray(snapshot.outbox) ||
    !Array.isArray(snapshot.inbox) || !Array.isArray(snapshot.deadLetters) ||
    !Array.isArray(snapshot.conflicts) ||
    !Array.isArray(snapshot.inboxNextAttemptAt) ||
    !Array.isArray(snapshot.outboxResultHashes) ||
    !isPositiveSafeInteger(snapshot.nextFencingSequence)
  ) {
    throw new Error("FP-004 restart snapshot is unsupported or malformed.");
  }
  const outboxIds = new Set<string>();
  for (const record of snapshot.outbox) {
    if (outboxIds.has(record.outboxId)) {
      throw new Error("FP-004 restart snapshot has duplicate Outbox IDs.");
    }
    outboxIds.add(record.outboxId);
  }
  const inboxKeys = new Set<string>();
  for (const record of snapshot.inbox) {
    const key = providerKey(record.providerIdentity);
    if (inboxKeys.has(key)) {
      throw new Error(
        "FP-004 restart snapshot has duplicate provider identities.",
      );
    }
    inboxKeys.add(key);
  }
  const scheduledInboxIds = new Set<string>();
  for (const schedule of snapshot.inboxNextAttemptAt) {
    if (
      scheduledInboxIds.has(schedule.inboxId) ||
      parseDate(schedule.nextAttemptAt) === undefined
    ) {
      throw new Error(
        "FP-004 restart snapshot has an invalid Inbox retry schedule.",
      );
    }
    scheduledInboxIds.add(schedule.inboxId);
  }
}

type MutableSnapshot = {
  -readonly [K in keyof Fp004LeaseSnapshot]: Fp004LeaseSnapshot[K] extends
    readonly (infer U)[] ? U[] : Fp004LeaseSnapshot[K];
};

function mutable(snapshot: Fp004LeaseSnapshot): MutableSnapshot {
  return clone(snapshot) as MutableSnapshot;
}

function freezeSnapshot(snapshot: MutableSnapshot): Fp004LeaseSnapshot {
  return clone(snapshot);
}

export class Fp004InboxOutboxLeaseAdapter {
  readonly #persistence: Fp004LeasePersistence;
  readonly #policy: NormalizedPolicy;
  readonly #now: () => Date;
  #state: Fp004LeaseSnapshot;

  constructor(
    persistence: Fp004LeasePersistence,
    options: Fp004AdapterOptions = {},
  ) {
    this.#persistence = persistence;
    this.#policy = validatePolicy(options.policy);
    this.#now = options.now ?? (() => new Date());
    const loaded = persistence.load();
    if (loaded === undefined) {
      this.#state = emptySnapshot();
      persistence.save(this.#state);
    } else {
      validateSnapshot(loaded);
      this.#state = clone(loaded);
    }
  }

  snapshot(): Fp004LeaseSnapshot {
    return clone(this.#state);
  }

  enqueueOutbox(
    event: Fp004CanonicalEvent,
  ): Fp004Result<Fp004OutboxEnqueueResult> {
    const now = this.#clock();
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    const validation = validateCanonicalEvent(event);
    if (validation !== undefined) {
      this.#save(draft);
      return fp004Failure(
        validation.code,
        validation.message,
        false,
        validation.path,
      );
    }
    const existing = draft.outbox.find((record) =>
      record.eventId === event.eventId
    );
    if (existing !== undefined) {
      if (
        existing.aggregate.aggregateVersion !==
          event.aggregate.aggregateVersion ||
        existingEventHashes(draft, existing)?.payloadHash !==
          event.payloadHash ||
        existingEventHashes(draft, existing)?.resultHash !== event.resultHash
      ) {
        this.#save(draft);
        return fp004Failure(
          "IDEMPOTENCY_CONFLICT",
          "Outbox event identity maps to a different event.",
        );
      }
      this.#save(draft);
      return fp004Success({ record: clone(existing), duplicate: true });
    }
    const record: Fp004OutboxRecord = {
      outboxId: asFp004RecordId(`outbox:${event.eventId}`),
      eventId: event.eventId,
      aggregate: clone(event.aggregate),
      state: "PENDING",
      attemptCount: 0,
      nextAttemptAt: nowIso(now),
    };
    draft.outbox.push(record);
    draft.outboxResultHashes.push({
      outboxId: record.outboxId,
      payloadHash: event.payloadHash,
      resultHash: event.resultHash,
    });
    this.#save(draft);
    return fp004Success({ record: clone(record), duplicate: false });
  }

  acceptProviderEvent(
    ingress: unknown,
    rawProviderPayload: unknown,
  ): Fp004Result<Fp004InboxAcceptance> {
    const now = this.#clock();
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    const resolved = resolveProviderIngress(ingress, rawProviderPayload);
    if (!resolved.ok) {
      this.#save(draft);
      return resolved;
    }
    const input = resolved.value;
    const validation = validateInboxResolution(input);
    if (validation !== undefined) {
      this.#save(draft);
      return fp004Failure(
        validation.code,
        validation.message,
        false,
        validation.path,
      );
    }
    const key = providerKey(input.providerIdentity);
    const existing = draft.inbox.find((record) =>
      providerKey(record.providerIdentity) === key
    );
    if (existing !== undefined) {
      if (!sameProviderBinding(existing, input)) {
        const conflict = makeConflict(input, now);
        if (
          !draft.conflicts.some((item) =>
            item.conflictId === conflict.conflictId
          )
        ) draft.conflicts.push(conflict);
        this.#save(draft);
        return fp004Failure(
          "PROVIDER_IDENTITY_CONFLICT",
          "Provider identity was reused with a different binding or payload.",
        );
      }
      this.#save(draft);
      return fp004Success({
        inbox: clone(existing),
        duplicate: true,
        acknowledgement: "DUPLICATE_PENDING_LEASE",
      });
    }
    const inbox: Fp004InboxRecord = {
      inboxId: asFp004RecordId(`inbox:${key}`),
      providerIdentity: clone(input.providerIdentity),
      tenantId: input.tenantId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      state: "ACCEPTED",
      canonicalEventId: input.canonicalEventId,
      attemptCount: 0,
    };
    draft.inbox.push(inbox);
    this.#save(draft);
    return fp004Success({
      inbox: clone(inbox),
      duplicate: false,
      acknowledgement: "PENDING_LEASE",
    });
  }

  leaseOutbox(
    ownerId: string,
    now: Date = this.#clock(),
    selector: Fp004OutboxLeaseSelector = {},
  ): Fp004Result<Fp004LeasedOutbox> {
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    if (!validBoundedText(ownerId) || !validDate(now)) {
      this.#save(draft);
      return fp004Failure(
        "LEASE_DENIED",
        "Outbox lease owner or clock is invalid.",
      );
    }
    const candidate = selector.outboxId === undefined
      ? draft.outbox.find((record) =>
        record.state === "PENDING" && isReady(record.nextAttemptAt, now)
      )
      : draft.outbox.find((record) => record.outboxId === selector.outboxId);
    if (
      candidate === undefined || candidate.state !== "PENDING" ||
      !isReady(candidate.nextAttemptAt, now)
    ) {
      this.#save(draft);
      return fp004Failure(
        "NOT_FOUND",
        "No ready Outbox record is available.",
        true,
      );
    }
    if (candidate.attemptCount >= this.#policy.maxAttempts) {
      moveOutboxToDlq(
        draft,
        candidate,
        now,
        diagnostic("CONSUMER_FAILURE", "Outbox attempt limit reached.", false),
      );
      this.#save(draft);
      return fp004Failure("CONSUMER_FAILURE", "Outbox attempt limit reached.");
    }
    const lease = newLease(
      draft,
      ownerId,
      now,
      candidate.attemptCount + 1,
      this.#policy,
    );
    const updated: Fp004OutboxRecord = {
      ...candidate,
      state: "LEASED",
      attemptCount: candidate.attemptCount + 1,
      nextAttemptAt: nowIso(now),
      lease,
    };
    replaceOutbox(draft, updated);
    this.#save(draft);
    return fp004Success({ record: clone(updated), lease: clone(lease) });
  }

  leaseInbox(
    ownerId: string,
    now: Date = this.#clock(),
    selector: Fp004InboxLeaseSelector = {},
  ): Fp004Result<Fp004LeasedInbox> {
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    if (!validBoundedText(ownerId) || !validDate(now)) {
      this.#save(draft);
      return fp004Failure(
        "LEASE_DENIED",
        "Inbox lease owner or clock is invalid.",
      );
    }
    const candidate = selectInbox(
      draft.inbox,
      draft.inboxNextAttemptAt,
      selector,
      now,
    );
    if (candidate === undefined) {
      this.#save(draft);
      return fp004Failure(
        "NOT_FOUND",
        "No ready Inbox record is available.",
        true,
      );
    }
    if (
      candidate.state !== "COMPLETED" &&
      candidate.attemptCount >= this.#policy.maxAttempts
    ) {
      moveInboxToDlq(
        draft,
        candidate,
        now,
        diagnostic("CONSUMER_FAILURE", "Inbox attempt limit reached.", false),
      );
      this.#save(draft);
      return fp004Failure("CONSUMER_FAILURE", "Inbox attempt limit reached.");
    }
    const lease = newLease(
      draft,
      ownerId,
      now,
      candidate.attemptCount + 1,
      this.#policy,
    );
    const updated: Fp004InboxRecord = {
      ...candidate,
      state: "LEASED",
      attemptCount: candidate.state === "COMPLETED"
        ? candidate.attemptCount
        : candidate.attemptCount + 1,
      lease,
    };
    removeInboxSchedule(draft, candidate.inboxId);
    replaceInbox(draft, updated);
    this.#save(draft);
    return fp004Success({
      record: clone(updated),
      lease: clone(lease),
      duplicateAcknowledgement: candidate.state === "COMPLETED",
    });
  }

  completeOutbox(
    ownerId: string,
    fencingToken: Fp004LeaseToken,
    delivery: unknown,
    now: Date = this.#clock(),
    outboxId?: Fp004RecordId,
  ): Fp004Result<Fp004CompletionResult> {
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    const record = findLeasedOutbox(
      draft.outbox,
      ownerId,
      fencingToken,
      outboxId,
      now,
    );
    if (record === undefined) {
      this.#save(draft);
      return fp004Failure(
        "LEASE_STALE",
        "Outbox completion requires the current unexpired lease.",
        true,
      );
    }
    if (!validDelivery(delivery)) {
      this.#save(draft);
      return fp004Failure(
        "MALFORMED_SUCCESS",
        "Outbox result requires an explicit valid delivery outcome.",
      );
    }
    const typed = delivery;
    const expectedHash = draft.outboxResultHashes.find((item) =>
      item.outboxId === record.outboxId
    )?.resultHash;
    if (
      typed.outcome === "SUCCESS" && expectedHash !== undefined &&
      typed.resultHash !== expectedHash
    ) {
      this.#save(draft);
      return fp004Failure(
        "MALFORMED_SUCCESS",
        "Outbox result hash does not match the canonical event result.",
      );
    }
    const completed = applyOutboxDelivery(
      draft,
      record,
      typed,
      now,
      this.#policy,
    );
    this.#save(draft);
    return fp004Success({
      record: clone(completed.record),
      outcome: completed.outcome,
      acknowledged: completed.acknowledged,
      sideEffectAllowed: false,
      duplicate: typed.outcome === "DUPLICATE",
    });
  }

  acknowledgeInbox(
    ownerId: string,
    fencingToken: Fp004LeaseToken,
    delivery: unknown,
    now: Date = this.#clock(),
    inboxId?: Fp004RecordId,
  ): Fp004Result<Fp004CompletionResult> {
    const draft = mutable(this.#state);
    reclaimExpired(draft, now, this.#policy);
    const record = findLeasedInbox(
      draft.inbox,
      ownerId,
      fencingToken,
      inboxId,
      now,
    );
    if (record === undefined) {
      this.#save(draft);
      return fp004Failure(
        "LEASE_STALE",
        "Inbox acknowledgement requires the current unexpired lease.",
        true,
      );
    }
    if (!validDelivery(delivery)) {
      this.#save(draft);
      return fp004Failure(
        "MALFORMED_SUCCESS",
        "Inbox acknowledgement requires an explicit valid outcome.",
      );
    }
    const typed = delivery;
    const completed = applyInboxDelivery(
      draft,
      record,
      typed,
      now,
      this.#policy,
    );
    this.#save(draft);
    return fp004Success({
      record: clone(completed.record),
      outcome: completed.outcome,
      acknowledged: completed.acknowledged,
      sideEffectAllowed: false,
      duplicate: typed.outcome === "DUPLICATE",
    });
  }

  #clock(): Date {
    const value = this.#now();
    if (!validDate(value)) {
      throw new Error("FP-004 clock must provide a valid Date.");
    }
    return value;
  }

  #save(snapshot: MutableSnapshot): void {
    const frozen = freezeSnapshot(snapshot);
    validateSnapshot(frozen);
    this.#persistence.save(frozen);
    this.#state = frozen;
  }
}

function validateCanonicalEvent(
  event: Fp004CanonicalEvent,
): {
  code: "EVENT_INVALID" | "SCHEMA_UNSUPPORTED";
  message: string;
  path?: string;
} | undefined {
  if (event === null || typeof event !== "object") {
    return {
      code: "EVENT_INVALID",
      message: "Canonical event must be an object.",
    };
  }
  if (event.schemaVersion !== FP004_SCHEMA_VERSION) {
    return {
      code: "SCHEMA_UNSUPPORTED",
      message: "Outbox event schema is unsupported.",
    };
  }
  if (event.aggregate === null || typeof event.aggregate !== "object") {
    return {
      code: "EVENT_INVALID",
      message: "Canonical event aggregate is required.",
    };
  }
  if (
    !safeIdentifier(event.eventId) ||
    !safeIdentifier(event.transactionId) ||
    !safeIdentifier(event.correlationId) ||
    !safeIdentifier(event.producerType) ||
    !isFp004Hash(event.payloadHash) || !isFp004Hash(event.resultHash) ||
    event.committedAt.length === 0 ||
    parseDate(event.committedAt) === undefined ||
    !isPositiveSafeInteger(event.aggregate.aggregateVersion) ||
    !safeIdentifier(event.aggregate.tenantId) ||
    !safeIdentifier(event.aggregate.aggregateType) ||
    !safeIdentifier(event.aggregate.aggregateId) ||
    !safeIdentifier(event.aggregate.resourceType) ||
    !safeIdentifier(event.aggregate.resourceId)
  ) {
    return {
      code: "EVENT_INVALID",
      message:
        "Canonical event is missing a bounded identity, hash, aggregate, or commit time.",
    };
  }
  return undefined;
}

function resolveProviderIngress(
  ingress: unknown,
  rawProviderPayload: unknown,
): Fp004Result<Fp004ProviderInboxResolution> {
  if (
    ingress === null ||
    (typeof ingress !== "object" && typeof ingress !== "function")
  ) {
    return fp004Failure(
      "PROVIDER_IDENTITY_INVALID",
      "Inbox requires an opaque server provider ingress.",
    );
  }
  const binding = ingressBindings.get(ingress);
  if (binding === undefined) {
    return fp004Failure(
      "PROVIDER_IDENTITY_INVALID",
      "Provider ingress capability is not server-issued.",
    );
  }
  let resolved: Fp004ProviderInboxResolution;
  try {
    resolved = binding.resolve(rawProviderPayload);
  } catch (_error) {
    return fp004Failure(
      "PROVIDER_IDENTITY_INVALID",
      "Provider payload verification failed.",
    );
  }
  const validation = validateInboxResolution(resolved);
  if (validation !== undefined) {
    return fp004Failure(
      validation.code,
      validation.message,
      false,
      validation.path,
    );
  }
  if (
    resolved.principalId !== binding.principalId ||
    resolved.tenantId !== binding.tenantId ||
    resolved.resourceType !== binding.resourceType ||
    resolved.resourceId !== binding.resourceId
  ) {
    return fp004Failure(
      "AUTHORIZATION_DENIED",
      "Resolved provider context does not match the server ingress binding.",
    );
  }
  return fp004Success(resolved);
}

function validateInboxResolution(
  input: Fp004ProviderInboxResolution,
): {
  code: "PROVIDER_IDENTITY_INVALID" | "EVENT_INVALID";
  message: string;
  path?: string;
} | undefined {
  if (input === null || typeof input !== "object") {
    return {
      code: "PROVIDER_IDENTITY_INVALID",
      message: "Provider Inbox input must be an object.",
    };
  }
  if (!safeIdentifier(input.principalId)) {
    return {
      code: "PROVIDER_IDENTITY_INVALID",
      message: "Resolved provider principal must be a bounded identifier.",
      path: "principalId",
    };
  }
  const identity = input.providerIdentity;
  if (identity === null || typeof identity !== "object") {
    return {
      code: "PROVIDER_IDENTITY_INVALID",
      message: "Provider identity must be an object.",
    };
  }
  if (
    !safeIdentifier(identity.providerName) ||
    !safeIdentifier(identity.providerEventId) ||
    !isFp004Hash(identity.payloadHash) ||
    !safeIdentifier(identity.eventType) ||
    !safeIdentifier(identity.providerSchemaVersion)
  ) {
    return {
      code: "PROVIDER_IDENTITY_INVALID",
      message:
        "Provider identity is missing a stable bounded name, ID, type, schema, or hash.",
    };
  }
  if (
    !safeIdentifier(input.tenantId) ||
    !safeIdentifier(input.resourceType) ||
    !safeIdentifier(input.resourceId) ||
    !safeIdentifier(input.canonicalEventId)
  ) {
    return {
      code: "EVENT_INVALID",
      message:
        "Inbox tenant, resource, and canonical mapping must be bounded identifiers.",
    };
  }
  if (
    input.receivedAt !== undefined && parseDate(input.receivedAt) === undefined
  ) {
    return {
      code: "EVENT_INVALID",
      message: "Inbox receivedAt must be a valid timestamp.",
      path: "receivedAt",
    };
  }
  return undefined;
}

function makeConflict(
  input: Fp004ProviderInboxResolution,
  now: Date,
): Fp004LeaseConflictRecord {
  const key = providerKey(input.providerIdentity);
  return {
    conflictId: asFp004RecordId(
      `conflict:${key}:${input.providerIdentity.payloadHash.slice(0, 16)}`,
    ),
    providerIdentity: clone(input.providerIdentity),
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    canonicalEventId: input.canonicalEventId,
    diagnostic: diagnostic(
      "PROVIDER_IDENTITY_CONFLICT",
      "Provider identity was reused with a conflicting payload or binding.",
      false,
    ),
    recordedAt: nowIso(now),
  };
}

function existingEventHashes(
  snapshot: MutableSnapshot,
  record: Fp004OutboxRecord,
): { payloadHash: string; resultHash: string } | undefined {
  return snapshot.outboxResultHashes.find((item) =>
    item.outboxId === record.outboxId
  );
}

function isReady(nextAttemptAt: string, now: Date): boolean {
  const next = parseDate(nextAttemptAt);
  return next !== undefined && next.getTime() <= now.getTime();
}

function newLease(
  snapshot: MutableSnapshot,
  ownerId: string,
  now: Date,
  attempt: number,
  policy: NormalizedPolicy,
): Fp004Lease {
  const sequence = snapshot.nextFencingSequence;
  snapshot.nextFencingSequence = sequence + 1;
  const acquiredAt = nowIso(now);
  const expiresAt = new Date(now.getTime() + policy.leaseMs).toISOString();
  return {
    ownerId,
    fencingToken: asFp004LeaseToken(`fence:${sequence}`),
    acquiredAt,
    expiresAt,
    attempt,
  };
}

function reclaimExpired(
  snapshot: MutableSnapshot,
  now: Date,
  policy: NormalizedPolicy,
): void {
  for (const record of snapshot.outbox) {
    if (
      record.state !== "LEASED" || record.lease === undefined ||
      !hasExpiredLease(record.lease, now)
    ) continue;
    if (record.attemptCount >= policy.maxAttempts) {
      moveOutboxToDlq(
        snapshot,
        record,
        now,
        diagnostic(
          "LEASE_STALE",
          "Expired Outbox lease reached the attempt limit.",
          true,
        ),
      );
    } else {
      replaceOutbox(snapshot, {
        ...record,
        state: "PENDING",
        nextAttemptAt: nowIso(now),
        lease: undefined,
      });
    }
  }
  for (const record of snapshot.inbox) {
    if (
      record.state !== "LEASED" || record.lease === undefined ||
      !hasExpiredLease(record.lease, now)
    ) continue;
    if (record.outcome === "SUCCESS" || record.outcome === "DUPLICATE") {
      replaceInbox(snapshot, {
        ...record,
        state: "COMPLETED",
        lease: undefined,
      });
      removeInboxSchedule(snapshot, record.inboxId);
    } else if (record.attemptCount >= policy.maxAttempts) {
      moveInboxToDlq(
        snapshot,
        record,
        now,
        diagnostic(
          "LEASE_STALE",
          "Expired Inbox lease reached the attempt limit.",
          true,
        ),
      );
    } else {
      replaceInbox(snapshot, {
        ...record,
        state: "RETRYABLE",
        lease: undefined,
      });
      setInboxSchedule(snapshot, record.inboxId, nowIso(now));
    }
  }
}

function replaceOutbox(
  snapshot: MutableSnapshot,
  value: Fp004OutboxRecord,
): void {
  const index = snapshot.outbox.findIndex((item) =>
    item.outboxId === value.outboxId
  );
  if (index >= 0) snapshot.outbox[index] = value;
}

function replaceInbox(
  snapshot: MutableSnapshot,
  value: Fp004InboxRecord,
): void {
  const index = snapshot.inbox.findIndex((item) =>
    item.inboxId === value.inboxId
  );
  if (index >= 0) snapshot.inbox[index] = value;
}

function setInboxSchedule(
  snapshot: MutableSnapshot,
  inboxId: Fp004RecordId,
  nextAttemptAt: string,
): void {
  const index = snapshot.inboxNextAttemptAt.findIndex((item) =>
    item.inboxId === inboxId
  );
  const value = { inboxId, nextAttemptAt };
  if (index >= 0) snapshot.inboxNextAttemptAt[index] = value;
  else snapshot.inboxNextAttemptAt.push(value);
}

function removeInboxSchedule(
  snapshot: MutableSnapshot,
  inboxId: Fp004RecordId,
): void {
  const index = snapshot.inboxNextAttemptAt.findIndex((item) =>
    item.inboxId === inboxId
  );
  if (index >= 0) snapshot.inboxNextAttemptAt.splice(index, 1);
}

function selectInbox(
  records: Fp004InboxRecord[],
  schedules: { inboxId: Fp004RecordId; nextAttemptAt: string }[],
  selector: Fp004InboxLeaseSelector,
  now: Date,
): Fp004InboxRecord | undefined {
  const targeted = selector.inboxId !== undefined ||
    selector.providerName !== undefined ||
    selector.providerEventId !== undefined;
  return records.find((record) => {
    const targetMatch = selector.inboxId === undefined ||
      record.inboxId === selector.inboxId;
    const providerMatch = selector.providerName === undefined ||
      record.providerIdentity.providerName === selector.providerName;
    const eventMatch = selector.providerEventId === undefined ||
      record.providerIdentity.providerEventId === selector.providerEventId;
    if (!targetMatch || !providerMatch || !eventMatch) return false;
    if (record.state === "ACCEPTED") return true;
    if (record.state === "RETRYABLE") {
      const schedule = schedules.find((item) =>
        item.inboxId === record.inboxId
      );
      return schedule !== undefined && isReady(schedule.nextAttemptAt, now);
    }
    return targeted && selector.allowCompletedDuplicate === true &&
      record.state === "COMPLETED";
  });
}

function findLeasedOutbox(
  records: Fp004OutboxRecord[],
  ownerId: string,
  token: Fp004LeaseToken,
  outboxId: Fp004RecordId | undefined,
  now: Date,
): Fp004OutboxRecord | undefined {
  return records.find((record) =>
    record.state === "LEASED" &&
    (outboxId === undefined || record.outboxId === outboxId) &&
    record.lease !== undefined && record.lease.ownerId === ownerId &&
    record.lease.fencingToken === token && !hasExpiredLease(record.lease, now)
  );
}

function findLeasedInbox(
  records: Fp004InboxRecord[],
  ownerId: string,
  token: Fp004LeaseToken,
  inboxId: Fp004RecordId | undefined,
  now: Date,
): Fp004InboxRecord | undefined {
  return records.find((record) =>
    record.state === "LEASED" &&
    (inboxId === undefined || record.inboxId === inboxId) &&
    record.lease !== undefined && record.lease.ownerId === ownerId &&
    record.lease.fencingToken === token && !hasExpiredLease(record.lease, now)
  );
}

function applyOutboxDelivery(
  snapshot: MutableSnapshot,
  record: Fp004OutboxRecord,
  delivery: Fp004Delivery,
  now: Date,
  policy: NormalizedPolicy,
): {
  record: Fp004OutboxRecord;
  outcome: Fp004ConsumerOutcome;
  acknowledged: boolean;
} {
  if (delivery.outcome === "SUCCESS" || delivery.outcome === "DUPLICATE") {
    const updated: Fp004OutboxRecord = {
      ...record,
      state: "DISPATCHED",
      lease: undefined,
      lastDiagnostic: undefined,
    };
    replaceOutbox(snapshot, updated);
    return { record: updated, outcome: delivery.outcome, acknowledged: true };
  }
  if (
    delivery.outcome === "RETRYABLE_FAILURE" &&
    record.attemptCount < policy.maxAttempts
  ) {
    const updated: Fp004OutboxRecord = {
      ...record,
      state: "PENDING",
      nextAttemptAt: withDelay(now, backoffMs(policy, record.attemptCount)),
      lease: undefined,
      lastDiagnostic: delivery.diagnostic,
    };
    replaceOutbox(snapshot, updated);
    return { record: updated, outcome: delivery.outcome, acknowledged: false };
  }
  const finalDiagnostic = delivery.outcome === "RETRYABLE_FAILURE"
    ? diagnostic(
      "CONSUMER_FAILURE",
      "Retry limit reached; Outbox moved to DLQ.",
      false,
    )
    : delivery.diagnostic;
  const updated = moveOutboxToDlq(snapshot, record, now, finalDiagnostic);
  return { record: updated, outcome: delivery.outcome, acknowledged: false };
}

function applyInboxDelivery(
  snapshot: MutableSnapshot,
  record: Fp004InboxRecord,
  delivery: Fp004Delivery,
  now: Date,
  policy: NormalizedPolicy,
): {
  record: Fp004InboxRecord;
  outcome: Fp004ConsumerOutcome;
  acknowledged: boolean;
} {
  if (delivery.outcome === "SUCCESS" || delivery.outcome === "DUPLICATE") {
    const updated: Fp004InboxRecord = {
      ...record,
      state: "COMPLETED",
      lease: undefined,
      outcome: delivery.outcome,
      lastDiagnostic: undefined,
    };
    replaceInbox(snapshot, updated);
    removeInboxSchedule(snapshot, record.inboxId);
    return { record: updated, outcome: delivery.outcome, acknowledged: true };
  }
  if (
    delivery.outcome === "RETRYABLE_FAILURE" &&
    record.attemptCount < policy.maxAttempts
  ) {
    const updated = {
      ...record,
      state: "RETRYABLE" as const,
      lease: undefined,
      lastDiagnostic: delivery.diagnostic,
    } satisfies Fp004InboxRecord;
    replaceInbox(snapshot, updated);
    setInboxSchedule(
      snapshot,
      record.inboxId,
      withDelay(now, backoffMs(policy, record.attemptCount)),
    );
    return { record: updated, outcome: delivery.outcome, acknowledged: false };
  }
  const finalDiagnostic = delivery.outcome === "RETRYABLE_FAILURE"
    ? diagnostic(
      "CONSUMER_FAILURE",
      "Retry limit reached; Inbox moved to DLQ.",
      false,
    )
    : delivery.diagnostic;
  const updated = moveInboxToDlq(snapshot, record, now, finalDiagnostic);
  return { record: updated, outcome: delivery.outcome, acknowledged: false };
}

function moveOutboxToDlq(
  snapshot: MutableSnapshot,
  record: Fp004OutboxRecord,
  now: Date,
  failure: Fp004Diagnostic,
): Fp004OutboxRecord {
  const updated: Fp004OutboxRecord = {
    ...record,
    state: "DLQ",
    lease: undefined,
    lastDiagnostic: failure,
  };
  replaceOutbox(snapshot, updated);
  const deadLetter: Fp004DeadLetterRecord = {
    deadLetterId: asFp004RecordId(
      `dlq:outbox:${record.outboxId}:${record.attemptCount}`,
    ),
    kind: "OUTBOX",
    recordId: record.outboxId,
    eventId: record.eventId,
    attemptCount: record.attemptCount,
    diagnostic: failure,
    quarantinedAt: nowIso(now),
  };
  if (
    !snapshot.deadLetters.some((item) =>
      item.deadLetterId === deadLetter.deadLetterId
    )
  ) snapshot.deadLetters.push(deadLetter);
  return updated;
}

function moveInboxToDlq(
  snapshot: MutableSnapshot,
  record: Fp004InboxRecord,
  now: Date,
  failure: Fp004Diagnostic,
): Fp004InboxRecord {
  const updated: Fp004InboxRecord = {
    ...record,
    state: "DLQ",
    lease: undefined,
    lastDiagnostic: failure,
  };
  replaceInbox(snapshot, updated);
  removeInboxSchedule(snapshot, record.inboxId);
  const deadLetter: Fp004DeadLetterRecord = {
    deadLetterId: asFp004RecordId(
      `dlq:inbox:${record.inboxId}:${record.attemptCount}`,
    ),
    kind: "INBOX",
    recordId: record.inboxId,
    providerName: record.providerIdentity.providerName,
    providerEventId: record.providerIdentity.providerEventId,
    attemptCount: record.attemptCount,
    diagnostic: failure,
    quarantinedAt: nowIso(now),
  };
  if (
    !snapshot.deadLetters.some((item) =>
      item.deadLetterId === deadLetter.deadLetterId
    )
  ) snapshot.deadLetters.push(deadLetter);
  return updated;
}
