import {
  Draw2InteractionKernel,
  SerializedCommitIngress,
  ToolSession,
  ToolSessionLifecycleError,
} from "../src/draw2-interaction.ts";
import type { ToolSessionCommit } from "../src/draw2-interaction.ts";
import type { BasicTool } from "../src/draw2-basic-tools.ts";
import type { PointerPhase, PointerSample } from "../src/fp-006/contracts.ts";
import { createProject, EditorCore } from "../src/draw2-core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sample(overrides: Partial<PointerSample> = {}): PointerSample {
  return {
    pointerId: 1,
    phase: "down",
    pointerType: "mouse",
    target: "canvas",
    isPrimary: true,
    button: 0,
    buttons: 1,
    x: 1,
    y: 1,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    timeMs: 1,
    ...overrides,
  };
}

function kernel(
  tool: BasicTool,
  commits: ToolSessionCommit[],
  previews: Array<ReturnType<Draw2InteractionKernel["snapshot"]>["session"]> =
    [],
): Draw2InteractionKernel {
  return new Draw2InteractionKernel({
    tool,
    bounds: { width: 32, height: 32 },
    colorIndex: 2,
    toolOptions: { brushSize: 1, brushShape: "square", pattern: "solid" },
    nextSessionId: (() => {
      let sequence = 0;
      return () => `test-session-${++sequence}`;
    })(),
    onPreview: (preview) => previews.push(preview),
    onCommit: (commit) => {
      commits.push(commit);
    },
  });
}

Deno.test("Interaction Kernel keeps preview local and commits exactly once on pointerup", async () => {
  const commits: ToolSessionCommit[] = [];
  const previews: Array<
    ReturnType<Draw2InteractionKernel["snapshot"]>["session"]
  > = [];
  const controller = kernel("pen", commits, previews);
  controller.handle(sample({ phase: "down", x: 1, y: 1 }));
  controller.handle(sample({ phase: "move", x: 8, y: 8, timeMs: 2 }));
  assert(
    commits.length === 0,
    "begin/update must not reach canonical commit callback",
  );
  assert(
    previews.some((preview) => (preview?.previewWrites.length ?? 0) > 0),
    "pen preview must use a local write set",
  );
  controller.handle(
    sample({ phase: "up", x: 12, y: 4, buttons: 0, timeMs: 3 }),
  );
  await controller.flushCommits();
  assert(
    (commits.length as number) === 1,
    "pointerup must invoke commit callback once",
  );
  assert(
    commits[0]?.kind === "write-set" && commits[0].writes.length > 0,
    "pen commit must expose one write set",
  );
  controller.handle(
    sample({ phase: "up", x: 12, y: 4, buttons: 0, timeMs: 4 }),
  );
  assert(
    (commits.length as number) === 1,
    "duplicate pointerup must not commit again",
  );
  assert(
    controller.snapshot().editorState === "IDLE",
    "committed session must return to IDLE",
  );
});

Deno.test("ToolSession rejects commit after commit or cancel", () => {
  const session = new ToolSession({
    sessionId: "lifecycle",
    tool: "pen",
    bounds: { width: 8, height: 8 },
    colorIndex: 1,
  });
  session.begin({ x: 1, y: 1 });
  session.commit();
  let duplicateRejected = false;
  try {
    session.commit();
  } catch (error) {
    duplicateRejected = error instanceof ToolSessionLifecycleError;
  }
  assert(duplicateRejected, "commit after commit must be rejected");

  const cancelled = new ToolSession({
    sessionId: "cancelled",
    tool: "pen",
    bounds: { width: 8, height: 8 },
    colorIndex: 1,
  });
  cancelled.begin({ x: 1, y: 1 });
  cancelled.cancel("ESC");
  let cancelledRejected = false;
  try {
    cancelled.commit();
  } catch (error) {
    cancelledRejected = error instanceof ToolSessionLifecycleError;
  }
  assert(cancelledRejected, "commit after cancel must be rejected");
  assert(
    cancelled.snapshot().previewWrites.length === 0,
    "cancel must clear preview",
  );
});

Deno.test("cancel, capture loss, browser interruption, and second touch never commit", () => {
  const phases: readonly PointerPhase[] = [
    "cancel",
    "lost_capture",
    "browser_interrupt",
  ];
  for (const phase of phases) {
    const commits: ToolSessionCommit[] = [];
    const controller = kernel("pen", commits);
    controller.handle(sample());
    controller.handle(sample({ phase, timeMs: 2 }));
    assert(
      commits.length === 0,
      `${phase} must not reach canonical commit callback`,
    );
    assert(
      controller.snapshot().session === undefined,
      `${phase} must discard ToolSession`,
    );
    assert(
      controller.snapshot().editorState === "IDLE",
      `${phase} must return to IDLE`,
    );
  }

  const commits: ToolSessionCommit[] = [];
  const controller = kernel("pen", commits);
  controller.handle(sample({ pointerType: "touch", isPrimary: true }));
  const second = controller.handle(sample({
    pointerId: 2,
    pointerType: "touch",
    isPrimary: false,
    phase: "down",
    x: 10,
    y: 10,
    timeMs: 2,
  }));
  assert(
    second.some((event) => event.kind === "stroke_cancelled"),
    "second touch must cancel the stroke",
  );
  assert(
    controller.snapshot().session === undefined,
    "second touch must discard the session",
  );
  assert(
    controller.snapshot().editorState === "ZOOMING",
    "second touch must own zooming",
  );
  assert(commits.length === 0, "second touch must not commit partial pixels");
});

Deno.test("pen fast/reverse/diagonal input remains one accumulated session", async () => {
  const commits: ToolSessionCommit[] = [];
  const controller = kernel("eraser", commits);
  controller.handle(sample({ x: 0, y: 0 }));
  for (
    const [index, x, y] of [
      [0, 32, 32],
      [1, 4, 28],
      [2, 28, 4],
      [3, 8, 8],
    ] as const
  ) {
    controller.handle(sample({ phase: "move", x, y, timeMs: index + 1 }));
  }
  controller.handle(
    sample({ phase: "up", x: 16, y: 16, buttons: 0, timeMs: 10 }),
  );
  await controller.flushCommits();
  assert(
    commits.length === 1,
    "continuous pointer samples must create one session commit",
  );
  assert(
    commits[0]?.kind === "write-set" && commits[0].tracePolicy === "ACCUMULATE",
    "eraser must accumulate",
  );
  assert(
    commits[0]?.points.length === 6,
    "fast/reverse/diagonal points must remain in one trace",
  );
});

Deno.test("shape sessions replace LAST preview and eyedropper is IMMEDIATE without raster writes", async () => {
  const shapeCommits: ToolSessionCommit[] = [];
  const shapePreviews: Array<
    ReturnType<Draw2InteractionKernel["snapshot"]>["session"]
  > = [];
  const shape = kernel("circle", shapeCommits, shapePreviews);
  shape.handle(sample({ x: 2, y: 2 }));
  shape.handle(sample({ phase: "move", x: 8, y: 4, timeMs: 2 }));
  const firstPreview = shapePreviews.at(-1)?.previewWrites ?? [];
  shape.handle(sample({ phase: "move", x: 14, y: 10, timeMs: 3 }));
  const lastPreview = shapePreviews.at(-1)?.previewWrites ?? [];
  assert(
    shapePreviews.at(-1)?.tracePolicy === "LAST",
    "circle must use LAST trace policy",
  );
  assert(
    JSON.stringify(firstPreview) !== JSON.stringify(lastPreview),
    "shape move must replace preview geometry",
  );
  assert(
    shapeCommits.length === 0,
    "shape preview must not mutate before pointerup",
  );
  shape.handle(sample({ phase: "up", x: 14, y: 10, buttons: 0, timeMs: 4 }));
  await shape.flushCommits();
  assert(
    (shapeCommits.length as number) === 1 &&
      shapeCommits[0]?.kind === "write-set",
    "shape pointerup must commit one write set",
  );

  const eyedropperCommits: ToolSessionCommit[] = [];
  const eyedropper = kernel("eyedropper", eyedropperCommits);
  eyedropper.handle(sample({ x: 5, y: 6 }));
  assert(
    eyedropper.snapshot().session?.previewWrites.length === 0,
    "eyedropper must not preview raster writes",
  );
  eyedropper.handle(sample({ phase: "up", x: 5, y: 6, buttons: 0, timeMs: 2 }));
  await eyedropper.flushCommits();
  assert(
    eyedropperCommits.length === 1 &&
      eyedropperCommits[0]?.kind === "immediate",
    "eyedropper must commit an immediate sample only",
  );
  assert(
    eyedropperCommits[0]?.kind === "immediate" &&
      !("writes" in eyedropperCommits[0]),
    "eyedropper must not create a raster write set",
  );
});

Deno.test("Timeline and Panel ownership never create a Canvas ToolSession", () => {
  for (const target of ["timeline", "panel"] as const) {
    const commits: ToolSessionCommit[] = [];
    const controller = kernel("pen", commits);
    controller.handle(sample({ target, pointerType: "touch" }));
    assert(
      controller.snapshot().session === undefined,
      `${target} must not create a Canvas session`,
    );
    assert(
      controller.snapshot().editorState ===
        (target === "timeline" ? "TIMELINE" : "PANEL"),
      `${target} ownership must remain explicit`,
    );
    assert(commits.length === 0, `${target} must not commit raster writes`);
  }
});

Deno.test("Fill immediate commits retain the complete drag vector", async () => {
  const commits: ToolSessionCommit[] = [];
  const fill = kernel("fill", commits);
  fill.handle(sample({ x: 2, y: 2 }));
  fill.handle(sample({ phase: "move", x: 5, y: 2, timeMs: 2 }));
  fill.handle(sample({ phase: "up", x: 9, y: 2, buttons: 0, timeMs: 3 }));
  await fill.flushCommits();
  const commit = commits[0];
  assert(commit?.kind === "immediate", "fill must remain an immediate commit");
  assert(commit.points.length === 3, "fill must preserve its drag points");
  assert(commit.point.x === 9 && commit.point.y === 2, "fill endpoint must remain the final point");
});

Deno.test("ToolSession commit stays adapter-local and reaches onCommit once", async () => {
  const commits: ToolSessionCommit[] = [];
  const controller = kernel("rect-fill", commits);
  controller.handle(sample({ x: 1, y: 1 }));
  controller.handle(sample({ phase: "move", x: 3, y: 4, timeMs: 2 }));
  assert(
    commits.length === 0,
    "preview must not reach the adapter commit callback",
  );
  controller.handle(sample({ phase: "up", x: 3, y: 4, buttons: 0, timeMs: 2 }));
  await controller.flushCommits();
  assert(
    (commits.length as number) === 1,
    "pointerup must deliver one adapter commit",
  );
  const commit = commits[0];
  assert(
    commit?.kind === "write-set",
    "adapter commit must contain the local write set",
  );
  assert(
    !("projectId" in commit) && !("revision" in commit) &&
      !("journal" in commit),
    "ToolSession commit must not carry Project, Revision, or Journal identity",
  );
});

Deno.test("serialized ingress preserves both concurrent pointerup commits", async () => {
  const ingress = new SerializedCommitIngress();
  const project = createProject({
    projectId: "interaction-serial-project",
    width: 16,
    height: 16,
    tileSize: 32,
  });
  const core = new EditorCore(project);
  const assetId = Object.keys(core.state.assets)[0]!;
  let commandSequence = 0;
  const apply = async (commit: ToolSessionCommit): Promise<void> => {
    assert(commit.kind === "write-set", "attack fixture requires write-set commits");
    const result = await core.execute({
      commandId: `serial-${++commandSequence}`,
      commandType: "raster.writeSet",
      schemaVersion: 1,
      projectId: core.state.projectId,
      assetId,
      actorId: "test-user",
      clientId: "serial-client",
      clientSequence: commandSequence,
      baseStructureEpoch: core.state.structureEpoch,
      createdAtMonotonicMs: commandSequence,
      payload: { writes: commit.writes },
    });
    assert(result.ok, "each queued commit must apply successfully");
  };
  const makeKernel = () => new Draw2InteractionKernel({
    tool: "pen",
    bounds: { width: 16, height: 16 },
    colorIndex: 2,
    toolOptions: { brushSize: 1, brushShape: "square", pattern: "solid" },
    commitIngress: ingress,
    onCommit: apply,
  });
  const first = makeKernel();
  const second = makeKernel();
  first.handle(sample({ x: 1, y: 1 }));
  first.handle(sample({ phase: "up", x: 1, y: 1, buttons: 0, timeMs: 2 }));
  second.handle(sample({ x: 4, y: 4 }));
  second.handle(sample({ phase: "up", x: 4, y: 4, buttons: 0, timeMs: 2 }));
  await ingress.flush();
  const raster = core.state.assets[assetId]!.raster;
  assert(raster.getPixel(1, 1) === 2, "first queued pixel must be retained");
  assert(raster.getPixel(4, 4) === 2, "second queued pixel must be retained");
  assert(
    core.state.appliedCommandIds.length === 2,
    "both queued commands must remain in canonical history",
  );
});

Deno.test("serialized ingress reports commit failures to the UI error path", async () => {
  const ingress = new SerializedCommitIngress();
  let captured: unknown;
  const controller = new Draw2InteractionKernel({
    tool: "pen",
    bounds: { width: 8, height: 8 },
    colorIndex: 3,
    commitIngress: ingress,
    onCommit: async () => {
      await Promise.resolve();
      throw new Error("intentional commit failure");
    },
    onCommitError: (error) => {
      captured = error;
    },
  });
  controller.handle(sample({ x: 2, y: 2 }));
  controller.handle(sample({ phase: "up", x: 2, y: 2, buttons: 0, timeMs: 2 }));
  await controller.flushCommits();
  assert(captured instanceof Error, "commit failure must reach onCommitError");
  assert(
    (captured as Error).message === "intentional commit failure",
    "the original commit failure must be preserved",
  );
});

Deno.test("ToolSession commit uses tool, color, and options fixed at session start", async () => {
  const commits: ToolSessionCommit[] = [];
  const options: {
    brushSize: number;
    brushShape: "square";
    pattern: "solid";
    similarity: number;
  } = {
    brushSize: 1,
    brushShape: "square",
    pattern: "solid",
    similarity: 4,
  };
  const controller = new Draw2InteractionKernel({
    tool: "select-color",
    bounds: { width: 8, height: 8 },
    colorIndex: 7,
    toolOptions: options,
    onCommit: (commit) => {
      commits.push(commit);
    },
  });
  controller.handle(sample({ x: 2, y: 2 }));
  options.similarity = 99;
  controller.handle(sample({ phase: "up", x: 2, y: 2, buttons: 0, timeMs: 2 }));
  await controller.flushCommits();
  const commit = commits[0];
  assert(commit?.tool === "select-color", "session tool must be immutable");
  assert(commit?.colorIndex === 7, "session color must be immutable");
  assert(
    commit?.toolOptions.similarity === 4,
    "session options must be cloned at begin time",
  );
});
