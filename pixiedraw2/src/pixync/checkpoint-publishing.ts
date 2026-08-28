/**
 * Authenticated PiXYNC checkpoint publish boundary.
 *
 * A checkpoint becomes active only after the server accepts the upload,
 * registers it at the current head, and verifies the required attestations.
 * The client validates every server-owned identity and path before moving to
 * the next step. Failed intermediate uploads are left for the server cleanup
 * path; the client never guesses at deleting authority-owned records.
 */

import { sha256Hex } from "../wp160-contracts.ts";
import type {
  PixyncSupabaseSdkClient,
  PixyncSupabaseSdkStorageBucket,
  PixyncSupabaseSdkUploadBody,
} from "./supabase-sdk-port.ts";
import {
  PIXYNC_INITIAL_CHECKPOINT_BUCKET,
  PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION,
  PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES,
  PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE,
} from "./room-provisioning.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export type PixyncCheckpointPublishErrorCode =
  | "INVALID_INPUT"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "RPC_FAILED"
  | "SERVER_RESPONSE_INVALID"
  | "SERVER_PATH_MISMATCH"
  | "UPLOAD_FAILED"
  | "ATTESTATION_FAILED"
  | "ACTIVATION_FAILED";

export class PixyncCheckpointPublishError extends Error {
  constructor(
    readonly code: PixyncCheckpointPublishErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PixyncCheckpointPublishError";
  }
}

export interface PixyncCheckpointPublishInput {
  readonly projectId: string;
  readonly checkpointBytes: Uint8Array;
  /** A UUID identifying this editor instance for the attestation record. */
  readonly attestationClientId: string;
}

export interface PixyncPublishedCheckpoint {
  readonly requestedCheckpointId: string;
  readonly checkpointId: string;
  readonly revision: number;
  readonly storagePath: string;
  readonly packageHash: string;
  readonly encodedBytes: number;
  readonly status: "candidate" | "verified";
  readonly attestedUserCount: number;
  readonly requiredUserCount: number;
  readonly active: boolean;
  readonly headRevision?: number;
  readonly structureEpoch?: number;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactlyOneRow(value: unknown, label: string): RecordValue {
  const row = Array.isArray(value)
    ? value.length === 1 ? value[0] : undefined
    : value;
  if (!isRecord(row)) {
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      `${label} did not return exactly one object row.`,
    );
  }
  return row;
}

function assertExactKeys(
  row: RecordValue,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(row);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      `${label} returned an unexpected response shape.`,
    );
  }
}

function stringField(row: RecordValue, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new PixyncCheckpointPublishError(
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
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      `${label}.${key} is invalid.`,
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
    throw new PixyncCheckpointPublishError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause },
    );
  }
  if (result.error !== null) {
    throw new PixyncCheckpointPublishError(
      "AUTHENTICATION_FAILED",
      "PiXYNC authentication could not be checked.",
      { cause: result.error },
    );
  }
  if (result.data?.user === null || result.data?.user === undefined) {
    throw new PixyncCheckpointPublishError(
      "AUTHENTICATION_REQUIRED",
      "Sign in is required before publishing a shared Project checkpoint.",
    );
  }
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
    throw new PixyncCheckpointPublishError(
      "RPC_FAILED",
      `${functionName} could not be called.`,
      { cause },
    );
  }
  if (result.error !== null) {
    throw new PixyncCheckpointPublishError(
      "RPC_FAILED",
      `${functionName} was rejected by the server.`,
      { cause: result.error },
    );
  }
  if (result.data === null) {
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      `${functionName} returned no data.`,
    );
  }
  return result.data;
}

function uploadBody(bytes: Uint8Array): PixyncSupabaseSdkUploadBody {
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE,
  });
}

function validateInput(input: PixyncCheckpointPublishInput): {
  readonly roomId: string;
  readonly bytes: Uint8Array;
} {
  const roomId = typeof input.projectId === "string"
    ? input.projectId.trim().toLowerCase()
    : "";
  const bytes = input.checkpointBytes instanceof Uint8Array
    ? new Uint8Array(input.checkpointBytes)
    : undefined;
  if (
    !UUID.test(roomId) || bytes === undefined || bytes.byteLength < 1 ||
    bytes.byteLength > PIXYNC_INITIAL_CHECKPOINT_MAX_BYTES ||
    !UUID.test(input.attestationClientId)
  ) {
    throw new PixyncCheckpointPublishError(
      "INVALID_INPUT",
      "The PiXYNC checkpoint publish input is invalid.",
    );
  }
  return { roomId, bytes };
}

/** Prepare, upload, register, attest, and activate one current-head checkpoint. */
export async function publishPixyncCheckpoint(
  client: PixyncSupabaseSdkClient,
  input: PixyncCheckpointPublishInput,
): Promise<PixyncPublishedCheckpoint> {
  const { roomId, bytes } = validateInput(input);
  await authenticatedClientUser(client);
  const storage: PixyncSupabaseSdkStorageBucket | undefined = client.storage
    ?.from(PIXYNC_INITIAL_CHECKPOINT_BUCKET);
  if (storage === undefined) {
    throw new PixyncCheckpointPublishError(
      "STORAGE_UNAVAILABLE",
      "PiXYNC checkpoint Storage is unavailable in this client.",
    );
  }
  const packageHash = await sha256Hex(bytes);
  if (!SHA256.test(packageHash)) {
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      "The checkpoint hash could not be created.",
    );
  }
  const requestedCheckpointId = crypto.randomUUID().toLowerCase();
  const prepare = exactlyOneRow(
    await rpcData(client, "pixisync_prepare_checkpoint", {
      p_room_id: roomId,
      p_checkpoint_id: requestedCheckpointId,
      p_state_sha256: `\\x${packageHash}`,
      p_encoded_bytes: bytes.byteLength,
      p_codec_version: PIXYNC_INITIAL_CHECKPOINT_CODEC_VERSION,
    }),
    "pixisync_prepare_checkpoint",
  );
  assertExactKeys(prepare, ["checkpoint_id", "revision", "storage_path"], "pixisync_prepare_checkpoint");
  const preparedCheckpointId = stringField(
    prepare,
    "checkpoint_id",
    "pixisync_prepare_checkpoint",
  ).toLowerCase();
  const revision = integerField(
    prepare,
    "revision",
    "pixisync_prepare_checkpoint",
    0,
  );
  const storagePath = stringField(
    prepare,
    "storage_path",
    "pixisync_prepare_checkpoint",
  );
  const expectedPath =
    `rooms/${roomId}/checkpoints/${revision}/${preparedCheckpointId}.pxd`;
  if (
    !UUID.test(preparedCheckpointId) || preparedCheckpointId !== requestedCheckpointId ||
    storagePath !== expectedPath
  ) {
    throw new PixyncCheckpointPublishError(
      "SERVER_PATH_MISMATCH",
      "The server returned an unexpected checkpoint identity or path.",
    );
  }

  let uploadResult;
  try {
    uploadResult = await storage.upload(storagePath, uploadBody(bytes), {
      contentType: PIXYNC_INITIAL_CHECKPOINT_MEDIA_TYPE,
      upsert: false,
    });
  } catch (cause) {
    throw new PixyncCheckpointPublishError(
      "UPLOAD_FAILED",
      "The PiXYNC checkpoint could not be uploaded.",
      { cause },
    );
  }
  if (uploadResult.error !== null || uploadResult.data === null) {
    throw new PixyncCheckpointPublishError(
      "UPLOAD_FAILED",
      "The PiXYNC checkpoint could not be uploaded.",
      { cause: uploadResult.error },
    );
  }

  const registered = exactlyOneRow(
    await rpcData(client, "pixisync_register_checkpoint", {
      p_room_id: roomId,
      p_checkpoint_id: preparedCheckpointId,
    }),
    "pixisync_register_checkpoint",
  );
  assertExactKeys(
    registered,
    ["checkpoint_id", "revision", "status"],
    "pixisync_register_checkpoint",
  );
  const checkpointId = stringField(
    registered,
    "checkpoint_id",
    "pixisync_register_checkpoint",
  ).toLowerCase();
  const registeredRevision = integerField(
    registered,
    "revision",
    "pixisync_register_checkpoint",
    0,
  );
  const registeredStatus = stringField(
    registered,
    "status",
    "pixisync_register_checkpoint",
  );
  if (
    !UUID.test(checkpointId) || registeredRevision !== revision ||
    (registeredStatus !== "candidate" && registeredStatus !== "verified")
  ) {
    throw new PixyncCheckpointPublishError(
      "SERVER_RESPONSE_INVALID",
      "The registered PiXYNC checkpoint did not match the prepared revision.",
    );
  }

  const attested = exactlyOneRow(
    await rpcData(client, "pixisync_attest_checkpoint", {
      p_checkpoint_id: checkpointId,
      p_client_id: input.attestationClientId.toLowerCase(),
      p_state_sha256: `\\x${packageHash}`,
    }),
    "pixisync_attest_checkpoint",
  );
  assertExactKeys(
    attested,
    [
      "checkpoint_id",
      "status",
      "attested_user_count",
      "required_user_count",
    ],
    "pixisync_attest_checkpoint",
  );
  const attestedCheckpointId = stringField(
    attested,
    "checkpoint_id",
    "pixisync_attest_checkpoint",
  ).toLowerCase();
  const attestedStatus = stringField(
    attested,
    "status",
    "pixisync_attest_checkpoint",
  );
  const attestedUserCount = integerField(
    attested,
    "attested_user_count",
    "pixisync_attest_checkpoint",
    0,
  );
  const requiredUserCount = integerField(
    attested,
    "required_user_count",
    "pixisync_attest_checkpoint",
    1,
  );
  if (
    attestedCheckpointId !== checkpointId ||
    (attestedStatus !== "candidate" && attestedStatus !== "verified") ||
    attestedUserCount > requiredUserCount ||
    (attestedStatus === "verified" && attestedUserCount < requiredUserCount) ||
    (attestedStatus === "candidate" && attestedUserCount >= requiredUserCount)
  ) {
    throw new PixyncCheckpointPublishError(
      "ATTESTATION_FAILED",
      "PiXYNC returned an unexpected checkpoint attestation state.",
    );
  }
  if (attestedStatus === "candidate") {
    return {
      requestedCheckpointId,
      checkpointId,
      revision,
      storagePath,
      packageHash,
      encodedBytes: bytes.byteLength,
      status: "candidate",
      attestedUserCount,
      requiredUserCount,
      active: false,
    };
  }

  const activated = exactlyOneRow(
    await rpcData(client, "pixisync_activate_verified_checkpoint", {
      p_room_id: roomId,
      p_checkpoint_id: checkpointId,
    }),
    "pixisync_activate_verified_checkpoint",
  );
  assertExactKeys(
    activated,
    ["checkpoint_id", "checkpoint_revision", "head_revision", "structure_epoch"],
    "pixisync_activate_verified_checkpoint",
  );
  const activatedCheckpointId = stringField(
    activated,
    "checkpoint_id",
    "pixisync_activate_verified_checkpoint",
  ).toLowerCase();
  const checkpointRevision = integerField(
    activated,
    "checkpoint_revision",
    "pixisync_activate_verified_checkpoint",
    0,
  );
  const headRevision = integerField(
    activated,
    "head_revision",
    "pixisync_activate_verified_checkpoint",
    revision,
  );
  const structureEpoch = integerField(
    activated,
    "structure_epoch",
    "pixisync_activate_verified_checkpoint",
    0,
  );
  if (
    activatedCheckpointId !== checkpointId || checkpointRevision !== revision ||
    headRevision < revision
  ) {
    throw new PixyncCheckpointPublishError(
      "ACTIVATION_FAILED",
      "PiXYNC returned an unexpected active checkpoint state.",
    );
  }
  return {
    requestedCheckpointId,
    checkpointId,
    revision,
    storagePath,
    packageHash,
    encodedBytes: bytes.byteLength,
    status: "verified",
    attestedUserCount,
    requiredUserCount,
    active: true,
    headRevision,
    structureEpoch,
  };
}
