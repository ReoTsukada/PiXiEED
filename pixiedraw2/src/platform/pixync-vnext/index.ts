/**
 * PiXYNC vNext local Project aggregate adapter.
 *
 * This is a pure, provider-independent contract. It deliberately does not
 * replace the existing PiXYNC transport, persist data, or treat local state
 * as server authority. A future provider can implement the port below and
 * use the same validation/state-machine rules.
 */

import type { ContentReference } from "../content/index.ts";

export const PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION = 1 as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const HASH = /^(?:fnv1a64:[a-f0-9]{16}|[a-f0-9]{64})$/u;

export type PixyncVNextConnectionState =
  | "READY"
  | "OFFLINE"
  | "AUTH_REVOKED"
  | "UNAVAILABLE";

export type PixyncVNextProjectEventKind =
  | "PROJECT_REPLACED"
  | "ASSET_BINDING_ADDED"
  | "ASSET_BINDING_REMOVED"
  | "CONTENT_REFERENCE_ADDED"
  | "CONTENT_REFERENCE_REMOVED";

export interface PixyncVNextAssetBinding {
  readonly bindingId: string;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly licenseId: string;
  readonly slot: string;
  readonly mode: "iDRAW" | "iAUDIO" | "iGAME";
}

export interface PixyncVNextProjectAggregate {
  readonly schemaVersion: typeof PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly assetBindings: readonly PixyncVNextAssetBinding[];
  readonly contentReferences: readonly ContentReference[];
}

export interface PixyncVNextProjectEvent {
  readonly schemaVersion: typeof PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly projectId: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly contentHash: string;
  readonly actorId: string;
  readonly kind: PixyncVNextProjectEventKind;
  readonly aggregate: PixyncVNextProjectAggregate;
}

export interface PixyncVNextCheckpoint {
  readonly schemaVersion: typeof PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly lastOperationId: string;
  readonly lastOperationFingerprint: string;
  readonly aggregate: PixyncVNextProjectAggregate;
}

export interface PixyncVNextTail {
  readonly projectId: string;
  readonly fromRevision: number;
  readonly events: readonly PixyncVNextProjectEvent[];
}

export interface PixyncVNextJournal {
  readonly connection: PixyncVNextConnectionState;
  readonly project: PixyncVNextProjectAggregate | null;
  readonly headRevision: number;
  readonly checkpointRevision: number;
  readonly tailFromRevision: number;
  readonly events: readonly PixyncVNextProjectEvent[];
  readonly appliedOperationIds: readonly string[];
  readonly appliedIdempotencyKeys: readonly string[];
  readonly operationFingerprints: readonly {
    readonly operationId: string;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
  }[];
  readonly reason?: PixyncVNextRejectCode;
}

export type PixyncVNextRejectCode =
  | "INVALID_EVENT"
  | "INVALID_CHECKPOINT"
  | "INVALID_TAIL"
  | "PROJECT_MISMATCH"
  | "REVISION_GAP"
  | "REVISION_CONFLICT"
  | "DUPLICATE_CONFLICT"
  | "AUTH_REVOKED"
  | "OFFLINE"
  | "UNAVAILABLE";

export interface PixyncVNextAccepted {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly journal: PixyncVNextJournal;
}

export interface PixyncVNextRejected {
  readonly accepted: false;
  readonly code: PixyncVNextRejectCode;
  readonly message: string;
  readonly journal: PixyncVNextJournal;
}

export type PixyncVNextApplyResult =
  | PixyncVNextAccepted
  | PixyncVNextRejected;

export interface PixyncVNextProvider {
  open(projectId: string): Promise<PixyncVNextJournal>;
  append(event: PixyncVNextProjectEvent): Promise<PixyncVNextApplyResult>;
  readTail(projectId: string, fromRevision: number): Promise<PixyncVNextTail | null>;
  readCheckpoint(projectId: string): Promise<PixyncVNextCheckpoint | null>;
  close(projectId: string): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

function validRevision(value: unknown, allowZero = false): value is number {
  return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  return actual.length === expected.size && actual.every((key) => expected.has(key));
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function validContentReference(value: unknown): value is ContentReference {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "PROJECT") {
    return exactKeys(value, ["kind", "projectId", "relation"]) && validId(value.projectId) &&
      ["BELONGS_TO", "USED_BY"].includes(String(value.relation));
  }
  if (value.kind === "ASSET_PACKAGE") {
    return exactKeys(value, ["kind", "assetPackageId", "revisionId", "contentHash", "relation"]) &&
      validId(value.assetPackageId) && validId(value.revisionId) && validHash(value.contentHash) &&
      ["USES", "DERIVED_FROM", "EMBEDS"].includes(String(value.relation));
  }
  if (value.kind === "CONTENT") {
    return exactKeys(value, ["kind", "contentId", "revisionId", "contentHash", "relation"]) &&
      validId(value.contentId) && validId(value.revisionId) && validHash(value.contentHash) &&
      ["DERIVED_FROM", "EXPANDS", "REFERENCES"].includes(String(value.relation));
  }
  if (value.kind === "MEDIA") {
    const hasOwner = validId(value.assetPackageId) || validId(value.contentId);
    return onlyKeys(value, ["kind", "mediaKind", "assetPackageId", "contentId", "revisionId", "contentHash", "relation"]) &&
      validId(value.kind) &&
      hasOwner && ["IMAGE", "AUDIO", "VIDEO", "GAME"].includes(String(value.mediaKind)) &&
      validId(value.revisionId) && validHash(value.contentHash) &&
      ["ILLUSTRATES", "SOUNDSCAPES", "EMBEDDED_GAMEPLAY"].includes(String(value.relation));
  }
  return false;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function hashValue(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function aggregateHash(
  aggregate: PixyncVNextProjectAggregate,
): string {
  return hashValue({
    schemaVersion: aggregate.schemaVersion,
    projectId: aggregate.projectId,
    projectRevision: aggregate.projectRevision,
    assetBindings: aggregate.assetBindings,
    contentReferences: aggregate.contentReferences,
  });
}

/** Hash used by providers when constructing or persisting a Project event. */
export function pixyncVNextProjectContentHash(
  aggregate: PixyncVNextProjectAggregate,
): string {
  return aggregateHash(aggregate);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function reject(
  journal: PixyncVNextJournal,
  code: PixyncVNextRejectCode,
  message: string,
): PixyncVNextRejected {
  return {
    accepted: false,
    code,
    message,
    journal: { ...journal, reason: code },
  };
}

function emptyJournal(
  projectId: string,
  connection: PixyncVNextConnectionState = "UNAVAILABLE",
): PixyncVNextJournal {
  const project = validId(projectId) ? {
    schemaVersion: PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION,
    projectId,
    projectRevision: 0,
    assetBindings: [],
    contentReferences: [],
  } : null;
  return {
    connection,
    project,
    headRevision: 0,
    checkpointRevision: 0,
    tailFromRevision: 1,
    events: [],
    appliedOperationIds: [],
    appliedIdempotencyKeys: [],
    operationFingerprints: [],
  };
}

export function validateProjectAggregate(
  value: unknown,
): value is PixyncVNextProjectAggregate {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "projectId", "projectRevision", "assetBindings", "contentReferences"]) || value.schemaVersion !== PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION) return false;
  if (!validId(value.projectId) || !validRevision(value.projectRevision, true)) return false;
  if (!Array.isArray(value.assetBindings) || !Array.isArray(value.contentReferences)) return false;
  if (value.assetBindings.some((binding) => {
    if (!isRecord(binding)) return true;
    return !exactKeys(binding, ["bindingId", "assetId", "revisionId", "contentHash", "licenseId", "slot", "mode"]) || !validId(binding.bindingId) || !validId(binding.assetId) ||
      !validId(binding.revisionId) || !validHash(binding.contentHash) ||
      !validId(binding.licenseId) || !validId(binding.slot) ||
      !["iDRAW", "iAUDIO", "iGAME"].includes(String(binding.mode));
  })) return false;
  return value.contentReferences.every(validContentReference);
}

export function validateProjectEvent(
  value: unknown,
): value is PixyncVNextProjectEvent {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "eventId", "projectId", "baseRevision", "revision", "operationId", "idempotencyKey", "contentHash", "actorId", "kind", "aggregate"]) || value.schemaVersion !== PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION) return false;
  if (!validId(value.eventId) || !validId(value.projectId) || !validId(value.operationId) ||
    !validId(value.idempotencyKey) || !validId(value.actorId) || !validHash(value.contentHash) ||
    !validRevision(value.baseRevision, true) || !validRevision(value.revision)) return false;
  if (![
    "PROJECT_REPLACED",
    "ASSET_BINDING_ADDED",
    "ASSET_BINDING_REMOVED",
    "CONTENT_REFERENCE_ADDED",
    "CONTENT_REFERENCE_REMOVED",
  ].includes(String(value.kind))) return false;
  const aggregate = value.aggregate;
  return validateProjectAggregate(aggregate) && aggregate.projectId === value.projectId &&
    aggregate.projectRevision === value.revision && aggregateHash(aggregate) === value.contentHash;
}

function eventFingerprint(event: PixyncVNextProjectEvent): string {
  return hashValue({
    projectId: event.projectId,
    baseRevision: event.baseRevision,
    revision: event.revision,
    operationId: event.operationId,
    idempotencyKey: event.idempotencyKey,
    contentHash: event.contentHash,
    actorId: event.actorId,
    kind: event.kind,
    aggregate: event.aggregate,
  });
}

function applyEvent(
  journal: PixyncVNextJournal,
  event: PixyncVNextProjectEvent,
): PixyncVNextApplyResult {
  if (journal.connection === "AUTH_REVOKED") return reject(journal, "AUTH_REVOKED", "PiXYNC authority has been revoked.");
  if (journal.connection === "OFFLINE") return reject(journal, "OFFLINE", "PiXYNC provider is not connected.");
  if (journal.connection !== "READY") return reject(journal, "UNAVAILABLE", "PiXYNC provider is unavailable.");
  if (!validateProjectEvent(event)) return reject(journal, "INVALID_EVENT", "Project event validation failed.");
  if (journal.project !== null && journal.project.projectId !== event.projectId) return reject(journal, "PROJECT_MISMATCH", "Event belongs to another Project.");

  const existingByOperation = journal.events.find((item) => item.operationId === event.operationId) ??
    journal.operationFingerprints.find((item) => item.operationId === event.operationId);
  const existingByIdempotency = journal.events.find((item) => item.idempotencyKey === event.idempotencyKey) ??
    journal.operationFingerprints.find((item) => item.idempotencyKey === event.idempotencyKey);
  if (existingByOperation || existingByIdempotency) {
    const existing = existingByOperation ?? existingByIdempotency;
    const fingerprint = existing !== undefined && "fingerprint" in existing
      ? existing.fingerprint
      : eventFingerprint(existing as PixyncVNextProjectEvent);
    if (existing !== undefined && fingerprint === eventFingerprint(event)) {
      return { accepted: true, duplicate: true, journal };
    }
    return reject(journal, "DUPLICATE_CONFLICT", "Operation or idempotency key was reused with different content.");
  }
  if (event.baseRevision !== journal.headRevision || event.revision !== journal.headRevision + 1) {
    return reject(journal, event.revision <= journal.headRevision ? "REVISION_CONFLICT" : "REVISION_GAP", "Project revisions are not contiguous.");
  }

  const next: PixyncVNextJournal = {
    ...journal,
    project: event.aggregate,
    headRevision: event.revision,
    tailFromRevision: event.revision + 1,
    events: [...journal.events, event],
    appliedOperationIds: [...journal.appliedOperationIds, event.operationId],
    appliedIdempotencyKeys: [...journal.appliedIdempotencyKeys, event.idempotencyKey],
    operationFingerprints: [...journal.operationFingerprints, {
      operationId: event.operationId,
      idempotencyKey: event.idempotencyKey,
      fingerprint: eventFingerprint(event),
    }],
    reason: undefined,
  };
  return { accepted: true, duplicate: false, journal: next };
}

export class PixyncVNextLocalProjectAdapter {
  #journal: PixyncVNextJournal;

  constructor(projectId: string) {
    this.#journal = emptyJournal(projectId);
  }

  snapshot(): PixyncVNextJournal {
    return {
      ...this.#journal,
      events: [...this.#journal.events],
      appliedOperationIds: [...this.#journal.appliedOperationIds],
      appliedIdempotencyKeys: [...this.#journal.appliedIdempotencyKeys],
      operationFingerprints: [...this.#journal.operationFingerprints],
    };
  }

  setConnection(connection: PixyncVNextConnectionState): PixyncVNextJournal {
    this.#journal = { ...this.#journal, connection, reason: undefined };
    return this.snapshot();
  }

  revokeAuthority(): PixyncVNextJournal {
    return this.setConnection("AUTH_REVOKED");
  }

  apply(event: PixyncVNextProjectEvent): PixyncVNextApplyResult {
    const result = applyEvent(this.#journal, event);
    this.#journal = result.journal;
    return result;
  }

  applyCheckpoint(checkpoint: PixyncVNextCheckpoint): PixyncVNextApplyResult {
    if (this.#journal.connection !== "READY") {
      const code = this.#journal.connection === "AUTH_REVOKED" ? "AUTH_REVOKED" : this.#journal.connection === "OFFLINE" ? "OFFLINE" : "UNAVAILABLE";
      return reject(this.#journal, code, "Checkpoint cannot be applied without provider authority.");
    }
    if (!isRecord(checkpoint) || !exactKeys(checkpoint, ["schemaVersion", "projectId", "revision", "contentHash", "lastOperationId", "lastOperationFingerprint", "aggregate"]) || checkpoint.schemaVersion !== PIXYNC_VNEXT_PROJECT_SCHEMA_VERSION ||
      !validId(checkpoint.projectId) || !validRevision(checkpoint.revision) ||
      !validId(checkpoint.lastOperationId) || !validHash(checkpoint.contentHash) || !validHash(checkpoint.lastOperationFingerprint) ||
      !validateProjectAggregate(checkpoint.aggregate) || checkpoint.aggregate.projectId !== checkpoint.projectId ||
      checkpoint.aggregate.projectRevision !== checkpoint.revision || aggregateHash(checkpoint.aggregate) !== checkpoint.contentHash) {
      return reject(this.#journal, "INVALID_CHECKPOINT", "Checkpoint validation failed.");
    }
    if (this.#journal.project !== null && this.#journal.project.projectId !== checkpoint.projectId) return reject(this.#journal, "PROJECT_MISMATCH", "Checkpoint belongs to another Project.");
    if (checkpoint.revision < this.#journal.headRevision) return reject(this.#journal, "REVISION_CONFLICT", "Checkpoint rewinds the Project revision.");
    if (checkpoint.revision === this.#journal.headRevision && this.#journal.project !== null && !sameJson(this.#journal.project, checkpoint.aggregate)) return reject(this.#journal, "REVISION_CONFLICT", "Checkpoint conflicts with the current revision.");
    this.#journal = {
      ...this.#journal,
      project: checkpoint.aggregate,
      headRevision: checkpoint.revision,
      checkpointRevision: checkpoint.revision,
      tailFromRevision: checkpoint.revision + 1,
      events: this.#journal.events.filter((event) => event.revision > checkpoint.revision),
      appliedOperationIds: [checkpoint.lastOperationId],
      appliedIdempotencyKeys: [...this.#journal.appliedIdempotencyKeys],
      operationFingerprints: [{
        operationId: checkpoint.lastOperationId,
        idempotencyKey: "checkpoint",
        fingerprint: checkpoint.lastOperationFingerprint,
      }],
      reason: undefined,
    };
    return { accepted: true, duplicate: false, journal: this.snapshot() };
  }

  applyTail(tail: PixyncVNextTail): PixyncVNextApplyResult {
    if (!validId(tail?.projectId) || !validRevision(tail?.fromRevision) || !Array.isArray(tail?.events) || tail.events.length === 0) return reject(this.#journal, "INVALID_TAIL", "Tail metadata is invalid.");
    if (tail.projectId !== this.#journal.project?.projectId || tail.fromRevision !== this.#journal.headRevision + 1) return reject(this.#journal, "REVISION_GAP", "Tail does not start at the next Project revision.");
    let result: PixyncVNextApplyResult = { accepted: true, duplicate: false, journal: this.#journal };
    for (const event of tail.events) {
      if (!result.accepted) return result;
      result = applyEvent(this.#journal, event);
      if (result.accepted) this.#journal = result.journal;
    }
    return result;
  }
}

export function createUnavailableProjectProvider(
  reason = "PiXYNC vNext provider is not connected.",
): PixyncVNextProvider {
  return {
    open: async (projectId) => emptyJournal(projectId),
    append: async (event) => reject(emptyJournal(event.projectId), "UNAVAILABLE", reason),
    readTail: async () => null,
    readCheckpoint: async () => null,
    close: async () => undefined,
  };
}
