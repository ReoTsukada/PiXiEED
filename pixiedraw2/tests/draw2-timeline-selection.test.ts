import {
  createProject,
  EditorCore,
  type ProjectState,
} from "../src/draw2-core.ts";
import {
  executeTimelineCommand,
  resolvePlaybackProjection,
  type TimelineCommand,
} from "../src/draw2-timeline.ts";
import {
  calculateCanvasResizePlan,
  describeCanvasResizePlan,
} from "../src/draw2-canvas-resize.ts";

function structuralCommand(
  state: ProjectState,
  commandType: TimelineCommand["commandType"],
  payload: unknown,
  sequence: number,
): TimelineCommand {
  return {
    commandId: `timeline-selection-${sequence}-${commandType}`,
    commandType,
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "timeline-selection-test",
    clientId: "timeline-selection-client",
    clientSequence: sequence,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: sequence,
    payload,
  } as TimelineCommand;
}

Deno.test("activating an empty timeline cell creates its Raster backing and switches the active target", async () => {
  let state = createProject({
    projectId: "timeline-selection",
    width: 16,
    height: 16,
    tileSize: 32,
  });
  const frameId = `${state.projectId}:frame:1`;
  const layerTrackId = state.activeLayerId;
  const added = await executeTimelineCommand(
    state,
    structuralCommand(
      state,
      "timeline.addFrame",
      { frameId, durationMs: 100 },
      1,
    ),
  );
  if (!added.ok) throw new Error("Frame creation failed.");
  state = added.state;
  const celId = `${state.projectId}:cel:${layerTrackId}:${frameId}`;
  const activated = await executeTimelineCommand(
    state,
    structuralCommand(state, "timeline.activateCel", {
      celId,
      frameId,
      layerTrackId,
    }, 2),
  );
  if (!activated.ok) {
    throw new Error(
      `Empty Cel activation failed: ${
        activated.diagnostics.map((item) => item.code).join(",")
      }`,
    );
  }
  state = activated.state;
  const cel = state.cels.find((item) => item.celId === celId);
  if (cel?.assetId === undefined || cel.bindingMode !== "RASTER") {
    throw new Error("Activation did not materialize a Raster Cel.");
  }
  if (
    state.activeFrameId !== frameId || state.activeLayerId !== layerTrackId ||
    state.activeCelId !== celId || state.activeAssetId !== cel.assetId
  ) throw new Error("Activation did not switch all active identities.");
  if (state.assets[state.activeAssetId]?.raster.getPixel(2, 3) !== 0) {
    throw new Error("New Cel Raster is not transparent.");
  }

  const painted = await new EditorCore(state).execute({
    commandId: "timeline-selection-paint",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "timeline-selection-test",
    clientId: "draw-client",
    clientSequence: 1,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 3,
    payload: { x: 2, y: 3, colorIndex: 1 },
  });
  if (!painted.ok) throw new Error("Drawing on the activated Cel failed.");
  const paintedCel = painted.state.cels.find((item) => item.celId === celId);
  if (
    paintedCel?.assetId !== painted.state.activeAssetId ||
    painted.state.assets[painted.state.activeAssetId]?.raster.getPixel(2, 3) !==
      1
  ) throw new Error("Drawing did not target the activated Cel Raster.");
});

Deno.test("activating a newly added Layer Track cell switches drawing to that layer", async () => {
  let state = createProject({
    projectId: "timeline-layer-selection",
    width: 12,
    height: 12,
    tileSize: 32,
  });
  const layerTrackId = `${state.projectId}:layer:1`;
  const added = await executeTimelineCommand(
    state,
    structuralCommand(state, "timeline.addLayerTrack", {
      layerTrackId,
      name: "Layer 2",
    }, 1),
  );
  if (!added.ok) throw new Error("Layer Track creation failed.");
  state = added.state;
  const frameId = state.activeFrameId;
  const celId = `${state.projectId}:cel:${layerTrackId}:${frameId}`;
  const activated = await executeTimelineCommand(
    state,
    structuralCommand(state, "timeline.activateCel", {
      celId,
      frameId,
      layerTrackId,
    }, 2),
  );
  if (!activated.ok) throw new Error("New Layer Track Cel activation failed.");
  state = activated.state;
  const painted = await new EditorCore(state).execute({
    commandId: "timeline-layer-selection-paint",
    commandType: "raster.setPixel",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "timeline-selection-test",
    clientId: "draw-client",
    clientSequence: 1,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 3,
    payload: { x: 1, y: 1, colorIndex: 1 },
  });
  if (
    !painted.ok || painted.state.activeLayerId !== layerTrackId ||
    painted.state.activeCelId !== celId ||
    painted.state.assets[painted.state.activeAssetId]?.raster.getPixel(1, 1) !==
      1
  ) {
    throw new Error(
      "Drawing did not target the newly activated Layer Track Cel.",
    );
  }
});

Deno.test("playback projection follows frame durations from a fixed start and never mutates canonical state", async () => {
  let state = createProject({
    projectId: "timeline-playback",
    width: 8,
    height: 8,
    tileSize: 32,
  });
  const frameOne = `${state.projectId}:frame:1`;
  const frameTwo = `${state.projectId}:frame:2`;
  const first = await executeTimelineCommand(
    state,
    structuralCommand(state, "timeline.addFrame", {
      frameId: frameOne,
      durationMs: 100,
    }, 1),
  );
  if (!first.ok) throw new Error("First playback frame creation failed.");
  state = first.state;
  const second = await executeTimelineCommand(
    state,
    structuralCommand(state, "timeline.addFrame", {
      frameId: frameTwo,
      durationMs: 200,
    }, 2),
  );
  if (!second.ok) throw new Error("Second playback frame creation failed.");
  state = second.state;
  const startFrameId = state.timeline.frameOrder[0];
  if (startFrameId === undefined) {
    throw new Error("Playback start frame is missing.");
  }
  const atStart = resolvePlaybackProjection(state, startFrameId, 0);
  const atFrameOne = resolvePlaybackProjection(state, startFrameId, 100);
  const atFrameTwo = resolvePlaybackProjection(state, startFrameId, 300);
  const afterLoop = resolvePlaybackProjection(state, startFrameId, 400);
  if (
    atStart.frameId !== startFrameId || atFrameOne.frameId !== frameOne ||
    atFrameTwo.frameId !== frameTwo || afterLoop.frameId !== startFrameId
  ) throw new Error("Playback did not follow canonical frame durations.");
  if (atFrameTwo.canonicalMutation || afterLoop.canonicalMutation) {
    throw new Error("Playback projection reported a canonical mutation.");
  }
});

Deno.test("canvas resize plan keeps the selected anchor and reports each edge delta", () => {
  const centered = calculateCanvasResizePlan({
    oldWidth: 16,
    oldHeight: 8,
    newWidth: 24,
    newHeight: 12,
    anchor: "CENTER",
  });
  if (
    centered.offsetX !== 4 || centered.offsetY !== 2 ||
    centered.destinationX !== 4 || centered.destinationY !== 2 ||
    centered.copyWidth !== 16 || centered.copyHeight !== 8
  ) throw new Error("Centered resize did not preserve the old canvas position.");
  const description = describeCanvasResizePlan(centered);
  if (!description.includes("left +4px") || !description.includes("bottom +2px")) {
    throw new Error("Resize preview description omitted an edge delta.");
  }
  const cropped = calculateCanvasResizePlan({
    oldWidth: 16,
    oldHeight: 8,
    newWidth: 8,
    newHeight: 4,
    anchor: "BOTTOM_RIGHT",
  });
  if (cropped.sourceX !== 8 || cropped.sourceY !== 4 || cropped.destinationX !== 0 || cropped.destinationY !== 0) {
    throw new Error("Bottom-right crop did not keep the anchored content.");
  }
});
