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
