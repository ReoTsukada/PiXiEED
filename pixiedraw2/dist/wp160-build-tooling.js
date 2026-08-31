// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SHA256 = /^[a-f0-9]{64}$/;
function brandedId(value, label) {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a non-empty stable identifier.`);
  return value;
}
function asBuildArtifactId(value) {
  return brandedId(value, "BuildArtifactId");
}
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});
function jsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}
function canonicalJson(value) {
  return JSON.stringify(jsonValue(value));
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hashCanonical(value) {
  return asSha256(await sha256Hex(canonicalJson(value)), "ContentHash");
}

// src/wp160-build-pipeline.ts
function buildDiagnostic(code, message, recoverable = false) {
  return {
    code,
    severity: "ERROR",
    message,
    recoverable
  };
}
function validTransition(from, to) {
  const transitions = {
    PLANNED: [
      "VALIDATING",
      "CANCELLED"
    ],
    VALIDATING: [
      "BUILDING",
      "FAILED",
      "CANCELLED",
      "QUARANTINED"
    ],
    BUILDING: [
      "VERIFYING",
      "FAILED",
      "CANCELLED",
      "QUARANTINED"
    ],
    VERIFYING: [
      "READY",
      "FAILED",
      "QUARANTINED",
      "CANCELLED"
    ],
    READY: [],
    FAILED: [],
    CANCELLED: [],
    QUARANTINED: []
  };
  return transitions[from].includes(to);
}
function transitionBuild(record, next) {
  if (!validTransition(record.lifecycle, next)) throw new Error(`Invalid Build lifecycle transition ${record.lifecycle} -> ${next}.`);
  return {
    ...record,
    lifecycle: next
  };
}
async function createBuildPlan(request) {
  const manifestValue = {
    manifestVersion: 1,
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    packageHash: request.packageHash,
    sourceRevisionId: request.sourceRevisionId,
    target: request.target,
    runtimeVersion: request.runtime.runtimeVersion,
    configuration: request.configuration,
    dependencies: request.dependencies.entries
  };
  const manifest = canonicalJson(manifestValue);
  const manifestHash = await hashCanonical(manifestValue);
  const dependencyHash = request.dependencies.snapshotHash;
  const cacheKey = await sha256Hex(canonicalJson({
    packageHash: request.packageHash,
    dependencyHash,
    runtimeVersion: request.runtime.runtimeVersion,
    target: request.target,
    configuration: request.configuration
  }));
  return {
    requestId: request.requestId,
    manifest,
    manifestHash,
    dependencyHash,
    cacheKey,
    target: request.target,
    runtimeVersion: request.runtime.runtimeVersion,
    configurationVersion: request.configuration.version
  };
}
function validateBuildRequest(request) {
  const diagnostics = [];
  if (!request.requestId || !request.sourceRevisionId) diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build request identity is required."));
  if (!request.dependencies.locked) diagnostics.push(buildDiagnostic("DEPENDENCY_LOCK_MISMATCH", "Build requires a locked Dependency Snapshot."));
  if (request.dependencies.entries.length === 0) diagnostics.push(buildDiagnostic("MISSING_REQUIRED_ASSET", "Build requires at least one declared dependency."));
  if (request.dependencies.packageId !== request.packageId || request.dependencies.packageVersion !== request.packageVersion) diagnostics.push(buildDiagnostic("PACKAGE_INVALID", "Dependency Snapshot does not belong to the requested Package."));
  if (request.dependencies.entries.some((entry) => entry.required && !/^[a-f0-9]{64}$/.test(entry.contentHash))) diagnostics.push(buildDiagnostic("HASH_MISMATCH", "Required dependency hash is invalid."));
  if (request.dependencies.entries.some((entry) => !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0)) diagnostics.push(buildDiagnostic("PACKAGE_INVALID", "Dependency byteLength is invalid."));
  if (request.target !== "PIXIEED_NATIVE_WEB_RUNTIME" && request.target !== "GENERIC_WEB_PACKAGE") diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build target is unsupported."));
  if (!request.configuration.version || !request.configuration.toolchainVersion || !request.configuration.capabilityProfile || ![
    "DEBUG",
    "RELEASE"
  ].includes(request.configuration.optimization) || ![
    "NONE",
    "GZIP",
    "BROTLI"
  ].includes(request.configuration.compression)) diagnostics.push(buildDiagnostic("BUILD_INVALID_REQUEST", "Build configuration is malformed."));
  if (request.runtime.runtimeId.length === 0 || request.runtime.runtimeVersion.length === 0) diagnostics.push(buildDiagnostic("UNSUPPORTED_RUNTIME_VERSION", "Runtime identity and version are required."));
  return diagnostics;
}
function validateBuildSecurity(input) {
  const diagnostics = [];
  if (input.archivePaths?.some((item) => item.startsWith("/") || item.includes("../") || item.includes("\\..\\"))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Absolute and traversal archive paths are rejected."));
  if (input.externalUrls?.some((item) => /^https?:\/\//i.test(item))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "External URLs are not permitted in a locked Build input."));
  if (input.activeContentMimeTypes?.some((item) => /(?:html|svg|javascript|wasm)/i.test(item))) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Active content is not permitted without an explicit adapter capability."));
  if (input.quarantinedDependency === true) diagnostics.push(buildDiagnostic("ASSET_QUARANTINED", "Quarantined dependencies cannot enter a Build."));
  if (input.authorized === false) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Build authorization is required."));
  if (input.maxScriptBytes !== void 0 && input.scriptBytes !== void 0 && input.scriptBytes > input.maxScriptBytes) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Script exceeds the bounded Build limit."));
  if (input.maxArtifactBytes !== void 0 && input.artifactBytes !== void 0 && input.artifactBytes > input.maxArtifactBytes) diagnostics.push(buildDiagnostic("SECURITY_POLICY_REJECTED", "Artifact exceeds the bounded Build limit."));
  return diagnostics;
}
async function createBuildRecord(request) {
  const diagnostics = validateBuildRequest(request);
  const requestFingerprint = await sha256Hex(canonicalJson({
    requestId: request.requestId,
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    packageHash: request.packageHash,
    target: request.target,
    configuration: request.configuration,
    runtime: request.runtime
  }));
  return {
    request,
    lifecycle: diagnostics.length === 0 ? "PLANNED" : "FAILED",
    diagnostics,
    requestFingerprint
  };
}
function canPromoteReady(evidence) {
  return Object.values(evidence).every((value) => value === true);
}
function attachVerifiedArtifact(record, artifact, evidence) {
  if (record.lifecycle !== "VERIFYING") throw new Error("Only VERIFYING builds may produce a READY artifact.");
  if (!canPromoteReady(evidence)) throw new Error("All Build verification evidence is required before READY.");
  if (artifact.verificationState !== "VERIFIED") throw new Error("Artifact verificationState must be VERIFIED.");
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0) throw new Error("Artifact byteLength must be a non-negative safe integer.");
  return {
    ...record,
    lifecycle: "READY",
    artifact
  };
}
function cancelBuild(record) {
  if (record.lifecycle === "READY") throw new Error("READY artifacts are immutable and cannot be cancelled.");
  if (record.lifecycle === "FAILED" || record.lifecycle === "CANCELLED" || record.lifecycle === "QUARANTINED") return record;
  return transitionBuild(record, "CANCELLED");
}
function requestPublish(record, requestedBy) {
  if (record.lifecycle !== "READY" || record.artifact === void 0) throw new Error("Only a verified READY artifact can create a publish intent.");
  if (!requestedBy) throw new Error("Publish requester is required.");
  return {
    artifactId: record.artifact.buildArtifactId,
    requestedBy,
    explicit: true,
    note: "Distribution/Market publication is a separate approved operation."
  };
}
function isArtifactImmutable(before, after) {
  return canonicalJson(before) === canonicalJson(after);
}
function createArtifactIdentity(input) {
  return {
    ...input,
    buildArtifactId: asBuildArtifactId(input.buildArtifactId)
  };
}
export {
  attachVerifiedArtifact,
  canPromoteReady,
  cancelBuild,
  createArtifactIdentity,
  createBuildPlan,
  createBuildRecord,
  isArtifactImmutable,
  requestPublish,
  transitionBuild,
  validateBuildRequest,
  validateBuildSecurity
};
