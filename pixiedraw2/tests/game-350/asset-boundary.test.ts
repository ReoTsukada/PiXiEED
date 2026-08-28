import {
  decideGameAssetMutation,
  gameAssetBoundaryScopeFor,
} from "../../src/game/game-350/asset-boundary.ts";
import {
  createGameEditorPersistenceRecord,
  type GameEditorBinding,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-BOUNDARY-001 permits Game placement but denies Draw/Audio source writes", () => {
  for (const kind of ["DRAW", "AUDIO"] as const) {
    const scope = gameAssetBoundaryScopeFor(kind);
    assert(
      decideGameAssetMutation(scope, "ATTACH_REFERENCE").allowed,
      `${kind} references must be attachable from Game`,
    );
    assert(
      decideGameAssetMutation(scope, "CHANGE_REFERENCE_MODE").allowed,
      `${kind} reference mode must be changeable from Game`,
    );
    assert(
      decideGameAssetMutation(scope, "EDIT_GAME_PLACEMENT").allowed,
      `${kind} placement must remain editable in Game`,
    );
    for (
      const mutation of [
        "EDIT_SOURCE_CONTENT",
        "EDIT_SOURCE_METADATA",
        "DELETE_SOURCE",
      ] as const
    ) {
      const decision = decideGameAssetMutation(scope, mutation);
      assert(!decision.allowed, `${kind} source mutation must be denied`);
      assert(
        decision.code === "SOURCE_WRITE_DENIED",
        `${kind} source mutation must fail with SOURCE_WRITE_DENIED`,
      );
    }
  }
});

Deno.test("GAME350-BOUNDARY-002 keeps Game-owned edits inside the Game scope", () => {
  assert(
    decideGameAssetMutation("GAME_OWNED", "EDIT_GAME_PLACEMENT").allowed,
    "Game-owned placement must be editable",
  );
  assert(
    !decideGameAssetMutation("GAME_OWNED", "DELETE_SOURCE").allowed,
    "Game scope must not expose source deletion",
  );
  assert(
    !decideGameAssetMutation("DRAW_REFERENCE", "UNSUPPORTED" as never).allowed,
    "unknown operations must fail closed",
  );
});

Deno.test("GAME350-BOUNDARY-003 persists only reference metadata", async () => {
  const contaminated = {
    trackId: "hero",
    kind: "DRAW" as const,
    assetId: "draw-hero",
    revisionId: "draw-revision-1",
    contentHash: "a".repeat(64),
    mode: "PINNED" as const,
    label: "Hero",
    assetDefinitionId: "asset-definition-hero",
    sourceBytes: "must-not-cross-the-boundary",
  } as unknown as GameEditorBinding;
  const record = await createGameEditorPersistenceRecord(
    "game-project",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [] }],
    1,
    undefined,
    undefined,
    [contaminated],
  );
  assert(
    !("sourceBytes" in (record.bindings?.[0] ?? {})),
    "source payloads must be stripped before Game persistence",
  );
  assert(
    record.bindings?.[0]?.assetDefinitionId === "asset-definition-hero",
    "the named Draw Definition identity must survive Game persistence",
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "reference-only persistence record must validate",
  );

  const invalidAudioBinding = await createGameEditorPersistenceRecord(
    "game-project",
    [{ id: "audio", label: "Audio", kind: "MUSIC", filled: [] }],
    1,
    undefined,
    undefined,
    [{
      trackId: "audio",
      kind: "AUDIO",
      assetId: "audio-theme",
      revisionId: "audio-revision-1",
      contentHash: "b".repeat(64),
      mode: "LIVE",
      label: "Theme",
      assetDefinitionId: "must-not-bind-audio",
    }],
  );
  assert(
    !(await validateGameEditorPersistenceRecord(invalidAudioBinding)),
    "a Draw Definition identity must not be accepted on an Audio binding",
  );
});
