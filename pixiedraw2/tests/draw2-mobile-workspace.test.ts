import {
  nextDraw2MobileDrawerMode,
  snapDraw2MobileDrawerMode,
} from "../src/draw2-mobile-workspace.ts";

Deno.test("Draw2 mobile detail drawer toggles HALF FULL", () => {
  if (nextDraw2MobileDrawerMode("half") !== "full") {
    throw new Error("HALF must expand FULL");
  }
  if (nextDraw2MobileDrawerMode("full") !== "half") {
    throw new Error("FULL must return HALF");
  }
});

Deno.test("Mode playback shares one command button and mode-local Space shortcut", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const drawEntry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  for (
    const required of [
      'id="draw2ModePlaybackButton"',
      "data-mode-playback",
      'aria-keyshortcuts="Space"',
      'id="draw2GameDeckPlay"',
      'id="draw2AudioDeckPlay"',
      'id="draw2AudioChipPlay"',
      'id="draw2AudioAddInstrument"',
      'id="draw2AudioAddFrames"',
      'id="draw2AudioClearBar"',
      'id="draw2AudioMidiInstrument"',
      'id="draw2AudioNoteLength"',
      'id="draw2AudioMidiStatus"',
      'id="draw2TimelineReadout"',
      'id="draw2TimelinePosition"',
      'id="draw2TimelineDuration"',
    ]
  ) {
    if (!html.includes(required)) {
      throw new Error(`Playback control missing: ${required}`);
    }
  }
  for (
    const required of [
      "currentCreatorMode",
      "toggleCurrentModePlayback",
      'new CustomEvent("draw2:draw-playback-request"',
      "syncModePlaybackButton",
      'event.code === "Space"',
      "spaceKey",
      "toggleCurrentModePlayback",
      'mode === "DRAW"',
      'mode === "GAME"',
      'mode === "AUDIO"',
      "Space is reserved for global playback",
      'event.key === "Delete"',
      "journalWorkspaceTimelineBarClear",
      "!isEditableTarget(event.target)",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Playback behavior missing: ${required}`);
    }
  }
  for (
    const required of [
      "workspacePlaybackSpace",
      'event.code === "Space"',
      "selection-confirm",
      "formatTimelineClock",
      "draw2-timeline-time-ruler",
      "draw2-timeline-playhead-label",
      "dataset.durationMs",
    ]
  ) {
    if (!drawEntry.includes(required)) {
      throw new Error(`Draw shortcut handoff missing: ${required}`);
    }
  }
  if (
    source.indexOf("const spaceKey") < 0 ||
    source.indexOf("const spaceKey") > source.indexOf("const resolution")
  ) {
    throw new Error(
      "Workspace must route Space playback before generic shortcuts",
    );
  }
  if (drawEntry.includes("workspacePlaybackEnter")) {
    throw new Error("Enter must not be a workspace playback shortcut");
  }
  if (!drawEntry.includes("workspaceMode && !dialogOpen && !event.isComposing")) {
    throw new Error("Focused fields must hand Space to workspace playback");
  }
  if (!drawEntry.includes('window.addEventListener("draw2:draw-playback-request"')) {
    throw new Error("Draw playback request is not connected to the Draw engine");
  }
});

Deno.test("Focused fields hand the first pointer action to Canvas and rails", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const marker of [
    'document.addEventListener("pointerdown"',
    'target.closest("input, textarea, select, [contenteditable=true]")',
    "if (event.cancelable) event.preventDefault();",
    "if (document.activeElement === active) active.blur();",
    'if (event.key !== "Enter" || event.isComposing) return;',
    "field.blur();",
  ]) {
    if (!source.includes(marker)) throw new Error(`Focus handoff missing: ${marker}`);
  }
  for (const duplicate of [
    "#draw2TogglePlayback",
    "#draw2AssetBuilderPreviewPlay",
    "#draw2AudioPanelPlay",
    "#draw2GameDeckPlay",
    "#draw2AudioDeckPlay",
    "#draw2AudioChipPlay",
  ]) {
    if (!css.includes(duplicate)) throw new Error(`Duplicate Play control remains visible: ${duplicate}`);
  }
});

Deno.test("Draw and Audio clocks remain independently owned", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  if (
    !/id="draw2AudioDeckFps"[\s\S]{0,240}disabled/.test(html) ||
    !html.includes("Audio internal resolution (read-only)")
  ) {
    throw new Error("Audio resolution must remain a disabled Audio value");
  }
  if (!html.includes("Follow Draw playhead by elapsed time")) {
    throw new Error("Cross-mode playhead must use elapsed time");
  }
  const fpsHandler = source.indexOf(
    'audioFpsControl?.addEventListener("change"',
  );
  if (fpsHandler < 0) throw new Error("Audio FPS guard handler missing");
  const fpsHandlerBody = source.slice(fpsHandler, fpsHandler + 1_200);
  if (
    fpsHandlerBody.includes("setWorkspaceFrameRate") ||
    fpsHandlerBody.includes("#draw2PlaybackFps") ||
    fpsHandlerBody.includes("dispatchEvent")
  ) {
    throw new Error("Audio FPS must not write back to Draw");
  }
  for (
    const required of [
      "Audio owns its transport resolution",
      "Draw and Audio keep independent authored clocks",
      "Audio internal resolution · Draw FPS is independent",
      "elapsed wall-clock time",
      "journalWorkspaceTempo",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(
        `Draw/Audio clock separation marker missing: ${required}`,
      );
    }
  }
});

Deno.test("Audio Piano Roll starts at one measure and zooms only its time axis", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      'id="draw2AudioMidiZoomOut"',
      'id="draw2AudioMidiZoomValue"',
      'id="draw2AudioMidiZoomIn"',
      "Control + scroll: horizontal zoom",
    ]
  ) {
    if (!html.includes(required)) {
      throw new Error(`Piano Roll zoom control marker missing: ${required}`);
    }
  }
  for (
    const required of [
      "let audioMidiHorizontalZoom = 1",
      "AUDIO_MIDI_HORIZONTAL_ZOOM_MIN",
      "audioMidiHorizontalZoom * factor",
      "wheel.ctrlKey",
      "wheel.preventDefault()",
      "audioMidiHorizontalZoom,",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Piano Roll horizontal zoom marker missing: ${required}`);
    }
  }
  const columnWidth = source.indexOf("const audioMusicalGridColumns");
  const columnWidthEnd = source.indexOf("const audioTotalBars", columnWidth);
  if (
    columnWidth < 0 || columnWidthEnd < 0 ||
    !source.slice(columnWidth, columnWidthEnd).includes(
      "audioMidiHorizontalZoom",
    )
  ) {
    throw new Error(
      "Piano Roll musical columns must apply horizontal zoom without using Draw cells",
    );
  }
});

Deno.test("Audio runtime stays lazy across Piano Roll mutations", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      "audioProjectedTrackEffectsKey",
      "audioGeneratedArtifactKey",
      'root.dataset.audioEventGraphState = "idle"',
      "chipTuneSynth.getAudioContext()?.state",
      "chipTuneSynth.resume()",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(
        `Audio lightweight projection marker missing: ${required}`,
      );
    }
  }
  const mutationStart = source.indexOf(
    "const queueAudioWorkspaceMutation =",
  );
  const transitionStart = source.indexOf(
    "const queueAudioWorkspaceTransition =",
  );
  if (mutationStart < 0 || transitionStart <= mutationStart) {
    throw new Error("Audio mutation queue boundary is missing");
  }
  const mutationBody = source.slice(mutationStart, transitionStart);
  if (mutationBody.includes("ensureAudioStreamingRuntime()")) {
    throw new Error(
      "Piano Roll mutations must not create a long-audio runtime eagerly",
    );
  }
});

Deno.test("Audio mutation autosaves are coalesced without delaying explicit saves", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      "const AUDIO_PERSISTENCE_AUTOSAVE_DEBOUNCE_MS = 250",
      "const flushAudioPersistenceSave =",
      'if (reason !== "mutation")',
      "void flushAudioPersistenceSave();",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(
        `Audio persistence coalescing marker missing: ${required}`,
      );
    }
  }
  const queueStart = source.indexOf("const queueAudioPersistenceSave =");
  const queueEnd = source.indexOf(
    "const syncAudioWorkspaceUiFromSession =",
    queueStart,
  );
  if (queueStart < 0 || queueEnd <= queueStart) {
    throw new Error("Audio persistence queue boundary is missing");
  }
  const queueBody = source.slice(queueStart, queueEnd);
  if (
    !queueBody.includes("audioPersistenceSaveTimer") ||
    !queueBody.includes("AUDIO_PERSISTENCE_AUTOSAVE_DEBOUNCE_MS")
  ) {
    throw new Error("Mutation autosave debounce is not wired to the queue");
  }
});

Deno.test("Audio Global Transport shares one composition playback state", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      "type AudioCompositionTransportState =",
      "const requestAudioCompositionPlayback =",
      "const cancelAudioCompositionPlayback =",
      "function syncAudioCompositionTransportState(): void",
      "root.dataset.audioTransportState",
      "const stopAudioCompositionPlayback =",
      'audioCompositionTransportState === "PLAYING"',
      'audioCompositionTransportState !== "STOPPED"',
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Audio Global Transport marker missing: ${required}`);
    }
  }
  if (source.includes("stopAudioRealtimeForFreeze")) {
    throw new Error("Legacy Audio realtime stop boundary remains");
  }
  const globalTransportStart = source.indexOf(
    "const syncAudioGlobalTransport =",
  );
  const globalTransportEnd = source.indexOf(
    "const syncAudioGlobalReadout =",
    globalTransportStart,
  );
  if (globalTransportStart < 0 || globalTransportEnd <= globalTransportStart) {
    throw new Error("Audio Global Transport boundary is missing");
  }
  const globalTransportBody = source.slice(
    globalTransportStart,
    globalTransportEnd,
  );
  if (!globalTransportBody.includes("syncAudioCompositionTransportState();")) {
    throw new Error("Global Transport does not refresh composition state");
  }
  const toggleStart = source.indexOf(
    "const toggleAudioCompositionPlayback =",
  );
  const toggleEnd = source.indexOf(
    "audioGlobalStop?.addEventListener",
    toggleStart,
  );
  if (toggleStart < 0 || toggleEnd <= toggleStart) {
    throw new Error("Audio composition toggle boundary is missing");
  }
  const toggleBody = source.slice(toggleStart, toggleEnd);
  if (
    !toggleBody.includes('audioCompositionTransportState === "PLAYING"') ||
    !toggleBody.includes('audioCompositionTransportState === "RECOVERING"') ||
    !toggleBody.includes("requestAudioCompositionPlayback()") ||
    !toggleBody.includes("cancelAudioCompositionPlayback()")
  ) {
    throw new Error("Global Transport does not use the shared state boundary");
  }
});

Deno.test("Audio seeks re-arm chip and bounded Clip transports", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      "let audioTransportResyncGeneration = 0",
      "const audioFrameToTransportSeconds =",
      "const audioTransportSecondsToFrame =",
      "function seekAudioCompositionAtFrame(",
      "audioTransportResyncInFlight = true",
      "runtime.play(positionSeconds, audioLoopEnabled)",
      "runtime.positionSeconds",
      "const seekAudioDeckPreviewToFrame =",
      "rebuildStreamingRuntimes: true",
      "const restartAudioChipSchedulerAtCurrentFrame =",
      "chipTuneSynth.stopAll();",
      "seekAudioCompositionAtFrame(Number(audioFrameCursor.value));",
      "seekAudioCompositionAtFrame(frameIndex + 1);",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Audio seek integration marker missing: ${required}`);
    }
  }
  const timerBodyStart = source.indexOf(
    "audioFrameTransportTimer = windowRef.setInterval(() =>",
  );
  const timerBodyEnd = source.indexOf(
    "const restartAudioChipSchedulerAtCurrentFrame =",
    timerBodyStart,
  );
  if (timerBodyStart < 0 || timerBodyEnd <= timerBodyStart) {
    throw new Error("Audio frame transport timer boundary is missing");
  }
  const timerBody = source.slice(timerBodyStart, timerBodyEnd);
  if (!timerBody.includes("if (audioTransportResyncInFlight) return;")) {
    throw new Error("Frame transport does not pause during source resync");
  }
});

Deno.test("AudioContext lifecycle keeps composition intent recoverable", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  for (
    const required of [
      "type AudioPlaybackRecoverySources =",
      "let audioPlaybackRecoveryPending = false",
      "const scheduleAudioCompositionRecovery =",
      "finishAudioPlaybackRecovery",
      "root.dataset.audioPlaybackRecovery = `pending:${state}`",
      'documentRef.addEventListener("visibilitychange"',
      'windowRef.addEventListener("pageshow"',
      'windowRef.addEventListener("focus"',
      'state === "running" && audioPlaybackRecoveryPending',
      'audioCompositionTransportIntent = "PLAY"',
      "onComplete: (succeeded) =>",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Audio lifecycle recovery marker missing: ${required}`);
    }
  }
  const lifecycleStart = source.indexOf(
    "audioPlaybackLifecycleUnsubscribe = chipTuneSynth.onContextStateChange(",
  );
  const lifecycleEnd = source.indexOf(
    "const disposeAudioStreamingRuntime =",
    lifecycleStart,
  );
  if (lifecycleStart < 0 || lifecycleEnd <= lifecycleStart) {
    throw new Error("AudioContext lifecycle boundary is missing");
  }
  const lifecycleBody = source.slice(lifecycleStart, lifecycleEnd);
  if (lifecycleBody.includes("cancelAudioCompositionPlayback();")) {
    throw new Error(
      "AudioContext interruption must preserve PLAY intent for recovery",
    );
  }
});

Deno.test("Draw2 mobile drawer drag snaps to bounded modes", () => {
  if (snapDraw2MobileDrawerMode(100, 844) !== "half") {
    throw new Error("short drawer must snap HALF");
  }
  if (snapDraw2MobileDrawerMode(260, 844) !== "half") {
    throw new Error("medium drawer must snap HALF");
  }
  if (snapDraw2MobileDrawerMode(480, 844) !== "full") {
    throw new Error("tall drawer must snap FULL");
  }
});

Deno.test("Draw2 mobile layout remains an isolated presentation layer", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/draw2-mobile-workspace.ts", import.meta.url),
  );
  for (
    const forbidden of [
      "createProject",
      "raster",
      "undoStack",
      "fetch(",
      "localStorage",
      "indexedDB",
    ]
  ) {
    if (source.includes(forbidden)) {
      throw new Error(`Mobile presentation must not own ${forbidden}`);
    }
  }
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-mobile-workspace.css", import.meta.url),
  );
  if (!css.includes('[data-mobile-drawer-mode="half"]')) {
    throw new Error("HALF projection missing");
  }
  if (!css.includes('[data-mobile-drawer-mode="full"]')) {
    throw new Error("FULL projection missing");
  }
});

Deno.test("Draw2 mobile rail is direct, 48px and palette-first", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-mobile-workspace.css", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/draw2-mobile-workspace.ts", import.meta.url),
  );
  const workspaceUi = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const drawEntry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const shell = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const context of ["primary", "timeline", "more"]) {
    if (!css.includes(`[data-mobile-rail-context="${context}"]`)) {
      throw new Error(`${context} rail projection missing`);
    }
  }
  for (const slot of ["primary", "timeline", "more"]) {
    if (!html.includes(`data-mobile-rail-slot="${slot}`)) {
      throw new Error(`${slot} rail controls missing`);
    }
  }
  if (!css.includes("--draw2-mobile-square: 48px")) {
    throw new Error("Mobile controls must share the 48px touch token");
  }
  if (
    !css.includes(
      "grid-template-rows: repeat(2, var(--draw2-mobile-square))",
    )
  ) {
    throw new Error("Quick palette must use two full-size rows");
  }
  if (!css.includes("overflow-x: auto")) {
    throw new Error(
      "Quick palette and rails must remain horizontally reachable",
    );
  }
  if (!source.includes('setRailContext("timeline")')) {
    throw new Error("Timeline must own a contextual detail rail");
  }
  if (
    !source.includes("openPanelMenu") ||
    !source.includes("openPrimaryDetail") ||
    !source.includes("is-mobile-panel-menu-open") ||
    !css.includes("draw2-mobile-drawer-grip")
  ) {
    throw new Error(
      "Mobile workspace must keep panels behind the grip drawer",
    );
  }
  for (
    const required of [
      "grid-template-rows: 80px minmax(0, 1fr) clamp(170px, 26dvh, 260px)",
      '[data-creator-mode="GAME"]',
      "clamp(170px, 26dvh, 260px)",
    ]
  ) {
    if (!shell.includes(required)) {
      throw new Error(`Desktop canvas-first projection missing: ${required}`);
    }
  }
  if (!css.includes("--draw2-mobile-status-height: 0px")) {
    throw new Error(
      "Mobile development status row must not consume workspace height",
    );
  }
  if (
    !css.includes("--draw2-mobile-canvas-min-height: 256px") ||
    !css.includes("(max-height: 720px)") ||
    !css.includes("--draw2-mobile-canvas-min-height: 192px !important")
  ) {
    throw new Error(
      "Short mobile FULL mode must keep a usable canvas while expanding the detail surface",
    );
  }
  if (!css.includes("--draw2-mobile-top-height: 92px")) {
    throw new Error(
      "Mobile creator modes must have a dedicated second top lane",
    );
  }
  if (
    !css.includes(
      "#draw2WorkspaceLeftDock .draw2-workspace-panel-launcher > [data-workspace-panel]",
    ) ||
    !css.includes(
      ".draw2-workspace-panel-launcher > [data-mobile-rail-action]",
    )
  ) {
    throw new Error(
      "Mobile detail panels must be direct lower-rail destinations",
    );
  }
  if (!css.includes("#draw2WorkspaceTimelineSlot .draw2-timeline-tabs-shell")) {
    throw new Error("Timeline subviews must stay inside the Timeline surface");
  }
  for (const mode of ["GAME", "AUDIO"]) {
    if (!html.includes(`data-creator-mode="${mode}"`)) {
      throw new Error(`${mode} must remain an upper creator mode`);
    }
  }
  for (
    const required of [
      "draw2WorkspaceModeSummary",
      "draw2WorkspaceModeSummaryDescription",
      "draw2ModeTimelineDeck",
      "draw2ModeDeckGame",
      "draw2ModeDeckAudio",
      "draw2AudioWorkspace",
      "draw2GameAssetTracks",
      "draw2AudioTrackLanes",
      "draw2AudioPlayhead",
      "draw2AudioMidiGrid",
      "draw2AudioAnimationGuide",
      "draw2AudioFrameCursor",
      "draw2AudioAnimationCells",
      "draw2AudioRuler",
      "draw2AudioDeckFps",
      "draw2AudioLoopToggle",
      "draw2AudioChipPlay",
      "draw2AudioChipPreset",
      "draw2AudioChipVolume",
      "draw2AudioMetronome",
      "draw2AudioMeter",
      "draw2AudioPpq",
      "draw2AudioAutomationLane",
      "draw2AudioMixerRows",
      "journalWorkspaceMixerChannel",
      "audioRuntimeTrackId",
      "attachMediaElement",
      "draw2AudioMarkerList",
      "draw2AudioPerformanceMode",
      "draw2AudioDeckFileInput",
      "draw2AudioDeckSave",
      "createAudioPersistenceRecord",
      "restoreAudioPersistenceRecord",
      "queueAudioPersistenceSave",
      "workspaceAudioOwnsHistory",
      "game-scene",
      "audio-inspector",
    ]
  ) {
    if (
      !html.includes(required) && !source.includes(required) &&
      !workspaceUi.includes(required) && !drawEntry.includes(required)
    ) {
      throw new Error(`PC mode framework marker missing: ${required}`);
    }
  }
  if (
    !shell.includes('[data-creator-mode="GAME"] #draw2WorkspacePaletteStrip') ||
    !shell.includes(
      '[data-creator-mode="AUDIO"] #draw2WorkspacePaletteStrip',
    ) ||
    !shell.includes(
      '[data-creator-mode="GAME"] #draw2ModeTimelineDeck:not([hidden])',
    ) ||
    !shell.includes(
      '[data-creator-mode="AUDIO"] #draw2ModeTimelineDeck:not([hidden])',
    )
  ) {
    throw new Error("GAME/AUDIO must project the specialized lower deck on PC");
  }
  if (
    !workspaceUi.includes("isPanelAllowedForCurrentMode(definition.id)") ||
    !workspaceUi.includes("profile.timelineSurface") ||
    !workspaceUi.includes("workspaceLeftDock.hidden = hideDrawingTools") ||
    !workspaceUi.includes("syncAudioAnimationFrameFromDraw") ||
    !workspaceUi.includes("renderAudioSurfaces") ||
    !workspaceUi.includes("scheduleAudioSurfaces") ||
    !workspaceUi.includes("audioSurfacesReady") ||
    !workspaceUi.includes("Preparing Audio workspace") ||
    !workspaceUi.includes("AUDIO_TIMELINE_RENDER_LIMIT") ||
    !workspaceUi.includes("AUDIO_MIDI_OVERSCAN_ROWS") ||
    !workspaceUi.includes("AUDIO_MIDI_OVERSCAN_COLUMNS") ||
    !workspaceUi.includes("draw2-audio-midi-virtual-surface") ||
    !workspaceUi.includes("scheduleAudioMidiViewportRender") ||
    !workspaceUi.includes("loadAudio200WorkspaceModule") ||
    !workspaceUi.includes("ensureAudioWorkspaceSession") ||
    !workspaceUi.includes("queueAudioWorkspaceMutation") ||
    !workspaceUi.includes("ensureCanonicalAudioInstrumentTracks") ||
    !workspaceUi.includes("audioWorkspaceMutationSessionId") ||
    !workspaceUi.includes("journalWorkspaceNoteUpsert") ||
    !workspaceUi.includes("journalWorkspaceNoteRemove") ||
    !workspaceUi.includes("journalWorkspaceTempo") ||
    !workspaceUi.includes("audio-200-workspace.js") ||
    !workspaceUi.includes("data-audio-midi-cell") ||
    !workspaceUi.includes("audioNoteCellLookup") ||
    !workspaceUi.includes("audioInstrumentFrameLookup") ||
    !workspaceUi.includes("Empty piano roll cell") ||
    !workspaceUi.includes("createPianoRollPitchRange") ||
    !workspaceUi.includes("audioWorkspaceFrameIndices") ||
    !workspaceUi.includes("audioNoteDurationMs") ||
    !workspaceUi.includes("audioInstrumentId") ||
    !workspaceUi.includes("draw2AudioAddInstrument") ||
    !workspaceUi.includes("AUDIO_MIN_FRAME_COUNT = 48") ||
    !workspaceUi.includes("audioDeckAddFrames") ||
    !workspaceUi.includes("audioActiveInstrumentIds") ||
    !workspaceUi.includes("queueAudioNoteUpsert") ||
    !workspaceUi.includes("activeAudioInstrumentCatalog") ||
    !workspaceUi.includes("resizePianoRollNote") ||
    !workspaceUi.includes("highestAudioNoteFrame") ||
    !workspaceUi.includes("audioInstrumentTrack") ||
    !workspaceUi.includes("refreshAudioNoteVisuals") ||
    !workspaceUi.includes("syncAudioFrameActiveState") ||
    !workspaceUi.includes("chipTuneSynth.prepare()") ||
    !workspaceUi.includes("syncAudioPlayhead") ||
    !workspaceUi.includes("syncAudioTimelineScroll") ||
    !workspaceUi.includes("audioOverviewSlotColumns") ||
    !workspaceUi.includes("audioFrameWidthPrefixCache") ||
    !workspaceUi.includes("chipTuneSynth.playNote") ||
    !workspaceUi.includes("SampleAccurateScheduler") ||
    !workspaceUi.includes("audioChipScheduler") ||
    !workspaceUi.includes("scheduleNoteAt") ||
    !workspaceUi.includes("triggerChipTuneFrame") ||
    !workspaceUi.includes('addEventListener("pointerdown"') ||
    !workspaceUi.includes("commitAudioMidiDrag") ||
    !workspaceUi.includes("long note added") ||
    !workspaceUi.includes("is-drag-preview") ||
    !workspaceUi.includes("audioMidiGridLastRenderKey") ||
    !workspaceUi.includes("draw2-audio-midi-canvas") ||
    !workspaceUi.includes("audioMidiCellFromPointer") ||
    !workspaceUi.includes("applyAudioMidiCell") ||
    !workspaceUi.includes("audioMidiSkipNextClick") ||
    !workspaceUi.includes("audioMidiGrid.firstElementChild") ||
    !workspaceUi.includes("canvas retired") ||
    !workspaceUi.includes("scheduleAudioWorkspaceUiProjection") ||
    !workspaceUi.includes("direct frame gesture") ||
    !workspaceUi.includes("is-note-end") ||
    !shell.includes(".draw2-audio-midi-cell.is-animation-frame") ||
    !shell.includes(".draw2-audio-animation-cell.is-cel") ||
    !shell.includes(".draw2-audio-midi-cell.is-note-continued") ||
    !shell.includes(".draw2-audio-midi-cell.is-note-end") ||
    !shell.includes(".draw2-audio-midi-canvas") ||
    !shell.includes(".draw2-audio-midi-playhead") ||
    !shell.includes(".draw2-audio-midi-status") ||
    !shell.includes(".draw2-audio-playhead") ||
    !shell.includes(".draw2-audio-workspace") ||
    !shell.includes("--draw2-mode-accent") ||
    !shell.includes("max(140px, var(--draw2-timeline-height")
  ) {
    throw new Error(
      "Custom panels, Draw controls and MIDI frame sync must be mode-scoped",
    );
  }
  if (
    html.includes('data-mode-deck-tab="audio-piano-roll"') ||
    workspaceUi.includes('"audio-piano-roll"') ||
    !workspaceUi.includes("audioWorkspaceActive") ||
    !workspaceUi.includes('panel.dataset.audioPanelSurface === "piano-roll"')
  ) {
    throw new Error(
      "Piano Roll must remain a single always-visible Audio workspace surface",
    );
  }
  if (!source.includes("syncLauncherSelection")) {
    throw new Error("Direct rail selection must stay synchronized with panels");
  }
  if (
    !css.includes("@media (max-width: 700px) and (max-height: 480px)") ||
    !css.includes("minmax(88px, 1fr)") ||
    !css.includes(
      '#draw2WorkspaceFrame[data-workspace-profile="mobile"].is-mobile-timeline-open',
    )
  ) {
    throw new Error(
      "Short landscape mobile needs a side detail sheet and canvas strip",
    );
  }
});

Deno.test("Mobile first glance keeps tools and palette while top commands stay compact", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-mobile-workspace.css", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/draw2-mobile-workspace.ts", import.meta.url),
  );
  for (
    const required of [
      'class="draw2-mobile-drawer-grip"',
      'aria-label="モバイルパネルを開閉"',
      'aria-controls="draw2WorkspacePanelColor draw2WorkspacePanelLayers draw2WorkspaceTimelineRegion"',
      'data-workspace-command="undo"',
      'data-workspace-command="redo"',
      'class="draw2-creator-mode-bar"',
    ]
  ) {
    if (!html.includes(required)) {
      throw new Error(`Mobile first-glance markup missing: ${required}`);
    }
  }
  for (
    const required of [
      ".draw2-workspace-project-slot",
      ".draw2-creator-mode-bar",
      "is-mobile-panel-menu-open",
      "grid-template-columns: repeat(4, 48px)",
      "--draw2-mobile-square: 48px",
      ".draw2-mobile-drawer-handle::before",
      "inset: 0 -8px",
      'grid-template-areas: "tools" "color" "rail"',
      "top: 0 !important",
      "--draw2-timeline-cell-size: 48px",
      ".draw2-mini-preview",
      ".draw2-mobile-toolbar::after",
      ".draw2-tool-button.is-active",
      ".draw2-panel-launcher.is-active",
    ]
  ) {
    if (!css.includes(required)) {
      throw new Error(`Mobile first-glance styling missing: ${required}`);
    }
  }
  for (
    const required of [
      "openPanelMenu",
      "openPrimaryDetail",
      "openPrimaryDetail();",
      "setPanelMenuOpen",
      "syncDrawerPresentation",
      "getClientRects().length > 0",
      'event.key === "ArrowUp"',
      "setPointerCapture",
      'root.classList.remove("is-mobile-panel-menu-open")',
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Mobile panel menu behavior missing: ${required}`);
    }
  }
  if (!source.includes("data-workspace-panel=\"${panel}\"")) {
    throw new Error("The grip must open the current detail panel directly");
  }
  if (
    html.includes("draw2MobileDrawerActionLabel") ||
    html.includes("draw2MobileDrawerMode") ||
    source.includes("draw2MobileDrawerActionLabel") ||
    source.includes("draw2MobileDrawerMode")
  ) {
    throw new Error("Mobile drawer must not expose Open/Close implementation labels");
  }
});

Deno.test("Audio mobile projection keeps transport, editor and lower deck reachable", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const css = await Deno.readTextFile(
    new URL("../assets/draw2-mobile-workspace.css", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  for (const required of [
    'data-audio-feature-flag="off"',
    'data-creator-mode="AUDIO"',
    "draw2AudioGlobalControls",
    "draw2AudioWorkspace",
    "draw2ModeTimelineDeck",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Audio mobile markup marker missing: ${required}`);
    }
  }
  for (const required of [
    "isAudioMobileMode",
    'capability.profile === "mobile" || capability.profile === "split"',
    "AUDIO_MOBILE_PANELS",
    'audioFeatureFlag === "on"',
    "--draw2-mobile-top-height: 144px",
    "grid-template-rows: 48px 48px 48px",
    "grid-template-rows: 96px minmax(0, 1fr) 0 minmax(176px, 32dvh) 0",
    "grid-template-rows:\n      128px minmax(0, 1fr) 0 minmax(176px, 32dvh) 0",
    "grid-template-rows: 120px minmax(0, 1fr) 0 132px 24px",
    "#draw2WorkspaceCanvasSlot",
    "min-height: 48px !important",
  ]) {
    if (!css.includes(required) && !source.includes(required)) {
      throw new Error(`Audio mobile projection marker missing: ${required}`);
    }
  }
  if (!entry.includes("20260819-compare-final-1")) {
    throw new Error("Audio workspace cache version must include the mobile projection");
  }
});

Deno.test("Draw2 responsive canvas dimensions remain zoom-owned", async () => {
  const shell = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const mobile = await Deno.readTextFile(
    new URL("../assets/draw2-mobile-workspace.css", import.meta.url),
  );
  for (const css of [shell, mobile]) {
    if (
      !css.includes("--draw2-canvas-display-width") ||
      !css.includes("--draw2-canvas-display-height")
    ) {
      throw new Error(
        "Responsive canvas must consume the measured display dimensions",
      );
    }
    if (css.includes("width: min(100cqw, 100cqh) !important;")) {
      throw new Error(
        "Responsive CSS must not clamp an already zoomed canvas",
      );
    }
  }
});

Deno.test("Draw2 desktop primary commands stay touch-sized", async () => {
  const shell = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (const required of [
    "--draw2-desktop-primary-control: 40px",
    "width: 220px !important",
    "flex: 0 0 var(--draw2-desktop-primary-control) !important",
    "draw2-brush-options-trigger",
  ]) {
    if (!shell.includes(required)) {
      throw new Error(`Desktop control sizing marker missing: ${required}`);
    }
  }
});

Deno.test("Draw2 viewport utility stays left while mini preview is shared", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );
  const shell = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  const toolbarStart = html.indexOf('class="draw2-workspace-toolbar"');
  const commandBarStart = html.indexOf('class="draw2-workspace-command-bar"');
  const canvasCenter = html.indexOf('id="draw2ViewportCenter"');
  const miniPreviewToggle = html.indexOf('id="draw2MiniPreviewRestore"');
  const viewportStart = html.indexOf('class="draw2-viewport-wrap"');
  if (
    toolbarStart < 0 || canvasCenter <= toolbarStart ||
    commandBarStart < 0 || miniPreviewToggle <= commandBarStart ||
    (viewportStart >= 0 && canvasCenter > viewportStart)
  ) {
    throw new Error(
      "Center must stay in the left rail and mini preview must be in the shared top rail",
    );
  }
  if (html.includes('data-workspace-tool-action="mini-preview"')) {
    throw new Error("Mini preview must not remain a Draw-only rail tool");
  }
  if (html.includes('class="draw2-viewport-center-button')) {
    throw new Error("Canvas center must not remain a canvas overlay button");
  }
  for (
    const required of [
      "clampHandleCenter",
      "const handleAxis = mirrorHandle === mirrorToggleX",
      "collapsed: !miniPreviewLayout.collapsed",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Viewport utility behavior missing: ${required}`);
    }
  }
  for (
    const required of [
      ".draw2-workspace-toolbar > .draw2-viewport-tool",
      ".draw2-mirror-guide-line",
      ".draw2-mirror-line-toggle::after",
      ".draw2-global-mini-preview-toggle",
    ]
  ) {
    if (!shell.includes(required)) {
      throw new Error(`Viewport utility styling missing: ${required}`);
    }
  }
  for (
    const required of [
      "draw2:linked-preview-state",
      "draw2:mini-preview-playback-request",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Shared preview playback bridge missing: ${required}`);
    }
  }
});

Deno.test("Audio desktop shell keeps editor, dock and workspace surfaces explicit", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  const source = await Deno.readTextFile(
    new URL("../src/wp180-workspace-ui.ts", import.meta.url),
  );
  const shell = await Deno.readTextFile(
    new URL("../assets/draw2-shell.css", import.meta.url),
  );
  for (
    const required of [
      'id="draw2AudioGlobalControls"',
      'data-audio-global-action="play"',
      'data-audio-global-action="record"',
      'id="draw2AudioGlobalSaveState"',
      'id="draw2AudioEditorTabs"',
      'data-audio-editor-tab="PIANO"',
      'data-audio-editor-tab="WAVE"',
      'data-audio-editor-tab="DRUM"',
      'data-audio-editor-tab="SAMPLER"',
      'id="draw2AudioDrumKit"',
      "CLOSED HAT",
      "OPEN HAT",
      "draw2-audio-editor-icon",
      "draw2-audio-knob",
      "draw2AudioRightGainValue",
      "draw2-audio-browser-icon",
      "draw2-audio-meter-scale",
      'id="draw2AudioRightDock"',
      'id="draw2WorkspaceRightResize"',
      'id="draw2WorkspaceTimelineResize"',
      'data-audio-right-tab="inspector"',
      'data-audio-right-tab="browser"',
      'data-audio-right-tab="master"',
      'data-mode-deck-tab="audio-fx"',
    ]
  ) {
    if (!html.includes(required)) {
      throw new Error(`Audio layout marker missing: ${required}`);
    }
  }
  for (
    const required of [
      "selectAudioEditor",
      "selectAudioRightPanel",
      "audioEditorPinned",
      "audioBottomTabs",
      "audioWorkspaceActive = modeDeckAudio",
      "syncAudioGlobalTransport",
      "syncAudioRightMixerUi",
      "commitAudioRightMixerValue",
      "syncAudioMasterUi",
      "filterAudioBrowser",
      "renderAudioFxChain",
      "audioFxParameterSpecs",
      "data-audio-fx-param",
      "syncAudioMasterMeter",
      "renderAudioDrumGrid",
      "toggleAudioDrumStep",
      "journalWorkspaceDrumKitSet",
      "draw2AudioDrumStatus",
      "openAudioWaveEditing",
    ]
  ) {
    if (!source.includes(required)) {
      throw new Error(`Audio layout behavior missing: ${required}`);
    }
  }
  for (
    const required of [
      "Audio compact DAW shell",
      '[data-creator-mode="AUDIO"]',
      "draw2-audio-global-controls",
      "draw2-audio-editor-tab",
      "draw2-audio-right-tab",
      "data-audio-secondary-tab",
      "--draw2-right-dock-width",
      "--draw2-timeline-height",
      "--draw2-audio-right-width",
      "@media (min-width: 1120px)",
      "Audio workstation visual controls",
      "draw2-audio-track-lane-cell.is-waveform",
      "draw2-audio-knob-field",
      "draw2-audio-browser-item",
      "draw2-audio-fx-action",
      "--draw2-rail-min-width",
      "--draw2-timeline-min-height",
    ]
  ) {
    if (!shell.includes(required)) {
      throw new Error(`Audio layout CSS marker missing: ${required}`);
    }
  }
  if (
    !shell.includes('draw2-workspace-frame[data-workspace-profile="mobile"]')
  ) {
    throw new Error("Existing mobile projection anchor must remain present");
  }
  for (
    const required of [
      "--draw2-left-rail-width",
      "--draw2-right-dock-width",
      "--draw2-audio-right-width",
    ]
  ) {
    if (!shell.includes(required) && !source.includes(required)) {
      throw new Error(`Shared rail width marker missing: ${required}`);
    }
  }
});

Deno.test("Audio notes and local clips share the Mixer runtime path", async () => {
  const synth = await Deno.readTextFile(
    new URL("../src/audio/audio-240/chiptune-synth.ts", import.meta.url),
  );
  const runtime = await Deno.readTextFile(
    new URL("../src/audio/audio-240/mixer-runtime.ts", import.meta.url),
  );
  for (
    const required of [
      "MixerRuntimeAdapter",
      "setMixer(mixer: AudioMixer)",
      "attachMediaElement",
      "this.mixerRuntime.getTrackInput",
      "source.connect(this.mixerRuntime.getTrackInput(trackId))",
      "setMeterActive(active: boolean)",
      "getMeterAnalyser()",
      "setMasterMeterActive(active: boolean)",
      "getMasterMeterAnalyser()",
    ]
  ) {
    if (!synth.includes(required) && !runtime.includes(required)) {
      throw new Error(`Mixer runtime path marker missing: ${required}`);
    }
  }
});

Deno.test("Legacy Mobile Canvas HUD does not leak into PC Canvas markup", async () => {
  const html = await Deno.readTextFile(
    new URL("../index.html", import.meta.url),
  );
  for (
    const retired of [
      'id="draw2MobileCanvasHud"',
      'data-mobile-viewport-command="zoom-out"',
      'data-mobile-viewport-command="zoom-in"',
      'data-mobile-viewport-command="zoom-reset"',
      'data-mobile-viewport-command="center"',
      'id="draw2MobileCanvasTool"',
      'id="draw2MobileCanvasFrame"',
      'id="draw2MobileCanvasZoom"',
    ]
  ) {
    if (html.includes(retired)) {
      throw new Error(`Retired Canvas HUD markup remains: ${retired}`);
    }
  }
});
