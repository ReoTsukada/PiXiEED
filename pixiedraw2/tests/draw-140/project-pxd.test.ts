import {
  exportPxd,
  exportPxdProject,
  importPxdPackage,
  importPxdProject,
  type PxdAssetDefinitionEntry,
} from "../../src/draw2-export.ts";
import { inspectPxd } from "../../src/draw2-legacy-compat.ts";
import { canonicalJson, createProject } from "../../src/draw2-core.ts";
import { createAssetDefinitionDraft } from "../../src/draw2-creator-workspace.ts";

function assert(condition: unknown, message = "Assertion failed."): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  assertEquals(actual.byteLength, expected.byteLength);
  for (let index = 0; index < actual.length; index += 1) {
    assertEquals(actual[index], expected[index]);
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await action();
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes(message)) return;
    throw cause;
  }
  throw new Error("Expected action to reject.");
}

Deno.test("integrated PXD v2 contains independent Audio/Game entries and round-trips them", async () => {
  const state = createProject({
    projectId: "project-pxd-v2",
    name: "Integrated PXD",
    width: 4,
    height: 4,
    tileSize: 32,
  });
  const audioRecord = {
    schemaVersion: "AUDIO-200_PERSISTENCE_V1",
    projectId: state.projectId,
    checkpoint: { projectId: state.projectId, projectRevision: 2 },
  };
  const gameRecord = {
    schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
    projectId: state.projectId,
    tracks: [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 4] }],
  };
  const audioBytes = Uint8Array.from([1, 2, 3, 4, 5]);
  const drawTimelineMetadata = {
    schemaVersion: 2 as const,
    animationTags: [{
      id: "tag:idle",
      name: "Idle",
      fromFrameIndex: 0,
      toFrameIndex: 0,
      loop: true,
      color: 0x66e0c2,
    }],
    markers: [{
      id: "marker:start",
      frameIndex: 0,
      kind: "AUDIO" as const,
      label: "Start",
      payload: { cue: "intro", beat: 1 },
    }],
    audioReferences: [],
  };
  const first = await exportPxdProject(state, {
    drawTimelineMetadata,
    audio: {
      schemaVersion: "AUDIO-200_PERSISTENCE_V1",
      record: audioRecord,
      assets: [{
        revisionId: "revision:voice:1",
        mediaType: "audio/wav",
        bytes: audioBytes,
      }],
    },
    game: {
      schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
      record: gameRecord,
    },
  });
  const second = await exportPxdProject(state, {
    drawTimelineMetadata,
    audio: {
      schemaVersion: "AUDIO-200_PERSISTENCE_V1",
      record: audioRecord,
      assets: [{
        revisionId: "revision:voice:1",
        mediaType: "audio/wav",
        bytes: audioBytes,
      }],
    },
    game: {
      schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
      record: gameRecord,
    },
  });
  assertBytesEqual(first.bytes, second.bytes);
  assertEquals(first.manifest.schemaVersion, 2);
  assertEquals(first.manifest.archiveVersion, 2);
  assertEquals(first.manifest.modules.audio.status, "EMBEDDED");
  assertEquals(first.manifest.modules.game.status, "EMBEDDED");
  assertEquals((await inspectPxd(first.bytes)).source.identity, "NEW_DRAW2_PXD_V2");
  assert(first.manifest.entries.some((entry) => entry.path === "modules/audio/state.json"));
  assert(first.manifest.entries.some((entry) => entry.path === "objects/audio-0000.bin"));
  assertEquals(
    canonicalJson(first.manifest.drawTimelineMetadata),
    canonicalJson(drawTimelineMetadata),
  );

  const imported = await importPxdProject(first.bytes, {
    expectedPackageHash: first.packageHash,
  });
  assertEquals(imported.state.projectId, state.projectId);
  assertEquals(canonicalJson(imported.audio?.record), canonicalJson(audioRecord));
  assertEquals(imported.audio?.assets[0]?.revisionId, "revision:voice:1");
  assertBytesEqual(imported.audio?.assets[0]?.bytes ?? new Uint8Array(), audioBytes);
  assertEquals(canonicalJson(imported.game?.record), canonicalJson(gameRecord));
  assertEquals(
    canonicalJson(imported.drawTimelineMetadata),
    canonicalJson(drawTimelineMetadata),
  );

  const drawOnly = await exportPxd(state, {
    drawTimelineMetadata,
  });
  const drawOnlyImported = await importPxdPackage(drawOnly.bytes, {
    expectedPackageHash: drawOnly.packageHash,
  });
  assertEquals(
    canonicalJson(drawOnlyImported.drawTimelineMetadata),
    canonicalJson(drawTimelineMetadata),
  );
});

Deno.test("integrated PXD v2 keeps multiple product candidates as lightweight references", async () => {
  const state = createProject({
    projectId: "project-pxd-product-candidates",
    name: "Product Candidate Source",
    width: 8,
    height: 8,
    tileSize: 32,
  });
  const keyVisual = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: state.activeAssetId,
    sourceKind: "VISIBLE_COMPOSITE",
    sourceLayerIds: [state.activeLayerId],
    frameStart: 1,
    frameEnd: 1,
    frameSelection: { kind: "CURRENT_FRAME", frameId: state.activeFrameId },
    assetKind: "BACKGROUND",
    pivot: "CENTER",
    metadata: { name: "限定キービジュアル" },
  });
  const character = createAssetDefinitionDraft({
    sourceProjectId: state.projectId,
    sourceCanvasId: state.activeAssetId,
    sourceKind: "ANIMATION_RANGE",
    sourceLayerIds: [state.activeLayerId],
    frameStart: 1,
    frameEnd: 32,
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-01", "frame-02", "frame-03", "frame-04"] },
    animationMapping: [
      { name: "WALK_UP", frameIds: ["walk-up-1", "walk-up-2"], loopMode: "LOOP", fps: 8 },
      { name: "WALK_DOWN", frameIds: ["walk-down-1", "walk-down-2"], loopMode: "LOOP", fps: 8 },
      { name: "WALK_LEFT", frameIds: ["walk-left-1", "walk-left-2"], loopMode: "LOOP", fps: 8 },
      { name: "WALK_RIGHT", frameIds: ["walk-right-1", "walk-right-2"], loopMode: "LOOP", fps: 8 },
      { name: "ATTACK_UP", frameIds: ["attack-up-1", "attack-up-2"], loopMode: "ONCE", fps: 12 },
      { name: "ATTACK_DOWN", frameIds: ["attack-down-1", "attack-down-2"], loopMode: "ONCE", fps: 12 },
      { name: "ATTACK_LEFT", frameIds: ["attack-left-1", "attack-left-2"], loopMode: "ONCE", fps: 12 },
      { name: "ATTACK_RIGHT", frameIds: ["attack-right-1", "attack-right-2"], loopMode: "ONCE", fps: 12 },
    ],
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "歩行・攻撃4方向キャラクター" },
  });
  if (!keyVisual.ok || !character.ok) throw new Error("Asset Definition fixture could not be created.");
  const selectedFrames = {
    ...character.value,
    frameSelection: { kind: "EXPLICIT" as const, frameIds: ["frame-01", "frame-02", "frame-03"] },
    animationMapping: [],
    assetKind: "EFFECT" as const,
    pivot: "CENTER" as const,
    pivotDefinition: { kind: "CENTER" as const },
    metadata: { name: "派生用3フレーム", description: "", tags: [] },
  };
  const assetDefinitions: PxdAssetDefinitionEntry[] = [
    { definitionId: "key-visual", definition: keyVisual.value },
    { definitionId: "character-four-direction", definition: character.value },
    { definitionId: "selected-frames", definition: selectedFrames },
  ];
  const productDefinitions = [
    {
      schemaVersion: 1 as const,
      persistence: "LOCAL_DRAFT" as const,
      productId: "game-full",
      kind: "GAME_PROJECT" as const,
      name: "ゲーム本体",
      description: "Draw・Audio・Gameを含むゲーム商品候補",
      includedModules: ["DRAW", "AUDIO", "GAME"] as const,
      assetDefinitionIds: [],
      audioRevisionIds: ["revision:voice:1"],
      rights: ["PERSONAL_USE"] as const,
      edition: { kind: "UNLIMITED" } as const,
    },
    {
      schemaVersion: 1 as const,
      persistence: "LOCAL_DRAFT" as const,
      productId: "key-visual-limited-3",
      kind: "DRAW_IMAGE" as const,
      name: "限定キービジュアル",
      description: "同一作品を3点限定で扱う商品候補",
      includedModules: ["DRAW"] as const,
      assetDefinitionIds: ["key-visual"],
      audioRevisionIds: [],
      rights: ["PERSONAL_USE"] as const,
      edition: { kind: "LIMITED", maxUnits: 3 } as const,
    },
    {
      schemaVersion: 1 as const,
      persistence: "LOCAL_DRAFT" as const,
      productId: "selected-frames-derivative",
      kind: "DRAW_ANIMATION" as const,
      name: "指定3フレーム派生素材",
      description: "指定フレームだけ派生利用可能な商品候補",
      includedModules: ["DRAW"] as const,
      assetDefinitionIds: ["selected-frames"],
      audioRevisionIds: [],
      rights: ["DERIVATIVE"] as const,
      edition: { kind: "UNLIMITED" } as const,
    },
    {
      schemaVersion: 1 as const,
      persistence: "LOCAL_DRAFT" as const,
      productId: "music-asset",
      kind: "AUDIO_ASSET" as const,
      name: "音楽Asset",
      description: "PXD内の音声リビジョンを単独商品候補として扱う",
      includedModules: ["AUDIO"] as const,
      assetDefinitionIds: [],
      audioRevisionIds: ["revision:voice:1"],
      rights: ["COMMERCIAL_USE"] as const,
      edition: { kind: "UNLIMITED" } as const,
    },
    {
      schemaVersion: 1 as const,
      persistence: "LOCAL_DRAFT" as const,
      productId: "character-walk-attack-4dir",
      kind: "DRAW_CHARACTER_ANIMATION" as const,
      name: "歩行・攻撃4方向アセット",
      description: "歩行4方向と攻撃4方向のキャラクター素材候補",
      includedModules: ["DRAW"] as const,
      assetDefinitionIds: ["character-four-direction"],
      audioRevisionIds: [],
      rights: ["COMMERCIAL_USE", "DERIVATIVE"] as const,
      edition: { kind: "UNLIMITED" } as const,
    },
  ];
  const exported = await exportPxdProject(state, {
    assetDefinitions,
    productDefinitions,
    audio: {
      schemaVersion: "AUDIO-200_PERSISTENCE_V1",
      record: { projectId: state.projectId },
      assets: [{ revisionId: "revision:voice:1", mediaType: "audio/wav", bytes: Uint8Array.from([1, 2, 3]) }],
    },
    game: { schemaVersion: "GAME_EDITOR_PERSISTENCE_V1", record: { projectId: state.projectId, tracks: [] } },
  });
  assertEquals(exported.manifest.productDefinitions?.map((entry) => entry.productId).join(","), "character-walk-attack-4dir,game-full,key-visual-limited-3,music-asset,selected-frames-derivative");
  assertEquals(exported.manifest.productDefinitions?.find((entry) => entry.productId === "key-visual-limited-3")?.edition.kind, "LIMITED");
  assertEquals((exported.manifest.productDefinitions?.find((entry) => entry.productId === "key-visual-limited-3")?.edition as { maxUnits?: number }).maxUnits, 3);
  assert(exported.bytes.byteLength < 20_000, "Product definitions must not duplicate raster/audio payloads.");
  const imported = await importPxdProject(exported.bytes, { expectedPackageHash: exported.packageHash });
  assertEquals(imported.assetDefinitions.length, 3);
  assertEquals(imported.productDefinitions.length, 5);
  assertEquals(imported.productDefinitions.find((entry) => entry.productId === "selected-frames-derivative")?.rights[0], "DERIVATIVE");
  assertEquals(imported.productDefinitions.find((entry) => entry.productId === "character-walk-attack-4dir")?.assetDefinitionIds[0], "character-four-direction");
});

Deno.test("integrated PXD v2 rejects product candidates with missing sources or invalid edition limits", async () => {
  const state = createProject({ projectId: "project-pxd-invalid-product", width: 2, height: 2, tileSize: 32 });
  const invalid = {
    schemaVersion: 1 as const,
    persistence: "LOCAL_DRAFT" as const,
    productId: "broken-product",
    kind: "DRAW_IMAGE" as const,
    name: "Broken",
    description: "",
    includedModules: ["DRAW"] as const,
    assetDefinitionIds: ["missing-definition"],
    audioRevisionIds: [],
    rights: ["DERIVATIVE"] as const,
    edition: { kind: "LIMITED", maxUnits: 0 } as const,
  };
  await assertRejects(
    () => exportPxdProject(state, { productDefinitions: [invalid] }),
    "missing Asset Definition",
  );
});

Deno.test("integrated PXD v2 can explicitly carry empty Audio/Game modules", async () => {
  const state = createProject({
    projectId: "project-pxd-empty-modules",
    width: 2,
    height: 2,
    tileSize: 32,
  });
  const exported = await exportPxdProject(state);
  assertEquals(exported.manifest.modules.audio.status, "EMPTY");
  assertEquals(exported.manifest.modules.game.status, "EMPTY");
  const imported = await importPxdProject(exported.bytes);
  assertEquals(imported.audio, null);
  assertEquals(imported.game, null);
});

Deno.test("integrated PXD v2 rejects a changed module payload", async () => {
  const state = createProject({
    projectId: "project-pxd-corrupt-module",
    width: 2,
    height: 2,
    tileSize: 32,
  });
  const exported = await exportPxdProject(state, {
    game: {
      schemaVersion: "GAME_EDITOR_PERSISTENCE_V1",
      record: { projectId: state.projectId, tracks: [] },
    },
  });
  const corrupted = exported.bytes.slice();
  corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
  await assertRejects(
    () => importPxdProject(corrupted),
    "hash does not match",
  );
});
