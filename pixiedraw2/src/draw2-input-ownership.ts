/// <reference lib="dom" />

/**
 * Shared input ownership rules for the desktop creator surfaces.
 *
 * The workspace has one keyboard, but it has several authoring surfaces.  This
 * module keeps the routing decision free of DOM state so each surface can be
 * tested without booting the full workspace.
 */

export type Draw2InputMode = "DRAW" | "ANIMATE" | "AUDIO" | "GAME";

export type Draw2ActiveSurface =
  | "DRAW_CANVAS"
  | "DRAW_TIMELINE"
  | "AUDIO_ROLL"
  | "AUDIO_TIMELINE"
  | "GAME_STAGE"
  | "GAME_RUNTIME"
  | "WORKSPACE";

export type Draw2ArrowOwner =
  | "DRAW_SELECTION"
  | "DRAW_TIMELINE"
  | "AUDIO_ROLL"
  | "GAME_RUNTIME"
  | "NONE";

export interface Draw2ArrowOwnershipInput {
  readonly mode: Draw2InputMode;
  readonly surface: Draw2ActiveSurface;
  readonly hasSelection: boolean;
  readonly drawGestureActive: boolean;
}

/** Resolve the nearest authoring surface from the event target/focused node. */
export function resolveDraw2ActiveSurface(
  target: EventTarget | null,
  activeElement: Element | null = null,
): Draw2ActiveSurface {
  const candidates: Element[] = [];
  if (typeof Element !== "undefined" && target instanceof Element) {
    candidates.push(target);
  }
  if (activeElement !== null && activeElement !== candidates[0]) {
    candidates.push(activeElement);
  }
  for (const element of candidates) {
    if (
      element.closest(
        "#draw2AudioMidiGrid, #draw2AudioMidiExpression, " +
          "#draw2AudioMidiExpressionLane",
      ) !== null
    ) return "AUDIO_ROLL";
    if (
      element.closest(
        "#draw2AudioArrangerViewport, #draw2AudioPanelTimeline, " +
          "#draw2AudioArrangerRuler, #draw2AudioRuler",
      ) !== null
    ) return "AUDIO_TIMELINE";
    if (
      element.closest(
        "#draw2GameUiOverlay, #draw2GamePlaygroundRuntime, " +
          "#draw2GamePreviewCanvas",
      ) !== null
    ) return "GAME_RUNTIME";
    if (element.closest("#draw2GameSceneViewport") !== null) {
      return "GAME_STAGE";
    }
    if (
      element.closest(
        "#draw2Canvas, #draw2CanvasCard, #draw2WorkspaceCanvasRegion",
      ) !== null
    ) return "DRAW_CANVAS";
    if (element.closest("#draw2WorkspaceTimelineRegion") !== null) {
      return "DRAW_TIMELINE";
    }
  }
  return "WORKSPACE";
}

export function isDraw2SpacePanSurface(
  surface: Draw2ActiveSurface,
): boolean {
  return surface === "DRAW_CANVAS" || surface === "AUDIO_ROLL";
}

/**
 * Resolve arrow keys only when the surface under the pointer/focus owns them.
 *
 * DRAW canvas arrows nudge a selection first; without a selection they move
 * through frames/layers.  Timeline arrows are reserved by the timeline, and
 * Audio/Game never leak their arrows into Draw's frame/layer commands.
 */
export function resolveDraw2ArrowOwner(
  input: Draw2ArrowOwnershipInput,
): Draw2ArrowOwner {
  if (input.mode === "AUDIO") {
    return input.surface === "AUDIO_ROLL" ? "AUDIO_ROLL" : "NONE";
  }
  if (input.mode === "GAME") {
    return input.surface === "GAME_STAGE" || input.surface === "GAME_RUNTIME"
      ? "GAME_RUNTIME"
      : "NONE";
  }
  if (input.surface === "DRAW_TIMELINE") return "DRAW_TIMELINE";
  if (input.surface !== "DRAW_CANVAS") return "NONE";
  if (input.drawGestureActive || input.hasSelection) return "DRAW_SELECTION";
  return "DRAW_TIMELINE";
}

export type SpaceIntentAction = "toggle-playback" | "none";

export interface SpaceIntentState {
  readonly phase: "idle" | "pending";
  readonly didPan: boolean;
  readonly pointerId?: number;
  readonly startX?: number;
  readonly startY?: number;
}

export interface SpaceIntentResolution {
  readonly action: SpaceIntentAction;
  readonly state: SpaceIntentState;
}

export function createSpaceIntentState(): SpaceIntentState {
  return { phase: "idle", didPan: false };
}

export function beginSpaceIntent(
  state: SpaceIntentState,
  enabled: boolean,
): SpaceIntentState {
  if (!enabled || state.phase !== "idle") return state;
  return { phase: "pending", didPan: false };
}

export function armSpacePointer(
  state: SpaceIntentState,
  pointerId: number,
  startX: number,
  startY: number,
  eligibleSurface: boolean,
): SpaceIntentState {
  if (state.phase !== "pending" || !eligibleSurface) return state;
  return { ...state, pointerId, startX, startY };
}

export function advanceSpacePointer(
  state: SpaceIntentState,
  pointerId: number,
  clientX: number,
  clientY: number,
  threshold = 3,
): SpaceIntentState {
  if (
    state.phase !== "pending" || state.pointerId !== pointerId ||
    state.startX === undefined || state.startY === undefined
  ) return state;
  const moved = Math.hypot(clientX - state.startX, clientY - state.startY);
  return moved >= threshold ? { ...state, didPan: true } : state;
}

export function releaseSpacePointer(
  state: SpaceIntentState,
  pointerId: number,
): SpaceIntentState {
  if (state.pointerId !== pointerId) return state;
  const { pointerId: _pointerId, startX: _startX, startY: _startY, ...rest } =
    state;
  return rest;
}

export function resolveSpaceKeyUp(
  state: SpaceIntentState,
): SpaceIntentResolution {
  const action: SpaceIntentAction = state.phase === "pending" && !state.didPan
    ? "toggle-playback"
    : "none";
  return { action, state: createSpaceIntentState() };
}

export function cancelSpaceIntent(): SpaceIntentState {
  return createSpaceIntentState();
}
