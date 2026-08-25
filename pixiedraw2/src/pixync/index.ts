/** Public, transport-neutral Draw2 PiXYNC boundary. */

export { PIXYNC_DRAW2_SCHEMA_VERSION, PixyncError } from "./contracts.ts";
export type {
  PixyncAggregate,
  PixyncAggregateAdapter,
  PixyncApplyContext,
  PixyncCommittedOperation,
  PixyncCompensationGuard,
  PixyncJsonObject,
  PixyncJsonValue,
  PixyncOperationDraft,
  PixyncOperationResult,
  PixyncProjectSnapshot,
  PixyncRejectCode,
  PixyncRevisionReference,
} from "./contracts.ts";
export {
  createPixyncDraft,
  operationFingerprint,
  payloadHash,
  revisionReferences,
  validatePixyncCommitted,
  validatePixyncDraft,
  writerGuard,
} from "./core.ts";
export {
  makeDraft,
  PixyncInMemorySequencer,
  PixyncInMemoryTransport,
  PixyncOrderKeeper,
} from "./in-memory.ts";
export type { PixyncReceiveOutcome } from "./in-memory.ts";
