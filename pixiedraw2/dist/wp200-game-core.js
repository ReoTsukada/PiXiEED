// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_SCHEMA_VERSION = 1;
var AUTHORIZATION_PROOF_TYPE = "AUTHORIZATION_PROOF";
var AUTHORIZATION_PROOF_SOURCE = "server";
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var AUTHORIZATION_PROOF_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "proofType",
  "source",
  "decision",
  "authorityId",
  "proofId",
  "principalId",
  "resourceType",
  "resourceId",
  "action",
  "capability",
  "tenantId",
  "correlationId",
  "policyVersion",
  "grantId",
  "issuedAt",
  "expiresAt"
]);
function authorizationText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
function authorizationNullableText(value) {
  return value === null || authorizationText(value);
}
function isAuthorizationProofV1(value, expected = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proof = value;
  if (Object.keys(proof).some((key) => !AUTHORIZATION_PROOF_KEYS.has(key))) return false;
  if (proof.schemaVersion !== AUTHORIZATION_PROOF_SCHEMA_VERSION || proof.proofType !== AUTHORIZATION_PROOF_TYPE || proof.source !== AUTHORIZATION_PROOF_SOURCE) return false;
  if (![
    "allow",
    "deny",
    "unknown"
  ].includes(proof.decision)) return false;
  if (![
    "authorityId",
    "proofId",
    "resourceType",
    "resourceId",
    "action",
    "capability",
    "policyVersion",
    "issuedAt",
    "expiresAt"
  ].every((key) => authorizationText(proof[key]))) return false;
  if (!authorizationNullableText(proof.principalId) || !authorizationNullableText(proof.tenantId) || !authorizationNullableText(proof.correlationId) || !authorizationNullableText(proof.grantId)) return false;
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) return false;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== void 0 && proof[key] !== expectedValue) return false;
  }
  return true;
}
function requireAuthorizationProofV1(value, expected = {}) {
  if (!isAuthorizationProofV1(value, expected)) throw new Error("AuthorizationProofV1 is invalid or not bound to the requested scope.");
  const proof = value;
  if (proof.decision !== "allow") throw new Error("AuthorizationProofV1 did not grant the requested capability.");
  const now = Date.now();
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (issuedAt > now + AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS) throw new Error("AuthorizationProofV1 was issued in the future.");
  if (expiresAt <= now) throw new Error("AuthorizationProofV1 has expired.");
  if (expiresAt - issuedAt > AUTHORIZATION_PROOF_MAX_LIFETIME_MS) throw new Error("AuthorizationProofV1 lifetime exceeds policy.");
  return proof;
}
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SHA256 = /^[a-f0-9]{64}$/;
function brandedId(value, label) {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a non-empty stable identifier.`);
  return value;
}
function asGameProjectId(value) {
  return brandedId(value, "GameProjectId");
}
function asGamePreviewId(value) {
  return brandedId(value, "GamePreviewId");
}
function asPackageId(value) {
  return brandedId(value, "PackageId");
}
function asBuildArtifactId(value) {
  return brandedId(value, "BuildArtifactId");
}
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
function asDependencySnapshotHash(value) {
  if (!SHA256.test(value)) throw new Error("DependencySnapshotHash must be a lowercase SHA-256 hash.");
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
    const result2 = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result2[key] = jsonValue(item);
    }
    return result2;
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
function sortDependencyEntries(entries) {
  return [
    ...entries
  ].sort((left, right) => left.assetId.localeCompare(right.assetId) || left.revisionId.localeCompare(right.revisionId));
}
async function calculateDependencySnapshotHash(packageId, packageVersion, entries) {
  const canonicalEntries = sortDependencyEntries(entries);
  return asDependencySnapshotHash(await sha256Hex(canonicalJson({
    packageId,
    packageVersion,
    entries: canonicalEntries
  })));
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
function transitionBuild(record5, next) {
  if (!validTransition(record5.lifecycle, next)) throw new Error(`Invalid Build lifecycle transition ${record5.lifecycle} -> ${next}.`);
  return {
    ...record5,
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
function attachVerifiedArtifact(record5, artifact, evidence) {
  if (record5.lifecycle !== "VERIFYING") throw new Error("Only VERIFYING builds may produce a READY artifact.");
  if (!canPromoteReady(evidence)) throw new Error("All Build verification evidence is required before READY.");
  if (artifact.verificationState !== "VERIFIED") throw new Error("Artifact verificationState must be VERIFIED.");
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0) throw new Error("Artifact byteLength must be a non-negative safe integer.");
  return {
    ...record5,
    lifecycle: "READY",
    artifact
  };
}
function createArtifactIdentity(input) {
  return {
    ...input,
    buildArtifactId: asBuildArtifactId(input.buildArtifactId)
  };
}

// src/wp160-game-runtime-core.ts
function diagnostic(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function assertPositiveBytes(entry) {
  if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error("Dependency byteLength must be a non-negative safe integer.");
}
async function createDependencySnapshot(packageId, packageVersion, entries, locked) {
  if (!packageVersion) throw new Error("Invalid dependency snapshot.");
  for (const entry of entries) assertPositiveBytes(entry);
  const id = asPackageId(packageId);
  const snapshotHash = await calculateDependencySnapshotHash(id, packageVersion, entries);
  return {
    packageId: id,
    packageVersion,
    entries: [
      ...entries
    ].sort((a, b) => a.assetId.localeCompare(b.assetId) || a.revisionId.localeCompare(b.revisionId)),
    snapshotHash,
    locked
  };
}
function dependencyEntry(session, assetId) {
  return session.dependencies.entries.find((entry) => entry.assetId === assetId);
}
function actionNames(inputMap, events) {
  const names = /* @__PURE__ */ new Set();
  for (const event of events) {
    for (const binding of inputMap.bindings) if (binding.source === event.source && binding.code === event.code && event.phase === "DOWN") names.add(binding.action);
  }
  return [
    ...names
  ].sort();
}
function nextActionStates(previous, actions) {
  const next = {
    ...previous
  };
  for (const action of actions) next[action] = true;
  for (const action of Object.keys(next)) if (!actions.includes(action)) next[action] = false;
  return next;
}
function sampleAnimation(clip, elapsedMs) {
  if (clip.frames.length === 0) return void 0;
  for (const frame of clip.frames) if (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) throw new Error("Animation frame durations must be positive.");
  const duration = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const position2 = clip.loop ? (Math.max(0, elapsedMs) % duration + duration) % duration : Math.min(Math.max(0, elapsedMs), duration - Number.EPSILON);
  let cursor = 0;
  for (const frame of clip.frames) {
    cursor += frame.durationMs;
    if (position2 < cursor) return frame.frameId;
  }
  return clip.frames[clip.frames.length - 1]?.frameId;
}
function sameLock(left, right) {
  return left.assetId === right.assetId && left.revisionId === right.revisionId && left.contentHash === right.contentHash && left.mode === right.mode;
}
async function createRuntimePreview(options) {
  const runtime = options.runtime;
  const diagnostics = [];
  if (runtime.runtimeVersion !== options.supportedRuntimeVersion) diagnostics.push(diagnostic("UNSUPPORTED_RUNTIME_VERSION", `Runtime ${runtime.runtimeVersion} is not supported by this preview.`, false));
  if (runtime.runtimeId.length === 0 || options.dependencies.entries.length === 0) diagnostics.push(diagnostic("PACKAGE_INVALID", "Package manifest or dependency lock is invalid.", false));
  const calculatedHash = await calculateDependencySnapshotHash(options.dependencies.packageId, options.dependencies.packageVersion, options.dependencies.entries);
  if (calculatedHash !== options.dependencies.snapshotHash) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", "Dependency Snapshot hash does not match its canonical entries.", false));
  if (options.capabilities.graphics === "NONE") diagnostics.push(diagnostic("RENDERER_UNAVAILABLE", "No supported renderer capability is available.", true, "WARNING"));
  if (!options.capabilities.audio) diagnostics.push(diagnostic("AUDIO_UNAVAILABLE", "Audio capability is unavailable; audio presentation is disabled.", true, "WARNING"));
  const requestedRenderer = options.renderer ?? options.capabilities.graphics;
  const renderer = requestedRenderer === "WEBGPU" && (options.capabilities.graphics !== "WEBGPU" || !options.capabilities.webGpuBenefitMeasured) ? options.capabilities.graphics === "CANVAS2D" ? "CANVAS2D" : "NONE" : requestedRenderer === "CANVAS2D" && options.capabilities.graphics === "NONE" ? "NONE" : requestedRenderer;
  if (requestedRenderer === "WEBGPU" && renderer !== "WEBGPU") diagnostics.push(diagnostic("RENDERER_UNAVAILABLE", "WebGPU was not selected without capability detection and measured benefit; fallback renderer retained.", true, "WARNING"));
  return {
    previewId: asGamePreviewId(options.previewId),
    projectId: asGameProjectId(options.projectId),
    projectRevisionId: options.projectRevisionId,
    packageId: asPackageId(options.packageId),
    packageVersion: options.packageVersion,
    runtime,
    dependencies: options.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? {
      bindings: []
    },
    world: {
      schemaVersion: 1,
      tick: 0,
      elapsedMs: 0,
      actionStates: {},
      values: {}
    },
    presentation: {
      renderer,
      audio: options.capabilities.audio ? "AVAILABLE" : "UNAVAILABLE"
    },
    loadedAssets: {},
    diagnostics,
    running: diagnostics.some((item) => !item.recoverable) === false
  };
}
async function loadRuntimeAssets(session, requests, resolver) {
  const loaded = {
    ...session.loadedAssets
  };
  const diagnostics = [
    ...session.diagnostics
  ];
  const uniqueRequests = /* @__PURE__ */ new Map();
  for (const request of requests) {
    const key = String(request.assetId);
    const existing = uniqueRequests.get(key);
    uniqueRequests.set(key, existing === void 0 ? request : {
      ...existing,
      required: existing.required || request.required
    });
  }
  for (const request of uniqueRequests.values()) {
    const entry = dependencyEntry(session, request.assetId);
    if (entry === void 0) {
      diagnostics.push(diagnostic(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} is not declared by the locked dependency snapshot.`, !request.required));
      continue;
    }
    const existing = loaded[request.assetId];
    if (existing !== void 0 && existing.revisionId === entry.revisionId && existing.contentHash === entry.contentHash) continue;
    const payload = await resolver.resolve(request);
    if (payload === void 0) {
      diagnostics.push(diagnostic(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} could not be resolved.`, !request.required));
      continue;
    }
    if (payload.quarantined === true) {
      diagnostics.push(diagnostic("ASSET_QUARANTINED", `Asset ${request.assetId} is quarantined and cannot be loaded.`, false));
      continue;
    }
    if (payload.revisionId !== entry.revisionId || payload.contentHash !== entry.contentHash) {
      diagnostics.push(diagnostic("HASH_MISMATCH", `Asset ${request.assetId} does not match the locked Revision or Hash.`, false));
      continue;
    }
    loaded[request.assetId] = payload;
  }
  const failedRequired = diagnostics.some((item) => item.code === "MISSING_REQUIRED_ASSET" || item.code === "HASH_MISMATCH" || item.code === "ASSET_QUARANTINED");
  return {
    ...session,
    loadedAssets: loaded,
    diagnostics,
    running: session.running && !failedRequired
  };
}
function stepRuntime(session, deltaMs, input, animation) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("Runtime delta must be a non-negative finite number.");
  if (!session.running) return {
    session,
    actions: [],
    presentationChanged: false
  };
  const actions = actionNames(session.inputMap, input);
  const world = {
    schemaVersion: 1,
    tick: session.world.tick + 1,
    elapsedMs: session.world.elapsedMs + deltaMs,
    actionStates: nextActionStates(session.world.actionStates, actions),
    values: session.world.values
  };
  const frameId = animation === void 0 ? session.presentation.frameId : sampleAnimation(animation, world.elapsedMs);
  const presentationChanged = frameId !== session.presentation.frameId;
  const presentation = frameId === void 0 ? {
    ...session.presentation
  } : {
    ...session.presentation,
    frameId
  };
  return {
    session: {
      ...session,
      world,
      presentation
    },
    actions,
    presentationChanged
  };
}
function safeHotReload(session, nextDependencies) {
  const diagnostics = [];
  if (nextDependencies.packageId !== session.packageId || nextDependencies.packageVersion !== session.packageVersion) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Hot reload cannot change the Package identity or version.", true));
    return {
      accepted: false,
      session,
      diagnostics
    };
  }
  const oldEntries = session.dependencies.entries;
  const nextEntries = nextDependencies.entries;
  const incompatible = oldEntries.some((oldEntry) => {
    const nextEntry = nextEntries.find((candidate) => candidate.assetId === oldEntry.assetId);
    return nextEntry !== void 0 && oldEntry.mode === "PINNED" && !sameLock(oldEntry, nextEntry);
  });
  if (incompatible || !nextDependencies.locked) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Pinned dependencies or an unlocked snapshot cannot be replaced during preview.", true));
    return {
      accepted: false,
      session,
      diagnostics
    };
  }
  const retained = {};
  for (const entry of nextEntries) {
    const loaded = session.loadedAssets[entry.assetId];
    if (loaded !== void 0 && loaded.revisionId === entry.revisionId && loaded.contentHash === entry.contentHash) retained[entry.assetId] = loaded;
  }
  return {
    accepted: true,
    session: {
      ...session,
      dependencies: nextDependencies,
      loadedAssets: retained
    },
    diagnostics
  };
}
function serializeRuntimeState(session) {
  return canonicalJson({
    projectId: session.projectId,
    projectRevisionId: session.projectRevisionId,
    world: session.world
  });
}

// src/game/game-350/runtime-performance.ts
var GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION = 1;
var GAME_RUNTIME_PERFORMANCE_PROFILES = Object.freeze({
  "2D_BROWSER": Object.freeze({
    schemaVersion: GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION,
    profileId: "2D_BROWSER",
    label: "2D Browser",
    budget: Object.freeze({
      startupMs: 1200,
      sceneLoadMs: 800,
      firstFrameMs: 500,
      steadyFrameMs: 16.67,
      memoryBytes: 256 * 1024 * 1024,
      assetBytes: 32 * 1024 * 1024,
      decodedBytes: 96 * 1024 * 1024,
      maxLongTasks: 2
    })
  }),
  "2D_MOBILE": Object.freeze({
    schemaVersion: GAME_RUNTIME_PERFORMANCE_SCHEMA_VERSION,
    profileId: "2D_MOBILE",
    label: "2D Mobile",
    budget: Object.freeze({
      startupMs: 1800,
      sceneLoadMs: 1200,
      firstFrameMs: 800,
      steadyFrameMs: 20,
      memoryBytes: 128 * 1024 * 1024,
      assetBytes: 12 * 1024 * 1024,
      decodedBytes: 48 * 1024 * 1024,
      maxLongTasks: 1
    })
  })
});
function resolveGameRuntimePerformanceProfile(options) {
  if (options.requestedProfileId !== void 0) return GAME_RUNTIME_PERFORMANCE_PROFILES[options.requestedProfileId];
  return options.screenWidth < 768 || options.touch && options.screenWidth < 900 ? GAME_RUNTIME_PERFORMANCE_PROFILES["2D_MOBILE"] : GAME_RUNTIME_PERFORMANCE_PROFILES["2D_BROWSER"];
}
var PERFORMANCE_METRICS = [
  "startupMs",
  "sceneLoadMs",
  "firstFrameMs",
  "steadyFrameMs",
  "memoryBytes",
  "assetBytes",
  "decodedBytes",
  "maxLongTasks"
];
function evaluateGameRuntimePerformance(profile, sample) {
  const missingMetrics = [];
  const violations = [];
  for (const metric of PERFORMANCE_METRICS) {
    const sampleMetric = metric === "maxLongTasks" ? sample.longTaskCount : sample[metric];
    if (sampleMetric === void 0) {
      missingMetrics.push(metric);
      continue;
    }
    const budget = profile.budget[metric];
    if (!Number.isFinite(sampleMetric) || sampleMetric < 0 || sampleMetric > budget) {
      violations.push({
        metric,
        actual: sampleMetric,
        budget
      });
    }
  }
  const status = violations.length > 0 ? "OVER_BUDGET" : missingMetrics.length > 0 ? "INCOMPLETE" : "WITHIN_BUDGET";
  return {
    profileId: profile.profileId,
    status,
    missingMetrics,
    violations
  };
}
function sumLoadedRuntimeAssetBytes(assets) {
  return Object.values(assets).reduce((total, asset) => total + (Number.isSafeInteger(asset.byteLength) && asset.byteLength >= 0 ? asset.byteLength : 0), 0);
}

// src/wp200-game-runtime-core.ts
function diagnostic2(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function safeText(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
}
function referenceKey(reference) {
  return `${reference.kind}:${reference.assetId}:${reference.revisionId}:${reference.contentHash}`;
}
function collectReferencesFromScenes(scenes) {
  const references = [];
  for (const scene of scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references.sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}
function collectReferences(project) {
  return collectReferencesFromScenes(project.scenes);
}
function dependencyMatchesReference(reference, dependencies) {
  return dependencies.entries.some((entry) => entry.assetId === reference.assetId && entry.revisionId === reference.revisionId && entry.contentHash === reference.contentHash && entry.byteLength === reference.byteLength && entry.mimeType === reference.mimeType && entry.mode === reference.mode);
}
function validateReference(reference, diagnostics) {
  if (![
    "DRAW",
    "AUDIO"
  ].includes(reference.kind)) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference kind is unsupported.", false));
  if (reference.provenance !== (reference.kind === "DRAW" ? "DRAW2" : "PIXIAUDIO")) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference provenance does not match its kind.", false));
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength < 0) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference byteLength is invalid.", false));
  if (!reference.mimeType || reference.mimeType.includes("/") === false) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference MIME type is invalid.", false));
  if (reference.mode === "LIVE" && reference.kind === "AUDIO") diagnostics.push(diagnostic2("PACKAGE_INVALID", "Audio LIVE references are preview-only and must not enter a locked Build.", true, "WARNING"));
}
function validateGameProject(project) {
  const diagnostics = [];
  if (project.schemaVersion !== 1) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Unknown Game Project schema version.", false));
  try {
    asGameProjectId(project.projectId);
    safeText(project.revisionId, "GameProjectRevisionId");
    safeText(project.packageVersion, "PackageVersion");
  } catch (error) {
    diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Game Project identity is invalid.", false));
  }
  if (!project.name.trim()) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", "Game Project name is required.", false));
  if (project.scenes.length === 0) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Project requires at least one Scene.", false));
  if (!project.dependencies.locked) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", "Game Project requires a locked Dependency Snapshot for Runtime/Build use.", false));
  const sceneIds = /* @__PURE__ */ new Set();
  const entityIds = /* @__PURE__ */ new Set();
  const componentIds2 = /* @__PURE__ */ new Set();
  const actionIds = /* @__PURE__ */ new Set();
  for (const action of project.inputMap.actions) {
    try {
      safeText(action.actionId, "GameActionId");
    } catch (error) {
      diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Action ID is invalid.", false));
    }
    if (actionIds.has(action.actionId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Action ${action.actionId}.`, false));
    actionIds.add(action.actionId);
    if (!action.bindings.length) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Game Action ${action.actionId} has no binding.`, true, "WARNING"));
  }
  for (const scene of project.scenes) {
    try {
      safeText(scene.sceneId, "GameSceneId");
    } catch (error) {
      diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Scene ID is invalid.", false));
    }
    if (sceneIds.has(scene.sceneId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Scene ${scene.sceneId}.`, false));
    sceneIds.add(scene.sceneId);
    const sceneEntityIds = new Set(scene.entities.map((entity) => entity.entityId));
    for (const rootId of scene.rootEntityIds) if (!sceneEntityIds.has(rootId)) diagnostics.push(diagnostic2("MISSING_REQUIRED_ASSET", `Scene root Entity ${rootId} is missing.`, false));
    for (const entity of scene.entities) {
      try {
        safeText(entity.entityId, "GameEntityId");
      } catch (error) {
        diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Entity ID is invalid.", false));
      }
      if (entityIds.has(entity.entityId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Entity ${entity.entityId}.`, false));
      entityIds.add(entity.entityId);
      if (entity.parentEntityId !== void 0 && !sceneEntityIds.has(entity.parentEntityId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Entity parent ${entity.parentEntityId} is missing.`, false));
      for (const component of entity.components) {
        try {
          safeText(component.componentId, "GameComponentId");
        } catch (error) {
          diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Component ID is invalid.", false));
        }
        if (componentIds2.has(component.componentId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Component ${component.componentId}.`, false));
        componentIds2.add(component.componentId);
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") {
          validateReference(component.asset, diagnostics);
          if (!dependencyMatchesReference(component.asset, project.dependencies)) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", `Game Asset ${component.asset.assetId} is not present in the locked Dependency Snapshot.`, false));
        }
        if (component.type === "CONTROL" && !actionIds.has(component.actionId)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Control references unknown Action ${component.actionId}.`, false));
        if (component.type === "AUDIO_SOURCE" && (component.volume < 0 || component.volume > 1)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Audio volume for ${component.componentId} must be between 0 and 1.`, false));
      }
    }
    for (const entity of scene.entities) {
      const seenParents = /* @__PURE__ */ new Set();
      let parentId = entity.parentEntityId;
      while (parentId !== void 0) {
        if (seenParents.has(parentId) || parentId === entity.entityId) {
          diagnostics.push(diagnostic2("PACKAGE_INVALID", `Entity parent cycle includes ${entity.entityId}.`, false));
          break;
        }
        seenParents.add(parentId);
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  for (const behavior2 of project.behaviors) {
    try {
      safeText(behavior2.behaviorId, "GameBehaviorId");
    } catch (error) {
      diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Behavior ID is invalid.", false));
    }
    for (const rule of behavior2.rules) {
      if (!actionIds.has(rule.actionId)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Behavior references unknown Action ${rule.actionId}.`, false));
      for (const operation of rule.operations) if (!operation.key.trim()) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", "Behavior operation key is required.", false));
    }
  }
  for (const reference of collectReferences(project)) {
    if (reference.mode === "PINNED" && !dependencyMatchesReference(reference, project.dependencies)) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", `Pinned Asset ${reference.assetId} is not locked.`, false));
  }
  return {
    valid: diagnostics.every((item) => item.severity !== "ERROR"),
    diagnostics
  };
}
async function createGameProjectRevision(input) {
  const validation = validateGameProject(input);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join(" "));
  const canonical = {
    ...input,
    snapshotHash: void 0
  };
  const snapshotHash = await hashCanonical(canonical);
  return {
    ...input,
    snapshotHash
  };
}
function gameInputActionMapToRuntime(inputMap) {
  return {
    bindings: inputMap.actions.flatMap((action) => action.bindings).sort((left, right) => `${left.action}:${left.source}:${left.code}`.localeCompare(`${right.action}:${right.source}:${right.code}`))
  };
}
function assetRequestsFromScenes(scenes) {
  const unique = /* @__PURE__ */ new Map();
  for (const reference of collectReferencesFromScenes(scenes)) unique.set(String(reference.assetId), {
    assetId: reference.assetId,
    required: true,
    mode: reference.mode
  });
  return [
    ...unique.values()
  ].sort((left, right) => left.assetId.localeCompare(right.assetId));
}
function gameAssetRequests(project) {
  return assetRequestsFromScenes(project.scenes);
}
function gameAssetRequestsForScene(project, sceneId) {
  const scene = project.scenes.find((candidate) => candidate.sceneId === sceneId);
  return scene === void 0 ? [] : assetRequestsFromScenes([
    scene
  ]);
}
function featureEnabled(flags, feature, killSwitch) {
  return killSwitch !== true && flags[feature] === true;
}
function appendFlagDiagnostic(diagnostics, feature) {
  diagnostics.push(diagnostic2("UNSUPPORTED_CAPABILITY", `Feature flag ${feature} is OFF; isolated Game/Runtime operation is unavailable.`, true, "WARNING"));
}
async function createGameRuntimePreview(options) {
  const validation = validateGameProject(options.project);
  const diagnostics = [
    ...validation.diagnostics
  ];
  if (!featureEnabled(options.flags, "game-core-read", options.killSwitch)) appendFlagDiagnostic(diagnostics, "game-core-read");
  if (!featureEnabled(options.flags, "runtime-preview", options.killSwitch)) appendFlagDiagnostic(diagnostics, "runtime-preview");
  const runtimeBase = {
    previewId: options.previewId,
    projectId: options.project.projectId,
    projectRevisionId: options.project.revisionId,
    packageId: options.project.packageId,
    packageVersion: options.project.packageVersion,
    runtime: options.runtime,
    supportedRuntimeVersion: options.supportedRuntimeVersion,
    dependencies: options.project.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? gameInputActionMapToRuntime(options.project.inputMap)
  };
  const runtime = options.renderer === void 0 ? await createRuntimePreview(runtimeBase) : await createRuntimePreview({
    ...runtimeBase,
    renderer: options.renderer
  });
  const allDiagnostics = [
    ...diagnostics,
    ...runtime.diagnostics
  ];
  const running = runtime.running && validation.valid && featureEnabled(options.flags, "game-core-read", options.killSwitch) && featureEnabled(options.flags, "runtime-preview", options.killSwitch);
  const performanceProfile = resolveGameRuntimePerformanceProfile(options.performanceProfileId === void 0 ? {
    screenWidth: options.capabilities.screenWidth,
    touch: options.capabilities.touch
  } : {
    screenWidth: options.capabilities.screenWidth,
    touch: options.capabilities.touch,
    requestedProfileId: options.performanceProfileId
  });
  return {
    project: options.project,
    runtime: {
      ...runtime,
      running,
      diagnostics: allDiagnostics
    },
    performanceProfile,
    sceneId: options.project.scenes[0]?.sceneId ?? "",
    runtimeValues: {},
    recovery: validation.valid && running ? "VALID" : "BLOCKED",
    diagnostics: allDiagnostics
  };
}
function applyBehaviorValues(project, previous, actions) {
  const next = {
    ...previous
  };
  const active = new Set(actions);
  const activeActionIds = new Set(project.inputMap.actions.filter((action) => action.bindings.some((binding) => active.has(binding.action))).map((action) => action.actionId));
  for (const behavior2 of project.behaviors) {
    for (const rule of behavior2.rules) {
      if (!activeActionIds.has(rule.actionId)) continue;
      for (const operation of rule.operations) {
        if (operation.operation === "SET_VALUE") next[operation.key] = operation.value;
        const currentValue = next[operation.key];
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && typeof currentValue === "number") next[operation.key] = currentValue + operation.value;
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && next[operation.key] === void 0) next[operation.key] = operation.value;
      }
    }
  }
  return next;
}
function stepGameRuntime(session, deltaMs, input) {
  const stepped = stepRuntime(session.runtime, deltaMs, input);
  const runtimeValues = applyBehaviorValues(session.project, session.runtimeValues, stepped.actions);
  const nextRuntime = {
    ...stepped.session,
    world: {
      ...stepped.session.world,
      values: runtimeValues
    }
  };
  return {
    session: {
      ...session,
      runtime: nextRuntime,
      runtimeValues,
      diagnostics: nextRuntime.diagnostics
    },
    actions: stepped.actions,
    presentationChanged: stepped.presentationChanged
  };
}
async function loadGameRuntimeAssets(session, resolver, options = {}) {
  const requests = options.sceneId === void 0 ? gameAssetRequests(session.project) : gameAssetRequestsForScene(session.project, options.sceneId);
  const runtime = await loadRuntimeAssets(session.runtime, requests, resolver);
  const blocked = runtime.diagnostics.some((item) => !item.recoverable && [
    "MISSING_REQUIRED_ASSET",
    "HASH_MISMATCH",
    "ASSET_QUARANTINED"
  ].includes(item.code));
  return {
    ...session,
    runtime: {
      ...runtime,
      running: runtime.running && !blocked
    },
    recovery: blocked ? "BLOCKED" : session.recovery,
    diagnostics: runtime.diagnostics
  };
}
async function loadGameRuntimeSceneAssets(session, sceneId, resolver) {
  return loadGameRuntimeAssets(session, resolver, {
    sceneId
  });
}
function stopGameRuntime(session) {
  return {
    ...session,
    runtime: {
      ...session.runtime,
      running: false
    }
  };
}
function safeGameHotReload(session, nextProject) {
  const validation = validateGameProject(nextProject);
  if (!validation.valid || nextProject.projectId !== session.project.projectId || nextProject.packageId !== session.project.packageId || nextProject.packageVersion !== session.project.packageVersion) {
    const diagnostics = [
      ...validation.diagnostics,
      diagnostic2("HOT_RELOAD_REJECTED", "Game Project identity, Package, or schema is incompatible with the active Runtime session.", true)
    ];
    return {
      accepted: false,
      session: {
        ...session,
        recovery: "RECOVERED",
        diagnostics
      },
      diagnostics
    };
  }
  const result2 = safeHotReload(session.runtime, nextProject.dependencies);
  if (!result2.accepted) return {
    accepted: false,
    session: {
      ...session,
      diagnostics: [
        ...session.diagnostics,
        ...result2.diagnostics
      ],
      recovery: "RECOVERED"
    },
    diagnostics: result2.diagnostics
  };
  const sceneExists = nextProject.scenes.some((scene) => scene.sceneId === session.sceneId);
  if (!sceneExists) {
    const diagnostics = [
      diagnostic2("HOT_RELOAD_REJECTED", "The active Scene no longer exists in the incoming revision.", true)
    ];
    return {
      accepted: false,
      session: {
        ...session,
        diagnostics: [
          ...session.diagnostics,
          ...diagnostics
        ],
        recovery: "RECOVERED"
      },
      diagnostics
    };
  }
  return {
    accepted: true,
    session: {
      ...session,
      project: nextProject,
      runtime: {
        ...result2.session,
        projectRevisionId: nextProject.revisionId
      },
      recovery: "VALID",
      diagnostics: result2.diagnostics
    },
    diagnostics: result2.diagnostics
  };
}
async function serializeGameRuntimeSaveState(session) {
  const body = {
    schemaVersion: 1,
    projectId: session.project.projectId,
    projectRevisionId: session.project.revisionId,
    sceneId: session.sceneId,
    tick: session.runtime.world.tick,
    values: session.runtimeValues
  };
  return {
    ...body,
    checksum: await hashCanonical(body)
  };
}
async function restoreGameRuntimeSaveState(session, save) {
  const expected = await hashCanonical({
    schemaVersion: save.schemaVersion,
    projectId: save.projectId,
    projectRevisionId: save.projectRevisionId,
    sceneId: save.sceneId,
    tick: save.tick,
    values: save.values
  });
  const diagnostics = [];
  if (save.schemaVersion !== 1 || save.checksum !== expected) diagnostics.push(diagnostic2("LOAD_FAILED", "Runtime Save State schema or checksum is invalid.", true));
  if (save.projectId !== session.project.projectId || save.sceneId !== session.sceneId) diagnostics.push(diagnostic2("LOAD_FAILED", "Runtime Save State belongs to another Game Project or Scene.", true));
  if (diagnostics.length) return {
    session: {
      ...session,
      recovery: "RECOVERED",
      diagnostics: [
        ...session.diagnostics,
        ...diagnostics
      ]
    },
    restored: false,
    diagnostics
  };
  const runtime = {
    ...session.runtime,
    world: {
      ...session.runtime.world,
      tick: save.tick,
      values: save.values
    }
  };
  return {
    session: {
      ...session,
      runtime,
      runtimeValues: save.values,
      recovery: "VALID",
      diagnostics: runtime.diagnostics
    },
    restored: true,
    diagnostics: []
  };
}
async function createGameDependencySnapshot(packageId, packageVersion, entries) {
  return createDependencySnapshot(packageId, packageVersion, entries, true);
}
function isGameAssetReference(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return (candidate.kind === "DRAW" || candidate.kind === "AUDIO") && typeof candidate.assetId === "string" && typeof candidate.revisionId === "string" && typeof candidate.contentHash === "string";
}
async function gameRuntimeStateFingerprint(session) {
  return asSha256(await hashCanonical({
    projectId: session.project.projectId,
    projectRevisionId: session.project.revisionId,
    runtime: serializeRuntimeState(session.runtime),
    sceneId: session.sceneId,
    values: session.runtimeValues
  }));
}

// src/wp200-game-build-pipeline.ts
function diagnostic3(code, message, recoverable = false) {
  return {
    code,
    severity: "ERROR",
    message,
    recoverable
  };
}
function featureEnabled2(flags, killSwitch) {
  return killSwitch !== true && flags["game-build"] === true;
}
function projectAssetReferences(project) {
  const references = [];
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references;
}
function baseRequest(request, project) {
  return {
    requestId: request.requestId,
    packageId: project.packageId,
    packageVersion: project.packageVersion,
    packageHash: request.packageHash,
    dependencies: project.dependencies,
    target: project.buildProfile.target,
    configuration: request.configuration,
    runtime: request.runtime,
    sourceRevisionId: project.revisionId
  };
}
function validateGameBuildRequest(request) {
  const diagnostics = [];
  if (!featureEnabled2(request.flags, request.killSwitch)) diagnostics.push(diagnostic3("UNSUPPORTED_CAPABILITY", "Game Build flag is OFF or the kill switch is active.", true));
  const projectValidation = validateGameProject(request.project);
  diagnostics.push(...projectValidation.diagnostics);
  if (request.project.buildProfile.runtimeVersion !== request.runtime.runtimeVersion) diagnostics.push(diagnostic3("UNSUPPORTED_RUNTIME_VERSION", "Game Build Runtime version does not match the Project Build Profile."));
  for (const reference of projectAssetReferences(request.project)) {
    if (reference.mode === "LIVE") diagnostics.push(diagnostic3("BUILD_INVALID_REQUEST", `LIVE Asset ${reference.assetId} cannot enter a Build; approve a PINNED Revision first.`));
  }
  if (request.project.dependencies.entries.some((entry) => entry.mode !== "PINNED")) diagnostics.push(diagnostic3("DEPENDENCY_LOCK_MISMATCH", "All Build dependencies must be PINNED."));
  if (request.security !== void 0) diagnostics.push(...validateBuildSecurity(request.security));
  if (request.project.schemaVersion === 1 && projectValidation.valid) {
    const base = baseRequest(request, request.project);
    diagnostics.push(...validateBuildRequest(base));
  }
  return diagnostics;
}
async function createGameBuildPlan(request, project) {
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
    configuration: request.configuration
  };
  const provenanceHash = await hashCanonical(provenanceValue);
  const manifestValue = {
    manifestVersion: 1,
    gameProject: provenanceValue,
    baseBuildManifest: basePlan.manifest,
    scenes: project.scenes,
    inputMap: project.inputMap,
    behaviors: project.behaviors
  };
  const manifest = canonicalJson(manifestValue);
  const manifestHash = await hashCanonical(manifestValue);
  const cacheKey = asSha256(await sha256Hex(canonicalJson({
    baseCacheKey: basePlan.cacheKey,
    projectSnapshotHash: project.snapshotHash,
    provenanceHash,
    runtimeVersion: request.runtime.runtimeVersion,
    target: project.buildProfile.target,
    configuration: request.configuration
  })));
  return {
    base: basePlan,
    projectId: project.projectId,
    projectRevisionId: project.revisionId,
    projectSnapshotHash: project.snapshotHash,
    provenanceHash,
    manifest,
    manifestHash,
    cacheKey
  };
}
async function createGameBuildRecord(request) {
  const diagnostics = validateGameBuildRequest(request);
  const projectValidation = validateGameProject(request.project);
  const requestFingerprint = asSha256(await sha256Hex(canonicalJson({
    requestId: request.requestId,
    projectId: request.project.projectId,
    projectRevisionId: request.project.revisionId,
    packageHash: request.packageHash,
    runtime: request.runtime,
    configuration: request.configuration
  })));
  if (!projectValidation.valid || diagnostics.some((item) => item.severity === "ERROR") || !featureEnabled2(request.flags, request.killSwitch)) {
    const failedBase = {
      request: baseRequest(request, request.project),
      lifecycle: "FAILED",
      diagnostics,
      requestFingerprint: await sha256Hex(canonicalJson({
        requestId: request.requestId,
        packageId: request.project.packageId,
        packageVersion: request.project.packageVersion,
        packageHash: request.packageHash,
        target: request.project.buildProfile.target,
        configuration: request.configuration,
        runtime: request.runtime
      }))
    };
    return {
      request,
      base: failedBase,
      lifecycle: "FAILED",
      diagnostics,
      requestFingerprint
    };
  }
  const project = request.project;
  const base = await createBuildRecord(baseRequest(request, project));
  const plan = await createGameBuildPlan(request, project);
  return {
    request,
    base: {
      ...base,
      plan: plan.base
    },
    lifecycle: base.lifecycle,
    plan,
    diagnostics: [
      ...diagnostics,
      ...base.diagnostics
    ],
    requestFingerprint
  };
}
function transitionGameBuild(record5, next) {
  const base = transitionBuild(record5.base, next);
  return {
    ...record5,
    base,
    lifecycle: base.lifecycle
  };
}
function createGameRuntimeArtifactManifest(record5, artifact, verificationState = "UNVERIFIED") {
  if (record5.plan === void 0) throw new Error("Game Build Plan is required for an artifact manifest.");
  return {
    schemaVersion: 1,
    buildArtifactId: artifact.buildArtifactId,
    projectId: record5.plan.projectId,
    projectRevisionId: record5.plan.projectRevisionId,
    packageId: record5.base.request.packageId,
    packageVersion: record5.base.request.packageVersion,
    dependencySnapshotHash: record5.base.request.dependencies.snapshotHash,
    runtimeId: record5.base.request.runtime.runtimeId,
    runtimeVersion: record5.base.request.runtime.runtimeVersion,
    target: record5.base.request.target,
    configurationVersion: record5.base.request.configuration.version,
    projectSnapshotHash: record5.plan.projectSnapshotHash,
    provenanceHash: record5.plan.provenanceHash,
    artifactHash: artifact.artifactHash,
    verificationState
  };
}
function attachVerifiedGameArtifact(record5, artifact, evidence) {
  const base = attachVerifiedArtifact(record5.base, artifact, evidence);
  const manifest = createGameRuntimeArtifactManifest(record5, artifact, "VERIFIED");
  return {
    ...record5,
    base,
    lifecycle: "READY",
    artifact: manifest,
    diagnostics: record5.diagnostics
  };
}
function recoverGameBuild(record5) {
  if (record5.lifecycle === "READY") return {
    recovered: false,
    record: record5,
    diagnostics: [
      diagnostic3("BUILD_INVALID_REQUEST", "A READY artifact is immutable and does not need recovery.", true)
    ],
    retryAllowed: false
  };
  if (record5.lifecycle === "FAILED" || record5.lifecycle === "CANCELLED" || record5.lifecycle === "QUARANTINED") {
    return {
      recovered: true,
      record: {
        ...record5,
        diagnostics: [
          ...record5.diagnostics,
          diagnostic3("BUILD_CANCELLED", "Build remains recoverable as a failed record; retry requires a new idempotent request.", true)
        ]
      },
      diagnostics: [],
      retryAllowed: true
    };
  }
  return {
    recovered: false,
    record: record5,
    diagnostics: [
      diagnostic3("BUILD_INVALID_REQUEST", "Only failed, cancelled, or quarantined Builds can enter recovery.", true)
    ],
    retryAllowed: false
  };
}
function canExecuteGameArtifact(manifest) {
  return manifest.verificationState === "VERIFIED";
}
function artifactManifestIsImmutable(before, after) {
  return canonicalJson(before) === canonicalJson(after);
}

// src/game/game-350/igame-player-contract.ts
var IGAME_PLAYER_SCHEMA_VERSION = 1;
var IGAME_EXTERNAL_BUILD_SCHEMA_VERSION = 1;
var STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
function stableId(value) {
  return typeof value === "string" && STABLE_ID.test(value);
}
function nonEmptyText(value, maxLength = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function manifestShape(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const manifest = value;
  return manifest.schemaVersion === IGAME_PLAYER_SCHEMA_VERSION && stableId(manifest.productId) && stableId(manifest.projectId) && stableId(manifest.revisionId) && stableId(manifest.ownerId) && stableId(manifest.tenantId) && nonEmptyText(manifest.title) && stableId(manifest.runtimeProfileId) && stableId(manifest.runtimeVersion) && (manifest.sourceAuthority === "REGISTRY" || manifest.sourceAuthority === "LOCAL_PREVIEW") && manifest.editAuthority === "NONE" && manifest.assetAuthority === "READ_ONLY";
}
function createIGamePlayerManifest(input) {
  if (!stableId(input.productId) || !stableId(input.projectId) || !stableId(input.revisionId) || !stableId(input.ownerId) || !stableId(input.tenantId) || !nonEmptyText(input.title) || !stableId(input.runtimeProfileId) || !stableId(input.runtimeVersion)) {
    throw new Error("iGAME Player manifest contains an unstable identity.");
  }
  const sourceAuthority = input.sourceAuthority ?? "REGISTRY";
  return Object.freeze({
    schemaVersion: IGAME_PLAYER_SCHEMA_VERSION,
    productId: input.productId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
    title: input.title.trim(),
    runtimeProfileId: input.runtimeProfileId,
    runtimeVersion: input.runtimeVersion,
    sourceAuthority,
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY"
  });
}
function accessResult(decision, code, message, manifest, proof) {
  return proof === void 0 ? {
    decision,
    code,
    message,
    manifest
  } : {
    decision,
    code,
    message,
    manifest,
    proof
  };
}
function resolveIGamePlayerAccess(input) {
  if (!manifestShape(input.manifest)) {
    return accessResult("UNAVAILABLE", "INVALID_MANIFEST", "iGAME Player\u306E\u60C5\u5831\u304C\u4E0D\u6B63\u306A\u305F\u3081\u3001\u5B89\u5168\u306B\u505C\u6B62\u3057\u307E\u3057\u305F\u3002", input.manifest);
  }
  if (input.source === "LOCAL_PREVIEW") {
    if (input.manifest.sourceAuthority !== "LOCAL_PREVIEW") {
      return accessResult("DENIED", "LOCAL_PREVIEW_ONLY", "Registry\u5546\u54C1\u306F\u3001Registry\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u751F\u3057\u307E\u3059\u3002", input.manifest);
    }
    return accessResult("AUTHORIZED", "PLAYER_AUTHORIZED", "\u30ED\u30FC\u30AB\u30EBiGAME Player\u306E\u518D\u751F\u3092\u8A31\u53EF\u3057\u307E\u3057\u305F\u3002\u7DE8\u96C6\u6A29\u9650\u306F\u3042\u308A\u307E\u305B\u3093\u3002", input.manifest);
  }
  if (input.manifest.sourceAuthority !== "REGISTRY") {
    return accessResult("DENIED", "SERVER_AUTH_REQUIRED", "\u3053\u306E\u5546\u54C1\u306F\u30ED\u30FC\u30AB\u30EB\u30D7\u30EC\u30D3\u30E5\u30FC\u306E\u305F\u3081\u3001Registry\u5546\u54C1\u3068\u3057\u3066\u958B\u3051\u307E\u305B\u3093\u3002", input.manifest);
  }
  if (!stableId(input.principalId) || input.proof === void 0) {
    return accessResult("DENIED", "SERVER_AUTH_REQUIRED", "Registry\u8A8D\u8A3C\u3068\u30D7\u30EC\u30A4\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059\u3002", input.manifest);
  }
  try {
    const proof = requireAuthorizationProofV1(input.proof, {
      principalId: input.principalId,
      resourceType: "igame-product",
      resourceId: input.manifest.productId,
      action: "play",
      capability: "game.play",
      tenantId: input.manifest.tenantId
    });
    return accessResult("AUTHORIZED", "PLAYER_AUTHORIZED", "Registry\u8A8D\u8A3C\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002\u7DE8\u96C6\u6A29\u9650\u306F\u3042\u308A\u307E\u305B\u3093\u3002", input.manifest, proof);
  } catch {
    return accessResult("DENIED", "AUTHORIZATION_INVALID", "Registry\u8A8D\u8A3C\u304C\u4E0D\u6B63\u3001\u671F\u9650\u5207\u308C\u3001\u307E\u305F\u306F\u5BFE\u8C61\u5916\u3067\u3059\u3002", input.manifest);
  }
}
function createIGamePlayerSession(access) {
  if (access.decision !== "AUTHORIZED") {
    throw new Error("An authorized iGAME Player access result is required.");
  }
  return {
    mode: "PLAYER",
    productId: access.manifest.productId,
    projectId: access.manifest.projectId,
    revisionId: access.manifest.revisionId,
    ownerId: access.manifest.ownerId,
    tenantId: access.manifest.tenantId,
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY",
    canWriteProject: false,
    canEditGame: false,
    canEditDraw: false,
    canEditAudio: false
  };
}
var IGAME_EXTERNAL_BUILD_TARGETS = Object.freeze([
  "ANDROID_APK",
  "ANDROID_AAB",
  "IOS_IPA",
  "DESKTOP_PACKAGE",
  "WEB_PACKAGE"
]);
function isIGameExternalBuildTarget(value) {
  return IGAME_EXTERNAL_BUILD_TARGETS.includes(value);
}
function igameExternalBuildResourceId(manifest, target) {
  return [
    "igame-build",
    manifest.tenantId,
    manifest.ownerId,
    manifest.productId,
    manifest.projectId,
    manifest.revisionId,
    target
  ].join(":");
}
function externalBuildResult(request, decision, code, message, grantId) {
  return grantId === void 0 ? {
    schemaVersion: IGAME_EXTERNAL_BUILD_SCHEMA_VERSION,
    decision,
    code,
    message,
    target: request.target,
    productId: request.manifest.productId,
    projectId: request.manifest.projectId,
    revisionId: request.manifest.revisionId,
    requiresServerBuild: true,
    artifactMaterialized: false
  } : {
    schemaVersion: IGAME_EXTERNAL_BUILD_SCHEMA_VERSION,
    decision,
    code,
    message,
    target: request.target,
    productId: request.manifest.productId,
    projectId: request.manifest.projectId,
    revisionId: request.manifest.revisionId,
    requiresServerBuild: true,
    artifactMaterialized: false,
    grantId
  };
}
function sourceMatchesManifest(manifest, source) {
  return source.productId === manifest.productId && source.projectId === manifest.projectId && source.revisionId === manifest.revisionId && source.ownerId === manifest.ownerId && source.tenantId === manifest.tenantId && stableId(source.packageId) && stableId(source.packageVersion) && nonEmptyText(source.sourceSnapshotHash, 128);
}
function admitIGameExternalBuild(request) {
  if (!isIGameExternalBuildTarget(request.target)) {
    return externalBuildResult(request, "DENIED", "UNSUPPORTED_EXTERNAL_TARGET", "\u6307\u5B9A\u3055\u308C\u305F\u5916\u90E8\u30D3\u30EB\u30C9\u5BFE\u8C61\u306B\u306F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  if (request.killSwitch) {
    return externalBuildResult(request, "UNAVAILABLE", "KILL_SWITCH_ACTIVE", "\u505C\u6B62\u30B9\u30A4\u30C3\u30C1\u304C\u6709\u52B9\u306A\u305F\u3081\u3001\u5916\u90E8\u30D3\u30EB\u30C9\u3092\u5B89\u5168\u306B\u505C\u6B62\u3057\u307E\u3057\u305F\u3002");
  }
  if (!request.featureEnabled) {
    return externalBuildResult(request, "UNAVAILABLE", "FEATURE_DISABLED", "\u3053\u306E\u74B0\u5883\u3067\u306F\u5916\u90E8\u30D3\u30EB\u30C9\u6A5F\u80FD\u304C\u7121\u52B9\u3067\u3059\u3002");
  }
  if (request.manifest.sourceAuthority !== "REGISTRY") {
    return externalBuildResult(request, "DENIED", "REGISTRY_REQUIRED", "PiXiEED\u304B\u3089\u5916\u90E8\u30D3\u30EB\u30C9\u3078\u51FA\u305B\u308B\u306E\u306F\u3001Registry\u78BA\u8A8D\u6E08\u307F\u306ERevision\u3060\u3051\u3067\u3059\u3002");
  }
  if (!sourceMatchesManifest(request.manifest, request.source)) {
    return externalBuildResult(request, "DENIED", "SOURCE_IDENTITY_MISMATCH", "\u5546\u54C1\u30FB\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u30FBOwner\u30FBTenant\u30FBRevision\u306E\u60C5\u5831\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  try {
    const proof = requireAuthorizationProofV1(request.proof, {
      principalId: request.principalId,
      resourceType: "igame-external-build",
      resourceId: igameExternalBuildResourceId(request.manifest, request.target),
      action: "build",
      capability: "game.build.external",
      tenantId: request.manifest.tenantId
    });
    if (proof.grantId === null) {
      return externalBuildResult(request, "DENIED", "ENTITLEMENT_REQUIRED", "APK/AAB\u306A\u3069\u306E\u5916\u90E8\u30D3\u30EB\u30C9\u306B\u306F\u3001\u8AB2\u91D1\u6E08\u307F\u306E\u5916\u90E8\u30D3\u30EB\u30C9\u6A29\u9650\u304C\u5FC5\u8981\u3067\u3059\u3002");
    }
    return externalBuildResult(request, "ADMITTED", "EXTERNAL_BUILD_ADMITTED", "\u8AB2\u91D1\u6E08\u307F\u306E\u5916\u90E8\u30D3\u30EB\u30C9\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002\u30B5\u30FC\u30D0\u30FCBuild\u304C\u5FC5\u8981\u3067\u3059\u3002", proof.grantId);
  } catch {
    return externalBuildResult(request, "DENIED", "EXTERNAL_BUILD_AUTHORIZATION_INVALID", "\u5916\u90E8\u30D3\u30EB\u30C9\u6A29\u9650\u304C\u4E0D\u6B63\u3001\u671F\u9650\u5207\u308C\u3001\u672A\u8AB2\u91D1\u3001\u307E\u305F\u306F\u5BFE\u8C61\u5916\u3067\u3059\u3002");
  }
}

// src/game/game-350/igame-public-bootstrap.ts
var IGAME_PUBLIC_BOOTSTRAP_SCHEMA = "pixieed-igame-player-bootstrap/v1";
var SHA2562 = /^[a-f0-9]{64}$/u;
var STABLE_ID2 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeId(value) {
  return typeof value === "string" && STABLE_ID2.test(value);
}
function safeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || localHttp;
  } catch {
    return false;
  }
}
function parseIGamePublicBootstrap(value, principalId) {
  const candidate = record(value);
  if (candidate.schema !== IGAME_PUBLIC_BOOTSTRAP_SCHEMA) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u30B9\u30AD\u30FC\u30DE\u304C\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  if (!safeId(principalId)) throw new Error("iGAME\u516C\u958BBootstrap\u306E\u5229\u7528\u8005ID\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  const product = record(candidate.product);
  const revision = record(candidate.revision);
  const packageInfo = record(candidate.package);
  const productId = product.id;
  const revisionId = revision.id;
  const packageHash = revision.package_hash;
  const packageBytesHash = packageInfo.sha256;
  const revisionNumber = typeof revision.number === "number" ? revision.number : NaN;
  const expiresIn = typeof packageInfo.expires_in === "number" ? packageInfo.expires_in : NaN;
  if (!safeId(productId) || typeof product.title !== "string" || product.title.trim().length === 0 || !safeId(revisionId) || !Number.isSafeInteger(revisionNumber) || revisionNumber < 1 || !SHA2562.test(String(packageHash)) || !SHA2562.test(String(packageBytesHash)) || !safeUrl(packageInfo.url) || typeof packageInfo.mime_type !== "string" || packageInfo.mime_type.length > 256 || !Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306ERevision\u307E\u305F\u306FPackage\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  }
  const manifest = createIGamePlayerManifest(record(candidate.manifest));
  if (manifest.productId !== productId || manifest.revisionId !== revisionId) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u5546\u54C1\u3068Revision\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  const proof = requireAuthorizationProofV1(candidate.proof, {
    principalId,
    resourceType: "igame-product",
    resourceId: manifest.productId,
    action: "play",
    capability: "game.play",
    tenantId: manifest.tenantId
  });
  if (proof.expiresAt !== void 0 && Date.parse(proof.expiresAt) <= Date.now()) {
    throw new Error("iGAME\u516C\u958BBootstrap\u306E\u30D7\u30EC\u30A4\u6A29\u9650\u304C\u671F\u9650\u5207\u308C\u3067\u3059\u3002");
  }
  return Object.freeze({
    schema: IGAME_PUBLIC_BOOTSTRAP_SCHEMA,
    product: {
      id: productId,
      title: product.title.trim()
    },
    revision: {
      id: revisionId,
      number: revisionNumber,
      content_hash: typeof revision.content_hash === "string" ? revision.content_hash : null,
      package_hash: String(packageHash)
    },
    manifest,
    package: {
      url: packageInfo.url,
      sha256: String(packageBytesHash),
      mime_type: packageInfo.mime_type,
      expires_in: expiresIn
    },
    proof
  });
}
async function sha256BytesHex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}
async function fetchIGamePublicPackage(bootstrap, fetcher = fetch) {
  const response = await fetcher(bootstrap.package.url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`iGAME Package\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F (${response.status})\u3002`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await sha256BytesHex(bytes) !== bootstrap.package.sha256) {
    throw new Error("iGAME Package\u306EHash\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  return bytes;
}

// src/draw2-core.ts
var NullInstrumentation = class {
  record(_point) {
  }
};
var NOOP_INSTRUMENTATION = new NullInstrumentation();
function stableValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __type: "Uint8Array",
      values: Array.from(value)
    };
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => [
      key,
      stableValue(entry)
    ]);
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (value !== null && typeof value === "object") {
    const object = value;
    return Object.fromEntries(Object.keys(object).filter((key) => object[key] !== void 0).sort().map((key) => [
      key,
      stableValue(object[key])
    ]));
  }
  return value;
}
function canonicalJson2(value) {
  return JSON.stringify(stableValue(value)) ?? "null";
}
var IndexedTileRaster = class _IndexedTileRaster {
  width;
  height;
  tileSize;
  #tiles;
  #nonTransparentPixelCount;
  #cowSplitCount = 0;
  #copiedBytes = 0;
  constructor(width, height, tileSize, tiles, nonTransparentPixelCount = 0) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.#tiles = tiles;
    this.#nonTransparentPixelCount = nonTransparentPixelCount;
  }
  static empty(width, height, tileSize) {
    if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
      throw new Error("Raster dimensions must be positive safe integers.");
    }
    return new _IndexedTileRaster(width, height, tileSize, /* @__PURE__ */ new Map());
  }
  /** Rehydrates a sparse raster from its canonical tile snapshots. */
  static fromTileSnapshots(width, height, tileSize, snapshots) {
    const raster = _IndexedTileRaster.empty(width, height, tileSize);
    const tiles = /* @__PURE__ */ new Map();
    const expectedByteLength = tileSize * tileSize;
    const tileColumns = Math.ceil(width / tileSize);
    const tileRows = Math.ceil(height / tileSize);
    let nonTransparentPixelCount = 0;
    for (const snapshot of snapshots) {
      if (!/^\d+:\d+$/.test(snapshot.tileKey)) {
        throw new Error("Raster tile key is invalid.");
      }
      const [tileXText, tileYText] = snapshot.tileKey.split(":");
      const tileX = Number(tileXText);
      const tileY = Number(tileYText);
      if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= tileColumns || tileY >= tileRows) {
        throw new Error("Raster tile key is outside the raster.");
      }
      if (!(snapshot.bytes instanceof Uint8Array) || snapshot.bytes.byteLength !== expectedByteLength) {
        throw new Error("Raster tile byte length is invalid.");
      }
      for (const value of snapshot.bytes) {
        if (value !== 0) nonTransparentPixelCount += 1;
      }
      if (tiles.has(snapshot.tileKey)) {
        throw new Error("Raster tile key is duplicated.");
      }
      tiles.set(snapshot.tileKey, {
        bytes: new Uint8Array(snapshot.bytes),
        references: 1
      });
    }
    return new _IndexedTileRaster(raster.width, raster.height, raster.tileSize, tiles, nonTransparentPixelCount);
  }
  /** Shares immutable Tile buffers; the next mutation splits only its affected Tile. */
  sharedClone() {
    const tiles = /* @__PURE__ */ new Map();
    for (const [key, cell] of this.#tiles) {
      cell.references += 1;
      tiles.set(key, cell);
    }
    return new _IndexedTileRaster(this.width, this.height, this.tileSize, tiles, this.#nonTransparentPixelCount);
  }
  #tileCoordinates(x, y) {
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    const localX = x % this.tileSize;
    const localY = y % this.tileSize;
    return {
      tileX,
      tileY,
      localIndex: localY * this.tileSize + localX,
      tileKey: `${tileX}:${tileY}`
    };
  }
  getPixel(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    return this.#tiles.get(coordinates.tileKey)?.bytes[coordinates.localIndex] ?? 0;
  }
  /** Returns whether the raster contains any non-transparent indexed pixel. */
  hasNonTransparentPixel() {
    return this.#nonTransparentPixelCount > 0;
  }
  setPixel(assetId, x, y, colorIndex) {
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 255) {
      throw new Error("Canonical palette index must be an integer from 0 through 255.");
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    let cell = this.#tiles.get(coordinates.tileKey);
    const previous = cell?.bytes[coordinates.localIndex] ?? 0;
    const tile = {
      assetId,
      tileX: coordinates.tileX,
      tileY: coordinates.tileY,
      tileKey: coordinates.tileKey
    };
    if (previous === colorIndex) {
      return {
        changed: false,
        tile,
        copiedBytes: 0,
        cowSplit: false
      };
    }
    let copiedBytes = 0;
    let cowSplit = false;
    if (cell === void 0) {
      cell = {
        bytes: new Uint8Array(this.tileSize * this.tileSize),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
    } else if (cell.references > 1) {
      cell.references -= 1;
      cell = {
        bytes: new Uint8Array(cell.bytes),
        references: 1
      };
      this.#tiles.set(coordinates.tileKey, cell);
      copiedBytes = cell.bytes.byteLength;
      cowSplit = true;
      this.#cowSplitCount += 1;
      this.#copiedBytes += copiedBytes;
    }
    cell.bytes[coordinates.localIndex] = colorIndex;
    if (previous === 0 && colorIndex !== 0) {
      this.#nonTransparentPixelCount += 1;
    } else if (previous !== 0 && colorIndex === 0) {
      this.#nonTransparentPixelCount -= 1;
    }
    return {
      changed: true,
      tile,
      copiedBytes,
      cowSplit
    };
  }
  snapshotTiles() {
    return Array.from(this.#tiles.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([tileKey, cell]) => ({
      tileKey,
      bytes: new Uint8Array(cell.bytes)
    }));
  }
  /** Full canonical read is reserved for Golden Fixture equivalence, not active dirty rendering. */
  toUint8Array() {
    const pixels = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        pixels[y * this.width + x] = this.getPixel(x, y);
      }
    }
    return pixels;
  }
  /** Reads only the requested presentation region; active editing must not call toUint8Array(). */
  readRegion(x, y, width, height) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      throw new Error("Raster region is outside the raster.");
    }
    const pixels = new Uint8Array(width * height);
    let implicitTransparentPixelCount = 0;
    for (let regionY = 0; regionY < height; regionY += 1) {
      for (let regionX = 0; regionX < width; regionX += 1) {
        const sourceX = x + regionX;
        const sourceY = y + regionY;
        const coordinates = this.#tileCoordinates(sourceX, sourceY);
        const cell = this.#tiles.get(coordinates.tileKey);
        if (cell === void 0) implicitTransparentPixelCount += 1;
        pixels[regionY * width + regionX] = cell?.bytes[coordinates.localIndex] ?? 0;
      }
    }
    return {
      x,
      y,
      width,
      height,
      pixels,
      implicitTransparentPixelCount
    };
  }
  memoryMetrics() {
    let sharedTileBytes = 0;
    for (const cell of this.#tiles.values()) {
      if (cell.references > 1) sharedTileBytes += cell.bytes.byteLength;
    }
    const tileColumns = Math.ceil(this.width / this.tileSize);
    const tileRows = Math.ceil(this.height / this.tileSize);
    return {
      logicalRasterBytes: this.width * this.height,
      allocatedTileBytes: this.#tiles.size * this.tileSize * this.tileSize,
      sharedTileBytes,
      tileCount: this.#tiles.size,
      implicitTransparentTileCount: tileColumns * tileRows - this.#tiles.size,
      cowSplitCount: this.#cowSplitCount,
      copiedBytes: this.#copiedBytes
    };
  }
};
function validatePalette(palette) {
  if (palette.length < 1 || palette.length > 256) {
    throw new Error("Palette must contain 1 through 256 entries.");
  }
  if (palette[0] !== 0) throw new Error("Palette index 0 must be transparent.");
  for (const color of palette) {
    if (!Number.isSafeInteger(color) || color < 0 || color > 4294967295) {
      throw new Error("Palette colors must be uint32 values.");
    }
  }
  return [
    ...palette
  ];
}
function createProject(options) {
  if (!options.projectId) throw new Error("Project ID is required.");
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const palette = validatePalette(options.palette ?? [
    0,
    4294967295,
    4278190335,
    65535
  ]);
  const assetId = `${options.projectId}:draw:main`;
  const asset = {
    id: assetId,
    width,
    height,
    palette,
    raster: IndexedTileRaster.empty(width, height, options.tileSize ?? 32),
    revision: 0
  };
  const layerId = `${options.projectId}:layer:0`;
  const frameId = `${options.projectId}:frame:0`;
  const celId = `${options.projectId}:cel:0:0`;
  return {
    schemaVersion: 1,
    projectId: options.projectId,
    name: options.name ?? "Untitled Draw2 Project",
    structureEpoch: 1,
    activeAssetId: assetId,
    layers: [
      {
        id: layerId,
        layerTrackId: layerId,
        name: "Layer 1",
        order: 0,
        orderingKey: "00000000",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        locked: false,
        lifecycle: "ACTIVE",
        kind: "RASTER"
      }
    ],
    frames: [
      {
        id: frameId,
        frameId,
        index: 0,
        orderKey: "00000000",
        durationMs: 100,
        timingUnit: "MILLISECONDS",
        metadataVersion: 1
      }
    ],
    cels: [
      {
        id: celId,
        celId,
        layerId,
        layerTrackId: layerId,
        frameId,
        assetId,
        bindingMode: "RASTER",
        recordVersion: 1,
        lifecycle: "ACTIVE"
      }
    ],
    timeline: {
      id: `${options.projectId}:timeline:0`,
      timelineId: `${options.projectId}:timeline:0`,
      frameOrder: [
        frameId
      ],
      layerTrackOrder: [
        layerId
      ],
      metadataVersion: 1
    },
    activeLayerId: layerId,
    activeFrameId: frameId,
    activeCelId: celId,
    assets: {
      [assetId]: asset
    },
    tilemaps: {},
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
}

// src/draw2-creator-workspace.ts
function isAssetSourceKind(value) {
  return [
    "LAYER_GROUP",
    "SELECTED_LAYERS",
    "VISIBLE_COMPOSITE",
    "ANIMATION_RANGE"
  ].includes(value);
}
function isCreatorAssetKind(value) {
  return [
    "CHARACTER",
    "OBJECT",
    "TILE",
    "BACKGROUND",
    "EFFECT"
  ].includes(value);
}
function isAssetAnimationName(value) {
  return value.trim().length > 0 && value.length <= 128;
}
function isAssetPivot(value) {
  return [
    "CENTER",
    "FEET",
    "CUSTOM"
  ].includes(value);
}
function normalizeReferences(values) {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  ].sort();
}
function normalizeOrderedReferences(values) {
  const seen = /* @__PURE__ */ new Set();
  const normalized = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
var LEGACY_DIRECTION_SUFFIXES = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "UP_LEFT",
  "UP_RIGHT",
  "DOWN_LEFT",
  "DOWN_RIGHT"
];
function assetAnimationMotionName(clip) {
  const explicit = clip.motionName?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const custom = clip.customName?.trim();
  if (clip.name === "CUSTOM" && custom !== void 0 && custom.length > 0) return custom;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? clip.name.slice(0, separator) : clip.name;
}
function assetAnimationDirectionName(clip) {
  const explicit = clip.direction?.trim();
  if (explicit !== void 0 && explicit.length > 0) return explicit;
  const separator = clip.name.lastIndexOf("_");
  const suffix = separator > 0 ? clip.name.slice(separator + 1) : "";
  return LEGACY_DIRECTION_SUFFIXES.includes(suffix) ? suffix : void 0;
}
function assetAnimationClipKey(clip) {
  return `${assetAnimationMotionName(clip)}::${assetAnimationDirectionName(clip) ?? "DEFAULT"}`;
}
function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}
function isValidLayerSelection(selection) {
  if (selection.kind === "CURRENT_LAYER") return selection.layerId.trim().length > 0;
  if (selection.kind === "LAYER_GROUP") return selection.groupId.trim().length > 0;
  if (selection.kind === "SELECTED_LAYERS") return normalizeReferences(selection.layerIds).length > 0;
  return selection.kind === "VISIBLE_LAYERS";
}
function isValidFrameSelection(selection) {
  if (selection.kind === "CURRENT_FRAME") return selection.frameId.trim().length > 0;
  if (selection.kind === "RANGE") return selection.startFrameId.trim().length > 0 && selection.endFrameId.trim().length > 0;
  if (selection.kind === "TAG") return selection.tagId.trim().length > 0;
  return selection.frameIds.length > 0 && normalizeReferences(selection.frameIds).length === selection.frameIds.length;
}
function isValidRegionSelection(region) {
  if (region.kind === "FULL_CANVAS") return true;
  if (![
    region.x,
    region.y
  ].every(isFiniteInteger) || region.x < 0 || region.y < 0) return false;
  if (region.kind === "MANUAL") return isPositiveInteger(region.width) && isPositiveInteger(region.height);
  if (region.kind === "GRID") return (region.cellSize === 16 || region.cellSize === 32) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
  return isPositiveInteger(region.cellWidth) && isPositiveInteger(region.cellHeight) && isPositiveInteger(region.columns) && isPositiveInteger(region.rows);
}
function isValidRasterSnapshot(snapshot) {
  if (!isPositiveInteger(snapshot.width) || !isPositiveInteger(snapshot.height) || !Array.isArray(snapshot.data) || snapshot.data.length !== snapshot.width * snapshot.height * 4) return false;
  return snapshot.data.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 255);
}
function isValidAnimationMapping(mapping) {
  const seenKeys = /* @__PURE__ */ new Set();
  return mapping.every((clip) => {
    const motionName = assetAnimationMotionName(clip).trim();
    const direction = assetAnimationDirectionName(clip);
    const key = assetAnimationClipKey(clip);
    const hasSourceFrames = clip.sourceFrames !== void 0;
    const normalizedFrameIds = clip.frameIds.map((frameId) => frameId.trim()).filter((frameId) => frameId.length > 0);
    if (!isAssetAnimationName(clip.name) || motionName.length === 0 || seenKeys.has(key) || clip.frameIds.length === 0 || normalizedFrameIds.length !== clip.frameIds.length || !hasSourceFrames && normalizeOrderedReferences(clip.frameIds).length !== clip.frameIds.length) return false;
    seenKeys.add(key);
    if (clip.name === "CUSTOM" && (clip.customName ?? "").trim().length === 0) return false;
    if (clip.motionName !== void 0 && clip.motionName.trim().length === 0) return false;
    if (direction !== void 0 && direction.trim().length === 0) return false;
    if (clip.sourceReference !== void 0 && clip.sourceReference.trim().length === 0) return false;
    if (clip.flipX !== void 0 && typeof clip.flipX !== "boolean") return false;
    if (clip.flipY !== void 0 && typeof clip.flipY !== "boolean") return false;
    if (clip.sourceFrames !== void 0 && (clip.sourceFrames.length !== clip.frameIds.length || clip.sourceFrames.some((frame) => frame.sourceFrameId.trim().length === 0 || normalizeReferences(frame.layerIds).length === 0 || !Number.isSafeInteger(frame.rect.x) || !Number.isSafeInteger(frame.rect.y) || frame.rect.x < 0 || frame.rect.y < 0 || !isPositiveInteger(frame.rect.width) || !isPositiveInteger(frame.rect.height) || frame.rasterSnapshot !== void 0 && !isValidRasterSnapshot(frame.rasterSnapshot) || frame.durationMs !== void 0 && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) || frame.flipX !== void 0 && typeof frame.flipX !== "boolean" || frame.flipY !== void 0 && typeof frame.flipY !== "boolean"))) return false;
    if (clip.frameDurationsMs !== void 0 && (clip.frameDurationsMs.length !== clip.frameIds.length || clip.frameDurationsMs.some((duration) => !Number.isFinite(duration) || duration <= 0))) return false;
    return [
      "LOOP",
      "ONCE",
      "PING_PONG"
    ].includes(clip.loopMode) && (clip.fps === void 0 || Number.isFinite(clip.fps) && clip.fps > 0);
  });
}
function isValidPivotDefinition(pivot) {
  return pivot.kind !== "CUSTOM" || [
    pivot.x,
    pivot.y
  ].every(Number.isFinite);
}
function isValidProtection(protection) {
  return typeof protection.locked === "boolean" && protection.sourceReadOnly === true && [
    "LIVE",
    "PINNED",
    "REVIEW",
    "FORKED"
  ].includes(protection.referencePolicy);
}
function isValidDefinition(definition) {
  const validFrames = isPositiveInteger(definition.frameStart) && isPositiveInteger(definition.frameEnd) && definition.frameEnd >= definition.frameStart;
  return definition.sourceProjectId.length > 0 && definition.sourceProjectId === definition.sourceProjectId.trim() && definition.sourceCanvasId.length > 0 && definition.sourceCanvasId === definition.sourceCanvasId.trim() && validFrames && isAssetSourceKind(definition.sourceKind) && isCreatorAssetKind(definition.assetKind) && isAssetPivot(definition.pivot) && isValidLayerSelection(definition.layerSelection) && isValidFrameSelection(definition.frameSelection) && isValidRegionSelection(definition.region) && isValidAnimationMapping(definition.animationMapping) && isValidPivotDefinition(definition.pivotDefinition) && isValidProtection(definition.protection) && definition.metadata.name.length > 0;
}
function validateAssetDefinitionDraft(draft) {
  if (draft.persistence !== "LOCAL_DRAFT" || !isValidDefinition(draft)) {
    return {
      ok: false,
      code: "INVALID_ASSET_DEFINITION",
      message: "Asset\u5B9A\u7FA9\u306E\u53C2\u7167\u3001\u7BC4\u56F2\u3001\u30E1\u30BF\u30C7\u30FC\u30BF\u3001\u4FDD\u8B77\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    };
  }
  return {
    ok: true,
    value: {
      ...draft,
      persistence: "VALIDATED_DEFINITION"
    }
  };
}

// src/draw2-creator-features.ts
var CREATOR_FEATURE_SCHEMA_VERSION = 1;
function boundedInteger(value, min, max, fallback) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function boundedNumber(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function stableId2(value, kind) {
  if (!/^[A-Za-z0-9:_./-]{1,128}$/.test(value)) {
    throw new Error(`${kind} must be a bounded stable identifier.`);
  }
  return value;
}
var AnimationTagStore = class {
  #tags = /* @__PURE__ */ new Map();
  upsert(tag, frameCount) {
    const errors = validateAnimationTag(tag, frameCount);
    if (errors.length > 0) throw new Error(errors.join(","));
    const normalized = {
      ...tag,
      id: stableId2(tag.id, "Animation tag ID"),
      name: tag.name.trim().slice(0, 64)
    };
    this.#tags.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#tags.delete(id);
  }
  get(id) {
    return this.#tags.get(id);
  }
  list() {
    return [
      ...this.#tags.values()
    ].sort((a, b) => a.fromFrameIndex - b.fromFrameIndex || a.id.localeCompare(b.id));
  }
};
function validateAnimationTag(tag, frameCount) {
  const errors = [];
  if (!tag.id.trim() || !tag.name.trim()) {
    errors.push("TAG_ID_OR_NAME_REQUIRED");
  }
  if (!Number.isSafeInteger(tag.fromFrameIndex) || !Number.isSafeInteger(tag.toFrameIndex) || tag.fromFrameIndex < 0 || tag.toFrameIndex < tag.fromFrameIndex || tag.toFrameIndex >= frameCount) errors.push("TAG_FRAME_RANGE_INVALID");
  if (tag.color !== void 0 && (!Number.isSafeInteger(tag.color) || tag.color < 0 || tag.color > 4294967295)) errors.push("TAG_COLOR_INVALID");
  return errors;
}
var TimelineMarkerStore = class {
  #markers = /* @__PURE__ */ new Map();
  upsert(marker) {
    if (!marker.id.trim() || !marker.label.trim() || !Number.isSafeInteger(marker.frameIndex) || marker.frameIndex < 0 || ![
      "AUDIO",
      "GAME_EVENT",
      "NOTE"
    ].includes(marker.kind)) throw new Error("Timeline marker is invalid.");
    const normalized = {
      ...marker,
      id: stableId2(marker.id, "Timeline marker ID"),
      label: marker.label.trim().slice(0, 128),
      payload: marker.payload === void 0 ? void 0 : {
        ...marker.payload
      }
    };
    this.#markers.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#markers.delete(id);
  }
  list(frameIndex) {
    return [
      ...this.#markers.values()
    ].filter((marker) => frameIndex === void 0 || marker.frameIndex === frameIndex).sort((a, b) => a.frameIndex - b.frameIndex || a.id.localeCompare(b.id));
  }
};
var DrawAudioReferenceStore = class {
  #references = /* @__PURE__ */ new Map();
  upsert(reference, frameCount) {
    if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
      throw new Error("Draw Audio reference requires a valid frame count.");
    }
    const normalized = {
      id: stableId2(reference.id, "Draw Audio reference ID"),
      audioAssetId: stableId2(reference.audioAssetId, "Audio Asset ID"),
      audioRevisionId: stableId2(reference.audioRevisionId, "Audio Revision ID"),
      kind: reference.kind === "SE" ? "SE" : "BGM",
      label: reference.label.trim().slice(0, 128) || reference.kind,
      startFrame: boundedInteger(reference.startFrame, 0, frameCount - 1, 0),
      durationFrames: boundedInteger(reference.durationFrames, 1, frameCount, reference.kind === "SE" ? 1 : frameCount),
      loop: reference.kind === "BGM" && reference.loop === true,
      gain: boundedNumber(reference.gain, 0, 2, 1)
    };
    this.#references.set(normalized.id, normalized);
    return normalized;
  }
  remove(id) {
    return this.#references.delete(id);
  }
  list() {
    return [
      ...this.#references.values()
    ].sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  }
};
var MAX_SELECTION_STAMP_DIMENSION = 4096;
var MAX_SELECTION_STAMP_AREA = 1048576;
function normalizeDraw2SelectionStamp(input) {
  if (typeof input.id !== "string" || typeof input.name !== "string" || !Array.isArray(input.pixels) || !Array.isArray(input.palette)) {
    throw new Error("Draw2 selection stamp shape is invalid.");
  }
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width < 1 || input.height < 1 || input.width > MAX_SELECTION_STAMP_DIMENSION || input.height > MAX_SELECTION_STAMP_DIMENSION || input.width * input.height > MAX_SELECTION_STAMP_AREA) {
    throw new Error("Draw2 selection stamp dimensions are invalid.");
  }
  if (input.palette.length < 1 || input.palette.length > 256) {
    throw new Error("Draw2 selection stamp palette is invalid.");
  }
  const palette = input.palette.map((color) => {
    if (!Number.isSafeInteger(color) || color < 0 || color > 4294967295) throw new Error("Draw2 selection stamp palette color is invalid.");
    return color >>> 0;
  });
  const pixels = /* @__PURE__ */ new Map();
  for (const candidate of input.pixels) {
    if (candidate === null || typeof candidate !== "object" || !Number.isSafeInteger(candidate.x) || !Number.isSafeInteger(candidate.y) || !Number.isSafeInteger(candidate.colorIndex) || candidate.x < 0 || candidate.y < 0 || candidate.x >= input.width || candidate.y >= input.height || candidate.colorIndex < 0 || candidate.colorIndex >= palette.length) {
      throw new Error("Draw2 selection stamp pixel is invalid.");
    }
    pixels.set(`${candidate.x}:${candidate.y}`, {
      x: candidate.x,
      y: candidate.y,
      colorIndex: candidate.colorIndex
    });
  }
  return {
    id: stableId2(input.id, "Draw2 selection stamp ID"),
    name: input.name.trim().slice(0, 64) || "Selection stamp",
    width: input.width,
    height: input.height,
    pixels: [
      ...pixels.values()
    ].sort((left, right) => left.y - right.y || left.x - right.x),
    palette,
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION
  };
}
var Draw2SelectionStampStore = class {
  #stamps = /* @__PURE__ */ new Map();
  constructor(initial = []) {
    for (const stamp of initial) this.save(stamp);
  }
  save(input) {
    const stamp = normalizeDraw2SelectionStamp(input);
    this.#stamps.set(stamp.id, stamp);
    return stamp;
  }
  load(id) {
    return this.#stamps.get(id);
  }
  remove(id) {
    return this.#stamps.delete(id);
  }
  list() {
    return [
      ...this.#stamps.values()
    ].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }
};
var DRAW2_TIMELINE_METADATA_SCHEMA_VERSION = 2;
function isMetadataRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneTimelineMarker(marker) {
  return marker.payload === void 0 ? {
    ...marker
  } : {
    ...marker,
    payload: {
      ...marker.payload
    }
  };
}
function normalizeDraw2TimelineMetadata(value, frameCount) {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Draw2 timeline metadata requires a valid frame count.");
  }
  if (value === void 0) {
    return {
      schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
      animationTags: [],
      markers: [],
      audioReferences: []
    };
  }
  if (!isMetadataRecord(value) || value.schemaVersion !== DRAW2_TIMELINE_METADATA_SCHEMA_VERSION) {
    throw new Error("Draw2 timeline metadata schema is unsupported.");
  }
  if (!Array.isArray(value.animationTags) || !Array.isArray(value.markers) || !Array.isArray(value.audioReferences)) {
    throw new Error("Draw2 timeline metadata collections are invalid.");
  }
  const selectionStampCandidates = value.selectionStamps;
  if (selectionStampCandidates !== void 0 && !Array.isArray(selectionStampCandidates)) {
    throw new Error("Draw2 selection stamp collection is invalid.");
  }
  const tags = new AnimationTagStore();
  const tagIds = /* @__PURE__ */ new Set();
  for (const candidate of value.animationTags) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 animation tag is invalid.");
    }
    if (tagIds.has(candidate.id)) {
      throw new Error("Draw2 animation tag identity is duplicated.");
    }
    tagIds.add(candidate.id);
    tags.upsert(candidate, frameCount);
  }
  const markers = new TimelineMarkerStore();
  const markerIds = /* @__PURE__ */ new Set();
  for (const candidate of value.markers) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 timeline marker is invalid.");
    }
    if (!Number.isSafeInteger(candidate.frameIndex) || candidate.frameIndex < 0 || candidate.frameIndex >= frameCount) {
      throw new Error("Draw2 timeline marker frame is invalid.");
    }
    if (markerIds.has(candidate.id)) {
      throw new Error("Draw2 timeline marker identity is duplicated.");
    }
    markerIds.add(candidate.id);
    markers.upsert(candidate);
  }
  const audioReferences = new DrawAudioReferenceStore();
  const audioReferenceIds = /* @__PURE__ */ new Set();
  for (const candidate of value.audioReferences) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw Audio reference is invalid.");
    }
    if (audioReferenceIds.has(candidate.id)) {
      throw new Error("Draw Audio reference identity is duplicated.");
    }
    audioReferenceIds.add(candidate.id);
    audioReferences.upsert(candidate, frameCount);
  }
  const selectionStamps = new Draw2SelectionStampStore();
  const selectionStampIds = /* @__PURE__ */ new Set();
  for (const candidate of selectionStampCandidates ?? []) {
    if (candidate === null || typeof candidate !== "object" || typeof candidate.id !== "string") {
      throw new Error("Draw2 selection stamp is invalid.");
    }
    const normalized = normalizeDraw2SelectionStamp(candidate);
    if (selectionStampIds.has(normalized.id)) {
      throw new Error("Draw2 selection stamp identity is duplicated.");
    }
    selectionStampIds.add(normalized.id);
    selectionStamps.save(normalized);
  }
  return {
    schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
    animationTags: tags.list().map((tag) => ({
      ...tag
    })),
    markers: markers.list().map(cloneTimelineMarker),
    audioReferences: audioReferences.list().map((reference) => ({
      ...reference
    })),
    ...selectionStampCandidates === void 0 ? {} : {
      selectionStamps: selectionStamps.list().map((stamp) => ({
        ...stamp,
        pixels: stamp.pixels.map((pixel) => ({
          ...pixel
        })),
        palette: [
          ...stamp.palette
        ]
      }))
    }
  };
}

// src/game/game-350/assetization.ts
var ASSET_PACKAGE_SCHEMA_VERSION = 1;
var ASSETIZATION_CONTRACT_VERSION = "PIXIEED_ASSETIZATION_V1";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function packageText(value, maxLength) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : void 0;
}
function canonicalPackageValue(value) {
  if (Array.isArray(value)) return value.map(canonicalPackageValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalPackageValue(value[key])
    ]));
  }
  return value;
}
async function sha256PackageBody(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPackageValue(packageBody(value))));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function packageBody(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    detectorVersion: manifest.detectorVersion,
    confirmationRevision: manifest.confirmationRevision,
    title: manifest.title,
    description: manifest.description,
    offerKind: manifest.offerKind,
    derivativePolicy: manifest.derivativePolicy,
    sellerId: manifest.sellerId ?? null,
    entries: manifest.entries
  };
}
function sourceReasons(source) {
  const reasons = [];
  if (!isRecord(source)) return [
    "source is required"
  ];
  const kind = source.kind;
  if (kind !== "DRAW" && kind !== "AUDIO") reasons.push("source kind is unsupported");
  if (packageText(typeof source.sourceId === "string" ? source.sourceId : void 0, 256) === void 0) reasons.push("sourceId is required");
  if (packageText(typeof source.projectId === "string" ? source.projectId : void 0, 256) === void 0) reasons.push("source projectId is required");
  if (packageText(typeof source.revisionId === "string" ? source.revisionId : void 0, 256) === void 0) reasons.push("source revisionId is required");
  if (packageText(typeof source.contentHash === "string" ? source.contentHash : void 0, 512) === void 0) reasons.push("source contentHash is required");
  if (kind === "DRAW" && packageText(typeof source.canvasId === "string" ? source.canvasId : void 0, 256) === void 0) reasons.push("Draw source canvasId is required");
  return reasons;
}
function proposalSourceMatches(source, proposal) {
  if (!isRecord(source) || !isRecord(proposal)) return false;
  if (source.kind === "DRAW" && (proposal.kind === "SPRITE" || proposal.kind === "ANIMATION")) {
    return typeof source.projectId === "string" && typeof source.revisionId === "string" && typeof source.contentHash === "string" && typeof source.canvasId === "string" && proposal.sourceProjectId === source.projectId.trim() && proposal.sourceRevisionId === source.revisionId.trim() && proposal.contentHash === source.contentHash.trim() && proposal.sourceCanvasId === source.canvasId.trim();
  }
  if (source.kind === "AUDIO" && proposal.kind === "AUDIO") {
    return typeof source.sourceId === "string" && typeof source.projectId === "string" && typeof source.revisionId === "string" && typeof source.contentHash === "string" && proposal.sourceProjectId === source.projectId.trim() && proposal.sourceRevisionId === source.revisionId.trim() && proposal.contentHash === source.contentHash.trim() && proposal.rangeId === source.sourceId.trim();
  }
  return false;
}
function packageStructureReasons(manifest) {
  const reasons = [];
  if (manifest.schemaVersion !== ASSET_PACKAGE_SCHEMA_VERSION) reasons.push("unsupported package schemaVersion");
  if (manifest.status !== "FINALIZED") reasons.push("package status must be FINALIZED");
  if (manifest.detectorVersion !== ASSETIZATION_CONTRACT_VERSION) reasons.push("unsupported detectorVersion");
  if (packageText(manifest.confirmationRevision, 256) === void 0 || manifest.confirmationRevision.trim().length === 0) reasons.push("confirmationRevision is required");
  if (packageText(manifest.packageId, 256) === void 0 || manifest.packageId.trim().length === 0) reasons.push("packageId is required");
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.packageHash)) reasons.push("packageHash must be a SHA-256 hash");
  if (packageText(manifest.title, 128) === void 0 || manifest.title.trim().length === 0) reasons.push("title is required");
  if (packageText(manifest.description, 4096) === void 0) reasons.push("description is invalid");
  if (manifest.offerKind !== "ASSET" && manifest.offerKind !== "ASSET_PACK") reasons.push("offerKind is invalid");
  if (![
    "USE_ONLY",
    "DERIVATIVE_ALLOWED",
    "REDISTRIBUTION_ALLOWED"
  ].includes(manifest.derivativePolicy)) reasons.push("derivativePolicy is invalid");
  if (manifest.sellerId !== void 0 && (packageText(manifest.sellerId, 256) === void 0 || manifest.sellerId.trim().length === 0)) reasons.push("sellerId is invalid");
  const expectedReadiness = manifest.sellerId === void 0 ? "ACCOUNT_REQUIRED" : "READY";
  if (manifest.saleReadiness !== expectedReadiness) reasons.push("saleReadiness does not match sellerId");
  const rawEntries = manifest.entries;
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  if (!Array.isArray(rawEntries) || entries.length === 0) reasons.push("at least one package entry is required");
  if (manifest.offerKind === "ASSET" && entries.length !== 1) reasons.push("ASSET must contain exactly one entry");
  if (manifest.offerKind === "ASSET_PACK" && entries.length < 2) reasons.push("ASSET_PACK must contain at least two entries");
  const entryIds = /* @__PURE__ */ new Set();
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      reasons.push(`entry ${index} is invalid`);
      continue;
    }
    const entryId = typeof entry.entryId === "string" ? entry.entryId : "";
    if (entryId.trim().length === 0 || entryIds.has(entryId)) reasons.push(`entry ${index} has a duplicate or empty entryId`);
    entryIds.add(entryId);
    if (entry.kind !== "DRAW" && entry.kind !== "AUDIO") reasons.push(`entry ${index} kind is invalid`);
    if (typeof entry.label !== "string" || entry.label.trim().length === 0 || entry.label.length > 128) reasons.push(`entry ${index} label is invalid`);
    reasons.push(...sourceReasons(entry.source).map((reason) => `entry ${index}: ${reason}`));
    if (!isRecord(entry.proposal)) {
      reasons.push(`entry ${index} proposal is invalid`);
      continue;
    }
    if (entry.kind === "DRAW") {
      if (entry.proposal.kind !== "SPRITE" && entry.proposal.kind !== "ANIMATION") reasons.push(`entry ${index} Draw proposal is invalid`);
      else if (!proposalSourceMatches(entry.source, entry.proposal)) reasons.push(`entry ${index} Draw proposal source mismatch`);
    } else if (entry.proposal.kind !== "AUDIO" || !proposalSourceMatches(entry.source, entry.proposal)) {
      reasons.push(`entry ${index} Audio proposal source mismatch`);
    }
  }
  return reasons;
}
function validateAssetPackageManifest(value) {
  if (!isRecord(value)) return {
    ok: false,
    reasons: [
      "package manifest must be an object"
    ]
  };
  const manifest = value;
  const reasons = packageStructureReasons(manifest);
  return reasons.length === 0 ? {
    ok: true,
    value: manifest
  } : {
    ok: false,
    reasons
  };
}
async function verifyAssetPackageManifest(manifest) {
  const structure = validateAssetPackageManifest(manifest);
  if (!structure.ok) return structure;
  const expectedHash = await sha256PackageBody(manifest);
  if (expectedHash !== manifest.packageHash) return {
    ok: false,
    reasons: [
      "packageHash does not match the finalized manifest"
    ]
  };
  const expectedPackageId = `asset-package:${expectedHash.slice("sha256:".length, "sha256:".length + 24)}`;
  if (expectedPackageId !== manifest.packageId) return {
    ok: false,
    reasons: [
      "packageId does not match the packageHash"
    ]
  };
  return structure;
}

// src/draw2-export-registry.ts
var PNG_EXPORT_MAX_PIXELS = 4096 * 4096;
var PNG_EXPORT_SCALE_PRESETS = Object.freeze([
  1,
  2,
  3,
  4,
  6,
  8,
  12,
  16,
  24,
  32,
  48,
  64,
  96,
  128,
  192,
  256
]);
var EXPORT_FORMATS = Object.freeze([
  {
    id: "png",
    category: "image",
    label: "PNG",
    description: "\u900F\u904E\u3092\u4FDD\u3063\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "jpeg",
    category: "image",
    label: "JPEG",
    description: "\u8EFD\u91CF\u306A\u753B\u50CF",
    extension: "jpg",
    mimeType: "image/jpeg",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webp",
    category: "image",
    label: "WebP",
    description: "\u8EFD\u91CF\u30FB\u900F\u904E\u5BFE\u5FDC\u306E\u753B\u50CF",
    extension: "webp",
    mimeType: "image/webp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "avif",
    category: "image",
    label: "AVIF",
    description: "\u30D6\u30E9\u30A6\u30B6\u5BFE\u5FDC\u6642\u306E\u9AD8\u5727\u7E2E\u753B\u50CF",
    extension: "avif",
    mimeType: "image/avif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "bmp",
    category: "image",
    label: "BMP",
    description: "\u4E92\u63DB\u6027\u91CD\u8996\u306E\u30D3\u30C3\u30C8\u30DE\u30C3\u30D7",
    extension: "bmp",
    mimeType: "image/bmp",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "tiff",
    category: "image",
    label: "TIFF",
    description: "\u5370\u5237\u30FB\u4FDD\u5B58\u5411\u3051\u306E\u9AD8\u54C1\u8CEA\u753B\u50CF",
    extension: "tiff",
    mimeType: "image/tiff",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "gif",
    category: "animation",
    label: "GIF",
    description: "\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u753B\u50CF",
    extension: "gif",
    mimeType: "image/gif",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "apng",
    category: "animation",
    label: "APNG",
    description: "\u900F\u904E\u5BFE\u5FDC\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3",
    extension: "apng",
    mimeType: "image/apng",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "webm",
    category: "animation",
    label: "WebM Draw + Audio",
    description: "Draw\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3\u3068\u9078\u629E\u3057\u305FAudio\u3092\u4E00\u4F53\u5316\u3057\u305F\u52D5\u753B",
    extension: "webm",
    mimeType: "video/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "wav",
    category: "audio",
    label: "WAV Mix",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u542B\u3080\u975E\u5727\u7E2E\u30DF\u30C3\u30AF\u30B9",
    extension: "wav",
    mimeType: "audio/wav",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-webm",
    category: "audio",
    label: "WebM Audio (Opus)",
    description: "\u9078\u629E\u3057\u305FBGM\u30FBSE\u30FB\u697D\u5668\u3092\u8EFD\u91CF\u306AOpus\u97F3\u58F0\u3067\u4FDD\u5B58",
    extension: "webm",
    mimeType: "audio/webm",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "audio-ogg",
    category: "audio",
    label: "Ogg Audio (Opus)",
    description: "\u5BFE\u5FDC\u30D6\u30E9\u30A6\u30B6\u3067\u9078\u629E\u3057\u305FAudio\u3092Ogg/Opus\u3067\u4FDD\u5B58",
    extension: "ogg",
    mimeType: "audio/ogg",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "svg",
    category: "image",
    label: "SVG",
    description: "\u30D9\u30AF\u30BF\u30FC\u753B\u50CF",
    extension: "svg",
    mimeType: "image/svg+xml",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "sprite-sheet",
    category: "animation",
    label: "Sprite Sheet",
    description: "\u5168\u30D5\u30EC\u30FC\u30E0\u3092\u4E26\u3079\u305F\u753B\u50CF",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "atlas-json",
    category: "animation",
    label: "Atlas metadata",
    description: "Sprite Sheet\u306E\u5EA7\u6A19\u30E1\u30BF\u30C7\u30FC\u30BF",
    extension: "json",
    mimeType: "application/json",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "tileset",
    category: "tiles",
    label: "Tileset",
    description: "\u30BF\u30A4\u30EB\u7D20\u6750\u3068\u914D\u7F6E\u60C5\u5831",
    extension: "png",
    mimeType: "image/png",
    visible: true,
    supported: true,
    supportsScale: true
  },
  {
    id: "pxd",
    category: "project",
    label: "PXD Project",
    description: "Draw / Audio / Game\u3092\u542B\u3080\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8",
    extension: "pxd",
    mimeType: "application/vnd.pixieed.pxd",
    visible: true,
    supported: true,
    supportsScale: false
  },
  {
    id: "glb",
    category: "game",
    label: "GLB",
    description: "3D\u30B2\u30FC\u30E0\u7D20\u6750\uFF08\u5C06\u6765\u5BFE\u5FDC\uFF09",
    extension: "glb",
    mimeType: "model/gltf-binary",
    visible: false,
    supported: false,
    supportsScale: false
  }
]);
var EXPORT_FORMAT_BY_ID = new Map(EXPORT_FORMATS.map((definition) => [
  definition.id,
  definition
]));

// src/draw2-export.ts
var PXD_FORMAT = "pxd";
var PXD_MAGIC = new Uint8Array([
  80,
  88,
  68,
  0
]);
var PXD_HEADER_BYTES = 9;
var PXD_CREATED_BY = Object.freeze({
  application: "PiXiEED",
  version: "2.0.0-reference"
});
var PXD_PROJECT_SCHEMA_VERSION = 2;
var PXD_PROJECT_ARCHIVE_VERSION = 2;
function assert(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message), {
    code
  });
}
function readUint32(bytes, offset, label) {
  assert(offset >= 0 && offset + 4 <= bytes.length, "PXD_TRUNCATED", `${label} is truncated.`);
  return (bytes[offset] ?? 0) * 16777216 + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}
async function sha256BytesHex2(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertNoEmbeddedAssetPayload(value, path, allowRasterSnapshots = false) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedAssetPayload(entry, `${path}[${index}]`, allowRasterSnapshots));
    return;
  }
  if (!isRecord2(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (allowRasterSnapshots && key === "rasterSnapshot") {
      continue;
    }
    assert(![
      "pixels",
      "pixelData",
      "raster",
      "blob",
      "dataUrl",
      "rgba",
      "indexedBytes",
      "payload"
    ].includes(key), "PXD_ASSET_DEFINITION_EMBEDDED_DATA", `${path}.${key} must not contain embedded asset data.`);
    assertNoEmbeddedAssetPayload(entry, `${path}.${key}`, allowRasterSnapshots);
  }
}
function assertAssetDefinitionShape(value, path) {
  assert(isRecord2(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  const definition = value;
  assert(definition.schemaVersion === 1, "PXD_ASSET_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(definition.persistence === "LOCAL_DRAFT" || definition.persistence === "VALIDATED_DEFINITION", "PXD_ASSET_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT or VALIDATED_DEFINITION.`);
  const candidate = {
    ...definition,
    persistence: "LOCAL_DRAFT"
  };
  const validation = validateAssetDefinitionDraft(candidate);
  assert(validation.ok, "PXD_ASSET_DEFINITION_INVALID", `${path} failed Asset Definition validation.`);
  const normalized = {
    ...validation.value,
    persistence: definition.persistence
  };
  assert(canonicalJson2(normalized) === canonicalJson2(definition), "PXD_ASSET_DEFINITION_NOT_NORMALIZED", `${path} is not normalized.`);
}
function validateAssetDefinitionEntry(value, index) {
  const path = `assetDefinitions[${index}]`;
  assert(isRecord2(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path, true);
  assert(typeof value.definitionId === "string" && value.definitionId.trim() === value.definitionId && value.definitionId.length > 0, "PXD_ASSET_DEFINITION_ID_INVALID", `${path}.definitionId is invalid.`);
  assertAssetDefinitionShape(value.definition, `${path}.definition`);
  if (value.registryIdentity !== void 0) {
    assert(isRecord2(value.registryIdentity), "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity is invalid.`);
    assert(typeof value.registryIdentity.assetId === "string" && value.registryIdentity.assetId.trim() === value.registryIdentity.assetId && value.registryIdentity.assetId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.assetId is invalid.`);
    assert(typeof value.registryIdentity.revisionId === "string" && value.registryIdentity.revisionId.trim() === value.registryIdentity.revisionId && value.registryIdentity.revisionId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.revisionId is invalid.`);
  }
  return value;
}
var PXD_PRODUCT_MODULES = [
  "DRAW",
  "AUDIO",
  "GAME"
];
var PXD_PRODUCT_KINDS = [
  "GAME_PROJECT",
  "DRAW_IMAGE",
  "DRAW_ANIMATION",
  "DRAW_CHARACTER_ANIMATION",
  "AUDIO_ASSET",
  "PROJECT"
];
var PXD_PRODUCT_RIGHTS = [
  "PERSONAL_USE",
  "COMMERCIAL_USE",
  "DERIVATIVE",
  "EMBEDDING",
  "RESALE"
];
function normalizePxdProductReferences(value, path) {
  assert(Array.isArray(value), "PXD_PRODUCT_REFERENCE_INVALID", `${path} must be an array.`);
  const normalized = value.map((entry, index) => {
    assert(typeof entry === "string" && entry.trim() === entry && entry.length > 0, "PXD_PRODUCT_REFERENCE_INVALID", `${path}[${index}] is invalid.`);
    return entry;
  });
  assert(new Set(normalized).size === normalized.length, "PXD_PRODUCT_REFERENCE_DUPLICATE", `${path} contains a duplicate reference.`);
  return normalized.sort(compareStrings);
}
function normalizePxdProductDefinition(value, index, assetDefinitionIds, audioRevisionIds, availableModules) {
  const path = `productDefinitions[${index}]`;
  assert(isRecord2(value), "PXD_PRODUCT_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path);
  const allowedKeys = /* @__PURE__ */ new Set([
    "schemaVersion",
    "persistence",
    "productId",
    "kind",
    "name",
    "description",
    "includedModules",
    "assetDefinitionIds",
    "audioRevisionIds",
    "rights",
    "edition"
  ]);
  assert(Object.keys(value).every((key) => allowedKeys.has(key)), "PXD_PRODUCT_DEFINITION_FIELD_INVALID", `${path} contains an unsupported field.`);
  assert(value.schemaVersion === 1, "PXD_PRODUCT_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(value.persistence === "LOCAL_DRAFT", "PXD_PRODUCT_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT.`);
  assert(typeof value.productId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.productId), "PXD_PRODUCT_ID_INVALID", `${path}.productId is invalid.`);
  assert(typeof value.kind === "string" && PXD_PRODUCT_KINDS.includes(value.kind), "PXD_PRODUCT_KIND_INVALID", `${path}.kind is invalid.`);
  assert(typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 128, "PXD_PRODUCT_NAME_INVALID", `${path}.name is invalid.`);
  assert(typeof value.description === "string" && value.description.trim() === value.description && value.description.length <= 4096, "PXD_PRODUCT_DESCRIPTION_INVALID", `${path}.description is invalid.`);
  const includedModules = normalizePxdProductReferences(value.includedModules, `${path}.includedModules`);
  assert(includedModules.every((module) => PXD_PRODUCT_MODULES.includes(module)), "PXD_PRODUCT_MODULE_INVALID", `${path}.includedModules contains an unsupported module.`);
  assert(includedModules.length > 0, "PXD_PRODUCT_MODULE_REQUIRED", `${path}.includedModules must not be empty.`);
  const assetIds = normalizePxdProductReferences(value.assetDefinitionIds, `${path}.assetDefinitionIds`);
  const audioIds = normalizePxdProductReferences(value.audioRevisionIds, `${path}.audioRevisionIds`);
  for (const assetId of assetIds) assert(assetDefinitionIds.has(assetId), "PXD_PRODUCT_ASSET_REFERENCE_MISSING", `${path} references missing Asset Definition ${assetId}.`);
  for (const audioId of audioIds) assert(audioRevisionIds.has(audioId), "PXD_PRODUCT_AUDIO_REFERENCE_MISSING", `${path} references missing Audio revision ${audioId}.`);
  assert(assetIds.length === 0 || includedModules.includes("DRAW"), "PXD_PRODUCT_DRAW_MODULE_REQUIRED", `${path} uses Draw Asset Definitions without including DRAW.`);
  assert(audioIds.length === 0 || includedModules.includes("AUDIO"), "PXD_PRODUCT_AUDIO_MODULE_REQUIRED", `${path} uses Audio revisions without including AUDIO.`);
  if (value.kind === "GAME_PROJECT") assert(includedModules.includes("GAME"), "PXD_PRODUCT_GAME_MODULE_REQUIRED", `${path} GAME_PROJECT must include GAME.`);
  if ([
    "DRAW_IMAGE",
    "DRAW_ANIMATION",
    "DRAW_CHARACTER_ANIMATION"
  ].includes(value.kind)) {
    assert(includedModules.includes("DRAW") && assetIds.length > 0, "PXD_PRODUCT_DRAW_SOURCE_REQUIRED", `${path} Draw products require DRAW and at least one Asset Definition.`);
  }
  if (value.kind === "AUDIO_ASSET") {
    assert(includedModules.includes("AUDIO") && audioIds.length > 0, "PXD_PRODUCT_AUDIO_SOURCE_REQUIRED", `${path} AUDIO_ASSET products require AUDIO and at least one Audio revision.`);
  }
  const rights = normalizePxdProductReferences(value.rights, `${path}.rights`);
  assert(rights.every((right) => PXD_PRODUCT_RIGHTS.includes(right)), "PXD_PRODUCT_RIGHT_INVALID", `${path}.rights contains an unsupported right.`);
  assert(rights.length > 0, "PXD_PRODUCT_RIGHT_REQUIRED", `${path}.rights must not be empty.`);
  assert(isRecord2(value.edition), "PXD_PRODUCT_EDITION_INVALID", `${path}.edition is invalid.`);
  const editionValue = value.edition;
  let edition;
  if (editionValue.kind === "UNLIMITED") {
    assert(Object.keys(editionValue).length === 1, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition contains an unsupported field.`);
    edition = {
      kind: "UNLIMITED"
    };
  } else {
    assert(editionValue.kind === "LIMITED" && Object.keys(editionValue).length === 2, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition kind is invalid.`);
    const maxUnits = editionValue.maxUnits;
    assert(typeof maxUnits === "number" && Number.isSafeInteger(maxUnits) && maxUnits > 0, "PXD_PRODUCT_EDITION_LIMIT_INVALID", `${path}.edition.maxUnits must be a positive safe integer.`);
    edition = {
      kind: "LIMITED",
      maxUnits
    };
  }
  for (const module of includedModules) assert(availableModules.has(module), "PXD_PRODUCT_MODULE_MISSING", `${path} requires unavailable module ${module}.`);
  return {
    schemaVersion: 1,
    persistence: "LOCAL_DRAFT",
    productId: value.productId,
    kind: value.kind,
    name: value.name,
    description: value.description,
    includedModules,
    assetDefinitionIds: assetIds,
    audioRevisionIds: audioIds,
    rights,
    edition
  };
}
function normalizePxdProductDefinitions(entries, assetDefinitions, audioRevisionIds, availableModules) {
  const assetDefinitionIds = new Set(assetDefinitions.map((entry) => entry.definitionId));
  const audioIds = new Set(audioRevisionIds);
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => normalizePxdProductDefinition(entry, index, assetDefinitionIds, audioIds, availableModules));
  normalized.sort((left, right) => compareStrings(left.productId, right.productId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.productId !== normalized[index]?.productId, "PXD_PRODUCT_DEFINITION_DUPLICATE", `Product Definition ${normalized[index]?.productId ?? ""} is duplicated.`);
  }
  return normalized;
}
function normalizePxdAssetPackages(entries) {
  const normalized = [
    ...entries ?? []
  ].map((entry, index) => {
    const checked = validateAssetPackageManifest(entry);
    if (!checked.ok) {
      assert(false, "PXD_ASSET_PACKAGE_INVALID", `assetPackages[${index}] is invalid: ${checked.reasons.join("; ")}`);
    }
    return entry;
  });
  normalized.sort((left, right) => compareStrings(left.packageId, right.packageId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.packageId !== normalized[index]?.packageId, "PXD_ASSET_PACKAGE_DUPLICATE", `Asset Package ${normalized[index]?.packageId ?? ""} is duplicated.`);
  }
  return normalized;
}
function validateProjectMetadata(value) {
  assert(value !== null && typeof value === "object", "PXD_PROJECT_INVALID", "PXD project metadata is invalid.");
  const project = value;
  assert(typeof project.name === "string", "PXD_PROJECT_INVALID", "PXD project name is invalid.");
  assert(Number.isSafeInteger(project.structureEpoch) && project.structureEpoch >= 1, "PXD_PROJECT_INVALID", "PXD structure epoch is invalid.");
  assert(Array.isArray(project.layers) && Array.isArray(project.frames) && Array.isArray(project.cels), "PXD_PROJECT_INVALID", "PXD timeline collections are invalid.");
  assert(project.timeline !== null && typeof project.timeline === "object", "PXD_PROJECT_INVALID", "PXD timeline metadata is invalid.");
  return project;
}
function buildImportedAsset(entry, bytes) {
  assert(bytes.byteLength === entry.bytes && bytes.byteLength === entry.width * entry.height, "PXD_ASSET_SIZE_MISMATCH", `PXD asset ${entry.assetId} byte size does not match its dimensions.`);
  const raster = IndexedTileRaster.empty(entry.width, entry.height, entry.tileSize);
  for (let index = 0; index < bytes.length; index += 1) {
    const colorIndex = bytes[index] ?? 0;
    assert(colorIndex < entry.palette.length, "PXD_PIXEL_INDEX_INVALID", `PXD asset ${entry.assetId} contains an out-of-range palette index.`);
    if (colorIndex === 0) continue;
    const x = index % entry.width;
    const y = Math.floor(index / entry.width);
    raster.setPixel(entry.assetId, x, y, colorIndex);
  }
  return {
    id: entry.assetId,
    width: entry.width,
    height: entry.height,
    palette: [
      ...entry.palette
    ],
    raster,
    revision: entry.revision
  };
}
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function projectPayloadPathIsSafe(path) {
  return path.length > 0 && path.length <= 512 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") && !/[\u0000\u0009\u000a\u000d]/u.test(path);
}
function validateProjectPayloadEntry(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ENTRY_INVALID", `${path} is invalid.`);
  const entry = value;
  assert(projectPayloadPathIsSafe(entry.path), "PXD_PATH_UNSAFE", `${path}.path is unsafe.`);
  assert(typeof entry.mediaType === "string" && entry.mediaType.length > 0, "PXD_MEDIA_TYPE_INVALID", `${path}.mediaType is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(entry.sha256), "PXD_ENTRY_HASH_INVALID", `${path}.sha256 is invalid.`);
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "PXD_ENTRY_SIZE_INVALID", `${path}.bytes is invalid.`);
  assert(Number.isSafeInteger(entry.offset) && entry.offset >= 0, "PXD_OFFSET_INVALID", `${path}.offset is invalid.`);
  return entry;
}
function validateProjectModuleManifest(value, path) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MODULE_INVALID", `${path} is invalid.`);
  const module = value;
  assert(module.schemaVersion === null || typeof module.schemaVersion === "string" && module.schemaVersion.length > 0, "PXD_MODULE_SCHEMA_INVALID", `${path}.schemaVersion is invalid.`);
  assert(module.status === "EMPTY" || module.status === "EMBEDDED", "PXD_MODULE_STATUS_INVALID", `${path}.status is invalid.`);
  assert(module.state === null || typeof module.state === "object", "PXD_MODULE_STATE_INVALID", `${path}.state is invalid.`);
  const state = module.state === null ? null : validateProjectPayloadEntry(module.state, `${path}.state`);
  assert(Array.isArray(module.assets), "PXD_MODULE_ASSETS_INVALID", `${path}.assets is invalid.`);
  const assets = module.assets.map((asset, index) => {
    const entry = validateProjectPayloadEntry(asset, `${path}.assets[${index}]`);
    const candidate = asset;
    assert(typeof candidate.revisionId === "string" && candidate.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `${path}.assets[${index}].revisionId is invalid.`);
    return {
      ...entry,
      revisionId: candidate.revisionId
    };
  });
  if (module.status === "EMPTY") {
    assert(module.schemaVersion === null && state === null && assets.length === 0, "PXD_MODULE_EMPTY_INVALID", `${path} empty module must not contain state or assets.`);
  } else {
    assert(module.schemaVersion !== null && state !== null, "PXD_MODULE_STATE_MISSING", `${path} embedded module state is missing.`);
  }
  return {
    schemaVersion: module.schemaVersion,
    status: module.status,
    state,
    assets
  };
}
function validateProjectManifestAsset(value, index) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ASSET_INVALID", `modules.draw.assets[${index}] is invalid.`);
  const asset = value;
  assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `modules.draw.assets[${index}] identity is invalid.`);
  assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `modules.draw.assets[${index}] media type is unsupported.`);
  assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `modules.draw.assets[${index}].path is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `modules.draw.assets[${index}].sha256 is invalid.`);
  assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `modules.draw.assets[${index}].bytes is invalid.`);
  assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `modules.draw.assets[${index}] dimensions are invalid.`);
  assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `modules.draw.assets[${index}].tileSize is invalid.`);
  assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `modules.draw.assets[${index}].palette is invalid.`);
  assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `modules.draw.assets[${index}].revision is invalid.`);
  assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `modules.draw.assets[${index}].offset is invalid.`);
  return asset;
}
function validateProjectManifest(value) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MANIFEST_INVALID", "PXD v2 manifest must be an object.");
  const manifest = value;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_PROJECT_SCHEMA_VERSION && manifest.archiveVersion === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0 && typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD project identity is invalid.");
  assert(Array.isArray(manifest.entries), "PXD_ENTRIES_INVALID", "PXD entries are invalid.");
  const entries = manifest.entries.map((entry, index) => validateProjectPayloadEntry(entry, `entries[${index}]`));
  for (let index = 1; index < entries.length; index += 1) {
    assert(entries[index - 1].path < entries[index].path, "PXD_ENTRY_ORDER_INVALID", "PXD entries must be in canonical path order.");
  }
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD project dependencies must be empty.");
  validateProjectMetadata(manifest.project);
  if (manifest.drawTimelineMetadata !== void 0) {
    const normalized = normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, manifest.project.frames.length);
    assert(canonicalJson2(normalized) === canonicalJson2(manifest.drawTimelineMetadata), "PXD_TIMELINE_METADATA_NOT_NORMALIZED", "PXD Draw timeline metadata must be canonically normalized.");
  }
  assert(manifest.modules !== null && typeof manifest.modules === "object", "PXD_MODULES_INVALID", "PXD modules are missing.");
  const draw = manifest.modules.draw;
  assert(draw !== null && typeof draw === "object" && draw.schemaVersion === "DRAW2_PROJECT_V1" && draw.status === "EMBEDDED" && draw.state === null && Array.isArray(draw.assets) && draw.assets.length > 0, "PXD_DRAW_MODULE_INVALID", "PXD Draw module is invalid.");
  const drawAssets = draw.assets.map((asset, index) => validateProjectManifestAsset(asset, index));
  const audio = validateProjectModuleManifest(manifest.modules.audio, "modules.audio");
  const game = validateProjectModuleManifest(manifest.modules.game, "modules.game");
  if (manifest.assetDefinitions !== void 0) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
  }
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
  for (let index = 1; index < assetDefinitions.length; index += 1) {
    assert(assetDefinitions[index - 1].definitionId < assetDefinitions[index].definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
  }
  const availableModules = /* @__PURE__ */ new Set([
    "DRAW"
  ]);
  if (audio.status === "EMBEDDED") availableModules.add("AUDIO");
  if (game.status === "EMBEDDED") availableModules.add("GAME");
  if (manifest.productDefinitions !== void 0) {
    assert(Array.isArray(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_INVALID", "PXD productDefinitions must be an array.");
  }
  const productDefinitions = normalizePxdProductDefinitions(manifest.productDefinitions, assetDefinitions, audio.assets.map((asset) => asset.revisionId), availableModules);
  if (manifest.productDefinitions !== void 0) {
    assert(canonicalJson2(productDefinitions) === canonicalJson2(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_NOT_NORMALIZED", "PXD productDefinitions must be canonically normalized.");
  }
  if (manifest.assetPackages !== void 0) {
    assert(Array.isArray(manifest.assetPackages), "PXD_ASSET_PACKAGE_INVALID", "PXD assetPackages must be an array.");
  }
  const assetPackages = normalizePxdAssetPackages(manifest.assetPackages);
  if (manifest.assetPackages !== void 0) {
    assert(canonicalJson2(assetPackages) === canonicalJson2(manifest.assetPackages), "PXD_ASSET_PACKAGE_NOT_NORMALIZED", "PXD assetPackages must be canonically normalized.");
  }
  const entryPaths = new Set(entries.map((entry) => entry.path));
  for (const asset of drawAssets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD Draw entry ${asset.path} is missing.`);
  for (const module of [
    audio,
    game
  ]) {
    if (module.state !== null) assert(entryPaths.has(module.state.path), "PXD_ENTRY_MISSING", `PXD module entry ${module.state.path} is missing.`);
    for (const asset of module.assets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD module entry ${asset.path} is missing.`);
  }
  return {
    ...manifest,
    modules: {
      draw: {
        ...draw,
        assets: drawAssets
      },
      audio,
      game
    },
    entries,
    ...manifest.assetPackages === void 0 ? {} : {
      assetPackages
    }
  };
}
function parseProjectJsonPayload(entry, payloads) {
  const bytes = payloads.get(entry.path);
  assert(bytes !== void 0, "PXD_ENTRY_MISSING", `PXD entry ${entry.path} is missing.`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error(`PXD module JSON ${entry.path} is invalid.`), {
      code: "PXD_MODULE_JSON_INVALID"
    });
    throw cause;
  }
}
async function importPxdProject(bytes, options = {}) {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD project header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD project manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD project manifest is truncated.");
  let manifest;
  try {
    manifest = validateProjectManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD project manifest JSON is invalid."), {
      code: "PXD_MANIFEST_JSON_INVALID"
    });
    throw cause;
  }
  const manifestBase = {
    ...manifest
  };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex2(new TextEncoder().encode(canonicalJson2(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD project manifest hash does not match its contents.");
  for (const [index, packageManifest] of (manifest.assetPackages ?? []).entries()) {
    const verified = await verifyAssetPackageManifest(packageManifest);
    if (!verified.ok) {
      assert(false, "PXD_ASSET_PACKAGE_HASH_INVALID", `assetPackages[${index}] could not be verified: ${verified.reasons.join("; ")}`);
    }
  }
  const packageHash = await sha256BytesHex2(bytes);
  if (options.expectedPackageHash !== void 0) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const payloads = /* @__PURE__ */ new Map();
  let expectedOffset = 0;
  for (const entry of manifest.entries) {
    assert(entry.offset === expectedOffset, "PXD_ENTRY_OFFSET_INVALID", `PXD entry ${entry.path} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD entry ${entry.path} is truncated.`);
    const entryBytes = bytes.slice(start, end);
    assert(await sha256BytesHex2(entryBytes) === entry.sha256, "PXD_ENTRY_HASH_MISMATCH", `PXD entry ${entry.path} hash does not match its contents.`);
    payloads.set(entry.path, entryBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD project contains unexpected trailing bytes.");
  const assets = {};
  for (const entry of manifest.modules.draw.assets) {
    const rasterBytes = payloads.get(entry.path);
    assert(rasterBytes !== void 0, "PXD_ENTRY_MISSING", `PXD Draw entry ${entry.path} is missing.`);
    assert(await sha256BytesHex2(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === void 0, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
  }
  const primary = manifest.modules.draw.assets[0];
  assert(primary !== void 0, "PXD_ASSETS_EMPTY", "PXD project has no Draw asset.");
  const project = manifest.project;
  const created = createProject({
    projectId: manifest.projectId,
    name: project.name,
    width: primary.width,
    height: primary.height,
    tileSize: primary.tileSize,
    palette: primary.palette
  });
  const state = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({
      ...layer
    })),
    frames: project.frames.map((frame) => ({
      ...frame
    })),
    cels: project.cels.map((cel) => ({
      ...cel
    })),
    timeline: {
      ...project.timeline,
      frameOrder: [
        ...project.timeline.frameOrder
      ],
      layerTrackOrder: [
        ...project.timeline.layerTrackOrder
      ]
    },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {}
  };
  assert(state.assets[state.activeAssetId] !== void 0, "PXD_ACTIVE_ASSET_MISSING", "PXD active Draw asset is missing.");
  const audio = manifest.modules.audio.status === "EMPTY" || manifest.modules.audio.state === null ? null : {
    schemaVersion: manifest.modules.audio.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.audio.state, payloads),
    assets: manifest.modules.audio.assets.map((asset) => ({
      revisionId: asset.revisionId,
      mediaType: asset.mediaType,
      bytes: payloads.get(asset.path)
    }))
  };
  const game = manifest.modules.game.status === "EMPTY" || manifest.modules.game.state === null ? null : {
    schemaVersion: manifest.modules.game.schemaVersion,
    record: parseProjectJsonPayload(manifest.modules.game.state, payloads)
  };
  const assetDefinitions = manifest.assetDefinitions === void 0 ? [] : manifest.assetDefinitions;
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    manifest,
    assetDefinitions,
    drawTimelineMetadata: manifest.drawTimelineMetadata === void 0 ? normalizeDraw2TimelineMetadata(void 0, state.frames.length) : normalizeDraw2TimelineMetadata(manifest.drawTimelineMetadata, state.frames.length),
    productDefinitions: manifest.productDefinitions === void 0 ? [] : manifest.productDefinitions,
    assetPackages: manifest.assetPackages === void 0 ? [] : manifest.assetPackages,
    audio,
    game
  };
}

// src/game/game-300/core.ts
var GAME_PROJECT_SCHEMA_VERSION = 1;
var BEHAVIOR_IR_VERSION = 1;
var GAME_RUNTIME_PROFILE_SCHEMA_VERSION = 1;
var GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION = 1;
function stableCameraReference(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function isValidGameCamera2DSettings(value) {
  if (!isRecord3(value)) return false;
  const follow = value.follow;
  const shake = value.shake;
  if (!isRecord3(follow) || !isRecord3(shake)) return false;
  return value.schemaVersion === GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION && typeof value.pixelPerfect === "boolean" && Number.isSafeInteger(value.referenceWidth) && Number(value.referenceWidth) >= 1 && Number(value.referenceWidth) <= 8192 && Number.isSafeInteger(value.referenceHeight) && Number(value.referenceHeight) >= 1 && Number(value.referenceHeight) <= 8192 && Number.isSafeInteger(value.pixelsPerUnit) && Number(value.pixelsPerUnit) >= 1 && Number(value.pixelsPerUnit) <= 1024 && typeof follow.enabled === "boolean" && (follow.targetId === void 0 || stableCameraReference(follow.targetId)) && typeof follow.smoothing === "number" && Number.isFinite(follow.smoothing) && follow.smoothing >= 0 && follow.smoothing <= 2 && [
    "deadZoneX",
    "deadZoneY"
  ].every((key) => typeof follow[key] === "number" && Number.isFinite(follow[key]) && follow[key] >= 0 && follow[key] <= 64) && [
    "lookAheadX",
    "lookAheadY"
  ].every((key) => typeof follow[key] === "number" && Number.isFinite(follow[key]) && follow[key] >= -64 && follow[key] <= 64) && typeof shake.onDamage === "boolean" && typeof shake.strength === "number" && Number.isFinite(shake.strength) && shake.strength >= 0 && shake.strength <= 64 && typeof shake.durationMs === "number" && Number.isSafeInteger(shake.durationMs) && shake.durationMs >= 0 && shake.durationMs <= 1e4 && typeof shake.frequency === "number" && Number.isFinite(shake.frequency) && shake.frequency >= 1 && shake.frequency <= 120;
}
var GAME_SCENE_RULES_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "runtimeFamily",
  "gravity",
  "horizontalMove",
  "verticalMove",
  "jump",
  "floorCollision",
  "cameraFollow",
  "mobileControls"
]);
var GAME_EVENT_CARD_KEYS = /* @__PURE__ */ new Set([
  "eventId",
  "label",
  "enabled",
  "who",
  "condition",
  "sourceTrackId",
  "targetTrackId",
  "action",
  "message",
  "amount",
  "audioTrackId",
  "itemId",
  "recipeId",
  "blockTypeId"
]);
function isValidGameSceneRules(value) {
  if (!isRecord3(value)) return false;
  return Object.keys(value).every((key) => GAME_SCENE_RULES_KEYS.has(key)) && value.schemaVersion === GAME_SCENE_RULES_SCHEMA_VERSION && [
    "RPG_GRID",
    "ACTION_PLATFORM",
    "SCROLL_SIDE",
    "DODGE_ARENA",
    "FREE"
  ].includes(String(value.runtimeFamily)) && [
    "NONE",
    "WEAK",
    "STANDARD",
    "STRONG"
  ].includes(String(value.gravity)) && [
    "horizontalMove",
    "verticalMove",
    "jump",
    "floorCollision",
    "cameraFollow",
    "mobileControls"
  ].every((key) => typeof value[key] === "boolean");
}
function isValidGameEventCard(value) {
  if (!isRecord3(value)) return false;
  const validReference = (candidate) => candidate === void 0 || typeof candidate === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate);
  const validText = (candidate, max = 240) => candidate === void 0 || typeof candidate === "string" && candidate.length <= max;
  return Object.keys(value).every((key) => GAME_EVENT_CARD_KEYS.has(key)) && typeof value.eventId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.eventId) && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 128 && typeof value.enabled === "boolean" && [
    "PLAYER",
    "TOUCHED_OBJECT",
    "ANYONE"
  ].includes(String(value.who)) && [
    "START",
    "ENTER_RANGE",
    "TOUCH",
    "TAP",
    "INTERACT",
    "REACH_GOAL",
    "HAS_ITEM"
  ].includes(String(value.condition)) && validReference(value.sourceTrackId) && validReference(value.targetTrackId) && [
    "SHOW_DIALOGUE",
    "DAMAGE",
    "SHAKE_CAMERA",
    "PLAY_AUDIO",
    "COMPLETE_SCENE",
    "SET_VARIABLE",
    "GIVE_ITEM",
    "TAKE_ITEM",
    "CRAFT_ITEM",
    "BREAK_BLOCK",
    "PLACE_BLOCK"
  ].includes(String(value.action)) && validText(value.message) && validReference(value.audioTrackId) && validReference(value.itemId) && validReference(value.recipeId) && validReference(value.blockTypeId) && (value.amount === void 0 || typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0 && value.amount <= 999999);
}
var GAME_SCENE_RULES_SCHEMA_VERSION = 1;
var GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION = 1;
var GAME_TEMPLATE_CATEGORIES = [
  "CORE",
  "RPG",
  "ACTION",
  "SHOOTING",
  "RACING",
  "RHYTHM"
];
var GAME_TEMPLATE_KINDS = [
  "CHARACTER",
  "WEAPON",
  "ARMOR",
  "SKILL",
  "STATUS",
  "TILE",
  "DAMAGE",
  "UI"
];
function asId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must be a stable identifier.`);
  }
  return value;
}
var asEntityId = (value) => asId(value, "EntityId");
var asComponentId = (value) => asId(value, "ComponentId");
var asBehaviorId = (value) => asId(value, "BehaviorId");
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
var GAME_TILEMAP_DOCUMENT_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "mapId",
  "width",
  "height",
  "tileSize",
  "cells"
]);
var GAME_TILEMAP_CELL_KEYS = /* @__PURE__ */ new Set([
  "x",
  "y",
  "collision",
  "triggerId",
  "blockTypeId"
]);
function isValidGameTilemapDocument(value) {
  if (!isRecord3(value)) return false;
  const width = value.width;
  const height = value.height;
  const tileSize = value.tileSize;
  const cells = value.cells;
  if (Object.keys(value).some((key) => !GAME_TILEMAP_DOCUMENT_KEYS.has(key)) || value.schemaVersion !== GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION || typeof value.mapId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.mapId) || !Number.isSafeInteger(width) || typeof width !== "number" || width < 1 || width > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(height) || typeof height !== "number" || height < 1 || height > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(tileSize) || typeof tileSize !== "number" || tileSize < 1 || tileSize > 4096 || !Array.isArray(cells) || cells.length > width * height) {
    return false;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const rawCell of cells) {
    if (!isRecord3(rawCell)) return false;
    const x = rawCell.x;
    const y = rawCell.y;
    const collision = rawCell.collision;
    const triggerId = rawCell.triggerId;
    const blockTypeId = rawCell.blockTypeId;
    if (Object.keys(rawCell).some((key2) => !GAME_TILEMAP_CELL_KEYS.has(key2)) || !Number.isSafeInteger(x) || typeof x !== "number" || x < 0 || x >= width || !Number.isSafeInteger(y) || typeof y !== "number" || y < 0 || y >= height || collision !== "NONE" && collision !== "SOLID" || triggerId !== void 0 && (typeof triggerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(triggerId)) || blockTypeId !== void 0 && (typeof blockTypeId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(blockTypeId)) || // A cell with none of the three is indistinguishable from an absent
    // (air) cell, so the sparse list rejects it to stay canonical.
    collision === "NONE" && triggerId === void 0 && blockTypeId === void 0) {
      return false;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
var GAME_TEMPLATE_INSTANCE_KEYS = /* @__PURE__ */ new Set([
  "instanceId",
  "templateId",
  "category",
  "kind",
  "target",
  "label",
  "values",
  "targetTrackId"
]);
var GAME_TEMPLATE_VALUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
function isValidGameTemplateInstance(value) {
  if (!isRecord3(value)) return false;
  if (Object.keys(value).some((key) => !GAME_TEMPLATE_INSTANCE_KEYS.has(key)) || typeof value.instanceId !== "string" || !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.instanceId) || typeof value.templateId !== "string" || !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.templateId) || !GAME_TEMPLATE_CATEGORIES.includes(value.category) || !GAME_TEMPLATE_KINDS.includes(value.kind) || value.target !== "SCENE_OBJECT" && value.target !== "GAME_DATA" || typeof value.label !== "string" || value.label.trim().length === 0 || !isRecord3(value.values) || value.targetTrackId !== void 0 && (typeof value.targetTrackId !== "string" || !GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.targetTrackId))) return false;
  if (value.target === "SCENE_OBJECT" && value.targetTrackId === void 0) {
    return false;
  }
  const templateValues = value.values;
  if (!isRecord3(templateValues)) return false;
  return Object.keys(templateValues).every((key) => {
    if (!GAME_TEMPLATE_VALUE_KEY_PATTERN.test(key)) return false;
    const templateValue = templateValues[key];
    return typeof templateValue === "string" || typeof templateValue === "boolean" || typeof templateValue === "number" && Number.isFinite(templateValue);
  });
}
var GAME_ANIMATION_BINDING_KEYS = /* @__PURE__ */ new Set([
  "bindingId",
  "trackId",
  "assetDefinitionId",
  "clipKey",
  "motionName",
  "direction",
  "frameIds",
  "fps",
  "loopMode",
  "flipX",
  "flipY",
  "mode",
  "sourceAssetId",
  "sourceRevisionId",
  "sourceContentHash"
]);
function isValidGameAnimationBinding(value) {
  if (!isRecord3(value)) return false;
  const id = (candidate) => typeof candidate === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate);
  const label = (candidate) => typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= 128;
  return Object.keys(value).every((key) => GAME_ANIMATION_BINDING_KEYS.has(key)) && id(value.bindingId) && id(value.trackId) && id(value.assetDefinitionId) && label(value.clipKey) && label(value.motionName) && (value.direction === void 0 || label(value.direction)) && Array.isArray(value.frameIds) && value.frameIds.length > 0 && value.frameIds.length <= 512 && value.frameIds.every((frameId) => id(frameId)) && typeof value.fps === "number" && Number.isFinite(value.fps) && value.fps > 0 && value.fps <= 240 && [
    "LOOP",
    "ONCE",
    "PING_PONG"
  ].includes(String(value.loopMode)) && typeof value.flipX === "boolean" && typeof value.flipY === "boolean" && (value.mode === "LIVE" || value.mode === "PINNED") && (value.sourceAssetId === void 0 || id(value.sourceAssetId)) && (value.sourceRevisionId === void 0 || id(value.sourceRevisionId)) && (value.sourceContentHash === void 0 || typeof value.sourceContentHash === "string" && /^[a-f0-9]{64}$/u.test(value.sourceContentHash));
}
var GAME_ASSET_REVISION_REFERENCE_KEYS = /* @__PURE__ */ new Set([
  "kind",
  "assetId",
  "revisionId",
  "ownerId",
  "contentHash",
  "mode"
]);
function isValidAssetRevisionReference(value) {
  if (!isRecord3(value)) return false;
  const id = (candidate) => typeof candidate === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate);
  return Object.keys(value).every((key) => GAME_ASSET_REVISION_REFERENCE_KEYS.has(key)) && (value.kind === "DRAW" || value.kind === "AUDIO") && id(value.assetId) && id(value.revisionId) && id(value.ownerId) && typeof value.contentHash === "string" && /^[a-f0-9]{64}$/u.test(value.contentHash) && (value.mode === "PINNED" || value.mode === "LIVE");
}
var GAME_TIMELINE_ASSET_BINDING_KEYS = /* @__PURE__ */ new Set([
  "trackId",
  "kind",
  "assetId",
  "revisionId",
  "contentHash",
  "mode",
  "licenseId",
  "rights",
  "sourceKind"
]);
function isValidGameTimelineAssetBinding(value) {
  if (!isRecord3(value)) return false;
  const id = (candidate) => typeof candidate === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(candidate);
  const rightsValid = value.rights === void 0 || Array.isArray(value.rights) && value.rights.length > 0 && value.rights.every((right) => typeof right === "string" && right.trim().length > 0) && new Set(value.rights).size === value.rights.length;
  return Object.keys(value).every((key) => GAME_TIMELINE_ASSET_BINDING_KEYS.has(key)) && typeof value.trackId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.trackId) && (value.kind === "DRAW" || value.kind === "AUDIO") && id(value.assetId) && id(value.revisionId) && typeof value.contentHash === "string" && /^[a-f0-9]{64}$/u.test(value.contentHash) && (value.mode === "PINNED" || value.mode === "LIVE") && (value.licenseId === void 0 || id(value.licenseId)) && rightsValid && (value.sourceKind === void 0 || value.sourceKind === "PROJECT" || value.sourceKind === "MARKET") && (value.sourceKind !== "MARKET" || value.mode === "PINNED" && value.licenseId !== void 0 && Array.isArray(value.rights) && value.rights.length > 0);
}
var GAME_ITEM_DEFINITION_KEYS = /* @__PURE__ */ new Set([
  "itemId",
  "label",
  "icon",
  "stackable",
  "maxStack"
]);
function isValidGameItemDefinition(value) {
  if (!isRecord3(value)) return false;
  return Object.keys(value).every((key) => GAME_ITEM_DEFINITION_KEYS.has(key)) && typeof value.itemId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.itemId) && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 128 && (value.icon === void 0 || isValidAssetRevisionReference(value.icon)) && typeof value.stackable === "boolean" && typeof value.maxStack === "number" && Number.isFinite(value.maxStack) && value.maxStack >= 1 && value.maxStack <= 999999 && (value.stackable || value.maxStack === 1);
}
var GAME_RECIPE_INGREDIENT_KEYS = /* @__PURE__ */ new Set([
  "itemId",
  "amount"
]);
function isValidGameRecipeIngredient(value) {
  if (!isRecord3(value)) return false;
  return Object.keys(value).every((key) => GAME_RECIPE_INGREDIENT_KEYS.has(key)) && typeof value.itemId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.itemId) && typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 1 && value.amount <= 999999;
}
var GAME_RECIPE_DEFINITION_KEYS = /* @__PURE__ */ new Set([
  "recipeId",
  "label",
  "ingredients",
  "result"
]);
function isValidGameRecipeDefinition(value) {
  if (!isRecord3(value)) return false;
  return Object.keys(value).every((key) => GAME_RECIPE_DEFINITION_KEYS.has(key)) && typeof value.recipeId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.recipeId) && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 128 && Array.isArray(value.ingredients) && value.ingredients.length > 0 && value.ingredients.length <= 32 && value.ingredients.every((ingredient) => isValidGameRecipeIngredient(ingredient)) && isValidGameRecipeIngredient(value.result);
}
var GAME_BLOCK_TYPE_DEFINITION_KEYS = /* @__PURE__ */ new Set([
  "blockTypeId",
  "label",
  "icon",
  "breakable",
  "dropItemId",
  "placeable"
]);
function isValidGameBlockTypeDefinition(value) {
  if (!isRecord3(value)) return false;
  return Object.keys(value).every((key) => GAME_BLOCK_TYPE_DEFINITION_KEYS.has(key)) && typeof value.blockTypeId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.blockTypeId) && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 128 && (value.icon === void 0 || isValidAssetRevisionReference(value.icon)) && typeof value.breakable === "boolean" && (value.dropItemId === void 0 || typeof value.dropItemId === "string" && GAME_TEMPLATE_VALUE_KEY_PATTERN.test(value.dropItemId)) && typeof value.placeable === "boolean";
}
function diagnostic4(code, path, message) {
  return {
    code,
    path,
    message,
    recoverable: true
  };
}
function duplicateDiagnostics(values, path) {
  const seen = /* @__PURE__ */ new Set();
  const diagnostics = [];
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push(diagnostic4("DUPLICATE_ID", path, `Duplicate id: ${value}`));
    }
    seen.add(value);
  }
  return diagnostics;
}
function validateCaller(project, caller) {
  const diagnostics = [];
  if (project.projectId !== caller.projectId || project.revision.projectId !== caller.projectId) {
    diagnostics.push(diagnostic4("PROJECT_ID_MISMATCH", "projectId", "Caller project identity does not match the project revision."));
  }
  if (project.ownerId !== caller.ownerId || project.revision.ownerId !== caller.ownerId) {
    diagnostics.push(diagnostic4("CALLER_OWNER_MISMATCH", "ownerId", "Caller owner is not the project/revision owner."));
  }
  if (project.revision.revisionId !== caller.revisionId) {
    diagnostics.push(diagnostic4("CALLER_REVISION_MISMATCH", "revision.revisionId", "Caller revision is not the current project revision."));
  }
  return diagnostics;
}
function validateAssetReference(reference, path, ownerId, diagnostics) {
  if (!isRecord3(reference) || ![
    "DRAW",
    "AUDIO"
  ].includes(String(reference.kind))) {
    diagnostics.push(diagnostic4("INVALID_REFERENCE", path, "Asset reference must declare DRAW or AUDIO."));
    return;
  }
  if (reference.ownerId !== ownerId) {
    diagnostics.push(diagnostic4("INVALID_REFERENCE", `${path}.ownerId`, "Asset owner must match the Game Project owner."));
  }
  for (const key of [
    "assetId",
    "revisionId",
    "ownerId",
    "contentHash",
    "mode"
  ]) {
    if (typeof reference[key] !== "string") {
      diagnostics.push(diagnostic4("INVALID_REFERENCE", `${path}.${key}`, "Asset revision reference field is invalid."));
    }
  }
  if (typeof reference.contentHash === "string" && !/^[a-f0-9]{64}$/u.test(reference.contentHash)) {
    diagnostics.push(diagnostic4("INVALID_REFERENCE", `${path}.contentHash`, "Asset content hash must be lowercase SHA-256."));
  }
}
function validateComponent(component, path, ownerId, knownBehaviorIds, diagnostics) {
  if (!isRecord3(component) || typeof component.type !== "string" || typeof component.componentId !== "string") {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", path, "Component shape or type is unsupported."));
    return;
  }
  if (![
    "TRANSFORM",
    "SPRITE",
    "AUDIO_SOURCE",
    "BEHAVIOR",
    "CAMERA",
    "TILEMAP",
    "COLLIDER",
    "RIGIDBODY",
    "CHARACTER_CONTROLLER"
  ].includes(component.type)) {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", path, `Unknown component type: ${component.type}`));
    return;
  }
  if (typeof component.componentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.componentId`, "Component id is invalid."));
  }
  if (component.type === "TRANSFORM" && ![
    "x",
    "y",
    "rotation",
    "scaleX",
    "scaleY"
  ].every((key) => typeof component[key] === "number" && Number.isFinite(component[key]))) {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", path, "Transform component contains a non-finite value."));
  }
  if (component.type === "SPRITE") {
    validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
  }
  if (component.type === "AUDIO_SOURCE") {
    validateAssetReference(component.asset, `${path}.asset`, ownerId, diagnostics);
    if (!isRecord3(component.asset) || component.asset.kind !== "AUDIO") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.asset`, "Audio Source requires an AUDIO asset revision."));
    }
    if (typeof component.volume !== "number" || !Number.isFinite(component.volume) || component.volume < 0 || component.volume > 1) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.volume`, "Audio volume must be between 0 and 1."));
    }
  }
  if (component.type === "BEHAVIOR" && (typeof component.behaviorId !== "string" || !knownBehaviorIds.has(component.behaviorId))) {
    diagnostics.push(diagnostic4("MISSING_REFERENCE", `${path}.behaviorId`, "Behavior component references an unknown behavior."));
  }
  if (component.type === "CAMERA" && (typeof component.zoom !== "number" || !Number.isFinite(component.zoom) || component.zoom <= 0)) {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.zoom`, "Camera zoom must be a positive finite number."));
  }
  if (component.type === "CAMERA" && component.camera2D !== void 0 && !isValidGameCamera2DSettings(component.camera2D)) {
    diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.camera2D`, "Camera 2D settings are invalid."));
  }
  if (component.type === "TILEMAP") {
    if (typeof component.mapId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.mapId`, "Tilemap map id is invalid."));
    }
    if (typeof component.tileSize !== "number" || !Number.isSafeInteger(component.tileSize) || component.tileSize < 1) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.tileSize`, "Tilemap tile size must be a positive integer."));
    }
    if (typeof component.collisionEnabled !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.collisionEnabled`, "Tilemap collisionEnabled must be boolean."));
    }
    if (component.document !== void 0 && !isValidGameTilemapDocument(component.document)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.document`, "Tilemap document is invalid."));
    }
  }
  if (component.type === "COLLIDER") {
    if (![
      "BOX",
      "CIRCLE",
      "CAPSULE"
    ].includes(component.shape)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.shape`, "Collider shape is unsupported."));
    }
    for (const key of [
      "width",
      "height",
      "radius"
    ]) {
      if (typeof component[key] !== "number" || !Number.isFinite(component[key]) || component[key] <= 0) {
        diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.${key}`, "Collider dimensions must be positive finite numbers."));
      }
    }
    if (typeof component.isTrigger !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.isTrigger`, "Collider isTrigger must be boolean."));
    }
    if (![
      "DEFAULT",
      "WORLD",
      "PLAYER",
      "NPC",
      "SENSOR",
      "PROJECTILE"
    ].includes(component.layer)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.layer`, "Collider layer is unsupported."));
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.enabled`, "Collider enabled must be boolean."));
    }
  }
  if (component.type === "RIGIDBODY") {
    if (![
      "STATIC",
      "DYNAMIC",
      "KINEMATIC"
    ].includes(component.bodyType)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.bodyType`, "Rigidbody body type is unsupported."));
    }
    if (typeof component.mass !== "number" || !Number.isFinite(component.mass) || component.mass <= 0) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.mass`, "Rigidbody mass must be positive."));
    }
    if (typeof component.gravityScale !== "number" || !Number.isFinite(component.gravityScale)) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.gravityScale`, "Rigidbody gravity scale must be finite."));
    }
    if (typeof component.fixedRotation !== "boolean" || typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", path, "Rigidbody flags are invalid."));
    }
  }
  if (component.type === "CHARACTER_CONTROLLER") {
    if (typeof component.moveSpeed !== "number" || !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.moveSpeed`, "Character Controller move speed must be positive."));
    }
    if (typeof component.stepHeight !== "number" || !Number.isFinite(component.stepHeight) || component.stepHeight < 0) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.stepHeight`, "Character Controller step height must be non-negative."));
    }
    if (typeof component.fixedStep !== "number" || !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1) {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.fixedStep`, "Character Controller fixed step must be a positive integer."));
    }
    if (typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_COMPONENT", `${path}.enabled`, "Character Controller enabled must be boolean."));
    }
  }
}
function validateGameComponentState(component, path, diagnostics) {
  if (!isRecord3(component) || typeof component.type !== "string" || typeof component.componentId !== "string") {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor component state is invalid."));
    return;
  }
  if (![
    "TRANSFORM",
    "SPRITE",
    "AUDIO_SOURCE",
    "BEHAVIOR",
    "CAMERA",
    "TILEMAP",
    "COLLIDER",
    "RIGIDBODY",
    "CHARACTER_CONTROLLER",
    "STATUS",
    "SKILL",
    "BRAIN"
  ].includes(component.type)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", `${path}.type`, `Unknown Game editor component state: ${component.type}`));
    return;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.componentId)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", `${path}.componentId`, "Game editor component id is invalid."));
  }
  if (component.type === "TRANSFORM" && ![
    "x",
    "y",
    "rotation",
    "scaleX",
    "scaleY"
  ].every((key) => typeof component[key] === "number" && Number.isFinite(component[key]))) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Transform state contains a non-finite value."));
  }
  if (component.type === "SPRITE" && typeof component.visible !== "boolean") {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Sprite state requires visible."));
  }
  if (component.type === "BEHAVIOR" && typeof component.enabled !== "boolean") {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Behavior state requires enabled."));
  }
  if (component.type === "AUDIO_SOURCE" && (typeof component.loop !== "boolean" || typeof component.volume !== "number" || !Number.isFinite(component.volume) || component.volume < 0 || component.volume > 1)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Audio Source state is invalid."));
  }
  if (component.type === "CAMERA" && (typeof component.active !== "boolean" || typeof component.zoom !== "number" || !Number.isFinite(component.zoom) || component.zoom <= 0)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Camera state is invalid."));
  }
  if (component.type === "CAMERA" && component.camera2D !== void 0 && !isValidGameCamera2DSettings(component.camera2D)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", `${path}.camera2D`, "Game editor Camera 2D settings are invalid."));
  }
  if (component.type === "TILEMAP" && (typeof component.mapId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(component.mapId) || typeof component.tileSize !== "number" || !Number.isSafeInteger(component.tileSize) || component.tileSize < 1 || typeof component.collisionEnabled !== "boolean" || component.document !== void 0 && !isValidGameTilemapDocument(component.document))) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Tilemap state is invalid."));
  }
  if (component.type === "COLLIDER") {
    if (![
      "BOX",
      "CIRCLE",
      "CAPSULE"
    ].includes(component.shape) || [
      "width",
      "height",
      "radius"
    ].some((key) => typeof component[key] !== "number" || !Number.isFinite(component[key]) || component[key] <= 0) || typeof component.isTrigger !== "boolean" || ![
      "DEFAULT",
      "WORLD",
      "PLAYER",
      "NPC",
      "SENSOR",
      "PROJECTILE"
    ].includes(component.layer) || typeof component.enabled !== "boolean") {
      diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Collider state is invalid."));
    }
  }
  if (component.type === "RIGIDBODY" && (![
    "STATIC",
    "DYNAMIC",
    "KINEMATIC"
  ].includes(component.bodyType) || typeof component.mass !== "number" || !Number.isFinite(component.mass) || component.mass <= 0 || typeof component.gravityScale !== "number" || !Number.isFinite(component.gravityScale) || typeof component.fixedRotation !== "boolean" || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Rigidbody state is invalid."));
  }
  if (component.type === "CHARACTER_CONTROLLER" && (typeof component.moveSpeed !== "number" || !Number.isFinite(component.moveSpeed) || component.moveSpeed <= 0 || typeof component.stepHeight !== "number" || !Number.isFinite(component.stepHeight) || component.stepHeight < 0 || typeof component.fixedStep !== "number" || !Number.isSafeInteger(component.fixedStep) || component.fixedStep < 1 || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Character Controller state is invalid."));
  }
  if (component.type === "STATUS" && (![
    "hp",
    "maxHp",
    "stamina",
    "maxStamina",
    "mp",
    "maxMp",
    "attack",
    "defense",
    "level"
  ].every((key) => typeof component[key] === "number" && Number.isFinite(component[key])) || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Status state is invalid."));
  }
  if (component.type === "SKILL" && (![
    "ATTACK",
    "SHOOT",
    "MAGIC",
    "DASH_ATTACK",
    "HEAL",
    "SHIELD"
  ].includes(component.kind) || typeof component.power !== "number" || !Number.isFinite(component.power) || typeof component.cooldown !== "number" || !Number.isFinite(component.cooldown) || component.cooldown < 0 || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Skill state is invalid."));
  }
  if (component.type === "BRAIN" && (![
    "PLAYER_CONTROL",
    "AI",
    "PATROL",
    "PURSUE",
    "AVOID",
    "WAIT"
  ].includes(component.mode) || typeof component.speed !== "number" || !Number.isFinite(component.speed) || component.speed < 0 || typeof component.range !== "number" || !Number.isFinite(component.range) || component.range < 0 || typeof component.enabled !== "boolean")) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", path, "Game editor Brain state is invalid."));
  }
}
function validateDependencyCycles(dependencies, diagnostics) {
  const byId = new Map(dependencies.map((dependency) => [
    String(dependency.dependencyId),
    dependency
  ]));
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (id, path) => {
    if (visiting.has(id)) {
      diagnostics.push(diagnostic4("DEPENDENCY_CYCLE", path, `Dependency cycle includes ${id}.`));
      return;
    }
    if (visited.has(id)) return;
    const dependency = byId.get(id);
    if (!dependency) {
      diagnostics.push(diagnostic4("MISSING_REFERENCE", path, `Dependency ${id} is missing.`));
      return;
    }
    visiting.add(id);
    for (const target of dependency.dependsOn) {
      visit(target, `${path}.dependsOn`);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const dependency of dependencies) {
    visit(dependency.dependencyId, "dependencies");
  }
}
function validateGameProject2(value, caller) {
  const diagnostics = [];
  if (!isRecord3(value)) {
    return {
      valid: false,
      diagnostics: [
        diagnostic4("INVALID_PROJECT", "project", "Game Project must be an object.")
      ]
    };
  }
  if (value.schemaVersion !== GAME_PROJECT_SCHEMA_VERSION) {
    diagnostics.push(diagnostic4("UNKNOWN_SCHEMA", "schemaVersion", "Unsupported Game Project schema version."));
  }
  if (typeof value.projectId !== "string" || typeof value.ownerId !== "string" || typeof value.name !== "string" || !isRecord3(value.revision)) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic4("INVALID_PROJECT", "project", "Required Game Project identity is missing.")
      ]
    };
  }
  const project = value;
  if (caller) diagnostics.push(...validateCaller(project, caller));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.projectId) || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.ownerId)) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", "projectId/ownerId", "Project and owner ids must be stable identifiers."));
  }
  if (!project.name.trim()) {
    diagnostics.push(diagnostic4("INVALID_PROJECT", "name", "Project name is required."));
  }
  if (project.revision.projectId !== project.projectId || project.revision.ownerId !== project.ownerId || !Number.isSafeInteger(project.revision.sequence) || project.revision.sequence < 1) {
    diagnostics.push(diagnostic4("INVALID_REVISION", "revision", "Revision is not bound to the project owner or sequence."));
  }
  if (!Array.isArray(project.scenes) || !Array.isArray(project.prefabs) || !Array.isArray(project.dependencies) || !Array.isArray(project.behaviors)) {
    return {
      valid: false,
      diagnostics: [
        ...diagnostics,
        diagnostic4("INVALID_PROJECT", "project", "Project collections are invalid.")
      ]
    };
  }
  if (project.runtimeProfile !== void 0) {
    if (!isRecord3(project.runtimeProfile) || project.runtimeProfile.schemaVersion !== GAME_RUNTIME_PROFILE_SCHEMA_VERSION || typeof project.runtimeProfile.profileId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(project.runtimeProfile.profileId)) {
      diagnostics.push(diagnostic4("INVALID_RUNTIME_PROFILE", "runtimeProfile", "Runtime profile reference is invalid."));
    }
  }
  diagnostics.push(...duplicateDiagnostics(project.scenes.map((scene) => String(scene.sceneId)), "scenes.sceneId"));
  diagnostics.push(...duplicateDiagnostics(project.prefabs.map((prefab) => String(prefab.prefabId)), "prefabs.prefabId"));
  diagnostics.push(...duplicateDiagnostics(project.dependencies.map((dependency) => String(dependency.dependencyId)), "dependencies.dependencyId"));
  diagnostics.push(...duplicateDiagnostics(project.behaviors.map((behavior2) => String(behavior2.behaviorId)), "behaviors.behaviorId"));
  const behaviorIds = new Set(project.behaviors.map((behavior2) => String(behavior2.behaviorId)));
  const allEntityIds = [];
  const allComponentIds = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) {
    if (!isRecord3(scene) || typeof scene.sceneId !== "string" || !Array.isArray(scene.entities) || !Array.isArray(scene.rootEntityIds)) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", `scenes[${sceneIndex}]`, "Scene shape is invalid."));
      continue;
    }
    const sceneEntityIds = new Set(scene.entities.map((entity) => String(entity.entityId)));
    for (const rootId of scene.rootEntityIds) {
      if (!sceneEntityIds.has(String(rootId))) {
        diagnostics.push(diagnostic4("MISSING_REFERENCE", `scenes[${sceneIndex}].rootEntityIds`, `Root Entity ${String(rootId)} is missing.`));
      }
    }
    diagnostics.push(...duplicateDiagnostics(scene.entities.map((entity) => String(entity.entityId)), `scenes[${sceneIndex}].entities.entityId`));
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (!isRecord3(entity) || typeof entity.entityId !== "string" || !Array.isArray(entity.components)) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", `scenes[${sceneIndex}].entities[${entityIndex}]`, "Entity shape is invalid."));
        continue;
      }
      allEntityIds.push(entity.entityId);
      if (entity.parentEntityId !== void 0 && !sceneEntityIds.has(String(entity.parentEntityId))) {
        diagnostics.push(diagnostic4("MISSING_REFERENCE", `scenes[${sceneIndex}].entities[${entityIndex}].parentEntityId`, "Parent Entity is missing."));
      }
      diagnostics.push(...duplicateDiagnostics(entity.components.map((component) => String(isRecord3(component) ? component.componentId : "<invalid>")), `scenes[${sceneIndex}].entities[${entityIndex}].components.componentId`));
      for (const [componentIndex, component] of entity.components.entries()) {
        if (isRecord3(component) && typeof component.componentId === "string") {
          allComponentIds.push(component.componentId);
        }
        validateComponent(component, `scenes[${sceneIndex}].entities[${entityIndex}].components[${componentIndex}]`, project.ownerId, behaviorIds, diagnostics);
      }
    }
    for (const entity of scene.entities) {
      const seen = /* @__PURE__ */ new Set();
      let parentId = entity.parentEntityId;
      while (parentId !== void 0) {
        if (seen.has(String(parentId)) || parentId === entity.entityId) {
          diagnostics.push(diagnostic4("DEPENDENCY_CYCLE", `scenes[${sceneIndex}].entities`, `Entity parent cycle includes ${String(entity.entityId)}.`));
          break;
        }
        seen.add(String(parentId));
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  diagnostics.push(...duplicateDiagnostics(allEntityIds, "project.entities.entityId"));
  diagnostics.push(...duplicateDiagnostics(allComponentIds, "project.components.componentId"));
  for (const dependency of project.dependencies) {
    if (!isRecord3(dependency) || typeof dependency.dependencyId !== "string" || !Array.isArray(dependency.dependsOn)) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", "dependencies", "Dependency shape is invalid."));
    } else if (dependency.ownerId !== project.ownerId || dependency.ownerRevisionId !== project.revision.revisionId) {
      diagnostics.push(diagnostic4("INVALID_REFERENCE", `dependencies.${dependency.dependencyId}`, "Dependency owner/revision is not the current project revision."));
    }
  }
  validateDependencyCycles(project.dependencies, diagnostics);
  for (const behavior2 of project.behaviors) {
    if (behavior2.version !== BEHAVIOR_IR_VERSION || behavior2.ownership !== "CANONICAL_IR" || !Array.isArray(behavior2.rules)) {
      diagnostics.push(diagnostic4("UNKNOWN_SCHEMA", `behaviors.${String(behavior2.behaviorId)}`, "Behavior IR schema is unsupported."));
    }
  }
  if (project.editorTimeline !== void 0) {
    const timeline = project.editorTimeline;
    if (!Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.frameCount", "Editor timeline frame count must be a positive integer."));
    }
    if (!Array.isArray(timeline.tracks)) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.tracks", "Editor timeline tracks must be an array."));
    } else {
      diagnostics.push(...duplicateDiagnostics(timeline.tracks.map((track) => track.trackId), "editorTimeline.tracks.trackId"));
      for (const [index, track] of timeline.tracks.entries()) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(track.trackId) || track.label.trim().length === 0 || track.kind.trim().length === 0) {
          diagnostics.push(diagnostic4("INVALID_PROJECT", `editorTimeline.tracks[${index}]`, "Editor timeline track identity is invalid."));
        }
        if (!Array.isArray(track.activeFrames) || track.activeFrames.some((frame) => !Number.isSafeInteger(frame) || frame < 0 || frame >= timeline.frameCount)) {
          diagnostics.push(diagnostic4("INVALID_PROJECT", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be in range."));
        } else if (new Set(track.activeFrames).size !== track.activeFrames.length) {
          diagnostics.push(diagnostic4("DUPLICATE_ID", `editorTimeline.tracks[${index}].activeFrames`, "Editor timeline frames must be unique."));
        }
        if (track.role !== void 0 && ![
          "PLAYER",
          "NPC",
          "PROP",
          "TRIGGER",
          "TILEMAP",
          "CAMERA",
          "AUDIO",
          "CUSTOM"
        ].includes(track.role)) {
          diagnostics.push(diagnostic4("INVALID_PROJECT", `editorTimeline.tracks[${index}].role`, "Game object role is unsupported."));
        }
        if (track.components !== void 0) {
          if (!Array.isArray(track.components)) {
            diagnostics.push(diagnostic4("INVALID_PROJECT", `editorTimeline.tracks[${index}].components`, "Game editor components must be an array."));
          } else {
            diagnostics.push(...duplicateDiagnostics(track.components.map((component) => String(component.componentId)), `editorTimeline.tracks[${index}].components.componentId`));
            for (const [componentIndex, component] of track.components.entries()) {
              validateGameComponentState(component, `editorTimeline.tracks[${index}].components[${componentIndex}]`, diagnostics);
            }
          }
        }
        if (track.tilemap !== void 0 && !isValidGameTilemapDocument(track.tilemap)) {
          diagnostics.push(diagnostic4("INVALID_PROJECT", `editorTimeline.tracks[${index}].tilemap`, "Editor tilemap document is invalid."));
        }
      }
    }
    if (timeline.assetBindings !== void 0) {
      const trackIds = new Set(Array.isArray(timeline.tracks) ? timeline.tracks.map((track) => track.trackId) : []);
      if (!Array.isArray(timeline.assetBindings) || timeline.assetBindings.some((binding) => !isValidGameTimelineAssetBinding(binding) || !trackIds.has(binding.trackId))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.assetBindings", "Editor asset binding metadata is invalid or targets a missing track."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.assetBindings.map((binding) => `${binding.trackId}:${binding.kind}`), "editorTimeline.assetBindings"));
      }
    }
    if (timeline.sceneRules !== void 0 && !isValidGameSceneRules(timeline.sceneRules)) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.sceneRules", "Scene-wide Game rules are invalid."));
    }
    if (timeline.creationMode !== void 0 && ![
      "RPG_TEMPLATE",
      "ACTION_2D",
      "DODGE_2D",
      "SCROLL_2D",
      "BLANK"
    ].includes(timeline.creationMode)) {
      diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.creationMode", "Game creation mode is unsupported."));
    }
    if (timeline.eventCards !== void 0) {
      if (!Array.isArray(timeline.eventCards) || timeline.eventCards.some((card) => !isValidGameEventCard(card))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.eventCards", "Game event cards are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.eventCards.map((card) => card.eventId), "editorTimeline.eventCards.eventId"));
        const trackIds = new Set(Array.isArray(timeline.tracks) ? timeline.tracks.map((track) => track.trackId) : []);
        const itemIds = new Set(Array.isArray(timeline.items) ? timeline.items.map((item) => item.itemId) : []);
        const recipeIds = new Set(Array.isArray(timeline.recipes) ? timeline.recipes.map((recipe) => recipe.recipeId) : []);
        const blockTypeIds = new Set(Array.isArray(timeline.blockTypes) ? timeline.blockTypes.map((blockType) => blockType.blockTypeId) : []);
        for (const [index, card] of timeline.eventCards.entries()) {
          for (const [key, trackId] of [
            [
              "sourceTrackId",
              card.sourceTrackId
            ],
            [
              "targetTrackId",
              card.targetTrackId
            ],
            [
              "audioTrackId",
              card.audioTrackId
            ]
          ]) {
            if (trackId !== void 0 && !trackIds.has(trackId)) {
              diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.eventCards[${index}].${key}`, "Game event card track reference is missing."));
            }
          }
          if (card.itemId !== void 0 && !itemIds.has(card.itemId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.eventCards[${index}].itemId`, "Game event card item reference is missing."));
          }
          if (card.recipeId !== void 0 && !recipeIds.has(card.recipeId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.eventCards[${index}].recipeId`, "Game event card recipe reference is missing."));
          }
          if (card.blockTypeId !== void 0 && !blockTypeIds.has(card.blockTypeId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.eventCards[${index}].blockTypeId`, "Game event card block type reference is missing."));
          }
        }
      }
    }
    if (timeline.items !== void 0) {
      if (!Array.isArray(timeline.items) || timeline.items.some((item) => !isValidGameItemDefinition(item))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.items", "Game item definitions are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.items.map((item) => item.itemId), "editorTimeline.items.itemId"));
      }
    }
    if (timeline.recipes !== void 0) {
      if (!Array.isArray(timeline.recipes) || timeline.recipes.some((recipe) => !isValidGameRecipeDefinition(recipe))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.recipes", "Game recipe definitions are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.recipes.map((recipe) => recipe.recipeId), "editorTimeline.recipes.recipeId"));
        const knownItemIds = new Set(Array.isArray(timeline.items) ? timeline.items.map((item) => item.itemId) : []);
        for (const [index, recipe] of timeline.recipes.entries()) {
          const referenced = [
            ...recipe.ingredients.map((ingredient) => ingredient.itemId),
            recipe.result.itemId
          ];
          for (const itemId of referenced) {
            if (!knownItemIds.has(itemId)) {
              diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.recipes[${index}]`, "Game recipe references an unknown item."));
              break;
            }
          }
        }
      }
    }
    if (timeline.blockTypes !== void 0) {
      if (!Array.isArray(timeline.blockTypes) || timeline.blockTypes.some((blockType) => !isValidGameBlockTypeDefinition(blockType))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.blockTypes", "Game block type definitions are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.blockTypes.map((blockType) => blockType.blockTypeId), "editorTimeline.blockTypes.blockTypeId"));
        const knownItemIdsForBlocks = new Set(Array.isArray(timeline.items) ? timeline.items.map((item) => item.itemId) : []);
        for (const [index, blockType] of timeline.blockTypes.entries()) {
          if (blockType.dropItemId !== void 0 && !knownItemIdsForBlocks.has(blockType.dropItemId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.blockTypes[${index}].dropItemId`, "Game block type drop item reference is missing."));
          }
        }
      }
    }
    if (timeline.templateInstances !== void 0) {
      if (!Array.isArray(timeline.templateInstances) || timeline.templateInstances.some((instance) => !isValidGameTemplateInstance(instance))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.templateInstances", "Game template instances are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.templateInstances.map((instance) => instance.instanceId), "editorTimeline.templateInstances.instanceId"));
        const trackIds = new Set(Array.isArray(timeline.tracks) ? timeline.tracks.map((track) => track.trackId) : []);
        for (const [index, instance] of timeline.templateInstances.entries()) {
          if (instance.targetTrackId !== void 0 && !trackIds.has(instance.targetTrackId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.templateInstances[${index}].targetTrackId`, "Game template target track is missing."));
          }
        }
      }
    }
    if (timeline.animationBindings !== void 0) {
      if (!Array.isArray(timeline.animationBindings) || timeline.animationBindings.some((binding) => !isValidGameAnimationBinding(binding))) {
        diagnostics.push(diagnostic4("INVALID_PROJECT", "editorTimeline.animationBindings", "Game animation bindings are invalid."));
      } else {
        diagnostics.push(...duplicateDiagnostics(timeline.animationBindings.map((binding) => binding.bindingId), "editorTimeline.animationBindings.bindingId"));
        const trackIds = new Set(Array.isArray(timeline.tracks) ? timeline.tracks.map((track) => track.trackId) : []);
        const keys = /* @__PURE__ */ new Set();
        for (const [index, binding] of timeline.animationBindings.entries()) {
          if (!trackIds.has(binding.trackId)) {
            diagnostics.push(diagnostic4("MISSING_REFERENCE", `editorTimeline.animationBindings[${index}].trackId`, "Game animation target track is missing."));
          }
          const key = `${binding.trackId}\0${binding.assetDefinitionId}\0${binding.clipKey}`;
          if (keys.has(key)) {
            diagnostics.push(diagnostic4("DUPLICATE_ID", `editorTimeline.animationBindings[${index}]`, "A Game animation clip can only be assigned once per object."));
          }
          keys.add(key);
        }
      }
    }
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function sortById(items, key) {
  return [
    ...items
  ].sort((left, right) => String(left[key]).localeCompare(String(right[key]), "en", {
    numeric: false
  }));
}
function normalizeBehavior(behaviorId, rules) {
  return {
    behaviorId,
    version: BEHAVIOR_IR_VERSION,
    ownership: "CANONICAL_IR",
    rules: sortById(rules.map((rule) => ({
      ...rule,
      conditions: [
        ...rule.conditions
      ],
      actions: [
        ...rule.actions
      ]
    })), "ruleId")
  };
}
function compileNoCodeBehavior(source) {
  return normalizeBehavior(source.behaviorId, source.rules);
}

// src/game/game-350/camera-2d.ts
var DEFAULT_CAMERA_2D_SETTINGS = Object.freeze({
  schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
  pixelPerfect: true,
  referenceWidth: 160,
  referenceHeight: 96,
  pixelsPerUnit: 16,
  follow: Object.freeze({
    enabled: true,
    targetId: "hero",
    smoothing: 0.12,
    deadZoneX: 1,
    deadZoneY: 0.75,
    lookAheadX: 0.5,
    lookAheadY: 0
  }),
  shake: Object.freeze({
    onDamage: true,
    strength: 0.5,
    durationMs: 160,
    frequency: 18
  })
});
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function bounded(value, minimum, maximum, fallback) {
  return finite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function integerBounded(value, minimum, maximum, fallback) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum ? Number(value) : fallback;
}
function record2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function stableId3(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function normalizeCamera2DSettings(value, fallback = DEFAULT_CAMERA_2D_SETTINGS) {
  if (isValidGameCamera2DSettings(value)) {
    return {
      ...value,
      follow: {
        ...value.follow
      },
      shake: {
        ...value.shake
      }
    };
  }
  const source = record2(value);
  const sourceFollow = record2(source?.follow);
  const sourceShake = record2(source?.shake);
  const fallbackFollow = fallback.follow;
  const fallbackShake = fallback.shake;
  return {
    schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
    pixelPerfect: typeof source?.pixelPerfect === "boolean" ? source.pixelPerfect : fallback.pixelPerfect,
    referenceWidth: integerBounded(source?.referenceWidth, 1, 8192, fallback.referenceWidth),
    referenceHeight: integerBounded(source?.referenceHeight, 1, 8192, fallback.referenceHeight),
    pixelsPerUnit: integerBounded(source?.pixelsPerUnit, 1, 1024, fallback.pixelsPerUnit),
    follow: {
      enabled: typeof sourceFollow?.enabled === "boolean" ? sourceFollow.enabled : fallbackFollow.enabled,
      ...stableId3(sourceFollow?.targetId) ? {
        targetId: sourceFollow.targetId
      } : fallbackFollow.targetId === void 0 ? {} : {
        targetId: fallbackFollow.targetId
      },
      smoothing: bounded(sourceFollow?.smoothing, 0, 2, fallbackFollow.smoothing),
      deadZoneX: bounded(sourceFollow?.deadZoneX, 0, 64, fallbackFollow.deadZoneX),
      deadZoneY: bounded(sourceFollow?.deadZoneY, 0, 64, fallbackFollow.deadZoneY),
      lookAheadX: bounded(sourceFollow?.lookAheadX, -64, 64, fallbackFollow.lookAheadX),
      lookAheadY: bounded(sourceFollow?.lookAheadY, -64, 64, fallbackFollow.lookAheadY)
    },
    shake: {
      onDamage: typeof sourceShake?.onDamage === "boolean" ? sourceShake.onDamage : fallbackShake.onDamage,
      strength: bounded(sourceShake?.strength, 0, 64, fallbackShake.strength),
      durationMs: integerBounded(sourceShake?.durationMs, 0, 1e4, fallbackShake.durationMs),
      frequency: bounded(sourceShake?.frequency, 1, 120, fallbackShake.frequency)
    }
  };
}

// src/game/game-350/authoring-model.ts
var GAME_SCENE_RULE_PRESETS = Object.freeze({
  NONE: 0,
  WEAK: 4.9,
  STANDARD: 9.8,
  STRONG: 19.6
});
var GAME_SCENE_RULE_LABELS = Object.freeze({
  NONE: "\u306A\u3057",
  WEAK: "\u5F31\u3044",
  STANDARD: "\u6A19\u6E96",
  STRONG: "\u5F37\u3044"
});
var GAME_RUNTIME_FAMILY_LABELS = Object.freeze({
  RPG_GRID: "RPG\u30FB\u30DE\u30B9\u79FB\u52D5",
  ACTION_PLATFORM: "2D\u30A2\u30AF\u30B7\u30E7\u30F3\u30FB\u7C21\u6613\u7269\u7406",
  SCROLL_SIDE: "2D\u30B9\u30AF\u30ED\u30FC\u30EB\u30FB\u6A2A\u79FB\u52D5",
  DODGE_ARENA: "\u6575\u3088\u3051\u30FB\u30A2\u30EA\u30FC\u30CA",
  FREE: "\u81EA\u7531\u5236\u4F5C\u30FB\u6700\u5C0F\u30EB\u30FC\u30EB"
});
var GAME_SCENE_GRAVITY_OPTIONS = [
  {
    gravity: "NONE",
    label: "\u306A\u3057",
    detail: "\u4E0A\u4E0B\u5DE6\u53F3\u306B\u81EA\u7531\u306B\u79FB\u52D5"
  },
  {
    gravity: "WEAK",
    label: "\u5F31\u3044",
    detail: "\u3086\u3063\u304F\u308A\u843D\u4E0B\u3059\u308B"
  },
  {
    gravity: "STANDARD",
    label: "\u6A19\u6E96",
    detail: "2D\u30A2\u30AF\u30B7\u30E7\u30F3\u306E\u57FA\u672C"
  },
  {
    gravity: "STRONG",
    label: "\u5F37\u3044",
    detail: "\u7D20\u65E9\u304F\u843D\u4E0B\u3059\u308B"
  }
];
var GAME_EVENT_WHO_OPTIONS = [
  {
    value: "PLAYER",
    label: "\u4E3B\u4EBA\u516C"
  },
  {
    value: "TOUCHED_OBJECT",
    label: "\u89E6\u308C\u305F\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8"
  },
  {
    value: "ANYONE",
    label: "\u8AB0\u3067\u3082"
  }
];
var GAME_EVENT_CONDITION_OPTIONS = [
  {
    value: "START",
    label: "\u30B2\u30FC\u30E0\u304C\u59CB\u307E\u3063\u305F"
  },
  {
    value: "ENTER_RANGE",
    label: "\u7BC4\u56F2\u306B\u5165\u3063\u305F"
  },
  {
    value: "TOUCH",
    label: "\u89E6\u308C\u305F"
  },
  {
    value: "TAP",
    label: "\u30BF\u30C3\u30D7\u3057\u305F"
  },
  {
    value: "INTERACT",
    label: "\u8A71\u3057\u304B\u3051\u305F"
  },
  {
    value: "REACH_GOAL",
    label: "\u30B4\u30FC\u30EB\u306B\u7740\u3044\u305F"
  },
  {
    value: "HAS_ITEM",
    label: "\u30A2\u30A4\u30C6\u30E0\u3092\u6301\u3063\u3066\u3044\u308B"
  }
];
var GAME_EVENT_ACTION_OPTIONS = [
  {
    value: "SHOW_DIALOGUE",
    label: "\u4F1A\u8A71\u3092\u8868\u793A"
  },
  {
    value: "DAMAGE",
    label: "\u30C0\u30E1\u30FC\u30B8\u3092\u4E0E\u3048\u308B"
  },
  {
    value: "SHAKE_CAMERA",
    label: "\u30AB\u30E1\u30E9\u3092\u63FA\u3089\u3059"
  },
  {
    value: "PLAY_AUDIO",
    label: "\u52B9\u679C\u97F3\u3092\u9CF4\u3089\u3059"
  },
  {
    value: "COMPLETE_SCENE",
    label: "Scene\u3092\u30AF\u30EA\u30A2\u3059\u308B"
  },
  {
    value: "SET_VARIABLE",
    label: "\u30B2\u30FC\u30E0\u72B6\u614B\u3092\u5909\u3048\u308B"
  },
  {
    value: "GIVE_ITEM",
    label: "\u30A2\u30A4\u30C6\u30E0\u3092\u6E21\u3059"
  },
  {
    value: "TAKE_ITEM",
    label: "\u30A2\u30A4\u30C6\u30E0\u3092\u6E1B\u3089\u3059"
  },
  {
    value: "CRAFT_ITEM",
    label: "\u30EC\u30B7\u30D4\u3092\u4F5C\u308B"
  },
  {
    value: "BREAK_BLOCK",
    label: "\u30D6\u30ED\u30C3\u30AF\u3092\u58CA\u3059"
  },
  {
    value: "PLACE_BLOCK",
    label: "\u30D6\u30ED\u30C3\u30AF\u3092\u7F6E\u304F"
  }
];
var DEFAULT_RULE_FLAGS = {
  schemaVersion: 1,
  horizontalMove: true,
  verticalMove: true,
  jump: false,
  floorCollision: false,
  cameraFollow: true,
  mobileControls: true
};
function sceneRulesForRuntimeFamily(runtimeFamily) {
  switch (runtimeFamily) {
    case "RPG_GRID":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true
      };
    case "ACTION_PLATFORM":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true
      };
    case "SCROLL_SIDE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true
      };
    case "DODGE_ARENA":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true,
        jump: false,
        floorCollision: false
      };
    case "FREE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE"
      };
  }
}
function sceneRulesForCreationMode(mode) {
  return sceneRulesForRuntimeFamily(mode === "RPG_TEMPLATE" ? "RPG_GRID" : mode === "ACTION_2D" ? "ACTION_PLATFORM" : mode === "DODGE_2D" ? "DODGE_ARENA" : mode === "SCROLL_2D" ? "SCROLL_SIDE" : "FREE");
}
function normalizeGameSceneRules(value) {
  const runtimeFamily = value?.runtimeFamily;
  const safeRuntimeFamily = runtimeFamily === "RPG_GRID" || runtimeFamily === "ACTION_PLATFORM" || runtimeFamily === "SCROLL_SIDE" || runtimeFamily === "DODGE_ARENA" || runtimeFamily === "FREE" ? runtimeFamily : "FREE";
  const fallback = sceneRulesForRuntimeFamily(safeRuntimeFamily);
  const gravity = value?.gravity;
  const safeGravity = gravity === "NONE" || gravity === "WEAK" || gravity === "STANDARD" || gravity === "STRONG" ? gravity : fallback.gravity;
  const booleanRule = (key) => typeof value?.[key] === "boolean" ? value[key] : fallback[key];
  return {
    ...fallback,
    schemaVersion: 1,
    runtimeFamily: safeRuntimeFamily,
    gravity: safeGravity,
    horizontalMove: booleanRule("horizontalMove"),
    verticalMove: booleanRule("verticalMove"),
    jump: booleanRule("jump"),
    floorCollision: booleanRule("floorCollision"),
    cameraFollow: booleanRule("cameraFollow"),
    mobileControls: booleanRule("mobileControls")
  };
}
function physics2DSettingsForSceneRules(rules, current) {
  const gravity = GAME_SCENE_RULE_PRESETS[rules.gravity];
  const base = current ?? {
    gravity: {
      x: 0,
      y: gravity
    },
    fixedDeltaTime: 1 / 60,
    maxSubSteps: 4,
    defaultMaterial: {
      friction: 0.4,
      bounciness: 0
    }
  };
  return {
    ...base,
    gravity: {
      x: 0,
      y: gravity
    },
    defaultMaterial: {
      ...base.defaultMaterial
    }
  };
}
function sceneRulesSummary(rules) {
  const flags = [];
  if (rules.horizontalMove) flags.push("\u5DE6\u53F3\u79FB\u52D5");
  if (rules.verticalMove) flags.push("\u4E0A\u4E0B\u79FB\u52D5");
  if (rules.jump) flags.push("\u30B8\u30E3\u30F3\u30D7");
  if (rules.floorCollision) flags.push("\u5E8A\u3068\u306E\u885D\u7A81");
  if (rules.cameraFollow) flags.push("\u30AB\u30E1\u30E9\u8FFD\u5F93");
  return GAME_RUNTIME_FAMILY_LABELS[rules.runtimeFamily] + " \xB7 \u91CD\u529B" + GAME_SCENE_RULE_LABELS[rules.gravity] + " \xB7 " + (flags.join("\u30FB") || "\u6700\u5C0F\u30EB\u30FC\u30EB");
}
function defaultGameEventCardsForRuntimeFamily(runtimeFamily, trackIds = []) {
  const player = trackIds.find((id) => id === "hero" || id.includes("hero"));
  const source = player === void 0 ? {} : {
    sourceTrackId: player
  };
  const npc = trackIds.find((id) => id === "enemy" || id.includes("npc"));
  if (runtimeFamily === "RPG_GRID") {
    return [
      {
        eventId: "event:npc-dialogue",
        label: "NPC\u306B\u8A71\u3057\u304B\u3051\u308B",
        enabled: true,
        who: "PLAYER",
        condition: "INTERACT",
        ...source,
        ...npc === void 0 ? {} : {
          targetTrackId: npc
        },
        action: "SHOW_DIALOGUE",
        message: "\u3053\u3093\u306B\u3061\u306F\u3002\u77E2\u5370\u30AD\u30FC\u3067\u6B69\u3044\u3066\u3001\u8FD1\u304F\u3067Enter\u3092\u62BC\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044\u3002"
      }
    ];
  }
  if (runtimeFamily === "ACTION_PLATFORM") {
    const enemy = trackIds.find((id) => id === "enemy" || id.includes("enemy"));
    return [
      {
        eventId: "event:enemy-hit",
        label: "\u6575\u306B\u89E6\u308C\u305F\u3089\u30C0\u30E1\u30FC\u30B8",
        enabled: true,
        who: "PLAYER",
        condition: "TOUCH",
        ...source,
        ...enemy === void 0 ? {} : {
          targetTrackId: enemy
        },
        action: "DAMAGE",
        amount: 1
      },
      {
        eventId: "event:enemy-camera-shake",
        label: "\u30C0\u30E1\u30FC\u30B8\u3067\u30AB\u30E1\u30E9\u3092\u63FA\u3089\u3059",
        enabled: true,
        who: "PLAYER",
        condition: "TOUCH",
        ...source,
        ...enemy === void 0 ? {} : {
          targetTrackId: enemy
        },
        action: "SHAKE_CAMERA"
      }
    ];
  }
  if (runtimeFamily === "DODGE_ARENA") {
    const enemy = trackIds.find((id) => id === "enemy" || id.includes("enemy"));
    return [
      {
        eventId: "event:dodge-enemy-hit",
        label: "\u6575\u306B\u89E6\u308C\u305F\u3089\u30E9\u30A4\u30D5\u304C\u6E1B\u308B",
        enabled: true,
        who: "PLAYER",
        condition: "TOUCH",
        ...source,
        ...enemy === void 0 ? {} : {
          targetTrackId: enemy
        },
        action: "DAMAGE",
        amount: 1
      },
      {
        eventId: "event:dodge-camera-shake",
        label: "\u30C0\u30E1\u30FC\u30B8\u3067\u30AB\u30E1\u30E9\u3092\u63FA\u3089\u3059",
        enabled: true,
        who: "PLAYER",
        condition: "TOUCH",
        ...source,
        ...enemy === void 0 ? {} : {
          targetTrackId: enemy
        },
        action: "SHAKE_CAMERA"
      }
    ];
  }
  if (runtimeFamily === "SCROLL_SIDE") {
    const goal = trackIds.find((id) => id === "goal" || id.includes("goal"));
    return [
      {
        eventId: "event:reach-goal",
        label: "\u30B4\u30FC\u30EB\u306B\u7740\u3044\u305F\u3089\u30AF\u30EA\u30A2",
        enabled: true,
        who: "PLAYER",
        condition: "REACH_GOAL",
        ...source,
        ...goal === void 0 ? {} : {
          targetTrackId: goal
        },
        action: "COMPLETE_SCENE"
      }
    ];
  }
  return [];
}
function triggerForCondition(card) {
  switch (card.condition) {
    case "TAP": {
      const value = card.targetTrackId ?? card.sourceTrackId;
      return {
        type: "TAP",
        ...value === void 0 ? {} : {
          value
        }
      };
    }
    case "TOUCH":
    case "REACH_GOAL":
      return {
        type: "COLLISION",
        ...card.targetTrackId === void 0 ? {} : {
          value: card.targetTrackId
        }
      };
    case "START":
      return {
        type: "TIMER",
        value: "start"
      };
    case "ENTER_RANGE":
      return {
        type: "COLLISION",
        value: "range:" + (card.targetTrackId ?? "scene")
      };
    case "INTERACT":
      return {
        type: "ACTION",
        actionId: "rpg.interact",
        ...card.targetTrackId === void 0 ? {} : {
          value: card.targetTrackId
        }
      };
    case "HAS_ITEM":
      return {
        type: "ACTION",
        actionId: "inventory.has-item",
        value: card.itemId ?? "item"
      };
  }
}
function actionForCard(card) {
  switch (card.action) {
    case "SHOW_DIALOGUE":
      return {
        kind: "SET_VARIABLE",
        targetId: card.targetTrackId ?? card.sourceTrackId ?? "game",
        property: "dialogue",
        value: card.message?.trim() || "\u4F1A\u8A71\u3092\u8868\u793A\u3057\u307E\u3057\u305F\u3002"
      };
    case "DAMAGE":
      return {
        kind: "SET_COMPONENT_PROPERTY",
        targetId: card.targetTrackId ?? "target",
        property: "damage",
        value: card.amount ?? 1
      };
    case "SHAKE_CAMERA":
      return {
        kind: "SET_VARIABLE",
        targetId: "camera",
        property: "shake",
        value: true
      };
    case "PLAY_AUDIO":
      return {
        kind: "PLAY_AUDIO",
        targetId: card.audioTrackId ?? "audio"
      };
    case "COMPLETE_SCENE":
      return {
        kind: "SET_VARIABLE",
        targetId: "scene",
        property: "complete",
        value: true
      };
    case "SET_VARIABLE":
      return {
        kind: "SET_VARIABLE",
        targetId: card.targetTrackId ?? "game",
        property: "state",
        value: card.message ?? "true"
      };
    case "GIVE_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "give:" + (card.itemId ?? "item"),
        value: Math.max(1, card.amount ?? 1)
      };
    case "TAKE_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "take:" + (card.itemId ?? "item"),
        value: Math.max(1, card.amount ?? 1)
      };
    case "CRAFT_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "craft:" + (card.recipeId ?? "recipe"),
        value: true
      };
    case "BREAK_BLOCK":
      return {
        kind: "SET_VARIABLE",
        targetId: "world",
        property: "break:" + (card.blockTypeId ?? "block"),
        value: true
      };
    case "PLACE_BLOCK":
      return {
        kind: "SET_VARIABLE",
        targetId: "world",
        property: "place:" + (card.blockTypeId ?? "block"),
        value: card.blockTypeId ?? "block"
      };
  }
}
function behaviorFromGameEventCard(card) {
  const behaviorId = asBehaviorId("behavior:pixiedraw-game:" + card.eventId);
  return compileNoCodeBehavior({
    behaviorId,
    rules: [
      {
        ruleId: card.eventId + ":rule",
        enabled: card.enabled,
        trigger: triggerForCondition(card),
        conditions: [
          {
            kind: "ALWAYS"
          }
        ],
        actions: [
          actionForCard(card)
        ]
      }
    ]
  });
}

// src/game/game-350/genre-runtime.ts
var GAME_GENRE_RUNTIME_SCHEMA_VERSION = 1;
var POINT_ZERO = {
  x: 0,
  y: 0
};
var PLAYER_HALF_WIDTH = 0.35;
var PLAYER_HALF_HEIGHT = 0.35;
var JUMP_SPEED = 6;
var DEFAULT_MOVE_SPEED = 5;
var TOUCH_DISTANCE = 0.9;
var DODGE_SURVIVAL_SECONDS = 15;
var DODGE_SURVIVAL_TICKS = DODGE_SURVIVAL_SECONDS * 60;
var DODGE_MOVE_SPEED = 4.5;
var DODGE_ENEMY_SPEED = 0.045;
var DEFAULT_NPC_STATUS = {
  hp: 10,
  maxHp: 10,
  stamina: 10,
  maxStamina: 10,
  mp: 0,
  maxMp: 0,
  attack: 2,
  defense: 0,
  level: 1
};
var DEFAULT_PLAYER_STATUS = {
  hp: 10,
  maxHp: 10,
  stamina: 10,
  maxStamina: 10,
  mp: 0,
  maxMp: 0,
  attack: 2,
  defense: 1,
  level: 1
};
var COMBAT_TICK_INTERVAL = 30;
var BLOCK_REACH_DISTANCE = 1.4;
function point(x, y) {
  return {
    x,
    y
  };
}
function cellKey(x, y) {
  return `${x},${y}`;
}
function nearbyCellCandidates(playerPosition, world) {
  const cx = Math.floor(playerPosition.x);
  const cy = Math.floor(playerPosition.y);
  const candidates = [
    point(cx, cy),
    point(cx - 1, cy),
    point(cx + 1, cy),
    point(cx, cy - 1),
    point(cx, cy + 1)
  ].filter((cell) => cell.x >= 0 && cell.x < world.width && cell.y >= 0 && cell.y < world.height);
  return candidates.map((cell) => ({
    cell,
    // Compare against the cell's center, not its corner, for a fair
    // "which cell is actually closest to me" ordering.
    d: distance(playerPosition, point(cell.x + 0.5, cell.y + 0.5))
  })).filter(({ d }) => d <= BLOCK_REACH_DISTANCE).sort((a, b) => a.d - b.d).map(({ cell }) => cell);
}
function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
function isDodgeEnemy(object) {
  const text = `${object.id} ${object.label}`.toLowerCase();
  return object.role === "NPC" || text.includes("enemy") || text.includes("\u6575");
}
function trackRole(track) {
  return track.role;
}
function trackStatus(track, fallback) {
  const status = track?.components?.find((component) => component.type === "STATUS");
  if (status?.type !== "STATUS" || !status.enabled) return fallback;
  const maxHp = Math.max(1, status.maxHp);
  const maxStamina = Math.max(0, status.maxStamina);
  const maxMp = Math.max(0, status.maxMp);
  return {
    hp: Math.max(0, Math.min(status.hp, maxHp)),
    maxHp,
    stamina: Math.max(0, Math.min(status.stamina, maxStamina)),
    maxStamina,
    mp: Math.max(0, Math.min(status.mp, maxMp)),
    maxMp,
    attack: Math.max(0, status.attack),
    defense: Math.max(0, status.defense),
    level: Math.max(1, Math.round(status.level))
  };
}
function trackBrainMode(track) {
  const brain = track?.components?.find((component) => component.type === "BRAIN");
  if (brain?.type !== "BRAIN" || !brain.enabled) return void 0;
  return {
    mode: brain.mode,
    speed: brain.speed,
    range: brain.range
  };
}
function stepBrain(object, playerPosition, world) {
  const brain = object.brain;
  if (brain === void 0) return object;
  if (brain.mode !== "PURSUE" && brain.mode !== "AVOID") return object;
  const dx = playerPosition.x - object.position.x;
  const dy = playerPosition.y - object.position.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-3 || length > brain.range) return object;
  const speed = Math.max(0, brain.speed) * 0.01;
  const move = Math.min(speed, length);
  const direction = brain.mode === "PURSUE" ? 1 : -1;
  return {
    ...object,
    position: point(Math.min(world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, object.position.x + dx / length * move * direction)), Math.min(world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, object.position.y + dy / length * move * direction)))
  };
}
function applyContactCombat(playerStatus, playerPosition, objects) {
  let nextPlayerStatus = playerStatus;
  const nextObjects = [];
  for (const object of objects) {
    if (object.role !== "NPC" || object.status === void 0 || nextPlayerStatus.hp <= 0) {
      nextObjects.push(object);
      continue;
    }
    if (distance(playerPosition, object.position) > TOUCH_DISTANCE) {
      nextObjects.push(object);
      continue;
    }
    const damageToObject = Math.max(1, nextPlayerStatus.attack - object.status.defense);
    const damageToPlayer = Math.max(1, object.status.attack - nextPlayerStatus.defense);
    const objectHp = Math.max(0, object.status.hp - damageToObject);
    nextPlayerStatus = {
      ...nextPlayerStatus,
      hp: Math.max(0, nextPlayerStatus.hp - damageToPlayer)
    };
    if (objectHp <= 0) continue;
    nextObjects.push({
      ...object,
      status: {
        ...object.status,
        hp: objectHp
      }
    });
  }
  return {
    objects: nextObjects,
    playerStatus: nextPlayerStatus
  };
}
function trackPosition(track) {
  const transform3 = track.components?.find((component) => component.type === "TRANSFORM");
  return transform3?.type === "TRANSFORM" ? point(transform3.x, transform3.y) : point(0, 0);
}
function trackCamera(track) {
  const camera = track?.components?.find((component) => component.type === "CAMERA");
  return camera?.type === "CAMERA" ? normalizeCamera2DSettings(camera.camera2D) : DEFAULT_CAMERA_2D_SETTINGS;
}
function mapFromTracks(tracks) {
  const mapTrack = tracks.find((track) => track.role === "TILEMAP" || track.kind === "TILEMAP");
  const tilemapComponent = mapTrack?.components?.find((component) => component.type === "TILEMAP");
  const document2 = mapTrack?.tilemap ?? (tilemapComponent?.type === "TILEMAP" ? tilemapComponent.document : void 0);
  const width = Math.max(8, document2?.width ?? 24);
  const height = Math.max(6, document2?.height ?? 10);
  const solidCells = document2?.cells.filter((cell) => cell.collision === "SOLID").map((cell) => point(cell.x, cell.y)) ?? Array.from({
    length: width
  }, (_, x) => point(x, height - 1));
  const blockTypeIds = {};
  for (const cell of document2?.cells ?? []) {
    if (cell.blockTypeId !== void 0) {
      blockTypeIds[`${cell.x},${cell.y}`] = cell.blockTypeId;
    }
  }
  return {
    width,
    height,
    solidCells,
    blockTypeIds
  };
}
function objectById(state, id) {
  if (id === void 0 || id === state.playerId) {
    return id === state.playerId ? {
      id: state.playerId,
      label: "\u4E3B\u4EBA\u516C",
      role: "PLAYER",
      position: state.playerPosition
    } : void 0;
  }
  return state.objects.find((object) => object.id === id);
}
function targetPosition(state, card) {
  if (card.targetTrackId !== void 0) {
    return objectById(state, card.targetTrackId)?.position;
  }
  if (card.condition === "REACH_GOAL") {
    return state.objects.find((object) => object.role === "TRIGGER" && object.id.toLowerCase().includes("goal"))?.position;
  }
  return void 0;
}
function cardIsNearTarget(state, card) {
  if (card.condition === "HAS_ITEM") {
    const have = state.inventory[card.itemId ?? ""] ?? 0;
    return have >= Math.max(1, card.amount ?? 1);
  }
  const target = targetPosition(state, card);
  if (target !== void 0 && card.condition === "REACH_GOAL" && state.runtimeFamily === "SCROLL_SIDE") {
    return state.playerPosition.x >= target.x - TOUCH_DISTANCE;
  }
  return target === void 0 || distance(state.playerPosition, target) <= TOUCH_DISTANCE;
}
function addToInventory(inventory, itemId, amount) {
  const next = Math.max(0, (inventory[itemId] ?? 0) + amount);
  return {
    ...inventory,
    [itemId]: next
  };
}
function craftRecipe(inventory, recipes, recipeId) {
  const recipe = recipes.find((candidate) => candidate.recipeId === recipeId);
  if (recipe === void 0) return inventory;
  const canCraft = recipe.ingredients.every((ingredient) => (inventory[ingredient.itemId] ?? 0) >= ingredient.amount);
  if (!canCraft) return inventory;
  let next = inventory;
  for (const ingredient of recipe.ingredients) {
    next = addToInventory(next, ingredient.itemId, -ingredient.amount);
  }
  return addToInventory(next, recipe.result.itemId, recipe.result.amount);
}
function applyEventCard(state, card) {
  if (!card.enabled) return state;
  switch (card.action) {
    case "DAMAGE": {
      const damaged = state.health - Math.max(0, card.amount ?? 1);
      return {
        ...state,
        health: Math.max(0, damaged),
        gameOver: damaged <= 0,
        cameraShakeFrames: Math.max(state.cameraShakeFrames, state.camera2D.shake.onDamage ? 8 : 0)
      };
    }
    case "SHAKE_CAMERA":
      return {
        ...state,
        cameraShakeFrames: Math.max(state.cameraShakeFrames, 8)
      };
    case "SHOW_DIALOGUE":
      return {
        ...state,
        dialogue: card.message?.trim() || "\u30A4\u30D9\u30F3\u30C8\u304C\u8D77\u3053\u308A\u307E\u3057\u305F\u3002"
      };
    case "PLAY_AUDIO":
      return {
        ...state,
        lastAudioTrackId: card.audioTrackId ?? card.targetTrackId ?? null
      };
    case "COMPLETE_SCENE":
      return {
        ...state,
        sceneComplete: true
      };
    case "SET_VARIABLE":
      return {
        ...state,
        variables: {
          ...state.variables,
          state: card.message?.trim() || true
        }
      };
    case "GIVE_ITEM":
      if (card.itemId === void 0) return state;
      return {
        ...state,
        inventory: addToInventory(state.inventory, card.itemId, Math.max(1, card.amount ?? 1))
      };
    case "TAKE_ITEM":
      if (card.itemId === void 0) return state;
      return {
        ...state,
        inventory: addToInventory(state.inventory, card.itemId, -Math.max(1, card.amount ?? 1))
      };
    case "CRAFT_ITEM":
      return {
        ...state,
        inventory: craftRecipe(state.inventory, state.recipes, card.recipeId)
      };
    case "BREAK_BLOCK": {
      for (const cell of nearbyCellCandidates(state.playerPosition, state.world)) {
        const key = cellKey(cell.x, cell.y);
        const blockTypeId = state.world.blockTypeIds[key];
        if (blockTypeId === void 0) continue;
        const blockType = state.blockTypes.find((candidate) => candidate.blockTypeId === blockTypeId);
        if (blockType === void 0 || !blockType.breakable) continue;
        const nextBlockTypeIds = {
          ...state.world.blockTypeIds
        };
        delete nextBlockTypeIds[key];
        return {
          ...state,
          world: {
            ...state.world,
            blockTypeIds: nextBlockTypeIds,
            solidCells: state.world.solidCells.filter((solid) => !(solid.x === cell.x && solid.y === cell.y))
          },
          inventory: blockType.dropItemId === void 0 ? state.inventory : addToInventory(state.inventory, blockType.dropItemId, 1)
        };
      }
      return state;
    }
    case "PLACE_BLOCK": {
      if (card.blockTypeId === void 0 || card.itemId === void 0) {
        return state;
      }
      const blockType = state.blockTypes.find((candidate) => candidate.blockTypeId === card.blockTypeId);
      if (blockType === void 0 || !blockType.placeable || (state.inventory[card.itemId] ?? 0) < 1) {
        return state;
      }
      const playerCellX = Math.floor(state.playerPosition.x);
      const playerCellY = Math.floor(state.playerPosition.y);
      for (const cell of nearbyCellCandidates(state.playerPosition, state.world)) {
        if (cell.x === playerCellX && cell.y === playerCellY) continue;
        const key = cellKey(cell.x, cell.y);
        if (state.world.blockTypeIds[key] !== void 0) continue;
        return {
          ...state,
          world: {
            ...state.world,
            blockTypeIds: {
              ...state.world.blockTypeIds,
              [key]: card.blockTypeId
            },
            solidCells: [
              ...state.world.solidCells,
              cell
            ]
          },
          inventory: addToInventory(state.inventory, card.itemId, -1)
        };
      }
      return state;
    }
  }
}
function cameraOriginFor(playerPosition, camera2D, world) {
  const pixelsPerUnit = Math.max(1, camera2D.pixelsPerUnit);
  const viewportWidth = Math.max(1, camera2D.referenceWidth / pixelsPerUnit);
  const viewportHeight = Math.max(1, camera2D.referenceHeight / pixelsPerUnit);
  const x = camera2D.follow.enabled ? playerPosition.x - viewportWidth / 2 + camera2D.follow.lookAheadX : 0;
  const y = camera2D.follow.enabled ? playerPosition.y - viewportHeight / 2 + camera2D.follow.lookAheadY : 0;
  const clampedX = Math.min(Math.max(0, world.width - viewportWidth), Math.max(0, x));
  const clampedY = Math.min(Math.max(0, world.height - viewportHeight), Math.max(0, y));
  const quantum = 1 / pixelsPerUnit;
  return point(camera2D.pixelPerfect ? Math.round(clampedX / quantum) * quantum : clampedX, camera2D.pixelPerfect ? Math.round(clampedY / quantum) * quantum : clampedY);
}
function initialEventState(state) {
  let next = state;
  const firedEventIds = [];
  for (const card of state.eventCards) {
    if (card.enabled && card.condition === "START") {
      next = applyEventCard(next, card);
      firedEventIds.push(card.eventId);
    }
  }
  return {
    ...next,
    firedEventIds
  };
}
function processEventCards(state, input) {
  let next = state;
  const activeEventIds = [];
  const firedEventIds = [
    ...state.firedEventIds
  ];
  for (const card of state.eventCards) {
    if (!card.enabled || card.condition === "START") continue;
    const near = cardIsNearTarget(next, card);
    const inputTriggered = card.condition === "TAP" ? input.tap === true : card.condition === "INTERACT" ? input.interact === true : false;
    const rangeTriggered = card.condition === "TOUCH" || card.condition === "ENTER_RANGE" || card.condition === "REACH_GOAL" || card.condition === "HAS_ITEM";
    const triggered = rangeTriggered ? near : inputTriggered && near;
    if (!triggered) continue;
    if (rangeTriggered) activeEventIds.push(card.eventId);
    const edgeTriggered = rangeTriggered ? !state.activeEventIds.includes(card.eventId) : true;
    const oneShot = card.condition === "REACH_GOAL";
    if (edgeTriggered && (!oneShot || !firedEventIds.includes(card.eventId))) {
      next = applyEventCard(next, card);
      if (oneShot) firedEventIds.push(card.eventId);
    }
  }
  return {
    ...next,
    activeEventIds,
    firedEventIds
  };
}
function landingY(state, x, previousY, nextY) {
  if (!state.rules.floorCollision || nextY < previousY) return void 0;
  let best;
  for (const cell of state.world.solidCells) {
    if (Math.abs(cell.x - x) > 0.8) continue;
    const surface = cell.y - PLAYER_HALF_HEIGHT;
    if (surface < previousY - 0.05 || nextY < surface) continue;
    if (best === void 0 || surface < best) best = surface;
  }
  return best;
}
function stepMovement(state, input) {
  if (state.runtimeFamily === "DODGE_ARENA") {
    const directionX = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
    const directionY = (input.down === true ? 1 : 0) - (input.up === true || input.jump === true ? 1 : 0);
    const magnitude = Math.hypot(directionX, directionY) || 1;
    const velocityX2 = directionX / magnitude * DODGE_MOVE_SPEED;
    const velocityY2 = directionY / magnitude * DODGE_MOVE_SPEED;
    return {
      playerPosition: point(Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, state.playerPosition.x + velocityX2 / 60)), Math.min(state.world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, state.playerPosition.y + velocityY2 / 60))),
      velocity: point(velocityX2, velocityY2),
      grounded: true
    };
  }
  const direction = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
  const speed = DEFAULT_MOVE_SPEED;
  const velocityX = state.rules.horizontalMove ? direction * speed : 0;
  const jump = input.jump === true && state.grounded && state.rules.jump;
  const gravity = GAME_SCENE_RULE_PRESETS[state.rules.gravity];
  const velocityY = state.rules.gravity === "NONE" ? 0 : jump ? -JUMP_SPEED : state.velocity.y + gravity / 60;
  const previous = state.playerPosition;
  let x = previous.x + velocityX / 60;
  let y = previous.y + velocityY / 60;
  x = Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, x));
  const floor = landingY(state, x, previous.y, y);
  const grounded = floor !== void 0;
  if (floor !== void 0) y = floor;
  y = Math.min(state.world.height + 2, Math.max(-2, y));
  return {
    playerPosition: point(x, y),
    velocity: point(velocityX, floor === void 0 ? velocityY : 0),
    grounded
  };
}
function familyForProject(project) {
  const family = project.editorTimeline?.sceneRules?.runtimeFamily;
  if (family === "ACTION_PLATFORM" || family === "DODGE_ARENA" || family === "SCROLL_SIDE") return family;
  if (project.editorTimeline?.creationMode === "DODGE_2D") {
    return "DODGE_ARENA";
  }
  if (project.editorTimeline?.creationMode === "SCROLL_2D") {
    return "SCROLL_SIDE";
  }
  return "ACTION_PLATFORM";
}
function createGameGenreRuntime(project) {
  const family = familyForProject(project);
  const fallbackRules = sceneRulesForRuntimeFamily(family);
  const rules = project.editorTimeline?.sceneRules ?? fallbackRules;
  const tracks = project.editorTimeline?.tracks ?? [];
  const player = tracks.find((track) => track.role === "PLAYER") ?? tracks.find((track) => track.trackId === "hero");
  const playerId = player?.trackId ?? "hero";
  const world = mapFromTracks(tracks);
  const cameraTrack = tracks.find((track) => track.role === "CAMERA");
  const camera2D = trackCamera(cameraTrack);
  const objects = tracks.filter((track) => track.trackId !== playerId).filter((track) => track.active !== false).map((track) => {
    const role = trackRole(track);
    const brain = trackBrainMode(track);
    return {
      id: track.trackId,
      label: track.label,
      role,
      position: trackPosition(track),
      ...role === "NPC" ? {
        status: trackStatus(track, DEFAULT_NPC_STATUS)
      } : {},
      ...brain === void 0 ? {} : {
        brain
      }
    };
  });
  const state = {
    schemaVersion: GAME_GENRE_RUNTIME_SCHEMA_VERSION,
    projectId: project.projectId,
    runtimeFamily: family,
    rules,
    mode: "STOPPED",
    tick: 0,
    playerId,
    playerPosition: trackPosition(player ?? {
      trackId: playerId,
      label: "\u4E3B\u4EBA\u516C",
      kind: "SPRITE",
      activeFrames: []
    }),
    velocity: POINT_ZERO,
    grounded: false,
    health: 3,
    playerStatus: trackStatus(player, DEFAULT_PLAYER_STATUS),
    survivalSeconds: 0,
    gameOver: false,
    camera2D,
    cameraOrigin: cameraOriginFor(point(1, 1), camera2D, world),
    cameraShakeFrames: 0,
    world,
    objects,
    eventCards: project.editorTimeline?.eventCards ?? [],
    activeEventIds: [],
    firedEventIds: [],
    dialogue: null,
    lastAudioTrackId: null,
    sceneComplete: false,
    variables: {},
    inventory: {},
    recipes: project.editorTimeline?.recipes ?? [],
    blockTypes: project.editorTimeline?.blockTypes ?? []
  };
  return initialEventState(state);
}
function playGameGenre(state) {
  return {
    ...state,
    mode: "PLAYING",
    dialogue: null
  };
}
function stopGameGenre(state) {
  return {
    ...state,
    mode: "STOPPED"
  };
}
function restartGameGenre(project) {
  return playGameGenre(createGameGenreRuntime(project));
}
function clearGameGenreDialogue(state) {
  return {
    ...state,
    dialogue: null
  };
}
function triggerGameGenreCameraShake(state) {
  return {
    ...state,
    cameraShakeFrames: Math.max(state.cameraShakeFrames, 8)
  };
}
function stepGameGenre(state, input = {}) {
  if (state.mode !== "PLAYING" || state.gameOver || state.sceneComplete) return state;
  const chasedObjects = state.runtimeFamily === "DODGE_ARENA" ? state.objects.map((object) => {
    if (object.brain !== void 0 || !isDodgeEnemy(object)) return object;
    const dx = state.playerPosition.x - object.position.x;
    const dy = state.playerPosition.y - object.position.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-3) return object;
    const move = Math.min(DODGE_ENEMY_SPEED, length);
    return {
      ...object,
      position: point(Math.min(state.world.width - PLAYER_HALF_WIDTH, Math.max(PLAYER_HALF_WIDTH, object.position.x + dx / length * move)), Math.min(state.world.height - PLAYER_HALF_HEIGHT, Math.max(PLAYER_HALF_HEIGHT, object.position.y + dy / length * move)))
    };
  }) : state.objects;
  const brainObjects = chasedObjects.map((object) => stepBrain(object, state.playerPosition, state.world));
  const movement2 = stepMovement(state, input);
  const combat = (state.tick + 1) % COMBAT_TICK_INTERVAL === 0 ? applyContactCombat(state.playerStatus, movement2.playerPosition, brainObjects) : {
    objects: brainObjects,
    playerStatus: state.playerStatus
  };
  const nextBase = {
    ...state,
    tick: state.tick + 1,
    objects: combat.objects,
    playerStatus: combat.playerStatus,
    playerPosition: movement2.playerPosition,
    velocity: movement2.velocity,
    grounded: movement2.grounded,
    survivalSeconds: state.runtimeFamily === "DODGE_ARENA" ? Math.floor((state.tick + 1) / 60) : state.survivalSeconds,
    cameraOrigin: cameraOriginFor(movement2.playerPosition, state.camera2D, state.world),
    cameraShakeFrames: Math.max(0, state.cameraShakeFrames - 1),
    dialogue: input.interact === true || input.tap === true ? null : state.dialogue,
    gameOver: state.gameOver || combat.playerStatus.hp <= 0
  };
  const eventState = processEventCards(nextBase, input);
  if (eventState.runtimeFamily === "DODGE_ARENA" && eventState.tick >= DODGE_SURVIVAL_TICKS && !eventState.gameOver) {
    return {
      ...eventState,
      sceneComplete: true
    };
  }
  return eventState;
}

// src/game/game-350/runtime-launch.ts
var IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION = 1;
var PIXIEED_BRAND_SPLASH_DURATION_MS = 1200;
function nonEmptyText2(value, maxLength = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function stableId4(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}
function createIGameRuntimeLaunchConfig(input) {
  if (!nonEmptyText2(input.title) || !stableId4(input.startSceneId)) {
    throw new Error("iGAME Runtime launch config contains an unstable identity.");
  }
  const subtitle = input.subtitle ?? "\u3053\u306EGame\u306E\u30B9\u30BF\u30FC\u30C8\u753B\u9762";
  const startLabel = input.startLabel ?? "START";
  if (!nonEmptyText2(subtitle) || !nonEmptyText2(startLabel)) {
    throw new Error("iGAME Runtime launch config contains empty display text.");
  }
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    title: input.title.trim(),
    subtitle: subtitle.trim(),
    startSceneId: input.startSceneId,
    startLabel: startLabel.trim()
  });
}
function createIGameRuntimeLaunchState(config) {
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    phase: "BRAND_SPLASH",
    config,
    transitionCount: 0
  });
}
function transition(state, phase) {
  return Object.freeze({
    ...state,
    phase,
    transitionCount: state.transitionCount + 1
  });
}
function completeIGameBrandSplash(state) {
  if (state.phase !== "BRAND_SPLASH") {
    throw new Error("iGAME brand splash can only complete once at launch.");
  }
  return transition(state, "START_SCREEN");
}
function startIGameRuntime(state) {
  if (state.phase !== "START_SCREEN") {
    throw new Error("iGAME Runtime can start only from the start screen.");
  }
  return transition(state, "GAMEPLAY");
}
function stopIGameRuntime(state) {
  if (state.phase === "STOPPED") return state;
  return transition(state, "STOPPED");
}
function isIGamePlayerRuntimeSource(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const source = value;
  return source.manifest !== null && typeof source.manifest === "object" && source.launch !== null && typeof source.launch === "object" && typeof source.mount === "function";
}

// src/game/game-350/igame-browser-runtime.ts
function record3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function gameProjectFrom(imported) {
  const candidate = record3(record3(imported.game?.record).canonicalProject);
  const timeline = record3(candidate.editorTimeline);
  if (candidate.schemaVersion !== 1 || typeof candidate.projectId !== "string" || !Array.isArray(candidate.scenes) || !Array.isArray(candidate.prefabs) || !Array.isArray(candidate.dependencies) || !Array.isArray(candidate.behaviors) || !Array.isArray(timeline.tracks)) {
    throw new Error("PXD\u306B\u518D\u751F\u53EF\u80FD\u306AGame Project\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
  }
  return candidate;
}
function assetIdByDefinition(imported, definitionId) {
  if (!definitionId) return void 0;
  const definition = imported.assetDefinitions.find((entry) => entry.definitionId === definitionId);
  const identity = record3(definition?.registryIdentity);
  return typeof identity.assetId === "string" ? identity.assetId : definitionId;
}
function assetIdForTrack(project, imported, trackId) {
  const animation = project.editorTimeline?.animationBindings?.find((binding2) => binding2.trackId === trackId);
  const animationAsset = assetIdByDefinition(imported, animation?.assetDefinitionId);
  if (animationAsset) return animationAsset;
  const binding = project.editorTimeline?.assetBindings?.find((candidate) => candidate.trackId === trackId && candidate.kind === "DRAW");
  return binding?.assetId;
}
function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(320, Math.floor(rect.width * ratio));
  const height = Math.max(180, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return {
    width,
    height
  };
}
function drawRaster(context, asset, x, y, width, height) {
  const pixels = asset.raster.toUint8Array();
  const image = new ImageData(asset.width, asset.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const paletteIndex = pixels[index] ?? 0;
    const color = asset.palette[paletteIndex] ?? 0;
    const offset = index * 4;
    image.data[offset] = color >>> 16 & 255;
    image.data[offset + 1] = color >>> 8 & 255;
    image.data[offset + 2] = color & 255;
    image.data[offset + 3] = paletteIndex === 0 ? 0 : color >>> 24 & 255;
  }
  const offscreen = document.createElement("canvas");
  offscreen.width = asset.width;
  offscreen.height = asset.height;
  offscreen.getContext("2d")?.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(offscreen, x, y, width, height);
}
function renderBrowserGame(canvas, state, source, assetByTrack) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D Runtime\u3092\u521D\u671F\u5316\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
  const { width, height } = resizeCanvas(canvas);
  const game = state.game;
  const worldWidth = Math.max(8, game.world.width);
  const worldHeight = Math.max(6, game.world.height);
  const viewWidth = Math.max(8, Math.min(worldWidth, game.camera2D.referenceWidth / Math.max(1, game.camera2D.pixelsPerUnit)));
  const viewHeight = Math.max(6, Math.min(worldHeight, game.camera2D.referenceHeight / Math.max(1, game.camera2D.pixelsPerUnit)));
  const left = Math.max(0, Math.min(worldWidth - viewWidth, game.playerPosition.x - viewWidth / 2));
  const top = Math.max(0, Math.min(worldHeight - viewHeight, game.playerPosition.y - viewHeight / 2));
  const sx = width / viewWidth;
  const sy = height / viewHeight;
  const toCanvasX = (value) => (value - left) * sx;
  const toCanvasY = (value) => (value - top) * sy;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#142642");
  gradient.addColorStop(1, "#07101c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(142, 190, 229, 0.12)";
  context.lineWidth = 1;
  for (let x = Math.floor(left); x <= left + viewWidth; x += 1) {
    context.beginPath();
    context.moveTo(toCanvasX(x), 0);
    context.lineTo(toCanvasX(x), height);
    context.stroke();
  }
  for (let y = Math.floor(top); y <= top + viewHeight; y += 1) {
    context.beginPath();
    context.moveTo(0, toCanvasY(y));
    context.lineTo(width, toCanvasY(y));
    context.stroke();
  }
  const drawEntity = (trackId, x, y, isPlayer) => {
    const assetId = assetByTrack.get(trackId);
    const asset = assetId ? source.draw.assets[assetId] : void 0;
    const entitySize = Math.max(0.6, Math.min(1.8, isPlayer ? 1 : 0.9));
    const canvasX = toCanvasX(x - entitySize / 2);
    const canvasY = toCanvasY(y - entitySize / 2);
    const canvasSize = Math.max(8, entitySize * Math.min(sx, sy));
    if (asset) {
      const ratio = asset.width / Math.max(1, asset.height);
      const drawHeight = canvasSize;
      const drawWidth = drawHeight * ratio;
      drawRaster(context, asset, canvasX - (drawWidth - canvasSize) / 2, canvasY, drawWidth, drawHeight);
      return;
    }
    context.fillStyle = isPlayer ? "#7fe6d4" : "#ff7997";
    context.fillRect(canvasX, canvasY, canvasSize, canvasSize);
    context.fillStyle = "rgba(255,255,255,0.7)";
    context.fillRect(canvasX + canvasSize * 0.25, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
    context.fillRect(canvasX + canvasSize * 0.6, canvasY + canvasSize * 0.2, canvasSize * 0.16, canvasSize * 0.16);
  };
  for (const cell of game.world.solidCells) {
    const canvasX = toCanvasX(cell.x);
    const canvasY = toCanvasY(cell.y);
    const cellWidth = Math.max(1, sx);
    const cellHeight = Math.max(1, sy);
    context.fillStyle = "rgba(102, 149, 193, 0.42)";
    context.fillRect(canvasX, canvasY, cellWidth, cellHeight);
  }
  for (const object of game.objects) drawEntity(object.id, object.position.x, object.position.y, false);
  drawEntity(game.playerId, game.playerPosition.x, game.playerPosition.y, true);
  context.fillStyle = "rgba(4, 9, 17, 0.72)";
  context.fillRect(12, 12, Math.min(330, width - 24), 52);
  context.fillStyle = "#eef4ff";
  context.font = `${Math.max(12, Math.floor(Math.min(width, height) / 48))}px system-ui, sans-serif`;
  context.fillText(source.project.name, 24, 34);
  context.fillStyle = "#a8b6ca";
  context.fillText(`HP ${game.health}  \u2022  ${game.runtimeFamily}  \u2022  ${Math.floor(state.animationTick / 60)}s`, 24, 52);
}
function inputFromKeys(keys) {
  return {
    left: keys.has("ArrowLeft") || keys.has("a") || keys.has("A"),
    right: keys.has("ArrowRight") || keys.has("d") || keys.has("D"),
    up: keys.has("ArrowUp") || keys.has("w") || keys.has("W"),
    down: keys.has("ArrowDown") || keys.has("s") || keys.has("S"),
    jump: keys.has(" ") || keys.has("z") || keys.has("Z"),
    attack: keys.has("x") || keys.has("X")
  };
}
function sourceAssetMap(project, imported) {
  const map = /* @__PURE__ */ new Map();
  for (const track of project.editorTimeline?.tracks ?? []) {
    const assetId = assetIdForTrack(project, imported, track.trackId);
    if (assetId) map.set(track.trackId, assetId);
  }
  return map;
}
function mountBrowserGame(context, source) {
  const shell = document.createElement("div");
  shell.className = "igame-browser-runtime";
  const canvas = document.createElement("canvas");
  canvas.className = "igame-browser-runtime__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "iGAME\u30D7\u30EC\u30A4\u753B\u9762");
  const hint = document.createElement("p");
  hint.className = "igame-browser-runtime__hint";
  hint.textContent = "\u77E2\u5370\u30AD\u30FC / WASD\u3067\u79FB\u52D5\u3000Z\u3067\u30B8\u30E3\u30F3\u30D7\u3000X\u3067\u653B\u6483\u3000Esc\u3067\u505C\u6B62";
  shell.append(canvas, hint);
  context.root.replaceChildren(shell);
  const keys = /* @__PURE__ */ new Set();
  const assetMap = sourceAssetMap(source.project, source.imported);
  let state = {
    game: playGameGenre(createGameGenreRuntime(source.project)),
    animationTick: 0
  };
  let frameHandle = 0;
  let stopped = false;
  const onKeyDown = (event) => {
    if ([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      " ",
      "z",
      "Z",
      "x",
      "X",
      "Escape"
    ].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === "Escape") {
      void context.requestStop();
      return;
    }
    keys.add(event.key);
  };
  const onKeyUp = (event) => {
    keys.delete(event.key);
  };
  const onResize = () => renderBrowserGame(canvas, state, source, assetMap);
  const tick = () => {
    if (stopped) return;
    state = {
      game: stepGameGenre(state.game, inputFromKeys(keys)),
      animationTick: state.animationTick + 1
    };
    renderBrowserGame(canvas, state, source, assetMap);
    frameHandle = window.requestAnimationFrame(tick);
  };
  window.addEventListener("keydown", onKeyDown, {
    passive: false
  });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  canvas.focus({
    preventScroll: true
  });
  tick();
  return {
    dispose: () => {
      stopped = true;
      window.cancelAnimationFrame(frameHandle);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      context.root.replaceChildren();
    }
  };
}
async function createIGameBrowserRuntimeSource(bootstrap, packageBytes) {
  const imported = await importPxdProject(packageBytes, {
    expectedPackageHash: bootstrap.package.sha256
  });
  const project = gameProjectFrom(imported);
  if (project.projectId !== bootstrap.manifest.projectId) {
    throw new Error("\u516C\u958BGame\u306EProject ID\u304CManifest\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\u3002");
  }
  const data = {
    project,
    draw: imported.state,
    imported
  };
  const launch = createIGameRuntimeLaunchConfig({
    title: bootstrap.manifest.title,
    subtitle: "\u516C\u958BRevision\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002START\u3067Game\u3092\u958B\u59CB\u3057\u307E\u3059\u3002",
    startSceneId: project.editorTimeline?.tracks[0]?.trackId || "scene-start",
    startLabel: "START"
  });
  return {
    manifest: bootstrap.manifest,
    proof: bootstrap.proof,
    launch,
    mount: async (context) => mountBrowserGame(context, data)
  };
}
async function createIGameBrowserRuntimeSourceFromBootstrap(bootstrap) {
  const packageBytes = await fetchIGamePublicPackage(bootstrap);
  return createIGameBrowserRuntimeSource(bootstrap, packageBytes);
}

// src/game/game-350/scene-graph.ts
var GAME350_PREFAB_DESIGN_GATE = "PREFAB_DESIGN_GATE";
function diagnostic5(code, path, message) {
  return {
    code,
    path,
    message
  };
}
function asGame350Scene(scene) {
  return scene;
}
function entityMap(scene) {
  return new Map(scene.entities.map((entity) => [
    String(entity.entityId),
    entity
  ]));
}
function componentIds(scene) {
  return scene.entities.flatMap((entity) => entity.components.map((component) => String(component.componentId)));
}
function duplicateDiagnostics2(values, code, path) {
  const seen = /* @__PURE__ */ new Set();
  const diagnostics = [];
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(diagnostic5(code, path, `Duplicate id: ${value}`));
    seen.add(value);
  }
  return diagnostics;
}
function validateSceneHierarchy(scene) {
  const candidate = asGame350Scene(scene);
  const diagnostics = [];
  const ids = candidate.entities.map((entity) => String(entity.entityId));
  const byId = entityMap(candidate);
  diagnostics.push(...duplicateDiagnostics2(ids, "DUPLICATE_ID", "entities.entityId"));
  diagnostics.push(...duplicateDiagnostics2(componentIds(candidate), "DUPLICATE_COMPONENT_ID", "entities.components.componentId"));
  const roots = candidate.rootEntityIds.map(String);
  diagnostics.push(...duplicateDiagnostics2(roots, "INVALID_ROOT", "rootEntityIds"));
  for (const rootId of roots) {
    const root = byId.get(rootId);
    if (root === void 0) {
      diagnostics.push(diagnostic5("MISSING_ROOT", "rootEntityIds", `Root Entity ${rootId} is missing.`));
    } else if (root.parentEntityId !== void 0) {
      diagnostics.push(diagnostic5("INVALID_ROOT", `rootEntityIds.${rootId}`, "A root Entity cannot have a parent."));
    }
  }
  for (const entity of candidate.entities) {
    if (entity.active !== void 0 && typeof entity.active !== "boolean") {
      diagnostics.push(diagnostic5("INVALID_ROOT", `entities.${String(entity.entityId)}.active`, "Entity active must be boolean."));
    }
    if (entity.prefabId !== void 0) {
      diagnostics.push(diagnostic5("PREFAB_DESIGN_GATE", `entities.${String(entity.entityId)}.prefabId`, "Prefab operations are unavailable until the ownership design gate is closed."));
    }
    if (entity.parentEntityId !== void 0 && !byId.has(String(entity.parentEntityId))) {
      diagnostics.push(diagnostic5("MISSING_PARENT", `entities.${String(entity.entityId)}.parentEntityId`, "Parent Entity must belong to this Scene."));
    }
    const seen = /* @__PURE__ */ new Set([
      String(entity.entityId)
    ]);
    let parentId = entity.parentEntityId;
    while (parentId !== void 0) {
      const key = String(parentId);
      if (seen.has(key)) {
        diagnostics.push(diagnostic5("CYCLE", "entities", `Entity parent cycle includes ${String(entity.entityId)}.`));
        break;
      }
      seen.add(key);
      parentId = byId.get(key)?.parentEntityId;
    }
  }
  const rootSet = new Set(roots);
  for (const entity of candidate.entities) {
    const id = String(entity.entityId);
    if (entity.parentEntityId === void 0 && !rootSet.has(id)) {
      diagnostics.push(diagnostic5("MISSING_ROOT", `entities.${id}`, "A parentless Entity must occur in rootEntityIds."));
    }
    if (entity.parentEntityId !== void 0 && rootSet.has(id)) {
      diagnostics.push(diagnostic5("INVALID_ROOT", `entities.${id}`, "A child Entity cannot occur in rootEntityIds."));
    }
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function requireValid(scene) {
  const checked = validateSceneHierarchy(scene);
  if (!checked.valid) throw new Error(checked.diagnostics.map((item) => `${item.code}:${item.path}`).join("; "));
}
function buildSceneHierarchy(scene) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const byId = entityMap(candidate);
  const children = /* @__PURE__ */ new Map();
  for (const entity of candidate.entities) {
    const parent = entity.parentEntityId === void 0 ? "" : String(entity.parentEntityId);
    const list = children.get(parent) ?? [];
    list.push(entity);
    children.set(parent, list);
  }
  const visit = (entity, depth) => ({
    entity,
    depth,
    children: (children.get(String(entity.entityId)) ?? []).map((child) => visit(child, depth + 1))
  });
  return candidate.rootEntityIds.map((id) => byId.get(String(id))).map((entity) => visit(entity, 0));
}
function flattenSceneHierarchy(scene) {
  const result2 = [];
  const visit = (node) => {
    result2.push(node);
    node.children.forEach(visit);
  };
  buildSceneHierarchy(scene).forEach(visit);
  return result2;
}
function result(scene, changed) {
  return {
    ok: true,
    value: scene,
    scene,
    changed,
    diagnostics: []
  };
}
function failure(...diagnostics) {
  return {
    ok: false,
    changed: false,
    diagnostics
  };
}
function targetId(value) {
  return typeof value === "object" ? String(value.entityId) : String(value);
}
function targetDiagnostics(scene, value, path) {
  if (typeof value === "object" && String(value.sceneId) !== String(scene.sceneId)) {
    return [
      diagnostic5("FOREIGN_TARGET", path, "Target Entity belongs to another Scene.")
    ];
  }
  if (!entityMap(scene).has(targetId(value))) {
    return [
      diagnostic5("MISSING_PARENT", path, "Target Entity is not in this Scene.")
    ];
  }
  return [];
}
function renameEntity(scene, entityId, name) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const entity = entityMap(candidate).get(String(entityId));
  if (entity === void 0) return failure(diagnostic5("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const trimmed = name.trim();
  if (trimmed.length === 0) return failure(diagnostic5("INVALID_ROOT", "name", "Entity name is required."));
  if (trimmed === entity.name) return result(candidate, false);
  const next = {
    ...candidate,
    entities: candidate.entities.map((item) => item.entityId === entityId ? {
      ...item,
      name: trimmed
    } : item)
  };
  return result(next, true);
}
function reparentEntity(scene, entityId, parentEntityId) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const byId = entityMap(candidate);
  const entity = byId.get(String(entityId));
  if (entity === void 0) return failure(diagnostic5("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  if (parentEntityId !== void 0) {
    const targetIssues = targetDiagnostics(candidate, parentEntityId, "parentEntityId");
    if (targetIssues.length > 0) return failure(...targetIssues);
    const nextParent2 = targetId(parentEntityId);
    let current = nextParent2;
    while (current !== void 0) {
      if (current === String(entityId)) return failure(diagnostic5("CYCLE", "parentEntityId", "Reparenting would create a cycle."));
      current = byId.get(current)?.parentEntityId === void 0 ? void 0 : String(byId.get(current)?.parentEntityId);
    }
  }
  const oldParent = entity.parentEntityId === void 0 ? void 0 : String(entity.parentEntityId);
  const nextParent = parentEntityId === void 0 ? void 0 : targetId(parentEntityId);
  if (oldParent === (nextParent === void 0 ? void 0 : String(nextParent))) return result(candidate, false);
  const nextEntities = candidate.entities.map((item) => {
    if (item.entityId !== entityId) return item;
    return nextParent === void 0 ? (() => {
      const { parentEntityId: _ignored, ...withoutParent } = item;
      return withoutParent;
    })() : {
      ...item,
      parentEntityId: nextParent
    };
  });
  const nextRoots = nextParent === void 0 ? [
    ...candidate.rootEntityIds,
    entityId
  ] : candidate.rootEntityIds.filter((id) => id !== entityId);
  return result({
    ...candidate,
    entities: nextEntities,
    rootEntityIds: nextRoots
  }, true);
}
function setEntityActive(scene, entityId, active) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const entity = entityMap(candidate).get(String(entityId));
  if (entity === void 0) return failure(diagnostic5("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  if (typeof active !== "boolean") return failure(diagnostic5("INVALID_ROOT", "active", "Entity active must be boolean."));
  if ((entity.active ?? true) === active && (active || entity.active !== void 0)) return result(candidate, false);
  return result({
    ...candidate,
    entities: candidate.entities.map((item) => item.entityId === entityId ? {
      ...item,
      active
    } : item)
  }, true);
}
function descendantsOf(scene, entityId) {
  const resultIds = /* @__PURE__ */ new Set([
    String(entityId)
  ]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of scene.entities) {
      if (entity.parentEntityId !== void 0 && resultIds.has(String(entity.parentEntityId)) && !resultIds.has(String(entity.entityId))) {
        resultIds.add(String(entity.entityId));
        changed = true;
      }
    }
  }
  return resultIds;
}
function deleteEntity(scene, entityId) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  if (!entityMap(candidate).has(String(entityId))) return failure(diagnostic5("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const deleted = descendantsOf(candidate, entityId);
  return result({
    ...candidate,
    rootEntityIds: candidate.rootEntityIds.filter((id) => !deleted.has(String(id))),
    entities: candidate.entities.filter((entity) => !deleted.has(String(entity.entityId)))
  }, true);
}
function copyEntity(entity, entityId, componentIdFor2) {
  return {
    ...entity,
    entityId,
    ...entity.parentEntityId === void 0 ? {} : {
      parentEntityId: entity.parentEntityId
    },
    components: entity.components.map((component, index) => ({
      ...component,
      componentId: componentIdFor2?.(component, index) ?? `${String(component.componentId)}:copy`
    }))
  };
}
function duplicateEntity(scene, entityId, options = {}) {
  const candidate = asGame350Scene(scene);
  requireValid(candidate);
  const source = entityMap(candidate).get(String(entityId));
  if (source === void 0) return failure(diagnostic5("MISSING_PARENT", "entityId", "Entity is not in this Scene."));
  const ids = descendantsOf(candidate, entityId);
  const ordered = candidate.entities.filter((entity) => ids.has(String(entity.entityId)));
  const includeDescendants = options.includeDescendants ?? true;
  const copyIds = includeDescendants ? ids : /* @__PURE__ */ new Set([
    String(entityId)
  ]);
  const copyEntities = ordered.filter((entity) => copyIds.has(String(entity.entityId)));
  const existingEntityIds = new Set(candidate.entities.map((entity) => String(entity.entityId)));
  const requestedRootId = options.entityId;
  let newRootId = requestedRootId ?? `${String(entityId)}:copy`;
  let generatedRootAttempt = 1;
  const mappedEntityId = (entity, rootId) => {
    const suffix = String(entity.entityId).startsWith(`${String(entityId)}:`) ? String(entity.entityId).slice(String(entityId).length + 1) : String(entity.entityId);
    return entity.entityId === entityId ? rootId : `${String(rootId)}:${suffix}`;
  };
  while (true) {
    const projectedIds = copyEntities.map((entity) => String(mappedEntityId(entity, newRootId)));
    const hasDuplicate = new Set(projectedIds).size !== projectedIds.length;
    const hasCollision = projectedIds.some((id) => existingEntityIds.has(id));
    if (!hasDuplicate && !hasCollision) break;
    if (requestedRootId !== void 0) {
      return failure(diagnostic5("DUPLICATE_ID", "entityId", `Entity ${String(newRootId)} already exists.`));
    }
    generatedRootAttempt += 1;
    newRootId = `${String(entityId)}:copy${generatedRootAttempt}`;
  }
  const newIds = /* @__PURE__ */ new Map();
  for (const entity of copyEntities) {
    const nextId2 = mappedEntityId(entity, newRootId);
    newIds.set(String(entity.entityId), nextId2);
  }
  const usedComponentIds = new Set(componentIds(candidate));
  const generatedComponentIds = /* @__PURE__ */ new Set();
  const componentIdFor2 = options.componentIdFor ?? ((component) => {
    const base = `${String(component.componentId)}:copy`;
    let candidateId = base;
    let suffix = 2;
    while (usedComponentIds.has(candidateId) || generatedComponentIds.has(candidateId)) {
      candidateId = `${base}:${suffix}`;
      suffix += 1;
    }
    generatedComponentIds.add(candidateId);
    return candidateId;
  });
  const copies = copyEntities.map((entity) => {
    const mappedParent = entity.entityId === entityId ? entity.parentEntityId : newIds.get(String(entity.parentEntityId));
    const copied = copyEntity(entity, newIds.get(String(entity.entityId)), componentIdFor2);
    return mappedParent === void 0 ? (() => {
      const { parentEntityId: _ignored, ...root } = copied;
      return root;
    })() : {
      ...copied,
      parentEntityId: mappedParent
    };
  });
  const rootIndex = candidate.rootEntityIds.findIndex((id) => id === entityId);
  const nextRoots = source.parentEntityId === void 0 ? rootIndex < 0 ? [
    ...candidate.rootEntityIds,
    newRootId
  ] : [
    ...candidate.rootEntityIds.slice(0, rootIndex + 1),
    newRootId,
    ...candidate.rootEntityIds.slice(rootIndex + 1)
  ] : [
    ...candidate.rootEntityIds
  ];
  const nextScene = {
    ...candidate,
    rootEntityIds: nextRoots,
    entities: [
      ...candidate.entities,
      ...copies
    ]
  };
  const checked = validateSceneHierarchy(nextScene);
  if (!checked.valid) return failure(...checked.diagnostics);
  return result(nextScene, true);
}
function rejectPrefabOperation(operation = "operation") {
  throw new Error(`${GAME350_PREFAB_DESIGN_GATE}:${operation}`);
}
function validateScenePrefabReferences(scene, prefabs) {
  const base = validateSceneHierarchy(scene);
  const known = new Set(prefabs.map((prefab) => String(prefab.prefabId)));
  const diagnostics = [
    ...base.diagnostics
  ];
  for (const entity of scene.entities) {
    if (entity.prefabId !== void 0 && !known.has(String(entity.prefabId))) {
      diagnostics.push(diagnostic5("PREFAB_DESIGN_GATE", `entities.${String(entity.entityId)}.prefabId`, "Prefab reference is not closed by the current Scene contract."));
    }
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}

// src/game/game-350/physics-2d.ts
var GAME350_PHYSICS_LAYER_BITS = Object.freeze({
  DEFAULT: 1 << 0,
  WORLD: 1 << 1,
  PLAYER: 1 << 2,
  NPC: 1 << 3,
  SENSOR: 1 << 4,
  PROJECTILE: 1 << 5
});
var DEFAULT_PHYSICS_2D_SETTINGS = Object.freeze({
  gravity: Object.freeze({
    x: 0,
    y: 9.8
  }),
  fixedDeltaTime: 1 / 60,
  maxSubSteps: 4,
  defaultMaterial: Object.freeze({
    friction: 0.4,
    bounciness: 0
  })
});
function freezeDeep(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}
function vector(x, y) {
  return {
    x,
    y
  };
}
function finiteVector(value) {
  return value !== null && typeof value === "object" && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
}
function record4(component) {
  return component;
}
function componentOf(entity, type) {
  return entity.components.find((component) => component.type === type);
}
function settingsWithDefaults(settings) {
  return {
    gravity: {
      ...DEFAULT_PHYSICS_2D_SETTINGS.gravity,
      ...settings?.gravity ?? {}
    },
    fixedDeltaTime: settings?.fixedDeltaTime ?? DEFAULT_PHYSICS_2D_SETTINGS.fixedDeltaTime,
    maxSubSteps: settings?.maxSubSteps ?? DEFAULT_PHYSICS_2D_SETTINGS.maxSubSteps,
    defaultMaterial: {
      ...DEFAULT_PHYSICS_2D_SETTINGS.defaultMaterial,
      ...settings?.defaultMaterial ?? {}
    }
  };
}
function validatePhysics2DSettings(value) {
  const diagnostics = [];
  if (value === null || typeof value !== "object") return {
    valid: false,
    diagnostics: [
      "settings"
    ]
  };
  const candidate = value;
  if (!finiteVector(candidate.gravity)) diagnostics.push("gravity");
  if (typeof candidate.fixedDeltaTime !== "number" || !Number.isFinite(candidate.fixedDeltaTime) || candidate.fixedDeltaTime <= 0 || candidate.fixedDeltaTime > 1) diagnostics.push("fixedDeltaTime");
  if (!Number.isSafeInteger(candidate.maxSubSteps) || Number(candidate.maxSubSteps) < 1 || Number(candidate.maxSubSteps) > 32) diagnostics.push("maxSubSteps");
  const material = candidate.defaultMaterial;
  if (material === null || typeof material !== "object") diagnostics.push("defaultMaterial");
  else {
    const m = material;
    if (typeof m.friction !== "number" || !Number.isFinite(m.friction) || m.friction < 0 || m.friction > 1) diagnostics.push("defaultMaterial.friction");
    if (typeof m.bounciness !== "number" || !Number.isFinite(m.bounciness) || m.bounciness < 0 || m.bounciness > 1) diagnostics.push("defaultMaterial.bounciness");
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function normalizePhysics2DSettings(settings) {
  const normalized = settingsWithDefaults(settings);
  const checked = validatePhysics2DSettings(normalized);
  if (!checked.valid) throw new Error(`Invalid Physics2D settings: ${checked.diagnostics.join(",")}`);
  return freezeDeep(normalized);
}
function validMaterial(value, fallback) {
  if (value === null || typeof value !== "object") return fallback;
  const candidate = value;
  const material = {
    friction: typeof candidate.friction === "number" ? candidate.friction : fallback.friction,
    bounciness: typeof candidate.bounciness === "number" ? candidate.bounciness : fallback.bounciness
  };
  if (material.friction < 0 || material.friction > 1 || material.bounciness < 0 || material.bounciness > 1 || !Number.isFinite(material.friction) || !Number.isFinite(material.bounciness)) throw new Error("Physics2D material values must be between 0 and 1.");
  return material;
}
function layerMask(value) {
  if (value === void 0) return 63;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 63) return value;
  if (Array.isArray(value) && value.every((item) => Object.hasOwn(GAME350_PHYSICS_LAYER_BITS, item))) {
    return value.reduce((mask, item) => mask | GAME350_PHYSICS_LAYER_BITS[item], 0);
  }
  throw new Error("Physics2D collider mask is invalid.");
}
function validatePhysicsBody(entity, diagnostics) {
  const transform3 = componentOf(entity, "TRANSFORM");
  if (transform3 !== void 0 && ![
    transform3.x,
    transform3.y,
    transform3.rotation,
    transform3.scaleX,
    transform3.scaleY
  ].every((item) => typeof item === "number" && Number.isFinite(item))) diagnostics.push(`${String(entity.entityId)}.transform`);
  const collider3 = componentOf(entity, "COLLIDER");
  if (collider3 !== void 0) {
    if (![
      "BOX",
      "CIRCLE",
      "CAPSULE"
    ].includes(collider3.shape) || ![
      collider3.width,
      collider3.height,
      collider3.radius
    ].every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)) diagnostics.push(`${String(entity.entityId)}.collider.shape`);
    if (!Object.hasOwn(GAME350_PHYSICS_LAYER_BITS, collider3.layer) || typeof collider3.isTrigger !== "boolean" || typeof collider3.enabled !== "boolean") diagnostics.push(`${String(entity.entityId)}.collider`);
    const value = record4(collider3);
    if (value.offset !== void 0 && !finiteVector(value.offset)) diagnostics.push(`${String(entity.entityId)}.collider.offset`);
    try {
      layerMask(value.mask);
    } catch {
      diagnostics.push(`${String(entity.entityId)}.collider.mask`);
    }
    try {
      validMaterial(value.material, DEFAULT_PHYSICS_2D_SETTINGS.defaultMaterial);
    } catch {
      diagnostics.push(`${String(entity.entityId)}.collider.material`);
    }
  }
  const rigidbody3 = rigidbodyOf(entity);
  if (rigidbody3 !== void 0) {
    const value = record4(rigidbody3);
    if (![
      "STATIC",
      "DYNAMIC",
      "KINEMATIC"
    ].includes(rigidbody3.bodyType) || typeof rigidbody3.mass !== "number" || !Number.isFinite(rigidbody3.mass) || rigidbody3.mass <= 0 || typeof rigidbody3.gravityScale !== "number" || !Number.isFinite(rigidbody3.gravityScale) || typeof rigidbody3.fixedRotation !== "boolean" || typeof rigidbody3.enabled !== "boolean") diagnostics.push(`${String(entity.entityId)}.rigidbody`);
    for (const key of [
      "linearDrag",
      "angularDrag"
    ]) if (value[key] !== void 0 && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || Number(value[key]) < 0)) diagnostics.push(`${String(entity.entityId)}.rigidbody.${key}`);
    if (value.freezePosition !== void 0 && (value.freezePosition === null || typeof value.freezePosition !== "object" || typeof value.freezePosition.x !== "boolean" || typeof value.freezePosition.y !== "boolean")) diagnostics.push(`${String(entity.entityId)}.rigidbody.freezePosition`);
    for (const key of [
      "freezePositionX",
      "freezePositionY",
      "freezeRotation",
      "simulated"
    ]) if (value[key] !== void 0 && typeof value[key] !== "boolean") diagnostics.push(`${String(entity.entityId)}.rigidbody.${key}`);
    if (value.collisionDetection !== void 0 && value.collisionDetection !== "DISCRETE" && value.collisionDetection !== "CONTINUOUS") diagnostics.push(`${String(entity.entityId)}.rigidbody.collisionDetection`);
    if (value.interpolation !== void 0 && value.interpolation !== "NONE" && value.interpolation !== "INTERPOLATE") diagnostics.push(`${String(entity.entityId)}.rigidbody.interpolation`);
  }
}
function validatePhysics2DScene(scene) {
  const diagnostics = [];
  const entityIds = /* @__PURE__ */ new Set();
  try {
    validatePhysics2DSettings(settingsWithDefaults(scene.physics2D));
    const settings = settingsWithDefaults(scene.physics2D);
    const settingsValidation = validatePhysics2DSettings(settings);
    if (!settingsValidation.valid) diagnostics.push(...settingsValidation.diagnostics);
  } catch {
    diagnostics.push("settings");
  }
  for (const entity of scene.entities) {
    const entityKey = String(entity.entityId);
    if (entityIds.has(entityKey)) diagnostics.push(`${entityKey}.entityId`);
    entityIds.add(entityKey);
    const componentIds2 = /* @__PURE__ */ new Set();
    const componentTypes = /* @__PURE__ */ new Set();
    for (const component of entity.components) {
      const componentKey = String(component.componentId);
      if (componentIds2.has(componentKey)) diagnostics.push(`${entityKey}.componentId`);
      componentIds2.add(componentKey);
      if (componentTypes.has(component.type)) diagnostics.push(`${entityKey}.duplicate.${component.type}`);
      componentTypes.add(component.type);
    }
    validatePhysicsBody(entity, diagnostics);
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function transformOf(entity) {
  const candidate = componentOf(entity, "TRANSFORM");
  return candidate ?? {
    type: "TRANSFORM",
    componentId: "physics2d:implicit-transform",
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  };
}
function colliderOf(entity, settings) {
  const candidate = componentOf(entity, "COLLIDER");
  if (candidate === void 0) return void 0;
  const value = record4(candidate);
  const offset = finiteVector(value.offset) ? value.offset : vector(0, 0);
  return {
    ...candidate,
    offset,
    mask: layerMask(value.mask),
    material: validMaterial(value.material, settings.defaultMaterial)
  };
}
function rigidbodyOf(entity) {
  const candidate = componentOf(entity, "RIGIDBODY");
  return candidate;
}
function bodyFromEntity(entity, settings) {
  if (entity.active === false) return void 0;
  const collider3 = colliderOf(entity, settings);
  if (collider3 === void 0 || collider3.enabled === false) return void 0;
  const transform3 = transformOf(entity);
  const rb = rigidbodyOf(entity);
  const value = rb === void 0 ? {} : record4(rb);
  const freezePositionValue = value.freezePosition;
  const freezePosition = freezePositionValue !== null && typeof freezePositionValue === "object" ? {
    x: Boolean(freezePositionValue.x),
    y: Boolean(freezePositionValue.y)
  } : {
    x: Boolean(value.freezePositionX),
    y: Boolean(value.freezePositionY)
  };
  const bodyType = rb?.bodyType ?? "STATIC";
  return freezeDeep({
    entityId: String(entity.entityId),
    componentId: String(collider3.componentId),
    bodyType,
    position: vector(transform3.x, transform3.y),
    scale: vector(transform3.scaleX, transform3.scaleY),
    velocity: vector(0, 0),
    angle: transform3.rotation,
    angularVelocity: 0,
    mass: rb?.mass ?? 1,
    gravityScale: rb?.gravityScale ?? 0,
    linearDrag: typeof value.linearDrag === "number" && Number.isFinite(value.linearDrag) && value.linearDrag >= 0 ? value.linearDrag : 0,
    angularDrag: typeof value.angularDrag === "number" && Number.isFinite(value.angularDrag) && value.angularDrag >= 0 ? value.angularDrag : 0,
    freezePosition,
    freezeRotation: Boolean(value.freezeRotation ?? rb?.fixedRotation ?? false),
    simulated: value.simulated !== false && rb?.enabled !== false,
    collisionDetection: value.collisionDetection === "CONTINUOUS" ? "CONTINUOUS" : "DISCRETE",
    interpolation: value.interpolation === "INTERPOLATE" ? "INTERPOLATE" : "NONE",
    collider: collider3
  });
}
function createPhysics2DWorld(scene, settings) {
  const sceneSettings = scene.physics2D;
  const normalized = normalizePhysics2DSettings({
    ...sceneSettings,
    ...settings
  });
  const validation = validatePhysics2DScene({
    ...scene,
    physics2D: normalized
  });
  if (!validation.valid) throw new Error(`Invalid Physics2D scene: ${validation.diagnostics.join(",")}`);
  const bodies = scene.entities.map((entity) => bodyFromEntity(entity, normalized)).filter((body) => body !== void 0).sort((left, right) => left.entityId.localeCompare(right.entityId) || left.componentId.localeCompare(right.componentId));
  return freezeDeep({
    settings: normalized,
    bodies,
    activeContactIds: [],
    tick: 0,
    accumulator: 0
  });
}
function dimensions(body) {
  const collider3 = body.collider;
  if (collider3.shape === "CIRCLE") return {
    width: collider3.radius * 2,
    height: collider3.radius * 2
  };
  if (collider3.shape === "CAPSULE") return {
    width: Math.max(collider3.width, collider3.radius * 2),
    height: Math.max(collider3.height, collider3.radius * 2)
  };
  return {
    width: collider3.width,
    height: collider3.height
  };
}
function colliderAABB(body, transformScale = vector(1, 1)) {
  const size = dimensions(body);
  const width = Math.abs(transformScale.x) * size.width;
  const height = Math.abs(transformScale.y) * size.height;
  const offset = body.collider.offset ?? vector(0, 0);
  const centerX = body.position.x + offset.x * transformScale.x;
  const centerY = body.position.y + offset.y * transformScale.y;
  return {
    minX: centerX - width / 2,
    minY: centerY - height / 2,
    maxX: centerX + width / 2,
    maxY: centerY + height / 2
  };
}
function intersects(a, b, touching = false) {
  const epsilon = touching ? 1e-9 : 0;
  return a.minX <= b.maxX + epsilon && a.maxX >= b.minX - epsilon && a.minY <= b.maxY + epsilon && a.maxY >= b.minY - epsilon;
}
function pairId(a, b, kind) {
  const entities = [
    a.entityId,
    b.entityId
  ].sort();
  return `${kind}|${entities[0]}|${entities[1]}`;
}
function maskAllows(body, other) {
  const mask = body.collider.mask;
  const bit = GAME350_PHYSICS_LAYER_BITS[other.collider.layer];
  return mask === void 0 || (mask & bit) !== 0;
}
function canPair(a, b) {
  return a.entityId !== b.entityId && a.simulated && b.simulated && maskAllows(a, b) && maskAllows(b, a);
}
function inverseMass(body) {
  return body.bodyType === "DYNAMIC" && body.simulated ? 1 / body.mass : 0;
}
function withBody(body, changes) {
  return {
    ...body,
    ...changes,
    position: changes.position ?? body.position,
    velocity: changes.velocity ?? body.velocity,
    collider: changes.collider ?? body.collider
  };
}
function resolvePair(a, b) {
  if (a.collider.isTrigger || b.collider.isTrigger) return [
    a,
    b
  ];
  const boxA = colliderAABB(a, a.scale);
  const boxB = colliderAABB(b, b.scale);
  const overlapX = Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX);
  const overlapY = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
  if (overlapX <= 0 || overlapY <= 0) return [
    a,
    b
  ];
  const relativeX = Math.abs(a.velocity.x - b.velocity.x);
  const relativeY = Math.abs(a.velocity.y - b.velocity.y);
  const moveX = relativeX > relativeY ? overlapX < overlapY : relativeY > relativeX ? false : overlapX < overlapY;
  const sign = moveX ? a.position.x < b.position.x ? -1 : 1 : a.position.y < b.position.y ? -1 : 1;
  const amount = moveX ? overlapX : overlapY;
  const totalInverseMass = inverseMass(a) + inverseMass(b);
  if (totalInverseMass === 0) return [
    a,
    b
  ];
  const aShare = inverseMass(a) / totalInverseMass;
  const bShare = inverseMass(b) / totalInverseMass;
  const aPosition = {
    ...a.position,
    ...moveX ? {
      x: a.position.x + sign * amount * aShare
    } : {
      y: a.position.y + sign * amount * aShare
    }
  };
  const bPosition = {
    ...b.position,
    ...moveX ? {
      x: b.position.x - sign * amount * bShare
    } : {
      y: b.position.y - sign * amount * bShare
    }
  };
  const restitution = Math.max(a.collider.material?.bounciness ?? 0, b.collider.material?.bounciness ?? 0);
  const friction = Math.min(1, ((a.collider.material?.friction ?? 0) + (b.collider.material?.friction ?? 0)) / 2);
  const aVelocity = {
    ...a.velocity
  };
  const bVelocity = {
    ...b.velocity
  };
  const normalKey = moveX ? "x" : "y";
  const relative = a.velocity[normalKey] - b.velocity[normalKey];
  if (relative * sign < 0) {
    const impulse = -(1 + restitution) * relative / totalInverseMass;
    aVelocity[normalKey] += impulse * aShare;
    bVelocity[normalKey] -= impulse * bShare;
  }
  if (moveX) {
    aVelocity.y *= 1 - friction * 0.5;
    bVelocity.y *= 1 - friction * 0.5;
  } else {
    aVelocity.x *= 1 - friction * 0.5;
    bVelocity.x *= 1 - friction * 0.5;
  }
  return [
    withBody(a, {
      position: aPosition,
      velocity: aVelocity
    }),
    withBody(b, {
      position: bPosition,
      velocity: bVelocity
    })
  ];
}
function applyConstraints(body, positionReference = body.position) {
  const velocity = {
    ...body.velocity
  };
  const position2 = {
    ...body.position
  };
  if (body.freezePosition.x) {
    velocity.x = 0;
    position2.x = positionReference.x;
  }
  if (body.freezePosition.y) {
    velocity.y = 0;
    position2.y = positionReference.y;
  }
  const angularVelocity = body.freezeRotation ? 0 : body.angularVelocity;
  return withBody(body, {
    position: position2,
    velocity,
    angularVelocity
  });
}
function integrate(world, input) {
  const dt = world.settings.fixedDeltaTime;
  return world.bodies.map((original) => {
    if (!original.simulated || original.bodyType === "STATIC") return original;
    const suppliedVelocity = input.velocityByEntityId?.[original.entityId];
    const force = input.forceByEntityId?.[original.entityId] ?? vector(0, 0);
    const suppliedAngular = input.angularVelocityByEntityId?.[original.entityId];
    const acceleration = original.bodyType === "DYNAMIC" ? {
      x: world.settings.gravity.x * original.gravityScale + force.x / original.mass,
      y: world.settings.gravity.y * original.gravityScale + force.y / original.mass
    } : vector(0, 0);
    const velocity = suppliedVelocity === void 0 ? {
      x: original.velocity.x + acceleration.x * dt,
      y: original.velocity.y + acceleration.y * dt
    } : {
      x: suppliedVelocity.x,
      y: suppliedVelocity.y
    };
    const drag = 1 / (1 + original.linearDrag * dt);
    velocity.x *= drag;
    velocity.y *= drag;
    const position2 = {
      x: original.position.x + velocity.x * dt,
      y: original.position.y + velocity.y * dt
    };
    const angularVelocity = (suppliedAngular ?? original.angularVelocity) / (1 + original.angularDrag * dt);
    return applyConstraints(withBody(original, {
      position: position2,
      velocity,
      angularVelocity,
      angle: original.angle + angularVelocity * dt
    }), original.position);
  });
}
function contactEvents(previous, current, bodiesById) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const all = [
    .../* @__PURE__ */ new Set([
      ...previous,
      ...current
    ])
  ].sort();
  return all.map((id) => {
    const [, entityA, entityB] = id.split("|");
    const kind = id.startsWith("TRIGGER|") ? "TRIGGER" : "COLLISION";
    const phase = currentSet.has(id) ? previousSet.has(id) ? "STAY" : "ENTER" : "EXIT";
    return {
      id,
      kind,
      phase,
      entityA: entityA ?? "",
      entityB: entityB ?? ""
    };
  }).filter((contact) => bodiesById.has(contact.entityA) || bodiesById.has(contact.entityB));
}
function activeContacts(bodies) {
  const result2 = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      if (!canPair(a, b)) continue;
      const aabb = colliderAABB(a, a.scale);
      const babb = colliderAABB(b, b.scale);
      if (intersects(aabb, babb, true)) result2.push(pairId(a, b, a.collider.isTrigger || b.collider.isTrigger ? "TRIGGER" : "COLLISION"));
    }
  }
  return result2.sort();
}
function stepPhysics2D(world, input = {}) {
  let bodies = integrate(world, input);
  const positionReferences = new Map(bodies.map((body) => [
    body.entityId,
    body.position
  ]));
  const pairs = bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => [
    a,
    b
  ])).filter(([a, b]) => canPair(a, b) && !a.collider.isTrigger && !b.collider.isTrigger).sort(([a, b], [c, d]) => pairId(a, b, "COLLISION").localeCompare(pairId(c, d, "COLLISION")));
  for (const [a, b] of pairs) {
    const aIndex = bodies.findIndex((body) => body.entityId === a.entityId);
    const bIndex = bodies.findIndex((body) => body.entityId === b.entityId);
    if (aIndex < 0 || bIndex < 0) continue;
    const [nextA, nextB] = resolvePair(bodies[aIndex], bodies[bIndex]);
    bodies[aIndex] = applyConstraints(nextA);
    bodies[bIndex] = applyConstraints(nextB);
  }
  bodies = bodies.map((body) => applyConstraints(body, positionReferences.get(body.entityId) ?? body.position));
  bodies.sort((left, right) => left.entityId.localeCompare(right.entityId) || left.componentId.localeCompare(right.componentId));
  const nextContactIds = activeContacts(bodies);
  const byId = new Map(bodies.map((body) => [
    body.entityId,
    body
  ]));
  const events = contactEvents(world.activeContactIds, nextContactIds, byId);
  const nextWorld = freezeDeep({
    ...world,
    bodies,
    activeContactIds: nextContactIds,
    tick: world.tick + 1,
    accumulator: 0
  });
  return {
    world: nextWorld,
    events: freezeDeep(events)
  };
}
function advancePhysics2D(world, elapsedSeconds, input = {}) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error("Physics2D elapsed time must be a finite non-negative number.");
  const dt = world.settings.fixedDeltaTime;
  const requested = world.accumulator + elapsedSeconds;
  const bounded2 = Math.min(requested, dt * world.settings.maxSubSteps);
  let current = {
    ...world,
    accumulator: bounded2
  };
  const events = [];
  let steps = 0;
  while (current.accumulator + 1e-12 >= dt && steps < world.settings.maxSubSteps) {
    const stepped = stepPhysics2D(current, input);
    events.push(...stepped.events);
    current = {
      ...stepped.world,
      accumulator: current.accumulator - dt
    };
    steps += 1;
  }
  const droppedTime = Math.max(0, requested - bounded2);
  return {
    world: freezeDeep(current),
    events: freezeDeep(events),
    steps,
    droppedTime
  };
}

// src/game/game-310/core.ts
var asActionId = (value) => asIdentifier(value, "actionId");
function asIdentifier(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
  return value;
}

// src/game/game-350/runtime-core.ts
var GAME_RUNTIME_PROFILE_SCHEMA_VERSION2 = 1;
var GAME_RUNTIME_PROFILE_IDS = Object.freeze({
  TOP_DOWN_RPG: "top-down-rpg",
  ACTION_2D: "action-2d",
  SHOOTER_2D: "shooter-2d",
  RACING_2D: "racing-2d",
  RHYTHM: "rhythm",
  ACTION_3D: "action-3d",
  OPEN_WORLD_3D: "open-world-3d",
  INTERACTIVE_3D: "interactive-3d"
});
var BUILT_IN_PROFILES = Object.freeze([
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG,
    genre: "TOP_DOWN_RPG",
    label: "Top-down RPG",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "AVAILABLE",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "COLLISION_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_2D,
    genre: "ACTION_2D",
    label: "2D Action",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "FOUNDATION",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.SHOOTER_2D,
    genre: "SHOOTER_2D",
    label: "2D Shooter",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.RACING_2D,
    genre: "RACING_2D",
    label: "2D Racing",
    dimension: "2D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "VEHICLE_PHYSICS",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.RHYTHM,
    genre: "RHYTHM",
    label: "Rhythm",
    dimension: "2D",
    executionModel: "AUDIO_CLOCK",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "AUDIO_TIMELINE",
      "SAVE_STATE",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_3D,
    genre: "ACTION_3D",
    label: "3D Action",
    dimension: "3D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.OPEN_WORLD_3D,
    genre: "OPEN_WORLD_3D",
    label: "Open World 3D",
    dimension: "3D",
    executionModel: "NETWORK_AUTHORITATIVE",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "WORLD_STREAMING",
      "NETWORK_REPLICATION",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY"
    ]
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION2,
    profileId: GAME_RUNTIME_PROFILE_IDS.INTERACTIVE_3D,
    genre: "INTERACTIVE_3D",
    label: "Interactive 3D",
    dimension: "3D",
    executionModel: "CUSTOM",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "AUDIO_TIMELINE",
      "UI_OVERLAY",
      "SCRIPT_EXTENSION"
    ]
  }
]);
function stable(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function diagnostic6(code, path, message) {
  return {
    code,
    path,
    message
  };
}
function validateGameRuntimeProfile(profile) {
  const diagnostics = [];
  if (profile.schemaVersion !== GAME_RUNTIME_PROFILE_SCHEMA_VERSION2) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "schemaVersion", "Runtime profile schema is unsupported."));
  }
  if (!stable(profile.profileId)) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "profileId", "Runtime profile id is not stable."));
  }
  if (!profile.label.trim()) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "label", "Runtime profile label is required."));
  }
  if (profile.genre === "CUSTOM" && profile.profileId.length === 0) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "profileId", "Custom runtime profile id is required."));
  }
  if (profile.dimension !== "2D" && profile.dimension !== "3D") {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "dimension", "Runtime profile dimension is unsupported."));
  }
  if (!Array.isArray(profile.capabilities) || profile.capabilities.length === 0) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "capabilities", "Runtime profile must declare capabilities."));
  } else if (new Set(profile.capabilities).size !== profile.capabilities.length) {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "capabilities", "Runtime profile capabilities must be unique."));
  }
  if (profile.status !== "AVAILABLE" && profile.status !== "FOUNDATION" && profile.status !== "PLANNED") {
    diagnostics.push(diagnostic6("INVALID_PROFILE", "status", "Runtime profile status is unsupported."));
  }
  return {
    valid: diagnostics.length === 0,
    diagnostics
  };
}
function assertProfile(profile) {
  const validation = validateGameRuntimeProfile(profile);
  if (!validation.valid) {
    throw new Error(validation.diagnostics.map((item) => `${item.code}:${item.path}`).join(", "));
  }
}
function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze([
      ...profile.capabilities
    ])
  });
}
function createRegistry(profiles) {
  const byId = /* @__PURE__ */ new Map();
  for (const profile of profiles) {
    assertProfile(profile);
    if (byId.has(profile.profileId)) {
      throw new Error(`DUPLICATE_PROFILE:${profile.profileId}`);
    }
    byId.set(profile.profileId, freezeProfile(profile));
  }
  const ordered = Object.freeze([
    ...byId.values()
  ]);
  return {
    profiles: ordered,
    resolve(profileId) {
      return byId.get(profileId);
    },
    register(profile) {
      return createRegistry([
        ...ordered,
        profile
      ]);
    }
  };
}
var GAME_RUNTIME_PROFILES = createRegistry(BUILT_IN_PROFILES);
var DEFAULT_GAME_RUNTIME_PROFILE_ID = GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG;

// src/game/game-350/tilemap-authoring.ts
var GAME350_TILEMAP_MAX_WIDTH = Number.MAX_SAFE_INTEGER;
var GAME350_TILEMAP_MAX_HEIGHT = Number.MAX_SAFE_INTEGER;
var GAME350_TILEMAP_MAX_CELLS = Number.MAX_SAFE_INTEGER;
function freezeDeep2(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep2(child);
    }
  }
  return value;
}
function cellKey2(x, y) {
  return `${x},${y}`;
}
function cellSort(left, right) {
  return left.y - right.y || left.x - right.x;
}
function idIsValid(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}
function assertDimensions(mapId, width, height, tileSize) {
  if (!idIsValid(mapId)) throw new Error("Tilemap mapId is invalid.");
  if (!Number.isSafeInteger(width) || width < 1 || width > GAME350_TILEMAP_MAX_WIDTH) {
    throw new Error("Tilemap width must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(height) || height < 1 || height > GAME350_TILEMAP_MAX_HEIGHT) {
    throw new Error("Tilemap height must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(tileSize) || tileSize < 1 || tileSize > 4096) {
    throw new Error("Tilemap tileSize must be an integer between 1 and 4096.");
  }
}
function normalizeCells(cells = [], width, height) {
  const byKey = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) {
      throw new Error("Tilemap cell must be inside the document bounds.");
    }
    if (cell.collision !== "NONE" && cell.collision !== "SOLID") {
      throw new Error("Tilemap cell collision must be NONE or SOLID.");
    }
    if (cell.triggerId !== void 0 && !idIsValid(cell.triggerId)) {
      throw new Error("Tilemap triggerId is invalid.");
    }
    if (cell.blockTypeId !== void 0 && !idIsValid(cell.blockTypeId)) {
      throw new Error("Tilemap blockTypeId is invalid.");
    }
    if (cell.collision === "NONE" && cell.triggerId === void 0 && cell.blockTypeId === void 0) {
      throw new Error("An empty tilemap cell must not be persisted.");
    }
    const key = cellKey2(cell.x, cell.y);
    if (byKey.has(key)) throw new Error(`Duplicate tilemap cell: ${key}`);
    byKey.set(key, {
      x: cell.x,
      y: cell.y,
      collision: cell.collision,
      ...cell.triggerId === void 0 ? {} : {
        triggerId: cell.triggerId
      },
      ...cell.blockTypeId === void 0 ? {} : {
        blockTypeId: cell.blockTypeId
      }
    });
  }
  return [
    ...byKey.values()
  ].sort(cellSort);
}
function documentFrom(options) {
  const tileSize = options.tileSize ?? 1;
  assertDimensions(options.mapId, options.width, options.height, tileSize);
  const cells = normalizeCells(options.cells, options.width, options.height);
  return freezeDeep2({
    schemaVersion: GAME_TILEMAP_DOCUMENT_SCHEMA_VERSION,
    mapId: options.mapId,
    width: options.width,
    height: options.height,
    tileSize,
    cells
  });
}
function validateGameTilemapDocument(value) {
  if (!isValidGameTilemapDocument(value)) {
    return {
      valid: false,
      diagnostics: [
        "document"
      ]
    };
  }
  const sorted = [
    ...value.cells
  ].sort(cellSort);
  const canonical = JSON.stringify(sorted);
  if (canonical !== JSON.stringify(value.cells)) {
    return {
      valid: false,
      diagnostics: [
        "cells.order"
      ]
    };
  }
  return {
    valid: true,
    diagnostics: []
  };
}
function createGameTilemapDocument(options) {
  return documentFrom(options);
}
function createDefaultRpgTilemapDocument(mapId = "map:tilemap") {
  const width = 12;
  const height = 8;
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        cells.push({
          x,
          y,
          collision: "SOLID"
        });
      }
    }
  }
  cells.push({
    x: 3,
    y: 2,
    collision: "SOLID"
  }, {
    x: 4,
    y: 2,
    collision: "SOLID"
  }, {
    x: 2,
    y: 1,
    collision: "NONE",
    triggerId: "rpg.start"
  });
  return createGameTilemapDocument({
    mapId,
    width,
    height,
    cells
  });
}
function gameTilemapCellAt(document2, x, y) {
  let low = 0;
  let high = document2.cells.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cell = document2.cells[middle];
    if (cell === void 0) return void 0;
    const comparison = cell.y - y || cell.x - x;
    if (comparison === 0) return cell;
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  return void 0;
}
function assertCellCoordinate(document2, x, y) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || x >= document2.width || y < 0 || y >= document2.height) {
    throw new Error("Tilemap cell is outside the document bounds.");
  }
}
function withCell(document2, x, y, patch) {
  assertCellCoordinate(document2, x, y);
  const existing = gameTilemapCellAt(document2, x, y);
  const nextCell = patch === null ? void 0 : {
    x,
    y,
    collision: patch.collision ?? existing?.collision ?? "NONE",
    ...patch.triggerId === null ? {} : patch.triggerId !== void 0 ? {
      triggerId: patch.triggerId
    } : existing?.triggerId === void 0 ? {} : {
      triggerId: existing.triggerId
    }
  };
  if (existing !== void 0 && nextCell !== void 0 && JSON.stringify(existing) === JSON.stringify(nextCell)) return document2;
  if (existing === void 0 && nextCell === void 0) return document2;
  const cells = document2.cells.filter((cell) => !(cell.x === x && cell.y === y));
  if (nextCell !== void 0 && !(nextCell.collision === "NONE" && nextCell.triggerId === void 0)) {
    cells.push(nextCell);
  }
  return documentFrom({
    mapId: document2.mapId,
    width: document2.width,
    height: document2.height,
    tileSize: document2.tileSize,
    cells
  });
}
function setGameTilemapCell(document2, x, y, patch) {
  return withCell(document2, x, y, patch);
}
function clearGameTilemapCell(document2, x, y) {
  return withCell(document2, x, y, null);
}
function paintGameTilemapCell(document2, x, y, mode, triggerId = "rpg.cell-trigger") {
  switch (mode) {
    case "SOLID":
      return setGameTilemapCell(document2, x, y, {
        collision: "SOLID",
        triggerId: null
      });
    case "TRIGGER":
      return setGameTilemapCell(document2, x, y, {
        collision: "NONE",
        triggerId
      });
    case "ERASE":
      return clearGameTilemapCell(document2, x, y);
  }
}
function solidGameTilemapCells(document2) {
  return document2.cells.filter((cell) => cell.collision === "SOLID");
}
function triggerGameTilemapCells(document2) {
  return document2.cells.filter((cell) => cell.triggerId !== void 0);
}

// src/game/game-350/playable-slice.ts
var GAME351_PLAYABLE_SCHEMA_VERSION = 1;
var GAME351_FIXED_STEP_TICKS = 1;
var GAME351_INPUT_ACTIONS = Object.freeze({
  MOVE_UP: asActionId("rpg.move.up"),
  MOVE_DOWN: asActionId("rpg.move.down"),
  MOVE_LEFT: asActionId("rpg.move.left"),
  MOVE_RIGHT: asActionId("rpg.move.right")
});
var GAME351_INTERACT_ACTION = asActionId("rpg.interact");
var GAME351_TAP_ACTION = asActionId("rpg.tap");
var GAME351_PHYSICS2D_MOVE_SPEED = 4;
var GAME351_TILEMAP_RUNTIME_CHUNK_SIZE = 32;
var GAME351_TILEMAP_RUNTIME_CHUNK_RADIUS = 1;
function game351TilemapCellsInRuntimeWindow(map, center, chunkSize = GAME351_TILEMAP_RUNTIME_CHUNK_SIZE, chunkRadius = GAME351_TILEMAP_RUNTIME_CHUNK_RADIUS) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
    throw new Error("GAME-351 tilemap chunkSize must be a positive integer.");
  }
  const radius = Math.max(0, Math.floor(chunkRadius));
  const centerChunkX = Math.floor(center.x / chunkSize);
  const centerChunkY = Math.floor(center.y / chunkSize);
  const resident = (x, y) => Math.abs(Math.floor(x / chunkSize) - centerChunkX) <= radius && Math.abs(Math.floor(y / chunkSize) - centerChunkY) <= radius;
  return {
    solidCells: map.solidCells.filter((cell) => resident(cell.x, cell.y)),
    triggerCells: map.triggerCells.filter((cell) => resident(cell.x, cell.y))
  };
}
function freezeDeep3(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep3(child);
    }
  }
  return value;
}
function position(x, y) {
  return {
    x,
    y
  };
}
function clonePosition(value) {
  return position(value.x, value.y);
}
function cellKey3(value) {
  return `${value.x},${value.y}`;
}
function camera2DSettingsForProject(project, scene) {
  const editorCamera = project.editorTimeline?.tracks.flatMap((track) => track.components ?? []).find((component) => component.type === "CAMERA");
  const sceneCamera = scene.entities.flatMap((entity) => entity.components).find((component) => component.type === "CAMERA");
  return normalizeCamera2DSettings(editorCamera?.camera2D ?? sceneCamera?.camera2D);
}
function transform(componentId, x, y) {
  return {
    type: "TRANSFORM",
    componentId: asComponentId(componentId),
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  };
}
function collider(componentId, layer) {
  return {
    type: "COLLIDER",
    componentId: asComponentId(componentId),
    shape: "BOX",
    width: 0.8,
    height: 0.8,
    radius: 0.4,
    isTrigger: false,
    layer,
    enabled: true
  };
}
function rigidbody(componentId, bodyType) {
  return {
    type: "RIGIDBODY",
    componentId: asComponentId(componentId),
    bodyType,
    mass: 1,
    gravityScale: 0,
    fixedRotation: true,
    enabled: true
  };
}
function entityTransform(project, sceneId, entityId) {
  const scene = project.scenes.find((item) => item.sceneId === sceneId);
  const target = scene?.entities.find((item) => item.entityId === entityId);
  const component = target?.components.find((item) => item.type === "TRANSFORM");
  if (component === void 0 || !Number.isSafeInteger(component.x) || !Number.isSafeInteger(component.y)) {
    throw new Error(`Entity ${String(entityId)} must have an integer Transform.`);
  }
  return position(component.x, component.y);
}
function inBounds(bounds, value) {
  return value.x >= bounds.minX && value.x <= bounds.maxX && value.y >= bounds.minY && value.y <= bounds.maxY;
}
function validateMap(map) {
  if (!Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height) || map.width < 1 || map.height < 1) throw new Error("RPG map dimensions must be positive integers.");
  if (map.bounds.minX > map.bounds.maxX || map.bounds.minY > map.bounds.maxY) {
    throw new Error("RPG collision bounds are invalid.");
  }
  const seen = /* @__PURE__ */ new Set();
  for (const cell of map.solidCells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || !inBounds(map.bounds, cell)) {
      throw new Error("RPG solid cells must be integer cells inside collision bounds.");
    }
    if (seen.has(cellKey3(cell))) {
      throw new Error(`RPG solid cell is duplicated: ${cellKey3(cell)}`);
    }
    seen.add(cellKey3(cell));
  }
  const triggerIds = /* @__PURE__ */ new Set();
  for (const cell of map.triggerCells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || !inBounds(map.bounds, cell) || typeof cell.triggerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(cell.triggerId)) {
      throw new Error("RPG trigger cells must be valid integer cells with stable IDs.");
    }
    const key = cellKey3(cell);
    if (seen.has(key)) {
      throw new Error(`RPG map cell cannot be both solid and trigger: ${key}`);
    }
    if (triggerIds.has(cell.triggerId)) {
      throw new Error(`RPG trigger id is duplicated: ${cell.triggerId}`);
    }
    triggerIds.add(cell.triggerId);
    seen.add(key);
  }
}
function validatePhysics2DMap(map) {
  validateMap(map);
  const { minX, minY, maxX, maxY } = map.bounds;
  if (![
    minX,
    minY,
    maxX,
    maxY
  ].every(Number.isSafeInteger)) {
    throw new Error("RPG collision bounds must be safe integer coordinates.");
  }
  if (map.width !== maxX - minX + 1 || map.height !== maxY - minY + 1) {
    throw new Error("RPG map dimensions must match collision bounds.");
  }
}
function coordinateId(value) {
  return value < 0 ? `n${Math.abs(value)}` : `p${value}`;
}
function physics2DId(sceneId, kind, suffix) {
  return `physics2d:${String(sceneId)}:${kind}:${suffix}`;
}
function staticWorldEntity(entityId, componentPrefix, name, x, y, width, height) {
  const worldCollider = collider(`${componentPrefix}:collider`, "WORLD");
  return {
    entityId: asEntityId(entityId),
    name,
    components: [
      transform(`${componentPrefix}:transform`, x, y),
      {
        ...worldCollider,
        width,
        height,
        radius: Math.min(width, height) / 2,
        mask: [
          "PLAYER",
          "NPC"
        ]
      },
      rigidbody(`${componentPrefix}:rigidbody`, "STATIC")
    ]
  };
}
function staticTriggerEntity(entityId, componentPrefix, triggerId, x, y) {
  const triggerCollider = collider(`${componentPrefix}:collider`, "WORLD");
  return {
    entityId: asEntityId(entityId),
    name: `RPG Trigger (${triggerId})`,
    components: [
      transform(`${componentPrefix}:transform`, x, y),
      {
        ...triggerCollider,
        layer: "SENSOR",
        isTrigger: true,
        mask: [
          "PLAYER",
          "NPC"
        ]
      },
      rigidbody(`${componentPrefix}:rigidbody`, "STATIC")
    ]
  };
}
function physics2DPlayerBody(world) {
  const players = world.bodies.filter((body) => body.bodyType === "DYNAMIC" && body.collider.layer === "PLAYER");
  if (players.length !== 1) {
    throw new Error("GAME-351 Physics2D preview requires exactly one dynamic PLAYER body.");
  }
  return players[0];
}
function createGame351PlayableSnapshot(template) {
  const validation = validateGameProject2(template.project, template.caller);
  if (!validation.valid) {
    throw new Error(`Cannot compile invalid RPG Project: ${validation.diagnostics.map((item) => item.code).join(",")}`);
  }
  validateMap(template.map);
  const scene = template.project.scenes.find((item) => item.sceneId === template.sceneId);
  if (scene === void 0) {
    throw new Error(`Scene ${String(template.sceneId)} is not part of the Project.`);
  }
  const player = scene.entities.find((item) => item.entityId === template.playerEntityId);
  const npc = scene.entities.find((item) => item.entityId === template.npcEntityId);
  if (player === void 0 || npc === void 0) {
    throw new Error("RPG template must contain Player and NPC entities in its Scene.");
  }
  const playerPosition = entityTransform(template.project, template.sceneId, template.playerEntityId);
  const npcPosition = entityTransform(template.project, template.sceneId, template.npcEntityId);
  if (!inBounds(template.map.bounds, playerPosition) || !inBounds(template.map.bounds, npcPosition)) throw new Error("RPG actors must start inside collision bounds.");
  const solid = new Set(template.map.solidCells.map(cellKey3));
  if (solid.has(cellKey3(playerPosition)) || solid.has(cellKey3(npcPosition))) {
    throw new Error("RPG actors may not start on solid cells.");
  }
  const camera2D = camera2DSettingsForProject(template.project, scene);
  return freezeDeep3({
    schemaVersion: GAME351_PLAYABLE_SCHEMA_VERSION,
    projectId: template.project.projectId,
    ownerId: template.project.ownerId,
    projectRevisionId: template.project.revision.revisionId,
    projectHash: template.project.revision.snapshotHash,
    sceneId: template.sceneId,
    playerEntityId: template.playerEntityId,
    playerPosition: clonePosition(playerPosition),
    npcEntityId: template.npcEntityId,
    npcPosition: clonePosition(npcPosition),
    collisionBounds: {
      ...template.map.bounds
    },
    solidCells: template.map.solidCells.map((cell) => clonePosition(cell)),
    triggerCells: template.map.triggerCells.map((cell) => ({
      ...cell
    })),
    camera2D
  });
}
function createGame351Physics2DScene(template, options = {}) {
  createGame351PlayableSnapshot(template);
  validatePhysics2DMap(template.map);
  const sourceScene = template.project.scenes.find((scene) => scene.sceneId === template.sceneId);
  if (sourceScene === void 0) {
    throw new Error(`Scene ${String(template.sceneId)} is not part of the Project.`);
  }
  const player = sourceScene.entities.find((entity) => entity.entityId === template.playerEntityId);
  const playerCollider = player?.components.find((component) => component.type === "COLLIDER");
  const playerRigidbody = player?.components.find((component) => component.type === "RIGIDBODY");
  if (player === void 0 || playerCollider?.type !== "COLLIDER" || playerRigidbody?.type !== "RIGIDBODY" || playerCollider.layer !== "PLAYER" || playerRigidbody.bodyType !== "DYNAMIC" || playerCollider.enabled === false || playerRigidbody.enabled === false) {
    throw new Error("GAME-351 Physics2D preview requires an enabled dynamic PLAYER Collider and Rigidbody.");
  }
  const entities = sourceScene.entities.filter((entity) => entity.entityId === template.playerEntityId || entity.entityId === template.npcEntityId).map((entity) => ({
    ...entity,
    components: entity.components.map((component) => ({
      ...component
    }))
  }));
  const entityIds = new Set(entities.map((entity) => String(entity.entityId)));
  const componentIds2 = new Set(entities.flatMap((entity) => entity.components.map((component) => String(component.componentId))));
  const appendGenerated = (generated) => {
    const entityKey = String(generated.entityId);
    if (entityIds.has(entityKey)) {
      throw new Error(`Physics2D generated Entity ID collides: ${entityKey}`);
    }
    const generatedComponentIds = generated.components.map((component) => String(component.componentId));
    if (new Set(generatedComponentIds).size !== generatedComponentIds.length || generatedComponentIds.some((componentId) => componentIds2.has(componentId))) {
      throw new Error(`Physics2D generated Component ID collides for Entity: ${entityKey}`);
    }
    entityIds.add(entityKey);
    generatedComponentIds.forEach((componentId) => componentIds2.add(componentId));
    entities.push(generated);
  };
  const runtimeCells = game351TilemapCellsInRuntimeWindow(template.map, options.tilemapCenter ?? entityTransform(template.project, template.sceneId, template.playerEntityId), options.tilemapChunkSize, options.tilemapChunkRadius);
  const cells = [
    ...runtimeCells.solidCells
  ].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const cell of cells) {
    const suffix = `${coordinateId(cell.x)}:${coordinateId(cell.y)}`;
    const id = physics2DId(template.sceneId, "solid", suffix);
    appendGenerated(staticWorldEntity(id, id, `RPG Solid Cell (${cell.x},${cell.y})`, cell.x, cell.y, 1, 1));
  }
  const triggers = [
    ...runtimeCells.triggerCells
  ].sort((left, right) => left.y - right.y || left.x - right.x || left.triggerId.localeCompare(right.triggerId));
  for (const trigger of triggers) {
    const id = physics2DId(template.sceneId, "trigger", `${coordinateId(trigger.x)}:${coordinateId(trigger.y)}:${trigger.triggerId}`);
    appendGenerated(staticTriggerEntity(id, id, trigger.triggerId, trigger.x, trigger.y));
  }
  const { minX, minY, maxX, maxY } = template.map.bounds;
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const boundaries = [
    {
      name: "left",
      x: minX - 0.5,
      y: (minY + maxY) / 2,
      width: 1,
      height: spanY + 1
    },
    {
      name: "right",
      x: maxX + 0.5,
      y: (minY + maxY) / 2,
      width: 1,
      height: spanY + 1
    },
    {
      name: "top",
      x: (minX + maxX) / 2,
      y: minY - 0.5,
      width: spanX + 1,
      height: 1
    },
    {
      name: "bottom",
      x: (minX + maxX) / 2,
      y: maxY + 0.5,
      width: spanX + 1,
      height: 1
    }
  ];
  for (const boundary of boundaries) {
    const id = physics2DId(template.sceneId, "boundary", boundary.name);
    appendGenerated(staticWorldEntity(id, id, `RPG Map Boundary (${boundary.name})`, boundary.x, boundary.y, boundary.width, boundary.height));
  }
  const sourceSettings = sourceScene.physics2D;
  return {
    ...sourceScene,
    rootEntityIds: [
      ...sourceScene.rootEntityIds,
      ...entities.filter((entity) => String(entity.entityId).startsWith("physics2d:")).map((entity) => entity.entityId)
    ],
    entities,
    physics2D: normalizePhysics2DSettings({
      ...sourceSettings,
      ...options.settings ?? {}
    })
  };
}
function createGame351Physics2DWorld(template, options = {}) {
  const world = createPhysics2DWorld(createGame351Physics2DScene(template, options));
  const player = physics2DPlayerBody(world);
  if (player.entityId !== String(template.playerEntityId)) {
    throw new Error("GAME-351 Physics2D PLAYER body is not template-bound.");
  }
  return world;
}
function stepGame351Physics2D(world, input = {}) {
  const player = physics2DPlayerBody(world);
  const action = input.action;
  if (action !== void 0 && !validAction(action)) {
    throw new Error(`Invalid GAME-351 Physics2D action: ${String(action)}`);
  }
  if (action === void 0 || action === null) return stepPhysics2D(world);
  const delta = movement(action);
  const gravity = {
    x: world.settings.gravity.x * player.gravityScale * world.settings.fixedDeltaTime,
    y: world.settings.gravity.y * player.gravityScale * world.settings.fixedDeltaTime
  };
  return stepPhysics2D(world, {
    velocityByEntityId: {
      [player.entityId]: {
        x: delta.x * GAME351_PHYSICS2D_MOVE_SPEED + gravity.x,
        y: delta.y * GAME351_PHYSICS2D_MOVE_SPEED + gravity.y
      }
    }
  });
}
function validAction(value) {
  return value === null || Object.values(GAME351_INPUT_ACTIONS).includes(value);
}
function movement(action) {
  if (action === GAME351_INPUT_ACTIONS.MOVE_UP) return position(0, -1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_DOWN) return position(0, 1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_LEFT) return position(-1, 0);
  if (action === GAME351_INPUT_ACTIONS.MOVE_RIGHT) return position(1, 0);
  return position(0, 0);
}
var GAME351_RPG_RUNTIME_MODULE = {
  profile: GAME_RUNTIME_PROFILES.resolve(GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG),
  fixedStepTicks: GAME351_FIXED_STEP_TICKS,
  createInitialRuntime(snapshot) {
    return {
      mode: "STOPPED",
      tick: 0,
      sceneId: snapshot.sceneId,
      playerPosition: clonePosition(snapshot.playerPosition),
      npcPosition: clonePosition(snapshot.npcPosition),
      dialogue: null
    };
  },
  isValidAction(action) {
    return validAction(action);
  },
  step(snapshot, runtime, action) {
    const delta = movement(action);
    const candidate = position(runtime.playerPosition.x + delta.x, runtime.playerPosition.y + delta.y);
    const nextPlayerPosition = canEnterGame351Cell(snapshot, candidate) ? candidate : clonePosition(runtime.playerPosition);
    return {
      ...runtime,
      playerPosition: nextPlayerPosition,
      npcPosition: clonePosition(runtime.npcPosition)
    };
  },
  cloneRuntime(runtime) {
    return {
      ...runtime,
      playerPosition: clonePosition(runtime.playerPosition),
      npcPosition: clonePosition(runtime.npcPosition)
    };
  },
  stopRuntime(runtime) {
    return {
      ...runtime,
      dialogue: null
    };
  }
};
function canEnterGame351Cell(snapshot, value) {
  return inBounds(snapshot.collisionBounds, value) && !new Set(snapshot.solidCells.map(cellKey3)).has(cellKey3(value)) && cellKey3(value) !== cellKey3(snapshot.npcPosition);
}

// src/game/game-350/game-studio-systems.ts
var GAME_STUDIO_PHYSICS_INSPECTOR_FIELDS = Object.freeze({
  scene: Object.freeze([
    {
      id: "gravity",
      label: "\u91CD\u529B (Gravity)",
      detail: "X / Y \u306E\u30EF\u30FC\u30EB\u30C9\u91CD\u529B"
    },
    {
      id: "fixedDeltaTime",
      label: "\u56FA\u5B9Astep",
      detail: "\u6C7A\u5B9A\u7684\u306A\u7269\u7406\u66F4\u65B0\u9593\u9694"
    },
    {
      id: "maxSubSteps",
      label: "\u6700\u5927sub-step",
      detail: "\u9045\u5EF6\u6642\u306Ecatch-up\u4E0A\u9650"
    }
  ]),
  collider: Object.freeze([
    {
      id: "offset",
      label: "Offset",
      detail: "\u5F53\u305F\u308A\u5224\u5B9A\u4E2D\u5FC3\u306E\u305A\u308C"
    },
    {
      id: "mask",
      label: "Layer Mask",
      detail: "\u5224\u5B9A\u3059\u308B\u30EC\u30A4\u30E4\u30FC"
    },
    {
      id: "material",
      label: "Physics Material 2D",
      detail: "\u6469\u64E6 / \u53CD\u767A"
    },
    {
      id: "isTrigger",
      label: "Trigger",
      detail: "\u901A\u904E\u53EF\u80FD\u306A\u30A4\u30D9\u30F3\u30C8\u9818\u57DF"
    }
  ]),
  rigidbody: Object.freeze([
    {
      id: "linearDrag",
      label: "Linear Drag",
      detail: "\u79FB\u52D5\u901F\u5EA6\u306E\u6E1B\u8870"
    },
    {
      id: "angularDrag",
      label: "Angular Drag",
      detail: "\u56DE\u8EE2\u901F\u5EA6\u306E\u6E1B\u8870"
    },
    {
      id: "freezePosition",
      label: "Freeze Position",
      detail: "X / Y \u306E\u79FB\u52D5\u3092\u56FA\u5B9A"
    },
    {
      id: "simulated",
      label: "Simulated",
      detail: "\u7269\u7406\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u53C2\u52A0"
    },
    {
      id: "collisionDetection",
      label: "Collision Detection",
      detail: "Discrete / Continuous"
    },
    {
      id: "interpolation",
      label: "Interpolation",
      detail: "\u63CF\u753B\u88DC\u9593"
    }
  ])
});
var GAME_STUDIO_INPUT_ACTIONS = Object.freeze([
  {
    id: "move",
    label: "Move",
    detail: "\u65B9\u5411\u5165\u529B / \u56FA\u5B9A\u30B9\u30C6\u30C3\u30D7\u79FB\u52D5"
  },
  {
    id: "interact",
    label: "Interact",
    detail: "\u8FD1\u304F\u306ENPC\u30FB\u6249\u30FB\u5B9D\u7BB1\u3092\u8D77\u52D5"
  },
  {
    id: "jump",
    label: "Jump",
    detail: "\u30B8\u30E3\u30F3\u30D7\u30FB\u4E0A\u65B9\u5411\u306E\u52D5\u4F5C"
  },
  {
    id: "attack",
    label: "Attack",
    detail: "\u653B\u6483\u30FB\u5C04\u6483\u30A4\u30D9\u30F3\u30C8\u306E\u8D77\u70B9"
  },
  {
    id: "brake",
    label: "Brake",
    detail: "\u30EC\u30FC\u30B7\u30F3\u30B0\u306E\u6E1B\u901F\u30A4\u30D9\u30F3\u30C8\u306E\u8D77\u70B9"
  },
  {
    id: "confirm",
    label: "Confirm",
    detail: "UI\u30FB\u30EA\u30BA\u30E0\u5165\u529B\u306E\u78BA\u5B9A"
  }
]);
function componentIdFor(trackId, type) {
  const safeTrackId = trackId.replace(/[^A-Za-z0-9._:/-]/gu, "-");
  return asComponentId(`component:pixiedraw-game:${safeTrackId}:${type.toLowerCase()}`);
}

// src/game/game-350/template-registry.ts
var STABLE_ID3 = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
var TEMPLATE_MAX_INSTANCES = 512;
function isScalar(value) {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}
function valueMatchesField(field2, value) {
  if (!isScalar(value)) return false;
  switch (field2.type) {
    case "TEXT":
      return typeof value === "string";
    case "NUMBER":
      return typeof value === "number" && (field2.min === void 0 || value >= field2.min) && (field2.max === void 0 || value <= field2.max);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "SELECT":
      return typeof value === "string" && (field2.options ?? []).includes(value);
  }
}
function validateGameTemplateDefinition(definition) {
  if (!STABLE_ID3.test(definition.id) || definition.title.trim().length === 0 || definition.description.trim().length === 0 || ![
    "CORE",
    "RPG",
    "ACTION",
    "SHOOTING",
    "RACING",
    "RHYTHM"
  ].includes(definition.category) || ![
    "CHARACTER",
    "WEAPON",
    "ARMOR",
    "SKILL",
    "STATUS",
    "TILE",
    "DAMAGE",
    "UI"
  ].includes(definition.kind) || ![
    "SCENE_OBJECT",
    "GAME_DATA"
  ].includes(definition.target) || !Array.isArray(definition.tags) || !Array.isArray(definition.fields)) {
    return {
      valid: false,
      reason: "Template identity or collections are invalid."
    };
  }
  if (definition.target === "SCENE_OBJECT" && definition.trackBlueprint === void 0) {
    return {
      valid: false,
      reason: "Scene object templates require a blueprint."
    };
  }
  if (definition.target === "GAME_DATA" && definition.trackBlueprint !== void 0) {
    return {
      valid: false,
      reason: "Game data templates cannot contain a scene blueprint."
    };
  }
  const fieldIds = /* @__PURE__ */ new Set();
  for (const field2 of definition.fields) {
    if (!STABLE_ID3.test(field2.id) || field2.label.trim().length === 0 || fieldIds.has(field2.id) || !valueMatchesField(field2, field2.defaultValue)) return {
      valid: false,
      reason: `Template field is invalid: ${field2.id}`
    };
    if (field2.type === "NUMBER" && field2.min !== void 0 && field2.max !== void 0 && field2.min > field2.max) {
      return {
        valid: false,
        reason: `Template field range is invalid: ${field2.id}`
      };
    }
    if (field2.type === "SELECT" && (!Array.isArray(field2.options) || field2.options.length === 0 || new Set(field2.options).size !== field2.options.length)) {
      return {
        valid: false,
        reason: `Template options are invalid: ${field2.id}`
      };
    }
    fieldIds.add(field2.id);
  }
  return {
    valid: true
  };
}
function validateGameTemplateValues(definition, values) {
  const definitionValidation = validateGameTemplateDefinition(definition);
  if (!definitionValidation.valid) return definitionValidation;
  const fields = new Map(definition.fields.map((field2) => [
    field2.id,
    field2
  ]));
  for (const key of Object.keys(values)) {
    const field2 = fields.get(key);
    if (field2 === void 0 || !valueMatchesField(field2, values[key])) {
      return {
        valid: false,
        reason: `Template value is invalid: ${key}`
      };
    }
  }
  for (const field2 of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field2.id)) {
      return {
        valid: false,
        reason: `Template value is missing: ${field2.id}`
      };
    }
  }
  return {
    valid: true
  };
}
function field(id, label, type, defaultValue, options = {}) {
  return {
    id,
    label,
    type,
    defaultValue,
    ...options.min === void 0 ? {} : {
      min: options.min
    },
    ...options.max === void 0 ? {} : {
      max: options.max
    },
    ...options.options === void 0 ? {} : {
      options: options.options
    }
  };
}
var CATEGORY_OPTIONS = [
  "NONE",
  "PHYSICAL",
  "MAGIC",
  "FIRE",
  "ICE"
];
var ARMOR_SLOTS = [
  "HEAD",
  "BODY",
  "ACCESSORY"
];
var UI_LAYOUTS = [
  "HUD",
  "MENU",
  "DIALOG",
  "POPUP"
];
var GAME_TEMPLATE_CATALOG = [
  {
    id: "core.character-2d",
    category: "CORE",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "2D Character Body",
    description: "\u30B8\u30E3\u30F3\u30EB\u3092\u554F\u308F\u305A\u4F7F\u3048\u308B\u898B\u305F\u76EE\u30FB\u63A5\u89E6\u30FB\u91CD\u529B\u30FB\u79FB\u52D5\u306E\u571F\u53F0",
    tags: [
      "2D",
      "Character",
      "Physics",
      "Controller"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Character"),
      field("moveSpeed", "\u79FB\u52D5\u901F\u5EA6", "NUMBER", 4, {
        min: 0.1,
        max: 100
      }),
      field("gravityScale", "\u91CD\u529B\u500D\u7387", "NUMBER", 0, {
        min: -100,
        max: 100
      }),
      field("collisionLayer", "Collision Layer", "SELECT", "PLAYER", {
        options: [
          "DEFAULT",
          "PLAYER",
          "NPC",
          "WORLD"
        ]
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "CHARACTER_2D"
    }
  },
  {
    id: "core.projectile-2d",
    category: "CORE",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "2D Projectile",
    description: "\u30B7\u30E5\u30FC\u30C6\u30A3\u30F3\u30B0\u30FB\u30A2\u30AF\u30B7\u30E7\u30F3\u30FB\u9B54\u6CD5\u306A\u3069\u306B\u4F7F\u3048\u308B\u79FB\u52D5\u3059\u308B\u653B\u6483\u4F53",
    tags: [
      "2D",
      "Projectile",
      "Shooter",
      "Action"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Projectile"),
      field("damage", "\u30C0\u30E1\u30FC\u30B8", "NUMBER", 10, {
        min: 0,
        max: 999999
      }),
      field("speed", "\u901F\u5EA6", "NUMBER", 12, {
        min: 0.1,
        max: 1e3
      }),
      field("damageType", "\u5C5E\u6027", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "PROJECTILE_2D"
    }
  },
  {
    id: "core.damage-zone-2d",
    category: "CORE",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "2D Damage / Trigger Zone",
    description: "\u653B\u6483\u7BC4\u56F2\u3001\u30C8\u30E9\u30C3\u30D7\u3001\u30B4\u30FC\u30EB\u3001\u30A4\u30D9\u30F3\u30C8\u9818\u57DF\u3092\u4F5C\u308BTrigger",
    tags: [
      "2D",
      "Trigger",
      "Damage",
      "Event"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Damage Zone"),
      field("damage", "\u30C0\u30E1\u30FC\u30B8", "NUMBER", 20, {
        min: 0,
        max: 999999
      }),
      field("cooldown", "\u518D\u767A\u52D5\u9593\u9694", "NUMBER", 0.5, {
        min: 0,
        max: 3600
      })
    ],
    trackBlueprint: {
      kind: "EVENT",
      role: "TRIGGER",
      componentPreset: "DAMAGE_ZONE_2D"
    }
  },
  {
    id: "core.hud-panel",
    category: "CORE",
    kind: "UI",
    target: "GAME_DATA",
    title: "HUD / UI Panel",
    description: "\u4F53\u529B\u30FB\u30B9\u30B3\u30A2\u30FB\u30BF\u30A4\u30DE\u30FC\u306A\u3069\u3001\u30B2\u30FC\u30E0\u5074UI\u306E\u8A2D\u5B9A\u30C7\u30FC\u30BF",
    tags: [
      "UI",
      "HUD",
      "Score",
      "Health"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "HUD Panel"),
      field("layout", "\u30EC\u30A4\u30A2\u30A6\u30C8", "SELECT", "HUD", {
        options: UI_LAYOUTS
      }),
      field("anchor", "\u57FA\u6E96\u4F4D\u7F6E", "SELECT", "TOP_LEFT", {
        options: [
          "TOP_LEFT",
          "TOP_RIGHT",
          "BOTTOM_LEFT",
          "BOTTOM_RIGHT",
          "CENTER"
        ]
      }),
      field("visible", "\u521D\u671F\u8868\u793A", "BOOLEAN", true)
    ]
  },
  {
    id: "rpg.playable-character",
    category: "RPG",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "RPG \u30D7\u30EC\u30A4\u30A2\u30D6\u30EB\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC",
    description: "\u4E3B\u4EBA\u516C\u7528\u306E\u898B\u305F\u76EE\u30FB\u5E8A\u3068\u306E\u63A5\u89E6\u30FB\u91CD\u529B\u30FB\u79FB\u52D5",
    tags: [
      "RPG",
      "Player",
      "Character",
      "Physics"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u30D7\u30EC\u30A4\u30E4\u30FC"),
      field("moveSpeed", "\u79FB\u52D5\u901F\u5EA6", "NUMBER", 4, {
        min: 0.1,
        max: 100
      }),
      field("gravityScale", "\u91CD\u529B\u500D\u7387", "NUMBER", 0, {
        min: -100,
        max: 100
      }),
      field("maxHp", "\u6700\u5927HP", "NUMBER", 100, {
        min: 1,
        max: 999999
      }),
      field("collisionLayer", "Collision Layer", "SELECT", "PLAYER", {
        options: [
          "DEFAULT",
          "PLAYER",
          "NPC",
          "WORLD"
        ]
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "PLAYER",
      componentPreset: "CHARACTER_2D"
    }
  },
  {
    id: "rpg.weapon",
    category: "RPG",
    kind: "WEAPON",
    target: "GAME_DATA",
    title: "RPG \u6B66\u5668",
    description: "\u653B\u6483\u529B\u30FB\u5C04\u7A0B\u30FB\u518D\u4F7F\u7528\u9593\u9694\u30FB\u5C5E\u6027\u3092\u6301\u3064Game\u5074\u88C5\u5099\u30C7\u30FC\u30BF",
    tags: [
      "RPG",
      "Weapon",
      "Attack",
      "Inventory"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u30D6\u30ED\u30F3\u30BA\u30BD\u30FC\u30C9"),
      field("attackPower", "\u653B\u6483\u529B", "NUMBER", 12, {
        min: 0,
        max: 999999
      }),
      field("range", "\u5C04\u7A0B", "NUMBER", 1, {
        min: 0,
        max: 9999
      }),
      field("cooldown", "\u518D\u4F7F\u7528\u9593\u9694", "NUMBER", 0.5, {
        min: 0,
        max: 3600
      }),
      field("damageType", "\u5C5E\u6027", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS
      })
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.armor",
    category: "RPG",
    kind: "ARMOR",
    target: "GAME_DATA",
    title: "RPG \u9632\u5177",
    description: "\u9632\u5FA1\u529B\u30FB\u88C5\u5099\u90E8\u4F4D\u30FB\u91CD\u91CF\u3092\u6301\u3064Game\u5074\u88C5\u5099\u30C7\u30FC\u30BF",
    tags: [
      "RPG",
      "Armor",
      "Defense",
      "Inventory"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u30EC\u30B6\u30FC\u30A2\u30FC\u30DE\u30FC"),
      field("defense", "\u9632\u5FA1\u529B", "NUMBER", 8, {
        min: 0,
        max: 999999
      }),
      field("slot", "\u88C5\u5099\u90E8\u4F4D", "SELECT", "BODY", {
        options: ARMOR_SLOTS
      }),
      field("weight", "\u91CD\u91CF", "NUMBER", 1, {
        min: 0,
        max: 9999
      })
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.skill",
    category: "RPG",
    kind: "SKILL",
    target: "GAME_DATA",
    title: "RPG \u30B9\u30AD\u30EB",
    description: "\u6D88\u8CBBMP\u30FB\u5A01\u529B\u30FB\u5C04\u7A0B\u30FB\u518D\u4F7F\u7528\u9593\u9694\u3092\u6301\u3064\u30CE\u30FC\u30C9\u63A5\u7D9A\u7528\u30B9\u30AD\u30EB\u30C7\u30FC\u30BF",
    tags: [
      "RPG",
      "Skill",
      "Magic",
      "Event"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u30D5\u30A1\u30A4\u30A2"),
      field("mpCost", "MP\u6D88\u8CBB", "NUMBER", 5, {
        min: 0,
        max: 999999
      }),
      field("power", "\u5A01\u529B", "NUMBER", 24, {
        min: 0,
        max: 999999
      }),
      field("range", "\u5C04\u7A0B", "NUMBER", 5, {
        min: 0,
        max: 9999
      }),
      field("cooldown", "\u518D\u4F7F\u7528\u9593\u9694", "NUMBER", 2, {
        min: 0,
        max: 3600
      }),
      field("element", "\u5C5E\u6027", "SELECT", "FIRE", {
        options: CATEGORY_OPTIONS
      })
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.status",
    category: "RPG",
    kind: "STATUS",
    target: "GAME_DATA",
    title: "RPG \u30B9\u30C6\u30FC\u30BF\u30B9\u52B9\u679C",
    description: "\u7D99\u7D9A\u6642\u9593\u3068\u88DC\u6B63\u5024\u3092\u6301\u3064\u30D0\u30D5\u30FB\u30C7\u30D0\u30D5\u30FB\u72B6\u614B\u7570\u5E38\u30C7\u30FC\u30BF",
    tags: [
      "RPG",
      "Status",
      "Buff",
      "Debuff"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u6BD2"),
      field("duration", "\u7D99\u7D9A\u6642\u9593", "NUMBER", 10, {
        min: 0,
        max: 3600
      }),
      field("power", "\u88DC\u6B63\u5024", "NUMBER", -5, {
        min: -999999,
        max: 999999
      }),
      field("stackable", "\u91CD\u306D\u304C\u3051", "BOOLEAN", false)
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.status-sheet",
    category: "RPG",
    kind: "STATUS",
    target: "GAME_DATA",
    title: "RPG \u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u30B9\u30C6\u30FC\u30BF\u30B9",
    description: "HP\u30FBMP\u30FB\u653B\u6483\u30FB\u9632\u5FA1\u30FB\u901F\u5EA6\u3092\u307E\u3068\u3081\u305F\u521D\u671F\u30B9\u30C6\u30FC\u30BF\u30B9",
    tags: [
      "RPG",
      "Status",
      "Character",
      "Stats"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u30D7\u30EC\u30A4\u30E4\u30FC\u57FA\u672C\u30B9\u30C6\u30FC\u30BF\u30B9"),
      field("maxHp", "\u6700\u5927HP", "NUMBER", 100, {
        min: 1,
        max: 999999
      }),
      field("maxMp", "\u6700\u5927MP", "NUMBER", 30, {
        min: 0,
        max: 999999
      }),
      field("attack", "\u653B\u6483", "NUMBER", 10, {
        min: 0,
        max: 999999
      }),
      field("defense", "\u9632\u5FA1", "NUMBER", 5, {
        min: 0,
        max: 999999
      }),
      field("speed", "\u901F\u5EA6", "NUMBER", 4, {
        min: 0,
        max: 9999
      })
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.tile",
    category: "RPG",
    kind: "TILE",
    target: "GAME_DATA",
    title: "RPG \u30BF\u30A4\u30EB\u5B9A\u7FA9",
    description: "\u5730\u9762\u30FB\u58C1\u30FB\u6C34\u30FB\u968E\u6BB5\u306A\u3069\u3001\u30BF\u30A4\u30EB\u306E\u8868\u793A\u7528\u9014\u3068\u885D\u7A81\u8A2D\u5B9A",
    tags: [
      "RPG",
      "Tile",
      "Map",
      "Collision"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u8349\u5730"),
      field("terrain", "\u5730\u5F62", "SELECT", "GROUND", {
        options: [
          "GROUND",
          "WALL",
          "WATER",
          "STAIR",
          "DECORATION"
        ]
      }),
      field("collision", "\u885D\u7A81", "SELECT", "NONE", {
        options: [
          "NONE",
          "SOLID",
          "TRIGGER"
        ]
      }),
      field("movementCost", "\u79FB\u52D5\u30B3\u30B9\u30C8", "NUMBER", 1, {
        min: 0,
        max: 9999
      })
    ]
  },
  {
    id: "rpg.damage",
    category: "RPG",
    kind: "DAMAGE",
    target: "GAME_DATA",
    title: "RPG \u30C0\u30E1\u30FC\u30B8\u5B9A\u7FA9",
    description: "\u901A\u5E38\u653B\u6483\u30FB\u30B9\u30AD\u30EB\u30FB\u5C5E\u6027\u30FB\u30CE\u30C3\u30AF\u30D0\u30C3\u30AF\u30FB\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u306E\u57FA\u672C\u5024",
    tags: [
      "RPG",
      "Damage",
      "Combat",
      "Critical"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "\u901A\u5E38\u30C0\u30E1\u30FC\u30B8"),
      field("amount", "\u30C0\u30E1\u30FC\u30B8\u91CF", "NUMBER", 10, {
        min: 0,
        max: 999999
      }),
      field("damageType", "\u5C5E\u6027", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS
      }),
      field("knockback", "\u30CE\u30C3\u30AF\u30D0\u30C3\u30AF", "NUMBER", 0, {
        min: 0,
        max: 9999
      }),
      field("criticalRate", "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u7387", "NUMBER", 0.05, {
        min: 0,
        max: 1
      })
    ],
    attachToSelectedTrack: true
  },
  {
    id: "rpg.ui-hud",
    category: "RPG",
    kind: "UI",
    target: "GAME_DATA",
    title: "RPG HUD",
    description: "HP\u30D0\u30FC\u30FBMP\u30D0\u30FC\u30FB\u30EC\u30D9\u30EB\u30FB\u6240\u6301\u91D1\u3092\u307E\u3068\u3081\u305FUI\u5B9A\u7FA9",
    tags: [
      "RPG",
      "UI",
      "HUD",
      "Health"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "RPG HUD"),
      field("layout", "\u30EC\u30A4\u30A2\u30A6\u30C8", "SELECT", "HUD", {
        options: UI_LAYOUTS
      }),
      field("showHp", "HP\u8868\u793A", "BOOLEAN", true),
      field("showMp", "MP\u8868\u793A", "BOOLEAN", true),
      field("showLevel", "\u30EC\u30D9\u30EB\u8868\u793A", "BOOLEAN", true),
      field("showGold", "\u6240\u6301\u91D1\u8868\u793A", "BOOLEAN", false)
    ]
  },
  {
    id: "action.dash-character",
    category: "ACTION",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "Action Character",
    description: "\u79FB\u52D5\u3068\u30C0\u30C3\u30B7\u30E5\u3092\u7D44\u307F\u5408\u308F\u305B\u308B\u30A2\u30AF\u30B7\u30E7\u30F3\u5411\u3051Character\u571F\u53F0",
    tags: [
      "Action",
      "Dash",
      "Character",
      "Controller"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Action Character"),
      field("moveSpeed", "\u79FB\u52D5\u901F\u5EA6", "NUMBER", 6, {
        min: 0.1,
        max: 100
      }),
      field("dashSpeed", "\u30C0\u30C3\u30B7\u30E5\u901F\u5EA6", "NUMBER", 14, {
        min: 0.1,
        max: 200
      }),
      field("dashCooldown", "\u30C0\u30C3\u30B7\u30E5\u9593\u9694", "NUMBER", 0.8, {
        min: 0,
        max: 3600
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "CHARACTER_2D"
    }
  },
  {
    id: "shooting.projectile",
    category: "SHOOTING",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "Shooting Projectile",
    description: "\u5F3E\u901F\u30FB\u30C0\u30E1\u30FC\u30B8\u30FB\u5C5E\u6027\u3092\u6301\u3064\u5C04\u6483\u30B2\u30FC\u30E0\u5411\u3051Projectile",
    tags: [
      "Shooting",
      "Projectile",
      "Bullet",
      "Damage"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Bullet"),
      field("damage", "\u30C0\u30E1\u30FC\u30B8", "NUMBER", 15, {
        min: 0,
        max: 999999
      }),
      field("speed", "\u5F3E\u901F", "NUMBER", 20, {
        min: 0.1,
        max: 1e3
      }),
      field("lifetime", "\u5BFF\u547D", "NUMBER", 3, {
        min: 0,
        max: 3600
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "PROJECTILE_2D"
    }
  },
  {
    id: "racing.vehicle-2d",
    category: "RACING",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "Racing Vehicle 2D",
    description: "\u8ECA\u4F53\u30FB\u885D\u7A81\u30FB\u901F\u5EA6\u5165\u529B\u3092\u6301\u3064\u30C8\u30C3\u30D7\u30C0\u30A6\u30F3\u30EC\u30FC\u30B7\u30F3\u30B0\u306E\u571F\u53F0",
    tags: [
      "Racing",
      "Vehicle",
      "Physics",
      "Input"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Player Car"),
      field("maxSpeed", "\u6700\u9AD8\u901F\u5EA6", "NUMBER", 18, {
        min: 0.1,
        max: 1e3
      }),
      field("acceleration", "\u52A0\u901F", "NUMBER", 8, {
        min: 0,
        max: 1e3
      }),
      field("brakePower", "\u30D6\u30EC\u30FC\u30AD", "NUMBER", 12, {
        min: 0,
        max: 1e3
      })
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "VEHICLE_2D"
    }
  },
  {
    id: "rhythm.note",
    category: "RHYTHM",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "Rhythm Note",
    description: "\u5224\u5B9ATrigger\u3068\u5165\u529B\u30EB\u30FC\u30EB\u3092\u6301\u3064\u30EA\u30BA\u30E0\u30B2\u30FC\u30E0\u306E\u30CE\u30FC\u30C8\u571F\u53F0",
    tags: [
      "Rhythm",
      "Note",
      "Timing",
      "Input"
    ],
    fields: [
      field("name", "\u540D\u524D", "TEXT", "Note"),
      field("lane", "\u30EC\u30FC\u30F3", "NUMBER", 1, {
        min: 1,
        max: 32
      }),
      field("perfectWindow", "Perfect\u5E45", "NUMBER", 0.05, {
        min: 0,
        max: 10
      }),
      field("score", "\u30B9\u30B3\u30A2", "NUMBER", 100, {
        min: 0,
        max: 999999
      })
    ],
    trackBlueprint: {
      kind: "EVENT",
      role: "TRIGGER",
      componentPreset: "RHYTHM_NOTE_2D"
    }
  }
];
function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    tags: Object.freeze([
      ...definition.tags
    ]),
    fields: Object.freeze(definition.fields.map((item) => Object.freeze({
      ...item,
      ...item.options === void 0 ? {} : {
        options: Object.freeze([
          ...item.options
        ])
      }
    }))),
    ...definition.trackBlueprint === void 0 ? {} : {
      trackBlueprint: Object.freeze({
        ...definition.trackBlueprint
      })
    }
  });
}
var FROZEN_GAME_TEMPLATE_CATALOG = Object.freeze(GAME_TEMPLATE_CATALOG.map(freezeDefinition));
function getGameTemplates(category) {
  return category === void 0 ? FROZEN_GAME_TEMPLATE_CATALOG : FROZEN_GAME_TEMPLATE_CATALOG.filter((template) => template.category === category);
}
function getGameTemplate(templateId) {
  return FROZEN_GAME_TEMPLATE_CATALOG.find((template) => template.id === templateId);
}
function gameTemplateCategoryLabel(category) {
  switch (category) {
    case "CORE":
      return "\u6C4E\u7528 / Core";
    case "RPG":
      return "RPG";
    case "ACTION":
      return "Action";
    case "SHOOTING":
      return "Shooting";
    case "RACING":
      return "Racing";
    case "RHYTHM":
      return "Rhythm";
  }
}
function gameTemplateKindLabel(kind) {
  const labels = {
    CHARACTER: "Character",
    WEAPON: "\u6B66\u5668",
    ARMOR: "\u9632\u5177",
    SKILL: "\u30B9\u30AD\u30EB",
    STATUS: "\u30B9\u30C6\u30FC\u30BF\u30B9",
    TILE: "\u30BF\u30A4\u30EB",
    DAMAGE: "\u30C0\u30E1\u30FC\u30B8 / Trigger",
    UI: "UI"
  };
  return labels[kind];
}
function numberValue(values, key, fallback) {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function stringValue(values, key, fallback) {
  const value = values[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}
function transform2(trackId, x = 0, y = 0) {
  return {
    type: "TRANSFORM",
    componentId: componentIdFor(trackId, "TRANSFORM"),
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  };
}
function sprite(trackId) {
  return {
    type: "SPRITE",
    componentId: componentIdFor(trackId, "SPRITE"),
    visible: true
  };
}
function collider2(trackId, options = {}) {
  return {
    type: "COLLIDER",
    componentId: componentIdFor(trackId, "COLLIDER"),
    shape: options.shape ?? "BOX",
    width: options.width ?? 0.8,
    height: options.height ?? 0.8,
    radius: options.radius ?? 0.4,
    isTrigger: options.isTrigger ?? false,
    layer: options.layer ?? "DEFAULT",
    enabled: true
  };
}
function rigidbody2(trackId, gravityScale, bodyType = "DYNAMIC") {
  return {
    type: "RIGIDBODY",
    componentId: componentIdFor(trackId, "RIGIDBODY"),
    bodyType,
    mass: 1,
    gravityScale,
    fixedRotation: true,
    enabled: true
  };
}
function controller(trackId, moveSpeed) {
  return {
    type: "CHARACTER_CONTROLLER",
    componentId: componentIdFor(trackId, "CHARACTER_CONTROLLER"),
    moveSpeed,
    stepHeight: 0.25,
    fixedStep: 1,
    enabled: true
  };
}
function behavior(trackId) {
  return {
    type: "BEHAVIOR",
    componentId: componentIdFor(trackId, "BEHAVIOR"),
    enabled: true
  };
}
function componentsForPreset(trackId, preset, values) {
  switch (preset) {
    case "CHARACTER_2D":
      return [
        transform2(trackId),
        sprite(trackId),
        collider2(trackId, {
          width: 0.7,
          height: 0.7,
          radius: 0.35,
          layer: "PLAYER"
        }),
        rigidbody2(trackId, numberValue(values, "gravityScale", 0)),
        controller(trackId, numberValue(values, "moveSpeed", 4))
      ];
    case "PROJECTILE_2D":
      return [
        transform2(trackId),
        sprite(trackId),
        collider2(trackId, {
          shape: "CIRCLE",
          width: 0.25,
          height: 0.25,
          radius: 0.125,
          isTrigger: true,
          layer: "PROJECTILE"
        }),
        rigidbody2(trackId, 0),
        behavior(trackId)
      ];
    case "DAMAGE_ZONE_2D":
      return [
        transform2(trackId),
        sprite(trackId),
        collider2(trackId, {
          width: 1,
          height: 1,
          radius: 0.5,
          isTrigger: true,
          layer: "SENSOR"
        }),
        behavior(trackId)
      ];
    case "VEHICLE_2D":
      return [
        transform2(trackId),
        sprite(trackId),
        collider2(trackId, {
          width: 1.4,
          height: 0.7,
          radius: 0.7,
          layer: "WORLD"
        }),
        rigidbody2(trackId, 0),
        controller(trackId, numberValue(values, "maxSpeed", 18))
      ];
    case "RHYTHM_NOTE_2D":
      return [
        transform2(trackId),
        sprite(trackId),
        collider2(trackId, {
          width: 0.45,
          height: 0.45,
          radius: 0.225,
          isTrigger: true,
          layer: "SENSOR"
        }),
        behavior(trackId)
      ];
  }
}
function nextId(prefix, used) {
  const usedIds = new Set(used);
  let index = 1;
  let candidate = `${prefix}:${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${prefix}:${index}`;
  }
  return candidate;
}
function cloneTrack(track) {
  return {
    ...track,
    filled: [
      ...track.filled
    ],
    ...track.components === void 0 ? {} : {
      components: track.components.map((component) => ({
        ...component
      }))
    },
    ...track.tilemap === void 0 ? {} : {
      tilemap: {
        ...track.tilemap,
        cells: track.tilemap.cells.map((cell) => ({
          ...cell
        }))
      }
    }
  };
}
function mergedValues(definition, overrides = {}) {
  const values = {};
  for (const item of definition.fields) values[item.id] = item.defaultValue;
  for (const [key, value] of Object.entries(overrides)) values[key] = value;
  const validation = validateGameTemplateValues(definition, values);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Invalid template values.");
  }
  return Object.freeze(values);
}
function applyGameTemplate(input) {
  if (input.instances.length >= TEMPLATE_MAX_INSTANCES) {
    throw new Error("Game template instance limit reached.");
  }
  const definition = getGameTemplate(input.templateId);
  if (definition === void 0) throw new Error("Unknown Game template.");
  const values = mergedValues(definition, input.overrides);
  const instanceId = nextId(`template-instance:${definition.id.replace(/[^A-Za-z0-9._:/-]/gu, "-")}`, input.instances.map((instance2) => instance2.instanceId));
  let nextTracks = input.tracks.map(cloneTrack);
  let targetTrackId = definition.attachToSelectedTrack === true && input.selectedTrackId !== void 0 && input.tracks.some((track) => track.id === input.selectedTrackId) ? input.selectedTrackId : void 0;
  if (definition.target === "SCENE_OBJECT") {
    const blueprint = definition.trackBlueprint;
    if (blueprint === void 0) {
      throw new Error("Template blueprint is missing.");
    }
    const trackId = nextId(`template-track:${definition.id.replace(/[^A-Za-z0-9._:/-]/gu, "-")}`, nextTracks.map((track2) => track2.id));
    const label2 = stringValue(values, "name", definition.title);
    const track = {
      id: trackId,
      label: label2,
      kind: blueprint.kind,
      filled: [],
      active: true,
      role: blueprint.role,
      components: componentsForPreset(trackId, blueprint.componentPreset, values)
    };
    nextTracks = [
      ...nextTracks,
      track
    ];
    targetTrackId = trackId;
  }
  const label = stringValue(values, "name", definition.title);
  const instance = Object.freeze({
    instanceId,
    templateId: definition.id,
    category: definition.category,
    kind: definition.kind,
    target: definition.target,
    label,
    values,
    ...targetTrackId === void 0 ? {} : {
      targetTrackId
    }
  });
  return {
    tracks: Object.freeze(nextTracks),
    instances: Object.freeze([
      ...input.instances.map((item) => ({
        ...item,
        values: Object.freeze({
          ...item.values
        })
      })),
      instance
    ]),
    instance,
    ...targetTrackId === void 0 ? {} : {
      selectedTrackId: targetTrackId
    }
  };
}
function removeGameTemplateInstance(instances, instanceId) {
  return Object.freeze(instances.filter((instance) => instance.instanceId !== instanceId).map((instance) => ({
    ...instance,
    values: Object.freeze({
      ...instance.values
    })
  })));
}
export {
  DEFAULT_PHYSICS_2D_SETTINGS,
  GAME350_PHYSICS_LAYER_BITS,
  GAME350_PREFAB_DESIGN_GATE,
  GAME350_TILEMAP_MAX_CELLS,
  GAME350_TILEMAP_MAX_HEIGHT,
  GAME350_TILEMAP_MAX_WIDTH,
  GAME_EVENT_ACTION_OPTIONS,
  GAME_EVENT_CONDITION_OPTIONS,
  GAME_EVENT_WHO_OPTIONS,
  GAME_RUNTIME_FAMILY_LABELS,
  GAME_RUNTIME_PERFORMANCE_PROFILES,
  GAME_SCENE_GRAVITY_OPTIONS,
  GAME_SCENE_RULE_LABELS,
  GAME_SCENE_RULE_PRESETS,
  IGAME_EXTERNAL_BUILD_TARGETS,
  PIXIEED_BRAND_SPLASH_DURATION_MS,
  admitIGameExternalBuild,
  advancePhysics2D,
  applyGameTemplate,
  artifactManifestIsImmutable,
  attachVerifiedGameArtifact,
  behaviorFromGameEventCard,
  buildSceneHierarchy,
  canExecuteGameArtifact,
  clearGameGenreDialogue,
  clearGameTilemapCell,
  colliderAABB,
  completeIGameBrandSplash,
  createArtifactIdentity,
  createDefaultRpgTilemapDocument,
  createGame351Physics2DScene,
  createGame351Physics2DWorld,
  createGameBuildPlan,
  createGameBuildRecord,
  createGameDependencySnapshot,
  createGameGenreRuntime,
  createGameProjectRevision,
  createGameRuntimeArtifactManifest,
  createGameRuntimePreview,
  createGameTilemapDocument,
  createIGameBrowserRuntimeSource,
  createIGameBrowserRuntimeSourceFromBootstrap,
  createIGamePlayerManifest,
  createIGamePlayerSession,
  createIGameRuntimeLaunchConfig,
  createIGameRuntimeLaunchState,
  createPhysics2DWorld,
  defaultGameEventCardsForRuntimeFamily,
  deleteEntity,
  duplicateEntity,
  evaluateGameRuntimePerformance,
  fetchIGamePublicPackage,
  flattenSceneHierarchy,
  gameAssetRequests,
  gameAssetRequestsForScene,
  gameInputActionMapToRuntime,
  gameRuntimeStateFingerprint,
  gameTemplateCategoryLabel,
  gameTemplateKindLabel,
  gameTilemapCellAt,
  getGameTemplate,
  getGameTemplates,
  igameExternalBuildResourceId,
  isGameAssetReference,
  isIGameExternalBuildTarget,
  isIGamePlayerRuntimeSource,
  loadGameRuntimeAssets,
  loadGameRuntimeSceneAssets,
  normalizeGameSceneRules,
  normalizePhysics2DSettings,
  paintGameTilemapCell,
  parseIGamePublicBootstrap,
  physics2DSettingsForSceneRules,
  playGameGenre,
  recoverGameBuild,
  rejectPrefabOperation,
  removeGameTemplateInstance,
  renameEntity,
  reparentEntity,
  resolveGameRuntimePerformanceProfile,
  resolveIGamePlayerAccess,
  restartGameGenre,
  restoreGameRuntimeSaveState,
  safeGameHotReload,
  sceneRulesForCreationMode,
  sceneRulesForRuntimeFamily,
  sceneRulesSummary,
  serializeGameRuntimeSaveState,
  setEntityActive,
  setGameTilemapCell,
  sha256BytesHex,
  solidGameTilemapCells,
  startIGameRuntime,
  stepGame351Physics2D,
  stepGameGenre,
  stepGameRuntime,
  stepPhysics2D,
  stopGameGenre,
  stopGameRuntime,
  stopIGameRuntime,
  sumLoadedRuntimeAssetBytes,
  transitionGameBuild,
  triggerGameGenreCameraShake,
  triggerGameTilemapCells,
  validateGameBuildRequest,
  validateGameProject,
  validateGameTemplateDefinition,
  validateGameTemplateValues,
  validateGameTilemapDocument,
  validatePhysics2DSettings,
  validateSceneHierarchy,
  validateScenePrefabReferences
};
