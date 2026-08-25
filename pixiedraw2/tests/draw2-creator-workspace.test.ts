import {
  canCrossToolConsumeAsset,
  createAssetDefinitionDraft,
  createCreatorWorkspaceState,
  findAffectedAssetDefinitions,
  transitionCreatorWorkspaceMode,
  validateAssetDefinitionDraft,
} from "../src/draw2-creator-workspace.ts";

Deno.test("Creator Workspace mode transition keeps one local session state", () => {
  const initial = createCreatorWorkspaceState();
  const asset = transitionCreatorWorkspaceMode(initial, "ASSET");
  const game = transitionCreatorWorkspaceMode(asset, "GAME");
  if (initial.activeMode !== "DRAW" || asset.activeMode !== "ASSET" || game.activeMode !== "GAME") {
    throw new Error("Creator mode transition did not update the local mode.");
  }
  if (game.schemaVersion !== 1 || "assetDraft" in game) {
    throw new Error("Mode transition duplicated or fabricated project data.");
  }
});

Deno.test("Asset draft normalizes references and remains a local draft", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: " Adventure.pxd ",
    sourceCanvasId: " canvas-main ",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["weapon", "body", "weapon", ""],
    frameStart: 1,
    frameEnd: 24,
    frameSelection: { kind: "RANGE", startFrameId: "frame-001", endFrameId: "frame-024" },
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "Hero", tags: ["player", "player"] },
    dependencyIds: ["dep-b", "dep-a", "dep-b"],
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value.sourceProjectId !== "Adventure.pxd") throw new Error("Project ID was not normalized.");
  if (result.value.sourceCanvasId !== "canvas-main") throw new Error("Canvas ID was not normalized.");
  if (result.value.sourceLayerIds.join(",") !== "body,weapon") throw new Error("Layer references are not deterministic.");
  if (result.value.dependencyIds.join(",") !== "dep-a,dep-b") throw new Error("Dependency references are not deterministic.");
  if (result.value.persistence !== "LOCAL_DRAFT") throw new Error("Draft was reported as persisted.");
  if (result.value.frameSelection.kind !== "RANGE" || result.value.frameSelection.startFrameId !== "frame-001") throw new Error("Stable frame references are missing.");
  if (result.value.metadata.tags.join(",") !== "player") throw new Error("Metadata tags are not deterministic.");
});

Deno.test("Asset draft rejects invalid frame ranges and missing source", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "",
    sourceCanvasId: "canvas-main",
    sourceKind: "VISIBLE_COMPOSITE",
    sourceLayerIds: [],
    frameStart: 4,
    frameEnd: 2,
    frameSelection: { kind: "RANGE", startFrameId: "frame-004", endFrameId: "frame-002" },
    assetKind: "OBJECT",
    pivot: "CENTER",
  });
  if (result.ok || result.code !== "INVALID_ASSET_DRAFT") throw new Error("Invalid Asset draft was accepted.");
});

Deno.test("Asset definition validates explicitly without becoming Registry state", () => {
  const draft = createAssetDefinitionDraft({
    sourceProjectId: "project-1",
    sourceCanvasId: "canvas-1",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-body", "layer-hair"],
    frameStart: 1,
    frameEnd: 4,
    layerSelection: { kind: "SELECTED_LAYERS", layerIds: ["layer-body", "layer-hair"] },
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-1", "frame-2", "frame-3", "frame-4"] },
    region: { kind: "GRID", cellSize: 16, x: 0, y: 0, columns: 4, rows: 3 },
    animationMapping: [{ name: "IDLE", frameIds: ["frame-1", "frame-2"], loopMode: "LOOP", fps: 12 }],
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "Hero", description: "Live source reference" },
  });
  if (!draft.ok) throw new Error(draft.message);
  const validated = validateAssetDefinitionDraft(draft.value);
  if (!validated.ok || validated.value.persistence !== "VALIDATED_DEFINITION") throw new Error("Draft did not promote to validated definition.");
  if (canCrossToolConsumeAsset(draft.value) || canCrossToolConsumeAsset(validated.value)) throw new Error("Unregistered definition crossed the tool boundary.");
  const serialized = JSON.stringify(draft.value);
  if (/pixel|pixels|base64|dataUrl|blob|bytes/i.test(serialized)) throw new Error("Asset definition copied pixel/blob data.");
});

Deno.test("Asset definition rejects unstable or invalid reference selections", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "project-1",
    sourceCanvasId: "canvas-1",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-1"],
    frameStart: 1,
    frameEnd: 1,
    frameSelection: { kind: "EXPLICIT", frameIds: [] },
    assetKind: "OBJECT",
    pivot: "CENTER",
    metadata: { name: "Object" },
  });
  if (result.ok || result.code !== "INVALID_ASSET_DRAFT") throw new Error("Invalid frame reference selection was accepted.");
});

Deno.test("One Character Asset accepts sparse custom Motion and Direction slots", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "project-character",
    sourceCanvasId: "canvas-1",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-1"],
    frameStart: 1,
    frameEnd: 4,
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-1", "frame-2", "frame-3", "frame-4"] },
    animationMapping: [
      {
        name: "CUSTOM",
        customName: "Cast",
        motionName: "Cast",
        direction: "DOWN",
        frameIds: ["frame-1", "frame-2"],
        loopMode: "LOOP",
        fps: 12,
      },
      {
        name: "CUSTOM",
        customName: "Cast",
        motionName: "Cast",
        direction: "LEFT",
        frameIds: ["frame-3"],
        loopMode: "ONCE",
        fps: 18,
        sourceReference: "Cast::DOWN",
        flipX: true,
        frameDurationsMs: [55],
      },
    ],
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "Hero" },
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value.animationMapping.length !== 2) throw new Error("Sparse custom Motion mapping was not preserved.");
  if (result.value.animationMapping[1]?.sourceReference !== "Cast::DOWN") throw new Error("Mirror source reference was not preserved.");
  if (result.value.animationMapping[1]?.flipX !== true) throw new Error("Mirror flip flag was not preserved.");
});

Deno.test("Asset Frames may reference one Editor Frame more than once when rectangles differ", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "project-character",
    sourceCanvasId: "canvas-1",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-1"],
    frameStart: 1,
    frameEnd: 1,
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-1"] },
    animationMapping: [{
      name: "CUSTOM",
      customName: "Walk",
      motionName: "Walk",
      direction: "DOWN",
      frameIds: ["frame-1", "frame-1"],
      sourceFrames: [
        {
          sourceFrameId: "frame-1",
          layerIds: ["layer-1"],
          rect: { x: 0, y: 0, width: 16, height: 16 },
        },
        {
          sourceFrameId: "frame-1",
          layerIds: ["layer-1"],
          rect: { x: 16, y: 0, width: 16, height: 16 },
        },
      ],
      frameDurationsMs: [83, 120],
      loopMode: "LOOP",
      fps: 12,
    }],
    assetKind: "CHARACTER",
    pivot: "CENTER",
    metadata: { name: "Hero" },
  });
  if (!result.ok) throw new Error(result.message);
  const clip = result.value.animationMapping[0];
  if (clip?.frameIds.join(",") !== "frame-1,frame-1") {
    throw new Error("Repeated source Frame order was not preserved.");
  }
  if (clip.sourceFrames?.[1]?.rect.x !== 16) {
    throw new Error("Per-Frame source rectangles were not preserved.");
  }
});

Deno.test("Asset definition rejects duplicate Motion + Direction slots, not duplicate CUSTOM names alone", () => {
  const result = createAssetDefinitionDraft({
    sourceProjectId: "project-character",
    sourceCanvasId: "canvas-1",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-1"],
    frameStart: 1,
    frameEnd: 2,
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-1", "frame-2"] },
    animationMapping: [
      { name: "CUSTOM", customName: "Cast", motionName: "Cast", direction: "DOWN", frameIds: ["frame-1"], loopMode: "LOOP" },
      { name: "CUSTOM", customName: "Cast", motionName: "Cast", direction: "DOWN", frameIds: ["frame-2"], loopMode: "LOOP" },
    ],
    assetKind: "CHARACTER",
    pivot: "CENTER",
    metadata: { name: "Hero" },
  });
  if (result.ok || result.code !== "INVALID_ASSET_DRAFT") throw new Error("Duplicate Motion + Direction slot was accepted.");
});

Deno.test("Dirty region lookup invalidates only intersecting source definitions", () => {
  const makeDraft = (region: Parameters<typeof createAssetDefinitionDraft>[0]["region"], canvas = "canvas-1") => {
    const result = createAssetDefinitionDraft({
      sourceProjectId: "project-1",
      sourceCanvasId: canvas,
      sourceKind: "SELECTED_LAYERS",
      sourceLayerIds: ["layer-1"],
      frameStart: 1,
      frameEnd: 1,
      frameSelection: { kind: "CURRENT_FRAME", frameId: "frame-1" },
      ...(region === undefined ? {} : { region }),
      assetKind: "OBJECT",
      pivot: "CENTER",
      metadata: { name: "Object" },
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };
  const affected = findAffectedAssetDefinitions([
    { definitionId: "full", definition: makeDraft({ kind: "FULL_CANVAS" }) },
    { definitionId: "left", definition: makeDraft({ kind: "MANUAL", x: 0, y: 0, width: 16, height: 16 }) },
    { definitionId: "right", definition: makeDraft({ kind: "MANUAL", x: 32, y: 0, width: 16, height: 16 }) },
    { definitionId: "other-canvas", definition: makeDraft({ kind: "FULL_CANVAS" }, "canvas-2") },
  ], { sourceProjectId: "project-1", sourceCanvasId: "canvas-1", x: 8, y: 8, width: 4, height: 4 });
  if (affected.join(",") !== "full,left") throw new Error(`Unexpected affected definitions: ${affected.join(",")}`);
});
