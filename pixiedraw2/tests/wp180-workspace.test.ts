import {
  calculateBoundedWindow,
  countVisibleToolPopovers,
  createCoalescedNotifier,
  createPanelMountRecord,
  createWorkspaceCommandRegistry,
  createWorkspaceHotPathMetrics,
  createWorkspaceState,
  isWorkspaceOnlyStateKey,
  recordCanvasProjection,
  recordPointerSample,
  recordWorkspaceUpdate,
  resolveDesktopCreatorModeProfile,
  resolveInputOwner,
  resolveShortcut,
  resolveWorkspaceDetailMode,
  transitionPanelMount,
} from "../src/wp180-workspace-contracts.ts";
import { resolveAudioFeatureFlag } from "../src/wp180-audio-flag.ts";

Deno.test("Audio feature flags default on and fail closed on invalid values", () => {
  if (resolveAudioFeatureFlag(null).flag !== "on") {
    throw new Error("Normal iAUDIO entry must enable Audio by default.");
  }
  if (resolveAudioFeatureFlag(null).reason !== "default-on") {
    throw new Error("Default Audio state must be observable as default-on.");
  }
  if (resolveAudioFeatureFlag("on", "off").flag !== "on") {
    throw new Error("Explicit audio=on must override the host fallback.");
  }
  if (resolveAudioFeatureFlag("off").flag !== "off") {
    throw new Error("Explicit audio=off must remain an opt-out.");
  }
  for (const invalid of ["", "maybe", "ONCE"]) {
    const resolution = resolveAudioFeatureFlag(invalid);
    if (resolution.flag !== "off" || resolution.reason !== "unknown") {
      throw new Error(`Invalid Audio flag must fail closed: ${invalid}`);
    }
  }
  if (resolveAudioFeatureFlag(null, "off").flag !== "off") {
    throw new Error("A host explicitly configured off must remain off.");
  }
});

Deno.test("iAUDIO new and reset projects do not inject demo notes", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  if (source.includes("initialAudioNotes")) {
    throw new Error("New iAUDIO projects must not carry a demo-note seed.");
  }
  const resetStart = source.indexOf(
    "const resetAudioSubdocumentForProjectSwitch =",
  );
  const resetEnd = source.indexOf(
    "const audioNoteCellLookup =",
    resetStart,
  );
  if (resetStart < 0 || resetEnd < 0) {
    throw new Error("iAUDIO reset boundaries are missing.");
  }
  if (source.slice(resetStart, resetEnd).includes("audioMidiNotes.set(")) {
    throw new Error("Project reset must not inject an iAUDIO demo note.");
  }
  const emptyMap = "const audioMidiNotes = new Map<string, PianoRollNote>();";
  if (!source.includes(emptyMap)) {
    throw new Error("iAUDIO new-project notes must start empty.");
  }
});

Deno.test("iAUDIO opens the Piano Roll around C4 and keeps later scroll positions", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    'const audioMidiInitialScrollTop =',
    'pitch.label === "C4"',
    "const applyAudioMidiInitialViewport =",
    "audioMidiInitialViewportApplied = true;",
    "audioMidiGrid.scrollTop = scrollTop;",
    "if (!applyAudioMidiInitialViewport())",
    "audioMidiInitialViewportApplied = false;",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Piano Roll initial viewport contract missing: ${required}`);
    }
  }
  const initialTop = source.indexOf("const audioMidiInitialScrollTop =");
  const renderTop = source.indexOf("const renderAudioMidiGrid =");
  if (initialTop < 0 || renderTop < 0 || initialTop > renderTop) {
    throw new Error("Initial Piano Roll viewport must be defined before rendering.");
  }
});

Deno.test("iAUDIO Asset creation stays contextual and is independent from Market options", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  for (const required of [
    "let audioAssetScopeIntent = false;",
    "const revealAudioAssetPackageForUserSelection =",
    "audioAssetScopeIntent = true;",
    "const visible = audioAssetScopeIntent && state !== \"empty\";",
    "audioAssetPackage.hidden = !visible;",
    "audioAssetPackage.setAttribute(\"aria-hidden\", String(!visible));",
    "const inferredAudioAssetRole =",
    "const saveSelectedAudioAsset = async (): Promise<void> =>",
    'offerKind: "ASSET",',
    'derivativePolicy: "USE_ONLY",',
    "audioAssetScopeIntent = false;",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Contextual iAUDIO Asset contract missing: ${required}`);
    }
  }
  const packageStart = html.indexOf('id="draw2AudioAssetPackage"');
  const packageEnd = html.indexOf(">", packageStart);
  if (packageStart < 0 || packageEnd < 0 || !html.slice(packageStart, packageEnd).includes("hidden")) {
    throw new Error("iAUDIO Asset panel must start hidden before an explicit scope is selected.");
  }
  const assetPanel = html.slice(packageStart);
  for (const required of [
    'data-audio-asset-workflow="asset-only"',
    "Assetとして保存",
  ]) {
    if (!assetPanel.includes(required)) {
      throw new Error(`iAUDIO Asset panel is missing: ${required}`);
    }
  }
  for (const removed of [
    "draw2AudioAssetRole",
    "draw2AudioAssetOfferKind",
    "draw2AudioAssetDerivativePolicy",
    "draw2AudioAssetAddRange",
    "販売用に確定",
    "＋Packへ追加",
  ]) {
    if (assetPanel.includes(removed)) {
      throw new Error(`iAUDIO Asset creation must not expose Market option: ${removed}`);
    }
  }
});

Deno.test("Luna keyboard actions share safe event guards", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    "export function isWorkspaceKeyboardActionAllowed(",
    "!event.defaultPrevented && !event.isComposing && !event.repeat",
    "!isEditableTarget(target)",
    "!isWorkspaceInteractiveTarget(target)",
    "!isWorkspaceKeyboardActionAllowed(event, event.target)",
    "isWorkspaceKeyboardActionAllowed(event, target)",
    "event.key === \"Escape\" && !event.defaultPrevented",
    "event.stopPropagation();",
    "const handleWorkspacePlaybackKeydown =",
    "event.stopImmediatePropagation();",
    "{ capture: true },",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Luna keyboard safety contract missing: ${required}`);
    }
  }
  const spaceHandler = source.slice(source.indexOf("const spaceKey ="));
  if (!spaceHandler.includes("isWorkspaceKeyboardActionAllowed(event, event.target)")) {
    throw new Error("Play/Space must not steal editable or composing input.");
  }
});

Deno.test("Mode keyboard ownership is isolated across Draw, Audio, and Game", async () => {
  const workspace = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const shortcuts = await Deno.readTextFile(
    new URL("../src/draw2-shortcuts.ts", import.meta.url),
  );
  for (const required of [
    "selectRelativeTimelineLayer",
    'command: \"previous-layer\"',
    'command: \"next-layer\"',
    "const drawWorkspaceMode =",
    "if (!drawWorkspaceMode) return;",
    "const drawOnlyKeyboardCommands = new Set([",
    "currentCreatorMode() !== \"GAME\"",
    "audioTimelineSelectionTarget",
    "const audioRedo =",
    "!isWorkspaceInteractiveTarget(target)",
    "data-game-ui-node-id",
    "isSelectedNodeTarget",
  ]) {
    if (
      !workspace.includes(required) && !entry.includes(required) &&
      !shortcuts.includes(required)
    ) {
      throw new Error(`Mode keyboard ownership contract missing: ${required}`);
    }
  }
  if (
    !entry.includes('event.target !== gamePreviewCanvas') ||
    entry.includes('event.key === " " ? { interact: true }')
  ) {
    throw new Error("Game preview keyboard input must stay mode-scoped and keep Space for transport");
  }
});

Deno.test("WP-180 guided and detailed workspace density is explicit", async () => {
  if (
    resolveWorkspaceDetailMode("guided") !== "guided" ||
    resolveWorkspaceDetailMode("detailed") !== "detailed" ||
    resolveWorkspaceDetailMode("tampered") !== "guided"
  ) {
    throw new Error("Workspace detail mode must fail closed to guided");
  }
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    'id="draw2WorkspaceDetailToggle"',
    'data-workspace-command="toggle-detail-mode"',
    "data-workspace-detail-mode-label",
    'data-detail-level="detailed"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Detail-density markup missing: ${required}`);
    }
  }
  for (const required of [
    "readWorkspaceDetailMode",
    "writeWorkspaceDetailMode",
    "renderDetailMode",
    'case \"toggle-detail-mode\"',
    "draw2:detail-mode",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Detail-density behavior missing: ${required}`);
    }
  }
  for (const required of [
    'data-detail-mode="guided"',
    '[data-detail-level="detailed"]',
    ".draw2-workspace-detail-toggle",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Detail-density styling missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO Piano Roll starts with a multi-bar working window", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    "const AUDIO_INITIAL_VISIBLE_BARS = 4;",
    "audioMeasureFrameCount() * AUDIO_INITIAL_VISIBLE_BARS",
    "ensureAudioTimelineMinimum();\n    syncAudioTimebaseSummary();",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Initial Audio multi-bar contract missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO Piano Roll exposes unified tools and safe range editing", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    'id="draw2AudioMidiToolStrip"',
    'id="draw2AudioMidiSplit"',
    'data-audio-midi-tool="pen"',
    'data-audio-midi-tool="eraser"',
    'data-audio-midi-tool="select"',
    'data-audio-ui-group="tools"',
    'data-audio-ui-group="actions"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Piano Roll tool markup missing: ${required}`);
    }
  }
  for (const required of [
    '"button[data-audio-midi-tool]"',
    "journalWorkspaceNoteBatchReplace",
    "const audioMidiSelectionBoundsFromDrag =",
    "const beginAudioMidiMove =",
    "const commitAudioMidiMove =",
    "const splitSelectedAudioMidiNotes =",
    "const audioMidiDirectManipulationEnabled =",
    "const audioMidiNoteAtTarget =",
    "const createAudioMidiNoteAtTarget =",
    "const beginAudioMidiDrawAtTarget =",
    "const splitAudioMidiNoteAtPointer =",
    "audioMidiLastEmptyClick",
    "audioMidiSkipNextDoubleClickAt",
    "drag empty space to select a range",
    "audioMidiMovePreview?.sourceNoteIds.has(note.id)",
    "drag selected notes to move them",
    "double-click a note to split",
    "Empty lane · double-click to add a note",
    "const stationary =",
    "beginAudioMidiMarquee(event);",
    "key === \"s\"",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Piano Roll range editing contract missing: ${required}`);
    }
  }
  for (const required of [
    ".draw2-audio-midi-tool-strip",
    ".draw2-audio-midi-grid.is-midi-moving",
    ".draw2-audio-midi-grid.is-midi-drawing",
    "#draw2AudioMidiToolStrip",
    "grid-column: 1 / -1 !important;",
    "#draw2AudioMidiSplit",
    'data-audio-ui-group="tools-secondary"]',
    "display: none !important;",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Piano Roll range editing style missing: ${required}`);
    }
  }
});

Deno.test("PC mode timeline caps preserve the primary workspace", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-pc-workspace-overrides.css", import.meta.url),
  );
  for (const required of [
    '[data-creator-mode="DRAW"]',
    '[data-creator-mode="AUDIO"]',
    '[data-creator-mode="GAME"]',
    "--draw2-pc-audio-timeline-height: clamp(",
    "min(24dvh, var(--draw2-timeline-height, 220px))",
    "min(26dvh, var(--draw2-timeline-height, 240px))",
    "min(32dvh, var(--draw2-timeline-height, 260px))",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`PC mode timeline sizing contract missing: ${required}`);
    }
  }
  for (const required of [
    "const timelineMinimumForViewport = (",
    "const timelineMaximumForViewport = (",
    "timelineMaximumForViewport(mode)",
    "const effectiveHeight = clampRailLayoutValue(",
    "timelineMinimumForViewport(),\n        timelineMaximumForViewport(),",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Timeline runtime sizing contract missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO desktop editing moves commands onto the timeline and shortcuts", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "const selectAudioTimelineBar =",
    "const selectAudioTimelineBarRange =",
    "const audioTimelineRangeFromEvent =",
    "const bindAudioTimelineDirectManipulation =",
    "const handleAudioWorkspaceShortcuts =",
    "Shift+Space",
    "double-click the lane to add",
    "audioMidiQuantizePreviewButton?.click()",
    "audioMidiStepInput?.click()",
    "audioSwingApply?.click()",
    "audioHumanize?.click()",
    "audioShortcutButton(\"draw2AudioDawDelete\")?.click()",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Desktop Audio direct-edit contract missing: ${required}`);
    }
  }
  for (const required of [
    "iAUDIO desktop command minimization v0.1",
    "#draw2AudioDawBarPlus",
    "#draw2AudioDawCopy",
    "#draw2AudioDawMove",
    "#draw2AudioMidiQuantizePreview",
    "#draw2AudioMidiPlaySelection",
    "#draw2AudioMidiExpressionAdd",
    "#draw2AudioDeckSave",
    "#draw2AudioBarStrip",
    "@media (min-width: 1120px)",
    "display: none !important;",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Desktop Audio command visibility contract missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO direct gestures expose live previews and cancel safely", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "readonly initialStartBar: number;",
    "currentStartBar: number;",
    "syncAudioTimelinePointerPreview",
    "release to select · Esc to cancel",
    "cancelAudioTimelinePointerGesture",
    "audioMidiErase?.erasedIds.has(note.id)",
    "release to delete · Esc to cancel",
    "const cancelAudioMidiPointerGesture =",
    "Erase preview cancelled · notes restored",
    "audioMidiExpressionCancel",
    "Selection preview cancelled",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Audio live-preview contract missing: ${required}`);
    }
  }
  for (const required of [
    "is-direct-preview",
    "is-direct-preview-anchor",
    ".draw2-audio-midi-grid.is-midi-erasing",
    ".draw2-audio-midi-expression-graph.is-expression-dragging",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Audio live-preview style missing: ${required}`);
    }
  }
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  for (const required of [
    "data-audio-midi-toolbar",
    "syncAudioMidiToolVisibility",
    "toolbar.hidden = direct",
    "toolbar.inert = direct",
  ]) {
    if (!source.includes(required) && !html.includes(required)) {
      throw new Error(`PC Piano Roll tool visibility contract missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO keeps note editing direct and exposes contextual precision only on selection", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    'id="draw2AudioMidiNoteContext"',
    'id="draw2AudioMidiNotePitch"',
    'id="draw2AudioMidiNoteStart"',
    'id="draw2AudioMidiNoteLength"',
    'id="draw2AudioMidiNoteVelocity"',
    "data-ui-tier=\"contextual\"",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Contextual MIDI note UI is missing: ${required}`);
    }
  }
  for (const required of [
    "const audioMidiContextSelectedNotes =",
    "const syncAudioMidiNoteContext =",
    "const applyAudioMidiContextEdit =",
    "audioMidiResizeAtPointer(event)",
    "projectionFrameCount",
    "if (nextFrameCount > audioFrameCount) extendAudioTimelineTo(nextFrameCount)",
    "Drag note to move · drag edge to resize",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Direct MIDI editing contract is missing: ${required}`);
    }
  }
  for (const required of [
    ".draw2-audio-midi-note-context",
    "#draw2AudioMidiGrid[data-audio-midi-cursor=\"note\"]",
    "#draw2AudioMidiGrid[data-audio-midi-cursor=\"start-resize\"]",
    "#draw2AudioMidiGrid.is-midi-moving",
    "#draw2AudioMidiNoteContext",
    "@media (max-width: 1119px)",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Direct MIDI presentation contract is missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO workspace builds refresh the lazy mutation module", async () => {
  const config = await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
  );
  const workspace = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  if (!config.includes('"build:audio-200-workspace"')) {
    throw new Error("The Audio workspace chunk must have an explicit build task.");
  }
  if (!config.includes('"build:workspace": "deno task build:audio-200-workspace')) {
    throw new Error(
      "The workspace build must refresh the lazy Audio mutation module first.",
    );
  }
  if (!config.includes('"build:workspace:min": "deno task build:audio-200-workspace')) {
    throw new Error(
      "The minified workspace build must refresh the lazy Audio mutation module first.",
    );
  }
  if (!workspace.includes('"audio-200-workspace.js?v=')) {
    throw new Error("The lazy Audio workspace module must use a cache-busting version.");
  }
  if (!workspace.includes("journalWorkspaceNoteBatchReplace(")) {
    throw new Error(
      "Piano Roll move and resize must use the atomic note batch mutation.",
    );
  }
});

Deno.test("iAUDIO P1 quantize and selection preview stay separate from full playback", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    'id="draw2AudioMidiQuantize"',
    'id="draw2AudioMidiQuantizeAmount"',
    'id="draw2AudioMidiQuantizeSwing"',
    'id="draw2AudioMidiQuantizePreview"',
    'id="draw2AudioMidiQuantizeApply"',
    'id="draw2AudioMidiQuantizeCancel"',
    'id="draw2AudioMidiPlaySelection"',
    'id="draw2AudioMidiScaleGuide"',
    'id="draw2AudioMidiScaleGuideMode"',
    'id="draw2AudioMidiStepInput"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`P1 Audio control markup missing: ${required}`);
    }
  }
  for (const required of [
    "quantizePianoRollNotes(",
    "audioMidiQuantizePreview",
    "note-quantize-batch",
    "source notes were restored",
    "audioSelectionScheduler",
    "selection-preview",
    "Stop the full composition before playing a selection",
    "guide only",
    "The scale guide is a visual aid only",
    "journalWorkspaceMusicalContext",
    "audioPitchForMusicalGuide",
    "SNAP",
    "RESTRICT",
    "audioMidiStepInputEnabled",
    "midi-step-input",
    "note-velocity-batch",
    "draw2-audio-midi-expression-graph",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`P1 Audio control contract missing: ${required}`);
    }
  }
});

Deno.test("Audio Clip end events clear the host playback state", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const workspace = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const runtime = await Deno.readTextFile(
    new URL("../src/audio/audio-240/long-audio-runtime.ts", import.meta.url),
  );
  for (const required of [
    "const audioStreamingRuntimeHasPendingSource",
    "runtime.snapshot()",
    "snapshot.activeSourceCount > 0",
    "snapshot.positionSeconds < timelineEnd - 0.05",
    "const finishAudioStreamingPreview",
    "onEnded: () => onAudioStreamingRuntimeEnded?.(),",
    "if (!audioDeckPlaying) stopAudioFrameTransport();",
    "const audioFlagResolution = resolveAudioFeatureFlag(",
    'queryAudioFlag, "on"',
  ]) {
    if (!workspace.includes(required)) {
      throw new Error(`Audio host completion contract missing: ${required}`);
    }
  }
  for (const required of [
    'data-audio-feature-flag="off"',
    "dist/draw2-entry.js?v=20260913-workspace-input-v1",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Audio entry cache contract missing: ${required}`);
    }
  }
  if (!runtime.includes("readonly onEnded?: () => void;")) {
    throw new Error("Long Audio runtime must expose its natural end callback.");
  }
  if (!runtime.includes("onEnded: () => options.onEnded?.(),")) {
    throw new Error("Long Audio runtime must forward scheduler end events.");
  }
});

Deno.test("iAUDIO playback keeps an audible test path and the trusted gesture", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const synth = await Deno.readTextFile(
    new URL("../src/audio/audio-240/chiptune-synth.ts", import.meta.url),
  );
  for (const required of [
    'value="0.6"',
    "60%</output>",
    "CHIP_SYNTH_DEFAULT_VOLUME",
    'Test tone scheduled · Master output signal is active',
    "audioChipPlay?.click();",
  ]) {
    if (!html.includes(required) && !source.includes(required)) {
      throw new Error(`Audible Audio recovery contract missing: ${required}`);
    }
  }
  if (!synth.includes("export const CHIP_SYNTH_DEFAULT_VOLUME = 0.6;")) {
    throw new Error("Synth and Audio UI must share one audible default.");
  }
  if (!entry.includes('workspaceChunkUrl.searchParams.set("v", "20260913-workspace-input-v1")')) {
    throw new Error("The lazy Audio workspace bundle must share the current cache version.");
  }
  if (!source.includes("\n      900,\n      \"triangle\",\n      1,")) {
    throw new Error("The Audio output test must remain long and audible enough to verify.");
  }
  for (const required of [
    "let audioCompositionStartGeneration = 0;",
    "const startGeneration = ++audioCompositionStartGeneration;",
    "startGeneration !== audioCompositionStartGeneration",
    "Notes Preview start cancelled · notes remain in the Piano Roll",
    "const readyPromise = ensureAudioPlaybackReady(\n      \"notes-preview\",",
    "requestAudioCompositionPlayback();\n    if (!await readyPromise) return;",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Audio start cancellation contract missing: ${required}`);
    }
  }
  const notesHandlerStart = source.indexOf(
    'audioChipPlay?.addEventListener("click", async () => {',
  );
  const notesHandler = notesHandlerStart >= 0
    ? source.slice(notesHandlerStart, notesHandlerStart + 10_000)
    : "";
  const preflightStart = notesHandler.indexOf(
    'const readyPromise = ensureAudioPlaybackReady(\n      "notes-preview",',
  );
  const intentStart = notesHandler.indexOf(
    "requestAudioCompositionPlayback();\n    if (!await readyPromise) return;",
  );
  if (
    preflightStart < 0 || intentStart < 0 || preflightStart > intentStart
  ) {
    throw new Error(
      "Audio start must install the pending preflight before setting PLAY.",
    );
  }
});

Deno.test("Character animation editor can change, replace, and delete frames safely", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    'id="draw2CharacterAnimationDelete"',
    'id="draw2CharacterAnimationAllFrames"',
    'id="draw2CharacterAnimationFrameReplace"',
    'id="draw2CharacterAnimationFrameDelete"',
    'id="draw2CharacterAnimationFramePrevious"',
    'id="draw2CharacterAnimationFrameNext"',
    'id="draw2CharacterAnimationFrameDuration"',
    'id="draw2CharacterAnimationLoop"',
    'id="draw2CharacterDirectionMode"',
    'data-character-direction="UP_RIGHT"',
    'data-character-direction="DOWN_LEFT"',
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Character animation editor control missing: ${required}`);
    }
  }
  for (const required of [
    "deleteCharacterSetupAnimation",
    "deleteCharacterSetupFrame",
    "moveCharacterSetupFrame",
    "replaceFrameIndex",
    "captureSelectionForFrame",
    "captureSelectionForFrames",
    "allFrames",
    "Object.entries(snapshot.frameNumbers)",
    "frameDurationsMs",
    "preserveDirectionlessDown",
    "clearAnimation",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Character animation mutation path missing: ${required}`);
    }
  }
});

Deno.test("iAUDIO lower timeline is a compact bar overview", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const rulerStart = source.indexOf("const renderAudioRuler =");
  const rulerEnd = source.indexOf("const syncAudioBarSelection =", rulerStart);
  const animationStart = source.indexOf("const renderAudioAnimationCells =");
  const animationEnd = source.indexOf("const ensureAudioMixerTrack =", animationStart);
  if (rulerStart < 0 || rulerEnd < 0 || animationStart < 0 || animationEnd < 0) {
    throw new Error("Audio overview render boundaries are missing");
  }
  for (const required of [
    "const AUDIO_TIMELINE_OVERVIEW_CELL_WIDTH = 112;",
    "const barsPerSlot",
    "audioOverviewSlotBarRange",
    "audioDeckOverviewSlots()",
    "audioAnimationCells.style.gridTemplateColumns",
    "const audioDrawFrameSegmentsForSlot =",
    "column.startMs",
    "appendAudioDrawFrameSegments(cell, segments, \"animation\")",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Compact Audio timeline contract missing: ${required}`);
    }
  }
  if (source.slice(rulerStart, rulerEnd).includes("audioFrameIndices()")) {
    throw new Error("Lower Audio ruler must not render every frame/sub-beat");
  }
  if (
    !source.slice(rulerStart, rulerEnd).includes("cell.title = barLabel;") ||
    source.slice(rulerStart, rulerEnd).includes("audioFramePositionLabel(slot.startFrame)")
  ) {
    throw new Error("Lower Audio ruler labels must stay at bar-level detail");
  }
  if (source.slice(animationStart, animationEnd).includes(
    "drawFrameColumns.map((column) => `${column.width}px`)",
  )) {
    throw new Error("Draw overview row must share compact bar columns");
  }
  if (
    !source.includes('dataset.audioDrawSegment = "true"') ||
    !source.includes("activeDrawFrame = audioFrameToDrawFrame(frame + 1) - 1")
  ) {
    throw new Error(
      "Draw overview must expose effective frame-duration segments and active frame state",
    );
  }
});

Deno.test("iAUDIO Draw segments preserve iDRAW frame timing inside fixed bar cells", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "startMs: elapsedMs",
    "endMs: elapsedMs + durationMs",
    "const slotDurationMs = Math.max(1, slotEndMs - slotStartMs)",
    "segment.widthPercent",
    "draw2-audio-animation-segments",
    "draw2-audio-draw-frame-segments",
  ]) {
    if (!source.includes(required) && !css.includes(required)) {
      throw new Error(`Draw timing projection contract missing: ${required}`);
    }
  }
  if (
    !css.includes(".draw2-audio-animation-segment.is-active") ||
    !css.includes("min-width: 1px")
  ) {
    throw new Error("Draw timing projection must show frame boundaries and active frame");
  }
});

Deno.test("PXD Game exports include the canonical Project for public iGAME", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const exportStart = source.indexOf(
    "const exportProjectPxdSnapshot = async",
  );
  const exportEnd = source.indexOf(
    "const restoreProjectPxdSnapshot = async",
    exportStart,
  );
  if (exportStart < 0 || exportEnd < 0) {
    throw new Error("PXD export boundary is missing");
  }
  const exportSource = source.slice(exportStart, exportEnd);
  for (const required of [
    "const canonicalStore = pixyncGameStore ??",
    "GameEditorCanonicalStore.create(gameRecord)",
    "const gameRecordForExport = await createGameEditorPersistenceRecord(",
    "project: canonicalStore.project",
    "record: gameRecordForExport",
  ]) {
    if (!exportSource.includes(required)) {
      throw new Error(`Public iGAME export contract missing: ${required}`);
    }
  }
});

Deno.test("PC keyboard ownership separates mode arrows, selection nudge, and Space", async () => {
  const workspace = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const selectionStart = entry.indexOf("const selectionNudgeKeys =");
  const selectionEnd = entry.indexOf("const shortcut =", selectionStart);
  const modeStart = workspace.indexOf("for (const button of creatorModeButtons)");
  const modeEnd = workspace.indexOf("const getAssetBridge", modeStart);
  if (selectionStart < 0 || selectionEnd < 0 || modeStart < 0 || modeEnd < 0) {
    throw new Error("Keyboard ownership boundaries are missing");
  }
  const selectionBlock = entry.slice(selectionStart, selectionEnd);
  const modeBlock = workspace.slice(modeStart, modeEnd);
  if (
    !entry.includes("const activeDrawGesture =") ||
    !entry.includes(
      'activeDrawGesture && drawArrowOwner === "DRAW_SELECTION"',
    )
  ) {
    throw new Error(
      "Draw arrows must not change frame/layer during an active gesture",
    );
  }
  for (const required of [
    "!interactiveTarget",
    "!event.defaultPrevented",
    "event.stopPropagation();",
  ]) {
    if (!selectionBlock.includes(required) && !modeBlock.includes(required)) {
      throw new Error(`Arrow ownership guard missing: ${required}`);
    }
  }
  if (!modeBlock.includes("event.stopPropagation();")) {
    throw new Error("Mode tabs must retain arrow ownership before document handlers");
  }
  for (const required of [
    "let pointerActivated = false;",
    "event.detail === 0",
    "button.blur();",
  ]) {
    if (!modeBlock.includes(required)) {
      throw new Error(
        `Mode activation must return raw arrows to the editor: ${required}`,
      );
    }
  }
  const playbackStart = workspace.indexOf("const handleWorkspacePlaybackKeydown =");
  const playbackEnd = workspace.indexOf(
    "const applyDesktopModeSurface =",
    playbackStart,
  );
  const playbackBlock = workspace.slice(playbackStart, playbackEnd);
  for (const required of [
    "event.preventDefault();",
    "event.stopImmediatePropagation();",
    "toggleCurrentModePlayback();",
  ]) {
    if (!playbackBlock.includes(required)) {
      throw new Error(`Space playback ownership missing: ${required}`);
    }
  }
  for (const required of [
    "const gameInputSurface = resolveDraw2ActiveSurface(",
    'gameInputSurface !== "GAME_STAGE"',
    'gameInputSurface !== "GAME_RUNTIME"',
  ]) {
    if (!workspace.includes(required)) {
      throw new Error(`GAME input ownership guard missing: ${required}`);
    }
  }
});

Deno.test("Draw2 keeps the legacy canvas source hidden on the project start screen", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const workspaceClassMarker = html.indexOf('class="draw2-workspace"');
  const legacyWorkspaceStart = html.lastIndexOf(
    "<section",
    workspaceClassMarker,
  );
  if (workspaceClassMarker < 0 || legacyWorkspaceStart < 0) {
    throw new Error("Legacy canvas source section is missing");
  }
  const openingTagEnd = html.indexOf(">", legacyWorkspaceStart);
  const openingTag = html.slice(legacyWorkspaceStart, openingTagEnd);
  if (!/\shidden(?:\s|$)/u.test(openingTag)) {
    throw new Error(
      "Legacy canvas source must stay hidden until a project opens the workspace",
    );
  }
  if (
    !css.includes(".draw2-workspace[hidden]") ||
    !css.includes("display: none !important")
  ) {
    throw new Error(
      "Legacy canvas source must not be restored by the workspace display rule",
    );
  }
});

Deno.test("WP-180 viewport controls use canonical steps and measured display dimensions", async () => {
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const workspace = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "function stepViewportZoom(direction: -1 | 1)",
    "stepZoom: (direction: -1 | 1)",
    "draw2ViewportBridge()?.stepZoom(-1)",
    "draw2ViewportBridge()?.stepZoom(1)",
    "--draw2-canvas-display-width",
    "--draw2-canvas-display-height",
    "max-width: none !important",
    "max-height: none !important",
  ]) {
    if (!entry.includes(required) && !workspace.includes(required) && !css.includes(required)) {
      throw new Error(`Viewport contract missing: ${required}`);
    }
  }
  for (const legacyStep of [
    "snapshot.zoom + 0.25",
    "snapshot.zoom - 0.25",
  ]) {
    if (workspace.includes(legacyStep)) {
      throw new Error(`Legacy viewport step remains: ${legacyStep}`);
    }
  }
});

Deno.test("WP-180 color wheel stays inside a short resizable color panel", async () => {
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "function syncPaletteWheelLayout()",
    "--draw2-color-map-size",
    "is-color-wheel-compact",
    "#draw2WorkspacePanelColor",
    "#draw2PaletteWheel",
  ]) {
    if (!entry.includes(required) && !css.includes(required)) {
      throw new Error(`Color-wheel containment contract missing: ${required}`);
    }
  }
  if (
    !css.includes("height: var(--draw2-color-map-size, 180px) !important") ||
    !css.includes(".is-color-wheel-compact")
  ) {
    throw new Error("Color-wheel size must follow the measured panel space");
  }
});

Deno.test("PiXiEEDstudio keeps the desktop rail contract on smaller viewports", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const shellCss = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const playerCss = await Deno.readTextFile(
    new URL("../assets/igame-player.css", import.meta.url),
  );
  for (const forbidden of [
    "data-mobile-only-left-dock-chrome",
    "draw2-mobile-toolbar",
    "draw2-mobile-color-rail",
    "draw2GameMobileNav",
    "draw2GamePreviewMobileControls",
    "data-game-mobile-action",
    "data-igame-panel",
    "draw2GameSceneRulesMobile",
    "draw2-game-maker-device-tab",
    "draw2-game-maker-device-tabs",
  ]) {
    if (html.includes(forbidden) || shellCss.includes(forbidden)) {
      throw new Error(`Retired mobile/tablet presentation remains: ${forbidden}`);
    }
  }
  if (!/@media\s*\(max-width:\s*700px\)/i.test(shellCss)) {
    throw new Error("The adjustable rail shell must define a small-viewport projection");
  }
  if (html.includes("viewport-fit=cover")) {
    throw new Error("Mobile safe-area viewport presentation must be absent");
  }
});

Deno.test("WP-180 PC creator modes expose specialized panel families", () => {
  const draw = resolveDesktopCreatorModeProfile("DRAW");
  const game = resolveDesktopCreatorModeProfile("GAME");
  const audio = resolveDesktopCreatorModeProfile("AUDIO");
  if (
    !draw.showPalette || !draw.showTimeline ||
    draw.timelineSurface !== "draw" ||
    !draw.showDrawingTools || draw.defaultPanel !== "color"
  ) {
    throw new Error("DRAW must own Color and animation timeline surfaces");
  }
  if (
    game.showPalette || !game.showTimeline || game.timelineSurface !== "game" ||
    game.showDrawingTools || game.defaultPanel !== "game-inspector" ||
    !game.allowedPanels.includes("game-scene")
  ) {
    throw new Error(
      "GAME must expose Inspector/Scene surfaces without Draw palette",
    );
  }
  if (
    audio.showPalette || !audio.showTimeline ||
    audio.timelineSurface !== "audio" ||
    audio.showDrawingTools || audio.defaultPanel !== "audio" ||
    audio.allowedPanels.includes("color")
  ) {
    throw new Error("AUDIO must remain color-free and audio-specialized");
  }
});

Deno.test("WP-180 desktop resize notifications are coalesced", () => {
  const callbacks = new Map<number, () => void>();
  let nextHandle = 0;
  let notifications = 0;
  const scheduler = createCoalescedNotifier((callback) => {
    const handle = ++nextHandle;
    callbacks.set(handle, callback);
    return handle;
  }, (handle) => {
    callbacks.delete(handle);
  }, () => {
    notifications += 1;
  });
  scheduler.request();
  scheduler.request();
  scheduler.request();
  if (!scheduler.pending() || callbacks.size !== 1) {
    throw new Error("Resize callbacks were not coalesced");
  }
  const scheduled = callbacks.values().next().value as (() => void) | undefined;
  callbacks.clear();
  scheduled?.();
  if (scheduler.pending() || notifications !== 1) {
    throw new Error("Coalesced callback did not flush once");
  }
  scheduler.request();
  scheduler.cancel();
  if (scheduler.pending() || callbacks.size > 0) {
    throw new Error("Resize callback cleanup failed");
  }
});

Deno.test("WP-180 desktop tool flyouts are hidden unless their group is open", () => {
  if (countVisibleToolPopovers([false, false, false, false]) !== 0) {
    throw new Error("Closed tool flyouts are visible");
  }
  if (countVisibleToolPopovers([false, true, false, false]) !== 1) {
    throw new Error("More than one tool flyout is visible");
  }
});

Deno.test("WP-180 virtualization remains bounded for 1000 frames and 100 layers", () => {
  const frames = calculateBoundedWindow(1000, 44, 22_000, 440, 3);
  const layers = calculateBoundedWindow(100, 38, 1_140, 228, 2);
  if (
    frames.totalItems !== 1000 || frames.visibleItems !== 10 ||
    frames.mountedItems > 16
  ) {
    throw new Error(
      `Frame projection is not bounded: ${JSON.stringify(frames)}`,
    );
  }
  if (
    layers.totalItems !== 100 || layers.visibleItems !== 6 ||
    layers.mountedItems > 10
  ) {
    throw new Error(
      `Layer projection is not bounded: ${JSON.stringify(layers)}`,
    );
  }
  if (
    frames.startIndex < 0 || frames.endIndex > 1000 || layers.startIndex < 0 ||
    layers.endIndex > 100
  ) throw new Error("Virtual window escaped bounds");
});

Deno.test("WP-180 workspace state is local-only and panel mount does not recreate Core", () => {
  const state = createWorkspaceState();
  if (
    !isWorkspaceOnlyStateKey("panelSizes") ||
    !isWorkspaceOnlyStateKey("localTool") || isWorkspaceOnlyStateKey("raster")
  ) throw new Error("Workspace state boundary mismatch");
  const hidden = createPanelMountRecord("color");
  const mounted = transitionPanelMount(hidden, "mounted");
  const active = transitionPanelMount(mounted, "active");
  if (
    active.mountCount !== 1 || active.activeCount !== 1 ||
    active.state !== "active"
  ) throw new Error("Panel mount lifecycle mismatch");
});

Deno.test("WP-180 shortcuts suppress editing/modal/sheet contexts", () => {
  const registry = createWorkspaceCommandRegistry([{
    id: "undo",
    version: 1,
    label: "Undo",
    shortcut: "mod+z",
    regions: ["topbar"],
  }]);
  const allowed = resolveShortcut("z", {
    meta: true,
    ctrl: false,
    shift: false,
    alt: false,
  }, {
    modalOpen: false,
    sheetOpen: false,
    inputEditing: false,
    imeComposing: false,
  }, registry);
  const editing = resolveShortcut("z", {
    meta: true,
    ctrl: false,
    shift: false,
    alt: false,
  }, {
    modalOpen: false,
    sheetOpen: false,
    inputEditing: true,
    imeComposing: false,
  }, registry);
  const sheet = resolveShortcut("z", {
    meta: true,
    ctrl: false,
    shift: false,
    alt: false,
  }, {
    modalOpen: false,
    sheetOpen: true,
    inputEditing: false,
    imeComposing: false,
  }, registry);
  if (
    allowed?.commandId !== "undo" || editing !== undefined ||
    sheet !== undefined
  ) throw new Error("Shortcut suppression mismatch");
});

Deno.test("WP-180 hot path metrics keep workspace updates localized", () => {
  const metrics = createWorkspaceHotPathMetrics();
  for (let index = 0; index < 120; index += 1) {
    recordPointerSample(metrics);
    recordCanvasProjection(metrics);
  }
  recordWorkspaceUpdate(metrics, ["right_dock"]);
  if (
    metrics.pointerSamples !== 120 || metrics.canvasProjectionUpdates !== 120 ||
    metrics.workspaceUpdates !== 1 || metrics.coreRecreationCount !== 0
  ) throw new Error(`Hot path metrics mismatch: ${JSON.stringify(metrics)}`);
  if (
    resolveInputOwner("resize") !== "workspace" ||
    resolveInputOwner("timeline") !== "timeline"
  ) throw new Error("Input ownership mismatch");
});

Deno.test("PC Draw tool rail stays fixed and parent-only", async () => {
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (
    const required of [
      '[data-workspace-profile="desktop"][data-creator-mode="DRAW"]',
      "--draw2-left-rail-min-width: 52px",
      "--draw2-left-rail-width: 52px",
      "--draw2-tool-rail-width: 52px",
      "> .draw2-tool-button",
      ".draw2-tool-group:not([open])",
      "pointer-events: none !important",
      "#draw2WorkspaceFrame.is-tool-flyout-open",
      "z-index: 10001 !important",
      "#draw2WorkspaceLeftDock\n    > .draw2-workspace-toolbar",
      "z-index: 10002 !important",
      ".draw2-tool-popover.is-flyout-positioned {\n  position: fixed !important;",
      "grid-template-columns: minmax(0, 1fr) !important;",
      "justify-content: stretch !important;",
      "visibility: visible !important",
      "pointer-events: auto !important",
      "[data-workspace-profile=\"desktop\"][data-creator-mode=\"DRAW\"].is-tool-flyout-open",
    ]
  ) {
    if (!css.includes(required)) {
      throw new Error(`Fixed PC tool rail contract missing: ${required}`);
    }
  }
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  for (
    const forbidden of [
      "data-tool-rail-presentation",
      "syncToolRailPresentation",
      "draw2WorkspaceLeftResize",
    ]
  ) {
    if (
      css.includes(forbidden) || source.includes(forbidden) ||
      html.includes(forbidden)
    ) {
      throw new Error(`Removed PC tool rail behavior remains: ${forbidden}`);
    }
  }
  if (!source.includes("closeToolGroups();")) {
    throw new Error("Draw must close restored child tool menus on boot");
  }
  if (
    !css.includes("left: calc(100% + 4px);") ||
    css.includes("right: calc(100% +") ||
    !source.includes("frameIsEmbedded") ||
    !source.includes("positionToolPopover(group);\n      windowRef.requestAnimationFrame")
  ) {
    throw new Error(
      "Draw flyouts must use the left-rail fallback and position before the first paint",
    );
  }
  if (
    html.includes("draw2-selection-stamp-panel") ||
    html.includes("draw2SelectionStampSave") ||
    html.includes("draw2SpecialTileScale") ||
    html.includes('data-workspace-tool="pixel-pen"') ||
    html.includes('data-workspace-tool="select-polygon"') ||
    html.includes('data-workspace-tool="tile-stamp"')
  ) {
    throw new Error(
      "The retired 1px, polygon-selection, and tile-stamp UI must stay absent",
    );
  }
  for (const required of [
    'data-workspace-tool="text"',
    "draw2ColorHistory",
    "draw2ColorRampPreview",
    "draw2ColorRampCreate",
    "draw2OutlineApply",
    "draw2TextInsertDialog",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`The iDRAW authoring surface is missing: ${required}`);
    }
  }
  if (
    !source.includes('group.addEventListener("toggle"') ||
    !source.includes("syncToolGroup(group)") ||
    !source.includes("selectToolGroupDefault(group, summary)") ||
    !source.includes("is-tool-flyout-open")
  ) {
    throw new Error(
      "Tool parent flyouts must synchronize native details toggles and the active child tool",
    );
  }
});

Deno.test("PC GAME/AUDIO rails preserve a practical central workspace", async () => {
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    '--draw2-center-workspace-min-width: 420px',
    'minmax(var(--draw2-center-workspace-min-width), 1fr)',
    'overflow-x: auto;',
    'padding-block: var(--draw2-workspace-rail-block-padding);',
    '@media (min-width: 1120px)',
    '--draw2-center-workspace-min-width: 560px',
  ]) {
    if (!css.includes(required)) {
      throw new Error(`Central workspace protection contract missing: ${required}`);
    }
  }
  const guardCommentStart = css.lastIndexOf(
    '/* Desktop GAME/AUDIO workspace guard.',
  );
  const guardMediaStart = css.indexOf(
    '@media (min-width: 701px)',
    guardCommentStart,
  );
  if (guardCommentStart < 0 || guardMediaStart < 0) {
    throw new Error("Desktop GAME/AUDIO workspace guard is missing");
  }
  let guardDepth = 0;
  let guardEnd = -1;
  for (let index = guardMediaStart; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") guardDepth += 1;
    if (character === "}") {
      guardDepth -= 1;
      if (guardDepth === 0) {
        guardEnd = index + 1;
        break;
      }
    }
  }
  const drawModeGuard = css.slice(
    guardCommentStart,
    guardEnd > guardCommentStart ? guardEnd : undefined,
  );
  if (drawModeGuard.includes('data-creator-mode="DRAW"')) {
    throw new Error("Central workspace protection must not change DRAW tool rail");
  }
  for (const required of [
    'data-creator-mode="GAME"',
    'data-creator-mode="AUDIO"',
    'minmax(220px, min(320px, max(220px, var(--draw2-left-rail-width, 244px))))',
    'minmax(200px, min(320px, max(200px, var(--draw2-right-dock-width, 280px))))',
  ]) {
    if (!drawModeGuard.includes(required)) {
      throw new Error(`Rail sizing contract missing: ${required}`);
    }
  }
});

Deno.test("Locked Timeline cells remain selectable without a prohibited cursor", async () => {
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const lockedCellRule = '.draw2-timeline-cell[data-locked="true"]';
  const start = css.indexOf(lockedCellRule);
  const end = css.indexOf("}", start);
  if (
    start < 0 || end < 0 || !css.slice(start, end).includes("cursor: pointer")
  ) {
    throw new Error("Locked Timeline cells must remain selectable");
  }
});

Deno.test("PC Timeline entry controls the visible Timeline surface", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  if (!html.includes('id="draw2TimelineCollapse"')) {
    throw new Error("PC Timeline collapse control markup is missing");
  }
  for (
    const required of [
      "setDesktopTimelineCollapsed",
      "toggleTimelineSurface",
      "--draw2-timeline-height",
      'case "timeline-toggle":',
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`PC Timeline control contract missing: ${required}`);
    }
  }
});

Deno.test("Asset dock reactivates visible tabs and panel content", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  if (
    !html.includes('id="draw2WorkspaceTabAssets"') ||
    !html.includes('id="draw2WorkspacePanelAssets"') ||
    !html.includes('id="draw2CreatorAssetSurface"')
  ) {
    throw new Error("Asset dock markup is missing");
  }
  for (const required of [
    "tab.inert = !visible;",
    'tab.setAttribute("aria-hidden", String(!visible));',
    "content.inert = !selected;",
    "creatorAssetSurface.inert = !assetSurfaceActive;",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Asset dock accessibility contract missing: ${required}`);
    }
  }
});

Deno.test("iGAME hierarchy and physics Inspector stay in the Game-only boundary", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "draw2GameInspectorActive",
    "draw2GameInspectorParent",
    "draw2GamePhysicsGravityX",
    "draw2GamePhysicsFixedDeltaTime",
    "draw2GamePhysicsMaxSubSteps",
    "draw2GamePhysicsFriction",
    "draw2GamePhysicsBounciness",
    "parentTrackId",
    "gameHierarchyCollapsed",
    "normalizePhysics2DSettings",
    "queueGameEditorPersistenceSave(\"physics-edit\")",
    "draw2-game-hierarchy-children",
    "draw2GameSceneViewport",
    "draw2GameSceneSvg",
    "renderGameSceneViewport",
    "draw2-game-scene-tilemap-hit",
    "createDefaultRpgTilemapDocument",
    "paintGameTilemapCell",
    "draw2-game-scene-map-cell",
    "gameTilemapPaintMode",
    'className === "draw2-game-scene-entry"',
    'className === "draw2-game-hierarchy-entry"',
    "documentRef.addEventListener(\"pointermove\"",
    "ドラッグ配置",
  ]) {
    if (!html.includes(required) && !source.includes(required) && !css.includes(required)) {
      throw new Error(`iGAME UI contract missing: ${required}`);
    }
  }
  if (html.includes("sourceBytes")) {
    throw new Error("iGAME Inspector must not expose source bytes");
  }
  if (
    !source.includes("isGameTrackUnder(requestedParent, selected.id)") ||
    !source.includes("自分自身・子孫・存在しない対象は選べません")
  ) {
    throw new Error("iGAME parent selection must reject unsafe targets");
  }
});

Deno.test("iGAME Game UI node entrances remain reachable and Inspector-linked", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const rail = html.match(
    /<section\b[^>]*id=["']draw2GamePlaygroundSourceRail["'][^>]*>[\s\S]*?<\/section>/iu,
  )?.[0] ?? "";
  if (
    rail.length === 0 ||
    /\shidden(?:\s|=|>)/iu.test(rail) ||
    /\sinert(?:\s|=|>)/iu.test(rail)
  ) {
    throw new Error("Game UI node rail must not be hidden or inert");
  }
  const nodes = rail.match(
    /<button\b[^>]*data-game-ui-node-kind=["'][^"']+["'][^>]*>/giu,
  ) ?? [];
  if (nodes.length !== 3) {
    throw new Error("Production must expose exactly three Game UI node entrances");
  }
  for (const kind of ["BUTTON", "MINIMAP", "INVENTORY"]) {
    const node = nodes.find((entry) =>
      new RegExp(`data-game-ui-node-kind=["']${kind}["']`, "iu").test(entry)
    );
    if (
      node === undefined ||
      !/\stype=["']button["']/iu.test(node) ||
      !/\sdraggable=["']true["']/iu.test(node)
    ) {
      throw new Error(`Game UI node entrance contract missing: ${kind}`);
    }
  }
  const inspector = html.match(
    /<section\b[^>]*id=["']draw2GamePlaygroundInspector["'][^>]*>/iu,
  )?.[0] ?? "";
  if (
    !/\saria-labelledby=["']draw2GamePlaygroundInspectorHeading["']/iu.test(inspector) ||
    !html.includes('id="draw2GamePlaygroundInspectorHeading"')
  ) {
    throw new Error("Game UI node destination must expose the Inspector label hook");
  }
  const compactSource = source.replace(/\s+/gu, " ");
  for (const required of [
    'queryAll<HTMLButtonElement>(documentRef, "[data-game-ui-node-kind]")',
    'tile.addEventListener("dragstart"',
    'tile.addEventListener("click"',
    'application/x-draw2-game-ui-node',
    'setPanel("game-inspector")',
  ]) {
    if (!compactSource.includes(required)) {
      throw new Error(`Game UI node Inspector route is missing: ${required}`);
    }
  }
});

Deno.test("iGAME startup route refresh is idempotent across async initialization", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (const required of [
    "let site400RouteRefreshQueue: Promise<void> = Promise.resolve();",
    "const currentRouteProject = site400IGameRoute.currentProject();",
    "const effectiveOperation = operation === \"create\"",
    "site400RouteRefreshQueue.then(run, run)",
  ]) {
    if (!source.includes(required)) {
      throw new Error(`iGAME startup route race guard missing: ${required}`);
    }
  }
});

Deno.test("iGAME new-project choice stays reachable in a compact desktop dock", async () => {
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    '[data-workspace-profile="desktop"][data-creator-mode="GAME"]',
    "#draw2WorkspacePanelGameScene",
    "#draw2GameCreationMode:not([hidden])",
    "scroll-padding-block-start: 8px",
    "order: -1",
  ]) {
    if (!css.includes(required)) {
      throw new Error(`iGAME creation choice reachability guard missing: ${required}`);
    }
  }
});

Deno.test("Studio Game Build exposes a safe Release Candidate boundary", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      'id="draw2GameStudioReleaseCandidate"',
      'id="draw2GameStudioReleaseManifest"',
      'id="draw2GameStudioPublishIntent"',
      'id="draw2GameStudioReleaseArtifact"',
      'id="draw2GameStudioReleaseArtifactDownload"',
      'id="draw2GameStudioReleaseManifestPreview"',
      'id="draw2GameStudioReleaseStatus"',
      "createStudioReleaseCandidate",
      "createStudioPublishIntent",
      "materializeStudioReleaseArtifact",
      "exportProjectPxdArtifact",
      "sourceStateHash",
      "外部アップロード・公開は行いません",
    ]
  ) {
    if (!html.includes(required) && !source.includes(required)) {
      throw new Error(
        `Studio Release Candidate UI contract missing: ${required}`,
      );
    }
  }
  if (
    !source.includes(
      "current.value.manifest.packageHash !== candidate.manifest.packageHash",
    )
  ) {
    throw new Error("Publish Intent must reject stale Draw/Audio references.");
  }
});
