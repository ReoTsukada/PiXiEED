function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readProjectFile(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, import.meta.url));
}

Deno.test("stable presentation defaults live in CSS", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");

  for (
    const contract of [
      ".draw2-viewport-wrap.is-mirror-enabled",
      ".draw2-timeline-onion-popover.is-timeline-popover-positioned",
      ".draw2-menu-popover.is-menu-positioned",
      ".draw2-tool-popover.is-flyout-positioned",
      ".draw2-audio-playhead",
      ".draw2-audio-arranger-playhead",
      ".draw2-audio-arranger-midi-waveform",
      ".draw2-audio-draw-frame-cells",
      ".draw2-audio-midi-canvas",
    ]
  ) {
    assert(
      css.includes(contract),
      `Missing CSS presentation contract: ${contract}`,
    );
  }

  assert(
    css.includes("padding: 42px !important"),
    "Mirror padding must be CSS-owned",
  );
  assert(
    css.includes("grid-column: 2 / -1"),
    "Audio lane placement must be CSS-owned",
  );
  assert(
    css.includes("position: absolute"),
    "Audio frame cells must have CSS positioning",
  );
  assert(
    css.includes("inset: 0 auto auto 0"),
    "MIDI canvas edge anchoring must be CSS-owned",
  );
  assert(
    css.includes(".draw2-mirror-line-toggle.is-dragging") &&
      css.includes("cursor: pointer") &&
      css.includes("cursor: grabbing"),
    "Mirror handles must show a click cursor until a real drag starts.",
  );
});

Deno.test("presentation-only inline writes are not reintroduced", async () => {
  const entrySource = await readProjectFile("../src/draw2-entry.ts");
  const workspaceSource = await readProjectFile("../src/wp180-workspace-ui.ts");

  for (
    const forbidden of [
      'onionOptionsPopover.style.setProperty("left", "0px")',
      'onionOptionsPopover.style.setProperty("top", "0px")',
      "audioPlayhead.style.top =",
      "audioPlayhead.style.height =",
      "audioArrangerPlayhead.style.top =",
      "audioArrangerPlayhead.style.height =",
      'canvas.style.width = "100%"',
      'canvas.style.height = "100%"',
      'audioMidiGrid.style.width = "100%"',
      'audioMidiGrid.style.minWidth = "0px"',
      'canvas.style.top = "0px"',
      'canvas.style.right = "auto"',
      'canvas.style.bottom = "auto"',
    ]
  ) {
    assert(
      !entrySource.includes(forbidden) && !workspaceSource.includes(forbidden),
      `Presentation write remains in JavaScript: ${forbidden}`,
    );
  }
});

Deno.test("right dock omits redundant context and mode headings", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");
  const refinementStart = css.lastIndexOf(
    "Right-dock surface refinement (2026-08-31)",
  );
  assert(
    refinementStart >= 0,
    "Right-dock heading refinement must remain explicit in the final cascade.",
  );
  const refinement = css.slice(refinementStart);
  for (const required of [
    "#draw2WorkspaceRightContext",
    "#draw2WorkspaceModeSummary",
    "#draw2WorkspaceRightDock::before",
    "display: none !important",
    "content: none !important",
  ]) {
    assert(
      refinement.includes(required),
      `Right-dock heading removal contract missing: ${required}`,
    );
  }
});

Deno.test("right dock keeps the palette bounded above the active panel", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");
  const source = await readProjectFile("../src/wp180-workspace-ui.ts");
  const refinementStart = css.lastIndexOf(
    "Right-dock palette split contract (2026-08-31)",
  );
  assert(
    refinementStart >= 0,
    "Right-dock palette split contract must remain explicit in the final cascade.",
  );
  const refinement = css.slice(refinementStart);
  for (const required of [
    "grid-template-rows:",
    "minmax(var(--draw2-right-custom-min-height), 1fr)",
    "--draw2-right-palette-max-ratio: 88%",
    "--draw2-right-palette-min-height: 40px",
    "--draw2-right-custom-min-height: 176px",
    "#draw2WorkspacePaletteStrip",
    "display: block !important",
    "grid-row: 1 !important",
    "#draw2WorkspacePaletteResize",
    "grid-row: 2 !important",
    "#draw2WorkspaceRightCustomDock",
    "grid-row: 3 !important",
    "overflow: auto !important",
  ]) {
    assert(
      refinement.includes(required),
      `Right-dock palette split contract missing: ${required}`,
    );
  }
  for (const required of [
    "RIGHT_DOCK_MAX_PALETTE_RATIO",
    "storedRatio > RIGHT_DOCK_MAX_PALETTE_RATIO",
    "RIGHT_DOCK_RESIZE_HANDLE_PX",
    "clientY - contentTop",
  ]) {
    assert(
      source.includes(required),
      `Right-dock splitter behavior contract missing: ${required}`,
    );
  }
});

Deno.test("all adjustable rails share a reachable collapse contract", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");
  const source = await readProjectFile("../src/wp180-workspace-ui.ts");
  const finalRailStart = css.lastIndexOf(
    "Final adjustable-rail contract (2026-08-31)",
  );
  assert(finalRailStart >= 0, "Final adjustable rail contract is missing.");
  const finalRail = css.slice(finalRailStart);
  for (const required of [
    "--draw2-rail-layer: 20",
    "--draw2-rail-handle-layer: 60",
    "#draw2WorkspaceTimelineRegion",
    "#draw2WorkspaceRightResize",
    "left: -14px !important",
    "@media (max-width: 700px)",
  ]) {
    assert(
      finalRail.includes(required),
      `Adjustable rail contract missing: ${required}`,
    );
  }
  for (const required of [
    'handle.setAttribute("role", "separator")',
    'handle.setAttribute("aria-orientation", orientation)',
    "gameLeftCollapsed",
    "audioLeftCollapsed",
    "timelineCollapsed",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]) {
    assert(
      source.includes(required),
      `Adjustable rail behavior contract missing: ${required}`,
    );
  }
  const timelineStart = source.indexOf("const setDesktopTimelineCollapsed");
  const timelineEnd = source.indexOf("const toggleTimelineSurface", timelineStart);
  const timelineBody = source.slice(timelineStart, timelineEnd);
  assert(
    !timelineBody.includes('currentCreatorMode() === "GAME") return false'),
    "Timeline collapse must not exclude GAME mode.",
  );
  assert(!finalRail.includes("&.is-"), "Final rail CSS must stay flat CSS.");
});

Deno.test("final border hierarchy keeps structural edges single", async () => {
  const css = await readProjectFile("../assets/draw2-shell.css");
  const gameCss = await readProjectFile("../assets/draw2-game-ux.css");
  const motionCss = await readProjectFile("../assets/draw2-mode-motion.css");
  const cleanupStart = css.lastIndexOf(
    "Final border hierarchy contract (2026-09-08)",
  );
  assert(cleanupStart >= 0, "Final border hierarchy contract is missing.");
  const cleanup = css.slice(cleanupStart);
  for (const required of [
    "#draw2WorkspaceFrame.draw2-workspace-frame:not([hidden])",
    "#draw2WorkspaceLeftDock",
    "border-right: 1px solid var(--draw2-border-subtle)",
    "#draw2WorkspaceRightCustomDock",
    "#draw2WorkspaceCanvasRegion",
    "#draw2WorkspaceTimelineSlot",
    ".draw2-timeline-cell",
    "border-inline-end: 1px solid var(--draw2-border-subtle)",
    "box-shadow: inset 0 0 0 1px var(--draw2-accent-strong)",
  ]) {
    assert(
      cleanup.includes(required),
      `Final border hierarchy contract missing: ${required}`,
    );
  }

  const gameCleanupStart = gameCss.lastIndexOf(
    "Final panel border hierarchy contract (2026-09-08)",
  );
  assert(
    gameCleanupStart >= 0,
    "Final game panel border hierarchy contract is missing.",
  );
  const gameCleanup = gameCss.slice(gameCleanupStart);
  for (const required of [
    ".draw2-game-hierarchy-entry",
    ".draw2-game-playground-source-card",
    ".draw2-game-playground-card[data-playground-card=\"player\"]",
    "border-color: transparent !important",
  ]) {
    assert(
      gameCleanup.includes(required),
      `Final game panel border hierarchy contract missing: ${required}`,
    );
  }

  const cascadeSealStart = motionCss.lastIndexOf(
    "Final border cascade seal (2026-09-08)",
  );
  assert(cascadeSealStart >= 0, "Final border cascade seal is missing.");
  const cascadeSeal = motionCss.slice(cascadeSealStart);
  for (const required of [
    "data-workspace-profile=\"desktop\"",
    "#draw2WorkspaceLeftDock",
    "#draw2WorkspaceRightDock",
    "#draw2WorkspaceCanvasRegion",
    "#draw2WorkspaceRightCustomDock",
    "#draw2ModeTimelineDeck",
    ".draw2-game-scene-viewport:not([hidden])",
    "#draw2AudioCompactMaster",
  ]) {
    assert(
      cascadeSeal.includes(required),
      `Final border cascade seal missing: ${required}`,
    );
  }
});

Deno.test("final density contract removes redundant panel chrome", async () => {
  const motionCss = await readProjectFile("../assets/draw2-mode-motion.css");
  const densityStart = motionCss.lastIndexOf(
    "Final density contract (2026-09-08)",
  );
  assert(densityStart >= 0, "Final density contract is missing.");
  const density = motionCss.slice(densityStart);
  for (const required of [
    "#draw2WorkspaceModeSummary",
    "#draw2GameSceneViewport",
    "#draw2GameTopbarControls",
    "#draw2ModeTimelineDeck",
    ".draw2-mode-timeline-deck-heading",
    "#draw2TimelineCard",
    "#draw2TimelineCollapse",
    "#draw2WorkspacePaletteStrip",
    ".draw2-palette-active-color",
    "#draw2WorkspacePaletteGrid",
    "#draw2GameDeckStatus",
    "#draw2AudioDeckStatus",
    "#draw2GamePlaygroundBottom",
    "display: none !important",
    "grid-template-rows: 30px 24px minmax(0, 1fr)",
    "position: absolute !important",
  ]) {
    assert(
      density.includes(required),
      `Final density contract missing: ${required}`,
    );
  }
});
