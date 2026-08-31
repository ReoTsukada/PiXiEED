/**
 * FP-004 projection consumers and side-effect-free replay.
 *
 * This module is deliberately a pure Core boundary.  Consumers receive only
 * canonical event references and return a bounded projection result.  There
 * is no DOM, network, provider, notification, financial, or publication
 * mutation surface here.
 */

import type { ContentHash } from "../wp160-contracts.ts";
import {
  FP004_MAX_DIAGNOSTIC_BYTES,
  FP004_SCHEMA_VERSION,
  type Fp004CanonicalEvent,
  type Fp004ConsumerOutcome,
  type Fp004Diagnostic,
  type Fp004ErrorCode,
  fp004Failure,
  type Fp004Result,
  fp004Success,
  isFp004Hash,
  isFp004SafeIdentifier,
  isValidFp004Aggregate,
} from "./contracts.ts";

export const FP004_CONSUMER_IDS = [
  "FINANCE",
  "NOTIFICATION",
  "SEARCH",
] as const;

export type Fp004ConsumerId = typeof FP004_CONSUMER_IDS[number];

export const FP004_MAX_CONSUMER_ATTEMPTS = 3;
export const FP004_MAX_REPLAY_EVENTS = 10_000;
export const FP004_MAX_REPLAY_DIAGNOSTICS = 8;
const MAX_SAFE_TEXT_BYTES = Math.min(FP004_MAX_DIAGNOSTIC_BYTES, 1_024);
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 60_000;

const KNOWN_ERROR_CODES = new Set<Fp004ErrorCode>([
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

const EVENT_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "eventKind",
  "aggregate",
  "payloadHash",
  "resultHash",
  "causationId",
  "correlationId",
  "producerType",
  "providerIdentity",
  "transactionId",
  "committedAt",
]);

const AGGREGATE_KEYS = new Set([
  "tenantId",
  "aggregateType",
  "aggregateId",
  "aggregateVersion",
  "resourceType",
  "resourceId",
]);

const PROVIDER_IDENTITY_KEYS = new Set([
  "providerName",
  "providerEventId",
  "payloadHash",
  "eventType",
  "providerSchemaVersion",
]);

const REPLAY_KEYS = new Set([
  "replayRunId",
  "consumerId",
  "sourceCursor",
  "sideEffectMode",
]);

export interface Fp004ProjectionContext {
  readonly consumerId: Fp004ConsumerId;
  readonly isReplay: boolean;
  readonly replayRunId?: string;
  readonly sideEffectMode: "NONE";
}

export interface Fp004ProjectionOutput {
  readonly projectionRevision: string;
  readonly projectionHash: ContentHash;
}

export interface Fp004ProjectionAdapter {
  readonly consumerId: Fp004ConsumerId;
  readonly project: (
    event: Fp004CanonicalEvent,
    context: Fp004ProjectionContext,
  ) =>
    | Fp004Result<Fp004ProjectionOutput>
    | Promise<Fp004Result<Fp004ProjectionOutput>>;
}

export interface Fp004ConsumerProcess {
  readonly consumerId: Fp004ConsumerId;
  readonly eventId: string;
  readonly outcome: Fp004ConsumerOutcome;
  readonly attemptCount: number;
  readonly projectionApplied: boolean;
  readonly replay: boolean;
}

export interface Fp004RetryState {
  readonly eventId: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
  readonly lastDiagnostic: Fp004Diagnostic;
}

export interface Fp004DlqState {
  readonly eventId: string;
  readonly attemptCount: number;
  readonly outcome: "NON_RETRYABLE_FAILURE" | "POISON";
  readonly lastDiagnostic: Fp004Diagnostic;
}

export interface Fp004ConsumerStateSnapshot {
  readonly consumerId: Fp004ConsumerId;
  readonly appliedEventIds: readonly string[];
  readonly retry: readonly Fp004RetryState[];
  readonly dlq: readonly Fp004DlqState[];
}

export interface Fp004ReplayReport {
  readonly replayRunId: string;
  readonly consumerId: Fp004ConsumerId;
  readonly requested: number;
  readonly projected: number;
  readonly duplicates: number;
  readonly failed: number;
}

export interface Fp004ProjectionConsumerOptions {
  readonly now?: () => Date;
  readonly maxAttempts?: number;
}

interface AppliedProjection {
  readonly fingerprint: string;
  readonly projectionHash: ContentHash;
}

interface ConsumerState {
  readonly applied: Map<string, AppliedProjection>;
  readonly retry: Map<string, Fp004RetryState>;
  readonly dlq: Map<string, Fp004DlqState>;
}

interface ReplayRunState extends ConsumerState {
  readonly consumerId: Fp004ConsumerId;
  readonly sourceCursor?: string;
}

interface ValidatedReplayRequest {
  readonly replayRunId: string;
  readonly consumerId: Fp004ConsumerId;
  readonly sourceCursor?: string;
  readonly sideEffectMode: "NONE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && isFp004SafeIdentifier(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeMessage(message: string): string {
  const normalized = message.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  return normalized.slice(0, MAX_SAFE_TEXT_BYTES) ||
    "FP-004 consumer diagnostic.";
}

function diagnostic(
  code: Fp004ErrorCode,
  message: string,
  recoverable = false,
  path?: string,
): Fp004Diagnostic {
  return {
    code,
    message: safeMessage(message),
    recoverable,
    ...(path === undefined ? {} : { path }),
  };
}

function failure<T>(
  code: Fp004ErrorCode,
  message: string,
  recoverable = false,
  path?: string,
): Fp004Result<T> {
  return fp004Failure(code, safeMessage(message), recoverable, path);
}

function safeAdapterDiagnostic(
  value: unknown,
  fallbackRecoverable: boolean,
): Fp004Diagnostic {
  if (!isRecord(value)) {
    return diagnostic(
      "CONSUMER_FAILURE",
      "Projection adapter failed.",
      fallbackRecoverable,
      "projection",
    );
  }
  const code = typeof value.code === "string" &&
      KNOWN_ERROR_CODES.has(value.code as Fp004ErrorCode)
    ? value.code as Fp004ErrorCode
    : "CONSUMER_FAILURE";
  const recoverable = typeof value.recoverable === "boolean"
    ? value.recoverable
    : fallbackRecoverable;
  return diagnostic(
    code,
    "Projection adapter rejected the canonical event.",
    recoverable,
    "projection",
  );
}

function boundedDiagnostics(
  diagnostics: readonly Fp004Diagnostic[],
): readonly Fp004Diagnostic[] {
  return diagnostics.slice(0, FP004_MAX_REPLAY_DIAGNOSTICS).map((item) =>
    diagnostic(
      item.code,
      "Projection replay reported a bounded diagnostic.",
      item.recoverable,
      "replay",
    )
  );
}

function validateProviderIdentity(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, PROVIDER_IDENTITY_KEYS)) {
    return false;
  }
  return isSafeIdentifier(value.providerName) &&
    isSafeIdentifier(value.providerEventId) &&
    isFp004Hash(value.payloadHash as string) &&
    isSafeIdentifier(value.eventType) &&
    isSafeIdentifier(value.providerSchemaVersion);
}

function validateCanonicalEvent(value: unknown): value is Fp004CanonicalEvent {
  if (!isRecord(value) || !hasOnlyKeys(value, EVENT_KEYS)) return false;
  if (
    value.schemaVersion !== FP004_SCHEMA_VERSION ||
    !isSafeIdentifier(value.eventId) ||
    !isSafeIdentifier(value.transactionId) ||
    !isSafeIdentifier(value.correlationId) ||
    !isSafeIdentifier(value.producerType) ||
    !isFp004Hash(value.payloadHash as string) ||
    !isFp004Hash(value.resultHash as string) ||
    !isSafeIdentifier(value.committedAt) ||
    !Number.isFinite(Date.parse(value.committedAt))
  ) {
    return false;
  }
  if (
    !isRecord(value.aggregate) ||
    !hasOnlyKeys(value.aggregate, AGGREGATE_KEYS) ||
    !isValidFp004Aggregate(
      value.aggregate as unknown as Fp004CanonicalEvent["aggregate"],
    )
  ) {
    return false;
  }
  if (value.causationId !== undefined && !isSafeIdentifier(value.causationId)) {
    return false;
  }
  if (
    value.providerIdentity !== undefined &&
    !validateProviderIdentity(value.providerIdentity)
  ) return false;
  return ["DOMAIN_FACT", "PROVIDER_CALLBACK", "PROJECTION"].includes(
    value.eventKind as string,
  );
}

function eventFingerprint(event: Fp004CanonicalEvent): string {
  const provider = event.providerIdentity;
  return [
    event.schemaVersion,
    event.eventId,
    event.transactionId,
    event.aggregate.tenantId,
    event.aggregate.aggregateType,
    event.aggregate.aggregateId,
    String(event.aggregate.aggregateVersion),
    event.aggregate.resourceType,
    event.aggregate.resourceId,
    event.payloadHash,
    event.resultHash,
    event.eventKind,
    event.producerType,
    provider === undefined ? "" : provider.providerName,
    provider === undefined ? "" : provider.providerEventId,
    provider === undefined ? "" : provider.payloadHash,
    provider === undefined ? "" : provider.eventType,
    provider === undefined ? "" : provider.providerSchemaVersion,
  ].join("|");
}

function immutableCanonicalEvent(
  event: Fp004CanonicalEvent,
): Fp004CanonicalEvent {
  const aggregate = Object.freeze({ ...event.aggregate });
  const providerIdentity = event.providerIdentity === undefined
    ? undefined
    : Object.freeze({ ...event.providerIdentity });
  return Object.freeze({
    ...event,
    aggregate,
    ...(providerIdentity === undefined ? {} : { providerIdentity }),
  });
}

function validateProjectionOutput(
  value: unknown,
): value is Fp004ProjectionOutput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, new Set(["projectionRevision", "projectionHash"]))
  ) return false;
  return isSafeIdentifier(value.projectionRevision) &&
    isFp004Hash(value.projectionHash as string);
}

function emptyConsumerState(): ConsumerState {
  return { applied: new Map(), retry: new Map(), dlq: new Map() };
}

function isConsumerId(value: unknown): value is Fp004ConsumerId {
  return typeof value === "string" &&
    (FP004_CONSUMER_IDS as readonly string[]).includes(value);
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(
    RETRY_MAX_MS,
    RETRY_BASE_MS * (2 ** Math.max(0, attemptCount - 1)),
  );
}

/**
 * In-memory reference consumer engine.  Its maps are the projection-side
 * durability shape; a future durable adapter may persist the same records.
 * The engine itself never receives or mutates canonical state.
 */
export class Fp004ProjectionConsumerEngine {
  private readonly adapters = new Map<
    Fp004ConsumerId,
    Fp004ProjectionAdapter
  >();
  private readonly consumers = new Map<Fp004ConsumerId, ConsumerState>();
  private readonly replayRuns = new Map<string, ReplayRunState>();
  private readonly now: () => Date;
  private readonly maxAttempts: number;

  constructor(
    adapters: readonly Fp004ProjectionAdapter[],
    options: Fp004ProjectionConsumerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = Number.isSafeInteger(options.maxAttempts) &&
        (options.maxAttempts ?? 0) > 0 &&
        (options.maxAttempts ?? 0) <= FP004_MAX_CONSUMER_ATTEMPTS
      ? options.maxAttempts as number
      : FP004_MAX_CONSUMER_ATTEMPTS;
    for (const adapter of adapters) {
      if (
        !isConsumerId(adapter.consumerId) ||
        this.adapters.has(adapter.consumerId)
      ) {
        throw new Error("FP-004 consumer registry is invalid.");
      }
      this.adapters.set(adapter.consumerId, adapter);
      this.consumers.set(adapter.consumerId, emptyConsumerState());
    }
  }

  async consume(
    event: unknown,
    consumerId: string,
  ): Promise<Fp004Result<Fp004ConsumerProcess>> {
    if (!isConsumerId(consumerId) || !this.adapters.has(consumerId)) {
      return failure(
        "CONSUMER_FAILURE",
        "Unknown FP-004 projection consumer.",
        false,
        "consumerId",
      );
    }
    if (!validateCanonicalEvent(event)) {
      return failure(
        "SCHEMA_UNSUPPORTED",
        "Canonical event schema is unsupported or invalid.",
        false,
        "event",
      );
    }
    const state = this.consumers.get(consumerId);
    if (state === undefined) {
      return failure(
        "CONSUMER_FAILURE",
        "Projection consumer state is unavailable.",
        false,
        "consumer",
      );
    }
    return await this.process(state, event, consumerId, false);
  }

  async replay(
    request: unknown,
    events: readonly unknown[],
  ): Promise<Fp004Result<Fp004ReplayReport>> {
    const requestResult = this.validateReplayRequest(request);
    if (!requestResult.ok) return requestResult;
    if (!Array.isArray(events) || events.length > FP004_MAX_REPLAY_EVENTS) {
      return failure(
        "ENVELOPE_TOO_LARGE",
        "Replay event batch exceeds the bounded limit.",
        false,
        "events",
      );
    }
    const replayRequest = requestResult.value;
    const existing = this.replayRuns.get(replayRequest.replayRunId);
    if (
      existing !== undefined &&
      (existing.consumerId !== replayRequest.consumerId ||
        existing.sourceCursor !== replayRequest.sourceCursor)
    ) {
      return failure(
        "IDEMPOTENCY_CONFLICT",
        "Replay run identity was reused with a different scope.",
        false,
        "replayRunId",
      );
    }
    const run = existing ?? {
      ...emptyConsumerState(),
      consumerId: replayRequest.consumerId,
      ...(replayRequest.sourceCursor === undefined
        ? {}
        : { sourceCursor: replayRequest.sourceCursor }),
    };
    this.replayRuns.set(replayRequest.replayRunId, run);

    let projected = 0;
    let duplicates = 0;
    let failed = 0;
    const diagnostics: Fp004Diagnostic[] = [];
    const startIndex = replayRequest.sourceCursor === undefined
      ? 0
      : events.findIndex((event) =>
        isRecord(event) && event.eventId === replayRequest.sourceCursor
      ) + 1;
    if (replayRequest.sourceCursor !== undefined && startIndex === 0) {
      return failure(
        "NOT_FOUND",
        "Replay source cursor was not found.",
        false,
        "sourceCursor",
      );
    }
    const selectedEvents = events.slice(startIndex);
    for (const event of selectedEvents) {
      const result = await this.process(
        run,
        event,
        replayRequest.consumerId,
        true,
        replayRequest.replayRunId,
      );
      if (result.ok) {
        if (result.value.outcome === "DUPLICATE") duplicates += 1;
        else projected += 1;
      } else {
        failed += 1;
        diagnostics.push(...boundedDiagnostics(result.diagnostics));
      }
    }
    const report: Fp004ReplayReport = {
      replayRunId: replayRequest.replayRunId,
      consumerId: replayRequest.consumerId,
      requested: selectedEvents.length,
      projected,
      duplicates,
      failed,
    };
    if (failed > 0) {
      return fp004Failure(
        diagnostics[0]?.code ?? "CONSUMER_FAILURE",
        "Projection replay did not complete all events.",
        true,
        "replay",
      );
    }
    return fp004Success(report);
  }

  getState(consumerId: string): Fp004Result<Fp004ConsumerStateSnapshot> {
    if (!isConsumerId(consumerId) || !this.consumers.has(consumerId)) {
      return failure(
        "CONSUMER_FAILURE",
        "Unknown FP-004 projection consumer.",
        false,
        "consumerId",
      );
    }
    const state = this.consumers.get(consumerId)!;
    return fp004Success({
      consumerId,
      appliedEventIds: [...state.applied.keys()],
      retry: [...state.retry.values()],
      dlq: [...state.dlq.values()],
    });
  }

  private validateReplayRequest(
    value: unknown,
  ): Fp004Result<ValidatedReplayRequest> {
    if (!isRecord(value) || !hasOnlyKeys(value, REPLAY_KEYS)) {
      return failure(
        "EVENT_INVALID",
        "Replay request shape is invalid.",
        false,
        "replay",
      );
    }
    const replayRunId = value.replayRunId;
    const consumerId = value.consumerId;
    const sourceCursor = value.sourceCursor;
    if (
      !isSafeIdentifier(replayRunId) ||
      !isConsumerId(consumerId) ||
      value.sideEffectMode !== "NONE" ||
      (sourceCursor !== undefined && !isSafeIdentifier(sourceCursor))
    ) {
      if (value.sideEffectMode !== "NONE") {
        return failure(
          "REPLAY_SIDE_EFFECT_FORBIDDEN",
          "Replay requires sideEffectMode NONE.",
          false,
          "sideEffectMode",
        );
      }
      return failure(
        "EVENT_INVALID",
        "Replay request contains an invalid bounded reference.",
        false,
        "replay",
      );
    }
    if (!this.adapters.has(consumerId)) {
      return failure(
        "CONSUMER_FAILURE",
        "Unknown FP-004 projection consumer.",
        false,
        "consumerId",
      );
    }
    return fp004Success({
      replayRunId,
      consumerId,
      sideEffectMode: "NONE",
      ...(sourceCursor === undefined ? {} : { sourceCursor }),
    });
  }

  private async process(
    state: ConsumerState,
    event: Fp004CanonicalEvent,
    consumerId: Fp004ConsumerId,
    replay: boolean,
    replayRunId?: string,
  ): Promise<Fp004Result<Fp004ConsumerProcess>> {
    const fingerprint = eventFingerprint(event);
    const existing = state.applied.get(event.eventId);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "Event identity was reused with a different canonical fingerprint.",
          false,
          "eventId",
        );
      }
      return fp004Success({
        consumerId,
        eventId: event.eventId,
        outcome: "DUPLICATE",
        attemptCount: 0,
        projectionApplied: false,
        replay,
      });
    }
    if (state.dlq.has(event.eventId)) {
      return failure(
        "CONSUMER_FAILURE",
        "Event is quarantined in the consumer DLQ.",
        false,
        "event",
      );
    }

    const previousRetry = state.retry.get(event.eventId);
    const attemptCount = (previousRetry?.attemptCount ?? 0) + 1;
    const adapter = this.adapters.get(consumerId)!;
    const immutableEvent = immutableCanonicalEvent(event);
    const context: Fp004ProjectionContext = Object.freeze({
      consumerId,
      isReplay: replay,
      ...(replayRunId === undefined ? {} : { replayRunId }),
      sideEffectMode: "NONE",
    });
    let adapterResult: unknown;
    try {
      adapterResult = await adapter.project(immutableEvent, context);
    } catch {
      adapterResult = fp004Failure(
        "CONSUMER_FAILURE",
        "Projection adapter failed.",
        true,
        "projection",
      );
    }

    if (
      isRecord(adapterResult) && adapterResult.ok === true &&
      validateProjectionOutput(adapterResult.value)
    ) {
      state.retry.delete(event.eventId);
      state.applied.set(event.eventId, {
        fingerprint,
        projectionHash: adapterResult.value.projectionHash,
      });
      return fp004Success({
        consumerId,
        eventId: event.eventId,
        outcome: previousRetry === undefined ? "SUCCESS" : "SUCCESS",
        attemptCount,
        projectionApplied: true,
        replay,
      });
    }

    if (isRecord(adapterResult) && adapterResult.ok === true) {
      const malformed = diagnostic(
        "MALFORMED_SUCCESS",
        "Projection adapter returned an incomplete success.",
        false,
        "projection",
      );
      state.dlq.set(event.eventId, {
        eventId: event.eventId,
        attemptCount,
        outcome: "NON_RETRYABLE_FAILURE",
        lastDiagnostic: malformed,
      });
      return failure(
        "MALFORMED_SUCCESS",
        "Projection adapter returned an incomplete success.",
        false,
        "projection",
      );
    }

    const adapterDiagnostics =
      isRecord(adapterResult) && Array.isArray(adapterResult.diagnostics)
        ? adapterResult.diagnostics
        : [];
    const firstDiagnostic = safeAdapterDiagnostic(adapterDiagnostics[0], true);
    const retryable = firstDiagnostic.recoverable;
    if (!retryable || attemptCount >= this.maxAttempts) {
      state.retry.delete(event.eventId);
      const outcome = retryable ? "POISON" : "NON_RETRYABLE_FAILURE";
      state.dlq.set(event.eventId, {
        eventId: event.eventId,
        attemptCount,
        outcome,
        lastDiagnostic: firstDiagnostic,
      });
      return failure(
        "CONSUMER_FAILURE",
        "Projection event moved to the bounded DLQ.",
        false,
        "consumer",
      );
    }

    const nextAttemptAt = new Date(
      this.now().getTime() + retryDelayMs(attemptCount),
    ).toISOString();
    state.retry.set(event.eventId, {
      eventId: event.eventId,
      attemptCount,
      nextAttemptAt,
      lastDiagnostic: firstDiagnostic,
    });
    return failure(
      firstDiagnostic.code,
      "Projection consumer will retry with bounded backoff.",
      true,
      "consumer",
    );
  }
}

export function createFp004ProjectionConsumerEngine(
  adapters: readonly Fp004ProjectionAdapter[],
  options: Fp004ProjectionConsumerOptions = {},
): Fp004ProjectionConsumerEngine {
  return new Fp004ProjectionConsumerEngine(adapters, options);
}
