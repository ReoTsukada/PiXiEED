/**
 * PIXYNC-DRAW2-210 internal Supabase-like provider boundary.
 *
 * This module deliberately depends on a structural port, not the Supabase
 * SDK. The port is only a seam for a later server-backed composition root.
 * Authentication and membership are re-resolved for every privileged action;
 * caller supplied actor, role, room, and metadata are never authority.
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
import type {
  PixyncAuthoritativeOperationEvent,
  PixyncTransportAck,
  PixyncTransportBinding,
  PixyncTransportProvider,
  PixyncTransportProviderConnection,
  PixyncTransportProviderOpenInput,
  PixyncTransportStatus,
} from "./transport.ts";

const OPEN_SESSION_RPC = "pixync_draw2_open_session_v1";
const COMMIT_RPC = "pixync_draw2_commit_operation_v1";
const FETCH_RPC = "pixync_draw2_get_operations_since_v1";
const REALTIME_EVENT = "pixync_hint";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type PixyncSupabaseProviderErrorCode =
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "AUTH_ERROR"
  | "RPC_ERROR"
  | "ROW_INVALID"
  | "MEMBERSHIP_FORBIDDEN"
  | "SESSION_STALE"
  | "ROLE_FORBIDDEN"
  | "REALTIME_ERROR"
  | "SESSION_CLOSED";

export class PixyncSupabaseProviderError extends Error {
  readonly code: PixyncSupabaseProviderErrorCode;
  readonly path: string | undefined;

  constructor(
    code: PixyncSupabaseProviderErrorCode,
    message: string,
    path?: string,
  ) {
    super(message);
    this.name = "PixyncSupabaseProviderError";
    this.code = code;
    this.path = path;
  }
}

export interface PixyncSupabasePortResult<T = unknown> {
  readonly data: T | null;
  readonly error: unknown | null;
}

/** Structural auth port; the implementation may be backed by Supabase Auth. */
export interface PixyncSupabaseAuthPort {
  getUser(): Promise<
    PixyncSupabasePortResult<{
      readonly user: unknown | null;
    }>
  >;
}

/** Payloads are intentionally ignored by the provider. Only the event is a hint. */
export interface PixyncSupabaseRealtimeChannelPort {
  on(
    type: "broadcast",
    filter: { readonly event: typeof REALTIME_EVENT },
    callback: (payload: unknown) => void,
  ): PixyncSupabaseRealtimeChannelPort;
  subscribe(): Promise<PixyncSupabasePortResult<null> | void>;
  unsubscribe(): Promise<PixyncSupabasePortResult<null> | void> | void;
}

/** Minimal SDK-free port used by the internal Provider. */
export interface PixyncSupabaseLikePort {
  readonly auth: PixyncSupabaseAuthPort;
  rpc(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<PixyncSupabasePortResult<unknown>>;
  channel(name: string): PixyncSupabaseRealtimeChannelPort;
}

export interface PixyncSupabaseProviderOptions {
  readonly port: PixyncSupabaseLikePort;
}

type AuthenticatedUser = {
  readonly userId: string;
};

type SessionRow = {
  readonly principalId: string;
  readonly projectId: string;
  readonly roomId: string;
  readonly actorId: string;
  readonly membershipId: string;
  readonly membershipRevision: string;
  readonly clientId: string;
  readonly sessionGeneration: number;
  readonly role: PixyncTransportBinding["role"];
};

type ActiveConnection = {
  readonly binding: PixyncTransportBinding;
  readonly session: SessionRow;
  readonly input: PixyncTransportProviderOpenInput;
  readonly channel: PixyncSupabaseRealtimeChannelPort;
  closed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(
  code: PixyncSupabaseProviderErrorCode,
  message: string,
  path?: string,
): never {
  throw new PixyncSupabaseProviderError(code, message, path);
}

function assertSafeId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail("INVALID_INPUT", "A bounded stable identifier is required.", path);
  }
}

function assertUuid(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("ROW_INVALID", "A canonical UUID is required.", path);
  }
}

function assertRevision(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(
      "ROW_INVALID",
      "A non-negative safe integer revision is required.",
      path,
    );
  }
}

function assertPositiveRevision(
  value: unknown,
  path: string,
): asserts value is number {
  assertRevision(value, path);
  if (value === 0) {
    fail("ROW_INVALID", "A committed revision must be positive.", path);
  }
}

function assertSha256(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("ROW_INVALID", "A lowercase SHA-256 fingerprint is required.", path);
  }
}

function assertRevisionToken(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || !REVISION.test(value)) {
    fail("ROW_INVALID", "A bounded membership revision is required.", path);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size || actual.some((key) => !expected.has(key))
  ) {
    fail(
      "ROW_INVALID",
      "RPC row contains an unexpected or missing field.",
      path,
    );
  }
}

function resultError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The Supabase-like port returned an error.";
}

function assertPortResult(
  value: unknown,
  path: string,
): asserts value is PixyncSupabasePortResult {
  if (!isRecord(value) || !("data" in value) || !("error" in value)) {
    fail("RPC_ERROR", "The port returned an invalid result envelope.", path);
  }
  if (value.error !== null && value.error !== undefined) {
    fail("RPC_ERROR", resultError(value.error), `${path}.error`);
  }
}

function parseAuthUser(value: unknown): AuthenticatedUser {
  if (!isRecord(value)) {
    fail("AUTH_ERROR", "Auth returned an invalid result.", "auth");
  }
  if (value.error !== null && value.error !== undefined) {
    fail("AUTH_ERROR", resultError(value.error), "auth.error");
  }
  if (!isRecord(value.data) || value.data.user === null) {
    fail(
      "AUTH_REQUIRED",
      "A server-validated authenticated user is required.",
      "auth.data.user",
    );
  }
  if (!isRecord(value.data.user)) {
    fail("AUTH_ERROR", "Auth returned an invalid user row.", "auth.data.user");
  }
  assertUuid(value.data.user.id, "auth.data.user.id");
  // user_metadata and app_metadata are intentionally not read or interpreted.
  return Object.freeze({ userId: value.data.user.id });
}

function parseSessionRow(
  value: unknown,
  requested: Pick<
    PixyncTransportProviderOpenInput,
    "projectId" | "clientId" | "sessionGeneration"
  >,
  user: AuthenticatedUser,
): SessionRow {
  if (value === null) {
    fail(
      "MEMBERSHIP_FORBIDDEN",
      "No active canonical project membership is available.",
      "data",
    );
  }
  if (!isRecord(value)) {
    fail("ROW_INVALID", "open_session must return one object row.", "data");
  }
  assertExactKeys(value, [
    "principal_id",
    "project_id",
    "room_id",
    "actor_id",
    "membership_id",
    "membership_revision",
    "client_id",
    "session_generation",
    "role",
  ], "data");
  assertUuid(value.principal_id, "data.principal_id");
  assertSafeId(value.project_id, "data.project_id");
  assertUuid(value.room_id, "data.room_id");
  assertUuid(value.actor_id, "data.actor_id");
  assertUuid(value.membership_id, "data.membership_id");
  assertRevisionToken(value.membership_revision, "data.membership_revision");
  assertSafeId(value.client_id, "data.client_id");
  assertRevision(value.session_generation, "data.session_generation");
  if (
    value.role !== "owner" && value.role !== "editor" && value.role !== "viewer"
  ) {
    fail("ROW_INVALID", "open_session returned an invalid role.", "data.role");
  }
  if (value.principal_id !== user.userId) {
    fail(
      "MEMBERSHIP_FORBIDDEN",
      "Membership is not bound to the authenticated user.",
      "data.principal_id",
    );
  }
  if (value.project_id !== requested.projectId) {
    fail(
      "MEMBERSHIP_FORBIDDEN",
      "Membership is not bound to the requested project.",
      "data.project_id",
    );
  }
  if (
    value.client_id !== requested.clientId ||
    value.session_generation !== requested.sessionGeneration
  ) {
    fail(
      "SESSION_STALE",
      "The server session does not match the fixed local client generation.",
      "data.session_generation",
    );
  }
  return {
    principalId: value.principal_id,
    projectId: value.project_id,
    roomId: value.room_id,
    actorId: value.actor_id,
    membershipId: value.membership_id,
    membershipRevision: value.membership_revision,
    clientId: value.client_id,
    sessionGeneration: value.session_generation,
    role: value.role,
  };
}

async function parseCommittedOperation(
  value: unknown,
  path: string,
): Promise<PixyncCommittedOperation> {
  if (!isRecord(value)) {
    fail("ROW_INVALID", "RPC returned an invalid committed operation.", path);
  }
  try {
    await validatePixyncCommitted(
      value as unknown as PixyncCommittedOperation,
    );
  } catch (error) {
    fail(
      "ROW_INVALID",
      error instanceof Error ? error.message : "Invalid committed operation.",
      path,
    );
  }
  return value as unknown as PixyncCommittedOperation;
}

function bindingFromSession(row: SessionRow): PixyncTransportBinding {
  return Object.freeze({
    projectId: row.projectId,
    roomId: row.roomId,
    actorId: row.actorId,
    clientId: row.clientId,
    role: row.role,
    sessionGeneration: row.sessionGeneration,
  });
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

function sameSession(left: SessionRow, right: SessionRow): boolean {
  return left.principalId === right.principalId &&
    left.projectId === right.projectId &&
    left.roomId === right.roomId &&
    left.actorId === right.actorId &&
    left.membershipId === right.membershipId &&
    left.membershipRevision === right.membershipRevision &&
    left.clientId === right.clientId &&
    left.sessionGeneration === right.sessionGeneration &&
    left.role === right.role;
}

function assertCurrentOperationIdentity(
  operation: PixyncOperationDraft,
  binding: PixyncTransportBinding,
): void {
  if (
    operation.projectId !== binding.projectId ||
    operation.clientId !== binding.clientId ||
    operation.actorId !== binding.actorId
  ) {
    fail(
      "SESSION_STALE",
      "Operation identity does not match canonical membership.",
      "operation",
    );
  }
}

async function parseAckRow(
  value: unknown,
  submitted: PixyncOperationDraft,
): Promise<PixyncTransportAck> {
  if (!isRecord(value)) {
    fail("ROW_INVALID", "commit RPC must return one ACK row.", "data");
  }
  assertExactKeys(value, [
    "kind",
    "operation_id",
    "project_id",
    "project_revision",
    "aggregate_revision",
    "submission_fingerprint",
    "committed_fingerprint",
    "operation",
  ], "data");
  if (value.kind !== "COMMITTED" && value.kind !== "DUPLICATE") {
    fail(
      "ROW_INVALID",
      "commit RPC returned an invalid ACK kind.",
      "data.kind",
    );
  }
  assertSafeId(value.operation_id, "data.operation_id");
  assertSafeId(value.project_id, "data.project_id");
  assertPositiveRevision(value.project_revision, "data.project_revision");
  assertPositiveRevision(value.aggregate_revision, "data.aggregate_revision");
  assertSha256(value.submission_fingerprint, "data.submission_fingerprint");
  assertSha256(value.committed_fingerprint, "data.committed_fingerprint");
  const operation = await parseCommittedOperation(
    value.operation,
    "data.operation",
  );
  if (
    value.operation_id !== submitted.operationId ||
    value.project_id !== submitted.projectId ||
    operation.operationId !== submitted.operationId ||
    operation.projectId !== submitted.projectId ||
    operation.projectRevision !== value.project_revision ||
    operation.aggregateRevision !== value.aggregate_revision
  ) {
    fail(
      "ROW_INVALID",
      "ACK identity or revision does not match the submitted operation.",
      "data",
    );
  }
  const submittedFingerprint = await operationFingerprint(submitted);
  if (value.submission_fingerprint !== submittedFingerprint) {
    fail(
      "ROW_INVALID",
      "ACK submission fingerprint is not canonical.",
      "data.submission_fingerprint",
    );
  }
  if (await operationFingerprint(operation) !== submittedFingerprint) {
    fail(
      "ROW_INVALID",
      "ACK operation differs from the submitted operation.",
      "data.operation",
    );
  }
  const committedFingerprint = await committedOperationFingerprint(operation);
  if (value.committed_fingerprint !== committedFingerprint) {
    fail(
      "ROW_INVALID",
      "ACK committed fingerprint is not canonical.",
      "data.committed_fingerprint",
    );
  }
  return {
    kind: value.kind,
    operationId: value.operation_id,
    projectId: value.project_id,
    projectRevision: value.project_revision,
    aggregateRevision: value.aggregate_revision,
    submissionFingerprint: value.submission_fingerprint,
    committedFingerprint: value.committed_fingerprint,
    operation,
  };
}

async function parseFetchRows(
  value: unknown,
  projectId: string,
  afterProjectRevision: number,
): Promise<readonly PixyncCommittedOperation[]> {
  if (!Array.isArray(value)) {
    fail("ROW_INVALID", "fetch RPC must return an array of rows.", "data");
  }
  const operations: PixyncCommittedOperation[] = [];
  let expectedRevision = afterProjectRevision + 1;
  for (const [index, row] of value.entries()) {
    const operation = await parseCommittedOperation(row, `data[${index}]`);
    if (operation.projectId !== projectId) {
      fail(
        "ROW_INVALID",
        "fetch RPC returned another project's operation.",
        `data[${index}].projectId`,
      );
    }
    if (operation.projectRevision !== expectedRevision) {
      fail(
        "ROW_INVALID",
        "fetch RPC returned a non-contiguous revision.",
        `data[${index}].projectRevision`,
      );
    }
    operations.push(operation);
    expectedRevision += 1;
  }
  return operations;
}

export class PixyncSupabaseProvider implements PixyncTransportProvider {
  readonly #port: PixyncSupabaseLikePort;

  constructor(options: PixyncSupabaseProviderOptions) {
    if (!isRecord(options) || !isRecord(options.port)) {
      fail("INVALID_INPUT", "A Supabase-like port is required.", "port");
    }
    this.#port = options.port;
  }

  async open(
    input: PixyncTransportProviderOpenInput,
  ): Promise<{
    readonly binding: PixyncTransportBinding;
    readonly connection: PixyncTransportProviderConnection;
  }> {
    assertSafeId(input.projectId, "projectId");
    assertSafeId(input.clientId, "clientId");
    assertRevision(input.sessionGeneration, "sessionGeneration");
    if (typeof input.onAuthoritativeOperation !== "function") {
      fail(
        "INVALID_INPUT",
        "An authoritative operation callback is required.",
        "onAuthoritativeOperation",
      );
    }
    if (typeof input.onBroadcastHint !== "function") {
      fail(
        "INVALID_INPUT",
        "A broadcast hint callback is required.",
        "onBroadcastHint",
      );
    }
    if (typeof input.onStatus !== "function") {
      fail("INVALID_INPUT", "A status callback is required.", "onStatus");
    }

    input.onStatus("CONNECTING");
    let session: SessionRow;
    try {
      session = await this.#resolveSession(input);
    } catch (error) {
      input.onStatus("OFFLINE");
      throw error;
    }
    const binding = bindingFromSession(session);
    let channel: PixyncSupabaseRealtimeChannelPort;
    try {
      channel = this.#port.channel(`pixync:room:${binding.roomId}`);
      if (
        !isRecord(channel) || typeof channel.on !== "function" ||
        typeof channel.subscribe !== "function" ||
        typeof channel.unsubscribe !== "function"
      ) {
        fail("REALTIME_ERROR", "The Realtime port is incomplete.", "channel");
      }
    } catch (error) {
      input.onStatus("OFFLINE");
      if (error instanceof PixyncSupabaseProviderError) throw error;
      fail(
        "REALTIME_ERROR",
        error instanceof Error
          ? error.message
          : "Realtime channel creation failed.",
      );
    }

    let active: ActiveConnection;
    try {
      active = {
        binding,
        session,
        input,
        channel: channel
          .on("broadcast", { event: REALTIME_EVENT }, () => {
            if (active.closed) return;
            // The payload is intentionally discarded. Realtime never injects an operation.
            input.onBroadcastHint();
          }),
        closed: false,
      };
      const subscribed = await channel.subscribe();
      if (subscribed !== undefined) {
        assertPortResult(subscribed, "channel.subscribe");
      }
    } catch (error) {
      await Promise.resolve(channel.unsubscribe());
      input.onStatus("OFFLINE");
      if (error instanceof PixyncSupabaseProviderError) {
        if (error.code === "RPC_ERROR") {
          throw new PixyncSupabaseProviderError(
            "REALTIME_ERROR",
            error.message,
            error.path,
          );
        }
        throw error;
      }
      fail(
        "REALTIME_ERROR",
        error instanceof Error
          ? error.message
          : "Realtime subscription failed.",
      );
    }

    const connection = this.#connection(active);
    input.onStatus("SUBSCRIBED");
    return { binding, connection };
  }

  async #resolveSession(
    input: Pick<
      PixyncTransportProviderOpenInput,
      "projectId" | "clientId" | "sessionGeneration"
    >,
  ): Promise<SessionRow> {
    const authResult = await this.#port.auth.getUser();
    const user = parseAuthUser(authResult);
    let result: PixyncSupabasePortResult;
    try {
      result = await this.#port.rpc(OPEN_SESSION_RPC, {
        p_project_id: input.projectId,
        p_client_id: input.clientId,
        p_session_generation: input.sessionGeneration,
      });
    } catch (error) {
      fail(
        "RPC_ERROR",
        error instanceof Error ? error.message : "open_session RPC failed.",
      );
    }
    assertPortResult(result, OPEN_SESSION_RPC);
    return parseSessionRow(result.data, input, user);
  }

  #connection(active: ActiveConnection): PixyncTransportProviderConnection {
    const ensureOpen = (): void => {
      if (active.closed) {
        fail("SESSION_CLOSED", "The provider connection is closed.");
      }
    };
    const recheck = async (): Promise<void> => {
      ensureOpen();
      let row: SessionRow;
      try {
        row = await this.#resolveSession(active.input);
      } catch (error) {
        await closeActive("authorization-rejected");
        if (error instanceof PixyncSupabaseProviderError) {
          if (
            error.code === "AUTH_REQUIRED" ||
            error.code === "MEMBERSHIP_FORBIDDEN"
          ) {
            throw new PixyncSupabaseProviderError(
              "SESSION_STALE",
              error.message,
              error.path,
            );
          }
          throw error;
        }
        throw error;
      }
      const current = bindingFromSession(row);
      if (
        !sameBinding(current, active.binding) ||
        !sameSession(row, active.session)
      ) {
        await closeActive("stale-session");
        fail(
          "SESSION_STALE",
          "Authentication or canonical membership changed.",
          "session",
        );
      }
    };
    const closeActive = async (reason: string): Promise<void> => {
      if (active.closed) return;
      active.closed = true;
      try {
        await Promise.resolve(active.channel.unsubscribe());
      } finally {
        active.input.onStatus("CLOSED");
      }
      void reason;
    };
    return {
      submit: async (operation): Promise<PixyncTransportAck> => {
        await recheck();
        ensureOpen();
        await validatePixyncDraft(operation);
        assertCurrentOperationIdentity(operation, active.binding);
        if (active.binding.role === "viewer") {
          fail(
            "ROLE_FORBIDDEN",
            "Viewer membership cannot submit operations.",
            "binding.role",
          );
        }
        let result: PixyncSupabasePortResult;
        try {
          result = await this.#port.rpc(COMMIT_RPC, {
            p_project_id: active.binding.projectId,
            p_client_id: active.binding.clientId,
            p_session_generation: active.binding.sessionGeneration,
            p_operation: operation,
          });
        } catch (error) {
          fail(
            "RPC_ERROR",
            error instanceof Error ? error.message : "commit RPC failed.",
          );
        }
        await recheck();
        assertPortResult(result, COMMIT_RPC);
        return parseAckRow(result.data, operation);
      },
      fetchSince: async (
        afterProjectRevision,
      ): Promise<readonly PixyncCommittedOperation[]> => {
        ensureOpen();
        if (
          !Number.isSafeInteger(afterProjectRevision) ||
          afterProjectRevision < 0
        ) {
          fail(
            "INVALID_INPUT",
            "A non-negative safe revision is required.",
            "afterProjectRevision",
          );
        }
        await recheck();
        let result: PixyncSupabasePortResult;
        try {
          result = await this.#port.rpc(FETCH_RPC, {
            p_project_id: active.binding.projectId,
            p_after_project_revision: afterProjectRevision,
            p_client_id: active.binding.clientId,
            p_session_generation: active.binding.sessionGeneration,
          });
        } catch (error) {
          fail(
            "RPC_ERROR",
            error instanceof Error ? error.message : "fetch RPC failed.",
          );
        }
        await recheck();
        assertPortResult(result, FETCH_RPC);
        return parseFetchRows(
          result.data,
          active.binding.projectId,
          afterProjectRevision,
        );
      },
      close: async (reason = "closed"): Promise<void> => {
        void reason;
        await closeActive(reason);
      },
    };
  }
}

export const PIXYNC_SUPABASE_RPC_NAMES = Object.freeze({
  openSession: OPEN_SESSION_RPC,
  commit: COMMIT_RPC,
  fetchSince: FETCH_RPC,
  realtimeEvent: REALTIME_EVENT,
});
