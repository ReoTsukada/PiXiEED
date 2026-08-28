/**
 * Authenticated PiXYNC initial-room provisioning boundary.
 *
 * The server owns the Room ID and Storage path. The client may provide only
 * the project bytes and a title; every returned identity is checked before an
 * upload or activation is accepted. This module does not open Realtime and
 * does not publish a Project by itself.
 */

import { sha256Hex } from "../wp160-contracts.ts";
import {
  type PixyncSupabaseSdkClient,
  type PixyncSupabaseSdkUploadBody,
} from "./supabase-sdk-port.ts";

export const PIXYNC_INITIAL_CHECKPOINT_BUCKET = "pixisync-checkpoints" as const;
export const PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION = 1 as const;
export const PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES = 52_428_800 as const;
export const PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE =
  "application/vnd.pixieed.pxd" as const;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

export type PixyncRoomProvisioningErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "RPC_FAILED"
  | "SERVER_RESPONSE_INVALID"
  | "SERVER_PATH_MISMATCH"
  | "UPLOAD_FAILED"
  | "ACTIVATION_FAILED";

export class PixyncRoomProvisioningError extends Error {
  constructor(
    readonly code: PixyncRoomProvisioningErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixyncRoomProvisioningError";
  }
}

export interface PixyncInitialRoomInput {
  readonly title: string;
  readonly checkpointBytes: Uint8Array;
}

export interface PixyncProvisionedRoom {
  readonly roomId: string;
  readonly checkpointId: string;
  readonly storagePath: string;
  readonly packageHash: string;
  readonly encodedBytes: number;
  readonly sessionGeneration: number;
}

interface RecordValue {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function singleRow(value: unknown, label: string): RecordValue {
  const candidate = Array.isArray(value)
    ? value.length === 1 ? value[0] : undefined
    : value;
  if (!isRecord(candidate)) {
    throw new PixyncRoomProvisioningError(
      "SERVER_RESPONSE_INVALID",
      `${label} did not return exactly one object row.`,
    );
  }
  return candidate;
}

function stringField(
  row: RecordValue,
  key: string,
  label: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new PixyncRoomProvisioningError(
      "SERVER_RESPONSE_INVALID",
      `${label}.${key} is invalid.`,
    );
  }
  return value;
}

function integerField(
  row: RecordValue,
  key: string,
  label: string,
  minimum: number,
): number {
  const raw = row[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new PixyncRoomProvisioningError(
      "SERVER_RESPONSE_INVALID",
      `${label}.${key} is invalid.`,
    );
  }
  return value;
}

async function rpcData(
  client: PixyncSupabaseSdkClient,
  functionName: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  let result;
  try {
    result = await client.rpc(functionName, args);
  } catch (cause) {
    throw new PixyncRoomProvisioningError(
      "RPC_FAILED",
      `${functionName} could not be called.`,
      { cause },
    );
  }
  if (result.error !== null) {
    throw new PixyncRoomProvisioningError(
      "RPC_FAILED",
      `${functionName} was rejected by the server.`,
      { cause: result.error },
    );
  }
  if (result.data === null) {
    throw new PixyncRoomProvisioningError(
      "SERVER_RESPONSE_INVALID",
      `${functionName} returned no data.`,
    );
  }
  return result.data;
}

function checkpointUploadBody(bytes: Uint8Array): PixyncSupabaseSdkUploadBody {
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE,
  });
}

/**
 * Creates an authenticated Room and its verified revision-0 checkpoint.
 *
 * If upload or activation fails, the server-side Room remains initializing and
 * is deliberately not reported as a provisioned Room. A later server cleanup
 * job can remove abandoned initializing sessions without the client guessing
 * at authority-owned records.
 */
export async function provisionPixyncInitialRoom(
  client: PixyncSupabaseSdkClient,
  input: PixyncInitialRoomInput,
): Promise<PixyncProvisionedRoom> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const bytes = input.checkpointBytes instanceof Uint8Array
    ? new Uint8Array(input.checkpointBytes)
    : undefined;
  if (
    title.length === 0 || title.length > 120 || bytes === undefined ||
    bytes.byteLength < 1 ||
    bytes.byteLength > PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES
  ) {
    throw new PixyncRoomProvisioningError(
      "INVALID_INPUT",
      "Initial PiXYNC checkpoint input is invalid.",
    );
  }

  let authResult;
  try {
    authResult = await client.auth.getUser();
  } catch (cause) {
    throw new PixyncRoomProvisioningError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause },
    );
  }
  if (authResult.error !== null) {
    throw new PixyncRoomProvisioningError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause: authResult.error },
    );
  }
  if (authResult.data?.user === null || authResult.data?.user === undefined) {
    throw new PixyncRoomProvisioningError(
      "AUTHENTICATION_REQUIRED",
      "Sign in is required before starting a shared Project.",
    );
  }

  const storage = client.storage?.from(PIXYNC_INITIAL_CHECKPOINT_BUCKET);
  if (storage === undefined) {
    throw new PixyncRoomProvisioningError(
      "STORAGE_UNAVAILABLE",
      "PiXYNC checkpoint Storage is unavailable in this client.",
    );
  }

  const packageHash = await sha256Hex(bytes);
  if (!SHA256.test(packageHash)) {
    throw new PixyncRoomProvisioningError(
      "SERVER_RESPONSE_INVALID",
      "The initial checkpoint hash could not be created.",
    );
  }
  const begin = singleRow(
    await rpcData(client, "pixisync_begin_session", {
      p_title: title,
      p_state_sha256: `\\x${packageHash}`,
      p_encoded_bytes: bytes.byteLength,
      p_codec_version: PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION,
    }),
    "pixisync_begin_session",
  );
  const roomId = stringField(begin, "room_id", "pixisync_begin_session")
    .toLowerCase();
  const checkpointId = stringField(
    begin,
    "checkpoint_id",
    "pixisync_begin_session",
  ).toLowerCase();
  const storagePath = stringField(
    begin,
    "storage_path",
    "pixisync_begin_session",
  );
  const expectedPath =
    `rooms/${roomId}/checkpoints/0/${checkpointId}.pxd`;
  if (
    !UUID.test(roomId) || !UUID.test(checkpointId) ||
    storagePath !== expectedPath || begin.status !== "initializing" ||
    integerField(begin, "session_generation", "pixisync_begin_session", 1) !== 1
  ) {
    throw new PixyncRoomProvisioningError(
      "SERVER_PATH_MISMATCH",
      "PiXYNC returned an unexpected initial checkpoint identity.",
    );
  }

  let uploadResult;
  try {
    uploadResult = await storage.upload(
      storagePath,
      checkpointUploadBody(bytes),
      {
        contentType: PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE,
        upsert: false,
      },
    );
  } catch (cause) {
    throw new PixyncRoomProvisioningError(
      "UPLOAD_FAILED",
      "The initial PiXYNC checkpoint could not be uploaded.",
      { cause },
    );
  }
  if (uploadResult.error !== null || uploadResult.data === null) {
    throw new PixyncRoomProvisioningError(
      "UPLOAD_FAILED",
      "The initial PiXYNC checkpoint could not be uploaded.",
      { cause: uploadResult.error },
    );
  }

  let activate: unknown;
  try {
    activate = await rpcData(client, "pixisync_activate_initial_checkpoint", {
      p_room_id: roomId,
    });
  } catch (cause) {
    throw new PixyncRoomProvisioningError(
      "ACTIVATION_FAILED",
      "The PiXYNC Room could not be activated after upload.",
      { cause },
    );
  }
  const active = singleRow(
    activate,
    "pixisync_activate_initial_checkpoint",
  );
  if (
    stringField(
      active,
      "room_id",
      "pixisync_activate_initial_checkpoint",
    ).toLowerCase() !== roomId ||
    active.status !== "active" ||
    integerField(active, "head_revision", "pixisync_activate_initial_checkpoint", 0) !== 0 ||
    stringField(
      active,
      "active_checkpoint_id",
      "pixisync_activate_initial_checkpoint",
    ).toLowerCase() !== checkpointId ||
    integerField(
      active,
      "session_generation",
      "pixisync_activate_initial_checkpoint",
      1,
    ) !== 1
  ) {
    throw new PixyncRoomProvisioningError(
      "ACTIVATION_FAILED",
      "PiXYNC activation returned an unexpected Room state.",
    );
  }
  return {
    roomId,
    checkpointId,
    storagePath,
    packageHash,
    encodedBytes: bytes.byteLength,
    sessionGeneration: 1,
  };
}
