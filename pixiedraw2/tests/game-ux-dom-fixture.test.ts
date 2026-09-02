const fixture = await Deno.readTextFile(
  new URL("./fixtures/game-ux-dom-fixture.html", import.meta.url),
);
const production = await Deno.readTextFile(
  new URL("../index.html", import.meta.url),
);
const productionUi = await Deno.readTextFile(
  new URL("../src/wp180-workspace-ui.ts", import.meta.url),
);
const productionContracts = await Deno.readTextFile(
  new URL("../src/wp180-workspace-contracts.ts", import.meta.url),
);
const productionGameCss = await Deno.readTextFile(
  new URL("../assets/draw2-game-ux.css", import.meta.url),
);
const productionShellCss = await Deno.readTextFile(
  new URL("../assets/draw2-shell.css", import.meta.url),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function elementById(id: string): string {
  const match = fixture.match(
    new RegExp(
      `<([a-z]+)\\b[^>]*\\bid=["']${
        escapeRegExp(id)
      }["'][^>]*>([\\s\\S]*?)</\\1>`,
      "iu",
    ),
  );
  assert(match, `Fixture element is missing: ${id}`);
  return match[0];
}

function attribute(element: string, name: string): string | undefined {
  return element.match(
    new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, "iu"),
  )?.[1];
}

function hasBooleanAttribute(element: string, name: string): boolean {
  return new RegExp(`\\s${escapeRegExp(name)}(?:\\s|>)`, "iu").test(element);
}

function textContent(element: string): string {
  return element.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}

const steps = [
  "template",
  "scene",
  "node",
  "inspector",
  "asset",
  "logic",
  "preview",
  "build",
] as const;

Deno.test("iGAME fixture exposes the beginner flow in semantic order", () => {
  let previous = -1;
  for (const step of steps) {
    const marker = fixture.indexOf(`data-ux-step="${step}"`);
    assert(marker > previous, `UX step must follow the flow order: ${step}`);
    previous = marker;
  }
  for (
    const expected of [
      "Create from recommended template",
      "Scene",
      "Add node",
      "Inspector",
      "Assign Player sprite",
      "Add event",
      "Start Preview",
      "Run Build preflight",
    ]
  ) assert(fixture.includes(expected), `Beginner CTA is missing: ${expected}`);
});

Deno.test("iGAME fixture keeps Scene and selected Node context across every step", () => {
  for (const step of steps) {
    const panel = fixture.match(
      new RegExp(
        `<section\\b[^>]*data-ux-step=["']${step}["'][^>]*>[\\s\\S]*?</section>`,
        "iu",
      ),
    )?.[0];
    assert(panel, `Step panel is missing: ${step}`);
    assert(
      attribute(panel, "data-selected-scene") === "scene-village",
      `Scene context changed at ${step}`,
    );
    assert(
      attribute(panel, "data-selected-node") === "node-player",
      `Node context changed at ${step}`,
    );
  }
  const context = elementById("context");
  assert(
    attribute(context, "data-selected-scene") === "scene-village",
    "Global Scene context is missing",
  );
  assert(
    attribute(context, "data-selected-node") === "node-player",
    "Global Node context is missing",
  );
});

Deno.test("iGAME fixture makes editor and Preview state explicit", () => {
  const context = elementById("context");
  assert(
    attribute(context, "data-editor-state") === "editing",
    "Editing state must be explicit",
  );
  assert(
    attribute(context, "data-preview-state") === "stopped",
    "Stopped Preview state must be explicit",
  );
  const preview = elementById("preview-panel");
  assert(
    attribute(preview, "data-editor-state") === "previewing",
    "Preview panel must expose previewing state",
  );
  assert(
    attribute(preview, "data-preview-state") === "running",
    "Preview panel must expose running state",
  );
  for (const id of ["preview-start", "preview-stop", "stop-preview"]) {
    const button = elementById(id);
    assert(
      attribute(button, "aria-pressed") !== undefined,
      `${id} needs aria-pressed`,
    );
  }
  const stop = elementById("preview-stop");
  assert(
    /\sdisabled(?:\s|>)/iu.test(stop),
    "Stop Preview must be disabled while stopped",
  );
  assert(
    attribute(stop, "data-disabled-reason") === "Preview is not running",
    "Disabled Preview control needs a reason",
  );
});

Deno.test("iGAME fixture has complete tab and tabpanel relationships", () => {
  const tablist = fixture.match(/<ol\b[^>]*role=["']tablist["'][^>]*>/iu);
  assert(tablist, "The flow must have one semantic tablist");
  for (const step of steps) {
    const tab = elementById(`step-${step}`);
    assert(
      attribute(tab, "role") === "tab",
      `Step control needs role=tab: ${step}`,
    );
    const panelId = attribute(tab, "aria-controls");
    assert(
      attribute(tab, "aria-selected") !== undefined,
      `Tab needs aria-selected: ${step}`,
    );
    assert(panelId, `Tab needs aria-controls: ${step}`);
    const panel = elementById(panelId);
    assert(
      attribute(panel, "role") === "tabpanel",
      `${panelId} must be a tabpanel`,
    );
    assert(
      attribute(panel, "aria-labelledby") === `step-${step}`,
      `${panelId} must point back to its tab`,
    );
    const selected = attribute(tab, "aria-selected") === "true";
    assert(
      hasBooleanAttribute(panel, "hidden") === !selected,
      `${panelId} visibility must follow its tab state`,
    );
    assert(
      attribute(tab, "tabindex") === (selected ? "0" : "-1"),
      `Tab roving tabindex is invalid: ${step}`,
    );
  }
  assert(
    textContent(elementById("step-template")).includes("New project"),
    "New project tab needs an accessible name",
  );
});

Deno.test("production iGAME surface exposes integration hooks and CSS order", () => {
  for (
    const id of [
      "draw2WorkspaceFrame",
      "draw2GameLeftDock",
      "draw2GameSceneViewport",
      "draw2WorkspaceRightDock",
      "draw2ModeDeckGame",
    ]
  ) {
    assert(
      production.includes(`id="${id}"`),
      `Production hook is missing: ${id}`,
    );
  }
  for (
    const marker of [
      'data-creator-mode="GAME"',
      "draw2-game-ux.css",
      "draw2-mode-motion.css",
    ]
  ) {
    assert(
      production.includes(marker),
      `Production integration marker is missing: ${marker}`,
    );
  }
  const shellIndex = production.indexOf("draw2-shell.min.css");
  const gameUxIndex = production.indexOf("draw2-game-ux.css");
  const motionIndex = production.indexOf("draw2-mode-motion.css");
  assert(
    shellIndex >= 0 && shellIndex < gameUxIndex && gameUxIndex < motionIndex,
    "iGAME CSS must load after shell and before motion",
  );

  const leftHierarchy = production.match(
    /<div\b[^>]*id="draw2GameLeftDockHierarchyPanel"[^>]*>/iu,
  )?.[0] ?? "";
  const leftNodeBox = production.match(
    /<div\b[^>]*id="draw2GameLeftDockNodeBoxPanel"[^>]*>/iu,
  )?.[0] ?? "";
  const hierarchyTab = production.match(
    /<button\b[^>]*id="draw2GameLeftDockTabHierarchy"[^>]*>/iu,
  )?.[0] ?? "";
  const nodeBoxTab = production.match(
    /<button\b[^>]*id="draw2GameLeftDockTabNodeBox"[^>]*>/iu,
  )?.[0] ?? "";
  const sceneDeckTab = production.match(
    /<button\b[^>]*data-mode-deck-tab="game-scene"[^>]*>/iu,
  )?.[0] ?? "";
  const inventoryDeckTab = production.match(
    /<button\b[^>]*data-mode-deck-tab="game-assets"[^>]*>/iu,
  )?.[0] ?? "";
  assert(
    hasBooleanAttribute(leftHierarchy, "hidden") &&
      !hasBooleanAttribute(leftNodeBox, "hidden") &&
      attribute(hierarchyTab, "aria-selected") === "false" &&
      attribute(nodeBoxTab, "aria-selected") === "true" &&
      attribute(sceneDeckTab, "aria-selected") === "false" &&
      attribute(inventoryDeckTab, "aria-selected") === "true",
    "Production GAME first paint must project Node Box and Inventory",
  );

  const compactUi = productionUi.replace(/\s+/gu, " ");
  const gameProfile = productionContracts.match(
    /GAME:\s*\{[\s\S]*?defaultPanel:\s*"([^"]+)"/u,
  )?.[1];
  assert(
    gameProfile === "game-inspector" &&
      compactUi.includes('let gameRailTab: GameAssetBrowserTab = "ASSETS";') &&
      compactUi.includes('let modeDeckActiveTab = "game-assets";') &&
      compactUi.includes(
        'const firstTab = gameSurface ? "game-assets" : "audio-timeline";',
      ) &&
      compactUi.includes(
        'gameCreationModePromptVisible ? "game-scene" : currentDesktopModeProfile().defaultPanel',
      ),
    "Production GAME defaults must keep Inspector/Inventory authority in TypeScript",
  );

  const gameAssetSelection = compactUi.match(
    /if \(entry\.source === "GAME"[\s\S]*?\n\s*\}/u,
  )?.[0] ?? "";
  assert(
    !gameAssetSelection.includes('setPanel("game-assets")') &&
      !gameAssetSelection.includes('activateGameRailTab("ANIMATION")'),
    "Selecting a Game tile in Inventory must not force right Asset or Animation panels",
  );
  assert(
    /#draw2WorkspaceFrame\[data-creator-mode="GAME"\]/u.test(
      productionGameCss,
    ) &&
      /@media\s*\(min-width:\s*1024px\)/u.test(productionGameCss),
    "iGAME visual rules must remain scoped to GAME desktop CSS",
  );

  const compactGameCss = productionGameCss.replace(/\s+/gu, " ");
  const desktopGameRules = compactGameCss.match(
    /@media \(min-width: 1024px\) \{([\s\S]*?)(?=@media|$)/u,
  )?.[1] ?? "";
  const assetsSurfaceRule = desktopGameRules.match(
    /#draw2WorkspaceFrame\[data-creator-mode="GAME"\][\s\S]*?\[data-game-rail-surface="ASSETS"\][^{]*\{([^}]*)\}/u,
  )?.[1] ?? "";
  const assetsCatalogRule = desktopGameRules.match(
    /#draw2WorkspaceFrame\[data-creator-mode="GAME"\][\s\S]*?\.draw2-game-asset-catalog \{([^}]*)\}/u,
  )?.[1] ?? "";
  assert(
    /(?:display\s*:\s*grid|grid-template-(?:rows|columns)\s*:)/u.test(
      assetsSurfaceRule,
    ) &&
      /grid-template-(?:rows|columns)\s*:/u.test(assetsSurfaceRule) &&
      /overflow(?:-[xy])?\s*:/u.test(assetsSurfaceRule) &&
      /min-height\s*:/u.test(assetsSurfaceRule) &&
      /grid-template-areas\s*:[^;]*(?:title|heading)[^;]*(?:controls|control)[^;]*catalog/u.test(
        assetsSurfaceRule,
      ),
    "Desktop GAME Inventory surface must retain a two-row grid with named title/controls/catalog areas",
  );
  assert(
    /grid-area\s*:\s*catalog\b/u.test(assetsCatalogRule) &&
      /overflow(?:-[xy])?\s*:/u.test(assetsCatalogRule) &&
      /(?:min-height|flex)\s*:/u.test(assetsCatalogRule) &&
      /(?:align-content|grid-auto-(?:rows|flow)|grid-template-columns)\s*:/u.test(
        assetsCatalogRule,
      ),
    "Desktop GAME Inventory catalog must retain a positive flow sizing rule without fixed-height coupling",
  );

  const compactGameRuleBlocks = [
    ...compactGameCss.matchAll(
      /@media \(min-width: 1024px\) and \(max-width: 1119px\) \{([\s\S]*?)(?=@media|$)/gu,
    ),
  ].map((match) => match[1] ?? "");
  assert(
    compactGameRuleBlocks.some(
      (rules) =>
        /\[data-game-rail-surface="ASSETS"\]/u.test(rules) &&
        /\.draw2-game-asset-catalog[\s\S]*?(?:grid|gap|min-height|overflow)\s*:/u.test(
          rules,
        ) &&
        /\.draw2-game-asset-card[\s\S]*?(?:grid|gap|min-height|padding)\s*:/u.test(
          rules,
        ),
    ),
    "1024-1119px GAME Inventory must retain compact catalog/card sizing rules",
  );

  const inspectorContainerRule = compactGameCss.match(
    /@container game-inspector \(max-width:[^)]*\) \{([\s\S]*?)(?=@container|@media|$)/u,
  )?.[1] ?? "";
  assert(
    inspectorContainerRule.length > 0 &&
      /(?:overflow|overflow-wrap|white-space)\s*:/u.test(
        inspectorContainerRule,
      ) &&
      /(?:flex-direction|flex-wrap|grid-template-columns|max-width|min-width)\s*:/u.test(
        inspectorContainerRule,
      ),
    "Narrow GAME Inspector must retain container-query overflow/wrapping safeguards",
  );

  const compactShellCss = productionShellCss.replace(/\s+/gu, " ");
  const narrowDesktopRuleBlocks = [
    ...compactShellCss.matchAll(
      /@media \(min-width: 701px\) and \(max-width: 1119px\) \{([\s\S]*?)(?=@media|$)/gu,
    ),
  ].map((match) => match[1]);
  const narrowDesktopRules = narrowDesktopRuleBlocks.join(" ");
  assert(
    /\[data-creator-mode="GAME"\][\s\S]*#draw2WorkspaceRightDock[\s\S]*grid-template-columns\s*:/u.test(
      narrowDesktopRules,
    ) &&
      /\[data-creator-mode="GAME"\][\s\S]*?(?:overflow|flex-wrap|min-width)\s*:/u.test(
        `${narrowDesktopRules} ${compactGameCss}`,
      ),
    "Narrow desktop GAME Inspector layout must retain width-query column and overflow/wrapping safeguards",
  );
});

Deno.test("iGAME fixture exposes an error route back to the relevant settings", () => {
  for (const id of ["asset-error", "build-error"]) {
    const error = elementById(id);
    assert(
      attribute(error, "role") === "alert",
      `${id} must be announced as an error`,
    );
    const link = error.match(/<a\b[^>]*href=["']#([^"']+)["'][^>]*>/iu);
    assert(link?.[1], `${id} must link back to settings`);
    const target = elementById(link[1]);
    assert(
      attribute(target, "data-ux-step") ===
        (id === "asset-error" ? "asset" : "asset"),
      `${id} must return to Asset settings`,
    );
    assert(
      attribute(link[0], "aria-controls") === link[1],
      `${id} link must identify its settings target`,
    );
  }
});

Deno.test("iGAME Node Box keeps search, empty-state, and interaction contracts", () => {
  const nodeBoxSearch = production.match(
    /<input\b[^>]*id="draw2GameNodeBoxSearch"[^>]*>/iu,
  )?.[0] ?? "";
  const nodeBoxCta = production.match(
    /<button\b[^>]*id="draw2GameNodeBoxHierarchyCta"[^>]*>[\s\S]*?<\/button>/iu,
  )?.[0] ?? "";
  const nodeBoxEmpty = production.match(
    /<p\b[^>]*id="draw2GameNodeBoxEmpty"[^>]*>[\s\S]*?<\/p>/iu,
  )?.[0] ?? "";
  assert(
    production.includes('id="draw2GameNodeBox"') &&
      production.includes('class="draw2-game-node-box"'),
    "Production Node Box hook is missing",
  );
  assert(
    attribute(nodeBoxSearch, "type") === "search" &&
      attribute(nodeBoxSearch, "aria-controls") === "draw2GameNodeBox" &&
      attribute(nodeBoxSearch, "aria-describedby") ===
        "draw2GameNodeBoxDescription" &&
      production.includes('id="draw2GameNodeBoxDescription"'),
    "Node Box search must be a labelled, controlled search field",
  );
  assert(
    attribute(nodeBoxCta, "data-game-node-box-action") === "open-hierarchy" &&
      attribute(nodeBoxCta, "aria-controls") ===
        "draw2GameLeftDockHierarchyPanel" &&
      attribute(nodeBoxCta, "aria-label") ===
        "階層を開いてGameObjectを追加・選択" &&
      attribute(nodeBoxCta, "title") ===
        "Hierarchyタブを開き、GameObjectを追加または選択" &&
      textContent(nodeBoxCta).includes("階層を開いて追加・選択"),
    "Node Box must expose a Hierarchy selection CTA",
  );
  assert(
    attribute(nodeBoxEmpty, "role") === "status" &&
      attribute(nodeBoxEmpty, "aria-live") === "polite" &&
      hasBooleanAttribute(nodeBoxEmpty, "hidden"),
    "Node Box empty results must be announced without taking layout space",
  );

  const nodeTiles = production.match(
    /<button\b[^>]*class="[^"]*draw2-game-node-tile[^"]*"[^>]*>/giu,
  ) ?? [];
  assert(nodeTiles.length > 0, "Production Node Box must contain node tiles");
  for (const tile of nodeTiles) {
    assert(
      attribute(tile, "type") === "button" &&
        attribute(tile, "data-game-component-type") !== undefined,
      "Node tiles must remain native buttons with component payloads",
    );
  }

  const compactUi = productionUi.replace(/\s+/gu, " ");
  assert(
    compactUi.includes("normalizeGameNodeSearchText") &&
      compactUi.includes("renderGameNodeBoxFilter") &&
      compactUi.includes('draw2GameNodeBoxSearch?.addEventListener("input",'),
    "Node Box search implementation must remain in the workspace controller",
  );
  assert(
    compactUi.includes("tile.hidden = !visible;") &&
      compactUi.includes('tile.setAttribute("aria-hidden", String(!visible));') &&
      compactUi.includes("tile.disabled = selected === undefined;") &&
      compactUi.includes("tile.draggable = selected !== undefined;") &&
      compactUi.includes('setGameLeftDockTab("hierarchy");') &&
      compactUi.includes("focusGameHierarchyNextAction") &&
      compactUi.includes("gameDeckTracks.length === 0") &&
      compactUi.includes("gameHierarchyAdd?.focus()") &&
      compactUi.includes("gameHierarchyQuery?.focus()") &&
      compactUi.includes("GAME_NODE_TILE_DRAG_MIME") &&
      compactUi.includes("dataTransfer.setData"),
    "Node Box filtering must preserve aria, disabled, drag, CTA, and drop contracts",
  );
  const rootDragStart = compactUi.match(
    /root\.addEventListener\("dragstart",\s*\(event\)\s*=>\s*\{[\s\S]*?\}\);/u,
  )?.[0] ?? "";
  const nodeTileGuardIndex = rootDragStart.indexOf(
    'event.target.closest(".draw2-game-node-tile")',
  );
  const genericCancelIndex = rootDragStart.indexOf("event.preventDefault();");
  assert(
    rootDragStart.includes('event.target instanceof Element') &&
      rootDragStart.includes('event.target.closest(".draw2-game-node-tile")') &&
      rootDragStart.includes("return;") &&
      rootDragStart.includes("event.preventDefault();") &&
      nodeTileGuardIndex < genericCancelIndex,
    "Root dragstart guard must preserve the generic cancel while exempting Node Box tiles",
  );
  assert(
    compactUi.includes('draw2GameNodeBox?.addEventListener("dragstart"') &&
      compactUi.includes('draw2GameComponents?.addEventListener("drop"') &&
      compactUi.includes('draw2GameComponentsDropHint?.addEventListener("drop"') &&
      compactUi.includes("GAME_NODE_TILE_DRAG_MIME") &&
      compactUi.includes("dataTransfer.setData"),
    "Node Box drag payload must be able to reach both Inspector drop targets",
  );
  assert(
    !compactUi.includes("focusGameAnimationForTrack") &&
      !compactUi.includes("gameTrackSupportsAnimation") &&
      compactUi.includes('activateGameRailTab("ANIMATION")'),
    "Scene, Hierarchy, and Inventory selection must not auto-switch Animation while explicit Animation actions remain",
  );

  assert(
    /@media\s*\(min-width:\s*1024px\)/u.test(productionGameCss) &&
      productionGameCss.includes(".draw2-game-node-box-intro") &&
      productionGameCss.includes(".draw2-game-node-search") &&
      productionGameCss.includes("var(--draw2-space-1, 4px)") &&
      /#draw2GameLeftDockNodeBoxPanel[\s\S]*overflow:\s*hidden/u.test(
        productionGameCss,
      ) &&
      /#draw2GameNodeBox[\s\S]*flex:\s*1 1 0/u.test(productionGameCss) &&
      /#draw2GameNodeBox[\s\S]*min-height:\s*0/u.test(productionGameCss) &&
      /#draw2GameNodeBox[\s\S]*overflow-y:\s*auto/u.test(productionGameCss),
    "Node Box guidance/search styling must stay in the desktop UX token layer",
  );
});

Deno.test("iGAME tab groups keep roving focus and tabpanel contracts", () => {
  const gameTabs = [
    ["draw2ModeTimelineDeckTabGameScene", "draw2GameRailSurfaceScene"],
    ["draw2ModeTimelineDeckTabGameAssets", "draw2GameRailSurfaceAssets"],
    [
      "draw2ModeTimelineDeckTabGameAnimation",
      "draw2GameRailSurfaceAnimation",
    ],
    ["draw2ModeTimelineDeckTabGameData", "draw2GameRailSurfaceData"],
    ["draw2ModeTimelineDeckTabGameEvents", "draw2GameRailSurfaceEvents"],
  ] as const;
  for (const [tabId, panelId] of gameTabs) {
    const tab = production.match(
      new RegExp(`<button\\b[^>]*id="${tabId}"[^>]*>`, "iu"),
    )?.[0] ?? "";
    const panel = production.match(
      new RegExp(`<section\\b[^>]*id="${panelId}"[^>]*>`, "iu"),
    )?.[0] ?? "";
    assert(
      attribute(tab, "role") === "tab" &&
        attribute(tab, "aria-controls") === panelId &&
        attribute(tab, "tabindex") !== undefined,
      `GAME tab must control its tabpanel: ${tabId}`,
    );
    assert(
      attribute(panel, "role") === "tabpanel" &&
        attribute(panel, "aria-labelledby") === tabId,
      `GAME surface must point back to its tab: ${panelId}`,
    );
  }

  for (const [tabId, panelId] of [
    ["draw2GameLeftDockTabHierarchy", "draw2GameLeftDockHierarchyPanel"],
    ["draw2GameLeftDockTabNodeBox", "draw2GameLeftDockNodeBoxPanel"],
  ] as const) {
    const tab = production.match(
      new RegExp(`<button\\b[^>]*id="${tabId}"[^>]*>`, "iu"),
    )?.[0] ?? "";
    const panel = production.match(
      new RegExp(`<div\\b[^>]*id="${panelId}"[^>]*>`, "iu"),
    )?.[0] ?? "";
    assert(
      attribute(tab, "role") === "tab" &&
        attribute(tab, "aria-controls") === panelId &&
        attribute(tab, "tabindex") !== undefined,
      `Left Dock tab must control its tabpanel: ${tabId}`,
    );
    assert(
      attribute(panel, "role") === "tabpanel" &&
        attribute(panel, "aria-labelledby") === tabId,
      `Left Dock panel must point back to its tab: ${panelId}`,
    );
  }

  const compactUi = productionUi.replace(/\s+/gu, " ");
  assert(
    compactUi.includes("visibleGameModeDeckTabs") &&
      compactUi.includes("visibleGameLeftDockTabs") &&
      compactUi.includes("modeTimelineDeckTabs.filter") &&
      compactUi.includes('key !== "ArrowLeft"') &&
      compactUi.includes('key !== "ArrowRight"') &&
      compactUi.includes('key !== "ArrowUp"') &&
      compactUi.includes('key !== "ArrowDown"') &&
      compactUi.includes('key !== "Home"') &&
      compactUi.includes('key !== "End"') &&
      compactUi.includes("selectModeDeckTab(nextTabId);") &&
      compactUi.includes("setGameLeftDockTab(nextTabId);") &&
      compactUi.includes("nextTab.focus();"),
    "GAME tabs must use Arrow/Home/End navigation through canonical selectors",
  );
});

Deno.test("iGAME fixture remains an isolated semantic fixture", () => {
  assert(
    attribute(fixture, "data-production") === "false",
    "Fixture must be marked non-production",
  );
  assert(
    !/<link\b/iu.test(fixture) && !/<script\b/iu.test(fixture),
    "Fixture must not load CSS, JavaScript, or external dependencies",
  );
  assert(
    !/style=|position\s*:/iu.test(fixture),
    "Coordinates and CSS must not be part of the contract",
  );
});
