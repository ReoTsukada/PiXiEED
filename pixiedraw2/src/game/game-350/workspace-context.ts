/**
 * Pure iGAME workspace context transitions.
 *
 * This module deliberately has no DOM, persistence, or runtime dependency.
 * UI adapters can project the returned context into the four rails and the
 * center workspace without making selection itself change the bottom panel.
 */

export type GameWorkspacePhase =
  | "START"
  | "COMPOSE"
  | "VISUAL"
  | "LOGIC"
  | "TEST"
  | "RELEASE";

export type GameWorkspaceCenterMode =
  | "SCENE_SELECT"
  | "SCENE_PLACE"
  | "TILEMAP_PAINT"
  | "CAMERA_EDIT"
  | "GAME_VIEW"
  | "PLAY";

export type GameWorkspaceBottomPanel =
  | "ASSETS"
  | "ANIMATION"
  | "DATA"
  | "EVENTS";

export type GameWorkspaceInspectorContext =
  | "PROJECT"
  | "SCENE"
  | "OBJECT"
  | "UI_NODE"
  | "ELEMENT"
  | "COMPONENT"
  | "ASSET_BINDING"
  | "ANIMATION"
  | "EVENT"
  | "DATA"
  | "RUNTIME"
  | "BUILD";

export type GameWorkspaceDataKind = "ITEM" | "RECIPE" | "BLOCK";

export type GameWorkspaceSelection =
  | { readonly kind: "NONE" }
  | { readonly kind: "PROJECT" }
  | { readonly kind: "SCENE"; readonly sceneId: string }
  | { readonly kind: "OBJECT"; readonly trackId: string }
  | { readonly kind: "UI_NODE"; readonly nodeId: string }
  | { readonly kind: "ELEMENT"; readonly elementId: string }
  | {
    readonly kind: "COMPONENT";
    readonly trackId: string;
    readonly componentId: string;
  }
  | { readonly kind: "ASSET"; readonly assetId: string }
  | { readonly kind: "ANIMATION"; readonly clipId: string }
  | { readonly kind: "EVENT"; readonly eventId: string }
  | {
    readonly kind: "DATA";
    readonly dataKind: GameWorkspaceDataKind;
    readonly id: string;
  };

export interface GameWorkspaceSceneCamera {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

/** UI-only state needed to return from a Sprite or Audio capture flow. */
export interface GameWorkspaceReturnContext {
  readonly selection: GameWorkspaceSelection;
  readonly sceneCamera?: GameWorkspaceSceneCamera;
  readonly bottomAssetScrollLeft?: number;
  readonly leftRailScrollTop?: number;
  readonly rightRailScrollTop?: number;
  readonly inspectorScrollTop?: number;
  readonly selectionPanel?: string;
  readonly focusTargetId?: string;
}

/** Immutable field update shared by capture-session implementations. */
export const updateGameWorkspaceReturnContext = (
  context: GameWorkspaceReturnContext,
  patch: Partial<Omit<GameWorkspaceReturnContext, "selection">>,
): GameWorkspaceReturnContext => ({ ...context, ...patch });

export interface GameWorkspaceBaseContext {
  readonly phase: Exclude<GameWorkspacePhase, "TEST" | "RELEASE">;
  readonly selection: GameWorkspaceSelection;
  readonly centerMode: Exclude<GameWorkspaceCenterMode, "PLAY">;
  readonly bottomPanel: GameWorkspaceBottomPanel;
  readonly inspectorContext: Exclude<
    GameWorkspaceInspectorContext,
    "RUNTIME" | "BUILD"
  >;
  readonly bottomPinned: boolean;
  readonly inspectorPinned: boolean;
}

export interface GameWorkspaceContext extends
  Omit<
    GameWorkspaceBaseContext,
    "phase" | "centerMode" | "inspectorContext"
  > {
  readonly phase: GameWorkspacePhase;
  readonly centerMode: GameWorkspaceCenterMode;
  readonly inspectorContext: GameWorkspaceInspectorContext;
  /** One return snapshot is shared by Play and Build; it cannot be nested. */
  readonly returnContext?: GameWorkspaceBaseContext;
}

export type GameWorkspaceAction =
  | { readonly type: "SELECT_NONE" }
  | { readonly type: "SELECT_PROJECT" }
  | { readonly type: "SELECT_SCENE"; readonly sceneId: string }
  | { readonly type: "SELECT_OBJECT"; readonly trackId: string }
  | { readonly type: "SELECT_UI_NODE"; readonly nodeId: string }
  | { readonly type: "SELECT_ELEMENT"; readonly elementId: string }
  | {
    readonly type: "SELECT_COMPONENT";
    readonly trackId: string;
    readonly componentId: string;
  }
  | { readonly type: "OPEN_EVENT"; readonly eventId: string }
  | { readonly type: "OPEN_ASSET"; readonly assetId: string }
  | { readonly type: "OPEN_ANIMATION"; readonly clipId: string }
  | {
    readonly type: "OPEN_DATA";
    readonly dataKind: GameWorkspaceDataKind;
    readonly id: string;
  }
  | {
    readonly type: "SELECT_BOTTOM_PANEL";
    readonly panel: GameWorkspaceBottomPanel;
  }
  | { readonly type: "START_PLAY" }
  | { readonly type: "STOP_PLAY" }
  | { readonly type: "OPEN_BUILD" }
  | { readonly type: "CLOSE_BUILD" };

const defaultBaseContext = (): GameWorkspaceBaseContext => ({
  phase: "START",
  selection: { kind: "NONE" },
  centerMode: "SCENE_SELECT",
  bottomPanel: "ASSETS",
  inspectorContext: "PROJECT",
  bottomPinned: false,
  inspectorPinned: false,
});

export const createGameWorkspaceContext = (): GameWorkspaceContext =>
  defaultBaseContext();

const selectionInspectorContext = (
  selection: GameWorkspaceSelection,
): Exclude<GameWorkspaceInspectorContext, "RUNTIME" | "BUILD"> => {
  switch (selection.kind) {
    case "NONE":
    case "PROJECT":
      return "PROJECT";
    case "SCENE":
      return "SCENE";
    case "OBJECT":
      return "OBJECT";
    case "UI_NODE":
      return "UI_NODE";
    case "ELEMENT":
      return "ELEMENT";
    case "COMPONENT":
      return "COMPONENT";
    case "ASSET":
      return "ASSET_BINDING";
    case "ANIMATION":
      return "ANIMATION";
    case "EVENT":
      return "EVENT";
    case "DATA":
      return "DATA";
  }
};

const authoringPhaseForSelection = (
  context: GameWorkspaceContext,
  selection: GameWorkspaceSelection,
): GameWorkspaceBaseContext["phase"] =>
  context.phase === "START" &&
      (selection.kind === "SCENE" || selection.kind === "OBJECT" ||
        selection.kind === "UI_NODE" || selection.kind === "ELEMENT" ||
        selection.kind === "COMPONENT")
    ? "COMPOSE"
    : context.phase === "TEST" || context.phase === "RELEASE"
    ? "COMPOSE"
    : context.phase;

const baseFromContext = (
  context: GameWorkspaceContext,
): GameWorkspaceBaseContext => ({
  phase: context.phase === "TEST" || context.phase === "RELEASE"
    ? "COMPOSE"
    : context.phase,
  selection: context.selection,
  centerMode: context.centerMode === "PLAY"
    ? "SCENE_SELECT"
    : context.centerMode,
  bottomPanel: context.bottomPanel,
  inspectorContext: context.inspectorContext === "RUNTIME" ||
      context.inspectorContext === "BUILD"
    ? selectionInspectorContext(context.selection)
    : context.inspectorContext,
  bottomPinned: context.bottomPinned,
  inspectorPinned: context.inspectorPinned,
});

const contextFromBase = (
  base: GameWorkspaceBaseContext,
  returnContext?: GameWorkspaceBaseContext,
): GameWorkspaceContext =>
  returnContext === undefined ? { ...base } : { ...base, returnContext };

/**
 * Normalizes externally supplied context and protects runtime-only surfaces
 * from being represented by an edit-phase context.
 */
export const normalizeGameWorkspaceContext = (
  context: GameWorkspaceContext,
): GameWorkspaceContext => {
  const selectionContext = selectionInspectorContext(context.selection);
  if (context.phase === "TEST") {
    return {
      ...context,
      centerMode: "PLAY",
      inspectorContext: "RUNTIME",
    };
  }
  if (context.phase === "RELEASE") {
    return {
      ...context,
      centerMode: "GAME_VIEW",
      inspectorContext: "BUILD",
    };
  }
  const { returnContext: _returnContext, ...editingContext } = context;
  return {
    ...editingContext,
    inspectorContext: selectionContext,
    centerMode: context.centerMode === "PLAY"
      ? "SCENE_SELECT"
      : context.centerMode,
  };
};

const withSelection = (
  context: GameWorkspaceContext,
  selection: GameWorkspaceSelection,
): GameWorkspaceContext =>
  normalizeGameWorkspaceContext({
    ...context,
    phase: authoringPhaseForSelection(context, selection),
    selection,
    inspectorContext: selectionInspectorContext(selection),
  });

const withOpenedSurface = (
  context: GameWorkspaceContext,
  selection: GameWorkspaceSelection,
  bottomPanel: GameWorkspaceBottomPanel,
  phase: "VISUAL" | "LOGIC",
): GameWorkspaceContext =>
  normalizeGameWorkspaceContext({
    ...context,
    phase,
    selection,
    bottomPanel,
    inspectorContext: selectionInspectorContext(selection),
  });

/** Pure, immutable reducer for iGAME authoring context. */
export const reduceGameWorkspaceContext = (
  context: GameWorkspaceContext,
  action: GameWorkspaceAction,
): GameWorkspaceContext => {
  const current = normalizeGameWorkspaceContext(context);
  if (
    current.phase === "TEST" && action.type !== "STOP_PLAY" &&
      action.type !== "SELECT_BOTTOM_PANEL"
  ) return current;
  if (current.phase === "RELEASE" && action.type !== "CLOSE_BUILD") {
    return current;
  }
  if (action.type === "STOP_PLAY" && current.phase !== "TEST") {
    return current;
  }
  if (action.type === "CLOSE_BUILD" && current.phase !== "RELEASE") {
    return current;
  }
  switch (action.type) {
    case "SELECT_NONE":
      return withSelection(current, { kind: "NONE" });
    case "SELECT_PROJECT":
      return withSelection(current, { kind: "PROJECT" });
    case "SELECT_SCENE":
      return withSelection(current, { kind: "SCENE", sceneId: action.sceneId });
    case "SELECT_OBJECT":
      return withSelection(current, {
        kind: "OBJECT",
        trackId: action.trackId,
      });
    case "SELECT_UI_NODE":
      return withSelection(current, {
        kind: "UI_NODE",
        nodeId: action.nodeId,
      });
    case "SELECT_ELEMENT":
      return withSelection(current, {
        kind: "ELEMENT",
        elementId: action.elementId,
      });
    case "SELECT_COMPONENT":
      return withSelection(current, {
        kind: "COMPONENT",
        trackId: action.trackId,
        componentId: action.componentId,
      });
    case "OPEN_EVENT":
      return withOpenedSurface(
        current,
        { kind: "EVENT", eventId: action.eventId },
        "EVENTS",
        "LOGIC",
      );
    case "OPEN_ASSET":
      return withOpenedSurface(
        current,
        { kind: "ASSET", assetId: action.assetId },
        "ASSETS",
        "VISUAL",
      );
    case "OPEN_ANIMATION":
      return withOpenedSurface(
        current,
        { kind: "ANIMATION", clipId: action.clipId },
        "ANIMATION",
        "VISUAL",
      );
    case "OPEN_DATA":
      return withOpenedSurface(
        current,
        { kind: "DATA", dataKind: action.dataKind, id: action.id },
        "DATA",
        "LOGIC",
      );
    case "SELECT_BOTTOM_PANEL":
      return { ...current, bottomPanel: action.panel };
    case "START_PLAY": {
      if (current.phase === "TEST" || current.phase === "RELEASE") {
        return current;
      }
      const returnContext = baseFromContext(current);
      return {
        ...returnContext,
        phase: "TEST",
        centerMode: "PLAY",
        inspectorContext: "RUNTIME",
        returnContext,
      };
    }
    case "STOP_PLAY": {
      if (current.returnContext === undefined) {
        return createGameWorkspaceContext();
      }
      return contextFromBase(current.returnContext);
    }
    case "OPEN_BUILD": {
      if (current.phase === "RELEASE") return current;
      const returnContext = baseFromContext(current);
      return {
        ...returnContext,
        phase: "RELEASE",
        centerMode: "GAME_VIEW",
        inspectorContext: "BUILD",
        returnContext,
      };
    }
    case "CLOSE_BUILD": {
      if (current.phase !== "RELEASE" || current.returnContext === undefined) {
        return createGameWorkspaceContext();
      }
      return contextFromBase(current.returnContext);
    }
  }
};

export const gameWorkspaceReducer = reduceGameWorkspaceContext;
