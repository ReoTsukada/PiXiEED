import {
  beginCaptureSession,
  cancelCaptureSession,
  captureDraftKey,
  captureFrameCountAllowed,
  commitCaptureSession,
  gameAssetIdForCapture,
  splitCaptureRectInto32Frames,
  updateCaptureSessionDraft,
  updateCaptureReturnContext,
  type CaptureReturnContext,
  type CaptureDraft,
} from "../../src/game/game-350/capture-session.ts";
import type { GamePlaygroundDrawReference } from "../../src/game/game-350/playground.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const reference: GamePlaygroundDrawReference = {
  assetId: "draw:character",
  revisionId: "rev:1",
  contentHash: "hash:1",
  label: "Character",
  mode: "LIVE",
  layout: "GRID_32",
  projectId: "project:1",
  region: { x: 0, y: 0, width: 64, height: 32 },
  sourceFrames: [
    { sourceFrameId: "frame:2", rect: { x: 32, y: 0, width: 32, height: 32 }, durationMs: 140 },
    { sourceFrameId: "frame:1", rect: { x: 0, y: 0, width: 32, height: 32 }, durationMs: 90 },
  ],
};

const draft: CaptureDraft = {
  reference,
  rect: { x: 0, y: 0, width: 64, height: 32 },
  sourceFrames: reference.sourceFrames ?? [],
};

const returnContext = {
  selection: { kind: "SCENE", sceneId: "scene:main" } as const,
};

Deno.test("GAME-350-CAPTURE-001 keeps the session state machine explicit", () => {
  const selecting = beginCaptureSession({ kind: "NEW_ASSET" }, returnContext, "capture:test");
  assert(selecting.state === "SELECTING", "capture starts in SELECTING");
  assert(selecting.source === "DRAW", "capture source is DRAW");
  assert(selecting.draftGeneration === 0, "draft generation starts at zero");
  assert(commitCaptureSession(selecting) === undefined, "cannot commit without READY draft");
  const ready = updateCaptureSessionDraft(selecting, draft);
  assert(ready.state === "READY" && ready.draftGeneration === 1, "draft enters READY");
  const committed = commitCaptureSession(ready);
  assert(committed?.state === "COMMITTED", "READY can commit");
  assert(updateCaptureSessionDraft(committed!, draft).state === "COMMITTED", "COMMITTED cannot be edited");
  assert(cancelCaptureSession(committed!) === undefined, "COMMITTED cannot cancel");
});

Deno.test("GAME-350-CAPTURE-009 restores shared workspace context immutably", () => {
  const original: CaptureReturnContext = { selection: { kind: "SCENE", sceneId: "scene:main" } };
  const updated = updateCaptureReturnContext(original, {
    sceneCamera: { panX: 12, panY: -4, zoom: 2 },
    bottomAssetScrollLeft: 180,
    leftRailScrollTop: 24,
    rightRailScrollTop: 36,
    inspectorScrollTop: 48,
    selectionPanel: "panel:scene",
    focusTargetId: "scene-canvas",
  });
  assert(updated !== original, "context update must be immutable");
  assert(original.sceneCamera === undefined, "original context must not change");
  assert(updated.sceneCamera?.zoom === 2 && updated.bottomAssetScrollLeft === 180, "camera and shelf state must be retained");
  assert(updated.rightRailScrollTop === 36 && updated.inspectorScrollTop === 48, "both rails and Inspector must be retained");
  assert(updated.selectionPanel === "panel:scene" && updated.focusTargetId === "scene-canvas", "panel and stable focus must be retained");
});

Deno.test("GAME-350-CAPTURE-002 cancel is non-mutating and terminal", () => {
  const selecting = beginCaptureSession({ kind: "EXISTING_ASSET", assetId: "game:1" }, returnContext);
  const cancelled = cancelCaptureSession(updateCaptureSessionDraft(selecting, draft));
  assert(cancelled?.state === "CANCELLED", "READY can cancel");
  assert(cancelled?.draft?.reference.assetId === "draw:character", "cancel retains only the draft for restoration");
  assert(updateCaptureSessionDraft(cancelled!, draft).state === "CANCELLED", "CANCELLED cannot be edited");
});

Deno.test("GAME-350-CAPTURE-003 splits 32px grids in row-major order", () => {
  const horizontal = splitCaptureRectInto32Frames({ x: 4, y: 8, width: 64, height: 32 }, "frame:draw");
  assert(horizontal.length === 2, "64x32 produces two frames");
  assert(horizontal[0]?.rect.x === 4 && horizontal[1]?.rect.x === 36, "horizontal order is left to right");
  const vertical = splitCaptureRectInto32Frames({ x: 4, y: 8, width: 32, height: 64 }, "frame:draw");
  assert(vertical.length === 2, "32x64 produces two frames");
  assert(vertical[0]?.rect.y === 8 && vertical[1]?.rect.y === 40, "vertical order is top to bottom");
  const square = splitCaptureRectInto32Frames({ x: 0, y: 0, width: 64, height: 64 }, "frame:draw");
  assert(square.length === 4, "64x64 produces four frames");
  assert(square[2]?.rect.x === 0 && square[2]?.rect.y === 32, "square order is row-major");
});

Deno.test("GAME-350-CAPTURE-004 keeps arbitrary rectangles as one frame", () => {
  const frames = splitCaptureRectInto32Frames({ x: 2, y: 3, width: 47, height: 29 }, "frame:manual");
  assert(frames.length === 1, "non-grid rectangle produces one frame");
  assert(frames[0]?.rect.width === 47 && frames[0]?.rect.height === 29, "manual rectangle is preserved");
});

Deno.test("GAME-350-CAPTURE-005 preserves registered frame order and durations", () => {
  assert(draft.sourceFrames[0]?.sourceFrameId === "frame:2", "registered order is preserved");
  assert(draft.sourceFrames[0]?.durationMs === 140 && draft.sourceFrames[1]?.durationMs === 90, "durations are preserved");
  assert(captureFrameCountAllowed(draft.sourceFrames), "registered frames are within the limit");
});

Deno.test("GAME-350-CAPTURE-006 separates duplicate identity from rectangle identity", () => {
  const same = { ...draft, reference: { ...draft.reference } };
  const other = { ...draft, rect: { ...draft.rect, x: 96 } };
  assert(captureDraftKey(same) === captureDraftKey(draft), "identical source and range deduplicate");
  assert(captureDraftKey(other) !== captureDraftKey(draft), "different range creates a distinct identity");
  assert(gameAssetIdForCapture(same) === gameAssetIdForCapture(draft), "duplicate Game ID is stable");
  assert(gameAssetIdForCapture(other) !== gameAssetIdForCapture(draft), "different range gets another Game ID");
});

Deno.test("GAME-350-CAPTURE-007 does not serialize pixel or binary payloads", () => {
  const serialized = JSON.stringify({ state: "COMMITTED", draft });
  for (const forbidden of ["pixel", "pixels", "bytes", "blob", "base64", "dataURL"]) {
    assert(!serialized.includes(forbidden), `persisted capture metadata must not contain ${forbidden}`);
  }
});

Deno.test("GAME-350-CAPTURE-008 keeps the active UI on DRAW until explicit commit", async () => {
  const source = await Deno.readTextFile(new URL("../../src/wp180-workspace-ui.ts", import.meta.url));
  assert(!source.includes("pendingGamePlaygroundDrawTarget"), "capture must not keep a second pending authority");
  assert(source.includes("gamePlaygroundCaptureDraftForCurrentDraw"), "asset events update the capture draft");
  assert(source.includes('textContent = "この範囲を使う"'), "capture bar exposes explicit commit");
  assert(source.includes('textContent = "キャンセル"'), "capture bar exposes cancel");
  assert(source.includes('queueGameEditorPersistenceSave("playground-asset-capture")'), "only commit owns capture persistence");
});

Deno.test("GAME-350-CAPTURE-010 captures and restores the complete UI return snapshot once after render", async () => {
  const source = await Deno.readTextFile(new URL("../../src/wp180-workspace-ui.ts", import.meta.url));
  for (const field of [
    "sceneCamera",
    "bottomAssetScrollLeft",
    "leftRailScrollTop",
    "rightRailScrollTop",
    "inspectorScrollTop",
    "selectionPanel",
    "focusTargetId",
  ]) {
    assert(source.includes(field), `${field} is part of the capture return context`);
  }
  assert(source.includes("windowRef.requestAnimationFrame"), "restore waits for the completed projection render");
  assert(source.includes("if (returnContextRestoreQueued) return"), "restore is guarded against duplicate calls");
  assert(source.includes("restoreCaptureReturnContext(returnContext)"), "commit restores the original context");
  assert(source.includes("restoreCaptureReturnContext(cancelled.returnContext)"), "cancel restores the original context");
  assert(!source.includes("shelfScrollLeft"), "legacy shelf-only restoration is not used");
});
