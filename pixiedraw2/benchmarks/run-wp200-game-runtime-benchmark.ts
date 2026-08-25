import { asAssetId, asAssetRevisionId, asGameProjectId, asPackageId, asSha256, type RuntimeCapabilityProfile } from "../src/wp160-contracts.ts";
import { createGameDependencySnapshot, createGameProjectRevision, createGameRuntimePreview, stepGameRuntime } from "../src/wp200-game-runtime-core.ts";
import { createGameBuildRecord, type GameBuildRequest } from "../src/wp200-game-build-pipeline.ts";

const hash = asSha256("a".repeat(64));
const capabilities: RuntimeCapabilityProfile = {
  pointer: true, touch: true, keyboard: true, mouse: true, gamepad: false,
  screenWidth: 1280, screenHeight: 900, devicePixelRatio: 1, audio: true,
  graphics: "CANVAS2D", webGpuBenefitMeasured: false, reducedMotion: false,
};
const dependencies = await createGameDependencySnapshot("benchmark-game-package", "1.0.0", [{
  assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw-rev-1"), contentHash: hash,
  byteLength: 64, mimeType: "image/png", mode: "PINNED", required: true,
}]);
const project = await createGameProjectRevision({
  schemaVersion: 1,
  projectId: asGameProjectId("benchmark-game-project"),
  revisionId: "game-rev-1",
  packageId: asPackageId("benchmark-game-package"),
  packageVersion: "1.0.0",
  name: "WP-200 Benchmark",
  scenes: [{
    sceneId: "scene-main", name: "Main", rootEntityIds: ["entity-player"], entities: [{
      entityId: "entity-player", name: "Player", components: [
        { type: "TRANSFORM", componentId: "transform", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        { type: "SPRITE", componentId: "sprite", asset: { kind: "DRAW", assetId: asAssetId("draw/player"), revisionId: asAssetRevisionId("draw-rev-1"), contentHash: hash, byteLength: 64, mimeType: "image/png", mode: "PINNED", provenance: "DRAW2" }, visible: true },
      ],
    }],
  }],
  inputMap: { actions: [{ actionId: "move", label: "Move", bindings: [{ action: "move", source: "KEYBOARD", code: "ArrowRight" }] }] },
  behaviors: [],
  dependencies,
  buildProfile: { target: "PIXIEED_NATIVE_WEB_RUNTIME", runtimeVersion: "0.2.0", capabilityProfile: "benchmark", optimization: "DEBUG" },
});
const flags = { "game-core-read": true, "runtime-preview": true, "runtime-execution": true, "game-build": true };
const session = await createGameRuntimePreview({ project, previewId: "benchmark-preview", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.2.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "0.2.0", capabilities, flags, killSwitch: false });
const buildRequest: GameBuildRequest = { requestId: "benchmark-build", project, packageHash: hash, configuration: { version: "1.0.0" as GameBuildRequest["configuration"]["version"], optimization: "DEBUG", compression: "NONE", capabilityProfile: "benchmark", toolchainVersion: "wp200-local" }, runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.2.0", supportedManifestVersion: 1 }, flags, killSwitch: false };
const started = performance.now();
const iterations = 10000;
let current = session;
for (let index = 0; index < iterations; index += 1) current = stepGameRuntime(current, 16.666, []).session;
const runtimeElapsedMs = performance.now() - started;
const buildStarted = performance.now();
const build = await createGameBuildRecord(buildRequest);
const buildElapsedMs = performance.now() - buildStarted;
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP200_GAME_RUNTIME_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  runtimeElapsedMs: Number(runtimeElapsedMs.toFixed(3)),
  runtimeStepsPerSecond: Number((iterations / Math.max(runtimeElapsedMs / 1000, Number.EPSILON)).toFixed(2)),
  runtimeTick: current.runtime.world.tick,
  buildElapsedMs: Number(buildElapsedMs.toFixed(3)),
  buildLifecycle: build.lifecycle,
  planCacheKey: build.plan?.cacheKey,
  projectSnapshotHash: project.snapshotHash,
  notes: ["Synthetic local Deno measurement only; not a device, browser compositor, memory, or production performance PASS.", "Build is isolated and no artifact is published."],
}, null, 2));
