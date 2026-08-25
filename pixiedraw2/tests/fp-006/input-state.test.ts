import { StrokeInputController } from "../../src/fp-006/input-state.ts";
import type {
  PointerPhase,
  PointerSample,
} from "../../src/fp-006/contracts.ts";

function sample(overrides: Partial<PointerSample> = {}): PointerSample {
  return {
    pointerId: 1,
    phase: "down",
    pointerType: "mouse",
    target: "canvas",
    isPrimary: true,
    button: 0,
    buttons: 1,
    x: 0,
    y: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    timeMs: 1,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runStroke(
  controller: StrokeInputController,
  points: readonly [number, number][],
): void {
  const first = points[0] ?? [0, 0];
  controller.handle(
    sample({ phase: "down", x: first[0], y: first[1], timeMs: 1 }),
  );
  points.slice(1, -1).forEach(([x, y], index) =>
    controller.handle(sample({ phase: "move", x, y, timeMs: index + 2 }))
  );
  const last = points[points.length - 1] ?? first;
  const result = controller.handle(
    sample({
      phase: "up",
      x: last[0],
      y: last[1],
      buttons: 0,
      timeMs: points.length + 2,
    }),
  );
  assert(
    result.some((event) => event.kind === "stroke_committed"),
    "stroke must commit exactly at pointerup",
  );
}

Deno.test("FP-006 commits horizontal, vertical, diagonal, fast, reverse, and eraser strokes once", () => {
  const controller = new StrokeInputController({
    tool: "pen",
    nextStrokeId: (() => {
      let id = 0;
      return () => `stroke-${++id}`;
    })(),
  });
  runStroke(controller, [[0, 0], [4, 0], [8, 0]]);
  runStroke(controller, [[0, 0], [0, 4], [0, 8]]);
  runStroke(controller, [[0, 0], [4, 4], [8, 8]]);
  runStroke(controller, [[0, 0], [32, 32]]);
  runStroke(controller, [[8, 8], [4, 4], [0, 0]]);
  assert(
    controller.snapshot().committedStrokeCount === 5,
    "one stroke must create one commit/undo unit",
  );
  assert(
    controller.snapshot().cancelledStrokeCount === 0,
    "normal strokes must not cancel",
  );
  const eraser = new StrokeInputController({ tool: "eraser" });
  runStroke(eraser, [[1, 1], [2, 2]]);
  const committed = eraser.handle(
    sample({ phase: "up", pointerId: 1, x: 2, y: 2, buttons: 0 }),
  );
  assert(committed.length === 0, "duplicate pointerup must not commit twice");
});

Deno.test("FP-006 pointer capture loss and browser interruption never leave a stuck stroke", () => {
  for (
    const phase of [
      "cancel",
      "lost_capture",
      "browser_interrupt",
    ] as readonly PointerPhase[]
  ) {
    const controller = new StrokeInputController();
    controller.handle(sample({ phase: "down" }));
    controller.handle(sample({ phase }));
    const snapshot = controller.snapshot();
    assert(snapshot.owner === "idle", `${phase} must return to idle`);
    assert(
      snapshot.activeStrokePointCount === 0,
      `${phase} must discard active points`,
    );
    assert(snapshot.committedStrokeCount === 0, `${phase} must not commit`);
    assert(
      snapshot.cancelledStrokeCount === 1,
      `${phase} must record cancellation`,
    );
  }
});

Deno.test("FP-006 Canvas-outside release commits once while cancel discards", () => {
  const controller = new StrokeInputController();
  controller.handle(sample({ phase: "down", x: 1, y: 1 }));
  const release = controller.handle(
    sample({ phase: "up", target: "outside", x: 10, y: 10, buttons: 0 }),
  );
  assert(
    release.filter((event) => event.kind === "stroke_committed").length === 1,
    "outside release must commit one stroke",
  );
  assert(
    controller.snapshot().owner === "idle",
    "outside release must clear ownership",
  );

  const cancelled = new StrokeInputController();
  cancelled.handle(sample({ phase: "down" }));
  cancelled.handle(sample({ phase: "cancel" }));
  assert(
    cancelled.snapshot().committedStrokeCount === 0,
    "cancel must never commit",
  );
});

Deno.test("FP-006 second touch cancels draw before pinch and never commits the partial stroke", () => {
  const controller = new StrokeInputController();
  controller.handle(sample({ pointerType: "touch", isPrimary: true }));
  const second = controller.handle(
    sample({
      pointerId: 2,
      pointerType: "touch",
      isPrimary: false,
      x: 20,
      y: 20,
      timeMs: 2,
    }),
  );
  assert(
    second.some((event) =>
      event.kind === "stroke_cancelled" &&
      event.reason === "SECOND_POINTER_SWITCH_TO_PINCH"
    ),
    "second touch must cancel the partial draw",
  );
  assert(
    second.some((event) =>
      event.kind === "gesture_started" && event.owner === "pinch"
    ),
    "second touch must own pinch",
  );
  assert(
    controller.snapshot().committedStrokeCount === 0,
    "pinch transition must not create a draw commit",
  );
  controller.handle(
    sample({
      phase: "up",
      pointerId: 2,
      pointerType: "touch",
      isPrimary: false,
      buttons: 0,
    }),
  );
  controller.handle(
    sample({ phase: "up", pointerId: 1, pointerType: "touch", buttons: 0 }),
  );
  assert(
    controller.snapshot().owner === "idle",
    "pinch end must clear gesture ownership",
  );
});

Deno.test("FP-006 Panel and Timeline own their gestures instead of mutating Canvas", () => {
  const panel = new StrokeInputController();
  const panelEvents = panel.handle(
    sample({ target: "panel", pointerType: "touch" }),
  );
  assert(
    panelEvents[0]?.owner === "panel_scroll",
    "panel pointer must be panel-owned",
  );
  assert(
    panel.snapshot().committedStrokeCount === 0,
    "panel gesture cannot create a stroke",
  );
  const timeline = new StrokeInputController();
  const timelineEvents = timeline.handle(
    sample({ target: "timeline", pointerType: "touch" }),
  );
  assert(
    timelineEvents[0]?.owner === "timeline",
    "timeline pointer must be timeline-owned",
  );
  assert(
    timeline.snapshot().committedStrokeCount === 0,
    "timeline gesture cannot create a stroke",
  );
});

Deno.test("FP-006 recovery is fail-safe for incomplete journals", () => {
  const controller = new StrokeInputController();
  assert(
    controller.recover({
      version: 1,
      projectId: "p",
      strokeId: "s",
      state: "OPEN",
      pointCount: 3,
      journalSequence: 1,
      createdAtMs: 1,
    }) === "DISCARD",
    "uncommitted stroke is discarded instead of replayed blindly",
  );
  assert(
    controller.recover({
      version: 1,
      projectId: "p",
      strokeId: "s",
      state: "COMMITTED",
      pointCount: 3,
      journalSequence: 1,
      createdAtMs: 1,
    }) === "NOOP",
    "committed checkpoint must not duplicate",
  );
});
