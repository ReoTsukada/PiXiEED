import { createAssetDefinitionDraft } from "../../src/draw2-creator-workspace.ts";
import { importPxdProject } from "../../src/draw2-export.ts";
import type { PxdAssetDefinitionEntry } from "../../src/draw2-export.ts";
import { exportAssetDefinitionPxd } from "../../src/game/game-350/asset-market-export.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createEntry(): PxdAssetDefinitionEntry {
  const draft = createAssetDefinitionDraft({
    sourceProjectId: "project:asset-market-test",
    sourceCanvasId: "canvas:main",
    sourceKind: "VISIBLE_COMPOSITE",
    sourceLayerIds: ["layer:visible"],
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
      name: "WALK_DOWN",
      motionName: "WALK",
      direction: "DOWN",
      frameIds: ["frame:1", "frame:2"],
      loopMode: "LOOP",
      fps: 8,
      sourceFrames: [{
        sourceFrameId: "frame:1",
        layerIds: ["layer:visible"],
        rect: { x: 0, y: 0, width: 2, height: 2 },
        durationMs: 120,
        rasterSnapshot: {
          width: 2,
          height: 2,
          data: [255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }, {
        sourceFrameId: "frame:2",
        layerIds: ["layer:visible"],
        rect: { x: 0, y: 0, width: 2, height: 2 },
        durationMs: 160,
        rasterSnapshot: {
          width: 2,
          height: 2,
          data: [0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      }],
    }],
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: {
      name: "Market Character",
      description: "asset-only delivery",
      tags: ["market", "test"],
    },
  });
  assert(draft.ok, "asset definition should be valid");
  return { definitionId: "definition:market-test", definition: draft.value };
}

Deno.test("GAME350-ASSET-MARKET-001 exports only the selected asset as importable PXD", async () => {
  const entry = createEntry();
  const output = await exportAssetDefinitionPxd({ entry });
  const imported = await importPxdProject(output.bytes, {
    expectedPackageHash: output.packageHash,
  });
  assert(imported.state.frames.length === 2, "asset PXD should contain two frames");
  assert(Object.keys(imported.state.assets).length === 2, "asset PXD should contain two raster payloads");
  assert(imported.assetDefinitions.length === 1, "asset PXD should contain one definition");
  assert(imported.assetDefinitions[0]?.definitionId === entry.definitionId, "definition identity should be preserved");
  assert(imported.manifest.modules.audio.status === "EMPTY", "asset PXD must not include audio");
  assert(imported.manifest.modules.game.status === "EMPTY", "asset PXD must not include game state");
  assert(imported.manifest.entries.every((item) => item.path.startsWith("objects/asset-")), "asset PXD must not contain unrelated project files");
});

Deno.test("GAME350-ASSET-MARKET-002 exports the same captured asset deterministically", async () => {
  const entry = createEntry();
  const first = await exportAssetDefinitionPxd({
    entry,
  });
  const second = await exportAssetDefinitionPxd({
    entry,
  });
  assert(first.packageHash === second.packageHash, "same captured asset must export deterministically");
  const imported = await importPxdProject(first.bytes);
  assert(imported.state.frames.length === 2, "repeated source captures should not duplicate frames");
});
