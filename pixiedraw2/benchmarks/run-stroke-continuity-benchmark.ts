import { EditorCore, createProject, type PixelPoint, type ProjectState } from "../src/draw2-core.ts";
import { executeTimelineCommand, type TimelineCommand } from "../src/draw2-timeline.ts";

function structural(state: ProjectState, commandType: TimelineCommand["commandType"], payload: unknown, sequence: number): TimelineCommand {
  return { commandId: `wp130-stroke-fixture-${sequence}`, commandType, schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "wp130-stroke-fixture", clientId: "wp130-structure-fixture", clientSequence: sequence, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: sequence, payload } as TimelineCommand;
}

const fixtures: Readonly<Record<string, readonly PixelPoint[]>> = {
  horizontalFast: [{ x: 2, y: 2 }, { x: 30, y: 2 }],
  verticalFast: [{ x: 2, y: 4 }, { x: 2, y: 30 }],
  diagonalFast: [{ x: 4, y: 4 }, { x: 30, y: 30 }],
  steepDiagonal: [{ x: 36, y: 2 }, { x: 42, y: 30 }],
  reverseDirection: [{ x: 30, y: 36 }, { x: 2, y: 36 }],
  canvasEdge: [{ x: 0, y: 0 }, { x: 63, y: 0 }],
  repeatedCoordinate: [{ x: 48, y: 48 }, { x: 48, y: 48 }],
  eraserContinuous: [{ x: 30, y: 52 }, { x: 2, y: 52 }],
};

let state = createProject({ projectId: "wp130-stroke-benchmark", width: 64, height: 64, tileSize: 32 });
let structureSequence = 0;
for (let index = 1; index < 3; index += 1) {
  structureSequence += 1;
  const result = await executeTimelineCommand(state, structural(state, "timeline.addFrame", { frameId: `${state.projectId}:frame:${index}`, durationMs: 100 }, structureSequence));
  if (!result.ok) throw new Error(`stroke fixture Frame failed: ${result.diagnostics.map((item) => item.code).join(",")}`);
  state = result.state;
}
structureSequence += 1;
const layer = await executeTimelineCommand(state, structural(state, "timeline.addLayerTrack", { layerTrackId: `${state.projectId}:layer:1`, name: "Stroke Reference Layer" }, structureSequence));
if (!layer.ok) throw new Error(`stroke fixture Layer failed: ${layer.diagnostics.map((item) => item.code).join(",")}`);
state = layer.state;

const records: Record<string, unknown> = {};
let sequence = 1;
const eraserSetup = await new EditorCore(state).execute({ commandId: "wp130-stroke-eraser-setup", commandType: "raster.strokeCommit", schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "wp130-stroke-benchmark", clientId: "wp130-stroke-benchmark", clientSequence: sequence, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: sequence, payload: { points: [{ x: 2, y: 52 }, { x: 30, y: 52 }], colorIndex: 1 } });
if (!eraserSetup.ok) throw new Error("eraser setup failed");
state = eraserSetup.state;
for (const [name, points] of Object.entries(fixtures)) {
  sequence += 1;
  const started = performance.now();
  const result = await new EditorCore(state).execute({ commandId: `wp130-stroke-${name}`, commandType: "raster.strokeCommit", schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "wp130-stroke-benchmark", clientId: "wp130-stroke-benchmark", clientSequence: sequence, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: sequence, payload: { points, colorIndex: name === "eraserContinuous" ? 0 : 1 } });
  if (!result.ok) throw new Error(`${name} failed: ${result.diagnostics.map((item) => item.code).join(",")}`);
  state = result.state;
  records[name] = { elapsedMs: Number((performance.now() - started).toFixed(3)), ...result.result.strokeMetrics, copiedBytes: result.result.copiedBytes, cowSplitCount: result.result.cowSplitCount, canonicalOperationCount: 1, fullRasterCloneCount: result.result.trace.fullRasterCloneCount };
}

console.log(JSON.stringify({ schemaVersion: 1, benchmarkId: "WP130_STROKE_CONTINUITY_AND_DIRTY_LOCALITY", status: "MEASURED_LOCAL_SYNTHETIC_REFERENCE", fixtureCanvas: "64x64", fixtureUnrelatedFrames: state.frames.length - 1, fixtureUnrelatedLayers: state.layers.length - 1, records, notes: ["Bresenham interpolation is deterministic and independent of Pointer Event frequency.", "Each Pointer Stroke is one raster.strokeCommit and one local Undo candidate.", "Formal device, physical stylus, and cross-browser performance remain UNTESTED."] }, null, 2));
