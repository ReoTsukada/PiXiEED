/**
 * GAME-330 deterministic build and artifact provenance.
 *
 * This module is deliberately an isolated value layer. It does not execute a
 * compiler, read a project, access the host, or publish an artifact. A caller
 * supplies already-authorized, already-materialized inputs and this module
 * canonicalizes and verifies them.
 */

import {
  canonicalJson,
  sha256,
  validateGameProject,
  type CallerContext,
  type GameProject,
  type Sha256,
} from "../game-300/core.ts";

export const GAME_BUILD_SCHEMA_VERSION = 1 as const;
export const GAME_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type BuildTarget = "WEB" | "ANDROID" | "IOS" | "DESKTOP" | "UNITY" | "UNREAL" | "GODOT" | "WASM";
export type BuildProfile = "DEBUG" | "RELEASE" | "DETERMINISTIC";
export type BuildLanguage = "TYPESCRIPT" | "RUST" | "GDSCRIPT" | "C_SHARP" | "CPP";
export type BuildStatus = "READY" | "QUARANTINED" | "FAILED" | "CANCELLED";

export type BuildDiagnosticCode =
  | "INVALID_PLAN"
  | "PROJECT_ID_MISMATCH"
  | "OWNER_MISMATCH"
  | "REVISION_MISMATCH"
  | "STALE_PROJECT"
  | "STALE_LOCK"
  | "MISSING_LOCK"
  | "TAMPERED_HASH"
  | "DUPLICATE_ID"
  | "DUPLICATE_PATH"
  | "PATH_TRAVERSAL"
  | "DEPENDENCY_CYCLE"
  | "UNSUPPORTED_TARGET"
  | "UNSUPPORTED_LANGUAGE"
  | "UNSUPPORTED_CAPABILITY"
  | "MISSING_LICENSE"
  | "INVALID_LICENSE"
  | "INVALID_MODULE"
  | "PARTIAL_ARTIFACT"
  | "CACHE_COLLISION"
  | "CANCELLED"
  | "QUARANTINED"
  | "INVALID_PACKAGE";

export interface BuildDiagnostic {
  readonly code: BuildDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface BuildResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly diagnostics: readonly BuildDiagnostic[];
}

export interface BuildCallerClaim {
  readonly projectId: string;
  readonly ownerId: string;
  readonly revisionId: string;
}

export interface AssetRevisionLock {
  readonly assetId: string;
  readonly revisionId: string;
  readonly kind: "DRAW" | "AUDIO";
  readonly contentHash: Sha256;
  readonly mode: "PINNED";
}

export interface DependencyLock {
  readonly dependencyId: string;
  readonly targetId: string;
  readonly targetRevisionId: string;
  readonly contentHash: Sha256;
  readonly licenseId: string;
  readonly dependsOn: readonly string[];
}

export interface LicenseGrant {
  readonly licenseId: string;
  readonly ownerId: string;
  readonly scope: "BUILD";
  readonly revisionId: string;
}

export interface BuildPlanRequest {
  readonly target: BuildTarget;
  readonly profile: BuildProfile;
  readonly language: BuildLanguage;
  readonly module: string;
  readonly capabilities: readonly string[];
  readonly dependencyLocks: readonly DependencyLock[];
  readonly assetLocks: readonly AssetRevisionLock[];
  readonly licenses: readonly LicenseGrant[];
}

export interface BuildPlan {
  readonly schemaVersion: typeof GAME_BUILD_SCHEMA_VERSION;
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly behaviorIrHash: Sha256;
  readonly target: BuildTarget;
  readonly profile: BuildProfile;
  readonly language: BuildLanguage;
  readonly module: string;
  readonly capabilities: readonly string[];
  readonly dependencyLocks: readonly DependencyLock[];
  readonly assetLocks: readonly AssetRevisionLock[];
  readonly licenses: readonly LicenseGrant[];
  readonly planHash: Sha256;
}

export interface PackageEntry {
  readonly path: string;
  readonly content: string;
  /** A caller claim is never trusted; it is compared to the computed hash. */
  readonly contentHash?: Sha256;
}

export interface ArtifactEntry {
  readonly path: string;
  readonly contentHash: Sha256;
  readonly byteLength: number;
}

export interface ArtifactProvenance {
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly planHash: Sha256;
  readonly dependencyLockHash: Sha256;
  readonly assetLockHash: Sha256;
  readonly licenseHash: Sha256;
}

export interface ArtifactManifest {
  readonly schemaVersion: typeof GAME_ARTIFACT_SCHEMA_VERSION;
  readonly artifactId: string;
  readonly target: BuildTarget;
  readonly profile: BuildProfile;
  readonly language: BuildLanguage;
  readonly module: string;
  readonly status: BuildStatus;
  readonly entries: readonly ArtifactEntry[];
  readonly packageHash: Sha256;
  readonly cacheIdentity: Sha256;
  readonly reproducibleBuildIdentity: Sha256;
  readonly artifactHash: Sha256;
  readonly provenance: ArtifactProvenance;
}

export interface ArtifactCandidate {
  readonly manifest: ArtifactManifest;
  readonly entries: readonly PackageEntry[];
}

function diagnostic(code: BuildDiagnosticCode, path: string, message: string, recoverable = true): BuildDiagnostic {
  return { code, path, message, recoverable };
}
function success<T>(value: T): BuildResult<T> { return { ok: true, value, diagnostics: [] }; }
function failure<T>(...diagnostics: BuildDiagnostic[]): BuildResult<T> { return { ok: false, diagnostics }; }
function stable(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value); }
function hash(value: unknown): Promise<Sha256> { return sha256(value); }
function validHash(value: unknown): value is Sha256 { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function key(kind: string, id: string, revision: string): string { return `${kind}:${id}:${revision}`; }
function unique(values: readonly string[], path: string): BuildDiagnostic[] {
  const seen = new Set<string>();
  const result: BuildDiagnostic[] = [];
  for (const value of values) {
    if (seen.has(value)) result.push(diagnostic("DUPLICATE_ID", path, `Duplicate identifier: ${value}`));
    seen.add(value);
  }
  return result;
}

function callerDiagnostics(plan: Pick<BuildPlan, "projectId" | "ownerId" | "projectRevisionId">, caller: BuildCallerClaim): BuildDiagnostic[] {
  const result: BuildDiagnostic[] = [];
  if (plan.projectId !== caller.projectId) result.push(diagnostic("PROJECT_ID_MISMATCH", "caller.projectId", "Caller project does not match the build plan."));
  if (plan.ownerId !== caller.ownerId) result.push(diagnostic("OWNER_MISMATCH", "caller.ownerId", "Caller owner does not match the build plan."));
  if (plan.projectRevisionId !== caller.revisionId) result.push(diagnostic("REVISION_MISMATCH", "caller.revisionId", "Caller revision does not match the build plan."));
  return result;
}

function targetDiagnostics(request: Pick<BuildPlanRequest, "target" | "language" | "capabilities" | "module">): BuildDiagnostic[] {
  const result: BuildDiagnostic[] = [];
  if (!stable(request.module)) result.push(diagnostic("INVALID_MODULE", "module", "Module must be a stable identifier."));
  const allowed: Readonly<Record<BuildTarget, readonly BuildLanguage[]>> = {
    WEB: ["TYPESCRIPT"], ANDROID: ["KOTLIN" as BuildLanguage, "C_SHARP"], IOS: ["SWIFT" as BuildLanguage, "C_SWIFT" as BuildLanguage],
    DESKTOP: ["TYPESCRIPT", "RUST", "CPP"], UNITY: ["C_SHARP"], UNREAL: ["CPP"], GODOT: ["GDSCRIPT", "C_SHARP", "CPP"], WASM: ["RUST", "TYPESCRIPT"],
  };
  if (!allowed[request.target]?.includes(request.language)) result.push(diagnostic("UNSUPPORTED_LANGUAGE", "language", `${request.language} is not supported for ${request.target}.`));
  const supported = new Set(["INPUT", "AUDIO", "DRAW", "PHYSICS", "SAVE_STATE", "NETWORK_BRIDGE"]);
  for (const capability of request.capabilities) if (!supported.has(capability)) result.push(diagnostic("UNSUPPORTED_CAPABILITY", "capabilities", `Unsupported capability: ${capability}`));
  if (request.target === "WEB" && request.capabilities.includes("NETWORK_BRIDGE")) result.push(diagnostic("UNSUPPORTED_CAPABILITY", "capabilities", "WEB build cannot request NETWORK_BRIDGE in the isolated builder."));
  return result;
}

function assetReferences(project: GameProject): AssetRevisionLock[] {
  const result = new Map<string, AssetRevisionLock>();
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") continue;
    const asset = component.asset;
    result.set(key(asset.kind, String(asset.assetId), String(asset.revisionId)), { assetId: String(asset.assetId), revisionId: String(asset.revisionId), kind: asset.kind, contentHash: asset.contentHash, mode: "PINNED" });
  }
  return [...result.values()].sort((a, b) => key(a.kind, a.assetId, a.revisionId).localeCompare(key(b.kind, b.assetId, b.revisionId)));
}

function dependencyIds(project: GameProject): readonly string[] { return project.dependencies.map((item) => String(item.dependencyId)).sort(); }

function cycleDiagnostics(locks: readonly DependencyLock[]): BuildDiagnostic[] {
  const byId = new Map(locks.map((lock) => [lock.dependencyId, lock]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: BuildDiagnostic[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) { result.push(diagnostic("DEPENDENCY_CYCLE", "dependencyLocks", `Dependency cycle includes ${id}.`)); return; }
    if (visited.has(id)) return;
    const lock = byId.get(id);
    if (!lock) { result.push(diagnostic("MISSING_LOCK", "dependencyLocks.dependsOn", `Missing dependency lock: ${id}`)); return; }
    visiting.add(id);
    for (const dependency of lock.dependsOn) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const lock of locks) visit(lock.dependencyId);
  return result;
}

function lockDiagnostics(request: BuildPlanRequest, project: GameProject): BuildDiagnostic[] {
  const result: BuildDiagnostic[] = [];
  result.push(...unique(request.dependencyLocks.map((item) => item.dependencyId), "dependencyLocks.dependencyId"));
  result.push(...unique(request.assetLocks.map((item) => key(item.kind, item.assetId, item.revisionId)), "assetLocks"));
  result.push(...unique(request.licenses.map((item) => item.licenseId), "licenses.licenseId"));
  for (const lock of [...request.dependencyLocks, ...request.assetLocks]) if (!validHash(lock.contentHash)) result.push(diagnostic("TAMPERED_HASH", "locks.contentHash", "Lock content hash must be lowercase SHA-256."));
  const expectedAssets = assetReferences(project).map((item) => key(item.kind, item.assetId, item.revisionId));
  const actualAssets = request.assetLocks.map((item) => key(item.kind, item.assetId, item.revisionId));
  for (const expected of expectedAssets) if (!actualAssets.includes(expected)) result.push(diagnostic("MISSING_LOCK", "assetLocks", `Missing asset lock: ${expected}`));
  for (const actual of actualAssets) if (!expectedAssets.includes(actual)) result.push(diagnostic("STALE_LOCK", "assetLocks", `Asset lock is not referenced by the project: ${actual}`));
  for (const lock of request.assetLocks) if (lock.mode !== "PINNED") result.push(diagnostic("STALE_LOCK", "assetLocks.mode", "Build assets must be pinned to an immutable revision."));
  const expectedDependencies = dependencyIds(project);
  const actualDependencies = request.dependencyLocks.map((item) => item.dependencyId).sort();
  if (canonicalJson(expectedDependencies) !== canonicalJson(actualDependencies)) result.push(diagnostic("MISSING_LOCK", "dependencyLocks", "Dependency lock set does not exactly match the project dependencies."));
  for (const lock of request.dependencyLocks) {
    const license = request.licenses.find((item) => item.licenseId === lock.licenseId);
    if (!license) result.push(diagnostic("MISSING_LICENSE", `licenses.${lock.licenseId}`, "Dependency license grant is missing."));
    else if (license.scope !== "BUILD" || license.ownerId !== project.ownerId || license.revisionId !== project.revision.revisionId) result.push(diagnostic("INVALID_LICENSE", `licenses.${lock.licenseId}`, "License grant is not bound to this owner, revision, and build."));
  }
  result.push(...cycleDiagnostics(request.dependencyLocks));
  return result;
}

export async function createBuildPlan(project: GameProject, caller: CallerContext, request: BuildPlanRequest): Promise<BuildResult<BuildPlan>> {
  const validation = validateGameProject(project, caller);
  if (!validation.valid) return failure(...validation.diagnostics.map((item) => {
    const code: BuildDiagnosticCode = item.code === "CALLER_OWNER_MISMATCH" ? "OWNER_MISMATCH" : item.code === "PROJECT_ID_MISMATCH" ? "PROJECT_ID_MISMATCH" : item.code === "CALLER_REVISION_MISMATCH" ? "REVISION_MISMATCH" : "INVALID_PLAN";
    return diagnostic(code, item.path, item.message);
  }));
  const callerClaim: BuildCallerClaim = { projectId: String(caller.projectId), ownerId: String(caller.ownerId), revisionId: String(caller.revisionId) };
  const target = targetDiagnostics(request);
  const locks = lockDiagnostics(request, project);
  if (target.length || locks.length) return failure(...target, ...locks);
  const base = {
    schemaVersion: GAME_BUILD_SCHEMA_VERSION, projectId: String(project.projectId), ownerId: String(project.ownerId), projectRevisionId: String(project.revision.revisionId),
    projectHash: project.revision.snapshotHash, behaviorIrHash: await hash(project.behaviors), target: request.target, profile: request.profile, language: request.language, module: request.module,
    capabilities: [...new Set(request.capabilities)].sort(), dependencyLocks: [...request.dependencyLocks].sort((a, b) => a.dependencyId.localeCompare(b.dependencyId)), assetLocks: [...request.assetLocks].sort((a, b) => key(a.kind, a.assetId, a.revisionId).localeCompare(key(b.kind, b.assetId, b.revisionId))), licenses: [...request.licenses].sort((a, b) => a.licenseId.localeCompare(b.licenseId)),
  } satisfies Omit<BuildPlan, "planHash">;
  const planHash = await hash(base);
  const plan = { ...base, planHash };
  const callerCheck = callerDiagnostics(plan, callerClaim);
  return callerCheck.length ? failure(...callerCheck) : success(plan);
}

export async function validateBuildPlan(plan: BuildPlan, caller: BuildCallerClaim): Promise<BuildResult<BuildPlan>> {
  const diagnostics = [...callerDiagnostics(plan, caller), ...targetDiagnostics(plan), ...cycleDiagnostics(plan.dependencyLocks)];
  if (plan.schemaVersion !== GAME_BUILD_SCHEMA_VERSION) diagnostics.push(diagnostic("INVALID_PLAN", "schemaVersion", "Unsupported build plan schema."));
  if (!validHash(plan.projectHash) || !validHash(plan.behaviorIrHash) || !validHash(plan.planHash)) diagnostics.push(diagnostic("TAMPERED_HASH", "planHash", "Build plan hash fields are invalid."));
  const { planHash, ...base } = plan;
  if (validHash(planHash) && await hash(base) !== planHash) diagnostics.push(diagnostic("TAMPERED_HASH", "planHash", "Build plan content hash does not match its contents."));
  return diagnostics.length ? failure(...diagnostics) : success(plan);
}

function safePackagePath(path: string): boolean {
  return path.length > 0 && !path.includes("\\") && !path.includes("\0") && !path.startsWith("/") && !/^[A-Za-z]:/u.test(path) && !path.split("/").includes("..") && !path.split("/").includes(".");
}

async function packageMaterial(plan: BuildPlan, entries: readonly PackageEntry[]): Promise<{ entries: ArtifactEntry[]; packageHash: Sha256 } | BuildDiagnostic[]> {
  const diagnostics: BuildDiagnostic[] = [];
  const paths = entries.map((entry) => entry.path);
  for (const entry of entries) {
    if (!safePackagePath(entry.path)) diagnostics.push(diagnostic("PATH_TRAVERSAL", `entries.${entry.path}`, "Package path is not a safe relative path."));
    if (entry.contentHash && (!validHash(entry.contentHash) || await hash(entry.content) !== entry.contentHash)) diagnostics.push(diagnostic("TAMPERED_HASH", `entries.${entry.path}.contentHash`, "Caller content hash does not match package content."));
  }
  diagnostics.push(...unique(paths, "entries.path").map((item) => ({ ...item, code: "DUPLICATE_PATH" as const })));
  if (entries.length === 0) diagnostics.push(diagnostic("PARTIAL_ARTIFACT", "entries", "An artifact package must contain at least one entry."));
  if (diagnostics.length) return diagnostics;
  const material = (await Promise.all(entries.map(async (entry) => ({ path: entry.path, contentHash: await hash(entry.content), byteLength: new TextEncoder().encode(entry.content).byteLength })))).sort((a, b) => a.path.localeCompare(b.path));
  return { entries: material, packageHash: await hash({ planHash: plan.planHash, entries: material }) };
}

async function manifestBase(plan: BuildPlan, material: { entries: readonly ArtifactEntry[]; packageHash: Sha256 }, status: BuildStatus): Promise<Omit<ArtifactManifest, "artifactHash" | "cacheIdentity" | "reproducibleBuildIdentity">> {
  const dependencyLockHash = await hash(plan.dependencyLocks);
  const assetLockHash = await hash(plan.assetLocks);
  const licenseHash = await hash(plan.licenses);
  const provenance: ArtifactProvenance = { projectId: plan.projectId, ownerId: plan.ownerId, projectRevisionId: plan.projectRevisionId, projectHash: plan.projectHash, planHash: plan.planHash, dependencyLockHash, assetLockHash, licenseHash };
  return { schemaVersion: GAME_ARTIFACT_SCHEMA_VERSION, artifactId: `artifact:${plan.planHash}`, target: plan.target, profile: plan.profile, language: plan.language, module: plan.module, status, entries: material.entries, packageHash: material.packageHash, provenance };
}

export async function buildArtifact(plan: BuildPlan, entries: readonly PackageEntry[], caller: BuildCallerClaim, options: { readonly cancel?: boolean; readonly quarantine?: boolean } = {}): Promise<BuildResult<ArtifactManifest>> {
  const planResult = await validateBuildPlan(plan, caller);
  if (!planResult.ok) return failure(...planResult.diagnostics);
  if (options.cancel) return failure(diagnostic("CANCELLED", "status", "Build was cancelled before an artifact became READY."));
  const material = await packageMaterial(plan, entries);
  if (Array.isArray(material)) return failure(...material);
  const base = await manifestBase(plan, material, options.quarantine ? "QUARANTINED" : "READY");
  const cacheIdentity = await hash({ planHash: plan.planHash, target: plan.target, profile: plan.profile, module: plan.module });
  const reproducibleBuildIdentity = await hash({ cacheIdentity, packageHash: material.packageHash, artifactEntries: material.entries });
  const artifactHash = await hash({ ...base, cacheIdentity, reproducibleBuildIdentity });
  return success({ ...base, cacheIdentity, reproducibleBuildIdentity, artifactHash });
}

export async function validateArtifactPackage(plan: BuildPlan, candidate: ArtifactCandidate, caller: BuildCallerClaim): Promise<BuildResult<ArtifactManifest>> {
  const planResult = await validateBuildPlan(plan, caller);
  if (!planResult.ok) return failure(...planResult.diagnostics);
  const material = await packageMaterial(plan, candidate.entries);
  if (Array.isArray(material)) return failure(...material);
  const expected = await buildArtifact(plan, candidate.entries, caller, { quarantine: candidate.manifest.status === "QUARANTINED" });
  if (!expected.ok) return failure(...expected.diagnostics);
  if (canonicalJson(candidate.manifest) !== canonicalJson(expected.value)) return failure(diagnostic("TAMPERED_HASH", "manifest", "Artifact manifest does not match the deterministic package result."));
  return success(candidate.manifest);
}

export async function rollbackArtifact(artifact: ArtifactManifest, reason: "CANCELLED" | "QUARANTINED"): Promise<ArtifactManifest> {
  return { ...artifact, status: reason };
}
