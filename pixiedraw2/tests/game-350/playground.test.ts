import {
  createDefaultGamePlaygroundConfig,
  createDefaultGamePlaygroundWorldMap,
  createGamePlaygroundRuntimeWorld,
  createGamePlaygroundRuntime,
  cloneGamePlaygroundConfig,
  gamePlaygroundWorldCellAt,
  gamePlaygroundWorldCellsInViewport,
  gamePlaygroundWorldResidentChunkKeys,
  gamePlaygroundWorldSolidAt,
  isValidGamePlaygroundConfig,
  migrateGamePlaygroundConfig,
  normalizeGamePlaygroundConfig,
  removeGamePlaygroundAudioRange,
  stepGamePlaygroundRuntime,
  gamePlaygroundAnimationFrameIndex,
  upsertGamePlaygroundAudioRange,
  inferGamePlaygroundAssetLayout,
  type GamePlaygroundAudioRange,
  type GamePlaygroundConfig,
  type GamePlaygroundDrawReference,
  type GamePlaygroundPlacement,
} from "../../src/game/game-350/playground.ts";
import { createGameUiNode } from "../../src/game/game-350/visual-maker-model.ts";
import { paintGamePlaygroundWorldCell } from "../../src/game/game-350/world.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME-PLAYGROUND-016 maps one-shot animation progress to available frames", () => {
  assert(gamePlaygroundAnimationFrameIndex({ motion: "ATTACK", frameCount: 4, tick: 1, motionTicksRemaining: 3 }) === 0, "one-shot should start at its first frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "ATTACK", frameCount: 4, tick: 2, motionTicksRemaining: 0 }) === 3, "one-shot should end at its last frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "JUMP", frameCount: 7, tick: 1, motionTicksRemaining: 3 }) === 0, "long one-shot should start at its first frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "JUMP", frameCount: 7, tick: 2, motionTicksRemaining: 0 }) === 6, "long one-shot should end at its last frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "WALK", frameCount: 3, tick: 4, motionTicksRemaining: 0 }) === 2, "a completed cell step stays on the last walk frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "WALK", frameCount: 3, tick: 4, motionTicksRemaining: -1 }) === 1, "continuous walking keeps cycling by runtime tick");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "WALK", frameCount: 4, tick: 99, motionTicksRemaining: 3 }) === 0, "a cell step starts at the first walk frame");
  assert(gamePlaygroundAnimationFrameIndex({ motion: "WALK", frameCount: 4, tick: 100, motionTicksRemaining: 0 }) === 3, "a cell step reaches the last walk frame");
});

const drawReference: GamePlaygroundDrawReference = {
  assetId: "asset:hero",
  revisionId: "revision:hero",
  contentHash: "hash:hero",
  label: "主人公",
  mode: "LIVE",
  layout: "GRID_32",
  region: { x: 0, y: 0, width: 32, height: 32 },
};

Deno.test("GAME-PLAYGROUND-013 infers Draw layouts without a UI selector", () => {
  assert(inferGamePlaygroundAssetLayout({ animationFrameCount: 4, region: { x: 0, y: 0, width: 16, height: 16 } }) === "FRAME_SEQUENCE", "multiple frames should infer a sequence");
  assert(inferGamePlaygroundAssetLayout({ animationFrameCount: 4, region: { x: 0, y: 0, width: 64, height: 64 } }) === "GRID_FRAME_SEQUENCE", "grid sprites with multiple frames should preserve both dimensions");
  assert(inferGamePlaygroundAssetLayout({ animationFrameCount: 1, region: { x: 0, y: 0, width: 64, height: 32 } }) === "GRID_32", "large regions should infer a grid");
  assert(inferGamePlaygroundAssetLayout({ animationFrameCount: 1, region: null }) === "FULL_CANVAS", "missing regions should infer a canvas");
});

Deno.test("GAME-PLAYGROUND-001 stores Draw references and independent Audio Tick ranges", () => {
  const audio: GamePlaygroundAudioRange = {
    assignmentId: "audio:JUMP:track:sfx:0:480",
    role: "JUMP",
    projectId: "audio-project",
    label: "ジャンプ音 · SE",
    startTick: 0,
    durationTick: 480,
    mode: "PINNED",
    trackId: "track:sfx",
    assetId: "asset:jump",
    revisionId: "revision:jump",
    contentHash: "hash:jump",
  };
  let config: GamePlaygroundConfig = {
    ...createDefaultGamePlaygroundConfig(),
    player: drawReference,
  };
  config = upsertGamePlaygroundAudioRange(config, audio);
  assert(isValidGamePlaygroundConfig(config), "playground config must validate");
  assert(config.player?.layout === "GRID_32", "Draw layout is preserved");
  assert(config.audio[0]?.role === "JUMP", "Audio role is preserved");
  config = removeGamePlaygroundAudioRange(config, audio.assignmentId);
  assert(config.audio.length === 0, "Audio range should be removable");
});

Deno.test("GAME-PLAYGROUND-AUDIO-001 keeps tile footsteps separate from landing", () => {
  const range: GamePlaygroundAudioRange = {
    assignmentId: "audio:TILE_STEP:track:sfx:0:120",
    role: "SE",
    event: "TILE_STEP",
    projectId: "audio-project",
    label: "草地の足音",
    startTick: 0,
    durationTick: 120,
    mode: "LIVE",
    trackId: "track:sfx",
    assetId: "asset:grass-step",
    revisionId: "revision:grass-step",
    contentHash: "hash:grass-step",
    targetPlacementId: "tile:grass",
  };
  const config = upsertGamePlaygroundAudioRange(createDefaultGamePlaygroundConfig(), range);
  const binding = config.audioBindings[0];
  assert(binding?.target.kind === "TILE_STEP", "tile footsteps should use the tile target");
});

Deno.test("GAME-PLAYGROUND-AUDIO-002 preserves motion audio event targets", () => {
  const base = createDefaultGamePlaygroundConfig();
  const makeRange = (event: NonNullable<GamePlaygroundAudioRange["event"]>, id: string): GamePlaygroundAudioRange => ({
    assignmentId: id,
    role: "SE",
    event,
    projectId: "audio-project",
    label: id,
    startTick: 0,
    durationTick: 120,
    mode: "LIVE",
    trackId: "track:sfx",
    assetId: `asset:${id}`,
    revisionId: `revision:${id}`,
    contentHash: `hash:${id}`,
    targetPlacementId: "hero",
  });
  const config = upsertGamePlaygroundAudioRange(
    upsertGamePlaygroundAudioRange(base, makeRange("PLAYER_LAND", "land")),
    makeRange("PLAYER_ATTACK", "attack"),
  );
  const triggers = config.audioBindings.map((item) =>
    item.target.kind === "OBJECT_TRIGGER" ? item.target.trigger : item.target.kind
  );
  assert(triggers.includes("LAND"), "landing should remain a LAND trigger");
  assert(triggers.includes("ATTACK"), "attack should remain an ATTACK trigger");
});

Deno.test("GAME-PLAYGROUND-AUDIO-003 does not recreate cleared canonical bindings from compatibility audio", () => {
  const legacy = {
    schemaVersion: 2,
    mode: "UNIFIED",
    assets: [],
    placements: [],
    audio: [{ assignmentId: "jump", role: "JUMP", projectId: "audio-project", label: "Jump", startTick: 0, durationTick: 120, mode: "LIVE", targetPlacementId: "player" }],
  };
  const migrated = migrateGamePlaygroundConfig(legacy).config;
  const cleared = normalizeGamePlaygroundConfig({ ...migrated, audioBindings: [], audio: [] });
  const reloaded = migrateGamePlaygroundConfig(JSON.parse(JSON.stringify(cleared))).config;
  assert(reloaded.audioBindings.length === 0, "cleared canonical binding must not be resurrected from old audio ranges");
  assert(reloaded.audio.length === 0, "cleared compatibility projection must remain empty");
});

Deno.test("GAME-PLAYGROUND-004 keeps one unified cell-step surface", () => {
  const placement: GamePlaygroundPlacement = {
    id: "prop-1",
    label: "宝箱",
    kind: "SPRITE",
    reference: drawReference,
    layer: "FOREGROUND",
    depth: 12.5,
    x: 3.25,
    y: 4.75,
    scale: 1,
    rotation: 7.5,
    visible: true,
    snapToGrid: false,
  };
  const legacy = normalizeGamePlaygroundConfig({
    mode: "RPG_8",
    placements: [placement],
    audio: [],
  });
  assert(legacy.mode === "UNIFIED", "reopened Playground must use one mode");
  assert(legacy.placements?.[0]?.x === 3.25, "X must remain continuous");
  assert(legacy.placements?.[0]?.snapToGrid === false, "grid snapping is disabled");

  const world = { width: 100, height: 60, solidCells: [] as const };
  let state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 10, y: 10 },
  });
  state = stepGamePlaygroundRuntime(state, { right: true, down: true }, world);
  assert(state.playerPosition.x === 11, "diagonal input advances one X cell");
  assert(state.playerPosition.y === 11, "diagonal input advances one Y cell");
  assert(state.facing === "DOWN_RIGHT", "diagonal input selects the diagonal facing");
  assert(state.motion === "WALK", "a cell step enters WALK motion");
  const attack = stepGamePlaygroundRuntime(state, { attack: true }, world);
  assert(attack.motion === "ATTACK", "attack is a one-shot non-moving motion");
  assert(attack.motionTicksRemaining === 3, "attack keeps a short animation window");
  const attackFrame2 = stepGamePlaygroundRuntime(attack, {}, world);
  assert(attackFrame2.motion === "ATTACK" && attackFrame2.motionTicksRemaining === 2, "attack advances without a new input");
  assert(attack.playerPosition.x === state.playerPosition.x && attack.playerPosition.y === state.playerPosition.y, "attack does not move the player");
  const jump = stepGamePlaygroundRuntime(state, { jump: true }, world);
  assert(jump.motion === "JUMP", "jump input enters JUMP motion");
  assert(jump.playerPosition.x === state.playerPosition.x && jump.playerPosition.y === state.playerPosition.y, "unified jump is an action and must not masquerade as upward movement");
});

Deno.test("GAME-PLAYGROUND-017 completes one walk animation before the next cell", () => {
  const world = { width: 100, height: 100, bounds: "INFINITE" as const, solidCells: [] as const };
  let state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 4, y: 5 },
  });
  state = stepGamePlaygroundRuntime(state, { right: true }, world);
  assert(state.playerPosition.x === 5 && state.motion === "WALK", "first input advances exactly one cell");
  assert(state.motionTicksRemaining === 3, "cell movement starts one complete animation window");
  for (const remaining of [2, 1, 0]) {
    state = stepGamePlaygroundRuntime(state, { right: true }, world);
    assert(state.playerPosition.x === 5, "held direction must not skip cells during the animation");
    assert(state.motion === "WALK" && state.motionTicksRemaining === remaining, "walk animation advances deterministically");
  }
  state = stepGamePlaygroundRuntime(state, { right: true }, world);
  assert(state.playerPosition.x === 6 && state.motionTicksRemaining === 3, "held direction advances the next cell after completion");
});

Deno.test("GAME-PLAYGROUND-018 keeps direction, attack, and jump branches exclusive", () => {
  const world = { width: 32, height: 32, bounds: "INFINITE" as const, solidCells: [] as const };
  const initial = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 8, y: 8 },
  });
  const attack = stepGamePlaygroundRuntime(initial, { left: true, attack: true }, world);
  assert(attack.facing === "LEFT" && attack.motion === "ATTACK", "attack uses the requested direction");
  assert(attack.playerPosition.x === 8 && attack.playerPosition.y === 8, "attack never also moves");
  const heldAttack = stepGamePlaygroundRuntime(attack, { right: true, attack: true }, world);
  assert(heldAttack.motionTicksRemaining === 2 && heldAttack.facing === "LEFT", "held attack continues instead of restarting or turning");

  const jump = stepGamePlaygroundRuntime(initial, { down: true, jump: true }, world);
  assert(jump.facing === "DOWN" && jump.motion === "JUMP", "jump uses the requested direction");
  assert(jump.playerPosition.x === 8 && jump.playerPosition.y === 8, "jump is exclusive from directional movement");
  const heldJump = stepGamePlaygroundRuntime(jump, { jump: true }, world);
  assert(heldJump.motionTicksRemaining === 2, "held jump continues instead of restarting");
});

Deno.test("GAME-PLAYGROUND-005 stores a 256x256 world as sparse 32x32 chunks", () => {
  const map = createDefaultGamePlaygroundWorldMap();
  assert(map.width === 256 && map.height === 256, "default world should be 256x256");
  assert(map.bounds === "INFINITE", "default world should not clamp movement at an edge");
  assert(map.chunkSize === 32, "default world should use 32x32 chunks");
  assert(map.chunks.length === 0, "empty world must not allocate chunks");

  const populated = {
    ...map,
    chunks: [{
      x: 7,
      y: 7,
      cells: [
        { x: 31, y: 31, tileId: "grass", solid: true },
      ],
    }],
  } as const;
  assert(
    gamePlaygroundWorldCellAt(populated, 255, 255)?.tileId === "grass",
    "world coordinates should resolve through the chunk index",
  );
  assert(gamePlaygroundWorldSolidAt(populated, 255, 255), "solid cell should be queryable");
  assert(!gamePlaygroundWorldSolidAt(populated, 224, 224), "air must remain empty");
  assert(
    gamePlaygroundWorldCellsInViewport(populated, { x: 224, y: 224, width: 32, height: 32 }).length === 1,
    "viewport projection should include only visible authored cells",
  );
  assert(
    gamePlaygroundWorldResidentChunkKeys(
      populated,
      { x: 96, y: 96, width: 32, height: 32 },
      1,
    ).length === 9,
    "a viewport should plan its adjacent chunk ring without allocating it",
  );
});

Deno.test("GAME-PLAYGROUND-WORLD-021 paints sparse cells without materializing air", () => {
  const map = createDefaultGamePlaygroundWorldMap();
  const painted = paintGamePlaygroundWorldCell(map, -1, 64, { tileId: "stone", solid: true });
  assert(painted.chunks.length === 1, "one painted cell should allocate one chunk only");
  assert(gamePlaygroundWorldCellAt(painted, -1, 64)?.tileId === "stone", "negative coordinates should resolve");
  const cleared = paintGamePlaygroundWorldCell(painted, -1, 64);
  assert(cleared.chunks.length === 0, "clearing the last cell should release the chunk");
});

Deno.test("GAME-PLAYGROUND-019 builds a keyed runtime view for huge sparse worlds", () => {
  const map = {
    ...createDefaultGamePlaygroundWorldMap(),
    width: 1_048_576,
    height: 1_048_576,
    chunks: [
      { x: 16_000, y: -16_000, cells: [{ x: 31, y: 0, tileId: "edge", solid: true }] },
    ],
  } as const;
  const world = createGamePlaygroundRuntimeWorld(map);
  assert(world.solidCells.length === 0, "runtime must not flatten sparse chunks into a world-sized array");
  assert(world.solidAt?.(512_031, -512_000) === true, "far positive and negative coordinates remain addressable");
  const state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 512_030, y: -512_000 },
  });
  const blocked = stepGamePlaygroundRuntime(state, { right: true }, world);
  assert(blocked.playerPosition.x === 512_030, "runtime collision uses the keyed sparse lookup");
});

Deno.test("GAME-PLAYGROUND-020 caches legacy solid-cell lookup between ticks", () => {
  let mapReads = 0;
  const cells = new Proxy([{ x: 20, y: 20 }], {
    get(target, property, receiver) {
      if (property === "map") mapReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const world = { width: 64, height: 64, bounds: "INFINITE" as const, solidCells: cells };
  let state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 1, y: 1 },
  });
  state = stepGamePlaygroundRuntime(state, { right: true }, world);
  state = stepGamePlaygroundRuntime(state, {}, world);
  state = stepGamePlaygroundRuntime(state, {}, world);
  assert(mapReads === 1, "legacy collision cells are indexed once per immutable array");
  assert(state.playerPosition.x === 2, "cached lookup preserves movement results");
});

Deno.test("GAME-PLAYGROUND-006 moves one cell on a sparse world", () => {
  const map = {
    ...createDefaultGamePlaygroundWorldMap(),
    chunks: [{
      x: 1,
      y: 1,
      cells: [{ x: 3, y: 2, tileId: "wall", solid: true }],
    }],
  } as const;
  const world = {
    width: map.width,
    height: map.height,
    bounds: map.bounds,
    chunkSize: map.chunkSize,
    solidCells: [] as const,
    solidAt: (x: number, y: number) => gamePlaygroundWorldSolidAt(map, x, y),
  };
  let state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 36.25, y: 34.25 },
  });
  state = stepGamePlaygroundRuntime(state, { right: true }, world);
  assert(Number.isInteger(state.playerPosition.x), "movement should land on a cell");
  assert(state.playerPosition.x === 37, "one step should advance one cell");
  assert(state.cameraX > 0, "unified world should follow the player horizontally");
  assert(state.cameraY > 0, "unified world should follow the player vertically");

  const blocked = stepGamePlaygroundRuntime(
    createGamePlaygroundRuntime({
      mode: "UNIFIED",
      world,
      player: { id: "hero", x: 34.9, y: 34.2 },
    }),
    { right: true, down: true },
    world,
  );
  assert(Number.isInteger(blocked.playerPosition.x), "blocked test remains cell aligned");
  assert(Number.isInteger(blocked.playerPosition.y), "blocked step remains cell aligned");
  assert(blocked.playerPosition.y >= 34 && blocked.playerPosition.y <= 35, "step stays within one cell");
});

Deno.test("GAME-PLAYGROUND-014 keeps infinite movement outside the preview extent", () => {
  const map = createDefaultGamePlaygroundWorldMap();
  const world = {
    width: map.width,
    height: map.height,
    bounds: "INFINITE" as const,
    chunkSize: map.chunkSize,
    solidCells: [] as const,
    solidAt: () => false,
  };
  const state = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "player", x: 0, y: 0 },
  });
  const moved = stepGamePlaygroundRuntime(
    { ...state, playerPosition: { x: 256, y: -256 } },
    { left: true, up: true },
    world,
  );
  assert(moved.playerPosition.x === 255 && moved.playerPosition.y === -257, "infinite worlds must not clamp at 0 or 256");
});

Deno.test("GAME-PLAYGROUND-015 resolves sparse cells in negative chunks", () => {
  const map = {
    ...createDefaultGamePlaygroundWorldMap(),
    chunks: [{
      x: -1,
      y: -1,
      cells: [{ x: 31, y: 31, tileId: "snow", solid: true }],
    }],
  } as const;
  const cell = gamePlaygroundWorldCellAt(map, -1, -1);
  assert(cell?.tileId === "snow" && cell.solid === true, "negative chunk coordinates must remain addressable");
});

Deno.test("GAME-PLAYGROUND-002 supports side jump and camera follow", () => {
  const world = {
    width: 20,
    height: 10,
    solidCells: Array.from({ length: 20 }, (_, x) => ({ x, y: 9 })),
  };
  let state = createGamePlaygroundRuntime({
    mode: "SIDE_SCROLL",
    world,
    player: { id: "hero", x: 1, y: 1 },
  });
  for (let index = 0; index < 80; index += 1) {
    state = stepGamePlaygroundRuntime(state, {}, world);
  }
  assert(state.grounded, "side player should land on the floor");
  const beforeJump = state.playerPosition.y;
  state = stepGamePlaygroundRuntime(state, { jump: true, right: true }, world);
  assert(state.playerPosition.y < beforeJump, "side player should jump");
  assert(state.playerPosition.x > 1, "side player should move");
  assert(state.cameraX >= 0, "side camera should be bounded");
});

Deno.test("GAME-PLAYGROUND-003 distinguishes RPG 4-direction and 8-direction input", () => {
  const world = {
    width: 12,
    height: 12,
    solidCells: [] as readonly { x: number; y: number }[],
  };
  const four = createGamePlaygroundRuntime({
    mode: "RPG_4",
    world,
    player: { id: "hero", x: 2, y: 2 },
  });
  const eight = createGamePlaygroundRuntime({
    mode: "RPG_8",
    world,
    player: { id: "hero", x: 2, y: 2 },
  });
  const nextFour = stepGamePlaygroundRuntime(
    four,
    { right: true, down: true },
    world,
  );
  const nextEight = stepGamePlaygroundRuntime(
    eight,
    { right: true, down: true },
    world,
  );
  assert(nextFour.playerPosition.y === 2, "RPG 4-direction should drop diagonal input");
  assert(nextEight.playerPosition.y > 2, "RPG 8-direction should keep diagonal input");
  assert(nextEight.playerPosition.x > 2, "RPG 8-direction should move horizontally");
});

Deno.test("GAME-PLAYGROUND-007 applies simple movement, collision, and gravity switches", () => {
  const world = {
    width: 32,
    height: 32,
    bounds: "INFINITE" as const,
    solidCells: [{ x: 10, y: 10 }],
    solidAt: () => true,
  };
  const immovable = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 10, y: 10, movable: false },
  });
  const immovableNext = stepGamePlaygroundRuntime(
    immovable,
    { right: true },
    world,
  );
  assert(immovableNext.playerPosition.x === 10, "movable off should freeze the player");

  const noCollision = createGamePlaygroundRuntime({
    mode: "UNIFIED",
    world,
    player: { id: "hero", x: 10, y: 10, collision: false },
  });
  const noCollisionNext = stepGamePlaygroundRuntime(
    noCollision,
    { right: true },
    world,
  );
  assert(noCollisionNext.playerPosition.x > 10, "collision off should pass through solid cells");

  const noGravity = createGamePlaygroundRuntime({
    mode: "SIDE_SCROLL",
    world,
    player: { id: "hero", x: 10, y: 10, gravity: false },
  });
  const noGravityNext = stepGamePlaygroundRuntime(noGravity, {}, world);
  assert(noGravityNext.playerPosition.y === 10, "gravity off should keep vertical position");
});

Deno.test("GAME-PLAYGROUND-008 migrates v1 into reusable Assets and canonical Placements", () => {
  const legacy = {
    schemaVersion: 1,
    mode: "RPG_8",
    placements: [
      {
        id: "hero-1",
        label: "主人公",
        kind: "SPRITE",
        reference: drawReference,
        layer: "ACTOR",
        depth: 4,
        x: 12.25,
        y: 7.5,
        scale: 1,
        rotation: 0,
        visible: true,
        snapToGrid: false,
        movable: true,
        collision: true,
        gravity: false,
      },
    ],
    audio: [],
  };
  const result = migrateGamePlaygroundConfig(legacy);
  assert(result.migrated, "v1 must be marked as migrated");
  assert(result.config.schemaVersion === 3, "migration must produce v3");
  assert(result.config.assets.length === 1, "one reusable asset must be created");
  assert(result.config.placements.length === 1, "one placement must be preserved");
  const placement = result.config.placements[0];
  assert(placement?.placementId === "hero-1", "placement id must be preserved");
  assert(placement?.x === 12.25, "placement transform must remain continuous");
  assert(placement?.assetId === result.config.assets[0]?.assetId, "placement must point to its asset");
  const persisted = JSON.stringify(result.config);
  const savedPlacement = (JSON.parse(persisted) as {
    placements?: Array<Record<string, unknown>>;
  }).placements?.[0];
  assert(savedPlacement !== undefined, "placement must be persisted");
  assert(
    (savedPlacement.transform as { x?: number } | undefined)?.x === 12.25,
    "canonical transform.x must be persisted",
  );
  for (const legacyKey of ["x", "y", "scale", "rotation", "reference"]) {
    assert(!(legacyKey in savedPlacement), `legacy alias ${legacyKey} must not be persisted`);
  }
  assert(
    (JSON.parse(persisted) as { assets?: Array<Record<string, unknown>> }).assets?.[0]?.source !== undefined,
    "Asset source reference must be retained",
  );
});

Deno.test("GAME-PLAYGROUND-009 quarantines only broken placements and rejects payloads", () => {
  const result = migrateGamePlaygroundConfig({
    schemaVersion: 1,
    mode: "UNIFIED",
    placements: [
      {
        id: "ok",
        label: "OK",
        kind: "SPRITE",
        reference: drawReference,
        layer: "ACTOR",
        depth: 1,
        x: 1,
        y: 2,
        scale: 1,
        rotation: 0,
        visible: true,
        snapToGrid: false,
      },
      {
        id: "broken",
        label: "壊れた配置",
        kind: "SPRITE",
        reference: { ...drawReference, pixelData: "not allowed" },
        layer: "ACTOR",
        depth: 1,
        x: 3,
        y: 4,
        scale: 1,
        rotation: 0,
        visible: true,
        snapToGrid: false,
      },
    ],
    audio: [],
  });
  assert(result.config.placements.length === 1, "valid placement must survive");
  assert(result.config.placements[0]?.placementId === "ok", "valid placement must be retained");
  assert(result.quarantined.some((entry) => entry.path === "placements[1]"), "only broken placement must be isolated");
  assert(!JSON.stringify(result.config).includes("pixelData"), "payload must not enter the migrated config");
});

Deno.test("GAME-PLAYGROUND-010 allows one Asset to own multiple independent Placements", () => {
  const first = normalizeGamePlaygroundConfig({
    schemaVersion: 1,
    mode: "UNIFIED",
    placements: [{
      id: "one",
      label: "主人公",
      kind: "SPRITE",
      reference: drawReference,
      layer: "ACTOR",
      depth: 1,
      x: 2,
      y: 3,
      scale: 1,
      rotation: 0,
      visible: true,
      snapToGrid: false,
    }],
    audio: [],
  } as unknown as Partial<GamePlaygroundConfig>);
  const firstPlacement = first.placements[0];
  if (firstPlacement === undefined) throw new Error("expected migrated placement");
  const second = {
    ...first,
    placements: [firstPlacement, {
      ...firstPlacement,
      placementId: "two",
      transform: { x: 20, y: 30, scale: 2, rotation: 10 },
    }],
  };
  const normalized = normalizeGamePlaygroundConfig(second);
  assert(normalized.assets.length === 1, "placements must reuse one Asset");
  assert(normalized.placements.length === 2, "both placements must remain");
  assert(normalized.placements[0]?.assetId === normalized.placements[1]?.assetId, "Asset reference must be shared");
  assert(normalized.placements[0]?.x !== normalized.placements[1]?.x, "transforms must be independent");
});

Deno.test("GAME-PLAYGROUND-011 keeps two placements in the Scene SVG while selection moves", async () => {
  const workspace = await Deno.readTextFile(
    new URL("../../src/wp180-workspace-ui.ts", import.meta.url),
  );
  assert(
    workspace.includes('group.setAttribute("class", "draw2-game-scene-object draw2-game-scene-free-object")'),
    "Scene must render placements as free objects",
  );
  assert(
    workspace.includes('group.setAttribute("data-game-scene-track-id", track.id)'),
    "Scene objects must expose their placement identity",
  );
  assert(
    workspace.includes("if (!isInCamera(point)) continue;") &&
      !workspace.includes("if (!isInCamera(point) && track.id !== selectedGameTrackId) continue;"),
    "Scene must cull off-viewport placements regardless of selection",
  );
  assert(
    workspace.includes('asset.assetId + ":placement:" + index'),
    "repeated placement must use deterministic placement:1/placement:2 identities",
  );
  assert(
    workspace.includes('group.classList.add("is-selected")'),
    "selection must move the class without removing the other placement",
  );
});

Deno.test("GAME-PLAYGROUND-012 preserves per-frame layer visibility overrides", () => {
  const reference: GamePlaygroundDrawReference = {
    ...drawReference,
    sourceFrames: [
      { sourceFrameId: "frame:idle", layerIds: ["body", "weapon"], rect: { x: 0, y: 0, width: 32, height: 32 } },
      { sourceFrameId: "frame:attack", layerIds: ["body", "weapon", "effect"], rect: { x: 32, y: 0, width: 32, height: 32 } },
    ],
    hiddenLayerIdsByFrame: { "frame:attack": ["effect"] },
  };
  const config = { ...createDefaultGamePlaygroundConfig(), player: reference };
  assert(isValidGamePlaygroundConfig(config), "layer-aware reference must validate");
  const cloned = cloneGamePlaygroundConfig(config);
  assert(cloned.player?.sourceFrames?.[1]?.layerIds?.includes("effect") === true, "frame layers must survive clone");
  assert(cloned.player?.hiddenLayerIdsByFrame?.["frame:attack"]?.[0] === "effect", "frame visibility must survive clone");
});

Deno.test("GAME-PLAYGROUND-013 persists reusable UI nodes", () => {
  const config = { ...createDefaultGamePlaygroundConfig(), uiNodes: [{ ...createGameUiNode("ui:map", "MINIMAP"), panelTabs: ["基本", "詳細"] }] };
  assert(isValidGamePlaygroundConfig(config), "UI node configuration must validate");
  const cloned = cloneGamePlaygroundConfig(config);
  assert(cloned.uiNodes?.[0]?.action === "OPEN_MINIMAP" && cloned.uiNodes[0].panelTabs.join(",") === "基本,詳細", "UI node action and tabs must survive clone");
});

Deno.test("GAME-PLAYGROUND-014 persists configurable game element effects", () => {
  const config = { ...createDefaultGamePlaygroundConfig(), gameElements: [{ id: "potion", kind: "ITEM" as const, label: "Potion", value: 3, effect: "HP：+20", effectTargetId: "status:hp" }, { id: "status:hp", kind: "STATUS" as const, label: "HP", value: 100 }] };
  assert(isValidGamePlaygroundConfig(config), "game element effect must validate");
  const cloned = cloneGamePlaygroundConfig(config);
  assert(cloned.gameElements?.[0]?.effect === "HP：+20" && cloned.gameElements[0].effectTargetId === "status:hp", "effect and target must survive clone");
});
