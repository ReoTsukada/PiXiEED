import {
  createGameWorkspaceContext,
  type GameWorkspaceContext,
  gameWorkspaceReducer,
  updateGameWorkspaceReturnContext,
  type GameWorkspaceReturnContext,
} from "../../src/game/game-350/workspace-context.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const reduce = gameWorkspaceReducer;

Deno.test("GAME350-CONTEXT-001 exposes the typed default and selection states", () => {
  const initial = createGameWorkspaceContext();
  assert(initial.selection.kind === "NONE", "default selection must be NONE");
  assert(initial.phase === "START", "default phase must be START");
  assert(
    initial.centerMode === "SCENE_SELECT",
    "default center must select Scene",
  );
  assert(
    initial.bottomPanel === "ASSETS",
    "default bottom panel must be ASSETS",
  );
  assert(
    initial.inspectorContext === "PROJECT",
    "default inspector must be PROJECT",
  );

  const scene = reduce(initial, {
    type: "SELECT_SCENE",
    sceneId: "scene-main",
  });
  assert(
    scene.selection.kind === "SCENE" &&
      scene.selection.sceneId === "scene-main",
    "scene selection must be retained",
  );
  assert(
    scene.inspectorContext === "SCENE",
    "scene selection must route Inspector",
  );

  const component = reduce(scene, {
    type: "SELECT_COMPONENT",
    trackId: "hero",
    componentId: "hero-transform",
  });
  assert(
    component.selection.kind === "COMPONENT",
    "component selection must be retained",
  );
  assert(
    component.inspectorContext === "COMPONENT",
    "component selection must route Inspector",
  );
});

Deno.test("GAME350-CONTEXT-008 updates the common return context without mutation", () => {
  const initial: GameWorkspaceReturnContext = { selection: { kind: "PROJECT" } };
  const next = updateGameWorkspaceReturnContext(initial, {
    sceneCamera: { panX: 1, panY: 2, zoom: 1.5 },
    bottomAssetScrollLeft: 64,
    leftRailScrollTop: 10,
    rightRailScrollTop: 20,
    inspectorScrollTop: 30,
    selectionPanel: "assets",
    focusTargetId: "asset-search",
  });
  assert(next !== initial, "return context update must create a new object");
  assert(initial.sceneCamera === undefined, "initial return context must remain unchanged");
  assert(next.sceneCamera?.panX === 1 && next.sceneCamera.zoom === 1.5, "Scene camera must be preserved");
  assert(next.bottomAssetScrollLeft === 64 && next.leftRailScrollTop === 10 && next.rightRailScrollTop === 20, "workspace scroll state must be preserved");
  assert(next.inspectorScrollTop === 30 && next.selectionPanel === "assets" && next.focusTargetId === "asset-search", "Inspector, panel, and focus must be preserved");
});

Deno.test("GAME350-CONTEXT-002 keeps passive selection from changing bottom or related events", () => {
  const initial = createGameWorkspaceContext();
  const opened = reduce(initial, { type: "OPEN_EVENT", eventId: "event-talk" });
  const selectedObject = reduce(opened, {
    type: "SELECT_OBJECT",
    trackId: "npc-1",
  });
  assert(
    selectedObject.bottomPanel === "EVENTS",
    "object selection must not steal the bottom panel",
  );
  assert(
    selectedObject.selection.kind === "OBJECT",
    "object selection must replace the selection",
  );
  assert(
    selectedObject.selection.trackId === "npc-1",
    "object track id must be retained",
  );
  assert(
    selectedObject.inspectorContext === "OBJECT",
    "object selection must route Inspector",
  );
  assert(
    selectedObject.selection.kind === "OBJECT",
    "object selection must not select an event",
  );

  const data = reduce(selectedObject, {
    type: "SELECT_BOTTOM_PANEL",
    panel: "DATA",
  });
  const selectedNone = reduce(data, { type: "SELECT_NONE" });
  assert(
    selectedNone.bottomPanel === "DATA",
    "SELECT_NONE must preserve the bottom panel",
  );
  assert(
    selectedNone.selection.kind === "NONE",
    "SELECT_NONE must clear selection",
  );
});

Deno.test("GAME350-CONTEXT-003 OPEN actions are the only surface-opening selection transitions", () => {
  const initial = createGameWorkspaceContext();
  const asset = reduce(initial, { type: "OPEN_ASSET", assetId: "sprite-hero" });
  assert(
    asset.bottomPanel === "ASSETS" &&
      asset.inspectorContext === "ASSET_BINDING",
    "OPEN_ASSET must open Assets and binding Inspector",
  );

  const animation = reduce(asset, { type: "OPEN_ANIMATION", clipId: "walk" });
  assert(
    animation.bottomPanel === "ANIMATION" &&
      animation.inspectorContext === "ANIMATION",
    "OPEN_ANIMATION must open Animation",
  );

  const data = reduce(animation, {
    type: "OPEN_DATA",
    dataKind: "RECIPE",
    id: "recipe-1",
  });
  assert(
    data.bottomPanel === "DATA" && data.inspectorContext === "DATA",
    "OPEN_DATA must open Data",
  );

  const event = reduce(data, { type: "OPEN_EVENT", eventId: "event-1" });
  assert(
    event.bottomPanel === "EVENTS" && event.inspectorContext === "EVENT",
    "OPEN_EVENT must open Events",
  );
});

Deno.test("GAME350-CONTEXT-004 START_PLAY and STOP_PLAY restore one exact edit context", () => {
  let editing = createGameWorkspaceContext();
  editing = reduce(editing, { type: "SELECT_OBJECT", trackId: "hero" });
  editing = reduce(editing, {
    type: "SELECT_BOTTOM_PANEL",
    panel: "ANIMATION",
  });
  editing = {
    ...editing,
    phase: "VISUAL",
    centerMode: "CAMERA_EDIT",
    bottomPinned: true,
    inspectorPinned: true,
  };

  const playing = reduce(editing, { type: "START_PLAY" });
  assert(playing.phase === "TEST", "START_PLAY must enter TEST");
  assert(playing.centerMode === "PLAY", "START_PLAY must enter PLAY center");
  assert(
    playing.inspectorContext === "RUNTIME",
    "START_PLAY must enter RUNTIME Inspector",
  );
  assert(
    playing.returnContext !== undefined,
    "START_PLAY must keep one return context",
  );

  const runtimeSelection = reduce(playing, { type: "SELECT_NONE" });
  const stopped = reduce(runtimeSelection, { type: "STOP_PLAY" });
  assert(stopped.phase === editing.phase, "STOP_PLAY must restore phase");
  assert(
    stopped.selection.kind === "OBJECT" && stopped.selection.trackId === "hero",
    "STOP_PLAY must restore selection",
  );
  assert(
    stopped.centerMode === "CAMERA_EDIT",
    "STOP_PLAY must restore center mode",
  );
  assert(
    stopped.bottomPanel === "ANIMATION",
    "STOP_PLAY must restore bottom panel",
  );
  assert(
    stopped.bottomPinned && stopped.inspectorPinned,
    "STOP_PLAY must restore pin state",
  );
  assert(
    stopped.returnContext === undefined,
    "restored context must not retain nested return state",
  );
});

Deno.test("GAME350-CONTEXT-005 safely handles missing Play state and prevents nested saves", () => {
  const initial = createGameWorkspaceContext();
  const stopped = reduce(initial, { type: "STOP_PLAY" });
  assert(
    stopped.selection.kind === "NONE" && stopped.phase === "START",
    "STOP_PLAY without a save must return to a safe default",
  );

  const playing = reduce(initial, { type: "START_PLAY" });
  const secondStart = reduce(playing, { type: "START_PLAY" });
  assert(
    secondStart.returnContext !== undefined,
    "repeated START_PLAY must retain a return state",
  );
  assert(
    secondStart.returnContext?.selection.kind === "NONE",
    "repeated START_PLAY must not overwrite the original context",
  );
});

Deno.test("GAME350-CONTEXT-006 OPEN_BUILD and CLOSE_BUILD restore the edit context", () => {
  let editing: GameWorkspaceContext = createGameWorkspaceContext();
  editing = reduce(editing, { type: "SELECT_SCENE", sceneId: "scene-main" });
  editing = reduce(editing, { type: "SELECT_BOTTOM_PANEL", panel: "DATA" });
  const build = reduce(editing, { type: "OPEN_BUILD" });
  assert(build.phase === "RELEASE", "OPEN_BUILD must enter RELEASE");
  assert(
    build.centerMode === "GAME_VIEW",
    "OPEN_BUILD must use a non-playing Game View center",
  );
  assert(
    build.inspectorContext === "BUILD",
    "OPEN_BUILD must enter BUILD Inspector",
  );
  assert(
    build.returnContext !== undefined,
    "OPEN_BUILD must keep a return context",
  );

  const closed = reduce(build, { type: "CLOSE_BUILD" });
  assert(closed.phase === editing.phase, "CLOSE_BUILD must restore phase");
  assert(
    closed.selection.kind === "SCENE" &&
      closed.selection.sceneId === "scene-main",
    "CLOSE_BUILD must restore Scene selection",
  );
  assert(
    closed.bottomPanel === "DATA",
    "CLOSE_BUILD must restore bottom panel",
  );
  assert(
    closed.returnContext === undefined,
    "CLOSE_BUILD must clear the return state",
  );
});

Deno.test("GAME350-CONTEXT-007 reducer is immutable and normalizes runtime surfaces", () => {
  const initial = createGameWorkspaceContext();
  const next = reduce(initial, { type: "SELECT_PROJECT" });
  assert(next !== initial, "reducer must return a new context");
  assert(
    initial.selection.kind === "NONE",
    "reducer must not mutate the input",
  );

  const malformed: GameWorkspaceContext = {
    ...next,
    phase: "TEST",
    centerMode: "SCENE_PLACE",
    inspectorContext: "PROJECT",
  };
  const normalized = reduce(malformed, {
    type: "SELECT_BOTTOM_PANEL",
    panel: "EVENTS",
  });
  assert(
    normalized.centerMode === "PLAY",
    "TEST must normalize center to PLAY",
  );
  assert(
    normalized.inspectorContext === "RUNTIME",
    "TEST must normalize Inspector to RUNTIME",
  );
  assert(
    normalized.bottomPanel === "EVENTS",
    "bottom panel selection remains explicit",
  );
});

Deno.test("GAME350-CONTEXT-008 authoring actions advance only the intended phase", () => {
  const initial = createGameWorkspaceContext();
  const object = reduce(initial, { type: "SELECT_OBJECT", trackId: "hero" });
  assert(object.phase === "COMPOSE", "object selection must leave START");
  const asset = reduce(object, { type: "OPEN_ASSET", assetId: "draw:hero" });
  assert(asset.phase === "VISUAL", "asset editing must enter VISUAL");
  const event = reduce(asset, { type: "OPEN_EVENT", eventId: "event:talk" });
  assert(event.phase === "LOGIC", "event editing must enter LOGIC");
  const data = reduce(event, {
    type: "OPEN_DATA",
    dataKind: "ITEM",
    id: "item:key",
  });
  assert(data.phase === "LOGIC", "data editing must remain in LOGIC");
});

Deno.test("GAME350-CONTEXT-009 invalid transient exits are safe no-ops", () => {
  let editing = createGameWorkspaceContext();
  editing = reduce(editing, { type: "SELECT_OBJECT", trackId: "hero" });
  editing = reduce(editing, { type: "OPEN_ASSET", assetId: "draw:hero" });
  const stopped = reduce(editing, { type: "STOP_PLAY" });
  assert(
    stopped.phase === editing.phase &&
      stopped.selection.kind === editing.selection.kind &&
      stopped.bottomPanel === editing.bottomPanel &&
      stopped.inspectorContext === editing.inspectorContext,
    "STOP_PLAY outside TEST must be a no-op",
  );

  const playing = reduce(editing, { type: "START_PLAY" });
  const buildWhilePlaying = reduce(playing, { type: "OPEN_BUILD" });
  assert(
    buildWhilePlaying.phase === "TEST" &&
      buildWhilePlaying.returnContext?.selection.kind === "ASSET",
    "OPEN_BUILD during TEST must preserve the original return context",
  );
  const stoppedPlaying = reduce(playing, { type: "STOP_PLAY" });
  assert(
    stoppedPlaying.phase === "VISUAL" &&
      stoppedPlaying.selection.kind === "ASSET",
    "STOP_PLAY must still restore the original edit context",
  );
});

Deno.test("GAME350-CONTEXT-010 RELEASE accepts only its explicit close action", () => {
  let editing = createGameWorkspaceContext();
  editing = reduce(editing, { type: "SELECT_SCENE", sceneId: "scene-main" });
  const build = reduce(editing, { type: "OPEN_BUILD" });
  const ignored = reduce(build, { type: "OPEN_EVENT", eventId: "event-1" });
  assert(
    ignored.phase === "RELEASE" && ignored.inspectorContext === "BUILD" &&
      ignored.returnContext?.selection.kind === "SCENE",
    "RELEASE must ignore authoring actions until Build is closed",
  );
  const closed = reduce(build, { type: "CLOSE_BUILD" });
  assert(
    closed.phase === "COMPOSE" && closed.selection.kind === "SCENE",
    "CLOSE_BUILD must restore the prior authoring context",
  );
});

Deno.test("GAME350-CONTEXT-011 keeps one Inspector selection and restores it from Play", () => {
  let context = createGameWorkspaceContext();
  context = reduce(context, { type: "SELECT_BOTTOM_PANEL", panel: "EVENTS" });
  context = reduce(context, { type: "SELECT_ELEMENT", elementId: "hp" });
  assert(
    context.selection.kind === "ELEMENT" &&
      context.selection.elementId === "hp" &&
      context.inspectorContext === "ELEMENT" &&
      context.bottomPanel === "EVENTS",
    "ELEMENT selection must be canonical without changing the shelf",
  );
  context = reduce(context, { type: "SELECT_UI_NODE", nodeId: "hud-button" });
  assert(
    context.selection.kind === "UI_NODE" &&
      context.selection.nodeId === "hud-button" &&
      context.inspectorContext === "UI_NODE" &&
      context.bottomPanel === "EVENTS",
    "UI_NODE must replace ELEMENT and preserve the shelf",
  );
  context = reduce(context, { type: "SELECT_OBJECT", trackId: "hero" });
  assert(
    context.selection.kind === "OBJECT" &&
      context.inspectorContext === "OBJECT" &&
      context.bottomPanel === "EVENTS",
    "OBJECT must replace UI_NODE and preserve the shelf",
  );
  context = reduce(context, { type: "OPEN_ASSET", assetId: "sprite-hero" });
  assert(
    context.selection.kind === "ASSET" &&
      context.inspectorContext === "ASSET_BINDING" &&
      context.bottomPanel === "ASSETS",
    "ASSET must replace OBJECT through the existing Assets surface",
  );
  context = reduce(context, { type: "SELECT_SCENE", sceneId: "scene-main" });
  assert(
    context.selection.kind === "SCENE" &&
      context.inspectorContext === "SCENE" &&
      context.bottomPanel === "ASSETS",
    "SCENE must replace ASSET without auto-switching the shelf",
  );

  const playing = reduce(context, { type: "START_PLAY" });
  assert(
    playing.returnContext?.selection.kind === "SCENE" &&
      playing.returnContext?.selection.sceneId === "scene-main" &&
      playing.returnContext?.bottomPanel === "ASSETS",
    "Play must snapshot the canonical selection and shelf",
  );
  const stopped = reduce(playing, { type: "STOP_PLAY" });
  assert(
    stopped.selection.kind === "SCENE" &&
      stopped.selection.sceneId === "scene-main" &&
      stopped.bottomPanel === "ASSETS" &&
      stopped.inspectorContext === "SCENE",
    "STOP_PLAY must restore the same selection and shelf",
  );
});
