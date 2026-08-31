import {
  cloneProjectStateShared,
  createProject,
} from "../../src/draw2-core.ts";
import {
  createDraw2PersistenceRecord,
  createMemoryDraw2PersistenceStore,
  restoreDraw2PersistenceRecord,
  serializeDraw2History,
} from "../../src/draw2-persistence.ts";
import {
  draw2ProjectEditorPreferences,
  readDraw2EditorPreferences,
  withoutDraw2ProjectEditorPreferences,
  withDraw2ProjectEditorPreferences,
} from "../../src/draw2-editor-preferences.ts";
import { LocalUndoRedoHistory } from "../../src/draw2-selection.ts";
import { normalizeDraw2TimelineMetadata } from "../../src/draw2-creator-features.ts";
import {
  createGameEditorPersistenceRecord,
  createMemoryGameEditorPersistenceStore,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import { asBehaviorId } from "../../src/game/game-300/core.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import {
  compileVisualGameLogicGraph,
  createVisualGameLogicStarter,
} from "../../src/game/game-350/visual-logic.ts";
import { createDefaultGameVisualMakerConfig } from "../../src/game/game-350/visual-maker-model.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("DRAW2-PERSISTENCE restores sparse raster and local history by Project ID", async () => {
  const state = createProject({
    projectId: "workspace:draw-subdocument",
    width: 8,
    height: 8,
    tileSize: 32,
    palette: [0, 0xffffffff, 0xff123456, 0x0000ffff],
  });
  const asset = state.assets[state.activeAssetId];
  assert(asset !== undefined, "Draw fixture asset is missing.");
  asset.raster.setPixel(asset.id, 3, 4, 2);
  const history = new LocalUndoRedoHistory(state);
  const before = cloneProjectStateShared(state);
  const after = cloneProjectStateShared(state);
  history.record(before, after, "draw-operation-1", "raster.setPixel");
  const timelineMetadata = normalizeDraw2TimelineMetadata({
    schemaVersion: 2,
    animationTags: [{
      id: "tag:idle",
      name: "Idle",
      fromFrameIndex: 0,
      toFrameIndex: 0,
      loop: true,
    }],
    markers: [{
      id: "marker:audio",
      frameIndex: 0,
      kind: "AUDIO",
      label: "BGM start",
    }],
    audioReferences: [{
      id: "audio-ref:bgm",
      audioAssetId: "audio:theme",
      audioRevisionId: "audio-revision:theme:1",
      kind: "BGM",
      label: "Theme",
      startFrame: 0,
      durationFrames: 1,
      loop: true,
      gain: 1,
    }],
    selectionStamps: [{
      id: "selection-stamp:hero",
      name: "Hero",
      width: 2,
      height: 2,
      pixels: [{ x: 0, y: 0, colorIndex: 2 }, { x: 1, y: 1, colorIndex: 0 }],
      palette: [0, 0xffffffff, 0xff123456, 0x0000ffff],
      schemaVersion: 1,
    }],
  }, state.frames.length);
  const record = await createDraw2PersistenceRecord(
    state,
    history.snapshot(),
    { operations: [], dirtyTileWrites: [] },
    1,
    "2026-08-18T00:00:00.000Z",
    [],
    timelineMetadata,
  );
  const store = createMemoryDraw2PersistenceStore();
  const saved = await store.save(record);
  assert(saved.ok && !saved.stale, "Draw subdocument was not saved.");
  const loaded = await store.load("workspace:draw-subdocument");
  assert(loaded !== null, "Draw subdocument was not loaded.");
  const restored = await restoreDraw2PersistenceRecord(
    loaded,
    "workspace:draw-subdocument",
  );
  const restoredAsset = restored.state.assets[restored.state.activeAssetId];
  assert(
    restoredAsset?.raster.getPixel(3, 4) === 2,
    "Raster pixel was not restored.",
  );
  assert(
    restoredAsset?.palette[2] === state.assets[state.activeAssetId]?.palette[2],
    "Palette entries were not restored with the Draw checkpoint.",
  );
  assert(restored.history.undo.length === 1, "Draw history was not restored.");
  assert(
    restored.assetDefinitions.length === 0,
    "Retired asset definitions were persisted.",
  );
  assert(
    restored.timelineMetadata.animationTags[0]?.name === "Idle" &&
      restored.timelineMetadata.markers[0]?.label === "BGM start" &&
      restored.timelineMetadata.audioReferences[0]?.audioAssetId ===
        "audio:theme" &&
      restored.timelineMetadata.selectionStamps?.[0]?.name === "Hero" &&
      restored.timelineMetadata.selectionStamps?.[0]?.pixels.length === 2,
    "Draw timeline metadata was not restored.",
  );
});

Deno.test("DRAW2-PERSISTENCE rejects stale same-revision writes from another tab", async () => {
  const base = createProject({
    projectId: "workspace:draw-persistence-cas",
    width: 8,
    height: 8,
    tileSize: 32,
  });
  const baseRecord = await createDraw2PersistenceRecord(
    base,
    new LocalUndoRedoHistory(base).snapshot(),
    { operations: [], dirtyTileWrites: [] },
    1,
    "2026-08-28T00:00:00.000Z",
  );
  const store = createMemoryDraw2PersistenceStore();
  assert((await store.save(baseRecord)).ok, "CAS base record was not saved.");

  const firstState = cloneProjectStateShared(base);
  firstState.assets[firstState.activeAssetId]?.raster.setPixel(
    firstState.activeAssetId,
    1,
    1,
    1,
  );
  const secondState = cloneProjectStateShared(base);
  secondState.assets[secondState.activeAssetId]?.raster.setPixel(
    secondState.activeAssetId,
    6,
    6,
    2,
  );
  const [first, second] = await Promise.all([
    createDraw2PersistenceRecord(
      firstState,
      new LocalUndoRedoHistory(firstState).snapshot(),
      { operations: [], dirtyTileWrites: [] },
      2,
      "2026-08-28T00:00:01.000Z",
    ),
    createDraw2PersistenceRecord(
      secondState,
      new LocalUndoRedoHistory(secondState).snapshot(),
      { operations: [], dirtyTileWrites: [] },
      2,
      "2026-08-28T00:00:02.000Z",
    ),
  ]);
  const options = {
    expectedRevision: baseRecord.revision,
    expectedStateHash: baseRecord.stateHash,
  };
  const results = await Promise.all([
    store.save(first, options),
    store.save(second, options),
  ]);
  assert(
    results.filter((result) => !result.stale).length === 1 &&
      results.filter((result) => result.stale).length === 1,
    "Two tabs must not both persist competing snapshots from one CAS base.",
  );
  const loaded = await store.load(base.projectId);
  assert(loaded !== null, "CAS record disappeared after competing writes.");
  assert(
    loaded.stateHash === first.stateHash || loaded.stateHash === second.stateHash,
    "The persisted snapshot is not one of the accepted competing writes.",
  );

  const sameRevisionDifferentHash = await store.save(second, {
    expectedRevision: loaded.revision,
    expectedStateHash: loaded.stateHash,
  });
  assert(
    sameRevisionDifferentHash.stale,
    "A different same-revision snapshot must remain rejected even with a newer timestamp.",
  );
});

Deno.test("DRAW2 editor preferences round-trip project-scoped view state", () => {
  const initial = readDraw2EditorPreferences(undefined);
  const project = draw2ProjectEditorPreferences(
    initial,
    "workspace:draw-preferences",
  );
  const next = withDraw2ProjectEditorPreferences(
    initial,
    "workspace:draw-preferences",
    {
      ...project,
      selectedColor: 3,
      mirrorMode: "ON",
      mirrorAxes: { ...project.mirrorAxes, diagonalUp: true },
      viewport: {
        ...project.viewport,
        zoom: 2,
        fit: false,
        userSelected: true,
        panX: 12,
        panY: -8,
      },
      onionSkin: {
        ...project.onionSkin,
        enabled: true,
        previousFrames: 0,
        nextFrames: 2,
      },
    },
  );
  const restored = draw2ProjectEditorPreferences(
    next,
    "workspace:draw-preferences",
  );
  assert(
    restored.selectedColor === 3,
    "Selected palette index was not preserved.",
  );
  assert(
    restored.mirrorMode === "ON" && restored.mirrorAxes.diagonalUp,
    "Mirror preference was not preserved.",
  );
  assert(
    restored.viewport.zoom === 2 && restored.viewport.panX === 12 &&
      restored.viewport.panY === -8,
    "Viewport preference was not preserved.",
  );
  assert(
    restored.onionSkin.enabled && restored.onionSkin.previousFrames === 0,
    "Onion-skin preference was not preserved.",
  );
  const cleaned = withoutDraw2ProjectEditorPreferences(
    next,
    "workspace:draw-preferences",
  );
  assert(
    draw2ProjectEditorPreferences(cleaned, "workspace:draw-preferences") ===
      draw2ProjectEditorPreferences(
        readDraw2EditorPreferences(undefined),
        "workspace:draw-preferences",
      ),
    "Deleted Project preferences were not removed from the local preference map.",
  );
});

Deno.test("DRAW2-PERSISTENCE bounds the durable history window", () => {
  const state = createProject({
    projectId: "workspace:draw-history-window",
    width: 8,
    height: 8,
    tileSize: 32,
  });
  const history = new LocalUndoRedoHistory(state);
  for (let index = 0; index < 4; index += 1) {
    const before = cloneProjectStateShared(state);
    const after = cloneProjectStateShared(state);
    history.record(before, after, `draw-operation-${index}`, "raster.writeSet");
  }
  const bounded = history.snapshot(2);
  assert(
    history.undoDepth === 4,
    "In-memory Draw history was unexpectedly truncated.",
  );
  assert(bounded.undo.length === 2, "Durable Draw history was not bounded.");
  assert(
    bounded.undo[0]?.operationId === "draw-operation-2" &&
      bounded.undo[1]?.operationId === "draw-operation-3",
    "Durable Draw history did not keep the most recent entries.",
  );
});

Deno.test("DRAW2-PERSISTENCE bounds serialized history by count and bytes", async () => {
  const state = createProject({
    projectId: "workspace:draw-history-persistence-limit",
    width: 8,
    height: 8,
    tileSize: 32,
  });
  const history = new LocalUndoRedoHistory(state);
  for (let index = 0; index < 12; index += 1) {
    const before = cloneProjectStateShared(state);
    const after = cloneProjectStateShared(state);
    after.assets[after.activeAssetId]?.raster.setPixel(
      after.activeAssetId,
      index % 8,
      Math.floor(index / 8),
      (index % 3) + 1,
    );
    history.record(before, after, `durable-operation-${index}`, "raster.writeSet");
  }
  const serialized = serializeDraw2History(history.snapshot());
  assert(serialized.undo.length === 8, "Default durable history count was not bounded.");
  const byteBounded = serializeDraw2History(history.snapshot(), {
    maxEntries: 128,
    maxBytes: 1,
  });
  assert(byteBounded.undo.length === 0 && byteBounded.redo.length === 0, "Durable history byte bound was not enforced.");
  const record = await createDraw2PersistenceRecord(
    state,
    history.snapshot(),
    { operations: [], dirtyTileWrites: [] },
    1,
  );
  assert(record.history.undo.length === 8, "Persistence record did not apply the durable history bound.");
});

Deno.test("GAME-PERSISTENCE keeps editor state scoped to the parent Project", async () => {
  const store = createMemoryGameEditorPersistenceStore();
  const record = await createGameEditorPersistenceRecord(
    "workspace:game-subdocument",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 2] }],
    1,
    "2026-08-18T00:00:00.000Z",
    undefined,
    [],
    [{
      behaviorId: asBehaviorId("behavior:pixiedraw-game:hero"),
      version: 1,
      ownership: "CANONICAL_IR",
      rules: [{
        ruleId: "hero-event",
        enabled: true,
        trigger: { type: "ACTION", actionId: "rpg.interact" },
        conditions: [{ kind: "ALWAYS" }],
        actions: [{
          kind: "SET_VARIABLE",
          targetId: "hero",
          property: "dialogue",
          value: "saved",
        }],
      }],
    }],
    [],
    undefined,
    [],
    [],
    "ACTION_2D",
    undefined,
    [],
    createDefaultGameVisualMakerConfig("hero"),
  );
  const saved = await store.save(record);
  assert(saved.ok, "Game subdocument was not saved.");
  const loaded = await store.load("workspace:game-subdocument");
  assert(loaded !== null, "Game subdocument was not loaded.");
  assert(
    await validateGameEditorPersistenceRecord(loaded),
    "Game subdocument checksum validation failed.",
  );
  assert(
    loaded.behaviors?.[0]?.rules[0]?.actions[0]?.kind === "SET_VARIABLE" &&
      loaded.behaviors[0].rules[0].actions[0].value === "saved",
    "Game Behavior IR was not restored with the Project subdocument.",
  );
  assert(
    loaded.creationMode === "ACTION_2D",
    "Game starter creation mode was not restored with the Project subdocument.",
  );
  assert(
    loaded.visualMaker?.activeCategory === "HERO" &&
      loaded.visualMaker.uiSlots.length === 5,
    "Visual Maker selections were not restored with the Project subdocument.",
  );
  assert(
    (await store.load("workspace:other-project")) === null,
    "Game state leaked across Project IDs.",
  );
});

Deno.test("GAME-PERSISTENCE rejects competing snapshots from one CAS base", async () => {
  const store = createMemoryGameEditorPersistenceStore();
  const base = await createGameEditorPersistenceRecord(
    "workspace:game-persistence-cas",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0] }],
    1,
    "2026-08-28T00:00:00.000Z",
  );
  assert((await store.save(base)).ok, "Game CAS base record was not saved.");
  const first = await createGameEditorPersistenceRecord(
    "workspace:game-persistence-cas",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 1] }],
    2,
    "2026-08-28T00:00:01.000Z",
  );
  const second = await createGameEditorPersistenceRecord(
    "workspace:game-persistence-cas",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 2] }],
    2,
    "2026-08-28T00:00:02.000Z",
  );
  const options = {
    expectedRevision: base.revision,
    expectedStateHash: base.stateHash,
  };
  const results = await Promise.all([
    store.save(first, options),
    store.save(second, options),
  ]);
  assert(
    results.filter((result) => !result.stale).length === 1 &&
      results.filter((result) => result.stale).length === 1,
    "Two Game tabs must not both persist competing edits.",
  );
  const loaded = await store.load(base.projectId);
  assert(loaded !== null, "Game CAS record disappeared.");
  assert(
    loaded.stateHash === first.stateHash || loaded.stateHash === second.stateHash,
    "Persisted Game state is not one of the accepted competing edits.",
  );
});

Deno.test("GAME-PERSISTENCE restores visual graph and bounded code sources", async () => {
  const graph = createVisualGameLogicStarter(
    asBehaviorId("behavior:pixiedraw-game:door"),
    "door",
  );
  const behavior = compileVisualGameLogicGraph(graph).behavior;
  const sourceText = [
    'on action("rpg.interact")',
    'if variable("hasKey") == true',
    'set variable("doorOpen") = true',
    "else",
    'set variable("dialogue") = "鍵が必要です。"',
    "end",
  ].join("\n");
  const record = await createGameEditorPersistenceRecord(
    "workspace:game-source-subdocument",
    [{ id: "door", label: "Door", kind: "EVENT", filled: [] }],
    1,
    "2026-08-26T00:00:00.000Z",
    undefined,
    [],
    [behavior],
    [{
      behaviorId: String(graph.behaviorId),
      mode: "CODE",
      graph,
      sourceText,
    }],
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "Visual graph and bounded code source must pass the persistence boundary.",
  );
  assert(
    record.behaviorSources?.[0]?.mode === "CODE" &&
      record.behaviorSources[0].graph?.nodes.length === 6 &&
      record.behaviorSources[0].sourceText?.includes("rpg.interact"),
    "Authoring source was not persisted beside canonical Behavior IR.",
  );
});

Deno.test("GAME-350 Game tracks and Physics2D survive hash/storage/canonical projection", async () => {
  const tracks = [
    {
      id: "hero",
      label: "Hero",
      kind: "SPRITE",
      filled: [0],
      active: true,
    },
    {
      id: "hero-child",
      label: "Sword",
      kind: "SPRITE",
      filled: [],
      parentTrackId: "hero",
      active: false,
    },
  ];
  const physics2D = {
    gravity: { x: 0, y: 12 },
    fixedDeltaTime: 1 / 60,
    maxSubSteps: 8,
    defaultMaterial: { friction: 0.7, bounciness: 0.2 },
  };
  const record = await createGameEditorPersistenceRecord(
    "workspace:game-hierarchy",
    tracks,
    3,
    "2026-08-27T00:00:00.000Z",
    undefined,
    [],
    [],
    [],
    physics2D,
  );
  const jsonRoundTrip = JSON.parse(JSON.stringify(record));
  assert(
    await validateGameEditorPersistenceRecord(jsonRoundTrip),
    "JSON/PXD-shaped Game record must validate after round-trip.",
  );
  const memory = createMemoryGameEditorPersistenceStore();
  assert((await memory.save(jsonRoundTrip)).ok, "Game record was not stored.");
  const loaded = await memory.load("workspace:game-hierarchy");
  assert(loaded?.tracks[1]?.parentTrackId === "hero", "Parent track was lost.");
  assert(loaded?.tracks[1]?.active === false, "Active flag was lost.");
  assert(loaded?.physics2D?.maxSubSteps === 8, "Physics settings were lost.");

  const canonical = await GameEditorCanonicalStore.create(loaded!);
  const scene = canonical.project.scenes[0] as typeof canonical.project.scenes[number] & {
    readonly physics2D?: typeof physics2D;
  };
  const hero = scene.entities.find((entity) =>
    String(entity.entityId).endsWith(":hero")
  );
  const child = scene.entities.find((entity) =>
    String(entity.entityId).endsWith(":hero-child")
  ) as typeof scene.entities[number] & { readonly active?: boolean } | undefined;
  assert(scene.rootEntityIds.length === 1 && hero !== undefined, "Only root tracks belong in rootEntityIds.");
  assert(
    String(child?.parentEntityId).endsWith(":hero") && child?.active === false,
    "Canonical Scene parentEntityId/active projection is incorrect.",
  );
  assert(scene.physics2D?.defaultMaterial.bounciness === 0.2, "Canonical Scene physics projection is incorrect.");
  const checkpoint = await createGameEditorPersistenceRecord(
    "workspace:game-hierarchy",
    tracks,
    3,
    record.savedAt,
    { project: canonical.project, appliedCommandIds: ["game-command"] },
    [],
    [],
    [],
    physics2D,
  );
  assert(
    await validateGameEditorPersistenceRecord(checkpoint),
    "Canonical checkpoint must retain hierarchy and Physics2D state.",
  );
});

Deno.test("GAME-350 rejects invalid parent targets and cycles before persistence", async () => {
  let rejected = false;
  try {
    await createGameEditorPersistenceRecord("workspace:invalid-parent", [{
      id: "hero",
      label: "Hero",
      kind: "SPRITE",
      filled: [],
      parentTrackId: "hero",
    }], 1);
  } catch {
    rejected = true;
  }
  assert(rejected, "Self-parenting must fail closed.");
  rejected = false;
  try {
    await createGameEditorPersistenceRecord("workspace:missing-parent", [{
      id: "child",
      label: "Child",
      kind: "SPRITE",
      filled: [],
      parentTrackId: "missing",
    }], 1);
  } catch {
    rejected = true;
  }
  assert(rejected, "Missing parent must fail closed.");
});
