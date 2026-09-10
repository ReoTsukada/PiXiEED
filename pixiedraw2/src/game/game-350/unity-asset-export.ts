/**
 * Unity asset import package for every Draw2 Asset Definition.
 *
 * The package is intentionally a data-first bridge.  PiXiEED emits fixed PNG
 * frame bytes, one canonical JSON definition, and a small Unity Editor
 * importer.  Copying the package into a Unity project therefore materializes
 * a ScriptableObject, AnimationClips, an AnimatorController, and a usable
 * SpriteRenderer prefab without requiring a hand-written per-asset setup.
 *
 * This module does not execute Unity.  The generated C# source is checked as a
 * deterministic package payload here; Unity Editor import/compile remains a
 * separate integration gate.
 */

import {
  assetAnimationClipKey,
  assetAnimationDirectionName,
  assetAnimationMotionName,
  validateAssetDefinitionDraft,
  type AssetAnimationClip,
  type AssetAnimationFrameReference,
  type AssetDefinitionDraft,
  type AssetDirectionName,
  type AssetPivotDefinition,
  type CreatorAssetKind,
  type ValidatedAssetDefinition,
} from "../../draw2-creator-workspace.ts";
import {
  encodePngRgba,
  encodeStoredZip,
  type PxdAssetDefinitionEntry,
} from "../../draw2-export.ts";
import { canonicalJson, type Sha256 } from "../game-300/core.ts";

export const UNITY_ASSET_IMPORT_SCHEMA_VERSION = "UNITY_ASSET_IMPORT_V2" as const;
export const UNITY_ASSET_IMPORT_PACKAGE_KIND = "PIXIEED_UNITY_ASSET" as const;

export type UnityAssetImportMimeType = "application/json" | "image/png" | "text/plain";

export interface UnityAssetImportEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly mimeType: UnityAssetImportMimeType;
  readonly contentHash: Sha256;
}

/** Optional release metadata supplied by the caller when it is known. */
export interface UnityAssetExportOptions {
  /** Registered creator identity. Omit for a local-only export. */
  readonly creator?: {
    readonly creatorId: string;
    readonly displayName?: string;
  };
  /** Contributors are metadata only; they do not change the image payload. */
  readonly collaborators?: readonly {
    readonly creatorId: string;
    readonly displayName?: string;
    readonly role?: string;
  }[];
  /** Rights are intentionally optional so an unlicensed local draft is not presented as cleared. */
  readonly license?: {
    readonly licenseId: string;
    readonly rights: readonly string[];
    readonly commercialUse?: boolean;
    readonly derivativeAllowed?: boolean;
    readonly attributionRequired?: boolean;
  };
  /** Unity world units represented by one frame width. Defaults to frame width in pixels. */
  readonly pixelsPerUnit?: number;
}

export interface UnityAssetImportPackage {
  readonly schemaVersion: typeof UNITY_ASSET_IMPORT_SCHEMA_VERSION;
  readonly packageKind: typeof UNITY_ASSET_IMPORT_PACKAGE_KIND;
  readonly definitionId: string;
  readonly assetId: string;
  readonly revisionId?: string;
  readonly assetKind: CreatorAssetKind;
  readonly assetName: string;
  readonly manifestPath: string;
  readonly packageManifestPath: string;
  /** Hash of the visual frame set and its animation mapping. */
  readonly contentHash: Sha256;
  readonly manifestHash: Sha256;
  readonly packageHash: Sha256;
  readonly entries: readonly UnityAssetImportEntry[];
  /** Native import/compile is intentionally a separate acceptance gate. */
  readonly nativeQualification: "UNTESTED";
}

export interface UnityAssetImportDiagnostic {
  readonly code:
    | "INVALID_DEFINITION"
    | "INVALID_EXPORT_OPTIONS"
    | "SNAPSHOT_REQUIRED"
    | "SNAPSHOT_INVALID"
    | "FRAME_DIMENSION_MISMATCH"
    | "DUPLICATE_PATH";
  readonly path: string;
  readonly message: string;
}

export type UnityAssetImportResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly UnityAssetImportDiagnostic[] };

interface UnityAssetFrameDocument {
  readonly frameId: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly contentHash: Sha256;
  readonly sourceRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly sourceLayerIds: readonly string[];
  readonly flipX: boolean;
  readonly flipY: boolean;
}

interface UnityAssetAnimationDocument {
  readonly id: string;
  readonly motion: string;
  readonly direction: string;
  readonly loopMode: AssetAnimationClip["loopMode"];
  readonly fps: number;
  readonly sourceReference?: string;
  readonly frames: readonly UnityAssetFrameDocument[];
}

interface UnityAssetImportSettingsDocument {
  readonly filterMode: "POINT" | "BILINEAR";
  readonly textureCompression: "UNCOMPRESSED";
  readonly mipmapEnabled: false;
  readonly wrapMode: "CLAMP";
  readonly meshType: "FULL_RECT";
  readonly alphaIsTransparency: true;
  readonly isReadable: false;
  readonly sRGBTexture: true;
  readonly pixelsPerUnit: number;
}

interface UnityAssetRuntimeProfileDocument {
  readonly kind: "VISUAL_ASSET";
  readonly assetKind: CreatorAssetKind;
  readonly defaultAnimationId: string;
  readonly defaultMotion: string;
  readonly defaultDirection: string;
  readonly availableMotions: readonly string[];
  readonly availableDirections: readonly string[];
  readonly fallbackPolicy: "EXACT_THEN_MOTION_DEFAULT_THEN_FIRST";
}

interface UnityAssetManifestDocument {
  readonly schemaVersion: typeof UNITY_ASSET_IMPORT_SCHEMA_VERSION;
  readonly packageKind: typeof UNITY_ASSET_IMPORT_PACKAGE_KIND;
  readonly definitionId: string;
  readonly assetId: string;
  readonly revisionId?: string;
  readonly identityScope: "REGISTERED_REVISION" | "LOCAL_DRAFT";
  readonly assetKind: CreatorAssetKind;
  readonly displayName: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly pivot: {
    readonly kind: AssetPivotDefinition["kind"];
    readonly x: number;
    readonly y: number;
  };
  readonly defaultSpritePath: string;
  readonly defaultAnimationId: string;
  readonly animations: readonly UnityAssetAnimationDocument[];
  readonly source: {
    readonly projectId: string;
    readonly canvasId: string;
    readonly frameStart: number;
    readonly frameEnd: number;
    readonly sourceKind: string;
    readonly sourceLayerIds: readonly string[];
    readonly layerSelection: unknown;
    readonly frameSelection: unknown;
    readonly region: unknown;
  };
  readonly sourceReferencePolicy: AssetDefinitionDraft["protection"]["referencePolicy"];
  readonly provenance: {
    readonly sourceDefinitionId: string;
    readonly dependencyIds: readonly string[];
    readonly sourceReferencePolicy: AssetDefinitionDraft["protection"]["referencePolicy"];
  };
  readonly geometry: {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly pixelsPerUnit: number;
    readonly coordinateSystem: "TOP_LEFT_ORIGIN_Y_DOWN";
    readonly pivot: UnityAssetManifestDocument["pivot"];
  };
  readonly importSettings: UnityAssetImportSettingsDocument;
  readonly runtimeProfile: UnityAssetRuntimeProfileDocument;
  /** Hash of the visual frame set before manifest/package metadata is added. */
  readonly contentHash: Sha256;
  readonly creator?: {
    readonly creatorId: string;
    readonly displayName?: string;
  };
  readonly collaborators?: readonly {
    readonly creatorId: string;
    readonly displayName?: string;
    readonly role?: string;
  }[];
  readonly license?: {
    readonly licenseId: string;
    readonly rights: readonly string[];
    readonly commercialUse?: boolean;
    readonly derivativeAllowed?: boolean;
    readonly attributionRequired?: boolean;
  };
  readonly manifestHash?: Sha256;
}

function success<T>(value: T): UnityAssetImportResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure(
  ...diagnostics: UnityAssetImportDiagnostic[]
): UnityAssetImportResult<never> {
  return { ok: false, diagnostics };
}

function safeFilePart(value: string, fallback = "item"): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return normalized || fallback;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pivotCoordinates(
  definition: Pick<AssetDefinitionDraft, "pivotDefinition">,
  width: number,
  height: number,
): UnityAssetManifestDocument["pivot"] {
  const pivot = definition.pivotDefinition;
  if (pivot.kind === "CENTER") return { kind: "CENTER", x: 0.5, y: 0.5 };
  if (pivot.kind === "FEET") return { kind: "FEET", x: 0.5, y: 0 };
  // Draw2 custom pivot coordinates are canvas pixels with a top-left origin.
  // Unity uses a normalized bottom-left pivot, so the conversion is explicit
  // in the generated manifest rather than being guessed by the importer.
  return {
    kind: "CUSTOM",
    x: clampUnit(pivot.x / Math.max(1, width)),
    y: clampUnit(1 - pivot.y / Math.max(1, height)),
  };
}

function frameSnapshot(
  frame: AssetAnimationFrameReference | undefined,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } | undefined {
  const snapshot = frame?.rasterSnapshot;
  if (snapshot === undefined) return undefined;
  if (
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
    rgba: Uint8Array.from(snapshot.data),
  };
}

function flipRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  flipX: boolean,
  flipY: boolean,
): Uint8Array {
  if (!flipX && !flipY) return rgba;
  const output = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = flipX ? width - x - 1 : x;
      const sourceY = flipY ? height - y - 1 : y;
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      output.set(rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return output;
}

async function sha256Bytes(bytes: Uint8Array): Promise<Sha256> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("") as Sha256;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalJson(value)}\n`);
}

type NormalizedUnityAssetExportOptions = Omit<UnityAssetExportOptions, "creator" | "collaborators" | "license"> & {
  readonly creator?: NonNullable<UnityAssetExportOptions["creator"]>;
  readonly collaborators?: readonly NonNullable<UnityAssetExportOptions["collaborators"]>[number][];
  readonly license?: NonNullable<UnityAssetExportOptions["license"]>;
};

function normalizeExportOptions(
  options: UnityAssetExportOptions,
): NormalizedUnityAssetExportOptions | UnityAssetImportDiagnostic {
  if (
    options.pixelsPerUnit !== undefined &&
    (!Number.isFinite(options.pixelsPerUnit) || options.pixelsPerUnit <= 0 || options.pixelsPerUnit > 100000)
  ) {
    return {
      code: "INVALID_EXPORT_OPTIONS",
      path: "options.pixelsPerUnit",
      message: "pixelsPerUnitは0より大きく100000以下の数値で指定してください。",
    };
  }
  const creator = options.creator === undefined
    ? undefined
    : {
      creatorId: options.creator.creatorId.trim(),
      ...(options.creator.displayName === undefined
        ? {}
        : { displayName: options.creator.displayName.trim() }),
    };
  if (creator !== undefined && creator.creatorId.length === 0) {
    return {
      code: "INVALID_EXPORT_OPTIONS",
      path: "options.creator.creatorId",
      message: "制作者IDを指定してください。",
    };
  }
  const collaborators = options.collaborators === undefined
    ? undefined
    : options.collaborators.map((collaborator) => ({
      creatorId: collaborator.creatorId.trim(),
      ...(collaborator.displayName === undefined
        ? {}
        : { displayName: collaborator.displayName.trim() }),
      ...(collaborator.role === undefined
        ? {}
        : { role: collaborator.role.trim() }),
    }));
  if (collaborators?.some((collaborator) => collaborator.creatorId.length === 0)) {
    return {
      code: "INVALID_EXPORT_OPTIONS",
      path: "options.collaborators",
      message: "共同制作者のIDを指定してください。",
    };
  }
  const license = options.license === undefined
    ? undefined
    : {
      licenseId: options.license.licenseId.trim(),
      rights: [...new Set(options.license.rights.map((right) => right.trim()).filter((right) => right.length > 0))].sort(),
      ...(options.license.commercialUse === undefined ? {} : { commercialUse: options.license.commercialUse }),
      ...(options.license.derivativeAllowed === undefined ? {} : { derivativeAllowed: options.license.derivativeAllowed }),
      ...(options.license.attributionRequired === undefined ? {} : { attributionRequired: options.license.attributionRequired }),
    };
  if (license !== undefined && (license.licenseId.length === 0 || license.rights.length === 0)) {
    return {
      code: "INVALID_EXPORT_OPTIONS",
      path: "options.license",
      message: "License IDと少なくとも1つの権利を指定してください。",
    };
  }
  return {
    ...(options.pixelsPerUnit === undefined ? {} : { pixelsPerUnit: options.pixelsPerUnit }),
    ...(creator === undefined ? {} : { creator }),
    ...(collaborators === undefined ? {} : { collaborators }),
    ...(license === undefined ? {} : { license }),
  } as NormalizedUnityAssetExportOptions;
}

function animationDocumentId(clip: AssetAnimationClip): string {
  return safeFilePart(assetAnimationClipKey(clip), "animation");
}

function validatedDefinition(
  entry: PxdAssetDefinitionEntry,
): ValidatedAssetDefinition | UnityAssetImportDiagnostic {
  const candidate = {
    ...entry.definition,
    persistence: "LOCAL_DRAFT" as const,
  };
  const validation = validateAssetDefinitionDraft(candidate);
  return validation.ok
    ? validation.value
    : {
      code: "INVALID_DEFINITION",
      path: `assetDefinitions.${entry.definitionId}.definition`,
      message: validation.message,
    };
}

/**
 * Creates the complete Unity-side import payload for one Draw2 Asset.
 * Every animation frame must have a fixed composite snapshot; reference-only
 * definitions are rejected so a successful package can really be imported
 * without reaching back into iDRAW.
 */
export async function createUnityAssetImportPackage(
  entry: PxdAssetDefinitionEntry,
  options: UnityAssetExportOptions = {},
): Promise<UnityAssetImportResult<UnityAssetImportPackage>> {
  const validated = validatedDefinition(entry);
  if (!("schemaVersion" in validated)) return failure(validated);
  const definition = validated;
  const normalizedOptions = normalizeExportOptions(options);
  if ("code" in normalizedOptions) return failure(normalizedOptions);
  options = normalizedOptions;
  const assetId = entry.registryIdentity?.assetId ?? entry.definitionId;
  const revisionId = entry.registryIdentity?.revisionId;
  const identityScope = revisionId === undefined ? "LOCAL_DRAFT" : "REGISTERED_REVISION";
  const root = `Assets/PiXiEED/Generated/Assets/${safeFilePart(assetId)}/${safeFilePart(revisionId ?? "local")}`;
  const manifestPath = `${root}/PiXiEEDAsset.json`;
  const packageManifestPath = `${root}/PiXiEEDPackage.json`;
  const entries: UnityAssetImportEntry[] = [];
  const animations: UnityAssetAnimationDocument[] = [];
  const usedPaths = new Set<string>();
  let defaultFrame: UnityAssetFrameDocument | undefined;
  let pivotSize: { readonly width: number; readonly height: number } | undefined;

  for (const [clipIndex, clip] of definition.animationMapping.entries()) {
    const sourceFrames = clip.sourceFrames;
    if (sourceFrames === undefined || sourceFrames.length !== clip.frameIds.length) {
      return failure({
        code: "SNAPSHOT_REQUIRED",
        path: `assetDefinitions.${entry.definitionId}.definition.animationMapping[${clipIndex}]`,
        message: "Unity用の直接インポートには、全アニメーションフレームの合成画像が必要です。",
      });
    }
    const direction = assetAnimationDirectionName(clip) ?? "DEFAULT";
    const frames: UnityAssetFrameDocument[] = [];
    for (const [index, sourceFrame] of sourceFrames.entries()) {
      const raster = frameSnapshot(sourceFrame);
      if (raster === undefined) {
        return failure({
          code: sourceFrame.rasterSnapshot === undefined ? "SNAPSHOT_REQUIRED" : "SNAPSHOT_INVALID",
          path: `assetDefinitions.${entry.definitionId}.definition.animationMapping[${clipIndex}].sourceFrames[${index}]`,
          message: "フレームの固定RGBAスナップショットを取得できません。iDRAWで表示中の範囲を再取得してください。",
        });
      }
      if (
        pivotSize !== undefined &&
        (raster.width !== pivotSize.width || raster.height !== pivotSize.height)
      ) {
        return failure({
          code: "FRAME_DIMENSION_MISMATCH",
          path: `assetDefinitions.${entry.definitionId}.definition.animationMapping[${clipIndex}].sourceFrames[${index}].rasterSnapshot`,
          message: `全フレームのサイズを${pivotSize.width}×${pivotSize.height}pxに揃えてください。異なるサイズのままではUnity上でアニメーションが揺れます。`,
        });
      }
      const flipX = Boolean(clip.flipX) !== Boolean(sourceFrame.flipX);
      const flipY = Boolean(clip.flipY) !== Boolean(sourceFrame.flipY);
      const rgba = flipRgba(raster.rgba, raster.width, raster.height, flipX, flipY);
      const png = encodePngRgba(raster.width, raster.height, rgba);
      const contentHash = await sha256Bytes(png);
      const framePath = `${root}/Frames/${safeFilePart(assetAnimationMotionName(clip))}__${safeFilePart(direction)}__${String(index + 1).padStart(3, "0")}.png`;
      if (usedPaths.has(framePath)) {
        return failure({
          code: "DUPLICATE_PATH",
          path: framePath,
          message: "Unity出力のフレームパスが重複しています。Motion／Direction名を確認してください。",
        });
      }
      usedPaths.add(framePath);
      const frame: UnityAssetFrameDocument = {
        frameId: sourceFrame.sourceFrameId,
        path: framePath,
        width: raster.width,
        height: raster.height,
        durationMs: Math.max(
          1,
          Math.round(
            clip.frameDurationsMs?.[index] ??
              sourceFrame.durationMs ??
              (clip.fps === undefined ? 1000 / 12 : 1000 / clip.fps),
          ),
        ),
        contentHash,
        sourceRect: { ...sourceFrame.rect },
        sourceLayerIds: [...sourceFrame.layerIds],
        flipX,
        flipY,
      };
      frames.push(frame);
      entries.push({ path: framePath, bytes: png, mimeType: "image/png", contentHash });
      if (defaultFrame === undefined) defaultFrame = frame;
      if (pivotSize === undefined) pivotSize = { width: raster.width, height: raster.height };
    }
    const fps = Math.max(1, Number.isFinite(clip.fps) ? clip.fps ?? 12 : 12);
    animations.push({
      id: animationDocumentId(clip),
      motion: assetAnimationMotionName(clip),
      direction,
      loopMode: clip.loopMode,
      fps,
      ...(clip.sourceReference === undefined ? {} : { sourceReference: clip.sourceReference }),
      frames,
    });
  }

  if (defaultFrame === undefined || pivotSize === undefined) {
    return failure({
      code: "SNAPSHOT_REQUIRED",
      path: `assetDefinitions.${entry.definitionId}.definition.animationMapping`,
      message: "少なくとも1枚の固定スプライト画像を登録してからUnity出力してください。",
    });
  }

  const pivot = pivotCoordinates(definition, pivotSize.width, pivotSize.height);
  const pixelsPerUnit = options.pixelsPerUnit ?? Math.max(1, pivotSize.width);
  const defaultAnimationId = animations[0]?.id ?? "";
  const availableMotions = [...new Set(animations.map((animation) => animation.motion))];
  const availableDirections = [...new Set(animations.map((animation) => animation.direction))];
  const importSettings: UnityAssetImportSettingsDocument = {
    filterMode: "POINT",
    textureCompression: "UNCOMPRESSED",
    mipmapEnabled: false,
    wrapMode: "CLAMP",
    meshType: "FULL_RECT",
    alphaIsTransparency: true,
    isReadable: false,
    sRGBTexture: true,
    pixelsPerUnit,
  };
  const runtimeProfile: UnityAssetRuntimeProfileDocument = {
    kind: "VISUAL_ASSET",
    assetKind: definition.assetKind,
    defaultAnimationId,
    defaultMotion: animations[0]?.motion ?? "DEFAULT",
    defaultDirection: animations[0]?.direction ?? "DEFAULT",
    availableMotions,
    availableDirections,
    fallbackPolicy: "EXACT_THEN_MOTION_DEFAULT_THEN_FIRST",
  };
  const contentHash = await sha256Bytes(jsonBytes({
    assetId,
    revisionId: revisionId ?? null,
    assetKind: definition.assetKind,
    geometry: {
      frameWidth: pivotSize.width,
      frameHeight: pivotSize.height,
      pixelsPerUnit,
      pivot,
    },
    animations,
  }));
  const manifestBase: UnityAssetManifestDocument = {
    schemaVersion: UNITY_ASSET_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_ASSET_IMPORT_PACKAGE_KIND,
    definitionId: entry.definitionId,
    assetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    identityScope,
    assetKind: definition.assetKind,
    displayName: definition.metadata.name,
    description: definition.metadata.description,
    tags: definition.metadata.tags,
    pivot,
    defaultSpritePath: defaultFrame.path,
    defaultAnimationId,
    animations,
    source: {
      projectId: definition.sourceProjectId,
      canvasId: definition.sourceCanvasId,
      frameStart: definition.frameStart,
      frameEnd: definition.frameEnd,
      sourceKind: definition.sourceKind,
      sourceLayerIds: definition.sourceLayerIds,
      layerSelection: definition.layerSelection,
      frameSelection: definition.frameSelection,
      region: definition.region,
    },
    sourceReferencePolicy: definition.protection.referencePolicy,
    provenance: {
      sourceDefinitionId: entry.definitionId,
      dependencyIds: definition.dependencyIds,
      sourceReferencePolicy: definition.protection.referencePolicy,
    },
    geometry: {
      frameWidth: pivotSize.width,
      frameHeight: pivotSize.height,
      pixelsPerUnit,
      coordinateSystem: "TOP_LEFT_ORIGIN_Y_DOWN",
      pivot,
    },
    importSettings,
    runtimeProfile,
    contentHash,
    ...(options.creator === undefined ? {} : { creator: options.creator }),
    ...(options.collaborators === undefined ? {} : { collaborators: options.collaborators }),
    ...(options.license === undefined ? {} : { license: options.license }),
  };
  const manifestHash = await sha256Bytes(jsonBytes(manifestBase));
  const manifestBytes = jsonBytes({ ...manifestBase, manifestHash });
  const manifestEntry: UnityAssetImportEntry = {
    path: manifestPath,
    bytes: manifestBytes,
    mimeType: "application/json",
    contentHash: await sha256Bytes(manifestBytes),
  };
  entries.push(manifestEntry);
  const runtimeSource = unityRuntimeAssetSource();
  const importerSource = unityImporterSource();
  const readmeSource = unityReadmeSource();
  entries.push({
    path: "Assets/PiXiEED/Runtime/PiXiEEDAsset.cs",
    bytes: new TextEncoder().encode(runtimeSource),
    mimeType: "text/plain",
    contentHash: await sha256Bytes(new TextEncoder().encode(runtimeSource)),
  });
  entries.push({
    path: "Assets/Editor/PiXiEED/PiXiEEDAssetImporter.cs",
    bytes: new TextEncoder().encode(importerSource),
    mimeType: "text/plain",
    contentHash: await sha256Bytes(new TextEncoder().encode(importerSource)),
  });
  entries.push({
    path: "Assets/PiXiEED/Generated/README.md",
    bytes: new TextEncoder().encode(readmeSource),
    mimeType: "text/plain",
    contentHash: await sha256Bytes(new TextEncoder().encode(readmeSource)),
  });
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packageHash = await sha256Bytes(jsonBytes({
    schemaVersion: UNITY_ASSET_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_ASSET_IMPORT_PACKAGE_KIND,
    definitionId: entry.definitionId,
    assetId,
    revisionId: revisionId ?? null,
    contentHash,
    manifestHash,
    entries: entries.map((item) => ({ path: item.path, contentHash: item.contentHash })),
  }));
  const packageManifestBytes = jsonBytes({
    schemaVersion: UNITY_ASSET_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_ASSET_IMPORT_PACKAGE_KIND,
    definitionId: entry.definitionId,
    assetId,
    revisionId: revisionId ?? null,
    manifestPath,
    manifestHash,
    contentHash,
    packageHash,
    packageHashScope: "ENTRIES_EXCLUDING_PACKAGE_MANIFEST",
    entries: entries.map((item) => ({ path: item.path, contentHash: item.contentHash })),
  });
  entries.push({
    path: packageManifestPath,
    bytes: packageManifestBytes,
    mimeType: "application/json",
    contentHash: await sha256Bytes(packageManifestBytes),
  });
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return success({
    schemaVersion: UNITY_ASSET_IMPORT_SCHEMA_VERSION,
    packageKind: UNITY_ASSET_IMPORT_PACKAGE_KIND,
    definitionId: entry.definitionId,
    assetId,
    ...(revisionId === undefined ? {} : { revisionId }),
    assetKind: definition.assetKind,
    assetName: definition.metadata.name,
    manifestPath,
    packageManifestPath,
    contentHash,
    manifestHash,
    packageHash,
    entries,
    nativeQualification: "UNTESTED",
  });
}

/** Encodes a Unity asset package as a deterministic stored ZIP. */
export function encodeUnityAssetImportPackageZip(
  packageValue: UnityAssetImportPackage,
): Uint8Array {
  return encodeStoredZip(packageValue.entries.map((entry) => ({
    filename: entry.path,
    bytes: entry.bytes,
  })));
}

export function unityRuntimeAssetSource(): string {
  return `using System;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace PiXiEED {
    [Serializable]
    public sealed class PiXiEEDAnimationData {
        public string id;
        public string motion;
        public string direction;
        public string loopMode;
        public float fps;
        public Sprite[] sprites;
        public int[] frameDurationsMs;
        public AnimationClip clip;
    }

    [CreateAssetMenu(fileName = "PiXiEEDAsset", menuName = "PiXiEED/Asset")]
    public sealed class PiXiEEDAsset : ScriptableObject {
        public string assetId;
        public string revisionId;
        public string definitionId;
        public string identityScope;
        public string contentHash;
        public string manifestHash;
        public string packageHash;
        public string assetKind;
        public string displayName;
        [TextArea] public string description;
        public string[] tags;
        public string defaultAnimationId;
        public string defaultMotion;
        public string defaultDirection;
        public string[] availableMotions;
        public string[] availableDirections;
        public string[] dependencyIds;
        public string sourceReferencePolicy;
        public string creatorId;
        public string creatorDisplayName;
        public string[] collaboratorIds;
        public string[] collaboratorRoles;
        public string licenseId;
        public string[] rights;
        public bool commercialUse;
        public bool derivativeAllowed;
        public bool attributionRequired;
        public float pixelsPerUnit;
        public Vector2 pivotNormalized;
        public Sprite defaultSprite;
        public Tile defaultTile;
        public RuntimeAnimatorController controller;
        public PiXiEEDAnimationData[] animations;
    }

    [DisallowMultipleComponent]
    public sealed class PiXiEEDAssetInstance : MonoBehaviour {
        public PiXiEEDAsset asset;
    }

    [DisallowMultipleComponent]
    [RequireComponent(typeof(Animator))]
    public sealed class PiXiEEDAssetAnimator : MonoBehaviour {
        public PiXiEEDAsset asset;
        public string motion;
        public string direction;
        public bool playOnStart = true;
        public string CurrentAnimationId { get; private set; }

        private Animator animator;

        private void Awake() {
            animator = GetComponent<Animator>();
            if (playOnStart) Play(motion, direction);
        }

        public bool SetMotion(string value) {
            return Play(value, direction);
        }

        public bool SetDirection(string value) {
            return Play(motion, value);
        }

        public bool Play(string requestedMotion, string requestedDirection) {
            if (asset == null || asset.animations == null || asset.animations.Length == 0) return false;
            PiXiEEDAnimationData selected = Resolve(requestedMotion, requestedDirection);
            if (selected == null) return false;
            motion = selected.motion;
            direction = selected.direction;
            CurrentAnimationId = selected.id;
            if (animator != null && selected.clip != null) animator.Play(selected.id, 0, 0f);
            return true;
        }

        private PiXiEEDAnimationData Resolve(string requestedMotion, string requestedDirection) {
            string wantedMotion = string.IsNullOrEmpty(requestedMotion) ? asset.defaultMotion : requestedMotion;
            string wantedDirection = string.IsNullOrEmpty(requestedDirection) ? asset.defaultDirection : requestedDirection;
            PiXiEEDAnimationData motionDefault = null;
            foreach (PiXiEEDAnimationData candidate in asset.animations) {
                if (candidate == null || !string.Equals(candidate.motion, wantedMotion, StringComparison.OrdinalIgnoreCase)) continue;
                if (string.Equals(candidate.direction, wantedDirection, StringComparison.OrdinalIgnoreCase)) return candidate;
                if (string.Equals(candidate.direction, "DEFAULT", StringComparison.OrdinalIgnoreCase)) motionDefault = candidate;
            }
            if (motionDefault != null) return motionDefault;
            foreach (PiXiEEDAnimationData candidate in asset.animations) {
                if (candidate != null && string.Equals(candidate.id, asset.defaultAnimationId, StringComparison.Ordinal)) return candidate;
            }
            return asset.animations[0];
        }
    }
}
`;
}

export function unityImporterSource(): string {
  return `#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace PiXiEED.Editor {
    [Serializable]
    internal sealed class PiXiEEDFrameDocument {
        public string frameId;
        public string path;
        public int width;
        public int height;
        public int durationMs;
        public string contentHash;
        public PiXiEEDRectDocument sourceRect;
        public string[] sourceLayerIds;
        public bool flipX;
        public bool flipY;
    }

    [Serializable]
    internal sealed class PiXiEEDAnimationDocument {
        public string id;
        public string motion;
        public string direction;
        public string loopMode;
        public float fps;
        public string sourceReference;
        public PiXiEEDFrameDocument[] frames;
    }

    [Serializable]
    internal sealed class PiXiEEDManifestDocument {
        public string schemaVersion;
        public string packageKind;
        public string definitionId;
        public string assetId;
        public string revisionId;
        public string identityScope;
        public string assetKind;
        public string displayName;
        public string description;
        public string[] tags;
        public PiXiEEDPivotDocument pivot;
        public string defaultSpritePath;
        public string defaultAnimationId;
        public PiXiEEDAnimationDocument[] animations;
        public PiXiEEDSourceDocument source;
        public string sourceReferencePolicy;
        public PiXiEEDProvenanceDocument provenance;
        public PiXiEEDGeometryDocument geometry;
        public PiXiEEDImportSettingsDocument importSettings;
        public PiXiEEDRuntimeProfileDocument runtimeProfile;
        public string contentHash;
        public PiXiEEDCreatorDocument creator;
        public PiXiEEDCreatorDocument[] collaborators;
        public PiXiEEDLicenseDocument license;
        public string manifestHash;
    }

    [Serializable]
    internal sealed class PiXiEEDPivotDocument {
        public string kind;
        public float x;
        public float y;
    }

    [Serializable]
    internal sealed class PiXiEEDSourceDocument {
        public string projectId;
        public string canvasId;
        public int frameStart;
        public int frameEnd;
        public string sourceKind;
        public string[] sourceLayerIds;
    }

    [Serializable]
    internal sealed class PiXiEEDProvenanceDocument {
        public string sourceDefinitionId;
        public string[] dependencyIds;
        public string sourceReferencePolicy;
    }

    [Serializable]
    internal sealed class PiXiEEDRectDocument {
        public int x;
        public int y;
        public int width;
        public int height;
    }

    [Serializable]
    internal sealed class PiXiEEDGeometryDocument {
        public int frameWidth;
        public int frameHeight;
        public float pixelsPerUnit;
        public string coordinateSystem;
        public PiXiEEDPivotDocument pivot;
    }

    [Serializable]
    internal sealed class PiXiEEDImportSettingsDocument {
        public string filterMode;
        public string textureCompression;
        public bool mipmapEnabled;
        public string wrapMode;
        public string meshType;
        public bool alphaIsTransparency;
        public bool isReadable;
        public bool sRGBTexture;
        public float pixelsPerUnit;
    }

    [Serializable]
    internal sealed class PiXiEEDRuntimeProfileDocument {
        public string kind;
        public string assetKind;
        public string defaultAnimationId;
        public string defaultMotion;
        public string defaultDirection;
        public string[] availableMotions;
        public string[] availableDirections;
        public string fallbackPolicy;
    }

    [Serializable]
    internal sealed class PiXiEEDCreatorDocument {
        public string creatorId;
        public string displayName;
        public string role;
    }

    [Serializable]
    internal sealed class PiXiEEDLicenseDocument {
        public string licenseId;
        public string[] rights;
        public bool commercialUse;
        public bool derivativeAllowed;
        public bool attributionRequired;
    }

    [Serializable]
    internal sealed class PiXiEEDPackageDocument {
        public string packageHash;
    }

    [InitializeOnLoad]
    public static class PiXiEEDAssetImporter {
        private static bool importing;

        static PiXiEEDAssetImporter() {
            EditorApplication.delayCall += ImportAll;
        }

        [MenuItem("PiXiEED/Reimport Generated Assets")]
        public static void ReimportGeneratedAssets() {
            ImportAll();
        }

        private static void ImportAll() {
            if (importing) return;
            importing = true;
            try {
                string[] guids = AssetDatabase.FindAssets("t:TextAsset", new[] { "Assets/PiXiEED/Generated/Assets" });
                foreach (string guid in guids) {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    if (!path.EndsWith("/PiXiEEDAsset.json", StringComparison.Ordinal)) continue;
                    ImportManifest(path);
                }
                AssetDatabase.SaveAssets();
            } finally {
                importing = false;
            }
        }

        private static void ImportManifest(string manifestPath) {
            TextAsset json = AssetDatabase.LoadAssetAtPath<TextAsset>(manifestPath);
            if (json == null) return;
            PiXiEEDManifestDocument manifest = JsonUtility.FromJson<PiXiEEDManifestDocument>(json.text);
            if (manifest == null || manifest.animations == null || manifest.animations.Length == 0 || manifest.pivot == null) return;

            string root = manifestPath.Substring(0, manifestPath.Length - "/PiXiEEDAsset.json".Length);
            string packageHash = "";
            TextAsset packageJson = AssetDatabase.LoadAssetAtPath<TextAsset>(root + "/PiXiEEDPackage.json");
            if (packageJson != null) {
                PiXiEEDPackageDocument packageDocument = JsonUtility.FromJson<PiXiEEDPackageDocument>(packageJson.text);
                if (packageDocument != null) packageHash = packageDocument.packageHash;
            }
            string importedRoot = root + "/Imported";
            EnsureFolder(importedRoot);
            List<PiXiEEDAnimationData> animationData = new List<PiXiEEDAnimationData>();
            List<AnimationClip> clips = new List<AnimationClip>();
            List<PiXiEEDAnimationDocument> importedAnimations = new List<PiXiEEDAnimationDocument>();

            foreach (PiXiEEDAnimationDocument animation in manifest.animations) {
                if (animation.frames == null || animation.frames.Length == 0) continue;
                List<Sprite> frameSprites = new List<Sprite>();
                List<PiXiEEDFrameDocument> importedFrames = new List<PiXiEEDFrameDocument>();
                foreach (PiXiEEDFrameDocument frame in animation.frames) {
                    Sprite sprite = ImportSprite(frame.path, manifest);
                    if (sprite == null) continue;
                    frameSprites.Add(sprite);
                    importedFrames.Add(frame);
                }
                if (frameSprites.Count == 0) continue;
                string clipPath = importedRoot + "/" + Safe(animation.id, "animation") + ".anim";
                AnimationClip clip = CreateOrUpdateClip(clipPath, animation, importedFrames, frameSprites);
                clips.Add(clip);
                importedAnimations.Add(animation);
                animationData.Add(new PiXiEEDAnimationData {
                    id = animation.id,
                    motion = animation.motion,
                    direction = animation.direction,
                    loopMode = animation.loopMode,
                    fps = animation.fps,
                    sprites = frameSprites.ToArray(),
                    frameDurationsMs = Durations(importedFrames),
                    clip = clip,
                });
            }
            if (animationData.Count == 0) return;

            string controllerPath = importedRoot + "/" + Safe(manifest.displayName, "Asset") + ".controller";
            AnimatorController controller = CreateOrUpdateController(controllerPath, manifest, importedAnimations, clips);
            string assetPath = importedRoot + "/" + Safe(manifest.displayName, "Asset") + ".asset";
            PiXiEEDAsset asset = AssetDatabase.LoadAssetAtPath<PiXiEEDAsset>(assetPath);
            if (asset == null) {
                asset = ScriptableObject.CreateInstance<PiXiEEDAsset>();
                AssetDatabase.CreateAsset(asset, assetPath);
            }
            asset.assetId = string.IsNullOrEmpty(manifest.assetId) ? manifest.definitionId : manifest.assetId;
            asset.revisionId = manifest.revisionId;
            asset.definitionId = manifest.definitionId;
            asset.identityScope = manifest.identityScope;
            asset.contentHash = manifest.contentHash;
            asset.manifestHash = manifest.manifestHash;
            asset.packageHash = packageHash;
            asset.assetKind = manifest.assetKind;
            asset.displayName = manifest.displayName;
            asset.description = manifest.description;
            asset.tags = manifest.tags ?? new string[0];
            asset.defaultAnimationId = string.IsNullOrEmpty(manifest.defaultAnimationId)
                ? importedAnimations[0].id
                : manifest.defaultAnimationId;
            asset.defaultMotion = manifest.runtimeProfile == null
                ? importedAnimations[0].motion
                : manifest.runtimeProfile.defaultMotion;
            asset.defaultDirection = manifest.runtimeProfile == null
                ? importedAnimations[0].direction
                : manifest.runtimeProfile.defaultDirection;
            asset.availableMotions = manifest.runtimeProfile == null
                ? new string[0]
                : manifest.runtimeProfile.availableMotions ?? new string[0];
            asset.availableDirections = manifest.runtimeProfile == null
                ? new string[0]
                : manifest.runtimeProfile.availableDirections ?? new string[0];
            asset.dependencyIds = manifest.provenance == null
                ? new string[0]
                : manifest.provenance.dependencyIds ?? new string[0];
            asset.sourceReferencePolicy = manifest.sourceReferencePolicy;
            asset.creatorId = manifest.creator == null ? "" : manifest.creator.creatorId;
            asset.creatorDisplayName = manifest.creator == null ? "" : manifest.creator.displayName;
            asset.collaboratorIds = manifest.collaborators == null
                ? new string[0]
                : CollaboratorValues(manifest.collaborators, false);
            asset.collaboratorRoles = manifest.collaborators == null
                ? new string[0]
                : CollaboratorValues(manifest.collaborators, true);
            asset.licenseId = manifest.license == null ? "" : manifest.license.licenseId;
            asset.rights = manifest.license == null
                ? new string[0]
                : manifest.license.rights ?? new string[0];
            asset.commercialUse = manifest.license != null && manifest.license.commercialUse;
            asset.derivativeAllowed = manifest.license != null && manifest.license.derivativeAllowed;
            asset.attributionRequired = manifest.license != null && manifest.license.attributionRequired;
            asset.pixelsPerUnit = manifest.geometry != null && manifest.geometry.pixelsPerUnit > 0f
                ? manifest.geometry.pixelsPerUnit
                : 100f;
            asset.pivotNormalized = new Vector2(manifest.pivot.x, manifest.pivot.y);
            asset.defaultSprite = AssetDatabase.LoadAssetAtPath<Sprite>(manifest.defaultSpritePath);
            asset.defaultTile = manifest.assetKind == "TILE"
                ? CreateOrUpdateTile(importedRoot + "/" + Safe(manifest.displayName, "Asset") + ".tile", asset.defaultSprite)
                : null;
            asset.controller = controller;
            asset.animations = animationData.ToArray();
            EditorUtility.SetDirty(asset);

            string prefabPath = importedRoot + "/" + Safe(manifest.displayName, "Asset") + ".prefab";
            GameObject instance = new GameObject(Safe(manifest.displayName, "PiXiEEDAsset"));
            SpriteRenderer renderer = instance.AddComponent<SpriteRenderer>();
            renderer.sprite = asset.defaultSprite;
            if (controller != null) {
                Animator animator = instance.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
            }
            PiXiEEDAssetInstance assetInstance = instance.AddComponent<PiXiEEDAssetInstance>();
            assetInstance.asset = asset;
            PiXiEEDAssetAnimator assetAnimator = instance.AddComponent<PiXiEEDAssetAnimator>();
            assetAnimator.asset = asset;
            assetAnimator.motion = asset.defaultMotion;
            assetAnimator.direction = asset.defaultDirection;
            PrefabUtility.SaveAsPrefabAsset(instance, prefabPath);
            UnityEngine.Object.DestroyImmediate(instance);
        }

        private static Tile CreateOrUpdateTile(string path, Sprite sprite) {
            Tile tile = AssetDatabase.LoadAssetAtPath<Tile>(path);
            if (tile == null) {
                tile = ScriptableObject.CreateInstance<Tile>();
                AssetDatabase.CreateAsset(tile, path);
            }
            tile.sprite = sprite;
            tile.colliderType = Tile.ColliderType.None;
            EditorUtility.SetDirty(tile);
            return tile;
        }

        private static Sprite ImportSprite(string path, PiXiEEDManifestDocument manifest) {
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) return null;
            PiXiEEDPivotDocument pivot = manifest.pivot;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spriteAlignment = (int)SpriteAlignment.Custom;
            importer.spritePivot = new Vector2(pivot.x, pivot.y);
            PiXiEEDImportSettingsDocument settings = manifest.importSettings;
            importer.filterMode = settings != null && settings.filterMode == "BILINEAR"
                ? FilterMode.Bilinear
                : FilterMode.Point;
            importer.mipmapEnabled = settings != null && settings.mipmapEnabled;
            importer.textureCompression = settings != null && settings.textureCompression == "UNCOMPRESSED"
                ? TextureImporterCompression.Uncompressed
                : TextureImporterCompression.Uncompressed;
            importer.alphaIsTransparency = settings == null || settings.alphaIsTransparency;
            importer.isReadable = settings != null && settings.isReadable;
            importer.wrapMode = settings != null && settings.wrapMode == "REPEAT"
                ? TextureWrapMode.Repeat
                : TextureWrapMode.Clamp;
            importer.spriteMeshType = settings != null && settings.meshType == "TIGHT"
                ? SpriteMeshType.Tight
                : SpriteMeshType.FullRect;
            importer.spritePixelsPerUnit = manifest.geometry != null && manifest.geometry.pixelsPerUnit > 0f
                ? manifest.geometry.pixelsPerUnit
                : 100f;
            importer.sRGBTexture = settings == null || settings.sRGBTexture;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Sprite>(path);
        }

        private static AnimationClip CreateOrUpdateClip(string path, PiXiEEDAnimationDocument animation, List<PiXiEEDFrameDocument> frames, List<Sprite> sprites) {
            AnimationClip clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            if (clip == null) {
                clip = new AnimationClip();
                AssetDatabase.CreateAsset(clip, path);
            }
            clip.frameRate = Mathf.Max(1f, animation.fps);
            ObjectReferenceKeyframe[] keys = new ObjectReferenceKeyframe[sprites.Count];
            float time = 0f;
            for (int index = 0; index < sprites.Count; index++) {
                keys[index] = new ObjectReferenceKeyframe { time = time, value = sprites[index] };
                int duration = frames[index].durationMs > 0 ? frames[index].durationMs : Mathf.RoundToInt(1000f / clip.frameRate);
                time += duration / 1000f;
            }
            EditorCurveBinding binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
            AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
            clip.wrapMode = animation.loopMode == "ONCE" ? WrapMode.Once : animation.loopMode == "PING_PONG" ? WrapMode.PingPong : WrapMode.Loop;
            EditorUtility.SetDirty(clip);
            return clip;
        }

        private static AnimatorController CreateOrUpdateController(string path, PiXiEEDManifestDocument manifest, List<PiXiEEDAnimationDocument> animations, List<AnimationClip> clips) {
            AnimatorController controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            if (controller == null) controller = AnimatorController.CreateAnimatorControllerAtPath(path);
            AnimatorStateMachine machine = controller.layers[0].stateMachine;
            AnimatorState firstState = null;
            bool defaultAssigned = false;
            for (int index = 0; index < clips.Count; index++) {
                string stateName = animations[index].id;
                AnimatorState state = null;
                foreach (ChildAnimatorState candidate in machine.states) {
                    if (candidate.state.name == stateName) { state = candidate.state; break; }
                }
                if (state == null) state = machine.AddState(stateName);
                state.motion = clips[index];
                if (firstState == null) firstState = state;
                if (stateName == manifest.defaultAnimationId) {
                    machine.defaultState = state;
                    defaultAssigned = true;
                }
            }
            if (!defaultAssigned && firstState != null) machine.defaultState = firstState;
            EditorUtility.SetDirty(controller);
            return controller;
        }

        private static int[] Durations(List<PiXiEEDFrameDocument> frames) {
            int[] result = new int[frames.Count];
            for (int index = 0; index < result.Length; index++) result[index] = frames[index].durationMs;
            return result;
        }

        private static string[] CollaboratorValues(PiXiEEDCreatorDocument[] collaborators, bool roles) {
            string[] result = new string[collaborators.Length];
            for (int index = 0; index < collaborators.Length; index++) {
                PiXiEEDCreatorDocument collaborator = collaborators[index];
                result[index] = roles
                    ? (collaborator == null ? "" : collaborator.role)
                    : (collaborator == null ? "" : collaborator.creatorId);
            }
            return result;
        }

        private static void EnsureFolder(string path) {
            string[] parts = path.Split('/');
            string current = parts[0];
            for (int index = 1; index < parts.Length; index++) {
                string next = current + "/" + parts[index];
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(current, parts[index]);
                current = next;
            }
        }

        private static string Safe(string value, string fallback) {
            string result = System.Text.RegularExpressions.Regex.Replace(value ?? "", "[^A-Za-z0-9_-]+", "_").Trim('_');
            return string.IsNullOrEmpty(result) ? fallback : result;
        }
    }
}
#endif
`;
}

export function unityReadmeSource(): string {
  return `# PiXiEED Unity Asset Import\n\nこのZIPのAssetsフォルダーをUnityプロジェクトのルートへコピーしてください。Unity EditorがPiXiEEDAsset.jsonを検出すると、固定PNGから次の成果物を自動生成します。\n\n- Sprite（Point filter／Uncompressed／指定Pixels Per Unit）\n- ScriptableObject（PiXiEEDAsset）\n- AnimationClip（フレームごとの表示時間を保持）\n- AnimatorController（登録済みアニメーションを状態化）\n- Prefab（SpriteRenderer、Animator、PiXiEEDAssetAnimator付き）\n- TILEの場合はTileアセット\n\n## 出力の正本\n\nPiXiEEDAsset.jsonがアセット定義の正本です。assetId、revisionId、contentHash、manifestHash、出典、依存アセット、Pivot、フレームサイズ、Pixels Per Unit、Motion／Direction一覧、任意の制作者・共同制作者・License情報を保持します。PiXiEEDPackage.jsonにはZIP全体のpackageHashと収録ファイル一覧を保存します（packageHashは循環を避けるためPiXiEEDPackage.json自身を除外）。\n\n## 使い方\n\nPrefabをSceneへ配置し、PiXiEEDAssetAnimatorのmotion／directionを指定してください。指定した組み合わせが無い場合は「同じMotionのDEFAULT方向 → 初期アニメーション → 先頭」の順に安全にフォールバックします。iGAMEから利用する場合も、このPrefabまたはPiXiEEDAssetを参照して同じアニメーションIDを指定できます。\n\n- 対応種別: CHARACTER / OBJECT / TILE / BACKGROUND / EFFECT\n- 画像はiDRAWで表示中の合成フレームを固定保存しており、Unity側からPiXiEEDへ逆同期しません。\n- 同じassetIdでもrevisionIdが異なる出力は別フォルダーへ保存されます。\n- ローカル下書きは権利許諾済みとは扱いません。License情報が必要な場合は、出力時に明示的に付与してください。\n- 本パッケージのデータ生成・ハッシュ計算はPiXiEED側で検証済みです。Unity EditorのImport／Compile／実機再生は、利用するUnityプロジェクトで別途確認してください。\n`;
}
