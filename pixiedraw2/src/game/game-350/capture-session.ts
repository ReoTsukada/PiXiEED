import type {
  GamePlaygroundDrawReference,
  GamePlaygroundRect,
  GamePlaygroundSourceFrame,
} from "./playground.ts";
import {
  updateGameWorkspaceReturnContext,
  type GameWorkspaceReturnContext,
} from "./workspace-context.ts";

export type CaptureSessionState =
  | "SELECTING"
  | "READY"
  | "COMMITTED"
  | "CANCELLED";

export type CaptureSessionTarget =
  | { readonly kind: "NEW_ASSET" }
  | { readonly kind: "EXISTING_ASSET"; readonly assetId: string };

export interface CaptureReturnContext extends GameWorkspaceReturnContext {
  /** Compatibility names consumed by the existing workspace adapter. */
  readonly inspectorPanel?: string;
  readonly railScrollTop?: number;
}

export const updateCaptureReturnContext = (
  context: CaptureReturnContext,
  patch: Partial<Omit<CaptureReturnContext, "selection">>,
): CaptureReturnContext => updateGameWorkspaceReturnContext(context, patch);

export interface CaptureDraft {
  readonly reference: GamePlaygroundDrawReference;
  readonly rect: GamePlaygroundRect;
  readonly sourceFrames: readonly GamePlaygroundSourceFrame[];
}

export interface CaptureSession {
  readonly sessionId: string;
  readonly draftGeneration: number;
  readonly state: CaptureSessionState;
  readonly source: "DRAW";
  readonly target: CaptureSessionTarget;
  readonly draft?: CaptureDraft;
  readonly returnContext: CaptureReturnContext;
}

export const beginCaptureSession = (
  target: CaptureSessionTarget,
  returnContext: CaptureReturnContext,
  sessionId = "capture:1",
): CaptureSession => ({
  sessionId,
  draftGeneration: 0,
  state: "SELECTING",
  source: "DRAW",
  target,
  returnContext,
});

export const updateCaptureSessionDraft = (
  session: CaptureSession,
  draft: CaptureDraft,
): CaptureSession => session.state === "SELECTING" || session.state === "READY"
  ? {
    ...session,
    state: "READY",
    draft,
    draftGeneration: session.draftGeneration + 1,
  }
  : session;

export const commitCaptureSession = (
  session: CaptureSession,
): CaptureSession | undefined => session.state === "READY" && session.draft !== undefined
  ? { ...session, state: "COMMITTED" }
  : undefined;

export const cancelCaptureSession = (
  session: CaptureSession,
): CaptureSession | undefined => session.state === "SELECTING" || session.state === "READY"
  ? { ...session, state: "CANCELLED" }
  : undefined;

const stableJson = (value: unknown): string => JSON.stringify(value);

/** Same source/revision/rect/frame order means the same reusable Game Asset. */
export const captureDraftKey = (draft: CaptureDraft): string => stableJson({
  assetId: draft.reference.assetId,
  revisionId: draft.reference.revisionId,
  contentHash: draft.reference.contentHash,
  rect: draft.rect,
  sourceFrames: draft.sourceFrames,
});

/** Stable Game-owned identity; the iDRAW source assetId remains in source. */
export const gameAssetIdForCapture = (draft: CaptureDraft): string => {
  let hash = 2166136261;
  for (const char of captureDraftKey(draft)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `game-asset:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const splitCaptureRectInto32Frames = (
  rect: GamePlaygroundRect,
  sourceFrameId: string,
): readonly GamePlaygroundSourceFrame[] => {
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
    rect.width <= 0 || rect.height <= 0
  ) {
    throw new RangeError("Capture rectangle must contain finite coordinates and positive dimensions");
  }
  const columns = Math.floor(rect.width / 32);
  const rows = Math.floor(rect.height / 32);
  if (columns < 1 || rows < 1 || rect.width % 32 !== 0 || rect.height % 32 !== 0) {
    return [{ sourceFrameId, rect: { ...rect } }];
  }
  const frameCount = columns * rows;
  if (
    !Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) ||
    !Number.isSafeInteger(frameCount) || frameCount > 4096
  ) {
    throw new RangeError("Capture rectangle exceeds the 4096-frame limit");
  }
  return Array.from({ length: columns * rows }, (_, index) => ({
    sourceFrameId,
    rect: {
      x: rect.x + (index % columns) * 32,
      y: rect.y + Math.floor(index / columns) * 32,
      width: 32,
      height: 32,
    },
  }));
};

export const captureFrameCountAllowed = (
  sourceFrames: readonly GamePlaygroundSourceFrame[],
): boolean => sourceFrames.length > 0 && sourceFrames.length <= 4096;

/**
 * Split a selected Draw region into an ordered sprite-sheet grid.
 *
 * The Game side stores coordinates and source frame IDs only.  The default
 * 32px cell keeps the existing beginner path intact, while explicit cell
 * dimensions allow a Draw 16px/custom-grid selection to return without
 * flattening it into a single frame.
 */
export const splitCaptureRectIntoGridFrames = (
  rect: GamePlaygroundRect,
  sourceFrameId: string,
  cellWidth = 32,
  cellHeight = cellWidth,
  layerIds?: readonly string[],
): readonly GamePlaygroundSourceFrame[] => {
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
    rect.width <= 0 || rect.height <= 0 ||
    !Number.isSafeInteger(cellWidth) || cellWidth <= 0 ||
    !Number.isSafeInteger(cellHeight) || cellHeight <= 0 ||
    sourceFrameId.trim().length === 0
  ) {
    throw new RangeError("Capture grid must contain finite coordinates, positive dimensions, and a source frame");
  }
  const columns = Math.floor(rect.width / cellWidth);
  const rows = Math.floor(rect.height / cellHeight);
  const normalizedLayerIds = layerIds === undefined
    ? undefined
    : [...new Set(layerIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (
    columns < 1 || rows < 1 || rect.width % cellWidth !== 0 ||
    rect.height % cellHeight !== 0
  ) {
    return [{
      sourceFrameId,
      ...(normalizedLayerIds === undefined ? {} : { layerIds: normalizedLayerIds }),
      rect: { ...rect },
    }];
  }
  const frameCount = columns * rows;
  if (!Number.isSafeInteger(frameCount) || frameCount > 4096) {
    throw new RangeError("Capture rectangle exceeds the 4096-frame limit");
  }
  return Array.from({ length: frameCount }, (_, index) => ({
    sourceFrameId,
    ...(normalizedLayerIds === undefined ? {} : { layerIds: normalizedLayerIds }),
    rect: {
      x: rect.x + (index % columns) * cellWidth,
      y: rect.y + Math.floor(index / columns) * cellHeight,
      width: cellWidth,
      height: cellHeight,
    },
  }));
};
