import type { AudioAssetRecord } from "../../src/audio/audio-200/contracts.ts";
import type {
  AssetAnimationClip,
  AssetDefinitionDraft,
} from "../../src/draw2-creator-workspace.ts";
import type { PxdAssetDefinitionEntry } from "../../src/draw2-export.ts";
import {
  type GameAnimationBinding,
  isValidGameAnimationBinding,
} from "../../src/game/game-300/core.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import {
  buildGameAssetBrowserEntries,
  findGameAnimationClips,
  gameAnimationClipMatchesRuntime,
  gameAnimationBindingIdFor,
  upsertGameAnimationBinding,
} from "../../src/game/game-350/game-asset-browser.ts";
import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-ANIMATION-001 matches split and suffixed motion names", () => {
  const clip = { id: "clip", definitionId: "def", definitionName: "hero", clipKey: "walk-down", clip: {} as AssetAnimationClip, motionName: "WALK_DOWN" };
  assert(gameAnimationClipMatchesRuntime({ clip, motion: "WALK", direction: "DOWN" }), "suffixed motion should match");
  assert(!gameAnimationClipMatchesRuntime({ clip, motion: "WALK", direction: "UP" }), "direction should remain strict");
  const split = { ...clip, motionName: "WALK", direction: "DOWN" };
  assert(gameAnimationClipMatchesRuntime({ clip: split, motion: "WALK", direction: "DOWN" }), "split direction should match");
});

function definition(
  definitionId: string,
  animationMapping: readonly AssetAnimationClip[],
): PxdAssetDefinitionEntry {
  const value: AssetDefinitionDraft = {
    schemaVersion: 1,
    sourceProjectId: "draw-project",
    sourceCanvasId: "canvas:main",
    sourceKind: "ANIMATION_RANGE",
    sourceLayerIds: ["layer:hero"],
    frameStart: 0,
    frameEnd: 3,
    layerSelection: { kind: "CURRENT_LAYER", layerId: "layer:hero" },
    frameSelection: {
      kind: "EXPLICIT",
      frameIds: ["frame:1", "frame:2", "frame:3"],
    },
    region: { kind: "MANUAL", x: 0, y: 0, width: 16, height: 16 },
    animationMapping,
    assetKind: "CHARACTER",
    pivot: "FEET",
    pivotDefinition: { kind: "FEET" },
    protection: {
      locked: true,
      sourceReadOnly: true,
      referencePolicy: "LIVE",
    },
    metadata: { name: definitionId, description: "Hero", tags: ["hero"] },
    dependencyIds: [],
    persistence: "LOCAL_DRAFT",
  };
  return { definitionId, definition: value };
}

const idleDown: AssetAnimationClip = {
  name: "IDLE_DOWN",
  frameIds: ["frame:1", "frame:2"],
  loopMode: "LOOP",
  fps: 8,
  sourceFrames: [
    {
      sourceFrameId: "frame:1",
      layerIds: ["layer:hero"],
      rect: { x: 0, y: 0, width: 16, height: 16 },
    },
    {
      sourceFrameId: "frame:2",
      layerIds: ["layer:hero"],
      rect: { x: 0, y: 0, width: 16, height: 16 },
    },
  ],
};

const walkUp: AssetAnimationClip = {
  name: "WALK_UP",
  frameIds: ["frame:2", "frame:3"],
  loopMode: "LOOP",
  fps: 12,
  sourceFrames: [
    {
      sourceFrameId: "frame:2",
      layerIds: ["layer:hero"],
      rect: { x: 0, y: 0, width: 16, height: 16 },
    },
    {
      sourceFrameId: "frame:3",
      layerIds: ["layer:hero"],
      rect: { x: 0, y: 0, width: 16, height: 16 },
    },
  ],
};

const audioAsset = {
  schemaVersion: 1,
  assetId: "audio:theme",
  sourceName: "Theme",
  kind: "SONG",
  revisionIds: ["audio-revision:theme:1"],
  latestRevisionId: "audio-revision:theme:1",
  createdAt: "2026-08-27T00:00:00.000Z",
} as unknown as AudioAssetRecord;

Deno.test("GAME350-ASSET-BROWSER-001 builds one searchable catalog with read-only source badges", () => {
  const entries = buildGameAssetBrowserEntries({
    tracks: [{ id: "hero", label: "主人公", kind: "SPRITE", role: "PLAYER" }],
    drawDefinitions: [definition("draw:hero", [idleDown])],
    audioAssets: [audioAsset],
    templates: [{ id: "rpg.weapon", label: "武器", detail: "RPG · Game data" }],
  });
  assert(
    entries.length === 4,
    "catalog must include Game, Draw, Audio and Template entries",
  );
  assert(
    entries.find((entry) => entry.source === "DRAW")?.readOnly === true,
    "Draw source must be read-only",
  );
  assert(
    entries.find((entry) => entry.source === "AUDIO")?.readOnly === true,
    "Audio source must be read-only",
  );
  assert(
    buildGameAssetBrowserEntries({
      tracks: [{ id: "hero", label: "主人公", kind: "SPRITE", role: "PLAYER" }],
      drawDefinitions: [definition("draw:hero", [idleDown])],
      audioAssets: [audioAsset],
      query: "theme",
    }).length === 1,
    "catalog search must narrow to the matching external asset",
  );
});

Deno.test("GAME350-ASSET-BROWSER-002 resolves all Character clips, directions and source frames", () => {
  const clips = findGameAnimationClips({
    track: { id: "hero", label: "主人公", kind: "SPRITE", role: "PLAYER" },
    drawDefinitions: [definition("draw:hero", [idleDown, walkUp])],
  });
  assert(clips.length === 2, "all Character clips must be listed");
  assert(
    clips.some((clip) =>
      clip.motionName === "IDLE" && clip.direction === "DOWN"
    ),
    "Idle Down must be resolved",
  );
  assert(
    clips.some((clip) => clip.motionName === "WALK" && clip.direction === "UP"),
    "Walk Up must be resolved",
  );
  assert(
    clips.every((clip) =>
      clip.clip.frameIds.length === clip.clip.sourceFrames?.length
    ),
    "every listed clip must expose its sprite frame references",
  );
});

Deno.test("GAME350-ASSET-BROWSER-003 prioritizes the exact bound Draw Definition", () => {
  const target = definition("draw:hero-target", [idleDown]);
  const sibling = definition("draw:hero-sibling", [walkUp]);
  const clips = findGameAnimationClips({
    track: { id: "hero", label: "主人公", kind: "SPRITE", role: "PLAYER" },
    drawDefinitions: [
      {
        ...target,
        registryIdentity: { assetId: "asset:hero", revisionId: "revision:1" },
      },
      {
        ...sibling,
        registryIdentity: { assetId: "asset:hero", revisionId: "revision:1" },
      },
    ],
    boundDrawAssetId: "asset:hero",
    boundDrawDefinitionId: "draw:hero-target",
  });
  assert(
    clips.length === 1 && clips[0]?.definitionId === "draw:hero-target",
    "an exact Definition binding must take precedence over sibling definitions",
  );
});

Deno.test("GAME350-ASSET-BROWSER-004 rejects duplicate assignments without growing Game history", () => {
  const base: GameAnimationBinding = {
    bindingId: gameAnimationBindingIdFor("hero", "draw:hero", "IDLE_DOWN"),
    trackId: "hero",
    assetDefinitionId: "draw:hero",
    clipKey: "IDLE_DOWN",
    motionName: "IDLE",
    direction: "DOWN",
    frameIds: ["frame:1", "frame:2"],
    fps: 8,
    loopMode: "LOOP",
    flipX: false,
    flipY: false,
    mode: "LIVE",
  };
  assert(isValidGameAnimationBinding(base), "fixture binding must validate");
  const first = upsertGameAnimationBinding([], base);
  const second = upsertGameAnimationBinding(first.bindings, { ...base });
  assert(
    first.changed && !second.changed,
    "identical assignment must be a no-op",
  );
  assert(
    second.bindings.length === 1,
    "identical assignment must not duplicate",
  );
  const changed = upsertGameAnimationBinding(first.bindings, {
    ...base,
    fps: 10,
  });
  assert(
    changed.changed && changed.bindings.length === 1 &&
      changed.bindings[0]?.fps === 10,
    "Game override must update in place",
  );
});

Deno.test("GAME350-ASSET-BROWSER-005 persists animation references in the canonical timeline without source pixels", async () => {
  const binding: GameAnimationBinding = {
    bindingId: gameAnimationBindingIdFor("hero", "draw:hero", "IDLE_DOWN"),
    trackId: "hero",
    assetDefinitionId: "draw:hero",
    clipKey: "IDLE_DOWN",
    motionName: "IDLE",
    direction: "DOWN",
    frameIds: ["frame:1", "frame:2"],
    fps: 8,
    loopMode: "LOOP",
    flipX: false,
    flipY: false,
    mode: "PINNED",
    sourceAssetId: "asset:hero",
    sourceRevisionId: "revision:hero:1",
  };
  const record = await createGameEditorPersistenceRecord(
    "game-project",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [] }],
    1,
    "2026-08-27T00:00:00.000Z",
    undefined,
    [],
    [],
    [],
    undefined,
    [],
    [binding],
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "animation record must validate",
  );
  assert(
    !JSON.stringify(record).includes("pixels"),
    "source pixels must not enter Game persistence",
  );
  const store = await GameEditorCanonicalStore.create(record);
  const persisted = store.project.editorTimeline?.animationBindings ?? [];
  assert(
    persisted.length === 1 && persisted[0]?.clipKey === "IDLE_DOWN",
    "canonical timeline must retain the Game assignment",
  );
});
