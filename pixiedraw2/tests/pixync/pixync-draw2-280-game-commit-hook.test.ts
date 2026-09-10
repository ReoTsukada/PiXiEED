import { strict as assert } from "node:assert";

const workspace = await Deno.readTextFile("src/wp180-workspace-ui.ts");

Deno.test("PIXYNC-DRAW2-280 publishes only accepted Game editor commits", () => {
  const staleGuard = workspace.indexOf("if (saved.stale) {");
  const event = workspace.indexOf(
    'new CustomEvent("draw2:game-editor-committed"',
  );
  assert.ok(staleGuard >= 0, "the persistence path must reject stale saves");
  assert.ok(event > staleGuard, "the commit event must follow the stale-save guard");
  const guardedPath = workspace.slice(staleGuard, event);
  assert.match(guardedPath, /return \{[\s\S]*cause: "cas-conflict"/u);
  assert.match(
    workspace.slice(event),
    /detail: \{ reason, record: baseRecord, command \}/u,
  );
});

Deno.test("PIXYNC-DRAW2-280 covers all Game editor mutation families", () => {
  assert.equal(
    workspace.match(/queueGameEditorPersistenceSave\("edit"\)/gu)?.length,
    4,
  );
});
