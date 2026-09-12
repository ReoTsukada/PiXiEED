import {
  createAlphaLockedWriteSet,
  createAutomaticShadingWriteSet,
  createColorReplaceWriteSet,
  createFrameEffectPlan,
  createPixelPreview,
  createSeamlessPreviewWrites,
  createSeamlessWrapWriteSet,
} from "../src/draw2-pixel-effects.ts";
import { createStrokeAutoOutlineWriteSet } from "../src/draw2-outline-tools.ts";
import {
  EditorCore,
  createProject,
  type EditorCommand,
} from "../src/draw2-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readerFrom(
  width: number,
  height: number,
  pixels: readonly number[],
) {
  return {
    width,
    height,
    palette: [0, 0xffff0000, 0xff00ff00, 0xff0000ff],
    getPixel(x: number, y: number): number {
      return pixels[y * width + x] ?? 0;
    },
  };
}

Deno.test("iDRAW stroke outline is local and preserves opaque artwork outside the stroke", () => {
  const reader = readerFrom(5, 5, [
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 1, 2, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
  ]);
  const writes = createStrokeAutoOutlineWriteSet(reader, [{ x: 2, y: 2 }], {
    colorIndex: 3,
    placement: "OUTSIDE",
    thickness: 1,
    connectivity: 8,
  });
  assert(writes.length === 7, "outside outline should skip the occupied neighbor");
  assert(!writes.some((write) => write.x === 3 && write.y === 2), "opaque artwork was overwritten");
  assert(!writes.some((write) => write.x === 2 && write.y === 2), "stroke source was outlined over");
});

Deno.test("iDRAW pixel effects provide alpha lock, exact replacement, shading, and a non-destructive preview", () => {
  const reader = readerFrom(3, 3, [
    0, 1, 0,
    1, 1, 1,
    0, 1, 0,
  ]);
  const candidates = [
    { x: 0, y: 0, colorIndex: 2 },
    { x: 1, y: 1, colorIndex: 2 },
  ];
  const alphaLocked = createAlphaLockedWriteSet(reader, candidates);
  assert(alphaLocked.length === 1 && alphaLocked[0]?.x === 1, "alpha lock allowed a transparent pixel");
  const replaced = createColorReplaceWriteSet(reader, {
    fromColorIndex: 1,
    toColorIndex: 2,
  });
  assert(replaced.length === 5, "exact color replacement missed visible pixels");
  const shaded = createAutomaticShadingWriteSet(reader, {
    highlightColorIndex: 2,
    shadowColorIndex: 3,
    lightDirection: "TOP_LEFT",
  });
  assert(shaded.length > 0, "shading did not find a visible boundary");
  const preview = createPixelPreview(reader, [{ x: 1, y: 1, colorIndex: 2 }]);
  assert(reader.getPixel(1, 1) === 1, "preview mutated the canonical reader");
  assert(preview.getPixel(1, 1) === 2, "preview did not project the write");
});

Deno.test("iDRAW seamless preview repeats transient pixels while commit wrapping stays in bounds", () => {
  const reader = readerFrom(4, 4, new Array<number>(16).fill(0));
  const preview = createSeamlessPreviewWrites(
    reader,
    [{ x: 0, y: 3, colorIndex: 1 }],
    { horizontalRepeats: 1, verticalRepeats: 1 },
  );
  assert(preview.length === 9, "seamless preview did not produce a 3x3 projection");
  const wrapped = createSeamlessWrapWriteSet(reader, [{ x: 0, y: 3, colorIndex: 1 }]);
  assert(wrapped.length === 4, "corner edge should wrap across both axes");
  const edgeWrapped = createSeamlessWrapWriteSet(reader, [
    { x: 3, y: 3, colorIndex: 1 },
  ]);
  assert(edgeWrapped.length === 4, "corner pixels should wrap across both axes");
});

Deno.test("iDRAW frame effect planner keeps frame identity and does not mutate readers", () => {
  const targets = [
    { frameId: "frame-a", reader: readerFrom(1, 1, [1]) },
    { frameId: "frame-b", reader: readerFrom(1, 1, [0]) },
  ];
  const plan = createFrameEffectPlan(targets, (reader) =>
    createColorReplaceWriteSet(reader, {
      fromColorIndex: 1,
      toColorIndex: 2,
    })
  );
  assert(plan.length === 2, "frame plan dropped an empty frame");
  assert(plan[0]?.frameId === "frame-a" && plan[0].writes.length === 1, "frame A plan is incorrect");
  assert(plan[1]?.frameId === "frame-b" && plan[1].writes.length === 0, "frame B plan is incorrect");
});

Deno.test("raster stroke auto outline and alpha lock are one canonical operation", async () => {
  const state = createProject({
    projectId: "pixel-effects-core",
    width: 5,
    height: 5,
    palette: [0, 0xffff0000, 0xff00ff00, 0xff0000ff],
  });
  state.assets[state.activeAssetId]?.raster.setPixel(
    state.activeAssetId,
    2,
    2,
    1,
  );
  const command: EditorCommand = {
    commandId: "pixel-effects-stroke-1",
    commandType: "raster.strokeCommit",
    schemaVersion: 1,
    projectId: state.projectId,
    assetId: state.activeAssetId,
    actorId: "pixel-effects-actor",
    clientId: "pixel-effects-client",
    clientSequence: 1,
    baseStructureEpoch: state.structureEpoch,
    createdAtMonotonicMs: 1,
    payload: {
      points: [{ x: 2, y: 2 }],
      colorIndex: 1,
      alphaLock: true,
      autoOutline: {
        colorIndex: 3,
        placement: "OUTSIDE",
        thickness: 1,
        connectivity: 8,
      },
    },
  };
  const first = await new EditorCore(state).execute(command);
  assert(first.ok, "atomic auto-outline command was rejected");
  assert(first.result.operation.operationType === "raster.strokeCommit", "auto outline changed the operation type");
  assert(first.result.trace.commandCommitCount === 1, "auto outline used more than one canonical commit");
  assert(first.state.assets[state.activeAssetId]?.raster.getPixel(2, 2) === 1, "alpha lock rejected an existing opaque pixel");
  assert(first.state.assets[state.activeAssetId]?.raster.getPixel(1, 1) === 3, "atomic auto outline was not applied");
});
