/**
 * STUDIO-010 Golden Project.
 *
 * This module is the first cross-tool vertical slice: a Draw revision and an
 * Audio revision become canonical Game components and a lockable integration
 * manifest.  It deliberately carries metadata and hashes only; pixel/audio
 * bytes stay in their source tools and are resolved by a later provider.
 */
import {
  asAssetId,
  asAssetRevisionId,
  asComponentId,
  asDependencyId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  type AssetKind,
  type AssetReferenceMode,
  asSha256,
  type CallerContext,
  createGameProject,
  type Dependency,
  type GameProject,
  type GameProjectDraft,
  type Sha256,
} from "../game/game-300/core.ts";
import {
  type AssetBinding,
  type CanonicalAssetRevision,
  createIntegratedPackage,
  type DependencyLock,
  type IntegrationDiagnostic,
  type LicenseSnapshot,
  type PackageManifest,
} from "../game/game-340/core.ts";

export const GOLDEN_PROJECT_SCHEMA_VERSION = 1 as const;

export interface GoldenAssetInput {
  readonly projectId: string;
  readonly ownerId: string;
  readonly kind: AssetKind;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly licenseId: string;
  readonly permission: "READ" | "PREVIEW";
  readonly reviewStatus: "DRAFT" | "APPROVED";
  readonly label: string;
}

export interface GoldenProjectInput {
  readonly projectId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly revisionId?: string;
  readonly draw: GoldenAssetInput;
  readonly audio: GoldenAssetInput;
  readonly drawPlacement?: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly scaleX?: number;
    readonly scaleY?: number;
  }>;
  readonly audioSettings?: Readonly<{
    readonly loop?: boolean;
    readonly volume?: number;
  }>;
}

export type GoldenProjectStepId =
  | "DRAW_SOURCE"
  | "DRAW_SPRITE"
  | "AUDIO_SOURCE"
  | "AUDIO_BINDING"
  | "GAME_SCENE"
  | "PLAY_PREVIEW"
  | "PINNED_PACKAGE";

export interface GoldenProjectStep {
  readonly id: GoldenProjectStepId;
  readonly status: "READY" | "NEXT";
  readonly label: string;
  readonly detail: string;
}

export interface GoldenProjectResult {
  readonly schemaVersion: typeof GOLDEN_PROJECT_SCHEMA_VERSION;
  readonly mode: AssetReferenceMode;
  readonly project: GameProject;
  readonly manifest: PackageManifest;
  readonly caller: CallerContext;
  readonly steps: readonly GoldenProjectStep[];
  readonly previewReady: true;
  readonly packageReady: boolean;
}

export interface GoldenProjectFailure {
  readonly ok: false;
  readonly diagnostics: readonly IntegrationDiagnostic[];
}

export interface GoldenProjectSuccess {
  readonly ok: true;
  readonly value: GoldenProjectResult;
  readonly diagnostics: readonly [];
}

export type GoldenProjectBuildResult =
  | GoldenProjectSuccess
  | GoldenProjectFailure;

const DRAW_ENTITY_ID = "golden:entity:hero";
const AUDIO_ENTITY_ID = "golden:entity:music";
const DRAW_COMPONENT_ID = "golden:component:hero-sprite";
const AUDIO_COMPONENT_ID = "golden:component:music-source";
const DRAW_DEPENDENCY_ID = "golden:dependency:draw";
const AUDIO_DEPENDENCY_ID = "golden:dependency:audio";
const GOLDEN_SCENE_ID = "golden:scene:main";

function diagnostic(
  code: IntegrationDiagnostic["code"],
  path: string,
  message: string,
  recoverable = true,
): IntegrationDiagnostic {
  return { code, path, message, recoverable };
}

function failure(
  ...diagnostics: IntegrationDiagnostic[]
): GoldenProjectFailure {
  return { ok: false, diagnostics };
}

function assertFiniteNumber(
  value: number,
  path: string,
): IntegrationDiagnostic[] {
  return Number.isFinite(value)
    ? []
    : [diagnostic("INVALID_CLAIM", path, "Number must be finite.")];
}

function validateAsset(
  asset: GoldenAssetInput,
  expectedKind: AssetKind,
  path: string,
  projectId: string,
  ownerId: string,
): IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = [];
  if (asset.kind !== expectedKind) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        `${path}.kind`,
        `${expectedKind} asset is required for the Golden Project.`,
      ),
    );
  }
  if (asset.projectId !== projectId) {
    diagnostics.push(
      diagnostic(
        "WRONG_PROJECT",
        `${path}.projectId`,
        "Asset project does not match.",
      ),
    );
  }
  if (asset.ownerId !== ownerId) {
    diagnostics.push(
      diagnostic(
        "WRONG_OWNER",
        `${path}.ownerId`,
        "Asset owner does not match.",
      ),
    );
  }
  if (!asset.label.trim()) {
    diagnostics.push(
      diagnostic("INVALID_CLAIM", `${path}.label`, "Asset label is required."),
    );
  }
  if (!asset.licenseId.trim()) {
    diagnostics.push(
      diagnostic(
        "LICENSE_MISSING",
        `${path}.licenseId`,
        "License id is required.",
      ),
    );
  }
  try {
    asAssetId(asset.assetId);
    asAssetRevisionId(asset.revisionId);
    asSha256(asset.contentHash);
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        path,
        error instanceof Error ? error.message : "Asset identity is invalid.",
      ),
    );
  }
  return diagnostics;
}

function buildAssetReference(
  asset: GoldenAssetInput,
  mode: AssetReferenceMode,
): {
  readonly kind: AssetKind;
  readonly assetId: ReturnType<typeof asAssetId>;
  readonly revisionId: ReturnType<typeof asAssetRevisionId>;
  readonly ownerId: ReturnType<typeof asOwnerId>;
  readonly contentHash: Sha256;
  readonly mode: AssetReferenceMode;
} {
  return {
    kind: asset.kind,
    assetId: asAssetId(asset.assetId),
    revisionId: asAssetRevisionId(asset.revisionId),
    ownerId: asOwnerId(asset.ownerId),
    contentHash: asSha256(asset.contentHash),
    mode,
  };
}

function createDependency(
  dependencyId: string,
  ownerId: ReturnType<typeof asOwnerId>,
  projectRevisionId: ReturnType<typeof asRevisionId>,
  asset: GoldenAssetInput,
): Dependency {
  return {
    dependencyId: asDependencyId(dependencyId),
    kind: "ASSET",
    ownerId,
    ownerRevisionId: projectRevisionId,
    targetId: asset.assetId,
    targetRevisionId: asset.revisionId,
    dependsOn: [],
  };
}

function createBinding(
  componentId: string,
  asset: GoldenAssetInput,
  projectId: string,
  ownerId: string,
  mode: AssetReferenceMode,
): AssetBinding {
  const base: AssetBinding = {
    componentId,
    projectId,
    ownerId,
    kind: asset.kind,
    assetId: asset.assetId,
    mode,
    licenseId: asset.licenseId,
    permission: asset.permission,
  };
  return mode === "PINNED"
    ? {
      ...base,
      revisionId: asset.revisionId,
      contentHash: asSha256(asset.contentHash),
    }
    : base;
}

function createAuthority(
  asset: GoldenAssetInput,
): CanonicalAssetRevision {
  return {
    projectId: asset.projectId,
    ownerId: asset.ownerId,
    kind: asset.kind,
    assetId: asset.assetId,
    revisionId: asset.revisionId,
    contentHash: asSha256(asset.contentHash),
    licenseId: asset.licenseId,
    permission: asset.permission,
    reviewStatus: asset.reviewStatus,
  };
}

function createDependencyLock(
  dependency: Dependency,
  asset: GoldenAssetInput,
): DependencyLock {
  return {
    dependencyId: String(dependency.dependencyId),
    targetId: asset.assetId,
    targetRevisionId: asset.revisionId,
    contentHash: asSha256(asset.contentHash),
    licenseId: asset.licenseId,
    dependsOn: [],
  };
}

function createLicenseSnapshots(
  assets: readonly GoldenAssetInput[],
  mode: AssetReferenceMode,
  projectRevisionId: string,
): LicenseSnapshot[] {
  const scope = mode === "PINNED" ? "PACKAGE" : "PREVIEW";
  const unique = new Map<string, LicenseSnapshot>();
  for (const asset of assets) {
    if (!unique.has(asset.licenseId)) {
      unique.set(asset.licenseId, {
        licenseId: asset.licenseId,
        ownerId: asset.ownerId,
        scope,
        revisionId: projectRevisionId,
      });
    }
  }
  return [...unique.values()];
}

function createSteps(
  draw: GoldenAssetInput,
  audio: GoldenAssetInput,
  mode: AssetReferenceMode,
): GoldenProjectStep[] {
  return [
    {
      id: "DRAW_SOURCE",
      status: "READY",
      label: "iDRAW素材",
      detail: `${draw.label} / ${draw.revisionId}`,
    },
    {
      id: "DRAW_SPRITE",
      status: "READY",
      label: "Sprite登録",
      detail: "Game SceneのキャラクターSpriteとして登録済み",
    },
    {
      id: "AUDIO_SOURCE",
      status: "READY",
      label: "iAUDIO素材",
      detail: `${audio.label} / ${audio.revisionId}`,
    },
    {
      id: "AUDIO_BINDING",
      status: "READY",
      label: "BGM設定",
      detail: "Game SceneのAudio Sourceへ接続済み",
    },
    {
      id: "GAME_SCENE",
      status: "READY",
      label: "Game Scene",
      detail: "キャラクターとBGMを同一Projectへ統合済み",
    },
    {
      id: "PLAY_PREVIEW",
      status: "READY",
      label: "プレイ",
      detail: `${mode}参照でPlay Previewを開始できます`,
    },
    {
      id: "PINNED_PACKAGE",
      status: mode === "PINNED" ? "READY" : "NEXT",
      label: "固定Package",
      detail: mode === "PINNED"
        ? "Draw/AudioのRevisionとHashを固定済み"
        : "公開前にPINNEDへ切り替えて再現可能なPackageを作成",
    },
  ];
}

/**
 * Compose the first end-to-end Project.  `LIVE` is for authoring preview;
 * `PINNED` is the only mode reported as package-ready.
 */
export async function createGoldenProject(
  input: GoldenProjectInput,
  mode: AssetReferenceMode,
): Promise<GoldenProjectBuildResult> {
  const inputDiagnostics = [
    ...validateAsset(
      input.draw,
      "DRAW",
      "draw",
      input.projectId,
      input.ownerId,
    ),
    ...validateAsset(
      input.audio,
      "AUDIO",
      "audio",
      input.projectId,
      input.ownerId,
    ),
    ...(input.name.trim()
      ? []
      : [diagnostic("INVALID_CLAIM", "name", "Project name is required.")]),
    ...(input.drawPlacement === undefined ? [] : [
      ...assertFiniteNumber(input.drawPlacement.x, "drawPlacement.x"),
      ...assertFiniteNumber(input.drawPlacement.y, "drawPlacement.y"),
      ...(input.drawPlacement.scaleX === undefined ? [] : assertFiniteNumber(
        input.drawPlacement.scaleX,
        "drawPlacement.scaleX",
      )),
      ...(input.drawPlacement.scaleY === undefined ? [] : assertFiniteNumber(
        input.drawPlacement.scaleY,
        "drawPlacement.scaleY",
      )),
    ]),
    ...(input.audioSettings?.volume === undefined
      ? []
      : assertFiniteNumber(input.audioSettings.volume, "audioSettings.volume")),
  ];
  if (inputDiagnostics.length > 0) return failure(...inputDiagnostics);

  try {
    const projectId = asProjectId(input.projectId);
    const ownerId = asOwnerId(input.ownerId);
    const projectRevisionId = asRevisionId(
      input.revisionId ?? "golden:project-revision:1",
    );
    const caller: CallerContext = {
      projectId,
      ownerId,
      revisionId: projectRevisionId,
    };
    const drawReference = buildAssetReference(input.draw, mode) as
      & ReturnType<
        typeof buildAssetReference
      >
      & { readonly kind: "DRAW" };
    const audioReference = buildAssetReference(input.audio, mode) as
      & ReturnType<
        typeof buildAssetReference
      >
      & { readonly kind: "AUDIO" };
    const drawDependency = createDependency(
      DRAW_DEPENDENCY_ID,
      ownerId,
      projectRevisionId,
      input.draw,
    );
    const audioDependency = createDependency(
      AUDIO_DEPENDENCY_ID,
      ownerId,
      projectRevisionId,
      input.audio,
    );
    const drawX = input.drawPlacement?.x ?? 0;
    const drawY = input.drawPlacement?.y ?? 0;
    const scaleX = input.drawPlacement?.scaleX ?? 1;
    const scaleY = input.drawPlacement?.scaleY ?? 1;
    const audioVolume = input.audioSettings?.volume ?? 1;
    const audioLoop = input.audioSettings?.loop ?? true;
    const sceneId = asSceneId(GOLDEN_SCENE_ID);
    const drawEntityId = asEntityId(DRAW_ENTITY_ID);
    const audioEntityId = asEntityId(AUDIO_ENTITY_ID);
    const drawComponentId = asComponentId(DRAW_COMPONENT_ID);
    const audioComponentId = asComponentId(AUDIO_COMPONENT_ID);
    const draft: GameProjectDraft = {
      schemaVersion: 1,
      projectId,
      ownerId,
      name: input.name.trim(),
      revision: {
        revisionId: projectRevisionId,
        projectId,
        ownerId,
        sequence: 1,
      },
      scenes: [{
        sceneId,
        name: "Main Scene",
        rootEntityIds: [drawEntityId, audioEntityId],
        entities: [
          {
            entityId: drawEntityId,
            name: input.draw.label,
            components: [
              {
                type: "TRANSFORM",
                componentId: asComponentId("golden:component:hero-transform"),
                x: drawX,
                y: drawY,
                rotation: 0,
                scaleX,
                scaleY,
              },
              {
                type: "SPRITE",
                componentId: drawComponentId,
                asset: drawReference,
                visible: true,
              },
            ],
          },
          {
            entityId: audioEntityId,
            name: input.audio.label,
            components: [{
              type: "AUDIO_SOURCE",
              componentId: audioComponentId,
              asset: audioReference,
              loop: audioLoop,
              volume: audioVolume,
            }],
          },
        ],
      }],
      prefabs: [],
      dependencies: [drawDependency, audioDependency],
      behaviors: [],
      editorTimeline: {
        frameCount: 1,
        tracks: [
          {
            trackId: "golden:track:hero",
            label: input.draw.label,
            kind: "SPRITE",
            activeFrames: [0],
            role: "PLAYER",
            components: [
              {
                type: "TRANSFORM",
                componentId: asComponentId("golden:timeline:hero-transform"),
                x: drawX,
                y: drawY,
                rotation: 0,
                scaleX,
                scaleY,
              },
              {
                type: "SPRITE",
                componentId: asComponentId("golden:timeline:hero-sprite"),
                visible: true,
              },
            ],
          },
          {
            trackId: "golden:track:music",
            label: input.audio.label,
            kind: "MUSIC",
            activeFrames: [0],
            role: "AUDIO",
            components: [{
              type: "AUDIO_SOURCE",
              componentId: asComponentId("golden:timeline:music-source"),
              loop: audioLoop,
              volume: audioVolume,
            }],
          },
        ],
      },
    };
    const project = await createGameProject(draft, caller);
    const bindings = [
      createBinding(
        DRAW_COMPONENT_ID,
        input.draw,
        input.projectId,
        input.ownerId,
        mode,
      ),
      createBinding(
        AUDIO_COMPONENT_ID,
        input.audio,
        input.projectId,
        input.ownerId,
        mode,
      ),
    ];
    const authority = [
      createAuthority(input.draw),
      createAuthority(input.audio),
    ];
    const dependencyLocks = [
      createDependencyLock(drawDependency, input.draw),
      createDependencyLock(audioDependency, input.audio),
    ];
    const licenses = createLicenseSnapshots(
      [input.draw, input.audio],
      mode,
      String(project.revision.revisionId),
    );
    const packageResult = await createIntegratedPackage(
      project,
      caller,
      bindings,
      authority,
      dependencyLocks,
      licenses,
    );
    if (!packageResult.ok || packageResult.value === undefined) {
      return failure(...packageResult.diagnostics);
    }
    return {
      ok: true,
      value: {
        schemaVersion: GOLDEN_PROJECT_SCHEMA_VERSION,
        mode,
        project,
        manifest: packageResult.value,
        caller,
        steps: createSteps(input.draw, input.audio, mode),
        previewReady: true,
        packageReady: mode === "PINNED",
      },
      diagnostics: [],
    };
  } catch (error) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        "input",
        error instanceof Error
          ? error.message
          : "Golden Project input is invalid.",
      ),
    );
  }
}
