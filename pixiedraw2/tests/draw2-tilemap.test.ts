import { createProject } from "../src/draw2-core.ts";
import {
  createDraw2Tilemap,
  setDraw2TilemapCell,
  tilemapIdFor,
} from "../src/draw2-tilemap.ts";
import {
  deserializeDraw2ProjectState,
  serializeDraw2ProjectState,
} from "../src/draw2-persistence.ts";
import {
  exportPxdProject,
  importPxdProject,
} from "../src/draw2-export.ts";
import { executeTimelineCommand } from "../src/draw2-timeline.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 Tilemap stays sparse and persists through state/PXD", async () => {
  const state = createProject({
    projectId: "tilemap-sparse",
    width: 64,
    height: 64,
    tileSize: 32,
  });
  const map = createDraw2Tilemap({
    id: tilemapIdFor("layer-map", state.activeFrameId),
    layerTrackId: "layer-map",
    frameId: state.activeFrameId,
    canvasWidth: 64,
    canvasHeight: 64,
    cellSize: 16,
  });
  const occupied = setDraw2TilemapCell(map, 2, 1, {
    sourceAssetId: state.activeAssetId,
    sourceX: 0,
    sourceY: 0,
    transform: "NONE",
  });
  const withMap = {
    ...state,
    tilemaps: { [occupied.id]: occupied },
  };
  assert(Object.keys(occupied.cells).length === 1, "Tilemap should store one sparse cell.");
  const restored = deserializeDraw2ProjectState(
    serializeDraw2ProjectState(withMap),
  );
  assert(
    restored.tilemaps?.[occupied.id]?.cells["2:1"]?.sourceAssetId ===
      state.activeAssetId,
    "Serialized Tilemap reference was not restored.",
  );
  const pxd = await exportPxdProject(withMap);
  const imported = await importPxdProject(pxd.bytes);
  assert(
    imported.state.tilemaps?.[occupied.id]?.cells["2:1"]?.sourceX === 0,
    "PXD Tilemap reference was not restored.",
  );
});

Deno.test("Timeline can create a dedicated Tilemap layer without a Raster cel", async () => {
  const state = createProject({ projectId: "tilemap-layer", width: 32, height: 32 });
  const sequence = 1;
  const layerTrackId = `${state.projectId}:tilemap`;
  const addResult = await executeTimelineCommand(state, {
    commandId: "tilemap-add-layer",
    commandType: "timeline.addLayerTrack",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "test",
    clientId: "test",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: { layerTrackId, name: "Tilemap", kind: "TILEMAP" },
  });
  assert(addResult.ok, "Tilemap layer command failed.");
  const layer = addResult.state.layers.find((item) => item.layerTrackId === layerTrackId);
  assert(layer?.kind === "TILEMAP", "Layer kind was not preserved.");
  const activateResult = await executeTimelineCommand(addResult.state, {
    commandId: "tilemap-activate",
    commandType: "timeline.activateCel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "test",
    clientId: "test",
    clientSequence: 2,
    baseStructureEpoch: addResult.state.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: {
      celId: `${state.projectId}:tilemap-cel`,
      frameId: state.activeFrameId,
      layerTrackId,
    },
  });
  assert(activateResult.ok, "Tilemap cel activation failed.");
  const cel = activateResult.state.cels.find((item) => item.layerTrackId === layerTrackId);
  assert(cel?.bindingMode === "TILEMAP", "Tilemap layer created a Raster cel.");
  assert(cel?.assetId === undefined, "Tilemap cel unexpectedly owns Raster bytes.");
});

Deno.test("Removing a frame removes only its Tilemap references", async () => {
  const state = createProject({ projectId: "tilemap-frame-cleanup", width: 32, height: 32 });
  const secondFrameId = `${state.projectId}:frame:second`;
  const addFrameResult = await executeTimelineCommand(state, {
    commandId: "tilemap-add-frame",
    commandType: "timeline.addFrame",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "test",
    clientId: "test",
    clientSequence: 1,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: { frameId: secondFrameId },
  });
  assert(addFrameResult.ok, "Second Frame command failed.");
  const layerTrackId = addFrameResult.state.activeLayerId;
  const map = createDraw2Tilemap({
    id: tilemapIdFor(layerTrackId, secondFrameId),
    layerTrackId,
    frameId: secondFrameId,
    canvasWidth: 32,
    canvasHeight: 32,
    cellSize: 16,
  });
  const withMap = {
    ...addFrameResult.state,
    tilemaps: { [map.id]: map },
  };
  const removeFrameResult = await executeTimelineCommand(withMap, {
    commandId: "tilemap-remove-frame",
    commandType: "timeline.removeFrame",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "test",
    clientId: "test",
    clientSequence: 2,
    baseStructureEpoch: withMap.structureEpoch,
    createdAtMonotonicMs: 2,
    payload: { frameId: secondFrameId },
  });
  assert(removeFrameResult.ok, "Frame removal command failed.");
  assert(removeFrameResult.state.tilemaps?.[map.id] === undefined, "Removed Frame Tilemap survived cleanup.");
});
