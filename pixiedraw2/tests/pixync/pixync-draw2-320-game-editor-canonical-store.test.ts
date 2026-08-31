import { strict as assert } from "node:assert";
import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";

Deno.test("PIXYNC-DRAW2-320 maps Game editor tracks losslessly into canonical timeline", async () => {
  const first = await createGameEditorPersistenceRecord(
    "game-room-320",
    [{
      id: "sprite",
      label: "Sprite",
      kind: "SPRITE",
      filled: [0, 3],
    }],
    0,
    "2026-08-24T00:00:00.000Z",
  );
  const store = await GameEditorCanonicalStore.create(first);
  assert.deepEqual(store.project.editorTimeline?.tracks[0], {
    trackId: "sprite",
    label: "Sprite",
    kind: "SPRITE",
    activeFrames: [0, 3],
  });
  const second = await createGameEditorPersistenceRecord(
    "game-room-320",
    [{
      id: "sprite",
      label: "Sprite",
      kind: "SPRITE",
      filled: [0, 3, 7],
    }],
    1,
    "2026-08-24T00:00:01.000Z",
  );
  const command = await store.commitLocal(second);
  assert.equal(
    command?.after.editorTimeline?.tracks[0]?.activeFrames.includes(7),
    true,
  );
  assert.equal(store.undoDepth, 1);
});

Deno.test("PIXYNC-DRAW2-320 remote Game apply preserves local history depth", async () => {
  const first = await createGameEditorPersistenceRecord("game-room-320", [], 0);
  const local = await createGameEditorPersistenceRecord("game-room-320", [{
    id: "event",
    label: "Event",
    kind: "EVENT",
    filled: [2],
  }], 1);
  const source = await GameEditorCanonicalStore.create(first);
  await source.commitLocal(local);
  const target = await GameEditorCanonicalStore.create(first);
  const before = target.undoDepth;
  target.applyRemote(source.project, "remote-command-320");
  assert.equal(target.undoDepth, before);
  assert.equal(target.appliedCommandIds.includes("remote-command-320"), true);
  assert.equal(target.project.editorTimeline?.tracks[0]?.kind, "EVENT");
});

Deno.test("PIXYNC-DRAW2-320 initial Game revision ignores local save timestamps", async () => {
  const left = await createGameEditorPersistenceRecord(
    "game-room-320",
    [],
    0,
    "2026-08-24T00:00:00.000Z",
  );
  const right = await createGameEditorPersistenceRecord(
    "game-room-320",
    [],
    0,
    "2026-08-24T01:00:00.000Z",
  );
  const [leftStore, rightStore] = await Promise.all([
    GameEditorCanonicalStore.create(left),
    GameEditorCanonicalStore.create(right),
  ]);
  assert.equal(
    leftStore.project.revision.revisionId,
    rightStore.project.revision.revisionId,
  );
  assert.equal(
    leftStore.project.revision.snapshotHash,
    rightStore.project.revision.snapshotHash,
  );
});

Deno.test("PIXYNC-DRAW2-320 restores only a verified canonical Game checkpoint", async () => {
  const tracks = [{
    id: "sprite",
    label: "Sprite",
    kind: "SPRITE",
    filled: [1, 4],
  }];
  const base = await createGameEditorPersistenceRecord(
    "game-room-320",
    tracks,
    2,
  );
  const store = await GameEditorCanonicalStore.create(base);
  const checkpoint = await createGameEditorPersistenceRecord(
    "game-room-320",
    tracks,
    2,
    base.savedAt,
    { project: store.project, appliedCommandIds: ["remote-command-320"] },
  );
  assert.equal(await validateGameEditorPersistenceRecord(checkpoint), true);
  const restored = GameEditorCanonicalStore.restore(
    checkpoint.canonicalProject!,
    checkpoint.appliedCommandIds,
  );
  assert.equal(
    restored.project.revision.snapshotHash,
    store.project.revision.snapshotHash,
  );
  assert.deepEqual(restored.appliedCommandIds, ["remote-command-320"]);

  const corruptProject = {
    ...store.project,
    revision: {
      ...store.project.revision,
      snapshotHash: "0".repeat(
        64,
      ) as typeof store.project.revision.snapshotHash,
    },
  };
  const corrupt = await createGameEditorPersistenceRecord(
    "game-room-320",
    tracks,
    2,
    base.savedAt,
    { project: corruptProject, appliedCommandIds: [] },
  );
  assert.equal(await validateGameEditorPersistenceRecord(corrupt), false);
});
