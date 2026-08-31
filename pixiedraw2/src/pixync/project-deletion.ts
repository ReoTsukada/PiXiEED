/**
 * Authenticated remote PiXYNC project-detach boundary.
 *
 * Local Project data must not be removed until this server-owned operation has
 * completed.  The caller supplies only the Room identity; authentication,
 * ownership, membership, archival state, and session generation are resolved
 * by the RPC.  Owner localization is intentionally not guessed here: the
 * server can require a verified localization checkpoint before it accepts the
 * detach, leaving the local card available for a safe retry.
 */

import type { PixyncSupabaseSdkClient } from "./supabase-sdk-port.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]{1,80}$/u;
const ROOM_STATUSES = new Set([
  "initializing",
  "active",
  "archived",
  "missing",
]);

export type PixyncProjectDetachAction =
  | "owner_localized"
  | "participant_left"
  | "already_detached";

export type PixyncProjectDeletionErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "RPC_FAILED"
  | "SERVER_RESPONSE_INVALID"
  | "LOCALIZATION_REQUIRED";

export class PixyncProjectDeletionError extends Error {
  constructor(
    readonly code: PixyncProjectDeletionErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixyncProjectDeletionError";
  }
}

export interface PixyncProjectDetachResult {
  readonly roomId: string;
  readonly action: PixyncProjectDetachAction;
  readonly roomStatus: string;
  readonly sessionGeneration: number;
}

interface RecordValue {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(
  code: PixyncProjectDeletionErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new PixyncProjectDeletionError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function normalizedRoomId(projectId: string): string {
  const roomId = typeof projectId === "string"
    ? projectId.trim().toLowerCase()
    : "";
  if (!UUID.test(roomId)) {
    fail(
      "INVALID_INPUT",
      "A canonical PiXYNC Room UUID is required for remote detach.",
    );
  }
  return roomId;
}

async function requireAuthenticatedUser(
  client: PixyncSupabaseSdkClient,
): Promise<void> {
  let result;
  try {
    result = await client.auth.getUser();
  } catch (cause) {
    fail(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      cause,
    );
  }
  if (result.error !== null) {
    fail(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      result.error,
    );
  }
  const user = result.data?.user;
  if (!isRecord(user) || typeof user.id !== "string" || !UUID.test(user.id)) {
    fail(
      "AUTHENTICATION_REQUIRED",
      "Sign in is required before detaching a shared PiXYNC Project.",
    );
  }
}

function exactlyOneRow(value: unknown): RecordValue {
  const row = Array.isArray(value)
    ? value.length === 1 ? value[0] : undefined
    : value;
  if (!isRecord(row)) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned an unexpected response shape.",
    );
  }
  return row;
}

function parseDetachResult(
  value: unknown,
  expectedRoomId: string,
): PixyncProjectDetachResult {
  const row = exactlyOneRow(value);
  const keys = ["room_id", "action", "room_status", "session_generation"];
  const actualKeys = Object.keys(row);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !keys.includes(key))
  ) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned unsupported fields.",
    );
  }
  const roomId = typeof row.room_id === "string"
    ? row.room_id.trim().toLowerCase()
    : "";
  if (!UUID.test(roomId) || roomId !== expectedRoomId) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned a different Room identity.",
    );
  }
  const action = row.action;
  if (
    action !== "owner_localized" &&
    action !== "participant_left" && action !== "already_detached"
  ) {
    if (action === "localization_required") {
      fail(
        "LOCALIZATION_REQUIRED",
        "Owner localization is required before this shared Project can be detached.",
      );
    }
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned an unsupported action.",
    );
  }
  const roomStatus = typeof row.room_status === "string"
    ? row.room_status.trim().toLowerCase()
    : "";
  if (!SAFE_TEXT.test(roomStatus) || !ROOM_STATUSES.has(roomStatus)) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned an invalid Room status.",
    );
  }
  if (
    (action === "already_detached" && roomStatus !== "missing") ||
    (action === "owner_localized" && roomStatus !== "archived") ||
    (action === "participant_left" && roomStatus === "missing")
  ) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned an invalid action/status combination.",
    );
  }
  const sessionGeneration = typeof row.session_generation === "number"
    ? row.session_generation
    : Number(row.session_generation);
  if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 0) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC detach returned an invalid session generation.",
    );
  }
  return {
    roomId,
    action,
    roomStatus,
    sessionGeneration,
  };
}

/**
 * Detach the authenticated user from a remote Room.
 *
 * The server decides whether this is an owner localization result or a
 * participant leave.  No local IndexedDB, OPFS, manifest, or recent-project
 * state is touched by this function.
 */
export async function detachPixyncProject(
  client: PixyncSupabaseSdkClient,
  projectId: string,
): Promise<PixyncProjectDetachResult> {
  const roomId = normalizedRoomId(projectId);
  await requireAuthenticatedUser(client);
  let result;
  try {
    result = await client.rpc("pixisync_detach_deleted_project", {
      p_room_id: roomId,
    });
  } catch (cause) {
    fail(
      "RPC_FAILED",
      "PiXYNC remote detach could not be completed.",
      cause,
    );
  }
  if (result.error !== null) {
    const message = isRecord(result.error) &&
        typeof result.error.message === "string"
      ? result.error.message
      : "";
    if (/locali[sz]ation_required/iu.test(message)) {
      fail(
        "LOCALIZATION_REQUIRED",
        "Owner localization is required before this shared Project can be detached.",
        result.error,
      );
    }
    fail(
      "RPC_FAILED",
      "PiXYNC remote detach was rejected by the server.",
      result.error,
    );
  }
  if (result.data === null || result.data === undefined) {
    fail(
      "SERVER_RESPONSE_INVALID",
      "PiXYNC remote detach returned no result.",
    );
  }
  return parseDetachResult(result.data, roomId);
}
