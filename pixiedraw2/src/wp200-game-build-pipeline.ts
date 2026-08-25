/** WP-200 Game Build/Artifact adapter. Build is separate from Runtime and Publish. */

import {
  type BuildConfiguration,
  type ContentHash,
  type PackageId,
  type RuntimeDiagnostic,
  type RuntimeVersionContract,
  asSha256,
  canonicalJson,
  hashCanonical,
  sha256Hex,
} from "./wp160-contracts.ts";
import {
  attachVerifiedArtifact,
  createBuildPlan,
  createBuildRecord,
  createArtifactIdentity,
  transitionBuild,
  validateBuildSecurity,
  validateBuildRequest,
} from "./wp160-build-pipeline.ts";
import type {
  BuildArtifactIdentity,
  BuildEvidence,
  BuildLifecycle,
  BuildPlan,
  BuildRecord,
  BuildRequest,
  BuildSecurityInput,
} from "./wp160-build-pipeline.ts";
import {
  type GameAssetReference,
  type GameBuildProfile,
  type GameProjectRevision,
  type GameProjectRevisionInput,
  type GameRuntimeFeatureFlags,
  validateGameProject,
} from "./wp200-game-runtime-core.ts";

export interface GameBuildRequest {
  readonly requestId: string;
  readonly project: GameProjectRevision | GameProjectRevisionInput;
  readonly packageHash: ContentHash;
  readonly configuration: BuildConfiguration;
  readonly runtime: RuntimeVersionContract;
  readonly flags: GameRuntimeFeatureFlags;
  readonly killSwitch: boolean;
  readonly security?: BuildSecurityInput;
}

export interface GameBuildPlan {
  readonly base: BuildPlan;
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly projectSnapshotHash: ContentHash;
  readonly provenanceHash: ContentHash;
  readonly manifest: string;
  readonly manifestHash: ContentHash;
  readonly cacheKey: ContentHash;
}

export interface GameRuntimeArtifactManifest {
  readonly schemaVersion: 1;
  readonly buildArtifactId: BuildArtifactIdentity["buildArtifactId"];
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly dependencySnapshotHash: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly target: BuildRequest["target"];
  readonly configurationVersion: string;
  readonly projectSnapshotHash: ContentHash;
  readonly provenanceHash: ContentHash;
  readonly artifactHash: ContentHash;
  readonly verificationState: "UNVERIFIED" | "VERIFIED";
}

export interface GameBuildRecord {
  readonly request: GameBuildRequest;
  readonly base: BuildRecord;
  readonly lifecycle: BuildLifecycle;
  readonly plan?: GameBuildPlan;
  readonly artifact?: GameRuntimeArtifactManifest;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly requestFingerprint: ContentHash;
}

export interface GameBuildRecovery {
  readonly recovered: boolean;
  readonly record: GameBuildRecord;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly retryAllowed: boolean;
}

function diagnostic(code: RuntimeDiagnostic["code"], message: string, recoverable = false): RuntimeDiagnostic {
  return { code, severity: "ERROR", message, recoverable };
}

function featureEnabled(flags: GameRuntimeFeatureFlags, killSwitch: boolean): boolean {
  return killSwitch !== true && flags["game-build"] === true;
}

function projectAssetReferences(project: GameProjectRevision | GameProjectRevisionInput): readonly GameAssetReference[] {
  const references: GameAssetReference[] = [];
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references;
}

function baseRequest(request: GameBuildRequest, project: GameProjectRevision): BuildRequest {
  return {
    requestId: request.requestId,
    packageId: project.packageId,
    packageVersion: project.packageVersion,
    packageHash: request.packageHash,
    dependencies: project.dependencies,
    target: project.buildProfile.target,
    configuration: request.configuration,
    runtime: request.runtime,
    sourceRevisionId: project.revisionId,
  };
}

export function validateGameBuildRequest(request: GameBuildRequest): readonly RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (!featureEnabled(request.flags, request.killSwitch)) diagnostics.push(diagnostic("UNSUPPORTED_CAPABILITY", "Game Build flag is OFF or the kill switch is active.", true));
  const projectValidation = validateGameProject(request.project);
  diagnostics.push(...projectValidation.diagnostics);
  if (request.project.buildProfile.runtimeVersion !== request.runtime.runtimeVersion) diagnostics.push(diagnostic("UNSUPPORTED_RUNTIME_VERSION", "Game Build Runtime version does not match the Project Build Profile."));
  for (const reference of projectAssetReferences(request.project)) {
    if (reference.mode === "LIVE") diagnostics.push(diagnostic("BUILD_INVALID_REQUEST", `LIVE Asset ${reference.assetId} cannot enter a Build; approve a PINNED Revision first.`));
  }
  if (request.project.dependencies.entries.some((entry) => entry.mode !== "PINNED")) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", "All Build dependencies must be PINNED."));
  if (request.security !== undefined) diagnostics.push(...validateBuildSecurity(request.security));
  if (request.project.schemaVersion === 1 && projectValidation.valid) {
    const base = baseRequest(request, request.project as GameProjectRevision);
    diagnostics.push(...validateBuildRequest(base));
  }
  return diagnostics;
}

export async function createGameBuildPlan(request: GameBuildRequest, project: GameProjectRevision): Promise<GameBuildPlan> {
  const base = baseRequest(request, project);
  const basePlan = await createBuildPlan(base);
  const provenanceValue = {
    projectId: project.projectId,
    projectRevisionId: project.revisionId,
    projectSnapshotHash: project.snapshotHash,
    packageId: project.packageId,
    packageVersion: project.packageVersion,
    packageHash: request.packageHash,
    dependencySnapshotHash: project.dependencies.snapshotHash,
    runtime: request.runtime,
    target: project.buildProfile.target,
    configuration: request.configuration,
  };
  const provenanceHash = await hashCanonical(provenanceValue);
  const manifestValue = { manifestVersion: 1, gameProject: provenanceValue, baseBuildManifest: basePlan.manifest, scenes: project.scenes, inputMap: project.inputMap, behaviors: project.behaviors };
  const manifest = canonicalJson(manifestValue);
  const manifestHash = await hashCanonical(manifestValue);
  const cacheKey = asSha256(await sha256Hex(canonicalJson({ baseCacheKey: basePlan.cacheKey, projectSnapshotHash: project.snapshotHash, provenanceHash, runtimeVersion: request.runtime.runtimeVersion, target: project.buildProfile.target, configuration: request.configuration })));
  return { base: basePlan, projectId: project.projectId, projectRevisionId: project.revisionId, projectSnapshotHash: project.snapshotHash, provenanceHash, manifest, manifestHash, cacheKey };
}

export async function createGameBuildRecord(request: GameBuildRequest): Promise<GameBuildRecord> {
  const diagnostics = validateGameBuildRequest(request);
  const projectValidation = validateGameProject(request.project);
  const requestFingerprint = asSha256(await sha256Hex(canonicalJson({ requestId: request.requestId, projectId: request.project.projectId, projectRevisionId: request.project.revisionId, packageHash: request.packageHash, runtime: request.runtime, configuration: request.configuration })));
  if (!projectValidation.valid || diagnostics.some((item) => item.severity === "ERROR") || !featureEnabled(request.flags, request.killSwitch)) {
    const failedBase: BuildRecord = {
      request: baseRequest(request, request.project as GameProjectRevision),
      lifecycle: "FAILED",
      diagnostics,
      requestFingerprint: await sha256Hex(canonicalJson({ requestId: request.requestId, packageId: request.project.packageId, packageVersion: request.project.packageVersion, packageHash: request.packageHash, target: request.project.buildProfile.target, configuration: request.configuration, runtime: request.runtime })),
    };
    return { request, base: failedBase, lifecycle: "FAILED", diagnostics, requestFingerprint };
  }
  const project = request.project as GameProjectRevision;
  const base = await createBuildRecord(baseRequest(request, project));
  const plan = await createGameBuildPlan(request, project);
  return { request, base: { ...base, plan: plan.base }, lifecycle: base.lifecycle, plan, diagnostics: [...diagnostics, ...base.diagnostics], requestFingerprint };
}

export function transitionGameBuild(record: GameBuildRecord, next: BuildLifecycle): GameBuildRecord {
  const base = transitionBuild(record.base, next);
  return { ...record, base, lifecycle: base.lifecycle };
}

export function createGameRuntimeArtifactManifest(record: GameBuildRecord, artifact: BuildArtifactIdentity, verificationState: "UNVERIFIED" | "VERIFIED" = "UNVERIFIED"): GameRuntimeArtifactManifest {
  if (record.plan === undefined) throw new Error("Game Build Plan is required for an artifact manifest.");
  return {
    schemaVersion: 1,
    buildArtifactId: artifact.buildArtifactId,
    projectId: record.plan.projectId,
    projectRevisionId: record.plan.projectRevisionId,
    packageId: record.base.request.packageId,
    packageVersion: record.base.request.packageVersion,
    dependencySnapshotHash: record.base.request.dependencies.snapshotHash,
    runtimeId: record.base.request.runtime.runtimeId,
    runtimeVersion: record.base.request.runtime.runtimeVersion,
    target: record.base.request.target,
    configurationVersion: record.base.request.configuration.version,
    projectSnapshotHash: record.plan.projectSnapshotHash,
    provenanceHash: record.plan.provenanceHash,
    artifactHash: artifact.artifactHash,
    verificationState,
  };
}

export function attachVerifiedGameArtifact(record: GameBuildRecord, artifact: BuildArtifactIdentity, evidence: BuildEvidence): GameBuildRecord {
  const base = attachVerifiedArtifact(record.base, artifact, evidence);
  const manifest = createGameRuntimeArtifactManifest(record, artifact, "VERIFIED");
  return { ...record, base, lifecycle: "READY", artifact: manifest, diagnostics: record.diagnostics };
}

export function recoverGameBuild(record: GameBuildRecord): GameBuildRecovery {
  if (record.lifecycle === "READY") return { recovered: false, record, diagnostics: [diagnostic("BUILD_INVALID_REQUEST", "A READY artifact is immutable and does not need recovery.", true)], retryAllowed: false };
  if (record.lifecycle === "FAILED" || record.lifecycle === "CANCELLED" || record.lifecycle === "QUARANTINED") {
    return { recovered: true, record: { ...record, diagnostics: [...record.diagnostics, diagnostic("BUILD_CANCELLED", "Build remains recoverable as a failed record; retry requires a new idempotent request.", true)] }, diagnostics: [], retryAllowed: true };
  }
  return { recovered: false, record, diagnostics: [diagnostic("BUILD_INVALID_REQUEST", "Only failed, cancelled, or quarantined Builds can enter recovery.", true)], retryAllowed: false };
}

export function canExecuteGameArtifact(manifest: GameRuntimeArtifactManifest): boolean {
  return manifest.verificationState === "VERIFIED";
}

export function artifactManifestIsImmutable(before: GameRuntimeArtifactManifest, after: GameRuntimeArtifactManifest): boolean {
  return canonicalJson(before) === canonicalJson(after);
}

export { createArtifactIdentity };
export type { GameBuildProfile };
