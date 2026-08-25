/**
 * PIXYNC-DRAW2-190 provider-neutral transport boundary.
 *
 * This module is internal to the 190 qualification boundary. Its provider is
 * injected only by an internal composition fixture; it is not re-exported by
 * the public pixync index because 190 has no production composition root.
 * Runtime callers request only a local project/client/generation tuple; room,
 * actor, and role authority come exclusively from the provider's
 * authenticated binding.
 */

import {
  committedOperationFingerprint,
  operationFingerprint,
  validatePixyncCommitted,
  validatePixyncDraft,
} from "./core.ts";
import type {
  PixyncCommittedOperation,
  PixyncOperationDraft,
} from "./contracts.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export type PixyncTransportStatus =
  | "CONNECTING"
  | "SUBSCRIBED"
  | "RECONNECTING"
  | "OFFLINE"
  | "CLOSED";

export type PixyncTransportRole = "owner" | "editor" | "viewer";
export type PixyncTransportAckKind = "COMMITTED" | "DUPLICATE";

export type PixyncTransportErrorCode =
  | "INVALID_INPUT"
  | "SESSION_NOT_OPEN"
  | "STALE_SESSION"
  | "IDENTITY_MISMATCH"
  | "BINDING_INVALID"
  | "ROLE_FORBIDDEN"
  | "AUTHORITATIVE_EVENT_INVALID"
  | "ACK_INVALID"
  | "CATCH_UP_INVALID";

export class PixyncTransportError extends Error {
  readonly code: PixyncTransportErrorCode;
  readonly path: string | undefined;

  constructor(
    code: PixyncTransportErrorCode,
    message: string,
    path?: string,
  ) {
    super(message);
    this.name = "PixyncTransportError";
    this.code = code;
    this.path = path;
  }
}

export interface PixyncTransportBinding {
  readonly projectId: string;
  readonly roomId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly role: PixyncTransportRole;
  readonly sessionGeneration: number;
}

export interface PixyncAuthoritativeOperationEvent {
  readonly origin: "AUTHORITATIVE_TAIL";
  readonly operation: PixyncCommittedOperation;
}

export interface PixyncTransportConnectInput {
  readonly projectId: string;
  readonly clientId: string;
  readonly sessionGeneration: number;
  readonly onOperation: (
    event: PixyncAuthoritativeOperationEvent,
  ) => void | Promise<void>;
  readonly onBroadcastHint?: () => void;
  readonly onStatus?: (status: PixyncTransportStatus) => void;
}

export interface PixyncTransportProviderOpenInput {
  readonly projectId: string;
  readonly clientId: string;
  readonly sessionGeneration: number;
  readonly onAuthoritativeOperation: (
    event: PixyncAuthoritativeOperationEvent,
  ) => void | Promise<void>;
  readonly onBroadcastHint: () => void;
  readonly onStatus: (status: PixyncTransportStatus) => void;
}

export interface PixyncTransportAck {
  readonly kind: PixyncTransportAckKind;
  readonly operationId: string;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly aggregateRevision: number;
  readonly submissionFingerprint: string;
  readonly committedFingerprint: string;
  readonly operation: PixyncCommittedOperation;
}

export interface PixyncTransportProviderConnection {
  submit(operation: PixyncOperationDraft): Promise<PixyncTransportAck>;
  fetchSince(
    afterProjectRevision: number,
  ): Promise<readonly PixyncCommittedOperation[]>;
  close(reason?: string): Promise<void>;
}

export interface PixyncTransportProviderOpenResult {
  readonly binding: PixyncTransportBinding;
  readonly connection: PixyncTransportProviderConnection;
}

/** A provider factory is injected once by the composition root. */
export interface PixyncTransportProvider {
  open(
    input: PixyncTransportProviderOpenInput,
  ): Promise<PixyncTransportProviderOpenResult>;
}

type ActiveSession = {
  readonly token: number;
  readonly binding: PixyncTransportBinding;
  readonly connection: PixyncTransportProviderConnection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string, path?: string): never {
  throw new PixyncTransportError("INVALID_INPUT", message, path);
}

function assertSafeId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    invalid("A bounded stable identifier is required.", path);
  }
}

function assertRevision(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid("A non-negative safe integer is required.", path);
  }
}

function assertBindingId(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    transportFailure(
      "BINDING_INVALID",
      "Provider binding contains an invalid identifier.",
      path,
    );
  }
}

function assertBindingGeneration(
  value: unknown,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    transportFailure(
      "BINDING_INVALID",
      "Provider binding contains an invalid session generation.",
      path,
    );
  }
}

function assertCallback(
  value: unknown,
  path: string,
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== "function") invalid("A callback is required.", path);
}

function transportFailure(
  code: PixyncTransportErrorCode,
  message: string,
  path?: string,
): never {
  throw new PixyncTransportError(code, message, path);
}

function sameBinding(
  left: PixyncTransportBinding,
  right: PixyncTransportBinding,
): boolean {
  return left.projectId === right.projectId &&
    left.roomId === right.roomId &&
    left.actorId === right.actorId &&
    left.clientId === right.clientId &&
    left.role === right.role &&
    left.sessionGeneration === right.sessionGeneration;
}

function authenticatedBinding(
  value: unknown,
  request: Pick<
    PixyncTransportConnectInput,
    "projectId" | "clientId" | "sessionGeneration"
  >,
): PixyncTransportBinding {
  if (!isRecord(value)) {
    transportFailure(
      "BINDING_INVALID",
      "Provider open must return an authenticated binding.",
      "binding",
    );
  }
  assertBindingId(value.projectId, "binding.projectId");
  assertBindingId(value.roomId, "binding.roomId");
  assertBindingId(value.actorId, "binding.actorId");
  assertBindingId(value.clientId, "binding.clientId");
  assertBindingGeneration(value.sessionGeneration, "binding.sessionGeneration");
  if (
    value.role !== "owner" && value.role !== "editor" &&
    value.role !== "viewer"
  ) {
    transportFailure(
      "BINDING_INVALID",
      "Provider binding must contain an authenticated role.",
      "binding.role",
    );
  }
  if (
    value.projectId !== request.projectId ||
    value.clientId !== request.clientId ||
    value.sessionGeneration !== request.sessionGeneration
  ) {
    transportFailure(
      "IDENTITY_MISMATCH",
      "Authenticated binding does not match the local connection request.",
      "binding",
    );
  }
  return Object.freeze({
    projectId: value.projectId,
    roomId: value.roomId,
    actorId: value.actorId,
    clientId: value.clientId,
    role: value.role,
    sessionGeneration: value.sessionGeneration,
  });
}

function providerConnection(
  value: unknown,
): PixyncTransportProviderConnection {
  if (!isRecord(value)) {
    transportFailure(
      "BINDING_INVALID",
      "Provider open must return a connection.",
      "connection",
    );
  }
  for (const method of ["submit", "fetchSince", "close"] as const) {
    if (typeof value[method] !== "function") {
      transportFailure(
        "BINDING_INVALID",
        "Provider connection is incomplete.",
        `connection.${method}`,
      );
    }
  }
  return value as unknown as PixyncTransportProviderConnection;
}

/**
 * Internal Draw2 transport adapter. It authenticates provider results, fences
 * stale callbacks, and validates transport envelopes without applying them.
 * The public package index intentionally does not export this constructor.
 */
export class PixyncTransportAdapter {
  #active: ActiveSession | undefined;
  #attempt = 0;
  #highestSessionGeneration = -1;
  #status: PixyncTransportStatus = "CLOSED";
  #statusSink: ((status: PixyncTransportStatus) => void) | undefined;

  constructor(private readonly provider: PixyncTransportProvider) {}

  get status(): PixyncTransportStatus {
    return this.#status;
  }

  get binding(): PixyncTransportBinding | undefined {
    return this.#active?.binding;
  }

  get projectId(): string | undefined {
    return this.#active?.binding.projectId;
  }

  get clientId(): string | undefined {
    return this.#active?.binding.clientId;
  }

  get sessionGeneration(): number | undefined {
    return this.#active?.binding.sessionGeneration;
  }

  async connect(input: PixyncTransportConnectInput): Promise<void> {
    assertSafeId(input.projectId, "projectId");
    assertSafeId(input.clientId, "clientId");
    assertRevision(input.sessionGeneration, "sessionGeneration");
    assertCallback(input.onOperation, "onOperation");
    if (input.onBroadcastHint !== undefined) {
      assertCallback(input.onBroadcastHint, "onBroadcastHint");
    }
    if (input.onStatus !== undefined) {
      assertCallback(input.onStatus, "onStatus");
    }
    if (input.sessionGeneration <= this.#highestSessionGeneration) {
      transportFailure(
        "STALE_SESSION",
        "A transport session generation must increase monotonically.",
        "sessionGeneration",
      );
    }

    await this.close("replaced");
    const token = ++this.#attempt;
    this.#highestSessionGeneration = input.sessionGeneration;
    this.#statusSink = input.onStatus;
    this.#setStatus("CONNECTING");
    let authoritativeBinding: PixyncTransportBinding | undefined;

    const providerInput: PixyncTransportProviderOpenInput = {
      projectId: input.projectId,
      clientId: input.clientId,
      sessionGeneration: input.sessionGeneration,
      onAuthoritativeOperation: async (event) => {
        if (token !== this.#attempt) return;
        if (
          !isRecord(event) || event.origin !== "AUTHORITATIVE_TAIL" ||
          !isRecord(event.operation)
        ) {
          transportFailure(
            "AUTHORITATIVE_EVENT_INVALID",
            "Only AUTHORITATIVE_TAIL operation events are accepted.",
            "event.origin",
          );
        }
        await validatePixyncCommitted(
          event.operation as unknown as PixyncCommittedOperation,
        );
        const active = this.#active;
        if (
          token !== this.#attempt || active?.token !== token ||
          this.#status !== "SUBSCRIBED" || authoritativeBinding === undefined ||
          !sameBinding(active.binding, authoritativeBinding)
        ) return;
        const operation = event
          .operation as unknown as PixyncCommittedOperation;
        if (operation.projectId !== active.binding.projectId) {
          transportFailure(
            "IDENTITY_MISMATCH",
            "Authoritative tail delivered another project's operation.",
            "event.operation.projectId",
          );
        }
        await input.onOperation({
          origin: "AUTHORITATIVE_TAIL",
          operation,
        });
      },
      onBroadcastHint: () => {
        const active = this.#active;
        if (
          token !== this.#attempt || active?.token !== token ||
          this.#status !== "SUBSCRIBED" || authoritativeBinding === undefined ||
          !sameBinding(active.binding, authoritativeBinding)
        ) return;
        input.onBroadcastHint?.();
      },
      onStatus: (status) => {
        if (token !== this.#attempt) return;
        if (status === "SUBSCRIBED" && this.#active?.token !== token) return;
        this.#setStatus(status);
      },
    };

    let result: PixyncTransportProviderOpenResult;
    try {
      result = await this.provider.open(providerInput);
    } catch (error) {
      if (token === this.#attempt) this.#setStatus("OFFLINE");
      throw error;
    }
    if (!isRecord(result)) {
      transportFailure(
        "BINDING_INVALID",
        "Provider open returned an invalid result.",
      );
    }
    const connection = providerConnection(result.connection);
    let binding: PixyncTransportBinding;
    try {
      binding = authenticatedBinding(result.binding, input);
    } catch (error) {
      await connection.close("binding-rejected");
      if (token === this.#attempt) this.#setStatus("OFFLINE");
      throw error;
    }
    if (token !== this.#attempt) {
      await connection.close("stale-open");
      transportFailure(
        "STALE_SESSION",
        "The provider opened a connection after the session was replaced.",
      );
    }

    authoritativeBinding = binding;
    this.#active = { token, binding, connection };
    if (this.#status === "CONNECTING") this.#setStatus("SUBSCRIBED");
  }

  async submit(
    operation: PixyncOperationDraft,
  ): Promise<PixyncTransportAck> {
    const active = this.#requireActive();
    await validatePixyncDraft(operation);
    if (
      operation.projectId !== active.binding.projectId ||
      operation.clientId !== active.binding.clientId ||
      operation.actorId !== active.binding.actorId
    ) {
      transportFailure(
        "IDENTITY_MISMATCH",
        "Operation identity does not match the authenticated binding.",
        "operation",
      );
    }
    if (active.binding.role === "viewer") {
      transportFailure(
        "ROLE_FORBIDDEN",
        "Viewer bindings cannot submit operations.",
        "binding.role",
      );
    }
    const ack = await active.connection.submit(operation);
    if (!this.#isCurrent(active)) {
      transportFailure(
        "STALE_SESSION",
        "The authenticated session changed while the operation was submitted.",
      );
    }
    return this.#validateAck(operation, ack);
  }

  async catchUp(
    afterProjectRevision: number,
  ): Promise<readonly PixyncCommittedOperation[]> {
    const active = this.#requireActive();
    assertRevision(afterProjectRevision, "afterProjectRevision");
    const operations = await active.connection.fetchSince(afterProjectRevision);
    if (!this.#isCurrent(active)) {
      transportFailure(
        "STALE_SESSION",
        "The authenticated session changed while catch-up was requested.",
      );
    }
    if (!Array.isArray(operations)) {
      transportFailure(
        "CATCH_UP_INVALID",
        "Provider catch-up must return an array of committed operations.",
      );
    }
    let expectedRevision = afterProjectRevision + 1;
    for (const operation of operations) {
      try {
        await validatePixyncCommitted(operation);
      } catch (error) {
        transportFailure(
          "CATCH_UP_INVALID",
          error instanceof Error
            ? error.message
            : "Provider catch-up contained an invalid operation.",
          "operations",
        );
      }
      if (operation.projectId !== active.binding.projectId) {
        transportFailure(
          "IDENTITY_MISMATCH",
          "Provider catch-up contained another project's operation.",
          "operations.projectId",
        );
      }
      if (operation.projectRevision !== expectedRevision) {
        transportFailure(
          "CATCH_UP_INVALID",
          "Provider catch-up must be contiguous from afterProjectRevision + 1.",
          "operations.projectRevision",
        );
      }
      expectedRevision += 1;
    }
    return operations;
  }

  async close(reason = "closed"): Promise<void> {
    const active = this.#active;
    this.#active = undefined;
    ++this.#attempt;
    this.#setStatus("CLOSED");
    if (active === undefined) return;
    await active.connection.close(reason);
  }

  #requireActive(): ActiveSession {
    if (this.#active === undefined || this.#status !== "SUBSCRIBED") {
      transportFailure(
        "SESSION_NOT_OPEN",
        "A subscribed authenticated transport session is required.",
      );
    }
    return this.#active;
  }

  #isCurrent(active: ActiveSession): boolean {
    return active.token === this.#attempt &&
      this.#active?.token === active.token &&
      this.#status === "SUBSCRIBED" &&
      sameBinding(this.#active.binding, active.binding);
  }

  #setStatus(status: PixyncTransportStatus): void {
    this.#status = status;
    this.#statusSink?.(status);
  }

  async #validateAck(
    submitted: PixyncOperationDraft,
    ack: PixyncTransportAck,
  ): Promise<PixyncTransportAck> {
    if (
      ack === null || typeof ack !== "object" ||
      (ack.kind !== "COMMITTED" && ack.kind !== "DUPLICATE")
    ) {
      transportFailure("ACK_INVALID", "Provider returned an invalid ACK.");
    }
    if (
      ack.operationId !== submitted.operationId ||
      ack.projectId !== submitted.projectId
    ) {
      transportFailure(
        "ACK_INVALID",
        "ACK identity does not match the submitted operation.",
        "ack.operationId",
      );
    }
    try {
      await validatePixyncCommitted(ack.operation);
    } catch (error) {
      transportFailure(
        "ACK_INVALID",
        error instanceof Error
          ? error.message
          : "ACK contains an invalid committed operation.",
        "ack.operation",
      );
    }
    if (
      ack.operation.operationId !== submitted.operationId ||
      ack.operation.projectId !== submitted.projectId ||
      ack.operation.projectRevision !== ack.projectRevision ||
      ack.operation.aggregateRevision !== ack.aggregateRevision ||
      ack.operation.aggregateRevision <= 0 ||
      (submitted.aggregateRevision !== 0 &&
        ack.operation.aggregateRevision !== submitted.aggregateRevision)
    ) {
      transportFailure(
        "ACK_INVALID",
        "ACK committed operation does not match its envelope metadata.",
        "ack.operation",
      );
    }
    const submittedFingerprint = await operationFingerprint(submitted);
    if (ack.submissionFingerprint !== submittedFingerprint) {
      transportFailure(
        "ACK_INVALID",
        "ACK submission fingerprint does not match the submitted operation.",
        "ack.submissionFingerprint",
      );
    }
    if (await operationFingerprint(ack.operation) !== submittedFingerprint) {
      transportFailure(
        "ACK_INVALID",
        "ACK committed operation differs from the submitted operation.",
        "ack.operation",
      );
    }
    const expectedCommittedFingerprint = await committedOperationFingerprint(
      ack.operation,
    );
    if (ack.committedFingerprint !== expectedCommittedFingerprint) {
      transportFailure(
        "ACK_INVALID",
        "ACK committed fingerprint is not canonical.",
        "ack.committedFingerprint",
      );
    }
    return ack;
  }
}
