import { strict as assert } from "node:assert";

const workspace = await Deno.readTextFile("src/wp180-workspace-ui.ts");

Deno.test("PIXYNC-DRAW2-280 publishes only accepted Game editor commits", () => {
  assert.match(
    workspace,
    /if \(!saved\.stale\) \{[\s\S]*?new CustomEvent\("draw2:game-editor-committed"[\s\S]*?detail: \{ reason, record, command \}/u,
  );
});

Deno.test("PIXYNC-DRAW2-280 covers all Game editor mutation families", () => {
  assert.equal(
    workspace.match(/queueGameEditorPersistenceSave\("edit"\)/gu)?.length,
    4,
  );
});
