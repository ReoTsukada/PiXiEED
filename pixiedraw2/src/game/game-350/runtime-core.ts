/**
 * GAME-350 genre-neutral runtime boundary.
 *
 * A genre module owns its simulation semantics. This module owns the shared
 * lifecycle contract: fixed-step sequencing, immutable runtime transitions,
 * profile discovery, and the separation between the canonical Journal and
 * the runtime state. It has no DOM, network, storage, renderer, or host
 * dependency.
 */

import type { GameProject, JournalState } from "../game-300/core.ts";

export const GAME_RUNTIME_CORE_SCHEMA_VERSION = 1 as const;
export const GAME_RUNTIME_PROFILE_SCHEMA_VERSION = 1 as const;

export const GAME_RUNTIME_PROFILE_IDS = Object.freeze(
  {
    TOP_DOWN_RPG: "top-down-rpg",
    ACTION_2D: "action-2d",
    SHOOTER_2D: "shooter-2d",
    RACING_2D: "racing-2d",
    RHYTHM: "rhythm",
    ACTION_3D: "action-3d",
    OPEN_WORLD_3D: "open-world-3d",
    INTERACTIVE_3D: "interactive-3d",
  } as const,
);

export type GameRuntimeProfileId = string;
export type GameRuntimeGenre =
  | "TOP_DOWN_RPG"
  | "ACTION_2D"
  | "SHOOTER_2D"
  | "RACING_2D"
  | "RHYTHM"
  | "ACTION_3D"
  | "OPEN_WORLD_3D"
  | "INTERACTIVE_3D"
  | "CUSTOM";
export type GameRuntimeProfileStatus =
  | "AVAILABLE"
  | "FOUNDATION"
  | "PLANNED";
export type GameRuntimeDimension = "2D" | "3D";
export type GameRuntimeExecutionModel =
  | "FIXED_STEP"
  | "CONTINUOUS_PHYSICS"
  | "AUDIO_CLOCK"
  | "NETWORK_AUTHORITATIVE"
  | "CUSTOM";
export type GameRuntimeCapability =
  | "SCENE"
  | "ENTITY_COMPONENT"
  | "INPUT_ACTIONS"
  | "CAMERA"
  | "COLLISION_2D"
  | "PHYSICS_2D"
  | "PHYSICS_3D"
  | "AUDIO_TIMELINE"
  | "VEHICLE_PHYSICS"
  | "WORLD_STREAMING"
  | "NETWORK_REPLICATION"
  | "SAVE_STATE"
  | "SCRIPT_EXTENSION"
  | "UI_OVERLAY";

export interface GameRuntimeProfile {
  readonly schemaVersion: typeof GAME_RUNTIME_PROFILE_SCHEMA_VERSION;
  readonly profileId: GameRuntimeProfileId;
  readonly genre: GameRuntimeGenre;
  readonly label: string;
  readonly dimension: GameRuntimeDimension;
  readonly executionModel: GameRuntimeExecutionModel;
  readonly status: GameRuntimeProfileStatus;
  readonly capabilities: readonly GameRuntimeCapability[];
}

export interface GameRuntimeProfileDiagnostic {
  readonly code: "INVALID_PROFILE" | "DUPLICATE_PROFILE";
  readonly path: string;
  readonly message: string;
}

export interface GameRuntimeProfileValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly GameRuntimeProfileDiagnostic[];
}

export interface GameRuntimeProfileRegistry {
  readonly profiles: readonly GameRuntimeProfile[];
  resolve(profileId: string): GameRuntimeProfile | undefined;
  register(profile: GameRuntimeProfile): GameRuntimeProfileRegistry;
}

const BUILT_IN_PROFILES: readonly GameRuntimeProfile[] = Object.freeze([
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG,
    genre: "TOP_DOWN_RPG",
    label: "Top-down RPG",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "AVAILABLE",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "COLLISION_2D",
      "SAVE_STATE",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_2D,
    genre: "ACTION_2D",
    label: "2D Action",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "FOUNDATION",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.SHOOTER_2D,
    genre: "SHOOTER_2D",
    label: "2D Shooter",
    dimension: "2D",
    executionModel: "FIXED_STEP",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "SAVE_STATE",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.RACING_2D,
    genre: "RACING_2D",
    label: "2D Racing",
    dimension: "2D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_2D",
      "VEHICLE_PHYSICS",
      "SAVE_STATE",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.RHYTHM,
    genre: "RHYTHM",
    label: "Rhythm",
    dimension: "2D",
    executionModel: "AUDIO_CLOCK",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "AUDIO_TIMELINE",
      "SAVE_STATE",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.ACTION_3D,
    genre: "ACTION_3D",
    label: "3D Action",
    dimension: "3D",
    executionModel: "CONTINUOUS_PHYSICS",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.OPEN_WORLD_3D,
    genre: "OPEN_WORLD_3D",
    label: "Open World 3D",
    dimension: "3D",
    executionModel: "NETWORK_AUTHORITATIVE",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "PHYSICS_3D",
      "WORLD_STREAMING",
      "NETWORK_REPLICATION",
      "SAVE_STATE",
      "SCRIPT_EXTENSION",
      "UI_OVERLAY",
    ],
  },
  {
    schemaVersion: GAME_RUNTIME_PROFILE_SCHEMA_VERSION,
    profileId: GAME_RUNTIME_PROFILE_IDS.INTERACTIVE_3D,
    genre: "INTERACTIVE_3D",
    label: "Interactive 3D",
    dimension: "3D",
    executionModel: "CUSTOM",
    status: "PLANNED",
    capabilities: [
      "SCENE",
      "ENTITY_COMPONENT",
      "INPUT_ACTIONS",
      "CAMERA",
      "AUDIO_TIMELINE",
      "UI_OVERLAY",
      "SCRIPT_EXTENSION",
    ],
  },
]);

function stable(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function diagnostic(
  code: GameRuntimeProfileDiagnostic["code"],
  path: string,
  message: string,
): GameRuntimeProfileDiagnostic {
  return { code, path, message };
}

export function validateGameRuntimeProfile(
  profile: GameRuntimeProfile,
): GameRuntimeProfileValidation {
  const diagnostics: GameRuntimeProfileDiagnostic[] = [];
  if (profile.schemaVersion !== GAME_RUNTIME_PROFILE_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "schemaVersion",
        "Runtime profile schema is unsupported.",
      ),
    );
  }
  if (!stable(profile.profileId)) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "profileId",
        "Runtime profile id is not stable.",
      ),
    );
  }
  if (!profile.label.trim()) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "label",
        "Runtime profile label is required.",
      ),
    );
  }
  if (profile.genre === "CUSTOM" && profile.profileId.length === 0) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "profileId",
        "Custom runtime profile id is required.",
      ),
    );
  }
  if (profile.dimension !== "2D" && profile.dimension !== "3D") {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "dimension",
        "Runtime profile dimension is unsupported.",
      ),
    );
  }
  if (
    !Array.isArray(profile.capabilities) || profile.capabilities.length === 0
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "capabilities",
        "Runtime profile must declare capabilities.",
      ),
    );
  } else if (
    new Set(profile.capabilities).size !== profile.capabilities.length
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "capabilities",
        "Runtime profile capabilities must be unique.",
      ),
    );
  }
  if (
    profile.status !== "AVAILABLE" && profile.status !== "FOUNDATION" &&
    profile.status !== "PLANNED"
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROFILE",
        "status",
        "Runtime profile status is unsupported.",
      ),
    );
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function assertProfile(profile: GameRuntimeProfile): void {
  const validation = validateGameRuntimeProfile(profile);
  if (!validation.valid) {
    throw new Error(
      validation.diagnostics.map((item) => `${item.code}:${item.path}`).join(
        ", ",
      ),
    );
  }
}

function freezeProfile(profile: GameRuntimeProfile): GameRuntimeProfile {
  return Object.freeze({
    ...profile,
    capabilities: Object.freeze([...profile.capabilities]),
  });
}

function createRegistry(
  profiles: readonly GameRuntimeProfile[],
): GameRuntimeProfileRegistry {
  const byId = new Map<string, GameRuntimeProfile>();
  for (const profile of profiles) {
    assertProfile(profile);
    if (byId.has(profile.profileId)) {
      throw new Error(`DUPLICATE_PROFILE:${profile.profileId}`);
    }
    byId.set(profile.profileId, freezeProfile(profile));
  }
  const ordered = Object.freeze([...byId.values()]);
  return {
    profiles: ordered,
    resolve(profileId: string): GameRuntimeProfile | undefined {
      return byId.get(profileId);
    },
    register(profile: GameRuntimeProfile): GameRuntimeProfileRegistry {
      return createRegistry([...ordered, profile]);
    },
  };
}

export const GAME_RUNTIME_PROFILES = createRegistry(BUILT_IN_PROFILES);
export const DEFAULT_GAME_RUNTIME_PROFILE_ID =
  GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG;

export type GameRuntimeMode = "STOPPED" | "PLAYING";

export interface GameRuntimeLifecycle {
  readonly mode: GameRuntimeMode;
  readonly tick: number;
}

export interface GameRuntimeInputState<TAction> {
  readonly lastSequence: number;
  readonly lastAction: TAction | null;
}

export interface GameRuntimeInputStep<TAction> {
  readonly sequence: number;
  readonly action: TAction | null;
}

export interface GameRuntimeState<
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
> {
  readonly schemaVersion: typeof GAME_RUNTIME_CORE_SCHEMA_VERSION;
  readonly profileId: GameRuntimeProfileId;
  /** Canonical authoring history; Runtime never appends to it. */
  readonly journal: JournalState;
  readonly snapshot: TSnapshot;
  readonly input: GameRuntimeInputState<TAction>;
  readonly runtime: TRuntime;
}

export interface GameRuntimeModule<
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
> {
  readonly profile: GameRuntimeProfile;
  readonly fixedStepTicks: number;
  createInitialRuntime(snapshot: TSnapshot): TRuntime;
  isValidAction(action: TAction | null): boolean;
  step(
    snapshot: TSnapshot,
    runtime: TRuntime,
    action: TAction | null,
  ): TRuntime;
  cloneRuntime(runtime: TRuntime): TRuntime;
  stopRuntime?(runtime: TRuntime): TRuntime;
}

function assertModule<
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(module: GameRuntimeModule<TSnapshot, TAction, TRuntime>): void {
  assertProfile(module.profile);
  if (
    !Number.isSafeInteger(module.fixedStepTicks) || module.fixedStepTicks < 1
  ) {
    throw new Error("Runtime fixed step must be a positive safe integer.");
  }
  if (module.profile.status === "PLANNED") {
    throw new Error(
      `Runtime profile is not available: ${module.profile.profileId}`,
    );
  }
}

export function createGameRuntimeState<
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(input: {
  readonly journal: JournalState;
  readonly snapshot: TSnapshot;
  readonly module: GameRuntimeModule<TSnapshot, TAction, TRuntime>;
}): GameRuntimeState<TSnapshot, TAction, TRuntime> {
  assertModule(input.module);
  return {
    schemaVersion: GAME_RUNTIME_CORE_SCHEMA_VERSION,
    profileId: input.module.profile.profileId,
    journal: input.journal,
    snapshot: input.snapshot,
    input: { lastSequence: 0, lastAction: null },
    runtime: input.module.createInitialRuntime(input.snapshot),
  };
}

export function cloneGameRuntimeState<
  TState extends GameRuntimeState<TSnapshot, TAction, TRuntime>,
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(
  state: TState,
  module: GameRuntimeModule<TSnapshot, TAction, TRuntime>,
): TState {
  return {
    ...state,
    input: { ...state.input },
    runtime: module.cloneRuntime(state.runtime),
  } as TState;
}

export function playGameRuntimeState<
  TState extends GameRuntimeState<TSnapshot, TAction, TRuntime>,
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(state: TState): TState {
  return {
    ...state,
    runtime: { ...state.runtime, mode: "PLAYING" },
  } as TState;
}

export function stopGameRuntimeState<
  TState extends GameRuntimeState<TSnapshot, TAction, TRuntime>,
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(
  state: TState,
  module: GameRuntimeModule<TSnapshot, TAction, TRuntime>,
): TState {
  const stopped = module.stopRuntime === undefined
    ? state.runtime
    : module.stopRuntime(state.runtime);
  return {
    ...state,
    input: { lastSequence: 0, lastAction: null },
    runtime: { ...stopped, mode: "STOPPED" },
  } as TState;
}

export function restartGameRuntimeState<
  TState extends GameRuntimeState<TSnapshot, TAction, TRuntime>,
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(
  state: TState,
  module: GameRuntimeModule<TSnapshot, TAction, TRuntime>,
): TState {
  const mode = state.runtime.mode;
  const initial = module.createInitialRuntime(state.snapshot);
  return {
    ...state,
    input: { lastSequence: 0, lastAction: null },
    runtime: { ...initial, mode },
  } as TState;
}

export function stepGameRuntimeState<
  TState extends GameRuntimeState<TSnapshot, TAction, TRuntime>,
  TSnapshot,
  TAction,
  TRuntime extends GameRuntimeLifecycle,
>(
  state: TState,
  input: GameRuntimeInputStep<TAction>,
  module: GameRuntimeModule<TSnapshot, TAction, TRuntime>,
): TState {
  if (
    state.runtime.mode !== "PLAYING" ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence <= state.input.lastSequence ||
    !module.isValidAction(input.action)
  ) return cloneGameRuntimeState(state, module);

  const stepped = module.step(state.snapshot, state.runtime, input.action);
  return {
    ...state,
    input: { lastSequence: input.sequence, lastAction: input.action },
    runtime: {
      ...stepped,
      mode: "PLAYING",
      tick: state.runtime.tick + module.fixedStepTicks,
    },
  } as TState;
}

/** Keep the module boundary typed without loading a host or a renderer. */
export function runtimeProfileForProject(
  project: Pick<GameProject, "runtimeProfile">,
): GameRuntimeProfile | undefined {
  const profileId = project.runtimeProfile?.profileId ??
    DEFAULT_GAME_RUNTIME_PROFILE_ID;
  return GAME_RUNTIME_PROFILES.resolve(profileId);
}
