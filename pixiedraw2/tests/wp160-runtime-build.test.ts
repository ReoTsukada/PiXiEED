import {
  DEFAULT_WP160_FEATURE_FLAGS,
  canExecuteRuntime,
  asAssetId,
  asAssetRevisionId,
  asBuildArtifactId,
  asDependencySnapshotHash,
  asPackageId,
  asSha256,
  type DependencyLockEntry,
  type RuntimeCapabilityProfile,
} from "../src/wp160-contracts.ts";
import {
  createDependencySnapshot,
  createRuntimePreview,
  loadRuntimeAssets,
  safeHotReload,
  sampleAnimation,
  serializeRuntimeState,
  stepRuntime,
  type InputEvent,
  type RuntimeAssetResolver,
} from "../src/wp160-game-runtime-core.ts";
import {
  attachVerifiedArtifact,
  cancelBuild,
  createArtifactIdentity,
  createBuildPlan,
  createBuildRecord,
  isArtifactImmutable,
  requestPublish,
  transitionBuild,
  validateBuildSecurity,
  validateBuildRequest,
  type BuildRequest,
} from "../src/wp160-build-pipeline.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));
const capabilities: RuntimeCapabilityProfile = {
  pointer: true,
  touch: true,
  keyboard: true,
  mouse: true,
  gamepad: false,
  screenWidth: 1280,
  screenHeight: 720,
  devicePixelRatio: 1,
  audio: true,
  graphics: "CANVAS2D",
  webGpuBenefitMeasured: false,
  reducedMotion: false,
};

function entry(assetId: string, revisionId: string, contentHash: typeof HASH_A, mode: DependencyLockEntry["mode"] = "LIVE"): DependencyLockEntry {
  return { assetId: asAssetId(assetId), revisionId: asAssetRevisionId(revisionId), contentHash, byteLength: 12, mimeType: "application/octet-stream", mode, required: true };
}

async function fixtureSnapshot(mode: DependencyLockEntry["mode"] = "LIVE", revisionId = "rev-a", contentHash = HASH_A) {
  return createDependencySnapshot("game-package", "1.0.0", [entry("sprite/player", revisionId, contentHash, mode)], true);
}

async function fixturePreview(mode: DependencyLockEntry["mode"] = "LIVE", revisionId = "rev-a", contentHash = HASH_A) {
  const dependencies = await fixtureSnapshot(mode, revisionId, contentHash);
  return createRuntimePreview({
    previewId: "preview-wp160",
    projectId: "project-wp160",
    projectRevisionId: "project-rev-1",
    packageId: "game-package",
    packageVersion: "1.0.0",
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 },
    supportedRuntimeVersion: "0.1.0",
    dependencies,
    capabilities,
    inputMap: { bindings: [{ action: "jump", source: "KEYBOARD", code: "Space" }, { action: "jump", source: "TOUCH", code: "primary" }] },
  });
}

Deno.test("WP-160 uses typed IDs, LIVE/PINNED references, lazy resolution, and deterministic animation", async () => {
  assert(asPackageId("package/one") === "package/one", "typed Package ID should retain stable value");
  const live = await fixturePreview("LIVE");
  let resolveCount = 0;
  const resolver: RuntimeAssetResolver = {
    async resolve(request) {
      resolveCount += 1;
      return { assetId: asAssetId("sprite/player"), revisionId: asAssetRevisionId(request.mode === "LIVE" ? "rev-a" : "rev-a"), contentHash: HASH_A, byteLength: 12, mimeType: "application/octet-stream" };
    },
  };
  const countBeforeLoad = resolveCount;
  const loaded = await loadRuntimeAssets(live, [{ assetId: asAssetId("sprite/player"), required: true, mode: "LIVE" }], resolver);
  assert(countBeforeLoad === 0 && resolveCount > countBeforeLoad && loaded.loadedAssets["sprite/player"] !== undefined, "requested asset should be resolved lazily");
  assert(sampleAnimation({ id: "idle", loop: true, frames: [{ frameId: "a", durationMs: 100 }, { frameId: "b", durationMs: 100 }] }, 250) === "a", "animation sampling should be deterministic");

  const pinned = await fixturePreview("PINNED");
  const changedPinned = await fixtureSnapshot("PINNED", "rev-b", HASH_B);
  const rejected = safeHotReload(pinned, changedPinned);
  assert(!rejected.accepted && rejected.diagnostics.some((item) => item.code === "HOT_RELOAD_REJECTED"), "PINNED dependencies must reject mutation");
});

Deno.test("WP-160 maps hardware input to semantic actions and preserves Runtime state across safe LIVE hot reload", async () => {
  const session = await fixturePreview("LIVE");
  const input: InputEvent = { source: "KEYBOARD", code: "Space", phase: "DOWN" };
  const stepped = stepRuntime(session, 16, [input], { id: "idle", loop: true, frames: [{ frameId: "a", durationMs: 100 }, { frameId: "b", durationMs: 100 }] });
  assert(stepped.actions.length === 1 && stepped.actions[0] === "jump", "keyboard and touch must converge on semantic Action");
  const beforeState = serializeRuntimeState(stepped.session);
  const next = await fixtureSnapshot("LIVE", "rev-b", HASH_B);
  const reloaded = safeHotReload(stepped.session, next);
  assert(reloaded.accepted, "LIVE reference should support compatible hot reload");
  assert(serializeRuntimeState(reloaded.session) === beforeState, "safe hot reload must preserve Runtime state and not write back Project state");
});

Deno.test("WP-160 reports fail-closed runtime diagnostics and optional asset degradation", async () => {
  const dependencies = await fixtureSnapshot();
  const invalid = { ...dependencies, snapshotHash: asDependencySnapshotHash("c".repeat(64)) };
  const invalidPreview = await createRuntimePreview({
    previewId: "preview-invalid",
    projectId: "project-wp160",
    projectRevisionId: "project-rev-1",
    packageId: "game-package",
    packageVersion: "1.0.0",
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "unsupported", supportedManifestVersion: 1 },
    supportedRuntimeVersion: "0.1.0",
    dependencies: invalid,
    capabilities: { ...capabilities, audio: false, graphics: "NONE" },
  });
  assert(invalidPreview.diagnostics.some((item) => item.code === "UNSUPPORTED_RUNTIME_VERSION"), "unsupported runtime version must fail closed");
  assert(invalidPreview.diagnostics.some((item) => item.code === "DEPENDENCY_LOCK_MISMATCH"), "dependency hash mismatch must be diagnosed");
  assert(!invalidPreview.running, "invalid Runtime preview must not run");
  const fallbackPreview = await createRuntimePreview({
    previewId: "preview-webgpu-fallback", projectId: "project-wp160", projectRevisionId: "project-rev-1",
    packageId: "game-package", packageVersion: "1.0.0", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 },
    supportedRuntimeVersion: "0.1.0", dependencies, capabilities, renderer: "WEBGPU",
  });
  assert(fallbackPreview.presentation.renderer === "CANVAS2D" && fallbackPreview.diagnostics.some((item) => item.code === "RENDERER_UNAVAILABLE"), "WebGPU must require measured benefit and retain a fallback renderer");

  const session = await fixturePreview();
  const optional = await loadRuntimeAssets(session, [{ assetId: asAssetId("sprite/optional"), required: false, mode: "LIVE" }], { resolve: async () => undefined });
  assert(optional.diagnostics.some((item) => item.code === "OPTIONAL_ASSET_MISSING"), "optional missing asset should be visible but recoverable");
});

Deno.test("WP-160 keeps Build lifecycle, artifact identity, cache plan, and Publish separate", async () => {
  const dependencies = await fixtureSnapshot("PINNED");
  const request: BuildRequest = {
    requestId: "build-request-1",
    packageId: asPackageId("game-package"),
    packageVersion: "1.0.0",
    packageHash: HASH_A,
    dependencies,
    target: "PIXIEED_NATIVE_WEB_RUNTIME",
    configuration: { version: "1.0.0" as BuildRequest["configuration"]["version"], optimization: "RELEASE", compression: "BROTLI", capabilityProfile: "desktop", toolchainVersion: "wp160-local" },
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 },
    sourceRevisionId: "project-rev-1",
  };
  const record = await createBuildRecord(request);
  const retry = await createBuildRecord(request);
  assert(retry.requestFingerprint === record.requestFingerprint, "duplicate request retry must have an idempotent fingerprint");
  const planned = transitionBuild(record, "VALIDATING");
  const building = transitionBuild(planned, "BUILDING");
  const verifying = transitionBuild(building, "VERIFYING");
  const planA = await createBuildPlan(request);
  const planB = await createBuildPlan(request);
  assert(planA.manifest === planB.manifest && planA.cacheKey === planB.cacheKey, "same locked inputs must produce a deterministic Build Plan and cache key");
  const artifact = createArtifactIdentity({
    buildArtifactId: "artifact-1",
    sourcePackageId: asPackageId("game-package"),
    sourcePackageVersion: "1.0.0",
    dependencySnapshotHash: dependencies.snapshotHash,
    buildTarget: "PIXIEED_NATIVE_WEB_RUNTIME",
    buildConfigurationVersion: "1.0.0",
    runtimeVersion: "0.1.0",
    artifactHash: HASH_B,
    byteLength: 1024,
    verificationState: "VERIFIED",
    createdAt: "2026-08-08T00:00:00.000Z",
    buildProvenance: "wp160-local-fixture",
  });
  const ready = attachVerifiedArtifact(verifying, artifact, { assetsResolved: true, revisionsLocked: true, hashesVerified: true, compatibilityVerified: true, permissionsVerified: true, integrityVerified: true, runtimeSmokeVerified: true });
  assert(ready.lifecycle === "READY" && ready.artifact?.buildArtifactId === asBuildArtifactId("artifact-1"), "READY requires complete evidence and artifact identity");
  assert(isArtifactImmutable(artifact, { ...artifact }), "READY artifact identity must be immutable");
  assert(!isArtifactImmutable(artifact, { ...artifact, artifactHash: HASH_A }), "artifact tamper must be detectable");
  const intent = requestPublish(ready, "local-auditor");
  assert(intent.explicit && intent.artifactId === asBuildArtifactId("artifact-1"), "Publish must require a separate explicit intent");
  let readyCancellationRejected = false;
  try { cancelBuild(ready); } catch { readyCancellationRejected = true; }
  assert(readyCancellationRejected, "READY artifacts must not be cancelled or mutated");
});

Deno.test("WP-160 cancellation and default feature flags are fail-closed", async () => {
  const dependencies = await fixtureSnapshot("PINNED");
  const request: BuildRequest = {
    requestId: "build-request-cancel",
    packageId: asPackageId("game-package"), packageVersion: "1.0.0", packageHash: HASH_A, dependencies,
    target: "GENERIC_WEB_PACKAGE", configuration: { version: "1.0.0" as BuildRequest["configuration"]["version"], optimization: "DEBUG", compression: "NONE", capabilityProfile: "test", toolchainVersion: "wp160-local" },
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 }, sourceRevisionId: "project-rev-1",
  };
  const record = await createBuildRecord(request);
  assert(cancelBuild(record).lifecycle === "CANCELLED", "cancel before ready must not become READY");
  assert(Object.values(DEFAULT_WP160_FEATURE_FLAGS).every((flag) => flag === false), "all WP-160 feature flags must default OFF");
  assert(!canExecuteRuntime(DEFAULT_WP160_FEATURE_FLAGS, false), "runtime execution must remain disabled by default");
  assert(canExecuteRuntime({ ...DEFAULT_WP160_FEATURE_FLAGS, "runtime-execution": true }, false), "explicit runtime execution flag may open the isolated gate");
  assert(!canExecuteRuntime({ "runtime-execution": true, unknown: true }, true), "kill switch must override enabled and unknown flags");
});

Deno.test("WP-160 security fixtures reject unsafe package/build inputs", () => {
  const diagnostics = validateBuildSecurity({
    archivePaths: ["/absolute/file", "assets/../secret"],
    externalUrls: ["https://outside.invalid/payload"],
    activeContentMimeTypes: ["image/svg+xml", "application/javascript"],
    scriptBytes: 101,
    maxScriptBytes: 100,
    artifactBytes: 1001,
    maxArtifactBytes: 1000,
    quarantinedDependency: true,
    authorized: false,
  });
  assert(diagnostics.length >= 6, "path, URL, active content, size, quarantine, and authorization fixtures must be rejected");
  assert(diagnostics.some((item) => item.code === "SECURITY_POLICY_REJECTED"), "security policy diagnostic is required");
  assert(diagnostics.some((item) => item.code === "ASSET_QUARANTINED"), "quarantine diagnostic is required");
});

Deno.test("WP-160 rejects malformed targets/configuration and prevents failed Build publication", async () => {
  const dependencies = await fixtureSnapshot("PINNED");
  const request: BuildRequest = {
    requestId: "build-request-invalid", packageId: asPackageId("game-package"), packageVersion: "1.0.0", packageHash: HASH_A,
    dependencies: { ...dependencies, entries: [] },
    target: "UNSUPPORTED_TARGET" as BuildRequest["target"],
    configuration: { version: "" as BuildRequest["configuration"]["version"], optimization: "BROKEN" as BuildRequest["configuration"]["optimization"], compression: "BROKEN" as BuildRequest["configuration"]["compression"], capabilityProfile: "", toolchainVersion: "" },
    runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 }, sourceRevisionId: "project-rev-1",
  };
  const diagnostics = validateBuildRequest(request);
  assert(diagnostics.some((item) => item.code === "MISSING_REQUIRED_ASSET"), "missing dependency must block Build");
  assert(diagnostics.some((item) => item.code === "BUILD_INVALID_REQUEST"), "invalid target/config must block Build");
  const failed = await createBuildRecord(request);
  let publishRejected = false;
  try { requestPublish(failed, "unauthorized-fixture"); } catch { publishRejected = true; }
  assert(publishRejected, "failed Build must never produce a Publish intent");
});
