import {
  combineSelectionPoints,
  pointInSelectionBounds,
  selectionEditModeFromModifiers,
} from "../src/draw2-selection-edit.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("selection edit modes compose deterministically", () => {
  const current = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
  const incoming = [{ x: 2, y: 1 }, { x: 3, y: 1 }];
  assert(combineSelectionPoints(current, incoming, "REPLACE").length === 2, "replace should use incoming points");
  assert(combineSelectionPoints(current, incoming, "ADD").length === 3, "add should union points");
  assert(combineSelectionPoints(current, incoming, "SUBTRACT").length === 1, "subtract should remove incoming points");
  assert(combineSelectionPoints(current, incoming, "INTERSECT").length === 1, "intersect should keep overlap");
});

Deno.test("selection modifier overrides follow Shift, Alt, Shift+Alt", () => {
  assert(selectionEditModeFromModifiers(true, false, "REPLACE") === "ADD", "Shift should add");
  assert(selectionEditModeFromModifiers(false, true, "REPLACE") === "SUBTRACT", "Alt should subtract");
  assert(selectionEditModeFromModifiers(true, true, "REPLACE") === "INTERSECT", "Shift+Alt should intersect");
});

Deno.test("selection movement grabs the bounding rectangle, including transparent holes", () => {
  assert(
    pointInSelectionBounds(
      { x: 4, y: 4 },
      [{ x: 2, y: 2, width: 6, height: 6 }],
    ),
    "a point inside a lasso bounding rectangle must start a move",
  );
  assert(
    !pointInSelectionBounds(
      { x: 8, y: 8 },
      [{ x: 2, y: 2, width: 6, height: 6 }],
    ),
    "a point outside the bounding rectangle must not start a move",
  );
});
