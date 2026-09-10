/**
 * Beginner-facing iGAME authoring model.
 *
 * The public editor vocabulary is intentionally smaller than the canonical
 * engine vocabulary. Scene rules and event cards are the source of truth for
 * the easy path; a runtime adapter may derive physics/components from them.
 */
import {
  asBehaviorId,
  compileNoCodeBehavior,
  type BehaviorIR,
  type GameEventAction,
  type GameEventCard,
  type GameEventCondition,
  type GameEventWho,
  type GameRuntimeFamily,
  type GameSceneGravityPreset,
  type GameSceneRules,
} from "../game-300/core.ts";
import type { Physics2DSettings } from "./physics-2d.ts";

export const GAME_AUTHORING_MODEL_SCHEMA_VERSION = 1 as const;

export const GAME_SCENE_RULE_PRESETS = Object.freeze({
  NONE: 0,
  WEAK: 4.9,
  STANDARD: 9.8,
  STRONG: 19.6,
} as const satisfies Readonly<Record<GameSceneGravityPreset, number>>);

export const GAME_SCENE_RULE_LABELS: Readonly<
  Record<GameSceneGravityPreset, string>
> = Object.freeze({
  NONE: "なし",
  WEAK: "弱い",
  STANDARD: "標準",
  STRONG: "強い",
});

export const GAME_RUNTIME_FAMILY_LABELS: Readonly<
  Record<GameRuntimeFamily, string>
> = Object.freeze({
  RPG_GRID: "RPG・マス移動",
  ACTION_PLATFORM: "2Dアクション・簡易物理",
  SCROLL_SIDE: "2Dスクロール・横移動",
  DODGE_ARENA: "敵よけ・アリーナ",
  FREE: "自由制作・最小ルール",
});

export interface GameSceneRulePresetDefinition {
  readonly gravity: GameSceneGravityPreset;
  readonly label: string;
  readonly detail: string;
}

export const GAME_SCENE_GRAVITY_OPTIONS: readonly GameSceneRulePresetDefinition[] = [
  { gravity: "NONE", label: "なし", detail: "上下左右に自由に移動" },
  { gravity: "WEAK", label: "弱い", detail: "ゆっくり落下する" },
  { gravity: "STANDARD", label: "標準", detail: "2Dアクションの基本" },
  { gravity: "STRONG", label: "強い", detail: "素早く落下する" },
] as const;

export const GAME_EVENT_WHO_OPTIONS: readonly {
  readonly value: GameEventWho;
  readonly label: string;
}[] = [
  { value: "PLAYER", label: "主人公" },
  { value: "TOUCHED_OBJECT", label: "触れたオブジェクト" },
  { value: "ANYONE", label: "誰でも" },
] as const;

export const GAME_EVENT_CONDITION_OPTIONS: readonly {
  readonly value: GameEventCondition;
  readonly label: string;
}[] = [
  { value: "START", label: "ゲームが始まった" },
  { value: "ENTER_RANGE", label: "範囲に入った" },
  { value: "TOUCH", label: "触れた" },
  { value: "TAP", label: "タップした" },
  { value: "INTERACT", label: "話しかけた" },
  { value: "REACH_GOAL", label: "ゴールに着いた" },
  { value: "HAS_ITEM", label: "アイテムを持っている" },
] as const;

export const GAME_EVENT_ACTION_OPTIONS: readonly {
  readonly value: GameEventAction;
  readonly label: string;
}[] = [
  { value: "SHOW_DIALOGUE", label: "会話を表示" },
  { value: "DAMAGE", label: "ダメージを与える" },
  { value: "SHAKE_CAMERA", label: "カメラを揺らす" },
  { value: "PLAY_AUDIO", label: "効果音を鳴らす" },
  { value: "COMPLETE_SCENE", label: "Sceneをクリアする" },
  { value: "SET_VARIABLE", label: "ゲーム状態を変える" },
  { value: "GIVE_ITEM", label: "アイテムを渡す" },
  { value: "TAKE_ITEM", label: "アイテムを減らす" },
  { value: "CRAFT_ITEM", label: "レシピを作る" },
  { value: "BREAK_BLOCK", label: "ブロックを壊す" },
  { value: "PLACE_BLOCK", label: "ブロックを置く" },
] as const;

const DEFAULT_RULE_FLAGS: Omit<GameSceneRules, "runtimeFamily" | "gravity"> = {
  schemaVersion: 1,
  horizontalMove: true,
  verticalMove: true,
  jump: false,
  floorCollision: false,
  cameraFollow: true,
  mobileControls: true,
};

export function sceneRulesForRuntimeFamily(
  runtimeFamily: GameRuntimeFamily,
): GameSceneRules {
  switch (runtimeFamily) {
    case "RPG_GRID":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true,
      };
    case "ACTION_PLATFORM":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true,
      };
    case "SCROLL_SIDE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "STANDARD",
        horizontalMove: true,
        verticalMove: false,
        jump: true,
        floorCollision: true,
      };
    case "DODGE_ARENA":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
        horizontalMove: true,
        verticalMove: true,
        jump: false,
        floorCollision: false,
      };
    case "FREE":
      return {
        ...DEFAULT_RULE_FLAGS,
        runtimeFamily,
        gravity: "NONE",
      };
  }
}

export function sceneRulesForCreationMode(
  mode:
    | "RPG_TEMPLATE"
    | "ACTION_2D"
    | "DODGE_2D"
    | "SCROLL_2D"
    | "BLANK",
): GameSceneRules {
  return sceneRulesForRuntimeFamily(
    mode === "RPG_TEMPLATE"
      ? "RPG_GRID"
      : mode === "ACTION_2D"
      ? "ACTION_PLATFORM"
      : mode === "DODGE_2D"
      ? "DODGE_ARENA"
      : mode === "SCROLL_2D"
      ? "SCROLL_SIDE"
      : "FREE",
  );
}

export function normalizeGameSceneRules(
  value?: Partial<GameSceneRules>,
): GameSceneRules {
  const runtimeFamily = value?.runtimeFamily;
  const safeRuntimeFamily: GameRuntimeFamily = runtimeFamily === "RPG_GRID" ||
      runtimeFamily === "ACTION_PLATFORM" ||
      runtimeFamily === "SCROLL_SIDE" ||
      runtimeFamily === "DODGE_ARENA" || runtimeFamily === "FREE"
    ? runtimeFamily
    : "FREE";
  const fallback = sceneRulesForRuntimeFamily(safeRuntimeFamily);
  const gravity = value?.gravity;
  const safeGravity: GameSceneGravityPreset = gravity === "NONE" ||
      gravity === "WEAK" || gravity === "STANDARD" || gravity === "STRONG"
    ? gravity
    : fallback.gravity;
  const booleanRule = (key: keyof GameSceneRules): boolean =>
    typeof value?.[key] === "boolean"
      ? value[key] as boolean
      : fallback[key] as boolean;
  return {
    ...fallback,
    schemaVersion: 1,
    runtimeFamily: safeRuntimeFamily,
    gravity: safeGravity,
    horizontalMove: booleanRule("horizontalMove"),
    verticalMove: booleanRule("verticalMove"),
    jump: booleanRule("jump"),
    floorCollision: booleanRule("floorCollision"),
    cameraFollow: booleanRule("cameraFollow"),
    mobileControls: booleanRule("mobileControls"),
  };
}

export function physics2DSettingsForSceneRules(
  rules: GameSceneRules,
  current?: Physics2DSettings,
): Physics2DSettings {
  const gravity = GAME_SCENE_RULE_PRESETS[rules.gravity];
  const base = current ?? {
    gravity: { x: 0, y: gravity },
    fixedDeltaTime: 1 / 60,
    maxSubSteps: 4,
    defaultMaterial: { friction: 0.4, bounciness: 0 },
  };
  return {
    ...base,
    gravity: { x: 0, y: gravity },
    defaultMaterial: { ...base.defaultMaterial },
  };
}

export function sceneRulesSummary(rules: GameSceneRules): string {
  const flags: string[] = [];
  if (rules.horizontalMove) flags.push("左右移動");
  if (rules.verticalMove) flags.push("上下移動");
  if (rules.jump) flags.push("ジャンプ");
  if (rules.floorCollision) flags.push("床との衝突");
  if (rules.cameraFollow) flags.push("カメラ追従");
  return GAME_RUNTIME_FAMILY_LABELS[rules.runtimeFamily] + " · 重力" +
    GAME_SCENE_RULE_LABELS[rules.gravity] + " · " +
    (flags.join("・") || "最小ルール");
}

export function defaultGameEventCardsForRuntimeFamily(
  runtimeFamily: GameRuntimeFamily,
  trackIds: readonly string[] = [],
): readonly GameEventCard[] {
  const player = trackIds.find((id) => id === "hero" || id.includes("hero"));
  const source = player === undefined ? {} : { sourceTrackId: player };
  const npc = trackIds.find((id) => id === "enemy" || id.includes("npc"));
  if (runtimeFamily === "RPG_GRID") {
    return [{
      eventId: "event:npc-dialogue",
      label: "NPCに話しかける",
      enabled: true,
      who: "PLAYER",
      condition: "INTERACT",
      ...source,
      ...(npc === undefined ? {} : { targetTrackId: npc }),
      action: "SHOW_DIALOGUE",
      message: "こんにちは。矢印キーで歩いて、近くでEnterを押してみてください。",
    }];
  }
  if (runtimeFamily === "ACTION_PLATFORM") {
    const enemy = trackIds.find((id) => id === "enemy" || id.includes("enemy"));
    return [{
      eventId: "event:enemy-hit",
      label: "敵に触れたらダメージ",
      enabled: true,
      who: "PLAYER",
      condition: "TOUCH",
      ...source,
      ...(enemy === undefined ? {} : { targetTrackId: enemy }),
      action: "DAMAGE",
      amount: 1,
    }, {
      eventId: "event:enemy-camera-shake",
      label: "ダメージでカメラを揺らす",
      enabled: true,
      who: "PLAYER",
      condition: "TOUCH",
      ...source,
      ...(enemy === undefined ? {} : { targetTrackId: enemy }),
      action: "SHAKE_CAMERA",
    }];
  }
  if (runtimeFamily === "DODGE_ARENA") {
    const enemy = trackIds.find((id) => id === "enemy" || id.includes("enemy"));
    return [{
      eventId: "event:dodge-enemy-hit",
      label: "敵に触れたらライフが減る",
      enabled: true,
      who: "PLAYER",
      condition: "TOUCH",
      ...source,
      ...(enemy === undefined ? {} : { targetTrackId: enemy }),
      action: "DAMAGE",
      amount: 1,
    }, {
      eventId: "event:dodge-camera-shake",
      label: "ダメージでカメラを揺らす",
      enabled: true,
      who: "PLAYER",
      condition: "TOUCH",
      ...source,
      ...(enemy === undefined ? {} : { targetTrackId: enemy }),
      action: "SHAKE_CAMERA",
    }];
  }
  if (runtimeFamily === "SCROLL_SIDE") {
    const goal = trackIds.find((id) => id === "goal" || id.includes("goal"));
    return [{
      eventId: "event:reach-goal",
      label: "ゴールに着いたらクリア",
      enabled: true,
      who: "PLAYER",
      condition: "REACH_GOAL",
      ...source,
      ...(goal === undefined ? {} : { targetTrackId: goal }),
      action: "COMPLETE_SCENE",
    }];
  }
  return [];
}

function triggerForCondition(card: GameEventCard): {
  readonly type: "ACTION" | "TAP" | "COLLISION" | "TIMER";
  readonly actionId?: string;
  readonly value?: string;
} {
  switch (card.condition) {
    case "TAP": {
      const value = card.targetTrackId ?? card.sourceTrackId;
      return { type: "TAP", ...(value === undefined ? {} : { value }) };
    }
    case "TOUCH":
    case "REACH_GOAL":
      return {
        type: "COLLISION",
        ...(card.targetTrackId === undefined
          ? {}
          : { value: card.targetTrackId }),
      };
    case "START":
      return { type: "TIMER", value: "start" };
    case "ENTER_RANGE":
      return {
        type: "COLLISION",
        value: "range:" + (card.targetTrackId ?? "scene"),
      };
    case "INTERACT":
      return {
        type: "ACTION",
        actionId: "rpg.interact",
        ...(card.targetTrackId === undefined
          ? {}
          : { value: card.targetTrackId }),
      };
    case "HAS_ITEM":
      // The beginner BehaviorIR predates inventory-specific trigger fields.
      // Keep the event card authoritative and project the item reference into
      // the bounded action trigger used by the existing editor/runtime adapter.
      return {
        type: "ACTION",
        actionId: "inventory.has-item",
        value: card.itemId ?? "item",
      };
  }
}

function actionForCard(card: GameEventCard): {
  readonly kind: "SET_VARIABLE" | "SET_COMPONENT_PROPERTY" | "PLAY_AUDIO";
  readonly targetId: string;
  readonly property?: string;
  readonly value?: string | number | boolean;
} {
  switch (card.action) {
    case "SHOW_DIALOGUE":
      return {
        kind: "SET_VARIABLE",
        targetId: card.targetTrackId ?? card.sourceTrackId ?? "game",
        property: "dialogue",
        value: card.message?.trim() || "会話を表示しました。",
      };
    case "DAMAGE":
      return {
        kind: "SET_COMPONENT_PROPERTY",
        targetId: card.targetTrackId ?? "target",
        property: "damage",
        value: card.amount ?? 1,
      };
    case "SHAKE_CAMERA":
      return {
        kind: "SET_VARIABLE",
        targetId: "camera",
        property: "shake",
        value: true,
      };
    case "PLAY_AUDIO":
      return {
        kind: "PLAY_AUDIO",
        targetId: card.audioTrackId ?? "audio",
      };
    case "COMPLETE_SCENE":
      return {
        kind: "SET_VARIABLE",
        targetId: "scene",
        property: "complete",
        value: true,
      };
    case "SET_VARIABLE":
      return {
        kind: "SET_VARIABLE",
        targetId: card.targetTrackId ?? "game",
        property: "state",
        value: card.message ?? "true",
      };
    case "GIVE_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "give:" + (card.itemId ?? "item"),
        value: Math.max(1, card.amount ?? 1),
      };
    case "TAKE_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "take:" + (card.itemId ?? "item"),
        value: Math.max(1, card.amount ?? 1),
      };
    case "CRAFT_ITEM":
      return {
        kind: "SET_VARIABLE",
        targetId: "inventory",
        property: "craft:" + (card.recipeId ?? "recipe"),
        value: true,
      };
    case "BREAK_BLOCK":
      return {
        kind: "SET_VARIABLE",
        targetId: "world",
        property: "break:" + (card.blockTypeId ?? "block"),
        value: true,
      };
    case "PLACE_BLOCK":
      return {
        kind: "SET_VARIABLE",
        targetId: "world",
        property: "place:" + (card.blockTypeId ?? "block"),
        value: card.blockTypeId ?? "block",
      };
  }
}

/** Compile the friendly card into the canonical bounded BehaviorIR. */
export function behaviorFromGameEventCard(card: GameEventCard): BehaviorIR {
  const behaviorId = asBehaviorId(
    "behavior:pixiedraw-game:" + card.eventId,
  );
  return compileNoCodeBehavior({
    behaviorId,
    rules: [{
      ruleId: card.eventId + ":rule",
      enabled: card.enabled,
      trigger: triggerForCondition(card),
      conditions: [{ kind: "ALWAYS" }],
      actions: [actionForCard(card)],
    }],
  });
}

export function eventCardLabel(card: GameEventCard): string {
  const who = GAME_EVENT_WHO_OPTIONS.find((item) => item.value === card.who)
    ?.label ?? "誰か";
  const when = GAME_EVENT_CONDITION_OPTIONS.find((item) =>
    item.value === card.condition
  )?.label ?? "条件";
  const then = GAME_EVENT_ACTION_OPTIONS.find((item) => item.value === card.action)
    ?.label ?? "動作";
  return who + " · " + when + " → " + then;
}
