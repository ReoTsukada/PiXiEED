import {
  cloneProjectStateShared,
  createProject,
} from "../../src/draw2-core.ts";
import {
  createDraw2PersistenceRecord,
  createMemoryDraw2PersistenceStore,
  restoreDraw2PersistenceRecord,
} from "../../src/draw2-persistence.ts";
import {
  draw2ProjectEditorPreferences,
  readDraw2EditorPreferences,
  withDraw2ProjectEditorPreferences,
} from "../../src/draw2-editor-preferences.ts";
import { LocalUndoRedoHistory } from "../../src/draw2-selection.ts";
import { normalizeDraw2TimelineMetadata } from "../../src/draw2-creator-features.ts";
import {
  createGameEditorPersistenceRecord,
  createMemoryGameEditorPersistenceStore,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";

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
        "audio:theme",
    "Draw timeline metadata was not restored.",
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

Deno.test("GAME-PERSISTENCE keeps editor state scoped to the parent Project", async () => {
  const store = createMemoryGameEditorPersistenceStore();
  const record = await createGameEditorPersistenceRecord(
    "workspace:game-subdocument",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 2] }],
    1,
    "2026-08-18T00:00:00.000Z",
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
    (await store.load("workspace:other-project")) === null,
    "Game state leaked across Project IDs.",
  );
});
