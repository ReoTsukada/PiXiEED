import {
  createProjectStartIntent,
  isCreatorStartMode,
  resolveCreatorStartMode,
} from "../../src/studio/project-start.ts";

Deno.test("project start mode is fail-closed to Draw", () => {
  if (!isCreatorStartMode("DRAW")) throw new Error("DRAW should be valid");
  if (isCreatorStartMode("EXPORT")) {
    throw new Error("non-entry modes must not be start modes");
  }
  if (resolveCreatorStartMode(" audio ") !== "AUDIO") {
    throw new Error("query mode should be normalized");
  }
  if (resolveCreatorStartMode("unknown") !== "DRAW") {
    throw new Error("unknown mode should use the safe default");
  }
});

Deno.test("project start intent keeps project identity separate from mode", () => {
  const open = createProjectStartIntent({
    projectId: "  shared-world  ",
    kind: "OPEN",
    mode: "GAME",
  });
  if (
    open.projectId !== "shared-world" || open.kind !== "OPEN" ||
    open.mode !== "GAME"
  ) {
    throw new Error("open intent was not normalized");
  }
  const fresh = createProjectStartIntent({ kind: "NEW", mode: null });
  if (
    fresh.projectId !== undefined || fresh.kind !== "NEW" ||
    fresh.mode !== "DRAW"
  ) {
    throw new Error("new intent should default to Draw without an id");
  }
});
