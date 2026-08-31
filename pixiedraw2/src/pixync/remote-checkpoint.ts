/**
 * Authenticated PiXYNC checkpoint download boundary.
 *
 * `pixisync_open_session` is the server authority for the active Room and
 * checkpoint metadata. The client accepts a Blob only after the Room ID,
 * revision/path contract, byte length, and server-provided SHA-256 all agree.
 * PXD's own manifest and payload hashes are verified by the export importer
 * immediately after this boundary.
 */

import { sha256Hex } from "../wp160-contracts.ts";
import type {
  PixyncSupabaseSdkClient,
  PixyncSupabaseSdkStorageBucket,
} from "./supabase-sdk-port.ts";
import {
  PIXYNC_INITIAL_CHECKPOINT_BUCKET,
  PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION,
  PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES,
} from "./room-provisioning.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const OPEN_SESSION_FIELDS = [
  "room_id",
  "status",
  "role",
  "can_edit",
  "head_revision",
  "structure_epoch",
  "session_generation",
  "checkpoint_id",
  "checkpoint_revision",
  "storage_path",
  "state_sha256_hex",
  "encoded_bytes",
  "codec_version",
] as const;

export type PixyncRemoteCheckpointErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "RPC_FAILED"
  | "SERVER_RESPONSE_INVALID"
  | "SERVER_PATH_MISMATCH"
  | "DOWNLOAD_FAILED"
  | "CHECKPOINT_SIZE_MISMATCH"
  | "CHECKPOINT_HASH_MISMATCH";

export class PixyncRemoteCheckpointError extends Error {
  constructor(
    readonly code: PixyncRemoteCheckpointErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixyncRemoteCheckpointError";
  }
}

export interface PixyncActiveCheckpoint {
  readonly roomId: string;
  readonly status: "active";
  readonly role: "owner" | "editor" | "viewer";
  readonly canEdit: boolean;
  readonly headRevision: number;
  readonly structureEpoch: number;
  readonly sessionGeneration: number;
  readonly checkpointId: string;
  readonly checkpointRevision: number;
  readonly storagePath: string;
  readonly stateSha256Hex: string;
  readonly encodedBytes: number;
  readonly codecVersion: 1;
  readonly bytes: Uint8Array;
  readonly packageHash: string;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactlyOneRow(value: unknown): RecordValue {
  const row = Array.isArray(value)
    ? value.length === 1 ? value[0] : undefined
    : value;
  if (!isRecord(row)) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      "pixisync_open_session did not return exactly one checkpoint row.",
    );
  }
  const keys = Object.keys(row);
  if (
    keys.length !== OPEN_SESSION_FIELDS.length ||
    keys.some((key) => !(OPEN_SESSION_FIELDS as readonly string[]).includes(key))
  ) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      "pixisync_open_session returned an unexpected checkpoint shape.",
    );
  }
  return row;
}

function stringField(row: RecordValue, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      `pixisync_open_session.${key} is invalid.`,
    );
  }
  return value;
}

function integerField(row: RecordValue, key: string, minimum: number): number {
  const raw = row[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      `pixisync_open_session.${key} is invalid.`,
    );
  }
  return value;
}

async function authenticatedClientUser(
  client: PixyncSupabaseSdkClient,
): Promise<void> {
  let result;
  try {
    result = await client.auth.getUser();
  } catch (cause) {
    throw new PixyncRemoteCheckpointError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause },
    );
  }
  if (result.error !== null) {
    throw new PixyncRemoteCheckpointError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause: result.error },
    );
  }
  if (result.data?.user === null || result.data?.user === undefined) {
    throw new PixyncRemoteCheckpointError(
      "AUTHENTICATION_REQUIRED",
      "Sign in is required before restoring a shared Project.",
    );
  }
}

async function rpcData(
  client: PixyncSupabaseSdkClient,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  let result;
  try {
    result = await client.rpc("pixisync_open_session", args);
  } catch (cause) {
    throw new PixyncRemoteCheckpointError(
      "RPC_FAILED",
      "The active PiXYNC Project session could not be opened.",
      { cause },
    );
  }
  if (result.error !== null) {
    throw new PixyncRemoteCheckpointError(
      "RPC_FAILED",
      "The active PiXYNC Project session was rejected by the server.",
      { cause: result.error },
    );
  }
  if (result.data === null) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      "The active PiXYNC Project session returned no data.",
    );
  }
  return result.data;
}

async function downloadedBytes(
  storage: PixyncSupabaseSdkStorageBucket,
  path: string,
): Promise<Uint8Array> {
  let result;
  try {
    result = await storage.download(path);
  } catch (cause) {
    throw new PixyncRemoteCheckpointError(
      "DOWNLOAD_FAILED",
      "The PiXYNC checkpoint could not be downloaded.",
      { cause },
    );
  }
  if (result.error !== null || result.data === null) {
    throw new PixyncRemoteCheckpointError(
      "DOWNLOAD_FAILED",
      "The PiXYNC checkpoint could not be downloaded.",
      { cause: result.error },
    );
  }
  if (result.data instanceof Blob) {
    return new Uint8Array(await result.data.arrayBuffer());
  }
  if (result.data instanceof ArrayBuffer) {
    return new Uint8Array(result.data.slice(0));
  }
  if (result.data instanceof Uint8Array) {
    return new Uint8Array(result.data);
  }
  throw new PixyncRemoteCheckpointError(
    "DOWNLOAD_FAILED",
    "The PiXYNC checkpoint download returned an unsupported body.",
  );
}

/** Download and verify the active revision-0-or-later checkpoint for a Room. */
export async function readPixyncActiveCheckpoint(
  client: PixyncSupabaseSdkClient,
  projectId: string,
): Promise<PixyncActiveCheckpoint> {
  const roomId = typeof projectId === "string" ? projectId.trim().toLowerCase() : "";
  if (!UUID.test(roomId)) {
    throw new PixyncRemoteCheckpointError(
      "INVALID_INPUT",
      "A UUID PiXYNC Room ID is required to restore a shared Project.",
    );
  }
  await authenticatedClientUser(client);
  const storage = client.storage?.from(PIXYNC_INITIAL_CHECKPOINT_BUCKET);
  if (storage === undefined) {
    throw new PixyncRemoteCheckpointError(
      "STORAGE_UNAVAILABLE",
      "PiXYNC checkpoint Storage is unavailable in this client.",
    );
  }
  const row = exactlyOneRow(await rpcData(client, { p_room_id: roomId }));
  const returnedRoomId = stringField(row, "room_id").toLowerCase();
  const status = stringField(row, "status");
  const role = stringField(row, "role");
  const canEdit = row.can_edit;
  const headRevision = integerField(row, "head_revision", 0);
  const structureEpoch = integerField(row, "structure_epoch", 0);
  const sessionGeneration = integerField(row, "session_generation", 1);
  const checkpointId = stringField(row, "checkpoint_id").toLowerCase();
  const checkpointRevision = integerField(row, "checkpoint_revision", 0);
  const storagePath = stringField(row, "storage_path");
  const stateSha256Hex = stringField(row, "state_sha256_hex");
  const encodedBytes = integerField(row, "encoded_bytes", 1);
  const codecVersion = integerField(row, "codec_version", 1);
  const expectedPath =
    `rooms/${returnedRoomId}/checkpoints/${checkpointRevision}/${checkpointId}.pxd`;
  if (
    !UUID.test(returnedRoomId) || returnedRoomId !== roomId ||
    status !== "active" || !(["owner", "editor", "viewer"] as const).includes(
      role as "owner" | "editor" | "viewer",
    ) || typeof canEdit !== "boolean" ||
    (canEdit !== (role === "owner" || role === "editor")) ||
    !UUID.test(checkpointId) || checkpointRevision > headRevision ||
    storagePath !== expectedPath || !SHA256.test(stateSha256Hex) ||
    encodedBytes > PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES ||
    codecVersion !== PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION
  ) {
    throw new PixyncRemoteCheckpointError(
      "SERVER_PATH_MISMATCH",
      "The active PiXYNC checkpoint identity did not match the Room contract.",
    );
  }
  const bytes = await downloadedBytes(storage, storagePath);
  if (bytes.byteLength !== encodedBytes) {
    throw new PixyncRemoteCheckpointError(
      "CHECKPOINT_SIZE_MISMATCH",
      "The downloaded PiXYNC checkpoint size did not match the server record.",
    );
  }
  const packageHash = await sha256Hex(bytes);
  if (packageHash !== stateSha256Hex) {
    throw new PixyncRemoteCheckpointError(
      "CHECKPOINT_HASH_MISMATCH",
      "The downloaded PiXYNC checkpoint hash did not match the server record.",
    );
  }
  return {
    roomId: returnedRoomId,
    status: "active",
    role: role as "owner" | "editor" | "viewer",
    canEdit,
    headRevision,
    structureEpoch,
    sessionGeneration,
    checkpointId,
    checkpointRevision,
    storagePath,
    stateSha256Hex,
    encodedBytes,
    codecVersion: 1,
    bytes,
    packageHash,
  };
}
