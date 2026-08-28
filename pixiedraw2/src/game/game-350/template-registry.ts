/**
 * GAME-350 Game template catalog.
 *
 * The catalog is an optional authoring aid. A Game project remains free-form;
 * applying a template copies Game-owned values/components into the project and
 * never imports Draw or Audio source data.
 */

import type {
  GameComponentState,
  GameEditorTimeline,
  GameObjectRole,
  GameTemplateCategory,
  GameTemplateInstance,
  GameTemplateKind,
  GameTemplateTarget,
  GameTemplateValue,
} from "../game-300/core.ts";
import { componentIdFor } from "./game-studio-systems.ts";
import type { GameEditorTrack } from "../../workspace/game-persistence.ts";

export type GameTemplateFieldType = "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT";

export interface GameTemplateFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly type: GameTemplateFieldType;
  readonly defaultValue: GameTemplateValue;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly string[];
}

export type GameTemplateComponentPreset =
  | "CHARACTER_2D"
  | "PROJECTILE_2D"
  | "DAMAGE_ZONE_2D"
  | "VEHICLE_2D"
  | "RHYTHM_NOTE_2D";

export interface GameTemplateTrackBlueprint {
  readonly kind: string;
  readonly role: GameObjectRole;
  readonly componentPreset: GameTemplateComponentPreset;
}

export interface GameTemplateDefinition {
  readonly id: string;
  readonly category: GameTemplateCategory;
  readonly kind: GameTemplateKind;
  readonly target: GameTemplateTarget;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly fields: readonly GameTemplateFieldDefinition[];
  readonly trackBlueprint?: GameTemplateTrackBlueprint;
  /** Attach data such as a weapon or skill to the selected Game object. */
  readonly attachToSelectedTrack?: boolean;
}

export interface ApplyGameTemplateInput {
  readonly templateId: string;
  readonly tracks: readonly GameEditorTrack[];
  readonly instances: readonly GameTemplateInstance[];
  readonly selectedTrackId?: string;
  readonly overrides?: Readonly<Record<string, GameTemplateValue>>;
}

export interface ApplyGameTemplateResult {
  readonly tracks: readonly GameEditorTrack[];
  readonly instances: readonly GameTemplateInstance[];
  readonly instance: GameTemplateInstance;
  readonly selectedTrackId?: string;
}

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const TEMPLATE_MAX_INSTANCES = 512;

function isScalar(value: unknown): value is GameTemplateValue {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function valueMatchesField(
  field: GameTemplateFieldDefinition,
  value: unknown,
): value is GameTemplateValue {
  if (!isScalar(value)) return false;
  switch (field.type) {
    case "TEXT":
      return typeof value === "string";
    case "NUMBER":
      return typeof value === "number" &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "SELECT":
      return typeof value === "string" &&
        (field.options ?? []).includes(value);
  }
}

export function validateGameTemplateDefinition(
  definition: GameTemplateDefinition,
): { readonly valid: boolean; readonly reason?: string } {
  if (
    !STABLE_ID.test(definition.id) || definition.title.trim().length === 0 ||
    definition.description.trim().length === 0 ||
    !["CORE", "RPG", "ACTION", "SHOOTING", "RACING", "RHYTHM"].includes(
      definition.category,
    ) ||
    ![
      "CHARACTER",
      "WEAPON",
      "ARMOR",
      "SKILL",
      "STATUS",
      "TILE",
      "DAMAGE",
      "UI",
    ].includes(definition.kind) ||
    !["SCENE_OBJECT", "GAME_DATA"].includes(definition.target) ||
    !Array.isArray(definition.tags) ||
    !Array.isArray(definition.fields)
  ) {
    return {
      valid: false,
      reason: "Template identity or collections are invalid.",
    };
  }
  if (
    definition.target === "SCENE_OBJECT" &&
    definition.trackBlueprint === undefined
  ) {
    return {
      valid: false,
      reason: "Scene object templates require a blueprint.",
    };
  }
  if (
    definition.target === "GAME_DATA" && definition.trackBlueprint !== undefined
  ) {
    return {
      valid: false,
      reason: "Game data templates cannot contain a scene blueprint.",
    };
  }
  const fieldIds = new Set<string>();
  for (const field of definition.fields) {
    if (
      !STABLE_ID.test(field.id) || field.label.trim().length === 0 ||
      fieldIds.has(field.id) || !valueMatchesField(field, field.defaultValue)
    ) return { valid: false, reason: `Template field is invalid: ${field.id}` };
    if (
      field.type === "NUMBER" && field.min !== undefined &&
      field.max !== undefined && field.min > field.max
    ) {
      return {
        valid: false,
        reason: `Template field range is invalid: ${field.id}`,
      };
    }
    if (
      field.type === "SELECT" &&
      (!Array.isArray(field.options) || field.options.length === 0 ||
        new Set(field.options).size !== field.options.length)
    ) {
      return {
        valid: false,
        reason: `Template options are invalid: ${field.id}`,
      };
    }
    fieldIds.add(field.id);
  }
  return { valid: true };
}

export function validateGameTemplateValues(
  definition: GameTemplateDefinition,
  values: Readonly<Record<string, unknown>>,
): { readonly valid: boolean; readonly reason?: string } {
  const definitionValidation = validateGameTemplateDefinition(definition);
  if (!definitionValidation.valid) return definitionValidation;
  const fields = new Map(definition.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(values)) {
    const field = fields.get(key);
    if (field === undefined || !valueMatchesField(field, values[key])) {
      return { valid: false, reason: `Template value is invalid: ${key}` };
    }
  }
  for (const field of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.id)) {
      return { valid: false, reason: `Template value is missing: ${field.id}` };
    }
  }
  return { valid: true };
}

function field(
  id: string,
  label: string,
  type: GameTemplateFieldType,
  defaultValue: GameTemplateValue,
  options: {
    readonly min?: number;
    readonly max?: number;
    readonly options?: readonly string[];
  } = {},
): GameTemplateFieldDefinition {
  return {
    id,
    label,
    type,
    defaultValue,
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.options === undefined ? {} : { options: options.options }),
  };
}

const CATEGORY_OPTIONS = ["NONE", "PHYSICAL", "MAGIC", "FIRE", "ICE"] as const;
const ARMOR_SLOTS = ["HEAD", "BODY", "ACCESSORY"] as const;
const UI_LAYOUTS = ["HUD", "MENU", "DIALOG", "POPUP"] as const;

const GAME_TEMPLATE_CATALOG: readonly GameTemplateDefinition[] = [
  {
    id: "core.character-2d",
    category: "CORE",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "2D Character Body",
    description:
      "ジャンルを問わず使えるSprite・Collider・Rigidbody・移動の土台",
    tags: ["2D", "Character", "Physics", "Controller"],
    fields: [
      field("name", "名前", "TEXT", "Character"),
      field("moveSpeed", "移動速度", "NUMBER", 4, { min: 0.1, max: 100 }),
      field("gravityScale", "重力倍率", "NUMBER", 0, { min: -100, max: 100 }),
      field("collisionLayer", "Collision Layer", "SELECT", "PLAYER", {
        options: ["DEFAULT", "PLAYER", "NPC", "WORLD"],
      }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "CHARACTER_2D",
    },
  },
  {
    id: "core.projectile-2d",
    category: "CORE",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "2D Projectile",
    description: "シューティング・アクション・魔法などに使える移動する攻撃体",
    tags: ["2D", "Projectile", "Shooter", "Action"],
    fields: [
      field("name", "名前", "TEXT", "Projectile"),
      field("damage", "ダメージ", "NUMBER", 10, { min: 0, max: 999999 }),
      field("speed", "速度", "NUMBER", 12, { min: 0.1, max: 1000 }),
      field("damageType", "属性", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS,
      }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "PROJECTILE_2D",
    },
  },
  {
    id: "core.damage-zone-2d",
    category: "CORE",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "2D Damage / Trigger Zone",
    description: "攻撃範囲、トラップ、ゴール、イベント領域を作るTrigger",
    tags: ["2D", "Trigger", "Damage", "Event"],
    fields: [
      field("name", "名前", "TEXT", "Damage Zone"),
      field("damage", "ダメージ", "NUMBER", 20, { min: 0, max: 999999 }),
      field("cooldown", "再発動間隔", "NUMBER", 0.5, { min: 0, max: 3600 }),
    ],
    trackBlueprint: {
      kind: "EVENT",
      role: "TRIGGER",
      componentPreset: "DAMAGE_ZONE_2D",
    },
  },
  {
    id: "core.hud-panel",
    category: "CORE",
    kind: "UI",
    target: "GAME_DATA",
    title: "HUD / UI Panel",
    description: "体力・スコア・タイマーなど、ゲーム側UIの設定データ",
    tags: ["UI", "HUD", "Score", "Health"],
    fields: [
      field("name", "名前", "TEXT", "HUD Panel"),
      field("layout", "レイアウト", "SELECT", "HUD", { options: UI_LAYOUTS }),
      field("anchor", "基準位置", "SELECT", "TOP_LEFT", {
        options: [
          "TOP_LEFT",
          "TOP_RIGHT",
          "BOTTOM_LEFT",
          "BOTTOM_RIGHT",
          "CENTER",
        ],
      }),
      field("visible", "初期表示", "BOOLEAN", true),
    ],
  },
  {
    id: "rpg.playable-character",
    category: "RPG",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "RPG プレイアブルキャラクター",
    description: "主人公用のSprite・壁衝突・重力・Character Controller",
    tags: ["RPG", "Player", "Character", "Physics"],
    fields: [
      field("name", "名前", "TEXT", "プレイヤー"),
      field("moveSpeed", "移動速度", "NUMBER", 4, { min: 0.1, max: 100 }),
      field("gravityScale", "重力倍率", "NUMBER", 0, { min: -100, max: 100 }),
      field("maxHp", "最大HP", "NUMBER", 100, { min: 1, max: 999999 }),
      field("collisionLayer", "Collision Layer", "SELECT", "PLAYER", {
        options: ["DEFAULT", "PLAYER", "NPC", "WORLD"],
      }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "PLAYER",
      componentPreset: "CHARACTER_2D",
    },
  },
  {
    id: "rpg.weapon",
    category: "RPG",
    kind: "WEAPON",
    target: "GAME_DATA",
    title: "RPG 武器",
    description: "攻撃力・射程・再使用間隔・属性を持つGame側装備データ",
    tags: ["RPG", "Weapon", "Attack", "Inventory"],
    fields: [
      field("name", "名前", "TEXT", "ブロンズソード"),
      field("attackPower", "攻撃力", "NUMBER", 12, { min: 0, max: 999999 }),
      field("range", "射程", "NUMBER", 1, { min: 0, max: 9999 }),
      field("cooldown", "再使用間隔", "NUMBER", 0.5, { min: 0, max: 3600 }),
      field("damageType", "属性", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS,
      }),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.armor",
    category: "RPG",
    kind: "ARMOR",
    target: "GAME_DATA",
    title: "RPG 防具",
    description: "防御力・装備部位・重量を持つGame側装備データ",
    tags: ["RPG", "Armor", "Defense", "Inventory"],
    fields: [
      field("name", "名前", "TEXT", "レザーアーマー"),
      field("defense", "防御力", "NUMBER", 8, { min: 0, max: 999999 }),
      field("slot", "装備部位", "SELECT", "BODY", { options: ARMOR_SLOTS }),
      field("weight", "重量", "NUMBER", 1, { min: 0, max: 9999 }),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.skill",
    category: "RPG",
    kind: "SKILL",
    target: "GAME_DATA",
    title: "RPG スキル",
    description: "消費MP・威力・射程・再使用間隔を持つノード接続用スキルデータ",
    tags: ["RPG", "Skill", "Magic", "Event"],
    fields: [
      field("name", "名前", "TEXT", "ファイア"),
      field("mpCost", "MP消費", "NUMBER", 5, { min: 0, max: 999999 }),
      field("power", "威力", "NUMBER", 24, { min: 0, max: 999999 }),
      field("range", "射程", "NUMBER", 5, { min: 0, max: 9999 }),
      field("cooldown", "再使用間隔", "NUMBER", 2, { min: 0, max: 3600 }),
      field("element", "属性", "SELECT", "FIRE", { options: CATEGORY_OPTIONS }),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.status",
    category: "RPG",
    kind: "STATUS",
    target: "GAME_DATA",
    title: "RPG ステータス効果",
    description: "継続時間と補正値を持つバフ・デバフ・状態異常データ",
    tags: ["RPG", "Status", "Buff", "Debuff"],
    fields: [
      field("name", "名前", "TEXT", "毒"),
      field("duration", "継続時間", "NUMBER", 10, { min: 0, max: 3600 }),
      field("power", "補正値", "NUMBER", -5, { min: -999999, max: 999999 }),
      field("stackable", "重ねがけ", "BOOLEAN", false),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.status-sheet",
    category: "RPG",
    kind: "STATUS",
    target: "GAME_DATA",
    title: "RPG キャラクターステータス",
    description: "HP・MP・攻撃・防御・速度をまとめた初期ステータス",
    tags: ["RPG", "Status", "Character", "Stats"],
    fields: [
      field("name", "名前", "TEXT", "プレイヤー基本ステータス"),
      field("maxHp", "最大HP", "NUMBER", 100, { min: 1, max: 999999 }),
      field("maxMp", "最大MP", "NUMBER", 30, { min: 0, max: 999999 }),
      field("attack", "攻撃", "NUMBER", 10, { min: 0, max: 999999 }),
      field("defense", "防御", "NUMBER", 5, { min: 0, max: 999999 }),
      field("speed", "速度", "NUMBER", 4, { min: 0, max: 9999 }),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.tile",
    category: "RPG",
    kind: "TILE",
    target: "GAME_DATA",
    title: "RPG タイル定義",
    description: "地面・壁・水・階段など、タイルの表示用途と衝突設定",
    tags: ["RPG", "Tile", "Map", "Collision"],
    fields: [
      field("name", "名前", "TEXT", "草地"),
      field("terrain", "地形", "SELECT", "GROUND", {
        options: ["GROUND", "WALL", "WATER", "STAIR", "DECORATION"],
      }),
      field("collision", "衝突", "SELECT", "NONE", {
        options: ["NONE", "SOLID", "TRIGGER"],
      }),
      field("movementCost", "移動コスト", "NUMBER", 1, { min: 0, max: 9999 }),
    ],
  },
  {
    id: "rpg.damage",
    category: "RPG",
    kind: "DAMAGE",
    target: "GAME_DATA",
    title: "RPG ダメージ定義",
    description: "通常攻撃・スキル・属性・ノックバック・クリティカルの基本値",
    tags: ["RPG", "Damage", "Combat", "Critical"],
    fields: [
      field("name", "名前", "TEXT", "通常ダメージ"),
      field("amount", "ダメージ量", "NUMBER", 10, { min: 0, max: 999999 }),
      field("damageType", "属性", "SELECT", "PHYSICAL", {
        options: CATEGORY_OPTIONS,
      }),
      field("knockback", "ノックバック", "NUMBER", 0, { min: 0, max: 9999 }),
      field("criticalRate", "クリティカル率", "NUMBER", 0.05, {
        min: 0,
        max: 1,
      }),
    ],
    attachToSelectedTrack: true,
  },
  {
    id: "rpg.ui-hud",
    category: "RPG",
    kind: "UI",
    target: "GAME_DATA",
    title: "RPG HUD",
    description: "HPバー・MPバー・レベル・所持金をまとめたUI定義",
    tags: ["RPG", "UI", "HUD", "Health"],
    fields: [
      field("name", "名前", "TEXT", "RPG HUD"),
      field("layout", "レイアウト", "SELECT", "HUD", { options: UI_LAYOUTS }),
      field("showHp", "HP表示", "BOOLEAN", true),
      field("showMp", "MP表示", "BOOLEAN", true),
      field("showLevel", "レベル表示", "BOOLEAN", true),
      field("showGold", "所持金表示", "BOOLEAN", false),
    ],
  },
  {
    id: "action.dash-character",
    category: "ACTION",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "Action Character",
    description: "移動とダッシュを組み合わせるアクション向けCharacter土台",
    tags: ["Action", "Dash", "Character", "Controller"],
    fields: [
      field("name", "名前", "TEXT", "Action Character"),
      field("moveSpeed", "移動速度", "NUMBER", 6, { min: 0.1, max: 100 }),
      field("dashSpeed", "ダッシュ速度", "NUMBER", 14, { min: 0.1, max: 200 }),
      field("dashCooldown", "ダッシュ間隔", "NUMBER", 0.8, {
        min: 0,
        max: 3600,
      }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "CHARACTER_2D",
    },
  },
  {
    id: "shooting.projectile",
    category: "SHOOTING",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "Shooting Projectile",
    description: "弾速・ダメージ・属性を持つ射撃ゲーム向けProjectile",
    tags: ["Shooting", "Projectile", "Bullet", "Damage"],
    fields: [
      field("name", "名前", "TEXT", "Bullet"),
      field("damage", "ダメージ", "NUMBER", 15, { min: 0, max: 999999 }),
      field("speed", "弾速", "NUMBER", 20, { min: 0.1, max: 1000 }),
      field("lifetime", "寿命", "NUMBER", 3, { min: 0, max: 3600 }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "PROJECTILE_2D",
    },
  },
  {
    id: "racing.vehicle-2d",
    category: "RACING",
    kind: "CHARACTER",
    target: "SCENE_OBJECT",
    title: "Racing Vehicle 2D",
    description: "車体・衝突・速度入力を持つトップダウンレーシングの土台",
    tags: ["Racing", "Vehicle", "Physics", "Input"],
    fields: [
      field("name", "名前", "TEXT", "Player Car"),
      field("maxSpeed", "最高速度", "NUMBER", 18, { min: 0.1, max: 1000 }),
      field("acceleration", "加速", "NUMBER", 8, { min: 0, max: 1000 }),
      field("brakePower", "ブレーキ", "NUMBER", 12, { min: 0, max: 1000 }),
    ],
    trackBlueprint: {
      kind: "SPRITE",
      role: "CUSTOM",
      componentPreset: "VEHICLE_2D",
    },
  },
  {
    id: "rhythm.note",
    category: "RHYTHM",
    kind: "DAMAGE",
    target: "SCENE_OBJECT",
    title: "Rhythm Note",
    description: "判定Triggerと入力ルールを持つリズムゲームのノート土台",
    tags: ["Rhythm", "Note", "Timing", "Input"],
    fields: [
      field("name", "名前", "TEXT", "Note"),
      field("lane", "レーン", "NUMBER", 1, { min: 1, max: 32 }),
      field("perfectWindow", "Perfect幅", "NUMBER", 0.05, { min: 0, max: 10 }),
      field("score", "スコア", "NUMBER", 100, { min: 0, max: 999999 }),
    ],
    trackBlueprint: {
      kind: "EVENT",
      role: "TRIGGER",
      componentPreset: "RHYTHM_NOTE_2D",
    },
  },
];

function freezeDefinition(
  definition: GameTemplateDefinition,
): GameTemplateDefinition {
  return Object.freeze({
    ...definition,
    tags: Object.freeze([...definition.tags]),
    fields: Object.freeze(definition.fields.map((item) =>
      Object.freeze({
        ...item,
        ...(item.options === undefined
          ? {}
          : { options: Object.freeze([...item.options]) }),
      })
    )),
    ...(definition.trackBlueprint === undefined
      ? {}
      : { trackBlueprint: Object.freeze({ ...definition.trackBlueprint }) }),
  });
}

const FROZEN_GAME_TEMPLATE_CATALOG = Object.freeze(
  GAME_TEMPLATE_CATALOG.map(freezeDefinition),
);

export function getGameTemplates(
  category?: GameTemplateCategory,
): readonly GameTemplateDefinition[] {
  return category === undefined
    ? FROZEN_GAME_TEMPLATE_CATALOG
    : FROZEN_GAME_TEMPLATE_CATALOG.filter((template) =>
      template.category === category
    );
}

export function getGameTemplate(
  templateId: string,
): GameTemplateDefinition | undefined {
  return FROZEN_GAME_TEMPLATE_CATALOG.find((template) =>
    template.id === templateId
  );
}

export function gameTemplateCategoryLabel(
  category: GameTemplateCategory,
): string {
  switch (category) {
    case "CORE":
      return "汎用 / Core";
    case "RPG":
      return "RPG";
    case "ACTION":
      return "Action";
    case "SHOOTING":
      return "Shooting";
    case "RACING":
      return "Racing";
    case "RHYTHM":
      return "Rhythm";
  }
}

export function gameTemplateKindLabel(kind: GameTemplateKind): string {
  const labels: Record<GameTemplateKind, string> = {
    CHARACTER: "Character",
    WEAPON: "武器",
    ARMOR: "防具",
    SKILL: "スキル",
    STATUS: "ステータス",
    TILE: "タイル",
    DAMAGE: "ダメージ / Trigger",
    UI: "UI",
  };
  return labels[kind];
}

function numberValue(
  values: Readonly<Record<string, GameTemplateValue>>,
  key: string,
  fallback: number,
): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(
  values: Readonly<Record<string, GameTemplateValue>>,
  key: string,
  fallback: string,
): string {
  const value = values[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function transform(trackId: string, x = 0, y = 0): GameComponentState {
  return {
    type: "TRANSFORM",
    componentId: componentIdFor(trackId, "TRANSFORM"),
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function sprite(trackId: string): GameComponentState {
  return {
    type: "SPRITE",
    componentId: componentIdFor(trackId, "SPRITE"),
    visible: true,
  };
}

function collider(
  trackId: string,
  options: {
    readonly shape?: "BOX" | "CIRCLE" | "CAPSULE";
    readonly width?: number;
    readonly height?: number;
    readonly radius?: number;
    readonly isTrigger?: boolean;
    readonly layer?:
      | "DEFAULT"
      | "WORLD"
      | "PLAYER"
      | "NPC"
      | "SENSOR"
      | "PROJECTILE";
  } = {},
): GameComponentState {
  return {
    type: "COLLIDER",
    componentId: componentIdFor(trackId, "COLLIDER"),
    shape: options.shape ?? "BOX",
    width: options.width ?? 0.8,
    height: options.height ?? 0.8,
    radius: options.radius ?? 0.4,
    isTrigger: options.isTrigger ?? false,
    layer: options.layer ?? "DEFAULT",
    enabled: true,
  };
}

function rigidbody(
  trackId: string,
  gravityScale: number,
  bodyType: "STATIC" | "DYNAMIC" | "KINEMATIC" = "DYNAMIC",
): GameComponentState {
  return {
    type: "RIGIDBODY",
    componentId: componentIdFor(trackId, "RIGIDBODY"),
    bodyType,
    mass: 1,
    gravityScale,
    fixedRotation: true,
    enabled: true,
  };
}

function controller(trackId: string, moveSpeed: number): GameComponentState {
  return {
    type: "CHARACTER_CONTROLLER",
    componentId: componentIdFor(trackId, "CHARACTER_CONTROLLER"),
    moveSpeed,
    stepHeight: 0.25,
    fixedStep: 1,
    enabled: true,
  };
}

function behavior(trackId: string): GameComponentState {
  return {
    type: "BEHAVIOR",
    componentId: componentIdFor(trackId, "BEHAVIOR"),
    enabled: true,
  };
}

function componentsForPreset(
  trackId: string,
  preset: GameTemplateComponentPreset,
  values: Readonly<Record<string, GameTemplateValue>>,
): readonly GameComponentState[] {
  switch (preset) {
    case "CHARACTER_2D":
      return [
        transform(trackId),
        sprite(trackId),
        collider(trackId, {
          width: 0.7,
          height: 0.7,
          radius: 0.35,
          layer: "PLAYER",
        }),
        rigidbody(trackId, numberValue(values, "gravityScale", 0)),
        controller(trackId, numberValue(values, "moveSpeed", 4)),
      ];
    case "PROJECTILE_2D":
      return [
        transform(trackId),
        sprite(trackId),
        collider(trackId, {
          shape: "CIRCLE",
          width: 0.25,
          height: 0.25,
          radius: 0.125,
          isTrigger: true,
          layer: "PROJECTILE",
        }),
        rigidbody(trackId, 0),
        behavior(trackId),
      ];
    case "DAMAGE_ZONE_2D":
      return [
        transform(trackId),
        sprite(trackId),
        collider(trackId, {
          width: 1,
          height: 1,
          radius: 0.5,
          isTrigger: true,
          layer: "SENSOR",
        }),
        behavior(trackId),
      ];
    case "VEHICLE_2D":
      return [
        transform(trackId),
        sprite(trackId),
        collider(trackId, {
          width: 1.4,
          height: 0.7,
          radius: 0.7,
          layer: "WORLD",
        }),
        rigidbody(trackId, 0),
        controller(trackId, numberValue(values, "maxSpeed", 18)),
      ];
    case "RHYTHM_NOTE_2D":
      return [
        transform(trackId),
        sprite(trackId),
        collider(trackId, {
          width: 0.45,
          height: 0.45,
          radius: 0.225,
          isTrigger: true,
          layer: "SENSOR",
        }),
        behavior(trackId),
      ];
  }
}

function nextId(prefix: string, used: readonly string[]): string {
  const usedIds = new Set(used);
  let index = 1;
  let candidate = `${prefix}:${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${prefix}:${index}`;
  }
  return candidate;
}

function cloneTrack(track: GameEditorTrack): GameEditorTrack {
  return {
    ...track,
    filled: [...track.filled],
    ...(track.components === undefined ? {} : {
      components: track.components.map((component) => ({ ...component })),
    }),
    ...(track.tilemap === undefined ? {} : {
      tilemap: {
        ...track.tilemap,
        cells: track.tilemap.cells.map((cell) => ({ ...cell })),
      },
    }),
  };
}

function mergedValues(
  definition: GameTemplateDefinition,
  overrides: Readonly<Record<string, GameTemplateValue>> = {},
): Readonly<Record<string, GameTemplateValue>> {
  const values: Record<string, GameTemplateValue> = {};
  for (const item of definition.fields) values[item.id] = item.defaultValue;
  for (const [key, value] of Object.entries(overrides)) values[key] = value;
  const validation = validateGameTemplateValues(definition, values);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Invalid template values.");
  }
  return Object.freeze(values);
}

export function applyGameTemplate(
  input: ApplyGameTemplateInput,
): ApplyGameTemplateResult {
  if (input.instances.length >= TEMPLATE_MAX_INSTANCES) {
    throw new Error("Game template instance limit reached.");
  }
  const definition = getGameTemplate(input.templateId);
  if (definition === undefined) throw new Error("Unknown Game template.");
  const values = mergedValues(definition, input.overrides);
  const instanceId = nextId(
    `template-instance:${definition.id.replace(/[^A-Za-z0-9._:/-]/gu, "-")}`,
    input.instances.map((instance) => instance.instanceId),
  );
  let nextTracks = input.tracks.map(cloneTrack);
  let targetTrackId = definition.attachToSelectedTrack === true &&
      input.selectedTrackId !== undefined &&
      input.tracks.some((track) => track.id === input.selectedTrackId)
    ? input.selectedTrackId
    : undefined;
  if (definition.target === "SCENE_OBJECT") {
    const blueprint = definition.trackBlueprint;
    if (blueprint === undefined) {
      throw new Error("Template blueprint is missing.");
    }
    const trackId = nextId(
      `template-track:${definition.id.replace(/[^A-Za-z0-9._:/-]/gu, "-")}`,
      nextTracks.map((track) => track.id),
    );
    const label = stringValue(values, "name", definition.title);
    const track: GameEditorTrack = {
      id: trackId,
      label,
      kind: blueprint.kind,
      filled: [],
      active: true,
      role: blueprint.role,
      components: componentsForPreset(
        trackId,
        blueprint.componentPreset,
        values,
      ),
    };
    nextTracks = [...nextTracks, track];
    targetTrackId = trackId;
  }
  const label = stringValue(values, "name", definition.title);
  const instance: GameTemplateInstance = Object.freeze({
    instanceId,
    templateId: definition.id,
    category: definition.category,
    kind: definition.kind,
    target: definition.target,
    label,
    values,
    ...(targetTrackId === undefined ? {} : { targetTrackId }),
  });
  return {
    tracks: Object.freeze(nextTracks),
    instances: Object.freeze([
      ...input.instances.map((item) => ({
        ...item,
        values: Object.freeze({ ...item.values }),
      })),
      instance,
    ]),
    instance,
    ...(targetTrackId === undefined ? {} : { selectedTrackId: targetTrackId }),
  };
}

/** Keep a template instance removal explicit and non-destructive to its scene object. */
export function removeGameTemplateInstance(
  instances: readonly GameTemplateInstance[],
  instanceId: string,
): readonly GameTemplateInstance[] {
  return Object.freeze(
    instances.filter((instance) => instance.instanceId !== instanceId).map((
      instance,
    ) => ({
      ...instance,
      values: Object.freeze({ ...instance.values }),
    })),
  );
}

/** Type-only helper for consumers that render a complete canonical timeline. */
export type GameTemplateTimeline = Pick<
  GameEditorTimeline,
  "templateInstances"
>;
