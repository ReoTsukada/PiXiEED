import {
  createDraw110Project,
  createInitialViewport,
  Draw110Editor,
  panViewport,
  resolveTemporaryTool,
  zoomViewport,
} from "../../src/draw2/draw-110/raster-editor.ts";
import type {
  Draw110Commit,
  Draw110Execution,
} from "../../src/draw2/draw-110/raster-editor.ts";
import type { PixelPoint } from "../../src/draw2-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectCommit(result: Draw110Execution): Draw110Commit {
  if (!("result" in result)) {
    throw new Error(
      `expected commit: ${
        result.diagnostics.map((item) => item.code).join(",")
      }`,
    );
  }
  return result;
}

async function editor(): Promise<Draw110Editor> {
  return new Draw110Editor(
    createDraw110Project({
      projectId: "draw110-test",
      width: 16,
      height: 16,
      tileSize: 32,
      palette: [0, 0xffffffff, 0xff0000ff],
    }),
  );
}

Deno.test("DRAW-110 pencil interpolation closes gaps and creates one undo unit", async () => {
  const target = await editor();
  const result = expectCommit(
    await target.commitPencil([{ x: 0, y: 0 }, { x: 8, y: 0 }], 1),
  );
  assert(
    result.undoDepth === 1 && result.redoDepth === 0,
    "one stroke must create one undo entry",
  );
  for (let x = 0; x <= 8; x += 1) {
    assert(
      target.state.assets[target.state.activeAssetId]?.raster.getPixel(x, 0) ===
        1,
      `pixel gap at ${x}`,
    );
  }
  assert(
    result.result.dirtyTiles.length === 1,
    "small stroke should touch one tile",
  );
  assert(
    result.result.strokeMetrics?.interpolatedPixelCount === 9,
    "interpolation count must be deterministic",
  );
});

Deno.test("DRAW-110 eraser uses transparent index and undo restores the prior raster", async () => {
  const target = await editor();
  await target.commitPencil([{ x: 2, y: 2 }, { x: 4, y: 2 }], 1);
  const beforeErase = await target.canonicalRasterHash();
  const result = expectCommit(
    await target.commitStroke({
      strokeId: "eraser-1",
      pointerId: 1,
      tool: "eraser",
      points: [{ x: 3, y: 2, pressure: 1, timeMs: 1 }],
      startedAtMs: 1,
      endedAtMs: 2,
    }),
  );
  assert(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(3, 2) ===
      0,
    "eraser must write transparent index",
  );
  target.undo();
  assert(
    await target.canonicalRasterHash() === beforeErase,
    "undo must restore canonical raster exactly",
  );
  assert(target.redoDepth === 1, "undo must create a redo entry");
  target.redo();
  assert(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(3, 2) ===
      0,
    "redo must reapply eraser",
  );
});

Deno.test("DRAW-110 Fill is bounded and rejects invalid input without mutation", async () => {
  const target = await editor();
  const before = await target.canonicalRasterHash();
  const rejected = await target.commitFill({ x: -1, y: 0 }, 1);
  assert(!("result" in rejected), "invalid fill must reject");
  assert(
    await target.canonicalRasterHash() === before,
    "invalid fill cannot mutate raster",
  );
  const fill = expectCommit(await target.commitFill({ x: 0, y: 0 }, 2, 256));
  assert(
    fill.result.dirtyTiles.length === 1,
    "bounded fill should report one tile",
  );
  assert(
    target.state.assets[target.state.activeAssetId]?.raster.getPixel(15, 15) ===
      2,
    "fill must reach all connected pixels",
  );
});

Deno.test("DRAW-110 temporary Eyedropper and Hand never create canonical commands", async () => {
  const target = await editor();
  await target.commitPencil([{ x: 3, y: 3 }], 2);
  const beforeUndo = target.undoDepth;
  assert(
    resolveTemporaryTool("pen", { alt: true, space: false }) === "eyedropper",
    "Alt must resolve Eyedropper",
  );
  assert(
    resolveTemporaryTool("pen", { alt: false, space: true }) === "hand",
    "Space must resolve Hand",
  );
  assert(
    target.samplePaletteIndex({ x: 3, y: 3 }) === 2,
    "Eyedropper must read the canonical palette index",
  );
  assert(
    target.undoDepth === beforeUndo,
    "temporary tools cannot add undo entries",
  );
});

Deno.test("DRAW-110 Zoom/Pan update viewport projection only and keep nearest-neighbor semantics", () => {
  const initial = createInitialViewport();
  const zoomed = zoomViewport(initial, 2, { x: 8, y: 8 });
  assert(
    zoomed.zoom === 2 && zoomed.nearestNeighbor,
    "zoom must preserve nearest-neighbor projection",
  );
  assert(
    zoomed.offsetX === -8 && zoomed.offsetY === -8,
    "anchor-centered zoom must be deterministic",
  );
  const panned = panViewport(zoomed, { x: 4, y: -2 });
  assert(
    panned.offsetX === -4 && panned.offsetY === -10,
    "pan must only change viewport offset",
  );
});
