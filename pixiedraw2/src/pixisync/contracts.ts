/**
 * PIXISYNC-DRAW2-100 contract boundary.
 * JSON-only, deterministic, transport-agnostic, and deliberately UI-free.
 */

export const PIXISYNC_DRAW2_SCHEMA_VERSION =
  "PIXSYNC_DRAW2_OPERATION_V1" as const;

export type PixisyncAggregate = "draw" | "audio" | "game";

export interface PixisyncJsonObject {
  readonly [key: string]: PixisyncJsonValue;
}

export type PixisyncJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly PixisyncJsonValue[]
  | PixisyncJsonObject;

export interface PixisyncRevisionReference {
  readonly operationId: string;
  readonly aggregate: PixisyncAggregate;
  readonly projectRevision: number;
  readonly aggregateRevision: number;
}

export interface PixisyncCompensationGuard {
  readonly targetOperationId: string;
  readonly expectedAggregateRevision?: number;
  readonly writerGuard?: string;
}

export interface PixisyncOperationDraft {
  readonly schemaVersion: typeof PIXISYNC_DRAW2_SCHEMA_VERSION;
  readonly operationId: string;
  readonly projectId: string;
  readonly aggregate: PixisyncAggregate;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseProjectRevision: number;
  readonly aggregateRevision: number;
  readonly payloadHash: string;
  readonly payload: PixisyncJsonObject;
  readonly compensation?: PixisyncCompensationGuard;
}

export interface PixisyncCommittedOperation extends PixisyncOperationDraft {
  readonly projectRevision: number;
  readonly committedAt: string;
}

export interface PixisyncApplyContext {
  readonly source: "sequencer" | "remote";
  readonly projectRevision: number;
  readonly aggregateRevision: number;
}

export interface PixisyncAggregateAdapter {
  readonly aggregate: PixisyncAggregate;
  readonly apply: (
    operation: PixisyncCommittedOperation,
    context: PixisyncApplyContext,
  ) => void | Promise<void>;
}

export interface PixisyncOperationResult {
  readonly operation: PixisyncCommittedOperation;
  readonly duplicate: boolean;
}

export interface PixisyncProjectSnapshot {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly aggregateRevisions: Readonly<Record<PixisyncAggregate, number>>;
  readonly operationIds: readonly string[];
}

export type PixisyncRejectCode =
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

export class PixisyncError extends Error {
  readonly code: PixisyncRejectCode;
  readonly path: string | undefined;

  constructor(code: PixisyncRejectCode, message: string, path?: string) {
    super(message);
    this.name = "PixisyncError";
    this.code = code;
    this.path = path;
  }
}
