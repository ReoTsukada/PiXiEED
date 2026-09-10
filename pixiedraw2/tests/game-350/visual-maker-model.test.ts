import {
  createDefaultGameVisualMakerConfig,
  GAME_VISUAL_MAKER_CATEGORIES,
  GAME_VISUAL_MAKER_DIRECTIONS,
  GAME_VISUAL_MAKER_MOTIONS,
  isValidGameVisualMakerConfig,
  normalizeGameVisualMakerConfig,
  updateGameVisualMakerUiSlot,
  createGameUiNode,
  isValidGameUiNode,
  updateGameUiNode,
  normalizeGameUiNode,
  cloneGameUiNode,
  upsertGameUiNode,
  reorderGameUiNodes,
  arrangeGameUiNodes,
} from "../../src/game/game-350/visual-maker-model.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-VISUAL-MAKER-001 exposes the five beginner work areas", () => {
  assert(
    GAME_VISUAL_MAKER_CATEGORIES.map((item) => item.id).join(",") ===
      "WORLD,HERO,ITEM,EVENT,UI",
    "visual maker categories should follow the creator's natural order",
  );
  assert(
    GAME_VISUAL_MAKER_DIRECTIONS.length === 8 &&
      GAME_VISUAL_MAKER_MOTIONS.map((item) => item.id).join(",") ===
        "IDLE,WALK,RUN,ATTACK",
    "the Hero card should expose eight directions and four motions",
  );
});

Deno.test("GAME350-VISUAL-MAKER-002 keeps UI slots fixed and reference-free", () => {
  const config = createDefaultGameVisualMakerConfig("hero");
  assert(isValidGameVisualMakerConfig(config), "default maker state should validate");
  assert(
    config.uiSlots.length === 5 &&
      config.uiSlots.map((slot) => slot.id).join(",") ===
        "TOP_LEFT,TOP_CENTER,TOP_RIGHT,BOTTOM_LEFT,BOTTOM_RIGHT",
    "five visual button positions should be available",
  );
  const next = updateGameVisualMakerUiSlot(config, "BOTTOM_RIGHT", (slot) => ({
    ...slot,
    label: "ジャンプ",
    action: "JUMP",
  }));
  assert(
    next.selectedUiSlot === "BOTTOM_RIGHT" &&
      next.uiSlots.find((slot) => slot.id === "BOTTOM_RIGHT")?.action === "JUMP",
    "selecting a screen position should update only its friendly action",
  );
  assert(
    !Object.keys(next).some((key) => key.toLocaleLowerCase().includes("pixel")),
    "maker metadata must not contain raster pixels",
  );
});

Deno.test("GAME350-VISUAL-MAKER-003 fails closed and restores a safe default", () => {
  const config = createDefaultGameVisualMakerConfig();
  const invalid = {
    ...config,
    activeCategory: "UNKNOWN",
  };
  assert(!isValidGameVisualMakerConfig(invalid), "unknown categories must be rejected");
  const restored = normalizeGameVisualMakerConfig(invalid, "player-1");
  assert(
    restored.activeCategory === "HERO" &&
      restored.hero.trackId === "player-1",
    "invalid maker state should return a safe Hero default",
  );
});

Deno.test("GAME350-UI-NODE-001 creates reusable minimap and inventory controls", () => {
  const minimap = createGameUiNode("ui:minimap", "MINIMAP");
  const inventory = createGameUiNode("ui:inventory", "INVENTORY");
  assert(minimap.action === "OPEN_MINIMAP" && inventory.action === "OPEN_INVENTORY", "UI nodes should carry their default action");
  const styled = updateGameUiNode(minimap, {
    label: "マップ",
    panelTitle: "ワールドマップ",
    panelMessage: "現在地を確認",
    panelTabs: ["基本", "装備"],
    style: { x: 82, y: 6, width: 14, height: 10 },
  });
  assert(isValidGameUiNode(styled) && styled.label === "マップ" && styled.panelTitle === "ワールドマップ" && styled.panelTabs.length === 2 && styled.style.x === 82, "UI node layout edits should remain valid");
});

Deno.test("GAME350-UI-NODE-002 upgrades legacy nodes with safe defaults", () => {
  const legacy = normalizeGameUiNode({ nodeId: "ui:legacy", kind: "BUTTON", label: "旧ボタン", style: { x: 10, y: 10, width: 12, height: 8, opacity: 1, visible: true } });
  assert(legacy?.style.zIndex === 1 && legacy.panelTitle === "ゲームメニュー" && legacy.panelTabs.length === 0, "legacy UI nodes should receive new defaults");
});

Deno.test("GAME350-UI-NODE-003 keeps inventory and minimap settings typed", () => {
  const inventory = createGameUiNode("ui:inventory", "INVENTORY");
  const minimap = createGameUiNode("ui:minimap", "MINIMAP");
  const configuredInventory = updateGameUiNode(inventory, {
    inventory: { columns: 6, filter: "EQUIPPABLE", allowUse: false },
  });
  const configuredMinimap = updateGameUiNode(minimap, {
    minimap: { scale: 2, rotateWithPlayer: true, showObjectives: false },
  });
  assert(
    configuredInventory.inventory?.columns === 6 &&
      configuredInventory.inventory.filter === "EQUIPPABLE" &&
      configuredInventory.inventory.allowUse === false &&
      configuredMinimap.minimap?.scale === 2 &&
      configuredMinimap.minimap.rotateWithPlayer === true &&
      configuredMinimap.minimap.showObjectives === false,
    "specialized UI settings should update without losing defaults",
  );
  assert(
    !isValidGameUiNode({
      ...configuredInventory,
      inventory: { ...configuredInventory.inventory, columns: 12 },
    }),
    "inventory columns must stay within the compact UI bound",
  );
});

Deno.test("GAME350-UI-NODE-004 clones nodes without shared nested state", () => {
  const source = updateGameUiNode(createGameUiNode("ui:button", "BUTTON"), {
    buttonAction: "JUMP",
    reuseKey: "hud:primary-action",
  });
  const copy = cloneGameUiNode(source, "ui:button:copy", "ジャンプ2");
  assert(
    copy.nodeId !== source.nodeId && copy.buttonAction === "JUMP" &&
      copy.reuseKey === "hud:primary-action" && copy.label === "ジャンプ2" &&
      copy.style !== source.style,
    "a reusable node copy should preserve behavior but own its identity and style",
  );
  const minimap = createGameUiNode("ui:minimap", "MINIMAP");
  const copiedMinimap = cloneGameUiNode(minimap, "ui:minimap:copy");
  assert(copiedMinimap.minimap !== minimap.minimap, "specialized settings must not alias the source node");
});

Deno.test("GAME350-UI-NODE-005 provides deterministic collection operations", () => {
  const button = createGameUiNode("ui:button", "BUTTON");
  const minimap = createGameUiNode("ui:minimap", "MINIMAP");
  const nodes = upsertGameUiNode([button, minimap], updateGameUiNode(button, { label: "決定" }));
  assert(nodes.length === 2 && nodes[0]?.label === "決定", "upsert should replace one node without growing the collection");
  const reordered = reorderGameUiNodes(nodes, ["ui:minimap", "ui:button"]);
  assert(reordered[0]?.nodeId === "ui:minimap" && reordered[1]?.nodeId === "ui:button", "reorder should follow the requested complete order");
  let rejected = false;
  try {
    reorderGameUiNodes(nodes, ["ui:button"]);
  } catch {
    rejected = true;
  }
  assert(rejected, "partial orders must be rejected instead of dropping UI nodes");
});

Deno.test("GAME350-UI-NODE-006 keeps common name, visibility, and hold settings safe", () => {
  const button = createGameUiNode("ui:button", "BUTTON", "  決定  ");
  assert(
    button.label === "決定" && button.style.visible &&
      button.interaction?.pressMode === "TAP" &&
      button.interaction.longPressMs === 500 &&
      button.layout?.autoArrange === true,
    "new UI nodes should expose safe common presentation and interaction defaults",
  );
  const configured = updateGameUiNode(button, {
    label: "長押し決定",
    interaction: { pressMode: "HOLD", longPressMs: 800, repeatWhileHeld: true },
    layout: { anchor: "FREE", autoArrange: false },
    style: { visible: false },
  });
  assert(
    configured.label === "長押し決定" && !configured.style.visible &&
      configured.interaction?.pressMode === "HOLD" &&
      configured.interaction.longPressMs === 800 &&
      configured.interaction.repeatWhileHeld &&
      configured.layout?.anchor === "FREE" && !configured.layout.autoArrange,
    "partial updates should become complete typed settings",
  );
  assert(
    !isValidGameUiNode({
      ...configured,
      interaction: { ...configured.interaction, longPressMs: 50 },
    }) &&
      !isValidGameUiNode({
        ...configured,
        style: { ...configured.style, x: 96, width: 8 },
    }),
    "hold timing and percentage bounds must reject DOM-breaking values",
  );
  const recovered = normalizeGameUiNode({
    nodeId: "ui:legacy-bounds",
    kind: "BUTTON",
    label: "範囲外",
    style: { x: 96, y: 98, width: 20, height: 20, opacity: 2, visible: true, zIndex: 1200 },
  });
  assert(
    recovered !== undefined && recovered.style.x + recovered.style.width <= 100 &&
      recovered.style.y + recovered.style.height <= 100 &&
      recovered.style.opacity === 1 && recovered.style.zIndex === 999,
    "legacy percentage rectangles should be clamped into the DOM overlay",
  );
});

Deno.test("GAME350-UI-NODE-007 auto-arranges without stacking and preserves FREE nodes", () => {
  const first = createGameUiNode("ui:first", "BUTTON", "A");
  const second = createGameUiNode("ui:second", "BUTTON", "B");
  const arranged = arrangeGameUiNodes([first, second]);
  const firstStyle = arranged[0]?.style;
  const secondStyle = arranged[1]?.style;
  assert(firstStyle !== undefined && secondStyle !== undefined, "arrangement should keep every node");
  assert(
    firstStyle.x !== secondStyle.x || firstStyle.y !== secondStyle.y,
    "anchored nodes should not collapse into one position",
  );
  assert(
    [firstStyle, secondStyle].every((style) => style.x >= 0 && style.y >= 0 &&
      style.x + style.width <= 100 && style.y + style.height <= 100),
    "arranged percentage rectangles must remain inside the DOM overlay",
  );
  const free = updateGameUiNode(first, {
    layout: { anchor: "FREE", autoArrange: false },
    style: { x: 10, y: 12 },
  });
  const freeArranged = arrangeGameUiNodes([free, second]);
  assert(
    freeArranged[0]?.style.x === 10 && freeArranged[0].style.y === 12,
    "explicit FREE positioning must not be rewritten by auto-arrangement",
  );
});
