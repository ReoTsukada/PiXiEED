/// <reference lib="dom" />

/**
 * GAME-350 iGAME Runtime launch shell.
 *
 * PiXiEED owns only the product-brand splash, the generic start hand-off, and
 * the execution boundary. The game package owns the actual game surface,
 * controls, HUD, menus, and gameplay presentation.
 */

import type { IGamePlayerManifest, IGamePlayerSession } from "./igame-player-contract.ts";

export const IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION = 1 as const;
export const PIXIEED_BRAND_SPLASH_DURATION_MS = 1_200 as const;

export type IGameRuntimeLaunchPhase =
  | "BRAND_SPLASH"
  | "START_SCREEN"
  | "GAMEPLAY"
  | "STOPPED";

export interface IGameRuntimeLaunchConfigInput {
  readonly title: string;
  readonly startSceneId: string;
  readonly subtitle?: string;
  readonly startLabel?: string;
}

export interface IGameRuntimeLaunchConfig {
  readonly schemaVersion: typeof IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION;
  readonly title: string;
  readonly subtitle: string;
  readonly startSceneId: string;
  readonly startLabel: string;
}

export interface IGameRuntimeLaunchState {
  readonly schemaVersion: typeof IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION;
  readonly phase: IGameRuntimeLaunchPhase;
  readonly config: IGameRuntimeLaunchConfig;
  readonly transitionCount: number;
}

export interface IGamePlayerRuntimeMountContext {
  readonly root: HTMLElement;
  readonly manifest: IGamePlayerManifest;
  readonly session: IGamePlayerSession;
  readonly launch: IGameRuntimeLaunchConfig;
  /** The package may request a safe runtime stop without gaining editor access. */
  readonly requestStop: () => Promise<void>;
}

export interface IGamePlayerRuntimeHandle {
  readonly dispose?: () => void | Promise<void>;
}

export interface IGamePlayerRuntimeSource {
  readonly manifest: IGamePlayerManifest;
  readonly launch: IGameRuntimeLaunchConfig;
  readonly proof?: unknown;
  readonly mount: (
    context: IGamePlayerRuntimeMountContext,
  ) => void | Promise<IGamePlayerRuntimeHandle | void>;
}

function nonEmptyText(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength;
}

function stableId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}

export function createIGameRuntimeLaunchConfig(
  input: IGameRuntimeLaunchConfigInput,
): IGameRuntimeLaunchConfig {
  if (!nonEmptyText(input.title) || !stableId(input.startSceneId)) {
    throw new Error("iGAME Runtime launch config contains an unstable identity.");
  }
  const subtitle = input.subtitle ?? "このGameのスタート画面";
  const startLabel = input.startLabel ?? "START";
  if (!nonEmptyText(subtitle) || !nonEmptyText(startLabel)) {
    throw new Error("iGAME Runtime launch config contains empty display text.");
  }
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    title: input.title.trim(),
    subtitle: subtitle.trim(),
    startSceneId: input.startSceneId,
    startLabel: startLabel.trim(),
  });
}

export function createIGameRuntimeLaunchState(
  config: IGameRuntimeLaunchConfig,
): IGameRuntimeLaunchState {
  return Object.freeze({
    schemaVersion: IGAME_RUNTIME_LAUNCH_SCHEMA_VERSION,
    phase: "BRAND_SPLASH" as const,
    config,
    transitionCount: 0,
  });
}

function transition(
  state: IGameRuntimeLaunchState,
  phase: IGameRuntimeLaunchPhase,
): IGameRuntimeLaunchState {
  return Object.freeze({
    ...state,
    phase,
    transitionCount: state.transitionCount + 1,
  });
}

export function completeIGameBrandSplash(
  state: IGameRuntimeLaunchState,
): IGameRuntimeLaunchState {
  if (state.phase !== "BRAND_SPLASH") {
    throw new Error("iGAME brand splash can only complete once at launch.");
  }
  return transition(state, "START_SCREEN");
}

export function startIGameRuntime(
  state: IGameRuntimeLaunchState,
): IGameRuntimeLaunchState {
  if (state.phase !== "START_SCREEN") {
    throw new Error("iGAME Runtime can start only from the start screen.");
  }
  return transition(state, "GAMEPLAY");
}

export function stopIGameRuntime(
  state: IGameRuntimeLaunchState,
): IGameRuntimeLaunchState {
  if (state.phase === "STOPPED") return state;
  return transition(state, "STOPPED");
}

export function isIGamePlayerRuntimeSource(
  value: unknown,
): value is IGamePlayerRuntimeSource {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const source = value as Record<string, unknown>;
  return source.manifest !== null && typeof source.manifest === "object" &&
    source.launch !== null && typeof source.launch === "object" &&
    typeof source.mount === "function";
}
