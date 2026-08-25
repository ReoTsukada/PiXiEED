import { asAssetId, asAssetRevisionId, asSha256, type RuntimeCapabilityProfile } from "../src/wp160-contracts.ts";
import { createDependencySnapshot, createRuntimePreview, loadRuntimeAssets, stepRuntime, type RuntimeAssetResolver } from "../src/wp160-game-runtime-core.ts";

const hash = asSha256("a".repeat(64));
const capabilities: RuntimeCapabilityProfile = {
  pointer: true, touch: true, keyboard: true, mouse: true, gamepad: false,
  screenWidth: 1280, screenHeight: 720, devicePixelRatio: 1, audio: true,
  graphics: "CANVAS2D", webGpuBenefitMeasured: false, reducedMotion: false,
};
const dependencies = await createDependencySnapshot("benchmark-package", "1.0.0", [{
  assetId: asAssetId("sprite/player"), revisionId: asAssetRevisionId("rev-a"), contentHash: hash,
  byteLength: 32, mimeType: "application/octet-stream", mode: "LIVE", required: true,
}], true);
const session = await createRuntimePreview({
  previewId: "benchmark-preview", projectId: "benchmark-project", projectRevisionId: "rev-1",
  packageId: "benchmark-package", packageVersion: "1.0.0",
  runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 },
  supportedRuntimeVersion: "0.1.0", dependencies, capabilities,
  inputMap: { bindings: [{ action: "move-right", source: "KEYBOARD", code: "ArrowRight" }] },
});
const resolver: RuntimeAssetResolver = {
  resolve: async () => ({ assetId: asAssetId("sprite/player"), revisionId: asAssetRevisionId("rev-a"), contentHash: hash, byteLength: 32, mimeType: "application/octet-stream" }),
};
const loaded = await loadRuntimeAssets(session, [{ assetId: asAssetId("sprite/player"), required: true, mode: "LIVE" }], resolver);
const iterations = 10000;
const started = performance.now();
let current = loaded;
for (let index = 0; index < iterations; index += 1) current = stepRuntime(current, 16.666, [], { id: "idle", loop: true, frames: [{ frameId: "a", durationMs: 100 }, { frameId: "b", durationMs: 100 }] }).session;
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP160_RUNTIME_STEP_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  stepsPerSecond: Number((iterations / Math.max(elapsedMs / 1000, Number.EPSILON)).toFixed(2)),
  tick: current.world.tick,
  loadedAssetCount: Object.keys(current.loadedAssets).length,
  diagnostics: current.diagnostics.map((item) => item.code),
  notes: ["Synthetic local Deno measurement only; not a device, browser, startup, memory, or production performance PASS."],
}, null, 2));
