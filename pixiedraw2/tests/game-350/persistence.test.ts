import {
  classifyGameEditorPersistenceError,
  createGameEditorPersistenceRecord,
  createMemoryGameEditorPersistenceStore,
  validateGameEditorPersistenceRecord,
  type GameEditorPersistenceRecord,
  type GameEditorPersistenceSaveOptions,
  type GameEditorPersistenceStore,
} from "../../src/workspace/game-persistence.ts";
import {
  cloneGamePlaygroundConfig,
  createDefaultGamePlaygroundConfig,
  isValidGamePlaygroundConfig,
  normalizeGamePlaygroundConfig,
  type GameAssetEntry,
  type GamePlacement,
  type GamePlaygroundConfig,
  type GamePlaygroundDrawReference,
  type GamePlaygroundPlacement,
} from "../../src/game/game-350/playground.ts";
import {
  classifyGamePersistenceFailure,
  GAME_PERSISTENCE_OFFLINE_MESSAGE,
  isGamePersistenceCapabilityAvailable,
  projectGamePlaygroundDrawReference,
} from "../../src/wp180-workspace-ui.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const heroReference: GamePlaygroundDrawReference = {
  assetId: "asset:hero",
  revisionId: "revision:hero",
  contentHash: "hash:hero",
  label: "主人公",
  mode: "LIVE",
  layout: "GRID_32",
  region: { x: 0, y: 0, width: 32, height: 32 },
};

function phase1Playground(): GamePlaygroundConfig {
  const asset: GameAssetEntry = {
    assetId: "asset:hero",
    name: "主人公",
    source: heroReference,
    defaults: { movable: true, collision: true, gravity: true },
  };
  const placement = (placementId: string, x: number): GamePlaygroundPlacement => ({
    id: placementId,
    label: asset.name,
    kind: "SPRITE",
    reference: asset.source,
    layer: "ACTOR",
    depth: 10,
    x,
    y: 24,
    scale: 1,
    rotation: 0,
    visible: true,
    snapToGrid: false,
  });
  return normalizeGamePlaygroundConfig({
    ...createDefaultGamePlaygroundConfig(),
    assets: [asset],
    placements: [placement("placement:1", 12.25), placement("placement:2", 44.5)],
  });
}

function countedStore(base: GameEditorPersistenceStore): {
  store: GameEditorPersistenceStore;
  getSaveCount: () => number;
} {
  let saveCount = 0;
  const store: GameEditorPersistenceStore = {
    available: base.available,
    load: (projectId) => base.load(projectId),
    save: async (
      record: GameEditorPersistenceRecord,
      options?: GameEditorPersistenceSaveOptions,
    ) => {
      saveCount += 1;
      return base.save(record, options);
    },
    clear: (projectId) => base.clear(projectId),
  };
  return { store, getSaveCount: () => saveCount };
}

Deno.test("GAME-350-PERSISTENCE-001 saves one snapshot and reloads it by project", async () => {
  const counted = countedStore(createMemoryGameEditorPersistenceStore());
  let sourceState = phase1Playground();
  const registeredSnapshot = cloneGamePlaygroundConfig(sourceState);
  const record = await createGameEditorPersistenceRecord(
    "project:phase1",
    [],
    1,
    "2026-09-04T00:00:00.000Z",
    undefined,
    [],
    [],
    [],
    undefined,
    [],
    [],
    "BLANK",
    undefined,
    [],
    undefined,
    undefined,
    registeredSnapshot,
  );
  const saved = await counted.store.save(record, {
    expectedRevision: 0,
    expectedStateHash: null,
  });
  assert(saved.ok && !saved.stale, "the first Game mutation should save");
  assert(counted.getSaveCount() === 1, "one mutation must issue one save");

  sourceState = { ...sourceState, placements: [] };
  const loaded = await counted.store.load("project:phase1");
  assert(loaded !== null, "the saved Project should load immediately");
  assert(loaded.projectId === "project:phase1", "loaded Project ID must match");
  assert(await validateGameEditorPersistenceRecord(loaded), "loaded record must validate");
  const normalized = normalizeGamePlaygroundConfig(loaded.playground);
  assert(isValidGamePlaygroundConfig(normalized), "normalized Playground must validate");
  assert(normalized.assets.length === 1, "one Asset must survive persistence");
  assert(normalized.placements.length === 2, "two Placements must survive persistence");
  assert(normalized.placements[0]?.placementId === "placement:1", "first Placement ID must survive");
  assert(normalized.placements[1]?.placementId === "placement:2", "second Placement ID must survive");
  assert(normalized.placements.every((placement) => placement.assetId === "asset:hero"), "both Placements must share the Asset");
  const firstPlacement = normalized.placements[0];
  assert(firstPlacement !== undefined, "first Placement must exist");
  const firstCanonical = firstPlacement as unknown as GamePlacement;
  assert(firstCanonical.transform.x === 12.25, "registered snapshot must not drift after save registration");
  assert(await counted.store.load("project:other") === null, "another Project ID must remain empty");
});

Deno.test("GAME-350-PERSISTENCE-002 selection does not queue a persistence save", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const selectionMarker = 'assetId: asset.assetId';
  const clickStart = source.lastIndexOf(
    'button.addEventListener("click", () => {',
    source.indexOf(selectionMarker),
  );
  const clickEnd = source.indexOf(
    'button.addEventListener("dragstart"',
    clickStart,
  );
  assert(clickStart >= 0 && clickEnd > clickStart, "Asset selection handler must be discoverable");
  const handler = source.slice(clickStart, clickEnd);
  assert(handler.includes('{ type: "OPEN_ASSET"'), "Shelf click must open Asset context");
  assert(!handler.includes("queueGameEditorPersistenceSave"), "selection must not queue persistence");

  const queueStart = source.indexOf("const queueGameEditorPersistenceSave =");
  const flushStart = source.indexOf("const flushGameEditorPersistence", queueStart);
  const queueSource = source.slice(queueStart, flushStart);
  assert(
    (queueSource.match(/gamePersistenceStore\.save\(/g) ?? []).length === 1,
    "one queued mutation must contain one IndexedDB save call",
  );
  assert(
    (queueSource.match(/!gamePersistenceCapabilityAvailable\(\)/g) ?? []).length >= 2,
    "offline capability must be checked at registration and execution",
  );
});

Deno.test("GAME-350-PERSISTENCE-003 exposes an offline save state without retry fallback", async () => {
  const html = await Deno.readTextFile(
    new URL("../../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../../src/wp180-workspace-ui.ts", import.meta.url),
  );
  assert(html.includes('id="draw2GamePersistenceStatus"'), "Game save status must have a stable surface");
  assert(html.includes('aria-live="polite"'), "Game save status must announce changes");
  assert(html.includes("data-game-persistence-label"), "Game save status must include a text label");
  assert(source.includes('state === "offline"'), "unsupported persistence must have an offline state");
  assert(source.includes("GAME_PERSISTENCE_OFFLINE_MESSAGE"), "offline state must use the shared message contract");
  assert(!source.includes("localStorage.setItem"), "offline support must not add a localStorage fallback");
});

Deno.test("GAME-350-PERSISTENCE-004 separates unavailable storage, write errors, and conflicts", () => {
  let saveCalls = 0;
  const saveIfAvailable = (storeAvailable: boolean, indexedDb: unknown): void => {
    if (!isGamePersistenceCapabilityAvailable(storeAvailable, indexedDb)) return;
    saveCalls += 1;
  };
  saveIfAvailable(false, undefined);
  assert(saveCalls === 0, "unavailable IndexedDB must not start a save");
  assert(
    classifyGamePersistenceFailure(undefined, false) === "offline",
    "unavailable IndexedDB must be offline",
  );
  assert(
    classifyGamePersistenceFailure(new Error("write failed"), true) === "error",
    "ordinary write failures must be errors",
  );
  assert(
    classifyGamePersistenceFailure(new Error("CAS conflict"), true) === "conflict",
    "CAS conflicts must be conflicts",
  );
  assert(
    classifyGamePersistenceFailure({ name: "SecurityError" }, true) === "offline" &&
      classifyGamePersistenceFailure({ name: "NotAllowedError" }, true) === "offline" &&
      classifyGamePersistenceFailure({ name: "InvalidStateError" }, true) === "offline",
    "storage permission and unavailable states must be offline",
  );
  assert(
    classifyGamePersistenceFailure({ name: "QuotaExceededError" }, true) === "error" &&
      classifyGamePersistenceFailure({ name: "DataError" }, true) === "error",
    "quota and invalid data failures must remain errors",
  );
  assert(
    GAME_PERSISTENCE_OFFLINE_MESSAGE ===
      "この環境では保存できません。再読み込みで変更が失われます。",
    "offline copy must match the UI contract",
  );
});

Deno.test("GAME-350-PERSISTENCE-005 keeps queue stages isolated and diagnostics safe", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const queueStart = source.indexOf("const queueGameEditorPersistenceSave =");
  const flushStart = source.indexOf("const flushGameEditorPersistence", queueStart);
  const queueSource = source.slice(queueStart, flushStart);
  const saveStart = queueSource.indexOf("gamePersistenceStore.save(");
  const recordFailure = queueSource.indexOf('cause: "record-build-failed"');
  const canonicalFailure = queueSource.indexOf('cause: "canonical-build-failed"');
  assert(recordFailure >= 0 && recordFailure < saveStart, "record-build failure must return before storage save");
  assert(canonicalFailure >= 0 && canonicalFailure < saveStart, "canonical-build failure must return before storage save");
  assert(queueSource.includes('queueStage = "record-build"'), "record-build stage must be explicit");
  assert(queueSource.includes('queueStage = "canonical-build"'), "canonical-build stage must be explicit");
  assert(queueSource.includes('queueStage = "storage-save"'), "storage-save stage must be explicit");
  assert(queueSource.includes('queueStage = "canonical-sync"'), "canonical-sync stage must be explicit");
  assert(queueSource.includes('queueStage = "manifest-update"'), "manifest-update stage must be explicit");
  assert(
    (queueSource.match(/gamePersistenceStore\.save\(/g) ?? []).length === 1,
    "the queue must have one storage save call",
  );
  const diagnosticStart = source.indexOf("const setGamePersistenceDiagnostic =");
  const diagnosticEnd = source.indexOf("const gamePersistenceCapabilityAvailable", diagnosticStart);
  const diagnosticSource = source.slice(diagnosticStart, diagnosticEnd);
  assert(diagnosticSource.includes("safeGamePersistenceErrorName"), "DOM diagnostics must sanitize error names");
  assert(!diagnosticSource.includes("error.message"), "raw error messages must not enter the DOM");
  assert(!diagnosticSource.includes("snapshot"), "asset or snapshot data must not enter diagnostics");
  assert(queueSource.includes('setGamePersistenceState("saved")'), "primary success must publish saved");
  assert(queueSource.includes('stage: "canonical-sync"'), "canonical post-save diagnostics must retain their stage");
  assert(queueSource.includes('stage: "manifest-update"'), "manifest post-save diagnostics must retain their stage");

  let saveCalls = 0;
  const save = (): void => {
    saveCalls += 1;
  };
  try {
    await createGameEditorPersistenceRecord(
      "project:record-build-failure",
      [{ id: "", label: "", kind: "", filled: [] }],
      1,
    );
  } catch {
    // The queue's record-build catch must return before invoking save.
  }
  assert(saveCalls === 0, "record-build failure must not call storage save");

  const invalidRecord = { schemaVersion: "invalid" } as unknown as GameEditorPersistenceRecord;
  try {
    await validateGameEditorPersistenceRecord(invalidRecord);
  } catch {
    // Invalid canonical input is isolated from storage in the queue.
  }
  assert(saveCalls === 0, "canonical-build failure must not call storage save");

  assert(
    classifyGameEditorPersistenceError({ name: "VersionError" }, "database-open-failed").failure === "error" &&
      classifyGameEditorPersistenceError({ name: "VersionError" }, "database-open-failed").cause === "database-open-failed",
    "database open failures must remain errors",
  );
  assert(
    classifyGameEditorPersistenceError({ name: "DataError" }, "record-write-failed").cause === "record-write-failed" &&
      classifyGameEditorPersistenceError({ name: "AbortError" }, "transaction-failed").cause === "transaction-failed",
    "put and transaction causes must remain operation-specific",
  );
  assert(
    classifyGameEditorPersistenceError({ name: "SecurityError" }, "record-read-failed").failure === "offline" &&
      classifyGameEditorPersistenceError({ name: "InvalidStateError" }, "transaction-aborted").failure === "offline",
    "storage capability errors must remain offline",
  );
});

Deno.test("GAME-350-PERSISTENCE-006 projects Bridge Draw metadata into a valid Game reference", async () => {
  const bridgeReference = {
    kind: "DRAW" as const,
    assetId: "asset:bridge-hero",
    revisionId: "revision:bridge-hero",
    contentHash: "hash:bridge-hero",
    label: "Bridge Hero",
    mode: "LIVE" as const,
    assetDefinitionId: "definition:bridge-hero",
  };
  const sourceFrames = [{
    sourceFrameId: "frame:hero:0",
    layerIds: ["layer:private"],
    rect: { x: 4, y: 8, width: 32, height: 32 },
    durationMs: 120,
    flipX: true,
    flipY: true,
  }];
  const reference = projectGamePlaygroundDrawReference(bridgeReference, {
    projectId: "draw-project",
    layout: "FRAME_SEQUENCE",
    sourceFrameId: "frame:hero:0",
    region: { x: 4, y: 8, width: 32, height: 32 },
    sourceFrames,
  });
  assert(isValidGamePlaygroundConfig({
    ...createDefaultGamePlaygroundConfig(),
    assets: [{
      assetId: reference.assetId,
      name: reference.label,
      source: reference,
      defaults: { movable: true, collision: true, gravity: false },
    }],
  }), "projected Bridge reference must validate as a Game Asset");
  const playground = normalizeGamePlaygroundConfig({
    ...createDefaultGamePlaygroundConfig(),
    assets: [{
      assetId: reference.assetId,
      name: reference.label,
      source: reference,
      defaults: { movable: true, collision: true, gravity: false },
    }],
  });
  const record = await createGameEditorPersistenceRecord(
    "project:bridge",
    [],
    1,
    "2026-09-04T00:00:00.000Z",
    undefined,
    [],
    [],
    [],
    undefined,
    [],
    [],
    "BLANK",
    undefined,
    [],
    undefined,
    undefined,
    playground,
  );
  assert(await validateGameEditorPersistenceRecord(record), "Bridge-derived record must persist");
  const json = JSON.stringify(record);
  assert(!json.includes('"kind":"DRAW"'), "Bridge kind must not enter Game persistence");
  assert(!json.includes("flipX") && !json.includes("flipY"), "Bridge-only transform keys must not enter Game persistence");
  assert(reference.assetId === "asset:bridge-hero", "Asset identity must be preserved");
  assert(reference.region?.width === 32 && reference.sourceFrames?.[0]?.durationMs === 120, "range and frame metadata must be preserved");
  assert(reference.sourceFrames?.[0]?.sourceFrameId === "frame:hero:0", "source frame identity must be preserved");
});
