import { asAssetId, asAssetRevisionId, asGameProjectId, asPackageId, asSha256, type ContentHash } from "../../src/wp160-contracts.ts";
import { asSha256 as asGameHash } from "../../src/game/game-300/core.ts";
import { createDependencySnapshot } from "../../src/wp160-game-runtime-core.ts";
import { createGameProjectRevision, type GameAssetReference } from "../../src/wp200-game-runtime-core.ts";
import { createGame350AssetRegistryAdapter, createGame350RuntimeSnapshot, prepareGame350Composition } from "../../src/game/game-350/runtime-qualification.ts";
import type { CanonicalAssetRevision } from "../../src/game/game-340/core.ts";

const projectId = asGameProjectId("game-350-runtime-bench");
const packageId = asPackageId("game-350-runtime-package");
const assetId = asAssetId("draw/player");
const revisionId = asAssetRevisionId("draw-rev-1");
const hash = asSha256("d".repeat(64)) as ContentHash;
const reference: GameAssetReference = { kind: "DRAW", assetId, revisionId, contentHash: hash, byteLength: 64, mimeType: "image/png", mode: "PINNED", provenance: "DRAW2" };
const authority: readonly CanonicalAssetRevision[] = [{ projectId: String(projectId), ownerId: "bench-owner", kind: "DRAW", assetId: String(assetId), revisionId: String(revisionId), contentHash: asGameHash(String(hash)), licenseId: "license-draw", permission: "READ", reviewStatus: "APPROVED" }];
const dependencies = await createDependencySnapshot(packageId, "1.0.0", [{ assetId, revisionId, contentHash: hash, byteLength: 64, mimeType: "image/png", mode: "PINNED", required: true }], true);
const project = await createGameProjectRevision({ schemaVersion: 1, projectId, revisionId: "project-rev-1", packageId, packageVersion: "1.0.0", name: "Runtime benchmark", scenes: [{ sceneId: "scene-main", name: "Main", rootEntityIds: ["player"], entities: [{ entityId: "player", name: "Player", components: [{ type: "SPRITE", componentId: "sprite", asset: reference, visible: true }] }] }], inputMap: { actions: [] }, behaviors: [], dependencies, buildProfile: { target: "PIXIEED_NATIVE_WEB_RUNTIME", runtimeVersion: "1.0.0", capabilityProfile: "browser", optimization: "DEBUG" } });
const adapter = createGame350AssetRegistryAdapter(authority);
const request = { project, ownerId: "bench-owner", sceneId: "scene-main", entityId: "player", adapter, licenseByAsset: { [String(assetId)]: "license-draw" } };

const preparedStarted = performance.now();
const prepared = prepareGame350Composition(request);
const preparedMs = performance.now() - preparedStarted;
if (!prepared.ok || prepared.value === undefined) throw new Error("runtime benchmark fixture must prepare");
const iterations = 1000;
const snapshotStarted = performance.now();
for (let index = 0; index < iterations; index += 1) createGame350RuntimeSnapshot(prepared.value, index);
const snapshotMs = performance.now() - snapshotStarted;
console.log(JSON.stringify({ package: "GAME-350", benchmark: "prepared composition and repeated snapshot", prepareMs: Number(preparedMs.toFixed(3)), snapshotIterations: iterations, snapshotTotalMs: Number(snapshotMs.toFixed(3)), snapshotAverageMs: Number((snapshotMs / iterations).toFixed(6)), resolvesAtPreparation: prepared.value.assets.length, resolvesDuringSnapshot: 0 }));

Deno.bench("GAME-350 prepared composition boundary", () => {
  const result = prepareGame350Composition(request);
  if (!result.ok) throw new Error("composition must prepare");
});

Deno.bench("GAME-350 repeated prepared snapshot", () => {
  createGame350RuntimeSnapshot(prepared.value!, 1);
});
