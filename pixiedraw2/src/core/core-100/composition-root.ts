import { isServerAuthorityRequestContext } from "../../server/internal/authenticated-context.ts";
import {
  isAuthorizationProofV1,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import type { ContentHash } from "../../wp160-contracts.ts";
import {
  type Fp004CanonicalEvent,
  type Fp004CommitRequest,
  type Fp004CommitResult,
  type Fp004EventDraft,
  type Fp004ProviderIdentity,
  type Fp004Result,
  isFp004Hash,
  isFp004SafeIdentifier,
  isValidFp004Aggregate,
} from "../../fp-004/contracts.ts";
import type {
  Fp004CompletionResult,
  Fp004Delivery,
  Fp004InboxAcceptance,
  Fp004LeasedOutbox,
  Fp004ProviderInboxResolution,
} from "../../fp-004/inbox-outbox-lease.ts";
import {
  CORE100_CONSUMER_IDS,
  CORE100_DEFAULT_FLAGS,
  CORE100_FLAG,
  CORE100_OPERATIONS,
  type Core100Command,
  type Core100ConsumerId,
  type Core100ConsumerRequest,
  type Core100ConsumerResult,
  type Core100Dependencies,
  type Core100Diagnostic,
  type Core100ExecutionResult,
  type Core100IdempotencyOwnership,
  type Core100Operation,
  type Core100OutboxLeaseRequest,
  type Core100OutboxTransportRequest,
  type Core100Result,
  type Core100ServerContext,
} from "./contracts.ts";
import { isCore100ServerContext } from "./authority-boundary.ts";

const fail = <T>(
  code: Core100Diagnostic["code"],
  message: string,
  path?: string,
): Core100Result<T> => ({
  ok: false,
  diagnostics: [{ code, message, ...(path === undefined ? {} : { path }) }],
});
const success = <T>(value: T): Core100Result<T> => ({
  ok: true,
  value,
  diagnostics: [],
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && isFp004SafeIdentifier(value);
const isDateText = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const isKnownOperation = (value: unknown): value is Core100Operation =>
  typeof value === "string" &&
  (CORE100_OPERATIONS as readonly string[]).includes(value);

function validProviderIdentity(value: unknown): value is Fp004ProviderIdentity {
  if (!isRecord(value)) return false;
  return isText(value.providerName) && isText(value.providerEventId) &&
    isFp004Hash(value.payloadHash as string) && isText(value.eventType) &&
    isText(value.providerSchemaVersion);
}

function validEvent(
  value: unknown,
  canonical = false,
): value is Fp004EventDraft | Fp004CanonicalEvent {
  if (!isRecord(value) || value.schemaVersion !== "DURABLE_EVENT_V1") {
    return false;
  }
  if (
    !isText(value.eventId) ||
    !["DOMAIN_FACT", "PROVIDER_CALLBACK", "PROJECTION"].includes(
      value.eventKind as string,
    )
  ) return false;
  if (
    !isRecord(value.aggregate) ||
    !isValidFp004Aggregate(value.aggregate as never)
  ) return false;
  if (
    !isFp004Hash(value.payloadHash as string) ||
    !isFp004Hash(value.resultHash as string)
  ) return false;
  if (!isText(value.correlationId) || !isText(value.producerType)) return false;
  if (value.causationId !== undefined && !isText(value.causationId)) {
    return false;
  }
  if (
    value.providerIdentity !== undefined &&
    !validProviderIdentity(value.providerIdentity)
  ) return false;
  if (canonical) {
    if (!isText(value.transactionId) || !isDateText(value.committedAt)) {
      return false;
    }
  }
  return true;
}

function validInboxResolution(
  value: unknown,
): value is Fp004ProviderInboxResolution {
  if (
    !isRecord(value) || !isText(value.principalId) ||
    !isText(value.tenantId) || !isText(value.resourceType) ||
    !isText(value.resourceId) || !isText(value.canonicalEventId) ||
    !validProviderIdentity(value.providerIdentity)
  ) return false;
  return value.receivedAt === undefined || isDateText(value.receivedAt);
}

function validIdempotency(value: unknown): value is {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: ContentHash;
} {
  return isRecord(value) && isText(value.scope) && isText(value.key) &&
    isFp004Hash(value.requestHash as string);
}

function validOutboxRequest(
  value: unknown,
): value is NonNullable<Core100Command["outbox"]> {
  return isRecord(value) && isText(value.eventId) && isText(value.ownerId) &&
    (value.outboxId === undefined || isText(value.outboxId)) &&
    validIdempotency(value.idempotency);
}

function validCommand(command: unknown): command is Core100Command {
  if (
    !isRecord(command) || command.schemaVersion !== "CORE-100_V1" ||
    !isKnownOperation(command.operation)
  ) return false;
  if (
    !isRecord(command.schema) || !isText(command.schema.name) ||
    !isText(command.schema.exactVersion) ||
    !isFp004Hash(command.schema.digest as string)
  ) return false;
  if (
    !isText(command.tenantId) || !isText(command.resourceType) ||
    !isText(command.resourceId) ||
    !isText(command.action) || !isText(command.capability) ||
    !isText(command.idempotencyKey) ||
    !isFp004Hash(command.requestHash as string) || !validEvent(command.event)
  ) return false;
  const state = command.stateReference;
  if (
    !isRecord(state) || state.resourceType !== command.resourceType ||
    state.resourceId !== command.resourceId ||
    !isText(state.expectedRevision) || !isText(state.nextRevision) ||
    !isFp004Hash(state.stateHash as string)
  ) return false;
  const aggregate = command.event.aggregate as unknown as Record<
    string,
    unknown
  >;
  if (
    aggregate.tenantId !== command.tenantId ||
    aggregate.resourceType !== command.resourceType ||
    aggregate.resourceId !== command.resourceId
  ) return false;
  if (command.operation === "INBOX_ACCEPT") {
    if (!validInboxResolution(command.inbox)) return false;
    if (
      command.inbox.tenantId !== command.tenantId ||
      command.inbox.resourceType !== command.resourceType ||
      command.inbox.resourceId !== command.resourceId
    ) return false;
  }
  if (command.operation === "OUTBOX_DISPATCH") {
    if (!validOutboxRequest(command.outbox)) return false;
    if (command.outbox.eventId !== command.event.eventId) return false;
  }
  return true;
}

function validCommitResult(value: unknown): value is Fp004CommitResult {
  if (
    !isRecord(value) || !isText(value.transactionId) ||
    typeof value.duplicate !== "boolean" ||
    !validEvent(value.event, true) || !isRecord(value.outbox) ||
    !isRecord(value.idempotency)
  ) return false;
  const event = value.event as unknown as Record<string, unknown>;
  const outbox = value.outbox as Record<string, unknown>;
  const idempotency = value.idempotency as Record<string, unknown>;
  return isText(outbox.outboxId) && outbox.eventId === event.eventId &&
    isText(idempotency.idempotencyId) &&
    idempotency.eventId === event.eventId &&
    idempotency.transactionId === value.transactionId &&
    isText(idempotency.scope) &&
    isText(idempotency.key) && isFp004Hash(idempotency.requestHash as string) &&
    isFp004Hash(idempotency.resultHash as string);
}

function validInboxAcceptance(value: unknown): value is Fp004InboxAcceptance {
  if (
    !isRecord(value) || typeof value.duplicate !== "boolean" ||
    !["PENDING_LEASE", "DUPLICATE_PENDING_LEASE"].includes(
      value.acknowledgement as string,
    ) ||
    !isRecord(value.inbox)
  ) return false;
  const inbox = value.inbox as Record<string, unknown>;
  return isText(inbox.inboxId) && isText(inbox.tenantId) &&
    isText(inbox.resourceType) &&
    isText(inbox.resourceId) && validProviderIdentity(inbox.providerIdentity) &&
    isText(
      inbox.providerIdentity &&
        (inbox.providerIdentity as unknown as Record<string, unknown>)
          .providerEventId,
    );
}

function validLeasedOutbox(value: unknown): value is Fp004LeasedOutbox {
  if (!isRecord(value) || !isRecord(value.record) || !isRecord(value.lease)) {
    return false;
  }
  const record = value.record as Record<string, unknown>;
  const lease = value.lease as Record<string, unknown>;
  return isText(record.outboxId) && isText(record.eventId) &&
    record.state === "LEASED" &&
    isText(lease.ownerId) && isText(lease.fencingToken) &&
    isDateText(lease.acquiredAt) &&
    isDateText(lease.expiresAt);
}

function validDelivery(value: unknown): value is Fp004Delivery {
  if (
    !isRecord(value) ||
    ![
      "SUCCESS",
      "DUPLICATE",
      "RETRYABLE_FAILURE",
      "NON_RETRYABLE_FAILURE",
      "POISON",
    ].includes(value.outcome as string)
  ) return false;
  if (value.outcome === "SUCCESS") {
    return isFp004Hash(value.resultHash as string);
  }
  if (value.outcome === "DUPLICATE") {
    return value.resultHash === undefined ||
      isFp004Hash(value.resultHash as string);
  }
  return isRecord(value.diagnostic) && isText(value.diagnostic.code) &&
    typeof value.diagnostic.message === "string";
}

function validCompletion(value: unknown): value is Fp004CompletionResult {
  if (
    !isRecord(value) || !isRecord(value.record) || !isText(value.outcome) ||
    typeof value.acknowledged !== "boolean" ||
    value.sideEffectAllowed !== false ||
    typeof value.duplicate !== "boolean"
  ) return false;
  const record = value.record as Record<string, unknown>;
  return isText(record.outboxId) || isText(record.inboxId);
}

function validConsumerResult(
  value: unknown,
  consumerId: Core100ConsumerId,
  idempotency: Core100IdempotencyOwnership,
): value is Core100ConsumerResult {
  if (
    !isRecord(value) || value.consumerId !== consumerId ||
    !isText(value.projectionRevision) ||
    !isFp004Hash(value.projectionHash as string) || !isRecord(value.idempotency)
  ) return false;
  const resultIdempotency = value.idempotency as Record<string, unknown>;
  return resultIdempotency.scope === idempotency.scope &&
    resultIdempotency.key === idempotency.key &&
    resultIdempotency.requestHash === idempotency.requestHash;
}

function snapshotDependencies(input: Core100Dependencies): Core100Dependencies {
  const copyCapabilities = (
    value: { readonly capabilities: readonly Core100Operation[] },
  ) => Object.freeze([...value.capabilities]);
  return Object.freeze({
    durable: Object.freeze({
      ...input.durable,
      capabilities: copyCapabilities(input.durable),
    }),
    inboxOutbox: Object.freeze({
      ...input.inboxOutbox,
      capabilities: copyCapabilities(input.inboxOutbox),
    }),
    membershipRegistry: Object.freeze({ ...input.membershipRegistry }),
    privacyStorage: Object.freeze({ ...input.privacyStorage }),
    schemaBuild: Object.freeze({ ...input.schemaBuild }),
    transport: input.transport === null ? null : Object.freeze({
      ...input.transport,
      capabilities: copyCapabilities(input.transport),
    }),
    finance: Object.freeze({ ...input.finance }),
    notification: Object.freeze({ ...input.notification }),
    search: Object.freeze({ ...input.search }),
  });
}

function adapterFailure<T>(result: Fp004Result<T>): Core100Result<T> {
  try {
    return result.ok ? success(result.value) : fail(
      "ADAPTER_UNAVAILABLE",
      result.diagnostics[0]?.message ?? "Adapter operation failed.",
    );
  } catch {
    return fail("ADAPTER_UNAVAILABLE", "Adapter returned an invalid result.");
  }
}

export interface Core100Root {
  readonly execute: (
    context: Core100ServerContext,
    command: Core100Command,
  ) => Promise<Core100Result<Core100ExecutionResult>>;
  readonly flags: Readonly<Record<typeof CORE100_FLAG, boolean>>;
}

/** The sole CORE-100 composition root. Dependencies are snapshotted at construction. */
export function createCore100Root(
  input: Core100Dependencies,
  flags: Readonly<Record<string, boolean | undefined>> = CORE100_DEFAULT_FLAGS,
): Core100Root {
  if (
    !input || !input.durable || !input.inboxOutbox || !input.privacyStorage ||
    !input.membershipRegistry || !input.schemaBuild ||
    !input.finance || !input.notification || !input.search ||
    !Array.isArray(input.durable.capabilities) ||
    !Array.isArray(input.inboxOutbox.capabilities) ||
    typeof input.membershipRegistry.getCurrent !== "function" ||
    input.finance.consumerId !== "FINANCE" ||
    input.notification.consumerId !== "NOTIFICATION" ||
    input.search.consumerId !== "SEARCH"
  ) throw new TypeError("CORE100_DEPENDENCIES_INVALID");
  const deps = snapshotDependencies(input);
  const unknownFlag = Object.keys(flags).some((key) => key !== CORE100_FLAG);
  const knownFlag = flags[CORE100_FLAG];
  const normalizedFlags = Object.freeze({ [CORE100_FLAG]: knownFlag === true });

  const execute = async (
    context: Core100ServerContext,
    command: Core100Command,
  ): Promise<Core100Result<Core100ExecutionResult>> => {
    if (unknownFlag || knownFlag === undefined) {
      return fail("UNKNOWN_FEATURE", "Unknown CORE-100 flag is disabled.");
    }
    if (normalizedFlags[CORE100_FLAG] !== true) {
      return fail("FEATURE_DISABLED", "CORE-100 is disabled by default.");
    }
    try {
      if (!validCommand(command)) {
        return fail("INPUT_INVALID", "CORE-100 command is invalid.");
      }
    } catch {
      return fail("INPUT_INVALID", "CORE-100 command is invalid.");
    }
    const expected = {
      principalId: context?.authorityContext?.principalId,
      tenantId: command.tenantId,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      action: command.action,
      capability: command.capability,
      correlationId: context?.authorityContext?.correlationId,
    };
    try {
      if (
        !isCore100ServerContext(context, expected) ||
        !isServerAuthorityRequestContext(context.authorityContext) ||
        !isAuthorizationProofV1(context.authorizationProof, expected)
      ) {
        return fail(
          "AUTHORITY_DENIED",
          "CORE-100 server authority context is invalid.",
        );
      }
    } catch {
      return fail(
        "AUTHORITY_DENIED",
        "CORE-100 server authority context is invalid.",
      );
    }
    try {
      requireAuthorizationProofV1(context.authorizationProof, expected);
    } catch {
      return fail(
        "AUTHORITY_DENIED",
        "AuthorizationProofV1 is stale, revoked, or mis-bound.",
      );
    }
    let currentMembership: unknown;
    try {
      currentMembership = await deps.membershipRegistry.getCurrent({
        principalId: context.authorityContext.principalId,
        membershipId: context.authorityContext.membershipId,
        tenantId: context.authorityContext.tenantContext.tenantId,
      });
    } catch {
      return fail(
        "AUTHORITY_DENIED",
        "Canonical membership validation failed.",
      );
    }
    let membershipMatches = false;
    try {
      membershipMatches = isRecord(currentMembership) &&
        currentMembership.status === "ACTIVE" &&
        currentMembership.principalId ===
          context.authorityContext.principalId &&
        currentMembership.membershipId ===
          context.authorityContext.membershipId &&
        currentMembership.tenantId ===
          context.authorityContext.tenantContext.tenantId &&
        currentMembership.membershipRevision ===
          context.authorityContext.membershipRevision;
    } catch {
      membershipMatches = false;
    }
    if (!membershipMatches) {
      return fail(
        "AUTHORITY_DENIED",
        "Canonical membership is revoked, stale, or mis-bound.",
      );
    }
    let schema: unknown;
    try {
      schema = deps.schemaBuild.resolve(command.schema);
    } catch {
      return fail("SCHEMA_UNSUPPORTED", "Canonical schema resolution failed.");
    }
    if (schema === null || schema === undefined) {
      return fail(
        "SCHEMA_UNSUPPORTED",
        "Canonical schema identity is not registered.",
      );
    }
    let policy: Core100Result<void>;
    try {
      policy = deps.privacyStorage.validate(command);
    } catch {
      return fail(
        "ADAPTER_UNAVAILABLE",
        "Privacy/storage policy adapter threw.",
      );
    }
    if (!policy.ok) return policy;
    if (command.operation === "COMMIT") {
      if (
        !deps.durable.capabilities.includes("COMMIT") ||
        !deps.inboxOutbox.capabilities.includes("COMMIT")
      ) {
        return fail(
          "ADAPTER_UNAVAILABLE",
          "Required durable capabilities are unavailable.",
        );
      }
      const request: Fp004CommitRequest = {
        authorizationProof: context.authorizationProof,
        expectedAuthorization: {
          principalId: context.authorityContext.principalId,
          tenantId: command.tenantId,
          resourceType: command.resourceType,
          resourceId: command.resourceId,
          action: command.action,
          capability: command.capability,
        },
        idempotency: {
          scope: "CORE-100",
          key: command.idempotencyKey,
          requestHash: command.requestHash,
        },
        event: command.event as Fp004EventDraft,
        stateReference: command.stateReference,
      };
      let result: Fp004Result<Fp004CommitResult>;
      try {
        result = await deps.durable.commit(request);
      } catch {
        return fail(
          "ADAPTER_UNAVAILABLE",
          "Durable adapter threw during commit.",
        );
      }
      if (!result.ok) return adapterFailure(result);
      let validResult = false;
      try {
        validResult = validCommitResult(result.value);
      } catch {
        validResult = false;
      }
      if (!validResult) {
        return fail(
          "MALFORMED_SUCCESS",
          "Commit adapter returned malformed success.",
        );
      }
      return success(result.value);
    }
    if (command.operation === "INBOX_ACCEPT") {
      if (
        !deps.inboxOutbox.capabilities.includes("INBOX_ACCEPT") ||
        command.inbox === undefined
      ) {
        return fail(
          "ADAPTER_UNAVAILABLE",
          "Inbox acceptance capability or input is unavailable.",
        );
      }
      let result: Fp004Result<Fp004InboxAcceptance>;
      try {
        result = await deps.inboxOutbox.acceptInbox(command.inbox);
      } catch {
        return fail(
          "ADAPTER_UNAVAILABLE",
          "Inbox adapter threw during acceptance.",
        );
      }
      if (!result.ok) return adapterFailure(result);
      let validResult = false;
      try {
        validResult = validInboxAcceptance(result.value);
      } catch {
        validResult = false;
      }
      if (!validResult) {
        return fail(
          "MALFORMED_SUCCESS",
          "Inbox adapter returned malformed success.",
        );
      }
      return success(result.value);
    }
    if (command.operation === "OUTBOX_DISPATCH") {
      if (
        !deps.inboxOutbox.capabilities.includes("OUTBOX_DISPATCH") ||
        deps.transport === null ||
        !deps.transport.capabilities.includes("OUTBOX_DISPATCH") ||
        command.outbox === undefined
      ) {
        return fail(
          "ADAPTER_UNAVAILABLE",
          "Outbox dispatch capability or input is unavailable.",
        );
      }
      const leaseRequest: Core100OutboxLeaseRequest = command.outbox;
      let leased: Fp004Result<Fp004LeasedOutbox>;
      try {
        leased = await deps.inboxOutbox.leaseOutbox(leaseRequest);
      } catch {
        return fail("ADAPTER_UNAVAILABLE", "Outbox lease adapter threw.");
      }
      if (!leased.ok) return adapterFailure(leased);
      let validLease = false;
      try {
        validLease = validLeasedOutbox(leased.value);
      } catch {
        validLease = false;
      }
      if (!validLease) {
        return fail(
          "MALFORMED_SUCCESS",
          "Outbox lease adapter returned malformed success.",
        );
      }
      const request: Core100OutboxTransportRequest = {
        operation: "OUTBOX_DISPATCH",
        eventId: leased.value.record.eventId,
        resultHash: command.event.resultHash,
        outboxId: leased.value.record.outboxId,
        ownerId: command.outbox.ownerId,
        fencingToken: leased.value.lease.fencingToken,
        idempotency: command.outbox.idempotency,
      };
      let delivery: Fp004Result<Fp004Delivery>;
      try {
        delivery = await deps.transport.send(request);
      } catch {
        return fail("ADAPTER_UNAVAILABLE", "Provider transport adapter threw.");
      }
      if (!delivery.ok) return adapterFailure(delivery);
      let validTransportResult = false;
      try {
        validTransportResult = validDelivery(delivery.value);
      } catch {
        validTransportResult = false;
      }
      if (!validTransportResult) {
        return fail(
          "MALFORMED_SUCCESS",
          "Provider transport returned malformed success.",
        );
      }
      let completed: Fp004Result<Fp004CompletionResult>;
      try {
        completed = await deps.inboxOutbox.completeOutbox({
          outboxId: leased.value.record.outboxId,
          ownerId: command.outbox.ownerId,
          fencingToken: leased.value.lease.fencingToken,
          delivery: delivery.value,
          idempotency: command.outbox.idempotency,
        });
      } catch {
        return fail("ADAPTER_UNAVAILABLE", "Outbox completion adapter threw.");
      }
      if (!completed.ok) return adapterFailure(completed);
      let validCompletionResult = false;
      try {
        validCompletionResult = validCompletion(completed.value);
      } catch {
        validCompletionResult = false;
      }
      if (!validCompletionResult) {
        return fail(
          "MALFORMED_SUCCESS",
          "Outbox completion returned malformed success.",
        );
      }
      return success(completed.value);
    }
    const consumerId = command.operation as Core100ConsumerId;
    let validConsumerInput = false;
    try {
      validConsumerInput =
        (CORE100_CONSUMER_IDS as readonly string[]).includes(consumerId) &&
        command.consumerId === consumerId && validEvent(command.event, true);
    } catch {
      validConsumerInput = false;
    }
    if (!validConsumerInput) {
      return fail(
        "CONSUMER_MISMATCH",
        "Consumer operation is not bound to its canonical consumer.",
      );
    }
    if (
      !deps.durable.capabilities.includes(consumerId) ||
      !deps.inboxOutbox.capabilities.includes(consumerId)
    ) return fail("ADAPTER_UNAVAILABLE", "Consumer capability is unavailable.");
    const idempotency: Core100IdempotencyOwnership = {
      scope: `CORE-100:${consumerId}`,
      key: command.idempotencyKey,
      requestHash: command.requestHash,
    };
    const request: Core100ConsumerRequest<Core100ConsumerId> = {
      consumerId,
      tenantId: command.tenantId,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      event: command.event as Fp004CanonicalEvent,
      idempotency,
    };
    let result: Fp004Result<Core100ConsumerResult>;
    try {
      const consumer = consumerId === "FINANCE"
        ? deps.finance
        : consumerId === "NOTIFICATION"
        ? deps.notification
        : deps.search;
      result = await consumer.consume(request as never);
    } catch {
      return fail("ADAPTER_UNAVAILABLE", "Consumer adapter threw.");
    }
    if (!result.ok) return adapterFailure(result);
    let validResult = false;
    try {
      validResult = validConsumerResult(result.value, consumerId, idempotency);
    } catch {
      validResult = false;
    }
    if (!validResult) {
      return fail("MALFORMED_SUCCESS", "Consumer returned malformed success.");
    }
    return success(result.value);
  };
  return Object.freeze({ flags: normalizedFlags, execute });
}
