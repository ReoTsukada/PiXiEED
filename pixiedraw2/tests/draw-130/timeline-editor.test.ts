import {
  createDraw130Project,
  createTimelineProjection,
  Draw130Editor,
} from "../../src/draw2/draw-130/timeline-editor.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rejected(value: unknown, code: string): boolean {
  return typeof value === "object" && value !== null &&
    "diagnostics" in value &&
    (value as { diagnostics: readonly { code: string }[] }).diagnostics[0]
        ?.code === code;
}

Deno.test("DRAW-130 layer/frame/cel structure edits are atomic and recoverable", async () => {
  const editor = new Draw130Editor(
    createDraw130Project({
      projectId: "draw130-structure",
      width: 16,
      height: 16,
      palette: [0, 0xffffffff],
    }),
  );
  const baseEpoch = editor.state.structureEpoch;
  const layer = await editor.addLayer("Ink");
  assert(
    "operation" in layer && editor.state.layers.length === 2,
    "Adding a layer should commit one structural operation.",
  );
  assert(
    editor.state.cels.length === 2,
    "A new layer should receive one Cel per Frame.",
  );
  const frame = await editor.addFrame(120);
  assert(
    "operation" in frame && editor.state.frames.length === 2,
    "Adding a frame should commit one structural operation.",
  );
  assert(
    Number(editor.state.cels.length) === 4,
    "A new frame should receive one Cel per Layer.",
  );
  assert(
    editor.state.structureEpoch === baseEpoch + 2,
    "Each structural operation should advance structureEpoch once.",
  );
  const duplicate = await editor.duplicateFrame(
    editor.state.frames[0]?.id ?? "missing",
  );
  assert("operation" in duplicate, "Frame duplication should commit.");
  assert(
    Number(editor.state.frames.length) === 3,
    "Frame duplication should preserve the grid.",
  );
  assert(
    Number(editor.state.cels.length) === 6,
    "Duplicating a frame should preserve one Cel per layer.",
  );
  const undoBefore = Number(editor.undoDepth);
  editor.undo();
  assert(
    Number(editor.state.frames.length) === 2 &&
      Number(editor.undoDepth) === undoBefore - 1,
    "Undo should revert one structural operation only.",
  );
  editor.redo();
  assert(
    Number(editor.state.frames.length) === 3,
    "Redo should restore the structural operation.",
  );
});

Deno.test("DRAW-130 layer metadata and hidden/locked write guards fail closed", async () => {
  const editor = new Draw130Editor(
    createDraw130Project({
      projectId: "draw130-guards",
      width: 8,
      height: 8,
      palette: [0, 0xffffffff],
    }),
  );
  const layerId = editor.state.activeLayerId;
  const frameId = editor.state.activeFrameId;
  const hidden = await editor.setLayerVisibility(layerId, false);
  assert(
    "operation" in hidden && editor.state.layers[0]?.visible === false,
    "Visibility should be structural metadata.",
  );
  assert(
    rejected(await editor.setLayerWritable(layerId, frameId), "LAYER_HIDDEN"),
    "Hidden layer must reject writes.",
  );
  const visible = await editor.setLayerVisibility(layerId, true);
  assert("operation" in visible, "Visibility restore should commit.");
  const locked = await editor.setLayerLock(layerId, true);
  assert("operation" in locked, "Lock should be structural metadata.");
  assert(
    rejected(await editor.setLayerWritable(layerId, frameId), "LAYER_LOCKED"),
    "Locked layer must reject writes.",
  );
  const invalidOpacity = await editor.setLayerOpacity(layerId, Number.NaN);
  assert(
    rejected(invalidOpacity, "LAYER_OPACITY_INVALID"),
    "Invalid opacity must fail closed.",
  );
});

Deno.test("DRAW-130 1000x100 timeline uses a bounded projection", () => {
  const base = createDraw130Project({
    projectId: "draw130-virtual",
    width: 4,
    height: 4,
    palette: [0, 0xffffffff],
  });
  const editor = new Draw130Editor(base);
  const synthetic = {
    ...base,
    frames: Array.from({ length: 1000 }, (_, index) => ({
      id: `frame-${index}`,
      frameId: `frame-${index}`,
      index,
      orderKey: String(index).padStart(8, "0"),
      durationMs: 100,
      timingUnit: "MILLISECONDS" as const,
      metadataVersion: 1,
    })),
    layers: Array.from({ length: 100 }, (_, index) => ({
      id: `layer-${index}`,
      layerTrackId: `layer-${index}`,
      name: `Layer ${index}`,
      order: index,
      orderingKey: String(index).padStart(8, "0"),
      visible: true,
      opacity: 1,
      blendMode: "NORMAL" as const,
      locked: false,
      lifecycle: "ACTIVE" as const,
    })),
    cels: [],
    timeline: {
      ...base.timeline,
      frameOrder: Array.from({ length: 1000 }, (_, index) => `frame-${index}`),
      layerTrackOrder: Array.from(
        { length: 100 },
        (_, index) => `layer-${index}`,
      ),
    },
  };
  const projection = createTimelineProjection(synthetic, {
    frameStart: 490,
    frameCount: 12,
    layerStart: 45,
    layerCount: 8,
    overscan: 2,
  });
  assert(
    projection.totalFrames === 1000 && projection.totalLayers === 100,
    "Projection should report full virtual totals.",
  );
  assert(
    projection.visibleFrames.length === 12 &&
      projection.visibleLayers.length === 8,
    "Projection should mount only the visible window.",
  );
  assert(
    projection.metrics.totalItems === 100_000,
    "Total virtual cell count should be recorded.",
  );
  assert(
    projection.metrics.mountedItems < projection.metrics.totalItems,
    "Projection must not materialize the full grid.",
  );
});

Deno.test("DRAW-130 Onion Skin and Playback are non-destructive projections", async () => {
  const editor = new Draw130Editor(
    createDraw130Project({
      projectId: "draw130-preview",
      width: 8,
      height: 8,
      palette: [0, 0xffffffff],
    }),
  );
  await editor.addFrame(100);
  await editor.addFrame(100);
  const beforeHash = await editor.structureHash();
  const beforeUndo = editor.undoDepth;
  const onion = editor.setOnionSkin(true, 2, 2);
  assert(
    "before" in onion && onion.enabled,
    "Onion Skin should be enabled as a projection.",
  );
  editor.setPlayback(true, true);
  const first = editor.playback.frameId;
  const next = editor.nextPlaybackFrame();
  assert(
    next !== "" && editor.playback.playing,
    "Playback should advance without mutating project structure.",
  );
  editor.setPlayback(false);
  assert(
    await editor.structureHash() === beforeHash,
    "Onion Skin and Playback must not change canonical structure.",
  );
  assert(
    editor.undoDepth === beforeUndo,
    "Projection controls must not add Undo entries.",
  );
  assert(first !== "", "Playback should have an initial frame.");
});

Deno.test("DRAW-130 stale references, invalid duration, and last-item deletes are rejected", async () => {
  const editor = new Draw130Editor(
    createDraw130Project({
      projectId: "draw130-negative",
      width: 8,
      height: 8,
      palette: [0, 0xffffffff],
    }),
  );
  assert(
    rejected(
      await editor.changeFrameDuration("missing", 100),
      "FRAME_NOT_FOUND",
    ),
    "Unknown frame must be rejected.",
  );
  assert(
    rejected(await editor.addFrame(0), "FRAME_DURATION_INVALID"),
    "Zero duration must be rejected.",
  );
  assert(
    rejected(
      await editor.removeFrame(editor.state.activeFrameId),
      "LAST_FRAME_REMOVE",
    ),
    "Last frame must be retained.",
  );
  assert(
    rejected(
      await editor.removeLayer(editor.state.activeLayerId),
      "LAST_LAYER_REMOVE",
    ),
    "Last layer must be retained.",
  );
  assert(
    rejected(
      await editor.replaceCelBinding(
        editor.state.activeLayerId,
        editor.state.activeFrameId,
        "missing",
      ),
      "ASSET_NOT_FOUND",
    ),
    "Unknown Cel asset must be rejected.",
  );
  assert(
    editor.undoDepth === 0,
    "Rejected structural commands must not create history.",
  );
});
