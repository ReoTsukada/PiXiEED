/**
 * PIXYNC-DRAW2-100 contract boundary.
 * JSON-only, deterministic, transport-agnostic, and deliberately UI-free.
 */

export const PIXYNC_DRAW2_SCHEMA_VERSION =
  "PIXYNC_DRAW2_OPERATION_V1" as const;

export type PixyncAggregate = "draw" | "audio" | "game";

export interface PixyncJsonObject {
  readonly [key: string]: PixyncJsonValue;
}

export type PixyncJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PixyncJsonValue[]
  | PixyncJsonObject;

export interface PixyncRevisionReference {
  readonly operationId: string;
  readonly aggregate: PixyncAggregate;
  readonly projectRevision: number;
  readonly aggregateRevision: number;
}

export interface PixyncCompensationGuard {
  readonly targetOperationId: string;
  readonly expectedAggregateRevision?: number;
  readonly writerGuard?: string;
}

export interface PixyncOperationDraft {
  readonly schemaVersion: typeof PIXYNC_DRAW2_SCHEMA_VERSION;
  readonly operationId: string;
  readonly projectId: string;
  readonly aggregate: PixyncAggregate;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseProjectRevision: number;
  readonly aggregateRevision: number;
  readonly payloadHash: string;
  readonly payload: PixyncJsonObject;
  readonly compensation?: PixyncCompensationGuard;
}

export interface PixyncCommittedOperation extends PixyncOperationDraft {
  readonly projectRevision: number;
  readonly committedAt: string;
}

export interface PixyncApplyContext {
  readonly source: "sequencer" | "remote";
  readonly projectRevision: number;
  readonly aggregateRevision: number;
}

export interface PixyncAggregateAdapter {
  readonly aggregate: PixyncAggregate;
  readonly apply: (
    operation: PixyncCommittedOperation,
    context: PixyncApplyContext,
  ) => void | Promise<void>;
}

export interface PixyncOperationResult {
  readonly operation: PixyncCommittedOperation;
  readonly duplicate: boolean;
}

export interface PixyncProjectSnapshot {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly aggregateRevisions: Readonly<Record<PixyncAggregate, number>>;
  readonly operationIds: readonly string[];
}

export type PixyncRejectCode =
  | "INVALID_ENVELOPE"
  | "PAYLOAD_HASH_MISMATCH"
  | "PAYLOAD_FORBIDDEN"
  | "PAYLOAD_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "PROJECT_MISMATCH"
  | "AGGREGATE_REVISION_STALE"
  | "COMPENSATION_GUARD_STALE"
  | "AGGREGATE_APPLY_FAILED"
  | "SEQUENCER_NOT_CONTIGUOUS"
  | "GAP_HELD";

export class PixyncError extends Error {
  readonly code: PixyncRejectCode;
  readonly path: string | undefined;

  constructor(code: PixyncRejectCode, message: string, path?: string) {
    super(message);
    this.name = "PixyncError";
    this.code = code;
    this.path = path;
  }
}
