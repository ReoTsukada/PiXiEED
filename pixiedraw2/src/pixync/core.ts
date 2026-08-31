/** Deterministic validation and hashing for PIXYNC-DRAW2-100. */

import { canonicalJson, sha256Hex } from "../wp160-contracts.ts";
import {
  PIXYNC_DRAW2_SCHEMA_VERSION,
  type PixyncAggregate,
  type PixyncCommittedOperation,
  type PixyncCompensationGuard,
  PixyncError,
  type PixyncJsonObject,
  type PixyncJsonValue,
  type PixyncOperationDraft,
  type PixyncRevisionReference,
} from "./contracts.ts";

export const PIXYNC_DRAW2_MAX_PAYLOAD_BYTES = 16_384;
export const PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH = 8;
export const PIXYNC_DRAW2_MAX_PAYLOAD_KEYS = 96;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FORBIDDEN_KEY_PARTS = [
  "pointer",
  "preview",
  "snapshot",
  "rawaudioblob",
  "audioblob",
  "blob",
  "bytes",
  "pixels",
  "pixeldata",
  "pcm",
  "samples",
  "sampledata",
  "audiobuffer",
  "arraybuffer",
  "imagedata",
  "dom",
];
const REVISION_REFERENCE_KEYS = new Set([
  "operationId",
  "aggregate",
  "projectRevision",
  "aggregateRevision",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reject(
  code: ConstructorParameters<typeof PixyncError>[0],
  message: string,
  path?: string,
): never {
  throw new PixyncError(code, message, path);
}

function assertSafeId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    reject(
      "INVALID_ENVELOPE",
      "A bounded stable identifier is required.",
      path,
    );
  }
}

function assertAggregate(
  value: unknown,
  path: string,
): asserts value is PixyncAggregate {
  if (value !== "draw" && value !== "audio" && value !== "game") {
    reject("INVALID_ENVELOPE", "Unknown aggregate.", path);
  }
}

function assertNonNegativeInteger(
  value: unknown,
  path: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    reject(
      "INVALID_ENVELOPE",
      "A non-negative safe integer is required.",
      path,
    );
  }
}

function assertJsonValue(
  value: unknown,
  depth: number,
  path: string,
): asserts value is PixyncJsonValue {
  if (depth > PIXYNC_DRAW2_MAX_PAYLOAD_DEPTH) {
    reject(
      "PAYLOAD_TOO_LARGE",
      "Payload nesting exceeds the bounded command limit.",
      path,
    );
  }
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      reject("INVALID_ENVELOPE", "Payload numbers must be finite.", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
      reject(
        "PAYLOAD_TOO_LARGE",
        "Payload arrays exceed the bounded command limit.",
        path,
      );
    }
    value.forEach((item, index) =>
      assertJsonValue(item, depth + 1, `${path}[${index}]`)
    );
    return;
  }
  if (!isRecord(value)) {
    reject("INVALID_ENVELOPE", "Payload must contain JSON values only.", path);
  }
  const keys = Object.keys(value);
  if (keys.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS) {
    reject("PAYLOAD_TOO_LARGE", "Payload object has too many keys.", path);
  }
  for (const key of keys) {
    const normalized = key.toLowerCase().replaceAll("_", "");
    if (FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))) {
      reject(
        "PAYLOAD_FORBIDDEN",
        "UI previews, pointer samples, snapshots, and raw blobs are not sync payloads.",
        `${path}.${key}`,
      );
    }
    assertJsonValue(value[key], depth + 1, `${path}.${key}`);
  }
}

function assertRevisionReference(
  value: unknown,
  path: string,
): asserts value is PixyncRevisionReference {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !REVISION_REFERENCE_KEYS.has(key))
  ) {
    reject(
      "PAYLOAD_FORBIDDEN",
      "Revision references must not carry snapshots.",
      path,
    );
  }
  assertSafeId(value.operationId, `${path}.operationId`);
  assertAggregate(value.aggregate, `${path}.aggregate`);
  assertNonNegativeInteger(value.projectRevision, `${path}.projectRevision`);
  assertNonNegativeInteger(
    value.aggregateRevision,
    `${path}.aggregateRevision`,
  );
  if (
    (value.projectRevision as number) === 0 ||
    (value.aggregateRevision as number) === 0
  ) {
    reject(
      "INVALID_ENVELOPE",
      "A locked revision reference must point to a committed revision.",
      path,
    );
  }
}

function assertNestedRevisionReferences(value: unknown, path: string): void {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertNestedRevisionReferences(item, `${path}[${index}]`)
      );
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "revisionRef") assertRevisionReference(child, `${path}.${key}`);
    else assertNestedRevisionReferences(child, `${path}.${key}`);
  }
}

export async function payloadHash(
  payload: PixyncJsonObject,
): Promise<string> {
  assertJsonValue(payload, 0, "payload");
  assertNestedRevisionReferences(payload, "payload");
  const serialized = canonicalJson(payload);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > PIXYNC_DRAW2_MAX_PAYLOAD_BYTES) {
    reject(
      "PAYLOAD_TOO_LARGE",
      "Payload exceeds the bounded command limit.",
      "payload",
    );
  }
  return sha256Hex(serialized);
}

export async function createPixyncDraft(
  input: Omit<PixyncOperationDraft, "payloadHash" | "schemaVersion">,
): Promise<PixyncOperationDraft> {
  return {
    schemaVersion: PIXYNC_DRAW2_SCHEMA_VERSION,
    ...input,
    payloadHash: await payloadHash(input.payload),
  };
}

export async function validatePixyncDraft(
  draft: PixyncOperationDraft,
): Promise<void> {
  if (
    !isRecord(draft) || draft.schemaVersion !== PIXYNC_DRAW2_SCHEMA_VERSION
  ) {
    reject(
      "INVALID_ENVELOPE",
      "Unsupported PiXYNC Draw2 envelope schema.",
      "schemaVersion",
    );
  }
  assertSafeId(draft.operationId, "operationId");
  assertSafeId(draft.projectId, "projectId");
  assertAggregate(draft.aggregate, "aggregate");
  assertSafeId(draft.actorId, "actorId");
  assertSafeId(draft.clientId, "clientId");
  if (
    !Number.isSafeInteger(draft.clientSequence) || draft.clientSequence <= 0
  ) {
    reject(
      "INVALID_ENVELOPE",
      "clientSequence must be a positive safe integer.",
      "clientSequence",
    );
  }
  assertNonNegativeInteger(draft.baseProjectRevision, "baseProjectRevision");
  assertNonNegativeInteger(draft.aggregateRevision, "aggregateRevision");
  if (
    typeof draft.payloadHash !== "string" || !SHA256.test(draft.payloadHash)
  ) {
    reject(
      "INVALID_ENVELOPE",
      "payloadHash must be a lowercase SHA-256 value.",
      "payloadHash",
    );
  }
  if (!isRecord(draft.payload)) {
    reject("INVALID_ENVELOPE", "payload must be a JSON object.", "payload");
  }
  const expectedHash = await payloadHash(draft.payload as PixyncJsonObject);
  if (expectedHash !== draft.payloadHash) {
    reject(
      "PAYLOAD_HASH_MISMATCH",
      "payloadHash does not match the canonical payload.",
      "payloadHash",
    );
  }
  if (draft.compensation !== undefined) assertCompensation(draft.compensation);
}

function assertCompensation(
  value: unknown,
): asserts value is PixyncCompensationGuard {
  if (!isRecord(value)) {
    reject(
      "INVALID_ENVELOPE",
      "Compensation guard must be an object.",
      "compensation",
    );
  }
  assertSafeId(value.targetOperationId, "compensation.targetOperationId");
  const hasRevision = value.expectedAggregateRevision !== undefined;
  const hasWriter = value.writerGuard !== undefined;
  if (!hasRevision && !hasWriter) {
    reject(
      "INVALID_ENVELOPE",
      "Compensation requires a revision or writer guard.",
      "compensation",
    );
  }
  if (hasRevision) {
    assertNonNegativeInteger(
      value.expectedAggregateRevision,
      "compensation.expectedAggregateRevision",
    );
  }
  if (hasWriter) assertSafeId(value.writerGuard, "compensation.writerGuard");
}

export async function operationFingerprint(
  operation: PixyncOperationDraft | PixyncCommittedOperation,
): Promise<string> {
  return sha256Hex(canonicalJson({
    schemaVersion: operation.schemaVersion,
    operationId: operation.operationId,
    projectId: operation.projectId,
    aggregate: operation.aggregate,
    actorId: operation.actorId,
    clientId: operation.clientId,
    clientSequence: operation.clientSequence,
    baseProjectRevision: operation.baseProjectRevision,
    payloadHash: operation.payloadHash,
    payload: operation.payload,
    compensation: operation.compensation,
  }));
}

export async function committedOperationFingerprint(
  operation: PixyncCommittedOperation,
): Promise<string> {
  return sha256Hex(canonicalJson({
    submissionFingerprint: await operationFingerprint(operation),
    projectRevision: operation.projectRevision,
    aggregateRevision: operation.aggregateRevision,
  }));
}

export function writerGuard(operation: PixyncCommittedOperation): string {
  return `${operation.aggregate}:${operation.aggregateRevision}:${operation.operationId}`;
}

export async function validatePixyncCommitted(
  operation: PixyncCommittedOperation,
): Promise<void> {
  await validatePixyncDraft(operation);
  if (
    !Number.isSafeInteger(operation.projectRevision) ||
    operation.projectRevision <= 0
  ) {
    reject(
      "INVALID_ENVELOPE",
      "Committed projectRevision must be positive.",
      "projectRevision",
    );
  }
  if (
    typeof operation.committedAt !== "string" ||
    !Number.isFinite(Date.parse(operation.committedAt))
  ) {
    reject(
      "INVALID_ENVELOPE",
      "Committed timestamp must be a valid ISO timestamp.",
      "committedAt",
    );
  }
}

export function revisionReferences(
  payload: PixyncJsonObject,
): readonly PixyncRevisionReference[] {
  const references: PixyncRevisionReference[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "revisionRef") {
        references.push(child as PixyncRevisionReference);
      } else visit(child);
    }
  };
  visit(payload);
  return references;
}
