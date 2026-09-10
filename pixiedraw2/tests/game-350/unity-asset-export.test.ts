import { createAssetDefinitionDraft } from "../../src/draw2-creator-workspace.ts";
import type { PxdAssetDefinitionEntry } from "../../src/draw2-export.ts";
import {
  createUnityAssetImportPackage,
  encodeUnityAssetImportPackageZip,
} from "../../src/game/game-350/unity-asset-export.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const framePixels = [
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255,
];

function createEntry(assetKind: "CHARACTER" | "OBJECT" | "TILE" | "BACKGROUND" | "EFFECT"): PxdAssetDefinitionEntry {
  const draft = createAssetDefinitionDraft({
    sourceProjectId: "project:unity-test",
    sourceCanvasId: "canvas:main",
    sourceKind: "VISIBLE_COMPOSITE",
    sourceLayerIds: [],
    frameStart: 1,
    frameEnd: 2,
    frameSelection: {
      kind: "EXPLICIT",
      frameIds: ["frame:1", "frame:2"],
    },
    region: {
      kind: "MANUAL",
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    },
    animationMapping: [{
      name: "IDLE_DOWN",
      motionName: "IDLE",
      direction: "DOWN",
      frameIds: ["frame:1"],
      loopMode: "LOOP",
      fps: 12,
      sourceFrames: [{
        sourceFrameId: "frame:1",
        layerIds: ["visible"],
        rect: { x: 0, y: 0, width: 2, height: 2 },
        rasterSnapshot: { width: 2, height: 2, data: framePixels },
        durationMs: 100,
      }],
    }, {
      name: "WALK_RIGHT",
      motionName: "WALK",
      direction: "RIGHT",
      frameIds: ["frame:1", "frame:2"],
      loopMode: "LOOP",
      fps: 8,
      sourceFrames: [{
        sourceFrameId: "frame:1",
        layerIds: ["visible"],
        rect: { x: 0, y: 0, width: 2, height: 2 },
        rasterSnapshot: { width: 2, height: 2, data: framePixels },
        durationMs: 120,
      }, {
        sourceFrameId: "frame:2",
        layerIds: ["visible"],
        rect: { x: 0, y: 0, width: 2, height: 2 },
        rasterSnapshot: {
          width: 2,
          height: 2,
          data: [...framePixels].reverse(),
        },
        durationMs: 140,
      }],
    }],
    assetKind,
    pivot: "FEET",
    metadata: {
      name: "Unity Test Asset",
      description: "固定スプライト出力のテスト",
      tags: ["test", "unity"],
    },
  });
  assert(draft.ok, "test asset definition should be valid");
  return {
    definitionId: "definition:unity-test:" + assetKind.toLowerCase(),
    definition: draft.value,
  };
}

Deno.test("GAME350-UNITY-ASSET-001 exports every asset kind as a deterministic Unity package", async () => {
  for (const assetKind of ["CHARACTER", "OBJECT", "TILE", "BACKGROUND", "EFFECT"] as const) {
    const entry = createEntry(assetKind);
    const first = await createUnityAssetImportPackage(entry);
    const second = await createUnityAssetImportPackage(entry);
    assert(first.ok && second.ok, assetKind + " should export with fixed snapshots");
    assert(first.value.assetKind === assetKind, assetKind + " kind must remain in the manifest");
    assert(first.value.assetId === entry.definitionId, "local export must use the definition id as asset id");
    assert(first.value.revisionId === undefined, "local export must not invent a revision id");
    assert(first.value.contentHash.length === 64, "visual content hash must be emitted");
    assert(first.value.packageHash === second.value.packageHash, "package hash must be deterministic");
    assert(first.value.entries.filter((item) => item.mimeType === "image/png").length === 3, "all animation frames must be included");
    assert(first.value.entries.some((item) => item.path.endsWith("/PiXiEEDAsset.json")), "manifest must be included");
    assert(first.value.entries.some((item) => item.path.endsWith("/PiXiEEDPackage.json")), "package index must be included");
    assert(first.value.entries.some((item) => item.path.endsWith("PiXiEEDAssetImporter.cs")), "Unity Editor importer must be included");
    const manifest = first.value.entries.find((item) => item.path.endsWith("/PiXiEEDAsset.json"));
    assert(manifest !== undefined, "manifest entry must be readable");
    const manifestValue = JSON.parse(new TextDecoder().decode(manifest.bytes)) as Record<string, any>;
    assert(manifestValue.schemaVersion === "UNITY_ASSET_IMPORT_V2", "manifest schema must be explicit");
    assert(manifestValue.manifestHash.length === 64, "manifest hash must be embedded in the manifest");
    assert(manifestValue.identityScope === "LOCAL_DRAFT", "local identity scope must be explicit");
    assert(manifestValue.geometry.frameWidth === 2 && manifestValue.geometry.frameHeight === 2, "frame geometry must be exported");
    assert(manifestValue.geometry.pixelsPerUnit === 2, "pixel art must default to one frame width per Unity unit");
    assert(manifestValue.importSettings.filterMode === "POINT", "pixel import settings must be explicit");
    assert(manifestValue.runtimeProfile.availableDirections.includes("DOWN"), "runtime direction profile must be exported");
    assert(manifestValue.animations[1].frames[1].sourceRect.width === 2, "source frame geometry must be retained");
    const packageManifest = first.value.entries.find((item) => item.path.endsWith("/PiXiEEDPackage.json"));
    assert(packageManifest !== undefined, "package index must be readable");
    const packageManifestValue = JSON.parse(new TextDecoder().decode(packageManifest.bytes)) as Record<string, any>;
    assert(packageManifestValue.packageHash === first.value.packageHash, "package index must expose the archive hash");
    if (assetKind === "TILE") {
      const importer = first.value.entries.find((item) =>
        item.path.endsWith("PiXiEEDAssetImporter.cs")
      );
      assert(
        importer !== undefined &&
          new TextDecoder().decode(importer.bytes).includes("CreateOrUpdateTile"),
        "TILE exports must include a Unity Tile asset path",
      );
    }
    const zip = encodeUnityAssetImportPackageZip(first.value);
    assert(zip[0] === 0x50 && zip[1] === 0x4b, "export must be a ZIP archive");
  }
});

Deno.test("GAME350-UNITY-ASSET-002 fails closed when a frame has no fixed composite", async () => {
  const entry = createEntry("CHARACTER");
  const definition = {
    ...entry.definition,
    animationMapping: entry.definition.animationMapping.map((clip) => ({
      ...clip,
      ...(clip.sourceFrames === undefined ? {} : {
        sourceFrames: clip.sourceFrames.map((frame) => {
          const { rasterSnapshot: _rasterSnapshot, ...withoutSnapshot } = frame;
          return withoutSnapshot;
        }),
      }),
    })),
  };
  const result = await createUnityAssetImportPackage({ ...entry, definition });
  assert(!result.ok, "reference-only frames must not produce a direct Unity package");
  assert(result.diagnostics[0]?.code === "SNAPSHOT_REQUIRED", "missing fixed image must be reported");
});

Deno.test("GAME350-UNITY-ASSET-003 keeps registered identity and emits a reusable Unity animator", async () => {
  const entry = createEntry("CHARACTER");
  const result = await createUnityAssetImportPackage(
    {
      ...entry,
      registryIdentity: { assetId: "asset:hero", revisionId: "revision:7" },
    },
    {
      pixelsPerUnit: 16,
      creator: { creatorId: "creator:one", displayName: "Creator One" },
      collaborators: [{ creatorId: "creator:two", role: "animation" }],
      license: {
        licenseId: "license:hero:7",
        rights: ["COMMERCIAL_USE", "DERIVATIVES"],
        commercialUse: true,
        derivativeAllowed: true,
        attributionRequired: true,
      },
    },
  );
  assert(result.ok, "registered asset should export");
  assert(result.value.assetId === "asset:hero", "registered asset id must be retained");
  assert(result.value.revisionId === "revision:7", "registered revision must be retained");
  assert(result.value.entries.some((item) => item.path.includes("/asset_hero/revision_7/")), "registered revisions must not overwrite local output");
  const manifest = result.value.entries.find((item) => item.path.endsWith("/PiXiEEDAsset.json"));
  assert(manifest !== undefined, "registered manifest must be emitted");
  const manifestValue = JSON.parse(new TextDecoder().decode(manifest.bytes)) as Record<string, any>;
  assert(manifestValue.identityScope === "REGISTERED_REVISION", "registered scope must be explicit");
  assert(manifestValue.creator.creatorId === "creator:one", "creator provenance must be retained");
  assert(manifestValue.license.licenseId === "license:hero:7", "license metadata must be retained");
  assert(manifestValue.importSettings.pixelsPerUnit === 16, "custom pixels per unit must be retained");
  const runtime = result.value.entries.find((item) => item.path.endsWith("PiXiEEDAsset.cs"));
  assert(runtime !== undefined && new TextDecoder().decode(runtime.bytes).includes("PiXiEEDAssetAnimator"), "runtime animator adapter must be included");
  assert(runtime !== undefined && new TextDecoder().decode(runtime.bytes).includes("licenseId"), "rights metadata must remain available in the Unity asset");
});

Deno.test("GAME350-UNITY-ASSET-004 rejects mixed frame sizes instead of producing a jumping animation", async () => {
  const entry = createEntry("OBJECT");
  const definition = {
    ...entry.definition,
    animationMapping: entry.definition.animationMapping.map((clip, clipIndex) => clipIndex === 1
      ? {
        ...clip,
        sourceFrames: (clip.sourceFrames ?? []).map((frame, frameIndex) => frameIndex === 1
          ? {
            ...frame,
            rasterSnapshot: { width: 3, height: 2, data: new Array(24).fill(0) },
          }
          : frame),
      }
      : clip),
  };
  const result = await createUnityAssetImportPackage({ ...entry, definition });
  assert(!result.ok, "mixed frame sizes must not produce a Unity package");
  assert(result.diagnostics[0]?.code === "FRAME_DIMENSION_MISMATCH", "mixed frame sizes must be diagnosed");
});
