import {
  createDraw120Project,
  Draw120Editor,
} from "../../src/draw2/draw-120/selection-transform.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRejected(
  value: unknown,
): value is { diagnostics: readonly { code: string }[] } {
  return typeof value === "object" && value !== null && "diagnostics" in value;
}

function pixel(editor: Draw120Editor, x: number, y: number): number {
  return editor.state.assets[editor.state.activeAssetId]?.raster.getPixel(
    x,
    y,
  ) ?? -1;
}

Deno.test("DRAW-120 selection modes are deterministic and scoped to the active Cel", async () => {
  const editor = new Draw120Editor(
    createDraw120Project({
      projectId: "draw120-selection",
      width: 16,
      height: 16,
      palette: [0, 0xffffffff],
    }),
  );
  const replaced = editor.selectRectangle({ x: 1, y: 1 }, { x: 2, y: 2 });
  assert(
    "points" in replaced && replaced.points.length === 4,
    "Replace selection should contain four pixels.",
  );
  const added = editor.selectPoints([{ x: 3, y: 1 }], "ADD");
  assert(
    "points" in added && added.points.length === 5,
    "Add selection should preserve the previous selection.",
  );
  const subtracted = editor.selectPoints([{ x: 2, y: 2 }], "SUBTRACT");
  assert(
    "points" in subtracted && subtracted.points.length === 4,
    "Subtract selection should remove only the requested point.",
  );
  const intersected = editor.selectPoints(
    [{ x: 1, y: 1 }, { x: 3, y: 1 }],
    "INTERSECT",
  );
  assert(
    "points" in intersected && intersected.points.length === 2,
    "Intersect selection should keep only the overlap.",
  );
  assert(
    editor.undoDepth === 0,
    "Selection projection must not create canonical undo entries.",
  );
  await Promise.resolve();
});

Deno.test("DRAW-120 transform preview is non-destructive and commits as one undo unit", async () => {
  const editor = new Draw120Editor(
    createDraw120Project({
      projectId: "draw120-transform",
      width: 16,
      height: 16,
      palette: [0, 0xffffffff],
    }),
  );
  const seed = await editor.commitRasterWrites([{ x: 1, y: 1, colorIndex: 1 }, {
    x: 2,
    y: 1,
    colorIndex: 1,
  }], "test.seed");
  assert("result" in seed, "Seed write should commit.");
  editor.selectRectangle({ x: 1, y: 1 }, { x: 2, y: 1 });
  const beforeHash = await editor.canonicalRasterHash();
  const beforeUndo = editor.undoDepth;
  const preview = editor.beginTransform({ translateX: 2 });
  assert(
    "writes" in preview && preview.destinationSelection.points.length === 2,
    "Translation preview should contain two destination pixels.",
  );
  assert(
    await editor.canonicalRasterHash() === beforeHash,
    "Preview must not mutate canonical raster.",
  );
  const committed = await editor.commitTransform();
  assert("result" in committed, "Transform commit should succeed.");
  assert(
    editor.undoDepth === beforeUndo + 1,
    "One transform must create one undo unit.",
  );
  assert(
    pixel(editor, 1, 1) === 0 && pixel(editor, 2, 1) === 0,
    "Transform should clear the source pixels.",
  );
  assert(
    pixel(editor, 3, 1) === 1 && pixel(editor, 4, 1) === 1,
    "Transform should write the translated pixels.",
  );
  const transformedHash = await editor.canonicalRasterHash();
  editor.undo();
  assert(
    await editor.canonicalRasterHash() === beforeHash,
    "Undo must restore the pre-transform raster hash.",
  );
  editor.redo();
  assert(
    await editor.canonicalRasterHash() === transformedHash,
    "Redo must restore the committed transform.",
  );
});

Deno.test("DRAW-120 cancel, flip, rotate, and scale keep mutation behind commit", async () => {
  const editor = new Draw120Editor(
    createDraw120Project({
      projectId: "draw120-preview",
      width: 16,
      height: 16,
      palette: [0, 0xffffffff, 0xff0000ff],
    }),
  );
  const seed = await editor.commitRasterWrites([{ x: 2, y: 2, colorIndex: 1 }, {
    x: 3,
    y: 2,
    colorIndex: 2,
  }], "test.seed");
  assert("result" in seed, "Seed write should commit.");
  editor.selectRectangle({ x: 2, y: 2 }, { x: 3, y: 2 });
  const hash = await editor.canonicalRasterHash();
  const preview = editor.beginTransform({
    flipHorizontal: true,
    rotateQuarterTurns: 1,
    scaleX: 2,
    scaleY: 2,
  });
  assert("writes" in preview, "Flip/rotate/scale preview should be created.");
  editor.cancelTransform();
  assert(
    await editor.canonicalRasterHash() === hash && editor.undoDepth === 1,
    "Cancel must not mutate raster or history.",
  );
  const invalid = editor.beginTransform({ scaleX: Number.NaN });
  assert(
    isRejected(invalid) &&
      invalid.diagnostics[0]?.code === "TRANSFORM_INPUT_INVALID",
    "NaN transform must fail closed.",
  );
});

Deno.test("DRAW-120 copy/cut/paste preserves palette indices and atomic undo", async () => {
  const editor = new Draw120Editor(
    createDraw120Project({
      projectId: "draw120-clipboard",
      width: 12,
      height: 12,
      palette: [0, 0xffffffff, 0xff0000ff],
    }),
  );
  const seed = await editor.commitRasterWrites([{ x: 1, y: 1, colorIndex: 1 }, {
    x: 2,
    y: 1,
    colorIndex: 2,
  }], "test.seed");
  assert("result" in seed, "Seed write should commit.");
  editor.selectRectangle({ x: 1, y: 1 }, { x: 2, y: 1 });
  const copied = editor.copy();
  assert(
    "cells" in copied && copied.cells.length === 2,
    "Copy should capture both indexed pixels.",
  );
  const cut = await editor.cut();
  assert("result" in cut, "Cut should succeed.");
  const cutUndoDepth = Number(editor.undoDepth);
  if (cutUndoDepth !== 2) {
    throw new Error("Cut should be one atomic undo unit.");
  }
  assert(
    pixel(editor, 1, 1) === 0 && pixel(editor, 2, 1) === 0,
    "Cut should clear the selected pixels.",
  );
  const paste = await editor.paste({ x: 5, y: 5 });
  assert("result" in paste, "Paste should succeed.");
  const pasteUndoDepth = Number(editor.undoDepth);
  if (pasteUndoDepth !== 3) {
    throw new Error("Paste should be one atomic undo unit.");
  }
  assert(
    pixel(editor, 5, 5) === 1 && pixel(editor, 6, 5) === 2,
    "Paste must preserve palette indices.",
  );
  editor.undo();
  assert(
    pixel(editor, 5, 5) === 0 && pixel(editor, 6, 5) === 0,
    "Undo must remove the paste only.",
  );
  editor.redo();
  assert(
    pixel(editor, 5, 5) === 1 && pixel(editor, 6, 5) === 2,
    "Redo must restore the paste.",
  );
  const rejected = await editor.paste({ x: 11, y: 11 });
  assert(
    isRejected(rejected) &&
      rejected.diagnostics[0]?.code === "PASTE_OUT_OF_BOUNDS",
    "Out-of-bounds paste must be rejected.",
  );
});

Deno.test("DRAW-120 empty selection and invalid selection are fail-closed", async () => {
  const editor = new Draw120Editor(
    createDraw120Project({
      projectId: "draw120-negative",
      width: 8,
      height: 8,
      palette: [0, 0xffffffff],
    }),
  );
  const beforeHash = await editor.canonicalRasterHash();
  const copy = editor.copy();
  assert(
    isRejected(copy) && copy.diagnostics[0]?.code === "SELECTION_EMPTY",
    "Empty copy must be rejected.",
  );
  const invalid = editor.selectRectangle({ x: -1, y: 0 }, { x: 1, y: 1 });
  assert(
    isRejected(invalid) &&
      invalid.diagnostics[0]?.code === "SELECTION_OUT_OF_BOUNDS",
    "Out-of-bounds selection must be rejected.",
  );
  const cut = await editor.cut();
  assert(
    isRejected(cut) && cut.diagnostics[0]?.code === "SELECTION_EMPTY",
    "Empty cut must be rejected.",
  );
  assert(
    await editor.canonicalRasterHash() === beforeHash && editor.undoDepth === 0,
    "Rejected selection operations must not mutate state or history.",
  );
});
