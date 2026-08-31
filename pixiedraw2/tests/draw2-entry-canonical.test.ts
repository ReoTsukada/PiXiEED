const entryPath = new URL("../src/draw2-entry.ts", import.meta.url);
const source = await Deno.readTextFile(entryPath);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Draw2 entry canonical state is adopted through one synchronisation helper", () => {
  assert(
    (source.match(/function adoptCanonicalState\(/g) ?? []).length === 1,
    "Canonical state must have one state/core synchronisation helper.",
  );
  assert(
    source.includes("refreshSelectionSnapshotForCurrentRaster();") &&
      source.includes(
        "regions: selection.mask.regions.map((region) => ({ ...region }))",
      ),
    "Raster writes must refresh selection pixels and preserve mask regions.",
  );
  assert(
    source.includes("Draw2SelectionStampStore") &&
      source.includes("selectionStamps: selectionStampStore.list()") &&
      !source.includes("selectionStampFromCurrentSelection") &&
      !source.includes("useSelectionStamp"),
    "Legacy selection-stamp metadata may round-trip, but the iDRAW feature must not be exposed or activated.",
  );
});

Deno.test("Draw2 entry rejects stale timeline activation completions", () => {
  assert(
    source.includes("latestTimelineActivationRequestId") &&
      source.includes(
        "options.activationRequestId !== latestTimelineActivationRequestId",
      ),
    "Timeline activation needs a latest-request guard.",
  );
  assert(
    source.indexOf(
      "normalizeTimelineSession();\n  notifyAssetStateChanged();\n  await present();",
    ) >= 0,
    "Undo/Redo must normalize the timeline session before presenting.",
  );
});

Deno.test("Draw2 entry clears pending activation on the already-active fast path", () => {
  const activationStart = source.indexOf(
    "async function activateTimelineCell(",
  );
  const activationEnd = source.indexOf("async function runTimelineCommand(");
  const activation = source.slice(activationStart, activationEnd);
  const fastPath = activation.indexOf("state.activeCelId === celId");
  const fastPathEnd = activation.indexOf(
    "if (selection !== undefined",
    fastPath,
  );
  const fastPathSource = activation.slice(fastPath, fastPathEnd);
  assert(
    fastPathSource.includes("timelineActivationPending = false;") &&
      fastPathSource.includes("await present();"),
    "Already-active activation must release drawing after superseding an old request.",
  );
});

Deno.test("Draw2 entry serializes every local canonical raster mutation", () => {
  const mutationWrappers = [
    ["commitColorEdit", "commitColorEditNow"],
    ["appendColorFromDraft", "appendPaletteDraftsNow"],
    ["commitWriteSet", "commitWriteSetNow"],
    ["commitPointerPoints", "commitPointerPointsNow"],
  ] as const;
  for (const [wrapper, implementation] of mutationWrappers) {
    const wrapperStart = source.indexOf(`function ${wrapper}(`);
    const implementationStart = source.indexOf(
      `async function ${implementation}(`,
    );
    assert(
      wrapperStart >= 0 && implementationStart > wrapperStart,
      `${wrapper} must delegate to a separate implementation`,
    );
    const wrapperSource = source.slice(wrapperStart, implementationStart);
    assert(
      wrapperSource.includes("enqueueCanonicalOperation") &&
        wrapperSource.includes(implementation),
      `${wrapper} must enter the canonical operation queue`,
    );
  }
  const pointerImplementation = source.slice(
    source.indexOf("async function commitPointerPointsNow("),
  );
  assert(
    pointerImplementation.includes("commitWriteSetNow("),
    "Nested pointer-tool writes must not enqueue themselves and deadlock.",
  );
  assert(
    pointerImplementation.includes('if (tool === "tile-stamp")') &&
      pointerImplementation.includes("selectedTileSource") &&
      !pointerImplementation.includes("selectionStampSourceForAsset"),
    "Tile Placement must remain available independently from the retired selection-stamp feature.",
  );
});

Deno.test("Draw2 live previews batch frames and keep empty coalesced samples", () => {
  assert(
    source.includes("window.requestAnimationFrame") &&
      source.includes("function flushDrawOverlay()") &&
      source.includes("window.cancelAnimationFrame"),
    "Live overlay rendering must be coalesced to the display frame and flush on gesture end.",
  );
  assert(
    source.includes("sampled === undefined || sampled.length === 0") &&
      source.includes("? [event]\n    : [...sampled, event]") &&
      source.includes("sampled = undefined"),
    "Coalesced input must retain the authoritative outer pointermove, including empty or throwing implementations.",
  );
  assert(
    source.includes("onCommitQueued: queuePendingDrawPreview") &&
      source.includes("let pendingDrawPreviews") &&
      source.includes('pointerSampleFromEvent(event, "up")'),
    "The final preview must remain visible through delayed commits and capture-loss pointerup recovery.",
  );
  const pointerMoveStart = source.indexOf(
    'canvas.addEventListener("pointermove", (event) => {',
  );
  const pointerMoveEnd = source.indexOf(
    'canvas.addEventListener("pointerup", (event) => {',
    pointerMoveStart,
  );
  const pointerMove = source.slice(pointerMoveStart, pointerMoveEnd);
  assert(
    pointerMove.includes("scheduleDrawOverlay()") &&
      !pointerMove.includes("(event.buttons & 1) === 0"),
    "The active pointer must reach the input state machine even when buttons briefly reports zero.",
  );
});

Deno.test("Draw2 stroke serialization compacts dense input before interpolation validation", () => {
  const strokeStart = source.indexOf("const rawStrokePoints = sourcePoints.map");
  const strokeEnd = source.indexOf("const command = {", strokeStart);
  const strokeSource = source.slice(strokeStart, strokeEnd);
  assert(
    strokeStart >= 0 && strokeEnd > strokeStart &&
      strokeSource.indexOf("compactPixelPath(") >= 0 &&
      strokeSource.indexOf("compactPixelPath(") <
        strokeSource.indexOf("interpolatePixelPath(strokePoints)") &&
      !strokeSource.includes("interpolatePixelPath(rawStrokePoints)"),
    "Dense pointer input must be reduced before bounded canonical interpolation.",
  );
});

Deno.test("Draw2 fill live preview uses the bounded canonical flood geometry", () => {
  assert(
    source.includes("function fillPreviewRegion(") &&
      source.includes("createFillPreviewWriteSet(") &&
      source.includes("createIndexedGradientWriteSet(") &&
      source.includes("const writes = fillPreviewWrites(asset, first, last);"),
    "Fill preview must derive from the same bounded connected region and indexed gradient as the real operation.",
  );
});

Deno.test("Draw2 palette add uses nearby colors and drag grids", () => {
  const renderStart = source.indexOf("function renderPaletteButtons(");
  const renderEnd = source.indexOf(
    "function setColorEditorFromWheel(",
    renderStart,
  );
  const renderSource = source.slice(renderStart, renderEnd);
  assert(
    renderSource.includes("pointerdown") &&
      source.includes("pendingPaletteAppendDraft = source") &&
      renderSource.includes("appendColorFromDraft(draft)") &&
      renderSource.includes("beginPaletteAddPointer") &&
      !renderSource.includes("data-color-batch-add"),
    "The palette must expose one plus control with click and drag behavior.",
  );
  const appendStart = source.indexOf("function appendColorFromDraft(");
  const appendEnd = source.indexOf(
    "function setStatus(",
    appendStart,
  );
  const appendSource = source.slice(appendStart, appendEnd);
  assert(
    appendSource.includes("findNearestMissingPaletteColor") &&
      appendSource.includes("appendPaletteDraftsNow") &&
      appendSource.includes("paletteAppendInFlight = false"),
    "A palette click must append the nearest missing color through the queue.",
  );
  assert(
    source.includes("palettePointerActive") &&
      source.includes("buildPaletteGridDrafts") &&
      source.includes("paletteGridDropTargetFromClient") &&
      source.includes("document.elementFromPoint") &&
      source.includes("colorMap.contains(hit)") &&
      source.includes("target.cellIndex - palette.length + 1") &&
      source.includes("appendPaletteGridFromDrafts") &&
      source.includes('commandType: "palette.appendColors"') &&
      source.includes("data-palette-drop-cell") &&
      !source.includes("paletteDraftFromWheelClient") &&
      !source.includes("data-palette-drop-active") &&
      !source.includes("paletteBatch"),
    "A palette drag must fill the palette grid through the drop cell without a separate batch button.",
  );
});

Deno.test("Draw2 mirror handles keep click toggles separate from dragging", () => {
  const mirrorStart = source.indexOf(
    'viewportWrapElement?.addEventListener("pointerdown", (event) => {',
  );
  const mirrorEnd = source.indexOf("type StepControl", mirrorStart);
  const mirrorSource = source.slice(mirrorStart, mirrorEnd);
  assert(
    mirrorStart >= 0 && mirrorEnd > mirrorStart &&
      mirrorSource.includes("mirrorGuideClickSuppressed = false") &&
      mirrorSource.includes("handle: mirrorHandle") &&
      mirrorSource.includes("updateMirrorGuideDragFromPointer(event)") &&
      mirrorSource.includes(
        "Do not capture or cancel the pointer on pointerdown",
      ) &&
      mirrorSource.includes(
        'window.addEventListener("pointerup", finishMirrorGuideDrag)',
      ) &&
      mirrorSource.includes(
        'window.addEventListener("pointercancel", finishMirrorGuideDrag)',
      ) &&
      source.includes('".draw2-workspace-context-row"') &&
      source.includes("contextRowBottom - viewport.top") &&
      source.includes("diagonalDownCanvasY") &&
      source.includes("diagonalUpCanvasX") &&
      source.includes("canvasCoordinateToDiagonalMirrorGuideOffset"),
    "Mirror handles must keep native click toggles and promote to drag only after movement.",
  );
});

Deno.test("Draw2 Project start deletion detaches PiXYNC before local cleanup", () => {
  assert(
    source.includes("deleteWorkspaceProjectLocalData") &&
      source.includes("project-data-storage.js?v=20260828-project-delete-v1"),
    "Project deletion must use the lazy storage boundary.",
  );
  assert(
    source.includes("detachPixyncProject") &&
      source.includes("PixyncProjectDeletionError") &&
      source.indexOf("await detachPixyncProject") <
        source.indexOf("await deleteWorkspaceProjectLocalData"),
    "Shared PiXYNC deletion must finish remote detachment before local cleanup.",
  );
  assert(
    source.includes("LOCALIZATION_REQUIRED") &&
      source.includes("ローカライズ済みの端末コピーを確定してから削除できます") &&
      source.includes("Project dataは残しています"),
    "Shared owner deletion must stop safely when localization is incomplete.",
  );
  assert(
    source.includes("if (state.projectId === projectId)") &&
      !source.includes("workspaceFrameElement?.hidden === false && state.projectId === projectId"),
    "The active Project must remain protected even while the start screen is visible.",
  );
  assert(
    source.includes("item.append(button, deleteButton)") &&
      source.includes("deleteButton.addEventListener"),
    "Recent Projects need separate open and delete controls.",
  );
  assert(
    source.includes('"PiXYNC shared"') &&
      source.includes('"Local Project"') &&
      source.includes("meta.title = project.projectId"),
    "Recent Project cards must keep the visible metadata compact while retaining the full ID for inspection.",
  );
  assert(
    source.includes("const DRAW2_RECENT_PROJECT_LIMIT = 8") &&
      source.includes("const seen = new Set<string>()") &&
      source.includes("if (seen.has(projectId)) continue") &&
      source.includes("slice(0, DRAW2_RECENT_PROJECT_LIMIT)"),
    "Recent Project metadata must remain bounded and deduplicate old index entries.",
  );
  assert(
    source.includes("データは残しているため、再試行できます") &&
      source.includes("withoutDraw2ProjectEditorPreferences"),
    "Failed deletion must keep a retry pointer and clear preferences only after success.",
  );
});

Deno.test("Draw2 PiXYNC open shares one active-project persistence port", () => {
  assert(
    (source.match(/createPixyncIndexedDbPersistence\(/g) ?? []).length === 1 &&
      source.includes("const inner = createPixyncIndexedDbPersistence(projectId)"),
    "PiXYNC IndexedDB persistence must be created behind one shared helper outside deletion cleanup.",
  );
  assert(
    (source.includes("createPersistence: (projectId) => pixyncPersistenceFor(projectId)") ||
      source.includes("createPersistence: (projectId) =>\n      pixyncPersistenceFor(projectId)")) &&
      source.includes("persistence: pixyncPersistenceFor(projectId)"),
    "Lifecycle and production composition must share the active Project persistence port.",
  );
  assert(
    source.includes("cached = undefined;") &&
      source.includes("A CAS conflict means this tab no longer knows the durable base"),
    "Persistence cache must be invalidated after a CAS conflict.",
  );
  assert(
    source.includes("return await pixyncPersistenceFor(String(id)).remove();") &&
      source.includes("A second tab can delete this Project after the active port was"),
    "Draw2 Project deletion must use the permanent PiXYNC removal barrier and invalidate stale cached snapshots.",
  );
});
