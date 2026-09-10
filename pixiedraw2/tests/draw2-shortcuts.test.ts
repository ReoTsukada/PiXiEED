import {
  DRAW2_SHORTCUTS,
  resolveDraw2Shortcut,
} from "../src/draw2-shortcuts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 shortcut registry covers selection, tools, mirror and viewport", () => {
  for (
    const id of [
      "selection-cancel",
      "selection-deselect",
      "selection-select-all",
      "mirror-cycle",
      "zoom-in",
      "zoom-reset",
      "previous-frame-arrow",
      "next-frame-arrow",
      "previous-layer-arrow",
      "next-layer-arrow",
      "shortcuts",
    ]
  ) {
    assert(
      DRAW2_SHORTCUTS.some((shortcut) => shortcut.id === id),
      `missing shortcut ${id}`,
    );
  }
  assert(
    resolveDraw2Shortcut({ key: "Escape" })?.command === "selection-cancel",
    "Escape should cancel selection work",
  );
  assert(
    resolveDraw2Shortcut({ key: "m", shiftKey: true })?.command ===
      "mirror-cycle",
    "Shift+M should cycle mirror",
  );
  assert(
    resolveDraw2Shortcut({ key: "z", ctrlKey: true })?.command === "undo",
    "Ctrl+Z should undo",
  );
  assert(
    resolveDraw2Shortcut({ key: "a", ctrlKey: true })?.command ===
      "selection-select-all",
    "Ctrl+A should select all",
  );
  assert(
    resolveDraw2Shortcut({ key: "ArrowLeft" })?.command === "previous-frame",
    "ArrowLeft should select the previous frame in Draw mode",
  );
  assert(
    resolveDraw2Shortcut({ key: "ArrowDown" })?.command === "next-layer",
    "ArrowDown should select the next layer in Draw mode",
  );
  assert(
    resolveDraw2Shortcut({ key: "p" }, { inputEditing: true }) === undefined,
    "input editing must suppress shortcuts",
  );
});

Deno.test("Draw2 user-facing tool shortcuts keep text and move entry points", () => {
  const expected = new Map([
    ["t", "tool-text"],
    ["v", "tool-move"],
  ]);
  for (const [key, command] of expected) {
    assert(
      resolveDraw2Shortcut({ key })?.command === command,
      `${key} should resolve to ${command}`,
    );
  }
  for (const removed of ["tool-pixel-pen", "tool-select-polygon", "tool-tile-stamp"]) {
    assert(
      !DRAW2_SHORTCUTS.some((shortcut) => shortcut.command === removed),
      `${removed} should not be user-facing anymore`,
    );
  }
});
