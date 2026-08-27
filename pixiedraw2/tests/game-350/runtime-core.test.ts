import {
  createGameRuntimeState,
  GAME_RUNTIME_PROFILE_IDS,
  GAME_RUNTIME_PROFILES,
  type GameRuntimeModule,
  playGameRuntimeState,
  restartGameRuntimeState,
  stepGameRuntimeState,
  stopGameRuntimeState,
  validateGameRuntimeProfile,
} from "../../src/game/game-350/runtime-core.ts";
import { createGame351RpgTemplate } from "../../src/game/game-350/playable-slice.ts";
import {
  createGameProject,
  createJournal,
} from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-RUNTIME-001 exposes genre profiles without claiming unimplemented gameplay", () => {
  const profiles = GAME_RUNTIME_PROFILES.profiles;
  assert(
    profiles.some((profile) =>
      profile.profileId === GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG &&
      profile.status === "AVAILABLE"
    ),
    "RPG must be the first available runtime profile",
  );
  assert(
    profiles.some((profile) =>
      profile.profileId === GAME_RUNTIME_PROFILE_IDS.OPEN_WORLD_3D &&
      profile.status === "PLANNED" &&
      profile.capabilities.includes("WORLD_STREAMING") &&
      profile.capabilities.includes("NETWORK_REPLICATION")
    ),
    "open-world profile must declare its future streaming/network boundary",
  );
  assert(
    profiles.some((profile) =>
      profile.profileId === GAME_RUNTIME_PROFILE_IDS.RHYTHM &&
      profile.executionModel === "AUDIO_CLOCK"
    ),
    "rhythm profile must use an audio-clock execution model",
  );
  const invalid = validateGameRuntimeProfile({
    schemaVersion: 1,
    profileId: "invalid-profile",
    genre: "CUSTOM",
    label: "Invalid",
    dimension: "2D",
    executionModel: "CUSTOM",
    status: "FOUNDATION",
    capabilities: ["SCENE", "SCENE"],
  });
  assert(!invalid.valid, "duplicate capabilities must be rejected");
});

Deno.test("GAME350-RUNTIME-002 uses an immutable fixed-step module boundary", async () => {
  const template = await createGame351RpgTemplate();
  type Action = "ADVANCE";
  type Snapshot = { readonly start: number };
  type Runtime = {
    readonly mode: "STOPPED" | "PLAYING";
    readonly tick: number;
    readonly value: number;
  };
  const module: GameRuntimeModule<Snapshot, Action, Runtime> = {
    profile: {
      schemaVersion: 1,
      profileId: "test-fixed-step",
      genre: "CUSTOM",
      label: "Test fixed step",
      dimension: "2D",
      executionModel: "FIXED_STEP",
      status: "FOUNDATION",
      capabilities: ["SCENE", "INPUT_ACTIONS"],
    },
    fixedStepTicks: 2,
    createInitialRuntime(snapshot) {
      return { mode: "STOPPED", tick: 0, value: snapshot.start };
    },
    isValidAction(action) {
      return action === null || action === "ADVANCE";
    },
    step(_snapshot, runtime, action) {
      return {
        ...runtime,
        value: runtime.value + (action === "ADVANCE" ? 1 : 0),
      };
    },
    cloneRuntime(runtime) {
      return { ...runtime };
    },
  };
  const initial = createGameRuntimeState({
    journal: createJournal(template.project, template.caller),
    snapshot: { start: 10 },
    module,
  });
  const playing = playGameRuntimeState(initial);
  const stepped = stepGameRuntimeState(
    playing,
    { sequence: 1, action: "ADVANCE" },
    module,
  );
  assert(
    stepped.runtime.tick === 2 && stepped.runtime.value === 11 &&
      stepped.runtime.mode === "PLAYING",
    "module step must advance by its declared fixed-step size",
  );
  const stale = stepGameRuntimeState(
    stepped,
    { sequence: 1, action: "ADVANCE" },
    module,
  );
  assert(
    stale.runtime.tick === stepped.runtime.tick &&
      stale.runtime.value === stepped.runtime.value &&
      stale.input.lastSequence === stepped.input.lastSequence,
    "duplicate input sequence must be rejected without advancing runtime",
  );
  const stopped = stopGameRuntimeState(stepped, module);
  assert(
    stopped.runtime.mode === "STOPPED" && stopped.input.lastSequence === 0,
    "Stop must reset runtime input sequencing",
  );
  const restarted = restartGameRuntimeState(stepped, module);
  assert(
    restarted.runtime.mode === "PLAYING" && restarted.runtime.tick === 0 &&
      restarted.runtime.value === 10,
    "Restart must reset module state while preserving active mode",
  );
  assert(
    restarted.journal === initial.journal &&
      restarted.snapshot === initial.snapshot,
    "runtime transitions must retain canonical journal and snapshot references",
  );
});

Deno.test("GAME350-RUNTIME-003 rejects duplicate custom profiles", () => {
  const profile = {
    schemaVersion: 1 as const,
    profileId: "custom-simulation",
    genre: "CUSTOM" as const,
    label: "Custom simulation",
    dimension: "3D" as const,
    executionModel: "CUSTOM" as const,
    status: "FOUNDATION" as const,
    capabilities: ["SCENE", "ENTITY_COMPONENT"] as const,
  };
  const extended = GAME_RUNTIME_PROFILES.register(profile);
  assert(
    extended.resolve(profile.profileId)?.label === profile.label,
    "custom profile must be discoverable after registration",
  );
  let rejected = false;
  try {
    extended.register(profile);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message.includes("DUPLICATE_PROFILE");
  }
  assert(rejected, "duplicate profile registration must fail closed");
});

Deno.test("GAME350-RUNTIME-004 binds the selected profile into the canonical Project hash", async () => {
  const template = await createGame351RpgTemplate();
  const { snapshotHash: _snapshotHash, ...revision } =
    template.project.revision;
  const changed = await createGameProject({
    ...template.project,
    runtimeProfile: {
      schemaVersion: 1,
      profileId: "custom-simulation",
    },
    revision,
  }, template.caller);
  assert(
    changed.revision.snapshotHash !== template.project.revision.snapshotHash,
    "runtime profile changes must produce a new canonical Project hash",
  );
});
