import { addGamePlaygroundDpcmSample, createDefaultGamePlaygroundConfig, isValidGamePlaygroundConfig, migrateGamePlaygroundConfig, removeGamePlaygroundDpcmSample } from "../../src/game/game-350/playground.ts";
import { attachDpcmReferenceToGameAudioAsset, audioAssetSourceEquals, clearGameAudioTarget, commitGameAudioTransaction, gameAudioAssetIdForSource, gameAudioAssetWithDpcmFromCaptureDraft, gameAudioRelativeStartSeconds, gameAudioTargetEquals, gameAudioTargetForMotion, type GameAudioAsset } from "../../src/game/game-350/game-audio.ts";
import { GameAudioRuntime } from "../../src/game/game-350/game-audio-runtime.ts";

const source = { projectId: "audio:p", projectRevision: 3, projectStateHash: "hash:3", trackIds: ["track:sfx"], startTick: 120, durationTick: 480, renderMode: "POST_MIX" as const, mode: "PINNED" as const };
const asset: GameAudioAsset = { audioAssetId: gameAudioAssetIdForSource(source), name: "Jump", kind: "SE", source, defaults: { gainMilliDb: 0, loop: false, retrigger: "OVERLAP" } };
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("GAME350-AUDIO-MOTION-001 maps runtime motions to canonical triggers", () => {
  const jump = gameAudioTargetForMotion({ placementId: "hero", motion: "JUMP" });
  const land = gameAudioTargetForMotion({ placementId: "hero", motion: "LAND" });
  const attack = gameAudioTargetForMotion({ placementId: "hero", motion: "ATTACK" });
  assertEquals(jump?.kind === "OBJECT_TRIGGER" ? jump.trigger : undefined, "JUMP");
  assertEquals(land?.kind === "OBJECT_TRIGGER" ? land.trigger : undefined, "LAND");
  assertEquals(attack?.kind === "OBJECT_TRIGGER" ? attack.trigger : undefined, "ATTACK");
  assertEquals(gameAudioTargetForMotion({ placementId: "hero", motion: "IDLE" }), undefined);
});

Deno.test("GAME-AUDIO-DPCM-001 attaches only reference metadata immutably", () => {
  const reference = { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false } as const;
  const attached = attachDpcmReferenceToGameAudioAsset(asset, reference);
  if (attached?.dpcm?.sampleId !== "jump" || asset.dpcm !== undefined) throw new Error("DPCM reference attachment mutated or lost metadata.");
  if (attachDpcmReferenceToGameAudioAsset(asset, { ...reference, frameCount: 9_999 })) throw new Error("Invalid DPCM reference was attached.");
});

Deno.test("GAME-AUDIO-DPCM-002 builds an event-ready asset from an iAUDIO range", () => {
  const draft = {
    projectId: "audio:p", projectRevision: 3, projectStateHash: "hash:3", trackIds: ["track:sfx"],
    startTick: 120, durationTick: 480, mode: "PINNED", snap: "BEAT", kind: "SE", label: "Jump",
  } as const;
  const built = gameAudioAssetWithDpcmFromCaptureDraft(draft, { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false });
  if (built?.source.startTick !== 120 || built?.dpcm?.frameCount !== 128 || built?.kind !== "SE") throw new Error("DPCM game asset was not built from the selected range.");
});

Deno.test("GAME350-AUDIO-RANGE-001 starts selected audio ranges relative to their clip", () => {
  assertEquals(gameAudioRelativeStartSeconds({ rangeStartTick: 600, clipStartTick: 120, ticksPerQuarter: 480, bpm: 120 }), 0.5);
  assertEquals(gameAudioRelativeStartSeconds({ rangeStartTick: 0, clipStartTick: 120, ticksPerQuarter: 480, bpm: 120 }), 0);
});

Deno.test("GAME-AUDIO-V3 migrates legacy ranges idempotently", () => {
  const legacy = { schemaVersion: 2, mode: "UNIFIED", assets: [], placements: [], audio: [{ assignmentId: "a1", role: "JUMP", projectId: "audio:p", label: "Jump", startTick: 0, durationTick: 120, mode: "LIVE", trackId: "sfx" }] };
  const first = migrateGamePlaygroundConfig(legacy).config;
  const second = migrateGamePlaygroundConfig(first).config;
  assertEquals(first.schemaVersion, 3);
  assertEquals(first.audioAssets.length, 1);
  assertEquals(second.audioAssets.length, 1);
  assertEquals(second.audioBindings.length, 1);
});

Deno.test("GAME-AUDIO-V3 transaction keeps save count and CAS semantics", () => {
  const config = createDefaultGamePlaygroundConfig();
  const target = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const input = { config, asset, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "commit:1" };
  const created = commitGameAudioTransaction(input);
  assertEquals(created.result, "CREATED");
  assertEquals(created.saveCount, 1);
  const reused = commitGameAudioTransaction({ ...input, config: created.config, commitId: "commit:2" });
  assertEquals(reused.result, "UNCHANGED");
  assertEquals(reused.saveCount, 0);
  const changed = commitGameAudioTransaction({ ...input, config: created.config, currentProjectRevision: 4, currentProjectStateHash: "hash:4", commitId: "commit:3" });
  assertEquals(changed.result, "SOURCE_CHANGED");
  assertEquals(changed.saveCount, 0);
});

Deno.test("GAME-AUDIO-V3 transaction keeps canonical audio collections enumerable after spread", () => {
  const config = createDefaultGamePlaygroundConfig();
  Object.defineProperties(config, {
    audioAssets: { configurable: true, enumerable: false, value: [asset] },
    audioBindings: { configurable: true, enumerable: false, value: [{ bindingId: "binding:existing", audioAssetId: asset.audioAssetId, target: { kind: "OBJECT_TRIGGER", placementId: "player", trigger: "JUMP" }, priority: 0 }] },
  });
  const result = commitGameAudioTransaction({ config, asset, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "commit:spread" });
  const copied = { ...result.config };
  assertEquals(copied.audioAssets?.length, 1);
  assertEquals(copied.audioBindings?.length, 1);
});

Deno.test("GAME-AUDIO-V3 canonicalizes source property order and track-id set for equality and IDs", () => {
  const reordered = {
    mode: "PINNED" as const,
    renderMode: "POST_MIX" as const,
    durationTick: 480,
    startTick: 120,
    trackIds: ["track:other", "track:sfx", "track:other"],
    projectStateHash: "hash:3",
    projectRevision: 3,
    projectId: "audio:p",
  };
  const canonical = { ...source, trackIds: ["track:sfx", "track:other"] };
  if (!audioAssetSourceEquals(reordered, canonical)) throw new Error("source set equality depended on property or track order");
  if (gameAudioAssetIdForSource(reordered) !== gameAudioAssetIdForSource(canonical)) throw new Error("source ID depended on property or track order");
  if (reordered.trackIds.join(",") !== "track:other,track:sfx,track:other") throw new Error("source track IDs were mutated");
});

Deno.test("GAME-AUDIO-V3 same-ID metadata updates persist and identical retries remain unchanged", () => {
  const target = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const created = commitGameAudioTransaction({ config: createDefaultGamePlaygroundConfig(), asset, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "metadata:create" });
  const edited = { ...asset, name: "Jump edited", defaults: { gainMilliDb: -60, loop: true, retrigger: "IGNORE" as const } };
  const updated = commitGameAudioTransaction({ config: created.config, asset: edited, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "metadata:update" });
  assertEquals(updated.result, "UPDATED");
  assertEquals(updated.saveCount, 1);
  assertEquals(updated.config.audioAssets[0]?.name, "Jump edited");
  assertEquals(updated.config.audioAssets[0]?.defaults, edited.defaults);
  const retry = commitGameAudioTransaction({ config: updated.config, asset: edited, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "metadata:retry" });
  assertEquals(retry.result, "UNCHANGED");
  assertEquals(retry.saveCount, 0);
});

Deno.test("GAME-AUDIO-V3 replaces one target slot atomically and preserves the other slots after reload", () => {
  const targetA = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const targetAReordered = { trigger: "JUMP" as const, placementId: "player", kind: "OBJECT_TRIGGER" as const };
  const targetB = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "LAND" as const };
  const assetB = { ...asset, source: { ...source, startTick: 240 }, audioAssetId: gameAudioAssetIdForSource({ ...source, startTick: 240 }), name: "Land" };
  const first = commitGameAudioTransaction({ config: createDefaultGamePlaygroundConfig(), asset, target: targetA, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "slot:a" });
  const second = commitGameAudioTransaction({ config: first.config, asset, target: targetB, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "slot:b" });
  const replaced = commitGameAudioTransaction({ config: second.config, asset: assetB, target: targetAReordered, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "slot:replace" });
  assertEquals(replaced.config.audioBindings.length, 2);
  assertEquals(replaced.config.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, targetA))?.bindingId, first.config.audioBindings[0]?.bindingId);
  if (replaced.config.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, targetA))?.audioAssetId !== assetB.audioAssetId) throw new Error("target A was not replaced");
  if (replaced.config.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, targetB))?.audioAssetId !== asset.audioAssetId) throw new Error("target B was corrupted");
  const reloaded = normalizeForTest(replaced.config);
  assertEquals(reloaded.audioBindings.length, 2);
  if (reloaded.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, targetA))?.audioAssetId !== assetB.audioAssetId) throw new Error("reloaded target A was not preserved");
});

Deno.test("GAME-AUDIO-V3 clear removes a target and compatibility range without removing the asset library", () => {
  const target = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const other = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "LAND" as const };
  const withRange = migrateGamePlaygroundConfig({
    ...createDefaultGamePlaygroundConfig(),
    audio: [{ assignmentId: "jump", role: "JUMP", projectId: "audio:p", label: "Jump", startTick: 0, durationTick: 120, mode: "LIVE", targetPlacementId: "player" }],
  }).config;
  const first = commitGameAudioTransaction({ config: withRange, asset, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "clear:a" });
  const second = commitGameAudioTransaction({ config: first.config, asset, target: other, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "clear:b" });
  const cleared = clearGameAudioTarget(second.config, target);
  if (cleared.audioBindings.some((binding) => gameAudioTargetEquals(binding.target, target))) throw new Error("cleared target remained bound");
  if (cleared.audio.length !== 0) throw new Error("legacy compatibility range remained after clear");
  if (!cleared.audioAssets.some((candidate) => candidate.audioAssetId === asset.audioAssetId)) throw new Error("clear removed the reusable asset library");
  const reloaded = normalizeForTest(cleared);
  if (reloaded.audioBindings.some((binding) => gameAudioTargetEquals(binding.target, target))) throw new Error("cleared target was resurrected after reload");
  if (reloaded.audioBindings.length !== 1 || !gameAudioTargetEquals(reloaded.audioBindings[0]!.target, other)) throw new Error("other target was not preserved after reload");
});

Deno.test("GAME-AUDIO-V3 keeps same-source BGM and SE asset bindings independent", () => {
  const bgm = { ...asset, audioAssetId: gameAudioAssetIdForSource(source), kind: "BGM" as const, defaults: { gainMilliDb: 0, loop: true, retrigger: "RESTART" as const } };
  const bgmTarget = { kind: "SCENE_BGM" as const, sceneId: "scene:main" };
  const seTarget = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const first = commitGameAudioTransaction({ config: createDefaultGamePlaygroundConfig(), asset: bgm, target: bgmTarget, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "kind:bgm" });
  const second = commitGameAudioTransaction({ config: first.config, asset, target: seTarget, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "kind:se" });
  if (second.config.audioAssets.length !== 2) throw new Error("same-source BGM and SE were merged");
  if (second.config.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, bgmTarget))?.audioAssetId !== bgm.audioAssetId) throw new Error("BGM binding was corrupted by SE commit");
  if (second.config.audioBindings.find((binding) => gameAudioTargetEquals(binding.target, seTarget))?.audioAssetId === bgm.audioAssetId) throw new Error("SE binding reused the BGM asset id");
});

Deno.test("GAME-AUDIO-DPCM-007 removes omitted DPCM on update and preserves the library and other slots after reload", () => {
  const sample = { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false } as const;
  const jump = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const land = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "LAND" as const };
  const dpcmAsset = { ...asset, dpcm: sample } as const;
  const base = addGamePlaygroundDpcmSample(createDefaultGamePlaygroundConfig(), sample);
  const first = commitGameAudioTransaction({ config: base, asset: dpcmAsset, target: jump, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:with" });
  const firstReload = normalizeForTest(first.config);
  if (firstReload.audioAssets.find((candidate) => candidate.audioAssetId === asset.audioAssetId)?.dpcm?.frameCount !== 128) throw new Error("nested DPCM value was lost through JSON reload");
  if (firstReload.audioAssets.find((candidate) => candidate.audioAssetId === asset.audioAssetId)?.source.trackIds[0] !== "track:sfx") throw new Error("source metadata was not cloned accurately");
  const second = commitGameAudioTransaction({ config: first.config, asset, target: land, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:other" });
  const removed = commitGameAudioTransaction({ config: second.config, asset, target: jump, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:remove" });
  const reloaded = normalizeForTest(removed.config);
  if (reloaded.audioAssets.find((candidate) => candidate.audioAssetId === asset.audioAssetId)?.dpcm !== undefined) throw new Error("omitted DPCM resurrected on asset update");
  if (reloaded.dpcmSamples?.[0]?.frameCount !== 128) throw new Error("DPCM library value was lost");
  if (!reloaded.audioBindings.some((binding) => gameAudioTargetEquals(binding.target, land))) throw new Error("other target slot was lost");
});

Deno.test("GAME-AUDIO-V3 rejects malformed metadata before CAS evaluation", () => {
  const rejected = commitGameAudioTransaction({ config: createDefaultGamePlaygroundConfig(), asset: { ...asset, source: { ...source, audiodata: "payload" } } as unknown as GameAudioAsset, target: { kind: "OBJECT_TRIGGER", placementId: "player", trigger: "JUMP" }, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 4, currentProjectStateHash: "hash:4", commitId: "invalid" });
  assertEquals(rejected.result, "REJECTED");
  assertEquals(rejected.saveCount, 0);
});

function normalizeForTest(config: ReturnType<typeof createDefaultGamePlaygroundConfig>) {
  return migrateGamePlaygroundConfig(JSON.parse(JSON.stringify(config))).config;
}

Deno.test("GAME-AUDIO-DPCM-003 preserves DPCM references through the save transaction", () => {
  const dpcmAsset = {
    ...asset,
    dpcm: { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false },
  } as const;
  const result = commitGameAudioTransaction({
    config: createDefaultGamePlaygroundConfig(), asset: dpcmAsset,
    target: { kind: "OBJECT_TRIGGER", placementId: "player", trigger: "JUMP" },
    expectedProjectRevision: 3, expectedProjectStateHash: "hash:3",
    currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:save",
  });
  const saved = result.config.audioAssets.find((candidate) => candidate.audioAssetId === dpcmAsset.audioAssetId);
  if (saved?.dpcm?.sampleId !== "jump" || saved.dpcm.frameCount !== 128) throw new Error("DPCM reference was lost during save.");
});

Deno.test("GAME-AUDIO-DPCM-006 updates an existing asset when only its DPCM reference changes", () => {
  const config = createDefaultGamePlaygroundConfig();
  const target = { kind: "OBJECT_TRIGGER" as const, placementId: "player", trigger: "JUMP" as const };
  const first = commitGameAudioTransaction({ config, asset, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:base" });
  const nextAsset = { ...asset, dpcm: { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false } } as const;
  const second = commitGameAudioTransaction({ config: first.config, asset: nextAsset, target, expectedProjectRevision: 3, expectedProjectStateHash: "hash:3", currentProjectRevision: 3, currentProjectStateHash: "hash:3", commitId: "dpcm:attach" });
  if (second.result !== "UPDATED" || second.config.audioAssets.find((candidate) => candidate.audioAssetId === asset.audioAssetId)?.dpcm?.sampleId !== "jump") throw new Error("DPCM-only asset update was treated as a duplicate.");
});

Deno.test("GAME-AUDIO-DPCM-004 rejects malformed DPCM references at config validation", () => {
  const config = createDefaultGamePlaygroundConfig();
  const validReference = { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false };
  if (!isValidGamePlaygroundConfig({ ...config, dpcmSamples: [validReference] })) throw new Error("Valid DPCM library was rejected.");
  const invalid = { ...asset, dpcm: { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 9_999, rateHz: 16_000, loop: false } };
  if (isValidGamePlaygroundConfig({ ...config, audioAssets: [invalid] })) throw new Error("Malformed DPCM reference passed Game config validation.");
  if (isValidGamePlaygroundConfig({ ...config, dpcmSamples: [{ ...validReference, packedBits: [1, 2, 3] }] })) throw new Error("DPCM payload data passed Game config validation.");
  if (isValidGamePlaygroundConfig({ ...config, dpcmSamples: [validReference, validReference] })) throw new Error("Duplicate DPCM library entries were accepted.");
});

Deno.test("GAME-AUDIO-DPCM-005 updates the shared library immutably", () => {
  const sample = { sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false } as const;
  const first = createDefaultGamePlaygroundConfig();
  const second = addGamePlaygroundDpcmSample(first, sample);
  const third = addGamePlaygroundDpcmSample({ ...second, audioAssets: [{ ...asset, dpcm: sample }] }, { ...sample, frameCount: 256 });
  const fourth = removeGamePlaygroundDpcmSample(third, "jump");
  if (first.dpcmSamples !== undefined || second.dpcmSamples?.length !== 1 || third.dpcmSamples?.[0]?.frameCount !== 256 || fourth.dpcmSamples?.length !== 0 || fourth.audioAssets[0]?.dpcm !== undefined) throw new Error("DPCM library update contract failed.");
});

Deno.test("GAME-AUDIO-RUNTIME enforces BGM/voice/cache budgets and release", () => {
  const runtime = new GameAudioRuntime();
  runtime.startBgm("bgm");
  for (let index = 0; index < 30; index += 1) runtime.playVoice(`voice:${index}`, "SE", index);
  const snapshot = runtime.snapshot();
  assertEquals(snapshot.bgm?.fadeInMs, 200);
  assertEquals(snapshot.voices.length, 24);
  runtime.cacheAsset("large", 70 * 1024 * 1024);
  assertEquals(runtime.snapshot().cacheEntries, 0);
  runtime.stopAll();
  assertEquals(runtime.snapshot().released, true);
  assertEquals(runtime.snapshot().voices.length, 0);
});
