const htmlUrl = new URL("../index.html", import.meta.url);
const shellCssUrl = new URL("../assets/draw2-shell.css", import.meta.url);
const gameCssUrl = new URL("../assets/draw2-game-ux.css", import.meta.url);
const pcPolishCssUrl = new URL("../assets/draw2-pc-ui-polish.css", import.meta.url);
const drawEntryUrl = new URL("../src/draw2-entry.ts", import.meta.url);
const workspaceUrl = new URL("../src/wp180-workspace-ui.ts", import.meta.url);
const workspaceBundleUrl = new URL("../dist/wp180-workspace.js", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function elementMarkup(source: string, id: string): string {
  const pattern = new RegExp(
    `<(?:section|div|article|main|canvas|svg|button|output|aside|details)[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`,
    "i",
  );
  return source.match(pattern)?.[0] ?? "";
}

function assertElementHasAttribute(
  source: string,
  id: string,
  attribute: string,
  value: string,
): void {
  const markup = elementMarkup(source, id);
  assert(
    markup.length > 0,
    `UI density contract cannot classify #${id}: element was not found`,
  );
  const pattern = new RegExp(
    `\\b${escapeRegExp(attribute)}=["']${escapeRegExp(value)}["']`,
    "i",
  );
  assert(
    pattern.test(markup),
    `UI density contract is not implemented for #${id}: expected ${attribute}="${value}"`,
  );
}

function assertIncludes(source: string, fragment: string, message: string): void {
  assert(source.includes(fragment), `${message}: missing ${fragment}`);
}

function assertNotIncludes(source: string, fragment: string, message: string): void {
  assert(!source.includes(fragment), `${message}: found ${fragment}`);
}

Deno.test("UI density classifies the primary surfaces of all three modes", async () => {
  const html = await Deno.readTextFile(htmlUrl);

  for (const [id, tier] of [
    ["draw2CanvasCard", "primary"],
    ["draw2TimelineCard", "primary"],
    ["draw2WorkspacePanelInspector", "contextual"],
    ["draw2AudioWorkspace", "primary"],
    ["draw2AudioPanelPianoRoll", "primary"],
    ["draw2GameSceneViewport", "primary"],
    ["draw2GameLeftDock", "primary"],
  ] as const) {
    assertElementHasAttribute(html, id, "data-ui-tier", tier);
  }
});

Deno.test("Audio Asset creation and Game Inspector use contextual tiers", async () => {
  const html = await Deno.readTextFile(htmlUrl);

  assertElementHasAttribute(
    html,
    "draw2AudioAssetPackage",
    "data-ui-tier",
    "contextual",
  );
  assertElementHasAttribute(html, "draw2GameObjectCard", "data-ui-tier", "contextual");
  assertElementHasAttribute(html, "draw2GameObjectCard", "data-context-state", "empty");
  assertElementHasAttribute(html, "draw2GameQuickFlags", "data-ui-tier", "contextual");
  assertElementHasAttribute(html, "draw2GameQuickFlags", "data-context-state", "empty");
  assertElementHasAttribute(
    html,
    "draw2GameCameraQuickSettings",
    "data-ui-tier",
    "contextual",
  );
  assertElementHasAttribute(html, "draw2GameComponents", "data-ui-tier", "contextual");
  assertElementHasAttribute(html, "draw2GameComponentsPanel", "data-context-state", "empty");
  assertElementHasAttribute(html, "draw2GameLogicMode", "data-context-state", "empty");
  assertElementHasAttribute(html, "draw2GameAdvancedSettings", "data-ui-tier", "advanced");
  assertElementHasAttribute(
    html,
    "draw2GamePlaygroundCenterBar",
    "data-context-state",
    "empty",
  );
  assertElementHasAttribute(
    html,
    "draw2SelectionCard",
    "data-context-state",
    "empty",
  );
});

Deno.test("secondary panels are classified without changing their existing IDs", async () => {
  const html = await Deno.readTextFile(htmlUrl);

  for (const [id, tier, surface] of [
    ["draw2WorkspacePanelPreview", "contextual", "preview"],
    ["draw2WorkspacePanelAssets", "contextual", "asset-builder"],
    ["draw2WorkspacePanelExport", "contextual", "export"],
    ["draw2WorkspacePanelTileset", "contextual", "tileset"],
    ["draw2AudioArrangerViewport", "primary", "audio-arranger-viewport"],
    ["draw2AudioPanelClips", "contextual", "audio-clips"],
    ["draw2AudioPanelMixer", "contextual", "audio-mixer"],
    ["draw2AudioPanelAutomation", "contextual", "audio-automation"],
    ["draw2AudioPanelFx", "advanced", "audio-fx"],
    ["draw2AudioPanelMarkers", "contextual", "audio-markers"],
    ["draw2AudioPanelSettings", "advanced", "audio-settings"],
    ["draw2AudioRightBrowser", "contextual", "audio-browser"],
    ["draw2AudioRightMaster", "contextual", "audio-master"],
    ["draw2ModeTimelineDeck", "primary", "mode-deck"],
    ["draw2GameRailSurfaceScene", "primary", "game-scene-rail"],
    ["draw2GameRailSurfaceAssets", "primary", "game-assets-rail"],
    ["draw2GameRailSurfaceAnimation", "primary", "game-animation-rail"],
    ["draw2GameRailSurfaceData", "advanced", "game-data-rail"],
    ["draw2GameRailSurfaceEvents", "contextual", "game-events-rail"],
  ] as const) {
    assertElementHasAttribute(html, id, "data-ui-tier", tier);
    assertElementHasAttribute(html, id, "data-ui-surface", surface);
  }
});

Deno.test("PC Audio Inspector delegates mixer edits to the lower Mixer", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);
  const shellCss = await Deno.readTextFile(shellCssUrl);

  assertElementHasAttribute(
    html,
    "draw2AudioInspectorMixerSummary",
    "data-ui-tier",
    "contextual",
  );
  assertElementHasAttribute(
    html,
    "draw2AudioInspectorMixerSummary",
    "data-ui-surface",
    "audio-mixer-summary",
  );
  assertElementHasAttribute(html, "draw2AudioInspectorOpenMixer", "type", "button");
  assertIncludes(
    workspace,
    "audioRightInspectorOpenMixer?.addEventListener(\"click\"",
    "Audio Inspector Mixer entry binding",
  );
  assertIncludes(
    workspace,
    'selectModeDeckTab("audio-mixer")',
    "Audio Inspector must open the canonical Mixer deck",
  );
  assertIncludes(
    shellCss,
    ".draw2-audio-inspector-controls, .draw2-audio-right-chip-row",
    "PC Inspector must hide duplicate mixer controls",
  );
  assertIncludes(
    shellCss,
    "@media (min-width: 901px) and (hover: hover) and (pointer: fine)",
    "PC-only Mixer projection must not change touch tablet/mobile layout",
  );
});

Deno.test("mode playback uses the current Game runtime directly", async () => {
  const workspace = await Deno.readTextFile(workspaceUrl);

  assertIncludes(
    workspace,
    "const toggleGameDeckPlayback = (): void =>",
    "mode playback must expose a Game transport adapter",
  );
  assertNotIncludes(
    workspace,
    "gameDeckPlay.click();",
    "visible mode playback must not delegate to the isolated legacy Game button",
  );
});

Deno.test("PC guided selection uses Canvas handles before precision inputs", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const shellCss = await Deno.readTextFile(shellCssUrl);

  assertIncludes(
    html,
    'class="draw2-transform-grid draw2-selection-precision-grid"',
    "selection precision controls must remain addressable",
  );
  assertIncludes(
    shellCss,
    ".draw2-selection-precision-grid",
    "selection precision controls need a PC projection",
  );
  assertIncludes(
    shellCss,
    '[data-detail-mode="detailed"]',
    "selection precision controls must remain reachable in detail mode",
  );
  assertIncludes(
    shellCss,
    "display: grid !important",
    "detail mode must override the guided selection projection",
  );
  assertIncludes(
    shellCss,
    "@media (min-width: 901px) and (hover: hover) and (pointer: fine)",
    "selection precision projection must stay PC-only",
  );
});

Deno.test("Audio curves and waveforms expose direct editing before precision controls", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);
  const pcPolishCss = await Deno.readTextFile(pcPolishCssUrl);

  assertElementHasAttribute(
    html,
    "draw2AudioMidiExpression",
    "data-ui-surface",
    "audio-expression",
  );
  assertElementHasAttribute(
    html,
    "draw2AudioMidiExpressionLane",
    "data-direct-edit",
    "true",
  );
  assertElementHasAttribute(
    html,
    "draw2AudioAutomationLane",
    "data-direct-edit",
    "true",
  );
  assertIncludes(
    workspace,
    'audioClipLibrary?.addEventListener("dblclick"',
    "Audio waveform must support position-based split",
  );
  assertIncludes(
    workspace,
    "audioClipWaveformGesture",
    "Audio waveform fade handles must keep a provisional gesture state",
  );
  assertIncludes(
    workspace,
    'graphPoint.addEventListener("dblclick"',
    "Audio automation points must support direct removal",
  );
  assertIncludes(
    pcPolishCss,
    ".draw2-audio-automation-graph",
    "Audio automation must render as a visual curve",
  );
  assertIncludes(
    pcPolishCss,
    ".draw2-audio-clip-precision",
    "Audio clip precision controls must be progressive",
  );
});

Deno.test("Canvas, timeline, layer, palette, asset and tab references remain stable", async () => {
  const html = await Deno.readTextFile(htmlUrl);

  assertElementHasAttribute(html, "draw2Canvas", "tabindex", "0");

  for (const id of [
    "draw2Canvas",
    "draw2CanvasCard",
    "draw2TimelineCard",
    "draw2TimelinePanelTimeline",
    "draw2LayerList",
    "draw2PaletteWheel",
    "draw2WorkspacePanelAssets",
    "draw2TimelineAssetShelf",
  ]) {
    assert(elementMarkup(html, id), `required existing UI id was removed: #${id}`);
  }

  for (const [tab, panel] of [
    ["draw2WorkspaceTabColor", "draw2WorkspacePanelColor"],
    ["draw2WorkspaceTabLayers", "draw2WorkspacePanelLayers"],
    ["draw2WorkspaceTabInspector", "draw2WorkspacePanelInspector"],
    ["draw2TimelineTabTimeline", "draw2TimelinePanelTimeline"],
    ["draw2TimelineTabAssets", "draw2TimelinePanelAssets"],
  ] as const) {
    assert(
      new RegExp(
        `id=["']${escapeRegExp(tab)}["'][\\s\\S]{0,500}?aria-controls=["']${escapeRegExp(panel)}["']`,
      ).test(html),
      `tab/tabpanel contract changed: #${tab} must control #${panel}`,
    );
    assert(
      new RegExp(
        `id=["']${escapeRegExp(panel)}["'][^>]*\\brole=["']tabpanel["']`,
      ).test(html),
      `tabpanel role missing from #${panel}`,
    );
  }
});

Deno.test("iGAME Scene/Game switching and viewport operation IDs remain available", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);

  for (const id of [
    "draw2GameViewToggle",
    "draw2GameSceneView",
    "draw2GameGameView",
    "draw2GameSceneViewport",
    "draw2GameSceneSvg",
    "draw2GameSceneAddObject",
    "draw2GameSceneFocusSelected",
    "draw2GameSceneFit",
  ]) {
    assert(elementMarkup(html, id), `iGAME operation ID was removed: #${id}`);
  }

  assertIncludes(html, 'data-game-view-mode="SCENE"', "Scene switch control");
  assertIncludes(html, 'data-game-view-mode="GAME"', "Game switch control");
  assertIncludes(workspace, "draw2GameSceneViewport", "viewport controller binding");
  assertIncludes(workspace, "draw2GameSceneViewButtons", "Scene/Game view binding");
  assertIncludes(
    workspace,
    "draw2GamePlaygroundCenterBar.dataset.contextState",
    "Playground context-state binding",
  );
  assertIncludes(workspace, "selection.contextState", "Audio asset context binding");
  assertNotIncludes(
    workspace,
    "selection.error.includes",
    "Audio asset context must not depend on localized status copy",
  );
});

Deno.test("density CSS scopes contextual, advanced and copy rules locally", async () => {
  const shellCss = await Deno.readTextFile(shellCssUrl);
  const gameCss = await Deno.readTextFile(gameCssUrl);
  const css = `${shellCss}\n${gameCss}`;

  assertIncludes(css, '[data-ui-tier="contextual"]', "contextual density selector");
  assertIncludes(css, '[data-ui-tier="advanced"]', "advanced density selector");
  assert(
    /(?:\.draw2-panel-(?:note|status|copy)|\[data-ui-copy\])/.test(css),
    "copy-density rule requires a local copy/status selector",
  );
  assert(
    /(?:#draw2WorkspacePanelGameInspector|#draw2AudioRightInspector|#draw2WorkspacePanelInspector)[^{}]*\[data-ui-tier/.test(
      css,
    ),
    "density rules must be scoped to an affected surface",
  );
});

Deno.test("PC PiXYNC status has a dedicated slot outside the command cluster", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const topRailCssUrl = new URL("../assets/draw2-pc-top-rail.css", import.meta.url);
  const topRailCss = await Deno.readTextFile(topRailCssUrl);

  assertIncludes(
    html,
    "./assets/draw2-pc-top-rail.css?v=20260912-pixync-rail-v1",
    "PC PiXYNC rail stylesheet",
  );
  assertIncludes(
    topRailCss,
    "--draw2-pc-top-sync-width: 96px",
    "PC PiXYNC rail must reserve a stable status width",
  );
  assertIncludes(
    topRailCss,
    "right: calc(100% + var(--draw2-pc-top-sync-gap)) !important",
    "PC PiXYNC status must escape the rounded command cluster",
  );
  assertIncludes(
    topRailCss,
    ".draw2-workspace-command-bar\n    > #draw2SyncStatus",
    "PC PiXYNC status must remain attached to the existing command slot",
  );
  assertIncludes(
    topRailCss,
    ":is(.draw2-workspace-context-row, #draw2AudioGlobalControls)",
    "DRAW and AUDIO must reserve the same PiXYNC slot",
  );
});

Deno.test("PC Draw timeline separates iAUDIO references from Layer creation", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const drawEntry = await Deno.readTextFile(drawEntryUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);
  const pcWorkspaceCssUrl = new URL(
    "../assets/draw2-pc-workspace-overrides.css",
    import.meta.url,
  );
  const pcWorkspaceCss = await Deno.readTextFile(pcWorkspaceCssUrl);

  assertIncludes(
    html,
    "./assets/draw2-pc-workspace-overrides.css?v=20260913-audio-roll-v1",
    "PC timeline rail stylesheet",
  );
  assertIncludes(
    drawEntry,
    'audioRow.dataset.audioSource = "iAUDIO"',
    "Draw Audio row must identify the iAUDIO source",
  );
  assertIncludes(
    drawEntry,
    'drawAudioAdd.title = "iAUDIO素材を選択中のフレームへ追加"',
    "Draw Audio insertion affordance must explain its destination",
  );
  assertIncludes(
    drawEntry,
    'addLayerRow.dataset.timelineRole = "layer-add"',
    "Layer creation row must remain a distinct timeline role",
  );
  assertIncludes(
    drawEntry,
    'addLayerLabel.className = "draw2-timeline-layer-add-label"',
    "Layer creation row must expose a visible label",
  );
  assertIncludes(
    pcWorkspaceCss,
    "grid-template-rows:",
    "PC mode switching must use one timeline row contract",
  );
  assertIncludes(
    pcWorkspaceCss,
    "grid-template-rows: 30px 30px 24px minmax(0, 1fr)",
    "PC Draw must reserve heading, tabs, readout and content rows",
  );
  assertIncludes(
    pcWorkspaceCss,
    '[data-timeline-collapse="collapsed"]',
    "PC timeline collapse must be part of the same layout contract",
  );
  assertIncludes(
    pcWorkspaceCss,
    "pointer-events: auto !important",
    "PC timeline collapse control must keep its own hit target",
  );
  assertIncludes(
    pcWorkspaceCss,
    "z-index: 70 !important",
    "PC timeline heading must stay above the compact tab strip",
  );
  assertIncludes(
    pcWorkspaceCss,
    ".draw2-timeline-audio-title",
    "iAUDIO reference lane needs a visible source label",
  );
  assertIncludes(
    pcWorkspaceCss,
    "minmax(44px, 49px) minmax(40px, 1fr) 30px",
    "iAUDIO lane must keep its picker distinguishable from Layer creation",
  );
  assertIncludes(
    pcWorkspaceCss,
    ".draw2-timeline-layer-add-label",
    "Layer creation lane needs a visible action label",
  );
});

Deno.test("PC polish keeps direct surfaces primary without deleting commands", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const polishCss = await Deno.readTextFile(pcPolishCssUrl);

  assertIncludes(
    html,
    "./assets/draw2-pc-ui-polish.css?v=20260914-quick-asset-v1",
    "PC interaction polish stylesheet",
  );
  assertIncludes(
    polishCss,
    '@media (min-width: 1120px) and (hover: hover) and (pointer: fine)',
    "PC polish must be limited to desktop pointer interaction",
  );
  assertIncludes(
    polishCss,
    'grid-template-rows:\n      var(--draw2-pc-topbar-height, 64px)\n      minmax(280px, 1fr)\n      minmax(0, clamp(180px, min(24dvh, var(--draw2-timeline-height, 260px)), 260px))',
    "Draw must keep the canvas primary when a tall timeline was remembered",
  );
  assertIncludes(
    polishCss,
    '[data-workspace-layout="color-left-tools-right"]:not(:has(#draw2WorkspacePanelAssets:not([hidden])))',
    "Draw asset-layout specificity must not restore the stale timeline height",
  );
  assertIncludes(
    polishCss,
    ':is(#draw2AudioMidiVelocity, .draw2-audio-midi-velocity)',
    "iAUDIO must not leave an orphaned global velocity control",
  );
  assertIncludes(
    polishCss,
    '[data-workspace-command="command-palette"]',
    "hidden permanent commands must retain their command-palette route",
  );
});

Deno.test("asset surface keeps the quick capture path primary", async () => {
  const html = await Deno.readTextFile(htmlUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);
  const bridgeContract = await Deno.readTextFile(
    new URL("../src/draw2-asset-bridge-contract.ts", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../src/draw2-entry.ts", import.meta.url),
  );

  assertIncludes(
    html,
    'id="draw2QuickAssetCapture"',
    "Asset surface must expose a primary quick capture area",
  );
  assertIncludes(
    html,
    'id="draw2QuickAssetTracks"',
    "quick Asset capture must expose selectable source tracks",
  );
  assertIncludes(
    html,
    'id="draw2QuickAssetCreate"',
    "quick Asset capture must have one primary create action",
  );
  assertIncludes(
    html,
    'id="draw2AssetAdvancedDetails"',
    "advanced Asset settings must stay behind disclosure",
  );
  assertIncludes(
    workspace,
    "sourceLayerIds: selectedLayerIds",
    "quick Asset creation must pass the selected tracks to the bridge",
  );
  assertIncludes(
    bridgeContract,
    "readonly sourceLayerIds?: readonly string[];",
    "Asset bridge must accept explicit source tracks",
  );
  assertIncludes(
    entry,
    "const requestedLayerIds = [...new Set(",
    "Draw capture must validate and preserve selected source tracks",
  );
  assertIncludes(
    entry,
    "layerIds.includes(item.layerTrackId)",
    "selected hidden tracks must remain capturable when explicitly included",
  );
});

Deno.test("density contract does not require global hiding or core edits", async () => {
  const shellCss = await Deno.readTextFile(shellCssUrl);
  const gameCss = await Deno.readTextFile(gameCssUrl);
  const workspace = await Deno.readTextFile(workspaceUrl);

  assertNotIncludes(
    `${shellCss}\n${gameCss}`,
    '#draw2WorkspaceFrame [data-ui-tier="contextual"] { display: none',
    "contextual UI must not be globally hidden",
  );
  assertNotIncludes(
    `${shellCss}\n${gameCss}`,
    '#draw2WorkspaceFrame [data-ui-tier="advanced"] { display: none',
    "advanced UI must remain reachable through a local detail state",
  );
  assertNotIncludes(
    workspace,
    "draw2-core.ts",
    "UI density contract must not require Draw core changes",
  );
});

Deno.test("generated Workspace bundle contains the runtime UI-state projection", async () => {
  const bundle = await Deno.readTextFile(workspaceBundleUrl);

  for (const fragment of [
    "#draw2GameQuickFlags",
    "#draw2GameComponentsPanel",
    "#draw2GameLogicMode",
    "audioAssetPackage.dataset.contextState",
    "draw2GameLeftDockNodeBoxPanel.dataset.contextState",
  ]) {
    assertIncludes(bundle, fragment, `workspace bundle is stale: ${fragment}`);
  }
});
