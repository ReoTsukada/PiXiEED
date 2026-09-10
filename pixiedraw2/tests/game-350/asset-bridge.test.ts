import {
  createGameAudioCaptureDraft,
  createGameDrawCaptureDraft,
  gameAudioAssetForCaptureDraft,
} from "../../src/game/game-350/asset-bridge.ts";
import { commitGameAudioTransaction } from "../../src/game/game-350/game-audio.ts";
import { createDefaultGamePlaygroundConfig } from "../../src/game/game-350/playground.ts";
import type { Draw2AssetBridgeSnapshot } from "../../src/draw2-asset-bridge-contract.ts";
import type { PxdAssetDefinitionEntry } from "../../src/draw2-export.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const definition = {
  sourceProjectId: "draw-project",
  sourceCanvasId: "draw:hero",
  sourceKind: "SELECTED_LAYERS",
  sourceLayerIds: ["layer:body", "layer:weapon"],
  frameStart: 1,
  frameEnd: 2,
  layerSelection: { kind: "SELECTED_LAYERS", layerIds: ["layer:body", "layer:weapon"] },
  frameSelection: { kind: "RANGE", startFrameId: "frame:0", endFrameId: "frame:1" },
  region: { kind: "MANUAL", x: 0, y: 0, width: 32, height: 32 },
  animationMapping: [{
    name: "WALK_DOWN",
    frameIds: ["frame:0", "frame:1"],
    loopMode: "LOOP",
    sourceFrames: [
      { sourceFrameId: "frame:0", layerIds: ["layer:body", "layer:weapon"], rect: { x: 0, y: 0, width: 32, height: 32 }, durationMs: 90 },
      { sourceFrameId: "frame:1", layerIds: ["layer:body", "layer:weapon"], rect: { x: 32, y: 0, width: 32, height: 32 }, durationMs: 120 },
    ],
  }],
  assetKind: "CHARACTER",
  pivot: "FEET",
} as unknown as PxdAssetDefinitionEntry["definition"];

function snapshot(
  overrides: Partial<Draw2AssetBridgeSnapshot["selection"]> = {},
  assetDefinitions: readonly PxdAssetDefinitionEntry[] = [{ definitionId: "definition:hero", definition }],
): Draw2AssetBridgeSnapshot {
  return {
    projectId: "draw-project",
    selection: {
      hasSelection: true,
      pixelCount: 128,
      kind: "rectangle",
      region: { x: 0, y: 0, width: 32, height: 32 },
      sourceCanvasId: "draw:hero",
      layerId: "layer:body",
      frameId: "frame:0",
      frameNumber: 1,
      ...overrides,
    },
    frameNumbers: { "frame:0": 1, "frame:1": 2 },
    layers: [
      { layerTrackId: "layer:body", name: "Body", visible: true },
      { layerTrackId: "layer:weapon", name: "Weapon", visible: true },
    ],
    assetDefinitions,
    assetPackages: [],
  };
}

const drawReference = {
  kind: "DRAW" as const,
  assetId: "draw:hero",
  revisionId: "draw-revision:1",
  contentHash: "hash:hero",
  mode: "LIVE" as const,
  label: "Hero",
  assetDefinitionId: "definition:hero",
};

Deno.test("GAME350-BRIDGE-DRAW-001 keeps animation frame order, layers, and durations", () => {
  const result = createGameDrawCaptureDraft({ snapshot: snapshot(), reference: drawReference });
  assert(result.ok, "a selected Draw range should produce a capture draft");
  assert(result.value.sourceFrames.length === 2, "the full animation frame sequence must return");
  assert(result.value.sourceFrames[0]?.sourceFrameId === "frame:0", "source frame order must remain stable");
  assert(result.value.sourceFrames[1]?.durationMs === 120, "per-frame duration must remain metadata");
  assert(result.value.sourceFrames[0]?.layerIds?.join(",") === "layer:body,layer:weapon", "selected layers must remain attached to each frame");
  const serialized = JSON.stringify(result.value.reference);
  assert(!serialized.includes('"kind":"DRAW"'), "Bridge kind must not leak into the Game reference");
  assert(result.value.reference.projectId === "draw-project", "source project identity must be retained");
});

Deno.test("GAME350-BRIDGE-DRAW-002 splits a raw 16px sprite sheet without raster transfer", () => {
  const result = createGameDrawCaptureDraft({
    snapshot: snapshot({
      pixelCount: 64,
      region: { x: 4, y: 8, width: 32, height: 16 },
      frameId: "frame:raw",
      frameNumber: 1,
    }, []),
    reference: (() => {
      const { assetDefinitionId: _assetDefinitionId, ...rawReference } = drawReference;
      return rawReference;
    })(),
    layout: "GRID_32",
    grid: { cellWidth: 16 },
  });
  assert(result.ok, "a raw sprite sheet selection should produce a draft");
  assert(result.value.sourceFrames.length === 2, "the 32x16 sheet must split into two 16px cells");
  assert(result.value.sourceFrames[1]?.rect.x === 20, "sprite-sheet cells must be row-major");
  assert(result.value.sourceFrames[0]?.layerIds?.[0] === "layer:body", "the active layer must be retained");
});

Deno.test("GAME350-BRIDGE-DRAW-003 fails closed without a valid selection or definition", () => {
  const noSelection = createGameDrawCaptureDraft({
    snapshot: snapshot({ hasSelection: false, region: null }),
    reference: drawReference,
  });
  assert(!noSelection.ok && noSelection.error.code === "DRAW_SELECTION_REQUIRED", "missing selection must be rejected");
  const wrongDefinition = createGameDrawCaptureDraft({
    snapshot: snapshot(),
    reference: drawReference,
    definitionId: "definition:other",
  });
  assert(!wrongDefinition.ok && wrongDefinition.error.code === "DRAW_DEFINITION_NOT_FOUND", "foreign or missing definition must be rejected");
});

Deno.test("GAME350-BRIDGE-DRAW-004 rejects cross-Project and unscoped local references", () => {
  const foreignProject = createGameDrawCaptureDraft({
    snapshot: snapshot(),
    reference: { ...drawReference, projectId: "another-project", referenceScope: "LOCAL_PROJECT" },
  });
  assert(!foreignProject.ok && foreignProject.error.code === "DRAW_PROJECT_MISMATCH", "a local reference from another Project must be rejected");
  const missingLocalProject = createGameDrawCaptureDraft({
    snapshot: snapshot(),
    reference: { ...drawReference, referenceScope: "LOCAL_PROJECT" },
  });
  assert(!missingLocalProject.ok && missingLocalProject.error.code === "DRAW_PROJECT_MISMATCH", "a local reference without Project identity must be rejected");
});

Deno.test("GAME350-BRIDGE-AUDIO-001 converts BGM and SE Tick ranges into metadata-only assets", () => {
  const selection = { trackIds: ["track:music", "track:music"], startTick: 960, durationTick: 480, snap: "BEAT" as const };
  const bgmDraft = createGameAudioCaptureDraft({
    selection,
    projectId: "audio-project",
    projectRevision: 7,
    projectStateHash: "hash:audio:7",
    label: "Field Theme",
    kind: "BGM",
    mode: "LIVE",
  });
  assert(bgmDraft.ok, "BGM range must produce a draft");
  const bgm = gameAudioAssetForCaptureDraft(bgmDraft.value);
  assert(bgm.ok, "BGM draft must produce an asset");
  assert(bgm.value.kind === "BGM" && bgm.value.defaults.loop, "BGM defaults must be role-aware");
  assert(bgm.value.source.startTick === 960 && bgm.value.source.durationTick === 480, "PPQ Tick range must remain unchanged");
  assert(bgm.value.source.trackIds.length === 1, "duplicate selected tracks must be normalized");
  const seDraft = createGameAudioCaptureDraft({
    selection: { ...selection, trackIds: ["track:sfx"] },
    projectId: "audio-project",
    projectRevision: 7,
    projectStateHash: "hash:audio:7",
    label: "Jump",
    kind: "SE",
    mode: "PINNED",
  });
  assert(seDraft.ok, "SE range must produce a draft");
  const se = gameAudioAssetForCaptureDraft(seDraft.value);
  assert(se.ok && !se.value.defaults.loop && se.value.source.mode === "PINNED", "SE defaults and reference mode must be retained");
});

Deno.test("GAME350-BRIDGE-AUDIO-002 rejects mismatched roles and makes duplicate shelf capture a no-op", () => {
  const config = createDefaultGamePlaygroundConfig();
  const draft = createGameAudioCaptureDraft({
    selection: { trackIds: ["track:sfx"], startTick: 0, durationTick: 120, snap: "FREE" },
    projectId: "audio-project",
    projectRevision: 1,
    projectStateHash: "hash:1",
    label: "Click",
    kind: "SE",
    mode: "LIVE",
  });
  assert(draft.ok, "valid SE draft should be accepted");
  const asset = gameAudioAssetForCaptureDraft(draft.value);
  assert(asset.ok, "valid SE draft should produce an asset");
  const created = commitGameAudioTransaction({ config, asset: asset.value, expectedProjectRevision: 1, expectedProjectStateHash: "hash:1", currentProjectRevision: 1, currentProjectStateHash: "hash:1", commitId: "capture:1" });
  assert(created.result === "CREATED" && created.saveCount === 1, "first shelf capture must save once");
  const reused = commitGameAudioTransaction({ config: created.config, asset: asset.value, expectedProjectRevision: 1, expectedProjectStateHash: "hash:1", currentProjectRevision: 1, currentProjectStateHash: "hash:1", commitId: "capture:2" });
  assert(reused.result === "REUSED" && reused.saveCount === 0, "duplicate shelf capture must not save again");
  const mismatch = commitGameAudioTransaction({ config, asset: { ...asset.value, kind: "BGM" }, target: { kind: "OBJECT_TRIGGER", placementId: "hero", trigger: "JUMP" }, expectedProjectRevision: 1, expectedProjectStateHash: "hash:1", currentProjectRevision: 1, currentProjectStateHash: "hash:1", commitId: "capture:3" });
  assert(mismatch.result === "REJECTED" && mismatch.saveCount === 0, "BGM must not bind to an SE trigger");
});
