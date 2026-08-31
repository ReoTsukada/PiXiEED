import { asAssetId, asAssetRevisionId, asGameProjectId, asPackageId, asSha256, type ContentHash } from "../../src/wp160-contracts.ts";
import { createDependencySnapshot, type RuntimeAssetPayload } from "../../src/wp160-game-runtime-core.ts";
import { createGameProjectRevision, type GameAssetReference } from "../../src/wp200-game-runtime-core.ts";
import type { CanonicalAssetRevision } from "../../src/game/game-340/core.ts";
import { asSha256 as asGameHash } from "../../src/game/game-300/core.ts";
import { startGame350ProductPreview } from "../../src/game/game-350/product-path.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const hash = asSha256("a".repeat(64));
const assetId = asAssetId("draw/local");
const assetRevisionId = asAssetRevisionId("draw-revision-1");
const reference: GameAssetReference = {
  kind: "DRAW", assetId, revisionId: assetRevisionId, contentHash: hash,
  byteLength: 4, mimeType: "application/x-pixieed-indexed-raster", mode: "LIVE", provenance: "DRAW2",
};

function capabilities() {
  return { pointer: true, touch: false, keyboard: true, mouse: true, gamepad: false, screenWidth: 160, screenHeight: 96, devicePixelRatio: 1, audio: false, graphics: "CANVAS2D" as const, webGpuBenefitMeasured: false, reducedMotion: false };
}

async function fixture() {
  const projectId = asGameProjectId("product-path-project");
  const packageId = asPackageId("product-path-package");
  const dependencies = await createDependencySnapshot(packageId, "1.0.0", [{ assetId, revisionId: assetRevisionId, contentHash: hash, byteLength: 4, mimeType: reference.mimeType, mode: "LIVE", required: true }], true);
  const project = await createGameProjectRevision({
    schemaVersion: 1, projectId, revisionId: "project-revision-1", packageId, packageVersion: "1.0.0", name: "Product path",
    scenes: [{ sceneId: "scene-main", name: "Main", rootEntityIds: ["entity-main"], entities: [{ entityId: "entity-main", name: "Draw", components: [{ type: "SPRITE", componentId: "sprite-main", asset: reference, visible: true }] }] }],
    inputMap: { actions: [] }, behaviors: [], dependencies,
    buildProfile: { target: "PIXIEED_NATIVE_WEB_RUNTIME", runtimeVersion: "1.0.0", capabilityProfile: "browser", optimization: "DEBUG" },
  });
  const authority: readonly CanonicalAssetRevision[] = [{ projectId: String(projectId), ownerId: "owner-1", kind: "DRAW", assetId: String(assetId), revisionId: String(assetRevisionId), contentHash: asGameHash(String(hash)), licenseId: "license-1", permission: "READ", reviewStatus: "APPROVED" }];
  const payloadResolver = { resolve: async (): Promise<RuntimeAssetPayload> => ({ assetId, revisionId: assetRevisionId, contentHash: hash, byteLength: 4, mimeType: reference.mimeType }) };
  return { project, authority, payloadResolver };
}

Deno.test("GAME350-PRODUCT-PATH resolves once and keeps ticks Registry-free", async () => {
  const { project, authority, payloadResolver } = await fixture();
  const result = await startGame350ProductPreview({
    project, authority, ownerId: "owner-1", licenseByAsset: { [String(assetId)]: "license-1" }, sceneId: "scene-main", payloadResolver,
    previewId: "product-preview", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "1.0.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "1.0.0", capabilities: capabilities(), renderer: "CANVAS2D",
  });
  assert(result.ok && result.value !== undefined, "product path must start");
  const product = result.value;
  assert(product.resolution.resolveCountBeforeStart === 0, "authority must not resolve before start");
  assert(product.resolution.resolveCountAfterStart === 1, "one sprite must resolve at composition start");
  product.step(16); product.step(16); product.step(16);
  assert(product.resolution.resolveCountAfterSteps === 1 && product.resolution.steps === 3, "ticks must not resolve through the adapter");
  assert(product.snapshot.tick === 3 && product.session.runtime.loadedAssets[String(assetId)] !== undefined, "loaded canonical payload must remain in runtime");
  assert(product.stop().active === false, "stop must deactivate the lifecycle");
  assert(product.reload().active === true, "reload must reactivate the lifecycle");
});
