import type {
  AssetAnimationName,
  AssetAnimationFrameReference,
  AssetAnimationFrameRasterSnapshot,
  AssetDirectionName,
  AssetLoopMode,
  AssetPivot,
  CreatorAssetKind,
} from "./draw2-creator-workspace.ts";
import type { PxdAssetDefinitionEntry } from "./draw2-export.ts";
import type { SelectionShapeKind } from "./draw2-selection.ts";
import type { AssetPackageManifest } from "./game/game-350/assetization.ts";

export const DRAW2_ASSET_STATE_CHANGED_EVENT =
  "draw2:asset-state-changed" as const;

export interface Draw2AssetSelectionSnapshot {
  readonly hasSelection: boolean;
  readonly pixelCount: number;
  readonly kind: SelectionShapeKind | null;
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly sourceCanvasId: string | null;
  readonly layerId: string | null;
  readonly frameId: string | null;
  readonly frameNumber: number | null;
}

export interface Draw2AssetBridgeSnapshot {
  readonly projectId: string;
  readonly selection: Draw2AssetSelectionSnapshot;
  readonly frameNumbers: Readonly<Record<string, number>>;
  /** Source Frame display durations, when the Draw timeline provides them. */
  readonly frameDurationsMs?: Readonly<Record<string, number>>;
  readonly layers: readonly {
    readonly layerTrackId: string;
    readonly name: string;
    readonly visible: boolean;
  }[];
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly assetPackages: readonly AssetPackageManifest[];
}

export interface Draw2AssetReferenceProjection {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Stable metadata reference for iGAME without transferring Draw raster bytes. */
export interface Draw2AssetReferenceRecord {
  readonly kind: "DRAW";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly mode: "LIVE" | "PINNED";
  readonly label: string;
  /** Project identity is retained so local references cannot cross Projects. */
  readonly projectId?: string;
  /** Local, registered, and Market references are different authority scopes. */
  readonly referenceScope?: "LOCAL_PROJECT" | "REGISTERED" | "MARKET";
  /** Optional local Asset Definition identity for named Draw -> Game binding. */
  readonly assetDefinitionId?: string;
}

export type Draw2AssetMutationResult =
  | { readonly ok: true; readonly entry: PxdAssetDefinitionEntry }
  | { readonly ok: false; readonly message: string };

export type Draw2AssetPackageMutationResult =
  | { readonly ok: true; readonly manifest: AssetPackageManifest }
  | { readonly ok: false; readonly message: string };

export type Draw2AssetMarketHandoffResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export interface Draw2AssetBridge {
  readonly snapshot: () => Draw2AssetBridgeSnapshot;
  /** Resolve the active Draw revision for an iGAME binding. */
  readonly resolveCurrentReference: (input: {
    readonly mode: "LIVE" | "PINNED";
  }) => Promise<Draw2AssetReferenceRecord | undefined>;
  /** Resolve a named Draw Asset Definition for an iGAME binding. */
  readonly resolveDefinitionReference: (input: {
    readonly definitionId: string;
    readonly mode: "LIVE" | "PINNED";
  }) => Promise<Draw2AssetReferenceRecord | undefined>;
  /** Render a saved source reference without changing the active Draw frame. */
  readonly renderReference: (input: {
    readonly sourceFrameId: string;
    readonly layerIds?: readonly string[];
    /** Select a fixed snapshot from one local Asset Definition. */
    readonly assetDefinitionId?: string;
    readonly rect: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    /** Prefer a captured image over the live Draw document when supplied. */
    readonly rasterSnapshot?: AssetAnimationFrameRasterSnapshot;
  }) => Draw2AssetReferenceProjection | undefined;
  /** Capture the current selection as a fixed visible-frame composite. */
  readonly captureSelection: () => Draw2AssetReferenceProjection | undefined;
  /** Capture the same selection from another source Frame without activating it. */
  readonly captureSelectionForFrame: (
    frameId: string,
  ) => Draw2AssetReferenceProjection | undefined;
  /** Capture several source Frames with one stable selection mask. */
  readonly captureSelectionForFrames: (
    frameIds: readonly string[],
  ) => readonly Draw2AssetReferenceProjection[] | undefined;
  /** Prepare the Draw canvas for a fresh rectangle selection. */
  readonly prepareSelection: () => void;
  /** Create a metadata-only Asset so empty Cells can be saved and filled later. */
  readonly createDefinition: (input: {
    readonly name: string;
    readonly assetKind: CreatorAssetKind;
    readonly pivot: AssetPivot;
  }) => Draw2AssetMutationResult;
  readonly addFromSelection: (input: {
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
  }) => Draw2AssetMutationResult;
  readonly updateDefinition: (input: {
    readonly definitionId: string;
    readonly name?: string;
    readonly assetKind?: CreatorAssetKind;
    readonly pivot?: AssetPivot;
  }) => Draw2AssetMutationResult;
  readonly assignAnimation: (input: {
    readonly definitionId: string;
    readonly animationName: AssetAnimationName;
    readonly customName?: string;
    readonly motionName?: string;
    readonly direction?: AssetDirectionName;
    readonly frameStart: number;
    readonly frameEnd: number;
    readonly loopMode: AssetLoopMode;
    readonly fps: number;
    /** Optional explicit frame order for the visual Frame Editor. */
    readonly frameIds?: readonly string[];
    readonly sourceReference?: string;
    readonly flipX?: boolean;
    readonly flipY?: boolean;
    readonly sourceFrames?: readonly AssetAnimationFrameReference[];
    readonly frameDurationsMs?: readonly number[];
  }) => Draw2AssetMutationResult;
  readonly clearAnimation: (input: {
    readonly definitionId: string;
    readonly animationName: AssetAnimationName;
    readonly customName?: string;
    readonly motionName?: string;
    readonly direction?: AssetDirectionName;
  }) => Draw2AssetMutationResult;
  readonly removeDefinition: (definitionId: string) => boolean;
  /** Persist one already verified Asset / Asset Pack manifest. */
  readonly saveAssetPackage: (
    manifest: AssetPackageManifest,
  ) => Promise<Draw2AssetPackageMutationResult>;
  /** Prepare only the selected Asset Definition for the existing Market flow. */
  readonly handoffDefinitionToMarket: (
    definitionId: string,
  ) => Promise<Draw2AssetMarketHandoffResult>;
}
