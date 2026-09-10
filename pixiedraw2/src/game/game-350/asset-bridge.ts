/**
 * Host-neutral adapters for the iDRAW/iAUDIO -> iGAME hand-off.
 *
 * These functions only copy source identities, coordinates, layer IDs, and
 * PPQ ranges.  Raster/audio payloads remain owned by the source workspace.
 */

import type {
  Draw2AssetBridgeSnapshot,
  Draw2AssetReferenceRecord,
} from "../../draw2-asset-bridge-contract.ts";
import type { GamePlaygroundAssetLayout, GamePlaygroundRect, GamePlaygroundSourceFrame } from "./playground.ts";
import {
  inferGamePlaygroundAssetLayout,
  type GamePlaygroundDrawReference,
} from "./playground.ts";
import {
  captureFrameCountAllowed,
  splitCaptureRectIntoGridFrames,
  type CaptureDraft,
} from "./capture-session.ts";
import {
  audioCaptureSelectionValid,
  type AudioCaptureDraft,
  type AudioCaptureSelection,
} from "./audio-capture-session.ts";
import {
  gameAudioAssetFromCaptureDraft,
  type GameAudioAsset,
} from "./game-audio.ts";

export type GameAssetBridgeFailureCode =
  | "DRAW_SELECTION_REQUIRED"
  | "DRAW_REFERENCE_REQUIRED"
  | "DRAW_PROJECT_MISMATCH"
  | "DRAW_DEFINITION_NOT_FOUND"
  | "DRAW_FRAME_LIMIT"
  | "AUDIO_SELECTION_INVALID"
  | "AUDIO_REFERENCE_INVALID";

export interface GameAssetBridgeFailure {
  readonly code: GameAssetBridgeFailureCode;
  readonly message: string;
}

export type GameAssetBridgeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GameAssetBridgeFailure };

export interface GameDrawCaptureGrid {
  readonly cellWidth: number;
  readonly cellHeight?: number;
}

export interface GameDrawCaptureInput {
  readonly snapshot: Draw2AssetBridgeSnapshot;
  readonly reference?: Draw2AssetReferenceRecord;
  /** Explicit definition selection wins over the inferred matching entry. */
  readonly definitionId?: string;
  readonly layout?: GamePlaygroundAssetLayout;
  readonly grid?: GameDrawCaptureGrid;
}

const failure = <T>(
  code: GameAssetBridgeFailureCode,
  message: string,
): GameAssetBridgeResult<T> => ({ ok: false, error: { code, message } });

const ids = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
];

const sameRect = (left: GamePlaygroundRect, right: GamePlaygroundRect): boolean =>
  left.x === right.x && left.y === right.y && left.width === right.width &&
  left.height === right.height;

const selectionRect = (
  snapshot: Draw2AssetBridgeSnapshot,
): GamePlaygroundRect | undefined => {
  const region = snapshot.selection.region;
  if (
    snapshot.selection.hasSelection !== true || snapshot.selection.pixelCount <= 0 ||
    snapshot.selection.sourceCanvasId === null ||
    snapshot.selection.frameId === null || snapshot.selection.frameNumber === null ||
    region === null || region.width <= 0 || region.height <= 0
  ) return undefined;
  return { x: region.x, y: region.y, width: region.width, height: region.height };
};

function definitionMatches(
  snapshot: Draw2AssetBridgeSnapshot,
  definitionId: string | undefined,
  rect: GamePlaygroundRect,
): Draw2AssetBridgeSnapshot["assetDefinitions"][number] | undefined {
  if (definitionId !== undefined) {
    const entry = snapshot.assetDefinitions.find((candidate) => candidate.definitionId === definitionId);
    if (entry === undefined) return undefined;
    const definition = entry.definition;
    const frameNumber = snapshot.selection.frameNumber;
    if (
      definition.sourceProjectId !== snapshot.projectId ||
      definition.sourceCanvasId !== snapshot.selection.sourceCanvasId ||
      frameNumber === null || frameNumber === undefined ||
      definition.frameStart > frameNumber || definition.frameEnd < frameNumber ||
      (definition.region.kind === "MANUAL" && !sameRect(rect, {
        x: definition.region.x,
        y: definition.region.y,
        width: definition.region.width,
        height: definition.region.height,
      }))
    ) return undefined;
    return entry;
  }
  const sourceCanvasId = snapshot.selection.sourceCanvasId;
  const frameNumber = snapshot.selection.frameNumber;
  if (sourceCanvasId === null || frameNumber === null) return undefined;
  return [...snapshot.assetDefinitions].reverse().find((entry) => {
    const definition = entry.definition;
    if (
      definition.sourceProjectId !== snapshot.projectId ||
      definition.sourceCanvasId !== sourceCanvasId ||
      definition.frameStart > frameNumber || definition.frameEnd < frameNumber
    ) return false;
    return definition.region.kind !== "MANUAL" || sameRect(rect, {
      x: definition.region.x,
      y: definition.region.y,
      width: definition.region.width,
      height: definition.region.height,
    });
  });
}

/** Build a metadata-only Game capture draft from the current Draw asset adapter. */
export function createGameDrawCaptureDraft(
  input: GameDrawCaptureInput,
): GameAssetBridgeResult<CaptureDraft> {
  const rect = selectionRect(input.snapshot);
  if (rect === undefined) {
    return failure("DRAW_SELECTION_REQUIRED", "iDRAWでフレームと範囲を選択してください。");
  }
  if (input.reference === undefined) {
    return failure("DRAW_REFERENCE_REQUIRED", "iDRAWの参照Revisionを解決できません。");
  }
  if (
    (input.reference.referenceScope === "LOCAL_PROJECT" &&
      (input.reference.projectId === undefined ||
        input.reference.projectId !== input.snapshot.projectId)) ||
    (input.reference.projectId !== undefined &&
      input.reference.projectId !== input.snapshot.projectId)
  ) {
    return failure(
      "DRAW_PROJECT_MISMATCH",
      "iDRAW参照とiGAME対象Projectが一致しないため、アセットを追加できません。",
    );
  }
  const definition = definitionMatches(input.snapshot, input.definitionId, rect);
  if (input.definitionId !== undefined && definition === undefined) {
    return failure("DRAW_DEFINITION_NOT_FOUND", "指定されたiDRAW Asset Definitionが見つかりません。");
  }
  const selectedFrameId = input.snapshot.selection.frameId!;
  const selectedClip = definition?.definition.animationMapping.find((clip) =>
    clip.sourceFrames?.some((frame) => frame.sourceFrameId === selectedFrameId) ||
    clip.frameIds.includes(selectedFrameId)
  ) ?? definition?.definition.animationMapping[0];
  const sourceLayerIds = ids(
    definition?.definition.sourceLayerIds.length
      ? definition.definition.sourceLayerIds
      : input.snapshot.selection.layerId === null
      ? input.snapshot.layers.filter((layer) => layer.visible).map((layer) => layer.layerTrackId)
      : [input.snapshot.selection.layerId],
  );
  const explicitFrames = selectedClip?.sourceFrames;
  const frameIds = selectedClip?.frameIds.length
    ? selectedClip.frameIds
    : [selectedFrameId];
  const layout = input.layout ?? inferGamePlaygroundAssetLayout({
    animationFrameCount: explicitFrames?.length ?? frameIds.length,
    region: rect,
  });
  const sourceFrames: readonly GamePlaygroundSourceFrame[] = explicitFrames !== undefined && explicitFrames.length > 0
    ? explicitFrames.map((frame) => ({
      sourceFrameId: frame.sourceFrameId,
      ...(ids(frame.layerIds).length === 0 ? {} : { layerIds: ids(frame.layerIds) }),
      rect: { ...frame.rect },
      ...(frame.durationMs === undefined ? {} : { durationMs: frame.durationMs }),
    }))
    : layout === "FRAME_SEQUENCE"
    ? frameIds.map((sourceFrameId, index) => ({
      sourceFrameId,
      ...(sourceLayerIds.length === 0 ? {} : { layerIds: sourceLayerIds }),
      rect: { ...rect },
      ...(selectedClip?.frameDurationsMs?.[index] === undefined
        ? {}
        : { durationMs: selectedClip.frameDurationsMs[index] }),
    }))
    : layout === "GRID_32" || layout === "GRID_FRAME_SEQUENCE"
    ? frameIds.flatMap((sourceFrameId) =>
      splitCaptureRectIntoGridFrames(
        rect,
        sourceFrameId,
        input.grid?.cellWidth ?? 32,
        input.grid?.cellHeight ?? input.grid?.cellWidth ?? 32,
        sourceLayerIds,
      )
    )
    : [{
      sourceFrameId: selectedFrameId,
      ...(sourceLayerIds.length === 0 ? {} : { layerIds: sourceLayerIds }),
      rect: { ...rect },
    }];
  if (!captureFrameCountAllowed(sourceFrames)) {
    return failure("DRAW_FRAME_LIMIT", "iDRAWの選択フレーム数がiGAMEの上限を超えています。");
  }
  const reference: GamePlaygroundDrawReference = {
    assetId: input.reference.assetId,
    revisionId: input.reference.revisionId,
    contentHash: input.reference.contentHash,
    label: input.reference.label,
    mode: input.reference.mode,
    ...(input.reference.assetDefinitionId === undefined
      ? {}
      : { assetDefinitionId: input.reference.assetDefinitionId }),
    projectId: input.reference.projectId ?? input.snapshot.projectId,
    layout,
    sourceFrameId: sourceFrames[0]?.sourceFrameId ?? selectedFrameId,
    region: { ...rect },
    sourceFrames,
  };
  return { ok: true, value: { reference, rect, sourceFrames } };
}

export interface GameAudioCaptureInput {
  readonly selection: AudioCaptureSelection;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectStateHash: string;
  readonly label: string;
  readonly kind: AudioCaptureDraft["kind"];
  readonly mode: AudioCaptureDraft["mode"];
}

/** Normalize a selected iAUDIO range for a Game asset hand-off. */
export function createGameAudioCaptureDraft(
  input: GameAudioCaptureInput,
): GameAssetBridgeResult<AudioCaptureDraft> {
  const trackIds = ids(input.selection.trackIds);
  const selection: AudioCaptureSelection = { ...input.selection, trackIds };
  if (
    input.projectId.trim().length === 0 || input.projectStateHash.trim().length === 0 ||
    !Number.isSafeInteger(input.projectRevision) || input.projectRevision < 0 ||
    input.label.trim().length === 0 || !audioCaptureSelectionValid(selection)
  ) {
    return failure("AUDIO_SELECTION_INVALID", "iAUDIOのTrackまたはPPQ Tick範囲が不正です。");
  }
  return {
    ok: true,
    value: {
      ...selection,
      projectId: input.projectId.trim(),
      projectRevision: input.projectRevision,
      projectStateHash: input.projectStateHash.trim(),
      label: input.label.trim(),
      kind: input.kind,
      mode: input.mode,
    },
  };
}

/** Convert a validated Audio capture draft without copying source bytes. */
export function gameAudioAssetForCaptureDraft(
  draft: AudioCaptureDraft,
): GameAssetBridgeResult<GameAudioAsset> {
  if (!audioCaptureSelectionValid(draft)) {
    return failure("AUDIO_REFERENCE_INVALID", "iAUDIOの選択範囲をGame Audio参照に変換できません。");
  }
  return { ok: true, value: gameAudioAssetFromCaptureDraft(draft) };
}
