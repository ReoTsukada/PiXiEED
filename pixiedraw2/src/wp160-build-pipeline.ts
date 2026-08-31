/** WP-160 isolated Build/Artifact contract. Build is intentionally not Publish. */

import {
  type BuildArtifactId,
  type BuildConfiguration,
  type BuildTarget,
  type ContentHash,
  type DependencySnapshot,
  type PackageId,
  type RuntimeDiagnostic,
  type RuntimeVersionContract,
  asBuildArtifactId,
  canonicalJson,
  hashCanonical,
  sha256Hex,
} from "./wp160-contracts.ts";

export type BuildLifecycle = "PLANNED" | "VALIDATING" | "BUILDING" | "VERIFYING" | "READY" | "FAILED" | "CANCELLED" | "QUARANTINED";

export interface BuildEvidence {
  readonly assetsResolved: boolean;
  readonly revisionsLocked: boolean;
  readonly hashesVerified: boolean;
  readonly compatibilityVerified: boolean;
  readonly permissionsVerified: boolean;
  readonly integrityVerified: boolean;
  readonly runtimeSmokeVerified: boolean;
}

export interface BuildArtifactIdentity {
  readonly buildArtifactId: BuildArtifactId;
  readonly sourcePackageId: PackageId;
  readonly sourcePackageVersion: string;
  readonly dependencySnapshotHash: string;
  readonly buildTarget: BuildTarget;
  readonly buildConfigurationVersion: string;
  readonly runtimeVersion: string;
  readonly artifactHash: ContentHash;
  readonly byteLength: number;
  readonly verificationState: "UNVERIFIED" | "VERIFIED";
  readonly createdAt: string;
  readonly buildProvenance: string;
}

export interface BuildRequest {
  readonly requestId: string;
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly packageHash: ContentHash;
  readonly dependencies: DependencySnapshot;
  readonly target: BuildTarget;
  readonly configuration: BuildConfiguration;
  readonly runtime: RuntimeVersionContract;
  readonly sourceRevisionId: string;
}

export interface BuildPlan {
  readonly requestId: string;
  readonly manifest: string;
  readonly manifestHash: ContentHash;
  readonly dependencyHash: string;
  readonly cacheKey: string;
  readonly target: BuildTarget;
  readonly runtimeVersion: string;
  readonly configurationVersion: string;
}

export interface BuildRecord {
  readonly request: BuildRequest;
  readonly lifecycle: BuildLifecycle;
  readonly plan?: BuildPlan;
  readonly artifact?: BuildArtifactIdentity;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly requestFingerprint: string;
}

export interface PublishIntent {
  readonly artifactId: BuildArtifactId;
  readonly requestedBy: string;
  readonly explicit: true;
  readonly note: "Distribution/Market publication is a separate approved operation.";
}

export interface BuildSecurityInput {
  readonly archivePaths?: readonly string[];
  readonly externalUrls?: readonly string[];
  readonly activeContentMimeTypes?: readonly string[];
  readonly scriptBytes?: number;
  readonly artifactBytes?: number;
  readonly maxScriptBytes?: number;
  readonly maxArtifactBytes?: number;
  readonly quarantinedDependency?: boolean;
  readonly authorized?: boolean;
}

function buildDiagnostic(code: RuntimeDiagnostic["code"], message: string, recoverable = false): RuntimeDiagnostic {
  return { code, severity: "ERROR", message, recoverable };
}

function validTransition(from: BuildLifecycle, to: BuildLifecycle): boolean {
  const transitions: Readonly<Record<BuildLifecycle, readonly BuildLifecycle[]>> = {
    PLANNED: ["VALIDATING", "CANCELLED"],
    VALIDATING: ["BUILDING", "FAILED", "CANCELLED", "QUARANTINED"],
    BUILDING: ["VERIFYING", "FAILED", "CANCELLED", "QUARANTINED"],
    VERIFYING: ["READY", "FAILED", "QUARANTINED", "CANCELLED"],
    READY: [],
    FAILED: [],
    CANCELLED: [],
    QUARANTINED: [],
  };
  return transitions[from].includes(to);
}

export function transitionBuild(record: BuildRecord, next: BuildLifecycle): BuildRecord {
  if (!validTransition(record.lifecycle, next)) throw new Error(`Invalid Build lifecycle transition ${record.lifecycle} -> ${next}.`);
  return { ...record, lifecycle: next };
}

export async function createBuildPlan(request: BuildRequest): Promise<BuildPlan> {
  const manifestValue = {
    manifestVersion: 1,
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    packageHash: request.packageHash,
    sourceRevisionId: request.sourceRevisionId,
    target: request.target,
    runtimeVersion: request.runtime.runtimeVersion,
    configuration: request.configuration,
    dependencies: request.dependencies.entries,
  };
  const manifest = canonicalJson(manifestValue);
  const manifestHash = await hashCanonical(manifestValue);
  const dependencyHash = request.dependencies.snapshotHash;
  const cacheKey = await sha256Hex(canonicalJson({ packageHash: request.packageHash, dependencyHash, runtimeVersion: request.runtime.runtimeVersion, target: request.target, configuration: request.configuration }));
  return { requestId: request.requestId, manifest, manifestHash, dependencyHash, cacheKey, target: request.target, runtimeVersion: request.runtime.runtimeVersion, configurationVersion: request.configuration.version };
}

export function validateBuildRequest(request: BuildRequest): readonly RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (!request.requestId || !request.sourceRevisionId) diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build request identity is required."));
  if (!request.dependencies.locked) diagnostics.push(buildDiagnostic("DEPENDENCY_LOCK_MISMATCH", "Build requires a locked Dependency Snapshot."));
  if (request.dependencies.entries.length === 0) diagnostics.push(buildDiagnostic("MISSING_REQUIRED_ASSET", "Build requires at least one declared dependency."));
  if (request.dependencies.packageId !== request.packageId || request.dependencies.packageVersion !== request.packageVersion) diagnostics.push(buildDiagnostic("PACKAGE_INVALID", "Dependency Snapshot does not belong to the requested Package."));
  if (request.dependencies.entries.some((entry) => entry.required && !/^[a-f0-9]{64}$/.test(entry.contentHash))) diagnostics.push(buildDiagnostic("HASH_MISMATCH", "Required dependency hash is invalid."));
  if (request.dependencies.entries.some((entry) => !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0)) diagnostics.push(buildDiagnostic("PACKAGE_INVALID", "Dependency byteLength is invalid."));
  if (request.target !== "PIXIEED_NATIVE_WEB_RUNTIME" && request.target !== "GENERIC_WEB_PACKAGE") diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build target is unsupported."));
  if (!request.configuration.version || !request.configuration.toolchainVersion || !request.configuration.capabilityProfile || !["DEBUG", "RELEASE"].includes(request.configuration.optimization) || !["NONE", "GZIP", "BROTLI"].includes(request.configuration.compression)) diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build configuration is malformed."));
  if (request.runtime.runtimeId.length === 0 || request.runtime.runtimeVersion.length === 0) diagnostics.push(buildDiagnostic("UNSUPPORTED_RUNTIME_VERSION", "Runtime identity and version are required."));
  return diagnostics;
}

export function validateBuildSecurity(input: BuildSecurityInput): readonly RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (input.archivePaths?.some((item) => item.startsWith("/") || item.includes("../") || item.includes("\\..\\"))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Absolute and traversal archive paths are rejected."));
  if (input.externalUrls?.some((item) => /^https?:\/\//i.test(item))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "External URLs are not permitted in a locked Build input."));
  if (input.activeContentMimeTypes?.some((item) => /(?:html|svg|javascript|wasm)/i.test(item))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Active content is not permitted without an explicit adapter capability."));
  if (input.quarantinedDependency === true) diagnostics.push(buildDiagnostic("ASSET_QUARANTINED", "Quarantined dependencies cannot enter a Build."));
  if (input.authorized === false) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Build authorization is required."));
  if (input.maxScriptBytes !== undefined && input.scriptBytes !== undefined && input.scriptBytes > input.maxScriptBytes) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Script exceeds the bounded Build limit."));
  if (input.maxArtifactBytes !== undefined && input.artifactBytes !== undefined && input.artifactBytes > input.maxArtifactBytes) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Artifact exceeds the bounded Build limit."));
  return diagnostics;
}

export async function createBuildRecord(request: BuildRequest): Promise<BuildRecord> {
  const diagnostics = validateBuildRequest(request);
  const requestFingerprint = await sha256Hex(canonicalJson({ requestId: request.requestId, packageId: request.packageId, packageVersion: request.packageVersion, packageHash: request.packageHash, target: request.target, configuration: request.configuration, runtime: request.runtime }));
  return { request, lifecycle: diagnostics.length === 0 ? "PLANNED" : "FAILED", diagnostics, requestFingerprint };
}

export function canPromoteReady(evidence: BuildEvidence): boolean {
  return Object.values(evidence).every((value) => value === true);
}

export function attachVerifiedArtifact(record: BuildRecord, artifact: BuildArtifactIdentity, evidence: BuildEvidence): BuildRecord {
  if (record.lifecycle !== "VERIFYING") throw new Error("Only VERIFYING builds may produce a READY artifact.");
  if (!canPromoteReady(evidence)) throw new Error("All Build verification evidence is required before READY.");
  if (artifact.verificationState !== "VERIFIED") throw new Error("Artifact verificationState must be VERIFIED.");
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0) throw new Error("Artifact byteLength must be a non-negative safe integer.");
  return { ...record, lifecycle: "READY", artifact };
}

export function cancelBuild(record: BuildRecord): BuildRecord {
  if (record.lifecycle === "READY") throw new Error("READY artifacts are immutable and cannot be cancelled.");
  if (record.lifecycle === "FAILED" || record.lifecycle === "CANCELLED" || record.lifecycle === "QUARANTINED") return record;
  return transitionBuild(record, "CANCELLED");
}

export function requestPublish(record: BuildRecord, requestedBy: string): PublishIntent {
  if (record.lifecycle !== "READY" || record.artifact === undefined) throw new Error("Only a verified READY artifact can create a publish intent.");
  if (!requestedBy) throw new Error("Publish requester is required.");
  return { artifactId: record.artifact.buildArtifactId, requestedBy, explicit: true, note: "Distribution/Market publication is a separate approved operation." };
}

export function isArtifactImmutable(before: BuildArtifactIdentity, after: BuildArtifactIdentity): boolean {
  return canonicalJson(before) === canonicalJson(after);
}

export function createArtifactIdentity(input: Omit<BuildArtifactIdentity, "buildArtifactId"> & { readonly buildArtifactId: string }): BuildArtifactIdentity {
  return { ...input, buildArtifactId: asBuildArtifactId(input.buildArtifactId) };
}
