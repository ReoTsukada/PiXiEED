import { strict as assert } from "node:assert";

const workspace = await Deno.readTextFile("src/wp180-workspace-ui.ts");

Deno.test("PIXYNC-DRAW2-260 publishes only newly committed Audio journal entries", () => {
  assert.match(
    workspace,
    /const publishAudioJournalCommits = \([\s\S]*?previous\.journal\.entries\.length[\s\S]*?next\.journal\.entries\.slice\(previousCount\)/u,
  );
  assert.match(workspace, /"draw2:audio-journal-committed"/u);
  assert.match(workspace, /detail: \{ entry \}/u);
});

Deno.test("PIXYNC-DRAW2-260 covers command, undo-redo, and recording commit paths", () => {
  assert.equal(
    workspace.match(/publishAudioJournalCommits\(previousSession,/gu)?.length,
    3,
  );
});
