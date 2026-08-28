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
    source.includes("options: { readonly respectSelection?: boolean }") &&
      (source.includes("respectSelection: false") ||
        source.includes(
          "tool === \"tile-stamp\" && activeSelectionStamp !== undefined",
        )),
    "Saved selection stamps must opt out of the active selection write filter.",
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
    ["appendColorFromDraft", "appendColorFromDraftNow"],
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
    pointerImplementation.includes("inlineSource: source.inlineSource"),
    "Saved selection stamps must use the compact inline tile source path.",
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
