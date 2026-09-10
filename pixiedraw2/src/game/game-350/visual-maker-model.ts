/** Beginner-facing visual maker state for iGAME.
 *
 * This is editor metadata only. It stores the creator's current visual
 * workspace (which card, direction, motion, and UI slot are selected) plus
 * the small amount of friendly UI configuration that must survive a reload.
 * iDRAW remains the source of truth for pixels, frames, and animation clips.
 */

export const GAME_VISUAL_MAKER_SCHEMA_VERSION = 1 as const;

export type GameVisualMakerCategory =
  | "WORLD"
  | "HERO"
  | "ITEM"
  | "EVENT"
  | "UI";

export const GAME_VISUAL_MAKER_CATEGORIES: readonly {
  readonly id: GameVisualMakerCategory;
  readonly label: string;
  readonly shortLabel: string;
  readonly symbol: string;
  readonly detail: string;
}[] = Object.freeze([
  { id: "WORLD", label: "世界", shortLabel: "WORLD", symbol: "◇", detail: "マップを描く" },
  { id: "HERO", label: "主人公", shortLabel: "HERO", symbol: "●", detail: "向きと動きを作る" },
  { id: "ITEM", label: "もの", shortLabel: "ITEM", symbol: "◆", detail: "敵・NPC・ゴールを置く" },
  { id: "EVENT", label: "仕掛け", shortLabel: "EVENT", symbol: "✦", detail: "触れたときの動きを作る" },
  { id: "UI", label: "画面", shortLabel: "UI", symbol: "▣", detail: "ボタンを置く" },
] as const);

export type GameVisualMakerDirection =
  | "UP"
  | "UP_RIGHT"
  | "RIGHT"
  | "DOWN_RIGHT"
  | "DOWN"
  | "DOWN_LEFT"
  | "LEFT"
  | "UP_LEFT";

export const GAME_VISUAL_MAKER_DIRECTIONS: readonly {
  readonly id: GameVisualMakerDirection;
  readonly label: string;
  readonly arrow: string;
}[] = Object.freeze([
  { id: "UP_LEFT", label: "左上", arrow: "↖" },
  { id: "UP", label: "上", arrow: "↑" },
  { id: "UP_RIGHT", label: "右上", arrow: "↗" },
  { id: "LEFT", label: "左", arrow: "←" },
  { id: "RIGHT", label: "右", arrow: "→" },
  { id: "DOWN_LEFT", label: "左下", arrow: "↙" },
  { id: "DOWN", label: "下", arrow: "↓" },
  { id: "DOWN_RIGHT", label: "右下", arrow: "↘" },
] as const);

export type GameVisualMakerMotion = "IDLE" | "WALK" | "RUN" | "ATTACK";

export const GAME_VISUAL_MAKER_MOTIONS: readonly {
  readonly id: GameVisualMakerMotion;
  readonly label: string;
  readonly symbol: string;
}[] = Object.freeze([
  { id: "IDLE", label: "待機", symbol: "●" },
  { id: "WALK", label: "歩く", symbol: "→" },
  { id: "RUN", label: "走る", symbol: "»" },
  { id: "ATTACK", label: "攻撃", symbol: "✦" },
] as const);

export type GameVisualMakerMovementMode = "PLAYER" | "AUTO" | "NPC";

export const GAME_VISUAL_MAKER_MOVEMENT_MODES: readonly {
  readonly id: GameVisualMakerMovementMode;
  readonly label: string;
  readonly symbol: string;
  readonly detail: string;
}[] = Object.freeze([
  { id: "PLAYER", label: "自分で操作", symbol: "✦", detail: "矢印キー・画面ボタンで動かす" },
  { id: "AUTO", label: "自動で動く", symbol: "◌", detail: "決めた動きをくり返す" },
  { id: "NPC", label: "NPCにする", symbol: "…", detail: "話しかけられる登場人物にする" },
] as const);

export type GameVisualMakerWorldTheme = "MEADOW" | "TOWN" | "CASTLE" | "WATER";

export const GAME_VISUAL_MAKER_WORLD_THEMES: readonly {
  readonly id: GameVisualMakerWorldTheme;
  readonly label: string;
  readonly symbol: string;
  readonly detail: string;
}[] = Object.freeze([
  { id: "MEADOW", label: "草原", symbol: "♧", detail: "歩ける草地" },
  { id: "TOWN", label: "街", symbol: "⌂", detail: "道と建物" },
  { id: "CASTLE", label: "城", symbol: "♜", detail: "壁と門" },
  { id: "WATER", label: "水辺", symbol: "≈", detail: "水と岸" },
] as const);

export type GameVisualMakerUiSlotId =
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT";

export type GameVisualMakerUiAction =
  | "NONE"
  | "OPEN_PANEL"
  | "JUMP"
  | "INTERACT"
  | "ATTACK"
  | "INVENTORY";

/** Reusable screen-space nodes. They are placed on the GAME UI surface, not
 * on the world grid, so a HUD control stays stable while the camera moves. */
export type GameUiNodeKind = "BUTTON" | "MINIMAP" | "INVENTORY";
export type GameUiNodeAction = "NONE" | "OPEN_MINIMAP" | "OPEN_INVENTORY" | "OPEN_PANEL";
export type GameUiInventoryFilter = "ALL" | "ITEM" | "SKILL" | "EQUIPPABLE";
export type GameUiPressMode = "TAP" | "HOLD" | "TAP_OR_HOLD";
export type GameUiNodeAnchor =
  | "FREE"
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "CENTER"
  | "BOTTOM_LEFT"
  | "BOTTOM_CENTER"
  | "BOTTOM_RIGHT";

export const GAME_UI_PRESS_MODES: readonly GameUiPressMode[] = [
  "TAP",
  "HOLD",
  "TAP_OR_HOLD",
];

export const GAME_UI_NODE_ANCHORS: readonly GameUiNodeAnchor[] = [
  "FREE",
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "CENTER",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
];

export interface GameUiInteractionSettings {
  readonly enabled: boolean;
  readonly pressMode: GameUiPressMode;
  readonly longPressMs: number;
  readonly repeatWhileHeld: boolean;
}

/** Shared placement policy. Auto-arrange is opt-in and never rewrites a node
 * that the author has explicitly switched to FREE positioning. */
export interface GameUiNodeLayoutSettings {
  readonly anchor: GameUiNodeAnchor;
  readonly autoArrange: boolean;
  readonly gap: number;
}

export interface GameUiInventorySettings {
  readonly columns: number;
  readonly filter: GameUiInventoryFilter;
  readonly showCounts: boolean;
  readonly showEquipped: boolean;
  readonly allowUse: boolean;
  readonly allowEquip: boolean;
}

export interface GameUiMinimapSettings {
  readonly scale: number;
  readonly showPlayer: boolean;
  readonly showActors: boolean;
  readonly showObjectives: boolean;
  readonly rotateWithPlayer: boolean;
}

export interface GameUiNodeStyle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly zIndex: number;
}

export interface GameUiNode {
  readonly nodeId: string;
  readonly label: string;
  readonly kind: GameUiNodeKind;
  readonly action: GameUiNodeAction;
  readonly panelTitle: string;
  readonly panelMessage: string;
  /** Optional user-defined tabs. Empty means the panel stays tab-free. */
  readonly panelTabs: readonly string[];
  readonly interaction?: GameUiInteractionSettings;
  readonly layout?: GameUiNodeLayoutSettings;
  /** Button-specific action; omitted on legacy nodes and non-button nodes. */
  readonly buttonAction?: GameVisualMakerUiAction;
  /** Stable reuse key lets one authored UI node be referenced by many scenes. */
  readonly reuseKey?: string;
  readonly inventory?: GameUiInventorySettings;
  readonly minimap?: GameUiMinimapSettings;
  readonly style: GameUiNodeStyle;
}

export const GAME_UI_NODE_KINDS: readonly GameUiNodeKind[] = [
  "BUTTON",
  "MINIMAP",
  "INVENTORY",
];
export const GAME_UI_NODE_ACTIONS: readonly GameUiNodeAction[] = [
  "NONE",
  "OPEN_MINIMAP",
  "OPEN_INVENTORY",
  "OPEN_PANEL",
];

export const GAME_UI_INVENTORY_FILTERS: readonly GameUiInventoryFilter[] = [
  "ALL",
  "ITEM",
  "SKILL",
  "EQUIPPABLE",
];

export const GAME_VISUAL_MAKER_UI_ACTIONS: readonly {
  readonly id: GameVisualMakerUiAction;
  readonly label: string;
  readonly symbol: string;
}[] = Object.freeze([
  { id: "NONE", label: "まだ決めない", symbol: "＋" },
  { id: "OPEN_PANEL", label: "パネルを開く", symbol: "▣" },
  { id: "JUMP", label: "ジャンプ", symbol: "↑" },
  { id: "INTERACT", label: "調べる・話す", symbol: "…" },
  { id: "ATTACK", label: "攻撃", symbol: "✦" },
  { id: "INVENTORY", label: "持ちもの", symbol: "◆" },
] as const);

export interface GameVisualMakerHeroState {
  readonly trackId?: string;
  readonly movementMode: GameVisualMakerMovementMode;
  readonly moveSpeed: number;
  readonly direction: GameVisualMakerDirection;
  readonly motion: GameVisualMakerMotion;
}

export interface GameVisualMakerUiSlot {
  readonly id: GameVisualMakerUiSlotId;
  readonly label: string;
  readonly action: GameVisualMakerUiAction;
  readonly enabled: boolean;
}

export interface GameVisualMakerConfig {
  readonly schemaVersion: typeof GAME_VISUAL_MAKER_SCHEMA_VERSION;
  readonly activeCategory: GameVisualMakerCategory;
  readonly worldTheme: GameVisualMakerWorldTheme;
  readonly hero: GameVisualMakerHeroState;
  readonly selectedUiSlot: GameVisualMakerUiSlotId;
  readonly uiSlots: readonly GameVisualMakerUiSlot[];
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultGameUiInteraction(): GameUiInteractionSettings {
  return {
    enabled: true,
    pressMode: "TAP",
    longPressMs: 500,
    repeatWhileHeld: false,
  };
}

function defaultGameUiNodeLayout(kind: GameUiNodeKind): GameUiNodeLayoutSettings {
  return {
    anchor: kind === "MINIMAP"
      ? "TOP_RIGHT"
      : kind === "INVENTORY"
      ? "TOP_LEFT"
      : "BOTTOM_RIGHT",
    autoArrange: true,
    gap: 2,
  };
}

function defaultGameUiNodeStyle(kind: GameUiNodeKind): GameUiNodeStyle {
  return kind === "MINIMAP"
    ? { x: 76, y: 4, width: 20, height: 20, opacity: 1, visible: true, zIndex: 1 }
    : kind === "INVENTORY"
    ? { x: 4, y: 4, width: 28, height: 40, opacity: 1, visible: true, zIndex: 1 }
    : { x: 84, y: 80, width: 12, height: 10, opacity: 1, visible: true, zIndex: 1 };
}

export function createGameUiNode(
  nodeId: string,
  kind: GameUiNodeKind,
  label = kind === "MINIMAP" ? "全体マップ" : kind === "INVENTORY" ? "持ちもの" : "ボタン",
): GameUiNode {
  if (!ID_PATTERN.test(nodeId) || !GAME_UI_NODE_KINDS.includes(kind)) {
    throw new Error("Invalid Game UI node identity.");
  }
  const action: GameUiNodeAction = kind === "MINIMAP"
    ? "OPEN_MINIMAP"
    : kind === "INVENTORY"
    ? "OPEN_INVENTORY"
    : "NONE";
  const base = {
    nodeId,
    label: label.trim().slice(0, 64) || "ボタン",
    kind,
    action,
    panelTitle: "ゲームメニュー",
    panelMessage: "ゲームメニュー用のパネルです。",
    panelTabs: [],
    interaction: defaultGameUiInteraction(),
    layout: defaultGameUiNodeLayout(kind),
    style: defaultGameUiNodeStyle(kind),
  };
  return kind === "MINIMAP"
    ? {
      ...base,
      minimap: {
        scale: 1,
        showPlayer: true,
        showActors: true,
        showObjectives: true,
        rotateWithPlayer: false,
      },
    }
    : kind === "INVENTORY"
    ? {
      ...base,
      inventory: {
        columns: 4,
        filter: "ALL",
        showCounts: true,
        showEquipped: true,
        allowUse: true,
        allowEquip: true,
      },
    }
    : { ...base, buttonAction: "NONE" as const };
}

export function isValidGameUiNode(value: unknown): value is GameUiNode {
  if (!isRecord(value) || typeof value.nodeId !== "string" || !ID_PATTERN.test(value.nodeId) ||
    typeof value.label !== "string" || value.label.trim().length === 0 || value.label.length > 64 ||
    !GAME_UI_NODE_KINDS.includes(value.kind as GameUiNodeKind) ||
    !GAME_UI_NODE_ACTIONS.includes(value.action as GameUiNodeAction) || !isRecord(value.style)) return false;
  if (typeof value.panelTitle !== "string" || value.panelTitle.length > 80 || typeof value.panelMessage !== "string" || value.panelMessage.length > 500 || !Array.isArray(value.panelTabs) || value.panelTabs.length > 8 || value.panelTabs.some((tab) => typeof tab !== "string" || tab.trim().length === 0 || tab.length > 32)) return false;
  if (value.buttonAction !== undefined && !GAME_VISUAL_MAKER_UI_ACTIONS.some((item) => item.id === value.buttonAction)) return false;
  if (value.reuseKey !== undefined && (typeof value.reuseKey !== "string" || !ID_PATTERN.test(value.reuseKey))) return false;
  if (value.kind !== "BUTTON" && value.buttonAction !== undefined) return false;
  if (value.kind !== "INVENTORY" && value.inventory !== undefined) return false;
  if (value.kind !== "MINIMAP" && value.minimap !== undefined) return false;
  if (value.inventory !== undefined && !isValidGameUiInventorySettings(value.inventory)) return false;
  if (value.minimap !== undefined && !isValidGameUiMinimapSettings(value.minimap)) return false;
  if (value.interaction !== undefined && !isValidGameUiInteractionSettings(value.interaction)) return false;
  if (value.layout !== undefined && !isValidGameUiNodeLayoutSettings(value.layout)) return false;
  const style = value.style;
  const numeric = (key: string): number | undefined =>
    typeof style[key] === "number" && Number.isFinite(style[key])
      ? style[key] as number
      : undefined;
  const x = numeric("x");
  const y = numeric("y");
  const width = numeric("width");
  const height = numeric("height");
  const opacity = numeric("opacity");
  const zIndex = numeric("zIndex");
  return x !== undefined && y !== undefined && width !== undefined &&
    height !== undefined && opacity !== undefined && x >= 0 && x <= 100 &&
    y >= 0 && y <= 100 && width > 0 && width <= 100 && height > 0 &&
    height <= 100 && x + width <= 100 && y + height <= 100 &&
    opacity >= 0 && opacity <= 1 && zIndex !== undefined && zIndex >= 0 && zIndex <= 999 &&
    typeof style.visible === "boolean";
}

function isValidGameUiInventorySettings(value: unknown): value is GameUiInventorySettings {
  if (!isRecord(value)) return false;
  const columns = value.columns;
  if (typeof columns !== "number" || !Number.isInteger(columns) || columns < 1 || columns > 8 ||
    !GAME_UI_INVENTORY_FILTERS.includes(value.filter as GameUiInventoryFilter)) return false;
  return typeof value.showCounts === "boolean" && typeof value.showEquipped === "boolean" &&
    typeof value.allowUse === "boolean" && typeof value.allowEquip === "boolean";
}

function isValidGameUiMinimapSettings(value: unknown): value is GameUiMinimapSettings {
  if (!isRecord(value) || typeof value.scale !== "number" || !Number.isFinite(value.scale) || value.scale < 0.5 || value.scale > 4) return false;
  return typeof value.showPlayer === "boolean" && typeof value.showActors === "boolean" &&
    typeof value.showObjectives === "boolean" && typeof value.rotateWithPlayer === "boolean";
}

function isValidGameUiInteractionSettings(value: unknown): value is GameUiInteractionSettings {
  if (!isRecord(value) || typeof value.enabled !== "boolean" ||
    !GAME_UI_PRESS_MODES.includes(value.pressMode as GameUiPressMode) ||
    typeof value.longPressMs !== "number" || !Number.isInteger(value.longPressMs) ||
    value.longPressMs < 100 || value.longPressMs > 2000) return false;
  return typeof value.repeatWhileHeld === "boolean";
}

function isValidGameUiNodeLayoutSettings(value: unknown): value is GameUiNodeLayoutSettings {
  return isRecord(value) &&
    GAME_UI_NODE_ANCHORS.includes(value.anchor as GameUiNodeAnchor) &&
    typeof value.autoArrange === "boolean" && typeof value.gap === "number" &&
    Number.isFinite(value.gap) && value.gap >= 0 && value.gap <= 20;
}

export function normalizeGameUiNode(value: unknown): GameUiNode | undefined {
  if (!isRecord(value) || typeof value.nodeId !== "string" || typeof value.kind !== "string") return undefined;
  const kind = GAME_UI_NODE_KINDS.includes(value.kind as GameUiNodeKind) ? value.kind as GameUiNodeKind : undefined;
  if (kind === undefined || !ID_PATTERN.test(value.nodeId)) return undefined;
  const base = createGameUiNode(value.nodeId, kind, typeof value.label === "string" ? value.label : undefined);
  const style = isRecord(value.style) ? value.style : {};
  const numberOr = (key: string, fallback: number): number => typeof style[key] === "number" && Number.isFinite(style[key]) ? style[key] as number : fallback;
  const width = Math.min(100, Math.max(1, numberOr("width", base.style.width)));
  const height = Math.min(100, Math.max(1, numberOr("height", base.style.height)));
  const x = Math.min(100 - width, Math.max(0, numberOr("x", base.style.x)));
  const y = Math.min(100 - height, Math.max(0, numberOr("y", base.style.y)));
  const opacity = Math.min(1, Math.max(0, numberOr("opacity", base.style.opacity)));
  const zIndex = Math.min(999, Math.max(0, numberOr("zIndex", base.style.zIndex)));
  const interaction: GameUiInteractionSettings = isValidGameUiInteractionSettings(value.interaction)
    ? { ...defaultGameUiInteraction(), ...value.interaction }
    : { ...defaultGameUiInteraction() };
  const layout: GameUiNodeLayoutSettings = isValidGameUiNodeLayoutSettings(value.layout)
    ? { ...defaultGameUiNodeLayout(kind), ...value.layout }
    : { ...defaultGameUiNodeLayout(kind) };
  const candidate: GameUiNode = {
    ...base,
    action: GAME_UI_NODE_ACTIONS.includes(value.action as GameUiNodeAction) ? value.action as GameUiNodeAction : base.action,
    panelTitle: typeof value.panelTitle === "string" ? value.panelTitle.slice(0, 80) || base.panelTitle : base.panelTitle,
    panelMessage: typeof value.panelMessage === "string" ? value.panelMessage.slice(0, 500) : base.panelMessage,
    panelTabs: Array.isArray(value.panelTabs) ? value.panelTabs.filter((tab): tab is string => typeof tab === "string").map((tab) => tab.trim().slice(0, 32)).filter(Boolean).slice(0, 8) : [],
    interaction,
    layout,
    ...(kind === "BUTTON" && GAME_VISUAL_MAKER_UI_ACTIONS.some((item) => item.id === value.buttonAction)
      ? { buttonAction: value.buttonAction as GameVisualMakerUiAction }
      : {}),
    ...(typeof value.reuseKey === "string" && ID_PATTERN.test(value.reuseKey)
      ? { reuseKey: value.reuseKey }
      : {}),
    ...(kind === "INVENTORY" && isValidGameUiInventorySettings(value.inventory)
      ? { inventory: { ...value.inventory } }
      : kind === "INVENTORY" ? { inventory: base.inventory! } : {}),
    ...(kind === "MINIMAP" && isValidGameUiMinimapSettings(value.minimap)
      ? { minimap: { ...value.minimap } }
      : kind === "MINIMAP" ? { minimap: { ...base.minimap! } } : {}),
    style: { x, y, width, height, opacity, visible: typeof style.visible === "boolean" ? style.visible : true, zIndex },
  };
  return isValidGameUiNode(candidate) ? candidate : undefined;
}

type GameUiNodeStylePatch = Partial<GameUiNodeStyle>;

export function cloneGameUiNode(
  node: GameUiNode,
  nodeId: string,
  label = `${node.label} コピー`,
): GameUiNode {
  if (nodeId === node.nodeId || !ID_PATTERN.test(nodeId)) throw new Error("A cloned Game UI node needs a new identity.");
  return {
    ...node,
    nodeId,
    label: label.trim().slice(0, 64) || node.label,
    panelTabs: [...node.panelTabs],
    ...(node.interaction === undefined ? {} : { interaction: { ...node.interaction } }),
    ...(node.layout === undefined ? {} : { layout: { ...node.layout } }),
    ...(node.inventory === undefined ? {} : { inventory: { ...node.inventory } }),
    ...(node.minimap === undefined ? {} : { minimap: { ...node.minimap } }),
    style: { ...node.style },
  };
}

export function upsertGameUiNode(
  nodes: readonly GameUiNode[],
  node: GameUiNode,
): readonly GameUiNode[] {
  if (!isValidGameUiNode(node)) throw new Error("Invalid Game UI node.");
  const index = nodes.findIndex((candidate) => candidate.nodeId === node.nodeId);
  if (index < 0) return [...nodes, node];
  return nodes.map((candidate, candidateIndex) => candidateIndex === index ? node : candidate);
}

export function reorderGameUiNodes(
  nodes: readonly GameUiNode[],
  orderedNodeIds: readonly string[],
): readonly GameUiNode[] {
  if (orderedNodeIds.length !== nodes.length || new Set(orderedNodeIds).size !== nodes.length ||
    nodes.some((node) => !orderedNodeIds.includes(node.nodeId))) throw new Error("The UI node order must contain every node exactly once.");
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  return orderedNodeIds.map((nodeId) => byId.get(nodeId)!).map((node) => ({
    ...node,
    panelTabs: [...node.panelTabs],
    ...(node.interaction === undefined ? {} : { interaction: { ...node.interaction } }),
    ...(node.layout === undefined ? {} : { layout: { ...node.layout } }),
    ...(node.inventory === undefined ? {} : { inventory: { ...node.inventory } }),
    ...(node.minimap === undefined ? {} : { minimap: { ...node.minimap } }),
    style: { ...node.style },
  }));
}

export function updateGameUiNode(
  node: GameUiNode,
  patch: { readonly label?: string; readonly action?: GameUiNodeAction; readonly buttonAction?: GameVisualMakerUiAction; readonly reuseKey?: string; readonly panelTitle?: string; readonly panelMessage?: string; readonly panelTabs?: readonly string[]; readonly interaction?: Partial<GameUiInteractionSettings>; readonly layout?: Partial<GameUiNodeLayoutSettings>; readonly inventory?: Partial<GameUiInventorySettings>; readonly minimap?: Partial<GameUiMinimapSettings>; readonly style?: GameUiNodeStylePatch },
): GameUiNode {
  const nextInteraction: GameUiInteractionSettings | undefined = patch.interaction === undefined
    ? node.interaction
    : {
      ...defaultGameUiInteraction(),
      ...node.interaction,
      ...patch.interaction,
    };
  const nextLayout: GameUiNodeLayoutSettings | undefined = patch.layout === undefined
    ? node.layout
    : {
      ...defaultGameUiNodeLayout(node.kind),
      ...node.layout,
      ...patch.layout,
    };
  const next: GameUiNode = {
    ...node,
    ...(patch.label === undefined ? {} : { label: patch.label.trim().slice(0, 64) || node.label }),
    ...(patch.action === undefined ? {} : { action: patch.action }),
    ...(patch.buttonAction === undefined ? {} : { buttonAction: patch.buttonAction }),
    ...(patch.reuseKey === undefined ? {} : { reuseKey: patch.reuseKey }),
    ...(patch.panelTitle === undefined ? {} : { panelTitle: patch.panelTitle.slice(0, 80) }),
    ...(patch.panelMessage === undefined ? {} : { panelMessage: patch.panelMessage.slice(0, 500) }),
    ...(patch.panelTabs === undefined ? {} : { panelTabs: patch.panelTabs.map((tab) => tab.trim().slice(0, 32)).filter(Boolean).slice(0, 8) }),
    ...(nextInteraction === undefined ? {} : { interaction: nextInteraction }),
    ...(nextLayout === undefined ? {} : { layout: nextLayout }),
    ...(patch.inventory === undefined || node.inventory === undefined ? {} : { inventory: { ...node.inventory, ...patch.inventory } }),
    ...(patch.minimap === undefined || node.minimap === undefined ? {} : { minimap: { ...node.minimap, ...patch.minimap } }),
    ...(patch.style === undefined ? {} : { style: { ...node.style, ...patch.style } }),
  };
  if (!isValidGameUiNode(next)) throw new Error("Invalid Game UI node update.");
  return next;
}

export interface GameUiArrangeOptions {
  readonly gap?: number;
}

interface GameUiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function axisValues(max: number, reverse: boolean, centerFirst: boolean): number[] {
  const values = new Set<number>();
  for (let value = 0; value <= max; value += 2) values.add(Math.min(value, max));
  values.add(max);
  const result = [...values];
  if (centerFirst) {
    const center = max / 2;
    result.sort((left, right) => Math.abs(left - center) - Math.abs(right - center));
  } else if (reverse) {
    result.reverse();
  }
  return result;
}

function anchorAxes(anchor: GameUiNodeAnchor): {
  readonly reverseX: boolean;
  readonly reverseY: boolean;
  readonly centerX: boolean;
  readonly centerY: boolean;
} {
  return {
    reverseX: anchor === "TOP_RIGHT" || anchor === "BOTTOM_RIGHT",
    reverseY: anchor === "BOTTOM_LEFT" || anchor === "BOTTOM_CENTER" || anchor === "BOTTOM_RIGHT",
    centerX: anchor === "TOP_CENTER" || anchor === "CENTER" || anchor === "BOTTOM_CENTER",
    centerY: anchor === "CENTER",
  };
}

function overlaps(left: GameUiRect, right: GameUiRect, gap: number): boolean {
  return left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y;
}

/**
 * Places opt-in anchored nodes in a deterministic percentage-space grid.
 * Fixed/FREE nodes are treated as obstacles, so adding a new HUD node does
 * not silently stack it on top of an existing control.
 */
export function arrangeGameUiNodes(
  nodes: readonly GameUiNode[],
  options: GameUiArrangeOptions = {},
): readonly GameUiNode[] {
  const configuredGap = options.gap;
  if (configuredGap !== undefined &&
    (typeof configuredGap !== "number" || !Number.isFinite(configuredGap) || configuredGap < 0 || configuredGap > 20)) {
    throw new Error("The UI arrangement gap must be between 0 and 20.");
  }
  nodes.forEach((node) => {
    if (!isValidGameUiNode(node)) throw new Error("Invalid Game UI node.");
  });
  const occupied: GameUiRect[] = [];
  const arranged: GameUiNode[] = [];
  for (const node of nodes) {
    const layout = node.layout;
    const isAuto = layout?.autoArrange === true && layout.anchor !== "FREE";
    if (!isAuto) {
      occupied.push(node.style);
      arranged.push(node);
      continue;
    }
    const width = node.style.width;
    const height = node.style.height;
    const axes = anchorAxes(layout.anchor);
    const gap = configuredGap ?? layout.gap;
    const xValues = axisValues(100 - width, axes.reverseX, axes.centerX);
    const yValues = axisValues(100 - height, axes.reverseY, axes.centerY);
    let position: { readonly x: number; readonly y: number } | undefined;
    for (const y of yValues) {
      for (const x of xValues) {
        const candidate = { x, y, width, height };
        if (!occupied.some((other) => overlaps(candidate, other, gap))) {
          position = { x, y };
          break;
        }
      }
      if (position !== undefined) break;
    }
    const fallback = {
      x: Math.min(node.style.x, 100 - width),
      y: Math.min(node.style.y, 100 - height),
    };
    const next = updateGameUiNode(node, { style: position ?? fallback });
    occupied.push(next.style);
    arranged.push(next);
  }
  return arranged;
}

function defaultUiSlots(): GameVisualMakerUiSlot[] {
  return [
    { id: "TOP_LEFT", label: "メニュー", action: "OPEN_PANEL", enabled: true },
    { id: "TOP_CENTER", label: "決定", action: "INTERACT", enabled: true },
    { id: "TOP_RIGHT", label: "持ちもの", action: "INVENTORY", enabled: true },
    { id: "BOTTOM_LEFT", label: "移動", action: "NONE", enabled: true },
    { id: "BOTTOM_RIGHT", label: "アクション", action: "ATTACK", enabled: true },
  ];
}

export function createDefaultGameVisualMakerConfig(
  heroTrackId = "hero",
): GameVisualMakerConfig {
  return {
    schemaVersion: GAME_VISUAL_MAKER_SCHEMA_VERSION,
    activeCategory: "HERO",
    worldTheme: "MEADOW",
    hero: {
      trackId: heroTrackId,
      movementMode: "PLAYER",
      moveSpeed: 4,
      direction: "DOWN",
      motion: "IDLE",
    },
    selectedUiSlot: "BOTTOM_RIGHT",
    uiSlots: defaultUiSlots(),
  };
}

export function isValidGameVisualMakerConfig(
  value: unknown,
): value is GameVisualMakerConfig {
  if (!isRecord(value)) return false;
  const hero = isRecord(value.hero) ? value.hero : undefined;
  const uiSlotIds = [
    "TOP_LEFT",
    "TOP_CENTER",
    "TOP_RIGHT",
    "BOTTOM_LEFT",
    "BOTTOM_RIGHT",
  ];
  if (
    value.schemaVersion !== GAME_VISUAL_MAKER_SCHEMA_VERSION ||
    !GAME_VISUAL_MAKER_CATEGORIES.some((item) => item.id === value.activeCategory) ||
    !GAME_VISUAL_MAKER_WORLD_THEMES.some((item) => item.id === value.worldTheme) ||
    hero === undefined ||
    !["PLAYER", "AUTO", "NPC"].includes(String(hero.movementMode)) ||
    typeof hero.moveSpeed !== "number" ||
    !Number.isFinite(hero.moveSpeed) ||
    hero.moveSpeed < 1 || hero.moveSpeed > 12 ||
    !GAME_VISUAL_MAKER_DIRECTIONS.some((item) => item.id === hero.direction) ||
    !GAME_VISUAL_MAKER_MOTIONS.some((item) => item.id === hero.motion) ||
    !uiSlotIds.includes(String(value.selectedUiSlot)) ||
    !Array.isArray(value.uiSlots) || value.uiSlots.length !== 5
  ) return false;
  if (hero.trackId !== undefined &&
    (typeof hero.trackId !== "string" || !ID_PATTERN.test(hero.trackId))) {
    return false;
  }
  const ids = new Set<string>();
  for (const rawSlot of value.uiSlots) {
    if (!isRecord(rawSlot)) return false;
    if (
      typeof rawSlot.id !== "string" || ids.has(rawSlot.id) ||
      !uiSlotIds.includes(rawSlot.id) ||
      typeof rawSlot.label !== "string" || rawSlot.label.trim().length === 0 ||
      rawSlot.label.length > 64 ||
      !["NONE", "OPEN_PANEL", "JUMP", "INTERACT", "ATTACK", "INVENTORY"].includes(String(rawSlot.action)) ||
      typeof rawSlot.enabled !== "boolean"
    ) return false;
    ids.add(rawSlot.id);
  }
  return ids.size === 5;
}

export function normalizeGameVisualMakerConfig(
  value: unknown,
  heroTrackId = "hero",
): GameVisualMakerConfig {
  const fallback = createDefaultGameVisualMakerConfig(heroTrackId);
  if (!isValidGameVisualMakerConfig(value)) return fallback;
  return {
    schemaVersion: value.schemaVersion,
    activeCategory: value.activeCategory,
    worldTheme: value.worldTheme,
    hero: {
      ...value.hero,
      ...(value.hero.trackId === undefined ? { trackId: heroTrackId } : {}),
    },
    selectedUiSlot: value.selectedUiSlot,
    uiSlots: value.uiSlots.map((slot) => ({ ...slot })),
  };
}

export function updateGameVisualMakerUiSlot(
  config: GameVisualMakerConfig,
  slotId: GameVisualMakerUiSlotId,
  update: (slot: GameVisualMakerUiSlot) => GameVisualMakerUiSlot,
): GameVisualMakerConfig {
  return {
    ...config,
    selectedUiSlot: slotId,
    uiSlots: config.uiSlots.map((slot) => slot.id === slotId ? update(slot) : slot),
  };
}
