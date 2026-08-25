import {
  assertHotPathIsolated,
  HotPathTraceRecorder,
} from "../../src/fp-006/hot-path.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("FP-006 pointer samples update only the Canvas projection boundary", () => {
  const recorder = new HotPathTraceRecorder("stroke-1");
  for (let index = 0; index < 100; index += 1) recorder.recordPointerSample();
  const trace = recorder.finish();
  assert(trace.pointerSamples === 100, "sample count must be recorded");
  assert(
    trace.canvasProjectionUpdates === 100,
    "each sample may update only the Canvas projection",
  );
  assert(
    trace.workspaceUpdates === 0 && trace.timelineUpdates === 0 &&
      trace.layerUpdates === 0,
    "workspace regions must not update per sample",
  );
  assert(
    trace.paletteUpdates === 0 && trace.inspectorUpdates === 0,
    "palette/inspector must not update per sample",
  );
  assertHotPathIsolated(trace);
});

Deno.test("FP-006 detects a future global rerender regression", () => {
  const recorder = new HotPathTraceRecorder("stroke-attack");
  recorder.recordPointerSample();
  recorder.recordFullWorkspaceRerender();
  const trace = recorder.finish();
  assert(
    trace.violations.includes("FULL_WORKSPACE_RERENDER_ON_STROKE"),
    "full workspace rerender must be a visible violation",
  );
  let rejected = false;
  try {
    assertHotPathIsolated(trace);
  } catch {
    rejected = true;
  }
  assert(rejected, "hot path assertion must reject global rerender");
});
