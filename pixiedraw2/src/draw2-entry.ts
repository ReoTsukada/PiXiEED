/// <reference lib="dom" />

import {
  cloneProjectStateShared,
  type CommandResult,
  compactPixelPath,
  createIndexedRasterStampSource,
  createRasterSelectionMask,
  createProject,
  type DirtyRegion,
  type DirtyTile,
  type EditorCommand,
  EditorCore,
  IndexedTileRaster,
  InMemoryLocalJournal,
  InMemoryProjectRepository,
  interpolatePixelPath,
  LocalAutosaveCoordinator,
  type MirrorCommitSpec,
  type ProjectState,
  type RasterAsset,
  ReferenceRenderer,
  type RasterClipRect,
  type RasterSelectionMask,
  SampledInstrumentation,
  type ShapeCommitPayload,
  type TileSize,
  type TileStampPayload,
} from "./draw2-core.ts";
import type {
  AudioApplyInput,
  AudioApplyReceipt,
  DrawApplyInput,
  DrawApplyReceipt,
  GameApplyReceipt,
} from "./pixync/adapters.ts";
import { drawRasterHash } from "./pixync/adapters.ts";
import type { PixyncDrawProductStatePort } from "./pixync/draw-product-bridge.ts";
import type { PixyncAudioProductStateSnapshot } from "./pixync/audio-product-bridge.ts";
import type { PixyncGameProductSnapshot } from "./pixync/game-product-bridge.ts";
import type {
  BehaviorIR,
  GameProject,
  JournalCommand,
} from "./game/game-300/core.ts";
import type { GoldenProjectBuildResult } from "./studio/golden-project.ts";
import { PixyncAudioProductBridge } from "./pixync/audio-product-bridge.ts";
import { PixyncDrawProductBridge } from "./pixync/draw-product-bridge.ts";
import { PixyncGameProductBridge } from "./pixync/game-product-bridge.ts";
import { PixyncProductionCompositionRoot } from "./pixync/composition-root.ts";
import { PixyncGameRevisionRemoteStore } from "./pixync/game-revision-remote-store.ts";
import type { PixyncSupabaseSdkClient } from "./pixync/supabase-sdk-port.ts";
import type {
  PixyncTransportPresence,
  PixyncTransportPresenceEvent,
  PixyncTransportStatus,
} from "./pixync/transport.ts";
import {
  PIXYNC_DRAW2_MAX_PAYLOAD_BYTES,
  PIXYNC_DRAW2_MAX_PAYLOAD_KEYS,
} from "./pixync/core.ts";
import {
  assessClipboardPalette,
  applyCompactSelectionTransform,
  type ClipboardPayload,
  commitTransform,
  createClipboardPasteSession,
  createClipboardPayload,
  createRectangleSelectionSnapshot,
  createSelectionTransformWirePayload,
  createTransformSession,
  cutClipboard,
  LocalUndoRedoHistory,
  pasteClipboard,
  previewClipboardPaste,
  previewTransform,
  selectionCommandId,
  type SelectionTransformWireCommand,
  type SelectionSnapshot,
  type TransformDescriptor,
  type TransformPreview,
  type TransformSession,
} from "./draw2-selection.ts";
import {
  calculateTimelineWindow,
  createTimelineSession,
  executeTimelineCommand,
  resolveOnionSkinNeighborhood,
  resolvePlaybackProjection,
  setTimelineSessionActiveFrame,
  type TimelineCommand,
  type TimelineSessionState,
} from "./draw2-timeline.ts";
import {
  MAX_BRUSH_SIZE,
  type BasicTool,
  type BrushAlgorithm,
  type BrushPattern,
  type BrushShape,
  type ColorSelectionMode,
  colorTolerancePercentToDistance,
  createFillPreviewWriteSet,
  createIndexedGradientWriteSet,
  createPathWriteSet,
  createToolPreviewWriteSet,
  createWriteSet,
  decodeArgb,
  normalizeBounds,
  normalizeToolOptions,
  selectByContiguousColor,
  selectByEllipse,
  selectByLasso,
  selectByOpaque,
  selectByPaletteColor,
  shapePixels,
  snapSelectionBoundsToGrid,
  type ColoredPixel,
  type ToolOptions,
} from "./draw2-basic-tools.ts";
import {
  createArgbColorRamp,
  decodeArgbColor,
  type ColorRampHueMode,
  type ColorRampSpace,
} from "./draw2-color-tools.ts";
import {
  createOutlineWriteSet,
  type OutlineConnectivity,
  type OutlinePlacement,
} from "./draw2-outline-tools.ts";
import { createTextMaskWriteSet } from "./draw2-text-tools.ts";
import { createMarketAssetBindingCandidate } from "./game/game-350/market-asset-binding.ts";
import {
  pixelPerfectPath,
  polygonSelectionPoints,
} from "./draw2-special-tools.ts";
import {
  Draw2InteractionKernel,
  SerializedCommitIngress,
  type ToolSessionCommit,
  type ToolSessionSnapshot,
} from "./draw2-interaction.ts";
import {
  DRAW2_PERSISTED_HISTORY_LIMIT,
  createDraw2PersistenceRecord,
  createIndexedDbDraw2PersistenceStore,
  type Draw2JournalSnapshot,
  restoreDraw2PersistenceRecord,
} from "./draw2-persistence.ts";
import type { PointerPhase, PointerSample } from "./fp-006/contracts.ts";
import {
  combineSelectionPoints,
  pointInSelectionBounds,
  type SelectionEditMode,
  selectionEditModeFromModifiers,
  selectionPointKey,
} from "./draw2-selection-edit.ts";
import {
  type AssetAnimationClip,
  assetAnimationClipKey,
  type AssetAnimationFrameReference,
  type AssetAnimationFrameRasterSnapshot,
  type AssetAnimationName,
  type AssetDefinitionDraft,
  type AssetDirectionName,
  type AssetLoopMode,
  type AssetPivot,
  createAssetDefinitionDraft,
  type CreatorAssetKind,
  validateAssetDefinitionDraft,
} from "./draw2-creator-workspace.ts";
import {
  cloneAssetPackageManifest,
  verifyAssetPackageManifest,
  type AssetPackageManifest,
} from "./game/game-350/assetization.ts";
import { exportAssetDefinitionPxd } from "./game/game-350/asset-market-export.ts";
import {
  DRAW2_ASSET_STATE_CHANGED_EVENT,
  type Draw2AssetBridge,
  type Draw2AssetPackageMutationResult,
  type Draw2AssetMarketHandoffResult,
  type Draw2AssetBridgeSnapshot,
  type Draw2AssetMutationResult,
  type Draw2AssetReferenceProjection,
  type Draw2AssetReferenceRecord,
  type Draw2AssetSelectionSnapshot,
} from "./draw2-asset-bridge-contract.ts";
import { DRAW2_SHORTCUTS, resolveDraw2Shortcut } from "./draw2-shortcuts.ts";
import {
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  pinchZoomFromDistance,
  snapPixelPerfectZoom,
  stepPixelPerfectZoom,
  zoomAtSourcePoint,
} from "./draw2-viewport.ts";
import {
  canvasCoordinateToDiagonalMirrorGuideOffset,
  canvasCoordinateToMirrorGuide,
  clampMirrorGuideCoordinate,
  diagonalMirrorGuideOffsetToCanvasCoordinate,
  mirrorGuideCenter,
  mirrorGuideToCanvasCoordinate,
  snapMirrorGuideCoordinate,
} from "./draw2-mirror.ts";
import {
  AnimationTagStore,
  type BrushPreset,
  BrushPresetStore,
  createLinkedCelBinding,
  createSelectionMask,
  Draw2SelectionStampStore,
  type Draw2TimelineMetadata,
  type DrawAudioReference,
  DrawAudioReferenceStore,
  type LinkedCelBinding,
  normalizeDraw2TimelineMetadata,
  selectionBorder,
  selectionExpand,
  selectionInvert,
  selectionShrink,
  type TimelineMarker,
  TimelineMarkerStore,
} from "./draw2-creator-features.ts";
import {
  DEFAULT_DRAW2_VISUAL_SETTINGS,
  type Draw2VisualSettings,
  normalizeDraw2VisualSettings,
  readDraw2VisualSettings,
  writeDraw2VisualSettings,
} from "./draw2-settings.ts";
import {
  type Draw2EditorPreferences,
  type Draw2ProjectEditorPreferences,
  draw2ProjectEditorPreferences,
  readDraw2EditorPreferences,
  withoutDraw2ProjectEditorPreferences,
  withDraw2ProjectEditorPreferences,
  writeDraw2EditorPreferences,
} from "./draw2-editor-preferences.ts";
import {
  type Draw2Locale,
  normalizeDraw2Locale,
  translateDraw2Text,
} from "./draw2-i18n.ts";
import {
  type ExportFormat,
  exportFormatDefinition,
  type ExportPackageMode,
  type ExportState,
  pngExportScaleOptions,
  visibleExportFormats,
} from "./draw2-export-registry.ts";
import {
  buildPixelGridSvgPath,
  DRAW2_CHECKER_CELL_SIZE_PX,
  getPixelGridOpacityForScale,
  projectCheckerCellSize,
  projectPixelGridMetrics,
} from "./draw2-pixel-grid.ts";
import {
  buildTilemapGridSvgPath,
  clearDraw2TilemapCell,
  createDraw2Tilemap,
  type Draw2Tilemap,
  type Draw2TilemapCell,
  draw2TilemapCellCount,
  type Draw2TileTransform,
  setDraw2TilemapCell,
  tilemapCellAt,
  tilemapIdFor,
} from "./draw2-tilemap.ts";
import {
  calculateCanvasResizePlan,
  type CanvasResizeAnchor,
  type CanvasResizePlan,
  describeCanvasResizePlan,
} from "./draw2-canvas-resize.ts";
import type { RuntimePreviewSession } from "./wp160-runtime-bundle-entry.ts";
import {
  asAssetId,
  asAssetRevisionId,
  asSha256 as asRuntimeHash,
  hashCanonical,
} from "./wp160-contracts.ts";
import type { RuntimeAssetPayload } from "./wp160-game-runtime-core.ts";
import { asSha256 as asGameHash } from "./game/game-300/core.ts";
import {
  createGameDependencySnapshot,
  createGameProjectRevision,
  type GameProjectRevision,
} from "./wp200-game-runtime-core.ts";
import {
  type Game350ProductSession,
  startGame350ProductPreview,
} from "./game/game-350/product-path.ts";
import {
  clearGame351Dialogue,
  createGame351PlayableState,
  createGame351RpgTemplate,
  createGame351RpgTemplateFromProject,
  GAME351_INPUT_ACTIONS,
  GAME351_INTERACT_ACTION,
  GAME351_TAP_ACTION,
  type Game351PlayableState,
  type Game351RpgTemplate,
  playGame351,
  restartGame351,
  stepGame351,
  stopGame351,
  triggerGame351Action,
} from "./game/game-350/playable-slice.ts";
import {
  clearGameGenreDialogue,
  createGameGenreRuntime,
  DODGE_SURVIVAL_SECONDS,
  playGameGenre,
  restartGameGenre,
  stepGameGenre,
  stopGameGenre,
  triggerGameGenreCameraShake,
  type GameGenreRuntimeInput,
  type GameGenreRuntimeState,
} from "./game/game-350/genre-runtime.ts";
import {
  cameraShakeOffset,
  cameraViewportSize,
  resolveCameraViewportOrigin,
  type Camera2DPoint,
} from "./game/game-350/camera-2d.ts";
import type { CanonicalAssetRevision } from "./game/game-340/core.ts";
import type { CanonicalPixelTarget } from "./wp170-advanced-tools-core.ts";
import {
  announceWorkspaceProjectChanged,
  asWorkspaceProjectId,
  createIndexedDbWorkspaceManifestStore,
  DEFAULT_WORKSPACE_PROJECT_ID,
  normalizeWorkspaceProjectId,
  readActiveWorkspaceProjectId,
  WORKSPACE_PROJECT_CHANGED_EVENT,
  type WorkspaceProjectId,
  writeActiveWorkspaceProjectId,
} from "./workspace/project-manifest.ts";
import {
  deleteWorkspaceProjectLocalData,
  type WorkspaceProjectDataDeletionPorts,
} from "./workspace/project-data-deletion.ts";
import {
  PixyncDurableJournal,
  type PixyncDurableSnapshot,
  type PixyncSnapshotPersistencePort,
} from "./pixync/durability.ts";
import {
  COLLABORATION_EDIT_SCOPE_POLICIES,
  COLLABORATION_SCOPE_KEYS,
  editScopePolicyLabel,
  isCollaborationEditScopePolicy,
  isCollaborationScopeKey,
  scopeLabel,
  type CollaborationEditScopePolicy,
  type CollaborationScopeKey,
} from "./pixync/collaboration-scope.ts";
import { createPixyncIndexedDbPersistence } from "./pixync/indexeddb-persistence.ts";
import { publishPixyncCheckpoint } from "./pixync/checkpoint-publishing.ts";
import {
  detachPixyncProject,
  PixyncProjectDeletionError,
} from "./pixync/project-deletion.ts";
import {
  PixyncRemoteCheckpointError,
  readPixyncActiveCheckpoint,
} from "./pixync/remote-checkpoint.ts";
import { PixyncProjectLifecycleCoordinator } from "./pixync/project-lifecycle.ts";
import type { PixyncAggregateAdapter } from "./pixync/contracts.ts";
import type {
  ProjectSessionClient,
  ProjectSessionMode,
  ProjectSessionState,
} from "./pixync/project-session.ts";
import {
  createProjectStartIntent,
  type CreatorStartMode,
  isCreatorStartMode,
  resolveCreatorStartMode,
} from "./studio/project-start.ts";

const DRAW2_ICON_SPRITE = "./assets/icons/draw2-icons.svg#";

function createDraw2Icon(
  iconId: string,
  className = "draw2-ui-icon",
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `${DRAW2_ICON_SPRITE}${iconId}`);
  svg.append(use);
  return svg;
}

function setDraw2Icon(target: Element, iconId: string): void {
  target.querySelector<SVGUseElement>("use")?.setAttribute(
    "href",
    `${DRAW2_ICON_SPRITE}${iconId}`,
  );
}

type LegacyCompatModule = typeof import("./draw2-legacy-compat.ts");
let legacyCompatModulePromise: Promise<LegacyCompatModule> | undefined;

type RuntimeModule = typeof import("./wp160-runtime-bundle-entry.ts");
let runtimeModulePromise: Promise<RuntimeModule> | undefined;

type AdvancedModule = typeof import("./wp170-advanced-bundle-entry.ts");
let advancedModulePromise: Promise<AdvancedModule> | undefined;

type WorkspaceModule = typeof import("./wp180-workspace-ui.ts");
let workspaceModulePromise: Promise<WorkspaceModule> | undefined;

type ProjectSessionModule = typeof import("./pixync/project-session.ts");
let projectSessionModulePromise: Promise<ProjectSessionModule> | undefined;

type ProjectDataStorageModule = typeof import(
  "./workspace/project-data-storage-entry.ts"
);
let projectDataStorageModulePromise: Promise<ProjectDataStorageModule> | undefined;

interface WorkspacePxdBridgeAsset {
  readonly revisionId: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

interface WorkspacePxdBridgeSnapshot {
  readonly projectId: string;
  readonly audio: {
    readonly schemaVersion: string;
    readonly record: unknown;
    readonly assets: readonly WorkspacePxdBridgeAsset[];
  } | null;
  readonly game: {
    readonly schemaVersion: string;
    readonly record: unknown;
  } | null;
}

interface WorkspaceAudioRenderSnapshot {
  readonly bytes: Uint8Array;
  readonly sampleRateHz: number;
  readonly channels: 1 | 2;
  readonly bitDepth: 8 | 16 | 24 | 32;
  readonly durationSeconds: number;
  readonly sourceProjectId: string;
  readonly sourceStateHash: string;
  readonly sourceProjectRevision: number;
}

interface WorkspacePxdArtifactSnapshot {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly packageHash: string;
  readonly sourceReference: Draw2AssetReferenceRecord;
}

interface Draw2IGameProductMetadata {
  readonly schema: "pixieed-igame-product/v1";
  readonly project_id: string;
  readonly runtime_profile_id: string;
  readonly runtime_version: string;
  readonly visibility: "PUBLIC";
}

interface Draw2MarketDeliveryManifest {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly selectionKind: "WHOLE_PROJECT" | "SELECTED_SET";
  readonly project: {
    readonly projectId: string;
    readonly revisionId?: string;
    readonly name: string;
  };
  readonly entries: readonly [{
    readonly entryId: string;
    readonly sourceKind: "DRAW";
    readonly source: {
      readonly projectId: string;
      readonly assetId: string;
      readonly revisionId: string;
      readonly contentHash: string;
      readonly packageHash?: string;
      readonly fileName: string;
      readonly mimeType: string;
      readonly byteLength: number;
    };
    readonly selection: {
      readonly kind: "PROJECT" | "ANIMATION" | "FRAME_RANGE";
      readonly label: string;
      readonly locator?: string;
    };
    readonly provenance: {
      readonly originKind: "LOCAL_PROJECT";
      readonly rightsStatus: "CREATOR_DECLARATION_REQUIRED";
    };
    readonly capabilities: {
      readonly editable: true;
      readonly animation: true;
      readonly targets: readonly ("iDRAW" | "iAUDIO" | "iGAME" | "UNITY")[];
    };
    readonly dependencyIds: readonly [];
  }];
  readonly summary: {
    readonly entryCount: 1;
    readonly sourceKinds: readonly ["DRAW"];
    readonly labels: readonly [string];
  };
  readonly createdAt: string;
}

interface WorkspacePxdBridge {
  exportProjectPxdSnapshot: () => Promise<WorkspacePxdBridgeSnapshot>;
  exportProjectPxdArtifact?: () => Promise<WorkspacePxdArtifactSnapshot>;
  setDrawTimelineFrames?: (
    frames: readonly {
      readonly frameId: string;
      readonly durationMs: number;
    }[],
    playbackFps: number,
  ) => void;
  renderAudioWavForExport?: (
    durationSeconds?: number,
    selection?: "CURRENT" | "FULL",
  ) => Promise<WorkspaceAudioRenderSnapshot | null>;
  restoreProjectPxdSnapshot: (
    snapshot: WorkspacePxdBridgeSnapshot,
  ) => Promise<void>;
  preparePixyncAudioState?: () => Promise<void>;
  pixyncAudioCurrent?: () => PixyncAudioProductStateSnapshot;
  applyPixyncAudioRemote?: (
    input: AudioApplyInput,
  ) => Promise<AudioApplyReceipt>;
  preparePixyncGameState?: () => Promise<void>;
  pixyncGameCurrent?: () => PixyncGameProductSnapshot;
  gameCurrentProject?: () => GameProject;
  refreshSite400IGameRoute?: (
    operation: "create" | "open" | "reload",
  ) => Promise<boolean>;
  resolvePixyncGameRevision?: (
    afterHash: string,
    revisionId: string,
  ) => Promise<GameProject | undefined>;
  applyPixyncGameRemote?: (input: {
    readonly next: GameProject;
    readonly commandId: string;
    readonly operation: {
      readonly operationId: string;
      readonly projectId: string;
      readonly actorId: string;
      readonly clientId: string;
      readonly clientSequence: number;
      readonly baseProjectRevision: number;
    };
  }) => Promise<GameApplyReceipt>;
  buildGoldenProject?: (
    mode: "LIVE" | "PINNED",
  ) => Promise<GoldenProjectBuildResult>;
  applyGoldenProject?: (
    mode: "LIVE" | "PINNED",
  ) => Promise<GoldenProjectBuildResult>;
  startGoldenAudioPreview?: () => boolean;
  stopGoldenAudioPreview?: () => void;
}

type ExportModule = typeof import("./draw2-export.ts");
type PxdAssetDefinitionEntry =
  import("./draw2-export.ts").PxdAssetDefinitionEntry;
let exportModulePromise: Promise<ExportModule> | undefined;

function loadLegacyCompatModule(): Promise<LegacyCompatModule> {
  const legacyChunkUrl =
    new URL("draw2-legacy-compat.js", import.meta.url).href;
  legacyCompatModulePromise ??= import(legacyChunkUrl) as unknown as Promise<
    LegacyCompatModule
  >;
  return legacyCompatModulePromise;
}

function loadRuntimeModule(): Promise<RuntimeModule> {
  const runtimeChunkUrl =
    new URL("wp160-runtime-core.js", import.meta.url).href;
  runtimeModulePromise ??= import(runtimeChunkUrl) as unknown as Promise<
    RuntimeModule
  >;
  return runtimeModulePromise;
}

function loadAdvancedModule(): Promise<AdvancedModule> {
  const advancedChunkUrl =
    new URL("wp170-advanced-tools.js", import.meta.url).href;
  advancedModulePromise ??= import(advancedChunkUrl) as unknown as Promise<
    AdvancedModule
  >;
  return advancedModulePromise;
}

function loadWorkspaceModule(): Promise<WorkspaceModule> {
  const workspaceChunkUrl = new URL("wp180-workspace.js", import.meta.url);
  workspaceChunkUrl.searchParams.set("v", "20260911-unity-audio-export-v1");
  workspaceModulePromise ??= import(
    workspaceChunkUrl.href
  ) as unknown as Promise<
    WorkspaceModule
  >;
  return workspaceModulePromise;
}

function loadProjectSessionModule(): Promise<ProjectSessionModule> {
  const sessionChunkUrl = new URL(
    "project-session.js?v=20260828-studio-route-race-v2",
    import.meta.url,
  );
  projectSessionModulePromise ??= import(
    sessionChunkUrl.href
  ) as unknown as Promise<ProjectSessionModule>;
  return projectSessionModulePromise;
}

function loadProjectDataStorageModule(): Promise<ProjectDataStorageModule> {
  const storageChunkUrl = new URL(
    "project-data-storage.js?v=20260828-project-delete-v1",
    import.meta.url,
  ).href;
  projectDataStorageModulePromise ??= import(
    storageChunkUrl
  ) as unknown as Promise<ProjectDataStorageModule>;
  return projectDataStorageModulePromise;
}

function getWorkspacePxdBridge(): WorkspacePxdBridge {
  const candidate = (window as Window & {
    __pixiedraw2WorkspaceDebug?: Partial<WorkspacePxdBridge>;
  }).__pixiedraw2WorkspaceDebug;
  if (
    typeof candidate?.exportProjectPxdSnapshot !== "function" ||
    typeof candidate.restoreProjectPxdSnapshot !== "function"
  ) {
    throw new Error("PXD workspace adapter is not ready.");
  }
  return candidate as WorkspacePxdBridge;
}

function loadExportModule(): Promise<ExportModule> {
  const exportChunkUrl = new URL(
    "draw2-export.js?v=20260825-studio-brand-03",
    import.meta.url,
  ).href;
  exportModulePromise ??= import(exportChunkUrl) as unknown as Promise<
    ExportModule
  >;
  return exportModulePromise;
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#draw2Canvas");
const tilesetSourceCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2TilesetSourceCanvas",
);
const overlayElement = document.querySelector<HTMLCanvasElement>(
  "#draw2Overlay",
);
const erasePreviewElement = document.querySelector<HTMLCanvasElement>(
  "#draw2ErasePreview",
);
const tilemapGridElement = document.querySelector<SVGSVGElement>(
  "#draw2TilemapGrid",
);
const tilemapGridMinorPathElement = document.querySelector<SVGPathElement>(
  "#draw2TilemapGridMinor",
);
const tilemapGridMajorPathElement = document.querySelector<SVGPathElement>(
  "#draw2TilemapGridMajor",
);
const pixelGridElement = document.querySelector<SVGSVGElement>(
  "#draw2PixelGrid",
);
const pixelGridMinorPathElement = document.querySelector<SVGPathElement>(
  "#draw2PixelGridMinor",
);
const pixelGridMajorPathElement = document.querySelector<SVGPathElement>(
  "#draw2PixelGridMajor",
);
const selectionOverlayElement = document.querySelector<SVGSVGElement>(
  "#draw2SelectionOverlay",
);
const mirrorGuideOverlayElement = document.querySelector<SVGSVGElement>(
  "#draw2MirrorGuideOverlay",
);
const mirrorGuideVerticalElement = document.querySelector<SVGLineElement>(
  "#draw2MirrorGuideVertical",
);
const mirrorGuideHorizontalElement = document.querySelector<SVGLineElement>(
  "#draw2MirrorGuideHorizontal",
);
const mirrorGuideDiagonalDownElement = document.querySelector<SVGLineElement>(
  "#draw2MirrorGuideDiagonalDown",
);
const mirrorGuideDiagonalUpElement = document.querySelector<SVGLineElement>(
  "#draw2MirrorGuideDiagonalUp",
);
const mirrorToggleXElement = document.querySelector<HTMLButtonElement>(
  "#draw2MirrorToggleX",
);
const mirrorToggleYElement = document.querySelector<HTMLButtonElement>(
  "#draw2MirrorToggleY",
);
const mirrorToggleDiagonalDownElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MirrorToggleDiagonalDown",
);
const mirrorToggleDiagonalUpElement = document.querySelector<HTMLButtonElement>(
  "#draw2MirrorToggleDiagonalUp",
);
const selectionOverlayRegionsElement = document.querySelector<SVGGElement>(
  "#draw2SelectionOverlayRegions",
);
const statusElement = document.querySelector<HTMLElement>("#draw2Status");
const metricsElement = document.querySelector<HTMLElement>("#draw2Metrics");
const selectionStatusElement = document.querySelector<HTMLElement>(
  "#draw2SelectionStatus",
);
const projectIdInputElement = document.querySelector<HTMLInputElement>(
  "#draw2ProjectId",
);
const tileSizeSelectElement = document.querySelector<HTMLSelectElement>(
  "#draw2TileSize",
);
const toolSelectElement = document.querySelector<HTMLSelectElement>(
  "#draw2Tool",
);
const brushSizeElement = document.querySelector<HTMLInputElement>(
  "#draw2BrushSize",
);
const brushPatternElement = document.querySelector<HTMLSelectElement>(
  "#draw2BrushPattern",
);
const brushShapeElement = document.querySelector<HTMLSelectElement>(
  "#draw2BrushShape",
);
const brushAngleElement = document.querySelector<HTMLInputElement>(
  "#draw2BrushAngle",
);
const brushAlgorithmElement = document.querySelector<HTMLSelectElement>(
  "#draw2BrushAlgorithm",
);
const brushSizeControlElement = document.querySelector<HTMLElement>(
  "#draw2QuickBrushSizeControl",
);
const quickControlsElement = document.querySelector<HTMLElement>(
  "#draw2WorkspaceQuickControls",
);
const workspaceContextRowElement = document.querySelector<HTMLElement>(
  ".draw2-workspace-context-row",
);
const brushOptionsButtonElement = document.querySelector<HTMLButtonElement>(
  "#draw2BrushOptionsButton",
);
const brushOptionsSummaryElement = document.querySelector<HTMLElement>(
  "#draw2BrushOptionsSummary",
);
const brushOptionsFlyoutElement = document.querySelector<HTMLDivElement>(
  "#draw2BrushOptionsFlyout",
);
const brushOptionsCloseButtonElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2BrushOptionsClose",
);
const brushPresetElement = document.querySelector<HTMLSelectElement>(
  "#draw2BrushPreset",
);
const brushPresetNameElement = document.querySelector<HTMLInputElement>(
  "#draw2BrushPresetName",
);
const brushPresetSaveButton = document.querySelector<HTMLButtonElement>(
  "#draw2BrushPresetSave",
);
const brushPresetDeleteButton = document.querySelector<HTMLButtonElement>(
  "#draw2BrushPresetDelete",
);
const mirrorModeToggleElement = document.querySelector<HTMLButtonElement>(
  "#draw2MirrorModeToggle",
);
const viewportContextRailElement = document.querySelector<HTMLElement>(
  "#draw2ViewportContextRail",
);
const similarityControlElement = document.querySelector<HTMLElement>(
  "#draw2SimilarityControl",
);
const similarityElement = document.querySelector<HTMLInputElement>(
  "#draw2Similarity",
);
const similarityValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2SimilarityValue",
);
const colorSelectionModeElement = document.querySelector<HTMLSelectElement>(
  "#draw2ColorSelectionMode",
);
const miniPreviewCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2MiniPreviewCanvas",
);
const audioDrawPreviewCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2AudioDrawPreviewCanvas",
);
const miniPreviewContainerElement = document.querySelector<HTMLElement>(
  ".draw2-mini-preview",
);
const miniPreviewPlayButtonElement = document.querySelector<HTMLButtonElement>(
  "#draw2MiniPreviewPlay",
);
const miniPreviewReferenceButtonElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewReference",
);
const miniPreviewReferenceClearButtonElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewReferenceClear",
);
const miniPreviewReferenceInputElement = document.querySelector<
  HTMLInputElement
>(
  "#draw2MiniPreviewReferenceInput",
);
const miniPreviewReferenceStatusElement = document.querySelector<
  HTMLOutputElement
>(
  "#draw2MiniPreviewReferenceStatus",
);
const miniPreviewCollapseButtonElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewCollapse",
);
const miniPreviewRestoreButtonElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewRestore",
);
const miniPreviewResizeLeftElement = document.querySelector<HTMLButtonElement>(
  "#draw2MiniPreviewResizeLeft",
);
const miniPreviewResizeBottomElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewResizeBottom",
);
const miniPreviewResizeCornerElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2MiniPreviewResizeCorner",
);
const displayToggleButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-draw2-display-toggle]"),
);
const viewportWrapElement = document.querySelector<HTMLElement>(
  ".draw2-viewport-wrap",
);
const viewportCenterButtonElement = document.querySelector<HTMLButtonElement>(
  "#draw2ViewportCenter",
);
const canvasStackElement = document.querySelector<HTMLElement>(
  ".draw2-canvas-stack",
);
const workspaceFrameElement = document.querySelector<HTMLElement>(
  "#draw2WorkspaceFrame",
);
const projectStartElement = document.querySelector<HTMLElement>(
  "#draw2ProjectStart",
);
const projectStartModeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-project-start-mode]"),
);
const projectStartOpenButton = document.querySelector<HTMLButtonElement>(
  "#draw2ProjectStartOpen",
);
const projectStartIdElement = document.querySelector<HTMLInputElement>(
  "#draw2ProjectStartId",
);
const projectStartRecentListElement = document.querySelector<HTMLElement>(
  "#draw2ProjectRecentList",
);
const projectStartRecentCountElement = document.querySelector<HTMLElement>(
  "#draw2ProjectRecentCount",
);
const projectStartStatusElement = document.querySelector<HTMLElement>(
  "#draw2ProjectStartStatus",
);

// The Details menu is a shared application control. Keep one canonical menu
// node (and its command listeners) while mounting it beside the product logo,
// instead of rendering a second copy at the far right of the top rail.
function mountCommonDetailsMenu(): void {
  const menu = document.querySelector<HTMLElement>(
    "#draw2CommonDetailsMenu",
  );
  const brand = document.querySelector<HTMLElement>(
    ".draw2-workspace-brand",
  );
  if (menu === null || brand === null || menu.parentElement === brand) return;
  brand.append(menu);
}

mountCommonDetailsMenu();

const selectionXElement = document.querySelector<HTMLInputElement>(
  "#draw2SelectionX",
);
const selectionYElement = document.querySelector<HTMLInputElement>(
  "#draw2SelectionY",
);
const selectionWidthElement = document.querySelector<HTMLInputElement>(
  "#draw2SelectionWidth",
);
const selectionHeightElement = document.querySelector<HTMLInputElement>(
  "#draw2SelectionHeight",
);
const selectionModeElement = document.querySelector<HTMLSelectElement>(
  "#draw2SelectionMode",
);
const selectionMorphologyRadiusElement = document.querySelector<HTMLInputElement>(
  "#draw2SelectionMorphologyRadius",
);
const selectionExpandButton = document.querySelector<HTMLButtonElement>(
  "#draw2SelectionExpand",
);
const selectionShrinkButton = document.querySelector<HTMLButtonElement>(
  "#draw2SelectionShrink",
);
const selectionInvertButton = document.querySelector<HTMLButtonElement>(
  "#draw2SelectionInvert",
);
const selectionBorderButton = document.querySelector<HTMLButtonElement>(
  "#draw2SelectionBorder",
);
const transformOperationElement = document.querySelector<HTMLSelectElement>(
  "#draw2TransformOperation",
);
const transformDxElement = document.querySelector<HTMLInputElement>(
  "#draw2TransformDx",
);
const transformDyElement = document.querySelector<HTMLInputElement>(
  "#draw2TransformDy",
);
const transformFactorElement = document.querySelector<HTMLInputElement>(
  "#draw2TransformFactor",
);
const transformAngleElement = document.querySelector<HTMLInputElement>(
  "#draw2TransformAngle",
);
const selectButton = document.querySelector<HTMLButtonElement>("#draw2Select");
const commitSelectionButton = document.querySelector<HTMLButtonElement>(
  "#draw2CommitSelection",
);
const cancelSelectionButton = document.querySelector<HTMLButtonElement>(
  "#draw2CancelSelection",
);
const previewButton = document.querySelector<HTMLButtonElement>(
  "#draw2PreviewTransform",
);
const commitButton = document.querySelector<HTMLButtonElement>(
  "#draw2CommitTransform",
);
const cancelButton = document.querySelector<HTMLButtonElement>(
  "#draw2CancelTransform",
);
const flipHorizontalButton = document.querySelector<HTMLButtonElement>(
  "#draw2FlipHorizontal",
);
const flipVerticalButton = document.querySelector<HTMLButtonElement>(
  "#draw2FlipVertical",
);
const rotateCCWButton = document.querySelector<HTMLButtonElement>(
  "#draw2RotateCCW",
);
const rotateCWButton = document.querySelector<HTMLButtonElement>(
  "#draw2RotateCW",
);
const rotate180Button = document.querySelector<HTMLButtonElement>(
  "#draw2Rotate180",
);
const scaleDownButton = document.querySelector<HTMLButtonElement>(
  "#draw2ScaleDown",
);
const scaleUpButton = document.querySelector<HTMLButtonElement>(
  "#draw2ScaleUp",
);
const copyButton = document.querySelector<HTMLButtonElement>("#draw2Copy");
const cutButton = document.querySelector<HTMLButtonElement>("#draw2Cut");
const pasteButton = document.querySelector<HTMLButtonElement>("#draw2Paste");
const undoButton = document.querySelector<HTMLButtonElement>("#draw2Undo");
const redoButton = document.querySelector<HTMLButtonElement>("#draw2Redo");
const timelineTabs = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-draw2-timeline-tab]"),
);
const timelineTabPanels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-draw2-timeline-tab-panel]"),
);
const timelineCardElement = document.querySelector<HTMLElement>(
  "#draw2TimelineCard",
);
const timelineContextMenu = document.querySelector<HTMLElement>(
  "#draw2TimelineContextMenu",
);
const timelineStatusElement = document.querySelector<HTMLElement>(
  "#draw2TimelineStatus",
);
const timelinePositionElement = document.querySelector<HTMLOutputElement>(
  "#draw2TimelinePosition",
);
const timelineDurationElement = document.querySelector<HTMLOutputElement>(
  "#draw2TimelineDuration",
);
const timelineViewportElement = document.querySelector<HTMLElement>(
  "#draw2TimelineViewport",
);
const timelineSpacerElement = document.querySelector<HTMLElement>(
  "#draw2TimelineSpacer",
);
const timelineWindowElement = document.querySelector<HTMLElement>(
  "#draw2TimelineWindow",
);
const timelineSecondaryControlsElement = document.querySelector<HTMLElement>(
  "#draw2TimelineSecondaryControls",
);
const timelinePropertiesResizeElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2TimelinePropertiesResize",
);
const timelinePropertiesElement = document.querySelector<HTMLElement>(
  "#draw2TimelineLayerProperties",
);
const timelinePropertiesBodyElement = document.querySelector<HTMLElement>(
  "#draw2TimelineLayerPropertiesBody",
);
const timelinePropertiesCollapseElement = document.querySelector<
  HTMLButtonElement
>(
  "#draw2TimelinePropertiesCollapse",
);
const animationTagNameElement = document.querySelector<HTMLInputElement>(
  "#draw2TagName",
);
const animationTagFromElement = document.querySelector<HTMLInputElement>(
  "#draw2TagFrom",
);
const animationTagToElement = document.querySelector<HTMLInputElement>(
  "#draw2TagTo",
);
const animationTagLoopElement = document.querySelector<HTMLInputElement>(
  "#draw2TagLoop",
);
const animationTagAddElement = document.querySelector<HTMLButtonElement>(
  "#draw2TagAdd",
);
const animationTagFromSelectionElement = document.querySelector<HTMLButtonElement>(
  "#draw2TagFromSelection",
);
const animationTagFromSelectionStatusElement = document.querySelector<HTMLElement>(
  "#draw2TagFromSelectionStatus",
);
const animationTagListElement = document.querySelector<HTMLElement>(
  "#draw2AnimationTagList",
);
const timelineMarkerKindElement = document.querySelector<HTMLSelectElement>(
  "#draw2MarkerKind",
);
const timelineMarkerLabelElement = document.querySelector<HTMLInputElement>(
  "#draw2MarkerLabel",
);
const timelineMarkerAddElement = document.querySelector<HTMLButtonElement>(
  "#draw2MarkerAdd",
);
const timelineMarkerListElement = document.querySelector<HTMLElement>(
  "#draw2TimelineMarkerList",
);
const drawAudioAssetPickerElement = document.querySelector<HTMLSelectElement>(
  "#draw2DrawAudioAssetPicker",
);
const drawAudioAddElement = document.querySelector<HTMLButtonElement>(
  "#draw2DrawAudioAdd",
);
const drawAudioLaneElement = document.querySelector<HTMLElement>(
  "#draw2DrawAudioLane",
);
const drawAudioEmptyElement = document.querySelector<HTMLElement>(
  "#draw2DrawAudioEmpty",
);
const drawAudioStatusElement = document.querySelector<HTMLOutputElement>(
  "#draw2DrawAudioStatus",
);
const linkedCelToggleElement = document.querySelector<HTMLButtonElement>(
  "#draw2LinkedCelToggle",
);
const linkedCelStatusElement = document.querySelector<HTMLElement>(
  "#draw2LinkedCelStatus",
);
const layerListElement = document.querySelector<HTMLElement>("#draw2LayerList");
const layerPanelAddElement = document.querySelector<HTMLButtonElement>(
  "#draw2LayerPanelAdd",
);
const layerPanelDuplicateElement = document.querySelector<HTMLButtonElement>(
  "#draw2LayerPanelDuplicate",
);
const layerPanelRemoveElement = document.querySelector<HTMLButtonElement>(
  "#draw2LayerPanelRemove",
);
const layerPanelAddTilemapElement = document.querySelector<HTMLButtonElement>(
  "#draw2LayerPanelAddTilemap",
);
const addFrameButton = document.querySelector<HTMLButtonElement>(
  "#draw2AddFrame",
);
const duplicateFrameButton = document.querySelector<HTMLButtonElement>(
  "#draw2DuplicateFrame",
);
const removeFrameButton = document.querySelector<HTMLButtonElement>(
  "#draw2RemoveFrame",
);
const addLayerButton = document.querySelector<HTMLButtonElement>(
  "#draw2AddLayer",
);
const reorderLayerButton = document.querySelector<HTMLButtonElement>(
  "#draw2ReorderLayer",
);
const toggleLayerButton = document.querySelector<HTMLButtonElement>(
  "#draw2ToggleLayer",
);
const toggleOnionButton = document.querySelector<HTMLButtonElement>(
  "#draw2ToggleOnion",
);
const onionOptionsElement = document.querySelector<HTMLDetailsElement>(
  ".draw2-timeline-onion-options",
);
const onionPreviousElement = document.querySelector<HTMLInputElement>(
  "#draw2OnionPrevious",
);
const onionPreviousValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2OnionPreviousValue",
);
const onionNextElement = document.querySelector<HTMLInputElement>(
  "#draw2OnionNext",
);
const onionNextValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2OnionNextValue",
);
const onionOpacityElement = document.querySelector<HTMLInputElement>(
  "#draw2OnionOpacity",
);
const onionOpacityValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2OnionOpacityValue",
);
const onionColorModeElement = document.querySelector<HTMLSelectElement>(
  "#draw2OnionColorMode",
);
const togglePlaybackButton = document.querySelector<HTMLButtonElement>(
  "#draw2TogglePlayback",
);
const playbackFpsElement = document.querySelector<HTMLSelectElement>(
  "#draw2PlaybackFps",
);
const playbackFpsCustomElement = document.querySelector<HTMLInputElement>(
  "#draw2PlaybackFpsCustom",
);
const playbackLoopElement = document.querySelector<HTMLButtonElement>(
  "#draw2PlaybackLoop",
);
let colorButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-color-index]"),
);
const colorButtonGroups = Array.from(
  document.querySelectorAll<HTMLElement>("[data-color-group]"),
);
const colorMapElement = document.querySelector<HTMLElement>("#draw2ColorMap");
const paletteWheelElement = document.querySelector<HTMLCanvasElement>(
  "#draw2PaletteWheel",
);
const hueCursorElement = document.querySelector<HTMLElement>("#draw2HueCursor");
const svCursorElement = document.querySelector<HTMLElement>("#draw2SvCursor");
const colorRElement = document.querySelector<HTMLInputElement>("#draw2ColorR");
const colorGElement = document.querySelector<HTMLInputElement>("#draw2ColorG");
const colorBElement = document.querySelector<HTMLInputElement>("#draw2ColorB");
const colorAlphaElement = document.querySelector<HTMLInputElement>(
  "#draw2ColorAlpha",
);
const colorRValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2ColorRValue",
);
const colorGValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2ColorGValue",
);
const colorBValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2ColorBValue",
);
const colorAlphaValueElement = document.querySelector<HTMLOutputElement>(
  "#draw2ColorAlphaValue",
);
const colorHexElement = document.querySelector<HTMLInputElement>(
  "#draw2ColorHex",
);
const colorHexOutputElement = document.querySelector<HTMLOutputElement>(
  "#draw2ColorHexOutput",
);
const colorApplyButton = document.querySelector<HTMLButtonElement>(
  "#draw2ColorApply",
);
const colorEditorStatusElement = document.querySelector<HTMLElement>(
  "#draw2ColorEditorStatus",
);
const colorHistoryElement = document.querySelector<HTMLElement>(
  "#draw2ColorHistory",
);
const colorRampEndElement = document.querySelector<HTMLSelectElement>(
  "#draw2ColorRampEnd",
);
const colorRampStepsElement = document.querySelector<HTMLInputElement>(
  "#draw2ColorRampSteps",
);
const colorRampSpaceElement = document.querySelector<HTMLSelectElement>(
  "#draw2ColorRampSpace",
);
const colorRampHueElement = document.querySelector<HTMLSelectElement>(
  "#draw2ColorRampHue",
);
const colorRampPreviewElement = document.querySelector<HTMLElement>(
  "#draw2ColorRampPreview",
);
const colorRampCreateButton = document.querySelector<HTMLButtonElement>(
  "#draw2ColorRampCreate",
);
const outlinePlacementElement = document.querySelector<HTMLSelectElement>(
  "#draw2OutlinePlacement",
);
const outlineThicknessElement = document.querySelector<HTMLInputElement>(
  "#draw2OutlineThickness",
);
const outlineConnectivityElement = document.querySelector<HTMLSelectElement>(
  "#draw2OutlineConnectivity",
);
const outlineColorElement = document.querySelector<HTMLSelectElement>(
  "#draw2OutlineColor",
);
const outlineApplyButton = document.querySelector<HTMLButtonElement>(
  "#draw2OutlineApply",
);
const textInsertDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2TextInsertDialog",
);
const textValueElement = document.querySelector<HTMLTextAreaElement>(
  "#draw2TextValue",
);
const textFontElement = document.querySelector<HTMLInputElement>(
  "#draw2TextFont",
);
const textSizeElement = document.querySelector<HTMLInputElement>(
  "#draw2TextSize",
);
const textWeightElement = document.querySelector<HTMLSelectElement>(
  "#draw2TextWeight",
);
const textAlignElement = document.querySelector<HTMLSelectElement>(
  "#draw2TextAlign",
);
const textFillColorElement = document.querySelector<HTMLSelectElement>(
  "#draw2TextFillColor",
);
const textStrokeEnabledElement = document.querySelector<HTMLInputElement>(
  "#draw2TextStrokeEnabled",
);
const textStrokeColorElement = document.querySelector<HTMLSelectElement>(
  "#draw2TextStrokeColor",
);
const textStrokeWidthElement = document.querySelector<HTMLInputElement>(
  "#draw2TextStrokeWidth",
);
const textThresholdElement = document.querySelector<HTMLInputElement>(
  "#draw2TextThreshold",
);
const textPreviewCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2TextPreviewCanvas",
);
const textBoundsWidthElement = document.querySelector<HTMLInputElement>(
  "#draw2TextBoundsWidth",
);
const textBoundsHeightElement = document.querySelector<HTMLInputElement>(
  "#draw2TextBoundsHeight",
);
const textBoundsStatusElement = document.querySelector<HTMLElement>(
  "#draw2TextBoundsStatus",
);
const textInsertButton = document.querySelector<HTMLButtonElement>(
  "#draw2TextInsert",
);
const textCancelButton = document.querySelector<HTMLButtonElement>(
  "#draw2TextCancel",
);
const textFitBoundsButton = document.querySelector<HTMLButtonElement>(
  "#draw2TextFitBounds",
);
const exportPanelStatusElement = document.querySelector<HTMLElement>(
  "#draw2ExportPanelStatus",
);
const exportNameElement = document.querySelector<HTMLInputElement>(
  "#draw2ExportName",
);
const exportScaleElement = document.querySelector<HTMLSelectElement>(
  "#draw2ExportScale",
);
const exportFormatCardsElement = document.querySelector<HTMLElement>(
  "#draw2ExportFormatCards",
);
const exportSelectionSummaryElement = document.querySelector<HTMLElement>(
  "#draw2ExportSelectionSummary",
);
const exportFormatOptionsElement = document.querySelector<HTMLElement>(
  "#draw2ExportFormatOptions",
);
const exportPackageSectionElement = document.querySelector<HTMLElement>(
  "#draw2ExportPackageSection",
);
const exportPackageSingleElement = document.querySelector<HTMLInputElement>(
  "#draw2ExportPackageSingle",
);
const exportPackageZipElement = document.querySelector<HTMLInputElement>(
  "#draw2ExportPackageZip",
);
const exportPreviewCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2ExportPreviewCanvas",
);
const exportPreviewSummaryElement = document.querySelector<HTMLElement>(
  "#draw2ExportPreviewSummary",
);
const exportOutputFilesElement = document.querySelector<HTMLUListElement>(
  "#draw2ExportOutputFiles",
);
const exportProgressElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgress",
);
const exportProgressBarElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressBar",
);
const exportProgressPercentElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressPercent",
);
const exportProgressTitleElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressTitle",
);
const exportProgressDetailElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressDetail",
);
const exportProgressCurrentElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressCurrent",
);
const exportProgressCountElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressCount",
);
const exportProgressTrackElement = document.querySelector<HTMLElement>(
  "#draw2ExportProgressTrack",
);
const exportExecuteButton = document.querySelector<HTMLButtonElement>(
  "#draw2ExportExecute",
);
const exportToMarketButton = document.querySelector<HTMLButtonElement>(
  "#draw2ExportToMarket",
);
const createButton = document.querySelector<HTMLButtonElement>(
  "#draw2CreateProject",
);
const openProjectDialogButton = document.querySelector<HTMLButtonElement>(
  "#draw2OpenProjectDialog",
);
const projectDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2ProjectDialog",
);
const projectDialogIdElement = document.querySelector<HTMLInputElement>(
  "#draw2ProjectDialogId",
);
const projectDialogOpenButton = document.querySelector<HTMLButtonElement>(
  "#draw2ProjectOpen",
);
const projectDialogNewButton = document.querySelector<HTMLButtonElement>(
  "#draw2ProjectNew",
);
const projectDialogStatusElement = document.querySelector<HTMLElement>(
  "#draw2ProjectDialogStatus",
);
const importPxdInput = document.querySelector<HTMLInputElement>(
  "#draw2ImportPxd",
);
const gamePreviewStartButton = document.querySelector<HTMLButtonElement>(
  "#draw2GamePreviewStart",
);
const gamePreviewStopButton = document.querySelector<HTMLButtonElement>(
  "#draw2GamePreviewStop",
);
const gamePreviewRestartButton = document.querySelector<HTMLButtonElement>(
  "#draw2GamePreviewRestart",
);
const gamePreviewPinButton = document.querySelector<HTMLButtonElement>(
  "#draw2GamePreviewPin",
);
const gamePreviewReloadButton = document.querySelector<HTMLButtonElement>(
  "#draw2GamePreviewReload",
);
const gamePreviewStatusElement = document.querySelector<HTMLElement>(
  "#draw2GamePreviewStatus",
);
const goldenProjectStatusElement = document.querySelector<HTMLElement>(
  "#draw2GoldenProjectStatus",
);
const goldenProjectRefsElement = document.querySelector<HTMLElement>(
  "#draw2GoldenProjectRefs",
);
const goldenProjectApplyButton = document.querySelector<HTMLButtonElement>(
  "#draw2GoldenProjectApply",
);
const projectSessionCheckpointButton = document.querySelector<
  HTMLButtonElement
>(
  "#draw2ProjectSessionCheckpoint",
);
const projectSessionCheckpointStatusElement = document.querySelector<
  HTMLElement
>(
  "#draw2ProjectSessionCheckpointStatus",
);
const collaborationScopeOpenButton = document.querySelector<HTMLButtonElement>(
  "#draw2CollaborationScopeOpen",
);
const collaborationScopeStatusElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationScopeStatus",
);
const collaborationScopeDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2CollaborationScopeDialog",
);
const collaborationScopeMessageElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationScopeMessage",
);
const collaborationScopeConsentCheckElement = document.querySelector<HTMLInputElement>(
  "#draw2CollaborationConsentCheck",
);
const collaborationScopeConsentAcceptButton = document.querySelector<HTMLButtonElement>(
  "#draw2CollaborationConsentAccept",
);
const collaborationScopeSaveStatusElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationScopeSaveStatus",
);
const collaborationScopeMasterPanelElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationMasterPanel",
);
const collaborationScopeMasterListElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationMasterList",
);
const collaborationScopeParticipantPanelElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationParticipantPanel",
);
const collaborationScopeParticipantListElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationParticipantList",
);
const collaborationEditGuardElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationEditGuard",
);
const collaborationEditGuardMessageElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationEditGuardMessage",
);
const collaborationEditGuardOpenButton = document.querySelector<HTMLButtonElement>(
  "#draw2CollaborationEditGuardOpen",
);
const collaborationEditPolicyPanelElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationEditPolicy",
);
const collaborationEditPolicyMessageElement = document.querySelector<HTMLElement>(
  "#draw2CollaborationEditPolicyMessage",
);
const collaborationEditPolicyOpenElement = document.querySelector<HTMLInputElement>(
  "#draw2CollaborationEditPolicyOpen",
);
const collaborationEditPolicyAssignedOnlyElement = document.querySelector<HTMLInputElement>(
  "#draw2CollaborationEditPolicyAssignedOnly",
);
const gamePreviewCanvasElement = document.querySelector<HTMLCanvasElement>(
  "#draw2GamePreviewCanvas",
);
const advancedLoadButton = document.querySelector<HTMLButtonElement>(
  "#draw2AdvancedLoad",
);
const advancedPatternButton = document.querySelector<HTMLButtonElement>(
  "#draw2AdvancedPattern",
);
const advancedMirrorButton = document.querySelector<HTMLButtonElement>(
  "#draw2AdvancedMirror",
);
const advancedGridButton = document.querySelector<HTMLButtonElement>(
  "#draw2AdvancedGrid",
);
const advancedGuideButton = document.querySelector<HTMLButtonElement>(
  "#draw2AdvancedGuide",
);
const advancedStatusElement = document.querySelector<HTMLElement>(
  "#draw2AdvancedStatus",
);
const toolStudioElement = document.querySelector<HTMLElement>(
  "#draw2ToolStudio",
);
const toolStudioSummaryElement = document.querySelector<HTMLOutputElement>(
  "#draw2ToolStudioSummary",
);
const toolStudioStatusElement = document.querySelector<HTMLElement>(
  "#draw2ToolStudioStatus",
);
const specialTileScaleElement = document.querySelector<HTMLSelectElement>(
  "#draw2SpecialTileScale",
);
const specialDuplicateFrameElement = document.querySelector<HTMLButtonElement>(
  "#draw2SpecialDuplicateFrame",
);
const specialOpenInspectorElement = document.querySelector<HTMLButtonElement>(
  "#draw2SpecialOpenInspector",
);
const settingsDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2SettingsDialog",
);
const settingsZoomSensitivityElement = document.querySelector<HTMLInputElement>(
  "#draw2ZoomSensitivity",
);
const settingsZoomSensitivityValueElement = document.querySelector<
  HTMLOutputElement
>("#draw2ZoomSensitivityValue");
const settingsCheckerAElement = document.querySelector<HTMLInputElement>(
  "#draw2CheckerA",
);
const settingsCheckerBElement = document.querySelector<HTMLInputElement>(
  "#draw2CheckerB",
);
const settingsGridMinorElement = document.querySelector<HTMLInputElement>(
  "#draw2GridMinor",
);
const settingsGridMajorElement = document.querySelector<HTMLInputElement>(
  "#draw2GridMajor",
);
const settingsThemeAccentElement = document.querySelector<HTMLInputElement>(
  "#draw2ThemeAccent",
);
const settingsResetButton = document.querySelector<HTMLButtonElement>(
  "#draw2SettingsReset",
);
const canvasSettingsDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2CanvasSettingsDialog",
);
const canvasSettingsProjectIdElement = document.querySelector<HTMLInputElement>(
  "#draw2CanvasProjectId",
);
const canvasSettingsWidthElement = document.querySelector<HTMLInputElement>(
  "#draw2CanvasWidth",
);
const canvasSettingsHeightElement = document.querySelector<HTMLInputElement>(
  "#draw2CanvasHeight",
);
const canvasSettingsTileSizeElement = document.querySelector<HTMLSelectElement>(
  "#draw2CanvasTileSize",
);
const canvasSettingsApplyButton = document.querySelector<HTMLButtonElement>(
  "#draw2CanvasSettingsApply",
);
const canvasResizeSummaryElement = document.querySelector<HTMLOutputElement>(
  "#draw2CanvasResizeSummary",
);
const canvasResizePreviewFrameElement = document.querySelector<HTMLElement>(
  "#draw2CanvasResizePreviewFrame",
);
const canvasResizePreviewContentElement = document.querySelector<HTMLElement>(
  "#draw2CanvasResizePreviewContent",
);
const canvasResizeAnchorElements = Array.from(
  document.querySelectorAll<HTMLButtonElement>(
    "[data-canvas-resize-anchor]",
  ),
);
const openCanvasSettingsButton = document.querySelector<HTMLButtonElement>(
  "#draw2OpenCanvasSettings",
);
const zoomLevelElement = document.querySelector<HTMLOutputElement>(
  "#draw2ZoomLevel",
);
const languageElement = document.querySelector<HTMLSelectElement>(
  "#draw2Language",
);
const shortcutsDialogElement = document.querySelector<HTMLDialogElement>(
  "#draw2ShortcutsDialog",
);
const shortcutSearchElement = document.querySelector<HTMLInputElement>(
  "#draw2ShortcutSearch",
);
const shortcutListElement = document.querySelector<HTMLElement>(
  "#draw2ShortcutList",
);

if (
  canvasElement === null || overlayElement === null ||
  erasePreviewElement === null ||
  viewportCenterButtonElement === null ||
  pixelGridElement === null || pixelGridMinorPathElement === null ||
  pixelGridMajorPathElement === null || selectionOverlayElement === null ||
  mirrorGuideOverlayElement === null || mirrorGuideVerticalElement === null ||
  mirrorGuideHorizontalElement === null ||
  mirrorGuideDiagonalDownElement === null ||
  mirrorGuideDiagonalUpElement === null || mirrorToggleXElement === null ||
  mirrorToggleYElement === null || mirrorToggleDiagonalDownElement === null ||
  mirrorToggleDiagonalUpElement === null ||
  selectionOverlayRegionsElement === null || statusElement === null ||
  metricsElement === null || selectionStatusElement === null ||
  projectIdInputElement === null || tileSizeSelectElement === null ||
  toolSelectElement === null || brushSizeElement === null ||
  brushPatternElement === null || brushShapeElement === null ||
  brushAngleElement === null || brushAlgorithmElement === null ||
  brushSizeControlElement === null || quickControlsElement === null ||
  brushOptionsButtonElement === null ||
  brushOptionsSummaryElement === null || brushOptionsFlyoutElement === null ||
  brushOptionsCloseButtonElement === null ||
  brushPresetElement === null || brushPresetNameElement === null ||
  brushPresetSaveButton === null || brushPresetDeleteButton === null ||
  mirrorModeToggleElement === null || viewportContextRailElement === null ||
  similarityControlElement === null ||
  similarityElement === null ||
  similarityValueElement === null || colorSelectionModeElement === null ||
  miniPreviewCanvasElement === null ||
  miniPreviewContainerElement === null ||
  miniPreviewPlayButtonElement === null ||
  miniPreviewReferenceButtonElement === null ||
  miniPreviewReferenceClearButtonElement === null ||
  miniPreviewReferenceInputElement === null ||
  miniPreviewReferenceStatusElement === null ||
  miniPreviewCollapseButtonElement === null ||
  miniPreviewRestoreButtonElement === null ||
  miniPreviewResizeLeftElement === null ||
  miniPreviewResizeBottomElement === null ||
  miniPreviewResizeCornerElement === null ||
  selectionXElement === null || selectionYElement === null ||
  selectionWidthElement === null || selectionHeightElement === null ||
  selectionModeElement === null || selectionMorphologyRadiusElement === null ||
  selectionExpandButton === null ||
  selectionShrinkButton === null || selectionInvertButton === null ||
  selectionBorderButton === null || transformOperationElement === null ||
  transformDxElement === null || transformDyElement === null ||
  transformFactorElement === null || transformAngleElement === null ||
  selectButton === null ||
  commitSelectionButton === null || cancelSelectionButton === null ||
  previewButton === null || commitButton === null || cancelButton === null ||
  flipHorizontalButton === null || flipVerticalButton === null ||
  rotateCCWButton === null || rotateCWButton === null ||
  rotate180Button === null || scaleDownButton === null ||
  scaleUpButton === null || copyButton === null || cutButton === null ||
  pasteButton === null || undoButton === null || redoButton === null ||
  timelineCardElement === null || timelineContextMenu === null ||
  createButton === null || importPxdInput === null ||
  timelineStatusElement === null || timelineViewportElement === null ||
  timelineSpacerElement === null || timelineWindowElement === null ||
  timelinePropertiesResizeElement === null ||
  timelinePropertiesElement === null ||
  timelinePropertiesBodyElement === null ||
  timelinePropertiesCollapseElement === null ||
  timelineSecondaryControlsElement === null ||
  animationTagNameElement === null || animationTagFromElement === null ||
  animationTagToElement === null || animationTagLoopElement === null ||
  animationTagAddElement === null || animationTagListElement === null ||
  timelineMarkerKindElement === null || timelineMarkerLabelElement === null ||
  timelineMarkerAddElement === null || timelineMarkerListElement === null ||
  linkedCelToggleElement === null || linkedCelStatusElement === null ||
  addFrameButton === null || duplicateFrameButton === null ||
  removeFrameButton === null || addLayerButton === null ||
  reorderLayerButton === null || toggleLayerButton === null ||
  toggleOnionButton === null || togglePlaybackButton === null ||
  onionOptionsElement === null ||
  onionPreviousElement === null || onionPreviousValueElement === null ||
  onionNextElement === null || onionNextValueElement === null ||
  onionOpacityElement === null || onionOpacityValueElement === null ||
  onionColorModeElement === null ||
  playbackFpsElement === null || playbackLoopElement === null ||
  playbackFpsCustomElement === null ||
  colorMapElement === null || paletteWheelElement === null ||
  hueCursorElement === null || svCursorElement === null ||
  colorRElement === null || colorGElement === null || colorBElement === null ||
  colorAlphaElement === null || colorRValueElement === null ||
  colorGValueElement === null || colorBValueElement === null ||
  colorAlphaValueElement === null || colorHexElement === null ||
  colorHexOutputElement === null || colorApplyButton === null ||
  colorEditorStatusElement === null || colorHistoryElement === null ||
  colorRampEndElement === null || colorRampStepsElement === null ||
  colorRampSpaceElement === null || colorRampHueElement === null ||
  colorRampPreviewElement === null || colorRampCreateButton === null ||
  outlinePlacementElement === null ||
  outlineThicknessElement === null || outlineConnectivityElement === null ||
  outlineColorElement === null || outlineApplyButton === null ||
  textInsertDialogElement === null || textValueElement === null ||
  textFontElement === null || textSizeElement === null ||
  textWeightElement === null || textAlignElement === null ||
  textFillColorElement === null || textStrokeEnabledElement === null ||
  textStrokeColorElement === null || textStrokeWidthElement === null ||
  textThresholdElement === null || textPreviewCanvasElement === null ||
  textBoundsWidthElement === null || textBoundsHeightElement === null ||
  textBoundsStatusElement === null || textInsertButton === null ||
  textCancelButton === null || textFitBoundsButton === null ||
  gamePreviewStartButton === null ||
  gamePreviewStopButton === null || gamePreviewRestartButton === null ||
  gamePreviewPinButton === null || gamePreviewReloadButton === null ||
  gamePreviewStatusElement === null || goldenProjectStatusElement === null ||
  goldenProjectRefsElement === null || goldenProjectApplyButton === null ||
  projectSessionCheckpointButton === null ||
  projectSessionCheckpointStatusElement === null ||
  gamePreviewCanvasElement === null ||
  advancedLoadButton === null || advancedPatternButton === null ||
  advancedMirrorButton === null || advancedGridButton === null ||
  advancedGuideButton === null ||
  advancedStatusElement === null || languageElement === null ||
  exportPanelStatusElement === null || exportNameElement === null ||
  exportScaleElement === null || exportFormatCardsElement === null ||
  exportSelectionSummaryElement === null ||
  exportFormatOptionsElement === null ||
  exportPackageSectionElement === null || exportPackageSingleElement === null ||
  exportPackageZipElement === null || exportPreviewCanvasElement === null ||
  exportPreviewSummaryElement === null || exportOutputFilesElement === null ||
  exportProgressElement === null || exportProgressBarElement === null ||
  exportProgressPercentElement === null ||
  exportProgressTitleElement === null ||
  exportProgressDetailElement === null ||
  exportProgressCurrentElement === null ||
  exportProgressCountElement === null || exportProgressTrackElement === null ||
  exportExecuteButton === null || exportToMarketButton === null
) {
  throw new Error("Draw2 isolated entry is missing a required element.");
}
if (
  canvasSettingsDialogElement === null ||
  canvasSettingsProjectIdElement === null ||
  canvasSettingsWidthElement === null || canvasSettingsHeightElement === null ||
  canvasSettingsTileSizeElement === null ||
  canvasSettingsApplyButton === null || openCanvasSettingsButton === null ||
  openProjectDialogButton === null || projectDialogElement === null ||
  projectDialogIdElement === null || projectDialogOpenButton === null ||
  projectDialogNewButton === null || projectDialogStatusElement === null
) {
  throw new Error(
    "Draw2 isolated entry is missing Project or canvas settings controls.",
  );
}
if (
  canvasResizeSummaryElement === null ||
  canvasResizePreviewFrameElement === null ||
  canvasResizePreviewContentElement === null ||
  canvasResizeAnchorElements.length !== 9
) {
  throw new Error(
    "Draw2 isolated entry is missing canvas resize preview controls.",
  );
}
const canvasSettingsDialog = canvasSettingsDialogElement;
const canvasSettingsProjectId = canvasSettingsProjectIdElement;
const canvasSettingsWidth = canvasSettingsWidthElement;
const canvasSettingsHeight = canvasSettingsHeightElement;
const canvasSettingsTileSize = canvasSettingsTileSizeElement;
const canvasSettingsApply = canvasSettingsApplyButton;
const openCanvasSettings = openCanvasSettingsButton;
const openProjectDialogTrigger = openProjectDialogButton;
const projectDialog = projectDialogElement;
const projectDialogId = projectDialogIdElement;
const projectDialogOpen = projectDialogOpenButton;
const projectDialogNew = projectDialogNewButton;
const projectDialogStatus = projectDialogStatusElement;
const languageControl = languageElement;
const mirrorToggleX = mirrorToggleXElement;
const mirrorToggleY = mirrorToggleYElement;
const mirrorToggleDiagonalDown = mirrorToggleDiagonalDownElement;
const mirrorToggleDiagonalUp = mirrorToggleDiagonalUpElement;
const onionPrevious = onionPreviousElement;
const onionPreviousValue = onionPreviousValueElement;
const onionNext = onionNextElement;
const onionNextValue = onionNextValueElement;
const onionOpacity = onionOpacityElement;
const onionOpacityValue = onionOpacityValueElement;
const onionColorMode = onionColorModeElement;
const canvasResizeSummary = canvasResizeSummaryElement;
const canvasResizePreviewFrame = canvasResizePreviewFrameElement;
const canvasResizePreviewContent = canvasResizePreviewContentElement;

const drawPersistenceStore = createIndexedDbDraw2PersistenceStore();
const workspaceManifestStore = createIndexedDbWorkspaceManifestStore();
const DRAW2_PERSISTED_JOURNAL_LIMIT = 32;
const DRAW2_PERSISTENCE_DEBOUNCE_MS = 250;
let drawPersistenceRevision = 0;
// The local revision counter is allowed to advance while a save is in flight;
// these two values describe the last snapshot that this tab actually
// observed as persisted. They form the CAS base for the next save.
let drawPersistenceExpectedRevision = 0;
let drawPersistenceExpectedStateHash: string | null = null;
let drawPersistenceSaveQueue: Promise<void> = Promise.resolve();
let drawPersistenceSaveTimer: number | undefined;
interface DrawPersistenceSnapshotEnvelope {
  readonly reason: string;
  readonly state: ProjectState;
  readonly history: ReturnType<LocalUndoRedoHistory["snapshot"]>;
  readonly journal: Draw2JournalSnapshot;
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly timelineMetadata: Draw2TimelineMetadata;
  readonly assetPackages: readonly AssetPackageManifest[];
}
let drawPersistenceSavePending: DrawPersistenceSnapshotEnvelope | undefined;

function drawJournalSnapshot(): Draw2JournalSnapshot {
  const operations = journal.operations.slice(-DRAW2_PERSISTED_JOURNAL_LIMIT);
  const dirtyTileWrites = journal.dirtyTileWrites.slice(
    -DRAW2_PERSISTED_JOURNAL_LIMIT,
  );
  return {
    operations: operations.map((operation) => ({ ...operation })),
    dirtyTileWrites: dirtyTileWrites.map((write) => ({
      assetId: write.assetId,
      tiles: write.tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: Array.from(tile.bytes),
      })),
    })),
  };
}

function queueDrawPersistenceSave(reason: string): void {
  drawPersistenceSavePending = {
    reason,
    state: cloneProjectStateShared(state),
    history: history.snapshot(DRAW2_PERSISTED_HISTORY_LIMIT),
    journal: drawJournalSnapshot(),
    assetDefinitions: assetDefinitions.map(cloneAssetDefinitionEntry),
    timelineMetadata: draw2TimelineMetadataSnapshot(),
    assetPackages: assetPackages.map(cloneAssetPackageManifest),
  };
  if (drawPersistenceSaveTimer !== undefined) return;
  drawPersistenceSaveTimer = window.setTimeout(() => {
    drawPersistenceSaveTimer = undefined;
    void drainDrawPersistenceSave();
  }, DRAW2_PERSISTENCE_DEBOUNCE_MS);
}

async function drainDrawPersistenceSave(): Promise<void> {
  const envelope = drawPersistenceSavePending;
  if (envelope === undefined) return;
  drawPersistenceSavePending = undefined;
  const projectId = envelope.state.projectId;
  const revision = drawPersistenceRevision + 1;
  drawPersistenceRevision = revision;
  drawPersistenceSaveQueue = drawPersistenceSaveQueue.then(async () => {
    const expectedRevision = drawPersistenceExpectedRevision;
    const expectedStateHash = drawPersistenceExpectedStateHash;
    const record = await createDraw2PersistenceRecord(
      envelope.state,
      envelope.history,
      envelope.journal,
      revision,
      new Date().toISOString(),
      envelope.assetDefinitions,
      envelope.timelineMetadata,
      envelope.assetPackages,
    );
    const saved = await drawPersistenceStore.save(record, {
      expectedRevision,
      expectedStateHash,
    });
    if (!saved.ok) {
      document.body.dataset.drawPersistenceState = "unavailable";
      return;
    }
    if (saved.stale) {
      // A rejected CAS write is not a persisted Draw revision. Do not move
      // the Workspace Manifest or emit a successful-looking checkpoint for a
      // snapshot that another tab already superseded.
      document.body.dataset.drawPersistenceState = "stale-write-ignored";
      // Refresh the CAS base without adopting the other tab's state. The
      // current tab remains the visible source of truth until the user makes
      // another edit; that next explicit save can then retry from the latest
      // persisted revision instead of failing every time with the old base.
      const latest = await drawPersistenceStore.load(projectId);
      if (latest !== null) {
        drawPersistenceRevision = Math.max(
          drawPersistenceRevision,
          latest.revision,
        );
        drawPersistenceExpectedRevision = latest.revision;
        drawPersistenceExpectedStateHash = latest.stateHash;
      }
      return;
    }
    drawPersistenceExpectedRevision = revision;
    drawPersistenceExpectedStateHash = record.stateHash;
    document.body.dataset.drawPersistenceState = envelope.reason === "recovery"
      ? "restored"
      : "saved";
    document.body.dataset.drawPersistenceRevision = String(revision);
    await workspaceManifestStore.updateModule(
      asWorkspaceProjectId(projectId),
      "draw",
      {
        status: "READY",
        revision,
        stateHash: record.stateHash,
        savedAt: record.savedAt,
      },
      envelope.state.name,
    );
  }).catch(() => {
    document.body.dataset.drawPersistenceState = "error";
  });
  await drawPersistenceSaveQueue.catch(() => undefined);
  if (drawPersistenceSavePending !== undefined) {
    await drainDrawPersistenceSave();
  }
}

async function flushDrawPersistence(): Promise<void> {
  while (true) {
    if (drawPersistenceSaveTimer !== undefined) {
      window.clearTimeout(drawPersistenceSaveTimer);
      drawPersistenceSaveTimer = undefined;
    }
    if (drawPersistenceSavePending !== undefined) {
      await drainDrawPersistenceSave();
    }
    const queue = drawPersistenceSaveQueue;
    await queue.catch(() => undefined);
    if (
      drawPersistenceSavePending === undefined &&
      drawPersistenceSaveTimer === undefined &&
      queue === drawPersistenceSaveQueue
    ) return;
  }
}

// A reload can happen before the normal 250ms debounce expires. Ask IndexedDB
// to drain the pending snapshot as soon as the document is being hidden; this
// keeps the debounce for normal drawing performance while closing the small
// reload/navigation loss window.
const flushDrawPersistenceOnPageExit = (): void => {
  flushDraw2EditorPreferences();
  void flushDrawPersistence();
};
window.addEventListener("pagehide", flushDrawPersistenceOnPageExit);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushDrawPersistenceOnPageExit();
  }
});

function saveDrawProjectState(reason = "edit"): void {
  repository.save(state);
  queueDrawPersistenceSave(reason);
}

function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
      "button, a, summary, input, textarea, select, " +
      "[contenteditable=true], [role=button], [role=tab], [role=menuitem], " +
      "[role=option], [role=checkbox], [role=radio], [role=separator], " +
      "[role=slider], [role=spinbutton], [role=combobox], [role=listbox], " +
      "[role=grid], [role=gridcell], [role=tree], [role=treegrid], " +
      "[role=treeitem], [role=row], [role=cell], [role=columnheader], " +
      "[role=list], [role=tablist], [role=toolbar]",
  ) !== null;
}

const canvas = canvasElement;
const overlay = overlayElement;
const erasePreview = erasePreviewElement;
const tilesetSourceCanvas = tilesetSourceCanvasElement;
const pixelGrid = pixelGridElement;
const pixelGridMinorPath = pixelGridMinorPathElement;
const pixelGridMajorPath = pixelGridMajorPathElement;
const tilemapGrid = tilemapGridElement;
const tilemapGridMinorPath = tilemapGridMinorPathElement;
const tilemapGridMajorPath = tilemapGridMajorPathElement;
let lastViewportDisplayWidth = -1;
let lastViewportDisplayHeight = -1;
let lastViewportRenderedScaleX = -1;
let lastViewportRenderedScaleY = -1;
let lastPixelGridLayoutKey = "";

// Safari may move focus before it emits click. When the focused editor field
// commits on blur, that commit can rebuild a rail/flyout and detach the button
// that was just pressed, so the first press only closes the field. Preserve
// the original pointer target through click and release the old field after
// the action has completed. Input-to-input focus changes keep native behavior.
document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch" || event.button !== 0) return;
  const active = document.activeElement;
  const target = event.target instanceof Element ? event.target : null;
  if (
    !(active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement) ||
    target === null || active === target || active.contains(target)
  ) return;
  if (
    target.closest("input, textarea, select, [contenteditable=true]") !== null
  ) {
    return;
  }
  const immediateAction = target.closest(
    "button, a, canvas, [role=button], [role=tab], [role=menuitem], [data-workspace-tool]",
  );
  if (immediateAction === null) return;
  if (event.cancelable) event.preventDefault();
  window.setTimeout(() => {
    if (document.activeElement === active) active.blur();
  }, 0);
}, { capture: true });

// A single-line field is committed consistently with Enter. Blurring uses the
// field's existing change/blur path, so individual editors keep their own
// validation and persistence rules. Textareas retain Enter for line breaks.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const field = event.target;
  if (
    !(field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement) ||
    field.type === "button" || field.type === "submit" ||
    field.type === "reset" || field.type === "file" ||
    field.type === "checkbox" || field.type === "radio"
  ) return;
  if (event.cancelable) event.preventDefault();
  field.blur();
}, { capture: true });
let lastTilemapGridLayoutKey = "";
const selectionOverlay = selectionOverlayElement;
const selectionOverlayRegions = selectionOverlayRegionsElement;
const status = statusElement;
const metrics = metricsElement;
const selectionStatus = selectionStatusElement;
const projectIdInput = projectIdInputElement;
const activeProjectId = readActiveWorkspaceProjectId();
if (projectIdInput.value.trim() === DEFAULT_WORKSPACE_PROJECT_ID) {
  projectIdInput.value = activeProjectId;
}
const tileSizeSelect = tileSizeSelectElement;
const toolSelect = toolSelectElement;
const brushSize = brushSizeElement;
const brushPattern = brushPatternElement;
const brushShape = brushShapeElement;
const brushAngle = brushAngleElement;
const brushAlgorithm = brushAlgorithmElement;
const brushSizeControl = brushSizeControlElement;
const quickControls = quickControlsElement;
const brushOptionsButton = brushOptionsButtonElement;
const brushOptionsSummary = brushOptionsSummaryElement;
const brushOptionsFlyout = brushOptionsFlyoutElement;
const brushOptionsCloseButton = brushOptionsCloseButtonElement;
const brushPreset = brushPresetElement;
const brushPresetName = brushPresetNameElement;
const mirrorModeControl = mirrorModeToggleElement;
const viewportContextRail = viewportContextRailElement;
const similarityControl = similarityControlElement;
const similarity = similarityElement;
const similarityValue = similarityValueElement;
const colorSelectionModeControl = colorSelectionModeElement;
const miniPreviewCanvas = miniPreviewCanvasElement;
const miniPreviewPlayButton = miniPreviewPlayButtonElement;
const miniPreviewReferenceButton = miniPreviewReferenceButtonElement;
const miniPreviewReferenceClearButton = miniPreviewReferenceClearButtonElement;
const miniPreviewReferenceInput = miniPreviewReferenceInputElement;
const miniPreviewReferenceStatus = miniPreviewReferenceStatusElement;
const selectionX = selectionXElement;
const selectionY = selectionYElement;
const selectionWidth = selectionWidthElement;
const selectionHeight = selectionHeightElement;
const selectionModeControl = selectionModeElement;
const selectionMorphologyRadius = selectionMorphologyRadiusElement;
const transformOperation = transformOperationElement;
const transformDx = transformDxElement;
const transformDy = transformDyElement;
const transformFactor = transformFactorElement;
const transformAngle = transformAngleElement;
const commitSelectionControl = commitSelectionButton;
const cancelSelectionControl = cancelSelectionButton;
const cancelTransformControl = cancelButton;
const copyControl = copyButton;
const cutControl = cutButton;
const pasteControl = pasteButton;
const gamePreviewStartControl = gamePreviewStartButton;
const gamePreviewStopControl = gamePreviewStopButton;
const gamePreviewRestartControl = gamePreviewRestartButton;
const gamePreviewPinControl = gamePreviewPinButton;
const gamePreviewReloadControl = gamePreviewReloadButton;
const gamePreviewStatus = gamePreviewStatusElement;
const gamePreviewCanvas = gamePreviewCanvasElement;
const gamePreviewContextCandidate = gamePreviewCanvas.getContext("2d");
if (gamePreviewContextCandidate === null) {
  throw new Error("Isolated Runtime preview could not acquire Canvas2D.");
}
const gamePreviewContext = gamePreviewContextCandidate;
const miniPreviewContextCandidate = miniPreviewCanvas.getContext("2d", {
  alpha: false,
});
if (miniPreviewContextCandidate === null) {
  throw new Error("Draw2 mini preview could not acquire Canvas2D.");
}
const miniPreviewContext = miniPreviewContextCandidate;
const audioDrawPreviewContext =
  audioDrawPreviewCanvasElement?.getContext("2d", {
    alpha: false,
  }) ?? undefined;

let virtualCursorEnabled = true;
// This guard is initialized before the first canvas projection. The editor
// preferences themselves are loaded after the core state is created, but
// early layout passes must never write their default values back to storage.
let draw2EditorPreferencesReady = false;
// The mini preview remains available from View, but it is not a permanent
// panel. A blank floating surface competes with the Canvas on first launch.
let miniPreviewEnabled = false;
const MINI_PREVIEW_LAYOUT_KEY = "pixieed:draw2:mini-preview-layout:v1";
const MINI_PREVIEW_MIN_SIZE = 112;
const MINI_PREVIEW_MAX_WIDTH = 360;
const MINI_PREVIEW_MAX_HEIGHT = 280;

type MiniPreviewResizeMode = "left" | "bottom" | "corner";
interface MiniPreviewLayout {
  width: number;
  height: number;
  collapsed: boolean;
}

function clampMiniPreview(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function readMiniPreviewLayout(): MiniPreviewLayout {
  try {
    const raw = window.localStorage.getItem(MINI_PREVIEW_LAYOUT_KEY);
    if (raw === null) {
      return { width: 148, height: 148, collapsed: false };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { width: 148, height: 148, collapsed: false };
    }
    const record = parsed as Record<string, unknown>;
    return {
      width: clampMiniPreview(
        typeof record.width === "number" ? record.width : 148,
        MINI_PREVIEW_MIN_SIZE,
        MINI_PREVIEW_MAX_WIDTH,
      ),
      height: clampMiniPreview(
        typeof record.height === "number" ? record.height : 148,
        MINI_PREVIEW_MIN_SIZE,
        MINI_PREVIEW_MAX_HEIGHT,
      ),
      collapsed: record.collapsed === true,
    };
  } catch {
    return { width: 148, height: 148, collapsed: false };
  }
}

let miniPreviewLayout = readMiniPreviewLayout();
let miniPreviewResizeSession: {
  mode: MiniPreviewResizeMode;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startRight: number;
  startTop: number;
} | undefined;

function persistMiniPreviewLayout(): void {
  try {
    window.localStorage.setItem(
      MINI_PREVIEW_LAYOUT_KEY,
      JSON.stringify(miniPreviewLayout),
    );
  } catch {
    // Private browsing and storage-disabled contexts remain fully usable.
  }
}

function miniPreviewModeAvailable(): boolean {
  const mode = workspaceFrameElement?.dataset.creatorMode;
  return mode === undefined || mode === "DRAW" || mode === "ANIMATE";
}

function miniPreviewIsVisible(): boolean {
  return miniPreviewModeAvailable() && miniPreviewEnabled &&
    !miniPreviewLayout.collapsed;
}

function syncMiniPreviewLayout(): void {
  const { width, height, collapsed } = miniPreviewLayout;
  const modeAvailable = miniPreviewModeAvailable();
  const previewVisible = modeAvailable && miniPreviewEnabled && !collapsed;
  miniPreviewContainerElement!.style.setProperty(
    "--draw2-mini-preview-width",
    `${width}px`,
  );
  miniPreviewContainerElement!.style.setProperty(
    "--draw2-mini-preview-height",
    `${height}px`,
  );
  miniPreviewContainerElement!.hidden = !previewVisible;
  // The restore control lives in the canvas viewport. Keep it visible only
  // while the preview surface is closed so it never sits on top of the
  // preview's own toolbar and collapse control.
  miniPreviewRestoreButtonElement!.hidden = !modeAvailable || previewVisible;
  miniPreviewRestoreButtonElement!.setAttribute(
    "aria-hidden",
    String(!modeAvailable),
  );
  const previewToggleLabel = previewVisible
    ? "Hide mini preview"
    : "Open mini preview";
  miniPreviewRestoreButtonElement!.setAttribute(
    "aria-label",
    previewToggleLabel,
  );
  miniPreviewRestoreButtonElement!.title = previewToggleLabel;
  miniPreviewRestoreButtonElement!.setAttribute(
    "aria-pressed",
    String(previewVisible),
  );
  const previewToggleText = miniPreviewRestoreButtonElement!.querySelector(
    "span",
  );
  if (previewToggleText !== null) {
    previewToggleText.textContent = previewVisible
      ? "Hide preview"
      : "Mini preview";
  }
}

function finishMiniPreviewResize(pointerId: number): void {
  const session = miniPreviewResizeSession;
  if (session === undefined || session.pointerId !== pointerId) return;
  miniPreviewResizeSession = undefined;
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
}

function updateMiniPreviewResize(event: PointerEvent): void {
  const session = miniPreviewResizeSession;
  if (session === undefined || session.pointerId !== event.pointerId) return;
  const nextWidth = session.mode === "bottom"
    ? session.startWidth
    : clampMiniPreview(
      session.startRight - event.clientX,
      MINI_PREVIEW_MIN_SIZE,
      MINI_PREVIEW_MAX_WIDTH,
    );
  const nextHeight = session.mode === "left"
    ? session.startHeight
    : clampMiniPreview(
      event.clientY - session.startTop,
      MINI_PREVIEW_MIN_SIZE,
      MINI_PREVIEW_MAX_HEIGHT,
    );
  miniPreviewLayout = {
    ...miniPreviewLayout,
    width: nextWidth,
    height: nextHeight,
  };
  syncMiniPreviewLayout();
  drawMiniPreviewProjection();
  if (event.cancelable) event.preventDefault();
}

function beginMiniPreviewResize(
  mode: MiniPreviewResizeMode,
  event: PointerEvent,
): void {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  const rect = miniPreviewContainerElement!.getBoundingClientRect();
  miniPreviewResizeSession = {
    mode,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    startRight: rect.right,
    startTop: rect.top,
  };
  const handle = event.currentTarget;
  if (handle instanceof HTMLElement) handle.setPointerCapture(event.pointerId);
  if (event.cancelable) event.preventDefault();
}

function bindMiniPreviewResize(
  element: HTMLButtonElement,
  mode: MiniPreviewResizeMode,
): void {
  element.addEventListener("pointerdown", (event) => {
    beginMiniPreviewResize(mode, event);
  });
  element.addEventListener("pointercancel", (event) => {
    finishMiniPreviewResize(event.pointerId);
  });
  element.addEventListener("lostpointercapture", (event) => {
    finishMiniPreviewResize((event as PointerEvent).pointerId);
  });
}

window.addEventListener("pointermove", updateMiniPreviewResize);
window.addEventListener("pointerup", (event) => {
  finishMiniPreviewResize(event.pointerId);
});
window.addEventListener("pointercancel", (event) => {
  finishMiniPreviewResize(event.pointerId);
});

syncMiniPreviewLayout();
let miniPreviewReferenceSource: CanvasImageSource | undefined;
let miniPreviewReferenceObjectUrl: string | undefined;
let miniPreviewBackingWidth = miniPreviewCanvas.width;
let miniPreviewBackingHeight = miniPreviewCanvas.height;

function closeMiniPreviewReferenceSource(): void {
  const source = miniPreviewReferenceSource;
  if (source !== undefined && "close" in source) {
    const close = (source as { close?: () => void }).close;
    close?.call(source);
  }
  miniPreviewReferenceSource = undefined;
  if (miniPreviewReferenceObjectUrl !== undefined) {
    URL.revokeObjectURL(miniPreviewReferenceObjectUrl);
    miniPreviewReferenceObjectUrl = undefined;
  }
}

function setMiniPreviewReferenceStatus(message: string): void {
  miniPreviewReferenceStatus.textContent = localizeDraw2Text(message);
}

async function readMiniPreviewReference(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    setMiniPreviewReferenceStatus("Reference image is not supported.");
    return;
  }
  closeMiniPreviewReferenceSource();
  try {
    if (typeof createImageBitmap === "function") {
      miniPreviewReferenceSource = await createImageBitmap(file);
    } else {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      miniPreviewReferenceObjectUrl = objectUrl;
      miniPreviewReferenceSource = image;
    }
    miniPreviewReferenceClearButton.disabled = false;
    miniPreviewReferenceButton.setAttribute("aria-pressed", "true");
    setMiniPreviewReferenceStatus(`Reference: ${file.name}`);
    drawMiniPreviewProjection();
  } catch (cause) {
    closeMiniPreviewReferenceSource();
    miniPreviewReferenceClearButton.disabled = true;
    miniPreviewReferenceButton.setAttribute("aria-pressed", "false");
    setMiniPreviewReferenceStatus(
      cause instanceof Error
        ? cause.message
        : "Reference image could not be read.",
    );
  }
}

function miniPreviewSourceSize(
  source: CanvasImageSource,
): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  const canvasSource = source as HTMLCanvasElement;
  return { width: canvasSource.width, height: canvasSource.height };
}

function syncMiniPreviewCanvasResolution(): void {
  if (!miniPreviewIsVisible()) return;
  const display = miniPreviewCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const maxBackingSide = 768;
  const displayWidth = Math.max(1, Math.round(display.width * dpr));
  const displayHeight = Math.max(1, Math.round(display.height * dpr));
  const sourceWidth = Math.max(1, Math.min(canvas.width, maxBackingSide));
  const sourceHeight = Math.max(1, Math.min(canvas.height, maxBackingSide));
  const width = Math.max(
    96,
    Math.min(maxBackingSide, Math.max(displayWidth, sourceWidth)),
  );
  const height = Math.max(
    96,
    Math.min(maxBackingSide, Math.max(displayHeight, sourceHeight)),
  );
  if (
    width === miniPreviewBackingWidth && height === miniPreviewBackingHeight
  ) return;
  miniPreviewCanvas.width = width;
  miniPreviewCanvas.height = height;
  miniPreviewBackingWidth = width;
  miniPreviewBackingHeight = height;
  miniPreviewContext.imageSmoothingEnabled = false;
}

function drawMiniPreviewSource(
  source: CanvasImageSource,
  alpha: number,
  smoothing: boolean,
): void {
  drawCanvasPreviewSource(
    miniPreviewCanvas,
    miniPreviewContext,
    source,
    alpha,
    smoothing,
  );
}

function drawCanvasPreviewSource(
  targetCanvas: HTMLCanvasElement,
  targetContext: CanvasRenderingContext2D,
  source: CanvasImageSource,
  alpha: number,
  smoothing: boolean,
): void {
  const sourceSize = miniPreviewSourceSize(source);
  if (sourceSize.width <= 0 || sourceSize.height <= 0) return;
  const scale = Math.min(
    targetCanvas.width / sourceSize.width,
    targetCanvas.height / sourceSize.height,
  );
  const width = Math.max(1, Math.round(sourceSize.width * scale));
  const height = Math.max(1, Math.round(sourceSize.height * scale));
  const x = Math.floor((targetCanvas.width - width) / 2);
  const y = Math.floor((targetCanvas.height - height) / 2);
  targetContext.save();
  targetContext.globalAlpha = alpha;
  targetContext.imageSmoothingEnabled = smoothing;
  targetContext.drawImage(
    source,
    0,
    0,
    sourceSize.width,
    sourceSize.height,
    x,
    y,
    width,
    height,
  );
  targetContext.restore();
}

function syncAudioDrawPreviewCanvasResolution(): void {
  if (
    audioDrawPreviewCanvasElement === null ||
    audioDrawPreviewContext === undefined
  ) return;
  const display = audioDrawPreviewCanvasElement.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const maxBackingSide = 768;
  const sourceWidth = Math.max(1, Math.min(canvas.width, maxBackingSide));
  const sourceHeight = Math.max(1, Math.min(canvas.height, maxBackingSide));
  const displayWidth = Math.max(
    1,
    Math.round((display.width || 256) * dpr),
  );
  const displayHeight = Math.max(
    1,
    Math.round((display.height || 256) * dpr),
  );
  const width = Math.max(
    96,
    Math.min(maxBackingSide, Math.max(displayWidth, sourceWidth)),
  );
  const height = Math.max(
    96,
    Math.min(maxBackingSide, Math.max(displayHeight, sourceHeight)),
  );
  if (
    audioDrawPreviewCanvasElement.width !== width ||
    audioDrawPreviewCanvasElement.height !== height
  ) {
    audioDrawPreviewCanvasElement.width = width;
    audioDrawPreviewCanvasElement.height = height;
  }
  audioDrawPreviewContext.imageSmoothingEnabled = false;
}

function drawAudioDrawPreviewProjection(): void {
  if (
    audioDrawPreviewCanvasElement === null ||
    audioDrawPreviewContext === undefined
  ) return;
  syncAudioDrawPreviewCanvasResolution();
  audioDrawPreviewContext.clearRect(
    0,
    0,
    audioDrawPreviewCanvasElement.width,
    audioDrawPreviewCanvasElement.height,
  );
  audioDrawPreviewContext.fillStyle = "#0b0e14";
  audioDrawPreviewContext.fillRect(
    0,
    0,
    audioDrawPreviewCanvasElement.width,
    audioDrawPreviewCanvasElement.height,
  );
  drawCanvasPreviewSource(
    audioDrawPreviewCanvasElement,
    audioDrawPreviewContext,
    canvas,
    1,
    false,
  );
}

function drawMiniPreviewProjection(): void {
  drawAudioDrawPreviewProjection();
  if (!miniPreviewIsVisible()) return;
  syncMiniPreviewCanvasResolution();
  miniPreviewContext.clearRect(
    0,
    0,
    miniPreviewCanvas.width,
    miniPreviewCanvas.height,
  );
  miniPreviewContext.fillStyle = "#0b0e14";
  miniPreviewContext.fillRect(
    0,
    0,
    miniPreviewCanvas.width,
    miniPreviewCanvas.height,
  );
  if (miniPreviewReferenceSource !== undefined) {
    drawMiniPreviewSource(miniPreviewReferenceSource, 0.48, true);
  }
  drawMiniPreviewSource(canvas, 1, false);
}

function syncMiniPreviewPlaybackControl(): void {
  const playing = playbackRunning;
  const use = miniPreviewPlayButton.querySelector("use");
  use?.setAttribute(
    "href",
    `./assets/icons/draw2-icons.svg#icon-${playing ? "pause" : "play"}`,
  );
  miniPreviewPlayButton.setAttribute("aria-pressed", String(playing));
  miniPreviewPlayButton.setAttribute(
    "aria-label",
    localizeDraw2Text(
      playing ? "Stop mini preview" : "Play mini preview",
    ),
  );
  miniPreviewPlayButton.title = localizeDraw2Text(
    playing ? "Stop mini preview" : "Play mini preview",
  );
}

// `viewportZoom` is the free-view CSS scale (1 = actual 100%). Fit is kept
// as a separate mode so the desktop canvas can stay inside its viewport.
let viewportZoom = 1;
let viewportFitMode = true;
let viewportModeUserSelected = false;
let viewportPanX = 0;
let viewportPanY = 0;
let zoomWheelAccumulator = 0;
let lastViewportPointerClient: { x: number; y: number } | undefined;
let viewportCenterSourcePoint: { x: number; y: number } | undefined;
let viewportCenterReturnFrame: number | undefined;
const VIEWPORT_CENTER_RETURN_DURATION_MS = 180;
let visualSettings = readDraw2VisualSettings((() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})());
function readStoredDraw2Locale(): Draw2Locale {
  try {
    return normalizeDraw2Locale(
      window.localStorage.getItem("pixieed:draw2:locale:v1"),
    );
  } catch {
    return "en";
  }
}

let draw2Locale = readStoredDraw2Locale();

interface Draw2TranslationSource {
  source: string;
  translated: string;
}

// Locale changes are explicit user actions. Keep the original value for each
// mounted node so EN → JA → EN never compounds partial replacements, without
// observing the live editor or retaining detached nodes strongly.
const draw2TextTranslationSources = new WeakMap<Text, Draw2TranslationSource>();
const draw2AttributeTranslationSources = new WeakMap<
  Element,
  Map<string, Draw2TranslationSource>
>();

function translateDraw2Subtree(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const textNode = node as Text;
    if (textNode.textContent !== null) {
      const current = textNode.textContent;
      const previous = draw2TextTranslationSources.get(textNode);
      const source = previous !== undefined &&
          (current === previous.source || current === previous.translated)
        ? previous.source
        : current;
      const translated = translateDraw2Text(source, draw2Locale);
      if (translated !== current) textNode.textContent = translated;
      draw2TextTranslationSources.set(textNode, { source, translated });
    }
    node = walker.nextNode();
  }
  const elements = root instanceof Element
    ? [
      root,
      ...root.querySelectorAll<HTMLElement>(
        "[aria-label], [title], [placeholder]",
      ),
    ]
    : [
      ...root.querySelectorAll<HTMLElement>(
        "[aria-label], [title], [placeholder]",
      ),
    ];
  for (const element of elements) {
    let sources = draw2AttributeTranslationSources.get(element);
    if (sources === undefined) {
      sources = new Map<string, Draw2TranslationSource>();
      draw2AttributeTranslationSources.set(element, sources);
    }
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (value !== null) {
        const previous = sources.get(attribute);
        const source = previous !== undefined &&
            (value === previous.source || value === previous.translated)
          ? previous.source
          : value;
        const translated = translateDraw2Text(source, draw2Locale);
        if (translated !== value) element.setAttribute(attribute, translated);
        sources.set(attribute, { source, translated });
      }
    }
  }
}

function localizeDraw2Text(value: string): string {
  return translateDraw2Text(value, draw2Locale);
}

function applyDraw2Locale(nextLocale = draw2Locale, persist = true): void {
  draw2Locale = normalizeDraw2Locale(nextLocale);
  document.documentElement.lang = draw2Locale;
  languageControl.value = draw2Locale;
  updatePlaybackLoopControl();
  translateDraw2Subtree(document.body);
  if (persist) {
    try {
      window.localStorage.setItem("pixieed:draw2:locale:v1", draw2Locale);
    } catch (cause) {
      // Locale preference is optional and never blocks editing.
    }
  }
}

function applyVisualSettings(
  nextSettings = visualSettings,
  persist = true,
): void {
  visualSettings = normalizeDraw2VisualSettings(nextSettings);
  const root = document.documentElement;
  root.style.setProperty("--draw2-canvas-checker-a", visualSettings.checkerA);
  root.style.setProperty("--draw2-canvas-checker-b", visualSettings.checkerB);
  root.style.setProperty("--draw2-grid-minor", visualSettings.gridMinor);
  root.style.setProperty("--draw2-grid-major", visualSettings.gridMajor);
  root.style.setProperty("--draw2-accent", visualSettings.themeAccent);
  root.style.setProperty("--draw2-accent-strong", visualSettings.themeAccent);
  if (persist) {
    try {
      writeDraw2VisualSettings(window.localStorage, visualSettings);
    } catch { /* storage is optional */ }
  }
  if (settingsZoomSensitivityElement !== null) {
    settingsZoomSensitivityElement.value = String(
      visualSettings.zoomSensitivity,
    );
  }
  if (settingsZoomSensitivityValueElement !== null) {
    settingsZoomSensitivityValueElement.value = `${
      Math.round(visualSettings.zoomSensitivity * 100)
    }%`;
  }
  if (settingsCheckerAElement !== null) {
    settingsCheckerAElement.value = visualSettings.checkerA;
  }
  if (settingsCheckerBElement !== null) {
    settingsCheckerBElement.value = visualSettings.checkerB;
  }
  if (settingsGridMinorElement !== null) {
    settingsGridMinorElement.value = visualSettings.gridMinor;
  }
  if (settingsGridMajorElement !== null) {
    settingsGridMajorElement.value = visualSettings.gridMajor;
  }
  if (settingsThemeAccentElement !== null) {
    settingsThemeAccentElement.value = visualSettings.themeAccent;
  }
  updatePixelGridOverlay();
}

function currentZoomPercent(): string {
  const percent = Math.round(currentViewportDisplayScale() * 100);
  return viewportFitMode ? `Fit · ${percent}%` : `${percent}%`;
}

function cancelViewportCenterReturn(): void {
  if (viewportCenterReturnFrame === undefined) return;
  cancelAnimationFrame(viewportCenterReturnFrame);
  viewportCenterReturnFrame = undefined;
}

function syncInitialViewportMode(): void {
  if (viewportModeUserSelected) return;
  const fitByDefault = shouldUseInitialViewportFit();
  if (viewportFitMode === fitByDefault) return;
  viewportFitMode = fitByDefault;
  viewportPanX = 0;
  viewportPanY = 0;
}

function viewportAvailableSize(): { width: number; height: number } {
  if (viewportWrapElement === null) return { width: 0, height: 0 };
  const styles = getComputedStyle(viewportWrapElement);
  const horizontalPadding = parseFloat(styles.paddingLeft) +
    parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) +
    parseFloat(styles.paddingBottom);
  return {
    width: Math.max(0, viewportWrapElement.clientWidth - horizontalPadding),
    height: Math.max(0, viewportWrapElement.clientHeight - verticalPadding),
  };
}

function shouldUseInitialViewportFit(): boolean {
  const available = viewportAvailableSize();
  const availableWidth = available.width;
  const availableHeight = available.height;
  if (
    availableWidth <= 0 || availableHeight <= 0 || canvas.width <= 0 ||
    canvas.height <= 0
  ) return false;
  return canvas.width > availableWidth || canvas.height > availableHeight;
}

function viewportFitScale(): number {
  if (viewportWrapElement === null) return 1;
  const available = viewportAvailableSize();
  const availableWidth = available.width;
  const availableHeight = available.height;
  if (
    availableWidth <= 0 || availableHeight <= 0 || canvas.width <= 0 ||
    canvas.height <= 0
  ) return 1;
  return Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(
      MAX_VIEWPORT_ZOOM,
      availableWidth / canvas.width,
      availableHeight / canvas.height,
    ),
  );
}

function currentViewportDisplayScale(): number {
  if (viewportFitMode) return viewportFitScale();
  const freeZoom = Number.isFinite(viewportZoom)
    ? Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, viewportZoom))
    : 1;
  return Math.max(MIN_VIEWPORT_ZOOM, freeZoom);
}

function viewportPanLimits(): { x: number; y: number } | undefined {
  if (viewportWrapElement === null || canvasStackElement === null) {
    return undefined;
  }
  const viewportSize = viewportAvailableSize();
  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  if (viewportWidth <= 0 || viewportHeight <= 0) return undefined;
  const contentWidth = canvasStackElement.clientWidth || Math.max(
    1,
    Math.round(canvas.width * currentViewportDisplayScale()),
  );
  const contentHeight = canvasStackElement.clientHeight || Math.max(
    1,
    Math.round(canvas.height * currentViewportDisplayScale()),
  );
  return {
    x: Math.max(0, (contentWidth - viewportWidth) / 2),
    y: Math.max(0, (contentHeight - viewportHeight) / 2),
  };
}

function clampViewportPanValues(
  panX: number,
  panY: number,
): { x: number; y: number } {
  const limits = viewportPanLimits();
  if (limits === undefined) {
    return {
      x: Number.isFinite(panX) ? panX : 0,
      y: Number.isFinite(panY) ? panY : 0,
    };
  }
  return {
    x: Math.max(
      -limits.x,
      Math.min(limits.x, Number.isFinite(panX) ? panX : 0),
    ),
    y: Math.max(
      -limits.y,
      Math.min(limits.y, Number.isFinite(panY) ? panY : 0),
    ),
  };
}

function animateViewportPanTo(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  cancelViewportCenterReturn();
  const startX = Number.isFinite(fromX) ? fromX : 0;
  const startY = Number.isFinite(fromY) ? fromY : 0;
  const targetX = Number.isFinite(toX) ? toX : 0;
  const targetY = Number.isFinite(toY) ? toY : 0;
  if (
    Math.abs(startX - targetX) < 0.5 &&
    Math.abs(startY - targetY) < 0.5
  ) {
    viewportPanX = targetX;
    viewportPanY = targetY;
    applyViewportTransform({ clampPan: false });
    return;
  }
  const startedAt = performance.now();
  const tick = (now: number): void => {
    const progress = Math.min(
      1,
      Math.max(0, (now - startedAt) / VIEWPORT_CENTER_RETURN_DURATION_MS),
    );
    const eased = 1 - Math.pow(1 - progress, 3);
    viewportPanX = startX + (targetX - startX) * eased;
    viewportPanY = startY + (targetY - startY) * eased;
    applyViewportTransform({ clampPan: false });
    if (progress < 1) {
      viewportCenterReturnFrame = requestAnimationFrame(tick);
      return;
    }
    viewportPanX = targetX;
    viewportPanY = targetY;
    viewportCenterReturnFrame = undefined;
    applyViewportTransform();
  };
  viewportCenterReturnFrame = requestAnimationFrame(tick);
}

function animateViewportCenterReturn(fromX: number, fromY: number): void {
  animateViewportPanTo(fromX, fromY, 0, 0);
}

function applyViewportDisplaySize(): void {
  if (canvasStackElement === null) return;
  const displayScale = currentViewportDisplayScale();
  const displayWidth = Math.max(1, Math.round(canvas.width * displayScale));
  const displayHeight = Math.max(1, Math.round(canvas.height * displayScale));
  const renderedScaleX = displayWidth / Math.max(1, canvas.width);
  const renderedScaleY = displayHeight / Math.max(1, canvas.height);
  const displayGeometryUnchanged = lastViewportDisplayWidth === displayWidth &&
    lastViewportDisplayHeight === displayHeight &&
    lastViewportRenderedScaleX === renderedScaleX &&
    lastViewportRenderedScaleY === renderedScaleY;
  if (displayGeometryUnchanged) return;
  lastViewportDisplayWidth = displayWidth;
  lastViewportDisplayHeight = displayHeight;
  lastViewportRenderedScaleX = renderedScaleX;
  lastViewportRenderedScaleY = renderedScaleY;
  // Do not CSS-scale the stack. A fractional transform makes a browser
  // composite the raster and its guide overlays as a filtered texture. The
  // display dimensions below are always integer CSS pixels.
  canvasStackElement.style.width = `${displayWidth}px`;
  canvasStackElement.style.height = `${displayHeight}px`;
  canvasStackElement.style.maxWidth = "none";
  canvasStackElement.style.maxHeight = "none";
  canvasStackElement.style.setProperty(
    "--draw2-canvas-display-width",
    `${displayWidth}px`,
  );
  canvasStackElement.style.setProperty(
    "--draw2-canvas-display-height",
    `${displayHeight}px`,
  );
  canvasStackElement.style.setProperty(
    "--draw2-checker-cell-size-display",
    `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleX)}px`,
  );
  canvasStackElement.style.setProperty(
    "--draw2-checker-cell-size-display-x",
    `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleX)}px`,
  );
  canvasStackElement.style.setProperty(
    "--draw2-checker-cell-size-display-y",
    `${projectCheckerCellSize(DRAW2_CHECKER_CELL_SIZE_PX, renderedScaleY)}px`,
  );
}

function applyViewportTransform(
  options: { clampPan?: boolean } = {},
): void {
  if (canvasStackElement === null) return;
  syncInitialViewportMode();
  const displayScale = currentViewportDisplayScale();
  applyViewportDisplaySize();
  if (options.clampPan !== false) {
    const clamped = clampViewportPanValues(viewportPanX, viewportPanY);
    viewportPanX = clamped.x;
    viewportPanY = clamped.y;
  }
  canvasStackElement.style.transformOrigin = "center center";
  canvasStackElement.style.transform =
    `translate(${viewportPanX}px, ${viewportPanY}px)`;
  const layoutWidth = canvasStackElement.clientWidth ||
    Math.max(1, Math.round(canvas.width * currentViewportDisplayScale()));
  const gridMetrics = projectPixelGridMetrics(canvas.width, layoutWidth, 1);
  canvasStackElement.style.setProperty(
    "--draw2-grid-pixel-step",
    `${gridMetrics.pixelStepCssPx}px`,
  );
  canvasStackElement.style.setProperty(
    "--draw2-grid-major-step",
    `${gridMetrics.majorStepCssPx}px`,
  );
  updatePixelGridOverlay();
  canvasStackElement.dataset.viewportZoom = displayScale.toFixed(3);
  canvasStackElement.dataset.viewportPercent = currentZoomPercent();
  canvasStackElement.dataset.viewportDisplayScale = displayScale.toFixed(3);
  canvasStackElement.dataset.viewportMode = viewportFitMode ? "fit" : "free";
  if (zoomLevelElement !== null) zoomLevelElement.value = currentZoomPercent();
  window.dispatchEvent(
    new CustomEvent("draw2:viewport-changed", {
      detail: {
        zoom: displayScale,
        zoomPercent: Math.round(displayScale * 100),
        panX: viewportPanX,
        panY: viewportPanY,
        width: canvas.width,
        height: canvas.height,
        displayScale,
        fit: viewportFitMode,
      },
    }),
  );
  scheduleDraw2EditorPreferencesSave();
  const activeAsset = state.assets[state.activeAssetId];
  if (activeAsset !== undefined) syncMirrorGuideOverlay(activeAsset);
  rememberViewportCenterSourcePoint();
}

function updatePixelGridOverlay(): void {
  if (canvasStackElement === null) return;
  const layoutWidth = Math.max(
    1,
    canvasStackElement.clientWidth || canvas.width,
  );
  const layoutHeight = Math.max(
    1,
    canvasStackElement.clientHeight || canvas.height,
  );
  const nextLayoutKey =
    `${canvas.width}:${canvas.height}:${layoutWidth}:${layoutHeight}`;
  const layoutChanged = lastPixelGridLayoutKey !== nextLayoutKey;
  lastPixelGridLayoutKey = nextLayoutKey;
  if (layoutChanged) {
    pixelGrid.setAttribute(
      "viewBox",
      `0 0 ${layoutWidth.toFixed(3)} ${layoutHeight.toFixed(3)}`,
    );
    pixelGrid.style.width = `${layoutWidth}px`;
    pixelGrid.style.height = `${layoutHeight}px`;
  }
  pixelGrid.style.setProperty(
    "--draw2-grid-opacity",
    getPixelGridOpacityForScale(currentViewportDisplayScale()).toFixed(3),
  );
  pixelGrid.style.setProperty(
    "--draw2-grid-major-opacity",
    getPixelGridOpacityForScale(currentViewportDisplayScale(), { major: true })
      .toFixed(3),
  );
  if (layoutChanged) {
    pixelGridMinorPath.setAttribute(
      "d",
      buildPixelGridSvgPath(
        canvas.width,
        canvas.height,
        layoutWidth,
        layoutHeight,
        1,
      ),
    );
    pixelGridMajorPath.setAttribute(
      "d",
      buildPixelGridSvgPath(
        canvas.width,
        canvas.height,
        layoutWidth,
        layoutHeight,
        8,
      ),
    );
  }
  updateTilemapGridOverlay(layoutWidth, layoutHeight);
}

function updateTilemapGridOverlay(
  layoutWidth: number,
  layoutHeight: number,
): void {
  if (
    tilemapGrid === null || tilemapGridMinorPath === null ||
    tilemapGridMajorPath === null
  ) return;
  const map = activeTilemap();
  if (map === undefined) {
    tilemapGrid.setAttribute("hidden", "");
    lastTilemapGridLayoutKey = "";
    return;
  }
  const key =
    `${map.id}:${map.cellSize}:${canvas.width}:${canvas.height}:${layoutWidth}:${layoutHeight}`;
  tilemapGrid.removeAttribute("hidden");
  if (key === lastTilemapGridLayoutKey) return;
  lastTilemapGridLayoutKey = key;
  tilemapGrid.setAttribute(
    "viewBox",
    `0 0 ${layoutWidth.toFixed(3)} ${layoutHeight.toFixed(3)}`,
  );
  tilemapGrid.style.width = `${layoutWidth}px`;
  tilemapGrid.style.height = `${layoutHeight}px`;
  const paths = buildTilemapGridSvgPath(
    canvas.width,
    canvas.height,
    layoutWidth,
    layoutHeight,
    map.cellSize,
  );
  tilemapGridMinorPath.setAttribute("d", paths.minor);
  tilemapGridMajorPath.setAttribute("d", paths.major);
}

const pixelGridResizeObserver = canvasStackElement === null
  ? undefined
  : new ResizeObserver(() => updatePixelGridOverlay());
if (canvasStackElement !== null) {
  pixelGridResizeObserver?.observe(canvasStackElement);
}
const viewportResizeObserver = viewportWrapElement === null
  ? undefined
  : new ResizeObserver(() => applyResponsiveViewportResize());
if (viewportWrapElement !== null) {
  viewportResizeObserver?.observe(viewportWrapElement);
}
window.visualViewport?.addEventListener(
  "resize",
  () => applyResponsiveViewportResize(),
  { passive: true },
);
window.visualViewport?.addEventListener(
  "scroll",
  () => applyResponsiveViewportResize(),
  { passive: true },
);

function viewportTransformOrigin(): { x: number; y: number } | undefined {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  if (viewport === undefined) return undefined;
  return {
    x: viewport.left + viewport.width / 2,
    y: viewport.top + viewport.height / 2,
  };
}

function viewportWheelAnchor(
  event: WheelEvent,
): { x: number; y: number } | undefined {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  if (viewport === undefined) return undefined;
  const eventPoint = { x: event.clientX, y: event.clientY };
  const eventPointIsUsable = Number.isFinite(eventPoint.x) &&
    Number.isFinite(eventPoint.y);
  const eventPointIsInsideViewport = eventPointIsUsable &&
    eventPoint.x >= viewport.left && eventPoint.x <= viewport.right &&
    eventPoint.y >= viewport.top && eventPoint.y <= viewport.bottom;
  const pointer = lastViewportPointerClient;
  const pointerIsInsideViewport = pointer !== undefined &&
    pointer.x >= viewport.left && pointer.x <= viewport.right &&
    pointer.y >= viewport.top && pointer.y <= viewport.bottom;
  // The preceding pointer move is the reliable physical pointer location.
  // Some synthesized trackpad/wheel events report the viewport centre instead
  // of the cell that the pointer is actually over.
  if (pointerIsInsideViewport) return pointer;
  if (eventPointIsInsideViewport) return eventPoint;
  return eventPointIsUsable ? eventPoint : pointer;
}

function sourcePointForViewportClient(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }
  return {
    x: Math.max(
      0,
      Math.min(
        canvas.width,
        ((clientX - bounds.left) / bounds.width) * canvas.width,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        canvas.height,
        ((clientY - bounds.top) / bounds.height) * canvas.height,
      ),
    ),
  };
}

function mirrorGuidePointForViewportClient(
  clientX: number,
  clientY: number,
  asset: Pick<RasterAsset, "width" | "height">,
): { x: number; y: number } {
  const source = sourcePointForViewportClient(clientX, clientY);
  return {
    x: canvasCoordinateToMirrorGuide(source.x, asset.width),
    y: canvasCoordinateToMirrorGuide(source.y, asset.height),
  };
}

function rememberViewportCenterSourcePoint(): void {
  const center = viewportTransformOrigin();
  if (center === undefined) return;
  viewportCenterSourcePoint = sourcePointForViewportClient(center.x, center.y);
}

function applyResponsiveViewportResize(): void {
  if (viewportFitMode) {
    viewportPanX = 0;
    viewportPanY = 0;
    applyViewportTransform({ clampPan: false });
    return;
  }
  if (viewportWrapElement === null || viewportCenterSourcePoint === undefined) {
    applyViewportTransform();
    return;
  }
  const viewport = viewportWrapElement.getBoundingClientRect();
  if (viewport.width <= 0 || viewport.height <= 0) {
    applyViewportTransform();
    return;
  }
  applyViewportDisplaySize();
  const presentationCenter = canvasPresentationCenter();
  const displayScale = currentViewportDisplayScale();
  const projection = zoomAtSourcePoint({
    nextZoom: displayScale,
    sourceX: viewportCenterSourcePoint.x,
    sourceY: viewportCenterSourcePoint.y,
    rasterWidth: canvas.width,
    rasterHeight: canvas.height,
    presentationCenterX: presentationCenter.x,
    presentationCenterY: presentationCenter.y,
    anchorClientX: viewport.left + viewport.width / 2,
    anchorClientY: viewport.top + viewport.height / 2,
    displayScale,
    snap: false,
  });
  viewportPanX = projection.offsetX;
  viewportPanY = projection.offsetY;
  // Keep the source point currently at the viewport centre stable while the
  // desktop workspace is resized.
  applyViewportTransform({ clampPan: false });
}

function canvasPresentationCenter(): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: bounds.left + (bounds.width / 2) - viewportPanX,
    y: bounds.top + (bounds.height / 2) - viewportPanY,
  };
}

interface ViewportZoomOptions {
  readonly sourcePoint?: { x: number; y: number };
  readonly snap?: boolean;
}

function zoomViewportAtClient(
  clientX: number,
  clientY: number,
  nextZoom: number,
  options: ViewportZoomOptions = {},
): void {
  const previousZoom = currentViewportDisplayScale();
  const sourcePoint = options.sourcePoint ??
    sourcePointForViewportClient(clientX, clientY);
  cancelViewportCenterReturn();
  const requestedZoom = Number.isFinite(nextZoom)
    ? Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, nextZoom))
    : previousZoom;
  // Any explicit zoom input leaves Fit mode. The target is an absolute CSS
  // scale, so 1.0 always means actual 100% on the desktop workspace.
  viewportModeUserSelected = true;
  viewportFitMode = false;
  viewportZoom = options.snap === false
    ? requestedZoom
    : snapPixelPerfectZoom(requestedZoom);
  // Size first, while retaining the previous translation. The actual base
  // centre can move when an oversized canvas becomes clipped vertically, so
  // it must be measured instead of assumed to be the viewport centre.
  applyViewportDisplaySize();
  const presentationCenter = canvasPresentationCenter();
  const projection = zoomAtSourcePoint({
    nextZoom: viewportZoom,
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    rasterWidth: canvas.width,
    rasterHeight: canvas.height,
    presentationCenterX: presentationCenter.x,
    presentationCenterY: presentationCenter.y,
    anchorClientX: clientX,
    anchorClientY: clientY,
    displayScale: viewportZoom,
    snap: false,
  });
  viewportZoom = projection.zoom;
  // Zooming never recentres automatically. The source point under the cursor
  // or pinch centre remains authoritative at every zoom level, including when
  // zooming out through actual 100%.
  viewportPanX = projection.offsetX;
  viewportPanY = projection.offsetY;
  applyViewportTransform({ clampPan: false });
}

function stepViewportZoom(direction: -1 | 1): void {
  const anchor = viewportTransformOrigin();
  if (anchor === undefined) return;
  zoomViewportAtClient(
    anchor.x,
    anchor.y,
    stepPixelPerfectZoom(currentViewportDisplayScale(), direction),
  );
}

function fitViewport(): void {
  cancelViewportCenterReturn();
  viewportModeUserSelected = true;
  viewportFitMode = true;
  viewportPanX = 0;
  viewportPanY = 0;
  applyViewportTransform({ clampPan: false });
}

const draw2ViewportBridge = {
  snapshot: () => ({
    zoom: currentViewportDisplayScale(),
    zoomPercent: Math.round(currentViewportDisplayScale() * 100),
    panX: viewportPanX,
    panY: viewportPanY,
    width: canvas.width,
    height: canvas.height,
    fit: viewportFitMode,
  }),
  setZoom: (nextZoom: number): void => {
    const anchor = viewportTransformOrigin();
    if (anchor === undefined || !Number.isFinite(nextZoom)) return;
    zoomViewportAtClient(anchor.x, anchor.y, nextZoom);
  },
  stepZoom: (direction: -1 | 1): void => {
    stepViewportZoom(direction);
  },
  center: (): void => {
    animateViewportCenterReturn(viewportPanX, viewportPanY);
  },
  fit: fitViewport,
  pan: (dx: number, dy: number): void => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    cancelViewportCenterReturn();
    viewportPanX += dx;
    viewportPanY += dy;
    applyViewportTransform();
  },
};
(
  window as Window & {
    __pixiedraw2DrawViewport?: typeof draw2ViewportBridge;
  }
).__pixiedraw2DrawViewport = draw2ViewportBridge;

viewportCenterButtonElement.addEventListener("click", () => {
  draw2ViewportBridge.center();
  setStatus("Canvasを中央に配置しています。");
});

function syncDisplayToggles(): void {
  const miniPreviewAvailable = miniPreviewModeAvailable();
  for (const button of displayToggleButtons) {
    const isMiniPreview = button.dataset.draw2DisplayToggle === "mini-preview";
    const enabled = isMiniPreview
      ? miniPreviewAvailable && miniPreviewEnabled
      : virtualCursorEnabled;
    if (isMiniPreview) {
      button.hidden = !miniPreviewAvailable;
      button.inert = !miniPreviewAvailable;
      button.setAttribute("aria-hidden", String(!miniPreviewAvailable));
    }
    button.setAttribute("aria-checked", String(enabled));
    button.classList.toggle("is-active", enabled);
  }
  syncMiniPreviewLayout();
  drawOverlay();
}

const drawingContext = canvas.getContext("2d", { alpha: true });
const overlayContext = overlay.getContext("2d");
const erasePreviewContext = erasePreview.getContext("2d");
const textPreviewContext = textPreviewCanvasElement.getContext("2d");
if (
  drawingContext === null || overlayContext === null ||
  erasePreviewContext === null || textPreviewContext === null
) {
  throw new Error("Draw2 reference viewport could not acquire Canvas2D.");
}
const canonicalContext = drawingContext;
const selectionOverlayContext = overlayContext;
const eraseProjectionContext = erasePreviewContext;
const textPreviewProjectionContext = textPreviewContext;
const tilesetSourceContext = tilesetSourceCanvas?.getContext("2d") ?? null;
const TRANSFORM_PREVIEW_TILE_SIZE = 256;
let transformPreviewScratch: {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
} | undefined;

function getTransformPreviewScratch(): typeof transformPreviewScratch {
  if (transformPreviewScratch !== undefined) return transformPreviewScratch;
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = TRANSFORM_PREVIEW_TILE_SIZE;
  scratchCanvas.height = TRANSFORM_PREVIEW_TILE_SIZE;
  const scratchContext = scratchCanvas.getContext("2d");
  if (scratchContext === null) return undefined;
  scratchContext.imageSmoothingEnabled = false;
  transformPreviewScratch = {
    canvas: scratchCanvas,
    context: scratchContext,
  };
  return transformPreviewScratch;
}

function configurePixelRenderingContexts(): void {
  // Resizing a canvas resets all context flags. Re-apply nearest-neighbor
  // rendering after every raster-size change so imports cannot soften pixels.
  canonicalContext.imageSmoothingEnabled = false;
  selectionOverlayContext.imageSmoothingEnabled = false;
  eraseProjectionContext.imageSmoothingEnabled = false;
  textPreviewProjectionContext.imageSmoothingEnabled = false;
  if (tilesetSourceContext !== null) {
    tilesetSourceContext.imageSmoothingEnabled = false;
  }
  miniPreviewContext.imageSmoothingEnabled = false;
  gamePreviewContext.imageSmoothingEnabled = false;
}

function syncRasterCanvasDimensions(width: number, height: number): void {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  if (canvas.width !== safeWidth) canvas.width = safeWidth;
  if (canvas.height !== safeHeight) canvas.height = safeHeight;
  if (overlay.width !== safeWidth) overlay.width = safeWidth;
  if (overlay.height !== safeHeight) overlay.height = safeHeight;
  if (erasePreview.width !== safeWidth) {
    erasePreview.width = safeWidth;
  }
  if (erasePreview.height !== safeHeight) {
    erasePreview.height = safeHeight;
  }
  if (tilesetSourceCanvas !== null) {
    if (tilesetSourceCanvas.width !== safeWidth) {
      tilesetSourceCanvas.width = safeWidth;
    }
    if (tilesetSourceCanvas.height !== safeHeight) {
      tilesetSourceCanvas.height = safeHeight;
    }
  }
  configurePixelRenderingContexts();
  mirrorGuide = normalizeMirrorGuide({ width: safeWidth, height: safeHeight });
  applyViewportTransform();
}

configurePixelRenderingContexts();
const undoControl = undoButton;
const redoControl = redoButton;
const timelineStatus = timelineStatusElement;
const timelineViewport = timelineViewportElement;
const timelineSpacer = timelineSpacerElement;
const timelineWindow = timelineWindowElement;
const timelinePropertiesResize = timelinePropertiesResizeElement;
const timelineProperties = timelinePropertiesElement;
const timelinePropertiesBody = timelinePropertiesBodyElement;
const timelinePropertiesCollapse = timelinePropertiesCollapseElement;
const timelineSecondaryControls = timelineSecondaryControlsElement;
const timelineCard = timelineCardElement;
const timelineContext = timelineContextMenu;
const tagNameControl = animationTagNameElement;
const tagFromControl = animationTagFromElement;
const tagToControl = animationTagToElement;
const tagLoopControl = animationTagLoopElement;
const tagAddControl = animationTagAddElement;
const tagFromSelectionControl = animationTagFromSelectionElement;
const tagFromSelectionStatus = animationTagFromSelectionStatusElement;
const tagList = animationTagListElement;
const markerKindControl = timelineMarkerKindElement;
const markerLabelControl = timelineMarkerLabelElement;
const markerAddControl = timelineMarkerAddElement;
const markerList = timelineMarkerListElement;
const drawAudioAssetPicker = drawAudioAssetPickerElement;
const drawAudioAdd = drawAudioAddElement;
const drawAudioLane = drawAudioLaneElement;
const drawAudioEmpty = drawAudioEmptyElement;
const drawAudioStatus = drawAudioStatusElement;
const linkedCelToggleControl = linkedCelToggleElement;
const linkedCelStatus = linkedCelStatusElement;
const importPxdControl = importPxdInput;
const addFrameControl = addFrameButton;
const duplicateFrameControl = duplicateFrameButton;
const removeFrameControl = removeFrameButton;
const addLayerControl = addLayerButton;
const reorderLayerControl = reorderLayerButton;
const toggleLayerControl = toggleLayerButton;
const toggleOnionControl = toggleOnionButton;
const onionOptions = onionOptionsElement;
const onionOptionsPopover = onionOptions.querySelector<HTMLElement>(
  ".draw2-timeline-onion-popover",
);
const togglePlaybackControl = togglePlaybackButton;
const playbackFpsControl = playbackFpsElement;
const playbackFpsCustomControl = playbackFpsCustomElement;
const playbackLoopControl = playbackLoopElement;
const playbackRateGroup = playbackFpsControl.closest<HTMLElement>(
  ".draw2-timeline-rate",
);
type PlaybackLoopMode = "off" | "loop" | "bounce";
let playbackLoopMode: PlaybackLoopMode = "loop";
const advancedLoadControl = advancedLoadButton;
const advancedPatternControl = advancedPatternButton;
const advancedMirrorControl = advancedMirrorButton;
const advancedGridControl = advancedGridButton;
const advancedGuideControl = advancedGuideButton;
const advancedStatus = advancedStatusElement;
const colorMap = colorMapElement;
const paletteWheel = paletteWheelElement;
const hueCursor = hueCursorElement;
const svCursor = svCursorElement;
const colorR = colorRElement;
const colorG = colorGElement;
const colorB = colorBElement;
const colorAlpha = colorAlphaElement;
const colorRValue = colorRValueElement;
const colorGValue = colorGValueElement;
const colorBValue = colorBValueElement;
const colorAlphaValue = colorAlphaValueElement;
const colorHex = colorHexElement;
const colorHexOutput = colorHexOutputElement;
const colorApply = colorApplyButton;
const colorEditorStatus = colorEditorStatusElement;
const colorHistoryControl = colorHistoryElement;
const colorRampEndControl = colorRampEndElement;
const colorRampStepsControl = colorRampStepsElement;
const colorRampSpaceControl = colorRampSpaceElement;
const colorRampHueControl = colorRampHueElement;
const colorRampPreviewControl = colorRampPreviewElement;
const colorRampCreateControl = colorRampCreateButton;
const outlinePlacementControl = outlinePlacementElement;
const outlineThicknessControl = outlineThicknessElement;
const outlineConnectivityControl = outlineConnectivityElement;
const outlineColorControl = outlineColorElement;
const outlineApplyControl = outlineApplyButton;
const textInsertDialogControl = textInsertDialogElement;
const textValueControl = textValueElement;
const textFontControl = textFontElement;
const textSizeControl = textSizeElement;
const textWeightControl = textWeightElement;
const textAlignControl = textAlignElement;
const textFillColorControl = textFillColorElement;
const textStrokeEnabledControl = textStrokeEnabledElement;
const textStrokeColorControl = textStrokeColorElement;
const textStrokeWidthControl = textStrokeWidthElement;
const textThresholdControl = textThresholdElement;
const textPreviewCanvasControl = textPreviewCanvasElement;
const textBoundsWidthControl = textBoundsWidthElement;
const textBoundsHeightControl = textBoundsHeightElement;
const textBoundsStatusControl = textBoundsStatusElement;
const textInsertControl = textInsertButton;
const textCancelControl = textCancelButton;
const textFitBoundsControl = textFitBoundsButton;
const exportPanelStatus = exportPanelStatusElement;
const exportName = exportNameElement;
const exportScale = exportScaleElement;
const exportFormatCards = exportFormatCardsElement;
const exportSelectionSummary = exportSelectionSummaryElement;
const exportFormatOptions = exportFormatOptionsElement;
const exportPackageSection = exportPackageSectionElement;
const exportPackageSingle = exportPackageSingleElement;
const exportPackageZip = exportPackageZipElement;
const exportPreviewCanvas = exportPreviewCanvasElement;
const exportPreviewSummary = exportPreviewSummaryElement;
const exportOutputFiles = exportOutputFilesElement;
const exportProgress = exportProgressElement;
const exportProgressBar = exportProgressBarElement;
const exportProgressPercent = exportProgressPercentElement;
const exportProgressTitle = exportProgressTitleElement;
const exportProgressDetail = exportProgressDetailElement;
const exportProgressCurrent = exportProgressCurrentElement;
const exportProgressCount = exportProgressCountElement;
const exportProgressTrack = exportProgressTrackElement;
const exportExecute = exportExecuteButton;
const exportToMarket = exportToMarketButton;
const tilesetCellSizeControl = document.querySelector<HTMLSelectElement>(
  "#draw2TilesetCellSize",
);
const tilesetGridElement = document.querySelector<HTMLElement>(
  "#draw2TilesetGrid",
);
const paletteWheelContextCandidate = paletteWheel.getContext("2d", {
  willReadFrequently: true,
});
if (paletteWheelContextCandidate === null) {
  throw new Error("Draw2 palette wheel could not acquire Canvas2D.");
}
const paletteWheelContext = paletteWheelContextCandidate;
let paletteWheelRenderKey = "";

const instrumentation = new SampledInstrumentation(1, () => 0);
const journal = new InMemoryLocalJournal();
const repository = new InMemoryProjectRepository();
const renderer = new ReferenceRenderer();
let state: ProjectState = createProject({
  projectId: "draw2-local-demo",
  width: 256,
  height: 256,
  tileSize: 32,
});
const selectedExportFormats = new Set<ExportFormat>(["png"]);
let exportPackageMode: ExportPackageMode = "single";
let core = new EditorCore(state, { instrumentation });
let canonicalStateGeneration = 0;
let history = new LocalUndoRedoHistory(state);
let pixyncDrawActorId: string | undefined;
let pixyncDrawClientId: string | undefined;
let canonicalOperationQueue: Promise<void> = Promise.resolve();

/** Adopt a canonical result and rebuild the command facade from that result. */
function adoptCanonicalState(nextState: ProjectState): void {
  state = nextState;
  core = new EditorCore(state, { instrumentation });
  canonicalStateGeneration += 1;
}

/** Serialize every async operation that can replace the canonical state. */
function enqueueCanonicalOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const queued = canonicalOperationQueue.then(operation);
  canonicalOperationQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

window.addEventListener("draw2:pixync-binding", (event) => {
  const detail = (event as CustomEvent<{
    readonly actorId?: unknown;
    readonly clientId?: unknown;
    readonly projectId?: unknown;
  }>).detail;
  if (
    typeof detail?.actorId !== "string" ||
    typeof detail?.clientId !== "string" || detail.projectId !== state.projectId
  ) return;
  pixyncDrawActorId = detail.actorId;
  pixyncDrawClientId = detail.clientId;
});

function activeDrawActorId(): string {
  return pixyncDrawActorId ?? "local-preview-user";
}

function activeDrawClientId(): string {
  return pixyncDrawClientId ?? DRAW_CLIENT_ID;
}

function publishDrawRasterCommit(
  result: CommandResult,
  nextState: ProjectState,
  baseStructureEpoch: number,
): void {
  window.dispatchEvent(
    new CustomEvent("draw2:raster-operation-committed", {
      detail: { result, nextState, baseStructureEpoch },
    }),
  );
}

function productionPayloadExceedsRealtimeBytes(payload: unknown): boolean {
  if (pixyncProductionRoot === undefined) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).byteLength >
      PIXYNC_DRAW2_MAX_PAYLOAD_BYTES;
  } catch {
    return true;
  }
}

function rejectOversizedProductionPayload(payload: unknown): boolean {
  if (!productionPayloadExceedsRealtimeBytes(payload)) return false;
  setStatus(
    "この操作はリアルタイム同期の上限を超えるため、変更を確定しません。選択範囲を小さくするか、操作を分割してください。",
    "error",
  );
  return true;
}

const pixyncDrawStatePort: PixyncDrawProductStatePort = {
  preservesLocalHistory: true,
  current: () => ({
    state,
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth,
  }),
  applyRemote: (input: DrawApplyInput): Promise<DrawApplyReceipt> =>
    enqueueCanonicalOperation(async () => {
      const operation = input.operation;
      const command: EditorCommand = {
        commandId: operation.commandId,
        projectId: operation.projectId,
        assetId: operation.assetId,
        actorId: operation.actorId,
        clientId: operation.clientId,
        clientSequence: operation.clientSequence,
        structureEpoch: input.baseStructureEpoch,
        schemaVersion: 1,
        baseStructureEpoch: input.baseStructureEpoch,
        createdAtMonotonicMs: performance.now(),
        commandType: operation.operationType as EditorCommand["commandType"],
        payload: operation.payload as EditorCommand["payload"],
      } as unknown as EditorCommand;
      const applied = operation.operationType === "selection.transformCommit"
        ? await applyCompactSelectionTransform(state, {
          ...command,
          commandType: "selection.transformCommit",
          payload: operation.payload,
        } as unknown as SelectionTransformWireCommand)
        : await new EditorCore(state, { instrumentation }).execute(command);
      if (!applied.ok) {
        throw new Error(
          applied.diagnostics[0]?.code ?? "PIXYNC_DRAW_REMOTE_APPLY_FAILED",
        );
      }
      if (!applied.result.noOp) {
        if (operation.operationType === "selection.transformCommit") {
          await history.rebaseRemoteSelectionTransformOperation(
            {
              ...command,
              commandType: "selection.transformCommit",
              payload: operation.payload,
            } as unknown as SelectionTransformWireCommand,
            applied.state,
          );
        } else {
          await history.rebaseRemoteRasterOperation(command, applied.state);
        }
        adoptCanonicalState(applied.state);
        saveDrawProjectState("pixync-remote");
        notifyAssetStateChanged();
        renderTimeline();
        await present();
      }
      const rasterHash = await drawRasterHash(state, operation.assetId);
      return {
        operationId: operation.operationId,
        projectId: operation.projectId,
        actorId: operation.actorId,
        clientId: operation.clientId,
        clientSequence: operation.clientSequence,
        baseProjectRevision: input.baseProjectRevision,
        assetId: operation.assetId,
        baseStructureEpoch: input.baseStructureEpoch,
        structureEpoch: state.structureEpoch,
        rasterHash,
        localUndoDepth: history.undoDepth,
        localRedoDepth: history.redoDepth,
      };
    }),
};

interface Draw2PixyncJournalBinding {
  readonly projectId: string;
  readonly journal: PixyncDurableJournal;
}

let pixyncProjectLifecycle:
  | PixyncProjectLifecycleCoordinator<Draw2PixyncJournalBinding>
  | undefined;

interface SharedPixyncPersistence {
  readonly projectId: string;
  readonly port: PixyncSnapshotPersistencePort & {
    remove(): Promise<boolean>;
  };
}

let sharedPixyncPersistence: SharedPixyncPersistence | undefined;

function clonePixyncSnapshot(
  snapshot: PixyncDurableSnapshot | undefined,
): PixyncDurableSnapshot | undefined {
  return snapshot === undefined ? undefined : structuredClone(snapshot);
}

function pixyncPersistenceFor(
  projectId: string,
): PixyncSnapshotPersistencePort & { remove(): Promise<boolean> } {
  if (sharedPixyncPersistence?.projectId === projectId) {
    return sharedPixyncPersistence.port;
  }
  const inner = createPixyncIndexedDbPersistence(projectId);
  let loaded = false;
  let cached: PixyncDurableSnapshot | undefined;
  let loadPromise: Promise<void> | undefined;
  const port: PixyncSnapshotPersistencePort = {
    async load() {
      if (!loaded) {
        loadPromise ??= inner.load().then((snapshot) => {
          cached = clonePixyncSnapshot(snapshot);
          loaded = true;
          loadPromise = undefined;
        }).catch((error) => {
          loadPromise = undefined;
          throw error;
        });
        await loadPromise;
      } else if (await inner.isDeleted()) {
        // A second tab can delete this Project after the active port was
        // cached. Check only the tiny deletion store before returning a
        // cached Snapshot, so a stale Project can never be reopened.
        cached = undefined;
      }
      return clonePixyncSnapshot(cached);
    },
    async atomicReplace(snapshot) {
      await inner.atomicReplace(snapshot);
      cached = clonePixyncSnapshot(snapshot);
      loaded = true;
    },
    async compareAndSwap(snapshot, expectedSnapshotHash) {
      try {
        await inner.compareAndSwap(snapshot, expectedSnapshotHash);
        cached = clonePixyncSnapshot(snapshot);
        loaded = true;
      } catch (error) {
        // A CAS conflict means this tab no longer knows the durable base. The
        // next open must read the authoritative IndexedDB snapshot again.
        cached = undefined;
        loaded = false;
        throw error;
      }
    },
  };
  const removablePort = port as PixyncSnapshotPersistencePort & {
    remove(): Promise<boolean>;
  };
  removablePort.remove = async () => {
    await inner.remove();
    cached = undefined;
    loaded = false;
    loadPromise = undefined;
    return true;
  };
  sharedPixyncPersistence = { projectId, port: removablePort };
  return removablePort;
}

const LOCAL_SESSION_AGGREGATES = ["draw", "audio", "game"] as const;

function createLocalProjectSessionAdapters(): readonly PixyncAggregateAdapter[] {
  return LOCAL_SESSION_AGGREGATES.map((aggregate) => ({
    aggregate,
    // The session proves ordering and presence independently from product
    // state. Product adapters remain the only owners of Draw/Audio/Game data;
    // this local session is not the external PiXiEED Bridge.
    apply: () => undefined,
  }));
}

function creatorStartModeFromValue(value: unknown): CreatorStartMode {
  return value === "AUDIO" ? "AUDIO" : value === "GAME" ? "GAME" : "DRAW";
}

function projectSessionModeFromCreatorMode(value: unknown): ProjectSessionMode {
  const mode = creatorStartModeFromValue(value);
  return mode === "AUDIO" ? "iAUDIO" : mode === "GAME" ? "iGAME" : "iDRAW";
}

function projectSessionSelectionLabel(mode: ProjectSessionMode): string {
  return mode === "iAUDIO"
    ? "Arrangement"
    : mode === "iGAME"
    ? "Scene"
    : "Canvas";
}

let localProjectSession: ProjectSessionClient | undefined;
let localProjectSessionUnsubscribe: (() => void) | undefined;
let localProjectSessionRequestGeneration = 0;

async function stopLocalProjectSession(): Promise<void> {
  localProjectSessionRequestGeneration += 1;
  const previous = localProjectSession;
  localProjectSession = undefined;
  localProjectSessionUnsubscribe?.();
  localProjectSessionUnsubscribe = undefined;
  await previous?.disconnect().catch(() => undefined);
}

function publishLocalProjectSessionStatus(snapshot: ProjectSessionState): void {
  const viewState = snapshot.status === "CONFLICT"
    ? "conflict"
    : snapshot.status === "OFFLINE" || snapshot.status === "ERROR"
    ? "offline"
    : snapshot.status === "RECOVERING" || snapshot.status === "PENDING" ||
        snapshot.status === "LOCAL_OPTIMISTIC"
    ? "connecting"
    : "local";
  const error = snapshot.lastError === undefined
    ? ""
    : ` · ${snapshot.lastError.code}`;
  document.body.dataset.projectSessionStatus = snapshot.status.toLowerCase();
  document.body.dataset.projectSessionMode = snapshot.activeMode;
  document.body.dataset.projectSessionRevision = String(
    snapshot.projectRevision,
  );
  document.body.dataset.projectSessionPending = String(
    snapshot.pendingOperationIds.length,
  );
  document.body.dataset.projectSessionRole = snapshot.role;
  document.body.dataset.projectSessionCheckpoints = String(
    snapshot.checkpoints.length,
  );
  if (projectSessionCheckpointStatusElement !== null) {
    projectSessionCheckpointStatusElement.textContent =
      `r${snapshot.projectRevision} · ${snapshot.checkpoints.length}保存点 · ${snapshot.role}`;
  }
  window.dispatchEvent(
    new CustomEvent("draw2:pixync-status", {
      detail: {
        state: viewState,
        roomId: `local:${snapshot.projectId}`,
        revision: `r${snapshot.projectRevision}`,
        members: String(Math.max(1, snapshot.presence.length)),
        latencyMs: 0,
        message:
          `Project Session ${snapshot.status} · ${snapshot.activeMode} · ` +
          `ローカル3モードセッション（オンラインPiXYNC未接続）${error}`,
      },
    }),
  );
}

async function startLocalProjectSession(
  projectId: string,
  creatorMode: CreatorStartMode,
): Promise<void> {
  const requestGeneration = ++localProjectSessionRequestGeneration;
  localProjectSessionUnsubscribe?.();
  localProjectSessionUnsubscribe = undefined;
  const previous = localProjectSession;
  localProjectSession = undefined;
  await previous?.disconnect().catch(() => undefined);
  if (requestGeneration !== localProjectSessionRequestGeneration) return;

  const sessionModule = await loadProjectSessionModule();
  if (requestGeneration !== localProjectSessionRequestGeneration) return;
  const adapters = createLocalProjectSessionAdapters();
  const broker = new sessionModule.LocalProjectSessionBroker({
    projectId,
    adapters,
  });
  const session = new sessionModule.ProjectSessionClient({
    broker,
    projectId,
    actorId: pixyncTabIdentity(
      "pixiedraw2:project-session-actor:v1",
      "local-actor",
    ),
    clientId: pixyncTabIdentity(
      "pixiedraw2:project-session-client:v1",
      "local-client",
    ),
    displayName: "This tab",
    activeMode: projectSessionModeFromCreatorMode(creatorMode),
    adapters,
  });
  if (requestGeneration !== localProjectSessionRequestGeneration) {
    await session.disconnect();
    return;
  }
  localProjectSession = session;
  localProjectSessionUnsubscribe = session.onState(
    publishLocalProjectSessionStatus,
  );
  (window as Window & {
    __pixiedraw2ProjectSession?: ProjectSessionClient;
  }).__pixiedraw2ProjectSession = session;
  try {
    await session.connect();
    await session.publishPresence(
      projectSessionSelectionLabel(session.state().activeMode),
    );
  } catch {
    publishLocalProjectSessionStatus(session.state());
  }
}

const pixyncProductionPresence = new Map<string, PixyncTransportPresence>();
let pixyncProductionTransportStatus: PixyncTransportStatus = "CLOSED";

function applyPixyncProductionPresence(
  event: PixyncTransportPresenceEvent,
  projectId: string,
): void {
  if (event.kind === "sync") {
    pixyncProductionPresence.clear();
    for (const presence of event.presence) {
      pixyncProductionPresence.set(presence.clientId, presence);
    }
  } else if (event.kind === "upsert") {
    pixyncProductionPresence.set(event.presence.clientId, event.presence);
  } else {
    pixyncProductionPresence.delete(event.clientId);
  }
  publishPixyncProductionStatus(pixyncProductionTransportStatus, projectId);
}

function publishPixyncProductionStatus(
  status: PixyncTransportStatus,
  projectId = state.projectId,
  message?: string,
): void {
  pixyncProductionTransportStatus = status;
  const syncState = status === "SUBSCRIBED"
    ? "synced"
    : status === "OFFLINE" || status === "CLOSED"
    ? "offline"
    : "connecting";
  document.body.dataset.pixyncState = status.toLowerCase();
  window.dispatchEvent(
    new CustomEvent("draw2:pixync-status", {
      detail: {
        state: syncState,
        roomId: projectId,
        revision: "—",
        members: pixyncProductionPresence.size === 0
          ? "—"
          : String(pixyncProductionPresence.size),
        message: message ??
          (status === "SUBSCRIBED"
            ? "PiXYNC RealtimeでProjectを同期しています。"
            : status === "OFFLINE" || status === "CLOSED"
            ? "同期が切断されました。ローカル変更を保持して再接続を待機します。"
            : "PiXYNC Realtimeへ接続しています。"),
      },
    }),
  );
}

async function publishProductionCheckpoint(): Promise<void> {
  const checkpointButton = projectSessionCheckpointButton;
  const checkpointStatus = projectSessionCheckpointStatusElement;
  if (checkpointButton === null || checkpointStatus === null) return;
  const projectId = state.projectId;
  const client = await availablePixyncSupabaseClient();
  if (client === undefined) {
    checkpointStatus.textContent =
      "ログインを確認できないため、共有Checkpointを保存できません。";
    return;
  }
  checkpointButton.disabled = true;
  checkpointStatus.textContent = "Draw・Audio・Gameを含むCheckpointを検証中…";
  try {
    await flushDrawPersistence();
    const exportState = state;
    const exportModule = await loadExportModule();
    const artifact = await createPxdProjectArtifact(
      exportModule,
      safeExportBaseName(),
    );
    if (state !== exportState || state.projectId !== projectId) {
      throw new Error(
        "保存中にProjectが変更されました。もう一度Checkpointを保存してください。",
      );
    }
    const key = "pixiedraw2:pixync-attestation-client-id:v1";
    const storedClientId = sessionStorage.getItem(key);
    const attestationClientId = storedClientId ?? crypto.randomUUID();
    if (storedClientId === null) {
      sessionStorage.setItem(key, attestationClientId);
    }
    const result = await publishPixyncCheckpoint(client, {
      projectId,
      checkpointBytes: artifact.bytes,
      attestationClientId,
    });
    if (state.projectId !== projectId) {
      throw new Error(
        "保存後にProjectが変更されました。現在のProjectを確認してください。",
      );
    }
    document.body.dataset.pixyncCheckpointRevision = String(result.revision);
    document.body.dataset.pixyncCheckpointStatus = result.status;
    checkpointStatus.textContent = result.active
      ? `Checkpoint r${result.revision} を共有保存しました · verified · ${
        result.packageHash.slice(0, 12)
      }…`
      : `Checkpoint r${result.revision} は候補として保存しました · ${result.attestedUserCount}/${result.requiredUserCount}人の検証待ち`;
  } catch (error) {
    checkpointStatus.textContent = error instanceof Error
      ? `共有Checkpointを保存できませんでした: ${error.message}`
      : "共有Checkpointを保存できませんでした。";
  } finally {
    checkpointButton.disabled = false;
  }
}

window.addEventListener("draw2:creator-mode", (event) => {
  const mode = (event as CustomEvent<{ readonly mode?: unknown }>).detail?.mode;
  syncDisplayToggles();
  const session = localProjectSession;
  const sessionMode = projectSessionModeFromCreatorMode(mode);
  if (session !== undefined) {
    session.setActiveMode(sessionMode);
    void session.publishPresence(projectSessionSelectionLabel(sessionMode))
      .catch(
        () => publishLocalProjectSessionStatus(session.state()),
      );
  }
  const production = pixyncProductionRoot;
  if (production !== undefined) {
    void production.publishPresence({
      displayName: "This tab",
      mode: sessionMode,
      selectionLabel: projectSessionSelectionLabel(sessionMode),
    }).catch(() => undefined);
  }
});

projectSessionCheckpointButton.addEventListener("click", async () => {
  if (document.body.dataset.pixyncComposition === "production") {
    await publishProductionCheckpoint();
    return;
  }
  const session = localProjectSession;
  if (session === undefined) {
    projectSessionCheckpointStatusElement.textContent =
      "Project Sessionがまだ接続されていません。";
    return;
  }
  projectSessionCheckpointButton.disabled = true;
  projectSessionCheckpointStatusElement.textContent = "Checkpointを保存中…";
  try {
    const checkpoint = await session.createCheckpoint({
      checkpointId: `checkpoint:local:${crypto.randomUUID()}`,
      label: `Project revision r${session.state().projectRevision}`,
      kind: "MANUAL",
    });
    projectSessionCheckpointStatusElement.textContent =
      `Checkpoint r${checkpoint.projectRevision} を保存しました · Local Session`;
  } catch (error) {
    projectSessionCheckpointStatusElement.textContent = error instanceof Error
      ? `Checkpointを保存できませんでした: ${error.message}`
      : "Checkpointを保存できませんでした。";
  } finally {
    projectSessionCheckpointButton.disabled = false;
  }
});

window.addEventListener(WORKSPACE_PROJECT_CHANGED_EVENT, (event) => {
  const session = localProjectSession;
  const projectId = (event as CustomEvent<{ readonly projectId?: unknown }>)
    .detail?.projectId;
  if (
    session === undefined || typeof projectId !== "string" ||
    projectId === session.state().projectId
  ) return;
  void startLocalProjectSession(
    projectId,
    creatorStartModeFromValue(
      document.querySelector<HTMLElement>("#draw2WorkspaceFrame")?.dataset
        .creatorMode,
    ),
  ).catch(() => undefined);
});

function projectPixyncState(
  phase: string,
  projectId: string | null,
  generation: number,
): void {
  document.body.dataset.pixyncState = phase.toLowerCase();
  document.body.dataset.pixyncProjectId = projectId ?? "";
  document.body.dataset.pixyncGeneration = String(generation);
}

async function startPixyncProjectLifecycle(): Promise<void> {
  if (pixyncProjectLifecycle !== undefined) return;
  const lifecycle = new PixyncProjectLifecycleCoordinator<
    Draw2PixyncJournalBinding
  >({
    eventTarget: window,
    eventName: WORKSPACE_PROJECT_CHANGED_EVENT,
    initialProjectId: state.projectId,
    createPersistence: (projectId) =>
      pixyncPersistenceFor(projectId),
    openJournal: async (projectId, persistence) => ({
      projectId,
      journal: await PixyncDurableJournal.open(projectId, persistence),
    }),
    // Journal mutations await their own durable atomicReplace. No transport
    // worker exists yet, so there is no additional queue to flush or stop.
    flushProject: async () => undefined,
    stopProject: async () => undefined,
    onState: ({ phase, projectId, generation }) =>
      projectPixyncState(phase, projectId, generation),
  });
  pixyncProjectLifecycle = lifecycle;
  try {
    await lifecycle.start();
  } catch {
    projectPixyncState("UNAVAILABLE", state.projectId, 0);
    pixyncProjectLifecycle = undefined;
    await lifecycle.dispose().catch(() => undefined);
  }
}

window.addEventListener("pagehide", (event) => {
  // A bfcache page remains live and must keep the same listener. A real page
  // exit disposes both the local lifecycle and the production Realtime root.
  if (event.persisted) return;
  const lifecycle = pixyncProjectLifecycle;
  pixyncProjectLifecycle = undefined;
  void lifecycle?.dispose();
  void localProjectSession?.disconnect();
  localProjectSessionRequestGeneration += 1;
  localProjectSession = undefined;
  localProjectSessionUnsubscribe?.();
  localProjectSessionUnsubscribe = undefined;
  void pixyncProductionRoot?.close("pagehide");
  pixyncProductionRoot = undefined;
});

// Keep the local lifecycle wiring boundary explicit. Product UI and the
// authenticated production composition below must not be mistaken for local
// lifecycle ownership by static contract checks.
const PIXYNC_LOCAL_LIFECYCLE_WIRING_END = true;

const PIXYNC_ROOM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
let pixyncProductionRoot: PixyncProductionCompositionRoot | undefined;
let pixyncProductionTransition: Promise<void> = Promise.resolve();

type PixyncWindow = Window & {
  __PIXIEED_ACCOUNT_SUPABASE_CLIENT__?: PixyncSupabaseSdkClient;
  __PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__?: Promise<
    PixyncSupabaseSdkClient
  >;
  __pixiedraw2StartPixyncProduction?: (
    client?: PixyncSupabaseSdkClient,
  ) => Promise<boolean>;
};

function pixyncTabIdentity(key: string, prefix: string): string {
  const existing = sessionStorage.getItem(key);
  if (existing !== null && existing.length > 0) return existing;
  const value = `${prefix}:${crypto.randomUUID()}`;
  sessionStorage.setItem(key, value);
  return value;
}

async function availablePixyncSupabaseClient(
  supplied?: PixyncSupabaseSdkClient,
): Promise<PixyncSupabaseSdkClient | undefined> {
  if (supplied !== undefined) return supplied;
  const host = window as PixyncWindow;
  if (host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ !== undefined) {
    return host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
  }
  return host.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__?.catch(() =>
    undefined
  );
}

type CollaborationScopeUiRow = {
  readonly roomId: string;
  readonly userId: string;
  readonly memberRole: string;
  readonly displayName: string;
  readonly scopeKey: CollaborationScopeKey;
  readonly assignmentState: string | null;
  readonly canManage: boolean;
  readonly isCurrentUser: boolean;
  readonly currentUserConsented: boolean;
  readonly editScopePolicy: CollaborationEditScopePolicy;
};

let collaborationScopeRows: readonly CollaborationScopeUiRow[] = [];
let collaborationScopeConsentAccepted = false;
let collaborationScopeConsentDraft = false;
let collaborationScopeBusy = false;
let collaborationEditScopePolicy: CollaborationEditScopePolicy = "OPEN";

function collaborationScopeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collaborationScopeRowsFromRpc(value: unknown): CollaborationScopeUiRow[] {
  const values = Array.isArray(value) ? value : value === null ? [] : [value];
  const rows: CollaborationScopeUiRow[] = [];
  for (const value of values) {
    const row = collaborationScopeRecord(value);
    if (row === null) continue;
    const roomId = typeof row.room_id === "string" ? row.room_id : "";
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    const scopeKey = isCollaborationScopeKey(row.scope_key)
      ? row.scope_key
      : undefined;
    if (roomId.length === 0 || userId.length === 0 || scopeKey === undefined) {
      continue;
    }
    rows.push({
      roomId,
      userId,
      memberRole: typeof row.member_role === "string" ? row.member_role : "viewer",
      displayName: typeof row.display_name === "string" && row.display_name.trim() !== ""
        ? row.display_name.trim()
        : "参加者",
      scopeKey,
      assignmentState: typeof row.assignment_state === "string"
        ? row.assignment_state
        : null,
      canManage: row.can_manage === true,
      isCurrentUser: row.is_current_user === true,
      currentUserConsented: row.current_user_consented === true,
      editScopePolicy: isCollaborationEditScopePolicy(row.edit_scope_policy)
        ? row.edit_scope_policy
        : "OPEN",
    });
  }
  return rows;
}

function collaborationCurrentScopeKey(): CollaborationScopeKey {
  const mode = creatorStartModeFromValue(workspaceFrameElement?.dataset.creatorMode);
  return mode === "AUDIO" ? "AUDIO" : mode === "GAME" ? "GAME" : "DRAW";
}

function collaborationCurrentScopeRow(): CollaborationScopeUiRow | undefined {
  const scopeKey = collaborationCurrentScopeKey();
  return collaborationScopeRows.find((row) =>
    row.isCurrentUser && row.scopeKey === scopeKey
  );
}

function collaborationEditBlockReason(): string | undefined {
  if (collaborationScopeRows.length === 0) return undefined;
  const row = collaborationCurrentScopeRow();
  if (!collaborationScopeConsentAccepted) {
    return "共同作業の注意事項を確認すると編集できます。";
  }
  if (row === undefined) {
    return "このProjectの編集参加権限を確認できません。";
  }
  if (row.memberRole === "owner") return undefined;
  if (row.memberRole !== "editor") {
    return "閲覧参加者として接続中のため編集できません。マスターに編集参加者への変更を依頼してください。";
  }
  if (collaborationEditScopePolicy === "OPEN") return undefined;
  if (row.assignmentState === "APPROVED") return undefined;
  return `${scopeLabel(row.scopeKey)}は担当範囲のみ編集の対象です。承認済みの担当範囲ではありません。`;
}

function announceCollaborationEditBlock(): void {
  const reason = collaborationEditBlockReason();
  if (reason === undefined) return;
  if (collaborationEditGuardMessageElement !== null) {
    collaborationEditGuardMessageElement.textContent = reason;
  }
  setStatus(`${reason} 「同意・担当範囲」を確認してください。`, "error");
}

function collaborationCanvasToolIsNonMutating(tool: BasicTool): boolean {
  return [
    "pan",
    "eyedropper",
    "select-rect",
    "select-ellipse",
    "select-lasso",
    "select-color",
  ].includes(tool);
}

async function collaborationScopeRpc(
  functionName: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const client = await availablePixyncSupabaseClient();
  if (client === undefined) throw new Error("ログインが必要です。");
  let result;
  try {
    result = await client.rpc(functionName, args);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `${functionName}に接続できませんでした。`,
    );
  }
  if (result.error !== null) {
    const error = result.error;
    throw new Error(
      error instanceof Error ? error.message : `${functionName}が拒否されました。`,
    );
  }
  return result.data;
}

function collaborationScopeStateLabel(state: string | null): string {
  return state === "APPROVED"
    ? "承認済み"
    : state === "PENDING_MEMBER"
    ? "本人の確認待ち"
    : state === "PENDING_MASTER"
    ? "マスター確認待ち"
    : state === "REMOVAL_REQUESTED"
    ? "解除の確認待ち"
    : state === "REJECTED"
    ? "未承認"
    : "未設定";
}

function collaborationScopeActionButton(
  label: string,
  action: string,
  scopeKey: CollaborationScopeKey,
  userId?: string,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "draw2-collaboration-scope-button";
  button.textContent = label;
  button.disabled = disabled;
  button.dataset.collaborationAction = action;
  button.dataset.scopeKey = scopeKey;
  if (userId !== undefined) button.dataset.userId = userId;
  button.setAttribute("aria-label", `${scopeLabel(scopeKey)}: ${label}`);
  return button;
}

function renderCollaborationScopeMasterList(): void {
  if (collaborationScopeMasterListElement === null) return;
  const members = new Map<string, {
    readonly userId: string;
    readonly displayName: string;
    readonly memberRole: string;
    readonly rows: Map<CollaborationScopeKey, CollaborationScopeUiRow>;
  }>();
  for (const row of collaborationScopeRows) {
    if (row.memberRole === "owner") continue;
    const member = members.get(row.userId) ?? {
      userId: row.userId,
      displayName: row.displayName,
      memberRole: row.memberRole,
      rows: new Map<CollaborationScopeKey, CollaborationScopeUiRow>(),
    };
    member.rows.set(row.scopeKey, row);
    members.set(row.userId, member);
  }
  if (members.size === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-collaboration-empty";
    empty.textContent = "参加者がいません。招待後に担当範囲を設定できます。";
    collaborationScopeMasterListElement.replaceChildren(empty);
    return;
  }
  const cards: HTMLElement[] = [];
  for (const member of members.values()) {
    const card = document.createElement("article");
    card.className = "draw2-collaboration-member-card";
    const heading = document.createElement("div");
    heading.className = "draw2-collaboration-member-heading";
    const name = document.createElement("strong");
    name.textContent = member.displayName;
    const role = document.createElement("small");
    role.textContent = member.memberRole === "editor" ? "編集参加者" : "閲覧参加者";
    heading.append(name, role);
    const buttons = document.createElement("div");
    buttons.className = "draw2-collaboration-scope-buttons";
    for (const scopeKey of COLLABORATION_SCOPE_KEYS) {
      const row = member.rows.get(scopeKey);
      const state = row?.assignmentState ?? null;
      let button: HTMLButtonElement;
      if (state === "APPROVED") {
        button = collaborationScopeActionButton("解除", "MASTER_REMOVE", scopeKey, member.userId);
      } else if (state === "PENDING_MASTER") {
        button = collaborationScopeActionButton("承認", "MASTER_APPROVE", scopeKey, member.userId);
        const reject = collaborationScopeActionButton("却下", "MASTER_REJECT", scopeKey, member.userId);
        reject.dataset.scopeState = state;
        buttons.append(reject);
      } else if (state === "PENDING_MEMBER") {
        button = collaborationScopeActionButton("本人確認待ち", "NONE", scopeKey, member.userId, true);
      } else if (state === "REMOVAL_REQUESTED") {
        button = collaborationScopeActionButton("解除確認中", "NONE", scopeKey, member.userId, true);
      } else {
        button = collaborationScopeActionButton("割り当て", "MASTER_ASSIGN", scopeKey, member.userId);
      }
      button.dataset.state = state ?? "UNSET";
      button.title = `${scopeLabel(scopeKey)} · ${collaborationScopeStateLabel(state)}`;
      buttons.append(button);
    }
    card.append(heading, buttons);
    cards.push(card);
  }
  collaborationScopeMasterListElement.replaceChildren(...cards);
}

function renderCollaborationScopeParticipantList(): void {
  if (collaborationScopeParticipantListElement === null) return;
  const rows = collaborationScopeRows.filter((row) => row.isCurrentUser);
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-collaboration-empty";
    empty.textContent = "参加者として接続すると、ここから担当範囲を申請できます。";
    collaborationScopeParticipantListElement.replaceChildren(empty);
    return;
  }
  const children: HTMLElement[] = [];
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "draw2-collaboration-scope-row";
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = scopeLabel(row.scopeKey);
    const state = document.createElement("small");
    state.textContent = collaborationScopeStateLabel(row.assignmentState);
    heading.append(label, state);
    item.append(heading);
    if (row.assignmentState === "PENDING_MEMBER") {
      item.append(
        collaborationScopeActionButton("この範囲を承認", "MEMBER_ACCEPT", row.scopeKey),
        collaborationScopeActionButton("辞退", "MEMBER_DECLINE", row.scopeKey),
      );
    } else if (row.assignmentState === "REMOVAL_REQUESTED") {
      item.append(
        collaborationScopeActionButton("解除に同意", "MEMBER_ACCEPT_REMOVAL", row.scopeKey),
        collaborationScopeActionButton("この範囲を残す", "MEMBER_REJECT_REMOVAL", row.scopeKey),
      );
    } else if (row.assignmentState === "PENDING_MASTER") {
      const pending = document.createElement("small");
      pending.textContent = "マスターの承認を待っています。";
      item.append(pending);
    } else if (row.assignmentState === "APPROVED") {
      const request = collaborationScopeActionButton("追加申請済み", "NONE", row.scopeKey, undefined, true);
      item.append(request);
    } else {
      item.append(collaborationScopeActionButton("この範囲を申請", "MEMBER_REQUEST", row.scopeKey));
    }
    children.push(item);
  }
  collaborationScopeParticipantListElement.replaceChildren(...children);
}

function renderCollaborationScopeUi(): void {
  const online = collaborationScopeRows.length > 0;
  const canManage = collaborationScopeRows.some((row) => row.canManage);
  const isParticipant = collaborationScopeRows.some(
    (row) => row.isCurrentUser && row.memberRole !== "owner",
  );
  collaborationScopeConsentAccepted = collaborationScopeRows.some(
    (row) => row.isCurrentUser && row.currentUserConsented,
  );
  collaborationEditScopePolicy = collaborationScopeRows.find((row) =>
    row.isCurrentUser
  )?.editScopePolicy ?? collaborationScopeRows[0]?.editScopePolicy ?? "OPEN";
  const editBlockReason = collaborationEditBlockReason();
  document.body.dataset.pixyncEditScopePolicy = collaborationEditScopePolicy;
  document.body.dataset.pixyncEditLocked = editBlockReason === undefined
    ? "false"
    : "true";
  if (collaborationScopeStatusElement !== null) {
    collaborationScopeStatusElement.textContent = !online
      ? "ローカル編集"
      : collaborationScopeConsentAccepted
      ? editScopePolicyLabel(collaborationEditScopePolicy)
      : "参加前の確認が必要";
  }
  if (collaborationScopeMessageElement !== null) {
    collaborationScopeMessageElement.textContent = !online
      ? "このProjectはローカル編集です。オンライン共同作業に参加するときに注意事項を確認します。"
      : collaborationScopeConsentAccepted
      ? `注意事項を確認済みです。編集ルールは「${editScopePolicyLabel(collaborationEditScopePolicy)}」です。`
      : "共同作業に参加する前に、気軽な共同作業と公開・販売の注意事項を確認してください。";
  }
  if (collaborationEditGuardElement !== null) {
    collaborationEditGuardElement.hidden = editBlockReason === undefined;
  }
  if (collaborationEditGuardMessageElement !== null) {
    collaborationEditGuardMessageElement.textContent = editBlockReason ?? "";
  }
  if (collaborationEditGuardOpenButton !== null) {
    collaborationEditGuardOpenButton.hidden = editBlockReason === undefined;
    collaborationEditGuardOpenButton.textContent = !collaborationScopeConsentAccepted
      ? "確認を開く"
      : "確認・申請";
  }
  if (collaborationScopeConsentCheckElement !== null) {
    collaborationScopeConsentCheckElement.checked = collaborationScopeConsentAccepted ||
      collaborationScopeConsentDraft;
    collaborationScopeConsentCheckElement.disabled = !online || collaborationScopeConsentAccepted;
  }
  if (collaborationScopeConsentAcceptButton !== null) {
    collaborationScopeConsentAcceptButton.disabled = !online || collaborationScopeConsentAccepted ||
      !collaborationScopeConsentDraft;
    collaborationScopeConsentAcceptButton.textContent = collaborationScopeConsentAccepted
      ? "確認済み"
      : "確認して参加する";
  }
  if (collaborationScopeMasterPanelElement !== null) {
    collaborationScopeMasterPanelElement.hidden = !online || !collaborationScopeConsentAccepted || !canManage;
  }
  if (collaborationScopeParticipantPanelElement !== null) {
    collaborationScopeParticipantPanelElement.hidden = !online || !collaborationScopeConsentAccepted || !isParticipant;
  }
  if (collaborationEditPolicyPanelElement !== null) {
    collaborationEditPolicyPanelElement.hidden = !online || !collaborationScopeConsentAccepted;
  }
  if (collaborationEditPolicyOpenElement !== null) {
    collaborationEditPolicyOpenElement.checked = collaborationEditScopePolicy === "OPEN";
    collaborationEditPolicyOpenElement.disabled = !canManage || collaborationScopeBusy;
  }
  if (collaborationEditPolicyAssignedOnlyElement !== null) {
    collaborationEditPolicyAssignedOnlyElement.checked = collaborationEditScopePolicy === "ASSIGNED_ONLY";
    collaborationEditPolicyAssignedOnlyElement.disabled = !canManage || collaborationScopeBusy;
  }
  if (collaborationEditPolicyMessageElement !== null) {
    collaborationEditPolicyMessageElement.textContent = canManage
      ? `現在は「${editScopePolicyLabel(collaborationEditScopePolicy)}」。初期設定のままなら、編集参加者は担当範囲を待たずに作業できます。`
      : `マスターが決めた編集ルールは「${editScopePolicyLabel(collaborationEditScopePolicy)}」です。`;
  }
  renderCollaborationScopeMasterList();
  renderCollaborationScopeParticipantList();
}

async function refreshCollaborationScopeUi(): Promise<void> {
  collaborationScopeRows = [];
  collaborationScopeConsentAccepted = false;
  collaborationScopeConsentDraft = false;
  collaborationEditScopePolicy = "OPEN";
  renderCollaborationScopeUi();
  if (!PIXYNC_ROOM_ID.test(state.projectId)) return;
  try {
    const data = await collaborationScopeRpc(
      "pixisync_list_scope_assignments_v1",
      { p_room_id: state.projectId },
    );
    collaborationScopeRows = collaborationScopeRowsFromRpc(data);
    renderCollaborationScopeUi();
  } catch (error) {
    if (collaborationScopeMessageElement !== null) {
      collaborationScopeMessageElement.textContent = error instanceof Error
        ? `担当範囲を読み込めませんでした。${error.message}`
        : "担当範囲を読み込めませんでした。";
    }
  }
}

async function setCollaborationEditScopePolicy(
  policy: CollaborationEditScopePolicy,
): Promise<void> {
  if (!COLLABORATION_EDIT_SCOPE_POLICIES.includes(policy)) return;
  if (!collaborationScopeRows.some((row) => row.canManage)) return;
  if (collaborationScopeBusy || policy === collaborationEditScopePolicy) return;
  collaborationScopeBusy = true;
  renderCollaborationScopeUi();
  if (collaborationScopeSaveStatusElement !== null) {
    collaborationScopeSaveStatusElement.textContent = "保存中…";
  }
  try {
    await collaborationScopeRpc("pixisync_set_edit_scope_policy_v1", {
      p_room_id: state.projectId,
      p_policy: policy,
    });
    await refreshCollaborationScopeUi();
    if (collaborationScopeSaveStatusElement !== null) {
      collaborationScopeSaveStatusElement.textContent =
        `編集ルールを「${editScopePolicyLabel(policy)}」に変更しました。`;
    }
  } catch (error) {
    renderCollaborationScopeUi();
    if (collaborationScopeSaveStatusElement !== null) {
      collaborationScopeSaveStatusElement.textContent = error instanceof Error
        ? error.message
        : "編集ルールを変更できませんでした。";
    }
  } finally {
    collaborationScopeBusy = false;
    renderCollaborationScopeUi();
  }
}

async function promptCollaborationConsentIfNeeded(): Promise<void> {
  if (collaborationScopeDialogElement === null) return;
  await refreshCollaborationScopeUi();
  if (
    collaborationScopeRows.length > 0 &&
    !collaborationScopeConsentAccepted &&
    !collaborationScopeDialogElement.open
  ) {
    collaborationScopeDialogElement.showModal();
  }
}

async function acceptCollaborationScopeConsent(): Promise<void> {
  if (collaborationScopeConsentAccepted || collaborationScopeRows.length === 0) return;
  if (collaborationScopeConsentCheckElement?.checked !== true) return;
  collaborationScopeBusy = true;
  if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = "保存中…";
  try {
    await collaborationScopeRpc("pixisync_accept_collaboration_consent_v1", {
      p_room_id: state.projectId,
      p_consent_version: "COLLABORATION_NOTICE_V1",
    });
    await refreshCollaborationScopeUi();
    if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = "確認を保存しました。";
  } catch (error) {
    renderCollaborationScopeUi();
    if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = error instanceof Error ? error.message : "保存できませんでした。";
  } finally {
    collaborationScopeBusy = false;
  }
}

async function handleCollaborationScopeAction(button: HTMLButtonElement): Promise<void> {
  const action = button.dataset.collaborationAction;
  const scopeKey = button.dataset.scopeKey;
  const userId = button.dataset.userId;
  if (action === undefined || action === "NONE" || !isCollaborationScopeKey(scopeKey)) return;
  if (action.startsWith("MASTER_") && (userId === undefined || userId.length === 0)) return;
  if (collaborationScopeBusy) return;
  collaborationScopeBusy = true;
  if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = "保存中…";
  try {
    if (action === "MASTER_ASSIGN" || action === "MASTER_REMOVE") {
      await collaborationScopeRpc("pixisync_set_scope_assignment_v1", {
        p_room_id: state.projectId,
        p_user_id: userId,
        p_scope_key: scopeKey,
        p_enabled: action === "MASTER_ASSIGN",
      });
    } else if (action === "MASTER_APPROVE" || action === "MASTER_REJECT") {
      await collaborationScopeRpc("pixisync_review_scope_request_v1", {
        p_room_id: state.projectId,
        p_user_id: userId,
        p_scope_key: scopeKey,
        p_action: action === "MASTER_APPROVE" ? "APPROVE" : "REJECT",
      });
    } else if (action === "MEMBER_REQUEST") {
      await collaborationScopeRpc("pixisync_request_scope_v1", {
        p_room_id: state.projectId,
        p_scope_key: scopeKey,
      });
    } else {
      const responseAction = action === "MEMBER_ACCEPT"
        ? "ACCEPT_ASSIGNMENT"
        : action === "MEMBER_DECLINE"
        ? "DECLINE_ASSIGNMENT"
        : action === "MEMBER_ACCEPT_REMOVAL"
        ? "ACCEPT_REMOVAL"
        : "REJECT_REMOVAL";
      await collaborationScopeRpc("pixisync_respond_scope_v1", {
        p_room_id: state.projectId,
        p_scope_key: scopeKey,
        p_action: responseAction,
      });
    }
    await refreshCollaborationScopeUi();
    if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = "保存しました。";
  } catch (error) {
    if (collaborationScopeSaveStatusElement !== null) collaborationScopeSaveStatusElement.textContent = error instanceof Error ? error.message : "保存できませんでした。";
  } finally {
    collaborationScopeBusy = false;
  }
}

function openCollaborationScopeDialog(): void {
  if (collaborationScopeDialogElement === null) return;
  void refreshCollaborationScopeUi();
  if (!collaborationScopeDialogElement.open) collaborationScopeDialogElement.showModal();
}

collaborationScopeOpenButton?.addEventListener("click", openCollaborationScopeDialog);
collaborationEditGuardOpenButton?.addEventListener("click", openCollaborationScopeDialog);
collaborationScopeConsentCheckElement?.addEventListener("change", () => {
  collaborationScopeConsentDraft = collaborationScopeConsentCheckElement.checked;
  renderCollaborationScopeUi();
});
collaborationScopeConsentAcceptButton?.addEventListener("click", () => {
  if (!collaborationScopeBusy) void acceptCollaborationScopeConsent();
});
collaborationScopeMasterListElement?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-collaboration-action]",
  );
  if (target !== null) void handleCollaborationScopeAction(target);
});
collaborationScopeParticipantListElement?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-collaboration-action]",
  );
  if (target !== null) void handleCollaborationScopeAction(target);
});
for (const input of [
  collaborationEditPolicyOpenElement,
  collaborationEditPolicyAssignedOnlyElement,
]) {
  input?.addEventListener("change", () => {
    if (!input.checked || !isCollaborationEditScopePolicy(input.value)) return;
    void setCollaborationEditScopePolicy(input.value);
  });
}

function requireWorkspacePixyncBridge(): Required<
  Pick<
    WorkspacePxdBridge,
    | "preparePixyncAudioState"
    | "pixyncAudioCurrent"
    | "applyPixyncAudioRemote"
    | "preparePixyncGameState"
    | "pixyncGameCurrent"
    | "resolvePixyncGameRevision"
    | "applyPixyncGameRemote"
  >
> {
  const bridge = getWorkspacePxdBridge();
  for (
    const method of [
      "preparePixyncAudioState",
      "pixyncAudioCurrent",
      "applyPixyncAudioRemote",
      "preparePixyncGameState",
      "pixyncGameCurrent",
      "resolvePixyncGameRevision",
      "applyPixyncGameRemote",
    ] as const
  ) {
    if (typeof bridge[method] !== "function") {
      throw new Error(`PiXYNC Workspace adapter is missing ${method}.`);
    }
  }
  return bridge as Required<
    Pick<
      WorkspacePxdBridge,
      | "preparePixyncAudioState"
      | "pixyncAudioCurrent"
      | "applyPixyncAudioRemote"
      | "preparePixyncGameState"
      | "pixyncGameCurrent"
      | "resolvePixyncGameRevision"
      | "applyPixyncGameRemote"
    >
  >;
}

async function startPixyncProductionRoot(
  suppliedClient?: PixyncSupabaseSdkClient,
): Promise<boolean> {
  const projectId = state.projectId;
  if (!PIXYNC_ROOM_ID.test(projectId)) {
    await pixyncProductionRoot?.close("local-project");
    pixyncProductionRoot = undefined;
    pixyncProductionPresence.clear();
    document.body.dataset.pixyncComposition = "local";
    await startPixyncProjectLifecycle();
    return false;
  }
  const client = await availablePixyncSupabaseClient(suppliedClient);
  if (client === undefined) {
    await pixyncProductionRoot?.close("authentication-unavailable");
    pixyncProductionRoot = undefined;
    pixyncProductionPresence.clear();
    document.body.dataset.pixyncComposition = "awaiting-auth";
    return false;
  }
  const workspace = requireWorkspacePixyncBridge();
  try {
    await hydratePixyncCheckpointIfNeeded(client, projectId);
  } catch (error) {
    if (error instanceof PixyncRemoteCheckpointError) {
      document.body.dataset.pixyncComposition =
        error.code === "AUTHENTICATION_REQUIRED" ||
          error.code === "AUTHENTICATION_FAILED"
          ? "awaiting-auth"
          : "awaiting-checkpoint";
      publishPixyncProductionStatus(
        "OFFLINE",
        projectId,
        error.code === "AUTHENTICATION_REQUIRED"
          ? "共有Projectを復元するにはログインが必要です。ローカル編集を継続します。"
          : "共有Projectの初期Checkpointを検証できないため、ローカル編集を継続します。",
      );
    }
    throw error;
  }
  await Promise.all([
    workspace.preparePixyncAudioState(),
    workspace.preparePixyncGameState(),
  ]);
  await pixyncProductionRoot?.close("project-transition");
  pixyncProductionRoot = undefined;
  pixyncProductionPresence.clear();
  // Keep the local lifecycle alive until the authenticated root has fully
  // connected. If authentication, membership, or Realtime fails, local
  // editing remains available without losing the current session boundary.
  const localLifecycle = pixyncProjectLifecycle;
  const clientId = pixyncTabIdentity(
    "pixiedraw2:pixync-client-id",
    "draw2-client",
  );
  const sessionGeneration = Date.now();
  const workerId = pixyncTabIdentity(
    "pixiedraw2:pixync-worker-id",
    "draw2-worker",
  );
  const currentCreatorMode = projectSessionModeFromCreatorMode(
    creatorStartModeFromValue(
      document.querySelector<HTMLElement>("#draw2WorkspaceFrame")?.dataset
        .creatorMode,
    ),
  );
  let root: PixyncProductionCompositionRoot | undefined;
  const gameRevisions = new PixyncGameRevisionRemoteStore(
    client,
    () => root?.binding,
  );
  root = await PixyncProductionCompositionRoot.create({
    projectId,
    clientId,
    sessionGeneration,
    workerId,
    supabase: client,
    persistence: pixyncPersistenceFor(projectId),
    eventTarget: window,
    presence: {
      displayName: "This tab",
      mode: currentCreatorMode,
      selectionLabel: projectSessionSelectionLabel(currentCreatorMode),
    },
    onPresence: (event) => applyPixyncProductionPresence(event, projectId),
    audioHydration: {
      hydrateAudio: async (request) => {
        await workspace.preparePixyncAudioState();
        return {
          projectId: request.projectId,
          audioRevision: request.minimumAudioRevision,
          level: request.level,
        };
      },
    },
    gameHydration: {
      hydrateGame: async (request) => {
        await workspace.preparePixyncGameState();
        return {
          projectId: request.projectId,
          gameRevision: request.minimumGameRevision,
          level: request.level,
        };
      },
    },
    createProducts: ({ transport, onInvalidation }) => {
      const draw = new PixyncDrawProductBridge({
        transport,
        state: pixyncDrawStatePort,
      });
      const audio = new PixyncAudioProductBridge({
        transport,
        state: {
          preservesLocalHistory: true,
          current: workspace.pixyncAudioCurrent,
          applyRemote: workspace.applyPixyncAudioRemote,
        },
        onInvalidation,
      });
      const game = new PixyncGameProductBridge({
        transport,
        state: {
          preservesLocalHistory: true,
          current: workspace.pixyncGameCurrent,
          resolveCanonicalRevision: async (hash, revisionId) =>
            await workspace.resolvePixyncGameRevision(hash, revisionId) ??
              await gameRevisions.get(hash, revisionId),
          appendRemoteJournalCommand: workspace.applyPixyncGameRemote,
        },
        onInvalidation,
      });
      return {
        adapters: [draw.adapter, audio.adapter, game.adapter],
        submitDraw: (detail) =>
          draw.submitLocal(
            detail.result,
            detail.nextState,
            detail.baseStructureEpoch,
          ),
        submitAudio: (entry) => audio.submitLocal(entry),
        submitGameEditor: async (detail) => {
          const command = (detail as { readonly command?: JournalCommand })
            .command;
          if (command === undefined) return;
          await gameRevisions.put(command.after);
          await game.submitLocal(command);
        },
      };
    },
    onStatus: (status) => publishPixyncProductionStatus(status, projectId),
    onError: (error) => {
      const errorText = error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : JSON.stringify(error);
      if (/scope_assignment_required/i.test(errorText ?? "")) {
        document.body.dataset.pixyncState = "subscribed";
        document.body.dataset.pixyncError = "COLLABORATION_SCOPE_REQUIRED";
        setStatus(
          "この編集ルールでは現在の担当範囲に保存できません。画面上部の「確認・申請」から担当範囲を申請してください。",
          "error",
        );
        void refreshCollaborationScopeUi();
        return;
      }
      document.body.dataset.pixyncState = "error";
      document.body.dataset.pixyncError = error instanceof Error
        ? error.message
        : "PIXYNC_RUNTIME_ERROR";
      publishPixyncProductionStatus(
        "OFFLINE",
        projectId,
        "PiXYNCでエラーが発生しました。ローカル変更を保持しています。",
      );
    },
  });
  await root.connect();
  if (state.projectId !== projectId) {
    if (pixyncProjectLifecycle === localLifecycle) {
      pixyncProjectLifecycle = undefined;
    }
    await localLifecycle?.dispose();
    await root.close("project-changed-during-connect");
    return false;
  }
  if (pixyncProjectLifecycle === localLifecycle) {
    pixyncProjectLifecycle = undefined;
  }
  await localLifecycle?.dispose();
  await stopLocalProjectSession();
  pixyncProductionRoot = root;
  document.body.dataset.pixyncComposition = "production";
  publishPixyncProductionStatus("SUBSCRIBED", projectId);
  void promptCollaborationConsentIfNeeded();
  return true;
}

interface PxdEntryImportOptions {
  readonly expectedPackageHash?: string;
  readonly expectedProjectId?: string;
  readonly announceProjectChange?: boolean;
  readonly mode?: "PROJECT" | "ASSET_ONLY";
  readonly source?:
    | "LOCAL_FILE"
    | "REMOTE_CHECKPOINT"
    | "MARKET_PURCHASE"
    | "MARKET_ASSET";
  readonly marketMetadata?: unknown;
}

const MARKET_IMPORT_DB_NAME = "pixieed-market-import-v1";
const MARKET_IMPORT_STORE_NAME = "imports";
const MARKET_IMPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const MARKET_IMPORT_FILENAME_PATTERN = /\.(?:pxd|pxdraw|pixiedraw)$/iu;
const MARKET_IMPORT_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

interface MarketImportRecord {
  readonly token: string;
  readonly blob: Blob;
  readonly filename: string;
  readonly expiresAt: number;
  readonly mode: "DRAW_OPEN" | "GAME_BIND";
  readonly targetProjectId?: string;
  readonly metadata?: unknown;
}

interface MarketImportRequest {
  readonly token?: string;
  readonly mode: "DRAW_OPEN" | "GAME_BIND";
  readonly targetProjectId?: string;
  readonly invalid: boolean;
}

function readMarketImportRequest(): MarketImportRequest {
  const url = new URL(window.location.href);
  const rawImportToken = url.searchParams.get("market_import");
  const rawBindToken = url.searchParams.get("market_bind");
  const rawProjectId = url.searchParams.get("projectId") ??
    url.searchParams.get("project");
  const targetProjectId = rawProjectId?.trim();
  if (rawImportToken === null && rawBindToken === null) {
    return { mode: "DRAW_OPEN", invalid: false };
  }
  try {
    url.searchParams.delete("market_import");
    url.searchParams.delete("market_bind");
    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // The import remains fail-closed if the browser disallows history updates.
  }
  if (rawImportToken !== null && rawBindToken !== null) {
    return { mode: "DRAW_OPEN", invalid: true };
  }
  const mode = rawBindToken === null ? "DRAW_OPEN" : "GAME_BIND";
  const token = (rawBindToken ?? rawImportToken ?? "").trim();
  if (!MARKET_IMPORT_TOKEN_PATTERN.test(token)) return { mode, invalid: true };
  if (
    mode === "GAME_BIND" &&
    (targetProjectId === undefined ||
      !MARKET_IMPORT_PROJECT_ID_PATTERN.test(targetProjectId))
  ) {
    return { mode, invalid: true };
  }
  return {
    token,
    mode,
    ...(targetProjectId === undefined ? {} : { targetProjectId }),
    invalid: false,
  };
}

function consumeMarketImportRecord(
  token: string,
): Promise<MarketImportRecord> {
  return new Promise((resolve, reject) => {
    let database: IDBDatabase | undefined;
    let consumed: MarketImportRecord | undefined;
    const request = window.indexedDB.open(MARKET_IMPORT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const result = request.result;
      if (!result.objectStoreNames.contains(MARKET_IMPORT_STORE_NAME)) {
        result.createObjectStore(MARKET_IMPORT_STORE_NAME, { keyPath: "token" });
      }
    };
    request.onerror = () => reject(new Error("Market import unavailable."));
    request.onsuccess = () => {
      database = request.result;
      try {
        const transaction = database.transaction(
          MARKET_IMPORT_STORE_NAME,
          "readwrite",
        );
        const store = transaction.objectStore(MARKET_IMPORT_STORE_NAME);
        const read = store.get(token);
        read.onerror = () => reject(new Error("Market import unavailable."));
        read.onsuccess = () => {
          const value = read.result as Partial<MarketImportRecord> | undefined;
          const filename = typeof value?.filename === "string"
            ? value.filename.trim()
            : "";
          const valid = value !== undefined &&
            value.token === token &&
            value.blob instanceof Blob &&
            Number.isFinite(value.expiresAt) &&
            Number(value.expiresAt) > Date.now() &&
            filename.length > 0 && filename.length <= 255 &&
            MARKET_IMPORT_FILENAME_PATTERN.test(filename) &&
            !/[\\/\u0000-\u001f]/u.test(filename) &&
            (value?.mode === undefined || value.mode === "DRAW_OPEN" ||
              value.mode === "GAME_BIND") &&
            (value?.targetProjectId === undefined ||
              (typeof value.targetProjectId === "string" &&
                MARKET_IMPORT_PROJECT_ID_PATTERN.test(value.targetProjectId)));
          // Delete in the same readwrite transaction. A token can therefore
          // never be successfully consumed twice, even across two tabs.
          store.delete(token);
          if (valid) {
            consumed = {
              token,
              blob: new Blob([value.blob as Blob], {
                type: value.blob.type || "application/vnd.pixieed.pxd",
              }),
            filename,
            expiresAt: Number(value.expiresAt),
            mode: value.mode === "GAME_BIND" ? "GAME_BIND" : "DRAW_OPEN",
            ...(typeof value.targetProjectId === "string" &&
                MARKET_IMPORT_PROJECT_ID_PATTERN.test(value.targetProjectId)
              ? { targetProjectId: value.targetProjectId }
              : {}),
            ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
          };
          }
        };
        transaction.oncomplete = () => {
          database?.close();
          if (consumed === undefined) {
            reject(new Error("Market import record is invalid or expired."));
            return;
          }
          resolve(consumed);
        };
        transaction.onerror = () => reject(new Error("Market import unavailable."));
        transaction.onabort = () => reject(new Error("Market import unavailable."));
      } catch {
        database?.close();
        reject(new Error("Market import unavailable."));
      }
    };
  });
}

async function importMarketPurchaseFromUrl(): Promise<void> {
  const request = readMarketImportRequest();
  if (request.invalid) {
    setStatus("購入PXDを読み込めません。", "error");
    return;
  }
  if (request.token === undefined) return;
  try {
    const record = await consumeMarketImportRecord(request.token);
    const file = new File(
      [record.blob],
      record.filename,
      { type: record.blob.type || "application/vnd.pixieed.pxd" },
    );
    if (request.mode === "GAME_BIND" && record.mode !== "GAME_BIND") {
      throw new Error("Market asset transfer mode is invalid.");
    }
    if (request.mode === "GAME_BIND") {
      if (
        record.targetProjectId !== undefined &&
        record.targetProjectId !== request.targetProjectId
      ) {
        throw new Error("Market asset target Project is inconsistent.");
      }
      const targetProjectId = request.targetProjectId ?? record.targetProjectId;
      if (
        targetProjectId === undefined ||
        !MARKET_IMPORT_PROJECT_ID_PATTERN.test(targetProjectId)
      ) {
        throw new Error("Market asset target Project is missing.");
      }
      await importPxdFile(file, {
        mode: "ASSET_ONLY",
        source: "MARKET_ASSET",
        expectedProjectId: targetProjectId,
        marketMetadata: record.metadata,
      });
      setStatus("購入Assetを現在のProjectのiGAME素材棚へ追加しました。");
      return;
    }
    await importPxdFile(file, {
      announceProjectChange: true,
      source: "MARKET_PURCHASE",
    });
    setStatus("購入PXDを読み込みました。");
  } catch {
    // Do not expose the token, record, or storage details in the UI/status.
    setStatus("購入PXDを読み込めません。", "error");
  }
}

const MARKET_SOURCE_FRAME_PREFIX = "market-source-frame-v1:";
const MARKET_SOURCE_RASTER_PREFIX = "market-source-raster-v1:";
const MARKET_SOURCE_MAX_FRAMES = 512;
const MARKET_SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/iu;
const MARKET_SOURCE_LAYOUTS = [
  "FULL_CANVAS",
  "MANUAL",
  "GRID_32",
  "FRAME_SEQUENCE",
  "GRID_FRAME_SEQUENCE",
] as const;
type MarketSourceLayout = typeof MARKET_SOURCE_LAYOUTS[number];

interface MarketAssetBindingMetadata {
  readonly source: {
    readonly assetId: string;
    readonly revisionId: string;
    readonly contentHash: string;
    readonly packageHash?: string;
    readonly label: string;
    readonly format: string;
    readonly layout: MarketSourceLayout;
    readonly projectId?: string;
  };
  readonly delivery: {
    readonly deliveryId: string;
    readonly status: "SECURE_DELIVERED";
    readonly assetId: string;
    readonly revisionId: string;
    readonly contentHash: string;
    readonly packageHash?: string;
    readonly format: string;
    readonly licenseId: string;
  };
  readonly license: {
    readonly licenseId: string;
    readonly status: "ACTIVE";
    readonly rights: readonly string[];
    readonly inGameUse: true;
  };
  readonly entitlement: {
    readonly id: string;
    readonly acquisitionKind: "paid" | "free" | "admin";
  };
}

function marketRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function marketRequiredText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function marketContentHash(value: unknown): string | undefined {
  const text = marketRequiredText(value)?.toLowerCase();
  return text !== undefined && MARKET_SOURCE_HASH_PATTERN.test(text)
    ? text
    : undefined;
}

function marketLayout(value: unknown): MarketSourceLayout | undefined {
  return typeof value === "string" &&
      (MARKET_SOURCE_LAYOUTS as readonly string[]).includes(value)
    ? value as MarketSourceLayout
    : undefined;
}

/** Accept only the explicit, server-provided rights and delivery envelope. */
function marketAssetBindingMetadataFor(
  value: unknown,
  options: { readonly requireEntitlement?: boolean } = {},
): MarketAssetBindingMetadata | undefined {
  const candidate = marketRecord(value);
  const source = marketRecord(candidate?.source);
  const delivery = marketRecord(candidate?.delivery);
  const license = marketRecord(candidate?.license);
  const entitlement = marketRecord(candidate?.entitlement);
  if (
    source === undefined || delivery === undefined || license === undefined ||
    (options.requireEntitlement === true && entitlement === undefined)
  ) {
    return undefined;
  }
  const assetId = marketRequiredText(source.assetId ?? source.asset_id);
  const revisionId = marketRequiredText(source.revisionId ?? source.revision_id);
  const contentHash = marketContentHash(source.contentHash ?? source.content_hash);
  const packageHash = marketContentHash(source.packageHash ?? source.package_hash);
  const label = marketRequiredText(source.label ?? source.title);
  const format = marketRequiredText(source.format);
  const layout = marketLayout(source.layout);
  const deliveryId = marketRequiredText(delivery.deliveryId ?? delivery.delivery_id);
  const deliveryStatus = marketRequiredText(delivery.status);
  const deliveryAssetId = marketRequiredText(delivery.assetId ?? delivery.asset_id);
  const deliveryRevisionId = marketRequiredText(delivery.revisionId ?? delivery.revision_id);
  const deliveryHash = marketContentHash(delivery.contentHash ?? delivery.content_hash);
  const deliveryPackageHash = marketContentHash(delivery.packageHash ?? delivery.package_hash);
  const deliveryFormat = marketRequiredText(delivery.format);
  const deliveryLicenseId = marketRequiredText(delivery.licenseId ?? delivery.license_id);
  const licenseId = marketRequiredText(license.licenseId ?? license.license_id);
  const licenseStatus = marketRequiredText(license.status);
  const inGameUse = license.in_game_use === true || license.inGameUse === true;
  const rights = Array.isArray(license.rights)
    ? license.rights.flatMap((item) => {
      const right = marketRequiredText(item);
      return right === undefined ? [] : [right];
    })
    : [];
  const entitlementId = marketRequiredText(entitlement?.id ?? entitlement?.entitlementId);
  const acquisitionKind = marketRequiredText(
    entitlement?.acquisitionKind ?? entitlement?.acquisition_kind,
  );
  const validAcquisitionKind = acquisitionKind === "paid" ||
    acquisitionKind === "free" || acquisitionKind === "admin";
  if (
    assetId === undefined || revisionId === undefined ||
    contentHash === undefined || label === undefined || format === undefined ||
    layout === undefined || deliveryId === undefined ||
    deliveryAssetId === undefined || deliveryRevisionId === undefined ||
    deliveryHash === undefined || deliveryFormat === undefined ||
    deliveryLicenseId === undefined || deliveryStatus !== "SECURE_DELIVERED" ||
    licenseId === undefined || licenseStatus !== "ACTIVE" ||
    rights.length === 0 || new Set(rights).size !== rights.length ||
    !inGameUse || assetId !== deliveryAssetId ||
    revisionId !== deliveryRevisionId || contentHash !== deliveryHash ||
    format !== deliveryFormat || licenseId !== deliveryLicenseId
    || (format === "pixiedraw-project" &&
      (packageHash === undefined || deliveryPackageHash === undefined))
    || packageHash !== deliveryPackageHash
    || (options.requireEntitlement === true &&
      (entitlementId === undefined || !validAcquisitionKind))
  ) {
    return undefined;
  }
  const projectId = marketRequiredText(source.projectId);
  const normalized: MarketAssetBindingMetadata = {
    source: {
      assetId,
      revisionId,
      contentHash,
      ...(packageHash === undefined ? {} : { packageHash }),
      label,
      format,
      layout,
      ...(projectId === undefined ? {} : { projectId }),
    },
    delivery: {
      deliveryId,
      status: "SECURE_DELIVERED",
      assetId: deliveryAssetId,
      revisionId: deliveryRevisionId,
      contentHash: deliveryHash,
      ...(deliveryPackageHash === undefined ? {} : { packageHash: deliveryPackageHash }),
      format: deliveryFormat,
      licenseId: deliveryLicenseId,
    },
    license: {
      licenseId,
      status: "ACTIVE",
      rights,
      inGameUse: true,
    },
    entitlement: {
      id: entitlementId ?? "",
      acquisitionKind: validAcquisitionKind ? acquisitionKind : "paid",
    },
  };
  const marketAccess = normalized.entitlement.acquisitionKind === "free"
    ? "FREE" as const
    : "PURCHASED" as const;
  const marketEntitlementStatus = normalized.entitlement.acquisitionKind === "admin"
    ? "GRANTED" as const
    : normalized.entitlement.acquisitionKind === "free"
    ? "GRANTED" as const
    : "PAID" as const;
  const sharedValidation = createMarketAssetBindingCandidate({
    catalog: {
      id: normalized.source.assetId,
      title: normalized.source.label,
      kind: "DRAW",
      formats: [normalized.source.format],
      price: {
        amountMinor: marketAccess === "FREE" ? 0 : 1,
        currency: "JPY",
      },
      creator: { id: "MARKET", name: "Market" },
      rights: [...normalized.license.rights],
    },
    access: marketAccess,
    entitlementStatus: marketEntitlementStatus,
    source: normalized.source,
    license: normalized.license,
    delivery: normalized.delivery,
    supportedFormats: [normalized.source.format],
  });
  return sharedValidation.ok ? normalized : undefined;
}

function marketSourceRasterIdForFrame(sourceFrameId: string): string | undefined {
  if (!sourceFrameId.startsWith(MARKET_SOURCE_FRAME_PREFIX)) return undefined;
  try {
    const value = decodeURIComponent(
      sourceFrameId.slice(MARKET_SOURCE_FRAME_PREFIX.length),
    );
    return value.startsWith(MARKET_SOURCE_RASTER_PREFIX) ? value : undefined;
  } catch {
    return undefined;
  }
}

function compositeMarketSourceRaster(
  importedState: ProjectState,
  frameId: string,
  rasterId: string,
): RasterAsset {
  const fallback = importedState.assets[importedState.activeAssetId];
  if (fallback === undefined) {
    throw new Error("Market PXDの基準ラスタが見つかりません。");
  }
  const width = fallback.width;
  const height = fallback.height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const orderedLayers = importedState.timeline.layerTrackOrder
    .map((layerTrackId) =>
      importedState.layers.find((item) => item.layerTrackId === layerTrackId)
    )
    .filter((layer): layer is NonNullable<typeof layer> =>
      layer !== undefined && layer.lifecycle === "ACTIVE" && layer.visible &&
      layer.opacity > 0
    );
  const layers = orderedLayers.length > 0
    ? orderedLayers
    : importedState.layers
      .filter((layer) => layer.lifecycle === "ACTIVE" && layer.visible && layer.opacity > 0)
      .sort((left, right) => left.order - right.order ||
        left.layerTrackId.localeCompare(right.layerTrackId));

  for (const layer of layers) {
    const cel = importedState.cels.find((candidate) =>
      candidate.layerTrackId === layer.layerTrackId &&
      candidate.frameId === frameId && candidate.lifecycle === "ACTIVE" &&
      candidate.assetId !== undefined
    );
    const source = cel?.assetId === undefined
      ? undefined
      : importedState.assets[cel.assetId];
    if (source === undefined) continue;
    const sourcePixels = source.width >= width && source.height >= height
      ? source.raster.readRegion(0, 0, width, height).pixels
      : undefined;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x >= source.width || y >= source.height) continue;
        const sourceIndex = sourcePixels === undefined
          ? source.raster.getPixel(x, y)
          : sourcePixels[y * width + x] ?? 0;
        if (sourceIndex === 0) continue;
        const sourceColor = decodeArgb(source.palette[sourceIndex] ?? 0);
        const sourceAlpha = (sourceColor.alpha / 255) * layer.opacity;
        if (sourceAlpha <= 0) continue;
        const offset = (y * width + x) * 4;
        const destinationAlpha = (rgba[offset + 3] ?? 0) / 255;
        const destinationRed = (rgba[offset] ?? 0) / 255;
        const destinationGreen = (rgba[offset + 1] ?? 0) / 255;
        const destinationBlue = (rgba[offset + 2] ?? 0) / 255;
        const sourceRed = sourceColor.red / 255;
        const sourceGreen = sourceColor.green / 255;
        const sourceBlue = sourceColor.blue / 255;
        const blendRed = layer.blendMode === "MULTIPLY"
          ? sourceRed * destinationRed
          : sourceRed;
        const blendGreen = layer.blendMode === "MULTIPLY"
          ? sourceGreen * destinationGreen
          : sourceGreen;
        const blendBlue = layer.blendMode === "MULTIPLY"
          ? sourceBlue * destinationBlue
          : sourceBlue;
        const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
        if (outputAlpha <= 0) continue;
        rgba[offset] = Math.round(
          ((blendRed * sourceAlpha + destinationRed * destinationAlpha * (1 - sourceAlpha)) /
            outputAlpha) * 255,
        );
        rgba[offset + 1] = Math.round(
          ((blendGreen * sourceAlpha + destinationGreen * destinationAlpha * (1 - sourceAlpha)) /
            outputAlpha) * 255,
        );
        rgba[offset + 2] = Math.round(
          ((blendBlue * sourceAlpha + destinationBlue * destinationAlpha * (1 - sourceAlpha)) /
            outputAlpha) * 255,
        );
        rgba[offset + 3] = Math.round(outputAlpha * 255);
      }
    }
  }

  // Keep the imported canonical representation indexed. A frame may contain
  // blended/partially transparent colors that do not exist in any source
  // palette, so select the 255 most frequent colors and deterministically
  // map the remainder to the nearest color instead of dropping layers.
  const frequencies = new Map<number, number>();
  for (let index = 0; index < rgba.length; index += 4) {
    const color = argbFromRgb(
      { r: rgba[index] ?? 0, g: rgba[index + 1] ?? 0, b: rgba[index + 2] ?? 0 },
      rgba[index + 3] ?? 0,
    );
    if ((rgba[index + 3] ?? 0) === 0) continue;
    frequencies.set(color, (frequencies.get(color) ?? 0) + 1);
  }
  const palette = [0, ...Array.from(frequencies.keys()).sort((left, right) =>
    (frequencies.get(right) ?? 0) - (frequencies.get(left) ?? 0) || left - right
  ).slice(0, 255)];
  const paletteIndexByColor = new Map(palette.map((color, index) => [color, index]));
  const nearestIndex = (color: number): number => {
    const exact = paletteIndexByColor.get(color);
    if (exact !== undefined) return exact;
    const target = decodeArgb(color);
    let bestIndex = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < palette.length; index += 1) {
      const candidate = decodeArgb(palette[index] ?? 0);
      const distance = (target.red - candidate.red) ** 2 +
        (target.green - candidate.green) ** 2 +
        (target.blue - candidate.blue) ** 2 +
        2 * (target.alpha - candidate.alpha) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  };
  const raster = IndexedTileRaster.empty(width, height, fallback.raster.tileSize);
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3] ?? 0;
    if (alpha === 0) continue;
    const color = argbFromRgb(
      { r: rgba[index] ?? 0, g: rgba[index + 1] ?? 0, b: rgba[index + 2] ?? 0 },
      alpha,
    );
    const pixel = index / 4;
    raster.setPixel(
      rasterId,
      pixel % width,
      Math.floor(pixel / width),
      nearestIndex(color),
    );
  }
  return { id: rasterId, width, height, palette, raster, revision: 0 };
}

function marketSourceRastersFor(
  importedState: ProjectState,
  metadata: MarketAssetBindingMetadata,
): {
  readonly assets: Readonly<Record<string, RasterAsset>>;
  readonly sourceFrames: readonly {
    readonly sourceFrameId: string;
    readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly durationMs: number;
  }[];
} {
  if (importedState.frames.length === 0 || importedState.frames.length > MARKET_SOURCE_MAX_FRAMES) {
    throw new Error("Market PXDのフレーム数がiGAMEの上限を超えています。");
  }
  const assets: Record<string, RasterAsset> = {};
  const sourceFrames = importedState.frames.map((frame, index) => {
    const rasterId = `${MARKET_SOURCE_RASTER_PREFIX}${encodeURIComponent(metadata.source.assetId)}:${encodeURIComponent(metadata.source.revisionId)}:${index}`;
    if (assets[rasterId] === undefined) {
      assets[rasterId] = compositeMarketSourceRaster(
        importedState,
        frame.frameId,
        rasterId,
      );
    }
    const raster = assets[rasterId];
    if (raster === undefined) throw new Error("Market PXDのフレーム素材が見つかりません。");
    const sourceFrameId = `${MARKET_SOURCE_FRAME_PREFIX}${encodeURIComponent(rasterId)}`;
    return {
      sourceFrameId,
      layerIds: importedState.layers
        .filter((layer) => layer.lifecycle === "ACTIVE" && layer.visible)
        .map((layer) => layer.layerTrackId),
      rect: { x: 0, y: 0, width: raster.width, height: raster.height },
      durationMs: Math.max(1, Math.round(frame.durationMs)),
    };
  });
  return { assets, sourceFrames };
}

function appendMarketAssetSource(
  currentState: ProjectState,
  importedState: ProjectState,
  metadata: MarketAssetBindingMetadata,
): {
  readonly state: ProjectState;
  readonly reference: {
    readonly assetId: string;
    readonly revisionId: string;
    readonly contentHash: string;
    readonly label: string;
    readonly mode: "PINNED";
    readonly licenseId: string;
    readonly rights: readonly string[];
    readonly sourceKind: "MARKET";
    readonly layout: MarketSourceLayout;
    readonly projectId?: string;
    readonly sourceFrameId: string;
    readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly sourceFrames: readonly {
      readonly sourceFrameId: string;
      readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
      readonly durationMs: number;
    }[];
  };
} {
  const projected = marketSourceRastersFor(importedState, metadata);
  const first = projected.sourceFrames[0];
  if (first === undefined) throw new Error("Market PXDの参照フレームがありません。");
  const firstRasterId = marketSourceRasterIdForFrame(first.sourceFrameId);
  const firstRaster = firstRasterId === undefined
    ? undefined
    : projected.assets[firstRasterId];
  if (firstRaster === undefined) throw new Error("Market PXDの参照ラスタがありません。");
  const nextAssets = { ...currentState.assets };
  let changed = false;
  for (const [id, asset] of Object.entries(projected.assets)) {
    const current = nextAssets[id];
    if (current !== undefined && (current.width !== asset.width || current.height !== asset.height)) {
      throw new Error("同一Market Asset IDに異なる内容が存在します。");
    }
    if (current === undefined) {
      nextAssets[id] = asset;
      changed = true;
    }
  }
  const nextState: ProjectState = changed
    ? {
      ...currentState,
      structureEpoch: currentState.structureEpoch + 1,
      assets: nextAssets,
    }
    : currentState;
  return {
    state: nextState,
    reference: {
      assetId: metadata.source.assetId,
      revisionId: metadata.source.revisionId,
      contentHash: metadata.source.contentHash,
      label: metadata.source.label,
      mode: "PINNED",
      ...(metadata.source.projectId === undefined ? {} : { projectId: metadata.source.projectId }),
      licenseId: metadata.license.licenseId,
      rights: [...metadata.license.rights],
      sourceKind: "MARKET",
      layout: metadata.source.layout,
      sourceFrameId: first.sourceFrameId,
      region: first.rect,
      sourceFrames: projected.sourceFrames,
    },
  };
}

function currentDrawStateHasLocalWork(): boolean {
  if (state.structureEpoch > 1 || assetDefinitions.length > 0 || assetPackages.length > 0) return true;
  if (history.undoDepth > 0 || history.redoDepth > 0) return true;
  if (journal.operations.length > 0 || journal.dirtyTileWrites.length > 0) {
    return true;
  }
  for (const tilemap of Object.values(state.tilemaps ?? {})) {
    if (Object.keys(tilemap.cells).length > 0) return true;
  }
  for (const asset of Object.values(state.assets)) {
    for (const tile of asset.raster.snapshotTiles()) {
      if (tile.bytes.some((value) => value !== 0)) return true;
    }
  }
  return false;
}

async function hydratePixyncCheckpointIfNeeded(
  client: PixyncSupabaseSdkClient,
  projectId: string,
): Promise<boolean> {
  // A valid local session may contain edits that have not reached PiXYNC yet.
  // Never replace those edits with a remote checkpoint merely because the
  // Room URL is a UUID.
  if (currentDrawStateHasLocalWork()) return false;
  if (state.projectId !== projectId) {
    throw new Error("The Project changed before PiXYNC checkpoint restore.");
  }
  const checkpoint = await readPixyncActiveCheckpoint(client, projectId);
  if (state.projectId !== projectId) {
    throw new Error("The Project changed during PiXYNC checkpoint restore.");
  }
  const file = new File(
    [checkpoint.bytes.slice().buffer as ArrayBuffer],
    `${projectId}.pxd`,
    { type: "application/vnd.pixieed.pxd" },
  );
  try {
    await importPxdFile(file, {
      expectedPackageHash: checkpoint.packageHash,
      expectedProjectId: projectId,
      announceProjectChange: false,
      source: "REMOTE_CHECKPOINT",
    });
  } catch (cause) {
    if (cause instanceof PixyncRemoteCheckpointError) throw cause;
    throw new PixyncRemoteCheckpointError(
      "SERVER_RESPONSE_INVALID",
      "The verified PiXYNC checkpoint could not be restored as a Studio Project.",
      { cause },
    );
  }
  return true;
}

function queuePixyncProductionStart(
  client?: PixyncSupabaseSdkClient,
): Promise<boolean> {
  let result = false;
  pixyncProductionTransition = pixyncProductionTransition.then(async () => {
    result = await startPixyncProductionRoot(client);
  }).catch((error) => {
    document.body.dataset.pixyncState = "error";
    document.body.dataset.pixyncError = error instanceof Error
      ? error.message
      : "PIXYNC_START_FAILED";
  });
  return pixyncProductionTransition.then(() => result);
}

(window as PixyncWindow).__pixiedraw2StartPixyncProduction =
  queuePixyncProductionStart;

window.addEventListener(WORKSPACE_PROJECT_CHANGED_EVENT, () => {
  void queuePixyncProductionStart();
});
window.addEventListener("pixieed:supabase-client-ready", (event) => {
  const client =
    (event as CustomEvent<{ readonly client?: PixyncSupabaseSdkClient }>)
      .detail?.client;
  void queuePixyncProductionStart(client);
});
window.addEventListener("pixieed:account-auth-state", (event) => {
  const authenticated =
    (event as CustomEvent<{ readonly authenticated?: boolean }>)
      .detail?.authenticated;
  if (authenticated === true) void queuePixyncProductionStart();
  else if (authenticated === false) {
    void pixyncProductionRoot?.close("signed-out");
    pixyncProductionRoot = undefined;
    document.body.dataset.pixyncComposition = "awaiting-auth";
  }
});

function layerKind(layerTrackId: string): "RASTER" | "TILEMAP" {
  return state.layers.find((layer) => layer.layerTrackId === layerTrackId)
      ?.kind === "TILEMAP"
    ? "TILEMAP"
    : "RASTER";
}

function activeLayerIsTilemap(): boolean {
  return layerKind(state.activeLayerId) === "TILEMAP";
}

function activeTilemap(): Draw2Tilemap | undefined {
  return state.tilemaps
    ?.[tilemapIdFor(state.activeLayerId, state.activeFrameId)];
}

function tilemapCellSizeFromControls(): 16 | 32 {
  return tilesetCellSizeControl?.value === "32" ? 32 : 16;
}

function ensureTilemapFor(
  layerTrackId: string,
  frameId: string,
  cellSize = tilemapCellSizeFromControls(),
): Draw2Tilemap | undefined {
  if (layerKind(layerTrackId) !== "TILEMAP") return undefined;
  const id = tilemapIdFor(layerTrackId, frameId);
  const existing = state.tilemaps?.[id];
  if (existing !== undefined) return existing;
  const source = state.assets[state.activeAssetId];
  if (source === undefined) return undefined;
  const map = createDraw2Tilemap({
    id,
    layerTrackId,
    frameId,
    canvasWidth: source.width,
    canvasHeight: source.height,
    cellSize,
  });
  adoptCanonicalState({
    ...state,
    tilemaps: { ...(state.tilemaps ?? {}), [id]: map },
  });
  return map;
}

let selectedTileSource: {
  readonly sourceAssetId: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly cellSize: 16 | 32;
} | undefined;
let tilemapOperationSequence = 0;

tilesetGridElement?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cell = target.closest<HTMLElement>("[data-tileset-cell]");
  const value = cell?.dataset.tilesetCell;
  if (value === undefined) return;
  const [xValue, yValue, sizeValue] = value.split(":");
  const sourceX = Number(xValue);
  const sourceY = Number(yValue);
  const cellSize = Number(sizeValue);
  if (
    !Number.isSafeInteger(sourceX) || !Number.isSafeInteger(sourceY) ||
    (cellSize !== 16 && cellSize !== 32)
  ) return;
  selectedTileSource = {
    sourceAssetId: state.activeAssetId,
    sourceX,
    sourceY,
    cellSize,
  };
  setStatus(
    activeLayerIsTilemap()
      ? `タイル ${sourceX + 1},${sourceY + 1} を選択 · Canvasをクリックして配置`
      : `タイル ${sourceX + 1},${
        sourceY + 1
      } を選択 · Tilemapレイヤーで配置できます`,
  );
});
const autosave = new LocalAutosaveCoordinator(journal, 4, instrumentation);
const DRAW_CLIENT_ID = "draw2-local-client";
const SELECTION_CLIENT_ID = "draw2-selection-local";
const TIMELINE_CLIENT_ID = "draw2-timeline-local";
let clientSequence = 0;
let selectionClientSequence = 0;
let selectedColor = 1;
const draw2EditorPreferenceStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
let draw2EditorPreferences: Draw2EditorPreferences = readDraw2EditorPreferences(
  draw2EditorPreferenceStorage,
);
let draw2EditorPreferenceSaveTimer: number | undefined;
let restoringDraw2EditorPreferences = false;

function currentDraw2ProjectEditorPreferences(): Draw2ProjectEditorPreferences {
  const stored = draw2ProjectEditorPreferences(
    draw2EditorPreferences,
    state.projectId,
  );
  return {
    ...stored,
    selectedColor,
    mirrorMode,
    mirrorAxes: { ...mirrorAxes },
    mirrorGuide: { ...mirrorGuide },
    viewport: {
      zoom: viewportZoom,
      fit: viewportFitMode,
      userSelected: viewportModeUserSelected,
      panX: viewportPanX,
      panY: viewportPanY,
    },
    onionSkin: {
      enabled: onionSkinEnabled,
      previousFrames: onionSkinPreviousFrames,
      nextFrames: onionSkinNextFrames,
      opacity: onionSkinOpacity,
      colorMode: onionSkinColorMode,
    },
  };
}

function persistDraw2EditorPreferencesNow(): void {
  if (!draw2EditorPreferencesReady || restoringDraw2EditorPreferences) return;
  const brushSizeValue = Number(brushSize.value);
  const similarityValue = Number(similarity.value);
  draw2EditorPreferences = withDraw2ProjectEditorPreferences(
    {
      ...draw2EditorPreferences,
      tool: toolSelect.value,
      brushSize: Number.isFinite(brushSizeValue) ? brushSizeValue : 1,
      brushShape: brushShape.value,
      brushAngle: Number(brushAngle.value) || 0,
      brushAlgorithm: brushAlgorithm.value === "pixel-perfect"
        ? "pixel-perfect"
        : "regular",
      brushPattern: brushPattern.value,
      similarityPercent: Number.isFinite(similarityValue) ? similarityValue : 0,
      colorSelectionMode: colorSelectionModeControl.value,
      playbackLoopMode,
      playbackFps: playbackFpsControl.value,
      playbackFpsCustom: Number(playbackFpsCustomControl.value) || 24,
    },
    state.projectId,
    currentDraw2ProjectEditorPreferences(),
  );
  writeDraw2EditorPreferences(
    draw2EditorPreferenceStorage,
    draw2EditorPreferences,
  );
}

function flushDraw2EditorPreferences(): void {
  if (draw2EditorPreferenceSaveTimer !== undefined) {
    window.clearTimeout(draw2EditorPreferenceSaveTimer);
    draw2EditorPreferenceSaveTimer = undefined;
  }
  persistDraw2EditorPreferencesNow();
}

function scheduleDraw2EditorPreferencesSave(): void {
  if (!draw2EditorPreferencesReady || restoringDraw2EditorPreferences) return;
  if (draw2EditorPreferenceSaveTimer !== undefined) return;
  draw2EditorPreferenceSaveTimer = window.setTimeout(() => {
    draw2EditorPreferenceSaveTimer = undefined;
    persistDraw2EditorPreferencesNow();
  }, 180);
}

function restoreDraw2EditorPreferencesForProject(
  projectId: string,
  asset: Pick<RasterAsset, "width" | "height" | "palette">,
): void {
  restoringDraw2EditorPreferences = true;
  try {
    const stored = draw2EditorPreferences.projects[projectId];
    if (stored === undefined) {
      selectedColor = Math.max(0, Math.min(1, asset.palette.length - 1));
      mirrorMode = "NONE";
      mirrorEnabled = false;
      mirrorAxes = {
        x: false,
        y: false,
        diagonalDown: false,
        diagonalUp: false,
      };
      mirrorGuide = normalizeMirrorGuide(asset);
      viewportZoom = 1;
      viewportFitMode = true;
      viewportModeUserSelected = false;
      viewportPanX = 0;
      viewportPanY = 0;
      onionSkinEnabled = false;
      onionSkinPreviousFrames = 1;
      onionSkinNextFrames = 1;
      onionSkinOpacity = 0.5;
      onionSkinColorMode = "TINTED";
    } else {
      selectedColor = Math.max(
        0,
        Math.min(stored.selectedColor, Math.max(0, asset.palette.length - 1)),
      );
      mirrorMode = stored.mirrorMode;
      mirrorEnabled = stored.mirrorMode === "ON";
      mirrorAxes = { ...stored.mirrorAxes };
      mirrorGuide = normalizeMirrorGuide({
        ...asset,
        ...stored.mirrorGuide,
      });
      viewportZoom = stored.viewport.zoom;
      viewportFitMode = stored.viewport.fit;
      viewportModeUserSelected = stored.viewport.userSelected;
      viewportPanX = stored.viewport.panX;
      viewportPanY = stored.viewport.panY;
      onionSkinEnabled = stored.onionSkin.enabled;
      onionSkinPreviousFrames = stored.onionSkin.previousFrames;
      onionSkinNextFrames = stored.onionSkin.nextFrames;
      onionSkinOpacity = stored.onionSkin.opacity;
      onionSkinColorMode = stored.onionSkin.colorMode;
    }
  } finally {
    restoringDraw2EditorPreferences = false;
  }
  draw2EditorPreferencesReady = true;
  syncMirrorModeToggle();
  syncMirrorLineToggle(
    mirrorToggleX,
    mirrorAxes.x,
    mirrorEnabled,
    "Vertical mirror",
  );
  syncMirrorLineToggle(
    mirrorToggleY,
    mirrorAxes.y,
    mirrorEnabled,
    "Horizontal mirror",
  );
  syncMirrorLineToggle(
    mirrorToggleDiagonalDown,
    mirrorAxes.diagonalDown,
    mirrorEnabled,
    "Descending diagonal mirror",
  );
  syncMirrorLineToggle(
    mirrorToggleDiagonalUp,
    mirrorAxes.diagonalUp,
    mirrorEnabled,
    "Ascending diagonal mirror",
  );
  applyViewportTransform({ clampPan: false });
  renderTimeline();
}

function restoreDraw2GlobalEditorPreferences(): void {
  const preferences = draw2EditorPreferences;
  if (
    Array.from(toolSelect.options).some((option) =>
      option.value === preferences.tool
    )
  ) {
    toolSelect.value = preferences.tool;
  }
  if (
    Array.from(brushShape.options).some((option) =>
      option.value === preferences.brushShape
    )
  ) {
    brushShape.value = preferences.brushShape;
  }
  if (
    Array.from(brushPattern.options).some((option) =>
      option.value === preferences.brushPattern
    )
  ) {
    brushPattern.value = preferences.brushPattern;
  }
  if (
    Array.from(colorSelectionModeControl.options).some((option) =>
      option.value === preferences.colorSelectionMode
    )
  ) {
    colorSelectionModeControl.value = preferences.colorSelectionMode;
  }
  brushSize.value = String(preferences.brushSize);
  brushAngle.value = String(preferences.brushAngle);
  brushAlgorithm.value = preferences.brushAlgorithm;
  similarity.value = String(preferences.similarityPercent);
  if (
    Array.from(playbackFpsControl.options).some((option) =>
      option.value === preferences.playbackFps
    )
  ) playbackFpsControl.value = preferences.playbackFps;
  playbackFpsCustomControl.value = String(preferences.playbackFpsCustom);
  playbackFpsCustomControl.hidden = playbackFpsControl.value !== "custom";
  playbackLoopMode = preferences.playbackLoopMode === "bounce" ||
      preferences.playbackLoopMode === "off"
    ? preferences.playbackLoopMode
    : "loop";
  updatePlaybackLoopControl();
}
const drawCommitIngress = new SerializedCommitIngress();

interface Draw2HistoryPanelEntry {
  readonly actionId: string;
  readonly operationId: string;
  readonly operationType: string;
  readonly direction: "UNDO" | "REDO";
  readonly frameId: string;
  readonly layerId: string;
}

interface Draw2HistoryPanelSnapshot {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly undo: readonly Draw2HistoryPanelEntry[];
  readonly redo: readonly Draw2HistoryPanelEntry[];
}

function draw2HistoryPanelSnapshot(): Draw2HistoryPanelSnapshot {
  const snapshot = history.snapshot(64);
  const summarize = (
    entries: typeof snapshot.undo,
    direction: "UNDO" | "REDO",
  ): Draw2HistoryPanelEntry[] =>
    entries.slice().reverse().map((entry) => ({
      actionId: entry.actionId,
      operationId: entry.operationId,
      operationType: entry.operationType,
      direction,
      frameId: entry.after.activeFrameId,
      layerId: entry.after.activeLayerId,
    }));
  return {
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth,
    undo: summarize(snapshot.undo, "UNDO"),
    redo: summarize(snapshot.redo, "REDO"),
  };
}

const draw2HistoryBridge = {
  snapshot: draw2HistoryPanelSnapshot,
  undo: () => undoControl.click(),
  redo: () => redoControl.click(),
};
(
  window as Window & {
    __pixiedraw2DrawHistory?: typeof draw2HistoryBridge;
  }
).__pixiedraw2DrawHistory = draw2HistoryBridge;
function readStoredBrushPresets(): readonly BrushPreset[] {
  const store = new BrushPresetStore();
  try {
    const raw = window.localStorage.getItem("pixieed:draw2:brush-presets:v1");
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        try {
          store.save(value as BrushPreset);
        } catch { /* malformed local preference is ignored */ }
      }
    }
  } catch { /* local persistence is optional */ }
  if (store.list().length === 0) {
    store.save({
      id: "preset:default",
      name: "Default",
      brushSize: 1,
      brushShape: "square",
      brushAngle: 0,
      brushAlgorithm: "regular",
      pattern: "solid",
      dither: "NONE",
      colorIndex: 1,
      opacity: 1,
      schemaVersion: 1,
    });
  }
  return store.list();
}
const brushPresets = new BrushPresetStore(readStoredBrushPresets());
const animationTags = new AnimationTagStore();
const timelineMarkers = new TimelineMarkerStore();
const drawAudioReferences = new DrawAudioReferenceStore();
// Keep the legacy store only so old projects can round-trip their metadata.
// Selection-stamp creation and placement are no longer part of the iDRAW UI.
const selectionStampStore = new Draw2SelectionStampStore();

interface DrawAudioCatalogItem {
  readonly audioAssetId: string;
  readonly audioRevisionId: string;
  readonly kind: "BGM" | "SE";
  readonly label: string;
}

let drawAudioCatalog: DrawAudioCatalogItem[] = [];

function draw2TimelineMetadataSnapshot(): Draw2TimelineMetadata {
  return normalizeDraw2TimelineMetadata({
    schemaVersion: 2,
    animationTags: animationTags.list(),
    markers: timelineMarkers.list(),
    audioReferences: drawAudioReferences.list(),
    selectionStamps: selectionStampStore.list(),
  }, state.frames.length);
}

function restoreDraw2TimelineMetadata(value: unknown): void {
  const metadata = normalizeDraw2TimelineMetadata(value, state.frames.length);
  for (const tag of animationTags.list()) animationTags.remove(tag.id);
  for (const marker of timelineMarkers.list()) {
    timelineMarkers.remove(marker.id);
  }
  for (const reference of drawAudioReferences.list()) {
    drawAudioReferences.remove(reference.id);
  }
  for (const tag of metadata.animationTags) {
    animationTags.upsert(tag, state.frames.length);
  }
  for (const marker of metadata.markers) timelineMarkers.upsert(marker);
  for (const reference of metadata.audioReferences) {
    drawAudioReferences.upsert(reference, state.frames.length);
  }
  for (const stamp of selectionStampStore.list()) {
    selectionStampStore.remove(stamp.id);
  }
  for (const stamp of metadata.selectionStamps ?? []) {
    selectionStampStore.save(stamp);
  }
}

let linkedCelBindings: LinkedCelBinding[] = [];
let selection: SelectionSnapshot | undefined;
let rectangleSelectionClipCache: {
  readonly key: string;
  readonly clip: RasterClipRect;
} | undefined;
let rasterSelectionMaskCache: {
  readonly key: string;
  readonly mask: RasterSelectionMask;
} | undefined;
let fillPreviewRegionCache: {
  readonly key: string;
  readonly region: readonly { x: number; y: number }[];
} | undefined;
let selectionInteractionGeneration = 0;
let selectionEditMode: SelectionEditMode = "REPLACE";
let selectionDraft: {
  readonly snapshot: SelectionSnapshot | undefined;
  readonly mode: SelectionEditMode;
  readonly message: string;
} | undefined;
let assetDefinitions: PxdAssetDefinitionEntry[] = [];
let assetPackages: AssetPackageManifest[] = [];
let assetDefinitionSequence = 0;

function cloneAssetDefinitionEntry(
  entry: PxdAssetDefinitionEntry,
): PxdAssetDefinitionEntry {
  return {
    definitionId: entry.definitionId,
    definition: {
      ...entry.definition,
      sourceLayerIds: [...entry.definition.sourceLayerIds],
      animationMapping: entry.definition.animationMapping.map((clip) => ({
        ...clip,
        frameIds: [...clip.frameIds],
        ...(clip.sourceFrames === undefined ? {} : {
          sourceFrames: clip.sourceFrames.map((frame) => ({
            ...frame,
            layerIds: [...frame.layerIds],
            rect: { ...frame.rect },
            ...(frame.rasterSnapshot === undefined ? {} : {
              rasterSnapshot: {
                ...frame.rasterSnapshot,
                data: [...frame.rasterSnapshot.data],
              },
            }),
          })),
        }),
        ...(clip.frameDurationsMs === undefined
          ? {}
          : { frameDurationsMs: [...clip.frameDurationsMs] }),
      })),
      metadata: {
        ...entry.definition.metadata,
        tags: [...entry.definition.metadata.tags],
      },
      dependencyIds: [...entry.definition.dependencyIds],
    },
    ...(entry.registryIdentity === undefined
      ? {}
      : { registryIdentity: { ...entry.registryIdentity } }),
  };
}

function currentAssetSelectionSnapshot(): Draw2AssetSelectionSnapshot {
  const currentSelection = selection;
  if (currentSelection === undefined) {
    return {
      hasSelection: false,
      pixelCount: 0,
      kind: null,
      region: null,
      sourceCanvasId: null,
      layerId: null,
      frameId: null,
      frameNumber: null,
    };
  }
  const region = currentSelection.mask.regions[0] ?? null;
  const frame = state.frames.find((item) =>
    item.frameId === currentSelection.scope.frameId
  );
  return {
    hasSelection: region !== null,
    pixelCount: currentSelection.pixels.length,
    kind: currentSelection.mask.kind,
    region: region === null ? null : { ...region },
    sourceCanvasId: currentSelection.scope.assetId,
    layerId: currentSelection.scope.layerId,
    frameId: currentSelection.scope.frameId,
    frameNumber: frame === undefined ? null : frame.index + 1,
  };
}

function selectionProjectionFromImage(
  image: ImageData,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  selectedPixels = new Set(
    selection?.pixels.map((point) => selectionPointKey(point)) ?? [],
  ),
): Draw2AssetReferenceProjection {
  for (let index = 0; index < image.width * image.height; index += 1) {
    const point = {
      x: region.x + (index % image.width),
      y: region.y + Math.floor(index / image.width),
    };
    if (selectedPixels.has(selectionPointKey(point))) continue;
    const offset = index * 4;
    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 0;
  }
  return { width: image.width, height: image.height, data: image.data };
}

function captureAssetSelectionForFrame(
  frameId: string,
): Draw2AssetReferenceProjection | undefined {
  const current = currentAssetSelectionSnapshot();
  if (
    !current.hasSelection || current.region === null || current.pixelCount <= 0 ||
    !state.frames.some((frame) => frame.frameId === frameId)
  ) return undefined;
  try {
    return selectionProjectionFromImage(
      compositeRegion(current.region, frameId),
      current.region,
    );
  } catch {
    return undefined;
  }
}

function captureAssetSelectionForFrames(
  frameIds: readonly string[],
): readonly Draw2AssetReferenceProjection[] | undefined {
  const current = currentAssetSelectionSnapshot();
  const knownFrameIds = new Set(state.frames.map((frame) => frame.frameId));
  if (
    frameIds.length === 0 || !current.hasSelection || current.region === null ||
    current.pixelCount <= 0 || frameIds.some((frameId) =>
      !knownFrameIds.has(frameId)
    )
  ) return undefined;
  const selectedPixels = new Set(
    selection?.pixels.map((point) => selectionPointKey(point)) ?? [],
  );
  const projections: Draw2AssetReferenceProjection[] = [];
  try {
    for (const frameId of frameIds) {
      projections.push(
        selectionProjectionFromImage(
          compositeRegion(current.region, frameId),
          current.region,
          selectedPixels,
        ),
      );
    }
    return projections;
  } catch {
    return undefined;
  }
}

function notifyAssetStateChanged(): void {
  window.dispatchEvent(new Event(DRAW2_ASSET_STATE_CHANGED_EVENT));
}

function nextAssetDefinitionId(): string {
  const safeProjectId = state.projectId.replace(/[^A-Za-z0-9._-]+/gu, "-")
    .slice(0, 72);
  let candidate = "";
  do {
    assetDefinitionSequence += 1;
    candidate = `asset-${
      safeProjectId || "project"
    }-${assetDefinitionSequence}`;
  } while (assetDefinitions.some((entry) => entry.definitionId === candidate));
  return candidate;
}

function assetDefinitionMutation(
  definitionId: string,
  candidate: PxdAssetDefinitionEntry["definition"],
  options: {
    readonly persistence?: "LOCAL_DRAFT" | "VALIDATED_DEFINITION";
  } = {},
): Draw2AssetMutationResult {
  const current = assetDefinitions.find((entry) =>
    entry.definitionId === definitionId
  );
  if (current === undefined) {
    return { ok: false, message: "対象アセットが見つかりません。" };
  }
  const validation = validateAssetDefinitionDraft({
    ...candidate,
    persistence: "LOCAL_DRAFT",
  } as AssetDefinitionDraft);
  if (!validation.ok) return { ok: false, message: validation.message };
  const normalized: PxdAssetDefinitionEntry["definition"] = {
    ...validation.value,
    persistence: options.persistence ?? "LOCAL_DRAFT",
  };
  const nextEntry: PxdAssetDefinitionEntry = {
    definitionId,
    definition: normalized,
  };
  assetDefinitions = assetDefinitions.map((entry) =>
    entry.definitionId === definitionId ? nextEntry : entry
  );
  queueDrawPersistenceSave("asset-definition");
  notifyAssetStateChanged();
  return { ok: true, entry: cloneAssetDefinitionEntry(nextEntry) };
}

function createEmptyAssetDefinition(input: {
  readonly name: string;
  readonly assetKind: CreatorAssetKind;
  readonly pivot: AssetPivot;
}): Draw2AssetMutationResult {
  const activeFrame = state.frames.find((frame) =>
    frame.frameId === state.activeFrameId
  );
  if (activeFrame === undefined || state.activeLayerId.trim().length === 0) {
    return { ok: false, message: "現在のFrame／Layerを取得できません。" };
  }
  const draft = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: state.activeAssetId,
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: [state.activeLayerId],
    layerSelection: { kind: "CURRENT_LAYER", layerId: state.activeLayerId },
    frameStart: activeFrame.index + 1,
    frameEnd: activeFrame.index + 1,
    frameSelection: { kind: "CURRENT_FRAME", frameId: activeFrame.frameId },
    region: { kind: "FULL_CANVAS" },
    animationMapping: [],
    assetKind: input.assetKind,
    pivot: input.pivot,
    metadata: {
      name: input.name.trim() || `Asset ${assetDefinitions.length + 1}`,
    },
  });
  if (!draft.ok) return { ok: false, message: draft.message };
  const validated = validateAssetDefinitionDraft(draft.value);
  if (!validated.ok) return { ok: false, message: validated.message };
  const entry: PxdAssetDefinitionEntry = {
    definitionId: nextAssetDefinitionId(),
    definition: validated.value,
  };
  assetDefinitions = [...assetDefinitions, entry];
  queueDrawPersistenceSave("asset-definition-create");
  notifyAssetStateChanged();
  return { ok: true, entry: cloneAssetDefinitionEntry(entry) };
}

function createAssetAnimationClipFromInput(input: {
  readonly animationName?: AssetAnimationName;
  readonly customName?: string;
  readonly motionName?: string;
  readonly direction?: AssetDirectionName;
  readonly frameIds: readonly string[];
  readonly loopMode: AssetLoopMode;
  readonly fps?: number;
  readonly sourceReference?: string;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly sourceFrames?: readonly AssetAnimationFrameReference[];
  readonly frameDurationsMs?: readonly number[];
}): AssetAnimationClip {
  const name = input.animationName ?? "CUSTOM";
  const customName = input.customName?.trim() ||
    (name === "CUSTOM" ? input.motionName?.trim() : undefined);
  return {
    name,
    ...(customName === undefined ? {} : { customName }),
    ...(input.motionName?.trim() === undefined
      ? {}
      : { motionName: input.motionName.trim() }),
    ...(input.direction?.trim() === undefined
      ? {}
      : { direction: input.direction.trim() as AssetDirectionName }),
    frameIds: [...input.frameIds],
    loopMode: input.loopMode,
    ...(input.fps === undefined ? {} : { fps: input.fps }),
    ...(input.sourceReference?.trim() === undefined
      ? {}
      : { sourceReference: input.sourceReference.trim() }),
    ...(input.flipX === undefined ? {} : { flipX: input.flipX }),
    ...(input.flipY === undefined ? {} : { flipY: input.flipY }),
    ...(input.sourceFrames === undefined ? {} : {
      sourceFrames: input.sourceFrames.map((frame) => ({
        ...frame,
        layerIds: [...frame.layerIds],
        rect: { ...frame.rect },
        ...(frame.rasterSnapshot === undefined ? {} : {
          rasterSnapshot: {
            ...frame.rasterSnapshot,
            data: [...frame.rasterSnapshot.data],
          },
        }),
      })),
    }),
    ...(input.frameDurationsMs === undefined
      ? {}
      : { frameDurationsMs: [...input.frameDurationsMs] }),
  };
}

function addAssetDefinitionFromSelection(input: {
  readonly name: string;
  readonly assetKind: CreatorAssetKind;
  readonly pivot: AssetPivot;
  readonly animationName?: AssetAnimationName;
  readonly customName?: string;
  readonly motionName?: string;
  readonly direction?: AssetDirectionName;
  readonly sourceReference?: string;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly fps?: number;
  readonly sourceFrames?: readonly AssetAnimationFrameReference[];
  readonly frameDurationsMs?: readonly number[];
}): Draw2AssetMutationResult {
  const source = currentAssetSelectionSnapshot();
  if (
    !source.hasSelection || source.region === null ||
    source.sourceCanvasId === null || source.layerId === null ||
    source.frameId === null || source.frameNumber === null
  ) {
    return {
      ok: false,
      message: "Drawモードで範囲を選択してから追加してください。",
    };
  }
  const capturedProjection = captureCurrentAssetSelection();
  const visibleLayerIds = state.timeline.layerTrackOrder.flatMap((layerTrackId) => {
    const layer = state.layers.find((candidate) =>
      candidate.layerTrackId === layerTrackId
    );
    return layer !== undefined && layer.visible && layer.opacity > 0
      ? [layer.layerTrackId]
      : [];
  });
  const capturedRasterSnapshot = capturedProjection === undefined
    ? undefined
    : {
      width: capturedProjection.width,
      height: capturedProjection.height,
      data: Array.from(capturedProjection.data),
    } satisfies AssetAnimationFrameRasterSnapshot;
  const sourceFrames = input.sourceFrames ?? (capturedRasterSnapshot === undefined
    ? undefined
    : [{
      sourceFrameId: source.frameId,
      layerIds: visibleLayerIds.length > 0 ? visibleLayerIds : [source.layerId],
      rect: { ...source.region },
      rasterSnapshot: capturedRasterSnapshot,
    }]);
  const usesFixedComposite = sourceFrames?.some((frame) =>
    frame.rasterSnapshot !== undefined
  ) ?? false;
  if (sourceFrames === undefined) {
    return {
      ok: false,
      message: "表示中のフレームを画像として取得できません。範囲を選び直してください。",
    };
  }
  const mappedFrameIds = sourceFrames.map((frame) => frame.sourceFrameId);
  const frameNumberById = new Map(
    state.frames.map((frame) => [frame.frameId, frame.index + 1]),
  );
  const mappedFrameNumbers = mappedFrameIds.map((frameId) =>
    frameNumberById.get(frameId)
  );
  if (
    mappedFrameIds.length === 0 ||
    mappedFrameNumbers.length !== mappedFrameIds.length ||
    mappedFrameNumbers.some((frameNumber) => frameNumber === undefined)
  ) {
    return {
      ok: false,
      message: "アニメーション化するFrameが見つかりません。",
    };
  }
  const frameNumbers = mappedFrameNumbers.filter(
    (frameNumber): frameNumber is number => frameNumber !== undefined,
  );
  const mappedFrameStart = Math.min(...frameNumbers);
  const mappedFrameEnd = Math.max(...frameNumbers);
  const sourceLayerIds = usesFixedComposite
    ? (visibleLayerIds.length > 0 ? visibleLayerIds : [source.layerId])
    : [source.layerId];
  const initialAnimationName = input.animationName ?? "IDLE";
  const draft = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: source.sourceCanvasId,
    sourceKind: usesFixedComposite ? "VISIBLE_COMPOSITE" : "SELECTED_LAYERS",
    sourceLayerIds,
    layerSelection: usesFixedComposite
      ? { kind: "VISIBLE_LAYERS" }
      : { kind: "CURRENT_LAYER", layerId: source.layerId },
    frameStart: mappedFrameStart,
    frameEnd: mappedFrameEnd,
    frameSelection: mappedFrameIds.length === 1
      ? { kind: "CURRENT_FRAME", frameId: mappedFrameIds[0]! }
      : { kind: "EXPLICIT", frameIds: mappedFrameIds },
    region: { kind: "MANUAL", ...source.region },
    animationMapping: [createAssetAnimationClipFromInput({
      animationName: initialAnimationName,
      ...(input.customName === undefined
        ? {}
        : { customName: input.customName }),
      ...(input.motionName === undefined
        ? {}
        : { motionName: input.motionName }),
      ...(input.direction === undefined ? {} : { direction: input.direction }),
      frameIds: mappedFrameIds,
      loopMode: "LOOP",
      fps: input.fps ?? 12,
      ...(input.sourceReference === undefined
        ? {}
        : { sourceReference: input.sourceReference }),
      ...(input.flipX === undefined ? {} : { flipX: input.flipX }),
      ...(input.flipY === undefined ? {} : { flipY: input.flipY }),
      sourceFrames,
      ...(input.frameDurationsMs === undefined
        ? {}
        : { frameDurationsMs: input.frameDurationsMs }),
    })],
    assetKind: input.assetKind,
    pivot: input.pivot,
    ...(usesFixedComposite
      ? { protection: { locked: false, sourceReadOnly: true, referencePolicy: "PINNED" as const } }
      : {}),
    metadata: {
      name: input.name.trim() || `Asset ${assetDefinitions.length + 1}`,
    },
  });
  if (!draft.ok) return { ok: false, message: draft.message };
  const entry: PxdAssetDefinitionEntry = {
    definitionId: nextAssetDefinitionId(),
    definition: draft.value,
  };
  assetDefinitions = [...assetDefinitions, entry];
  queueDrawPersistenceSave("asset-definition-add");
  notifyAssetStateChanged();
  return { ok: true, entry: cloneAssetDefinitionEntry(entry) };
}

function prepareAssetSelection(): void {
  clearCommittedSelection("Asset slot ready; select a new canvas region.");
  selectionEditMode = "REPLACE";
  selectionModeControl.value = "REPLACE";
  selectShortcutTool("select-rect");
  canvas.focus({ preventScroll: true });
  setStatus("Asset slot ready · drag a rectangle on the canvas.");
}

function updateAssetDefinition(input: {
  readonly definitionId: string;
  readonly name?: string;
  readonly assetKind?: CreatorAssetKind;
  readonly pivot?: AssetPivot;
}): Draw2AssetMutationResult {
  const current = assetDefinitions.find((entry) =>
    entry.definitionId === input.definitionId
  );
  if (current === undefined) {
    return { ok: false, message: "対象アセットが見つかりません。" };
  }
  const pivot = input.pivot ?? current.definition.pivot;
  const pivotDefinition = input.pivot === undefined
    ? current.definition.pivotDefinition
    : pivot === "CUSTOM"
    ? { kind: "CUSTOM" as const, x: 0, y: 0 }
    : { kind: pivot };
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    assetKind: input.assetKind ?? current.definition.assetKind,
    pivot,
    pivotDefinition,
    metadata: input.name === undefined
      ? current.definition.metadata
      : { ...current.definition.metadata, name: input.name.trim() },
  }, { persistence: "VALIDATED_DEFINITION" });
}

function frameIdsForRange(
  start: number,
  end: number,
): readonly string[] {
  return state.frames
    .filter((frame) => frame.index + 1 >= start && frame.index + 1 <= end)
    .sort((left, right) => left.index - right.index)
    .map((frame) => frame.frameId);
}

function uniqueFrameIds(frameIds: readonly string[]): readonly string[] {
  const allowed = new Set(state.frames.map((frame) => frame.frameId));
  const order = new Map(
    state.frames.map((frame) => [frame.frameId, frame.index]),
  );
  return [...new Set(frameIds.filter((frameId) => allowed.has(frameId)))].sort(
    (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
  );
}

function assignAssetAnimation(input: {
  readonly definitionId: string;
  readonly animationName: AssetAnimationName;
  readonly customName?: string;
  readonly motionName?: string;
  readonly direction?: AssetDirectionName;
  readonly frameStart: number;
  readonly frameEnd: number;
  readonly loopMode: AssetLoopMode;
  readonly fps: number;
  readonly frameIds?: readonly string[];
  readonly sourceReference?: string;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly sourceFrames?: readonly AssetAnimationFrameReference[];
  readonly frameDurationsMs?: readonly number[];
}): Draw2AssetMutationResult {
  const current = assetDefinitions.find((entry) =>
    entry.definitionId === input.definitionId
  );
  if (current === undefined) {
    return { ok: false, message: "対象アセットが見つかりません。" };
  }
  const sourceClip = input.sourceReference === undefined
    ? undefined
    : current.definition.animationMapping.find((item) =>
      item.name === input.sourceReference ||
      assetAnimationClipKey(item) === input.sourceReference
    );
  if (input.sourceReference !== undefined && sourceClip === undefined) {
    return {
      ok: false,
      message: "参照元のMotion／Directionが見つかりません。",
    };
  }
  const start = Math.min(input.frameStart, input.frameEnd);
  const end = Math.max(input.frameStart, input.frameEnd);
  if (
    sourceClip === undefined && input.frameIds === undefined && (
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 ||
      end > state.frames.length
    )
  ) {
    return { ok: false, message: "フレーム範囲を確認してください。" };
  }
  const requestedFrameIds = input.frameIds === undefined
    ? sourceClip?.frameIds ?? frameIdsForRange(start, end)
    : [...input.frameIds];
  const allowedFrameIds = new Set(state.frames.map((frame) => frame.frameId));
  const sourceFrameReferences = input.sourceFrames ?? sourceClip?.sourceFrames;
  const frameIds = sourceFrameReferences === undefined
    ? [...new Set(requestedFrameIds)]
    : [...requestedFrameIds];
  if (
    (sourceFrameReferences === undefined &&
      frameIds.length !== requestedFrameIds.length) ||
    (sourceFrameReferences !== undefined &&
      sourceFrameReferences.length !== frameIds.length) ||
    frameIds.some((frameId) => !allowedFrameIds.has(frameId))
  ) {
    return { ok: false, message: "フレームの並びを確認してください。" };
  }
  if (frameIds.length === 0 || !Number.isFinite(input.fps) || input.fps <= 0) {
    return {
      ok: false,
      message: "アニメーション範囲またはFPSを確認してください。",
    };
  }
  const clip = createAssetAnimationClipFromInput({
    animationName: input.animationName,
    ...(input.customName === undefined ? {} : { customName: input.customName }),
    ...(input.motionName === undefined ? {} : { motionName: input.motionName }),
    ...(input.direction === undefined ? {} : { direction: input.direction }),
    frameIds,
    loopMode: input.loopMode,
    fps: input.fps,
    ...(input.sourceReference === undefined
      ? {}
      : { sourceReference: input.sourceReference }),
    ...(input.flipX === undefined ? {} : { flipX: input.flipX }),
    ...(input.flipY === undefined ? {} : { flipY: input.flipY }),
    ...(input.frameDurationsMs !== undefined
      ? { frameDurationsMs: input.frameDurationsMs }
      : sourceClip?.frameDurationsMs === undefined
      ? {}
      : { frameDurationsMs: sourceClip.frameDurationsMs }),
    ...(input.sourceFrames !== undefined
      ? { sourceFrames: input.sourceFrames }
      : sourceClip?.sourceFrames === undefined
      ? {}
      : { sourceFrames: sourceClip.sourceFrames }),
  });
  const clipKey = assetAnimationClipKey(clip);
  const animationMapping = [
    ...current.definition.animationMapping.filter((item) =>
      assetAnimationClipKey(item) !== clipKey
    ),
    clip,
  ];
  const sourceFrameIds = uniqueFrameIds(
    animationMapping.flatMap((item) => item.frameIds),
  );
  const sourceFrames = state.frames.filter((frame) =>
    sourceFrameIds.includes(frame.frameId)
  );
  const sourceFrameStart = Math.min(
    ...sourceFrames.map((frame) => frame.index + 1),
  );
  const sourceFrameEnd = Math.max(
    ...sourceFrames.map((frame) => frame.index + 1),
  );
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    frameStart: sourceFrameStart,
    frameEnd: sourceFrameEnd,
    frameSelection: sourceFrameIds.length === 1
      ? { kind: "CURRENT_FRAME", frameId: sourceFrameIds[0]! }
      : { kind: "EXPLICIT", frameIds: sourceFrameIds },
    animationMapping,
  });
}

function clearAssetAnimation(input: {
  readonly definitionId: string;
  readonly animationName: AssetAnimationName;
  readonly customName?: string;
  readonly motionName?: string;
  readonly direction?: AssetDirectionName;
}): Draw2AssetMutationResult {
  const current = assetDefinitions.find((entry) =>
    entry.definitionId === input.definitionId
  );
  if (current === undefined) {
    return { ok: false, message: "対象アセットが見つかりません。" };
  }
  const clipKey = assetAnimationClipKey({
    name: input.animationName,
    ...(input.customName === undefined ? {} : { customName: input.customName }),
    ...(input.motionName === undefined ? {} : { motionName: input.motionName }),
    ...(input.direction === undefined ? {} : { direction: input.direction }),
  });
  return assetDefinitionMutation(input.definitionId, {
    ...current.definition,
    animationMapping: current.definition.animationMapping.filter((item) =>
      assetAnimationClipKey(item) !== clipKey
    ),
  });
}

function getAssetBridgeSnapshot(): Draw2AssetBridgeSnapshot {
  return {
    projectId: state.projectId,
    selection: currentAssetSelectionSnapshot(),
    frameNumbers: Object.fromEntries(
      state.frames.map((frame) => [frame.frameId, frame.index + 1]),
    ),
    frameDurationsMs: Object.fromEntries(
      state.frames.map((frame) => [frame.frameId, frame.durationMs]),
    ),
    layers: state.timeline.layerTrackOrder.flatMap((layerTrackId) => {
      const layer = state.layers.find((candidate) => candidate.layerTrackId === layerTrackId);
      return layer === undefined ? [] : [{ layerTrackId, name: layer.name, visible: layer.visible }];
    }),
    assetDefinitions: assetDefinitions.map(cloneAssetDefinitionEntry),
    assetPackages: assetPackages.map(cloneAssetPackageManifest),
  };
}

function rasterProjectionFromSnapshot(
  snapshot: AssetAnimationFrameRasterSnapshot | undefined,
): Draw2AssetReferenceProjection | undefined {
  if (
    snapshot === undefined ||
    !Number.isSafeInteger(snapshot.width) || snapshot.width < 1 ||
    !Number.isSafeInteger(snapshot.height) || snapshot.height < 1 ||
    !Array.isArray(snapshot.data) ||
    snapshot.data.length !== snapshot.width * snapshot.height * 4 ||
    snapshot.data.some((value) =>
      !Number.isSafeInteger(value) || value < 0 || value > 255
    )
  ) return undefined;
  return {
    width: snapshot.width,
    height: snapshot.height,
    data: new Uint8ClampedArray(snapshot.data),
  };
}

function captureCurrentAssetSelection(): Draw2AssetReferenceProjection | undefined {
  const current = currentAssetSelectionSnapshot();
  if (
    !current.hasSelection || current.region === null || current.frameId === null ||
    current.pixelCount <= 0
  ) return undefined;
  return captureAssetSelectionForFrame(current.frameId);
}

function sameAssetReferenceRect(
  left: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  right: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return left.x === right.x && left.y === right.y &&
    left.width === right.width && left.height === right.height;
}

function sameAssetReferenceLayers(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  if (left === undefined) return true;
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function storedRasterSnapshotForReference(input: {
  readonly sourceFrameId: string;
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly layerIds?: readonly string[];
  readonly assetDefinitionId?: string;
}): AssetAnimationFrameRasterSnapshot | undefined {
  const definitions = input.assetDefinitionId === undefined
    ? []
    : assetDefinitions.filter((entry) =>
      entry.definitionId === input.assetDefinitionId
    );
  for (const entry of [...definitions].reverse()) {
    for (const clip of [...entry.definition.animationMapping].reverse()) {
      for (const frame of [...(clip.sourceFrames ?? [])].reverse()) {
        if (
          frame.sourceFrameId === input.sourceFrameId &&
          frame.rasterSnapshot !== undefined &&
          sameAssetReferenceRect(frame.rect, input.rect) &&
          sameAssetReferenceLayers(input.layerIds, frame.layerIds)
        ) return frame.rasterSnapshot;
      }
    }
  }
  return undefined;
}

function renderAssetReference(input: {
  readonly sourceFrameId: string;
  readonly layerIds?: readonly string[];
  readonly assetDefinitionId?: string;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rasterSnapshot?: AssetAnimationFrameRasterSnapshot;
}): Draw2AssetReferenceProjection | undefined {
  const fixedSnapshot = input.rasterSnapshot ??
    (input.assetDefinitionId === undefined
      ? undefined
      : storedRasterSnapshotForReference(input));
  const fixedProjection = rasterProjectionFromSnapshot(fixedSnapshot);
  if (fixedProjection !== undefined) return fixedProjection;
  const marketRasterId = marketSourceRasterIdForFrame(input.sourceFrameId);
  if (marketRasterId !== undefined) {
    const asset = state.assets[marketRasterId];
    if (asset === undefined) return undefined;
    const { x, y, width, height } = input.rect;
    if (
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || x < 0 || y < 0 ||
      x + width > asset.width || y + height > asset.height
    ) return undefined;
    try {
      const indexed = asset.raster.readRegion(x, y, width, height).pixels;
      const image = canonicalContext.createImageData(width, height);
      for (let index = 0; index < indexed.length; index += 1) {
        const color = decodeArgb(
          paletteColorForRender(asset, indexed[index] ?? 0),
        );
        const offset = index * 4;
        image.data[offset] = color.red;
        image.data[offset + 1] = color.green;
        image.data[offset + 2] = color.blue;
        image.data[offset + 3] = color.alpha;
      }
      return { width: image.width, height: image.height, data: image.data };
    } catch {
      return undefined;
    }
  }
  if (!state.frames.some((frame) => frame.frameId === input.sourceFrameId)) {
    return undefined;
  }
  const image = compositeRegion(input.rect, input.sourceFrameId, undefined, input.layerIds);
  return {
    width: image.width,
    height: image.height,
    data: image.data,
  };
}

async function resolveCurrentDrawReference(input: {
  readonly mode: "LIVE" | "PINNED";
}): Promise<Draw2AssetReferenceRecord | undefined> {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return undefined;
  const revisionId = `draw-revision-${asset.revision}`;
  const contentHash = String(
    await hashCanonical({
      id: asset.id,
      width: asset.width,
      height: asset.height,
      palette: asset.palette,
      pixels: asset.raster.toUint8Array(),
    }),
  );
  return {
    kind: "DRAW",
    assetId: asset.id,
    revisionId,
    contentHash,
    mode: input.mode,
    label: asset.id,
    projectId: state.projectId,
    referenceScope: "LOCAL_PROJECT",
  };
}

async function resolveDrawDefinitionReference(input: {
  readonly definitionId: string;
  readonly mode: "LIVE" | "PINNED";
}): Promise<Draw2AssetReferenceRecord | undefined> {
  const entry = assetDefinitions.find((candidate) =>
    candidate.definitionId === input.definitionId
  );
  if (
    entry === undefined || entry.definition.sourceProjectId !== state.projectId
  ) {
    return undefined;
  }
  const hasFixedSnapshot = entry.definition.animationMapping.some((clip) =>
    clip.sourceFrames?.some((frame) => frame.rasterSnapshot !== undefined) === true
  );
  const sourceAsset = state.assets[entry.definition.sourceCanvasId];
  if (sourceAsset === undefined && !hasFixedSnapshot) return undefined;
  const assetId = entry.registryIdentity?.assetId ?? sourceAsset?.id ??
    `draw-definition-${entry.definitionId}`;
  const revisionId = entry.registryIdentity?.revisionId ??
    (hasFixedSnapshot
      ? `draw-definition-${entry.definitionId}-snapshot`
      : `draw-revision-${sourceAsset!.revision}`);
  const contentHash = String(
    await hashCanonical(hasFixedSnapshot
      ? {
        definitionId: entry.definitionId,
        definition: entry.definition,
      }
      : {
        definitionId: entry.definitionId,
        definition: entry.definition,
        source: {
          id: sourceAsset!.id,
          width: sourceAsset!.width,
          height: sourceAsset!.height,
          palette: sourceAsset!.palette,
          pixels: sourceAsset!.raster.toUint8Array(),
        },
      }),
  );
  return {
    kind: "DRAW",
    assetId,
    revisionId,
    contentHash,
    mode: hasFixedSnapshot ? "PINNED" : input.mode,
    label: entry.definition.metadata.name || entry.definitionId,
    assetDefinitionId: entry.definitionId,
    projectId: state.projectId,
    referenceScope: entry.registryIdentity === undefined
      ? "LOCAL_PROJECT"
      : "REGISTERED",
  };
}

const draw2AssetBridge: Draw2AssetBridge = {
  snapshot: getAssetBridgeSnapshot,
  resolveCurrentReference: resolveCurrentDrawReference,
  resolveDefinitionReference: resolveDrawDefinitionReference,
  renderReference: renderAssetReference,
  captureSelection: captureCurrentAssetSelection,
  captureSelectionForFrame: captureAssetSelectionForFrame,
  captureSelectionForFrames: captureAssetSelectionForFrames,
  prepareSelection: prepareAssetSelection,
  createDefinition: createEmptyAssetDefinition,
  addFromSelection: addAssetDefinitionFromSelection,
  updateDefinition: updateAssetDefinition,
  assignAnimation: assignAssetAnimation,
  clearAnimation: clearAssetAnimation,
  removeDefinition: (definitionId) => {
    const exists = assetDefinitions.some((entry) =>
      entry.definitionId === definitionId
    );
    if (!exists) return false;
    assetDefinitions = assetDefinitions.filter((entry) =>
      entry.definitionId !== definitionId
    );
    queueDrawPersistenceSave("asset-definition-remove");
    notifyAssetStateChanged();
    return true;
  },
  saveAssetPackage: async (
    manifest,
  ): Promise<Draw2AssetPackageMutationResult> => {
    const verified = await verifyAssetPackageManifest(manifest);
    if (!verified.ok) {
      return { ok: false, message: `Asset Packageを保存できません: ${verified.reasons.join("; ")}` };
    }
    const next = cloneAssetPackageManifest(manifest);
    const replacedSourceKeys = new Set(
      next.entries.map((entry) => `${entry.kind}:${entry.source.sourceId}`),
    );
    assetPackages = [
      ...assetPackages.filter((candidate) =>
        candidate.packageId !== next.packageId &&
        !candidate.entries.some((entry) =>
          replacedSourceKeys.has(`${entry.kind}:${entry.source.sourceId}`)
        )
      ),
      next,
    ];
    queueDrawPersistenceSave("asset-package-save");
    notifyAssetStateChanged();
    return { ok: true, manifest: next };
  },
  handoffDefinitionToMarket: handoffAssetDefinitionToMarket,
};
(window as Window & { __pixiedraw2AssetBridge?: Draw2AssetBridge })
  .__pixiedraw2AssetBridge = draw2AssetBridge;

let pendingSelectionGesture: {
  readonly pointerId: number;
  readonly tool: BasicTool;
  readonly mode: SelectionEditMode;
  readonly colorSelectionMode?: ColorSelectionMode;
  readonly points: Array<{ x: number; y: number }>;
  readonly grid?: {
    readonly size: 16;
    readonly anchor: { readonly x: number; readonly y: number };
  };
} | undefined;
const SELECTION_GRID_SIZE = 16;
const SELECTION_DOUBLE_CLICK_WINDOW_MS = 420;
let lastSelectionClick: {
  readonly timeMs: number;
  readonly point: { readonly x: number; readonly y: number };
} | undefined;
let transformSession: TransformSession | undefined;
let transformPreview: TransformPreview | undefined;
/** Prevents duplicate commits and competing edits during the async commit path. */
let transformCommitInFlight = false;
type SelectionFrameHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotate";
let selectionFrameDrag: {
  pointerId: number;
  handle: SelectionFrameHandle;
  startCanvasPoint: { x: number; y: number };
  sourceBounds: SelectionOverlayRegion;
  lastPointerAngle: number;
  accumulatedAngle: number;
  lastTransformKey: string;
} | undefined;
let selectionDrag: {
  pointerId: number;
  start: { x: number; y: number };
  lastDelta: { x: number; y: number };
  duplicate: boolean;
} | undefined;
let pasteMode = false;
let clipboard: ClipboardPayload | undefined;
let timelineSession: TimelineSessionState = createTimelineSession(state);
let timelineActivationPending = false;
let timelineStateGeneration = 0;
let timelineActivationRequestSequence = 0;
let latestTimelineActivationRequestId = 0;
let timelineViewportInitialized = false;
type TimelineTab = "timeline" | "tags" | "assets" | "markers" | "audio";
let activeTimelineTab: TimelineTab = "timeline";
let timelineFrameElapsedById = new Map<string, number>();
const TIMELINE_PROPERTIES_STORAGE_KEY = "pixieed:draw2:timeline-properties:v1";
const isTimelineTab = (value: unknown): value is TimelineTab =>
  value === "timeline" || value === "tags" || value === "assets" ||
  value === "markers" || value === "audio";
const readTimelinePropertiesPreference = (): {
  width: number;
  collapsed: boolean;
  activeTab: TimelineTab;
} => {
  try {
    const raw = window.localStorage.getItem(TIMELINE_PROPERTIES_STORAGE_KEY);
    if (raw === null) {
      return { width: 240, collapsed: false, activeTab: "timeline" };
    }
    const parsed = JSON.parse(raw) as {
      width?: unknown;
      collapsed?: unknown;
      activeTab?: unknown;
    };
    return {
      width: typeof parsed.width === "number" && Number.isFinite(parsed.width)
        ? Math.max(200, Math.min(320, parsed.width))
        : 240,
      collapsed: parsed.collapsed === true,
      activeTab: isTimelineTab(parsed.activeTab)
        ? parsed.activeTab
        : "timeline",
    };
  } catch {
    return { width: 240, collapsed: false, activeTab: "timeline" };
  }
};
const initialTimelinePropertiesPreference = readTimelinePropertiesPreference();
let timelinePropertiesWidth = initialTimelinePropertiesPreference.width;
let timelinePropertiesCollapsed = initialTimelinePropertiesPreference.collapsed;
activeTimelineTab = initialTimelinePropertiesPreference.activeTab;
const timelineSelectedCells = new Set<string>();

// Bind the small, high-frequency tag actions next to the timeline state. The
// rest of the editor boot sequence also prepares export and preview surfaces;
// those optional surfaces must never be able to leave the core tag action
// without a click handler.
tagAddControl.addEventListener("click", addAnimationTagFromControls);
tagFromSelectionControl?.addEventListener("click", addAnimationTagFromSelection);
document.addEventListener("keydown", (event) => {
  if (
    !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey ||
    event.key.toLocaleLowerCase() !== "t" ||
    tagFromSelectionControl?.disabled !== false
  ) return;
  const creatorMode = workspaceFrameElement?.dataset.creatorMode;
  if (
    creatorMode !== undefined && creatorMode !== "DRAW" &&
    creatorMode !== "ANIMATE"
  ) return;
  if (
    event.defaultPrevented || event.isComposing ||
    isInteractiveKeyboardTarget(event.target)
  ) return;
  event.preventDefault();
  event.stopPropagation();
  addAnimationTagFromSelection();
});
window.addEventListener(DRAW2_ASSET_STATE_CHANGED_EVENT, () => {
  renderCreatorTimelineMetadata();
});

let timelineSelectionAnchor:
  | { frameIndex: number; layerIndex: number }
  | undefined;
let timelineScrollRenderFrame: number | undefined;
let lastRenderedTimelineScrollTop = Number.NaN;
let lastRenderedTimelineScrollLeft = Number.NaN;
let timelineContextTarget: {
  readonly frameId: string;
  readonly layerTrackId: string;
  readonly celId: string;
} | undefined;
let structureClientSequence = 0;
let onionSkinEnabled = false;
let onionSkinPreviousFrames = 1;
let onionSkinNextFrames = 1;
let onionSkinOpacity = 0.5;
type OnionSkinColorMode = "TINTED" | "ORIGINAL";
let onionSkinColorMode: OnionSkinColorMode = "TINTED";
let onionSkinCache: {
  readonly state: ProjectState;
  readonly frames: Map<string, ImageData>;
} | undefined;
let runtimePreviewSession: RuntimePreviewSession | undefined;
let game350ProductSession: Game350ProductSession | undefined;
let game351PlayableState: Game351PlayableState | undefined;
let gameGenrePlayableState: GameGenreRuntimeState | undefined;
let gameGenreAnimationFrame: number | undefined;
let gameGenreHeldInput: GameGenreRuntimeInput = {};
let game351Behaviors: readonly BehaviorIR[] = [];
let game351InputSequence = 0;
let game351PreviewMode: "LIVE" | "PINNED" = "LIVE";
let gameGenrePreviewMode: "LIVE" | "PINNED" = "LIVE";
let game351CameraPosition: Camera2DPoint | undefined;
let game351CameraShakeStartedAt = -1;
let game351CameraShakeSeed = 0;
let runtimePreviewModule: RuntimeModule | undefined;
let toolOptions: ToolOptions = {
  brushSize: 1,
  brushShape: "square",
  brushAngle: 0,
  brushAlgorithm: "regular",
  pattern: "solid",
  similarity: 0,
  selectionMode: "similar",
};
let hoverPoint: { x: number; y: number } | undefined;
let playbackAnimationFrame: number | undefined;
let playbackGeneration = 0;
let playbackStartedAt = 0;
let playbackRunning = false;
let playbackRate = 1;
let playbackFrameId: string | undefined;
let playbackStartFrameId: string | undefined;
let playbackOriginSession: TimelineSessionState | undefined;
let colorDraft: RgbColor | undefined;
let colorDraftAlpha = 255;
let colorDraftDirty = false;
let colorCommitInFlight = false;
let colorHistory: number[] = [];
let pendingPaletteAppendDraft: PaletteAppendDraft | undefined;
let palettePointerActive = false;
let paletteAppendInFlight = false;
let paletteClickSuppressed = false;
let paletteDrag: PaletteDragState | undefined;
let colorPreviewFrame: number | undefined;
type TextPreviewWrite = {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
};
type TextPreviewDraft = {
  readonly writes: readonly TextPreviewWrite[];
  readonly naturalWidth: number;
  readonly naturalHeight: number;
};
let pendingTextBounds: RasterClipRect | undefined;
let pendingTextDraft: TextPreviewDraft | undefined;
let pendingTextTarget:
  | { readonly assetId: string; readonly celId: string; readonly structureEpoch: number }
  | undefined;
type MirrorMode = "NONE" | "ON";
let mirrorMode: MirrorMode = "NONE";
let mirrorEnabled = false;
let mirrorAxes = {
  x: false,
  y: false,
  diagonalDown: false,
  diagonalUp: false,
};
let canvasResizeAnchor: CanvasResizeAnchor = "CENTER";
type MirrorGuideAxis = "x" | "y" | "diagonal-down" | "diagonal-up";
let mirrorGuide = {
  x: mirrorGuideCenter(canvas.width),
  y: mirrorGuideCenter(canvas.height),
  diagonalDown: 0,
  diagonalUp: 0,
};
type MirrorGuideDragState = {
  pointerId: number;
  axis: MirrorGuideAxis;
  moved: boolean;
  start: { x: number; y: number };
  handle: HTMLButtonElement | undefined;
};
let mirrorGuideDrag: MirrorGuideDragState | undefined;
let mirrorGuideClickSuppressed = false;
const MIRROR_GUIDE_DRAG_THRESHOLD_PX = 6;

function clearMirrorGuideDragVisualState(
  drag: MirrorGuideDragState,
): void {
  drag.handle?.classList.remove("is-dragging");
  viewportWrapElement?.classList.remove("is-mirror-guide-dragging");
}

function finishMirrorGuideDrag(event: PointerEvent): void {
  const drag = mirrorGuideDrag;
  if (drag?.pointerId !== event.pointerId) return;
  mirrorGuideDrag = undefined;
  mirrorGuideClickSuppressed = drag.moved;
  clearMirrorGuideDragVisualState(drag);
  if (viewportWrapElement?.hasPointerCapture(event.pointerId)) {
    viewportWrapElement.releasePointerCapture(event.pointerId);
  }
  if (drag.moved) scheduleDraw2EditorPreferencesSave();
  drawOverlay();
}

function updateMirrorGuideDragFromPointer(event: PointerEvent): void {
  const drag = mirrorGuideDrag;
  if (drag?.pointerId !== event.pointerId) return;
  if (!drag.moved) {
    const distance = Math.hypot(
      event.clientX - drag.start.x,
      event.clientY - drag.start.y,
    );
    if (distance < MIRROR_GUIDE_DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    viewportWrapElement?.setPointerCapture(event.pointerId);
    viewportWrapElement?.classList.add("is-mirror-guide-dragging");
    drag.handle?.classList.add("is-dragging");
  }
  moveMirrorGuideFromClient(drag.axis, event.clientX, event.clientY);
  scheduleDraw2EditorPreferencesSave();
  if (event.cancelable) event.preventDefault();
}

function syncClientSequencesFromState(): void {
  clientSequence = state.lastClientSequenceByClient[DRAW_CLIENT_ID] ?? 0;
  selectionClientSequence =
    state.lastClientSequenceByClient[SELECTION_CLIENT_ID] ?? 0;
  structureClientSequence =
    state.lastClientSequenceByClient[TIMELINE_CLIENT_ID] ?? 0;
}

function nextClientSequence(clientId: string): number {
  const next = (state.lastClientSequenceByClient[clientId] ?? 0) + 1;
  if (clientId === DRAW_CLIENT_ID) clientSequence = next;
  else if (clientId === SELECTION_CLIENT_ID) selectionClientSequence = next;
  else if (clientId === TIMELINE_CLIENT_ID) structureClientSequence = next;
  return next;
}

function setGamePreviewStatus(
  message: string,
  kind: "ready" | "error" = "ready",
): void {
  gamePreviewStatus.textContent = translateDraw2Text(message, draw2Locale);
  gamePreviewStatus.dataset.state = kind;
  const normalized = message.toLocaleUpperCase();
  document.documentElement.dataset.gamePreviewState = kind === "error"
    ? "error"
    : normalized.includes("READY")
    ? "ready"
    : normalized.includes("STOPPED")
    ? "stopped"
    : "idle";
  window.dispatchEvent(
    new CustomEvent("draw2:game-preview-state", {
      detail: {
        state: document.documentElement.dataset.gamePreviewState,
      },
    }),
  );
}

async function buildLocalDraw2GameProject(
  mode: "LIVE" | "PINNED",
): Promise<
  {
    project: GameProjectRevision;
    authority: readonly CanonicalAssetRevision[];
    asset: RasterAsset;
  }
> {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    throw new Error("Active Draw2 Asset is unavailable.");
  }
  const revision = `draw-revision-${asset.revision}`;
  const contentHash = asRuntimeHash(
    await hashCanonical({
      id: asset.id,
      width: asset.width,
      height: asset.height,
      palette: asset.palette,
      pixels: asset.raster.toUint8Array(),
    }),
  );
  const assetId = asAssetId(asset.id);
  const assetRevisionId = asAssetRevisionId(revision);
  const dependencies = await createGameDependencySnapshot(
    "draw2-local-game-package",
    "0.1.0",
    [{
      assetId,
      revisionId: assetRevisionId,
      contentHash,
      byteLength: asset.width * asset.height,
      mimeType: "application/x-pixieed-indexed-raster",
      mode,
      required: true,
    }],
  );
  const ownerId = "draw2-local-owner";
  const project = await createGameProjectRevision({
    schemaVersion: 1,
    projectId: state.projectId as GameProjectRevision["projectId"],
    revisionId: `draw2-project-revision-${state.structureEpoch}`,
    packageId: "draw2-local-game-package" as GameProjectRevision["packageId"],
    packageVersion: "0.1.0",
    name: "Draw2 Local Runtime Preview",
    scenes: [{
      sceneId: "draw2-local-scene",
      name: "Draw2 active asset",
      rootEntityIds: ["draw2-local-entity"],
      entities: [{
        entityId: "draw2-local-entity",
        name: asset.id,
        components: [{
          type: "SPRITE",
          componentId: "draw2-local-sprite",
          asset: {
            kind: "DRAW",
            assetId,
            revisionId: assetRevisionId,
            contentHash,
            byteLength: asset.width * asset.height,
            mimeType: "application/x-pixieed-indexed-raster",
            mode,
            provenance: "DRAW2",
          },
          visible: true,
        }],
      }],
    }],
    inputMap: { actions: [] },
    behaviors: [],
    dependencies,
    buildProfile: {
      target: "PIXIEED_NATIVE_WEB_RUNTIME",
      runtimeVersion: "0.1.0",
      capabilityProfile: "browser",
      optimization: "DEBUG",
    },
  });
  return {
    project,
    asset,
    authority: [{
      projectId: state.projectId,
      ownerId,
      kind: "DRAW",
      assetId: asset.id,
      revisionId: revision,
      contentHash: asGameHash(String(contentHash)),
      licenseId: "draw2-local-preview",
      permission: "READ",
      reviewStatus: "APPROVED",
    }],
  };
}

function drawGamePreview(
  session: RuntimePreviewSession,
  asset: RasterAsset,
): void {
  gamePreviewContext.clearRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  gamePreviewContext.fillStyle = "#101b2d";
  gamePreviewContext.fillRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  const image = gamePreviewContext.createImageData(asset.width, asset.height);
  const pixels = asset.raster.toUint8Array();
  for (let index = 0; index < pixels.length; index += 1) {
    const color = decodeArgb(asset.palette[pixels[index] ?? 0] ?? 0);
    image.data[index * 4] = color.red;
    image.data[index * 4 + 1] = color.green;
    image.data[index * 4 + 2] = color.blue;
    image.data[index * 4 + 3] = color.alpha;
  }
  gamePreviewContext.putImageData(image, 0, 0);
}

function drawGame351Preview(
  state: Game351PlayableState,
  mode: "LIVE" | "PINNED",
): void {
  const { snapshot, runtime } = state;
  const worldWidth = Math.max(
    1,
    snapshot.collisionBounds.maxX - snapshot.collisionBounds.minX + 1,
  );
  const worldHeight = Math.max(
    1,
    snapshot.collisionBounds.maxY - snapshot.collisionBounds.minY + 1,
  );
  const viewport = cameraViewportSize(snapshot.camera2D);
  const cameraOrigin = resolveCameraViewportOrigin(
    game351CameraPosition === undefined
      ? {
        targetPosition: runtime.playerPosition,
        world: { width: worldWidth, height: worldHeight },
        settings: snapshot.camera2D,
        deltaSeconds: 1 / 60,
      }
      : {
        targetPosition: runtime.playerPosition,
        currentPosition: game351CameraPosition,
        world: { width: worldWidth, height: worldHeight },
        settings: snapshot.camera2D,
        deltaSeconds: 1 / 60,
      },
  );
  game351CameraPosition = {
    x: cameraOrigin.x + viewport.width / 2,
    y: cameraOrigin.y + viewport.height / 2,
  };
  const shakeElapsed = game351CameraShakeStartedAt < 0
    ? -1
    : performance.now() - game351CameraShakeStartedAt;
  const shake = cameraShakeOffset(
    snapshot.camera2D,
    shakeElapsed,
    game351CameraShakeSeed,
  );
  const cameraX = cameraOrigin.x + shake.x;
  const cameraY = cameraOrigin.y + shake.y;
  const cellWidth = gamePreviewCanvas.width / viewport.width;
  const cellHeight = gamePreviewCanvas.height / viewport.height;
  const worldToCanvasX = (value: number): number =>
    (value - cameraX) * cellWidth;
  const worldToCanvasY = (value: number): number =>
    (value - cameraY) * cellHeight;
  gamePreviewContext.clearRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  gamePreviewContext.fillStyle = "#10233b";
  gamePreviewContext.fillRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  gamePreviewContext.fillStyle = "#2d6b52";
  gamePreviewContext.fillRect(
    worldToCanvasX(0),
    worldToCanvasY(0),
    worldWidth * cellWidth,
    worldHeight * cellHeight,
  );
  for (const solid of snapshot.solidCells) {
    gamePreviewContext.fillStyle = solid.x === 0 || solid.y === 0 ||
        solid.x === snapshot.collisionBounds.maxX ||
        solid.y === snapshot.collisionBounds.maxY
      ? "#25334a"
      : "#7f4a4a";
    gamePreviewContext.fillRect(
      worldToCanvasX(solid.x),
      worldToCanvasY(solid.y),
      cellWidth,
      cellHeight,
    );
  }
  gamePreviewContext.strokeStyle = "rgba(220, 237, 255, 0.22)";
  gamePreviewContext.lineWidth = 1;
  for (let x = Math.floor(cameraX); x <= Math.ceil(cameraX + viewport.width); x += 1) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(worldToCanvasX(x) + 0.5, 0);
    gamePreviewContext.lineTo(worldToCanvasX(x) + 0.5, gamePreviewCanvas.height);
    gamePreviewContext.stroke();
  }
  for (let y = Math.floor(cameraY); y <= Math.ceil(cameraY + viewport.height); y += 1) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(0, worldToCanvasY(y) + 0.5);
    gamePreviewContext.lineTo(gamePreviewCanvas.width, worldToCanvasY(y) + 0.5);
    gamePreviewContext.stroke();
  }
  gamePreviewContext.strokeStyle = "#b8e5ff";
  gamePreviewContext.lineWidth = 1;
  gamePreviewContext.strokeRect(
    0.5,
    0.5,
    gamePreviewCanvas.width - 1,
    gamePreviewCanvas.height - 1,
  );
  gamePreviewContext.fillStyle = "#f5a04f";
  gamePreviewContext.fillRect(
    worldToCanvasX(runtime.npcPosition.x) + 3,
    worldToCanvasY(runtime.npcPosition.y) + 3,
    Math.max(4, cellWidth - 6),
    Math.max(4, cellHeight - 6),
  );
  gamePreviewContext.fillStyle = runtime.mode === "PLAYING"
    ? "#6bd4ff"
    : "#7b8fa5";
  gamePreviewContext.fillRect(
    worldToCanvasX(runtime.playerPosition.x) + 3,
    worldToCanvasY(runtime.playerPosition.y) + 2,
    Math.max(4, cellWidth - 6),
    Math.max(4, cellHeight - 4),
  );
  if (runtime.dialogue !== null) {
    gamePreviewContext.fillStyle = "rgba(8, 14, 25, 0.92)";
    gamePreviewContext.fillRect(4, gamePreviewCanvas.height - 25, 152, 21);
    gamePreviewContext.strokeStyle = "#f5d18b";
    gamePreviewContext.strokeRect(
      4.5,
      gamePreviewCanvas.height - 24.5,
      151,
      20,
    );
    gamePreviewContext.fillStyle = "#fff2cc";
    gamePreviewContext.font = "7px sans-serif";
    gamePreviewContext.fillText(
      runtime.dialogue.slice(0, 38),
      8,
      gamePreviewCanvas.height - 11,
    );
  }
  delete gamePreviewCanvas.dataset.game351Error;
  gamePreviewCanvas.dataset.game351Mode = runtime.mode;
  gamePreviewCanvas.dataset.game351Player =
    `${runtime.playerPosition.x},${runtime.playerPosition.y}`;
  gamePreviewCanvas.dataset.game351Tick = String(runtime.tick);
  gamePreviewCanvas.dataset.game351Dialogue = runtime.dialogue ?? "";
  gamePreviewCanvas.dataset.game351Camera = `${cameraX},${cameraY}`;
  setGamePreviewStatus(
    `Runtime ${
      runtime.mode === "PLAYING" ? "READY" : "STOPPED"
    } · GAME-351 RPG · ${mode} · tick=${runtime.tick} · Player ${runtime.playerPosition.x},${runtime.playerPosition.y} · Camera ${
      snapshot.camera2D.pixelPerfect ? "Pixel-perfect" : "Free"
    } · ${snapshot.camera2D.follow.enabled ? "Follow" : "Fixed"}${
      runtime.dialogue === null ? "" : " · dialogue"
    }`,
  );
}

function gameGenreRuntimeLabel(
  family: GameGenreRuntimeState["runtimeFamily"],
): string {
  return family === "ACTION_PLATFORM"
    ? "2Dアクション"
    : family === "DODGE_ARENA"
    ? "敵よけアリーナ"
    : "2Dスクロール";
}

function cancelGameGenrePreviewLoop(): void {
  if (gameGenreAnimationFrame !== undefined) {
    window.cancelAnimationFrame(gameGenreAnimationFrame);
    gameGenreAnimationFrame = undefined;
  }
  gameGenreHeldInput = {};
}

function runGameGenrePreviewLoop(): void {
  gameGenreAnimationFrame = undefined;
  const current = gameGenrePlayableState;
  if (
    current === undefined || current.runtimeFamily !== "DODGE_ARENA" ||
    current.mode !== "PLAYING" || current.gameOver || current.sceneComplete
  ) return;
  gameGenrePlayableState = stepGameGenre(current, gameGenreHeldInput);
  drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
  const next = gameGenrePlayableState;
  if (
    next !== undefined && next.mode === "PLAYING" && !next.gameOver &&
    !next.sceneComplete
  ) {
    gameGenreAnimationFrame = window.requestAnimationFrame(
      runGameGenrePreviewLoop,
    );
  }
}

function startGameGenrePreviewLoop(): void {
  if (
    gameGenrePlayableState?.runtimeFamily !== "DODGE_ARENA" ||
    gameGenrePlayableState.mode !== "PLAYING" ||
    gameGenrePlayableState.gameOver || gameGenrePlayableState.sceneComplete
  ) return;
  if (gameGenreAnimationFrame === undefined) {
    gameGenreAnimationFrame = window.requestAnimationFrame(
      runGameGenrePreviewLoop,
    );
  }
}

function drawGameGenrePreview(
  state: GameGenreRuntimeState,
  mode: "LIVE" | "PINNED",
): void {
  const viewport = cameraViewportSize(state.camera2D);
  const cellWidth = gamePreviewCanvas.width / Math.max(1, viewport.width);
  const cellHeight = gamePreviewCanvas.height / Math.max(1, viewport.height);
  const shakeElapsed = state.cameraShakeFrames > 0
    ? (8 - state.cameraShakeFrames) *
      (state.camera2D.shake.durationMs / 8)
    : -1;
  const shake = cameraShakeOffset(
    state.camera2D,
    shakeElapsed,
    state.tick,
  );
  const cameraX = state.cameraOrigin.x + shake.x;
  const cameraY = state.cameraOrigin.y + shake.y;
  const worldToCanvasX = (value: number): number =>
    (value - cameraX) * cellWidth;
  const worldToCanvasY = (value: number): number =>
    (value - cameraY) * cellHeight;
  gamePreviewContext.clearRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  gamePreviewContext.fillStyle = "#10233b";
  gamePreviewContext.fillRect(
    0,
    0,
    gamePreviewCanvas.width,
    gamePreviewCanvas.height,
  );
  for (const cell of state.world.solidCells) {
    gamePreviewContext.fillStyle = cell.y >= state.world.height - 1
      ? "#315c52"
      : "#49627d";
    gamePreviewContext.fillRect(
      worldToCanvasX(cell.x),
      worldToCanvasY(cell.y),
      Math.ceil(cellWidth) + 1,
      Math.ceil(cellHeight) + 1,
    );
  }
  gamePreviewContext.strokeStyle = "rgba(220, 237, 255, 0.18)";
  gamePreviewContext.lineWidth = 1;
  for (
    let x = Math.floor(cameraX);
    x <= Math.ceil(cameraX + viewport.width);
    x += 1
  ) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(worldToCanvasX(x) + 0.5, 0);
    gamePreviewContext.lineTo(
      worldToCanvasX(x) + 0.5,
      gamePreviewCanvas.height,
    );
    gamePreviewContext.stroke();
  }
  for (
    let y = Math.floor(cameraY);
    y <= Math.ceil(cameraY + viewport.height);
    y += 1
  ) {
    gamePreviewContext.beginPath();
    gamePreviewContext.moveTo(0, worldToCanvasY(y) + 0.5);
    gamePreviewContext.lineTo(
      gamePreviewCanvas.width,
      worldToCanvasY(y) + 0.5,
    );
    gamePreviewContext.stroke();
  }
  for (const object of state.objects) {
    const isGoal = object.role === "TRIGGER" &&
      (object.id.toLowerCase().includes("goal") ||
        object.label.toLowerCase().includes("goal") ||
        object.label.includes("ゴール"));
    const isNpc = object.role === "NPC";
    if (!isGoal && !isNpc) continue;
    gamePreviewContext.fillStyle = isGoal ? "#f5d36c" : "#f07878";
    gamePreviewContext.fillRect(
      worldToCanvasX(object.position.x) + 2,
      worldToCanvasY(object.position.y) + 2,
      Math.max(5, cellWidth - 4),
      Math.max(5, cellHeight - 4),
    );
  }
  gamePreviewContext.fillStyle = state.mode === "PLAYING"
    ? "#6bd4ff"
    : "#7b8fa5";
  gamePreviewContext.fillRect(
    worldToCanvasX(state.playerPosition.x) + 2,
    worldToCanvasY(state.playerPosition.y) + 2,
    Math.max(5, cellWidth - 4),
    Math.max(5, cellHeight - 4),
  );
  gamePreviewContext.strokeStyle = "#b8e5ff";
  gamePreviewContext.lineWidth = 1;
  gamePreviewContext.strokeRect(
    0.5,
    0.5,
    gamePreviewCanvas.width - 1,
    gamePreviewCanvas.height - 1,
  );
  if (state.dialogue !== null || state.sceneComplete) {
    gamePreviewContext.fillStyle = "rgba(8, 14, 25, 0.92)";
    gamePreviewContext.fillRect(
      4,
      gamePreviewCanvas.height - 25,
      gamePreviewCanvas.width - 8,
      21,
    );
    gamePreviewContext.strokeStyle = "#f5d18b";
    gamePreviewContext.strokeRect(
      4.5,
      gamePreviewCanvas.height - 24.5,
      gamePreviewCanvas.width - 9,
      20,
    );
    gamePreviewContext.fillStyle = "#fff2cc";
    gamePreviewContext.font = "7px sans-serif";
    gamePreviewContext.fillText(
      state.sceneComplete
        ? "Sceneクリア！"
        : (state.dialogue ?? "").slice(0, 42),
      8,
      gamePreviewCanvas.height - 11,
    );
  }
  delete gamePreviewCanvas.dataset.game351Error;
  gamePreviewCanvas.dataset.gameGenreFamily = state.runtimeFamily;
  gamePreviewCanvas.dataset.gameGenreMode = state.mode;
  gamePreviewCanvas.dataset.gameGenrePlayer =
    state.playerPosition.x + "," + state.playerPosition.y;
  gamePreviewCanvas.dataset.gameGenreTick = String(state.tick);
  gamePreviewCanvas.dataset.gameGenreDialogue = state.dialogue ?? "";
  gamePreviewCanvas.dataset.gameGenreComplete = String(state.sceneComplete);
  gamePreviewCanvas.dataset.gameGenreCamera = cameraX + "," + cameraY;
  setGamePreviewStatus(
    "Runtime " + (state.mode === "PLAYING" ? "READY" : "STOPPED") +
      " · " + gameGenreRuntimeLabel(state.runtimeFamily) +
      " · " + mode +
      " · tick=" + state.tick +
      " · 主人公 " + state.playerPosition.x.toFixed(2) + "," +
      state.playerPosition.y.toFixed(2) +
      " · Camera " +
      (state.camera2D.pixelPerfect ? "Pixel-perfect" : "Free") +
      " · " + (state.camera2D.follow.enabled ? "Follow" : "Fixed") +
      " · HP " + state.health +
      (state.sceneComplete ? " · COMPLETE" : "") +
      (state.dialogue === null ? "" : " · dialogue"),
  );
}

async function startGame351Preview(
  mode: "LIVE" | "PINNED",
): Promise<void> {
  // Genre previews and the legacy RPG preview share the same canvas. Clear
  // the genre state first so changing templates cannot route RPG input to the
  // previous Action/Scroll runtime.
  gameGenrePlayableState = undefined;
  game351PreviewMode = mode;
  game351CameraPosition = undefined;
  game351CameraShakeStartedAt = -1;
  const workspace = getWorkspacePxdBridge();
  await workspace.preparePixyncGameState?.();
  const project = workspace.gameCurrentProject?.();
  let template: Game351RpgTemplate;
  let playable: Game351PlayableState | undefined;
  try {
    template = project === undefined
      ? await createGame351RpgTemplate({
        projectId: state.projectId,
        ownerId: "draw2-local-owner",
        revisionId: "game351-preview-revision",
      })
      : createGame351RpgTemplateFromProject(project);
    playable = createGame351PlayableState(template);
  } catch {
    template = await createGame351RpgTemplate({
      projectId: project?.projectId ?? state.projectId,
      ownerId: project?.ownerId ?? "draw2-local-owner",
      revisionId: project?.revision.revisionId ?? "game351-preview-revision",
    });
    playable = createGame351PlayableState(template);
  }
  if (playable === undefined) {
    throw new Error("GAME-351 preview state could not be created.");
  }
  game351PlayableState = playGame351(playable);
  game351InputSequence = 0;
  game351Behaviors = project?.behaviors ?? [];
  drawGame351Preview(game351PlayableState, mode);
  if (typeof workspace.refreshSite400IGameRoute === "function") {
    await workspace.refreshSite400IGameRoute("open");
  }
}

async function startGameGenrePreview(
  mode: "LIVE" | "PINNED",
): Promise<void> {
  gameGenrePreviewMode = mode;
  const workspace = getWorkspacePxdBridge();
  await workspace.preparePixyncGameState?.();
  const project = workspace.gameCurrentProject?.();
  if (project === undefined) {
    throw new Error("Game Projectを読み込めません。Sceneを保存してからPlayしてください。");
  }
  game350ProductSession = undefined;
  game351PlayableState = undefined;
  game351Behaviors = [];
  gameGenrePlayableState = playGameGenre(createGameGenreRuntime(project));
  gamePreviewPinControl.disabled = true;
  gamePreviewReloadControl.disabled = false;
  drawGameGenrePreview(gameGenrePlayableState, mode);
  if (typeof workspace.refreshSite400IGameRoute === "function") {
    await workspace.refreshSite400IGameRoute("open");
  }
}

type Draw2CameraShakeWindow = Window & {
  __pixiedraw2GameCameraShake?: () => void;
};

function animateGame351CameraShake(): void {
  if (game351PlayableState === undefined) return;
  drawGame351Preview(game351PlayableState, game351PreviewMode);
  const elapsed = performance.now() - game351CameraShakeStartedAt;
  if (elapsed < game351PlayableState.snapshot.camera2D.shake.durationMs) {
    window.requestAnimationFrame(animateGame351CameraShake);
  } else {
    game351CameraShakeStartedAt = -1;
    drawGame351Preview(game351PlayableState, game351PreviewMode);
  }
}

const triggerGame351CameraShake = (): void => {
  if (gameGenrePlayableState !== undefined) {
    gameGenrePlayableState = triggerGameGenreCameraShake(
      gameGenrePlayableState,
    );
    drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
    return;
  }
  if (game351PlayableState === undefined) return;
  game351CameraShakeSeed += 1;
  game351CameraShakeStartedAt = performance.now();
  animateGame351CameraShake();
};

const gameCameraShakeRequestObserver = new MutationObserver(() => {
  if (gamePreviewCanvas.dataset.gameCameraShakeRequest === undefined) return;
  delete gamePreviewCanvas.dataset.gameCameraShakeRequest;
  triggerGame351CameraShake();
});
gameCameraShakeRequestObserver.observe(gamePreviewCanvas, {
  attributes: true,
  attributeFilter: ["data-game-camera-shake-request"],
});

(window as Draw2CameraShakeWindow).__pixiedraw2GameCameraShake =
  triggerGame351CameraShake;
window.addEventListener("draw2:game-camera-shake", triggerGame351CameraShake);
document.addEventListener("draw2:game-camera-shake", triggerGame351CameraShake);

function game351ActionForKey(key: string):
  | (typeof GAME351_INPUT_ACTIONS)[keyof typeof GAME351_INPUT_ACTIONS]
  | undefined {
  if (key === "ArrowUp" || key.toLowerCase() === "w") {
    return GAME351_INPUT_ACTIONS.MOVE_UP;
  }
  if (key === "ArrowDown" || key.toLowerCase() === "s") {
    return GAME351_INPUT_ACTIONS.MOVE_DOWN;
  }
  if (key === "ArrowLeft" || key.toLowerCase() === "a") {
    return GAME351_INPUT_ACTIONS.MOVE_LEFT;
  }
  if (key === "ArrowRight" || key.toLowerCase() === "d") {
    return GAME351_INPUT_ACTIONS.MOVE_RIGHT;
  }
  return undefined;
}

function handleGame351PreviewKey(event: KeyboardEvent): void {
  const current = game351PlayableState;
  if (
    current === undefined || event.defaultPrevented || event.isComposing ||
    event.repeat || workspaceFrameElement?.dataset.creatorMode !== "GAME" ||
    event.target !== gamePreviewCanvas
  ) return;
  if (event.key === "Escape") {
    event.preventDefault();
    game351PlayableState = clearGame351Dialogue(current);
    drawGame351Preview(game351PlayableState, game351PreviewMode);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    game351PlayableState = triggerGame351Action(
      current,
      String(GAME351_INTERACT_ACTION),
      game351Behaviors,
    );
    drawGame351Preview(game351PlayableState, game351PreviewMode);
    return;
  }
  const action = game351ActionForKey(event.key);
  if (action === undefined) return;
  event.preventDefault();
  game351InputSequence = Math.max(
    game351InputSequence + 1,
    current.input.lastSequence + 1,
  );
  game351PlayableState = stepGame351(current, {
    sequence: game351InputSequence,
    action,
  });
  drawGame351Preview(game351PlayableState, game351PreviewMode);
}

function handleGameGenrePreviewKey(event: KeyboardEvent): void {
  const current = gameGenrePlayableState;
  if (
    current === undefined || event.defaultPrevented || event.isComposing ||
    event.repeat || workspaceFrameElement?.dataset.creatorMode !== "GAME" ||
    event.target !== gamePreviewCanvas
  ) return;
  if (event.key === "Escape") {
    event.preventDefault();
    gameGenrePlayableState = clearGameGenreDialogue(current);
    drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
    return;
  }
  const lowerKey = event.key.toLowerCase();
  let input: GameGenreRuntimeInput;
  if (event.key === "ArrowLeft" || lowerKey === "a") {
    input = { left: true };
  } else if (event.key === "ArrowRight" || lowerKey === "d") {
    input = { right: true };
  } else if (event.key === "ArrowUp" || lowerKey === "w") {
    input = { jump: true };
  } else if (event.key === "Enter") {
    input = { interact: true, tap: true };
  } else {
    return;
  }
  event.preventDefault();
  gameGenrePlayableState = stepGameGenre(current, input);
  drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
}

async function startGamePreview(
  mode: "LIVE" | "PINNED" = "LIVE",
): Promise<void> {
  const creationMode = document.querySelector<HTMLElement>(
    "#draw2WorkspaceFrame",
  )?.dataset.gameCreationMode;
  if (creationMode === "ACTION_2D" || creationMode === "SCROLL_2D") {
    try {
      await startGameGenrePreview(mode);
    } catch (cause) {
      setGamePreviewStatus(
        cause instanceof Error
          ? cause.message
          : "Template Runtime preview failed.",
        "error",
      );
    }
    return;
  }
  try {
    const workspace = getWorkspacePxdBridge();
    workspace.startGoldenAudioPreview?.();
    const goldenProject = await workspace.buildGoldenProject?.(mode);
    if (goldenProject !== undefined) {
      if (!goldenProject.ok || goldenProject.value === undefined) {
        throw new Error(
          goldenProject.diagnostics.map((item) => item.message).join(" ") ||
            "Golden Project could not be composed.",
        );
      }
      const { value } = goldenProject;
      if (goldenProjectStatusElement !== null) {
        goldenProjectStatusElement.textContent = value.packageReady
          ? "READY · Draw Sprite + Audio Source + PINNED Package"
          : "READY · Draw Sprite + Audio Source · LIVE Preview";
      }
      if (goldenProjectRefsElement !== null) {
        goldenProjectRefsElement.textContent =
          `Sprite: ${
            value.project.scenes[0]?.entities[0]?.name ?? "iDRAW"
          } · ` +
          `Audio: ${
            value.project.scenes[0]?.entities[1]?.name ?? "iAUDIO"
          } · ` +
          `Refs: ${value.manifest.assetLocks.length}`;
      }
      // Retry after a cold Audio Project finishes hydrating. When playback
      // already started, the workspace adapter treats this as a no-op.
      workspace.startGoldenAudioPreview?.();
    }
    const boundary = await buildLocalDraw2GameProject(mode);
    const ownerId = "draw2-local-owner";
    const product = await startGame350ProductPreview({
      project: boundary.project,
      authority: boundary.authority,
      ownerId,
      licenseByAsset: { [boundary.asset.id]: "draw2-local-preview" },
      sceneId: "draw2-local-scene",
      payloadResolver: {
        resolve: async (request): Promise<RuntimeAssetPayload> => ({
          assetId: request.assetId,
          revisionId: asAssetRevisionId(
            `draw-revision-${boundary.asset.revision}`,
          ),
          contentHash: boundary.project.dependencies.entries[0]!.contentHash,
          byteLength: boundary.asset.width * boundary.asset.height,
          mimeType: "application/x-pixieed-indexed-raster",
        }),
      },
      previewId: "draw2-local-game-preview",
      runtime: {
        runtimeId: "pixie-runtime",
        runtimeVersion: "0.1.0",
        supportedManifestVersion: 1,
      },
      supportedRuntimeVersion: "0.1.0",
      capabilities: {
        pointer: true,
        touch: true,
        keyboard: true,
        mouse: true,
        gamepad: false,
        screenWidth: 160,
        screenHeight: 96,
        devicePixelRatio: 1,
        audio: false,
        graphics: "CANVAS2D",
        webGpuBenefitMeasured: false,
        reducedMotion: false,
      },
      renderer: "CANVAS2D",
    });
    if (!product.ok || product.value === undefined) {
      throw new Error(
        product.diagnostics.map((item) => item.message).join(" "),
      );
    }
    game350ProductSession = product.value;
    runtimePreviewSession = game350ProductSession.step(100).runtime;
    drawGamePreview(runtimePreviewSession, boundary.asset);
    gamePreviewPinControl.disabled = false;
    gamePreviewReloadControl.disabled = false;
    setGamePreviewStatus(
      `Runtime READY · ${mode} · tick=${runtimePreviewSession.world.tick}`,
    );
    try {
      await startGame351Preview(mode);
    } catch (cause) {
      // Keep the existing GAME-350 preview usable while the Studio workspace adapter is
      // still hydrating or when this isolated entry is opened without it.
      game351PlayableState = undefined;
      game351Behaviors = [];
      gamePreviewCanvas.dataset.game351Error = cause instanceof Error
        ? cause.message
        : "preview-unavailable";
    }
  } catch (cause) {
    setGamePreviewStatus(
      cause instanceof Error ? cause.message : "Runtime preview failed.",
      "error",
    );
  }
}

type RgbColor = { r: number; g: number; b: number };
type PaletteAppendDraft = {
  readonly color: RgbColor;
  readonly alpha: number;
};
type HsvColor = { h: number; s: number; v: number };

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function argbFromRgb(color: RgbColor, alpha = 255): number {
  return (((clampColorChannel(alpha) << 24) |
    (clampColorChannel(color.r) << 16) | (clampColorChannel(color.g) << 8) |
    clampColorChannel(color.b)) >>> 0);
}

function rgbToHex(color: RgbColor): string {
  return `#${
    [color.r, color.g, color.b].map((channel) =>
      clampColorChannel(channel).toString(16).padStart(2, "0")
    ).join("").toUpperCase()
  }`;
}

function parseHexColor(value: string): RgbColor | undefined {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return undefined;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function uniquePaletteValues(
  existing: readonly number[],
  requested: readonly number[],
): readonly number[] {
  const seen = new Set(existing);
  const next: number[] = [];
  for (const color of requested) {
    if (seen.has(color)) continue;
    seen.add(color);
    next.push(color);
  }
  return next;
}

type PaletteDragState = {
  readonly pointerId: number;
  readonly source: PaletteAppendDraft;
  readonly startX: number;
  readonly startY: number;
  readonly addButton: HTMLButtonElement;
  moved: boolean;
  target?: PaletteGridDropTarget;
  grid: PaletteAppendDraft[];
};

type PaletteGridDropTarget = {
  readonly cellIndex: number;
  readonly columnCount: number;
};

const PALETTE_ADD_DRAG_THRESHOLD_PX = 6;
const PALETTE_GRID_MAX_ROWS = 32;

function findNearestMissingPaletteColor(
  draft: PaletteAppendDraft,
  existing: readonly number[],
): PaletteAppendDraft | undefined {
  const existingValues = new Set(existing);
  const sourceValue = argbFromRgb(draft.color, draft.alpha);
  const offsets: Array<[number, number, number]> = [];
  for (let r = -1; r <= 1; r += 1) {
    for (let g = -1; g <= 1; g += 1) {
      for (let b = -1; b <= 1; b += 1) {
        if (r === 0 && g === 0 && b === 0) continue;
        offsets.push([r, g, b]);
      }
    }
  }
  offsets.sort((left, right) =>
    (left[0] ** 2 + left[1] ** 2 + left[2] ** 2) -
    (right[0] ** 2 + right[1] ** 2 + right[2] ** 2)
  );
  for (let step = 1; step <= 255; step += 1) {
    for (const [r, g, b] of offsets) {
      const color = {
        r: clampColorChannel(draft.color.r + r * step),
        g: clampColorChannel(draft.color.g + g * step),
        b: clampColorChannel(draft.color.b + b * step),
      };
      const packed = argbFromRgb(color, draft.alpha);
      if (packed === sourceValue || existingValues.has(packed)) continue;
      return { color, alpha: draft.alpha };
    }
  }
  return undefined;
}

function buildPaletteGridDrafts(
  source: PaletteAppendDraft,
  count: number,
  existing: readonly number[],
): PaletteAppendDraft[] {
  const remaining = Math.max(0, Math.min(256 - existing.length, count));
  const reserved = [...existing];
  const drafts: PaletteAppendDraft[] = [];
  for (let index = 0; index < remaining; index += 1) {
    const nearby = findNearestMissingPaletteColor(source, reserved);
    if (nearby === undefined) break;
    drafts.push(nearby);
    reserved.push(argbFromRgb(nearby.color, nearby.alpha));
  }
  return drafts;
}

function paletteGridDropTargetFromClient(
  clientX: number,
  clientY: number,
  paletteLength: number,
): PaletteGridDropTarget | undefined {
  const hit = document.elementFromPoint(clientX, clientY);
  if (
    hit !== null &&
    (colorMap.contains(hit) || paletteWheel.contains(hit))
  ) return undefined;
  for (const group of colorButtonGroups) {
    const bounds = group.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    const firstCell = group.querySelector<HTMLElement>(
      ".draw2-color, .draw2-color-add",
    );
    if (firstCell === null) continue;
    const cellBounds = firstCell.getBoundingClientRect();
    if (cellBounds.width <= 0 || cellBounds.height <= 0) continue;
    const style = getComputedStyle(group);
    const columnCount = style.gridTemplateColumns.trim().split(/\s+/u).filter(
      Boolean,
    ).length;
    if (columnCount < 1) continue;
    const columnGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const columnStride = cellBounds.width + columnGap;
    const rowStride = cellBounds.height + rowGap;
    const x = clientX - bounds.left + group.scrollLeft;
    const y = clientY - bounds.top + group.scrollTop;
    if (x < 0 || y < 0) continue;
    const column = Math.floor(x / columnStride);
    const row = Math.floor(y / rowStride);
    if (column < 0 || column >= columnCount || row < 0) continue;
    if (row >= PALETTE_GRID_MAX_ROWS) continue;
    const cellIndex = row * columnCount + column;
    if (cellIndex < paletteLength) continue;
    return { cellIndex, columnCount };
  }
  return undefined;
}

function clearPaletteDragPreview(): void {
  for (const group of colorButtonGroups) {
    for (const preview of group.querySelectorAll<HTMLElement>(
      '[data-palette-drag-preview="true"]',
    )) preview.remove();
    group.removeAttribute("data-palette-drag-active");
    group.removeAttribute("data-palette-drop-cell");
  }
}

function renderPaletteDragPreview(
  drafts: readonly PaletteAppendDraft[],
  targetCellIndex: number,
): void {
  clearPaletteDragPreview();
  if (drafts.length === 0) return;
  for (const group of colorButtonGroups) {
    const fragment = document.createDocumentFragment();
    for (const draft of drafts) {
      const preview = document.createElement("span");
      preview.className = "draw2-color draw2-palette-drag-preview";
      preview.dataset.paletteDragPreview = "true";
      preview.setAttribute("aria-hidden", "true");
      preview.style.backgroundColor = `rgb(${clampColorChannel(draft.color.r)} ${
        clampColorChannel(draft.color.g)
      } ${clampColorChannel(draft.color.b)} / ${draft.alpha / 255})`;
      fragment.append(preview);
    }
    if (fragment.lastElementChild instanceof HTMLElement) {
      fragment.lastElementChild.dataset.paletteDropTarget = "true";
    }
    const addButton = group.querySelector<HTMLElement>('[data-color-add="true"]');
    if (addButton === null) group.append(fragment);
    else group.insertBefore(fragment, addButton);
    group.dataset.paletteDragActive = "true";
    group.dataset.paletteDropCell = String(targetCellIndex);
  }
}

function rgbToHsv(color: RgbColor): HsvColor {
  const r = clampColorChannel(color.r) / 255;
  const g = clampColorChannel(color.g) / 255;
  const b = clampColorChannel(color.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(color: HsvColor): RgbColor {
  const h = ((color.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, color.s));
  const v = Math.max(0, Math.min(1, color.v));
  const chroma = v * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const match = v - chroma;
  const rgb: [number, number, number] = section < 1
    ? [chroma, x, 0]
    : section < 2
    ? [x, chroma, 0]
    : section < 3
    ? [0, chroma, x]
    : section < 4
    ? [0, x, chroma]
    : section < 5
    ? [x, 0, chroma]
    : [chroma, 0, x];
  return {
    r: (rgb[0] + match) * 255,
    g: (rgb[1] + match) * 255,
    b: (rgb[2] + match) * 255,
  };
}

function setColorEditorStatus(
  message: string,
  kind: "ready" | "error" = "ready",
): void {
  colorEditorStatus.textContent = translateDraw2Text(message, draw2Locale);
  colorEditorStatus.dataset.state = kind;
}

interface PaletteWheelMetrics {
  center: number;
  outerRadius: number;
  innerRadius: number;
  hueCursorRadius: number;
  svLeft: number;
  svTop: number;
  svRight: number;
  svBottom: number;
  svSpan: number;
}

function getPaletteWheelDisplaySize(): number {
  const bounds = paletteWheel.getBoundingClientRect();
  return Math.max(0, Math.min(bounds.width, bounds.height));
}

function paletteWheelPointFromClient(
  clientX: number,
  clientY: number,
): { x: number; y: number; size: number } | undefined {
  const wheelBounds = paletteWheel.getBoundingClientRect();
  const size = Math.max(0, Math.min(wheelBounds.width, wheelBounds.height));
  if (!size) return undefined;
  return {
    x: Math.max(0, Math.min(size, clientX - wheelBounds.left)),
    y: Math.max(0, Math.min(size, clientY - wheelBounds.top)),
    size,
  };
}

function getPaletteWheelMetrics(size: number): PaletteWheelMetrics {
  const center = size / 2;
  const outerRadius = Math.max(2, (size / 2) - 0.5);
  const ringThickness = Math.max(14, Math.min(26, size * 0.14));
  const innerRadius = Math.max(8, outerRadius - ringThickness);
  const svHalf = Math.max(6, innerRadius / Math.SQRT2);
  const svLeft = center - svHalf;
  const svTop = center - svHalf;
  const svRight = center + svHalf;
  const svBottom = center + svHalf;
  return {
    center,
    outerRadius,
    innerRadius,
    hueCursorRadius: innerRadius + ((outerRadius - innerRadius) * 0.5),
    svLeft,
    svTop,
    svRight,
    svBottom,
    svSpan: Math.max(1, svRight - svLeft),
  };
}

function isPointInsidePaletteSv(
  x: number,
  y: number,
  metrics: PaletteWheelMetrics,
): boolean {
  return x >= metrics.svLeft && x <= metrics.svRight && y >= metrics.svTop &&
    y <= metrics.svBottom;
}

function drawPaletteWheel(hue: number): void {
  const displaySize = getPaletteWheelDisplaySize();
  if (!displaySize) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.max(1, Math.round(displaySize * dpr));
  if (paletteWheel.width !== size || paletteWheel.height !== size) {
    paletteWheel.width = size;
    paletteWheel.height = size;
    paletteWheelRenderKey = "";
  }
  const renderKey = `${size}:${Math.round(hue * 100)}`;
  if (paletteWheelRenderKey === renderKey) return;
  const scale = size / displaySize;
  const displayMetrics = getPaletteWheelMetrics(displaySize);
  const metrics: PaletteWheelMetrics = {
    center: displayMetrics.center * scale,
    outerRadius: displayMetrics.outerRadius * scale,
    innerRadius: displayMetrics.innerRadius * scale,
    hueCursorRadius: displayMetrics.hueCursorRadius * scale,
    svLeft: displayMetrics.svLeft * scale,
    svTop: displayMetrics.svTop * scale,
    svRight: displayMetrics.svRight * scale,
    svBottom: displayMetrics.svBottom * scale,
    svSpan: displayMetrics.svSpan * scale,
  };
  const image = paletteWheelContext.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - metrics.center;
      const dy = y + 0.5 - metrics.center;
      const distance = Math.sqrt((dx * dx) + (dy * dy));
      const index = (y * size + x) * 4;
      if (distance > metrics.outerRadius) {
        image.data[index + 3] = 0;
        continue;
      }
      let rgb: RgbColor;
      if (distance >= metrics.innerRadius) {
        const ringHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        rgb = hsvToRgb({ h: ringHue, s: 1, v: 1 });
      } else if (isPointInsidePaletteSv(x + 0.5, y + 0.5, metrics)) {
        const saturation = Math.max(
          0,
          Math.min(1, (x + 0.5 - metrics.svLeft) / metrics.svSpan),
        );
        const value = 1 -
          Math.max(0, Math.min(1, (y + 0.5 - metrics.svTop) / metrics.svSpan));
        rgb = hsvToRgb({ h: hue, s: saturation, v: value });
      } else {
        rgb = { r: 16, g: 24, b: 36 };
      }
      image.data[index] = Math.round(rgb.r);
      image.data[index + 1] = Math.round(rgb.g);
      image.data[index + 2] = Math.round(rgb.b);
      image.data[index + 3] = 255;
    }
  }
  paletteWheelContext.putImageData(image, 0, 0);
  paletteWheelRenderKey = renderKey;
}

function updatePaletteWheelCursor(hsv: HsvColor): void {
  const displaySize = getPaletteWheelDisplaySize();
  if (!displaySize) return;
  const metrics = getPaletteWheelMetrics(displaySize);
  const mapBounds = colorMap.getBoundingClientRect();
  const wheelBounds = paletteWheel.getBoundingClientRect();
  const offsetX = wheelBounds.left - mapBounds.left;
  const offsetY = wheelBounds.top - mapBounds.top;
  const hueAngle = hsv.h * Math.PI / 180;
  hueCursor.style.left = `${
    offsetX + metrics.center + Math.cos(hueAngle) * metrics.hueCursorRadius
  }px`;
  hueCursor.style.top = `${
    offsetY + metrics.center + Math.sin(hueAngle) * metrics.hueCursorRadius
  }px`;
  svCursor.style.left = `${
    offsetX + metrics.svLeft + hsv.s * metrics.svSpan
  }px`;
  svCursor.style.top = `${
    offsetY + metrics.svTop + (1 - hsv.v) * metrics.svSpan
  }px`;
}

function redrawPaletteWheelFromDraft(): void {
  const hsv = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value),
  });
  paletteWheelRenderKey = "";
  drawPaletteWheel(hsv.h);
  updatePaletteWheelCursor(hsv);
}

const paletteWheelResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => {
    redrawPaletteWheelFromDraft();
  })
  : undefined;
paletteWheelResizeObserver?.observe(colorMap);
window.addEventListener("resize", redrawPaletteWheelFromDraft, {
  passive: true,
});

// The workspace can give the Color panel less height than the wheel's
// preferred square size (for example after the Timeline rail is enlarged or
// when a short desktop window is used). Keep the wheel inside the visible
// panel instead of letting the panel clip its lower half. The size is a
// presentation-only value; the source raster and color state remain intact.
let lastPaletteWheelLayoutSize = -1;
function syncPaletteWheelLayout(): void {
  const panel = document.querySelector<HTMLElement>(
    "#draw2WorkspacePanelColor",
  );
  const editor = colorMap.closest<HTMLElement>(".draw2-color-editor");
  if (panel === null || editor === null) return;
  const panelBounds = panel.getBoundingClientRect();
  let mapBounds = colorMap.getBoundingClientRect();
  if (
    panelBounds.width <= 0 || panelBounds.height <= 0 ||
    mapBounds.width <= 0 || mapBounds.height <= 0
  ) return;
  const editorStyles = getComputedStyle(editor);
  const editorContentWidth = Math.max(
    1,
    editor.clientWidth - parseFloat(editorStyles.paddingLeft) -
      parseFloat(editorStyles.paddingRight),
  );
  // The wheel should use all of the width the dock gives it (bounded only
  // by the available height below, via nextSize's Math.min against
  // availableHeight) so it renders as large as the layout allows while the
  // CSS aspect-ratio: 1/1 rule keeps it a perfect square. A hardcoded 180px
  // ceiling used to cap this regardless of how much wider the dock was.
  const preferredSize = Math.max(1, editorContentWidth);
  // Add scrollTop so the available height is stable while the panel itself is
  // scrolled. This prevents the wheel from growing as the user inspects the
  // lower slider controls.
  let mapContentTop = mapBounds.top - panelBounds.top + panel.scrollTop;
  let availableHeight = Math.max(1, panel.clientHeight - mapContentTop - 2);
  const compact = availableHeight < 120;
  panel.classList.toggle("is-color-wheel-compact", compact);
  if (compact) {
    // The heading is useful when there is room, but it needlessly consumes a
    // full grid row in a short dock. Re-measure after compacting so the wheel
    // gets a usable square instead of a 50–70px sliver.
    mapBounds = colorMap.getBoundingClientRect();
    mapContentTop = mapBounds.top - panelBounds.top + panel.scrollTop;
    availableHeight = Math.max(1, panel.clientHeight - mapContentTop - 2);
  }
  const nextSize = Math.max(1, Math.floor(
    Math.min(preferredSize, availableHeight),
  ));
  if (nextSize === lastPaletteWheelLayoutSize) return;
  lastPaletteWheelLayoutSize = nextSize;
  colorMap.style.setProperty(
    "--draw2-color-map-size",
    `${nextSize}px`,
  );
}

const paletteWheelLayoutObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => syncPaletteWheelLayout())
  : undefined;
paletteWheelLayoutObserver?.observe(colorMap);
paletteWheelLayoutObserver?.observe(
  document.querySelector<HTMLElement>("#draw2WorkspacePanelColor") ?? colorMap,
);
paletteWheelLayoutObserver?.observe(
  document.querySelector<HTMLElement>("#draw2WorkspaceRightDock") ?? colorMap,
);
window.addEventListener("resize", syncPaletteWheelLayout, { passive: true });
window.requestAnimationFrame(syncPaletteWheelLayout);

function refreshPaletteButtonPreview(): void {
  const preview =
    selectedColor > 0 && colorDraftDirty && colorDraft !== undefined
      ? argbFromRgb(colorDraft, colorDraftAlpha)
      : undefined;
  for (const button of colorButtons) {
    if (
      Number(button.dataset.colorIndex) !== selectedColor ||
      preview === undefined
    ) {
      button.removeAttribute("data-preview-color");
      continue;
    }
    const { red, green, blue } = decodeArgb(preview);
    button.style.backgroundColor = `rgb(${red} ${green} ${blue})`;
    button.dataset.previewColor = "true";
  }
}

function requestColorPreviewRender(): void {
  refreshPaletteButtonPreview();
  if (colorPreviewFrame !== undefined) return;
  colorPreviewFrame = window.requestAnimationFrame(() => {
    colorPreviewFrame = undefined;
    void present().catch(() => undefined);
  });
}

function setColorEditorRgb(
  color: RgbColor,
  writeHex = true,
  markDraft = true,
): void {
  const rgb = {
    r: clampColorChannel(color.r),
    g: clampColorChannel(color.g),
    b: clampColorChannel(color.b),
  };
  if (markDraft) {
    colorDraft = rgb;
    colorDraftDirty = true;
  }
  colorR.value = String(rgb.r);
  colorG.value = String(rgb.g);
  colorB.value = String(rgb.b);
  colorAlpha.value = String(colorDraftAlpha);
  colorRValue.value = String(rgb.r);
  colorGValue.value = String(rgb.g);
  colorBValue.value = String(rgb.b);
  colorAlphaValue.value = String(Math.round(colorDraftAlpha / 255 * 100));
  const hex = rgbToHex(rgb);
  if (writeHex) colorHex.value = hex;
  colorHexOutput.value = hex;
  const hsv = rgbToHsv(rgb);
  colorMap.setAttribute(
    "aria-valuetext",
    `Hue ${Math.round(hsv.h)}, saturation ${Math.round(hsv.s * 100)}%, value ${
      Math.round(hsv.v * 100)
    }%`,
  );
  drawPaletteWheel(hsv.h);
  updatePaletteWheelCursor(hsv);
  if (markDraft) requestColorPreviewRender();
}

function rememberColor(color: number): void {
  if (color === 0) return;
  colorHistory = [color, ...colorHistory.filter((candidate) => candidate !== color)]
    .slice(0, 12);
  renderColorHistory();
}

function renderColorHistory(): void {
  colorHistoryControl.replaceChildren();
  for (const color of colorHistory) {
    const channels = decodeArgbColor(color);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draw2-color-history-swatch";
    button.style.backgroundColor = `rgb(${channels.red} ${channels.green} ${channels.blue} / ${channels.alpha / 255})`;
    button.title = `Recent color #${[channels.red, channels.green, channels.blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => {
      const asset = state.assets[state.activeAssetId];
      const paletteIndex = asset?.palette.indexOf(color) ?? -1;
      if (paletteIndex >= 0) {
        selectedColor = paletteIndex;
        renderPaletteButtons(asset?.palette ?? []);
        syncColorEditorFromSelection();
        scheduleDraw2EditorPreferencesSave();
        return;
      }
      colorDraftAlpha = channels.alpha;
      setColorEditorRgb({ r: channels.red, g: channels.green, b: channels.blue });
      setColorEditorStatus("履歴色をプレビュー中。追加ボタンでパレットへ登録できます。");
    });
    colorHistoryControl.append(button);
  }
  if (colorHistory.length === 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-color-history-empty";
    empty.textContent = "Recent colors";
    colorHistoryControl.append(empty);
  }
}

function renderColorRampOptions(palette: readonly number[]): void {
  const current = colorRampEndControl.value;
  colorRampEndControl.replaceChildren();
  palette.forEach((color, index) => {
    const channels = decodeArgbColor(color);
    const hex = [channels.red, channels.green, channels.blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("");
    colorRampEndControl.append(new Option(`Index ${index} · #${hex}`, String(index)));
  });
  colorRampEndControl.value = palette.some((_, index) => String(index) === current)
    ? current
    : String(Math.min(Math.max(1, selectedColor + 1), Math.max(0, palette.length - 1)));
  renderColorRampPreview(palette);
}

function renderColorRampPreview(palette: readonly number[]): void {
  const start = palette[selectedColor] ?? palette[0] ?? 0;
  const end = palette[Number(colorRampEndControl.value)] ?? start;
  const ramp = createArgbColorRamp(
    start,
    end,
    Number(colorRampStepsControl.value),
    colorRampSpaceControl.value === "RGB" ? "RGB" : "HSV",
    colorRampHueControl.value === "LONG" ? "LONG" : "SHORT",
  );
  colorRampPreviewControl.replaceChildren();
  for (const [index, color] of ramp.entries()) {
    const channels = decodeArgbColor(color);
    const swatch = document.createElement("span");
    swatch.className = "draw2-color-ramp-swatch";
    swatch.style.backgroundColor = `rgb(${channels.red} ${channels.green} ${channels.blue} / ${channels.alpha / 255})`;
    swatch.setAttribute("aria-label", `Ramp color ${index + 1}`);
    colorRampPreviewControl.append(swatch);
  }
}

function renderIndexedColorOptions(
  element: HTMLSelectElement,
  palette: readonly number[],
  includeTransparent = false,
): void {
  const current = element.value;
  element.replaceChildren();
  palette.forEach((color, index) => {
    if (!includeTransparent && index === 0) return;
    const channels = decodeArgbColor(color);
    const hex = [channels.red, channels.green, channels.blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("");
    element.append(new Option(`Index ${index} · #${hex}`, String(index)));
  });
  const fallback = palette.length > 1 ? String(Math.max(1, selectedColor)) : "";
  element.value = Array.from(element.options).some((option) => option.value === current)
    ? current
    : fallback;
}

function syncColorEditorFromSelection(): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const selected = asset.palette[selectedColor] ?? asset.palette[0] ?? 0;
  const { alpha, red, green, blue } = decodeArgb(selected);
  colorDraftAlpha = alpha;
  setColorEditorRgb({ r: red, g: green, b: blue }, true, false);
  colorAlpha.value = String(alpha);
  colorAlphaValue.value = String(Math.round(alpha / 255 * 100));
  colorDraft = { r: red, g: green, b: blue };
  colorDraftDirty = false;
  colorApply.disabled = selectedColor === 0;
  rememberColor(selected);
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0 · transparent / eraser"
      : `Index ${selectedColor} · local edit`,
  );
}

function renderPaletteButtons(palette: readonly number[]): void {
  clearPaletteDragPreview();
  for (const group of colorButtonGroups) {
    group.replaceChildren();
    palette.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `draw2-color${index === 0 ? " is-transparent" : ""}`;
      button.dataset.colorIndex = String(index);
      button.setAttribute("aria-pressed", String(index === selectedColor));
      button.setAttribute(
        "aria-label",
        localizeDraw2Text(`Palette color ${index}`),
      );
      button.title = localizeDraw2Text(`Palette ${index}`);
      if (index > 0) {
        const { alpha, red, green, blue } = decodeArgb(color);
        button.style.backgroundColor = `rgb(${red} ${green} ${blue} / ${
          alpha / 255
        })`;
      }
      group.append(button);
    });
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "draw2-color-add";
    addButton.dataset.colorAdd = "true";
    addButton.setAttribute(
      "aria-label",
      localizeDraw2Text("Add nearby color"),
    );
    addButton.title = localizeDraw2Text(
      "Click to add a nearby new color; drag over the palette grid to add through the drop cell",
    );
    addButton.classList.add("draw2-button-icon");
    addButton.append(createDraw2Icon("icon-add"));
    addButton.addEventListener("pointerdown", beginPaletteAddPointer);
    addButton.addEventListener("click", () => {
      if (paletteClickSuppressed) {
        paletteClickSuppressed = false;
        return;
      }
      const draft = pendingPaletteAppendDraft ?? readPaletteAppendDraft();
      pendingPaletteAppendDraft = undefined;
      void appendColorFromDraft(draft);
    });
    group.append(addButton);
  }
  colorButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-color-index]"),
  );
  for (const button of colorButtons) {
    button.addEventListener("click", () => {
      selectedColor = Number(button.dataset.colorIndex ?? "1");
      for (const candidate of colorButtons) {
        candidate.setAttribute(
          "aria-pressed",
          String(candidate.dataset.colorIndex === button.dataset.colorIndex),
        );
      }
      syncColorEditorFromSelection();
      scheduleDraw2EditorPreferencesSave();
    });
  }
  refreshPaletteButtonPreview();
  renderColorRampOptions(palette);
  renderIndexedColorOptions(outlineColorControl, palette);
  renderIndexedColorOptions(textFillColorControl, palette);
  renderIndexedColorOptions(textStrokeColorControl, palette);
}

function beginPaletteAddPointer(event: PointerEvent): void {
  if (event.button !== 0 || paletteAppendInFlight) return;
  if (!(event.currentTarget instanceof HTMLButtonElement)) return;
  const source = readPaletteAppendDraft();
  if (source === undefined) {
    setColorEditorStatus("HEXは #RRGGBB で入力してください", "error");
    return;
  }
  palettePointerActive = true;
  paletteClickSuppressed = false;
  pendingPaletteAppendDraft = source;
  paletteDrag = {
    pointerId: event.pointerId,
    source,
    startX: event.clientX,
    startY: event.clientY,
    addButton: event.currentTarget,
    moved: false,
    grid: [],
  };
  event.currentTarget.dataset.paletteDragState = "pending";
  event.currentTarget.setPointerCapture(event.pointerId);
}

function updatePaletteAddPointer(event: PointerEvent): void {
  const drag = paletteDrag;
  if (drag === undefined || drag.pointerId !== event.pointerId) return;
  const distance = Math.hypot(
    event.clientX - drag.startX,
    event.clientY - drag.startY,
  );
  if (!drag.moved && distance < PALETTE_ADD_DRAG_THRESHOLD_PX) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.addButton.dataset.paletteDragState = "dragging";
  }
  if (event.cancelable) event.preventDefault();
  const asset = state.assets[state.activeAssetId];
  const palette = asset?.palette ?? [];
  const target = paletteGridDropTargetFromClient(
    event.clientX,
    event.clientY,
    palette.length,
  );
  if (target === undefined) {
    delete drag.target;
    drag.grid = [];
    clearPaletteDragPreview();
    setColorEditorStatus(
      draw2Locale === "ja"
        ? "パレットの空きセルまでドラッグしてください"
        : "Drag to an empty palette grid cell",
    );
    return;
  }
  drag.target = target;
  const colorCount = target.cellIndex - palette.length + 1;
  drag.grid = buildPaletteGridDrafts(drag.source, colorCount, palette);
  if (drag.grid.length === 0) {
    clearPaletteDragPreview();
    setColorEditorStatus(
      draw2Locale === "ja"
        ? "追加できる近似色がありません"
        : "No nearby colors are available",
      "error",
    );
    return;
  }
  renderPaletteDragPreview(drag.grid, target.cellIndex);
  setColorEditorStatus(
    draw2Locale === "ja"
      ? `${drag.grid.length}色をプレビュー中 · 離して追加`
      : `${drag.grid.length} colors previewed · release to add`,
  );
}

function finishPaletteAddPointer(event: PointerEvent): void {
  const drag = paletteDrag;
  if (drag === undefined || drag.pointerId !== event.pointerId) return;
  paletteDrag = undefined;
  palettePointerActive = false;
  drag.addButton.removeAttribute("data-palette-drag-state");
  if (drag.addButton.hasPointerCapture(event.pointerId)) {
    drag.addButton.releasePointerCapture(event.pointerId);
  }
  clearPaletteDragPreview();
  if (!drag.moved) return;
  paletteClickSuppressed = true;
  pendingPaletteAppendDraft = undefined;
  if (drag.target === undefined || drag.grid.length === 0) {
    setColorEditorStatus(
      draw2Locale === "ja"
        ? "グリッド追加をキャンセルしました"
        : "Palette grid add cancelled",
    );
    return;
  }
  void appendPaletteGridFromDrafts(drag.grid);
}

function cancelPaletteAddPointer(event: PointerEvent): void {
  const drag = paletteDrag;
  if (drag === undefined || drag.pointerId !== event.pointerId) return;
  paletteDrag = undefined;
  palettePointerActive = false;
  pendingPaletteAppendDraft = undefined;
  paletteClickSuppressed = false;
  drag.addButton.removeAttribute("data-palette-drag-state");
  if (drag.addButton.hasPointerCapture(event.pointerId)) {
    drag.addButton.releasePointerCapture(event.pointerId);
  }
  clearPaletteDragPreview();
}

function setColorEditorFromWheel(
  clientX: number,
  clientY: number,
  mode: "hue" | "sv",
): void {
  const point = paletteWheelPointFromClient(clientX, clientY);
  if (point === undefined) return;
  const { x, y, size } = point;
  const metrics = getPaletteWheelMetrics(size);
  const current = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value),
  });
  if (mode === "hue") {
    const hue =
      (Math.atan2(y - metrics.center, x - metrics.center) * 180 / Math.PI +
        360) % 360;
    setColorEditorRgb(hsvToRgb({ h: hue, s: current.s, v: current.v }));
  } else {
    const saturation = Math.max(
      0,
      Math.min(1, (x - metrics.svLeft) / metrics.svSpan),
    );
    const value = 1 -
      Math.max(0, Math.min(1, (y - metrics.svTop) / metrics.svSpan));
    setColorEditorRgb(hsvToRgb({ h: current.h, s: saturation, v: value }));
  }
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0は透明色です"
      : "Color preview · release to commit",
  );
}

function commitColorEdit(): Promise<void> {
  return enqueueCanonicalOperation(() => commitColorEditNow());
}

async function commitColorEditNow(): Promise<void> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  if (
    palettePointerActive || pendingPaletteAppendDraft !== undefined ||
    paletteAppendInFlight
  ) return;
  if (selectedColor === 0) {
    setColorEditorStatus("Index 0は透明色のため変更できません", "error");
    return;
  }
  if (!colorDraftDirty || colorDraft === undefined || colorCommitInFlight) {
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    setColorEditorStatus("HEXは #RRGGBB で入力してください", "error");
    colorApply.disabled = true;
    return;
  }
  const color = colorDraft;
  colorCommitInFlight = true;
  colorApply.disabled = true;
  const commandSequence = nextClientSequence(DRAW_CLIENT_ID);
  const before = state;
  const paletteCanonicalGeneration = canonicalStateGeneration;
  const command = {
    commandId: `draw2-local-palette-${commandSequence}`,
    commandType: "palette.setColor" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: "local-preview-user",
    clientId: DRAW_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      paletteIndex: selectedColor,
      color: argbFromRgb(color, colorDraftAlpha),
    },
  };
  const result = await core.execute(command);
  if (paletteCanonicalGeneration !== canonicalStateGeneration) {
    syncClientSequencesFromState();
    colorCommitInFlight = false;
    colorApply.disabled = selectedColor === 0;
    return;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    colorCommitInFlight = false;
    colorApply.disabled = selectedColor === 0;
    setColorEditorStatus(
      result.diagnostics.map((item) => item.code).join(", "),
      "error",
    );
    return;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
  }
  colorDraftDirty = false;
  colorCommitInFlight = false;
  if (!result.result.noOp) {
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setColorEditorStatus(
    `Index ${selectedColor} · committed on release · 1 undo`,
  );
  setStatus(
    `Palette index ${selectedColor} updated locally · canonical color changed.`,
  );
}

function readPaletteAppendDraft(): PaletteAppendDraft | undefined {
  const color = parseHexColor(colorHex.value);
  if (color === undefined) return undefined;
  return {
    color: { ...color },
    alpha: colorDraftAlpha,
  };
}

function appendColorFromDraft(
  draft = readPaletteAppendDraft(),
): Promise<void> {
  paletteAppendInFlight = true;
  return enqueueCanonicalOperation(async () => {
    try {
      const asset = state.assets[state.activeAssetId];
      const nearby = asset === undefined || draft === undefined
        ? undefined
        : findNearestMissingPaletteColor(draft, asset.palette);
      await appendPaletteDraftsNow(
        nearby === undefined ? [] : [nearby],
        "nearby",
      );
    } finally {
      paletteAppendInFlight = false;
      pendingPaletteAppendDraft = undefined;
    }
  });
}

function appendPaletteGridFromDrafts(
  drafts: readonly PaletteAppendDraft[],
): Promise<void> {
  paletteAppendInFlight = true;
  return enqueueCanonicalOperation(async () => {
    try {
      await appendPaletteDraftsNow(drafts, "grid");
    } finally {
      paletteAppendInFlight = false;
      pendingPaletteAppendDraft = undefined;
    }
  });
}

async function appendPaletteDraftsNow(
  drafts: readonly PaletteAppendDraft[],
  mode: "nearby" | "grid",
): Promise<void> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    setColorEditorStatus("パレットを読み込めませんでした", "error");
    return;
  }
  const requested = drafts.map((draft) =>
    argbFromRgb(draft.color, draft.alpha)
  );
  const addable = uniquePaletteValues(asset.palette, requested);
  if (addable.length === 0) {
    setColorEditorStatus(
      mode === "nearby"
        ? draw2Locale === "ja"
          ? "追加できる近い未登録色がありません"
          : "No nearby color is available to add"
        : draw2Locale === "ja"
        ? "追加できる新しいグリッド色がありません"
        : "No new colors are available for this grid",
      "error",
    );
    return;
  }
  if (asset.palette.length + addable.length > 256) {
    setColorEditorStatus(
      draw2Locale === "ja"
        ? "パレットの上限256色を超えます"
        : "Palette limit is 256 colors",
      "error",
    );
    return;
  }
  const firstAddedIndex = asset.palette.length;
  const commandSequence = nextClientSequence(DRAW_CLIENT_ID);
  const before = state;
  const paletteCanonicalGeneration = canonicalStateGeneration;
  const command = {
    commandId: `draw2-local-palette-append-${mode}-${commandSequence}`,
    commandType: "palette.appendColors" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: "local-preview-user",
    clientId: DRAW_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: { colors: addable },
  };
  const result = await core.execute(command);
  if (paletteCanonicalGeneration !== canonicalStateGeneration) {
    syncClientSequencesFromState();
    return;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setColorEditorStatus(
      result.diagnostics.map((item) => item.code).join(", "),
      "error",
    );
    return;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
    selectedColor = firstAddedIndex;
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    saveDrawProjectState();
    scheduleDraw2EditorPreferencesSave();
  }
  const addedCount = result.result.noOp ? 0 : addable.length;
  const skippedCount = requested.length - addedCount;
  await autosave.record(state, result.result);
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  const resultMessage = result.result.noOp
    ? draw2Locale === "ja"
      ? "追加できる新しい色がありません"
      : "No new colors were added"
    : draw2Locale === "ja"
    ? mode === "grid"
      ? `${addedCount}色のグリッドを追加しました · 1回でUndo`
      : `近い新色を追加しました · Index ${selectedColor} · 1回でUndo`
    : mode === "grid"
    ? `${addedCount} palette colors added · one undo`
    : `Nearby new color added at index ${selectedColor} · one undo`;
  const skippedNote = skippedCount > 0 && requested.length > addable.length
    ? draw2Locale === "ja"
      ? ` · 重複${requested.length - addable.length}色をスキップ`
      : ` · ${requested.length - addable.length} duplicate${requested.length - addable.length === 1 ? "" : "s"} skipped`
    : "";
  setColorEditorStatus(`${resultMessage}${skippedNote}`);
  setStatus(`${resultMessage}${skippedNote}`);
}

function setStatus(message: string, kind: "ready" | "error" = "ready"): void {
  status.textContent = translateDraw2Text(message, draw2Locale);
  status.dataset.state = kind;
}

function integerInput(element: HTMLInputElement, fallback: number): number {
  const value = Number(element.value);
  return Number.isSafeInteger(value) ? value : fallback;
}

function decimalInput(
  element: HTMLInputElement,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(element.value);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(
    minimum,
    Math.min(maximum, Math.round(value * 10) / 10),
  );
}

function currentTransform(): TransformDescriptor {
  const rawFactor = Number(transformFactor.value);
  const factor = Number.isFinite(rawFactor)
    ? Math.max(0.125, Math.min(8, Math.round(rawFactor * 1000) / 1000))
    : 1;
  return {
    operation: transformOperation.value as TransformDescriptor["operation"],
    dx: integerInput(transformDx, 0),
    dy: integerInput(transformDy, 0),
    factor,
    angleDeg: decimalInput(transformAngle, 0, -36000, 36000),
    interpolationPolicy: "NEAREST_NEIGHBOR",
    outOfBoundsPolicy: "CLIP",
  };
}

function currentSelectionBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: integerInput(selectionX, 0),
    y: integerInput(selectionY, 0),
    width: integerInput(selectionWidth, 1),
    height: integerInput(selectionHeight, 1),
  };
}

function currentSelectionMorphologyRadius(): number {
  return Math.max(
    1,
    Math.min(32, integerInput(selectionMorphologyRadius, 1)),
  );
}

function updateHistoryButtons(): void {
  undoControl.disabled = history.undoDepth === 0 || transformCommitInFlight;
  redoControl.disabled = history.redoDepth === 0 || transformCommitInFlight;
  window.dispatchEvent(
    new CustomEvent("draw2:history-changed", {
      detail: draw2HistoryPanelSnapshot(),
    }),
  );
}

function updateSelectionStatus(message: string): void {
  selectionStatus.textContent = translateDraw2Text(message, draw2Locale);
}

function updateSelectionActionButtons(): void {
  commitSelectionControl.disabled = selectionDraft === undefined;
  cancelSelectionControl.disabled = selectionDraft === undefined &&
    pendingSelectionGesture === undefined;
  syncWorkspaceEditCommandState();
}

function syncWorkspaceEditCommandState(): void {
  const hasSelection = selection !== undefined &&
    selectionScopeMatchesActiveCel();
  const hasPreview = transformSession !== undefined &&
    transformPreview !== undefined;
  const transformBusy = transformCommitInFlight;
  const commandAvailability: Record<string, boolean> = {
    copy: hasSelection && !transformBusy,
    cut: hasSelection && !transformBusy,
    paste: clipboard !== undefined && !transformBusy,
    "preview-transform": hasSelection && !transformBusy,
    "commit-transform": hasPreview && !transformBusy,
    "cancel-transform": hasPreview,
  };
  for (
    const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-workspace-command]",
    )
  ) {
    const command = button.dataset.workspaceCommand;
    if (command === undefined || !(command in commandAvailability)) continue;
    const enabled = commandAvailability[command] === true;
    button.disabled = !enabled;
    button.setAttribute("aria-disabled", String(!enabled));
  }
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2SelectionReady = String(hasSelection);
    workspaceFrameElement.dataset.draw2TransformPreview = String(hasPreview);
    workspaceFrameElement.dataset.draw2ClipboardReady = String(
      clipboard !== undefined,
    );
  }
  updateHistoryButtons();
}

function selectionModeLabel(mode: SelectionEditMode): string {
  return mode.toLowerCase();
}

function selectionPointsFromSnapshot(
  snapshot: SelectionSnapshot | undefined,
): readonly { x: number; y: number }[] {
  return snapshot?.pixels.map(({ x, y }) => ({ x, y })) ?? [];
}

function normalizeTimelineSession(): void {
  const fallbackFrameId = state.timeline.frameOrder[0] ?? state.activeFrameId;
  const fallbackLayerTrackId = state.timeline.layerTrackOrder[0] ??
    state.activeLayerId;
  const frameId =
    state.timeline.frameOrder.includes(timelineSession.activeFrameId)
      ? timelineSession.activeFrameId
      : fallbackFrameId;
  const layerTrackId =
    state.timeline.layerTrackOrder.includes(timelineSession.activeLayerTrackId)
      ? timelineSession.activeLayerTrackId
      : fallbackLayerTrackId;
  timelineSession = {
    ...timelineSession,
    activeFrameId: frameId,
    selectedFrameId: frameId,
    activeLayerTrackId: layerTrackId,
  };
}

function timelineCssPixelValue(property: string, fallback: number): number {
  const value = Number.parseFloat(
    getComputedStyle(timelineViewport).getPropertyValue(property),
  );
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatTimelineClock(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const tenths = Math.floor((safeMilliseconds % 1_000) / 100);
  return `${String(minutes).padStart(2, "0")}:${
    String(seconds).padStart(2, "0")
  }.${tenths}`;
}

function playbackFpsValue(): number {
  const raw = playbackFpsControl.value === "custom"
    ? Number(playbackFpsCustomControl.value)
    : Number(playbackFpsControl.value);
  return Math.max(1, Math.min(240, Number.isFinite(raw) ? raw : 24));
}

function syncDrawTimelineToAudioWorkspace(): void {
  const bridge = (window as Window & {
    __pixiedraw2WorkspaceDebug?: WorkspacePxdBridge;
  }).__pixiedraw2WorkspaceDebug;
  if (typeof bridge?.setDrawTimelineFrames !== "function") return;
  const playbackFps = playbackFpsValue();
  const speedRatio = playbackFps / 24;
  const frames = state.timeline.frameOrder.map((frameId) => {
    const frame = state.frames.find((item) => item.frameId === frameId);
    return {
      frameId,
      // Draw playback scales the authored frame duration by playbackFps/24.
      // Audio receives the effective duration so a faster FPS visibly
      // produces the same chopped-up cells as the animation preview.
      durationMs: Math.max(
        1,
        (frame?.durationMs ?? 1_000 / playbackFps) / speedRatio,
      ),
    };
  });
  bridge.setDrawTimelineFrames(frames, playbackFps);
}

function updatePlaybackLoopControl(): void {
  const labels: Record<PlaybackLoopMode, string> = {
    off: "Play once",
    loop: "Loop playback",
    bounce: "Bounce playback",
  };
  const icons: Record<PlaybackLoopMode, string> = {
    off: "icon-chevron-right",
    loop: "icon-loop",
    bounce: "icon-bounce",
  };
  playbackLoopControl.dataset.loopMode = playbackLoopMode;
  setDraw2Icon(playbackLoopControl, icons[playbackLoopMode]);
  playbackLoopControl.setAttribute(
    "aria-label",
    localizeDraw2Text(labels[playbackLoopMode]),
  );
  playbackLoopControl.title = localizeDraw2Text(labels[playbackLoopMode]);
  playbackLoopControl.setAttribute(
    "aria-pressed",
    String(playbackLoopMode !== "off"),
  );
}

function cyclePlaybackLoopMode(): void {
  const modes: readonly PlaybackLoopMode[] = ["off", "loop", "bounce"];
  const currentIndex = modes.indexOf(playbackLoopMode);
  playbackLoopMode = modes[(currentIndex + 1) % modes.length] ?? "loop";
  updatePlaybackLoopControl();
  if (playbackRunning) {
    stopTimelinePlayback("Playback mode changed.");
    startTimelinePlayback();
  } else {
    renderTimeline();
  }
  scheduleDraw2EditorPreferencesSave();
}

interface TimelineCommandRunOptions {
  readonly recordHistory?: boolean;
  readonly announce?: boolean;
  readonly activationRequestId?: number;
}

function timelineCelId(frameId: string, layerTrackId: string): string {
  return state.cels.find((item) =>
    item.frameId === frameId && item.layerTrackId === layerTrackId
  )?.celId ??
    `${state.projectId}:cel:${layerTrackId}:${frameId}`;
}

async function activateTimelineCell(
  frameId: string,
  layerTrackId: string,
  immediate = false,
): Promise<boolean> {
  const requestId = ++timelineActivationRequestSequence;
  latestTimelineActivationRequestId = requestId;
  const celId = timelineCelId(frameId, layerTrackId);
  const target = state.cels.find((item) => item.celId === celId);
  const tilemapLayer = layerKind(layerTrackId) === "TILEMAP";
  if (tilemapLayer) ensureTilemapFor(layerTrackId, frameId);
  if (
    ((target?.assetId !== undefined &&
      target.bindingMode !== "DUPLICATE_INDEPENDENT") ||
      (tilemapLayer && target?.bindingMode === "TILEMAP")) &&
    state.activeFrameId === frameId && state.activeLayerId === layerTrackId &&
    state.activeCelId === celId &&
    (tilemapLayer || state.activeAssetId === target?.assetId)
  ) {
    // A newer request may have superseded an older in-flight activation. The
    // old finally block must not be responsible for clearing this flag.
    timelineActivationPending = false;
    await present();
    return true;
  }
  if (selection !== undefined || hasUncommittedSelectionWork()) {
    clearCommittedSelection(
      "Selection and transform preview cleared because the timeline target changed.",
    );
  }
  timelineActivationPending = true;
  try {
    const execute = immediate ? runTimelineCommandNow : runTimelineCommand;
    return await execute("timeline.activateCel", {
      celId,
      frameId,
      layerTrackId,
    }, {
      recordHistory: false,
      announce: false,
      activationRequestId: requestId,
    });
  } finally {
    if (requestId === latestTimelineActivationRequestId) {
      timelineActivationPending = false;
    }
  }
}

function syncTimelinePlaybackFrame(frameId: string): void {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  if (frameIndex < 0) return;
  const frame = state.frames.find((item) => item.frameId === frameId);
  if (frame === undefined) return;
  const elapsed = timelineFrameElapsedById.get(frameId) ?? 0;
  const cells = timelineWindow.querySelectorAll<HTMLButtonElement>(
    ".draw2-timeline-cell",
  );
  for (const cell of cells) {
    const isActiveFrame = cell.dataset.frameId === frameId;
    cell.dataset.activeFrame = String(isActiveFrame);
    cell.setAttribute(
      "aria-selected",
      String(
        cell.dataset.selected === "true" ||
          (isActiveFrame &&
            cell.dataset.layerTrackId === timelineSession.activeLayerTrackId),
      ),
    );
  }
  const rulerCells = timelineWindow.querySelectorAll<HTMLElement>(
    ".draw2-timeline-time-ruler-cell",
  );
  for (const rulerCell of rulerCells) {
    rulerCell.dataset.active = String(rulerCell.dataset.frameId === frameId);
  }
  const frameCellWidth = timelineCssPixelValue(
    "--draw2-timeline-cell-width",
    30,
  );
  const labelWidth = timelineCssPixelValue("--draw2-timeline-label-width", 180);
  const playhead = timelineWindow.querySelector<HTMLElement>(
    ".draw2-timeline-playhead",
  );
  if (playhead !== null) {
    playhead.style.left = `${
      labelWidth + Math.max(0, frameIndex) * frameCellWidth
    }px`;
    const playheadLabel = playhead.querySelector<HTMLElement>(
      ".draw2-timeline-playhead-label",
    );
    if (playheadLabel !== null) {
      playheadLabel.textContent = `F${frame.index + 1} · ${
        formatTimelineClock(elapsed)
      }`;
    }
  }
  const timelinePositionText = `F${frame.index + 1}/${state.frames.length} · ${
    formatTimelineClock(elapsed)
  }`;
  if (timelinePositionElement !== null) {
    timelinePositionElement.value = timelinePositionText;
    timelinePositionElement.textContent = timelinePositionText;
  }
}

function stopTimelinePlayback(message = "Timeline playback stopped."): void {
  playbackGeneration += 1;
  if (playbackAnimationFrame !== undefined) {
    window.cancelAnimationFrame(playbackAnimationFrame);
  }
  playbackAnimationFrame = undefined;
  playbackRunning = false;
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2PlaybackRunning = "false";
  }
  window.dispatchEvent(
    new CustomEvent("draw2:playback-state", { detail: { playing: false } }),
  );
  dispatchDrawAudioReferencePlayback(false);
  playbackFrameId = undefined;
  playbackStartFrameId = undefined;
  canvas.dataset.playbackFrameId = "";
  if (playbackOriginSession !== undefined) {
    timelineSession = playbackOriginSession;
    playbackOriginSession = undefined;
  }
  setDraw2Icon(togglePlaybackControl, "icon-play");
  togglePlaybackControl.title = localizeDraw2Text("Play timeline");
  togglePlaybackControl.setAttribute(
    "aria-label",
    localizeDraw2Text("Play timeline"),
  );
  togglePlaybackControl.setAttribute("aria-pressed", "false");
  syncMiniPreviewPlaybackControl();
  renderTimeline();
  void present();
  if (message) setStatus(message);
}

function scheduleTimelinePlayback(generation = playbackGeneration): void {
  if (
    !playbackRunning ||
    generation !== playbackGeneration ||
    playbackAnimationFrame !== undefined
  ) return;
  playbackAnimationFrame = window.requestAnimationFrame(() => {
    playbackAnimationFrame = undefined;
    if (!playbackRunning || generation !== playbackGeneration) return;
    tickTimelinePlayback(generation);
  });
}

function tickTimelinePlayback(generation = playbackGeneration): void {
  if (!playbackRunning || generation !== playbackGeneration) return;
  const elapsedMs = (performance.now() - playbackStartedAt) * playbackRate;
  const totalDuration = state.frames.reduce(
    (total, item) => total + item.durationMs,
    0,
  );
  if (playbackLoopMode === "off" && elapsedMs >= totalDuration) {
    const lastFrameId = state.timeline.frameOrder.at(-1);
    if (lastFrameId !== undefined) {
      timelineSession = setTimelineSessionActiveFrame(
        state,
        timelineSession,
        lastFrameId,
      );
    }
    stopTimelinePlayback("Timeline playback reached the last frame.");
    return;
  }
  try {
    let projectionElapsed = elapsedMs;
    if (playbackLoopMode === "bounce" && totalDuration > 0) {
      const cycleDuration = totalDuration * 2;
      const phase = elapsedMs % cycleDuration;
      projectionElapsed = phase < totalDuration
        ? phase
        : Math.max(0, totalDuration - (phase - totalDuration) - 0.001);
    }
    const projection = resolvePlaybackProjection(
      state,
      playbackStartFrameId ?? timelineSession.activeFrameId,
      projectionElapsed,
    );
    if (playbackFrameId !== projection.frameId) {
      playbackFrameId = projection.frameId;
      canvas.dataset.playbackFrameId = projection.frameId;
      timelineSession = setTimelineSessionActiveFrame(
        state,
        timelineSession,
        projection.frameId,
      );
      // Do not rebuild the timeline DOM for every frame. Reparenting the
      // corner controls during pointerdown/pointerup can swallow a pause
      // click; only update the already-rendered playback markers here.
      syncTimelinePlaybackFrame(projection.frameId);
      void presentPlaybackFrame(projection.frameId, generation);
    }
    scheduleTimelinePlayback(generation);
  } catch (cause) {
    stopTimelinePlayback(
      cause instanceof Error ? cause.message : "Timeline playback failed.",
    );
  }
}

function startTimelinePlayback(): void {
  if (state.timeline.frameOrder.length === 0) {
    setStatus("Timeline has no frames.", "error");
    return;
  }
  if (playbackAnimationFrame !== undefined) {
    window.cancelAnimationFrame(playbackAnimationFrame);
  }
  playbackAnimationFrame = undefined;
  playbackGeneration += 1;
  const generation = playbackGeneration;
  const fps = playbackFpsValue();
  playbackOriginSession = { ...timelineSession };
  playbackStartedAt = performance.now();
  playbackRate = fps / 24;
  playbackRunning = true;
  if (workspaceFrameElement !== null) {
    workspaceFrameElement.dataset.draw2PlaybackRunning = "true";
  }
  window.dispatchEvent(
    new CustomEvent("draw2:playback-state", { detail: { playing: true } }),
  );
  dispatchDrawAudioReferencePlayback(true);
  playbackFrameId = timelineSession.activeFrameId;
  playbackStartFrameId = timelineSession.activeFrameId;
  canvas.dataset.playbackFrameId = playbackFrameId;
  setDraw2Icon(togglePlaybackControl, "icon-pause");
  togglePlaybackControl.title = localizeDraw2Text("Pause timeline playback");
  togglePlaybackControl.setAttribute(
    "aria-label",
    localizeDraw2Text("Pause timeline playback"),
  );
  togglePlaybackControl.setAttribute("aria-pressed", "true");
  syncMiniPreviewPlaybackControl();
  renderTimeline();
  void presentPlaybackFrame(playbackFrameId, generation);
  scheduleTimelinePlayback(generation);
  setStatus(`Timeline playback ${fps} FPS; local preview only.`);
}

function dispatchDrawAudioReferencePlayback(playing: boolean): void {
  const activeFrameIndex =
    state.frames.find((frame) =>
      frame.frameId === timelineSession.activeFrameId
    )?.index ?? 0;
  const activeElapsedMs = state.timeline.frameOrder
    .slice(0, activeFrameIndex)
    .reduce((elapsedMs, frameId) => {
      const frame = state.frames.find((item) => item.frameId === frameId);
      return elapsedMs + Math.max(1, frame?.durationMs ?? 0);
    }, 0);
  window.dispatchEvent(
    new CustomEvent("draw2:audio-reference-playback", {
      detail: {
        playing,
        projectId: state.projectId,
        frameIndex: activeFrameIndex,
        elapsedMs: activeElapsedMs,
        references: drawAudioReferences.list().map((reference) => ({
          ...reference,
        })),
      },
    }),
  );
}

// Audio owns the musical clock and transport. Draw receives only a visual
// projection, so its frame cells can be short/chopped without turning the
// Piano Roll into a Draw-frame editor.
window.addEventListener("draw2:linked-preview-state", (event) => {
  const detail = (event as CustomEvent<{
    playing?: unknown;
    source?: unknown;
    monitor?: unknown;
  }>).detail;
  if (detail?.source !== "AUDIO") return;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  const playing = detail.playing === true && detail.monitor !== false;
  if (playing && playbackRunning) {
    stopTimelinePlayback("Audio monitor follows Audio.");
  }
});

window.addEventListener("draw2:audio-monitor-state", (event) => {
  const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  const visible = detail?.visible === true;
  if (visible) {
    // Audio owns the central artwork preview. Do not mutate the Draw-only
    // floating preview preference while the user is in iAUDIO.
    drawAudioDrawPreviewProjection();
  }
});

window.addEventListener("draw2:audio-editor-state", (event) => {
  const detail = (event as CustomEvent<{ editor?: unknown }>).detail;
  if (detail?.editor !== "DRAW") return;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  const frameId = state.timeline.frameOrder.includes(
    timelineSession.activeFrameId,
  )
    ? timelineSession.activeFrameId
    : state.timeline.frameOrder[0];
  if (frameId === undefined) {
    drawAudioDrawPreviewProjection();
    return;
  }
  playbackFrameId = frameId;
  canvas.dataset.playbackFrameId = frameId;
  void presentAudioLinkedPlaybackFrame(frameId);
});

window.addEventListener("draw2:audio-frame-sync", (event) => {
  const detail = (event as CustomEvent<{
    elapsedMs?: unknown;
    playing?: unknown;
  }>).detail;
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  if (
    audioDrawPreviewCanvasElement === null && !miniPreviewIsVisible()
  ) return;
  const elapsedMs = Number(detail?.elapsedMs);
  const firstFrameId = state.timeline.frameOrder[0] ??
    timelineSession.activeFrameId;
  if (!Number.isFinite(elapsedMs) || firstFrameId === undefined) return;
  // Audio reports real musical time. Draw's authored frame durations are
  // projected through the Draw FPS speed ratio so a faster visual FPS really
  // chops the artwork into shorter cells without changing the Audio grid.
  const drawProjectionElapsedMs = Math.max(0, elapsedMs) *
    (playbackFpsValue() / 24);
  const projection = resolvePlaybackProjection(
    state,
    firstFrameId,
    drawProjectionElapsedMs,
  );
  if (playbackFrameId === projection.frameId && detail?.playing !== true) {
    return;
  }
  playbackFrameId = projection.frameId;
  canvas.dataset.playbackFrameId = projection.frameId;
  timelineSession = setTimelineSessionActiveFrame(
    state,
    timelineSession,
    projection.frameId,
  );
  syncTimelinePlaybackFrame(projection.frameId);
  void presentAudioLinkedPlaybackFrame(projection.frameId);
});

function renderLayerPanel(): void {
  if (layerListElement === null) return;
  layerListElement.replaceChildren();
  for (const layerTrackId of state.timeline.layerTrackOrder) {
    const layer = state.layers.find((candidate) =>
      candidate.layerTrackId === layerTrackId
    );
    if (layer === undefined) continue;
    const row = document.createElement("div");
    row.className = `draw2-layer-row${
      timelineSession.activeLayerTrackId === layer.layerTrackId
        ? " is-active"
        : ""
    }`;
    row.dataset.layerKind = layer.kind === "TILEMAP" ? "tilemap" : "raster";
    row.setAttribute("role", "listitem");
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "draw2-layer-visibility";
    visibility.append(
      createDraw2Icon(layer.visible ? "icon-eye" : "icon-eye-off"),
    );
    visibility.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("visibility")}`,
    );
    visibility.setAttribute("aria-pressed", String(layer.visible));
    visibility.addEventListener("click", () => {
      void runTimelineCommand("timeline.setLayerVisibility", {
        layerTrackId: layer.layerTrackId,
        visible: !layer.visible,
      });
    });
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "draw2-layer-lock";
    lock.append(
      createDraw2Icon(layer.locked ? "icon-lock" : "icon-unlock"),
    );
    lock.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("lock")}`,
    );
    lock.setAttribute("aria-pressed", String(layer.locked));
    lock.addEventListener("click", () => {
      void runTimelineCommand("timeline.setLayerLock", {
        layerTrackId: layer.layerTrackId,
        locked: !layer.locked,
      });
    });
    const select = document.createElement("button");
    select.type = "button";
    select.className = "draw2-layer-select";
    const themeLabel = document.createElement("span");
    themeLabel.className = "draw2-layer-theme-label";
    themeLabel.setAttribute("aria-hidden", "true");
    themeLabel.dataset.layerVisible = String(layer.visible);
    const layerName = document.createElement("span");
    layerName.className = "draw2-layer-name";
    layerName.textContent = layer.kind === "TILEMAP"
      ? `▦ ${layer.name}`
      : layer.name;
    select.append(themeLabel, layerName);
    select.setAttribute(
      "aria-label",
      `${layer.name} layer${
        timelineSession.activeLayerTrackId === layer.layerTrackId
          ? ", selected"
          : ""
      }`,
    );
    select.addEventListener("click", () => {
      timelineSession = {
        ...timelineSession,
        activeLayerTrackId: layer.layerTrackId,
      };
      renderTimeline();
      void activateTimelineCell(
        timelineSession.activeFrameId,
        layer.layerTrackId,
      );
      setStatus(
        layer.kind === "TILEMAP"
          ? `${layer.name} selected · Tilesetからタイルを選んでCanvasへ配置できます。`
          : `${layer.name} selected.`,
      );
    });
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.className = "draw2-layer-opacity";
    opacity.min = "0";
    opacity.max = "1";
    opacity.step = "0.01";
    opacity.value = String(layer.opacity);
    opacity.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("opacity")}`,
    );
    opacity.addEventListener("change", () => {
      void runTimelineCommand("timeline.setLayerOpacity", {
        layerTrackId: layer.layerTrackId,
        opacity: Number(opacity.value),
      });
    });
    const blend = document.createElement("select");
    blend.className = "draw2-layer-blend";
    blend.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("blend mode")}`,
    );
    for (const mode of ["NORMAL", "MULTIPLY"] as const) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode === "NORMAL" ? "N" : "M";
      option.title = mode === "NORMAL" ? "Normal" : "Multiply";
      option.setAttribute(
        "aria-label",
        mode === "NORMAL" ? "Normal" : "Multiply",
      );
      option.selected = layer.blendMode === mode;
      blend.append(option);
    }
    blend.addEventListener("change", () => {
      void runTimelineCommand("timeline.setLayerBlendMode", {
        layerTrackId: layer.layerTrackId,
        blendMode: blend.value as "NORMAL" | "MULTIPLY",
      });
    });
    const nameGroup = document.createElement("div");
    nameGroup.className = "draw2-layer-name-group";
    nameGroup.append(visibility, select);
    row.append(nameGroup, lock, blend, opacity);
    layerListElement.append(row);
  }
}

function timelineCellKey(frameId: string, layerTrackId: string): string {
  return `${frameId}::${layerTrackId}`;
}

function setTimelineTab(tab: TimelineTab): void {
  activeTimelineTab = tab;
  for (const button of timelineTabs) {
    const isActive = button.dataset.draw2TimelineTab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of timelineTabPanels) {
    const isActive = panel.dataset.draw2TimelineTabPanel === tab;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  }
  timelineCard.dataset.activeTab = tab;
  timelineStatus.textContent = tab === "timeline"
    ? timelineStatus.textContent
    : `${tab[0]?.toUpperCase() ?? ""}${tab.slice(1)} view`;
  saveTimelinePropertiesPreference();
}

function positionOnionOptionsPopover(): void {
  if (!onionOptions.open || onionOptionsPopover === null) {
    onionOptionsPopover?.classList.remove("is-timeline-popover-positioned");
    onionOptionsPopover?.style.removeProperty("left");
    onionOptionsPopover?.style.removeProperty("top");
    return;
  }
  const gap = 6;
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  onionOptionsPopover.classList.add("is-timeline-popover-positioned");
  const anchor = toggleOnionControl.getBoundingClientRect();
  const popoverRect = onionOptionsPopover.getBoundingClientRect();
  const width = Math.min(popoverRect.width, viewportWidth - gap * 2);
  const height = Math.min(popoverRect.height, viewportHeight - gap * 2);
  const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.max(minimum, Math.min(maximum, value));
  let left = anchor.left;
  let top = anchor.bottom + gap;
  if (left + width > viewportWidth - gap) left = anchor.right - width;
  if (top + height > viewportHeight - gap) top = anchor.top - height - gap;
  onionOptionsPopover.style.setProperty(
    "left",
    `${Math.round(clamp(left, gap, viewportWidth - width - gap))}px`,
  );
  onionOptionsPopover.style.setProperty(
    "top",
    `${Math.round(clamp(top, gap, viewportHeight - height - gap))}px`,
  );
}

function selectTimelineCell(
  frameId: string,
  layerTrackId: string,
  event: MouseEvent,
): void {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  const layerIndex = state.timeline.layerTrackOrder.indexOf(layerTrackId);
  if (frameIndex < 0 || layerIndex < 0) return;
  const key = timelineCellKey(frameId, layerTrackId);
  const toggle = event.metaKey || event.ctrlKey;
  if (event.shiftKey && timelineSelectionAnchor !== undefined) {
    const minFrame = Math.min(timelineSelectionAnchor.frameIndex, frameIndex);
    const maxFrame = Math.max(timelineSelectionAnchor.frameIndex, frameIndex);
    const minLayer = Math.min(timelineSelectionAnchor.layerIndex, layerIndex);
    const maxLayer = Math.max(timelineSelectionAnchor.layerIndex, layerIndex);
    if (!toggle) timelineSelectedCells.clear();
    for (let frame = minFrame; frame <= maxFrame; frame += 1) {
      for (let layer = minLayer; layer <= maxLayer; layer += 1) {
        const frameKey = state.timeline.frameOrder[frame];
        const layerKey = state.timeline.layerTrackOrder[layer];
        if (frameKey !== undefined && layerKey !== undefined) {
          timelineSelectedCells.add(timelineCellKey(frameKey, layerKey));
        }
      }
    }
  } else if (toggle) {
    if (timelineSelectedCells.has(key)) timelineSelectedCells.delete(key);
    else timelineSelectedCells.add(key);
    timelineSelectionAnchor = { frameIndex, layerIndex };
  } else {
    timelineSelectedCells.clear();
    timelineSelectedCells.add(key);
    timelineSelectionAnchor = { frameIndex, layerIndex };
  }
  timelineSession = {
    ...setTimelineSessionActiveFrame(state, timelineSession, frameId),
    activeLayerTrackId: layerTrackId,
  };
  renderTimeline();
  void activateTimelineCell(frameId, layerTrackId);
}

function selectTimelineFrame(frameId: string, event: MouseEvent): void {
  const frameIndex = state.timeline.frameOrder.indexOf(frameId);
  if (frameIndex < 0) return;
  const frameIds = event.shiftKey && timelineSelectionAnchor !== undefined
    ? state.timeline.frameOrder.slice(
      Math.min(frameIndex, timelineSelectionAnchor.frameIndex),
      Math.max(frameIndex, timelineSelectionAnchor.frameIndex) + 1,
    )
    : [frameId];
  if (!(event.metaKey || event.ctrlKey)) timelineSelectedCells.clear();
  for (const selectedFrameId of frameIds) {
    for (const layerTrackId of state.timeline.layerTrackOrder) {
      timelineSelectedCells.add(timelineCellKey(selectedFrameId, layerTrackId));
    }
  }
  timelineSelectionAnchor = {
    frameIndex,
    layerIndex: Math.max(
      0,
      state.timeline.layerTrackOrder.indexOf(
        timelineSession.activeLayerTrackId,
      ),
    ),
  };
  const activeLayerTrackId = timelineSession.activeLayerTrackId ||
    state.timeline.layerTrackOrder[0];
  if (activeLayerTrackId !== undefined) {
    timelineSession = {
      ...setTimelineSessionActiveFrame(state, timelineSession, frameId),
      activeLayerTrackId,
    };
    renderTimeline();
    void activateTimelineCell(frameId, activeLayerTrackId);
  }
}

function selectTimelineLayer(layerTrackId: string, event: MouseEvent): void {
  const layerIndex = state.timeline.layerTrackOrder.indexOf(layerTrackId);
  if (layerIndex < 0) return;
  if (!(event.metaKey || event.ctrlKey)) timelineSelectedCells.clear();
  for (const frameId of state.timeline.frameOrder) {
    timelineSelectedCells.add(timelineCellKey(frameId, layerTrackId));
  }
  timelineSelectionAnchor = {
    frameIndex: Math.max(
      0,
      state.timeline.frameOrder.indexOf(timelineSession.activeFrameId),
    ),
    layerIndex,
  };
  timelineSession = { ...timelineSession, activeLayerTrackId: layerTrackId };
  renderTimeline();
  void activateTimelineCell(timelineSession.activeFrameId, layerTrackId);
}

function closeTimelineContextMenu(): void {
  timelineContext.hidden = true;
  timelineContextTarget = undefined;
}

function openTimelineContextMenu(
  event: MouseEvent,
  frameId: string,
  layerTrackId: string,
): void {
  event.preventDefault();
  const target = state.cels.find((cel) =>
    cel.frameId === frameId && cel.layerTrackId === layerTrackId
  );
  timelineContextTarget = {
    frameId,
    layerTrackId,
    celId: target?.celId ?? timelineCelId(frameId, layerTrackId),
  };
  timelineContext.hidden = false;
  const menuWidth = 172;
  const menuHeight = 178;
  timelineContext.style.left = `${
    Math.max(8, Math.min(window.innerWidth - menuWidth - 8, event.clientX))
  }px`;
  timelineContext.style.top = `${
    Math.max(8, Math.min(window.innerHeight - menuHeight - 8, event.clientY))
  }px`;
}

async function runTimelineContextAction(action: string): Promise<void> {
  const target = timelineContextTarget;
  closeTimelineContextMenu();
  if (target === undefined) return;
  if (action === "clear") {
    const cel = state.cels.find((item) => item.celId === target.celId);
    if (cel?.assetId !== undefined) {
      await runTimelineCommand("timeline.clearCel", { celId: cel.celId });
    } else {
      setStatus("Cel is already empty.");
    }
    return;
  }
  if (action === "duplicate-frame") {
    await runTimelineCommand("timeline.duplicateFrame", {
      sourceFrameId: target.frameId,
      frameId: `${state.projectId}:frame:context:${
        structureClientSequence + 1
      }`,
    });
    return;
  }
  if (action === "link" || action === "unlink") {
    await activateTimelineCell(target.frameId, target.layerTrackId);
    if (action === "link") toggleActiveLinkedCel();
    else {
      linkedCelBindings = linkedCelBindings.filter((binding) =>
        binding.celId !== state.activeCelId
      );
      renderCreatorTimelineMetadata();
      setStatus("Active Cel link removed from local metadata.");
    }
    return;
  }
  setStatus("Timeline properties are available from the Inspector.");
}

function saveTimelinePropertiesPreference(): void {
  try {
    window.localStorage.setItem(
      TIMELINE_PROPERTIES_STORAGE_KEY,
      JSON.stringify({
        width: timelinePropertiesWidth,
        collapsed: timelinePropertiesCollapsed,
        activeTab: activeTimelineTab,
      }),
    );
  } catch {
    // Workspace preferences are optional and never block editing.
  }
}

function applyTimelinePropertiesLayout(): void {
  timelineCard.style.setProperty(
    "--draw2-timeline-properties-width",
    `${Math.round(timelinePropertiesWidth)}px`,
  );
  timelineCard.dataset.propertiesCollapsed = String(
    timelinePropertiesCollapsed,
  );
  timelineProperties.classList.toggle(
    "is-collapsed",
    timelinePropertiesCollapsed,
  );
  timelinePropertiesCollapse.setAttribute(
    "aria-expanded",
    String(!timelinePropertiesCollapsed),
  );
  setDraw2Icon(
    timelinePropertiesCollapse,
    timelinePropertiesCollapsed ? "icon-chevron-right" : "icon-chevron-left",
  );
  timelinePropertiesCollapse.title = timelinePropertiesCollapsed
    ? "Expand layer properties"
    : "Collapse layer properties";
  timelinePropertiesCollapse.setAttribute(
    "aria-label",
    timelinePropertiesCollapsed
      ? "Expand layer properties"
      : "Collapse layer properties",
  );
}

function renderTimelineLayerProperties(): void {
  timelinePropertiesBody.replaceChildren();
  applyTimelinePropertiesLayout();
  const layer = state.layers.find((item) =>
    item.layerTrackId === timelineSession.activeLayerTrackId
  );
  if (layer === undefined) {
    const empty = document.createElement("span");
    empty.className = "draw2-timeline-properties-empty";
    empty.textContent = localizeDraw2Text("Select a layer");
    timelinePropertiesBody.append(empty);
    return;
  }

  const nameLabel = document.createElement("label");
  nameLabel.className = "draw2-timeline-property-field";
  const nameText = document.createElement("span");
  nameText.textContent = localizeDraw2Text("Layer name");
  const nameInput = document.createElement("input");
  nameInput.className = "draw2-timeline-property-input";
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = layer.name;
  nameInput.setAttribute(
    "aria-label",
    `${layer.name} ${localizeDraw2Text("Layer name")}`,
  );
  nameInput.addEventListener("change", () => {
    const nextName = nameInput.value.trim();
    if (nextName.length === 0 || nextName === layer.name) {
      nameInput.value = layer.name;
      return;
    }
    void runTimelineCommand("timeline.renameLayerTrack", {
      layerTrackId: layer.layerTrackId,
      name: nextName,
    });
  });
  nameLabel.append(nameText, nameInput);
  timelinePropertiesBody.append(nameLabel);

  const blendLabel = document.createElement("label");
  blendLabel.className = "draw2-timeline-property-field";
  const blendText = document.createElement("span");
  blendText.textContent = localizeDraw2Text("Mode");
  const blend = document.createElement("select");
  blend.className = "draw2-timeline-property-select";
  blend.setAttribute(
    "aria-label",
    `${layer.name} ${localizeDraw2Text("blend mode")}`,
  );
  for (const mode of ["NORMAL", "MULTIPLY"] as const) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = localizeDraw2Text(
      mode === "NORMAL" ? "Normal" : "Multiply",
    );
    option.selected = layer.blendMode === mode;
    blend.append(option);
  }
  blend.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerBlendMode", {
      layerTrackId: layer.layerTrackId,
      blendMode: blend.value as "NORMAL" | "MULTIPLY",
    });
  });
  blendLabel.append(blendText, blend);
  timelinePropertiesBody.append(blendLabel);

  const opacityLabel = document.createElement("label");
  opacityLabel.className =
    "draw2-timeline-property-field draw2-timeline-property-opacity";
  const opacityHeader = document.createElement("span");
  opacityHeader.className = "draw2-timeline-property-field-heading";
  const opacityText = document.createElement("span");
  opacityText.textContent = localizeDraw2Text("Opacity");
  const opacityValue = document.createElement("output");
  opacityValue.textContent = `${Math.round(layer.opacity * 100)}%`;
  opacityHeader.append(opacityText, opacityValue);
  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "1";
  opacity.step = "0.01";
  opacity.value = String(layer.opacity);
  opacity.setAttribute(
    "aria-label",
    `${layer.name} ${localizeDraw2Text("opacity")}`,
  );
  opacity.addEventListener("input", () => {
    opacityValue.textContent = `${Math.round(Number(opacity.value) * 100)}%`;
  });
  opacity.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerOpacity", {
      layerTrackId: layer.layerTrackId,
      opacity: Number(opacity.value),
    });
  });
  opacityLabel.append(opacityHeader, opacity);
  timelinePropertiesBody.append(opacityLabel);

  const visibility = document.createElement("label");
  visibility.className = "draw2-timeline-property-toggle";
  const visibilityInput = document.createElement("input");
  visibilityInput.type = "checkbox";
  visibilityInput.checked = layer.visible;
  visibilityInput.setAttribute(
    "aria-label",
    `${layer.name} ${localizeDraw2Text("visibility")}`,
  );
  visibilityInput.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerVisibility", {
      layerTrackId: layer.layerTrackId,
      visible: visibilityInput.checked,
    });
  });
  const visibilityText = document.createElement("span");
  visibilityText.textContent = localizeDraw2Text("Visible");
  visibility.append(visibilityInput, visibilityText);
  timelinePropertiesBody.append(visibility);

  const lock = document.createElement("label");
  lock.className = "draw2-timeline-property-toggle";
  const lockInput = document.createElement("input");
  lockInput.type = "checkbox";
  lockInput.checked = layer.locked;
  lockInput.setAttribute(
    "aria-label",
    `${layer.name} ${localizeDraw2Text("lock")}`,
  );
  lockInput.addEventListener("change", () => {
    void runTimelineCommand("timeline.setLayerLock", {
      layerTrackId: layer.layerTrackId,
      locked: lockInput.checked,
    });
  });
  const lockText = document.createElement("span");
  lockText.textContent = localizeDraw2Text("Lock");
  lock.append(lockInput, lockText);
  timelinePropertiesBody.append(lock);
}

function renderTimeline(): void {
  normalizeTimelineSession();
  syncDrawTimelineToAudioWorkspace();
  if (!timelineViewportInitialized) {
    // The first frame is the stable origin of the matrix.  Do not inherit a
    // browser-restored horizontal offset before the header/cel projections
    // have established the label column.
    timelineViewport.scrollLeft = 0;
    timelineViewport.scrollTop = 0;
    timelineSession = { ...timelineSession, scrollLeft: 0, scrollTop: 0 };
    timelineViewportInitialized = true;
  }
  lastRenderedTimelineScrollTop = timelineViewport.scrollTop;
  lastRenderedTimelineScrollLeft = timelineViewport.scrollLeft;
  for (const key of [...timelineSelectedCells]) {
    const [frameId, layerTrackId] = key.split("::");
    if (
      !state.timeline.frameOrder.includes(frameId ?? "") ||
      !state.timeline.layerTrackOrder.includes(layerTrackId ?? "")
    ) {
      timelineSelectedCells.delete(key);
    }
  }
  const labelWidth = timelineCssPixelValue("--draw2-timeline-label-width", 180);
  const frameCellWidth = timelineCssPixelValue(
    "--draw2-timeline-cell-width",
    30,
  );
  const layerRowHeight = timelineCssPixelValue(
    "--draw2-timeline-row-height",
    30,
  );
  const frameElapsedById = new Map<string, number>();
  let totalDurationMs = 0;
  for (
    const frame of [...state.frames].sort((left, right) =>
      left.index - right.index
    )
  ) {
    frameElapsedById.set(frame.frameId, totalDurationMs);
    totalDurationMs += frame.durationMs;
  }
  timelineFrameElapsedById = frameElapsedById;
  const rulerHeight = 20;
  const headerHeight = layerRowHeight + rulerHeight;
  const virtualWindow = calculateTimelineWindow(state, {
    scrollTop: Math.max(0, timelineViewport.scrollTop - headerHeight),
    scrollLeft: Math.max(0, timelineViewport.scrollLeft - labelWidth),
    viewportWidth: Math.max(1, timelineViewport.clientWidth + labelWidth),
    viewportHeight: Math.max(1, timelineViewport.clientHeight + headerHeight),
    frameCellWidth,
    layerRowHeight,
    overscan: 2,
  });
  // Keep a full-width projection behind the real frames. The Draw timeline
  // is virtualized, but a short project must still read as a usable timeline
  // instead of ending in an unexplained empty canvas.
  const timelineContentWidth = Math.max(
    labelWidth + virtualWindow.totalWidth,
    timelineViewport.clientWidth,
  );
  const timelineContentHeight = Math.max(
    76,
    headerHeight + virtualWindow.totalHeight + layerRowHeight * 2,
  );
  timelineSpacer.style.width = `${timelineContentWidth}px`;
  timelineSpacer.style.height = `${timelineContentHeight}px`;
  timelineWindow.replaceChildren();
  timelineSecondaryControls.replaceChildren();

  const headerRow = document.createElement("div");
  headerRow.className = "draw2-timeline-header-row";
  headerRow.style.top = `${rulerHeight}px`;
  headerRow.style.height = `${layerRowHeight}px`;
  headerRow.setAttribute("role", "row");
  headerRow.setAttribute("aria-label", localizeDraw2Text("Frame numbers"));
  const corner = document.createElement("div");
  corner.className = "draw2-timeline-corner";
  corner.setAttribute("role", "columnheader");
  corner.setAttribute("aria-label", localizeDraw2Text("Timeline controls"));
  corner.dataset.intersectionAction = "timeline-controls";
  const cornerControls = document.createElement("div");
  cornerControls.className = "draw2-timeline-corner-controls";
  addLayerControl.hidden = true;
  const playbackControlLabel = playbackRunning
    ? "Pause timeline playback"
    : "Play timeline";
  const timelineCornerControls: Array<[HTMLButtonElement, string, string]> = [
    [togglePlaybackControl, playbackControlLabel, playbackControlLabel],
    [duplicateFrameControl, "Duplicate frame", "Duplicate frame"],
    [playbackLoopControl, "Loop playback", "Loop playback"],
  ];
  for (
    const control of [
      addFrameControl,
      removeFrameControl,
      reorderLayerControl,
      toggleLayerControl,
      linkedCelToggleControl,
    ]
  ) {
    control.hidden = true;
  }
  for (const [control, label, title] of timelineCornerControls) {
    control.hidden = false;
    control.classList.add("draw2-timeline-corner-button");
    control.setAttribute("aria-label", localizeDraw2Text(label));
    control.title = localizeDraw2Text(title);
  }
  const moreControls = document.querySelector<HTMLElement>(
    ".draw2-timeline-more-controls",
  );
  if (moreControls !== null) moreControls.hidden = true;
  const moreActions = document.querySelector<HTMLElement>(
    ".draw2-timeline-more-actions",
  );
  if (moreActions !== null) moreActions.hidden = true;
  cornerControls.append(
    ...timelineCornerControls.map(([control]) => control),
  );
  corner.append(cornerControls);
  if (playbackRateGroup !== null) {
    timelineSecondaryControls.append(playbackRateGroup);
  }
  toggleOnionControl.hidden = false;
  onionOptions.hidden = false;
  timelineSecondaryControls.append(toggleOnionControl, onionOptions);
  headerRow.append(corner);
  virtualWindow.frameIds.forEach((frameId, frameOffset) => {
    const frame = state.frames.find((item) => item.frameId === frameId);
    if (frame === undefined) return;
    const frameNumber = frame.index + 1;
    const headerCell = document.createElement("button");
    headerCell.type = "button";
    headerCell.className = "draw2-timeline-frame-header";
    headerCell.style.left = `${
      labelWidth +
      (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth
    }px`;
    headerCell.textContent = String(frameNumber);
    headerCell.setAttribute("role", "columnheader");
    headerCell.setAttribute(
      "aria-label",
      `${localizeDraw2Text("Frame")} ${frameNumber}`,
    );
    headerCell.setAttribute(
      "aria-selected",
      String(timelineSession.activeFrameId === frameId),
    );
    headerCell.dataset.selected = String(
      state.timeline.layerTrackOrder.every((layerTrackId) =>
        timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId))
      ),
    );
    const frameAnnotations: string[] = [];
    const frameTags = animationTags.list().filter((tag) =>
      frame.index >= tag.fromFrameIndex && frame.index <= tag.toFrameIndex
    );
    if (frameTags.length > 0) {
      headerCell.dataset.tagCount = String(frameTags.length);
      frameAnnotations.push(...frameTags.map((tag) => tag.name));
    }
    const frameMarkers = timelineMarkers.list(frame.index);
    if (frameMarkers.length > 0) {
      headerCell.dataset.markerKind = frameMarkers[0]?.kind ?? "NOTE";
      headerCell.dataset.markerCount = String(frameMarkers.length);
      frameAnnotations.push(
        ...frameMarkers.map((marker) => `${marker.kind}: ${marker.label}`),
      );
      headerCell.setAttribute(
        "aria-label",
        `Frame ${frameNumber}, ${frameMarkers.length} marker${
          frameMarkers.length === 1 ? "" : "s"
        }`,
      );
    }
    headerCell.dataset.frameId = frameId;
    headerCell.dataset.durationMs = String(frame.durationMs);
    headerCell.dataset.timeStart = formatTimelineClock(
      frameElapsedById.get(frameId) ?? 0,
    );
    headerCell.title = [
      `${localizeDraw2Text("Frame")} ${frameNumber}`,
      formatTimelineClock(frameElapsedById.get(frameId) ?? 0),
      `${frame.durationMs} ms`,
      ...frameAnnotations,
    ].join(" · ");
    headerCell.addEventListener(
      "click",
      (event) => selectTimelineFrame(frameId, event),
    );
    headerRow.append(headerCell);
  });
  if (virtualWindow.lastFrameIndex === state.timeline.frameOrder.length - 1) {
    const addFrameCell = document.createElement("button");
    addFrameCell.type = "button";
    addFrameCell.className =
      "draw2-timeline-frame-header draw2-timeline-command-cell";
    addFrameCell.style.left = `${
      labelWidth + state.timeline.frameOrder.length * frameCellWidth
    }px`;
    addFrameCell.classList.add("draw2-button-icon");
    addFrameCell.append(createDraw2Icon("icon-add"));
    addFrameCell.setAttribute(
      "aria-label",
      localizeDraw2Text("Add frame"),
    );
    addFrameCell.title = localizeDraw2Text("Add frame");
    addFrameCell.addEventListener("click", () => {
      void runTimelineCommand("timeline.addFrame", {
        frameId: `${state.projectId}:frame:ui:${structureClientSequence + 1}`,
        durationMs: 100,
      });
    });
    headerRow.append(addFrameCell);
  }
  const activeFrameIndex = state.timeline.frameOrder.indexOf(
    timelineSession.activeFrameId,
  );
  const activeFrameElapsed = frameElapsedById.get(
    timelineSession.activeFrameId,
  ) ?? 0;
  const timeRuler = document.createElement("div");
  timeRuler.className = "draw2-timeline-time-ruler";
  timeRuler.style.height = `${rulerHeight}px`;
  timeRuler.style.minWidth = `${timelineContentWidth}px`;
  timeRuler.setAttribute("role", "row");
  timeRuler.setAttribute("aria-label", "Timeline time ruler");
  const timeRulerCorner = document.createElement("div");
  timeRulerCorner.className = "draw2-timeline-time-ruler-corner";
  timeRulerCorner.textContent = "TIME";
  timeRulerCorner.setAttribute("aria-hidden", "true");
  timeRuler.append(timeRulerCorner);
  virtualWindow.frameIds.forEach((frameId, frameOffset) => {
    const frame = state.frames.find((item) => item.frameId === frameId);
    if (frame === undefined) return;
    const rulerCell = document.createElement("div");
    rulerCell.className = "draw2-timeline-time-ruler-cell";
    rulerCell.style.left = `${
      labelWidth +
      (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth
    }px`;
    rulerCell.style.width = `${frameCellWidth}px`;
    rulerCell.dataset.frameId = frameId;
    rulerCell.dataset.active = String(
      timelineSession.activeFrameId === frameId,
    );
    if (frame.index === 0 || frame.index % 5 === 0) {
      const label = document.createElement("span");
      label.textContent = formatTimelineClock(
        frameElapsedById.get(frameId) ?? 0,
      );
      rulerCell.append(label);
    }
    timeRuler.append(rulerCell);
  });
  const playhead = document.createElement("div");
  playhead.className = "draw2-timeline-playhead";
  playhead.style.left = `${
    labelWidth + Math.max(0, activeFrameIndex) * frameCellWidth
  }px`;
  playhead.style.height = `${
    headerHeight + virtualWindow.totalHeight + layerRowHeight
  }px`;
  playhead.setAttribute("aria-hidden", "true");
  const playheadLabel = document.createElement("span");
  playheadLabel.className = "draw2-timeline-playhead-label";
  playheadLabel.textContent = `F${Math.max(0, activeFrameIndex) + 1} · ${
    formatTimelineClock(activeFrameElapsed)
  }`;
  playhead.append(playheadLabel);
  timelineWindow.append(timeRuler, playhead);
  timelineWindow.append(headerRow);

  virtualWindow.layerTrackIds.forEach((layerTrackId, layerOffset) => {
    const layer = state.layers.find((item) =>
      item.layerTrackId === layerTrackId
    );
    if (layer === undefined) return;
    const row = document.createElement("div");
    row.className = "draw2-timeline-row";
    row.style.top = `${
      headerHeight +
      (virtualWindow.firstLayerIndex + layerOffset) * layerRowHeight
    }px`;
    row.dataset.layerVisible = String(layer.visible);
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", layer.name);
    const label = document.createElement("div");
    label.className = "draw2-timeline-row-label";
    label.tabIndex = 0;
    label.setAttribute("role", "rowheader");
    label.dataset.layerVisible = String(layer.visible);
    label.dataset.selected = String(
      state.timeline.frameOrder.every((frameId) =>
        timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId))
      ),
    );
    label.dataset.locked = String(layer.locked);
    label.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("Layer Track")}${
        timelineSession.activeLayerTrackId === layerTrackId
          ? `, ${localizeDraw2Text("selected")}`
          : ""
      }`,
    );
    label.setAttribute(
      "aria-pressed",
      String(timelineSession.activeLayerTrackId === layerTrackId),
    );
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "draw2-timeline-row-visibility";
    visibility.append(
      createDraw2Icon(layer.visible ? "icon-eye" : "icon-eye-off"),
    );
    visibility.setAttribute(
      "aria-label",
      `${layer.name} ${localizeDraw2Text("visibility")}`,
    );
    visibility.setAttribute("aria-pressed", String(layer.visible));
    visibility.title = localizeDraw2Text(
      layer.visible ? "Hide layer" : "Show layer",
    );
    visibility.addEventListener("click", (event) => {
      event.stopPropagation();
      void runTimelineCommand("timeline.setLayerVisibility", {
        layerTrackId: layer.layerTrackId,
        visible: !layer.visible,
      });
    });
    const layerDot = document.createElement("span");
    layerDot.className = "draw2-timeline-row-layer-dot";
    layerDot.dataset.layerVisible = String(layer.visible);
    layerDot.setAttribute("aria-hidden", "true");
    const layerName = document.createElement("span");
    layerName.className = "draw2-timeline-row-label-name";
    layerName.textContent = layer.name;
    layerName.title = layer.name;
    label.append(visibility, layerDot, layerName);
    label.addEventListener(
      "click",
      (event) => selectTimelineLayer(layerTrackId, event),
    );
    label.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      selectTimelineLayer(layerTrackId, new MouseEvent("click"));
    });
    row.append(label);
    virtualWindow.frameIds.forEach((frameId, frameOffset) => {
      const frame = state.frames.find((item) => item.frameId === frameId);
      if (frame === undefined) return;
      const cellBinding = state.cels.find((item) =>
        item.frameId === frameId && item.layerTrackId === layerTrackId
      );
      const cellAsset = cellBinding?.assetId === undefined
        ? undefined
        : state.assets[cellBinding.assetId];
      const hasDrawing = cellAsset?.raster.hasNonTransparentPixel() ?? false;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "draw2-timeline-cell";
      cell.style.left = `${
        labelWidth +
        (virtualWindow.firstFrameIndex + frameOffset) * frameCellWidth
      }px`;
      cell.setAttribute(
        "aria-label",
        `${layer.name}, ${localizeDraw2Text("Frame")} ${frame.index + 1}${
          cellBinding === undefined || cellBinding.assetId === undefined
            ? `, ${localizeDraw2Text("Empty Cel")}`
            : `, ${localizeDraw2Text("Raster Cel")}`
        }`,
      );
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-selected",
        String(
          timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId)) ||
            (timelineSession.activeFrameId === frameId &&
              timelineSession.activeLayerTrackId === layerTrackId),
        ),
      );
      cell.dataset.selected = String(
        timelineSelectedCells.has(timelineCellKey(frameId, layerTrackId)),
      );
      cell.dataset.activeFrame = String(
        timelineSession.activeFrameId === frameId,
      );
      cell.dataset.locked = String(layer.locked);
      cell.dataset.linked = String(
        cellBinding !== undefined &&
          linkedCelBindings.some((binding) =>
            binding.celId === cellBinding.celId
          ),
      );
      cell.dataset.frameId = frameId;
      cell.dataset.durationMs = String(frame.durationMs);
      cell.dataset.empty = String(
        cellBinding === undefined || cellBinding.assetId === undefined,
      );
      cell.dataset.hasDrawing = String(hasDrawing);
      cell.dataset.layerVisible = String(layer.visible);
      cell.dataset.layerTrackId = layerTrackId;
      if (cell.dataset.linked === "true") {
        cell.append(createDraw2Icon("icon-link", "draw2-timeline-linked-icon"));
      }
      cell.addEventListener(
        "click",
        (event) => selectTimelineCell(frameId, layerTrackId, event),
      );
      cell.addEventListener(
        "contextmenu",
        (event) => openTimelineContextMenu(event, frameId, layerTrackId),
      );
      row.append(cell);
    });
    timelineWindow.append(row);
  });
  if (
    virtualWindow.lastLayerIndex === state.timeline.layerTrackOrder.length - 1
  ) {
    const audioRow = document.createElement("div");
    audioRow.className = "draw2-timeline-row draw2-timeline-audio-row";
    audioRow.style.top = `${
      headerHeight + state.timeline.layerTrackOrder.length * layerRowHeight
    }px`;
    audioRow.setAttribute("role", "row");
    audioRow.setAttribute("aria-label", "Audio track");
    const audioLabel = document.createElement("div");
    audioLabel.className =
      "draw2-timeline-row-label draw2-timeline-audio-label";
    audioLabel.setAttribute("role", "rowheader");
    const audioTitle = document.createElement("span");
    audioTitle.className = "draw2-timeline-audio-title";
    audioTitle.append(
      createDraw2Icon("icon-note"),
      document.createTextNode("Audio"),
    );
    audioLabel.append(audioTitle);
    if (drawAudioAssetPicker !== null && drawAudioAdd !== null) {
      drawAudioAssetPicker.classList.add("draw2-timeline-audio-picker");
      drawAudioAdd.classList.add("draw2-timeline-audio-add");
      drawAudioAdd.textContent = "+";
      drawAudioAdd.title = "選択中のフレームからAudioを追加";
      drawAudioAdd.setAttribute(
        "aria-label",
        "選択中のフレームからAudioを追加",
      );
      audioLabel.append(drawAudioAssetPicker, drawAudioAdd);
    }
    audioRow.append(audioLabel);
    const visibleFirstFrame = virtualWindow.firstFrameIndex;
    const visibleLastFrame = virtualWindow.lastFrameIndex;
    for (const reference of drawAudioReferences.list()) {
      const referenceEnd = reference.startFrame + reference.durationFrames - 1;
      if (
        referenceEnd < visibleFirstFrame ||
        reference.startFrame > visibleLastFrame
      ) continue;
      const visibleStart = Math.max(reference.startFrame, visibleFirstFrame);
      const visibleEnd = Math.min(referenceEnd, visibleLastFrame);
      const block = document.createElement("button");
      block.type = "button";
      block.className = "draw2-timeline-audio-clip";
      block.dataset.audioKind = reference.kind;
      block.style.left = `${labelWidth + visibleStart * frameCellWidth}px`;
      block.style.width = `${
        Math.max(
          frameCellWidth,
          (visibleEnd - visibleStart + 1) * frameCellWidth,
        )
      }px`;
      block.textContent = `${reference.kind} · ${reference.label}`;
      block.title = `${reference.label} · F${reference.startFrame + 1}から`;
      block.setAttribute(
        "aria-label",
        `${reference.kind} ${reference.label}, frame ${
          reference.startFrame + 1
        }`,
      );
      block.addEventListener("click", () => {
        const frame = state.frames.find((item) =>
          item.index === reference.startFrame
        );
        if (frame !== undefined) {
          selectTimelineFrame(frame.frameId, new MouseEvent("click"));
        }
      });
      block.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        drawAudioReferences.remove(reference.id);
        queueDrawPersistenceSave("draw-audio-reference-remove");
        renderTimeline();
        setStatus(`Audio参照 ${reference.label} を削除しました。`);
      });
      audioRow.append(block);
    }
    timelineWindow.append(audioRow);
  }
  if (
    virtualWindow.lastLayerIndex === state.timeline.layerTrackOrder.length - 1
  ) {
    const addLayerRow = document.createElement("div");
    addLayerRow.className = "draw2-timeline-row draw2-timeline-layer-add-row";
    addLayerRow.style.top = `${
      headerHeight +
      (state.timeline.layerTrackOrder.length + 1) * layerRowHeight
    }px`;
    addLayerRow.setAttribute("role", "row");
    addLayerRow.setAttribute("aria-label", localizeDraw2Text("Add layer"));
    const addLayerHeader = document.createElement("button");
    addLayerHeader.type = "button";
    addLayerHeader.className =
      "draw2-timeline-row-label draw2-timeline-layer-add-header draw2-timeline-command-cell";
    addLayerHeader.classList.add("draw2-button-icon");
    addLayerHeader.append(createDraw2Icon("icon-add"));
    addLayerHeader.setAttribute(
      "aria-label",
      localizeDraw2Text("Add layer"),
    );
    addLayerHeader.title = localizeDraw2Text("Add layer");
    addLayerHeader.addEventListener("click", () => addLayerControl.click());
    addLayerRow.append(addLayerHeader);
    timelineWindow.append(addLayerRow);
  }
  const onionCount = onionSkinEnabled
    ? resolveOnionSkinNeighborhood(state, timelineSession.activeFrameId, {
      enabled: true,
      previousFrameCount: onionSkinPreviousFrames,
      nextFrameCount: onionSkinNextFrames,
      opacity: onionSkinOpacity,
    }).references.length
    : 0;
  const currentFrame = state.frames.find((frame) =>
    frame.frameId === timelineSession.activeFrameId
  );
  const currentLayer = state.layers.find((layer) =>
    layer.layerTrackId === timelineSession.activeLayerTrackId
  );
  timelineStatus.textContent = `F${
    (currentFrame?.index ?? 0) + 1
  }/${state.frames.length} · ${
    currentLayer?.name ?? localizeDraw2Text("Layer")
  } · ${playbackFpsValue()} FPS · ${
    localizeDraw2Text(
      playbackLoopMode === "loop"
        ? "Loop"
        : playbackLoopMode === "bounce"
        ? "Bounce"
        : "Once",
    )
  }${onionSkinEnabled ? ` · ${localizeDraw2Text("Onion")} ${onionCount}` : ""}`;
  const timelinePositionText = `F${
    (currentFrame?.index ?? 0) + 1
  }/${state.frames.length} · ${formatTimelineClock(activeFrameElapsed)}`;
  const timelineDurationText = formatTimelineClock(totalDurationMs);
  if (timelinePositionElement !== null) {
    timelinePositionElement.value = timelinePositionText;
    timelinePositionElement.textContent = timelinePositionText;
  }
  if (timelineDurationElement !== null) {
    timelineDurationElement.value = timelineDurationText;
    timelineDurationElement.textContent = timelineDurationText;
  }
  timelineCard.dataset.activeTab = activeTimelineTab;
  togglePlaybackControl.setAttribute("aria-pressed", String(playbackRunning));
  setDraw2Icon(
    toggleOnionControl,
    onionSkinEnabled ? "icon-eye" : "icon-onion",
  );
  toggleOnionControl.title = localizeDraw2Text(
    onionSkinEnabled ? "Disable onion skin" : "Enable onion skin",
  );
  toggleOnionControl.setAttribute(
    "aria-label",
    localizeDraw2Text(
      onionSkinEnabled ? "Disable onion skin" : "Enable onion skin",
    ),
  );
  toggleOnionControl.setAttribute("aria-pressed", String(onionSkinEnabled));
  // One visible Onion button owns both the toggle and its options. The
  // option details remain in the DOM for keyboard/accessibility support but
  // do not create a duplicate toolbar control.
  onionOptions.open = onionSkinEnabled;
  positionOnionOptionsPopover();
  onionPrevious.value = String(onionSkinPreviousFrames);
  onionPreviousValue.value = String(onionSkinPreviousFrames);
  onionNext.value = String(onionSkinNextFrames);
  onionNextValue.value = String(onionSkinNextFrames);
  onionOpacity.value = String(onionSkinOpacity);
  onionOpacityValue.value = `${Math.round(onionSkinOpacity * 100)}%`;
  onionColorMode.value = onionSkinColorMode;
  renderCreatorTimelineMetadata();
  renderLayerPanel();
  renderTimelineLayerProperties();
}

function renderCreatorTimelineMetadata(): void {
  const selectionSnapshot = currentAssetSelectionSnapshot();
  if (tagFromSelectionControl !== null) {
    tagFromSelectionControl.disabled = !selectionSnapshot.hasSelection;
    tagFromSelectionControl.dataset.selectionReady = String(
      selectionSnapshot.hasSelection,
    );
  }
  if (tagFromSelectionStatus !== null) {
    const region = selectionSnapshot.region;
    tagFromSelectionStatus.textContent = selectionSnapshot.hasSelection &&
        region !== null
      ? `F${selectionSnapshot.frameNumber ?? 1} · ${region.width}×${region.height}px`
      : "範囲選択待ち";
  }
  tagList.replaceChildren();
  for (const tag of animationTags.list()) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    const text = document.createElement("span");
    text.append(
      document.createTextNode(
        `${tag.name} · ${tag.fromFrameIndex + 1}–${tag.toFrameIndex + 1}`,
      ),
    );
    if (tag.loop) text.append(createDraw2Icon("icon-loop"));
    text.title = `${tag.name}: frames ${tag.fromFrameIndex + 1}-${
      tag.toFrameIndex + 1
    }`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute(
      "aria-label",
      `${localizeDraw2Text("Remove animation tag")} ${tag.name}`,
    );
    remove.addEventListener("click", () => {
      animationTags.remove(tag.id);
      queueDrawPersistenceSave("timeline-tag-remove");
      renderCreatorTimelineMetadata();
      setStatus(`Animation tag ${tag.name} removed.`);
    });
    row.append(text, remove);
    tagList.append(row);
  }
  if (tagList.childElementCount === 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-creator-meta-empty";
    empty.textContent = localizeDraw2Text("No tags");
    tagList.append(empty);
  }

  markerList.replaceChildren();
  const activeFrameIndex =
    state.frames.find((frame) =>
      frame.frameId === timelineSession.activeFrameId
    )?.index ?? 0;
  const activeMarkers = timelineMarkers.list(activeFrameIndex);
  for (const marker of activeMarkers) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    const text = document.createElement("span");
    text.textContent = `${marker.kind} · ${marker.label}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute(
      "aria-label",
      `${localizeDraw2Text("Remove marker")} ${marker.label}`,
    );
    remove.addEventListener("click", () => {
      timelineMarkers.remove(marker.id);
      queueDrawPersistenceSave("timeline-marker-remove");
      renderCreatorTimelineMetadata();
      setStatus(`Timeline marker ${marker.label} removed.`);
    });
    row.append(text, remove);
    markerList.append(row);
  }
  if (markerList.childElementCount === 0) {
    const empty = document.createElement("span");
    empty.className = "draw2-creator-meta-empty";
    empty.textContent = localizeDraw2Text("No markers on active frame");
    markerList.append(empty);
  }

  const activeBinding = linkedCelBindings.find((binding) =>
    binding.celId === state.activeCelId
  );
  setDraw2Icon(linkedCelToggleControl, "icon-link");
  linkedCelToggleControl.setAttribute(
    "aria-pressed",
    String(activeBinding !== undefined),
  );
  linkedCelToggleControl.setAttribute(
    "aria-label",
    localizeDraw2Text(activeBinding === undefined ? "Link Cel" : "Unlink Cel"),
  );
  linkedCelToggleControl.title = activeBinding === undefined
    ? localizeDraw2Text("Link Cel")
    : localizeDraw2Text("Unlink Cel");
  linkedCelStatus.textContent = activeBinding === undefined
    ? localizeDraw2Text("No local link")
    : `${localizeDraw2Text("Linked to")} ${activeBinding.sourceCelId}`;
  renderDrawAudioReferences();
}

function renderDrawAudioReferences(): void {
  if (
    drawAudioAssetPicker === null || drawAudioLane === null ||
    drawAudioEmpty === null || drawAudioStatus === null
  ) return;
  const selectedValue = drawAudioAssetPicker.value;
  drawAudioAssetPicker.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = drawAudioCatalog.length === 0
    ? "Audio素材がありません"
    : "BGM／SEを選択";
  drawAudioAssetPicker.append(placeholder);
  for (const item of drawAudioCatalog) {
    const option = document.createElement("option");
    option.value = `${item.audioAssetId}\u0000${item.audioRevisionId}`;
    option.textContent = `${item.kind} · ${item.label}`;
    drawAudioAssetPicker.append(option);
  }
  if (
    [...drawAudioAssetPicker.options].some((option) =>
      option.value === selectedValue
    )
  ) {
    drawAudioAssetPicker.value = selectedValue;
  }
  drawAudioLane.replaceChildren();
  const references = drawAudioReferences.list();
  for (const reference of references) {
    const row = document.createElement("div");
    row.className = "draw2-creator-meta-row";
    row.setAttribute("role", "listitem");
    const text = document.createElement("span");
    text.textContent = `${reference.kind} · ${reference.label} · F${
      reference.startFrame + 1
    }`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "draw2-button draw2-button-secondary draw2-button-icon";
    remove.append(createDraw2Icon("icon-close"));
    remove.setAttribute(
      "aria-label",
      `${reference.label} をタイムラインから削除`,
    );
    remove.addEventListener("click", () => {
      drawAudioReferences.remove(reference.id);
      queueDrawPersistenceSave("draw-audio-reference-remove");
      renderDrawAudioReferences();
      renderTimeline();
      setStatus(`Audio参照 ${reference.label} を削除しました。`);
    });
    row.append(text, remove);
    drawAudioLane.append(row);
  }
  drawAudioEmpty.hidden = references.length > 0;
  drawAudioStatus.value = drawAudioCatalog.length === 0
    ? "AudioモードでBGMまたはSEを作成してください。"
    : `${references.length}件のAudio参照`;
  drawAudioStatus.textContent = drawAudioStatus.value;
  if (drawAudioAdd !== null) {
    drawAudioAdd.disabled = drawAudioCatalog.length === 0;
  }
}

function addDrawAudioReferenceFromControls(): void {
  if (drawAudioAssetPicker === null || drawAudioAssetPicker.value === "") {
    return;
  }
  const [audioAssetId, audioRevisionId] = drawAudioAssetPicker.value.split(
    "\u0000",
  );
  const source = drawAudioCatalog.find((item) =>
    item.audioAssetId === audioAssetId &&
    item.audioRevisionId === audioRevisionId
  );
  const frame = state.frames.find((item) =>
    item.frameId === timelineSession.activeFrameId
  );
  if (source === undefined || frame === undefined) return;
  const reference: DrawAudioReference = {
    id: `audio-ref:ui:${Date.now()}`,
    audioAssetId: source.audioAssetId,
    audioRevisionId: source.audioRevisionId,
    kind: source.kind,
    label: source.label,
    startFrame: frame.index,
    durationFrames: source.kind === "BGM"
      ? Math.max(1, state.frames.length - frame.index)
      : 1,
    loop: source.kind === "BGM",
    gain: 1,
  };
  drawAudioReferences.upsert(reference, state.frames.length);
  drawAudioAssetPicker.value = "";
  queueDrawPersistenceSave("draw-audio-reference-add");
  renderDrawAudioReferences();
  renderTimeline();
  setStatus(
    `${source.kind} ${source.label} をF${frame.index + 1}へ追加しました。`,
  );
}

function addAnimationTagFromControls(): void {
  try {
    const fromFrameIndex = Math.max(
      0,
      Math.round(Number(tagFromControl.value) || 1) - 1,
    );
    const toFrameIndex = Math.max(
      fromFrameIndex,
      Math.round(Number(tagToControl.value) || fromFrameIndex + 1) - 1,
    );
    const tag = animationTags.upsert({
      id: `tag:ui:${Date.now()}`,
      name: tagNameControl.value.trim() ||
        `Tag ${animationTags.list().length + 1}`,
      fromFrameIndex,
      toFrameIndex,
      loop: tagLoopControl.checked,
    }, state.frames.length);
    tagNameControl.value = "";
    queueDrawPersistenceSave("timeline-tag-add");
    renderCreatorTimelineMetadata();
    setStatus(`Animation tag ${tag.name} added.`);
  } catch (cause) {
    setStatus(
      cause instanceof Error ? cause.message : "Animation tag is invalid.",
      "error",
    );
  }
}

function animationTagFrameRangeFromSelection(): {
  readonly fromFrameIndex: number;
  readonly toFrameIndex: number;
} {
  const selectedFrameIndexes = [...timelineSelectedCells].map((key) => {
    const frameId = key.split("::")[0] ?? "";
    return state.timeline.frameOrder.indexOf(frameId);
  }).filter((index) => index >= 0);
  const selectionSnapshot = currentAssetSelectionSnapshot();
  const fallbackFrameIndex = selectionSnapshot.frameNumber === null
    ? state.frames.find((frame) => frame.frameId === timelineSession.activeFrameId)
      ?.index ?? 0
    : Math.max(0, selectionSnapshot.frameNumber - 1);
  const fromFrameIndex = selectedFrameIndexes.length === 0
    ? fallbackFrameIndex
    : Math.min(...selectedFrameIndexes);
  const toFrameIndex = selectedFrameIndexes.length === 0
    ? fallbackFrameIndex
    : Math.max(...selectedFrameIndexes);
  return { fromFrameIndex, toFrameIndex };
}

function addAnimationTagFromSelection(): void {
  const selectionSnapshot = currentAssetSelectionSnapshot();
  if (!selectionSnapshot.hasSelection) {
    setStatus("先にキャンバスで範囲を選択してください。", "error");
    return;
  }
  const range = animationTagFrameRangeFromSelection();
  tagFromControl.value = String(range.fromFrameIndex + 1);
  tagToControl.value = String(range.toFrameIndex + 1);
  if (tagNameControl.value.trim() === "") tagNameControl.value = "SPRITE";
  addAnimationTagFromControls();
  if (tagFromSelectionStatus !== null) {
    tagFromSelectionStatus.textContent =
      `作成済み · F${range.fromFrameIndex + 1}–F${range.toFrameIndex + 1}`;
  }
  setStatus(
    `選択範囲をアニメーションタグにしました。F${range.fromFrameIndex + 1}–F${range.toFrameIndex + 1}`,
  );
}

function addTimelineMarkerFromControls(): void {
  try {
    const frame = state.frames.find((item) =>
      item.frameId === timelineSession.activeFrameId
    );
    if (frame === undefined) throw new Error("Active frame is unavailable.");
    const markerKinds = ["AUDIO", "GAME_EVENT", "NOTE"] as const;
    const kind = markerKinds.find((candidate) =>
      candidate === markerKindControl.value
    ) ?? "NOTE";
    const marker: TimelineMarker = {
      id: `marker:ui:${Date.now()}`,
      frameIndex: frame.index,
      kind,
      label: markerLabelControl.value.trim() || `${kind} ${frame.index + 1}`,
    };
    timelineMarkers.upsert(marker);
    markerLabelControl.value = "";
    queueDrawPersistenceSave("timeline-marker-add");
    renderCreatorTimelineMetadata();
    setStatus(`Timeline marker ${marker.label} added.`);
  } catch (cause) {
    setStatus(
      cause instanceof Error ? cause.message : "Timeline marker is invalid.",
      "error",
    );
  }
}

function toggleActiveLinkedCel(): void {
  const existing = linkedCelBindings.find((binding) =>
    binding.celId === state.activeCelId
  );
  if (existing !== undefined) {
    linkedCelBindings = linkedCelBindings.filter((binding) =>
      binding.celId !== state.activeCelId
    );
    renderCreatorTimelineMetadata();
    setStatus("Active Cel link removed from local metadata.");
    return;
  }
  const activeCel = state.cels.find((cel) => cel.celId === state.activeCelId);
  const activeFrame = state.frames.find((frame) =>
    frame.frameId === timelineSession.activeFrameId
  );
  if (activeCel === undefined || activeFrame === undefined) {
    setStatus("Active Cel is unavailable.", "error");
    return;
  }
  const source = state.cels
    .map((cel) => ({
      cel,
      frame: state.frames.find((frame) => frame.frameId === cel.frameId),
    }))
    .filter((
      entry,
    ): entry is {
      cel: typeof activeCel;
      frame: NonNullable<typeof activeFrame>;
    } =>
      entry.frame !== undefined && entry.frame.index < activeFrame.index &&
      entry.cel.layerTrackId === activeCel.layerTrackId &&
      entry.cel.assetId !== undefined &&
      entry.cel.celId !== activeCel.celId
    )
    .sort((a, b) => b.frame.index - a.frame.index)[0]?.cel;
  if (source === undefined) {
    setStatus("A previous raster Cel is required before linking.", "error");
    return;
  }
  try {
    const binding = createLinkedCelBinding(
      activeCel.celId,
      source.celId,
      linkedCelBindings,
    );
    linkedCelBindings = [
      ...linkedCelBindings.filter((item) => item.celId !== activeCel.celId),
      binding,
    ];
    renderCreatorTimelineMetadata();
    setStatus(`Active Cel linked to ${source.celId} in local metadata.`);
  } catch (cause) {
    setStatus(
      cause instanceof Error ? cause.message : "Linked Cel is invalid.",
      "error",
    );
  }
}

function runTimelineCommand(
  commandType: TimelineCommand["commandType"],
  payload: unknown,
  options: TimelineCommandRunOptions = {},
): Promise<boolean> {
  return enqueueCanonicalOperation(() =>
    runTimelineCommandNow(commandType, payload, options)
  );
}

function collaborationTimelineCommandIsNavigation(
  commandType: TimelineCommand["commandType"],
): boolean {
  return commandType === "timeline.activateCel";
}

async function runTimelineCommandNow(
  commandType: TimelineCommand["commandType"],
  payload: unknown,
  options: TimelineCommandRunOptions = {},
): Promise<boolean> {
  if (
    !collaborationTimelineCommandIsNavigation(commandType) &&
    collaborationEditBlockReason() !== undefined
  ) {
    announceCollaborationEditBlock();
    return false;
  }
  timelineStateGeneration += 1;
  const commandSequence = nextClientSequence(TIMELINE_CLIENT_ID);
  const before = state;
  const command = {
    commandId:
      `draw2-timeline-${state.projectId}-${commandSequence}-${commandType}`,
    commandType,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "draw2-timeline-local",
    clientId: TIMELINE_CLIENT_ID,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload,
  } as TimelineCommand;
  const result = await executeTimelineCommand(state, command);
  if (
    options.activationRequestId !== undefined &&
    options.activationRequestId !== latestTimelineActivationRequestId
  ) {
    syncClientSequencesFromState();
    return false;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return false;
  }
  if (!result.result.noOp) adoptCanonicalState(result.state);
  const timelineInvalidatesLocalSelection = timelineCommandInvalidatesSelection(
    before,
    state,
  );
  if (
    timelineInvalidatesLocalSelection &&
    (selection !== undefined || hasUncommittedSelectionWork())
  ) {
    clearCommittedSelection(
      "Selection and transform preview cleared because the timeline target changed.",
    );
  }
  // A structural edit replaces the visible frame/layer matrix. Clear the
  // local selection projection before auto-activation so the previous cel
  // cannot retain an active-looking state after Add/Duplicate/Remove.
  switch (commandType) {
    case "timeline.addFrame":
    case "timeline.duplicateFrame":
    case "timeline.removeFrame":
    case "timeline.addLayerTrack":
    case "timeline.duplicateLayerTrack":
    case "timeline.removeLayerTrack":
      timelineSelectedCells.clear();
      timelineSelectionAnchor = undefined;
      break;
    default:
      break;
  }
  let autoActivate:
    | { readonly frameId: string; readonly layerTrackId: string }
    | undefined;
  if (
    commandType === "timeline.addLayerTrack" ||
    commandType === "timeline.duplicateLayerTrack"
  ) {
    const nextLayerTrackId =
      (payload as { layerTrackId?: string }).layerTrackId;
    if (nextLayerTrackId !== undefined) {
      timelineSession = {
        ...timelineSession,
        activeLayerTrackId: nextLayerTrackId,
      };
      autoActivate = {
        frameId: timelineSession.activeFrameId,
        layerTrackId: nextLayerTrackId,
      };
    }
  } else if (
    commandType === "timeline.addFrame" ||
    commandType === "timeline.duplicateFrame"
  ) {
    const nextFrameId = (payload as { frameId?: string }).frameId;
    if (nextFrameId !== undefined) {
      timelineSession = setTimelineSessionActiveFrame(
        state,
        timelineSession,
        nextFrameId,
      );
      autoActivate = {
        frameId: nextFrameId,
        layerTrackId: timelineSession.activeLayerTrackId,
      };
    }
  }
  if (commandType === "timeline.activateCel") {
    const activation = payload as { frameId: string; layerTrackId: string };
    timelineSession = {
      ...setTimelineSessionActiveFrame(
        state,
        timelineSession,
        activation.frameId,
      ),
      activeLayerTrackId: activation.layerTrackId,
      activeCelId: state.activeCelId,
    };
  }
  if (autoActivate !== undefined) {
    await activateTimelineCell(
      autoActivate.frameId,
      autoActivate.layerTrackId,
      true,
    );
  }
  if (options.recordHistory !== false) {
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
  }
  saveDrawProjectState();
  await autosave.record(state, result.result);
  normalizeTimelineSession();
  renderTimeline();
  renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);
  syncColorEditorFromSelection();
  await present();
  if (timelineInvalidatesLocalSelection) {
    // Auto-activation can perform a second timeline command. Refresh the
    // selection HUD after that nested command as well, otherwise the HUD can
    // keep displaying the previous cel even though the raster is current.
    updateSelectionActionButtons();
    updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
    drawOverlay();
  }
  if (options.announce !== false) {
    setStatus(
      `${result.result.operation.operationType} committed locally · domains=${
        result.result.structuralDirtyDomains?.join("+") ?? "none"
      } · fullClone=${result.result.trace.fullRasterCloneCount}`,
    );
  }
  updateHistoryButtons();
  return true;
}

function selectionRegionPath(
  region: { x: number; y: number; width: number; height: number },
): string {
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  return `M ${region.x} ${region.y} H ${right} V ${bottom} H ${region.x} Z`;
}

type SelectionOverlayRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SelectionFrameHandlePoint = {
  handle: SelectionFrameHandle;
  x: number;
  y: number;
};

function selectionFrameBounds(): SelectionOverlayRegion | undefined {
  if (selection === undefined || selection.mask.regions.length === 0) {
    return undefined;
  }
  const minX = Math.min(...selection.mask.regions.map((region) => region.x));
  const minY = Math.min(...selection.mask.regions.map((region) => region.y));
  const maxX = Math.max(
    ...selection.mask.regions.map((region) => region.x + region.width),
  );
  const maxY = Math.max(
    ...selection.mask.regions.map((region) => region.y + region.height),
  );
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function selectionFrameHandleMetrics(): {
  size: number;
  hit: number;
  gap: number;
} {
  const bounds = canvas.getBoundingClientRect();
  const canvasPerCssPixel = Math.max(
    0.0001,
    1 / Math.max(
      0.0001,
      Math.min(
        bounds.width / Math.max(1, canvas.width),
        bounds.height / Math.max(1, canvas.height),
      ),
    ),
  );
  return {
    size: Math.max(0.75, Math.min(12, canvasPerCssPixel * 7)),
    hit: Math.max(1.5, Math.min(18, canvasPerCssPixel * 12)),
    gap: Math.max(10, canvasPerCssPixel * 18),
  };
}

function selectionFrameHandlePoints(
  region: SelectionOverlayRegion,
): readonly SelectionFrameHandlePoint[] {
  const metrics = selectionFrameHandleMetrics();
  const left = region.x;
  const top = region.y;
  const right = region.x + region.width;
  const bottom = region.y + region.height;
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  const rotateY = top - metrics.gap < 0
    ? Math.min(
      Math.max(metrics.hit, top + metrics.gap),
      Math.max(metrics.hit, canvas.height - metrics.hit),
    )
    : top - metrics.gap;
  return [
    { handle: "rotate", x: centerX, y: rotateY },
    { handle: "nw", x: left, y: top },
    { handle: "n", x: centerX, y: top },
    { handle: "ne", x: right, y: top },
    { handle: "e", x: right, y: centerY },
    { handle: "se", x: right, y: bottom },
    { handle: "s", x: centerX, y: bottom },
    { handle: "sw", x: left, y: bottom },
    { handle: "w", x: left, y: centerY },
  ];
}

function canvasPointForClient(
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }
  return {
    x: ((clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

function selectionFrameHandleAtClient(
  clientX: number,
  clientY: number,
): SelectionFrameHandle | undefined {
  if (
    selection === undefined || !selectionToolCanMove() ||
    selectionDraft !== undefined
  ) return undefined;
  const region = selectionFrameBounds();
  if (region === undefined) return undefined;
  const point = canvasPointForClient(clientX, clientY);
  const metrics = selectionFrameHandleMetrics();
  const hit = selectionFrameHandlePoints(region)
    .map((candidate) => ({
      ...candidate,
      distance: Math.hypot(
        (point.x - candidate.x) / metrics.hit,
        (point.y - candidate.y) / metrics.hit,
      ),
    }))
    .filter((candidate) => candidate.distance <= 1)
    .sort((left, right) => left.distance - right.distance)[0];
  return hit?.handle;
}

function syncSelectionFrameCursor(
  clientX: number,
  clientY: number,
): void {
  if (selectionFrameDrag !== undefined) return;
  const handle = selectionFrameHandleAtClient(clientX, clientY);
  if (handle === undefined) {
    delete canvas.dataset.selectionFrameHandle;
  } else {
    canvas.dataset.selectionFrameHandle = handle;
  }
}

function selectionFrameBorderAtClient(
  clientX: number,
  clientY: number,
): boolean {
  if (
    selection === undefined || !selectionToolCanMove() ||
    selectionDraft !== undefined
  ) return false;
  const region = selectionFrameBounds();
  if (region === undefined) return false;
  const point = canvasPointForClient(clientX, clientY);
  const tolerance = Math.max(1, selectionFrameHandleMetrics().hit * 0.55);
  const withinX = point.x >= region.x - tolerance &&
    point.x <= region.x + region.width + tolerance;
  const withinY = point.y >= region.y - tolerance &&
    point.y <= region.y + region.height + tolerance;
  if (!withinX || !withinY) return false;
  return Math.abs(point.x - region.x) <= tolerance ||
    Math.abs(point.x - (region.x + region.width)) <= tolerance ||
    Math.abs(point.y - region.y) <= tolerance ||
    Math.abs(point.y - (region.y + region.height)) <= tolerance;
}

function selectionFrameRegionForOverlay(): SelectionOverlayRegion | undefined {
  if (
    selection === undefined || selectionDraft !== undefined ||
    !selectionToolCanMove()
  ) return undefined;
  if (selectionFrameDrag !== undefined) {
    const destination = transformPreview?.overlayRegions.at(-1);
    if (destination !== undefined) return destination;
  }
  return selectionFrameBounds();
}

function renderSelectionSvgOverlay(
  regions: readonly SelectionOverlayRegion[],
  previewRegions: readonly SelectionOverlayRegion[],
  draftRegions: readonly SelectionOverlayRegion[] = [],
  pendingPoints: readonly { x: number; y: number }[] = [],
  pendingEllipseRegion?: SelectionOverlayRegion,
  textRegions: readonly SelectionOverlayRegion[] = [],
  transformFrameRegion?: SelectionOverlayRegion,
): void {
  selectionOverlay.setAttribute(
    "viewBox",
    `0 0 ${canvas.width} ${canvas.height}`,
  );
  while (selectionOverlayRegions.firstChild !== null) {
    selectionOverlayRegions.removeChild(selectionOverlayRegions.firstChild);
  }
  const appendRegion = (
    region: { x: number; y: number; width: number; height: number },
    kind: "selection" | "preview" | "draft" | "pending" | "text",
  ): void => {
    if (region.width < 1 || region.height < 1) return;
    const path = selectionRegionPath(region);
    for (const stroke of ["dark", "light"] as const) {
      const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      element.setAttribute("d", path);
      element.setAttribute(
        "class",
        `draw2-selection-path draw2-selection-path--${kind} draw2-selection-path--${stroke}`,
      );
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  const appendPath = (
    points: readonly { x: number; y: number }[],
    kind: "draft" | "pending",
  ): void => {
    if (points.length < 2) return;
    const first = points[0];
    if (first === undefined) return;
    const closed = [...points, first];
    for (const stroke of ["dark", "light"] as const) {
      const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      element.setAttribute(
        "d",
        closed.map((point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x + 0.5} ${point.y + 0.5}`
        ).join(" "),
      );
      element.setAttribute(
        "class",
        `draw2-selection-path draw2-selection-path--${kind} draw2-selection-path--${stroke}`,
      );
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  const appendEllipse = (region: SelectionOverlayRegion): void => {
    if (region.width < 1 || region.height < 1) return;
    for (const stroke of ["dark", "light"] as const) {
      const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "ellipse",
      );
      element.setAttribute("cx", String(region.x + region.width / 2));
      element.setAttribute("cy", String(region.y + region.height / 2));
      element.setAttribute("rx", String(region.width / 2));
      element.setAttribute("ry", String(region.height / 2));
      element.setAttribute(
        "class",
        `draw2-selection-path draw2-selection-path--pending draw2-selection-path--${stroke}`,
      );
      element.setAttribute("vector-effect", "non-scaling-stroke");
      selectionOverlayRegions.appendChild(element);
    }
  };
  const appendTransformControls = (
    region: SelectionOverlayRegion,
  ): void => {
    if (region.width < 1 || region.height < 1) return;
    const metrics = selectionFrameHandleMetrics();
    const group = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    group.setAttribute(
      "class",
      "draw2-selection-transform-controls",
    );
    group.setAttribute("aria-hidden", "true");
    const frame = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    frame.setAttribute("d", selectionRegionPath(region));
    frame.setAttribute("class", "draw2-selection-transform-frame");
    frame.setAttribute("vector-effect", "non-scaling-stroke");
    group.appendChild(frame);
    const points = selectionFrameHandlePoints(region);
    const rotate = points.find((point) => point.handle === "rotate");
    const top = points.find((point) => point.handle === "n");
    if (rotate !== undefined && top !== undefined) {
      const connector = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      connector.setAttribute("x1", String(top.x));
      connector.setAttribute("y1", String(top.y));
      connector.setAttribute("x2", String(rotate.x));
      connector.setAttribute("y2", String(rotate.y));
      connector.setAttribute(
        "class",
        "draw2-selection-transform-connector",
      );
      connector.setAttribute("vector-effect", "non-scaling-stroke");
      group.appendChild(connector);
    }
    for (const point of points) {
      if (point.handle === "rotate") {
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        circle.setAttribute("cx", String(point.x));
        circle.setAttribute("cy", String(point.y));
        circle.setAttribute("r", String(metrics.size / 2));
        circle.setAttribute(
          "class",
          "draw2-selection-transform-handle draw2-selection-transform-handle--rotate",
        );
        group.appendChild(circle);
        continue;
      }
      const handle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      handle.setAttribute("x", String(point.x - metrics.size / 2));
      handle.setAttribute("y", String(point.y - metrics.size / 2));
      handle.setAttribute("width", String(metrics.size));
      handle.setAttribute("height", String(metrics.size));
      handle.setAttribute(
        "class",
        `draw2-selection-transform-handle draw2-selection-transform-handle--${point.handle}`,
      );
      group.appendChild(handle);
    }
    selectionOverlayRegions.appendChild(group);
  };
  for (const region of regions) appendRegion(region, "selection");
  for (const region of previewRegions) appendRegion(region, "preview");
  for (const region of draftRegions) appendRegion(region, "draft");
  for (const region of textRegions) appendRegion(region, "text");
  if (pendingEllipseRegion !== undefined) appendEllipse(pendingEllipseRegion);
  if (pendingPoints.length > 1) appendPath(pendingPoints, "pending");
  if (transformFrameRegion !== undefined) {
    appendTransformControls(transformFrameRegion);
  }
  if (
    regions.length === 0 && previewRegions.length === 0 &&
    draftRegions.length === 0 && textRegions.length === 0 &&
    pendingPoints.length < 2 &&
    pendingEllipseRegion === undefined && transformFrameRegion === undefined
  ) selectionOverlay.setAttribute("hidden", "");
  else selectionOverlay.removeAttribute("hidden");
}

function normalizeMirrorGuide(
  asset: Pick<RasterAsset, "width" | "height">,
): {
  x: number;
  y: number;
  diagonalDown: number;
  diagonalUp: number;
} {
  const clampOffset = (value: number): number =>
    Math.max(
      -1,
      Math.min(1, Number.isFinite(value) ? value : 0),
    );
  return {
    x: clampMirrorGuideCoordinate(
      Number.isFinite(mirrorGuide.x)
        ? mirrorGuide.x
        : mirrorGuideCenter(asset.width),
      asset.width,
    ),
    y: clampMirrorGuideCoordinate(
      Number.isFinite(mirrorGuide.y)
        ? mirrorGuide.y
        : mirrorGuideCenter(asset.height),
      asset.height,
    ),
    diagonalDown: clampOffset(mirrorGuide.diagonalDown),
    diagonalUp: clampOffset(mirrorGuide.diagonalUp),
  };
}

function mirrorHasActiveAxis(): boolean {
  return mirrorAxes.x || mirrorAxes.y || mirrorAxes.diagonalDown ||
    mirrorAxes.diagonalUp;
}

function mirrorCommitSpecForTool(
  asset: Pick<RasterAsset, "width" | "height">,
  tool: BasicTool,
): MirrorCommitSpec | undefined {
  if (!mirrorAppliesToTool(tool)) return undefined;
  mirrorGuide = normalizeMirrorGuide(asset);
  const axes: MirrorCommitSpec["axes"] = [
    ...(mirrorAxes.x ? ["x" as const] : []),
    ...(mirrorAxes.y ? ["y" as const] : []),
    ...(mirrorAxes.diagonalDown ? ["diagonal-down" as const] : []),
    ...(mirrorAxes.diagonalUp ? ["diagonal-up" as const] : []),
  ];
  if (axes.length === 0) return undefined;
  return {
    axes,
    guide: { ...mirrorGuide },
  };
}

function mirrorAxisLabel(axis: MirrorGuideAxis): string {
  switch (axis) {
    case "x":
      return "Vertical line";
    case "y":
      return "Horizontal line";
    case "diagonal-down":
      return "Descending diagonal line";
    case "diagonal-up":
      return "Ascending diagonal line";
  }
}

function mirrorAxisEnabled(axis: MirrorGuideAxis): boolean {
  switch (axis) {
    case "x":
      return mirrorAxes.x;
    case "y":
      return mirrorAxes.y;
    case "diagonal-down":
      return mirrorAxes.diagonalDown;
    case "diagonal-up":
      return mirrorAxes.diagonalUp;
  }
}

function setMirrorAxisEnabled(axis: MirrorGuideAxis, enabled: boolean): void {
  mirrorAxes = axis === "x"
    ? { ...mirrorAxes, x: enabled }
    : axis === "y"
    ? { ...mirrorAxes, y: enabled }
    : axis === "diagonal-down"
    ? { ...mirrorAxes, diagonalDown: enabled }
    : { ...mirrorAxes, diagonalUp: enabled };
}

function mirrorAxisSummary(): string {
  const axes = ([
    ["x", "vertical"],
    ["y", "horizontal"],
    ["diagonal-down", "diagonal ↘"],
    ["diagonal-up", "diagonal ↗"],
  ] as const)
    .filter(([axis]) => mirrorAxisEnabled(axis))
    .map(([, label]) => label);
  return axes.length > 0 ? axes.join("+") : "no line";
}

function syncMirrorModeToggle(): void {
  const enabled = mirrorMode === "ON";
  const stateLabel = localizeDraw2Text(enabled ? "On" : "Off");
  mirrorModeControl.setAttribute("aria-pressed", String(enabled));
  mirrorModeControl.dataset.mode = enabled ? "on" : "off";
  mirrorModeControl.setAttribute(
    "aria-label",
    `${localizeDraw2Text("Mirror")}: ${stateLabel}`,
  );
  mirrorModeControl.title = `${localizeDraw2Text("Mirror")}: ${stateLabel}`;
  const stateElement = mirrorModeControl.querySelector<HTMLElement>(
    "[data-draw2-mirror-state]",
  );
  if (stateElement !== null) {
    stateElement.textContent = stateLabel.toUpperCase();
  }
}

function setMirrorPreset(mode: MirrorMode): void {
  mirrorMode = mode;
  mirrorEnabled = mode === "ON";
  viewportWrapElement?.classList.toggle("is-mirror-enabled", mirrorEnabled);
  if (mirrorEnabled && !mirrorHasActiveAxis()) {
    // Turning the master switch on always gives the user one visible result;
    // the line toggles can then add or remove the other three axes.
    mirrorAxes = { ...mirrorAxes, x: true };
  }
  syncMirrorModeToggle();
  applyViewportTransform();
}

function syncMirrorLineToggle(
  button: HTMLButtonElement,
  enabled: boolean,
  visible: boolean,
  label: string,
): void {
  button.hidden = !visible;
  button.disabled = !visible;
  button.setAttribute("aria-pressed", String(enabled));
  button.dataset.enabled = String(enabled);
  const localizedLabel = localizeDraw2Text(label);
  const localizedState = localizeDraw2Text(enabled ? "On" : "Off");
  button.setAttribute(
    "aria-label",
    `${localizedLabel}: ${localizedState}`,
  );
  button.title = `${localizedLabel}: ${localizedState}`;
}

function diagonalLineEndpoints(
  axis: "diagonal-down" | "diagonal-up",
  offset: number,
  asset: Pick<RasterAsset, "width" | "height">,
): { x1: number; y1: number; x2: number; y2: number } {
  const maxX = Math.max(1, asset.width - 1);
  const maxY = Math.max(1, asset.height - 1);
  const points: Array<{ x: number; y: number }> = [];
  const appendPoint = (x: number, y: number): void => {
    if (
      !Number.isFinite(x) || !Number.isFinite(y) ||
      x < -0.0001 || x > asset.width + 0.0001 ||
      y < -0.0001 || y > asset.height + 0.0001 ||
      points.some((item) =>
        Math.abs(item.x - x) < 0.0001 && Math.abs(item.y - y) < 0.0001
      )
    ) return;
    points.push({
      x: Math.max(0, Math.min(asset.width, x)),
      y: Math.max(0, Math.min(asset.height, y)),
    });
  };
  const guideYFromGuideX = (guideX: number): number =>
    axis === "diagonal-down"
      ? ((guideX / maxX) + offset) * maxY
      : (1 + offset - (guideX / maxX)) * maxY;
  const guideXFromGuideY = (guideY: number): number =>
    axis === "diagonal-down"
      ? ((guideY / maxY) - offset) * maxX
      : (1 + offset - (guideY / maxY)) * maxX;

  // Intersect the guide with the four canvas edges. The +0.5 conversion is
  // what keeps a line through a pixel centre visually aligned with that cell.
  for (const canvasX of [0, asset.width]) {
    appendPoint(canvasX, guideYFromGuideX(canvasX - 0.5) + 0.5);
  }
  for (const canvasY of [0, asset.height]) {
    appendPoint(guideXFromGuideY(canvasY - 0.5) + 0.5, canvasY);
  }
  const first = points[0] ?? {
    x: 0,
    y: axis === "diagonal-down" ? 0 : asset.height,
  };
  const second = points[1] ?? {
    x: asset.width,
    y: axis === "diagonal-down" ? asset.height : 0,
  };
  return { x1: first.x, y1: first.y, x2: second.x, y2: second.y };
}

function positionMirrorLineToggles(
  asset: Pick<RasterAsset, "width" | "height">,
): void {
  const viewport = viewportWrapElement?.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  if (
    viewport === undefined || canvasBounds.width <= 0 ||
    canvasBounds.height <= 0
  ) return;
  const canvasLeft = canvasBounds.left - viewport.left;
  const canvasTop = canvasBounds.top - viewport.top;
  const x = canvasLeft +
    (mirrorGuideToCanvasCoordinate(mirrorGuide.x, asset.width) /
        Math.max(1, asset.width)) * canvasBounds.width;
  const y = canvasTop +
    (mirrorGuideToCanvasCoordinate(mirrorGuide.y, asset.height) /
        Math.max(1, asset.height)) * canvasBounds.height;
  // Keep the handles in the viewport gutter rather than on the transformed
  // canvas. X/Y use the exact projected line coordinate; diagonal handles sit
  // on the corresponding line extension just outside the nearest edge.
  const inset = 6;
  const clampHandleCenter = (
    value: number,
    halfSize: number,
    viewportSize: number,
  ): number => {
    const min = Math.min(
      halfSize + inset,
      Math.max(halfSize, viewportSize - halfSize),
    );
    const max = Math.max(min, viewportSize - halfSize - inset);
    return Math.max(min, Math.min(max, value));
  };
  const handleXHalf = Math.max(1, mirrorToggleX.offsetWidth / 2);
  const handleYHalf = Math.max(1, mirrorToggleY.offsetHeight / 2);
  const xCenter = clampHandleCenter(x, handleXHalf, viewport.width);
  const yCenter = clampHandleCenter(y, handleYHalf, viewport.height);
  const contextRowBounds = workspaceContextRowElement?.getBoundingClientRect();
  const contextRowBottom = contextRowBounds?.bottom ?? viewport.top;
  const xHandleCenter = clampHandleCenter(
    Math.max(
      handleXHalf + inset,
      contextRowBottom - viewport.top + inset + handleXHalf,
    ),
    handleXHalf,
    viewport.height,
  );
  mirrorToggleX.style.left = `${xCenter - handleXHalf}px`;
  mirrorToggleX.style.top = `${xHandleCenter - handleXHalf}px`;
  mirrorToggleY.style.left = `${inset}px`;
  mirrorToggleY.style.top = `${yCenter - handleYHalf}px`;
  const placeOnViewportEdge = (
    button: HTMLButtonElement,
    edge: "right" | "bottom",
    edgePosition = edge === "right" ? viewport.height / 2 : viewport.width / 2,
  ): void => {
    const halfWidth = Math.max(1, button.offsetWidth / 2);
    const halfHeight = Math.max(1, button.offsetHeight / 2);
    const centerX = clampHandleCenter(
      edge === "right"
        ? viewport.width - halfWidth - inset
        : clampHandleCenter(edgePosition, halfWidth, viewport.width),
      halfWidth,
      viewport.width,
    );
    const centerY = clampHandleCenter(
      edge === "right" ? edgePosition : viewport.height - halfHeight - inset,
      halfHeight,
      viewport.height,
    );
    button.style.left = `${centerX - halfWidth}px`;
    button.style.top = `${centerY - halfHeight}px`;
  };
  // The diagonal handles use the same offset/coordinate mapping as the drag
  // handler. Keeping them on the right/bottom perimeter makes the line's
  // offset visible without putting a control over the canvas content.
  const diagonalDownCanvasY = diagonalMirrorGuideOffsetToCanvasCoordinate(
    mirrorGuide.diagonalDown,
    asset.height,
  );
  const diagonalUpCanvasX = diagonalMirrorGuideOffsetToCanvasCoordinate(
    mirrorGuide.diagonalUp,
    asset.width,
  );
  placeOnViewportEdge(
    mirrorToggleDiagonalDown,
    "right",
    canvasTop + (diagonalDownCanvasY / Math.max(1, asset.height)) *
      canvasBounds.height,
  );
  placeOnViewportEdge(
    mirrorToggleDiagonalUp,
    "bottom",
    canvasLeft + (diagonalUpCanvasX / Math.max(1, asset.width)) *
      canvasBounds.width,
  );
}

function syncMirrorGuideOverlay(
  asset: Pick<RasterAsset, "width" | "height">,
): void {
  if (
    mirrorGuideOverlayElement === null ||
    mirrorGuideVerticalElement === null ||
    mirrorGuideHorizontalElement === null ||
    mirrorGuideDiagonalDownElement === null ||
    mirrorGuideDiagonalUpElement === null
  ) return;
  mirrorGuide = normalizeMirrorGuide(asset);
  mirrorGuideOverlayElement.setAttribute(
    "viewBox",
    `0 0 ${asset.width} ${asset.height}`,
  );
  const verticalVisible = mirrorEnabled;
  const horizontalVisible = mirrorEnabled;
  const verticalPosition = mirrorGuideToCanvasCoordinate(
    mirrorGuide.x,
    asset.width,
  );
  const horizontalPosition = mirrorGuideToCanvasCoordinate(
    mirrorGuide.y,
    asset.height,
  );
  mirrorGuideVerticalElement.setAttribute("x1", String(verticalPosition));
  mirrorGuideVerticalElement.setAttribute("x2", String(verticalPosition));
  mirrorGuideVerticalElement.setAttribute("y1", "-32");
  mirrorGuideVerticalElement.setAttribute("y2", String(asset.height + 32));
  mirrorGuideHorizontalElement.setAttribute("y1", String(horizontalPosition));
  mirrorGuideHorizontalElement.setAttribute("y2", String(horizontalPosition));
  mirrorGuideHorizontalElement.setAttribute("x1", "-32");
  mirrorGuideHorizontalElement.setAttribute("x2", String(asset.width + 32));
  const diagonalDown = diagonalLineEndpoints(
    "diagonal-down",
    mirrorGuide.diagonalDown,
    asset,
  );
  const diagonalUp = diagonalLineEndpoints(
    "diagonal-up",
    mirrorGuide.diagonalUp,
    asset,
  );
  mirrorGuideDiagonalDownElement.setAttribute(
    "x1",
    String(diagonalDown.x1),
  );
  mirrorGuideDiagonalDownElement.setAttribute(
    "y1",
    String(diagonalDown.y1),
  );
  mirrorGuideDiagonalDownElement.setAttribute(
    "x2",
    String(diagonalDown.x2),
  );
  mirrorGuideDiagonalDownElement.setAttribute(
    "y2",
    String(diagonalDown.y2),
  );
  mirrorGuideDiagonalUpElement.setAttribute(
    "x1",
    String(diagonalUp.x1),
  );
  mirrorGuideDiagonalUpElement.setAttribute(
    "y1",
    String(diagonalUp.y1),
  );
  mirrorGuideDiagonalUpElement.setAttribute(
    "x2",
    String(diagonalUp.x2),
  );
  mirrorGuideDiagonalUpElement.setAttribute(
    "y2",
    String(diagonalUp.y2),
  );
  mirrorGuideVerticalElement.classList.toggle("is-disabled", !mirrorAxes.x);
  mirrorGuideHorizontalElement.classList.toggle("is-disabled", !mirrorAxes.y);
  mirrorGuideDiagonalDownElement.classList.toggle(
    "is-disabled",
    !mirrorAxes.diagonalDown,
  );
  mirrorGuideDiagonalUpElement.classList.toggle(
    "is-disabled",
    !mirrorAxes.diagonalUp,
  );
  mirrorGuideVerticalElement.dataset.enabled = String(mirrorAxes.x);
  mirrorGuideHorizontalElement.dataset.enabled = String(mirrorAxes.y);
  mirrorGuideDiagonalDownElement.dataset.enabled = String(
    mirrorAxes.diagonalDown,
  );
  mirrorGuideDiagonalUpElement.dataset.enabled = String(
    mirrorAxes.diagonalUp,
  );
  mirrorGuideVerticalElement.toggleAttribute("hidden", !verticalVisible);
  mirrorGuideHorizontalElement.toggleAttribute("hidden", !horizontalVisible);
  mirrorGuideDiagonalDownElement.toggleAttribute("hidden", !verticalVisible);
  mirrorGuideDiagonalUpElement.toggleAttribute("hidden", !horizontalVisible);
  mirrorGuideOverlayElement.toggleAttribute(
    "hidden",
    !mirrorEnabled,
  );
  syncMirrorLineToggle(
    mirrorToggleX,
    mirrorAxes.x,
    mirrorEnabled,
    "Vertical line",
  );
  syncMirrorLineToggle(
    mirrorToggleY,
    mirrorAxes.y,
    mirrorEnabled,
    "Horizontal line",
  );
  syncMirrorLineToggle(
    mirrorToggleDiagonalDown,
    mirrorAxes.diagonalDown,
    mirrorEnabled,
    "Descending diagonal line",
  );
  syncMirrorLineToggle(
    mirrorToggleDiagonalUp,
    mirrorAxes.diagonalUp,
    mirrorEnabled,
    "Ascending diagonal line",
  );
  positionMirrorLineToggles(asset);
}

function onionFrameImage(
  asset: RasterAsset,
  frameId: string,
): ImageData {
  if (onionSkinCache?.state !== state) {
    onionSkinCache = { state, frames: new Map<string, ImageData>() };
  }
  const cached = onionSkinCache.frames.get(frameId);
  if (cached !== undefined) return cached;
  const image = compositeRegion({
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height,
  }, frameId);
  onionSkinCache.frames.set(frameId, image);
  return image;
}

function drawOnionSkinProjection(asset: RasterAsset): number {
  if (!onionSkinEnabled) return 0;
  const projection = resolveOnionSkinNeighborhood(
    state,
    timelineSession.activeFrameId,
    {
      enabled: true,
      previousFrameCount: onionSkinPreviousFrames,
      nextFrameCount: onionSkinNextFrames,
      opacity: onionSkinOpacity,
    },
  );
  if (projection.references.length === 0) return 0;
  const output = selectionOverlayContext.createImageData(
    asset.width,
    asset.height,
  );
  for (const reference of projection.references) {
    const source = onionFrameImage(asset, reference.frameId);
    const tint = reference.role === "PREVIOUS"
      ? { red: 255, green: 90, blue: 116 }
      : { red: 78, green: 178, blue: 255 };
    for (let offset = 0; offset < source.data.length; offset += 4) {
      const sourceAlpha = (source.data[offset + 3] ?? 0) / 255;
      const alpha = sourceAlpha * reference.opacity;
      if (alpha <= 0) continue;
      const existingAlpha = (output.data[offset + 3] ?? 0) / 255;
      const resultAlpha = alpha + existingAlpha * (1 - alpha);
      if (resultAlpha <= 0) continue;
      const color = onionSkinColorMode === "ORIGINAL"
        ? {
          red: source.data[offset] ?? 0,
          green: source.data[offset + 1] ?? 0,
          blue: source.data[offset + 2] ?? 0,
        }
        : tint;
      output.data[offset] = Math.round(
        (color.red * alpha +
          (output.data[offset] ?? 0) * existingAlpha * (1 - alpha)) /
          resultAlpha,
      );
      output.data[offset + 1] = Math.round(
        (color.green * alpha +
          (output.data[offset + 1] ?? 0) * existingAlpha * (1 - alpha)) /
          resultAlpha,
      );
      output.data[offset + 2] = Math.round(
        (color.blue * alpha +
          (output.data[offset + 2] ?? 0) * existingAlpha * (1 - alpha)) /
          resultAlpha,
      );
      output.data[offset + 3] = Math.round(resultAlpha * 255);
    }
  }
  selectionOverlayContext.putImageData(output, 0, 0);
  return projection.references.length;
}

function clearErasePreview(): void {
  eraseProjectionContext.clearRect(
    0,
    0,
    erasePreview.width,
    erasePreview.height,
  );
  erasePreview.hidden = true;
  erasePreview.style.removeProperty("clip-path");
}

function drawErasePreview(
  asset: RasterAsset,
  points: readonly { x: number; y: number }[],
  cachedWrites?: readonly { x: number; y: number; colorIndex: number }[],
): void {
  const writes = previewWriteSet(asset, "eraser", points, cachedWrites);
  drawErasePreviewWrites(asset, writes);
}

function drawErasePreviewWrites(
  asset: RasterAsset,
  writes: readonly { x: number; y: number }[],
): void {
  if (writes.length === 0) return;
  let minX = asset.width;
  let minY = asset.height;
  let maxX = -1;
  let maxY = -1;
  const transparentPixels = new Set<string>();
  for (const point of writes) {
    if (
      point.x < 0 || point.y < 0 || point.x >= asset.width ||
      point.y >= asset.height
    ) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    transparentPixels.add(selectionPointKey(point));
  }
  if (maxX < minX || maxY < minY) return;
  const region = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const image = compositeRegion(
    region,
    timelineSession.activeFrameId,
    { assetId: asset.id, transparentPixels },
  );
  eraseProjectionContext.clearRect(
    0,
    0,
    erasePreview.width,
    erasePreview.height,
  );
  eraseProjectionContext.putImageData(image, region.x, region.y);
  const top = (region.y / asset.height) * 100;
  const right = ((asset.width - region.x - region.width) / asset.width) * 100;
  const bottom = ((asset.height - region.y - region.height) / asset.height) *
    100;
  const left = (region.x / asset.width) * 100;
  erasePreview.style.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  erasePreview.hidden = false;
}

/**
 * Overlay rendering is a visual projection only. Coalesced pointer samples
 * can arrive much faster than the display refresh, so keep input collection
 * synchronous but render at most once per animation frame.
 */
function scheduleDrawOverlay(): void {
  if (overlayDrawFrame !== undefined) return;
  const draw = (): void => {
    overlayDrawFrame = undefined;
    overlayDrawFrameKind = undefined;
    drawOverlay();
  };
  if (typeof window.requestAnimationFrame === "function") {
    overlayDrawFrameKind = "raf";
    overlayDrawFrame = window.requestAnimationFrame(draw);
    return;
  }
  // Older embedded WebViews may not expose rAF. Keep the same coalescing
  // contract with a single short timer rather than rendering per pointermove.
  overlayDrawFrameKind = "timeout";
  overlayDrawFrame = window.setTimeout(draw, 16);
}

function flushDrawOverlay(): void {
  if (overlayDrawFrame !== undefined) {
    if (overlayDrawFrameKind === "raf") {
      window.cancelAnimationFrame(overlayDrawFrame);
    } else if (overlayDrawFrameKind === "timeout") {
      window.clearTimeout(overlayDrawFrame);
    }
    overlayDrawFrame = undefined;
    overlayDrawFrameKind = undefined;
  }
  drawOverlay();
}

function drawOverlay(): void {
  selectionOverlayContext.clearRect(0, 0, overlay.width, overlay.height);
  clearErasePreview();
  if (playbackRunning) {
    selectionOverlay.setAttribute("hidden", "");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  const tilemapMode = activeLayerIsTilemap();
  if (asset !== undefined && !tilemapMode) drawOnionSkinProjection(asset);
  if (asset !== undefined && !tilemapMode) drawPendingDrawPreviews(asset);
  const tool = currentBasicTool();
  const interactionSession = drawInteraction?.session;
  const interactionPoints = interactionSession?.points ?? [];
  const interactionPreviewWrites = interactionSession?.previewWrites;
  const previewPoints = interactionPoints.length > 0
    ? interactionPoints
    : virtualCursorEnabled && hoverPoint !== undefined
    ? [hoverPoint]
    : [];
  if (asset !== undefined && !tilemapMode && previewPoints.length > 0) {
    try {
      if (tool === "eraser") {
        drawErasePreview(asset, previewPoints, interactionPreviewWrites);
      }
      drawCurrentToolPreview(
        asset,
        tool,
        previewPoints,
        interactionPreviewWrites,
      );
    } catch {
      // A bounded preview failure must never mutate Canonical Raster.
    }
  }
  if (asset !== undefined && !tilemapMode && transformPreview !== undefined) {
    if (!pasteMode && selection !== undefined) {
      drawErasePreviewWrites(asset, selection.pixels);
    }
    drawTransformPreviewPixels(asset, transformPreview.pixels);
  }
  const textTarget = pendingTextTarget;
  const textTargetIsCurrent = asset !== undefined && textTarget !== undefined &&
    textTarget.assetId === asset.id &&
    textTarget.celId === state.activeCelId &&
    textTarget.structureEpoch === state.structureEpoch;
  if (
    textTargetIsCurrent && pendingTextBounds !== undefined &&
    pendingTextDraft !== undefined && !tilemapMode
  ) {
    drawTextPreviewPixels(
      asset,
      pendingTextBounds,
      pendingTextDraft.writes,
      0.72,
    );
  }
  if (asset !== undefined && !tilemapMode) syncMirrorGuideOverlay(asset);
  const draftRegions = selectionDraft?.snapshot?.mask.regions ?? [];
  const pendingPoints = pendingSelectionGesture?.tool === "select-lasso" ||
      pendingSelectionGesture?.tool === "select-polygon"
    ? pendingSelectionGesture.points
    : [];
  const pendingRegions = pendingSelectionGesture?.tool === "select-rect" &&
      pendingSelectionGesture.points.length > 0
    ? [
      pendingSelectionGesture.grid !== undefined
        ? snapSelectionBoundsToGrid(
          pendingSelectionGesture.grid.anchor,
          pendingSelectionGesture.points.at(-1) ??
            pendingSelectionGesture.grid.anchor,
          asset ?? { width: canvas.width, height: canvas.height },
          pendingSelectionGesture.grid.size,
        )
        : normalizeToolBounds(
          pendingSelectionGesture.points[0]!,
          pendingSelectionGesture
            .points[pendingSelectionGesture.points.length - 1]!,
          asset ?? { width: canvas.width, height: canvas.height },
        ),
    ]
    : [];
  const pendingEllipseRegion = asset !== undefined &&
      pendingSelectionGesture?.tool === "select-ellipse" &&
      pendingSelectionGesture.points.length > 0
    ? normalizeToolBounds(
      pendingSelectionGesture.points[0]!,
      pendingSelectionGesture.points.at(-1) ??
        pendingSelectionGesture.points[0]!,
      asset,
    )
    : undefined;
  renderSelectionSvgOverlay(
    selection?.mask.regions ?? [],
    transformPreview?.overlayRegions ?? [],
    [...draftRegions, ...pendingRegions],
    pendingPoints,
    pendingEllipseRegion,
    textTargetIsCurrent && pendingTextBounds !== undefined
      ? [pendingTextBounds]
      : [],
    selectionFrameRegionForOverlay(),
  );
}

const MAX_TRANSFORM_PREVIEW_PIXELS = 32_768;

function drawLargeTransformPreviewTiles(
  asset: RasterAsset,
  pixels: readonly { x: number; y: number; colorIndex: number }[],
  opacity: number,
): boolean {
  const scratch = getTransformPreviewScratch();
  if (scratch === undefined) return false;
  const tiles = new Map<string, {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly pixels: Array<{
      x: number;
      y: number;
      colorIndex: number;
    }>;
  }>();
  for (const pixel of pixels) {
    if (
      pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width ||
      pixel.y >= asset.height
    ) continue;
    const tileX = Math.floor(pixel.x / TRANSFORM_PREVIEW_TILE_SIZE) *
      TRANSFORM_PREVIEW_TILE_SIZE;
    const tileY = Math.floor(pixel.y / TRANSFORM_PREVIEW_TILE_SIZE) *
      TRANSFORM_PREVIEW_TILE_SIZE;
    const key = `${tileX}:${tileY}`;
    let tile = tiles.get(key);
    if (tile === undefined) {
      tile = {
        x: tileX,
        y: tileY,
        width: Math.min(TRANSFORM_PREVIEW_TILE_SIZE, asset.width - tileX),
        height: Math.min(TRANSFORM_PREVIEW_TILE_SIZE, asset.height - tileY),
        pixels: [],
      };
      tiles.set(key, tile);
    }
    tile.pixels.push(pixel);
  }
  if (tiles.size === 0) return true;

  const { canvas, context } = scratch;
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.globalAlpha = opacity;
  try {
    for (const tile of tiles.values()) {
      context.clearRect(
        0,
        0,
        TRANSFORM_PREVIEW_TILE_SIZE,
        TRANSFORM_PREVIEW_TILE_SIZE,
      );
      const image = context.createImageData(tile.width, tile.height);
      for (const pixel of tile.pixels) {
        const localX = pixel.x - tile.x;
        const localY = pixel.y - tile.y;
        const color = decodeArgb(
          paletteColorForRender(asset, pixel.colorIndex),
        );
        if (color.alpha <= 0) continue;
        const offset = (localY * tile.width + localX) * 4;
        image.data[offset] = color.red;
        image.data[offset + 1] = color.green;
        image.data[offset + 2] = color.blue;
        image.data[offset + 3] = color.alpha;
      }
      context.putImageData(image, 0, 0);
      selectionOverlayContext.drawImage(
        canvas,
        0,
        0,
        tile.width,
        tile.height,
        tile.x,
        tile.y,
        tile.width,
        tile.height,
      );
    }
  } finally {
    selectionOverlayContext.restore();
  }
  return true;
}

function drawTransformPreviewPixels(
  asset: RasterAsset,
  pixels: readonly { x: number; y: number; colorIndex: number }[],
  opacity = 0.86,
): void {
  if (pixels.length === 0) return;
  // Keep pointer-move previews cheap for very large selections by rasterizing
  // bounded floating tiles instead of dropping the pixel projection entirely.
  if (
    pixels.length > MAX_TRANSFORM_PREVIEW_PIXELS &&
    drawLargeTransformPreviewTiles(asset, pixels, opacity)
  ) return;
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.globalAlpha = opacity;
  const firstColorIndex = pixels[0]?.colorIndex;
  if (
    firstColorIndex !== undefined && pixels.every((pixel) =>
      pixel.colorIndex === firstColorIndex
    )
  ) {
    const color = decodeArgb(
      paletteColorForRender(asset, firstColorIndex),
    );
    if (color.alpha > 0) {
      selectionOverlayContext.fillStyle =
        `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
      for (const pixel of pixels) {
        if (
          pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width ||
          pixel.y >= asset.height
        ) continue;
        selectionOverlayContext.fillRect(pixel.x, pixel.y, 1, 1);
      }
    }
    selectionOverlayContext.restore();
    return;
  }
  for (const pixel of pixels) {
    if (
      pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width ||
      pixel.y >= asset.height
    ) continue;
    const color = decodeArgb(paletteColorForRender(asset, pixel.colorIndex));
    if (color.alpha <= 0) continue;
    selectionOverlayContext.fillStyle =
      `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
    selectionOverlayContext.fillRect(pixel.x, pixel.y, 1, 1);
  }
  selectionOverlayContext.restore();
}

function drawTextPreviewPixels(
  asset: RasterAsset,
  bounds: RasterClipRect,
  writes: readonly TextPreviewWrite[],
  opacity = 0.72,
): void {
  if (writes.length === 0) return;
  drawTransformPreviewPixels(
    asset,
    writes.map((write) => ({
      x: bounds.x + write.x,
      y: bounds.y + write.y,
      colorIndex: write.colorIndex,
    })),
    opacity,
  );
}

function previewWriteSet(
  asset: RasterAsset,
  tool: BasicTool,
  points: readonly { x: number; y: number }[],
  cachedWrites?: readonly { x: number; y: number; colorIndex: number }[],
): readonly { x: number; y: number }[] {
  // A timeline switch must never let a previous cel's selection become a
  // coordinate-only write mask for the newly active cel. Fail closed until
  // the stale local projection is cleared by the timeline transition.
  if (selection !== undefined && !selectionScopeMatchesActiveCel()) return [];
  const first = points[0];
  const last = points[points.length - 1] ?? first;
  if (first === undefined || last === undefined) return [];
  const writes = cachedWrites !== undefined &&
      (tool === "pen" || tool === "pixel-pen" || tool === "eraser")
    ? mirrorWritesForTool(cachedWrites, asset, tool)
    : tool === "pen" || tool === "eraser"
    ? mirrorWritesForTool(
      createPathWriteSet(
        tool,
        points,
        selectedColor,
        toolOptions,
        asset.raster,
      ),
      asset,
      tool,
    )
    : points.length === 1
    ? mirrorWritesForTool(
      createToolPreviewWriteSet(
        tool,
        first,
        selectedColor,
        toolOptions,
        asset.raster,
      ),
      asset,
      tool,
    )
    : mirrorWritesForTool(
      createWriteSet(
        tool,
        first,
        last,
        selectedColor,
        toolOptions,
        asset.raster,
      ),
      asset,
      tool,
    );
  const selectionClip = activeRectangleSelectionClip();
  const selectionKeys = selectionClip === undefined && selection !== undefined
    ? new Set(selection.pixels.map(selectionPointKey))
    : undefined;
  const selectedWrites = selectionClip === undefined
    ? selectionKeys === undefined
      ? writes
      : writes.filter((write) => selectionKeys.has(selectionPointKey(write)))
    : writes.filter((write) =>
      write.x >= selectionClip.x && write.y >= selectionClip.y &&
      write.x < selectionClip.x + selectionClip.width &&
      write.y < selectionClip.y + selectionClip.height
    );
  return selectedWrites
    .map(({ x, y }) => ({ x, y }));
}

function guideColor(
  asset: RasterAsset,
  tool: BasicTool,
): { alpha: number; red: number; green: number; blue: number } {
  return tool === "eraser"
    ? { alpha: 255, red: 255, green: 104, blue: 124 }
    : decodeArgb(paletteColorForRender(asset, selectedColor));
}

function fillPreviewCacheKey(
  asset: RasterAsset,
  seed: { readonly x: number; readonly y: number },
): string {
  const selectionKey = selection === undefined
    ? "none"
    : [
      selection.selectionId,
      selection.mask.selectionVersion,
      selection.pixels.length,
      selectionInteractionGeneration,
    ].join(":");
  return [
    state.projectId,
    asset.id,
    asset.revision,
    state.activeLayerId,
    state.activeFrameId,
    state.activeCelId,
    selectedColor,
    seed.x,
    seed.y,
    selectionKey,
  ].join("|");
}

/**
 * Builds the same bounded flood region used by the real fill operation.
 * The region is cached for a gesture because a gradient drag changes only
 * the colour projection, not the connected pixels.
 */
function fillPreviewRegion(
  asset: RasterAsset,
  seed: { readonly x: number; readonly y: number },
): readonly { x: number; y: number }[] {
  const key = fillPreviewCacheKey(asset, seed);
  if (fillPreviewRegionCache?.key === key) {
    return fillPreviewRegionCache.region;
  }
  if (selection !== undefined && !selectionScopeMatchesActiveCel()) {
    fillPreviewRegionCache = { key, region: [] };
    return [];
  }
  const clip = activeRectangleSelectionClip();
  const selectedPointKeys = clip === undefined && selection !== undefined
    ? new Set(selection.pixels.map(selectionPointKey))
    : undefined;
  const isAllowed = selection === undefined
    ? undefined
    : (point: { readonly x: number; readonly y: number }): boolean => {
      if (clip !== undefined) {
        return point.x >= clip.x && point.y >= clip.y &&
          point.x < clip.x + clip.width &&
          point.y < clip.y + clip.height;
      }
      return selectedPointKeys?.has(selectionPointKey(point)) ?? false;
    };
  const writes = createFillPreviewWriteSet(
    asset.raster,
    seed,
    selectedColor,
    32_768,
    isAllowed,
  );
  const region = writes.map(({ x, y }) => ({ x, y }));
  fillPreviewRegionCache = { key, region };
  return region;
}

function fillPreviewWrites(
  asset: RasterAsset,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  colorIndex = selectedColor,
): readonly ColoredPixel[] {
  const region = fillPreviewRegion(asset, from);
  if (region.length === 0) return [];
  return createIndexedGradientWriteSet(
    asset.raster,
    region,
    from,
    to,
    asset.raster.getPixel(from.x, from.y),
    colorIndex,
    asset.palette,
  );
}

function drawCurrentToolPreview(
  asset: RasterAsset,
  tool: BasicTool,
  points: readonly { x: number; y: number }[],
  cachedWrites?: readonly { x: number; y: number; colorIndex: number }[],
): void {
  const first = points[0];
  const last = points[points.length - 1] ?? first;
  if (first === undefined || last === undefined || tool === "pan") return;
  if (tool === "eraser") return;
  if (tool === "fill") {
    if (selection !== undefined && !selectionScopeMatchesActiveCel()) return;
    const writes = fillPreviewWrites(asset, first, last);
    if (writes.length > 0) drawTransformPreviewPixels(asset, writes);
    // Keep a cursor for hover and for large regions where a full preview would
    // be more expensive than useful. The committed operation remains bounded.
    if (selection === undefined || pointIsSelectedPixel(selection, last)) {
      drawToolCursor(last, guideColor(asset, tool));
    }
    return;
  }
  if (tool === "eyedropper") {
    const sampled = decodeArgb(
      paletteColorForRender(asset, asset.raster.getPixel(last.x, last.y)),
    );
    drawToolCursor(last, {
      alpha: 255,
      red: 255 - sampled.red,
      green: 255 - sampled.green,
      blue: 255 - sampled.blue,
    });
    return;
  }
  if (
    tool === "select-rect" || tool === "select-ellipse" ||
    tool === "select-lasso" || tool === "select-polygon"
  ) {
    return;
  }
  if (tool === "tile-stamp" || tool === "move") {
    drawToolCursor(last, guideColor(asset, tool));
    return;
  }
  if (tool === "select-color") {
    drawToolCursor(last, { alpha: 255, red: 248, green: 212, blue: 119 });
    return;
  }
  drawToolPreviewGuide(
    previewWriteSet(asset, tool, points, cachedWrites),
    guideColor(asset, tool),
  );
}

function drawToolCursor(
  point: { x: number; y: number },
  color: { alpha: number; red: number; green: number; blue: number },
): void {
  const luminance = (color.red * 0.299) + (color.green * 0.587) +
    (color.blue * 0.114);
  const contrast = luminance > 145
    ? "rgba(12, 16, 24, 0.96)"
    : "rgba(255, 255, 255, 0.96)";
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.fillStyle = contrast;
  selectionOverlayContext.fillRect(point.x - 1, point.y, 3, 1);
  selectionOverlayContext.fillRect(point.x, point.y - 1, 1, 3);
  selectionOverlayContext.fillStyle =
    `rgba(${color.red}, ${color.green}, ${color.blue}, ${
      Math.max(0.45, color.alpha / 255)
    })`;
  selectionOverlayContext.fillRect(point.x, point.y, 1, 1);
  selectionOverlayContext.restore();
}

function drawToolPreviewGuide(
  points: readonly { x: number; y: number }[],
  color: { alpha: number; red: number; green: number; blue: number },
): void {
  if (points.length === 0) return;
  const alpha = Math.max(0, Math.min(1, color.alpha / 255));
  selectionOverlayContext.save();
  selectionOverlayContext.imageSmoothingEnabled = false;
  selectionOverlayContext.setLineDash([]);
  if (points.length > 4096) {
    const image = selectionOverlayContext.createImageData(
      overlay.width,
      overlay.height,
    );
    const imageAlpha = Math.round(alpha * 255);
    for (const point of points) {
      if (
        point.x < 0 || point.y < 0 || point.x >= overlay.width ||
        point.y >= overlay.height
      ) continue;
      const offset = (point.y * overlay.width + point.x) * 4;
      image.data[offset] = color.red;
      image.data[offset + 1] = color.green;
      image.data[offset + 2] = color.blue;
      image.data[offset + 3] = imageAlpha;
    }
    selectionOverlayContext.putImageData(image, 0, 0);
    selectionOverlayContext.restore();
    return;
  }
  selectionOverlayContext.fillStyle =
    `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
  for (const point of points) {
    selectionOverlayContext.fillRect(point.x, point.y, 1, 1);
  }
  selectionOverlayContext.restore();
}

function markPreviewMetrics(): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  metrics.textContent =
    `backend=reference-indexed · prep=0px · present=0px · journal=${journal.operations.length} · checkpoints=${journal.checkpoints.length} · allocatedTiles=${asset.raster.memoryMetrics().tileCount} · scope=PREVIEW_ONLY canonicalDirtyTiles=0`;
}

function markCanonicalMetrics(): void {
  if (!metrics.textContent.includes("scope=PREVIEW_ONLY")) return;
  metrics.textContent = metrics.textContent.replace(
    "scope=PREVIEW_ONLY canonicalDirtyTiles=0",
    "scope=CANONICAL",
  );
}

function hasLayerComposite(): boolean {
  return state.layers.length > 1 ||
    state.layers.some((item) => item.kind === "TILEMAP") ||
    state.cels.some((item) =>
      item.assetId !== undefined && item.assetId !== state.activeAssetId
    ) ||
    state.layers.some((item) =>
      item.opacity !== 1 || item.blendMode !== "NORMAL" || !item.visible
    );
}

function tilemapSourcePixel(
  map: Draw2Tilemap,
  x: number,
  y: number,
): { readonly asset: RasterAsset; readonly colorIndex: number } | undefined {
  if (
    x < 0 || y < 0 || x >= map.columns * map.cellSize ||
    y >= map.rows * map.cellSize
  ) return undefined;
  const cellX = Math.floor(x / map.cellSize);
  const cellY = Math.floor(y / map.cellSize);
  const cell = tilemapCellAt(map, cellX, cellY);
  if (cell === undefined) return undefined;
  const asset = state.assets[cell.sourceAssetId];
  if (asset === undefined) return undefined;
  let localX = x % map.cellSize;
  let localY = y % map.cellSize;
  if (cell.transform === "FLIP_X") localX = map.cellSize - 1 - localX;
  if (cell.transform === "FLIP_Y") localY = map.cellSize - 1 - localY;
  if (cell.transform === "ROTATE_90") {
    const rotatedX = map.cellSize - 1 - localY;
    localY = localX;
    localX = rotatedX;
  }
  const sourceX = cell.sourceX * map.cellSize + localX;
  const sourceY = cell.sourceY * map.cellSize + localY;
  if (
    sourceX < 0 || sourceY < 0 || sourceX >= asset.width ||
    sourceY >= asset.height
  ) {
    return undefined;
  }
  return { asset, colorIndex: asset.raster.getPixel(sourceX, sourceY) };
}

function paletteColorForRender(
  asset: RasterAsset,
  paletteIndex: number,
): number {
  if (
    asset.id === state.activeAssetId && paletteIndex === selectedColor &&
    colorDraftDirty && colorDraft !== undefined
  ) return argbFromRgb(colorDraft, colorDraftAlpha);
  return asset.palette[paletteIndex] ?? 0;
}

function compositeRegion(
  region: { x: number; y: number; width: number; height: number },
  frameId = timelineSession.activeFrameId,
  previewOverrides?: {
    readonly assetId: string;
    readonly transparentPixels: ReadonlySet<string>;
  },
  layerIds?: readonly string[],
): ImageData {
  const image = canonicalContext.createImageData(region.width, region.height);
  const orderedLayers = state.timeline.layerTrackOrder
    .map((layerTrackId) =>
      state.layers.find((item) => item.layerTrackId === layerTrackId)
    )
    .filter((item): item is NonNullable<typeof item> =>
      item !== undefined && item.visible && item.opacity > 0 &&
        (layerIds === undefined || layerIds.includes(item.layerTrackId))
    );
  for (const layer of orderedLayers) {
    const tilemap = layer.kind === "TILEMAP"
      ? state.tilemaps?.[tilemapIdFor(layer.layerTrackId, frameId)]
      : undefined;
    const cel = state.cels.find((item) =>
      item.layerTrackId === layer.layerTrackId && item.frameId === frameId &&
      item.lifecycle === "ACTIVE" &&
      (item.assetId !== undefined || tilemap !== undefined)
    );
    const source = cel?.assetId === undefined
      ? undefined
      : state.assets[cel.assetId];
    if (source === undefined && tilemap === undefined) continue;
    const pixels = source === undefined ? undefined : source.raster.readRegion(
      region.x,
      region.y,
      region.width,
      region.height,
    )
      .pixels;
    const pixelCount = region.width * region.height;
    for (let index = 0; index < pixelCount; index += 1) {
      const globalX = region.x + (index % region.width);
      const globalY = region.y + Math.floor(index / region.width);
      const tilePixel = tilemap === undefined
        ? undefined
        : tilemapSourcePixel(tilemap, globalX, globalY);
      const sourceAsset = tilePixel?.asset ?? source;
      const sourceColorIndex = tilePixel?.colorIndex ?? pixels?.[index];
      if (sourceAsset === undefined || sourceColorIndex === undefined) continue;
      const previewColorIndex = previewOverrides !== undefined &&
          sourceAsset.id === previewOverrides.assetId &&
          previewOverrides.transparentPixels.has(
            selectionPointKey({ x: globalX, y: globalY }),
          )
        ? 0
        : sourceColorIndex;
      const sourceColor = decodeArgb(
        paletteColorForRender(sourceAsset, previewColorIndex),
      );
      const sourceAlpha = (sourceColor.alpha / 255) * layer.opacity;
      if (sourceAlpha <= 0) continue;
      const target = index * 4;
      const destinationAlpha = (image.data[target + 3] ?? 0) / 255;
      const sourceRgb = [
        sourceColor.red / 255,
        sourceColor.green / 255,
        sourceColor.blue / 255,
      ] as const;
      const destinationRgb = [
        (image.data[target + 0] ?? 0) / 255,
        (image.data[target + 1] ?? 0) / 255,
        (image.data[target + 2] ?? 0) / 255,
      ] as const;
      const blendRgb = layer.blendMode === "MULTIPLY"
        ? [
          sourceRgb[0] * destinationRgb[0],
          sourceRgb[1] * destinationRgb[1],
          sourceRgb[2] * destinationRgb[2],
        ] as const
        : sourceRgb;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) continue;
      image.data[target] = Math.round(
        ((blendRgb[0] * sourceAlpha +
          destinationRgb[0] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha) * 255,
      );
      image.data[target + 1] = Math.round(
        ((blendRgb[1] * sourceAlpha +
          destinationRgb[1] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha) * 255,
      );
      image.data[target + 2] = Math.round(
        ((blendRgb[2] * sourceAlpha +
          destinationRgb[2] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha) * 255,
      );
      image.data[target + 3] = Math.round(outputAlpha * 255);
    }
  }
  return image;
}

let tilesetSourceRenderKey = "";
function renderTilesetSourceCanvas(asset: RasterAsset): void {
  if (tilesetSourceCanvas === null || tilesetSourceContext === null) return;
  const draftKey = colorDraftDirty && colorDraft !== undefined
    ? `${colorDraft.r},${colorDraft.g},${colorDraft.b},${colorDraftAlpha}`
    : "none";
  const key = `${asset.id}:${asset.revision}:${selectedColor}:${draftKey}`;
  if (
    key === tilesetSourceRenderKey &&
    tilesetSourceCanvas.width === asset.width &&
    tilesetSourceCanvas.height === asset.height
  ) return;
  if (tilesetSourceCanvas.width !== asset.width) {
    tilesetSourceCanvas.width = asset.width;
  }
  if (tilesetSourceCanvas.height !== asset.height) {
    tilesetSourceCanvas.height = asset.height;
  }
  const pixels =
    asset.raster.readRegion(0, 0, asset.width, asset.height).pixels;
  const image = tilesetSourceContext.createImageData(asset.width, asset.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const color = decodeArgb(
      paletteColorForRender(asset, pixels[index] ?? 0),
    );
    image.data[index * 4] = color.red;
    image.data[index * 4 + 1] = color.green;
    image.data[index * 4 + 2] = color.blue;
    image.data[index * 4 + 3] = color.alpha;
  }
  tilesetSourceContext.putImageData(image, 0, 0);
  tilesetSourceCanvas.dataset.draw2SourceReady = "true";
  tilesetSourceRenderKey = key;
}

async function present(
  dirtyRegions: readonly DirtyRegion[] = [],
  dirtyTiles: readonly DirtyTile[] = [],
): Promise<void> {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Draw2 active asset is missing.");
  const regions = dirtyRegions.length > 0 ? dirtyRegions : [{
    assetId: asset.id,
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height,
  }];
  for (const region of regions) {
    const snapshot = asset.raster.readRegion(
      region.x,
      region.y,
      region.width,
      region.height,
    );
    const image = hasLayerComposite()
      ? compositeRegion(region)
      : canonicalContext.createImageData(region.width, region.height);
    if (!hasLayerComposite()) {
      for (let index = 0; index < snapshot.pixels.length; index += 1) {
        const { alpha, red, green, blue } = decodeArgb(
          paletteColorForRender(asset, snapshot.pixels[index] ?? 0),
        );
        const target = index * 4;
        image.data[target] = red;
        image.data[target + 1] = green;
        image.data[target + 2] = blue;
        image.data[target + 3] = alpha;
      }
    }
    canonicalContext.putImageData(image, region.x, region.y);
  }
  renderTilesetSourceCanvas(asset);
  const result = await renderer.render({
    state,
    assetId: asset.id,
    dirtyTiles,
    dirtyRegions,
    mode: dirtyRegions.length > 0 ? "DIRTY_REGIONS" : "FULL_REFRESH_GOLDEN",
  });
  const previewMetric = colorDraftDirty
    ? "scope=COLOR_PREVIEW canonicalDirtyTiles=0"
    : transformPreview === undefined
    ? "scope=CANONICAL"
    : "scope=PREVIEW_ONLY canonicalDirtyTiles=0";
  metrics.textContent =
    `backend=${result.backendId} · prep=${result.preparationPixelCount}px · present=${result.presentPixelCount}px · journal=${journal.operations.length} · checkpoints=${journal.checkpoints.length} · allocatedTiles=${asset.raster.memoryMetrics().tileCount} · ${previewMetric}`;
  updatePixelGridOverlay();
  drawMiniPreviewProjection();
  drawOverlay();
}

/**
 * Paints a frame projection for local playback without changing ProjectState,
 * the active Cel, or the undo journal. Playback must be a renderer projection;
 * otherwise every animation tick would become a canonical edit.
 */
async function presentPlaybackFrame(
  frameId: string,
  generation = playbackGeneration,
): Promise<void> {
  if (!playbackRunning || generation !== playbackGeneration) return;
  if (!state.timeline.frameOrder.includes(frameId)) return;
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const region = { x: 0, y: 0, width: asset.width, height: asset.height };
  canonicalContext.clearRect(0, 0, asset.width, asset.height);
  canonicalContext.putImageData(compositeRegion(region, frameId), 0, 0);
  canonicalContext.imageSmoothingEnabled = false;
  drawMiniPreviewProjection();
  drawOverlay();
}

/**
 * Paint the artwork monitor from Audio's musical clock. This is deliberately
 * a renderer projection: it never changes the Draw journal or creates a Draw
 * playback timer of its own.
 */
async function presentAudioLinkedPlaybackFrame(frameId: string): Promise<void> {
  if (workspaceFrameElement?.dataset.creatorMode !== "AUDIO") return;
  if (!state.timeline.frameOrder.includes(frameId)) return;
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const region = { x: 0, y: 0, width: asset.width, height: asset.height };
  canonicalContext.clearRect(0, 0, asset.width, asset.height);
  canonicalContext.putImageData(compositeRegion(region, frameId), 0, 0);
  canonicalContext.imageSmoothingEnabled = false;
  drawMiniPreviewProjection();
  drawOverlay();
}

function currentBasicTool(): BasicTool {
  const value = toolSelect.value as BasicTool;
  if (value === "pixel-pen") return "pen";
  if (value === "select-polygon") return "select-lasso";
  if (value === "tile-stamp") return "pen";
  return value;
}

function toolSupportsMirror(tool: BasicTool): boolean {
  return [
    "pen",
    "pixel-pen",
    "eraser",
    "line",
    "rect",
    "rect-fill",
    "ellipse",
    "ellipse-fill",
    "circle",
    "circle-fill",
  ].includes(tool);
}

function mirrorAppliesToTool(tool: BasicTool): boolean {
  return mirrorEnabled && mirrorHasActiveAxis() && [
    "pen",
    "pixel-pen",
    "eraser",
    "line",
    "rect",
    "rect-fill",
    "ellipse",
    "ellipse-fill",
    "circle",
    "circle-fill",
  ].includes(tool);
}

function mirrorWritesForTool(
  writes: readonly { x: number; y: number; colorIndex: number }[],
  asset: Pick<RasterAsset, "width" | "height">,
  tool: BasicTool,
): readonly { x: number; y: number; colorIndex: number }[] {
  if (!mirrorAppliesToTool(tool)) return writes;
  mirrorGuide = normalizeMirrorGuide(asset);
  const reflectAxes: MirrorGuideAxis[] = [
    ...(mirrorAxes.x ? ["x" as const] : []),
    ...(mirrorAxes.y ? ["y" as const] : []),
    ...(mirrorAxes.diagonalDown ? ["diagonal-down" as const] : []),
    ...(mirrorAxes.diagonalUp ? ["diagonal-up" as const] : []),
  ];
  const reflectPoint = (
    point: { x: number; y: number },
    axis: MirrorGuideAxis,
  ): { x: number; y: number } => {
    if (axis === "x") {
      return { x: (mirrorGuide.x * 2) - point.x, y: point.y };
    }
    if (axis === "y") {
      return { x: point.x, y: (mirrorGuide.y * 2) - point.y };
    }
    const maxX = Math.max(1, asset.width - 1);
    const maxY = Math.max(1, asset.height - 1);
    const normalizedX = point.x / maxX;
    const normalizedY = point.y / maxY;
    if (axis === "diagonal-down") {
      return {
        x: (normalizedY - mirrorGuide.diagonalDown) * maxX,
        y: (normalizedX + mirrorGuide.diagonalDown) * maxY,
      };
    }
    return {
      x: (1 + mirrorGuide.diagonalUp - normalizedY) * maxX,
      y: (1 + mirrorGuide.diagonalUp - normalizedX) * maxY,
    };
  };
  const unique = new Map<
    string,
    { x: number; y: number; colorIndex: number }
  >();
  for (const write of writes) {
    const points = [{ x: write.x, y: write.y }];
    for (const axis of reflectAxes) {
      const reflected = points.map((point) => reflectPoint(point, axis));
      points.push(...reflected);
    }
    for (const point of points) {
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x >= asset.width || y >= asset.height) continue;
      unique.set(`${x}:${y}`, { x, y, colorIndex: write.colorIndex });
    }
  }
  return [...unique.values()].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
}

function normalizeToolBounds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  asset: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  return normalizeBounds(from, to, asset);
}

function rectanglePointList(
  bounds: { x: number; y: number; width: number; height: number },
): readonly { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      points.push({ x, y });
    }
  }
  return points;
}

function selectionSnapshotFromPoints(
  points: readonly { x: number; y: number }[],
  kind: SelectionSnapshot["mask"]["kind"],
): SelectionSnapshot | undefined {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || points.length === 0) return undefined;
  const unique = new Map(
    points.map((point) => [`${point.x}:${point.y}`, point]),
  );
  const selected = [...unique.values()];
  if (selected.length === 0) return undefined;
  const minX = Math.min(...selected.map((point) => point.x));
  const minY = Math.min(...selected.map((point) => point.y));
  const maxX = Math.max(...selected.map((point) => point.x));
  const maxY = Math.max(...selected.map((point) => point.y));
  return {
    selectionId: `selection-${state.projectId}-${Date.now()}`,
    mask: {
      kind,
      regions: [{
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      }],
      selectionVersion: (selection?.mask.selectionVersion ?? 0) + 1,
    },
    scope: {
      assetId: asset.id,
      layerId: state.activeLayerId,
      frameId: state.activeFrameId,
      celId: state.activeCelId,
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: selected.map((point) => ({
      x: point.x,
      y: point.y,
      colorIndex: asset.raster.getPixel(point.x, point.y),
    })),
  };
}

function activeRasterRevision(snapshot: ProjectState): number | undefined {
  return snapshot.assets[snapshot.activeAssetId]?.revision;
}

function selectionScopeMatchesActiveCel(
  snapshot: SelectionSnapshot | undefined = selection,
): boolean {
  if (snapshot === undefined) return true;
  return snapshot.scope.assetId === state.activeAssetId &&
    snapshot.scope.layerId === state.activeLayerId &&
    snapshot.scope.frameId === state.activeFrameId &&
    snapshot.scope.celId === state.activeCelId &&
    snapshot.sourceStructureEpoch === state.structureEpoch;
}

function activeRectangleSelectionClip(): RasterClipRect | undefined {
  const snapshot = selection;
  if (
    snapshot === undefined || !selectionScopeMatchesActiveCel(snapshot) ||
    snapshot.mask.kind !== "rectangle" ||
    snapshot.mask.regions.length !== 1
  ) {
    rectangleSelectionClipCache = undefined;
    return undefined;
  }
  const region = snapshot.mask.regions[0];
  const cacheKey = region === undefined ? "" : [
    snapshot.selectionId,
    snapshot.mask.selectionVersion,
    region.x,
    region.y,
    region.width,
    region.height,
    snapshot.pixels.length,
  ].join(":");
  if (
    cacheKey !== "" && rectangleSelectionClipCache?.key === cacheKey
  ) return rectangleSelectionClipCache.clip;
  if (
    region === undefined || !Number.isSafeInteger(region.x) ||
    !Number.isSafeInteger(region.y) || !Number.isSafeInteger(region.width) ||
    !Number.isSafeInteger(region.height) || region.x < 0 || region.y < 0 ||
    region.width < 1 || region.height < 1 ||
    snapshot.pixels.length !== region.width * region.height
  ) {
    rectangleSelectionClipCache = undefined;
    return undefined;
  }
  const seen = new Set<string>();
  for (const pixel of snapshot.pixels) {
    if (
      pixel.x < region.x || pixel.y < region.y ||
      pixel.x >= region.x + region.width ||
      pixel.y >= region.y + region.height
    ) {
      rectangleSelectionClipCache = undefined;
      return undefined;
    }
    seen.add(selectionPointKey(pixel));
  }
  if (seen.size !== snapshot.pixels.length) {
    rectangleSelectionClipCache = undefined;
    return undefined;
  }
  const clip = { ...region };
  rectangleSelectionClipCache = { key: cacheKey, clip };
  return clip;
}

function activeRasterSelectionMask(): RasterSelectionMask | undefined {
  const snapshot = selection;
  if (
    snapshot === undefined || !selectionScopeMatchesActiveCel(snapshot) ||
    activeRectangleSelectionClip() !== undefined
  ) {
    rasterSelectionMaskCache = undefined;
    return undefined;
  }
  const cacheKey = [
    snapshot.selectionId,
    snapshot.mask.selectionVersion,
    snapshot.scope.celId,
    snapshot.pixels.length,
  ].join(":");
  if (rasterSelectionMaskCache?.key === cacheKey) {
    return rasterSelectionMaskCache.mask;
  }
  try {
    const mask = createRasterSelectionMask(snapshot.pixels);
    if (mask === undefined) {
      rasterSelectionMaskCache = undefined;
      return undefined;
    }
    rasterSelectionMaskCache = { key: cacheKey, mask };
    return mask;
  } catch {
    rasterSelectionMaskCache = undefined;
    return undefined;
  }
}

function refreshSelectionSnapshotForCurrentRaster(): void {
  if (selection === undefined || !selectionScopeMatchesActiveCel()) return;
  const asset = state.assets[selection.scope.assetId];
  if (asset === undefined) return;
  selection = {
    ...selection,
    mask: {
      ...selection.mask,
      regions: selection.mask.regions.map((region) => ({ ...region })),
    },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: selection.pixels.map((pixel) => ({
      ...pixel,
      colorIndex: asset.raster.getPixel(pixel.x, pixel.y),
    })),
  };
}

function timelineCommandInvalidatesSelection(
  before: ProjectState,
  after: ProjectState,
): boolean {
  return before.activeAssetId !== after.activeAssetId ||
    before.activeLayerId !== after.activeLayerId ||
    before.activeFrameId !== after.activeFrameId ||
    before.activeCelId !== after.activeCelId ||
    before.structureEpoch !== after.structureEpoch ||
    activeRasterRevision(before) !== activeRasterRevision(after);
}

function hasUncommittedSelectionWork(): boolean {
  return selectionFrameDrag !== undefined || selectionDrag !== undefined ||
    selectionDraft !== undefined ||
    pendingSelectionGesture !== undefined || transformSession !== undefined ||
    transformPreview !== undefined || pasteMode;
}

function cancelUncommittedSelectionWork(message?: string): boolean {
  if (!hasUncommittedSelectionWork()) return false;
  selectionInteractionGeneration += 1;
  if (
    selectionDrag !== undefined &&
    canvas.hasPointerCapture(selectionDrag.pointerId)
  ) canvas.releasePointerCapture(selectionDrag.pointerId);
  if (
    selectionFrameDrag !== undefined &&
    canvas.hasPointerCapture(selectionFrameDrag.pointerId)
  ) canvas.releasePointerCapture(selectionFrameDrag.pointerId);
  selectionFrameDrag = undefined;
  if (
    pendingSelectionGesture !== undefined &&
    canvas.hasPointerCapture(pendingSelectionGesture.pointerId)
  ) canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
  selectionDrag = undefined;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(
    selection === undefined
      ? `scope=${state.activeCelId} · selection=none`
      : `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${selection.mask.kind} · preview=cancelled`,
  );
  drawOverlay();
  markCanonicalMetrics();
  if (message !== undefined) setStatus(message);
  return true;
}

function selectActiveCelContentForMove(): boolean {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    setStatus("Active raster is missing.", "error");
    return false;
  }
  const picked = selectByOpaque(asset.raster, asset.palette);
  const next = selectionSnapshotFromPoints(picked.pixels, "alpha");
  if (next === undefined) {
    setStatus(
      "The active timeline cell has no visible pixels to move.",
      "error",
    );
    return false;
  }
  selectionInteractionGeneration += 1;
  selection = next;
  selectionDraft = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  const region = next.mask.regions[0];
  if (region !== undefined) {
    selectionX.value = String(region.x);
    selectionY.value = String(region.y);
    selectionWidth.value = String(region.width);
    selectionHeight.value = String(region.height);
  }
  updateSelectionActionButtons();
  updateSelectionStatus(
    `scope=${next.scope.celId} · ${next.pixels.length}px · auto-selected active cel content`,
  );
  notifyAssetStateChanged();
  drawOverlay();
  return true;
}

function beginSelectionDraft(
  next: SelectionSnapshot | undefined,
  mode: SelectionEditMode,
  message: string,
): void {
  selectionDraft = { snapshot: next, mode, message };
  const pixelCount = next?.pixels.length ?? 0;
  updateSelectionStatus(
    `draft=${
      selectionModeLabel(mode)
    } · ${pixelCount}px · confirm or Esc to cancel`,
  );
  updateSelectionActionButtons();
  drawOverlay();
  setStatus(
    pixelCount === 0
      ? "Selection draft is empty; confirm to clear the selection."
      : `${message} · draft only; confirm to apply.`,
  );
}

function commitSelectionDraft(): void {
  if (selectionDraft === undefined) {
    setStatus("No selection draft to confirm.", "error");
    return;
  }
  const draft = selectionDraft;
  selectionInteractionGeneration += 1;
  selectionDraft = undefined;
  selection = draft.snapshot;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  const region = selection?.mask.regions[0];
  if (region !== undefined) {
    selectionX.value = String(region.x);
    selectionY.value = String(region.y);
    selectionWidth.value = String(region.width);
    selectionHeight.value = String(region.height);
  }
  if (selection === undefined) {
    updateSelectionStatus(
      `scope=${state.activeCelId} · selection=none · confirmed clear`,
    );
    setStatus("Selection cleared; Canonical Raster unchanged.");
  } else {
    updateSelectionStatus(
      `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${selection.mask.kind} · preview=none`,
    );
    setStatus(`${draft.message} · selection confirmed.`);
  }
  updateSelectionActionButtons();
  drawOverlay();
  notifyAssetStateChanged();
}

function cancelSelectionDraft(
  message = "Selection draft cancelled; Canonical Raster unchanged.",
): void {
  if (selectionDraft === undefined && pendingSelectionGesture === undefined) {
    return;
  }
  selectionInteractionGeneration += 1;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  updateSelectionActionButtons();
  updateSelectionStatus(
    selection === undefined
      ? `scope=${state.activeCelId} · selection=none`
      : `scope=${selection.scope.celId} · ${selection.pixels.length}px · preview=none`,
  );
  drawOverlay();
  setStatus(message);
}

function selectionSnapshotForPoints(
  points: readonly { x: number; y: number }[],
  kind: SelectionSnapshot["mask"]["kind"],
  mode: SelectionEditMode,
): SelectionSnapshot | undefined {
  const combined = combineSelectionPoints(
    selectionPointsFromSnapshot(selection),
    points,
    mode,
  );
  return selectionSnapshotFromPoints(combined, kind);
}

function beginSelectionFromPoints(
  points: readonly { x: number; y: number }[],
  kind: SelectionSnapshot["mask"]["kind"],
  mode: SelectionEditMode,
  message: string,
): void {
  beginSelectionDraft(
    selectionSnapshotForPoints(points, kind, mode),
    mode,
    message,
  );
}

type SelectionMorphology = "EXPAND" | "SHRINK" | "INVERT" | "BORDER";

function applySelectionMorphology(
  operation: SelectionMorphology,
  radius = currentSelectionMorphologyRadius(),
): void {
  if (selection === undefined) {
    setStatus(
      "Create a selection before applying selection morphology.",
      "error",
    );
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    setStatus("Active raster is missing.", "error");
    return;
  }
  const base = createSelectionMask(asset.width, asset.height, selection.pixels);
  const nextMask = operation === "EXPAND"
    ? selectionExpand(base, radius)
    : operation === "SHRINK"
    ? selectionShrink(base, radius)
    : operation === "INVERT"
    ? selectionInvert(base)
    : selectionBorder(base, radius);
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < nextMask.height; y += 1) {
    for (let x = 0; x < nextMask.width; x += 1) {
      if (nextMask.selected[y * nextMask.width + x] === 1) {
        points.push({ x, y });
      }
    }
  }
  const kind = selection.mask.kind;
  const next = selectionSnapshotFromPoints(points, kind);
  if (next === undefined) {
    selection = undefined;
    updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
  } else {
    selection = next;
    const region = next.mask.regions[0];
    if (region !== undefined) {
      selectionX.value = String(region.x);
      selectionY.value = String(region.y);
      selectionWidth.value = String(region.width);
      selectionHeight.value = String(region.height);
    }
    updateSelectionStatus(
      `scope=${next.scope.celId} · ${next.pixels.length}px · ${operation.toLowerCase()} · preview=none`,
    );
  }
  selectionInteractionGeneration += 1;
  transformSession = undefined;
  transformPreview = undefined;
  drawOverlay();
  notifyAssetStateChanged();
  setStatus(
    `Selection ${operation.toLowerCase()}${operation === "INVERT" ? "" : ` (${radius}px)`} applied locally; confirm a Transform to mutate pixels.`,
  );
}

function commitWriteSet(
  writes: readonly { x: number; y: number; colorIndex: number }[],
  sourceOperationType: string,
  toolForMirroring: BasicTool = currentBasicTool(),
  options: {
    readonly respectSelection?: boolean;
    readonly respectMirror?: boolean;
  } = {},
): Promise<boolean> {
  return enqueueCanonicalOperation(() =>
    commitWriteSetNow(writes, sourceOperationType, toolForMirroring, options)
  );
}

async function commitWriteSetNow(
  writes: readonly { x: number; y: number; colorIndex: number }[],
  sourceOperationType: string,
  toolForMirroring: BasicTool = currentBasicTool(),
  options: {
    readonly respectSelection?: boolean;
    readonly respectMirror?: boolean;
  } = {},
): Promise<boolean> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  if (timelineActivationPending) {
    setStatus("Timeline cell is changing; drawing was not committed.", "error");
    return false;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || writes.length === 0) return false;
  if (selection !== undefined && !selectionScopeMatchesActiveCel()) {
    clearCommittedSelection(
      "Selection cleared because it belongs to another timeline cel.",
    );
    return false;
  }
  const mirroredWrites = options.respectMirror === false
    ? writes
    : mirrorWritesForTool(writes, asset, toolForMirroring);
  const selectionKeys =
    options.respectSelection === false || selection === undefined
      ? undefined
      : new Set(selection.pixels.map(selectionPointKey));
  const committedWrites = selectionKeys === undefined
    ? mirroredWrites
    : mirroredWrites.filter((write) =>
      selectionKeys.has(selectionPointKey(write))
    );
  if (committedWrites.length === 0) return false;
  if (
    pixyncProductionRoot !== undefined &&
    (committedWrites.length > PIXYNC_DRAW2_MAX_PAYLOAD_KEYS ||
      new TextEncoder().encode(JSON.stringify({ writes: committedWrites }))
          .byteLength > PIXYNC_DRAW2_MAX_PAYLOAD_BYTES)
  ) {
    setStatus(
      "この操作はリアルタイム同期の上限を超えるため、変更を確定しません。範囲を小さくするか、ミラー／選択範囲を解除してください。",
      "error",
    );
    return false;
  }
  const drawClientId = activeDrawClientId();
  const commandSequence = nextClientSequence(drawClientId);
  const before = state;
  const command = {
    commandId: `draw2-local-write-set-${commandSequence}`,
    commandType: "raster.writeSet" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: activeDrawActorId(),
    clientId: drawClientId,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      writes: committedWrites,
    },
  };
  const writeTimelineGeneration = timelineStateGeneration;
  const writeCanonicalGeneration = canonicalStateGeneration;
  const result = await core.execute(command);
  if (
    writeTimelineGeneration !== timelineStateGeneration ||
    writeCanonicalGeneration !== canonicalStateGeneration
  ) {
    syncClientSequencesFromState();
    setStatus(
      "Timeline cell changed while drawing; the old-cell write was discarded.",
      "error",
    );
    return false;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return false;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    renderTimeline();
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  if (!result.result.noOp) {
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
  }
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setStatus(
    `${sourceOperationType} committed · ${committedWrites.length}px${
      mirrorEnabled && mirrorHasActiveAxis()
        ? ` · mirror=${mirrorAxisSummary()}`
      : ""
  } · one undo`,
  );
  return true;
}

function applyOutline(): Promise<void> {
  return enqueueCanonicalOperation(async () => {
    const asset = state.assets[state.activeAssetId];
    if (asset === undefined) return;
    const colorIndex = Number(outlineColorControl.value);
    const allowedPixels = selection === undefined
      ? undefined
      : new Set(selection.pixels.map(selectionPointKey));
    const writes = createOutlineWriteSet(
      {
        width: asset.width,
        height: asset.height,
        palette: asset.palette,
        getPixel: (x, y) => asset.raster.getPixel(x, y),
      },
      {
        colorIndex,
        placement: (outlinePlacementControl.value === "INSIDE"
          ? "INSIDE"
          : "OUTSIDE") as OutlinePlacement,
        thickness: Number(outlineThicknessControl.value),
        connectivity: (outlineConnectivityControl.value === "4" ? 4 : 8) as OutlineConnectivity,
        ...(allowedPixels === undefined ? {} : { allowedPixels }),
      },
    );
    if (writes.length === 0) {
      setStatus("Outlineに適用できる輪郭がありません。", "error");
      return;
    }
    await commitWriteSetNow(
      writes,
      "tool.outline",
      currentBasicTool(),
      { respectMirror: false },
    );
  });
}

function textBoundsFromPoints(
  asset: RasterAsset,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): RasterClipRect {
  const bounds = normalizeBounds(from, to, asset);
  if (bounds.width > 1 || bounds.height > 1) return bounds;
  const width = Math.min(128, asset.width);
  const height = Math.min(64, asset.height);
  return {
    x: Math.max(0, Math.min(asset.width - width, from.x)),
    y: Math.max(0, Math.min(asset.height - height, from.y)),
    width,
    height,
  };
}

function createTextAlphaMask(
  width: number,
  height: number,
  value: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string,
  align: CanvasTextAlign,
  stroke: boolean,
  strokeWidth: number,
): { readonly width: number; readonly height: number; readonly alpha: Uint8ClampedArray } {
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, width);
  surface.height = Math.max(1, height);
  const context = surface.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    return { width: surface.width, height: surface.height, alpha: new Uint8ClampedArray(surface.width * surface.height) };
  }
  context.clearRect(0, 0, surface.width, surface.height);
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#ffffff";
  context.lineJoin = "miter";
  context.lineCap = "square";
  const safeStrokeWidth = stroke ? Math.max(1, Math.min(16, Math.round(strokeWidth))) : 0;
  context.lineWidth = Math.max(1, safeStrokeWidth * 2);
  const safeFamily = fontFamily.replace(/["';]/g, "").trim() || "monospace";
  const safeSize = Math.max(1, Math.min(256, Math.round(fontSize)));
  context.font = `${fontWeight} ${safeSize}px ${safeFamily}`;
  context.textAlign = align;
  context.textBaseline = "top";
  const lines = value.split(/\r?\n/).slice(0, 64);
  const lineHeight = Math.max(1, Math.round(safeSize * 1.2));
  const x = align === "center" ? surface.width / 2 : align === "right" ? surface.width - 2 : 2;
  const y = Math.max(0, Math.min(surface.height - lineHeight, safeStrokeWidth + 1));
  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight;
    if (lineY >= surface.height) return;
    if (stroke) context.strokeText(line, x, lineY);
    else context.fillText(line, x, lineY);
  });
  const rgba = context.getImageData(0, 0, surface.width, surface.height).data;
  const alpha = new Uint8ClampedArray(surface.width * surface.height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3] ?? 0;
  return { width: surface.width, height: surface.height, alpha };
}

function measureTextNaturalSize(
  value: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string,
  stroke: boolean,
  strokeWidth: number,
): { readonly width: number; readonly height: number } {
  const surface = document.createElement("canvas");
  const context = surface.getContext("2d");
  if (context === null) return { width: 1, height: 1 };
  const safeStrokeWidth = stroke
    ? Math.max(1, Math.min(16, Math.round(strokeWidth)))
    : 0;
  const safeFamily = fontFamily.replace(/["';]/g, "").trim() || "monospace";
  const safeSize = Math.max(1, Math.min(256, Math.round(fontSize)));
  context.font = `${fontWeight} ${safeSize}px ${safeFamily}`;
  const lines = value.split(/\r?\n/).slice(0, 64);
  const lineHeight = Math.max(1, Math.round(safeSize * 1.2));
  const measuredWidth = Math.max(
    1,
    ...lines.map((line) => context.measureText(line).width),
  );
  return {
    width: Math.max(1, Math.ceil(measuredWidth + 4 + safeStrokeWidth * 2)),
    height: Math.max(
      1,
      lines.length * lineHeight + 4 + safeStrokeWidth * 2,
    ),
  };
}

function createTextPreviewDraft(
  bounds: RasterClipRect,
): TextPreviewDraft {
  const value = textValueControl.value;
  const fontSize = Number(textSizeControl.value);
  const strokeWidth = Number(textStrokeWidthControl.value);
  const strokeEnabled = textStrokeEnabledControl.checked;
  const fillMask = createTextAlphaMask(
    bounds.width,
    bounds.height,
    value,
    textFontControl.value,
    fontSize,
    textWeightControl.value,
    textAlignControl.value as CanvasTextAlign,
    false,
    strokeWidth,
  );
  const strokeMask = strokeEnabled
    ? createTextAlphaMask(
      bounds.width,
      bounds.height,
      value,
      textFontControl.value,
      fontSize,
      textWeightControl.value,
      textAlignControl.value as CanvasTextAlign,
      true,
      strokeWidth,
    )
    : undefined;
  const writes = createTextMaskWriteSet(fillMask, strokeMask, {
    fillColorIndex: Number(textFillColorControl.value),
    ...(strokeEnabled
      ? { strokeColorIndex: Number(textStrokeColorControl.value) }
      : {}),
    threshold: Number(textThresholdControl.value),
  });
  const natural = measureTextNaturalSize(
    value,
    textFontControl.value,
    fontSize,
    textWeightControl.value,
    strokeEnabled,
    strokeWidth,
  );
  return { writes, naturalWidth: natural.width, naturalHeight: natural.height };
}

function renderTextDialogPreview(
  asset: RasterAsset,
  bounds: RasterClipRect,
  draft: TextPreviewDraft,
): void {
  const context = textPreviewProjectionContext;
  const width = textPreviewCanvasControl.width;
  const height = textPreviewCanvasControl.height;
  context.clearRect(0, 0, width, height);
  if (bounds.width < 1 || bounds.height < 1) return;
  const padding = 12;
  const scale = Math.min(
    (width - padding * 2) / bounds.width,
    (height - padding * 2) / bounds.height,
  );
  const displayScale = Math.max(0.01, Math.min(12, scale));
  const displayWidth = bounds.width * displayScale;
  const displayHeight = bounds.height * displayScale;
  const offsetX = (width - displayWidth) / 2;
  const offsetY = (height - displayHeight) / 2;
  context.save();
  context.imageSmoothingEnabled = false;
  for (const write of draft.writes) {
    const color = decodeArgb(paletteColorForRender(asset, write.colorIndex));
    if (color.alpha <= 0) continue;
    context.fillStyle =
      `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha / 255})`;
    context.fillRect(
      offsetX + write.x * displayScale,
      offsetY + write.y * displayScale,
      Math.max(0.5, displayScale),
      Math.max(0.5, displayScale),
    );
  }
  context.strokeStyle = "rgba(138, 227, 210, 0.86)";
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.strokeRect(offsetX + 0.5, offsetY + 0.5, displayWidth - 1, displayHeight - 1);
  context.restore();
}

function clampTextBoundsDimension(
  value: string,
  maximum: number,
  fallback: number,
): number {
  return Math.max(
    1,
    Math.min(maximum, Math.round(Number(value) || fallback)),
  );
}

function updateTextBoundsControls(bounds: RasterClipRect): void {
  textBoundsWidthControl.value = String(bounds.width);
  textBoundsHeightControl.value = String(bounds.height);
}

function refreshTextPreview(): void {
  const bounds = pendingTextBounds;
  const target = pendingTextTarget;
  const asset = state.assets[state.activeAssetId];
  if (
    bounds === undefined || target === undefined || asset === undefined ||
    target.assetId !== asset.id || target.celId !== state.activeCelId ||
    target.structureEpoch !== state.structureEpoch
  ) return;
  const draft = createTextPreviewDraft(bounds);
  pendingTextDraft = draft;
  textBoundsStatusControl.textContent =
    `Range ${bounds.width}×${bounds.height} · origin ${bounds.x},${bounds.y} · recommended ${draft.naturalWidth}×${draft.naturalHeight} · ${draft.writes.length}px`;
  textInsertControl.disabled = draft.writes.length === 0;
  renderTextDialogPreview(asset, bounds, draft);
  drawOverlay();
}

function updateTextBoundsFromControls(): void {
  const asset = state.assets[state.activeAssetId];
  const current = pendingTextBounds;
  if (asset === undefined || current === undefined) return;
  const width = clampTextBoundsDimension(
    textBoundsWidthControl.value,
    asset.width,
    current.width,
  );
  const height = clampTextBoundsDimension(
    textBoundsHeightControl.value,
    asset.height,
    current.height,
  );
  pendingTextBounds = {
    x: Math.max(0, Math.min(asset.width - width, current.x)),
    y: Math.max(0, Math.min(asset.height - height, current.y)),
    width,
    height,
  };
  updateTextBoundsControls(pendingTextBounds);
  refreshTextPreview();
}

function fitTextBoundsToContent(): void {
  const asset = state.assets[state.activeAssetId];
  const current = pendingTextBounds;
  const draft = pendingTextDraft;
  if (asset === undefined || current === undefined || draft === undefined) return;
  const width = Math.min(asset.width, draft.naturalWidth);
  const height = Math.min(asset.height, draft.naturalHeight);
  pendingTextBounds = {
    x: Math.max(0, Math.min(asset.width - width, current.x)),
    y: Math.max(0, Math.min(asset.height - height, current.y)),
    width,
    height,
  };
  updateTextBoundsControls(pendingTextBounds);
  refreshTextPreview();
  setStatus("Text range fitted to the current font and content.");
}

function openTextInsertDialog(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  pendingTextBounds = textBoundsFromPoints(asset, from, to);
  pendingTextTarget = {
    assetId: asset.id,
    celId: state.activeCelId,
    structureEpoch: state.structureEpoch,
  };
  textValueControl.value = textValueControl.value.trim().length > 0
    ? textValueControl.value
    : "Text";
  const selected = asset.palette.length > 1 ? Math.max(1, selectedColor) : 0;
  textFillColorControl.value = String(selected);
  textStrokeColorControl.value = String(selected);
  textBoundsWidthControl.max = String(asset.width);
  textBoundsHeightControl.max = String(asset.height);
  updateTextBoundsControls(pendingTextBounds);
  textInsertDialogControl.showModal();
  refreshTextPreview();
  textValueControl.focus();
  textValueControl.select();
}

function activateTextSelectionForMove(
  writes: readonly TextPreviewWrite[],
): void {
  const next = selectionSnapshotFromPoints(
    writes.map((write) => ({ x: write.x, y: write.y })),
    "alpha",
  );
  if (next === undefined) {
    setStatus("Text inserted, but no visible pixels could be selected.", "error");
    return;
  }
  selectionInteractionGeneration += 1;
  selection = next;
  selectionDraft = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  const region = next.mask.regions[0];
  if (region !== undefined) {
    selectionX.value = String(region.x);
    selectionY.value = String(region.y);
    selectionWidth.value = String(region.width);
    selectionHeight.value = String(region.height);
  }
  selectShortcutTool("move");
  updateSelectionActionButtons();
  updateSelectionStatus(
    `scope=${next.scope.celId} · ${next.pixels.length}px · text inserted · drag to move`,
  );
  notifyAssetStateChanged();
  drawOverlay();
  setStatus("Text inserted and selected. Drag it to move; the move is previewed until release.");
}

function commitTextInsert(): Promise<void> {
  return enqueueCanonicalOperation(async () => {
    const bounds = pendingTextBounds;
    const target = pendingTextTarget;
    const asset = state.assets[state.activeAssetId];
    const value = textValueControl.value;
    if (
      bounds === undefined || target === undefined || asset === undefined ||
      target.assetId !== asset.id || target.celId !== state.activeCelId ||
      target.structureEpoch !== state.structureEpoch
    ) {
      pendingTextBounds = undefined;
      pendingTextDraft = undefined;
      pendingTextTarget = undefined;
      textInsertDialogControl.close();
      drawOverlay();
      setStatus("対象のCanvasが変わったため、テキスト挿入をキャンセルしました。", "error");
      return;
    }
    if (value.trim().length === 0) {
      setStatus("テキストを入力してください。", "error");
      return;
    }
    const draft = createTextPreviewDraft(bounds);
    pendingTextDraft = draft;
    const writes = draft.writes.map((write) => ({
      x: bounds.x + write.x,
      y: bounds.y + write.y,
      colorIndex: write.colorIndex,
    }));
    if (writes.length === 0) {
      setStatus("テキストを描画できる範囲がありません。", "error");
      return;
    }
    const selectionKeys = selection === undefined
      ? undefined
      : new Set(selection.pixels.map(selectionPointKey));
    const insertedWrites = selectionKeys === undefined
      ? writes
      : writes.filter((write) => selectionKeys.has(selectionPointKey(write)));
    const committed = await commitWriteSetNow(writes, "tool.text", currentBasicTool(), {
      respectMirror: false,
    });
    if (!committed) return;
    textInsertDialogControl.close();
    pendingTextBounds = undefined;
    pendingTextDraft = undefined;
    pendingTextTarget = undefined;
    activateTextSelectionForMove(insertedWrites);
  });
}

interface CanvasProjectSettings {
  readonly forceCreate?: boolean;
  readonly mode?: "OPEN" | "NEW";
  readonly initialCreatorMode?: CreatorStartMode;
  readonly projectIdOverride?: string;
  readonly projectNameOverride?: string;
  readonly anchor?: CanvasResizeAnchor;
  readonly width?: number;
  readonly height?: number;
  readonly tileSize?: TileSize;
}

function resizeRasterForCanvas(
  asset: RasterAsset,
  plan: CanvasResizePlan,
): IndexedTileRaster {
  const resized = IndexedTileRaster.empty(
    plan.newWidth,
    plan.newHeight,
    asset.raster.tileSize,
  );
  if (plan.copyWidth < 1 || plan.copyHeight < 1) return resized;
  const source = asset.raster.readRegion(
    plan.sourceX,
    plan.sourceY,
    plan.copyWidth,
    plan.copyHeight,
  ).pixels;
  for (let y = 0; y < plan.copyHeight; y += 1) {
    for (let x = 0; x < plan.copyWidth; x += 1) {
      const colorIndex = source[y * plan.copyWidth + x] ?? 0;
      if (colorIndex === 0) continue;
      resized.setPixel(
        asset.id,
        plan.destinationX + x,
        plan.destinationY + y,
        colorIndex,
      );
    }
  }
  return resized;
}

function resizeProjectState(
  previous: ProjectState,
  settings:
    & Required<Pick<CanvasProjectSettings, "width" | "height" | "tileSize">>
    & { anchor: CanvasResizeAnchor },
): ProjectState {
  const assets: Record<string, RasterAsset> = {};
  for (const [id, asset] of Object.entries(previous.assets)) {
    const plan = calculateCanvasResizePlan({
      oldWidth: asset.width,
      oldHeight: asset.height,
      newWidth: settings.width,
      newHeight: settings.height,
      anchor: settings.anchor,
    });
    assets[id] = {
      ...asset,
      width: settings.width,
      height: settings.height,
      raster: resizeRasterForCanvas(asset, plan),
      revision: asset.revision + 1,
    };
  }
  return {
    ...previous,
    name: `Draw2 ${previous.projectId}`,
    structureEpoch: previous.structureEpoch + 1,
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
}

function currentCanvasResizePlan(): CanvasResizePlan | undefined {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return undefined;
  try {
    return calculateCanvasResizePlan({
      oldWidth: asset.width,
      oldHeight: asset.height,
      newWidth: Math.max(
        1,
        Math.min(4096, Math.round(Number(canvasSettingsWidth.value) || 1)),
      ),
      newHeight: Math.max(
        1,
        Math.min(4096, Math.round(Number(canvasSettingsHeight.value) || 1)),
      ),
      anchor: canvasResizeAnchor,
    });
  } catch {
    return undefined;
  }
}

function syncCanvasResizePreview(): void {
  const plan = currentCanvasResizePlan();
  if (plan === undefined) return;
  canvasResizeSummary.value = describeCanvasResizePlan(plan);
  for (const button of canvasResizeAnchorElements) {
    const active = button.dataset.canvasResizeAnchor === canvasResizeAnchor;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const scale = Math.min(
    220 / Math.max(1, plan.newWidth),
    140 / Math.max(1, plan.newHeight),
  );
  canvasResizePreviewFrame.style.width = `${
    Math.max(18, Math.round(plan.newWidth * scale))
  }px`;
  canvasResizePreviewFrame.style.height = `${
    Math.max(18, Math.round(plan.newHeight * scale))
  }px`;
  canvasResizePreviewContent.style.width = `${
    Math.max(1, Math.round(plan.oldWidth * scale))
  }px`;
  canvasResizePreviewContent.style.height = `${
    Math.max(1, Math.round(plan.oldHeight * scale))
  }px`;
  canvasResizePreviewContent.style.left = `${
    Math.round(plan.offsetX * scale)
  }px`;
  canvasResizePreviewContent.style.top = `${
    Math.round(plan.offsetY * scale)
  }px`;
}

async function resetProject(
  options: CanvasProjectSettings = {},
): Promise<void> {
  if (playbackRunning) stopTimelinePlayback("");
  // Commit the outgoing project's debounced editor preferences before the
  // readiness guard is lowered. Otherwise a project switch can discard the
  // last palette selection, mirror position, or viewport change from the
  // project being left.
  flushDraw2EditorPreferences();
  const isNewProject = options.mode === "NEW";
  const forceCreate = options.forceCreate === true || isNewProject;
  const requestedProjectId =
    ((isNewProject
      ? options.projectIdOverride
      : options.forceCreate
      ? state.projectId
      : options.projectIdOverride ?? projectIdInput.value) ?? "").trim() ||
    DEFAULT_WORKSPACE_PROJECT_ID;
  const projectId = normalizeWorkspaceProjectId(requestedProjectId);
  // Prevent the geometry/layout passes that occur while switching projects
  // from persisting the previous project's viewport and mirror values into
  // the new project record.
  draw2EditorPreferencesReady = false;
  if (state.projectId !== projectId || forceCreate) {
    await flushDrawPersistence();
  }
  const persistedRecord = await drawPersistenceStore.load(projectId);
  let restored:
    | Awaited<ReturnType<typeof restoreDraw2PersistenceRecord>>
    | undefined;
  if (persistedRecord !== null && !forceCreate) {
    try {
      restored = await restoreDraw2PersistenceRecord(
        persistedRecord,
        projectId,
      );
      document.body.dataset.drawPersistenceState = "restored";
    } catch {
      document.body.dataset.drawPersistenceState = "recovery-fallback";
    }
  }
  drawPersistenceRevision = persistedRecord?.revision ?? 0;
  drawPersistenceExpectedRevision = drawPersistenceRevision;
  drawPersistenceExpectedStateHash = persistedRecord?.stateHash ?? null;
  const parsedTileSize = Number(options.tileSize ?? tileSizeSelect.value);
  const tileSize: TileSize = parsedTileSize === 64 ? 64 : 32;
  const createOptions = {
    projectId,
    name: options.projectNameOverride?.trim() || `Draw2 ${projectId}`,
    width: options.width ?? 256,
    height: options.height ?? 256,
    tileSize,
  };
  const anchor = options.anchor ?? canvasResizeAnchor;
  const preserveCurrentArt = options.forceCreate === true && !isNewProject &&
    projectId === state.projectId &&
    options.width !== undefined && options.height !== undefined;
  state = preserveCurrentArt
    ? resizeProjectState(state, {
      width: createOptions.width,
      height: createOptions.height,
      tileSize,
      anchor,
    })
    : forceCreate
    ? repository.create(createOptions)
    : restored?.state ?? repository.open(projectId) ??
      repository.create(createOptions);
  assetDefinitions = forceCreate
    ? []
    : (restored?.assetDefinitions ?? []).map(cloneAssetDefinitionEntry);
  assetPackages = forceCreate
    ? []
    : (restored?.assetPackages ?? []).map(cloneAssetPackageManifest);
  assetDefinitionSequence = 0;
  repository.save(state);
  projectIdInput.value = projectId;
  tileSizeSelect.value = String(tileSize);
  adoptCanonicalState(state);
  history = new LocalUndoRedoHistory(state);
  syncClientSequencesFromState();
  selectionInteractionGeneration += 1;
  selection = undefined;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  clipboard = undefined;
  selectedTileSource = undefined;
  tilesetSourceRenderKey = "";
  lastTilemapGridLayoutKey = "";
  timelineSession = createTimelineSession(state);
  timelineViewportInitialized = false;
  structureClientSequence = 0;
  onionSkinEnabled = false;
  onionSkinPreviousFrames = 1;
  onionSkinNextFrames = 1;
  onionSkinOpacity = 0.5;
  onionSkinColorMode = "TINTED";
  onionSkinCache = undefined;
  restoreDraw2TimelineMetadata(restored?.timelineMetadata);
  linkedCelBindings = [];
  journal.operations.length = 0;
  journal.dirtyTileWrites.length = 0;
  journal.checkpoints.length = 0;
  if (restored !== undefined) {
    history.restore(restored.history);
    journal.operations.push(...(persistedRecord?.journal.operations ?? []));
    for (const write of persistedRecord?.journal.dirtyTileWrites ?? []) {
      journal.dirtyTileWrites.push({
        assetId: write.assetId,
        tiles: write.tiles.map((tile) => ({
          tileKey: tile.tileKey,
          bytes: Uint8Array.from(tile.bytes),
        })),
      });
    }
    journal.checkpoints.push(state);
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Draw2 active asset is missing.");
  syncRasterCanvasDimensions(asset.width, asset.height);
  // resetProject starts from the static HTML/default project and then swaps in
  // the IndexedDB snapshot. Restore the editor-facing state after the canvas
  // geometry is known, then rebuild every projection that depends on it. In
  // particular, the canonical palette may be restored correctly while the
  // visible swatches would otherwise remain the initial demo palette.
  restoreDraw2EditorPreferencesForProject(projectId, asset);
  renderPaletteButtons(asset.palette);
  await present();
  syncExportPanel();
  syncColorEditorFromSelection();
  updatePlaybackLoopControl();
  renderTimeline();
  const restoredHistory = history.snapshot();
  updateSelectionStatus(
    `scope=${state.activeCelId} · selection=none · undo=${restoredHistory.undo.length} · redo=${restoredHistory.redo.length}`,
  );
  notifyAssetStateChanged();
  updateHistoryButtons();
  writeActiveWorkspaceProjectId(projectId);
  await workspaceManifestStore.updateModule(
    projectId,
    "draw",
    restored !== undefined && persistedRecord !== null
      ? {
        status: "READY",
        revision: persistedRecord.revision,
        stateHash: persistedRecord.stateHash,
        savedAt: persistedRecord.savedAt,
      }
      : { status: "EMPTY", revision: 0, stateHash: null, savedAt: null },
    state.name,
  );
  announceWorkspaceProjectChanged(window, {
    projectId,
    name: state.name,
    kind: isNewProject ? "NEW" : "OPEN",
  });
  rememberRecentProject(asWorkspaceProjectId(projectId), state.name);
  if (
    restored === undefined || forceCreate ||
    persistedRecord === null
  ) {
    queueDrawPersistenceSave(
      isNewProject || options.forceCreate === true ? "new-project" : "recovery",
    );
  }
  setStatus(
    isNewProject
      ? `Project ${projectId} created · blank Draw/Audio/Game state is being prepared.`
      : restored !== undefined
      ? `Project ${projectId} restored · Draw autosave ready.`
      : `Project ${projectId} is open · Draw autosave ready.`,
  );
}

function openCanvasSettingsDialog(): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  canvasResizeAnchor = "CENTER";
  canvasSettingsProjectId.value = state.projectId;
  canvasSettingsWidth.value = String(asset.width);
  canvasSettingsHeight.value = String(asset.height);
  canvasSettingsTileSize.value = String(asset.raster.tileSize);
  syncCanvasResizePreview();
  canvasSettingsDialog.showModal();
  canvasSettingsWidth.focus();
  canvasSettingsWidth.select();
}

function projectIdCandidate(): WorkspaceProjectId {
  const randomPart = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return asWorkspaceProjectId(
    `draw2-project-${Date.now().toString(36)}-${randomPart}`,
  );
}

async function createFreshWorkspaceProjectId(): Promise<WorkspaceProjectId> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = projectIdCandidate();
    const [drawRecord, manifest] = await Promise.all([
      drawPersistenceStore.load(candidate),
      workspaceManifestStore.load(candidate),
    ]);
    if (drawRecord === null && manifest === null) return candidate;
  }
  throw new Error("A new Project ID could not be reserved. Please try again.");
}

function openProjectDialog(): void {
  if (projectDialog.open) return;
  projectDialogId.value = state.projectId;
  projectDialogStatus.textContent =
    "Open restores the selected Project. New creates a separate blank Project with a fresh ID.";
  projectDialog.showModal();
  projectDialogId.focus();
  projectDialogId.select();
}

function readProjectDialogProjectId(): WorkspaceProjectId {
  const requested = projectDialogId.value.trim() || state.projectId;
  try {
    return asWorkspaceProjectId(requested);
  } catch {
    throw new Error(
      "Project ID must start with a letter or number and use only stable identifier characters.",
    );
  }
}

function readCanvasProjectSettings():
  & Required<Pick<CanvasProjectSettings, "width" | "height" | "tileSize">>
  & { projectId: string; anchor: CanvasResizeAnchor } {
  const clampDimension = (value: string): number =>
    Math.max(1, Math.min(4096, Math.round(Number(value) || 1)));
  const projectId = canvasSettingsProjectId.value.trim() || "draw2-local-demo";
  const tileSize: TileSize = canvasSettingsTileSize.value === "64" ? 64 : 32;
  return {
    projectId,
    width: clampDimension(canvasSettingsWidth.value),
    height: clampDimension(canvasSettingsHeight.value),
    tileSize,
    anchor: canvasResizeAnchor,
  };
}

function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface Draw2ExportArtifact {
  readonly format: ExportFormat;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly packageHash?: string;
  readonly igameProduct?: Draw2IGameProductMetadata;
}

interface Draw2ExportProgressUpdate {
  readonly percent: number;
  readonly title: string;
  readonly detail: string;
  readonly current: string;
  readonly completed: number;
  readonly total: number;
  readonly state?: "active" | "complete" | "error";
}

type Draw2ExportProgressReporter = (
  update: Draw2ExportProgressUpdate,
) => Promise<void>;

let exportProgressHideTimer: number | undefined;

function yieldToExportRenderer(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function setExportProgress(update: Draw2ExportProgressUpdate): void {
  const percent = Math.max(0, Math.min(100, Math.round(update.percent)));
  exportProgress.hidden = false;
  exportProgress.dataset.state = update.state ??
    (percent >= 100 ? "complete" : "active");
  exportProgressPercent.textContent = `${percent}%`;
  exportProgressTitle.textContent = update.title;
  exportProgressDetail.textContent = update.detail;
  exportProgressCurrent.textContent = update.current;
  exportProgressCount.textContent = `${update.completed}/${update.total}`;
  exportProgressBar.style.width = `${percent}%`;
  exportProgressTrack.setAttribute("aria-valuenow", String(percent));
  exportExecute.setAttribute("aria-busy", "true");
}

function hideExportProgress(): void {
  exportProgress.hidden = true;
  exportProgress.dataset.state = "idle";
  exportProgressBar.style.width = "0%";
  exportProgressTrack.setAttribute("aria-valuenow", "0");
  exportExecute.removeAttribute("aria-busy");
}

async function reportExportProgress(
  update: Draw2ExportProgressUpdate,
): Promise<void> {
  setExportProgress(update);
  await yieldToExportRenderer();
}

function exportCategoryLabel(category: string): string {
  switch (category) {
    case "image":
      return "Image";
    case "animation":
      return "Animation";
    case "audio":
      return "Audio";
    case "tiles":
      return "Tiles";
    case "project":
      return "Project";
    case "game":
      return "Game integration";
    default:
      return category;
  }
}

function exportCategoryIcon(category: string): string {
  switch (category) {
    case "image":
      return "icon-image";
    case "animation":
      return "icon-sequence";
    case "audio":
      return "icon-wave";
    case "tiles":
      return "icon-sheet";
    case "project":
      return "icon-file";
    case "game":
      return "icon-export";
    default:
      return "icon-export";
  }
}

function exportFormatIcon(format: ExportFormat): string {
  switch (format) {
    case "png":
    case "jpeg":
    case "webp":
    case "avif":
    case "bmp":
    case "tiff":
    case "svg":
      return "icon-image";
    case "pxd":
      return "icon-file";
    case "gif":
    case "apng":
    case "webm":
    case "wav":
    case "audio-webm":
    case "audio-ogg":
    case "sprite-sheet":
      return "icon-sequence";
    case "atlas-json":
    case "tileset":
      return "icon-sheet";
    case "glb":
      return "icon-export";
    default:
      return "icon-export";
  }
}

function createExportIcon(
  symbol: string,
  className = "draw2-ui-icon",
): SVGSVGElement {
  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "use",
  );
  use.setAttribute("href", `./assets/icons/draw2-icons.svg#${symbol}`);
  svg.append(use);
  return svg;
}

function safeExportBaseName(): string {
  const fallback = state.name.trim() || state.projectId;
  return (exportName.value.trim() || fallback)
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "pixieed-project";
}

function exportArtifactFilename(
  baseName: string,
  format: ExportFormat,
): string {
  switch (format) {
    case "sprite-sheet":
      return `${baseName}-spritesheet.png`;
    case "atlas-json":
      return `${baseName}.atlas.json`;
    case "tileset":
      return `${baseName}-tileset.png`;
    case "audio-webm":
      return `${baseName}-audio.webm`;
    default:
      return `${baseName}.${exportFormatDefinition(format).extension}`;
  }
}

function syncExportScaleOptions(): void {
  const asset = state.assets[state.activeAssetId];
  const previous = Math.round(Number(exportScale.value));
  const options = asset === undefined
    ? [1]
    : pngExportScaleOptions(asset.width, asset.height);
  const selected = Number.isFinite(previous) && options.includes(previous)
    ? previous
    : options[options.length - 1] ?? 1;
  exportScale.replaceChildren();
  for (const scale of options) {
    const option = document.createElement("option");
    option.value = String(scale);
    option.textContent = `${scale}×`;
    if (asset !== undefined) {
      option.title = `${asset.width * scale}×${asset.height * scale}px`;
    }
    exportScale.append(option);
  }
  exportScale.value = String(selected);
  const maxScale = options[options.length - 1] ?? 1;
  exportScale.setAttribute("aria-label", `Scale · maximum ${maxScale}×`);
  exportScale.title = asset === undefined
    ? "Scale"
    : `Nearest-neighbour · maximum ${maxScale}× · ${asset.width * maxScale}×${
      asset.height * maxScale
    }px`;
  const hint = exportScale.closest("label")?.querySelector("small");
  if (hint !== null && hint !== undefined) {
    hint.textContent = `最大 ${maxScale}×`;
  }
}

function readExportScale(): number {
  const value = Math.round(Number(exportScale.value));
  const asset = state.assets[state.activeAssetId];
  const maxScale = asset === undefined
    ? 1
    : pngExportScaleOptions(asset.width, asset.height).at(-1) ?? 1;
  return Number.isFinite(value) ? Math.max(1, Math.min(maxScale, value)) : 1;
}

function selectedExportDefinitions() {
  return visibleExportFormats().filter((definition) =>
    selectedExportFormats.has(definition.id)
  );
}

function browserWebmMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) return undefined;
  if (
    typeof AudioContext === "undefined" ||
    typeof AudioContext.prototype.createMediaStreamDestination !== "function"
  ) return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

type BrowserAudioExportFormat = "audio-webm" | "audio-ogg";

function browserAudioMimeType(
  format: BrowserAudioExportFormat,
): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof AudioContext === "undefined" ||
    typeof AudioContext.prototype.createMediaStreamDestination !== "function"
  ) return undefined;
  const candidates = format === "audio-webm"
    ? ["audio/webm;codecs=opus", "audio/webm"]
    : ["audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function browserExportFormatSupported(format: ExportFormat): boolean {
  if (format === "webm") return browserWebmMimeType() !== undefined;
  if (format === "audio-webm" || format === "audio-ogg") {
    return browserAudioMimeType(format) !== undefined;
  }
  if (format !== "jpeg" && format !== "webp" && format !== "avif") return true;
  try {
    const dataUrl = exportPreviewCanvas.toDataURL(
      exportFormatDefinition(format).mimeType,
    );
    return dataUrl.startsWith(
      `data:${exportFormatDefinition(format).mimeType}`,
    );
  } catch {
    return false;
  }
}

function renderExportFormatCards(): void {
  exportFormatCards.replaceChildren();
  const categories = [
    "image",
    "animation",
    "audio",
    "tiles",
    "project",
    "game",
  ];
  for (const category of categories) {
    const definitions = visibleExportFormats().filter((definition) =>
      definition.category === category
    );
    if (definitions.length === 0) continue;
    const categoryElement = document.createElement("details");
    categoryElement.className = "draw2-export-format-category";
    categoryElement.dataset.exportCategory = category;
    categoryElement.open = definitions.some((definition) =>
      selectedExportFormats.has(definition.id)
    );
    const categoryHeading = document.createElement("summary");
    categoryHeading.className = "draw2-export-category-heading";
    categoryHeading.append(
      createExportIcon(
        exportCategoryIcon(category),
        "draw2-ui-icon draw2-export-category-icon",
      ),
    );
    const categoryCopy = document.createElement("span");
    categoryCopy.className = "draw2-export-category-copy";
    const heading = document.createElement("h5");
    heading.textContent = exportCategoryLabel(category);
    const categoryHint = document.createElement("small");
    categoryHint.textContent = category === "image"
      ? "静止画として保存"
      : category === "project"
      ? "編集可能なプロジェクト"
      : category === "animation"
      ? "タイムラインから画像を生成"
      : category === "tiles"
      ? "タイル素材として保存"
      : category === "audio"
      ? "現在のミックス状態を音源として保存"
      : "連携用の出力形式";
    categoryCopy.append(heading, categoryHint);
    categoryHeading.append(categoryCopy);
    const categoryCount = document.createElement("span");
    categoryCount.className = "draw2-export-category-count";
    categoryCount.textContent = `${definitions.length} format${
      definitions.length === 1 ? "" : "s"
    }`;
    categoryHeading.append(categoryCount);
    categoryElement.append(categoryHeading);
    const cards = document.createElement("div");
    cards.className = "draw2-export-format-grid";
    for (const definition of definitions) {
      const runtimeSupported = definition.supported &&
        browserExportFormatSupported(definition.id);
      if (!runtimeSupported) selectedExportFormats.delete(definition.id);
      const card = document.createElement("div");
      card.className = "draw2-export-format-card";
      card.dataset.exportFormat = definition.id;
      card.setAttribute("role", "checkbox");
      card.tabIndex = 0;
      card.title = runtimeSupported
        ? definition.description
        : `${definition.description} · このブラウザでは利用できません`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = definition.id;
      input.checked = selectedExportFormats.has(definition.id);
      input.disabled = !runtimeSupported;
      input.setAttribute(
        "aria-label",
        `${definition.label}: ${definition.description}`,
      );
      input.addEventListener("click", (event) => {
        // The checkbox lives inside a <label>. Some browser automation and
        // WebKit builds bubble the input click back through the label and
        // toggle it a second time; keep direct checkbox activation single.
        event.stopPropagation();
      });
      input.addEventListener("change", () => {
        if (input.checked) selectedExportFormats.add(definition.id);
        else selectedExportFormats.delete(definition.id);
        card.setAttribute("aria-checked", String(input.checked));
        // Keep the export summary in sync after the input event has settled;
        // the card itself remains in place so the checked state is preserved.
        window.setTimeout(() => syncExportPanel(), 0);
      });
      const icon = document.createElement("span");
      icon.className = "draw2-export-format-icon";
      icon.dataset.format = definition.id;
      icon.append(
        createExportIcon(
          exportFormatIcon(definition.id),
          "draw2-ui-icon draw2-export-format-icon__svg",
        ),
      );
      const copy = document.createElement("span");
      copy.className = "draw2-export-format-copy";
      const label = document.createElement("strong");
      label.textContent = definition.label;
      const description = document.createElement("small");
      description.textContent = definition.description;
      copy.append(label, description);
      const check = document.createElement("span");
      check.className = "draw2-export-format-check";
      check.append(createExportIcon("icon-check"));
      card.append(input, icon, copy, check);
      card.setAttribute("aria-checked", String(input.checked));
      const toggleCard = (): void => {
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      card.addEventListener("click", (event) => {
        if (event.target === input) return;
        toggleCard();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        toggleCard();
      });
      cards.append(card);
    }
    categoryElement.append(cards);
    exportFormatCards.append(categoryElement);
  }
}

function renderExportFormatOptions(): void {
  exportFormatOptions.replaceChildren();
  const definitions = selectedExportDefinitions();
  if (definitions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-export-empty";
    empty.textContent = "Select at least one format.";
    exportFormatOptions.append(empty);
    return;
  }
  for (const definition of definitions) {
    const option = document.createElement("div");
    option.className = "draw2-export-format-option";
    option.dataset.exportFormat = definition.id;
    const icon = document.createElement("span");
    icon.className = "draw2-export-option-icon";
    icon.append(
      createExportIcon(
        exportFormatIcon(definition.id),
        "draw2-ui-icon",
      ),
    );
    const copy = document.createElement("span");
    copy.className = "draw2-export-option-copy";
    const heading = document.createElement("strong");
    heading.textContent = definition.label;
    const detail = document.createElement("span");
    detail.textContent = definition.id === "png"
      ? "Pixel-perfect nearest-neighbour scale is applied."
      : definition.id === "jpeg"
      ? "Transparency is composited onto a white background."
      : definition.id === "webp"
      ? "Browser-native compression keeps the output lightweight."
      : definition.id === "avif"
      ? "Uses the browser's AVIF encoder when available."
      : definition.id === "gif"
      ? "Timeline frames become a looping indexed animation."
      : definition.id === "apng"
      ? "Timeline frames keep full RGBA transparency."
      : definition.id === "webm"
      ? "Visible Draw frames and the selected Audio tracks are recorded together as WebM."
      : definition.id === "wav"
      ? "Selected BGM, SE, instrument lanes, mixer, effects, and automation are rendered to PCM WAV."
      : definition.id === "audio-webm"
      ? "Selected BGM, SE, and instrument lanes are encoded as audio-only WebM/Opus."
      : definition.id === "audio-ogg"
      ? "Selected Audio tracks are encoded as audio-only Ogg/Opus when supported."
      : definition.id === "svg"
      ? "Pixel shapes are emitted as crisp vector rectangles."
      : definition.id === "sprite-sheet"
      ? "Timeline frames are packed into a PNG atlas."
      : definition.id === "atlas-json"
      ? "Exports coordinates and frame timing for the PNG atlas."
      : definition.id === "tileset"
      ? "Exports the active indexed raster as a reusable tile source."
      : definition.id === "bmp"
      ? "Exports a broad-compatibility 32-bit bitmap."
      : definition.id === "tiff"
      ? "Exports an uncompressed RGBA TIFF for preservation."
      : "Draw / Audio / Game project modules are included when available.";
    copy.append(heading, detail);
    const badge = document.createElement("span");
    badge.className = "draw2-export-option-badge";
    badge.textContent = definition.extension.toUpperCase();
    option.append(icon, copy, badge);
    exportFormatOptions.append(option);
  }
}

function renderExportOutputPlan(): void {
  exportOutputFiles.replaceChildren();
  const definitions = selectedExportDefinitions();
  const baseName = safeExportBaseName();
  if (definitions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "draw2-export-empty";
    empty.textContent = "No output selected.";
    exportOutputFiles.append(empty);
    return;
  }
  if (exportPackageMode === "zip" && definitions.length > 1) {
    const item = document.createElement("li");
    item.dataset.package = "zip";
    const names = definitions.map((definition) =>
      exportArtifactFilename(baseName, definition.id)
    );
    const primary = document.createElement("div");
    primary.className = "draw2-export-output-primary";
    primary.append(createExportIcon("icon-folder"));
    const name = document.createElement("strong");
    name.textContent = `${baseName}.zip`;
    primary.append(name);
    const badge = document.createElement("span");
    badge.className = "draw2-export-output-badge";
    badge.textContent = "ZIP";
    primary.append(badge);
    const detail = document.createElement("small");
    detail.textContent = `${names.length} files · ${names.join(", ")}`;
    item.append(primary, detail);
    exportOutputFiles.append(item);
    return;
  }
  for (const definition of definitions) {
    const item = document.createElement("li");
    item.dataset.format = definition.id;
    const primary = document.createElement("div");
    primary.className = "draw2-export-output-primary";
    primary.append(createExportIcon(exportFormatIcon(definition.id)));
    const name = document.createElement("strong");
    name.textContent = exportArtifactFilename(baseName, definition.id);
    primary.append(name);
    const badge = document.createElement("span");
    badge.className = "draw2-export-output-badge";
    badge.textContent = definition.extension.toUpperCase();
    primary.append(badge);
    const detail = document.createElement("small");
    detail.textContent = definition.supportsScale
      ? `${definition.label} · ${readExportScale()}× local output`
      : `${definition.label} · local project package`;
    item.append(primary, detail);
    exportOutputFiles.append(item);
  }
}

function renderExportPreview(): void {
  const canvas = exportPreviewCanvas;
  const context = canvas.getContext("2d");
  if (context === null) return;
  const previewSize = 160;
  canvas.width = previewSize;
  canvas.height = previewSize;
  context.clearRect(0, 0, previewSize, previewSize);
  const checkerSize = 10;
  for (let y = 0; y < previewSize; y += checkerSize) {
    for (let x = 0; x < previewSize; x += checkerSize) {
      context.fillStyle = ((x / checkerSize + y / checkerSize) % 2 === 0)
        ? "#202a36"
        : "#2a3542";
      context.fillRect(x, y, checkerSize, checkerSize);
    }
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    exportPreviewSummary.textContent = "No active asset";
    return;
  }
  const scale = Math.min(
    144 / Math.max(1, asset.width),
    144 / Math.max(1, asset.height),
  );
  const offsetX = (previewSize - asset.width * scale) / 2;
  const offsetY = (previewSize - asset.height * scale) / 2;
  const previewImage = hasLayerComposite()
    ? compositeRegion({
      x: 0,
      y: 0,
      width: asset.width,
      height: asset.height,
    })
    : (() => {
      const image = context.createImageData(asset.width, asset.height);
      const indexed = asset.raster.toUint8Array();
      for (let index = 0; index < indexed.length; index += 1) {
        const color = decodeArgb(
          paletteColorForRender(asset, indexed[index] ?? 0),
        );
        image.data[index * 4] = color.red;
        image.data[index * 4 + 1] = color.green;
        image.data[index * 4 + 2] = color.blue;
        image.data[index * 4 + 3] = color.alpha;
      }
      return image;
    })();
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < asset.height; y += 1) {
    for (let x = 0; x < asset.width; x += 1) {
      const offset = (y * asset.width + x) * 4;
      const red = previewImage.data[offset] ?? 0;
      const green = previewImage.data[offset + 1] ?? 0;
      const blue = previewImage.data[offset + 2] ?? 0;
      const alpha = previewImage.data[offset + 3] ?? 0;
      if (alpha === 0) continue;
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
      context.fillRect(
        Math.floor(offsetX + x * scale),
        Math.floor(offsetY + y * scale),
        Math.max(1, Math.ceil(scale)),
        Math.max(1, Math.ceil(scale)),
      );
    }
  }
  const scaleApplies = selectedExportDefinitions().some((definition) =>
    definition.supportsScale
  );
  const exportScaleValue = scaleApplies ? readExportScale() : 1;
  exportPreviewSummary.textContent = scaleApplies
    ? `${asset.width * exportScaleValue}×${
      asset.height * exportScaleValue
    } · ${exportScaleValue}×`
    : `${asset.width}×${asset.height} · project data`;
}

function readExportState(): ExportState {
  return {
    name: exportName.value.trim(),
    selectedFormats: selectedExportDefinitions().map((definition) =>
      definition.id
    ),
    scale: readExportScale(),
    packageMode: exportPackageMode,
    options: {},
  };
}

function syncExportPanel(): void {
  syncExportScaleOptions();
  const definitions = selectedExportDefinitions();
  exportScale.disabled = !definitions.some((definition) =>
    definition.supportsScale
  );
  exportSelectionSummary.textContent = `${definitions.length} selected`;
  const multiple = definitions.length > 1;
  exportPackageSection.hidden = !multiple;
  if (!multiple) {
    exportPackageMode = "single";
    exportPackageSingle.checked = true;
    exportPackageZip.checked = false;
  } else {
    // Multiple selections are always delivered as one complete ZIP so a
    // browser cannot suppress later downloads or leave the selection split.
    exportPackageMode = "zip";
    exportPackageSingle.checked = false;
    exportPackageZip.checked = true;
  }
  renderExportFormatOptions();
  renderExportOutputPlan();
  renderExportPreview();
}

function setExportPanelStatus(
  message: string,
  kind: "ready" | "error" = "ready",
): void {
  exportPanelStatus.textContent = translateDraw2Text(message, draw2Locale);
  exportPanelStatus.dataset.state = kind;
}

type BrowserRasterFormat = "jpeg" | "webp" | "avif";

async function createBrowserRasterArtifact(
  exportModule: ExportModule,
  format: BrowserRasterFormat,
  baseName: string,
  scale: number,
): Promise<Draw2ExportArtifact> {
  const definition = exportFormatDefinition(format);
  const raster = exportModule.exportRasterRgba(
    state,
    state.activeAssetId,
    { scale },
  );
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(`${definition.label} encoder could not acquire Canvas2D.`);
  }
  const rgba = format === "jpeg"
    ? exportModule.flattenRgba(raster.rgba)
    : raster.rgba;
  context.imageSmoothingEnabled = false;
  context.putImageData(
    new ImageData(new Uint8ClampedArray(rgba), raster.width, raster.height),
    0,
    0,
  );
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      resolve,
      definition.mimeType,
      format === "jpeg" ? 0.92 : 0.9,
    );
  });
  if (blob === null || blob.type.toLowerCase() !== definition.mimeType) {
    throw new Error(
      `${definition.label} is not supported by this browser's image encoder. Try PNG or WebP.`,
    );
  }
  return {
    format,
    filename: exportArtifactFilename(baseName, format),
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: definition.mimeType,
  };
}

function draw2IGameProductMetadata(
  snapshot: WorkspacePxdBridgeSnapshot,
): Draw2IGameProductMetadata | undefined {
  const gameRecord = snapshot.game?.record;
  if (gameRecord === null || typeof gameRecord !== "object" ||
    Array.isArray(gameRecord)) return undefined;
  const canonicalProject = (gameRecord as Record<string, unknown>)
    .canonicalProject;
  if (canonicalProject === null || typeof canonicalProject !== "object" ||
    Array.isArray(canonicalProject)) return undefined;
  const project = canonicalProject as Record<string, unknown>;
  const timeline = project.editorTimeline;
  if (
    project.schemaVersion !== 1 || typeof project.projectId !== "string" ||
    project.projectId.trim().length === 0 || !Array.isArray(project.scenes) ||
    project.scenes.length === 0 || !Array.isArray(project.prefabs) ||
    !Array.isArray(project.dependencies) || !Array.isArray(project.behaviors) ||
    timeline === null || typeof timeline !== "object" ||
    Array.isArray(timeline) ||
    !Array.isArray((timeline as Record<string, unknown>).tracks)
  ) return undefined;
  const runtimeProfile = project.runtimeProfile;
  const runtimeProfileId = runtimeProfile !== null &&
      typeof runtimeProfile === "object" && !Array.isArray(runtimeProfile) &&
      typeof (runtimeProfile as Record<string, unknown>).profileId === "string" &&
      (runtimeProfile as Record<string, unknown>).profileId
        ?.toString().trim().length
    ? String((runtimeProfile as Record<string, unknown>).profileId).trim()
    : "top-down-rpg";
  return {
    schema: "pixieed-igame-product/v1",
    project_id: snapshot.projectId,
    runtime_profile_id: runtimeProfileId,
    runtime_version: "game-350-browser-v1",
    visibility: "PUBLIC",
  };
}

async function createPxdProjectArtifact(
  exportModule: ExportModule,
  baseName: string,
): Promise<Draw2ExportArtifact> {
  const workspace = getWorkspacePxdBridge();
  const snapshot = await workspace.exportProjectPxdSnapshot();
  const gameProduct = draw2IGameProductMetadata(snapshot);
  const output = await exportModule.exportPxdProject(state, {
    assetDefinitions,
    assetPackages,
    drawTimelineMetadata: draw2TimelineMetadataSnapshot(),
    ...(snapshot.audio === null ? {} : {
      audio: {
        schemaVersion: snapshot.audio.schemaVersion,
        record: snapshot.audio.record,
        assets: snapshot.audio.assets,
      },
    }),
    ...(snapshot.game === null ? {} : {
      game: {
        schemaVersion: snapshot.game.schemaVersion,
        record: snapshot.game.record,
      },
    }),
  });
  return {
    format: "pxd",
    filename: `${baseName}.pxd`,
    bytes: output.bytes,
    mimeType: output.mimeType,
    packageHash: output.packageHash,
    ...(gameProduct === undefined ? {} : { igameProduct: gameProduct }),
  };
}

async function exportCurrentPxdArtifactForWorkspace(): Promise<
  WorkspacePxdArtifactSnapshot
> {
  const exportModule = await loadExportModule();
  const artifact = await createPxdProjectArtifact(
    exportModule,
    safeExportBaseName(),
  );
  const sourceReference = await resolveCurrentDrawReference({ mode: "PINNED" });
  if (artifact.packageHash === undefined || sourceReference === undefined) {
    throw new Error("PXD release source identity is unavailable.");
  }
  return {
    bytes: artifact.bytes,
    mimeType: artifact.mimeType,
    packageHash: artifact.packageHash,
    sourceReference,
  };
}

async function storePxdMarketTransfer(
  file: File,
  options?: {
    readonly metadata?: Record<string, unknown>;
    readonly deliveryManifest?: Draw2MarketDeliveryManifest;
  },
): Promise<string> {
  if (!window.indexedDB || typeof File !== "function") {
    throw new Error(
      "このブラウザではMarketへのPXD引き継ぎを利用できません。PXDを保存してからMarketで追加してください。",
    );
  }
  const transferId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = Date.now();
  const storedMetadata = options?.metadata === undefined
    ? undefined
    : options.deliveryManifest === undefined
    ? options.metadata
    : { ...options.metadata, deliveryManifest: options.deliveryManifest };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("pixieed-market-project-transfers", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("transfers")) {
        request.result.createObjectStore("transfers", { keyPath: "id" });
      }
    };
    request.onerror = () => {
      reject(
        request.error ?? new Error("Market transfer storage unavailable."),
      );
    };
    request.onsuccess = () => {
      const database = request.result;
      let settled = false;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        database.close();
        if (error === undefined) resolve();
        else reject(error);
      };
      try {
        const transaction = database.transaction("transfers", "readwrite");
        transaction.objectStore("transfers").put({
          id: transferId,
          file,
          ...(storedMetadata === undefined ? {} : { metadata: storedMetadata }),
          ...(options?.deliveryManifest === undefined
            ? {}
            : { deliveryManifest: options.deliveryManifest }),
          createdAt,
          expiresAt: createdAt + (15 * 60 * 1000),
        });
        transaction.oncomplete = () => finish();
        transaction.onerror = () =>
          finish(
            transaction.error ??
              new Error("Market transfer storage write failed."),
          );
        transaction.onabort = () =>
          finish(
            transaction.error ??
              new Error("Market transfer storage write aborted."),
          );
      } catch (error) {
        finish(error);
      }
    };
  });
  return transferId;
}

function safeMarketManifestDisplayName(value: string, fallback: string): string {
  return (value || fallback)
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, 160) || fallback;
}

function createDrawMarketDeliveryManifest(
  file: File,
  artifact: Draw2ExportArtifact,
  sourceReference: Draw2AssetReferenceRecord,
): Draw2MarketDeliveryManifest {
  const projectName = safeMarketManifestDisplayName(
    state.name.trim(),
    `Draw2 ${state.projectId}`,
  );
  const label = safeMarketManifestDisplayName(
    sourceReference.label,
    projectName,
  );
  const projectRevisionId = drawPersistenceSavePending === undefined &&
      drawPersistenceSaveTimer === undefined &&
      Number.isSafeInteger(drawPersistenceRevision) &&
      drawPersistenceRevision >= 0
    ? `draw-project-revision-${drawPersistenceRevision}`
    : undefined;
  const source = {
    projectId: state.projectId,
    assetId: sourceReference.assetId,
    revisionId: sourceReference.revisionId,
    contentHash: sourceReference.contentHash,
    ...(artifact.packageHash === undefined
      ? {}
      : { packageHash: artifact.packageHash }),
    fileName: file.name,
    mimeType: file.type || artifact.mimeType,
    byteLength: file.size,
  };
  return {
    schemaVersion: 1,
    manifestId: `draw2-delivery-manifest:${state.projectId}:${sourceReference.contentHash}:${artifact.packageHash ?? "no-package-hash"}`,
    selectionKind: "WHOLE_PROJECT",
    project: {
      projectId: state.projectId,
      ...(projectRevisionId === undefined ? {} : { revisionId: projectRevisionId }),
      name: projectName,
    },
    entries: [{
      entryId: "draw-project",
      sourceKind: "DRAW",
      source,
      selection: { kind: "PROJECT", label },
      provenance: {
        originKind: "LOCAL_PROJECT",
        rightsStatus: "CREATOR_DECLARATION_REQUIRED",
      },
      capabilities: {
        editable: true,
        animation: true,
        targets: ["iDRAW", "iAUDIO", "iGAME", "UNITY"],
      },
      dependencyIds: [],
    }],
    summary: {
      entryCount: 1,
      sourceKinds: ["DRAW"],
      labels: [label],
    },
    createdAt: new Date().toISOString(),
  };
}

function createAssetMarketDeliveryManifest(
  file: File,
  artifact: { readonly packageHash: string },
  sourceReference: Draw2AssetReferenceRecord,
  entry: PxdAssetDefinitionEntry,
): Draw2MarketDeliveryManifest {
  const projectName = safeMarketManifestDisplayName(
    state.name.trim(),
    `Draw2 ${state.projectId}`,
  );
  const label = safeMarketManifestDisplayName(
    entry.definition.metadata.name,
    entry.definitionId,
  );
  const frameCount = new Set(
    entry.definition.animationMapping.flatMap((clip) => clip.frameIds),
  ).size;
  return {
    schemaVersion: 1,
    manifestId: `draw2-asset-delivery-manifest:${state.projectId}:${entry.definitionId}:${sourceReference.contentHash}:${artifact.packageHash}`,
    selectionKind: "SELECTED_SET",
    project: {
      projectId: state.projectId,
      name: projectName,
    },
    entries: [{
      entryId: `draw-asset:${entry.definitionId}`,
      sourceKind: "DRAW",
      source: {
        projectId: state.projectId,
        assetId: sourceReference.assetId,
        revisionId: sourceReference.revisionId,
        contentHash: sourceReference.contentHash,
        packageHash: artifact.packageHash,
        fileName: file.name,
        mimeType: file.type || "application/vnd.pixieed.pxd",
        byteLength: file.size,
      },
      selection: {
        kind: frameCount > 1 ? "ANIMATION" : "FRAME_RANGE",
        label: `${label} · ${frameCount || 1}フレーム`,
        locator: entry.definitionId,
      },
      provenance: {
        originKind: "LOCAL_PROJECT",
        rightsStatus: "CREATOR_DECLARATION_REQUIRED",
      },
      capabilities: {
        editable: true,
        animation: true,
        targets: ["iDRAW", "iAUDIO", "iGAME", "UNITY"],
      },
      dependencyIds: [],
    }],
    summary: {
      entryCount: 1,
      sourceKinds: ["DRAW"],
      labels: [label],
    },
    createdAt: new Date().toISOString(),
  };
}

async function handoffAssetDefinitionToMarket(
  definitionId: string,
): Promise<Draw2AssetMarketHandoffResult> {
  const entry = assetDefinitions.find((candidate) =>
    candidate.definitionId === definitionId
  );
  if (entry === undefined) {
    return { ok: false, message: "Marketへ渡すAssetを選択してください。" };
  }
  const assetPackage = assetPackages.find((candidate) =>
    candidate.entries.some((packageEntry) =>
      packageEntry.kind === "DRAW" && packageEntry.source.sourceId === definitionId
    )
  );
  if (assetPackage === undefined) {
    return {
      ok: false,
      message: "先にこのAssetを「販売用に確定」してからMarketへ渡してください。",
    };
  }
  try {
    const sourceReference = await resolveDrawDefinitionReference({
      definitionId,
      mode: "PINNED",
    });
    if (sourceReference === undefined) {
      return { ok: false, message: "Assetの固定revisionを取得できませんでした。" };
    }
    const output = await exportAssetDefinitionPxd({
      entry,
      assetPackage,
    });
    const file = new File(
      [output.bytes.slice().buffer as ArrayBuffer],
      output.filename,
      { type: output.mimeType },
    );
    const deliveryManifest = createAssetMarketDeliveryManifest(
      file,
      output,
      sourceReference,
      entry,
    );
    const transferId = await storePxdMarketTransfer(file, {
      metadata: {
        projectId: state.projectId,
        kind: "draw-asset",
        definitionId,
      },
      deliveryManifest,
    });
    const url = new URL("../market/sell.html", window.location.href);
    url.searchParams.set("project_transfer", transferId);
    window.location.assign(url.href);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error
        ? cause.message
        : "AssetのMarket引き継ぎに失敗しました。",
    };
  }
}

async function handoffPxdProjectToMarket(): Promise<void> {
  if (colorDraftDirty) {
    await commitColorEdit();
    if (colorDraftDirty) {
      setExportPanelStatus(
        "色の変更を確定してからMarketへ渡してください。",
        "error",
      );
      return;
    }
  }
  exportToMarket.disabled = true;
  setExportPanelStatus("Draw・Audio・Gameを含むPXDを準備しています…");
  try {
    const exportModule = await loadExportModule();
    const artifact = await createPxdProjectArtifact(
      exportModule,
      safeExportBaseName(),
    );
    const file = new File(
      [artifact.bytes.slice().buffer as ArrayBuffer],
      artifact.filename,
      { type: artifact.mimeType },
    );
    const sourceReference = await resolveCurrentDrawReference({ mode: "PINNED" });
    if (sourceReference === undefined) {
      throw new Error("PXDのMarket配信manifestに必要なDraw参照を取得できませんでした。");
    }
    const deliveryManifest = createDrawMarketDeliveryManifest(
      file,
      artifact,
      sourceReference,
    );
    const transferId = await storePxdMarketTransfer(file, {
      metadata: {
        projectId: state.projectId,
        kind: "draw",
        ...(artifact.igameProduct === undefined
          ? {}
          : { igameProduct: artifact.igameProduct }),
      },
      deliveryManifest,
    });
    const url = new URL("../market/sell.html", window.location.href);
    url.searchParams.set("project_transfer", transferId);
    window.location.assign(url.href);
  } catch (cause) {
    const message = cause instanceof Error
      ? cause.message
      : "MarketへのPXD引き継ぎに失敗しました。";
    setExportPanelStatus(message, "error");
    setStatus(message, "error");
    exportToMarket.disabled = false;
  }
}

function waitForExportMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Math.round(milliseconds)));
  });
}

async function withDrawAudioExportDemand<T>(
  operation: () => Promise<T>,
): Promise<T> {
  window.dispatchEvent(
    new CustomEvent("draw2:audio-export-demand", {
      detail: { active: true, projectId: state.projectId },
    }),
  );
  try {
    return await operation();
  } finally {
    window.dispatchEvent(
      new CustomEvent("draw2:audio-export-demand", {
        detail: { active: false, projectId: state.projectId },
      }),
    );
  }
}

async function createAudioMediaArtifact(
  format: BrowserAudioExportFormat,
  baseName: string,
  report: Draw2ExportProgressReporter,
  start: number,
  span: number,
  index: number,
  total: number,
): Promise<Draw2ExportArtifact> {
  const mimeType = browserAudioMimeType(format);
  if (mimeType === undefined) {
    throw new Error(
      format === "audio-ogg"
        ? "Ogg/Opus export is unavailable in this browser. Try WAV or WebM Audio."
        : "WebM Audio export is unavailable in this browser. Try WAV.",
    );
  }
  const workspace = getWorkspacePxdBridge();
  if (typeof workspace.renderAudioWavForExport !== "function") {
    throw new Error("Audio render adapter is unavailable for audio export.");
  }
  const audioSnapshot = await withDrawAudioExportDemand(() =>
    workspace.renderAudioWavForExport!()
  );
  if (audioSnapshot === null) {
    throw new Error("Audio Project has no audible content to export.");
  }
  const audioContext = new AudioContext();
  let source: AudioBufferSourceNode | undefined;
  let recorder: MediaRecorder | undefined;
  let sourceStarted = false;
  try {
    if (audioContext.state !== "running") await audioContext.resume();
    const audioBuffer = await audioContext.decodeAudioData(
      audioSnapshot.bytes.slice().buffer as ArrayBuffer,
    );
    const destination = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);
    const recorderInstance = new MediaRecorder(destination.stream, {
      mimeType,
    });
    recorder = recorderInstance;
    const chunks: Blob[] = [];
    const encoded = new Promise<Blob>((resolve, reject) => {
      recorderInstance.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorderInstance.addEventListener("error", () => {
        reject(new Error("MediaRecorder failed during audio export."));
      }, { once: true });
      recorderInstance.addEventListener("stop", () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1) {
          reject(new Error("MediaRecorder produced an empty audio file."));
        } else {
          resolve(blob);
        }
      }, { once: true });
    });
    const sourceEnded = new Promise<void>((resolve) => {
      source!.addEventListener("ended", () => resolve(), { once: true });
    });
    recorderInstance.start(100);
    source.start();
    sourceStarted = true;
    await report({
      percent: start + span * 0.18,
      title: "音声を書き出し中",
      detail: "選択したAudioトラックをエンコードしています",
      current: format === "audio-ogg" ? "OGG / OPUS" : "WEBM / OPUS",
      completed: index,
      total,
    });
    await Promise.race([
      sourceEnded,
      waitForExportMilliseconds(audioSnapshot.durationSeconds * 1_000 + 250),
    ]);
    await waitForExportMilliseconds(100);
    if (recorderInstance.state === "recording") recorderInstance.stop();
    const blob = await encoded;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const signature = format === "audio-webm"
      ? bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 &&
        bytes[2] === 0xdf && bytes[3] === 0xa3
      : bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 &&
        bytes[2] === 0x67 && bytes[3] === 0x53;
    if (!signature) {
      throw new Error(
        format === "audio-webm"
          ? "MediaRecorder output is not a valid WebM audio container."
          : "MediaRecorder output is not a valid Ogg audio container.",
      );
    }
    await report({
      percent: start + span * 0.96,
      title: "音声を書き出し中",
      detail: "音声コンテナを検証しています",
      current: `${bytes.byteLength} bytes`,
      completed: index,
      total,
    });
    return {
      format,
      filename: exportArtifactFilename(baseName, format),
      bytes,
      mimeType: blob.type || mimeType,
    };
  } finally {
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopping after an encoder error.
      }
    }
    if (sourceStarted) {
      try {
        source?.stop();
      } catch {
        // The source may already have ended.
      }
    }
    await audioContext.close().catch(() => undefined);
    await present().catch(() => undefined);
  }
}

async function createWebmVideoArtifact(
  baseName: string,
  report: Draw2ExportProgressReporter,
  start: number,
  span: number,
  index: number,
  total: number,
): Promise<Draw2ExportArtifact> {
  const mimeType = browserWebmMimeType();
  const asset = state.assets[state.activeAssetId];
  if (mimeType === undefined || asset === undefined) {
    throw new Error(
      "WebM export is unavailable in this browser. Use GIF or APNG instead.",
    );
  }
  const frameIds = state.timeline.frameOrder.length > 0
    ? [...state.timeline.frameOrder]
    : [state.activeFrameId];
  const playbackFps = playbackFpsValue();
  const speedRatio = playbackFps / 24;
  const frameDurationsMs = frameIds.map((frameId) => {
    const frame = state.frames.find((item) => item.frameId === frameId);
    return Math.max(
      1,
      (frame?.durationMs ?? 1_000 / playbackFps) / speedRatio,
    );
  });
  const authoredDurationMs = frameDurationsMs.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const durationSeconds = Math.max(0.1, authoredDurationMs / 1_000);
  const workspace = getWorkspacePxdBridge();
  if (typeof workspace.renderAudioWavForExport !== "function") {
    throw new Error("Audio render adapter is unavailable for WebM export.");
  }
  const audioSnapshot = await withDrawAudioExportDemand(() =>
    workspace.renderAudioWavForExport!(durationSeconds)
  );
  const audioContext = new AudioContext();
  let source: AudioBufferSourceNode | undefined;
  let sourceStarted = false;
  let videoStream: MediaStream | undefined;
  let combinedStream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  try {
    if (audioContext.state !== "running") await audioContext.resume();
    let audioBuffer: AudioBuffer;
    if (audioSnapshot === null) {
      audioBuffer = audioContext.createBuffer(
        2,
        Math.max(1, Math.ceil(durationSeconds * audioContext.sampleRate)),
        audioContext.sampleRate,
      );
    } else {
      audioBuffer = await audioContext.decodeAudioData(
        audioSnapshot.bytes.slice().buffer as ArrayBuffer,
      );
    }
    const audioDestination = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioDestination);

    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = asset.width;
    videoCanvas.height = asset.height;
    const videoContext = videoCanvas.getContext("2d");
    if (videoContext === null) {
      throw new Error("WebM video canvas could not acquire Canvas2D.");
    }
    videoContext.imageSmoothingEnabled = false;
    const captureCanvas = videoCanvas as HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    if (typeof captureCanvas.captureStream !== "function") {
      throw new Error("Canvas capture is unavailable for WebM export.");
    }
    videoStream = captureCanvas.captureStream(0);
    let videoTrack = videoStream.getVideoTracks()[0];
    let requestFrame = (
      videoTrack as MediaStreamTrack & { requestFrame?: () => void } | undefined
    )?.requestFrame;
    if (typeof requestFrame !== "function") {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = captureCanvas.captureStream(
        Math.max(1, Math.min(60, Math.round(playbackFps))),
      );
      videoTrack = videoStream.getVideoTracks()[0];
      requestFrame = (
        videoTrack as
          | MediaStreamTrack & { requestFrame?: () => void }
          | undefined
      )?.requestFrame;
    }
    if (videoTrack === undefined) {
      throw new Error("WebM video track could not be created.");
    }
    combinedStream = new MediaStream();
    for (const track of videoStream.getVideoTracks()) {
      combinedStream.addTrack(track);
    }
    for (const track of audioDestination.stream.getAudioTracks()) {
      combinedStream.addTrack(track);
    }
    const recorderInstance = new MediaRecorder(combinedStream, { mimeType });
    recorder = recorderInstance;
    const chunks: Blob[] = [];
    const encoded = new Promise<Blob>((resolve, reject) => {
      recorderInstance.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorderInstance.addEventListener("error", () => {
        reject(new Error("MediaRecorder failed during WebM export."));
      }, { once: true });
      recorderInstance.addEventListener("stop", () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1) {
          reject(new Error("MediaRecorder produced an empty WebM file."));
        } else {
          resolve(blob);
        }
      }, { once: true });
    });
    recorderInstance.start(100);
    source.start();
    sourceStarted = true;
    for (let index = 0; index < frameIds.length; index += 1) {
      const frameId = frameIds[index]!;
      const image = compositeRegion({
        x: 0,
        y: 0,
        width: asset.width,
        height: asset.height,
      }, frameId);
      videoContext.putImageData(image, 0, 0);
      requestFrame?.call(videoTrack);
      if (index === 0 || index % 8 === 0 || index === frameIds.length - 1) {
        await report({
          percent: start +
            span * (0.08 + 0.82 * ((index + 1) / frameIds.length)),
          title: "動画＋音声を記録中",
          detail: "DrawフレームとAudioをWebMへ同期しています",
          current: "F" + (index + 1) + "/" + frameIds.length,
          completed: index,
          total,
        });
      }
      await waitForExportMilliseconds(frameDurationsMs[index] ?? 1);
    }
    const remainingTailMs = Math.max(
      0,
      durationSeconds * 1_000 - authoredDurationMs,
    );
    if (remainingTailMs > 0) {
      requestFrame?.call(videoTrack);
      await waitForExportMilliseconds(remainingTailMs);
    }
    recorderInstance.stop();
    const blob = await encoded;
    if (sourceStarted) source.stop();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (
      bytes.length < 4 ||
      bytes[0] !== 0x1a ||
      bytes[1] !== 0x45 ||
      bytes[2] !== 0xdf ||
      bytes[3] !== 0xa3
    ) {
      throw new Error("MediaRecorder output is not a valid WebM container.");
    }
    return {
      format: "webm",
      filename: exportArtifactFilename(baseName, "webm"),
      bytes,
      mimeType: blob.type || mimeType,
    };
  } finally {
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // The recorder may already be stopping after an encoder error.
      }
    }
    if (sourceStarted) {
      try {
        source?.stop();
      } catch {
        // The source may already have ended.
      }
    }
    combinedStream?.getTracks().forEach((track) => track.stop());
    if (videoStream !== undefined && videoStream !== combinedStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }
    await audioContext.close().catch(() => undefined);
    await present().catch(() => undefined);
  }
}

async function createExportArtifacts(
  exportModule: ExportModule,
  exportState: ExportState,
  report: Draw2ExportProgressReporter,
): Promise<Draw2ExportArtifact[]> {
  const baseName = safeExportBaseName();
  const artifacts: Draw2ExportArtifact[] = [];
  const total = exportState.selectedFormats.length;
  for (const [index, format] of exportState.selectedFormats.entries()) {
    const definition = exportFormatDefinition(format);
    if (!definition.supported) {
      throw new Error(`${definition.label} is not available yet.`);
    }
    const start = 10 + (index / total) * 78;
    const span = 78 / total;
    await report({
      percent: start,
      title: "書き出し中",
      detail: `${definition.label}を準備しています`,
      current: definition.extension.toUpperCase(),
      completed: index,
      total,
    });
    if (format === "png") {
      const asset = state.assets[state.activeAssetId];
      const outputWidth = (asset?.width ?? 0) * exportState.scale;
      const outputHeight = (asset?.height ?? 0) * exportState.scale;
      const output = await exportModule.exportPng(
        state,
        state.activeAssetId,
        {
          scale: exportState.scale,
          onProgress: async (progress) => {
            await report({
              percent: start + progress * span * 0.92,
              title: "画像を生成中",
              detail: progress < 0.68
                ? `${exportState.scale}×へ拡大しています`
                : `PNGデータをエンコードしています · ${outputWidth}×${outputHeight}px`,
              current: `${definition.label} · ${outputWidth}×${outputHeight}px`,
              completed: index,
              total,
            });
          },
        },
      );
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "jpeg" || format === "webp" || format === "avif") {
      await report({
        percent: start + span * 0.35,
        title: "画像を生成中",
        detail:
          `${definition.label}をブラウザの画像エンコーダーで変換しています`,
        current: `${definition.label} · ${exportState.scale}×`,
        completed: index,
        total,
      });
      artifacts.push(
        await createBrowserRasterArtifact(
          exportModule,
          format,
          baseName,
          exportState.scale,
        ),
      );
    } else if (format === "bmp") {
      const output = exportModule.exportBmp(state, state.activeAssetId, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "tiff") {
      const output = exportModule.exportTiff(state, state.activeAssetId, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "svg") {
      const output = exportModule.exportSvg(state, state.activeAssetId, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "gif") {
      const output = exportModule.exportGif(state, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "apng") {
      const output = exportModule.exportApng(state, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "webm") {
      artifacts.push(
        await createWebmVideoArtifact(
          baseName,
          report,
          start,
          span,
          index,
          total,
        ),
      );
    } else if (format === "audio-webm" || format === "audio-ogg") {
      artifacts.push(
        await createAudioMediaArtifact(
          format,
          baseName,
          report,
          start,
          span,
          index,
          total,
        ),
      );
    } else if (format === "wav") {
      const workspace = getWorkspacePxdBridge();
      if (typeof workspace.renderAudioWavForExport !== "function") {
        throw new Error("Audio render adapter is unavailable for WAV export.");
      }
      const output = await withDrawAudioExportDemand(() =>
        workspace.renderAudioWavForExport!()
      );
      if (output === null) {
        throw new Error("Audio Project has no audible content to export.");
      }
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: "audio/wav",
      });
    } else if (format === "sprite-sheet") {
      const output = exportModule.exportSpriteSheet(state, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "atlas-json") {
      const output = exportModule.exportAtlasJson(state, {
        scale: exportState.scale,
        imageFilename: exportArtifactFilename(baseName, "sprite-sheet"),
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "tileset") {
      const output = exportModule.exportTileset(state, state.activeAssetId, {
        scale: exportState.scale,
      });
      artifacts.push({
        format,
        filename: exportArtifactFilename(baseName, format),
        bytes: output.bytes,
        mimeType: output.mimeType,
      });
    } else if (format === "pxd") {
      artifacts.push(await createPxdProjectArtifact(exportModule, baseName));
    } else {
      throw new Error(`${definition.label} is not available yet.`);
    }
    await report({
      percent: start + span,
      title: "書き出し中",
      detail: `${definition.label}の出力を準備しました`,
      current: `${definition.extension.toUpperCase()} 準備完了`,
      completed: index + 1,
      total,
    });
  }
  return artifacts;
}

async function exportSelectedToFile(): Promise<void> {
  const exportState = readExportState();
  if (exportState.selectedFormats.length === 0) {
    setExportPanelStatus("形式を1つ以上選択してください。", "error");
    return;
  }
  // The canvas intentionally shows a live palette preview. Commit it before
  // encoding so the downloaded bytes cannot lag behind what is visible.
  if (colorDraftDirty) {
    await commitColorEdit();
    if (colorDraftDirty) {
      setExportPanelStatus(
        "色の変更を確定してから書き出してください。",
        "error",
      );
      return;
    }
  }
  if (exportProgressHideTimer !== undefined) {
    window.clearTimeout(exportProgressHideTimer);
    exportProgressHideTimer = undefined;
  }
  exportExecute.disabled = true;
  setExportPanelStatus("書き出しを準備中…");
  const total = exportState.selectedFormats.length;
  try {
    await reportExportProgress({
      percent: 2,
      title: "書き出しを準備中",
      detail: "Export Stateを確認しています",
      current: `${exportState.scale}× local output`,
      completed: 0,
      total,
    });
    const exportModule = await loadExportModule();
    await reportExportProgress({
      percent: 8,
      title: "書き出しを準備中",
      detail: "出力エンジンを読み込んでいます",
      current: "EXPORT ENGINE",
      completed: 0,
      total,
    });
    const artifacts = await createExportArtifacts(
      exportModule,
      exportState,
      reportExportProgress,
    );
    if (exportState.packageMode === "zip" && artifacts.length > 1) {
      await reportExportProgress({
        percent: 92,
        title: "パッケージ化中",
        detail: "選択したファイルをZIPへまとめています",
        current: `${artifacts.length} files · ZIP`,
        completed: artifacts.length,
        total,
      });
      const bytes = exportModule.encodeStoredZip(artifacts.map((artifact) => ({
        filename: artifact.filename,
        bytes: artifact.bytes,
      })));
      const filename = `${safeExportBaseName()}.zip`;
      downloadBytes(bytes, filename, "application/zip");
      setExportPanelStatus(
        `書き出し完了 · ZIP ${artifacts.length}ファイル · ${bytes.byteLength} bytes`,
      );
      setStatus(`Exported ${filename} locally.`);
      await reportExportProgress({
        percent: 100,
        title: "書き出し完了",
        detail: "ZIPパッケージをローカルに保存しました",
        current: filename,
        completed: artifacts.length,
        total,
        state: "complete",
      });
    } else {
      await reportExportProgress({
        percent: 94,
        title: "ファイルを保存中",
        detail: "生成した出力をローカルに保存しています",
        current: `${artifacts.length} file(s)`,
        completed: artifacts.length,
        total,
      });
      for (const artifact of artifacts) {
        downloadBytes(artifact.bytes, artifact.filename, artifact.mimeType);
      }
      setExportPanelStatus(
        `書き出し完了 · ${
          artifacts.map((artifact) =>
            `${artifact.filename} ${artifact.bytes.byteLength} bytes`
          ).join(" / ")
        }`,
      );
      setStatus(
        `Exported ${
          artifacts.map((artifact) => artifact.filename).join(", ")
        } locally.`,
      );
      await reportExportProgress({
        percent: 100,
        title: "書き出し完了",
        detail: "選択したファイルをローカルに保存しました",
        current: artifacts.length === 1
          ? artifacts[0]?.filename ?? "COMPLETE"
          : `${artifacts.length} files · COMPLETE`,
        completed: artifacts.length,
        total,
        state: "complete",
      });
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Export failed.";
    setExportPanelStatus(message, "error");
    setStatus(message, "error");
    await reportExportProgress({
      percent: 100,
      title: "書き出しに失敗",
      detail: message,
      current: "ERROR",
      completed: 0,
      total,
      state: "error",
    });
  } finally {
    exportExecute.disabled = false;
    exportProgressHideTimer = window.setTimeout(() => {
      exportProgressHideTimer = undefined;
      hideExportProgress();
    }, 1400);
  }
}

async function importPxdFile(
  file: File,
  options: PxdEntryImportOptions = {},
): Promise<void> {
  const previousImportState = {
    state: cloneProjectStateShared(state),
    activeWorkspaceProjectId: readActiveWorkspaceProjectId(),
    assetDefinitions: assetDefinitions.map(cloneAssetDefinitionEntry),
    assetPackages: assetPackages.map(cloneAssetPackageManifest),
    assetDefinitionSequence,
    history: history.snapshot(),
    drawPersistenceRevision,
    drawPersistenceExpectedRevision,
    drawPersistenceExpectedStateHash,
    clientSequence,
    selection,
    selectionDraft,
    pendingSelectionGesture,
    transformSession,
    transformPreview,
    pasteMode,
    clipboard,
    selectedTileSource,
    tilesetSourceRenderKey,
    lastTilemapGridLayoutKey,
    timelineSession,
    timelineViewportInitialized,
    structureClientSequence,
    onionSkinEnabled,
    onionSkinPreviousFrames,
    onionSkinNextFrames,
    onionSkinOpacity,
    onionSkinColorMode,
    onionSkinCache,
    draw2EditorPreferencesReady,
    timelineMetadata: draw2TimelineMetadataSnapshot(),
    journal: drawJournalSnapshot(),
    journalCheckpoints: journal.checkpoints.map((checkpoint) =>
      cloneProjectStateShared(checkpoint)
    ),
  };
  let importCommitStarted = false;
  let previousWorkspacePxdSnapshot: WorkspacePxdBridgeSnapshot | undefined;
  let workspaceRollbackFailed = false;
  try {
    if (
      options.expectedProjectId !== undefined &&
      state.projectId !== options.expectedProjectId
    ) {
      throw new Error("The Project changed before the PXD restore began.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const legacyCompat = await loadLegacyCompatModule();
    const inspection = await legacyCompat.inspectPxd(bytes);
    if (
      options.source === "REMOTE_CHECKPOINT" &&
      inspection.source.identity !== "NEW_DRAW2_PXD_V2"
    ) {
      throw new Error(
        "A shared PiXYNC checkpoint must be an integrated PXD v2 Project.",
      );
    }
    let importedState: ProjectState;
    let importedAssetDefinitions: readonly PxdAssetDefinitionEntry[] = [];
    let importedAssetPackages: readonly AssetPackageManifest[] = [];
    let importedTimelineMetadata: Draw2TimelineMetadata | undefined;
    let importedStatus = "schema=v1";
    let importedHash = "";
    let importedWorkspace: WorkspacePxdBridgeSnapshot | undefined;
    if (inspection.source.identity === "LEGACY_PXD_ARCHIVE_V2") {
      const decompressor = async (
        compressed: Uint8Array,
      ): Promise<Uint8Array> => {
        const stream = new Blob([compressed.slice().buffer as ArrayBuffer])
          .stream().pipeThrough(new DecompressionStream("deflate"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      };
      const imported = await legacyCompat.importLegacyPxd(bytes, {
        decompressDeflate: decompressor,
      });
      importedState = imported.state;
      importedStatus =
        `legacy-copy compatibility=${imported.compatibility.status}`;
      importedHash = imported.source.sourceHash;
    } else if (inspection.source.identity === "NEW_DRAW2_PXD_V1") {
      const exportModule = await loadExportModule();
      const imported = await exportModule.importPxdPackage(bytes);
      importedState = imported.state;
      importedAssetDefinitions = imported.assetDefinitions;
      importedTimelineMetadata = imported.drawTimelineMetadata;
      importedHash = imported.packageHash;
    } else if (inspection.source.identity === "NEW_DRAW2_PXD_V2") {
      const exportModule = await loadExportModule();
      const imported = await exportModule.importPxdProject(
        bytes,
        options.expectedPackageHash === undefined
          ? {}
          : { expectedPackageHash: options.expectedPackageHash },
      );
      importedState = imported.state;
      importedAssetDefinitions = imported.assetDefinitions;
      importedAssetPackages = imported.assetPackages;
      importedTimelineMetadata = imported.drawTimelineMetadata;
      importedHash = imported.packageHash;
      importedStatus = "schema=v2 · Draw/Audio/Game";
      importedWorkspace = {
        projectId: imported.state.projectId,
        audio: imported.audio,
        game: imported.game,
      };
    } else {
      const diagnostic = inspection.diagnostics[0];
      throw new Error(
        diagnostic?.message ?? "PXD format could not be identified.",
      );
    }
    // A full Project restore must target the requested Project.  ASSET_ONLY
    // intentionally imports a Market source Project into the already-open
    // target Project, so its source projectId is expected to differ.
    if (
      options.mode !== "ASSET_ONLY" &&
      options.expectedProjectId !== undefined &&
      importedState.projectId !== options.expectedProjectId
    ) {
      throw new Error("The PXD Project ID does not match the active Room.");
    }
    if (
      options.expectedProjectId !== undefined &&
      state.projectId !== options.expectedProjectId
    ) {
      throw new Error("The Project changed during the PXD restore.");
    }
    if (importedState.assets[importedState.activeAssetId] === undefined) {
      throw new Error("Imported PXD active asset is missing.");
    }
    if (options.mode === "ASSET_ONLY") {
      const metadata = marketAssetBindingMetadataFor(options.marketMetadata, {
        requireEntitlement: true,
      });
      if (metadata === undefined) {
        throw new Error(
          "iGAME利用に必要なAsset revision・hash・配信・ライセンス情報が不足しています。",
        );
      }
      if (metadata.source.format !== "pixiedraw-project") {
        throw new Error("現在のiGAME取込はPXD形式のMarket Assetに対応しています。");
      }
      if (
        typeof importedHash !== "string" ||
        importedHash.toLowerCase() !==
          (metadata.source.packageHash ?? metadata.source.contentHash)
      ) {
        throw new Error("配信されたPXDの内容がMarketの宣言Hashと一致しません。");
      }
      await flushDrawPersistence();
      if (
        options.expectedProjectId !== undefined &&
        state.projectId !== options.expectedProjectId
      ) {
        throw new Error("The Project changed before the Market asset binding.");
      }
      const before = state;
      const projected = appendMarketAssetSource(state, importedState, metadata);
      importCommitStarted = projected.state !== state;
      if (importCommitStarted) {
        state = projected.state;
        repository.save(state);
        adoptCanonicalState(state);
        history.record(
          before,
          state,
          `market-asset-${metadata.delivery.deliveryId}`,
          "market.assetImport",
        );
        saveDrawProjectState("market-asset-import");
        notifyAssetStateChanged();
      }
      window.dispatchEvent(
        new CustomEvent("draw2:market-asset-ready", {
          detail: {
            reference: projected.reference,
            source: metadata.source,
            delivery: metadata.delivery,
            license: metadata.license,
          },
        }),
      );
      setStatus(
        importCommitStarted
          ? `Market AssetをiGAME素材棚へ追加しました · ${metadata.source.label}`
          : `Market AssetはiGAME素材棚へ追加済みです · ${metadata.source.label}`,
      );
      return;
    }
    if (importedWorkspace !== undefined) {
      previousWorkspacePxdSnapshot = await getWorkspacePxdBridge()
        .exportProjectPxdSnapshot();
    }
    if (
      options.expectedProjectId !== undefined &&
      state.projectId !== options.expectedProjectId
    ) {
      throw new Error("The Project changed before the PXD restore commit.");
    }
    flushDrawPersistence();
    await flushDrawPersistence();
    if (
      options.expectedProjectId !== undefined &&
      state.projectId !== options.expectedProjectId
    ) {
      throw new Error("The Project changed before the PXD restore commit.");
    }
    importCommitStarted = true;
    draw2EditorPreferencesReady = false;
    state = importedState;
    assetDefinitions = importedAssetDefinitions.map(cloneAssetDefinitionEntry);
    assetPackages = importedAssetPackages.map(cloneAssetPackageManifest);
    assetDefinitionSequence = 0;
    repository.save(state);
    adoptCanonicalState(state);
    history = new LocalUndoRedoHistory(state);
    const importedRecord = await drawPersistenceStore.load(state.projectId);
    drawPersistenceRevision = importedRecord?.revision ?? 0;
    drawPersistenceExpectedRevision = drawPersistenceRevision;
    drawPersistenceExpectedStateHash = importedRecord?.stateHash ?? null;
    clientSequence = 0;
    selectionInteractionGeneration += 1;
    selection = undefined;
    selectionDraft = undefined;
    pendingSelectionGesture = undefined;
    transformSession = undefined;
    transformPreview = undefined;
    pasteMode = false;
    clipboard = undefined;
    selectedTileSource = undefined;
    tilesetSourceRenderKey = "";
    lastTilemapGridLayoutKey = "";
    timelineSession = createTimelineSession(state);
    restoreDraw2TimelineMetadata(importedTimelineMetadata);
    timelineViewportInitialized = false;
    structureClientSequence = 0;
    onionSkinEnabled = false;
    onionSkinPreviousFrames = 1;
    onionSkinNextFrames = 1;
    onionSkinOpacity = 0.5;
    onionSkinColorMode = "TINTED";
    onionSkinCache = undefined;
    journal.operations.length = 0;
    journal.dirtyTileWrites.length = 0;
    journal.checkpoints.length = 0;
    const asset = state.assets[state.activeAssetId];
    if (asset === undefined) {
      throw new Error("Imported PXD active asset is missing.");
    }
    projectIdInput.value = state.projectId;
    tileSizeSelect.value = String(asset.raster.tileSize);
    syncClientSequencesFromState();
    syncRasterCanvasDimensions(asset.width, asset.height);
    restoreDraw2EditorPreferencesForProject(state.projectId, asset);
    renderPaletteButtons(asset.palette);
    await present();
    syncExportPanel();
    syncColorEditorFromSelection();
    updatePlaybackLoopControl();
    renderTimeline();
    updateSelectionStatus(
      `scope=${state.activeCelId} · selection=none · undo=0 · redo=0`,
    );
    notifyAssetStateChanged();
    updateHistoryButtons();
    saveDrawProjectState("import");
    writeActiveWorkspaceProjectId(asWorkspaceProjectId(state.projectId));
    if (importedWorkspace !== undefined) {
      await getWorkspacePxdBridge().restoreProjectPxdSnapshot(
        importedWorkspace,
      );
    }
    if (options.announceProjectChange !== false) {
      announceWorkspaceProjectChanged(window, {
        projectId: asWorkspaceProjectId(state.projectId),
        name: state.name,
      });
    }
    const sourceLabel = options.source === "REMOTE_CHECKPOINT"
      ? "PiXYNC checkpoint restored"
      : options.source === "MARKET_PURCHASE"
      ? "Purchased PXD imported"
      : "PXD imported locally";
    setStatus(
      `${sourceLabel} · ${importedStatus} · hash=${importedHash.slice(0, 12)}…`,
    );
  } catch (cause) {
    if (importCommitStarted) {
      state = previousImportState.state;
      assetDefinitions = previousImportState.assetDefinitions.map(
        cloneAssetDefinitionEntry,
      );
      assetPackages = previousImportState.assetPackages.map(cloneAssetPackageManifest);
      assetDefinitionSequence = previousImportState.assetDefinitionSequence;
      drawPersistenceRevision = previousImportState.drawPersistenceRevision;
      drawPersistenceExpectedRevision =
        previousImportState.drawPersistenceExpectedRevision;
      drawPersistenceExpectedStateHash =
        previousImportState.drawPersistenceExpectedStateHash;
      clientSequence = previousImportState.clientSequence;
      selection = previousImportState.selection;
      selectionDraft = previousImportState.selectionDraft;
      pendingSelectionGesture = previousImportState.pendingSelectionGesture;
      transformSession = previousImportState.transformSession;
      transformPreview = previousImportState.transformPreview;
      pasteMode = previousImportState.pasteMode;
      clipboard = previousImportState.clipboard;
      selectedTileSource = previousImportState.selectedTileSource;
      tilesetSourceRenderKey = previousImportState.tilesetSourceRenderKey;
      lastTilemapGridLayoutKey = previousImportState.lastTilemapGridLayoutKey;
      timelineSession = previousImportState.timelineSession;
      timelineViewportInitialized =
        previousImportState.timelineViewportInitialized;
      structureClientSequence = previousImportState.structureClientSequence;
      onionSkinEnabled = previousImportState.onionSkinEnabled;
      onionSkinPreviousFrames = previousImportState.onionSkinPreviousFrames;
      onionSkinNextFrames = previousImportState.onionSkinNextFrames;
      onionSkinOpacity = previousImportState.onionSkinOpacity;
      onionSkinColorMode = previousImportState.onionSkinColorMode;
      onionSkinCache = previousImportState.onionSkinCache;
      draw2EditorPreferencesReady =
        previousImportState.draw2EditorPreferencesReady;
      repository.save(previousImportState.state);
      adoptCanonicalState(previousImportState.state);
      history = new LocalUndoRedoHistory(previousImportState.state);
      history.restore(previousImportState.history);
      restoreDraw2TimelineMetadata(previousImportState.timelineMetadata);
      journal.operations.splice(
        0,
        journal.operations.length,
        ...previousImportState.journal.operations.map((operation) => ({
          ...operation,
        })),
      );
      journal.dirtyTileWrites.splice(
        0,
        journal.dirtyTileWrites.length,
        ...previousImportState.journal.dirtyTileWrites.map((write) => ({
          assetId: write.assetId,
          tiles: write.tiles.map((tile) => ({
            tileKey: tile.tileKey,
            bytes: new Uint8Array(tile.bytes),
          })),
        })),
      );
      journal.checkpoints.splice(
        0,
        journal.checkpoints.length,
        ...previousImportState.journalCheckpoints.map((checkpoint) =>
          cloneProjectStateShared(checkpoint)
        ),
      );
      const restoredAsset = state.assets[state.activeAssetId];
      if (restoredAsset !== undefined) {
        syncRasterCanvasDimensions(restoredAsset.width, restoredAsset.height);
        renderPaletteButtons(restoredAsset.palette);
      }
      renderTimeline();
      await present();
      updateHistoryButtons();
      saveDrawProjectState("import-rollback");
      writeActiveWorkspaceProjectId(
        previousImportState.activeWorkspaceProjectId,
      );
      if (previousWorkspacePxdSnapshot !== undefined) {
        try {
          await getWorkspacePxdBridge().restoreProjectPxdSnapshot(
            previousWorkspacePxdSnapshot,
          );
        } catch {
          workspaceRollbackFailed = true;
        }
      }
      if (options.announceProjectChange !== false) {
        announceWorkspaceProjectChanged(window, {
          projectId: asWorkspaceProjectId(state.projectId),
          name: state.name,
        });
      }
    }
    const message = cause instanceof Error
      ? `PXD import rejected: ${cause.message}`
      : "PXD import rejected.";
    setStatus(
      workspaceRollbackFailed
        ? `${message} Draw was restored, but the shared Audio/Game snapshot could not be restored.`
        : message,
      "error",
    );
    if (
      options.source === "REMOTE_CHECKPOINT" ||
      options.source === "MARKET_PURCHASE" ||
      options.source === "MARKET_ASSET"
    ) {
      throw cause instanceof Error ? cause : new Error(message);
    }
  } finally {
    importPxdControl.value = "";
  }
}

function pointFromPointer(
  event: PointerEvent,
): { x: number; y: number } | undefined {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return undefined;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor(
    ((event.clientX - bounds.left) / bounds.width) * asset.width,
  );
  const y = Math.floor(
    ((event.clientY - bounds.top) / bounds.height) * asset.height,
  );
  return {
    x: Math.max(0, Math.min(asset.width - 1, x)),
    y: Math.max(0, Math.min(asset.height - 1, y)),
  };
}

function mirrorGuideAxisAtClient(
  clientX: number,
  clientY: number,
): MirrorGuideAxis | undefined {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || !mirrorEnabled) return undefined;
  const source = mirrorGuidePointForViewportClient(
    clientX,
    clientY,
    asset,
  );
  const tolerance = Math.max(
    1.5,
    6 / Math.max(MIN_VIEWPORT_ZOOM, currentViewportDisplayScale()),
  );
  const maxX = Math.max(1, asset.width - 1);
  const maxY = Math.max(1, asset.height - 1);
  const normalizedX = source.x / maxX;
  const normalizedY = source.y / maxY;
  const candidates: Array<{ axis: MirrorGuideAxis; distance: number }> = [];
  candidates.push({ axis: "x", distance: Math.abs(source.x - mirrorGuide.x) });
  candidates.push({ axis: "y", distance: Math.abs(source.y - mirrorGuide.y) });
  candidates.push({
    axis: "diagonal-down",
    distance: Math.abs(normalizedY - normalizedX - mirrorGuide.diagonalDown) *
      Math.min(maxX, maxY),
  });
  candidates.push({
    axis: "diagonal-up",
    distance: Math.abs(normalizedX + normalizedY - 1 - mirrorGuide.diagonalUp) *
      Math.min(maxX, maxY),
  });
  return candidates
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((left, right) => left.distance - right.distance)[0]?.axis;
}

function isOutsideCanvasClient(clientX: number, clientY: number): boolean {
  const bounds = canvas.getBoundingClientRect();
  return clientX < bounds.left || clientX > bounds.right ||
    clientY < bounds.top || clientY > bounds.bottom;
}

function moveMirrorGuideFromClient(
  axis: MirrorGuideAxis,
  clientX: number,
  clientY: number,
): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const source = mirrorGuidePointForViewportClient(
    clientX,
    clientY,
    asset,
  );
  mirrorGuide = normalizeMirrorGuide({
    width: asset.width,
    height: asset.height,
  });
  if (axis === "x") {
    mirrorGuide.x = snapMirrorGuideCoordinate(source.x, asset.width);
  } else if (axis === "y") {
    mirrorGuide.y = snapMirrorGuideCoordinate(source.y, asset.height);
  } else {
    if (axis === "diagonal-down") {
      const snappedY = snapMirrorGuideCoordinate(source.y, asset.height);
      mirrorGuide.diagonalDown = canvasCoordinateToDiagonalMirrorGuideOffset(
        mirrorGuideToCanvasCoordinate(snappedY, asset.height),
        asset.height,
      );
    } else {
      const snappedX = snapMirrorGuideCoordinate(source.x, asset.width);
      mirrorGuide.diagonalUp = canvasCoordinateToDiagonalMirrorGuideOffset(
        mirrorGuideToCanvasCoordinate(snappedX, asset.width),
        asset.width,
      );
    }
  }
  mirrorGuide = normalizeMirrorGuide({
    width: asset.width,
    height: asset.height,
  });
  drawOverlay();
}

function createFillGradientWriteSet(
  asset: RasterAsset,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  colorIndex = selectedColor,
  maxPixels?: number,
): readonly { x: number; y: number; colorIndex: number }[] {
  const picked = selectByContiguousColor(
    asset.raster,
    from,
    "exact",
    asset.palette,
    0,
    maxPixels === undefined
      ? Math.min(1_048_577, asset.width * asset.height + 1)
      : maxPixels + 1,
  );
  const allowed = selection === undefined
    ? undefined
    : new Set(selection.pixels.map(selectionPointKey));
  if (allowed !== undefined && !allowed.has(selectionPointKey(from))) {
    return [];
  }
  const region = allowed === undefined
    ? picked.pixels
    : picked.pixels.filter((point) => allowed.has(selectionPointKey(point)));
  if (
    region.length === 0 ||
    (maxPixels !== undefined && region.length > maxPixels)
  ) return [];
  return createIndexedGradientWriteSet(
    asset.raster,
    region,
    from,
    to,
    asset.raster.getPixel(from.x, from.y),
    colorIndex,
    asset.palette,
  );
}

interface FixedToolContext {
  readonly tool: BasicTool;
  readonly colorIndex: number;
  readonly toolOptions: Partial<ToolOptions>;
}

function normalizeColorSelectionMode(
  mode: ColorSelectionMode | undefined,
): ColorSelectionMode {
  return mode === "exact" || mode === "magic" || mode === "opaque"
    ? mode
    : "similar";
}

function colorSelectionModeLabel(mode: ColorSelectionMode): string {
  switch (mode) {
    case "exact":
      return "Same";
    case "magic":
      return "Magic";
    case "opaque":
      return "Opaque";
    default:
      return "Similar";
  }
}

function selectConfiguredColor(
  asset: RasterAsset,
  seed: { readonly x: number; readonly y: number },
  options: Partial<ToolOptions>,
) {
  const mode = normalizeColorSelectionMode(options.selectionMode);
  const threshold = options.similarity ?? 0;
  if (mode === "opaque") return selectByOpaque(asset.raster, asset.palette);
  if (mode === "magic") {
    return selectByContiguousColor(
      asset.raster,
      seed,
      "similar",
      asset.palette,
      threshold,
    );
  }
  return selectByPaletteColor(
    asset.raster,
    asset.raster.getPixel(seed.x, seed.y),
    mode === "exact" ? "exact" : "similar",
    asset.palette,
    threshold,
  );
}

function commitPointerPoints(
  points: readonly { x: number; y: number }[],
  fixedContext?: FixedToolContext,
): Promise<void> {
  return enqueueCanonicalOperation(() =>
    commitPointerPointsNow(points, fixedContext)
  );
}

async function commitTileStampCommandNow(
  asset: RasterAsset,
  payload: TileStampPayload,
  label = "Tile placement",
): Promise<boolean> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  const drawClientId = activeDrawClientId();
  const commandSequence = nextClientSequence(drawClientId);
  const before = state;
  const command = {
    commandId: `draw2-local-tile-stamp-${commandSequence}`,
    commandType: "raster.tileStamp" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: activeDrawActorId(),
    clientId: drawClientId,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload,
  };
  if (rejectOversizedProductionPayload(payload)) {
    syncClientSequencesFromState();
    return false;
  }
  const tileTimelineGeneration = timelineStateGeneration;
  const tileCanonicalGeneration = canonicalStateGeneration;
  const result = await core.execute(command);
  if (
    tileTimelineGeneration !== timelineStateGeneration ||
    tileCanonicalGeneration !== canonicalStateGeneration
  ) {
    syncClientSequencesFromState();
    setStatus(
      "Timeline cell changed while placing the tile; the old-cell write was discarded.",
      "error",
    );
    return false;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(
      result.diagnostics.map((item) => item.code).join(", "),
      "error",
    );
    return false;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    renderTimeline();
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  if (!result.result.noOp) {
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
  }
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setStatus(
    `${label} committed · ${result.result.dirtyTiles.length} tiles · one undo`,
  );
  return !result.result.noOp;
}

async function commitFillCommandNow(
  asset: RasterAsset,
  seed: { readonly x: number; readonly y: number },
  colorIndex: number,
  gradientTo?: { readonly x: number; readonly y: number },
  clip?: RasterClipRect,
  selectionMask?: RasterSelectionMask,
): Promise<void> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  const drawClientId = activeDrawClientId();
  const commandSequence = nextClientSequence(drawClientId);
  const before = state;
  const command = {
    commandId: `draw2-local-fill-${commandSequence}`,
    commandType: "raster.fill" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: activeDrawActorId(),
    clientId: drawClientId,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      seedX: seed.x,
      seedY: seed.y,
      colorIndex,
      maxCells: Math.min(1_048_576, asset.width * asset.height),
      ...(gradientTo === undefined
        ? {}
        : { gradientToX: gradientTo.x, gradientToY: gradientTo.y }),
      ...(clip === undefined ? {} : { clip }),
      ...(selectionMask === undefined ? {} : { selectionMask }),
    },
  };
  if (rejectOversizedProductionPayload(command.payload)) {
    syncClientSequencesFromState();
    return;
  }
  const fillTimelineGeneration = timelineStateGeneration;
  const fillCanonicalGeneration = canonicalStateGeneration;
  const result = await core.execute(command);
  if (
    fillTimelineGeneration !== timelineStateGeneration ||
    fillCanonicalGeneration !== canonicalStateGeneration
  ) {
    syncClientSequencesFromState();
    setStatus(
      "Timeline cell changed while filling; the old-cell write was discarded.",
      "error",
    );
    return;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(
      result.diagnostics.map((item) => item.code).join(", "),
      "error",
    );
    return;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    renderTimeline();
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  if (!result.result.noOp) {
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
  }
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setStatus(
    `${
      gradientTo === undefined ? "fill" : "gradient fill"
    } committed · ${result.result.dirtyTiles.length} tiles · one undo`,
  );
}

async function commitPointerPointsNow(
  points: readonly { x: number; y: number }[],
  fixedContext?: FixedToolContext,
): Promise<void> {
  if (timelineActivationPending) {
    setStatus("Timeline cell is changing; drawing was not committed.", "error");
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || points.length === 0) return;
  if (selection !== undefined && !selectionScopeMatchesActiveCel()) {
    clearCommittedSelection(
      "Selection cleared because it belongs to another timeline cel.",
    );
    return;
  }
  const tool = fixedContext?.tool ?? currentBasicTool();
  if (
    collaborationEditBlockReason() !== undefined &&
    !collaborationCanvasToolIsNonMutating(tool)
  ) {
    announceCollaborationEditBlock();
    return;
  }
  const colorIndex = fixedContext?.colorIndex ?? selectedColor;
  const fixedToolOptions = fixedContext?.toolOptions ?? toolOptions;
  const selectionClip = activeRectangleSelectionClip();
  const selectionMask = activeRasterSelectionMask();
  const first = points[0] ?? points[points.length - 1]!;
  const last = points[points.length - 1] ?? first;
  if (tool === "pan") return;
  if (tool === "text") {
    openTextInsertDialog(first, last);
    return;
  }
  if (tool === "eyedropper") {
    selectedColor = asset.raster.getPixel(first.x, first.y);
    renderPaletteButtons(asset.palette);
    syncColorEditorFromSelection();
    scheduleDraw2EditorPreferencesSave();
    setStatus(`Picked palette index ${selectedColor}.`);
    return;
  }
  if (tool === "tile-stamp") {
    const scale = Math.max(
      1,
      Math.min(16, Math.round(Number(specialTileScaleElement?.value ?? 1))),
    );
    if (selectedTileSource === undefined) {
      await commitTileStampCommandNow(asset, {
        pattern: "checker",
        colorIndex,
        originX: first.x,
        originY: first.y,
        scale,
        ...(selectionClip === undefined ? {} : { clip: selectionClip }),
        ...(selectionMask === undefined ? {} : { selectionMask }),
      });
      return;
    }
    const sourceAsset = state.assets[selectedTileSource.sourceAssetId];
    if (sourceAsset === undefined) {
      setStatus(
        "Tile source is unavailable; choose a Tileset cell first.",
        "error",
      );
      return;
    }
    await commitTileStampCommandNow(asset, {
      sourceAssetId: sourceAsset.id,
      sourceAssetRevision: sourceAsset.revision,
      sourceX: selectedTileSource.sourceX,
      sourceY: selectedTileSource.sourceY,
      sourceWidth: selectedTileSource.cellSize,
      sourceHeight: selectedTileSource.cellSize,
      originX: first.x,
      originY: first.y,
      scale,
      ...(selectionClip === undefined ? {} : { clip: selectionClip }),
      ...(selectionMask === undefined ? {} : { selectionMask }),
    });
    return;
  }
  if (tool === "select-color") {
    const mode = normalizeColorSelectionMode(fixedToolOptions.selectionMode);
    const picked = selectConfiguredColor(asset, first, fixedToolOptions);
    beginSelectionFromPoints(
      picked.pixels,
      mode === "opaque" ? "alpha" : "magic",
      selectionEditMode,
      `${colorSelectionModeLabel(mode)} color selection created.`,
    );
    return;
  }
  if (tool === "select-lasso") {
    const picked = selectByLasso(asset.raster, points);
    beginSelectionFromPoints(
      picked.pixels,
      "freehand",
      selectionEditMode,
      "Lasso selection created.",
    );
    return;
  }
  if (tool === "select-ellipse") {
    const bounds = normalizeToolBounds(first, last, asset);
    const picked = selectByEllipse(asset.raster, first, last);
    beginSelectionFromPoints(
      picked.pixels,
      "ellipse",
      selectionEditMode,
      `Ellipse selection created · ${bounds.width}×${bounds.height}.`,
    );
    return;
  }
  if (tool === "select-rect") {
    const bounds = normalizeToolBounds(first, last, asset);
    beginSelectionFromPoints(
      rectanglePointList(bounds),
      "rectangle",
      selectionEditMode,
      "Rectangle selection created.",
    );
    return;
  }
  if (tool === "fill") {
    if (selectionClip !== undefined || selectionMask !== undefined) {
      await commitFillCommandNow(
        asset,
        first,
        colorIndex,
        points.length > 1 ? last : undefined,
        selectionClip,
        selectionMask,
      );
      return;
    }
    if (selection !== undefined) {
      const writes = createFillGradientWriteSet(asset, first, last, colorIndex);
      if (writes.length === 0) {
        setStatus(
          selection === undefined ||
            selection.pixels.some((point) =>
              point.x === first.x && point.y === first.y
            )
            ? "Fill has no pixels to change."
            : "Fill seed is outside the active selection.",
          "error",
        );
        return;
      }
      await commitWriteSetNow(
        writes,
        points.length > 1 ? "tool.fill.gradient" : "tool.fill.selection",
      );
      return;
    }
    await commitFillCommandNow(
      asset,
      first,
      colorIndex,
      points.length > 1 ? last : undefined,
    );
    return;
  }
  const useShapeCommand =
    (tool === "rect" || tool === "rect-fill" || tool === "ellipse" ||
      tool === "ellipse-fill" || tool === "circle" || tool === "circle-fill") &&
    (selection === undefined || selectionClip !== undefined ||
      selectionMask !== undefined);
  if (useShapeCommand) {
    await commitShapePointsNow(
      tool,
      first,
      last,
      colorIndex,
      fixedToolOptions,
    );
    return;
  }
  const useStrokeCommand =
    (tool === "pen" || tool === "eraser" || tool === "pixel-pen" ||
      tool === "line") &&
    (selection === undefined || selectionClip !== undefined ||
      selectionMask !== undefined);
  if (useStrokeCommand) {
    const drawClientId = activeDrawClientId();
    const commandSequence = nextClientSequence(drawClientId);
    const before = state;
    const strokeOptions = normalizeToolOptions(fixedToolOptions);
    const mirror = mirrorCommitSpecForTool(asset, tool);
    let strokePoints: readonly { x: number; y: number }[];
    try {
      // Keep the bounded pointer path in the sync payload. EditorCore owns
      // deterministic interpolation, so expanding a 256px gesture into one
      // entry per painted pixel would make a valid stroke exceed the PiXYNC
      // command-array bound before it reaches the transport.
      const sourcePoints = tool === "line" ? [first, last] : points;
      const rawStrokePoints = sourcePoints.map((point) => ({
        x: point.x,
        y: point.y,
      }));
      // Coalesced input can contain a very dense/repeated path. Reduce it
      // before canonical interpolation; the bounded command path is the
      // actual transport contract and preserves the gesture endpoints.
      strokePoints = compactPixelPath(
        rawStrokePoints,
        PIXYNC_DRAW2_MAX_PAYLOAD_KEYS,
      );
      // Validate only the reduced path so input density does not reject an
      // otherwise drawable gesture.
      if (strokeOptions.brushAlgorithm === "regular") {
        interpolatePixelPath(strokePoints);
      } else {
        interpolatePixelPath(strokePoints, strokeOptions.brushAlgorithm);
      }
    } catch (cause) {
      syncClientSequencesFromState();
      setStatus(
        cause instanceof Error ? cause.message : "Stroke interpolation failed.",
        "error",
      );
      return;
    }
    const command = {
      commandId: `draw2-local-stroke-${commandSequence}`,
      commandType: "raster.strokeCommit" as const,
      schemaVersion: 1 as const,
      projectId: state.projectId,
      assetId: asset.id,
      actorId: activeDrawActorId(),
      clientId: drawClientId,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: {
        points: strokePoints,
        colorIndex: tool === "eraser" ? 0 : colorIndex,
        brushSize: strokeOptions.brushSize,
        brushShape: strokeOptions.brushShape,
        brushAngle: strokeOptions.brushAngle,
        brushAlgorithm: strokeOptions.brushAlgorithm,
        pattern: strokeOptions.pattern,
        ...(mirror === undefined ? {} : { mirror }),
        ...(selectionClip === undefined ? {} : { clip: selectionClip }),
        ...(selectionMask === undefined ? {} : { selectionMask }),
      },
    };
    if (rejectOversizedProductionPayload(command.payload)) {
      syncClientSequencesFromState();
      return;
    }
    const strokeTimelineGeneration = timelineStateGeneration;
    const strokeCanonicalGeneration = canonicalStateGeneration;
    const result = await core.execute(command);
    if (
      strokeTimelineGeneration !== timelineStateGeneration ||
      strokeCanonicalGeneration !== canonicalStateGeneration
    ) {
      syncClientSequencesFromState();
      setStatus(
        "Timeline cell changed while drawing; the old-cell write was discarded.",
        "error",
      );
      return;
    }
    if (!result.ok) {
      syncClientSequencesFromState();
      setStatus(
        result.diagnostics.map((item) => item.code).join(", "),
        "error",
      );
      return;
    }
    if (!result.result.noOp) {
      adoptCanonicalState(result.state);
      refreshSelectionSnapshotForCurrentRaster();
      history.record(
        before,
        state,
        result.result.operation.operationId,
        result.result.operation.operationType,
      );
      renderTimeline();
      saveDrawProjectState();
    }
    await autosave.record(state, result.result);
    if (!result.result.noOp) {
      publishDrawRasterCommit(result.result, state, before.structureEpoch);
    }
    await present(result.result.dirtyRegions, result.result.dirtyTiles);
    updateHistoryButtons();
    setStatus(`${tool} committed · one stroke / one undo`);
    return;
  }
  const writes = tool === "pen" || tool === "eraser"
    ? createPathWriteSet(
      tool,
      points,
      colorIndex,
      fixedToolOptions,
      asset.raster,
    )
    : createWriteSet(
      tool,
      first,
      last,
      colorIndex,
      fixedToolOptions,
      asset.raster,
    );
  await commitWriteSetNow(writes, `tool.${tool}`);
}

async function commitShapePointsNow(
  tool: ShapeCommitPayload["tool"],
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  colorIndex: number,
  toolOptions: Partial<ToolOptions>,
): Promise<void> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const options = normalizeToolOptions(toolOptions);
  const mirror = mirrorCommitSpecForTool(asset, tool);
  const clip = activeRectangleSelectionClip();
  const selectionMask = activeRasterSelectionMask();
  const drawClientId = activeDrawClientId();
  const commandSequence = nextClientSequence(drawClientId);
  const before = state;
  const command = {
    commandId: `draw2-local-shape-${commandSequence}`,
    commandType: "raster.shapeCommit" as const,
    schemaVersion: 1 as const,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: activeDrawActorId(),
    clientId: drawClientId,
    clientSequence: commandSequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: performance.now(),
    payload: {
      tool,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      colorIndex,
      brushSize: options.brushSize,
      brushShape: options.brushShape,
      brushAngle: options.brushAngle,
      brushAlgorithm: options.brushAlgorithm,
      pattern: options.pattern,
      ...(mirror === undefined ? {} : { mirror }),
      ...(clip === undefined ? {} : { clip }),
      ...(selectionMask === undefined ? {} : { selectionMask }),
    },
  };
  if (rejectOversizedProductionPayload(command.payload)) {
    syncClientSequencesFromState();
    return;
  }
  const shapeTimelineGeneration = timelineStateGeneration;
  const shapeCanonicalGeneration = canonicalStateGeneration;
  const result = await core.execute(command);
  if (
    shapeTimelineGeneration !== timelineStateGeneration ||
    shapeCanonicalGeneration !== canonicalStateGeneration
  ) {
    syncClientSequencesFromState();
    setStatus(
      "Timeline cell changed while drawing; the old-cell shape was discarded.",
      "error",
    );
    return;
  }
  if (!result.ok) {
    syncClientSequencesFromState();
    setStatus(result.diagnostics.map((item) => item.code).join(", "), "error");
    return;
  }
  if (!result.result.noOp) {
    adoptCanonicalState(result.state);
    refreshSelectionSnapshotForCurrentRaster();
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    renderTimeline();
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  if (!result.result.noOp) {
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
  }
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateHistoryButtons();
  setStatus(`${tool} committed · one shape / one undo`);
}

async function commitInteractionSession(
  commit: ToolSessionCommit,
): Promise<void> {
  try {
    const fixedContext: FixedToolContext = {
      tool: commit.tool,
      colorIndex: commit.colorIndex,
      toolOptions: commit.tool === "pixel-pen"
        ? {
          ...commit.toolOptions,
          brushSize: 1,
          brushShape: "square",
          pattern: "solid",
        }
        : commit.toolOptions,
    };
    if (commit.kind === "immediate") {
      // Fill uses the full gesture to distinguish a click from a directional
      // gradient drag. Other immediate tools intentionally commit only their
      // final point (for example the eyedropper and tile stamp).
      await commitPointerPoints(
        commit.tool === "fill" ? commit.points : [commit.point],
        fixedContext,
      );
      return;
    }
    if (
      commit.tool === "pen" || commit.tool === "eraser" ||
      commit.tool === "pixel-pen" || commit.tool === "line"
    ) {
      // A simple pen stroke is already represented by its pointer path. Let
      // EditorCore interpolate it during the canonical command instead of
      // putting every painted pixel into a sync write-set array. This keeps a
      // fast full-width stroke within the bounded PiXYNC payload contract while
      // preserving the same one-stroke/one-undo behavior.
      await commitPointerPoints(commit.points, fixedContext);
      return;
    }
    const shapeTools: readonly BasicTool[] = [
      "rect",
      "rect-fill",
      "ellipse",
      "ellipse-fill",
      "circle",
      "circle-fill",
    ];
    if (shapeTools.includes(commit.tool)) {
      await commitPointerPoints(commit.points, fixedContext);
      return;
    }
    await commitPointerPoints(commit.points, fixedContext);
  } finally {
    removePendingDrawPreview(commit.sessionId);
  }
}

createButton.addEventListener("click", openProjectDialog);
openProjectDialogTrigger.addEventListener("click", openProjectDialog);
projectDialogOpen.addEventListener("click", () => {
  try {
    const projectId = readProjectDialogProjectId();
    projectDialogStatus.textContent = `Opening Project ${projectId}…`;
    projectDialogOpen.disabled = true;
    projectDialogNew.disabled = true;
    void resetProject({ projectIdOverride: projectId, mode: "OPEN" })
      .then(() => projectDialog.close())
      .catch((cause: unknown) => {
        projectDialogStatus.textContent = cause instanceof Error
          ? cause.message
          : "The Project could not be opened.";
      })
      .finally(() => {
        projectDialogOpen.disabled = false;
        projectDialogNew.disabled = false;
      });
  } catch (cause) {
    projectDialogStatus.textContent = cause instanceof Error
      ? cause.message
      : "The Project ID is invalid.";
  }
});
projectDialogNew.addEventListener("click", () => {
  projectDialogOpen.disabled = true;
  projectDialogNew.disabled = true;
  projectDialogStatus.textContent = "Reserving a fresh Project ID…";
  void createFreshWorkspaceProjectId()
    .then((projectId) => {
      projectDialogId.value = projectId;
      projectDialogStatus.textContent = `Creating blank Project ${projectId}…`;
      return resetProject({ projectIdOverride: projectId, mode: "NEW" });
    })
    .then(() => projectDialog.close())
    .catch((cause: unknown) => {
      projectDialogStatus.textContent = cause instanceof Error
        ? cause.message
        : "The blank Project could not be created.";
    })
    .finally(() => {
      projectDialogOpen.disabled = false;
      projectDialogNew.disabled = false;
    });
});
openCanvasSettings.addEventListener("click", openCanvasSettingsDialog);
canvasSettingsApply.addEventListener("click", () => {
  const settings = readCanvasProjectSettings();
  canvasSettingsProjectId.value = settings.projectId;
  void resetProject({
    forceCreate: true,
    width: settings.width,
    height: settings.height,
    tileSize: settings.tileSize,
    anchor: settings.anchor,
  })
    .then(() => canvasSettingsDialog.close())
    .catch((cause: unknown) =>
      setStatus(
        cause instanceof Error ? cause.message : "Canvas creation failed.",
        "error",
      )
    );
});
for (const control of [canvasSettingsWidth, canvasSettingsHeight]) {
  control.addEventListener("input", syncCanvasResizePreview);
}
for (const button of canvasResizeAnchorElements) {
  button.addEventListener("click", () => {
    const next = button.dataset.canvasResizeAnchor as
      | CanvasResizeAnchor
      | undefined;
    if (next === undefined) return;
    canvasResizeAnchor = next;
    syncCanvasResizePreview();
  });
}
renderExportFormatCards();
syncExportPanel();
exportName.addEventListener("input", () => {
  renderExportOutputPlan();
});
exportScale.addEventListener("change", () => {
  renderExportOutputPlan();
  renderExportPreview();
});
exportPackageSingle.addEventListener("change", () => {
  if (exportPackageSingle.checked) {
    exportPackageMode = "single";
    syncExportPanel();
  }
});
exportPackageZip.addEventListener("change", () => {
  if (exportPackageZip.checked) {
    exportPackageMode = "zip";
    syncExportPanel();
  }
});
exportExecute.addEventListener("click", () => {
  void exportSelectedToFile();
});
exportToMarket.addEventListener("click", () => {
  void handoffPxdProjectToMarket();
});
document.querySelector<HTMLElement>("#draw2WorkspaceTabExport")
  ?.addEventListener(
    "click",
    () => syncExportPanel(),
  );
markerAddControl.addEventListener("click", addTimelineMarkerFromControls);
linkedCelToggleControl.addEventListener("click", toggleActiveLinkedCel);
drawAudioAdd?.addEventListener("click", addDrawAudioReferenceFromControls);
let drawAudioCatalogRequested = false;
const requestDrawAudioCatalog = (): void => {
  if (drawAudioCatalogRequested) return;
  drawAudioCatalogRequested = true;
  window.dispatchEvent(new CustomEvent("draw2:audio-catalog-request"));
};
drawAudioAssetPicker?.addEventListener("focus", requestDrawAudioCatalog);
drawAudioAssetPicker?.addEventListener("pointerdown", requestDrawAudioCatalog);
window.addEventListener("draw2:audio-catalog-provider-ready", () => {
  if (!drawAudioCatalogRequested) return;
  window.dispatchEvent(new CustomEvent("draw2:audio-catalog-request"));
});
window.addEventListener("draw2:audio-assets-changed", (event) => {
  const detail =
    (event as CustomEvent<{ readonly assets?: readonly unknown[] }>).detail;
  const assets = Array.isArray(detail?.assets) ? detail.assets : [];
  drawAudioCatalogRequested = false;
  drawAudioCatalog = assets.flatMap((candidate): DrawAudioCatalogItem[] => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const value = candidate as Record<string, unknown>;
    if (
      typeof value.audioAssetId !== "string" ||
      typeof value.audioRevisionId !== "string" ||
      (value.kind !== "BGM" && value.kind !== "SE") ||
      typeof value.label !== "string"
    ) return [];
    return [{
      audioAssetId: value.audioAssetId,
      audioRevisionId: value.audioRevisionId,
      kind: value.kind,
      label: value.label,
    }];
  });
  let referencesUpdated = false;
  for (const reference of drawAudioReferences.list()) {
    const latest = drawAudioCatalog.find((item) =>
      item.audioAssetId === reference.audioAssetId
    );
    if (
      latest === undefined ||
      (latest.audioRevisionId === reference.audioRevisionId &&
        latest.label === reference.label)
    ) continue;
    drawAudioReferences.upsert({
      ...reference,
      audioRevisionId: latest.audioRevisionId,
      kind: latest.kind,
      label: latest.label,
    }, state.frames.length);
    referencesUpdated = true;
  }
  if (referencesUpdated) {
    queueDrawPersistenceSave("draw-audio-reference-refresh");
    renderTimeline();
  }
  renderDrawAudioReferences();
});
importPxdControl.addEventListener("change", () => {
  const file = importPxdControl.files?.[0];
  if (file !== undefined) void importPxdFile(file);
});
layerPanelAddElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:layer:panel:${
      structureClientSequence + 1
    }`,
    name: `Layer ${state.layers.length + 1}`,
  });
});
layerPanelAddTilemapElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:tilemap-layer:${
      structureClientSequence + 1
    }`,
    name: `Tilemap ${
      state.layers.filter((layer) => layer.kind === "TILEMAP").length + 1
    }`,
    kind: "TILEMAP",
  });
});
layerPanelDuplicateElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.duplicateLayerTrack", {
    sourceLayerTrackId: timelineSession.activeLayerTrackId,
    layerTrackId: `${state.projectId}:layer:duplicate:${
      structureClientSequence + 1
    }`,
    name: `${
      state.layers.find((layer) =>
        layer.layerTrackId === timelineSession.activeLayerTrackId
      )?.name ?? "Layer"
    } Copy`,
  });
});
layerPanelRemoveElement?.addEventListener("click", () => {
  void runTimelineCommand("timeline.removeLayerTrack", {
    layerTrackId: timelineSession.activeLayerTrackId,
  });
});
addFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.addFrame", {
    frameId: `${state.projectId}:frame:ui:${structureClientSequence + 1}`,
    durationMs: 100,
  });
});
duplicateFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.duplicateFrame", {
    sourceFrameId: timelineSession.activeFrameId,
    frameId: `${state.projectId}:frame:duplicate:ui:${
      structureClientSequence + 1
    }`,
  });
});
removeFrameControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.removeFrame", {
    frameId: timelineSession.activeFrameId,
  });
});
addLayerControl.addEventListener("click", () => {
  void runTimelineCommand("timeline.addLayerTrack", {
    layerTrackId: `${state.projectId}:layer:ui:${structureClientSequence + 1}`,
    name: `Layer ${state.layers.length + 1}`,
  });
});
reorderLayerControl.addEventListener("click", () => {
  const currentIndex = state.timeline.layerTrackOrder.indexOf(
    timelineSession.activeLayerTrackId,
  );
  if (currentIndex <= 0) {
    setStatus("Layer Track is already at the top.", "error");
    return;
  }
  void runTimelineCommand("timeline.reorderLayerTrack", {
    layerTrackId: timelineSession.activeLayerTrackId,
    targetIndex: currentIndex - 1,
  });
});
toggleLayerControl.addEventListener("click", () => {
  const current = state.layers.find((item) =>
    item.layerTrackId === timelineSession.activeLayerTrackId
  );
  if (current === undefined) {
    setStatus("Active Layer Track is missing.", "error");
    return;
  }
  void runTimelineCommand("timeline.setLayerVisibility", {
    layerTrackId: current.layerTrackId,
    visible: !current.visible,
  });
});
toggleOnionControl.addEventListener("click", () => {
  onionSkinEnabled = !onionSkinEnabled;
  onionOptions.open = onionSkinEnabled;
  positionOnionOptionsPopover();
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(
    `Onion Skin ${
      onionSkinEnabled ? "enabled" : "disabled"
    } as a Renderer Projection; previous=${onionSkinPreviousFrames} next=${onionSkinNextFrames}; Canonical Raster unchanged.`,
  );
});
onionPrevious.addEventListener("input", () => {
  onionSkinPreviousFrames = Math.max(
    0,
    Math.min(4, Math.round(Number(onionPrevious.value) || 0)),
  );
  onionPreviousValue.value = String(onionSkinPreviousFrames);
  onionSkinCache = undefined;
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionNext.addEventListener("input", () => {
  onionSkinNextFrames = Math.max(
    0,
    Math.min(4, Math.round(Number(onionNext.value) || 0)),
  );
  onionNextValue.value = String(onionSkinNextFrames);
  onionSkinCache = undefined;
  renderTimeline();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionOpacity.addEventListener("input", () => {
  onionSkinOpacity = Math.max(
    0.1,
    Math.min(1, Number(onionOpacity.value) || 0.5),
  );
  onionOpacityValue.value = `${Math.round(onionSkinOpacity * 100)}%`;
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
onionColorMode.addEventListener("change", () => {
  onionSkinColorMode = onionColorMode.value === "ORIGINAL"
    ? "ORIGINAL"
    : "TINTED";
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(
    `Onion Skin color mode: ${
      onionSkinColorMode === "ORIGINAL" ? "original colors" : "tinted order"
    }; Canonical Raster unchanged.`,
  );
});
togglePlaybackControl.addEventListener("click", (event) => {
  event.preventDefault();
  if (playbackRunning) stopTimelinePlayback("Timeline playback paused.");
  else startTimelinePlayback();
});
window.addEventListener("draw2:draw-playback-request", (event) => {
  const detail = (event as CustomEvent<{ readonly playing?: boolean }>).detail;
  const requested = typeof detail?.playing === "boolean"
    ? detail.playing
    : !playbackRunning;
  if (requested === playbackRunning) return;
  if (requested) startTimelinePlayback();
  else stopTimelinePlayback("Timeline playback paused.");
});
playbackLoopControl.addEventListener("click", cyclePlaybackLoopMode);
playbackFpsControl.addEventListener("change", () => {
  playbackFpsCustomControl.hidden = playbackFpsControl.value !== "custom";
  renderTimeline();
  if (playbackRunning) {
    stopTimelinePlayback("Playback rate changed.");
    startTimelinePlayback();
  }
  scheduleDraw2EditorPreferencesSave();
});
playbackFpsCustomControl.addEventListener("change", () => {
  playbackFpsCustomControl.value = String(Math.round(playbackFpsValue()));
  renderTimeline();
  if (playbackRunning) {
    stopTimelinePlayback("Playback rate changed.");
    startTimelinePlayback();
  }
  scheduleDraw2EditorPreferencesSave();
});
for (const tab of timelineTabs) {
  tab.addEventListener("click", () => {
    const next = tab.dataset.draw2TimelineTab as TimelineTab | undefined;
    if (next === undefined) return;
    setTimelineTab(next);
    renderCreatorTimelineMetadata();
  });
  tab.addEventListener("keydown", (event) => {
    if (
      !(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(
        event.key,
      )
    ) return;
    event.preventDefault();
    const currentIndex = timelineTabs.indexOf(tab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
      ? timelineTabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) +
        timelineTabs.length) % timelineTabs.length;
    timelineTabs[nextIndex]?.focus();
    timelineTabs[nextIndex]?.click();
  });
}
timelinePropertiesCollapse.addEventListener("click", () => {
  timelinePropertiesCollapsed = !timelinePropertiesCollapsed;
  applyTimelinePropertiesLayout();
  saveTimelinePropertiesPreference();
});
{
  let pointerId: number | undefined;
  let startX = 0;
  let startWidth = timelinePropertiesWidth;
  const clampPropertiesWidth = (value: number): number =>
    Math.max(200, Math.min(320, value));
  timelinePropertiesResize.addEventListener("pointerdown", (event) => {
    if (
      window.matchMedia("(max-width: 700px)").matches ||
      timelinePropertiesCollapsed
    ) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = timelinePropertiesWidth;
    timelinePropertiesResize.setPointerCapture(event.pointerId);
    timelinePropertiesResize.classList.add("is-resizing");
    event.preventDefault();
  });
  timelinePropertiesResize.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    timelinePropertiesWidth = clampPropertiesWidth(
      startWidth + startX - event.clientX,
    );
    applyTimelinePropertiesLayout();
  });
  const finishPropertiesResize = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    pointerId = undefined;
    timelinePropertiesResize.classList.remove("is-resizing");
    if (timelinePropertiesResize.hasPointerCapture(event.pointerId)) {
      timelinePropertiesResize.releasePointerCapture(event.pointerId);
    }
    saveTimelinePropertiesPreference();
  };
  timelinePropertiesResize.addEventListener(
    "pointerup",
    finishPropertiesResize,
  );
  timelinePropertiesResize.addEventListener(
    "pointercancel",
    finishPropertiesResize,
  );
  timelinePropertiesResize.addEventListener("lostpointercapture", () => {
    pointerId = undefined;
    timelinePropertiesResize.classList.remove("is-resizing");
  });
  timelinePropertiesResize.addEventListener("dblclick", (event) => {
    event.preventDefault();
    timelinePropertiesWidth = 240;
    applyTimelinePropertiesLayout();
    saveTimelinePropertiesPreference();
  });
}
for (
  const actionButton of timelineContext.querySelectorAll<HTMLButtonElement>(
    "[data-timeline-context]",
  )
) {
  actionButton.addEventListener("click", () => {
    void runTimelineContextAction(
      actionButton.dataset.timelineContext ?? "properties",
    );
  });
}
for (
  const actionButton of document.querySelectorAll<HTMLButtonElement>(
    "[data-timeline-more-action]",
  )
) {
  actionButton.addEventListener("click", () => {
    const action = actionButton.dataset.timelineMoreAction;
    if (action === "duplicate-frame") duplicateFrameControl.click();
    else if (action === "remove-frame") removeFrameControl.click();
    else if (action === "add-layer") addLayerControl.click();
    else if (action === "toggle-layer") toggleLayerControl.click();
  });
}
document.addEventListener("pointerdown", (event) => {
  if (
    !timelineContext.hidden && !timelineContext.contains(event.target as Node)
  ) closeTimelineContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTimelineContextMenu();
});
timelineViewport.addEventListener("scroll", () => {
  const scrollTop = timelineViewport.scrollTop;
  const scrollLeft = timelineViewport.scrollLeft;
  if (
    scrollTop === lastRenderedTimelineScrollTop &&
    scrollLeft === lastRenderedTimelineScrollLeft
  ) return;
  timelineSession = {
    ...timelineSession,
    scrollTop,
    scrollLeft,
  };
  if (timelineScrollRenderFrame !== undefined) return;
  timelineScrollRenderFrame = window.requestAnimationFrame(() => {
    timelineScrollRenderFrame = undefined;
    if (
      timelineViewport.scrollTop === lastRenderedTimelineScrollTop &&
      timelineViewport.scrollLeft === lastRenderedTimelineScrollLeft
    ) return;
    renderTimeline();
  });
});
selectionModeControl.addEventListener("change", () => {
  selectionEditMode = selectionModeControl.value as SelectionEditMode;
  setStatus(
    `Selection mode ${
      selectionModeLabel(selectionEditMode)
    } · Shift=add · Alt=subtract · Shift+Alt=intersect · Alt+drag=duplicate`,
  );
});
commitSelectionControl.addEventListener("click", commitSelectionDraft);
cancelSelectionControl.addEventListener("click", () => cancelSelectionDraft());
selectButton.addEventListener("click", () => {
  if (transformCommitInFlight) return;
  try {
    const next = createRectangleSelectionSnapshot(
      state,
      currentSelectionBounds(),
      `selection-${state.projectId}-${Date.now()}`,
      (selection?.mask.selectionVersion ?? 0) + 1,
    );
    beginSelectionFromPoints(
      next.pixels,
      "rectangle",
      selectionEditMode,
      "Rectangle selection created.",
    );
  } catch (cause) {
    setStatus(
      cause instanceof Error ? cause.message : "Selection failed.",
      "error",
    );
  }
});

previewButton.addEventListener("click", () => {
  if (transformCommitInFlight) return;
  if (selectionDraft !== undefined || pendingSelectionGesture !== undefined) {
    setStatus(
      "Confirm or cancel the selection draft before Transform Preview.",
      "error",
    );
    return;
  }
  if (selection === undefined) {
    setStatus("Create a selection before Transform Preview.", "error");
    return;
  }
  try {
    selectionInteractionGeneration += 1;
    transformSession = createTransformSession(
      selection,
      currentTransform(),
      `transform-${state.projectId}-${selection.mask.selectionVersion}`,
    );
    transformPreview = previewTransform(selection, transformSession);
    pasteMode = false;
    syncWorkspaceEditCommandState();
    updateSelectionStatus(
      `scope=${selection.scope.celId} · ${selection.pixels.length}px · preview=${transformSession.transform.operation} · canonicalDirtyTiles=0`,
    );
    setStatus(
      "Transform Preview only; Canonical Raster and Journal unchanged.",
    );
    markPreviewMetrics();
    drawOverlay();
  } catch (cause) {
    setStatus(
      cause instanceof Error ? cause.message : "Transform Preview failed.",
      "error",
    );
  }
});

function previewSelectionOperation(
  operation: TransformDescriptor["operation"],
  factor = 1,
): void {
  if (transformCommitInFlight) return;
  if (selection === undefined) {
    setStatus("Create a selection before Transform Preview.", "error");
    return;
  }
  transformOperation.value = operation;
  transformDx.value = "0";
  transformDy.value = "0";
  transformFactor.value = String(factor);
  transformAngle.value = "0";
  previewButton?.click();
}

scaleDownButton.addEventListener(
  "click",
  () => previewSelectionOperation("SCALE_NEAREST", 0.5),
);
scaleUpButton.addEventListener(
  "click",
  () => previewSelectionOperation("SCALE_NEAREST", 2),
);
flipHorizontalButton.addEventListener(
  "click",
  () => previewSelectionOperation("FLIP_HORIZONTAL"),
);
flipVerticalButton.addEventListener(
  "click",
  () => previewSelectionOperation("FLIP_VERTICAL"),
);
rotateCCWButton.addEventListener(
  "click",
  () => previewSelectionOperation("ROTATE_90_CCW"),
);
rotateCWButton.addEventListener(
  "click",
  () => previewSelectionOperation("ROTATE_90_CW"),
);
rotate180Button.addEventListener(
  "click",
  () => previewSelectionOperation("ROTATE_180"),
);

async function commitActiveTransform(): Promise<boolean> {
  if (transformCommitInFlight) return false;
  if (transformSession === undefined) {
    setStatus("Start a Transform or Paste Preview before Commit.", "error");
    return false;
  }
  transformCommitInFlight = true;
  syncWorkspaceEditCommandState();
  try {
    return await commitActiveTransformOnce();
  } finally {
    transformCommitInFlight = false;
    syncWorkspaceEditCommandState();
  }
}

async function commitActiveTransformOnce(): Promise<boolean> {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  if (transformSession === undefined) {
    setStatus("Start a Transform or Paste Preview before Commit.", "error");
    return false;
  }
  const sourceSelection = selection;
  const previewPixels = transformPreview?.pixels ?? [];
  const before = state;
  const isClipboardPaste = pasteMode && clipboard !== undefined;
  const commandActorId = isClipboardPaste
    ? SELECTION_CLIENT_ID
    : activeDrawActorId();
  const commandClientId = isClipboardPaste
    ? SELECTION_CLIENT_ID
    : activeDrawClientId();
  const commandSequence = nextClientSequence(commandClientId);
  const commandId = selectionCommandId(
    pasteMode ? "paste" : "transform",
    state.projectId,
    commandSequence,
  );
  if (!isClipboardPaste && sourceSelection !== undefined) {
    const activeAsset = state.assets[state.activeAssetId];
    const destinationCount = activeAsset === undefined
      ? 0
      : previewPixels.filter((pixel) =>
        pixel.x >= 0 && pixel.y >= 0 && pixel.x < activeAsset.width &&
        pixel.y < activeAsset.height
      ).length;
    const transformPayload = createSelectionTransformWirePayload(
      sourceSelection,
      transformSession.transform,
      destinationCount,
      previewPixels.some((pixel) => {
        if (activeAsset === undefined) return true;
        return pixel.x < 0 || pixel.y < 0 || pixel.x >= activeAsset.width ||
          pixel.y >= activeAsset.height;
      }) && transformSession.transform.outOfBoundsPolicy === "CLIP",
    );
    if (rejectOversizedProductionPayload(transformPayload)) {
      syncClientSequencesFromState();
      return false;
    }
  }
  const interactionGeneration = selectionInteractionGeneration;
  const canonicalGeneration = canonicalStateGeneration;
  const result = pasteMode && clipboard !== undefined
    ? await pasteClipboard(state, {
      commandType: "clipboard.paste",
      commandId,
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: state.activeAssetId,
      actorId: commandActorId,
      clientId: commandClientId,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: { clipboard, session: transformSession },
    })
    : selection === undefined
    ? undefined
    : await commitTransform(state, {
      commandType: "selection.transformCommit",
      commandId,
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: state.activeAssetId,
      actorId: commandActorId,
      clientId: commandClientId,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: { selection, session: transformSession },
    });
  if (
    interactionGeneration !== selectionInteractionGeneration ||
    canonicalGeneration !== canonicalStateGeneration
  ) {
    // A timeline/tool/clipboard action cancelled this session while the
    // command was being prepared. Never let the late result overwrite the
    // newer state or resurrect the old preview.
    return false;
  }
  if (result === undefined || !result.ok) {
    const diagnostics = result === undefined ? [] : result.diagnostics;
    const staleSelection = diagnostics.some((item) =>
      item.code.startsWith("STALE_SELECTION") ||
      item.code === "TRANSFORM_COMMAND_SCOPE_INVALID" ||
      item.code === "SELECTION_CEL_SCOPE_INVALID"
    );
    if (result === undefined || staleSelection) {
      clearCommittedSelection(
        "Transform preview cleared because its selection is no longer current.",
      );
    } else {
      // A failed placement must never leave a preview that can be committed
      // later with a stale session. The clipboard itself remains available.
      cancelUncommittedSelectionWork();
    }
    syncClientSequencesFromState();
    setStatus(
      result === undefined
        ? "Transform selection is missing."
        : result.diagnostics.map((item) => item.code).join(", "),
      "error",
    );
    return false;
  }
  if (!result.result.noOp) adoptCanonicalState(result.state);
  syncClientSequencesFromState();
  if (sourceSelection !== undefined && previewPixels.length > 0) {
    const activeAsset = state.assets[state.activeAssetId];
    const destinationPoints = activeAsset === undefined ? [] : previewPixels
      .filter((pixel) =>
        pixel.x >= 0 && pixel.y >= 0 && pixel.x < activeAsset.width &&
        pixel.y < activeAsset.height
      )
      .map((pixel) => ({ x: pixel.x, y: pixel.y }));
    selection = selectionSnapshotFromPoints(
      destinationPoints,
      sourceSelection.mask.kind,
    );
    const region = selection?.mask.regions[0];
    if (region !== undefined) {
      selectionX.value = String(region.x);
      selectionY.value = String(region.y);
      selectionWidth.value = String(region.width);
      selectionHeight.value = String(region.height);
    }
  } else {
    selection = undefined;
  }
  refreshSelectionSnapshotForCurrentRaster();
  if (!result.result.noOp) {
    history.record(
      before,
      state,
      result.result.operation.operationId,
      result.result.operation.operationType,
    );
    renderTimeline();
    saveDrawProjectState();
  }
  await autosave.record(state, result.result);
  if (!result.result.noOp && !isClipboardPaste) {
    publishDrawRasterCommit(result.result, state, before.structureEpoch);
  }
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  selectionFrameDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  syncWorkspaceEditCommandState();
  notifyAssetStateChanged();
  await present(result.result.dirtyRegions, result.result.dirtyTiles);
  updateSelectionStatus(
    selection === undefined
      ? `scope=${state.activeCelId} · selection=none · undo=${history.undoDepth} · redo=${history.redoDepth}`
      : `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${selection.mask.kind} · moved/ transformed · undo=${history.undoDepth} · redo=${history.redoDepth}`,
  );
  updateHistoryButtons();
  setStatus(
    `${result.result.operation.operationType} committed as one local operation · ${
      selection === undefined ? "selection cleared" : "selection kept active"
    } · dirtyTiles=${result.result.dirtyTiles.length} · COW=${result.result.cowSplitCount}`,
  );
  return true;
}

commitButton.addEventListener("click", () => {
  void commitActiveTransform();
});

cancelButton.addEventListener("click", () => {
  if (
    cancelUncommittedSelectionWork(
      "Transform Preview cancelled; Canonical Raster unchanged.",
    )
  ) return;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  syncWorkspaceEditCommandState();
  drawOverlay();
  updateSelectionStatus(
    selection === undefined
      ? `scope=${state.activeCelId} · selection=none`
      : `scope=${selection.scope.celId} · ${selection.pixels.length}px · preview=cancelled`,
  );
  setStatus("Transform Preview cancelled; Canonical Raster unchanged.");
});

copyButton.addEventListener("click", () => {
  if (transformCommitInFlight) return;
  cancelUncommittedSelectionWork();
  if (selection === undefined) {
    setStatus("Create a selection before Copy.", "error");
    return;
  }
  if (!selectionScopeMatchesActiveCel()) {
    clearCommittedSelection(
      "Copy blocked because the selection belongs to another timeline cel.",
    );
    return;
  }
  clipboard = createClipboardPayload(
    state,
    selection,
    "draw2-internal-selection",
  );
  syncWorkspaceEditCommandState();
  updateSelectionStatus(
    `scope=${selection.scope.celId} · clipboard=${clipboard.pixels.length}px · palette=internal`,
  );
  setStatus("Internal Clipboard copied locally; Canonical Raster unchanged.");
});

cutButton.addEventListener("click", () => {
  if (transformCommitInFlight) return;
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  void (async () => {
    // Cut is mutually exclusive with every uncommitted transform/paste
    // projection. Otherwise the cut can commit while the old paste remains
    // visible and a later outside-click tries to commit that stale session.
    cancelUncommittedSelectionWork();
    if (selection === undefined) {
      setStatus("Create a selection before Cut.", "error");
      return;
    }
    if (!selectionScopeMatchesActiveCel()) {
      clearCommittedSelection(
        "Cut blocked because the selection belongs to another timeline cel.",
      );
      return;
    }
    clipboard = createClipboardPayload(
      state,
      selection,
      "draw2-internal-selection",
    );
    const before = state;
    const commandSequence = nextClientSequence(SELECTION_CLIENT_ID);
    const commandId = selectionCommandId(
      "cut",
      state.projectId,
      commandSequence,
    );
    const interactionGeneration = selectionInteractionGeneration;
    const canonicalGeneration = canonicalStateGeneration;
    const result = await cutClipboard(state, {
      commandType: "clipboard.cut",
      commandId,
      schemaVersion: 1,
      projectId: state.projectId,
      assetId: state.activeAssetId,
      actorId: SELECTION_CLIENT_ID,
      clientId: SELECTION_CLIENT_ID,
      clientSequence: commandSequence,
      baseStructureEpoch: state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: { clipboard, selection },
    });
    if (
      interactionGeneration !== selectionInteractionGeneration ||
      canonicalGeneration !== canonicalStateGeneration
    ) return;
    if (!result.ok) {
      syncClientSequencesFromState();
      setStatus(
        result.diagnostics.map((item) => item.code).join(", "),
        "error",
      );
      return;
    }
    syncClientSequencesFromState();
    if (!result.result.noOp) {
      adoptCanonicalState(result.state);
      refreshSelectionSnapshotForCurrentRaster();
      history.record(
        before,
        state,
        result.result.operation.operationId,
        result.result.operation.operationType,
      );
      renderTimeline();
      saveDrawProjectState();
    }
    await autosave.record(state, result.result);
    selection = undefined;
    selectionDraft = undefined;
    pendingSelectionGesture = undefined;
    selectionFrameDrag = undefined;
    selectionDrag = undefined;
    transformSession = undefined;
    transformPreview = undefined;
    pasteMode = false;
    updateSelectionActionButtons();
    updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
    notifyAssetStateChanged();
    await present(result.result.dirtyRegions, result.result.dirtyTiles);
    drawOverlay();
    updateHistoryButtons();
    setStatus("clipboard.cut committed as one local operation.");
  })();
});

pasteButton.addEventListener("click", () => {
  if (transformCommitInFlight) return;
  // Starting a new paste cancels an older transform/paste projection first.
  // Clipboard contents stay intact so the user can place them again.
  cancelUncommittedSelectionWork();
  if (clipboard === undefined) {
    setStatus("Copy or Cut a selection before Paste.", "error");
    return;
  }
  const targetPalette = state.assets[state.activeAssetId]?.palette ?? [0];
  const compatibility = assessClipboardPalette(clipboard, targetPalette);
  if (compatibility.result !== "EXACT_PALETTE_MATCH") {
    setStatus(`Paste blocked: ${compatibility.result}`, "error");
    return;
  }
  transformSession = createClipboardPasteSession(
    state,
    clipboard,
    currentTransform(),
    `paste-${state.projectId}-${selectionClientSequence + 1}`,
  );
  transformPreview = {
    ...previewClipboardPaste(state, clipboard, transformSession),
    overlayRegions: [transformSession.destinationBounds],
  };
  pasteMode = true;
  syncWorkspaceEditCommandState();
  updateSelectionStatus(
    `clipboard=${clipboard.pixels.length}px · palette=${compatibility.result} · placement preview · canonicalDirtyTiles=0`,
  );
  setStatus(
    "Paste placement Preview only; press Commit to apply one operation.",
  );
  markPreviewMetrics();
  drawOverlay();
});

undoControl.addEventListener("click", async () => {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  if (transformCommitInFlight) {
    setStatus("Transform commit is still in progress; Undo is temporarily locked.", "error");
    return;
  }
  if (
    cancelUncommittedSelectionWork(
      "Active selection preview cancelled; press Undo again to undo history.",
    )
  ) return;
  const result = history.undo();
  if (result === undefined) {
    setStatus("Nothing to undo.", "error");
    return;
  }
  adoptCanonicalState(result.state);
  syncClientSequencesFromState();
  saveDrawProjectState();
  selection = undefined;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  selectionFrameDrag = undefined;
  selectionDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  normalizeTimelineSession();
  notifyAssetStateChanged();
  await present();
  const undoAsset = state.assets[state.activeAssetId];
  if (
    undoAsset !== undefined &&
    selectedColor >= undoAsset.palette.length
  ) {
    selectedColor = Math.max(0, undoAsset.palette.length - 1);
  }
  renderPaletteButtons(undoAsset?.palette ?? []);
  syncColorEditorFromSelection();
  renderTimeline();
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
  drawOverlay();
  updateHistoryButtons();
  setStatus(
    `Undo restored ${result.operationId} locally; no Realtime operation sent.`,
  );
});

redoControl.addEventListener("click", async () => {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return;
  }
  if (transformCommitInFlight) {
    setStatus("Transform commit is still in progress; Redo is temporarily locked.", "error");
    return;
  }
  if (
    cancelUncommittedSelectionWork(
      "Active selection preview cancelled; press Redo again to redo history.",
    )
  ) return;
  const result = history.redo();
  if (result === undefined) {
    setStatus("Nothing to redo.", "error");
    return;
  }
  adoptCanonicalState(result.state);
  syncClientSequencesFromState();
  saveDrawProjectState();
  selection = undefined;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  selectionFrameDrag = undefined;
  selectionDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  normalizeTimelineSession();
  notifyAssetStateChanged();
  await present();
  const redoAsset = state.assets[state.activeAssetId];
  if (
    redoAsset !== undefined &&
    selectedColor >= redoAsset.palette.length
  ) {
    selectedColor = Math.max(0, redoAsset.palette.length - 1);
  }
  renderPaletteButtons(redoAsset?.palette ?? []);
  syncColorEditorFromSelection();
  renderTimeline();
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
  drawOverlay();
  updateHistoryButtons();
  setStatus(
    `Redo restored ${result.operationId} locally; no Realtime operation sent.`,
  );
});

let drawInteraction: Draw2InteractionKernel | undefined;
let overlayDrawFrame: number | undefined;
let overlayDrawFrameKind: "raf" | "timeout" | undefined;

interface PendingDrawPreview {
  readonly sessionId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly structureEpoch: number;
  readonly selectionGeneration: number;
  readonly tool: BasicTool;
  readonly points: readonly { x: number; y: number }[];
  readonly writes: readonly ColoredPixel[];
}

/**
 * A pointerup ends the transient session before the async canonical command
 * finishes. Keep its final projection alive so a slow commit cannot make a
 * valid stroke appear to disappear between pointerup and present().
 */
let pendingDrawPreviews: PendingDrawPreview[] = [];

function projectPendingPreviewWrites(
  asset: RasterAsset,
  tool: BasicTool,
  writes: readonly ColoredPixel[],
): readonly ColoredPixel[] {
  if (selection !== undefined && !selectionScopeMatchesActiveCel()) return [];
  const mirrored = mirrorWritesForTool(writes, asset, tool);
  const clip = activeRectangleSelectionClip();
  const selectionKeys = clip === undefined && selection !== undefined
    ? new Set(selection.pixels.map(selectionPointKey))
    : undefined;
  if (clip !== undefined) {
    return mirrored.filter((write) =>
      write.x >= clip.x && write.y >= clip.y &&
      write.x < clip.x + clip.width && write.y < clip.y + clip.height
    );
  }
  if (selectionKeys !== undefined) {
    return mirrored.filter((write) =>
      selectionKeys.has(selectionPointKey(write))
    );
  }
  return mirrored;
}

function queuePendingDrawPreview(
  commit: ToolSessionCommit,
  snapshot: ToolSessionSnapshot,
): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || snapshot.points.length === 0) return;
  const first = snapshot.points[0]!;
  const last = snapshot.points.at(-1) ?? first;
  const writes = snapshot.previewWrites.length > 0
    ? projectPendingPreviewWrites(asset, commit.tool, snapshot.previewWrites)
    : commit.tool === "fill"
    ? fillPreviewWrites(asset, first, last, commit.colorIndex)
    : [];
  pendingDrawPreviews.push({
    sessionId: snapshot.sessionId,
    projectId: state.projectId,
    assetId: asset.id,
    layerId: state.activeLayerId,
    frameId: state.activeFrameId,
    celId: state.activeCelId,
    structureEpoch: state.structureEpoch,
    selectionGeneration: selectionInteractionGeneration,
    tool: commit.tool,
    points: [...snapshot.points],
    writes: [...writes],
  });
}

function removePendingDrawPreview(sessionId: string): void {
  const next = pendingDrawPreviews.filter((preview) =>
    preview.sessionId !== sessionId
  );
  if (next.length === pendingDrawPreviews.length) return;
  pendingDrawPreviews = next;
  flushDrawOverlay();
}

function pendingDrawPreviewMatchesCurrent(
  preview: PendingDrawPreview,
  asset: RasterAsset,
): boolean {
  return preview.projectId === state.projectId &&
    preview.assetId === asset.id &&
    preview.layerId === state.activeLayerId &&
    preview.frameId === state.activeFrameId &&
    preview.celId === state.activeCelId &&
    preview.structureEpoch === state.structureEpoch &&
    preview.selectionGeneration === selectionInteractionGeneration;
}

function drawPendingDrawPreviews(asset: RasterAsset): void {
  for (const preview of pendingDrawPreviews) {
    if (!pendingDrawPreviewMatchesCurrent(preview, asset)) continue;
    try {
      if (preview.tool === "eraser") {
        drawErasePreviewWrites(asset, preview.writes);
      } else if (preview.writes.length > 0) {
        drawTransformPreviewPixels(asset, preview.writes);
      }
    } catch {
      // A stale or bounded pending projection must never block canonical draw.
    }
  }
}

function sameTilemapCell(
  left: Draw2TilemapCell | undefined,
  right: Draw2TilemapCell | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.sourceAssetId === right.sourceAssetId &&
    left.sourceX === right.sourceX && left.sourceY === right.sourceY &&
    left.transform === right.transform;
}

let tilemapPointerGesture: {
  readonly pointerId: number;
  readonly mapId: string;
  readonly before: ProjectState;
  canonicalGeneration: number;
  mapRevision: number;
  structureEpoch: number;
  stale: boolean;
  readonly erase: boolean;
  lastCellKey: string;
  changed: boolean;
  readonly beforeCells: Map<string, Draw2TilemapCell | undefined>;
  readonly localCells: Map<string, Draw2TilemapCell | undefined>;
} | undefined;
let tilemapPresentFrame: number | undefined;
let viewportPanPointerId: number | undefined;
let viewportPanStart = { x: 0, y: 0, panX: 0, panY: 0 };
const canvasPointers = new Map<number, { x: number; y: number }>();
let touchPanAfterPinch: {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
} | undefined;
let pinchGesture: {
  pointerIds: [number, number];
  distance: number;
  zoom: number;
  sourceX: number;
  sourceY: number;
  lastCenterX: number;
  lastCenterY: number;
} | undefined;

function pointerDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.max(1, Math.hypot(left.x - right.x, left.y - right.y));
}

function pointerCenter(
  left: { x: number; y: number },
  right: { x: number; y: number },
): { x: number; y: number } {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function captureViewportPointer(pointerId: number): void {
  try {
    viewportWrapElement?.setPointerCapture(pointerId);
  } catch {
    // The pointer may have ended between the event and capture transfer.
  }
}

function releaseViewportPointer(pointerId: number): void {
  try {
    if (viewportWrapElement?.hasPointerCapture(pointerId)) {
      viewportWrapElement.releasePointerCapture(pointerId);
    }
  } catch {
    // Capture cleanup is best effort after cancellation or browser handoff.
  }
}

function cancelActiveStroke(): void {
  const pointerId = drawInteraction?.activePointerId;
  if (
    pointerId !== undefined && canvas.hasPointerCapture(pointerId)
  ) canvas.releasePointerCapture(pointerId);
  drawInteraction?.cancel("EXPLICIT_CANCEL");
  drawInteraction = undefined;
  flushDrawOverlay();
}

function selectionToolCanMove(): boolean {
  const tool = currentBasicTool();
  return tool === "select-rect" || tool === "select-ellipse" ||
    tool === "select-lasso" || tool === "select-color" ||
    tool === "move";
}

function pointIsSelectedPixel(
  snapshot: SelectionSnapshot | undefined,
  point: { x: number; y: number },
): boolean {
  if (snapshot === undefined) return false;
  return snapshot.pixels.some((candidate) =>
    candidate.x === point.x && candidate.y === point.y
  );
}

function pointIsInsideSelection(point: { x: number; y: number }): boolean {
  if (selection === undefined) return false;
  return selection.mask.kind === "rectangle"
    ? pointInSelectionBounds(point, selection.mask.regions)
    : pointIsSelectedPixel(selection, point);
}

function pointIsInsideSelectionDraft(point: { x: number; y: number }): boolean {
  if (selectionDraft?.snapshot === undefined) return false;
  return selectionDraft.snapshot.mask.kind === "rectangle"
    ? pointInSelectionBounds(point, selectionDraft.snapshot.mask.regions)
    : pointIsSelectedPixel(selectionDraft.snapshot, point);
}

function cancelSelectionDrag(): void {
  if (
    selectionDrag !== undefined &&
    canvas.hasPointerCapture(selectionDrag.pointerId)
  ) canvas.releasePointerCapture(selectionDrag.pointerId);
  selectionDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(
    selection === undefined
      ? `scope=${state.activeCelId} · selection=none`
      : `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${selection.mask.kind} · preview=cancelled`,
  );
  drawOverlay();
  markCanonicalMetrics();
}

function selectionFrameHandleAxes(handle: SelectionFrameHandle): {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
} {
  return {
    horizontal: handle === "nw" || handle === "w" || handle === "sw"
      ? -1
      : handle === "ne" || handle === "e" || handle === "se"
      ? 1
      : 0,
    vertical: handle === "nw" || handle === "n" || handle === "ne"
      ? -1
      : handle === "sw" || handle === "s" || handle === "se"
      ? 1
      : 0,
  };
}

function selectionFrameTransformForPoint(
  drag: NonNullable<typeof selectionFrameDrag>,
  point: { x: number; y: number },
): { transform: TransformDescriptor; label: string } | undefined {
  if (drag.handle === "rotate") {
    const centerX = drag.sourceBounds.x + (drag.sourceBounds.width - 1) / 2;
    const centerY = drag.sourceBounds.y + (drag.sourceBounds.height - 1) / 2;
    const pointerAngle = Math.atan2(point.y - centerY, point.x - centerX);
    let delta = pointerAngle - drag.lastPointerAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    drag.lastPointerAngle = pointerAngle;
    drag.accumulatedAngle += delta;
    const angleDeg = Math.round(drag.accumulatedAngle * 180 / Math.PI * 10) /
      10;
    if (Math.abs(angleDeg) < 0.1) return undefined;
    return {
      transform: {
        ...currentTransform(),
        operation: "ROTATE_NEAREST",
        dx: 0,
        dy: 0,
        factor: 1,
        angleDeg,
      },
      label: "回転 " + angleDeg + "°",
    };
  }
  const axes = selectionFrameHandleAxes(drag.handle);
  const bounds = drag.sourceBounds;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const requestedWidth = axes.horizontal === 1
    ? Math.max(1, point.x - bounds.x)
    : axes.horizontal === -1
    ? Math.max(1, right - point.x)
    : bounds.width;
  const requestedHeight = axes.vertical === 1
    ? Math.max(1, point.y - bounds.y)
    : axes.vertical === -1
    ? Math.max(1, bottom - point.y)
    : bounds.height;
  const widthRatio = requestedWidth / Math.max(1, bounds.width);
  const heightRatio = requestedHeight / Math.max(1, bounds.height);
  const rawFactor = axes.horizontal !== 0 && axes.vertical !== 0
    ? Math.max(widthRatio, heightRatio)
    : axes.horizontal !== 0
    ? widthRatio
    : heightRatio;
  const factor = Math.max(
    0.125,
    Math.min(8, Math.round(rawFactor * 1000) / 1000),
  );
  const outputWidth = Math.max(1, Math.round(bounds.width * factor));
  const outputHeight = Math.max(1, Math.round(bounds.height * factor));
  const originX = Math.floor((bounds.width - outputWidth) / 2);
  const originY = Math.floor((bounds.height - outputHeight) / 2);
  const baseX = bounds.x + originX;
  const baseY = bounds.y + originY;
  const targetX = axes.horizontal === 1
    ? bounds.x
    : axes.horizontal === -1
    ? right - outputWidth
    : baseX;
  const targetY = axes.vertical === 1
    ? bounds.y
    : axes.vertical === -1
    ? bottom - outputHeight
    : baseY;
  const dx = Math.round(targetX - baseX);
  const dy = Math.round(targetY - baseY);
  return {
    transform: {
      ...currentTransform(),
      operation: "SCALE_NEAREST",
      dx,
      dy,
      factor,
    },
    label: "拡大縮小 " + Math.round(factor * 100) + "% · Δ" + dx + "," + dy,
  };
}

function transformHasEffect(transform: TransformDescriptor): boolean {
  if (transform.operation === "ROTATE_NEAREST") {
    const angle = Number(transform.angleDeg ?? 0);
    const normalizedAngle = ((angle + 180) % 360 + 360) % 360 - 180;
    return transform.dx !== 0 || transform.dy !== 0 ||
      Math.abs(normalizedAngle) > 0.0001;
  }
  return transform.operation !== "MOVE" || transform.dx !== 0 ||
    transform.dy !== 0 || Math.abs(transform.factor - 1) > 0.0001;
}

function beginSelectionFrameDrag(
  event: PointerEvent,
  handle: SelectionFrameHandle,
): boolean {
  if (transformCommitInFlight) return false;
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  const currentSelection = selection;
  const sourceBounds = selectionFrameBounds();
  if (currentSelection === undefined || sourceBounds === undefined) {
    return false;
  }
  if (event.cancelable) event.preventDefault();
  // A manual Transform Preview is replaced by the frame gesture. The source
  // selection remains canonical and is the stable base for the new preview.
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  const startCanvasPoint = canvasPointForClient(event.clientX, event.clientY);
  const centerX = sourceBounds.x + (sourceBounds.width - 1) / 2;
  const centerY = sourceBounds.y + (sourceBounds.height - 1) / 2;
  selectionFrameDrag = {
    pointerId: event.pointerId,
    handle,
    startCanvasPoint,
    sourceBounds,
    lastPointerAngle: Math.atan2(
      startCanvasPoint.y - centerY,
      startCanvasPoint.x - centerX,
    ),
    accumulatedAngle: 0,
    lastTransformKey: "",
  };
  selectionInteractionGeneration += 1;
  canvas.setPointerCapture(event.pointerId);
  syncWorkspaceEditCommandState();
  updateSelectionStatus(
    "scope=" + currentSelection.scope.celId + " · " +
      currentSelection.pixels.length + "px · 枠" +
      (handle === "rotate" ? "回転" : "拡大縮小") + " · preview=only",
  );
  markPreviewMetrics();
  drawOverlay();
  return true;
}

function updateSelectionFrameDragPreview(
  point: { x: number; y: number },
): void {
  const drag = selectionFrameDrag;
  const currentSelection = selection;
  if (drag === undefined || currentSelection === undefined) return;
  const next = selectionFrameTransformForPoint(drag, point);
  if (next === undefined) {
    if (drag.lastTransformKey === "identity") return;
    drag.lastTransformKey = "identity";
    transformSession = undefined;
    transformPreview = undefined;
    transformAngle.value = "0";
    syncWorkspaceEditCommandState();
    updateSelectionStatus(
      "scope=" + currentSelection.scope.celId + " · " +
        currentSelection.pixels.length + "px · 枠回転 0° · preview=only",
    );
    markPreviewMetrics();
    drawOverlay();
    return;
  }
  const transform = next.transform;
  const key = transform.operation + ":" + transform.dx + ":" +
    transform.dy + ":" + transform.factor + ":" +
    (transform.angleDeg ?? 0);
  if (drag.lastTransformKey === key) return;
  drag.lastTransformKey = key;
  transformOperation.value = transform.operation;
  transformDx.value = String(transform.dx);
  transformDy.value = String(transform.dy);
  transformFactor.value = String(transform.factor);
  transformAngle.value = String(transform.angleDeg ?? 0);
  transformSession = createTransformSession(
    currentSelection,
    transform,
    "transform-frame-" + state.projectId + "-" +
      currentSelection.mask.selectionVersion + "-" + key,
  );
  transformPreview = previewTransform(currentSelection, transformSession);
  pasteMode = false;
  syncWorkspaceEditCommandState();
  updateSelectionStatus(
    "scope=" + currentSelection.scope.celId + " · " +
      currentSelection.pixels.length + "px · " + next.label +
      " · preview=only",
  );
  markPreviewMetrics();
  drawOverlay();
}

function cancelSelectionFrameDrag(): void {
  if (
    selectionFrameDrag !== undefined &&
    canvas.hasPointerCapture(selectionFrameDrag.pointerId)
  ) canvas.releasePointerCapture(selectionFrameDrag.pointerId);
  selectionFrameDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(
    selection === undefined
      ? "scope=" + state.activeCelId + " · selection=none"
      : "scope=" + selection.scope.celId + " · " +
        selection.pixels.length + "px · " + selection.mask.kind +
        " · preview=cancelled",
  );
  drawOverlay();
  markCanonicalMetrics();
}

function beginSelectionDrag(
  event: PointerEvent,
  point: { readonly x: number; readonly y: number },
): boolean {
  if (transformCommitInFlight) return false;
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  const currentSelection = selection;
  if (currentSelection === undefined) return false;
  if (event.cancelable) event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const duplicate = event.altKey;
  selectionDrag = {
    pointerId: event.pointerId,
    start: point,
    lastDelta: { x: 0, y: 0 },
    duplicate,
  };
  selectionInteractionGeneration += 1;
  transformOperation.value = "MOVE";
  transformDx.value = "0";
  transformDy.value = "0";
  transformAngle.value = "0";
  const transform = { ...currentTransform(), operation: "MOVE" as const };
  if (duplicate) {
    clipboard = createClipboardPayload(
      state,
      currentSelection,
      "draw2-selection-alt-drag",
    );
    pasteMode = true;
    transformSession = createClipboardPasteSession(
      state,
      clipboard,
      transform,
      `paste-drag-${state.projectId}-${currentSelection.mask.selectionVersion}-0-0`,
    );
    transformPreview = previewClipboardPaste(
      state,
      clipboard,
      transformSession,
    );
  } else {
    pasteMode = false;
    transformSession = createTransformSession(
      currentSelection,
      transform,
      `transform-drag-${state.projectId}-${currentSelection.mask.selectionVersion}-0-0`,
    );
    transformPreview = previewTransform(currentSelection, transformSession);
  }
  syncWorkspaceEditCommandState();
  updateSelectionStatus(
    `scope=${currentSelection.scope.celId} · ${currentSelection.pixels.length}px · ${
      duplicate ? "duplicate" : "move"
    }=0,0 · preview=only`,
  );
  markPreviewMetrics();
  drawOverlay();
  return true;
}

function cancelTilemapPointerGestureForPinch(): void {
  const gesture = tilemapPointerGesture;
  if (gesture === undefined) return;
  const isCurrent = !gesture.stale &&
    canonicalStateGeneration === gesture.canonicalGeneration &&
    state.structureEpoch === gesture.structureEpoch &&
    state.tilemaps?.[gesture.mapId]?.revision === gesture.mapRevision;
  if (isCurrent) {
    adoptCanonicalState(gesture.before);
  } else if (rollbackStaleTilemapGesture(gesture)) {
    saveDrawProjectState("tilemap-cancel");
    notifyAssetStateChanged();
  }
  tilemapPointerGesture = undefined;
  scheduleTilemapPresent();
}

function rollbackStaleTilemapGesture(
  gesture: NonNullable<typeof tilemapPointerGesture>,
): boolean {
  const map = state.tilemaps?.[gesture.mapId];
  if (map === undefined) return false;
  let nextMap = map;
  for (const [key, beforeCell] of gesture.beforeCells) {
    // If another canonical operation changed the same cell after this
    // gesture, leave that newer value untouched. This is the tilemap
    // equivalent of rebasing a local edit over a later remote edit.
    if (!sameTilemapCell(map.cells[key], gesture.localCells.get(key))) continue;
    const [xText, yText] = key.split(":");
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
    nextMap = beforeCell === undefined
      ? clearDraw2TilemapCell(nextMap, x, y)
      : setDraw2TilemapCell(nextMap, x, y, beforeCell);
  }
  if (nextMap === map) return false;
  adoptCanonicalState({
    ...state,
    tilemaps: { ...(state.tilemaps ?? {}), [map.id]: nextMap },
  });
  return true;
}

function updateSelectionDragPreview(point: { x: number; y: number }): void {
  if (selectionDrag === undefined || selection === undefined) return;
  const dx = point.x - selectionDrag.start.x;
  const dy = point.y - selectionDrag.start.y;
  if (dx === selectionDrag.lastDelta.x && dy === selectionDrag.lastDelta.y) {
    return;
  }
  selectionDrag.lastDelta = { x: dx, y: dy };
  transformOperation.value = "MOVE";
  transformDx.value = String(dx);
  transformDy.value = String(dy);
  transformAngle.value = "0";
  const transform = {
    ...currentTransform(),
    operation: "MOVE" as const,
    dx,
    dy,
  };
  if (selectionDrag.duplicate && clipboard !== undefined) {
    pasteMode = true;
    transformSession = createClipboardPasteSession(
      state,
      clipboard,
      transform,
      `paste-drag-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}`,
    );
    transformPreview = previewClipboardPaste(
      state,
      clipboard,
      transformSession,
    );
  } else {
    pasteMode = false;
    transformSession = createTransformSession(
      selection,
      transform,
      `transform-drag-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}`,
    );
  }
  if (!selectionDrag.duplicate || clipboard === undefined) {
    transformPreview = previewTransform(selection, transformSession);
  }
  updateSelectionStatus(
    `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${
      selectionDrag.duplicate ? "duplicate" : "move"
    }=${dx},${dy} · preview=only`,
  );
  markPreviewMetrics();
  drawOverlay();
}

function beginPendingSelectionGesture(
  event: PointerEvent,
  point: { x: number; y: number },
): void {
  const tool = currentBasicTool();
  if (!selectionToolCanMove()) return;
  const mode = selectionEditModeFromModifiers(
    event.shiftKey,
    event.altKey,
    selectionEditMode,
  );
  pendingSelectionGesture = {
    pointerId: event.pointerId,
    tool,
    mode,
    ...(tool === "select-color"
      ? {
        colorSelectionMode: normalizeColorSelectionMode(
          toolOptions.selectionMode,
        ),
      }
      : {}),
    points: [point],
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelectionActionButtons();
  updateSelectionStatus(
    `draft=${selectionModeLabel(mode)} · drawing ${
      tool === "select-lasso"
        ? "lasso"
        : tool === "select-polygon"
        ? "polygon"
        : "selection"
    } · release to preview`,
  );
  if (event.cancelable) event.preventDefault();
  drawOverlay();
}

function beginGridSelectionGesture(
  event: PointerEvent,
  point: { x: number; y: number },
): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined || currentBasicTool() !== "select-rect") return;
  const mode = selectionEditModeFromModifiers(
    event.shiftKey,
    event.altKey,
    selectionEditMode,
  );
  const anchor = {
    x: Math.floor(point.x / SELECTION_GRID_SIZE) * SELECTION_GRID_SIZE,
    y: Math.floor(point.y / SELECTION_GRID_SIZE) * SELECTION_GRID_SIZE,
  };
  pendingSelectionGesture = {
    pointerId: event.pointerId,
    tool: "select-rect",
    mode,
    points: [anchor],
    grid: { size: SELECTION_GRID_SIZE, anchor },
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelectionActionButtons();
  updateSelectionStatus(
    `draft=${
      selectionModeLabel(mode)
    } · 16px grid · drag to extend · release to preview`,
  );
  if (event.cancelable) event.preventDefault();
  drawOverlay();
}

function isSelectionGridDoubleClick(
  event: PointerEvent,
  point: { x: number; y: number },
): boolean {
  const now = performance.now();
  const previous = lastSelectionClick;
  const nativeDoubleClick = event.detail >= 2;
  const customDoubleClick = previous !== undefined &&
    now - previous.timeMs <= SELECTION_DOUBLE_CLICK_WINDOW_MS &&
    Math.abs(previous.point.x - point.x) <= 1 &&
    Math.abs(previous.point.y - point.y) <= 1;
  lastSelectionClick = nativeDoubleClick || customDoubleClick
    ? undefined
    : { timeMs: now, point: { ...point } };
  return nativeDoubleClick || customDoubleClick;
}

function updatePendingSelectionGesture(point: { x: number; y: number }): void {
  if (pendingSelectionGesture === undefined) return;
  const nextPoint = pendingSelectionGesture.grid === undefined ? point : {
    x: Math.floor(point.x / pendingSelectionGesture.grid.size) *
      pendingSelectionGesture.grid.size,
    y: Math.floor(point.y / pendingSelectionGesture.grid.size) *
      pendingSelectionGesture.grid.size,
  };
  const last =
    pendingSelectionGesture.points[pendingSelectionGesture.points.length - 1];
  if (last?.x === nextPoint.x && last.y === nextPoint.y) return;
  if (pendingSelectionGesture.grid === undefined) {
    lastSelectionClick = undefined;
  }
  pendingSelectionGesture.points.push(nextPoint);
  drawOverlay();
}

async function dismissSelectionFromOutsideClick(): Promise<void> {
  if (selectionDraft !== undefined) {
    selectionDraft = undefined;
    updateSelectionActionButtons();
  }
  if (
    transformSession !== undefined &&
    (transformPreview !== undefined || pasteMode)
  ) {
    const committed = await commitActiveTransform();
    if (!committed) return;
  }
  clearCommittedSelection("Selection cleared by clicking outside.");
}

function hasPendingSelectionInteraction(): boolean {
  return selection !== undefined || selectionDraft !== undefined ||
    pendingSelectionGesture !== undefined || transformSession !== undefined;
}

async function finishPendingSelectionGesture(): Promise<void> {
  const gesture = pendingSelectionGesture;
  if (gesture === undefined) return;
  pendingSelectionGesture = undefined;
  const asset = state.assets[state.activeAssetId];
  const first = gesture.points[0];
  const last = gesture.points[gesture.points.length - 1] ?? first;
  if (asset === undefined || first === undefined || last === undefined) {
    updateSelectionActionButtons();
    drawOverlay();
    return;
  }
  const isClick = gesture.points.every((point) =>
    point.x === first.x && point.y === first.y
  );
  const hasSelectionState = selection !== undefined ||
    selectionDraft !== undefined || transformSession !== undefined;
  const clickInsideSelection = selection !== undefined
    ? pointIsInsideSelection(first)
    : pointIsInsideSelectionDraft(first);
  const clickSelectionTool = gesture.tool === "select-color" ||
    gesture.grid !== undefined;
  if (
    isClick && hasSelectionState && !clickInsideSelection &&
    !clickSelectionTool
  ) {
    updateSelectionActionButtons();
    drawOverlay();
    await dismissSelectionFromOutsideClick();
    return;
  }
  if (gesture.grid !== undefined) {
    const gridEnd = gesture.points.at(-1) ?? gesture.grid.anchor;
    const bounds = snapSelectionBoundsToGrid(
      gesture.grid.anchor,
      gridEnd,
      asset,
      gesture.grid.size,
    );
    beginSelectionFromPoints(
      rectanglePointList(bounds),
      "rectangle",
      gesture.mode,
      "16px grid selection created.",
    );
  } else if (gesture.tool === "select-color") {
    const mode = normalizeColorSelectionMode(gesture.colorSelectionMode);
    const picked = selectConfiguredColor(asset, first, {
      ...toolOptions,
      selectionMode: mode,
    });
    beginSelectionFromPoints(
      picked.pixels,
      mode === "opaque" ? "alpha" : "magic",
      gesture.mode,
      `${colorSelectionModeLabel(mode)} color selection created.`,
    );
  } else if (gesture.tool === "select-lasso") {
    const picked = selectByLasso(asset.raster, gesture.points);
    beginSelectionFromPoints(
      picked.pixels,
      "freehand",
      gesture.mode,
      "Lasso selection created.",
    );
  } else if (gesture.tool === "select-polygon") {
    const picked = polygonSelectionPoints(asset.raster, gesture.points);
    beginSelectionFromPoints(
      picked,
      "freehand",
      gesture.mode,
      `Polygon selection created · ${gesture.points.length} vertices.`,
    );
  } else if (gesture.tool === "select-ellipse") {
    const picked = selectByEllipse(asset.raster, first, last);
    beginSelectionFromPoints(
      picked.pixels,
      "ellipse",
      gesture.mode,
      "Ellipse selection created.",
    );
  } else {
    const bounds = normalizeToolBounds(first, last, asset);
    beginSelectionFromPoints(
      rectanglePointList(bounds),
      "rectangle",
      gesture.mode,
      "Rectangle selection created.",
    );
  }
  // A canvas selection is a local projection, so releasing the gesture makes
  // it immediately usable for the next drag. The explicit Confirm button and
  // Enter shortcut remain available for panel-created drafts.
  commitSelectionDraft();
  updateSelectionActionButtons();
  drawOverlay();
}

function beginViewportPan(event: PointerEvent): void {
  viewportPanPointerId = event.pointerId;
  viewportPanStart = {
    x: event.clientX,
    y: event.clientY,
    panX: viewportPanX,
    panY: viewportPanY,
  };
  canvas.setPointerCapture(event.pointerId);
}

function cancelCanvasGestureForPinch(): void {
  cancelActiveStroke();
  cancelSelectionDrag();
  cancelTilemapPointerGestureForPinch();
  if (pendingSelectionGesture !== undefined) {
    if (canvas.hasPointerCapture(pendingSelectionGesture.pointerId)) {
      canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
    }
    pendingSelectionGesture = undefined;
  }
  mirrorGuideDrag = undefined;
  updateSelectionActionButtons();
  drawOverlay();
}

function startPinchGesture(): void {
  if (pinchGesture !== undefined) return;
  const entries = [...canvasPointers.entries()].slice(0, 2);
  const first = entries[0];
  const second = entries[1];
  if (first === undefined || second === undefined) return;
  cancelCanvasGestureForPinch();
  const center = pointerCenter(first[1], second[1]);
  const sourcePoint = sourcePointForViewportClient(center.x, center.y);
  pinchGesture = {
    pointerIds: [first[0], second[0]],
    distance: pointerDistance(first[1], second[1]),
    zoom: currentViewportDisplayScale(),
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    lastCenterX: center.x,
    lastCenterY: center.y,
  };
  touchPanAfterPinch = undefined;
  viewportPanPointerId = undefined;
  captureViewportPointer(first[0]);
  captureViewportPointer(second[0]);
}

function updatePinchGesture(): void {
  const gesture = pinchGesture;
  if (gesture === undefined) return;
  const left = canvasPointers.get(gesture.pointerIds[0]);
  const right = canvasPointers.get(gesture.pointerIds[1]);
  if (left === undefined || right === undefined) return;
  const center = pointerCenter(left, right);
  gesture.lastCenterX = center.x;
  gesture.lastCenterY = center.y;
  const nextZoom = pinchZoomFromDistance(
    gesture.zoom,
    gesture.distance,
    pointerDistance(left, right),
    visualSettings.zoomSensitivity,
    false,
  );
  zoomViewportAtClient(center.x, center.y, nextZoom, {
    sourcePoint: { x: gesture.sourceX, y: gesture.sourceY },
    snap: false,
  });
}

function finishPinchGesture(): void {
  const gesture = pinchGesture;
  if (gesture === undefined) return;
  const snappedZoom = snapPixelPerfectZoom(currentViewportDisplayScale());
  zoomViewportAtClient(
    gesture.lastCenterX,
    gesture.lastCenterY,
    snappedZoom,
    {
      sourcePoint: { x: gesture.sourceX, y: gesture.sourceY },
      snap: true,
    },
  );
  pinchGesture = undefined;
}

function beginTouchPanAfterPinch(): void {
  const remaining = [...canvasPointers.entries()][0];
  if (remaining === undefined) return;
  touchPanAfterPinch = {
    pointerId: remaining[0],
    startX: remaining[1].x,
    startY: remaining[1].y,
    panX: viewportPanX,
    panY: viewportPanY,
  };
  captureViewportPointer(remaining[0]);
}

function handleViewportTouchPointerEnd(
  event: PointerEvent,
  cancelled: boolean,
): boolean {
  if (event.pointerType !== "touch") return false;
  if (pinchGesture !== undefined) {
    const gesture = pinchGesture;
    if (!gesture.pointerIds.includes(event.pointerId)) return true;
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (!cancelled) updatePinchGesture();
    canvasPointers.delete(event.pointerId);
    const hasRemainingPointer = canvasPointers.size > 0;
    finishPinchGesture();
    releaseViewportPointer(event.pointerId);
    if (hasRemainingPointer) beginTouchPanAfterPinch();
    return true;
  }
  if (touchPanAfterPinch?.pointerId !== event.pointerId) return false;
  canvasPointers.delete(event.pointerId);
  touchPanAfterPinch = undefined;
  releaseViewportPointer(event.pointerId);
  applyViewportTransform();
  return true;
}

function pointerSampleFromEvent(
  event: PointerEvent,
  phase: PointerPhase,
): PointerSample | undefined {
  const point = pointFromPointer(event);
  if (point === undefined) return undefined;
  const pointerType: PointerSample["pointerType"] =
    event.pointerType === "mouse" ||
      event.pointerType === "touch" || event.pointerType === "pen"
      ? event.pointerType
      : "unknown";
  return {
    pointerId: event.pointerId,
    phase,
    pointerType,
    target: "canvas",
    isPrimary: event.isPrimary,
    button: event.button,
    buttons: event.buttons,
    x: point.x,
    y: point.y,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    timeMs: Number.isFinite(event.timeStamp) ? Math.max(0, event.timeStamp) : 0,
  };
}

function addPointerSamples(event: PointerEvent): void {
  if (drawInteraction === undefined) return;
  let sampled: readonly PointerEvent[] | undefined;
  try {
    sampled =
      (event as PointerEvent & {
        getCoalescedEvents?: () => readonly PointerEvent[];
      }).getCoalescedEvents?.();
  } catch {
    sampled = undefined;
  }
  // Some browser/pen implementations expose the method but return an empty
  // array for a frame. The outer pointermove is still the authoritative
  // latest sample and must not be dropped. Some implementations also return
  // a non-empty coalesced array that does not contain that latest sample.
  const coalesced = sampled === undefined || sampled.length === 0
    ? [event]
    : [...sampled, event];
  for (const sample of coalesced) {
    const pointerSample = pointerSampleFromEvent(sample, "move");
    if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
  }
}

function scheduleTilemapPresent(): void {
  if (tilemapPresentFrame !== undefined) return;
  tilemapPresentFrame = requestAnimationFrame(() => {
    tilemapPresentFrame = undefined;
    void present();
  });
}

function tilemapCellCoordinates(
  map: Draw2Tilemap,
  point: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } | undefined {
  const x = Math.floor(point.x / map.cellSize);
  const y = Math.floor(point.y / map.cellSize);
  if (x < 0 || y < 0 || x >= map.columns || y >= map.rows) return undefined;
  return { x, y };
}

function updateTilemapPointerGesture(
  point: { readonly x: number; readonly y: number },
): void {
  const gesture = tilemapPointerGesture;
  if (gesture === undefined) return;
  if (
    gesture.stale || canonicalStateGeneration !== gesture.canonicalGeneration ||
    state.structureEpoch !== gesture.structureEpoch ||
    state.tilemaps?.[gesture.mapId]?.revision !== gesture.mapRevision
  ) {
    gesture.stale = true;
    return;
  }
  const map = state.tilemaps?.[gesture.mapId];
  if (map === undefined) return;
  const coordinates = tilemapCellCoordinates(map, point);
  if (coordinates === undefined) return;
  const key = `${coordinates.x}:${coordinates.y}`;
  if (key === gesture.lastCellKey) return;
  gesture.lastCellKey = key;
  if (!gesture.beforeCells.has(key)) {
    gesture.beforeCells.set(key, map.cells[key]);
  }
  const nextMap = gesture.erase
    ? clearDraw2TilemapCell(map, coordinates.x, coordinates.y)
    : selectedTileSource === undefined
    ? map
    : setDraw2TilemapCell(
      map,
      coordinates.x,
      coordinates.y,
      {
        sourceAssetId: selectedTileSource.sourceAssetId,
        sourceX: selectedTileSource.sourceX,
        sourceY: selectedTileSource.sourceY,
        transform: "NONE",
      } satisfies Draw2TilemapCell,
    );
  if (nextMap === map) return;
  adoptCanonicalState({
    ...state,
    tilemaps: { ...(state.tilemaps ?? {}), [map.id]: nextMap },
  });
  refreshSelectionSnapshotForCurrentRaster();
  gesture.changed = true;
  gesture.canonicalGeneration = canonicalStateGeneration;
  gesture.mapRevision = nextMap.revision;
  gesture.structureEpoch = state.structureEpoch;
  gesture.localCells.set(key, nextMap.cells[key]);
  scheduleTilemapPresent();
}

function beginTilemapPointerGesture(
  event: PointerEvent,
  point: { readonly x: number; readonly y: number },
): boolean {
  if (!activeLayerIsTilemap()) return false;
  const layer = state.layers.find((item) =>
    item.layerTrackId === state.activeLayerId
  );
  if (layer?.locked === true) {
    setStatus("タイルマップレイヤーがロックされています。", "error");
    return true;
  }
  const map = activeTilemap() ?? ensureTilemapFor(
    state.activeLayerId,
    state.activeFrameId,
  );
  if (map === undefined) {
    setStatus("タイルマップを準備できません。", "error");
    return true;
  }
  const erase = event.button === 2 || currentBasicTool() === "eraser";
  if (!erase && selectedTileSource === undefined) {
    setStatus("先にTilesetのセルを選択してください。", "error");
    return true;
  }
  if (
    !erase && selectedTileSource !== undefined &&
    selectedTileSource.cellSize !== map.cellSize
  ) {
    setStatus(
      `Tilesetの${selectedTileSource.cellSize}pxとTilemapの${map.cellSize}pxが違います。同じセルサイズを選んでください。`,
      "error",
    );
    return true;
  }
  tilemapPointerGesture = {
    pointerId: event.pointerId,
    mapId: map.id,
    before: state,
    canonicalGeneration: canonicalStateGeneration,
    mapRevision: map.revision,
    structureEpoch: state.structureEpoch,
    stale: false,
    erase,
    lastCellKey: "",
    changed: false,
    beforeCells: new Map(),
    localCells: new Map(),
  };
  canvas.setPointerCapture(event.pointerId);
  updateTilemapPointerGesture(point);
  if (event.cancelable) event.preventDefault();
  return true;
}

async function finishTilemapPointerGesture(
  cancelled = false,
): Promise<void> {
  const gesture = tilemapPointerGesture;
  if (gesture === undefined) return;
  tilemapPointerGesture = undefined;
  if (cancelled) {
    const isCurrent = !gesture.stale &&
      canonicalStateGeneration === gesture.canonicalGeneration &&
      state.structureEpoch === gesture.structureEpoch &&
      state.tilemaps?.[gesture.mapId]?.revision === gesture.mapRevision;
    if (isCurrent) {
      adoptCanonicalState(gesture.before);
    } else if (rollbackStaleTilemapGesture(gesture)) {
      saveDrawProjectState("tilemap-cancel");
      notifyAssetStateChanged();
    }
    await present();
    return;
  }
  const isStale = gesture.stale ||
    canonicalStateGeneration !== gesture.canonicalGeneration ||
    state.structureEpoch !== gesture.structureEpoch ||
    state.tilemaps?.[gesture.mapId]?.revision !== gesture.mapRevision;
  if (isStale) {
    if (rollbackStaleTilemapGesture(gesture)) {
      saveDrawProjectState("tilemap-cancel");
      notifyAssetStateChanged();
    }
    await present();
    return;
  }
  if (!gesture.changed) return;
  tilemapOperationSequence += 1;
  const operationId =
    `draw2-tilemap-${state.projectId}-${tilemapOperationSequence}`;
  history.record(
    gesture.before,
    state,
    operationId,
    gesture.erase ? "tilemap.erase" : "tilemap.place",
  );
  renderTimeline();
  saveDrawProjectState("tilemap-edit");
  notifyAssetStateChanged();
  await present();
  updateHistoryButtons();
  const map = activeTilemap();
  setStatus(
    `${gesture.erase ? "タイルを消去" : "タイルを配置"}しました · ${
      draw2TilemapCellCount(map)
    }セル · Undo対応`,
  );
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  if (event.button === 2 && !activeLayerIsTilemap()) return;
  if (transformCommitInFlight) {
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (
    (event.button === 0 || event.button === 2) &&
    collaborationEditBlockReason() !== undefined &&
    !collaborationCanvasToolIsNonMutating(currentBasicTool())
  ) {
    if (event.cancelable) event.preventDefault();
    announceCollaborationEditBlock();
    return;
  }
  cancelViewportCenterReturn();
  if (event.pointerType === "touch") {
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }
  if (pinchGesture !== undefined && event.pointerType === "touch") {
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (event.pointerType === "touch" && canvasPointers.size >= 2) {
    zoomWheelAccumulator = 0;
    startPinchGesture();
    if (event.cancelable) event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (
    event.button === 1 || currentBasicTool() === "pan" ||
    (event.altKey && !selectionToolCanMove())
  ) {
    if (event.cancelable) event.preventDefault();
    beginViewportPan(event);
    return;
  }
  const point = pointFromPointer(event);
  if (
    event.button === 0 && point !== undefined && selection !== undefined &&
    selectionToolCanMove() && !event.shiftKey
  ) {
    const frameHandle = selectionFrameHandleAtClient(
      event.clientX,
      event.clientY,
    );
    if (
      frameHandle !== undefined &&
      beginSelectionFrameDrag(event, frameHandle)
    ) return;
    if (selectionFrameBorderAtClient(event.clientX, event.clientY)) {
      if (beginSelectionDrag(event, point)) return;
    }
  }
  if (
    point !== undefined && (event.button === 0 || event.button === 2) &&
    currentBasicTool() !== "pan" &&
    !(event.altKey && !selectionToolCanMove()) &&
    beginTilemapPointerGesture(event, point)
  ) return;
  if (
    event.button === 0 && point !== undefined &&
    currentBasicTool() === "select-rect"
  ) {
    const plainSelectionClick = !event.shiftKey && !event.altKey &&
      !event.metaKey && !event.ctrlKey;
    if (plainSelectionClick && isSelectionGridDoubleClick(event, point)) {
      beginGridSelectionGesture(event, point);
      return;
    }
    if (!plainSelectionClick) lastSelectionClick = undefined;
  }
  if (
    event.button === 0 && point !== undefined &&
    currentBasicTool() === "move" && selection === undefined
  ) {
    if (!selectActiveCelContentForMove()) return;
    if (beginSelectionDrag(event, point)) return;
  }
  if (
    event.button === 0 && point !== undefined && selection !== undefined &&
    selectionToolCanMove() && !event.shiftKey &&
    pointIsInsideSelection(point)
  ) {
    if (beginSelectionDrag(event, point)) return;
  }
  if (event.button === 0 && point !== undefined && selectionToolCanMove()) {
    beginPendingSelectionGesture(event, point);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  drawInteraction = new Draw2InteractionKernel({
    tool: currentBasicTool(),
    bounds: { width: asset.width, height: asset.height },
    colorIndex: selectedColor,
    toolOptions: { ...toolOptions },
    commitIngress: drawCommitIngress,
    onCommitQueued: queuePendingDrawPreview,
    onCommit: (commit) => commitInteractionSession(commit),
    onCommitError: (error) => {
      syncClientSequencesFromState();
      setStatus(
        error instanceof Error ? error.message : "Drawing commit failed.",
        "error",
      );
    },
  });
  const pointerSample = pointerSampleFromEvent(event, "down");
  if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
  hoverPoint = drawInteraction.session?.points[0];
  drawOverlay();
});
canvas.addEventListener("pointermove", (event) => {
  if (canvasPointers.has(event.pointerId)) {
    canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinchGesture !== undefined) {
    updatePinchGesture();
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (touchPanAfterPinch?.pointerId === event.pointerId) {
    const pan = touchPanAfterPinch;
    viewportPanX = pan.panX + event.clientX - pan.startX;
    viewportPanY = pan.panY + event.clientY - pan.startY;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    updateMirrorGuideDragFromPointer(event);
    return;
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanX = viewportPanStart.panX + event.clientX - viewportPanStart.x;
    viewportPanY = viewportPanStart.panY + event.clientY - viewportPanStart.y;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    return;
  }
  const point = pointFromPointer(event);
  if (point !== undefined) hoverPoint = point;
  syncSelectionFrameCursor(event.clientX, event.clientY);
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    if (point !== undefined) updateTilemapPointerGesture(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (selectionFrameDrag?.pointerId === event.pointerId) {
    updateSelectionFrameDragPreview(
      canvasPointForClient(event.clientX, event.clientY),
    );
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    lastSelectionClick = undefined;
    if (point !== undefined) updateSelectionDragPreview(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    if (
      point !== undefined && pendingSelectionGesture.tool !== "select-color"
    ) updatePendingSelectionGesture(point);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (
    drawInteraction?.activePointerId !== event.pointerId
  ) {
    scheduleDrawOverlay();
    return;
  }
  addPointerSamples(event);
  scheduleDrawOverlay();
});
canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    if (handleViewportTouchPointerEnd(event, false)) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    canvasPointers.delete(event.pointerId);
  }
  if (pinchGesture !== undefined) {
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    const point = pointFromPointer(event);
    if (point !== undefined) updateTilemapPointerGesture(point);
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    void finishTilemapPointerGesture(false);
    if (event.cancelable) event.preventDefault();
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    finishMirrorGuideDrag(event);
    return;
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (selectionFrameDrag?.pointerId === event.pointerId) {
    updateSelectionFrameDragPreview(
      canvasPointForClient(event.clientX, event.clientY),
    );
    const activeTransform = transformSession?.transform;
    selectionFrameDrag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (
      activeTransform !== undefined && transformHasEffect(activeTransform)
    ) {
      void commitActiveTransform();
    } else {
      transformSession = undefined;
      transformPreview = undefined;
      updateSelectionStatus(
        selection === undefined
          ? "scope=" + state.activeCelId + " · selection=none"
          : "scope=" + selection.scope.celId + " · " +
            selection.pixels.length + "px · " + selection.mask.kind +
            " · preview=none",
      );
      syncWorkspaceEditCommandState();
      drawOverlay();
    }
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    const point = pointFromPointer(event);
    if (point !== undefined) updateSelectionDragPreview(point);
    selectionDrag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (
      transformSession !== undefined &&
      (transformSession.transform.dx !== 0 ||
        transformSession.transform.dy !== 0)
    ) void commitActiveTransform();
    else {
      transformSession = undefined;
      transformPreview = undefined;
      updateSelectionStatus(
        selection === undefined
          ? `scope=${state.activeCelId} · selection=none`
          : `scope=${selection.scope.celId} · ${selection.pixels.length}px · ${selection.mask.kind} · preview=none`,
      );
      drawOverlay();
    }
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    void finishPendingSelectionGesture();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  const pointerSample = pointerSampleFromEvent(event, "up");
  if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  drawInteraction = undefined;
  flushDrawOverlay();
});
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") {
    if (handleViewportTouchPointerEnd(event, true)) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    canvasPointers.delete(event.pointerId);
  }
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    cancelActiveStroke();
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    void finishTilemapPointerGesture(true);
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    finishMirrorGuideDrag(event);
    return;
  }
  if (selectionFrameDrag?.pointerId === event.pointerId) {
    cancelSelectionFrameDrag();
    setStatus("選択枠の変形をキャンセルしました。Canonical Rasterは未変更です。", "error");
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    cancelSelectionDrag();
    setStatus("Selection move cancelled; Canonical Raster unchanged.", "error");
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    lastSelectionClick = undefined;
    pendingSelectionGesture = undefined;
    updateSelectionActionButtons();
    drawOverlay();
    setStatus("Selection draft cancelled before confirmation.", "error");
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  const pointerSample = pointerSampleFromEvent(event, "cancel");
  if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
  drawInteraction = undefined;
  flushDrawOverlay();
  setStatus("Drawing cancelled before commit.", "error");
});
canvas.addEventListener("lostpointercapture", (event) => {
  if (
    event.pointerType === "touch" &&
    (pinchGesture !== undefined || touchPanAfterPinch !== undefined)
  ) return;
  if (event.pointerType === "touch") canvasPointers.delete(event.pointerId);
  if (viewportPanPointerId === event.pointerId) {
    viewportPanPointerId = undefined;
    cancelActiveStroke();
    return;
  }
  if (tilemapPointerGesture?.pointerId === event.pointerId) {
    void finishTilemapPointerGesture(true);
    return;
  }
  if (mirrorGuideDrag?.pointerId === event.pointerId) {
    finishMirrorGuideDrag(event);
    return;
  }
  if (selectionFrameDrag?.pointerId === event.pointerId) {
    cancelSelectionFrameDrag();
    setStatus(
      "選択枠の変形をキャンセルしました（ポインター捕捉解除）。",
      "error",
    );
    return;
  }
  if (selectionDrag?.pointerId === event.pointerId) {
    cancelSelectionDrag();
    setStatus(
      "Selection move cancelled after pointer capture was lost.",
      "error",
    );
    return;
  }
  if (pendingSelectionGesture?.pointerId === event.pointerId) {
    lastSelectionClick = undefined;
    pendingSelectionGesture = undefined;
    updateSelectionActionButtons();
    drawOverlay();
    setStatus(
      "Selection draft cancelled after pointer capture was lost.",
      "error",
    );
    return;
  }
  if (drawInteraction?.activePointerId !== event.pointerId) return;
  if (event.buttons === 0) {
    // Some browsers lose capture after the button is already released and
    // suppress pointerup. Treat that boundary as the final commit.
    const pointerSample = pointerSampleFromEvent(event, "up");
    if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
    drawInteraction = undefined;
    flushDrawOverlay();
    return;
  }
  const pointerSample = pointerSampleFromEvent(event, "lost_capture");
  if (pointerSample !== undefined) drawInteraction.handle(pointerSample);
  drawInteraction = undefined;
  flushDrawOverlay();
  setStatus("Drawing cancelled after pointer capture was lost.", "error");
});
window.addEventListener("blur", () => {
  if (drawInteraction !== undefined) {
    cancelActiveStroke();
    setStatus("Drawing cancelled by browser interruption.", "error");
  }
  if (cancelUncommittedSelectionWork()) {
    setStatus(
      "Selection/transform preview cancelled by browser interruption.",
      "error",
    );
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && drawInteraction !== undefined) {
    cancelActiveStroke();
    setStatus("Drawing cancelled by browser interruption.", "error");
  }
  if (document.hidden && cancelUncommittedSelectionWork()) {
    setStatus(
      "Selection/transform preview cancelled by browser interruption.",
      "error",
    );
  }
});
canvas.addEventListener("pointerleave", () => {
  delete canvas.dataset.selectionFrameHandle;
  if (
    drawInteraction?.activePointerId === undefined &&
    selectionFrameDrag === undefined &&
    selectionDrag === undefined &&
    pendingSelectionGesture === undefined && mirrorGuideDrag === undefined
  ) hoverPoint = undefined;
  drawOverlay();
});
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  cancelUncommittedSelectionWork(
    "Selection/transform cancelled by right-click; Canonical Raster unchanged.",
  );
});

// Touch ownership is arbitrated on the wrapper so a second finger can start
// in the gutter as well as on the raster. The first finger is still allowed
// to reach the canvas and draw normally; only an active pinch or the
// pinch-to-pan continuation is captured here.
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if (
    (event.pointerType === "mouse" || event.pointerType === "pen") &&
    Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
  ) {
    lastViewportPointerClient = { x: event.clientX, y: event.clientY };
  }
}, { passive: true });
viewportWrapElement?.addEventListener("mousemove", (event) => {
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    lastViewportPointerClient = { x: event.clientX, y: event.clientY };
  }
}, { passive: true });
viewportWrapElement?.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") return;
  if (pinchGesture !== undefined || touchPanAfterPinch !== undefined) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (canvasPointers.size >= 2) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  canvasPointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  });
  if (canvasPointers.size < 2) return;
  zoomWheelAccumulator = 0;
  startPinchGesture();
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}, { capture: true });
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch") return;
  if (pinchGesture !== undefined) {
    if (pinchGesture.pointerIds.includes(event.pointerId)) {
      canvasPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      updatePinchGesture();
    }
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (touchPanAfterPinch?.pointerId === event.pointerId) {
    const pan = touchPanAfterPinch;
    canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    viewportPanX = pan.panX + event.clientX - pan.startX;
    viewportPanY = pan.panY + event.clientY - pan.startY;
    applyViewportTransform();
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true });
const handleViewportTouchEndEvent = (
  event: PointerEvent,
  cancelled: boolean,
): void => {
  if (event.pointerType !== "touch") return;
  const handled = handleViewportTouchPointerEnd(event, cancelled);
  if (!handled) {
    canvasPointers.delete(event.pointerId);
    return;
  }
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
};
viewportWrapElement?.addEventListener(
  "pointerup",
  (event) => handleViewportTouchEndEvent(event, false),
  { capture: true },
);
viewportWrapElement?.addEventListener(
  "pointercancel",
  (event) => handleViewportTouchEndEvent(event, true),
  { capture: true },
);
viewportWrapElement?.addEventListener(
  "lostpointercapture",
  (event) => handleViewportTouchEndEvent(event, true),
  { capture: true },
);

// Mirror axes are manipulated from the viewport surface/gutter, not from the
// drawing gesture itself. The SVG remains projection-only; this wrapper owns
// the local drag interaction and never emits a Canonical Operation.
viewportWrapElement?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const targetElement = event.target instanceof Element
    ? event.target
    : undefined;
  const mirrorHandle = targetElement?.closest<HTMLButtonElement>(
    ".draw2-mirror-line-toggle",
  );
  const handleAxis = mirrorHandle === mirrorToggleX
    ? "x"
    : mirrorHandle === mirrorToggleY
    ? "y"
    : mirrorHandle === mirrorToggleDiagonalDown
    ? "diagonal-down"
    : mirrorHandle === mirrorToggleDiagonalUp
    ? "diagonal-up"
    : undefined;
  if (mirrorEnabled && handleAxis !== undefined) {
    // Keep a click a native button action. A drag is promoted only after the
    // pointer has moved past the threshold, so embedded browsers do not turn
    // an ordinary toggle press into an immediate grab.
    mirrorGuideClickSuppressed = false;
    mirrorGuideDrag = {
      pointerId: event.pointerId,
      axis: handleAxis,
      moved: false,
      start: { x: event.clientX, y: event.clientY },
      handle: mirrorHandle ?? undefined,
    };
    // Do not capture or cancel the pointer on pointerdown. A short press must
    // reach the button's native click listener.
    return;
  }
  if (
    event.target === canvas ||
    !isOutsideCanvasClient(event.clientX, event.clientY)
  ) return;
  if (mirrorEnabled) {
    const axis = mirrorGuideAxisAtClient(event.clientX, event.clientY);
    if (axis !== undefined) {
      mirrorGuideDrag = {
        pointerId: event.pointerId,
        axis,
        moved: false,
        start: { x: event.clientX, y: event.clientY },
        handle: undefined,
      };
      viewportWrapElement.setPointerCapture(event.pointerId);
      if (event.cancelable) event.preventDefault();
      return;
    }
  }
  if (event.pointerType === "touch") return;
  if (
    targetElement?.closest(
      "button, a, input, select, textarea, [role=button]",
    ) !== null
  ) return;
  if (!hasPendingSelectionInteraction()) return;
  if (event.cancelable) event.preventDefault();
  void dismissSelectionFromOutsideClick();
});
viewportWrapElement?.addEventListener("pointermove", (event) => {
  if (mirrorGuideDrag?.pointerId !== event.pointerId) return;
  updateMirrorGuideDragFromPointer(event);
});
viewportWrapElement?.addEventListener("pointerup", finishMirrorGuideDrag);
viewportWrapElement?.addEventListener("pointercancel", finishMirrorGuideDrag);
viewportWrapElement?.addEventListener("lostpointercapture", (event) => {
  finishMirrorGuideDrag(event as PointerEvent);
});
window.addEventListener("pointerup", finishMirrorGuideDrag);
window.addEventListener("pointercancel", finishMirrorGuideDrag);

type StepControl = HTMLSelectElement | HTMLInputElement;

function isStepControl(target: EventTarget | null): target is StepControl {
  return target instanceof HTMLSelectElement ||
    target instanceof HTMLInputElement && target.type === "range";
}

function stepControlValue(control: StepControl, direction: 1 | -1): void {
  if (control instanceof HTMLSelectElement) {
    const nextIndex = Math.max(
      0,
      Math.min(control.options.length - 1, control.selectedIndex + direction),
    );
    if (nextIndex === control.selectedIndex) return;
    control.selectedIndex = nextIndex;
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const minimum = Number(control.min || 0);
  const maximum = Number(control.max || 100);
  const step = Number(control.step || 1);
  const current = Number(control.value);
  const next = Math.max(minimum, Math.min(maximum, current + step * direction));
  if (next === current) return;
  control.value = String(next);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

// Aseprite-like numeric controls can be adjusted without opening a menu.
// Wheel input remains owned by the desktop workspace.
workspaceFrameElement?.addEventListener("wheel", (event) => {
  if (!isStepControl(event.target)) return;
  if (event.cancelable) event.preventDefault();
  stepControlValue(event.target, event.deltaY < 0 ? 1 : -1);
}, { passive: false });
viewportWrapElement?.addEventListener("wheel", (event) => {
  if (event.cancelable) event.preventDefault();
  cancelViewportCenterReturn();
  if (event.shiftKey || event.altKey) {
    viewportPanX -= event.deltaX || event.deltaY;
    viewportPanY -= event.deltaY || event.deltaX;
    applyViewportTransform();
    return;
  }
  const deltaPixels = event.deltaMode === 1
    ? event.deltaY * 16
    : event.deltaMode === 2
    ? event.deltaY * (viewportWrapElement?.clientHeight || 256)
    : event.deltaY;
  zoomWheelAccumulator += Math.max(
    -4,
    Math.min(4, (-deltaPixels / 100) * visualSettings.zoomSensitivity),
  );
  while (Math.abs(zoomWheelAccumulator) >= 1) {
    const zoomIn = zoomWheelAccumulator > 0;
    const currentZoom = currentViewportDisplayScale();
    const nextZoom = stepPixelPerfectZoom(currentZoom, zoomIn ? 1 : -1);
    if (Math.abs(nextZoom - currentZoom) < 0.0001) {
      zoomWheelAccumulator = 0;
      break;
    }
    const anchor = viewportWheelAnchor(event);
    if (anchor === undefined) break;
    zoomViewportAtClient(anchor.x, anchor.y, nextZoom);
    zoomWheelAccumulator -= zoomIn ? 1 : -1;
  }
}, { passive: false });
workspaceFrameElement?.addEventListener("wheel", (event) => {
  if (event.ctrlKey && event.cancelable) event.preventDefault();
}, { passive: false });
workspaceFrameElement?.addEventListener("gesturestart", (event) => {
  if (event.cancelable) event.preventDefault();
});
workspaceFrameElement?.addEventListener("gesturechange", (event) => {
  if (event.cancelable) event.preventDefault();
});
workspaceFrameElement?.addEventListener("gestureend", (event) => {
  if (event.cancelable) event.preventDefault();
});
window.addEventListener("resize", () => applyViewportTransform(), {
  passive: true,
});

miniPreviewCollapseButtonElement.addEventListener("click", () => {
  if (!miniPreviewModeAvailable()) return;
  miniPreviewLayout = { ...miniPreviewLayout, collapsed: true };
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
});
miniPreviewRestoreButtonElement.addEventListener("click", () => {
  if (!miniPreviewModeAvailable()) return;
  if (!miniPreviewEnabled) miniPreviewEnabled = true;
  else {
    miniPreviewLayout = {
      ...miniPreviewLayout,
      collapsed: !miniPreviewLayout.collapsed,
    };
  }
  persistMiniPreviewLayout();
  syncMiniPreviewLayout();
  if (!miniPreviewLayout.collapsed) drawMiniPreviewProjection();
});
miniPreviewPlayButton.addEventListener("click", () => {
  if (!miniPreviewModeAvailable()) return;
  if (playbackRunning) stopTimelinePlayback();
  else startTimelinePlayback();
});
miniPreviewReferenceButton.addEventListener("click", () => {
  if (!miniPreviewModeAvailable()) return;
  miniPreviewReferenceInput.click();
});
miniPreviewReferenceInput.addEventListener("change", () => {
  const file = miniPreviewReferenceInput.files?.[0];
  if (file !== undefined) void readMiniPreviewReference(file);
  miniPreviewReferenceInput.value = "";
});
miniPreviewReferenceClearButton.addEventListener("click", () => {
  if (!miniPreviewModeAvailable()) return;
  closeMiniPreviewReferenceSource();
  miniPreviewReferenceClearButton.disabled = true;
  miniPreviewReferenceButton.setAttribute("aria-pressed", "false");
  setMiniPreviewReferenceStatus("Reference image cleared.");
  drawMiniPreviewProjection();
});
bindMiniPreviewResize(miniPreviewResizeLeftElement, "left");
bindMiniPreviewResize(miniPreviewResizeBottomElement, "bottom");
bindMiniPreviewResize(miniPreviewResizeCornerElement, "corner");

for (const button of displayToggleButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.draw2DisplayToggle === "cursor") {
      virtualCursorEnabled = !virtualCursorEnabled;
    }
    if (button.dataset.draw2DisplayToggle === "mini-preview") {
      if (!miniPreviewModeAvailable()) return;
      miniPreviewEnabled = !miniPreviewEnabled;
    }
    syncDisplayToggles();
    button.closest(".draw2-menu")?.removeAttribute("open");
  });
}
syncMiniPreviewPlaybackControl();
for (
  const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-draw2-open-settings]",
  )
) {
  button.addEventListener("click", () => {
    applyVisualSettings(visualSettings, false);
    settingsDialogElement?.showModal();
    button.closest(".draw2-menu")?.removeAttribute("open");
  });
}
for (
  const input of [
    settingsZoomSensitivityElement,
    settingsCheckerAElement,
    settingsCheckerBElement,
    settingsGridMinorElement,
    settingsGridMajorElement,
    settingsThemeAccentElement,
  ]
) {
  input?.addEventListener("input", () => {
    applyVisualSettings({
      ...visualSettings,
      zoomSensitivity: Number(
        settingsZoomSensitivityElement?.value ?? visualSettings.zoomSensitivity,
      ),
      checkerA: settingsCheckerAElement?.value ?? visualSettings.checkerA,
      checkerB: settingsCheckerBElement?.value ?? visualSettings.checkerB,
      gridMinor: settingsGridMinorElement?.value ?? visualSettings.gridMinor,
      gridMajor: settingsGridMajorElement?.value ?? visualSettings.gridMajor,
      themeAccent: settingsThemeAccentElement?.value ??
        visualSettings.themeAccent,
    });
  });
}
settingsResetButton?.addEventListener(
  "click",
  () => applyVisualSettings(DEFAULT_DRAW2_VISUAL_SETTINGS),
);
setTimelineTab(activeTimelineTab);
restoreDraw2GlobalEditorPreferences();
applyViewportTransform();
applyVisualSettings(visualSettings, false);
syncDisplayToggles();
renderPaletteButtons(state.assets[state.activeAssetId]?.palette ?? []);

function syncToolButtons(): void {
  const selectedTool = toolSelect.value === "select-rect"
    ? "select"
    : toolSelect.value;
  canvas.dataset.tool = selectedTool;
  for (
    const button of document.querySelectorAll<HTMLElement>(
      "[data-workspace-tool]",
    )
  ) {
    const active = button.dataset.workspaceTool === selectedTool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

const TOOL_STUDIO_LABELS: Readonly<Record<string, string>> = {
  pen: "Pen",
  eraser: "Eraser",
  text: "Text",
  move: "Move / Duplicate",
  "select-color": "Color Selection",
};

function syncToolStudio(): void {
  const current = currentBasicTool();
  const label = TOOL_STUDIO_LABELS[current] ?? current;
  if (toolStudioSummaryElement !== null) {
    toolStudioSummaryElement.value = `${label} · ready`;
  }
  for (
    const card of document.querySelectorAll<HTMLElement>(
      "[data-draw2-studio-tool]",
    )
  ) {
    const active = card.dataset.draw2StudioTool === current;
    card.classList.toggle("is-selected", active);
    card.setAttribute("aria-pressed", String(active));
  }
  if (toolStudioStatusElement !== null) {
    const message = current === "move"
      ? "選択範囲をドラッグ。Altを押すと複製して移動します。"
      : current === "text"
      ? "Canvasをドラッグしてテキスト範囲を作り、確定前にフォントと枠線を調整します。"
      : current === "select-color"
      ? `${
        colorSelectionModeLabel(
          normalizeColorSelectionMode(toolOptions.selectionMode),
        )
      } color selection. Mode and tolerance are shown near the viewport.`
      : current === "fill"
      ? "クリック地点と同じパレット色でつながる範囲だけを塗りつぶします。"
      : "ツールを選ぶと、ここに使い方と設定が表示されます。";
    toolStudioStatusElement.textContent = message;
  }
  if (toolStudioElement !== null) {
    toolStudioElement.dataset.activeTool = current;
  }
}

for (
  const card of document.querySelectorAll<HTMLButtonElement>(
    "[data-draw2-studio-tool]",
  )
) {
  card.addEventListener("click", () => {
    const tool = card.dataset.draw2StudioTool as BasicTool | undefined;
    if (tool === undefined) return;
    selectShortcutTool(tool);
    syncToolStudio();
  });
}
specialDuplicateFrameElement?.addEventListener(
  "click",
  () => duplicateFrameControl.click(),
);
specialOpenInspectorElement?.addEventListener("click", () => {
  document.querySelector<HTMLButtonElement>(
    "[data-workspace-panel='inspector']",
  )?.click();
});

function renderShortcutList(filter = ""): void {
  if (shortcutListElement === null) return;
  const queryText = filter.trim().toLowerCase();
  shortcutListElement.replaceChildren();
  let category: string | undefined;
  for (const shortcut of DRAW2_SHORTCUTS) {
    const haystack = `${shortcut.category} ${shortcut.label} ${shortcut.keys}`
      .toLowerCase();
    if (queryText.length > 0 && !haystack.includes(queryText)) continue;
    if (category !== shortcut.category) {
      category = shortcut.category;
      const heading = document.createElement("div");
      heading.className = "draw2-shortcut-category";
      heading.textContent = shortcut.category;
      heading.setAttribute("role", "presentation");
      shortcutListElement.append(heading);
    }
    const row = document.createElement("div");
    row.className = "draw2-shortcut-row";
    row.setAttribute("role", "listitem");
    const label = document.createElement("span");
    label.className = "draw2-shortcut-label";
    label.textContent = shortcut.label;
    const keys = document.createElement("span");
    keys.className = "draw2-shortcut-keys";
    for (const key of shortcut.keys.split("+")) {
      const keycap = document.createElement("kbd");
      keycap.textContent = key;
      keys.append(keycap);
    }
    row.append(label, keys);
    shortcutListElement.append(row);
  }
  if (shortcutListElement.childElementCount === 0) {
    const empty = document.createElement("div");
    empty.className = "draw2-shortcut-row";
    empty.textContent = "No matching shortcut";
    shortcutListElement.append(empty);
  }
}

function showShortcutsDialog(): void {
  renderShortcutList(shortcutSearchElement?.value ?? "");
  if (shortcutListElement !== null) {
    translateDraw2Subtree(shortcutListElement);
  }
  if (shortcutsDialogElement?.open !== true) {
    shortcutsDialogElement?.showModal();
  }
  shortcutSearchElement?.focus();
}

function selectShortcutTool(tool: BasicTool): void {
  const normalized = tool === "pixel-pen"
    ? "pen"
    : tool === "select-polygon"
    ? "select-lasso"
    : tool === "tile-stamp"
    ? "pen"
    : tool;
  toolSelect.value = normalized;
  toolSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

function clearCommittedSelection(
  message = "Selection cleared; Canonical Raster unchanged.",
): void {
  selectionInteractionGeneration += 1;
  if (
    selectionDrag !== undefined &&
    canvas.hasPointerCapture(selectionDrag.pointerId)
  ) canvas.releasePointerCapture(selectionDrag.pointerId);
  if (
    selectionFrameDrag !== undefined &&
    canvas.hasPointerCapture(selectionFrameDrag.pointerId)
  ) canvas.releasePointerCapture(selectionFrameDrag.pointerId);
  if (
    pendingSelectionGesture !== undefined &&
    canvas.hasPointerCapture(pendingSelectionGesture.pointerId)
  ) canvas.releasePointerCapture(pendingSelectionGesture.pointerId);
  selection = undefined;
  selectionDraft = undefined;
  pendingSelectionGesture = undefined;
  selectionFrameDrag = undefined;
  selectionDrag = undefined;
  transformSession = undefined;
  transformPreview = undefined;
  pasteMode = false;
  updateSelectionActionButtons();
  updateSelectionStatus(`scope=${state.activeCelId} · selection=none`);
  drawOverlay();
  markCanonicalMetrics();
  notifyAssetStateChanged();
  setStatus(message);
}

function selectAllPixels(): void {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  beginSelectionFromPoints(
    rectanglePointList({
      x: 0,
      y: 0,
      width: asset.width,
      height: asset.height,
    }),
    "rectangle",
    "REPLACE",
    "All pixels selected.",
  );
  commitSelectionDraft();
}

function nudgeCommittedSelection(dx: number, dy: number): boolean {
  if (collaborationEditBlockReason() !== undefined) {
    announceCollaborationEditBlock();
    return false;
  }
  if (
    transformCommitInFlight || selection === undefined ||
    transformSession !== undefined
  ) return false;
  transformOperation.value = "MOVE";
  transformDx.value = String(dx);
  transformDy.value = String(dy);
  transformAngle.value = "0";
  transformSession = createTransformSession(
    selection,
    { ...currentTransform(), operation: "MOVE", dx, dy },
    `transform-nudge-${state.projectId}-${selection.mask.selectionVersion}-${dx}-${dy}-${Date.now()}`,
  );
  transformPreview = previewTransform(selection, transformSession);
  markPreviewMetrics();
  void commitActiveTransform();
  return true;
}

function cycleMirrorMode(): void {
  const modes: MirrorMode[] = ["NONE", "ON"];
  const next = modes[(modes.indexOf(mirrorMode) + 1) % modes.length] ?? "NONE";
  setMirrorPreset(next);
  syncQuickToolControls();
  drawOverlay();
}

function selectRelativeTimelineFrame(delta: number): void {
  const frameOrder = state.timeline.frameOrder;
  if (frameOrder.length === 0) return;
  const currentIndex = Math.max(
    0,
    frameOrder.indexOf(timelineSession.activeFrameId),
  );
  const nextIndex = Math.max(
    0,
    Math.min(frameOrder.length - 1, currentIndex + delta),
  );
  const frameId = frameOrder[nextIndex];
  if (frameId === undefined) return;
  timelineSession = setTimelineSessionActiveFrame(
    state,
    timelineSession,
    frameId,
  );
  renderTimeline();
  void activateTimelineCell(frameId, timelineSession.activeLayerTrackId);
}

function selectRelativeTimelineLayer(delta: number): void {
  const layerOrder = state.timeline.layerTrackOrder;
  if (layerOrder.length === 0) return;
  const currentIndex = Math.max(
    0,
    layerOrder.indexOf(timelineSession.activeLayerTrackId),
  );
  const nextIndex = Math.max(
    0,
    Math.min(layerOrder.length - 1, currentIndex + delta),
  );
  const layerTrackId = layerOrder[nextIndex];
  if (layerTrackId === undefined) return;
  timelineSession = { ...timelineSession, activeLayerTrackId: layerTrackId };
  renderTimeline();
  void activateTimelineCell(timelineSession.activeFrameId, layerTrackId);
}

async function clearActiveTimelineCel(): Promise<void> {
  const cel = state.cels.find((item) =>
    item.frameId === timelineSession.activeFrameId &&
    item.layerTrackId === timelineSession.activeLayerTrackId
  );
  if (cel?.assetId === undefined) {
    setStatus("Active cel is already empty.");
    return;
  }
  await runTimelineCommand("timeline.clearCel", { celId: cel.celId });
}

function draw2ShortcutMutatesContent(command: string): boolean {
  if (command === "selection-confirm") return transformSession !== undefined;
  if (command === "delete-selection") return true;
  return [
    "undo",
    "redo",
    "cut",
    "paste",
    "clear-cel",
    "add-frame",
    "duplicate-frame",
  ].includes(command);
}

function runDraw2Shortcut(command: string, event?: KeyboardEvent): void {
  const toolMap: Readonly<Record<string, BasicTool>> = {
    "tool-pen": "pen",
    "tool-text": "text",
    "tool-eraser": "eraser",
    "tool-fill": "fill",
    "tool-eyedropper": "eyedropper",
    "tool-line": "line",
    "tool-rect": "rect",
    "tool-ellipse": "ellipse",
    "tool-circle": "circle",
    "tool-select": "select-rect",
    "tool-select-color": "select-color",
    "tool-select-lasso": "select-lasso",
    "tool-move": "move",
    "tool-pan": "pan",
  };
  const mappedTool = toolMap[command];
  if (mappedTool !== undefined) {
    selectShortcutTool(mappedTool);
    return;
  }
  if (collaborationEditBlockReason() !== undefined && draw2ShortcutMutatesContent(command)) {
    announceCollaborationEditBlock();
    return;
  }
  switch (command) {
    case "undo":
      undoControl.click();
      break;
    case "redo":
      redoControl.click();
      break;
    case "copy":
      copyControl.click();
      break;
    case "cut":
      cutControl.click();
      break;
    case "paste":
      pasteControl.click();
      break;
    case "selection-confirm":
      if (transformSession !== undefined) void commitActiveTransform();
      else commitSelectionDraft();
      break;
    case "selection-cancel":
      if (
        selectionDraft !== undefined || pendingSelectionGesture !== undefined
      ) cancelSelectionDraft();
      else if (transformSession !== undefined) cancelTransformControl.click();
      else if (selectionFrameDrag !== undefined) cancelSelectionFrameDrag();
      else if (selectionDrag !== undefined) cancelSelectionDrag();
      break;
    case "selection-deselect":
      clearCommittedSelection();
      break;
    case "selection-select-all":
      selectAllPixels();
      break;
    case "delete-selection":
      if (selection !== undefined || selectionDraft !== undefined) {
        cutControl.click();
      } else {
        void clearActiveTimelineCel();
      }
      break;
    case "mirror-cycle":
      cycleMirrorMode();
      break;
    case "zoom-in": {
      stepViewportZoom(1);
      break;
    }
    case "zoom-out": {
      stepViewportZoom(-1);
      break;
    }
    case "zoom-reset": {
      fitViewport();
      break;
    }
    case "add-frame":
      addFrameControl.click();
      break;
    case "duplicate-frame":
      duplicateFrameControl.click();
      break;
    case "previous-frame":
      selectRelativeTimelineFrame(-1);
      break;
    case "next-frame":
      selectRelativeTimelineFrame(1);
      break;
    case "previous-layer":
      selectRelativeTimelineLayer(-1);
      break;
    case "next-layer":
      selectRelativeTimelineLayer(1);
      break;
    case "toggle-loop":
      cyclePlaybackLoopMode();
      break;
    case "toggle-onion":
      toggleOnionControl.click();
      break;
    case "clear-cel":
      void clearActiveTimelineCel();
      break;
    case "toggle-playback":
      togglePlaybackControl.click();
      break;
    case "command-palette":
      document.querySelector<HTMLDialogElement>("#draw2CommandPalette")
        ?.showModal();
      break;
    case "shortcuts":
      showShortcutsDialog();
      break;
    default:
      if (event?.key === "Escape") cancelSelectionDraft();
      break;
  }
}

shortcutSearchElement?.addEventListener(
  "input",
  () => renderShortcutList(shortcutSearchElement.value),
);
for (
  const button of document.querySelectorAll<HTMLElement>(
    "[data-workspace-command='shortcuts']",
  )
) button.addEventListener("click", showShortcutsDialog);
renderShortcutList();
applyDraw2Locale(draw2Locale, false);
languageControl.addEventListener("change", () => {
  applyDraw2Locale(languageControl.value as Draw2Locale);
  renderShortcutList(shortcutSearchElement?.value ?? "");
  if (shortcutListElement !== null) {
    translateDraw2Subtree(shortcutListElement);
  }
  setStatus(
    draw2Locale === "ja" ? "言語を日本語に変更しました。" : "Language changed.",
  );
});

// Keep tool selection functional even while the isolated Workspace chunk is
// being loaded. The DOM button is only an input adapter; the select remains
// the single local presentation source for the existing input path.
for (
  const button of document.querySelectorAll<HTMLElement>(
    "[data-workspace-tool]",
  )
) {
  // Group summaries are handled by the Workspace controller so a parent
  // click can select its default tool and toggle the child flyout atomically.
  if (button.tagName === "SUMMARY") continue;
  button.addEventListener("click", () => {
    const nextTool = button.dataset.workspaceTool === "select"
      ? "select-rect"
      : button.dataset.workspaceTool;
    if (
      nextTool === undefined ||
      !Array.from(toolSelect.options).some((option) =>
        option.value === nextTool
      )
    ) return;
    toolSelect.value = nextTool;
    toolSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const BRUSH_SIZE_MIN = 1;
const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE;

function brushPatternLabel(pattern: string): string {
  switch (pattern) {
    case "checker":
      return "Checker";
    case "dots":
      return "Dots";
    case "bayer-2x2":
      return "Bayer";
    default:
      return "Solid";
  }
}

function syncBrushOptionsButton(): void {
  const isCircle = brushShape.value === "circle";
  const shapeLabel = isCircle ? "Circle" : "Square";
  const patternLabel = brushPatternLabel(brushPattern.value);
  const angle = Number(brushAngle.value);
  const angleLabel = !isCircle && Number.isFinite(angle) && angle !== 0
    ? ` · ${Math.round(angle)}°`
    : "";
  const algorithmLabel = brushAlgorithm.value === "pixel-perfect"
    ? " · Pixel perfect"
    : "";
  brushOptionsSummary.textContent = `${isCircle ? "○" : "□"} ${
    localizeDraw2Text(patternLabel)
  }${angleLabel}${algorithmLabel}`;
  const accessibleLabel = `${localizeDraw2Text("Shape")}: ${
    localizeDraw2Text(shapeLabel)
  } · ${localizeDraw2Text("Pattern")}: ${localizeDraw2Text(patternLabel)}${
    angleLabel
  }${algorithmLabel}`;
  brushOptionsButton.setAttribute("aria-label", accessibleLabel);
  brushOptionsButton.title = accessibleLabel;
}

function syncQuickToolControls(): void {
  syncBrushOptionsButton();
  brushAngle.disabled = brushShape.value === "circle";
  syncMirrorModeToggle();
  const tool = currentBasicTool();
  const colorSelectionMode = normalizeColorSelectionMode(
    colorSelectionModeControl.value as ColorSelectionMode,
  );
  const showColorSelectionMode = tool === "select-color";
  colorSelectionModeControl.closest<HTMLElement>(
    ".draw2-viewport-context-control",
  )?.toggleAttribute("hidden", !showColorSelectionMode);

  const usesColorTolerance = showColorSelectionMode &&
    (colorSelectionMode === "similar" || colorSelectionMode === "magic");
  similarityControl.hidden = !usesColorTolerance;
  similarityControl.setAttribute("aria-hidden", String(!usesColorTolerance));
  if (usesColorTolerance) {
    const toleranceLabel = colorSelectionMode === "magic"
      ? "Magic color tolerance"
      : "Similar color tolerance";
    similarity.setAttribute("aria-label", toleranceLabel);
    similarity.title =
      `${toleranceLabel} · 0% = same RGB, 100% = all RGB colors`;
  }

  const specialOptions = document.querySelectorAll<HTMLElement>(
    "[data-draw2-special-option]",
  );
  for (const option of specialOptions) {
    option.hidden = true;
  }
  const showContextRail = showColorSelectionMode;
  viewportContextRail.hidden = !showContextRail;
}

function normalizeBrushSizeInput(): void {
  const requested = Number(brushSize.value);
  const next = Number.isFinite(requested)
    ? Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, Math.round(requested)))
    : BRUSH_SIZE_MIN;
  brushSize.value = String(next);
}

function normalizeBrushAngleInput(): void {
  const requested = Number(brushAngle.value);
  const next = Number.isFinite(requested)
    ? Math.max(-180, Math.min(180, Math.round(requested)))
    : 0;
  brushAngle.value = String(next);
}

function adjustBrushSizeFromWheel(deltaY: number): void {
  if (deltaY === 0) return;
  const current = Number(brushSize.value);
  const safeCurrent = Number.isFinite(current) ? current : BRUSH_SIZE_MIN;
  const next = Math.max(
    BRUSH_SIZE_MIN,
    Math.min(BRUSH_SIZE_MAX, safeCurrent + (deltaY < 0 ? 1 : -1)),
  );
  if (next === safeCurrent) return;
  brushSize.value = String(next);
  brushSize.dispatchEvent(new Event("input", { bubbles: true }));
}

function positionBrushOptionsFlyout(): void {
  if (brushOptionsFlyout.hidden) return;
  const triggerRect = brushOptionsButton.getBoundingClientRect();
  const flyoutRect = brushOptionsFlyout.getBoundingClientRect();
  const edgePadding = 8;
  const belowTop = triggerRect.bottom + 6;
  const top = belowTop + flyoutRect.height <= window.innerHeight - edgePadding
    ? belowTop
    : Math.max(edgePadding, triggerRect.top - flyoutRect.height - 6);
  const left = Math.min(
    Math.max(edgePadding, triggerRect.left),
    Math.max(edgePadding, window.innerWidth - flyoutRect.width - edgePadding),
  );
  brushOptionsFlyout.style.left = `${left}px`;
  brushOptionsFlyout.style.top = `${top}px`;
}

function setBrushOptionsFlyoutOpen(open: boolean, restoreFocus = false): void {
  brushOptionsFlyout.hidden = !open;
  brushOptionsButton.setAttribute("aria-expanded", String(open));
  brushOptionsButton.classList.toggle("is-active", open);
  if (open) {
    positionBrushOptionsFlyout();
    requestAnimationFrame(positionBrushOptionsFlyout);
  } else {
    brushOptionsFlyout.style.removeProperty("left");
    brushOptionsFlyout.style.removeProperty("top");
    if (restoreFocus) brushOptionsButton.focus();
  }
}

function updateToolOptions(): void {
  normalizeBrushAngleInput();
  const similarityPercent = Number(similarity.value);
  const selectionMode = normalizeColorSelectionMode(
    colorSelectionModeControl.value as ColorSelectionMode,
  );
  toolOptions = {
    brushSize: Number(brushSize.value),
    brushShape: brushShape.value as BrushShape,
    brushAngle: Number(brushAngle.value),
    brushAlgorithm: brushAlgorithm.value as BrushAlgorithm,
    pattern: brushPattern.value as BrushPattern,
    similarity: colorTolerancePercentToDistance(similarityPercent),
    selectionMode,
  };
  const safePercent = Number.isFinite(similarityPercent)
    ? Math.max(0, Math.min(100, Math.round(similarityPercent)))
    : 0;
  similarity.value = String(safePercent);
  similarityValue.value = `${safePercent}%`;
  syncQuickToolControls();
  if (currentBasicTool() === "select-color") syncToolStudio();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
}

function renderBrushPresetOptions(): void {
  const selectedId = brushPreset.value;
  brushPreset.replaceChildren(new Option("Preset", ""));
  for (const preset of brushPresets.list()) {
    brushPreset.append(new Option(preset.name, preset.id));
  }
  brushPreset.value = selectedId;
  translateDraw2Subtree(brushPreset);
}

function persistBrushPresets(): void {
  try {
    window.localStorage.setItem(
      "pixieed:draw2:brush-presets:v1",
      JSON.stringify(brushPresets.list()),
    );
  } catch { /* local persistence is optional */ }
}

function applyBrushPreset(id: string): void {
  if (!id) return;
  const preset = brushPresets.load(id);
  if (preset === undefined) return;
  brushSize.value = String(Math.min(MAX_BRUSH_SIZE, preset.brushSize));
  brushShape.value = preset.brushShape;
  brushAngle.value = String(preset.brushAngle);
  brushAlgorithm.value = preset.brushAlgorithm;
  brushPattern.value = preset.pattern;
  const asset = state.assets[state.activeAssetId];
  if (asset !== undefined && preset.colorIndex < asset.palette.length) {
    selectedColor = preset.colorIndex;
    renderPaletteButtons(asset.palette);
    syncColorEditorFromSelection();
  }
  brushPresetName.value = preset.name;
  updateToolOptions();
  scheduleDraw2EditorPreferencesSave();
  setStatus(
    `Brush preset ${preset.name} loaded · size=${preset.brushSize}`,
  );
}

function saveBrushPreset(): void {
  const name = brushPresetName.value.trim() ||
    `Preset ${brushPresets.list().length + 1}`;
  const id = brushPreset.value || `preset:ui:${Date.now()}`;
  const saved = brushPresets.save({
    id,
    name,
    brushSize: Number(brushSize.value),
    brushShape: brushShape.value as BrushShape,
    brushAngle: Number(brushAngle.value),
    brushAlgorithm: brushAlgorithm.value as BrushAlgorithm,
    pattern: brushPattern.value as BrushPattern,
    dither: "NONE",
    colorIndex: selectedColor,
    // Kept at the schema default for legacy preset compatibility. Brush
    // opacity was never part of the canonical stroke operation.
    opacity: 1,
    schemaVersion: 1,
  });
  persistBrushPresets();
  renderBrushPresetOptions();
  brushPreset.value = saved.id;
  setStatus(`Brush preset ${saved.name} saved locally.`);
}

function deleteBrushPreset(): void {
  const id = brushPreset.value;
  if (!id || !brushPresets.remove(id)) {
    setStatus("Select a saved brush preset before deleting.", "error");
    return;
  }
  persistBrushPresets();
  brushPresetName.value = "Preset 1";
  renderBrushPresetOptions();
  setStatus("Brush preset deleted locally.");
}

toolSelect.addEventListener("change", () => {
  cancelUncommittedSelectionWork(
    "Selection/transform preview cancelled because the tool changed.",
  );
  syncToolButtons();
  syncToolStudio();
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
});
mirrorModeControl.addEventListener("click", () => {
  setMirrorPreset(mirrorEnabled ? "NONE" : "ON");
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(
    !mirrorEnabled
      ? "Mirror mode off."
      : `Mirror mode on · ${mirrorAxisSummary()} · one stroke / one undo`,
  );
});
const toggleMirrorAxis = (axis: MirrorGuideAxis): void => {
  if (mirrorGuideClickSuppressed) {
    mirrorGuideClickSuppressed = false;
    return;
  }
  if (!mirrorEnabled) return;
  setMirrorAxisEnabled(axis, !mirrorAxisEnabled(axis));
  syncQuickToolControls();
  drawOverlay();
  scheduleDraw2EditorPreferencesSave();
  setStatus(
    `Mirror ${mirrorAxisLabel(axis)} ${
      mirrorAxisEnabled(axis) ? "on" : "off"
    } · ${mirrorAxisSummary()}`,
  );
};
mirrorToggleX.addEventListener("click", () => toggleMirrorAxis("x"));
mirrorToggleY.addEventListener("click", () => toggleMirrorAxis("y"));
mirrorToggleDiagonalDown.addEventListener(
  "click",
  () => toggleMirrorAxis("diagonal-down"),
);
mirrorToggleDiagonalUp.addEventListener(
  "click",
  () => toggleMirrorAxis("diagonal-up"),
);
for (const control of [brushPattern, brushShape, similarity]) {
  control.addEventListener("input", updateToolOptions);
}
colorSelectionModeControl.addEventListener("change", updateToolOptions);
for (const control of [brushPattern, brushShape]) {
  control.addEventListener("change", updateToolOptions);
}
brushAngle.addEventListener("input", updateToolOptions);
brushAngle.addEventListener("change", updateToolOptions);
brushAlgorithm.addEventListener("change", updateToolOptions);
brushSize.addEventListener("input", () => {
  normalizeBrushSizeInput();
  updateToolOptions();
});
brushSize.addEventListener("change", () => {
  normalizeBrushSizeInput();
  updateToolOptions();
});
brushSizeControl.addEventListener(
  "wheel",
  (event) => {
    if (event.deltaY === 0) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    adjustBrushSizeFromWheel(event.deltaY);
  },
  { passive: false },
);
brushOptionsButton.addEventListener("click", () => {
  setBrushOptionsFlyoutOpen(Boolean(brushOptionsFlyout.hidden));
});
brushOptionsCloseButton.addEventListener(
  "click",
  () => setBrushOptionsFlyoutOpen(false, true),
);
document.addEventListener("pointerdown", (event) => {
  if (brushOptionsFlyout.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (
    !brushOptionsFlyout.contains(target) &&
    !brushOptionsButton.contains(target)
  ) {
    setBrushOptionsFlyoutOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || brushOptionsFlyout.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  setBrushOptionsFlyoutOpen(false, true);
});
quickControls.addEventListener("scroll", positionBrushOptionsFlyout, {
  passive: true,
});
window.addEventListener("resize", positionBrushOptionsFlyout);
window.addEventListener("scroll", positionBrushOptionsFlyout, true);
brushPreset.addEventListener(
  "change",
  () => applyBrushPreset(brushPreset.value),
);
brushPresetSaveButton.addEventListener("click", saveBrushPreset);
brushPresetDeleteButton.addEventListener("click", deleteBrushPreset);
selectionExpandButton.addEventListener(
  "click",
  () => applySelectionMorphology("EXPAND"),
);
selectionShrinkButton.addEventListener(
  "click",
  () => applySelectionMorphology("SHRINK"),
);
selectionInvertButton.addEventListener(
  "click",
  () => applySelectionMorphology("INVERT"),
);
selectionBorderButton.addEventListener(
  "click",
  () => applySelectionMorphology("BORDER"),
);
renderBrushPresetOptions();
updateToolOptions();
syncToolButtons();
syncToolStudio();
updateSelectionActionButtons();

document.addEventListener("keydown", (event) => {
  const dialogOpen = Array.from(
    document.querySelectorAll<HTMLDialogElement>("dialog"),
  ).some((dialog) => dialog.open);
  if (dialogOpen && event.key === "Escape") {
    const openDialog = Array.from(
      document.querySelectorAll<HTMLDialogElement>("dialog"),
    ).find((dialog) => dialog.open);
    if (openDialog !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDialog.close();
    }
    return;
  }
  if (event.key === "Escape" && drawInteraction !== undefined) {
    event.preventDefault();
    cancelActiveStroke();
    return;
  }
  const creatorMode = document.querySelector<HTMLElement>(
    "#draw2WorkspaceFrame",
  )?.dataset.creatorMode;
  // Audio-200 owns Project/Journal history while the specialized Audio mode
  // is active. Let its workspace handler receive Cmd/Ctrl+Z/Y instead of the
  // Draw shortcut listener consuming the event with stopImmediatePropagation.
  const workspaceAudioOwnsHistory = creatorMode === "AUDIO" &&
    (event.metaKey || event.ctrlKey) &&
    (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") &&
    !event.altKey;
  if (workspaceAudioOwnsHistory) return;
  const inputEditing = event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);
  const workspaceMode = creatorMode === "DRAW" || creatorMode === "ANIMATE" ||
    creatorMode === "GAME" || creatorMode === "AUDIO";
  const spaceKey = event.code === "Space" || event.key === " ";
  const workspacePlaybackSpace = spaceKey && !event.repeat &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
    workspaceMode && !dialogOpen && !event.isComposing;
  // Space playback is owned by the mode-aware Workspace module. Returning
  // here prevents Draw's legacy Space shortcut from leaking into GAME/AUDIO.
  if (workspacePlaybackSpace) return;
  const drawWorkspaceMode = creatorMode === undefined ||
    creatorMode === "DRAW" || creatorMode === "ANIMATE";
  // GAME/AUDIO/ASSET/EXPORT have their own keyboard owners. Draw's legacy
  // command registry must never change a hidden Draw tool or timeline there.
  if (!drawWorkspaceMode) return;
  const interactiveTarget = isInteractiveKeyboardTarget(event.target);
  const selectionNudgeKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]);
  const activeDrawGesture = drawInteraction !== undefined ||
    selectionDraft !== undefined || pendingSelectionGesture !== undefined ||
    selectionFrameDrag !== undefined || selectionDrag !== undefined ||
    transformSession !== undefined;
  if (
    !inputEditing && !interactiveTarget && !event.defaultPrevented &&
    !event.metaKey && !event.ctrlKey && !event.altKey &&
    activeDrawGesture && selectionNudgeKeys.has(event.key)
  ) {
    // Never change the active frame/layer while a stroke, selection drag, or
    // transform preview owns the editor. The gesture can finish or cancel
    // explicitly; raw arrows are consumed until then.
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (
    !inputEditing && !interactiveTarget && !event.defaultPrevented &&
    selection !== undefined && selectionToolCanMove() &&
    drawInteraction === undefined && selectionDraft === undefined &&
    pendingSelectionGesture === undefined && selectionFrameDrag === undefined &&
    selectionDrag === undefined &&
    transformSession === undefined &&
    selectionNudgeKeys.has(event.key) && !event.metaKey && !event.ctrlKey &&
    !event.altKey
  ) {
    const step = event.shiftKey ? 8 : 1;
    const dx = event.key === "ArrowLeft"
      ? -step
      : event.key === "ArrowRight"
      ? step
      : 0;
    const dy = event.key === "ArrowUp"
      ? -step
      : event.key === "ArrowDown"
      ? step
      : 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    nudgeCommittedSelection(dx, dy);
    return;
  }
  const shortcut = resolveDraw2Shortcut(event, {
    modalOpen: dialogOpen,
    sheetOpen: false,
    inputEditing: inputEditing || interactiveTarget,
    imeComposing: event.isComposing,
  });
  if (shortcut === undefined) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runDraw2Shortcut(shortcut.command, event);
});

function updateColorDraftFromSliders(): void {
  setColorEditorRgb({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value),
  });
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0は透明色です"
      : "Color preview · release to commit",
  );
}

function updateColorDraftFromAlpha(): void {
  colorDraftAlpha = Math.max(
    0,
    Math.min(255, Math.round(Number(colorAlpha.value))),
  );
  colorAlphaValue.value = String(Math.round(colorDraftAlpha / 255 * 100));
  colorDraftDirty = true;
  requestColorPreviewRender();
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0は透明色です"
      : "Color preview · release to commit",
  );
}

colorR.addEventListener("input", updateColorDraftFromSliders);
colorG.addEventListener("input", updateColorDraftFromSliders);
colorB.addEventListener("input", updateColorDraftFromSliders);
colorAlpha.addEventListener("input", updateColorDraftFromAlpha);
for (const control of [colorR, colorG, colorB]) {
  control.addEventListener("pointerup", () => {
    void commitColorEdit();
  });
  control.addEventListener("change", () => {
    void commitColorEdit();
  });
}
colorAlpha.addEventListener("pointerup", () => {
  void commitColorEdit();
});
colorAlpha.addEventListener("change", () => {
  void commitColorEdit();
});
colorHex.addEventListener("input", () => {
  const parsed = parseHexColor(colorHex.value);
  colorApply.disabled = parsed === undefined || selectedColor === 0;
  if (parsed === undefined) {
    setColorEditorStatus("HEXは #RRGGBB で入力してください", "error");
    return;
  }
  setColorEditorRgb(parsed);
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0は透明色です"
      : "Color preview · release to commit",
  );
});
colorHex.addEventListener("change", () => {
  void commitColorEdit();
});
colorHex.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void commitColorEdit();
  }
});
colorApply.addEventListener("click", () => {
  void commitColorEdit();
});
for (
  const control of [
    colorRampEndControl,
    colorRampStepsControl,
    colorRampSpaceControl,
    colorRampHueControl,
  ]
) {
  control.addEventListener("input", () => {
    renderColorRampPreview(state.assets[state.activeAssetId]?.palette ?? []);
  });
  control.addEventListener("change", () => {
    renderColorRampPreview(state.assets[state.activeAssetId]?.palette ?? []);
  });
}
colorRampCreateControl.addEventListener("click", () => {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) return;
  const start = asset.palette[selectedColor] ?? asset.palette[0] ?? 0;
  const endIndex = Number(colorRampEndControl.value);
  const end = asset.palette[endIndex] ?? start;
  const space = colorRampSpaceControl.value === "RGB" ? "RGB" : "HSV";
  const hueMode = colorRampHueControl.value === "LONG" ? "LONG" : "SHORT";
  const ramp = createArgbColorRamp(
    start,
    end,
    Number(colorRampStepsControl.value),
    space as ColorRampSpace,
    hueMode as ColorRampHueMode,
  );
  const drafts = ramp.map((color) => {
    const channels = decodeArgbColor(color);
    return {
      color: { r: channels.red, g: channels.green, b: channels.blue },
      alpha: channels.alpha,
    };
  });
  void appendPaletteGridFromDrafts(drafts);
});
outlineApplyControl.addEventListener("click", () => {
  void applyOutline();
});
textInsertControl.addEventListener("click", () => {
  void commitTextInsert();
});
textCancelControl.addEventListener("click", () => {
  pendingTextBounds = undefined;
  pendingTextDraft = undefined;
  pendingTextTarget = undefined;
  textInsertDialogControl.close();
  drawOverlay();
});
textInsertDialogControl.addEventListener("cancel", () => {
  pendingTextBounds = undefined;
  pendingTextDraft = undefined;
  pendingTextTarget = undefined;
  drawOverlay();
});
textFitBoundsControl.addEventListener("click", fitTextBoundsToContent);
textBoundsWidthControl.addEventListener("input", updateTextBoundsFromControls);
textBoundsHeightControl.addEventListener("input", updateTextBoundsFromControls);
for (const control of [
  textValueControl,
  textFontControl,
  textSizeControl,
  textWeightControl,
  textAlignControl,
  textFillColorControl,
  textStrokeEnabledControl,
  textStrokeColorControl,
  textStrokeWidthControl,
  textThresholdControl,
]) {
  control.addEventListener("input", refreshTextPreview);
  control.addEventListener("change", refreshTextPreview);
}
window.addEventListener("pointermove", updatePaletteAddPointer, {
  passive: false,
});
window.addEventListener("pointerup", finishPaletteAddPointer);
window.addEventListener("pointercancel", cancelPaletteAddPointer);

let paletteWheelPointerId: number | undefined;
let paletteWheelPointerMode: "hue" | "sv" | undefined;
colorMap.addEventListener("pointerdown", (event) => {
  if (event.cancelable) event.preventDefault();
  const point = paletteWheelPointFromClient(event.clientX, event.clientY);
  if (point === undefined) return;
  const size = point.size;
  const metrics = getPaletteWheelMetrics(size);
  paletteWheelPointerMode = isPointInsidePaletteSv(point.x, point.y, metrics)
    ? "sv"
    : "hue";
  paletteWheelPointerId = event.pointerId;
  colorMap.setPointerCapture(event.pointerId);
  setColorEditorFromWheel(
    event.clientX,
    event.clientY,
    paletteWheelPointerMode,
  );
});
colorMap.addEventListener("pointermove", (event) => {
  if (
    paletteWheelPointerId !== event.pointerId ||
    paletteWheelPointerMode === undefined
  ) return;
  if (event.cancelable) event.preventDefault();
  setColorEditorFromWheel(
    event.clientX,
    event.clientY,
    paletteWheelPointerMode,
  );
});
const finishPaletteWheelPointer = (
  event: PointerEvent,
  commit: boolean,
): void => {
  if (paletteWheelPointerId !== event.pointerId) return;
  paletteWheelPointerId = undefined;
  paletteWheelPointerMode = undefined;
  if (colorMap.hasPointerCapture(event.pointerId)) {
    colorMap.releasePointerCapture(event.pointerId);
  }
  if (commit) void commitColorEdit();
  else syncColorEditorFromSelection();
};
colorMap.addEventListener("pointerup", (event) => {
  finishPaletteWheelPointer(event, true);
});
colorMap.addEventListener("pointercancel", (event) => {
  finishPaletteWheelPointer(event, false);
});
colorMap.addEventListener("lostpointercapture", () => {
  paletteWheelPointerId = undefined;
  paletteWheelPointerMode = undefined;
});
colorMap.addEventListener("keydown", (event) => {
  if (
    !(event.key === "ArrowLeft" || event.key === "ArrowRight" ||
      event.key === "ArrowUp" || event.key === "ArrowDown")
  ) return;
  event.preventDefault();
  const current = rgbToHsv({
    r: Number(colorR.value),
    g: Number(colorG.value),
    b: Number(colorB.value),
  });
  const hueDelta = event.key === "ArrowLeft"
    ? -5
    : event.key === "ArrowRight"
    ? 5
    : 0;
  const valueDelta = event.key === "ArrowUp"
    ? 0.05
    : event.key === "ArrowDown"
    ? -0.05
    : 0;
  setColorEditorRgb(
    hsvToRgb({
      h: current.h + hueDelta,
      s: current.s,
      v: Math.max(0, Math.min(1, current.v + valueDelta)),
    }),
  );
  colorApply.disabled = selectedColor === 0;
  setColorEditorStatus(
    selectedColor === 0
      ? "Index 0は透明色です"
      : "Color preview · release to commit",
  );
});
colorMap.addEventListener("keyup", (event) => {
  if (
    event.key === "ArrowLeft" || event.key === "ArrowRight" ||
    event.key === "ArrowUp" || event.key === "ArrowDown"
  ) void commitColorEdit();
});

gamePreviewStartControl.addEventListener("click", () => {
  void startGamePreview("LIVE");
});
goldenProjectApplyButton.addEventListener("click", () => {
  const workspace = getWorkspacePxdBridge();
  goldenProjectApplyButton.disabled = true;
  goldenProjectApplyButton.setAttribute("aria-busy", "true");
  void (async () => {
    try {
      const result = await workspace.applyGoldenProject?.("LIVE");
      if (result === undefined) {
        throw new Error("Golden Project workspace adapter is unavailable.");
      }
      if (!result.ok || result.value === undefined) {
        throw new Error(
          result.diagnostics.map((item) => item.message).join(" ") ||
            "Golden Project could not be applied.",
        );
      }
      goldenProjectStatusElement.textContent =
        "APPLIED · 主人公SpriteとAudio SourceをGameへ保存しました";
      goldenProjectRefsElement.textContent =
        `Game配置: ${result.value.project.scenes[0]?.entities.length ?? 0} · ` +
        `Refs: ${result.value.manifest.assetLocks.length} · Project別自動保存`;
      setGamePreviewStatus(
        "Golden Project applied · Draw Sprite + Audio Source are ready",
      );
    } catch (cause) {
      goldenProjectStatusElement.textContent = cause instanceof Error
        ? `APPLY BLOCKED · ${cause.message}`
        : "APPLY BLOCKED · Golden Project could not be applied.";
      setGamePreviewStatus(
        cause instanceof Error ? cause.message : "Golden Project apply failed.",
        "error",
      );
    } finally {
      goldenProjectApplyButton.disabled = false;
      goldenProjectApplyButton.removeAttribute("aria-busy");
    }
  })();
});
gamePreviewStopControl.addEventListener("click", () => {
  getWorkspacePxdBridge().stopGoldenAudioPreview?.();
  if (gameGenrePlayableState !== undefined) {
    gameGenrePlayableState = stopGameGenre(gameGenrePlayableState);
    drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
    return;
  }
  if (game351PlayableState === undefined) return;
  game351PlayableState = stopGame351(game351PlayableState);
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
gamePreviewRestartControl.addEventListener("click", () => {
  if (gameGenrePlayableState !== undefined) {
    const project = getWorkspacePxdBridge().gameCurrentProject?.();
    if (project === undefined) {
      setGamePreviewStatus(
        "Game Projectを読み込めません。Sceneを保存してからRestartしてください。",
        "error",
      );
      return;
    }
    gameGenrePlayableState = restartGameGenre(project);
    drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
    return;
  }
  if (game351PlayableState === undefined) {
    void startGamePreview("LIVE");
    return;
  }
  game351PlayableState = restartGame351(game351PlayableState);
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
gamePreviewReloadControl.addEventListener("click", () => {
  void startGamePreview("LIVE");
});
gamePreviewPinControl.addEventListener("click", () => {
  const workspace = getWorkspacePxdBridge();
  void (async () => {
    const applied = await workspace.applyGoldenProject?.("PINNED");
    if (applied !== undefined && !applied.ok) {
      setGamePreviewStatus(
        applied.diagnostics.map((item) => item.message).join(" ") ||
          "Pinned Golden Project could not be applied.",
        "error",
      );
      return;
    }
    await startGamePreview("PINNED");
  })().catch((cause) => {
    setGamePreviewStatus(
      cause instanceof Error ? cause.message : "Pinned Preview failed.",
      "error",
    );
  });
});
gamePreviewCanvas.addEventListener("keydown", handleGame351PreviewKey);
gamePreviewCanvas.addEventListener("keydown", handleGameGenrePreviewKey);
gamePreviewCanvas.addEventListener("click", () => {
  gamePreviewCanvas.focus();
  if (gameGenrePlayableState !== undefined) {
    gameGenrePlayableState = stepGameGenre(gameGenrePlayableState, {
      interact: true,
      tap: true,
    });
    drawGameGenrePreview(gameGenrePlayableState, gameGenrePreviewMode);
    return;
  }
  if (game351PlayableState === undefined) return;
  game351PlayableState = triggerGame351Action(
    game351PlayableState,
    String(GAME351_TAP_ACTION),
    game351Behaviors,
  );
  drawGame351Preview(game351PlayableState, game351PreviewMode);
});
let advancedModule: AdvancedModule | undefined;
let advancedOverlayState:
  | ReturnType<AdvancedModule["defaultOverlayState"]>
  | undefined;
let advancedPreviewOperationId: string | undefined;

function advancedTarget(): CanonicalPixelTarget {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) {
    throw new Error("Active Draw2 Asset is unavailable.");
  }
  return {
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    tileSize: asset.raster.tileSize,
    palette: asset.palette,
    readPixel: (x, y) => asset.raster.getPixel(x, y),
  };
}

function setAdvancedStatus(
  message: string,
  kind: "ready" | "error" = "ready",
): void {
  advancedStatus.textContent = translateDraw2Text(message, draw2Locale);
  advancedStatus.dataset.state = kind;
}

function advancedControlsEnabled(enabled: boolean): void {
  for (
    const control of [
      advancedPatternControl,
      advancedMirrorControl,
      advancedGridControl,
      advancedGuideControl,
    ]
  ) control.disabled = !enabled;
}

async function ensureAdvancedModule(): Promise<AdvancedModule | undefined> {
  if (advancedModule !== undefined) return advancedModule;
  advancedLoadControl.disabled = true;
  setAdvancedStatus("Loading isolated Advanced Tools chunk…");
  try {
    advancedModule = await loadAdvancedModule();
    advancedOverlayState = advancedModule.defaultOverlayState();
    advancedControlsEnabled(true);
    advancedLoadControl.textContent = "Advanced Tools Loaded";
    setAdvancedStatus(
      "Advanced Core ready · Preview is local-only; Commit uses the separate Editor Adapter.",
    );
    return advancedModule;
  } catch (cause) {
    advancedLoadControl.disabled = false;
    setAdvancedStatus(
      cause instanceof Error
        ? cause.message
        : "Advanced Tools chunk unavailable.",
      "error",
    );
    return undefined;
  }
}

advancedLoadControl.addEventListener("click", () => {
  void ensureAdvancedModule();
});
advancedPatternControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === undefined) return;
    const operation = module.planPatternBrushStroke(advancedTarget(), [{
      x: 16,
      y: 16,
    }, { x: 64, y: 64 }], {
      width: 2,
      height: 2,
      pixels: [1, 0, 0, 1],
      palette: [0, 0xffffffff, 0xff0000ff],
      transparentIndex: 0,
    }, {
      anchorX: 0,
      anchorY: 0,
      repeat: "REPEAT_XY",
      transparent: "SKIP",
      clipping: "CLIP",
    });
    if (!operation.ok) {
      setAdvancedStatus(
        `Pattern preview blocked · ${
          operation.diagnostics[0]?.code ?? "UNKNOWN"
        }`,
        "error",
      );
      return;
    }
    advancedPreviewOperationId = operation.value.operationId;
    setAdvancedStatus(
      `Pattern preview planned · writes=${operation.value.writes.length} · dirtyTiles=${operation.value.dirtyTiles.length} · undo=none`,
    );
  })();
});
advancedMirrorControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === undefined) return;
    const mirror = module.planMirror(advancedTarget(), [{
      x: 24,
      y: 24,
      colorIndex: selectedColor,
    }], { horizontal: true, vertical: false, axisX2: 128, clipping: "CLIP" });
    if (!mirror.ok) {
      setAdvancedStatus(
        `Mirror preview blocked · ${mirror.diagnostics[0]?.code ?? "UNKNOWN"}`,
        "error",
      );
      return;
    }
    advancedPreviewOperationId = mirror.value.operationId;
    setAdvancedStatus(
      `Mirror operation planned · writes=${mirror.value.writes.length} · axis=half-pixel-safe · undo=atomic`,
    );
  })();
});
advancedGridControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === undefined || advancedOverlayState === undefined) return;
    const next = module.toggleGrid(
      advancedOverlayState,
      !advancedOverlayState.grid.enabled,
    );
    advancedOverlayState = next.state;
    setAdvancedStatus(
      `Grid ${next.state.grid.enabled ? "ON" : "OFF"} · invalidation=${
        next.invalidated.join(",")
      } · raster hash unchanged`,
    );
  })();
});
advancedGuideControl.addEventListener("click", () => {
  void (async () => {
    const module = await ensureAdvancedModule();
    if (module === undefined || advancedOverlayState === undefined) return;
    const guide = module.addGuide(advancedOverlayState, {
      guideId: `guide-local-${Date.now()}`,
      orientation: "HORIZONTAL",
      position: 32,
      visible: true,
      shared: false,
    });
    if (!guide.ok) {
      setAdvancedStatus(
        `Guide blocked · ${guide.diagnostics[0]?.code ?? "UNKNOWN"}`,
        "error",
      );
      return;
    }
    advancedOverlayState = guide.value;
    setAdvancedStatus(
      `Guide added as local overlay · count=${advancedOverlayState.guides.length} · not a PiXYNC operation`,
    );
  })();
});

const DRAW2_RECENT_PROJECTS_STORAGE_KEY =
  "pixiedraw2:recent-projects:v1" as const;
const DRAW2_RECENT_PROJECT_LIMIT = 8;

interface Draw2RecentProject {
  readonly projectId: WorkspaceProjectId;
  readonly name: string;
  readonly updatedAt: string;
}

function readRecentProjects(): Draw2RecentProject[] {
  try {
    const raw = window.localStorage.getItem(
      DRAW2_RECENT_PROJECTS_STORAGE_KEY,
    );
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const projects: Draw2RecentProject[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (entry === null || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.projectId !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.updatedAt !== "string"
      ) continue;
      try {
        const projectId = asWorkspaceProjectId(candidate.projectId);
        if (seen.has(projectId)) continue;
        seen.add(projectId);
        projects.push({
          projectId,
          name: candidate.name.trim() || `Draw2 ${candidate.projectId}`,
          updatedAt: candidate.updatedAt,
        });
      } catch {
        // Ignore malformed entries from an unavailable or old local index.
      }
    }
    return projects
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, DRAW2_RECENT_PROJECT_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentProjects(projects: readonly Draw2RecentProject[]): void {
  try {
    window.localStorage.setItem(
      DRAW2_RECENT_PROJECTS_STORAGE_KEY,
      JSON.stringify(projects.slice(0, DRAW2_RECENT_PROJECT_LIMIT)),
    );
  } catch {
    // The editor remains usable when local storage is unavailable.
  }
}

function rememberRecentProject(
  projectId: WorkspaceProjectId,
  name: string,
): void {
  const next: Draw2RecentProject = {
    projectId,
    name: name.trim() || `Draw2 ${projectId}`,
    updatedAt: new Date().toISOString(),
  };
  const projects = [
    next,
    ...readRecentProjects().filter((item) => item.projectId !== projectId),
  ];
  writeRecentProjects(projects);
}

function setProjectStartStatus(message: string, isError = false): void {
  if (projectStartStatusElement === null) return;
  projectStartStatusElement.textContent = message;
  projectStartStatusElement.dataset.state = isError ? "error" : "ready";
}

const deletingProjectIds = new Set<string>();

async function deleteRecentProject(project: Draw2RecentProject): Promise<void> {
  const projectId = asWorkspaceProjectId(project.projectId);
  const isPixyncProject = PIXYNC_ROOM_ID.test(projectId);
  if (state.projectId === projectId) {
    setProjectStartStatus(
      "編集中のProjectは削除できません。先に別のProjectを開いてください。",
      true,
    );
    return;
  }
  if (deletingProjectIds.has(projectId)) return;
  if (!window.confirm(`「${project.name}」の端末内データを削除しますか？`)) return;

  deletingProjectIds.add(projectId);
  setProjectStartStatus("Project dataを安全に削除しています…");
  try {
    if (isPixyncProject) {
      const client = await availablePixyncSupabaseClient();
      if (client === undefined) {
        setProjectStartStatus(
          "共有Projectを削除するには、PiXYNCへログインしている必要があります。Project dataは残しています。",
          true,
        );
        return;
      }
      try {
        const detachResult = await detachPixyncProject(client, projectId);
        setProjectStartStatus(
          detachResult.action === "participant_left"
            ? "共有Projectから退出しました。端末内のProject dataを削除しています…"
            : "共有Projectの終了を確認しました。端末内のProject dataを削除しています…",
        );
      } catch (error) {
        const message = error instanceof PixyncProjectDeletionError &&
            error.code === "LOCALIZATION_REQUIRED"
          ? "所有者の共有Projectは、ローカライズ済みの端末コピーを確定してから削除できます。共有Project画面でCheckpointを確定してください。"
          : error instanceof PixyncProjectDeletionError &&
              error.code === "AUTHENTICATION_REQUIRED"
          ? "共有Projectを削除するには、PiXYNCへログインしている必要があります。"
          : error instanceof Error
          ? `共有Projectを削除できませんでした。${error.message}`
          : "共有Projectを削除できませんでした。";
        setProjectStartStatus(`${message} Project dataは残しています。`, true);
        return;
      }
    }
    const storage = await loadProjectDataStorageModule();
    const gameStore = storage.createIndexedDbGameEditorPersistenceStore();
    const ports: WorkspaceProjectDataDeletionPorts = {
      draw: {
        clear: (id) => drawPersistenceStore.clear(id),
      },
      audio: {
        clear: (id) =>
          storage.deleteIndexedDbAudioProjectData(String(id)),
      },
      game: {
        clear: (id) => gameStore.clear(String(id)),
      },
      pixync: {
        clear: async (id) => {
          return await pixyncPersistenceFor(String(id)).remove();
        },
      },
      manifest: {
        clear: (id) => workspaceManifestStore.clear(id),
      },
    };
    const result = await deleteWorkspaceProjectLocalData(projectId, ports);
    if (!result.ok) {
      setProjectStartStatus(
        `Project dataを削除できませんでした（${result.failed.join(", ")}）。データは残しているため、再試行できます。`,
        true,
      );
      return;
    }
    writeRecentProjects(readRecentProjects().filter((item) =>
      item.projectId !== projectId
    ));
    const preferences = withoutDraw2ProjectEditorPreferences(
      draw2EditorPreferences,
      projectId,
    );
    draw2EditorPreferences = preferences;
    writeDraw2EditorPreferences(window.localStorage, preferences);
    if (readActiveWorkspaceProjectId() === projectId) {
      writeActiveWorkspaceProjectId(asWorkspaceProjectId(DEFAULT_WORKSPACE_PROJECT_ID));
    }
    renderProjectStart();
    setProjectStartStatus(`「${project.name}」を削除しました。`);
  } catch (cause) {
    setProjectStartStatus(
      cause instanceof Error
        ? `Project dataを削除できませんでした。${cause.message}`
        : "Project dataを削除できませんでした。データは残しています。",
      true,
    );
  } finally {
    deletingProjectIds.delete(projectId);
  }
}

let projectStartMode: CreatorStartMode = resolveCreatorStartMode(
  new URLSearchParams(window.location.search).get("mode"),
);

function setProjectStartMode(mode: CreatorStartMode): void {
  projectStartMode = mode;
  for (const button of projectStartModeButtons) {
    const selected = button.dataset.projectStartMode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

setProjectStartMode(projectStartMode);

function formatRecentProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Local project";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function renderProjectStart(): void {
  if (projectStartRecentListElement === null) return;
  const activeProjectId = readActiveWorkspaceProjectId();
  const projects = readRecentProjects();
  if (
    projects.length === 0 &&
    activeProjectId !== DEFAULT_WORKSPACE_PROJECT_ID
  ) {
    projects.push({
      projectId: activeProjectId,
      name: `Draw2 ${activeProjectId}`,
      updatedAt: new Date().toISOString(),
    });
  }
  projectStartRecentListElement.replaceChildren();
  if (projectStartRecentCountElement !== null) {
    projectStartRecentCountElement.textContent = `${projects.length} project${
      projects.length === 1 ? "" : "s"
    }`;
  }
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "draw2-project-start-status";
    empty.textContent = "No recent projects yet. Start a new project above.";
    projectStartRecentListElement.append(empty);
    return;
  }
  for (const project of projects) {
    const item = document.createElement("div");
    item.className = "draw2-project-recent-item-row";
    item.dataset.projectId = project.projectId;
    item.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draw2-project-recent-item";
    button.setAttribute("aria-label", `${project.name}を開く`);
    const name = document.createElement("strong");
    name.textContent = project.name;
    const meta = document.createElement("small");
    meta.textContent = `${PIXYNC_ROOM_ID.test(project.projectId) ? "PiXYNC shared" : "Local Project"} · ${
      formatRecentProjectDate(project.updatedAt)
    }`;
    meta.title = project.projectId;
    meta.setAttribute("aria-label", `Project ID ${project.projectId}`);
    button.append(name, meta);
    button.addEventListener("click", () => {
      resolveProjectStart({
        projectIdOverride: project.projectId,
        mode: "OPEN",
        initialCreatorMode: projectStartMode,
      });
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "draw2-project-recent-delete";
    deleteButton.textContent = "削除";
    deleteButton.setAttribute("aria-label", `${project.name}を削除`);
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteRecentProject(project);
    });
    item.append(button, deleteButton);
    projectStartRecentListElement.append(item);
  }
}

let resolveProjectStartRequest:
  | ((settings: CanvasProjectSettings) => void)
  | undefined;

function resolveProjectStart(settings: CanvasProjectSettings): void {
  if (resolveProjectStartRequest === undefined) return;
  const resolve = resolveProjectStartRequest;
  resolveProjectStartRequest = undefined;
  if (projectStartElement !== null) projectStartElement.hidden = true;
  if (workspaceFrameElement !== null) workspaceFrameElement.hidden = false;
  resolve(settings);
}

function waitForProjectStart(): Promise<CanvasProjectSettings> {
  if (projectStartElement === null || workspaceFrameElement === null) {
    return Promise.resolve({});
  }
  renderProjectStart();
  projectStartElement.hidden = false;
  workspaceFrameElement.hidden = true;
  setProjectStartStatus("");
  return new Promise((resolve) => {
    resolveProjectStartRequest = resolve;
  });
}

async function startFreshProject(mode: CreatorStartMode): Promise<void> {
  setProjectStartMode(mode);
  setProjectStartStatus("Preparing a blank project…");
  try {
    const projectId = await createFreshWorkspaceProjectId();
    resolveProjectStart({
      projectIdOverride: projectId,
      mode: "NEW",
      initialCreatorMode: mode,
    });
  } catch (cause) {
    setProjectStartStatus(
      cause instanceof Error
        ? cause.message
        : "A new project could not be created.",
      true,
    );
  }
}

for (const button of projectStartModeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.projectStartMode?.trim().toUpperCase();
    if (isCreatorStartMode(mode)) void startFreshProject(mode);
  });
}

function openProjectFromStart(): void {
  const raw = projectStartIdElement?.value.trim() ?? "";
  try {
    const projectId = asWorkspaceProjectId(raw || DEFAULT_WORKSPACE_PROJECT_ID);
    resolveProjectStart({
      projectIdOverride: projectId,
      mode: "OPEN",
      initialCreatorMode: projectStartMode,
    });
  } catch {
    setProjectStartStatus(
      "Project ID must start with a letter or number and use stable identifier characters.",
      true,
    );
  }
}

projectStartOpenButton?.addEventListener("click", openProjectFromStart);
projectStartIdElement?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    openProjectFromStart();
  }
});

async function resolveInitialProjectSettings(): Promise<CanvasProjectSettings> {
  try {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const projectId = (params.get("projectId") ?? params.get("project"))?.trim();
    if (projectId !== undefined && projectId.length > 0) {
      const intent = createProjectStartIntent({
        projectId,
        kind: "OPEN",
        mode: requestedMode,
      });
      return {
        ...(intent.projectId === undefined
          ? {}
          : { projectIdOverride: intent.projectId }),
        ...(params.get("projectName")?.trim() === undefined
          ? {}
          : { projectNameOverride: params.get("projectName")!.trim() }),
        mode: intent.kind,
        initialCreatorMode: intent.mode,
      };
    }
    if (params.get("new_project") === "1") {
      const freshProjectId = await createFreshWorkspaceProjectId();
      const intent = createProjectStartIntent({
        kind: "NEW",
        mode: requestedMode,
      });
      return {
        projectIdOverride: freshProjectId,
        mode: intent.kind,
        initialCreatorMode: intent.mode,
      };
    }
  } catch {
    // A malformed or unavailable URL must keep the normal local entry path.
  }
  return {};
}

void resolveInitialProjectSettings().then(async (settings) => {
  const hasDirectProjectTarget = settings.mode !== undefined ||
    settings.projectIdOverride !== undefined;
  if (hasDirectProjectTarget) {
    if (projectStartElement !== null) projectStartElement.hidden = true;
    if (workspaceFrameElement !== null) workspaceFrameElement.hidden = false;
    return settings;
  }
  return await waitForProjectStart();
}).then(async (settings) => {
  await resetProject(settings);
  await startPixyncProjectLifecycle();
  return {
    module: await loadWorkspaceModule(),
    initialProjectMode: settings.mode,
    initialCreatorMode: settings.initialCreatorMode,
  };
}).then(async ({ module, initialProjectMode, initialCreatorMode }) => {
  const result = module.bootstrapDraw2Workspace(document, {
    projectId: state.projectId,
    ...(initialProjectMode === undefined ? {} : { initialProjectMode }),
    ...(initialCreatorMode === undefined ? {} : { initialCreatorMode }),
  });
  if (!result.ok) {
    setStatus(result.reason ?? "Workspace layer unavailable.", "error");
    return;
  }
  const workspaceDebug = (window as Window & {
    __pixiedraw2WorkspaceDebug?: Partial<WorkspacePxdBridge>;
  }).__pixiedraw2WorkspaceDebug;
  if (workspaceDebug !== undefined) {
    workspaceDebug.exportProjectPxdArtifact =
      exportCurrentPxdArtifactForWorkspace;
  }
  // The lazy Workspace chunk mounts Audio/Draw/Game labels after the initial
  // locale pass. Translate only the mounted workspace once; do not rescan the
  // entire document or install a MutationObserver on the live editor.
  const workspaceFrame = document.querySelector<HTMLElement>(
    "#draw2WorkspaceFrame",
  );
  if (workspaceFrame !== null) translateDraw2Subtree(workspaceFrame);
  // Consume Market delivery only after the Workspace chunk has mounted. The
  // normal project/new-project URL paths therefore keep their existing order,
  // while integrated PXD imports can restore Audio/Game safely.
  await importMarketPurchaseFromUrl();
  // Workspace bootstrap moves the Timeline into its final slot and applies
  // the desktop profile after the first project render.
  // Reproject once after layout settles so frame 1 uses the same label/cell
  // geometry on first paint as it does after a later timeline command.
  window.requestAnimationFrame(() => {
    renderTimeline();
    window.requestAnimationFrame(() => renderTimeline());
  });
  void startLocalProjectSession(
    state.projectId,
    initialCreatorMode ?? "DRAW",
  ).catch(() => {
    document.body.dataset.projectSessionStatus = "unavailable";
    window.dispatchEvent(
      new CustomEvent("draw2:pixync-status", {
        detail: {
          state: "offline",
          roomId: "local",
          revision: "—",
          members: "—",
          message:
            "Project Sessionを読み込めませんでした。ローカル編集を継続します。",
        },
      }),
    );
  });
  void queuePixyncProductionStart();
}).catch((cause) => {
  setStatus(
    cause instanceof Error ? cause.message : "Workspace layer unavailable.",
    "error",
  );
});
