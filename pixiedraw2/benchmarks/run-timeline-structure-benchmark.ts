import { EditorCore, createProject, type EditorCommand, type ProjectState } from "../src/draw2-core.ts";
import { editCelPixel, executeTimelineCommand, calculateTimelineWindow, measureTimelineMemory, resolveOnionSkinNeighborhood, setTimelineSessionActiveFrame, createTimelineSession, type TimelineCommand } from "../src/draw2-timeline.ts";

function paintCommand(state: ProjectState): EditorCommand {
  return { commandId: `wp130-paint-${state.projectId}`, commandType: "raster.setPixel", schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "wp130-benchmark", clientId: "wp130-paint-client", clientSequence: 1, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: 1, payload: { x: 2, y: 2, colorIndex: 1 } };
}

function structural(state: ProjectState, commandType: TimelineCommand["commandType"], payload: unknown, sequence: number): TimelineCommand {
  return { commandId: `wp130-structure-${state.projectId}-${sequence}-${commandType}`, commandType, schemaVersion: 1, projectId: state.projectId, assetId: state.activeAssetId, actorId: "wp130-benchmark", clientId: "wp130-structure-client", clientSequence: sequence, baseStructureEpoch: state.structureEpoch, createdAtMonotonicMs: sequence, payload } as TimelineCommand;
}

async function buildFixture(projectId: string, width: number, height: number, layerCount: number, frameCount: number): Promise<{ state: ProjectState; nextSequence: number }> {
  const initial = createProject({ projectId, width, height, tileSize: 32 });
  const painted = await new EditorCore(initial).execute(paintCommand(initial));
  if (!painted.ok) throw new Error(`paint fixture failed for ${projectId}`);
  let state = painted.state;
  let sequence = 0;
  for (let index = 1; index < layerCount; index += 1) {
    sequence += 1;
    const result = await executeTimelineCommand(state, structural(state, "timeline.addLayerTrack", { layerTrackId: `${projectId}:layer:${index}`, name: `Layer ${index + 1}` }, sequence));
    if (!result.ok) throw new Error(`layer fixture failed at ${index}: ${result.diagnostics.map((item) => item.code).join(",")}`);
    state = result.state;
  }
  for (let index = 1; index < frameCount; index += 1) {
    sequence += 1;
    const result = await executeTimelineCommand(state, structural(state, "timeline.addFrame", { frameId: `${projectId}:frame:${index}`, durationMs: 100 }, sequence));
    if (!result.ok) throw new Error(`frame fixture failed at ${index}: ${result.diagnostics.map((item) => item.code).join(",")}`);
    state = result.state;
  }
  return { state, nextSequence: sequence };
}

async function runFixture(fixture: { id: string; width: number; height: number; layers: number; frames: number }): Promise<Record<string, unknown>> {
  const built = await buildFixture(`wp130-${fixture.id}`, fixture.width, fixture.height, fixture.layers, fixture.frames);
  let state = built.state;
  let sequence = built.nextSequence;
  const duration = async (type: TimelineCommand["commandType"], payload: unknown): Promise<{ state: ProjectState; result: Awaited<ReturnType<typeof executeTimelineCommand>>; ms: number }> => {
    sequence += 1;
    const started = performance.now();
    const result = await executeTimelineCommand(state, structural(state, type, payload, sequence));
    const ms = performance.now() - started;
    if (!result.ok) throw new Error(`${type} benchmark command failed: ${result.diagnostics.map((item) => item.code).join(",")}`);
    state = result.state;
    return { state, result, ms };
  };
  const initialMemory = measureTimelineMemory(state);
  const add = await duration("timeline.addFrame", { frameId: `${state.projectId}:frame:measure-add`, durationMs: 120 });
  const sourceFrameId = state.timeline.frameOrder[0];
  if (sourceFrameId === undefined) throw new Error("benchmark source frame missing");
  const duplicate = await duration("timeline.duplicateFrame", { sourceFrameId, frameId: `${state.projectId}:frame:measure-duplicate` });
  const duplicateCel = state.cels.find((item) => item.frameId === `${state.projectId}:frame:measure-duplicate`);
  if (duplicateCel === undefined) throw new Error("benchmark duplicate Cel missing");
  const duplicateMemory = measureTimelineMemory(state);
  const editStarted = performance.now();
  const edited = editCelPixel(state, duplicateCel.celId, 3, 2, 2);
  const editMs = performance.now() - editStarted;
  const reorder = await duration("timeline.reorderFrame", { frameId: `${state.projectId}:frame:measure-duplicate`, targetIndex: 0 });
  const remove = await duration("timeline.removeFrame", { frameId: `${state.projectId}:frame:measure-add` });
  const restore = await duration("timeline.addFrame", { frameId: `${state.projectId}:frame:measure-add-restored`, durationMs: 120 });
  const addLayer = await duration("timeline.addLayerTrack", { layerTrackId: `${state.projectId}:layer:measure-add`, name: "Measure Layer" });
  const reorderLayer = await duration("timeline.reorderLayerTrack", { layerTrackId: `${state.projectId}:layer:measure-add`, targetIndex: 0 });
  const session = createTimelineSession(state);
  const activeFrameId = state.timeline.frameOrder[Math.floor(state.timeline.frameOrder.length / 2)] ?? state.timeline.frameOrder[0];
  if (activeFrameId === undefined) throw new Error("benchmark active Frame missing");
  const sessionStarted = performance.now();
  const changedSession = setTimelineSessionActiveFrame(state, session, activeFrameId);
  const sessionMs = performance.now() - sessionStarted;
  const windowStarted = performance.now();
  const window = calculateTimelineWindow(state, { scrollTop: 0, scrollLeft: 48 * Math.floor(state.frames.length / 2), viewportWidth: 480, viewportHeight: 380, overscan: 2 });
  const windowMs = performance.now() - windowStarted;
  const onionStarted = performance.now();
  const onion = resolveOnionSkinNeighborhood(state, activeFrameId, { enabled: true, previousFrameCount: 2, nextFrameCount: 2, opacity: 0.5 });
  const onionMs = performance.now() - onionStarted;
  const memory = measureTimelineMemory(state, window.frameIds.length);
  return {
    fixture,
    timingsMs: { addFrame: Number(add.ms.toFixed(3)), duplicateFrame: Number(duplicate.ms.toFixed(3)), editDuplicatedCel: Number(editMs.toFixed(3)), reorderFrame: Number(reorder.ms.toFixed(3)), removeFrame: Number(remove.ms.toFixed(3)), restoreFrame: Number(restore.ms.toFixed(3)), addLayer: Number(addLayer.ms.toFixed(3)), reorderLayer: Number(reorderLayer.ms.toFixed(3)), activeFrameSwitch: Number(sessionMs.toFixed(3)), timelineWindow: Number(windowMs.toFixed(3)), onionSkinNeighborhood: Number(onionMs.toFixed(3)) },
    duplicate: { copiedBytes: duplicate.result.ok ? duplicate.result.result.copiedBytes : -1, cowSplitCount: duplicate.result.ok ? duplicate.result.result.cowSplitCount : -1, allocatedRasterTileBytesBefore: initialMemory.allocatedRasterTileBytes, allocatedRasterTileBytesAfterDuplicate: duplicateMemory.allocatedRasterTileBytes, fullRasterCloneCount: duplicate.result.ok ? duplicate.result.result.trace.fullRasterCloneCount : -1 },
    editedDuplicate: { copiedBytes: edited.copiedBytes, cowSplitCount: edited.cowSplitCount, dirtyTileCount: edited.dirtyTiles.length, independentRasterAsset: edited.rasterAssetId !== duplicateCel.assetId },
    timeline: { frameCount: state.frames.length, layerTrackCount: state.layers.length, celCount: state.cels.length, visibleFrameCount: window.frameIds.length, visibleLayerTrackCount: window.layerTrackIds.length, totalWidth: window.totalWidth, totalHeight: window.totalHeight, onionReferenceCount: onion.references.length, activeFrameSessionOnly: changedSession.activeFrameId === activeFrameId },
    memory: { initial: initialMemory, final: memory },
    statuses: { formalPerformanceGate: "UNTESTED", realDevice: "UNTESTED", fullCompositor: "UNTESTED" },
  };
}

const fixtures = [
  { id: "A-256-12x60", width: 256, height: 256, layers: 12, frames: 60 },
  { id: "B-512-20x120", width: 512, height: 512, layers: 20, frames: 120 },
  { id: "C-1000-frame", width: 256, height: 256, layers: 1, frames: 1000 },
  { id: "D-100-layer", width: 256, height: 256, layers: 100, frames: 60 },
];
const records = [];
for (const fixture of fixtures) records.push(await runFixture(fixture));
console.log(JSON.stringify({ schemaVersion: 1, benchmarkId: "WP130_TIMELINE_STRUCTURE_FIXTURES", status: "MEASURED_LOCAL_SYNTHETIC_UNTESTED_GATE", metricScopes: ["COMMAND_ONLY", "COMMAND_TO_DIRTY", "DIRTY_TO_PRESENT", "INPUT_TO_VISIBLE", "FULL_COMPOSITOR"], fixtures: records, notes: ["Frame duplicate is metadata/Cel-reference only; no full Raster clone is performed.", "Empty Frames do not materialize Empty Cels or transparent Raster backing.", "Timeline window, Onion Skin, Active Frame, and Playback are projections/session state; real-device and formal performance gates remain UNTESTED."] }, null, 2));
