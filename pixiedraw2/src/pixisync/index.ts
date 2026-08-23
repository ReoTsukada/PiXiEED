/** Public, transport-neutral Draw2 PiXiSYNC boundary. */

export { PIXISYNC_DRAW2_SCHEMA_VERSION, PixisyncError } from "./contracts.ts";
export type {
  PixisyncAggregate,
  PixisyncAggregateAdapter,
  PixisyncApplyContext,
  PixisyncCommittedOperation,
  PixisyncCompensationGuard,
  PixisyncJsonObject,
  PixisyncJsonValue,
  PixisyncOperationDraft,
  PixisyncOperationResult,
  PixisyncProjectSnapshot,
  PixisyncRejectCode,
  PixisyncRevisionReference,
} from "./contracts.ts";
export {
  createPixisyncDraft,
  operationFingerprint,
  payloadHash,
  revisionReferences,
  validatePixisyncCommitted,
  validatePixisyncDraft,
  writerGuard,
} from "./core.ts";
export {
  makeDraft,
  PixisyncInMemorySequencer,
  PixisyncInMemoryTransport,
  PixisyncOrderKeeper,
} from "./in-memory.ts";
export type { PixisyncReceiveOutcome } from "./in-memory.ts";
