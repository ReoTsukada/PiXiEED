/**
 * GAME-350 Game Studio authoring vocabulary.
 *
 * This is intentionally engine-neutral.  It describes the parts a creator
 * edits in iGAME; the canonical GAME-300 project remains the authority and
 * the runtime profile decides which parts are executable in Preview.
 */

import {
  asComponentId,
  type GameComponentState,
  type GameObjectRole,
} from "../game-300/core.ts";
import { DEFAULT_CAMERA_2D_SETTINGS } from "./camera-2d.ts";

export type GameEditorComponent = GameComponentState;

export interface GameStudioRailDefinition {
  readonly rail: "ACTION" | "HIERARCHY" | "VIEWPORT" | "INSPECTOR" | "TIMELINE";
  readonly label: string;
  readonly purpose: string;
  readonly systems: readonly string[];
}

export const GAME_STUDIO_RAILS: readonly GameStudioRailDefinition[] = [
  {
    rail: "ACTION",
    label: "作成・テスト",
    purpose: "作る・保存する・Play / Stop / Restartする",
    systems: ["Project", "Undo / Redo", "Play", "Stop", "Restart", "Build"],
  },
  {
    rail: "HIERARCHY",
    label: "シーン階層",
    purpose: "Map、Characters、Objects、Systemsを迷わず管理する",
    systems: ["Scene", "Map", "Characters", "Objects", "Camera"],
  },
  {
    rail: "VIEWPORT",
    label: "シーン表示",
    purpose: "配置とPlay中の結果を同じ座標系で確認する",
    systems: ["2D / 3D View", "Camera", "Gizmo", "Collision Overlay"],
  },
  {
    rail: "INSPECTOR",
    label: "オブジェクト設定",
    purpose: "選択Objectに見た目・当たり判定・移動・イベントを追加する",
    systems: ["位置・見た目", "接触", "重力", "移動", "イベント"],
  },
  {
    rail: "TIMELINE",
    label: "ロジック・データ",
    purpose: "時間軸ではなく、入力・条件・イベント・参照を組み立てる",
    systems: [
      "Input Actions",
      "Event Sheet",
      "Switches",
      "Variables",
      "References",
    ],
  },
];

export interface GameStudioSystemCard {
  readonly id:
    | "OBJECTS"
    | "COMPONENTS"
    | "PHYSICS"
    | "INPUT"
    | "EVENTS"
    | "ASSETS"
    | "PLAY"
    | "BUILD";
  readonly title: string;
  readonly detail: string;
  readonly rail: GameStudioRailDefinition["rail"];
}

export const GAME_STUDIO_SYSTEM_CARDS: readonly GameStudioSystemCard[] = [
  {
    id: "OBJECTS",
    title: "オブジェクト",
    detail: "Sceneに置くMap・Characters・Objects",
    rail: "HIERARCHY",
  },
  {
    id: "COMPONENTS",
    title: "コンポーネント",
    detail: "見た目・当たり判定・重力・移動・イベント",
    rail: "INSPECTOR",
  },
  {
    id: "PHYSICS",
    title: "当たり判定・物理",
    detail: "Sceneの重力・床・壁・反応範囲を自動設定",
    rail: "INSPECTOR",
  },
  {
    id: "INPUT",
    title: "入力",
    detail: "Move / Interact / Attackを論理名で接続",
    rail: "TIMELINE",
  },
  {
    id: "EVENTS",
    title: "イベント・分岐",
    detail: "条件 → A/B分岐 → アクションを組み立てる",
    rail: "TIMELINE",
  },
  {
    id: "ASSETS",
    title: "素材・テンプレート",
    detail: "iDRAW / iAUDIO参照とGameテンプレートを必要な時だけ追加",
    rail: "TIMELINE",
  },
  {
    id: "PLAY",
    title: "テストプレイ",
    detail: "編集状態と実行状態を分離して確認",
    rail: "ACTION",
  },
  {
    id: "BUILD",
    title: "販売用ビルド",
    detail: "Web / Android / Unity / Godot / Unrealへ受け渡す",
    rail: "ACTION",
  },
];

/** Inspector vocabulary for the GAME-350 Physics 2D foundation. */
export const GAME_STUDIO_PHYSICS_INSPECTOR_FIELDS = Object.freeze({
  scene: Object.freeze([
    { id: "gravity", label: "重力 (Gravity)", detail: "X / Y のワールド重力" },
    { id: "fixedDeltaTime", label: "固定step", detail: "決定的な物理更新間隔" },
    { id: "maxSubSteps", label: "最大sub-step", detail: "遅延時のcatch-up上限" },
  ]),
  collider: Object.freeze([
    { id: "offset", label: "Offset", detail: "当たり判定中心のずれ" },
    { id: "mask", label: "Layer Mask", detail: "判定するレイヤー" },
    { id: "material", label: "Physics Material 2D", detail: "摩擦 / 反発" },
    { id: "isTrigger", label: "Trigger", detail: "通過可能なイベント領域" },
  ]),
  rigidbody: Object.freeze([
    { id: "linearDrag", label: "Linear Drag", detail: "移動速度の減衰" },
    { id: "angularDrag", label: "Angular Drag", detail: "回転速度の減衰" },
    { id: "freezePosition", label: "Freeze Position", detail: "X / Y の移動を固定" },
    { id: "simulated", label: "Simulated", detail: "物理シミュレーション参加" },
    { id: "collisionDetection", label: "Collision Detection", detail: "Discrete / Continuous" },
    { id: "interpolation", label: "Interpolation", detail: "描画補間" },
  ]),
} as const);

export const GAME_STUDIO_INPUT_ACTIONS = Object.freeze(
  [
    { id: "move", label: "Move", detail: "方向入力 / 固定ステップ移動" },
    { id: "interact", label: "Interact", detail: "近くのNPC・扉・宝箱を起動" },
    { id: "jump", label: "Jump", detail: "ジャンプ・上方向の動作" },
    { id: "attack", label: "Attack", detail: "攻撃・射撃イベントの起点" },
    { id: "brake", label: "Brake", detail: "レーシングの減速イベントの起点" },
    { id: "confirm", label: "Confirm", detail: "UI・リズム入力の確定" },
  ] as const,
);

export function componentIdFor(
  trackId: string,
  type: GameEditorComponent["type"],
): ReturnType<typeof asComponentId> {
  const safeTrackId = trackId.replace(/[^A-Za-z0-9._:/-]/gu, "-");
  return asComponentId(
    `component:pixiedraw-game:${safeTrackId}:${type.toLowerCase()}`,
  );
}

export function gameObjectRoleFor(
  trackId: string,
  kind: string,
): GameObjectRole {
  const value = `${trackId} ${kind}`.toLocaleLowerCase();
  if (kind === "TILEMAP" || value.includes("map")) return "TILEMAP";
  if (kind === "CAMERA" || value.includes("camera")) return "CAMERA";
  if (kind === "MUSIC" || kind === "AUDIO" || value.includes("audio")) {
    return "AUDIO";
  }
  if (kind === "EVENT" || value.includes("trigger")) return "TRIGGER";
  if (value.includes("hero") || value.includes("player")) return "PLAYER";
  if (
    value.includes("enemy") || value.includes("npc") || value.includes("guide")
  ) return "NPC";
  if (kind === "SPRITE") return "PROP";
  return "CUSTOM";
}

function transform(trackId: string, x = 0, y = 0): GameEditorComponent {
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

function sprite(trackId: string): GameEditorComponent {
  return {
    type: "SPRITE",
    componentId: componentIdFor(trackId, "SPRITE"),
    visible: true,
  };
}

function audioSource(trackId: string): GameEditorComponent {
  return {
    type: "AUDIO_SOURCE",
    componentId: componentIdFor(trackId, "AUDIO_SOURCE"),
    loop: false,
    volume: 1,
  };
}

function collider(
  trackId: string,
  options: Partial<
    Extract<GameEditorComponent, { readonly type: "COLLIDER" }>
  > = {},
): GameEditorComponent {
  return {
    type: "COLLIDER",
    componentId: componentIdFor(trackId, "COLLIDER"),
    shape: "BOX",
    width: 0.8,
    height: 0.8,
    radius: 0.4,
    isTrigger: false,
    layer: "DEFAULT",
    enabled: true,
    ...options,
  };
}

function rigidbody(
  trackId: string,
  options: Partial<
    Extract<GameEditorComponent, { readonly type: "RIGIDBODY" }>
  > = {},
): GameEditorComponent {
  return {
    type: "RIGIDBODY",
    componentId: componentIdFor(trackId, "RIGIDBODY"),
    bodyType: "STATIC",
    mass: 1,
    gravityScale: 0,
    fixedRotation: true,
    enabled: true,
    ...options,
  };
}

export function defaultGameObjectComponents(
  trackId: string,
  kind: string,
  roleOverride?: GameObjectRole,
): readonly GameEditorComponent[] {
  const role = roleOverride ?? gameObjectRoleFor(trackId, kind);
  const base = [
    transform(
      trackId,
      role === "PLAYER" ? 1 : role === "NPC" ? 5 : 0,
      role === "PLAYER" ? 1 : role === "NPC" ? 3 : 0,
    ),
  ];
  switch (role) {
    case "TILEMAP":
      return [...base, {
        type: "TILEMAP",
        componentId: componentIdFor(trackId, "TILEMAP"),
        mapId: `map:${trackId}`,
        tileSize: 1,
        collisionEnabled: true,
      }, collider(trackId, { layer: "WORLD", width: 1, height: 1 })];
    case "CAMERA":
      return [...base, {
        type: "CAMERA",
        componentId: componentIdFor(trackId, "CAMERA"),
        active: true,
        zoom: 1,
        camera2D: {
          ...DEFAULT_CAMERA_2D_SETTINGS,
          follow: {
            ...DEFAULT_CAMERA_2D_SETTINGS.follow,
            targetId: "hero",
          },
          shake: { ...DEFAULT_CAMERA_2D_SETTINGS.shake },
        },
      }];
    case "AUDIO":
      return [...base, audioSource(trackId)];
    case "TRIGGER":
      return [
        ...base,
        collider(trackId, { layer: "SENSOR", isTrigger: true }),
        {
          type: "BEHAVIOR",
          componentId: componentIdFor(trackId, "BEHAVIOR"),
          enabled: true,
        },
      ];
    case "PLAYER":
      return [
        ...base,
        sprite(trackId),
        collider(trackId, { layer: "PLAYER", width: 0.7, height: 0.7 }),
        rigidbody(trackId, { bodyType: "DYNAMIC", gravityScale: 0 }),
        {
          type: "CHARACTER_CONTROLLER",
          componentId: componentIdFor(trackId, "CHARACTER_CONTROLLER"),
          moveSpeed: 4,
          stepHeight: 0.25,
          fixedStep: 1,
          enabled: true,
        },
      ];
    case "NPC":
      return [
        ...base,
        sprite(trackId),
        collider(trackId, { layer: "NPC", width: 0.7, height: 0.7 }),
        rigidbody(trackId, { bodyType: "KINEMATIC", gravityScale: 0 }),
        {
          type: "BEHAVIOR",
          componentId: componentIdFor(trackId, "BEHAVIOR"),
          enabled: true,
        },
      ];
    case "PROP":
      return [...base, sprite(trackId), collider(trackId, { layer: "WORLD" })];
    default:
      return [...base, sprite(trackId)];
  }
}

export function componentLabel(type: GameEditorComponent["type"]): string {
  const labels: Record<GameEditorComponent["type"], string> = {
    TRANSFORM: "位置・向き (Transform)",
    SPRITE: "見た目 (Sprite)",
    AUDIO_SOURCE: "音 (Audio)",
    TILEMAP: "マップ (Tilemap)",
    COLLIDER: "当たり判定 (Collider)",
    RIGIDBODY: "重力・物理 (Rigidbody)",
    CHARACTER_CONTROLLER: "プレイヤー移動",
    CAMERA: "カメラ (Camera)",
    BEHAVIOR: "イベント・ルール",
  };
  return labels[type];
}

export function componentSummary(component: GameEditorComponent): string {
  switch (component.type) {
    case "TRANSFORM":
      return `位置 ${component.x}, ${component.y} · 回転 ${component.rotation}`;
    case "SPRITE":
      return component.visible ? "iDRAW素材を表示" : "非表示";
    case "AUDIO_SOURCE":
      return `${component.loop ? "ループ" : "1回再生"} · 音量 ${
        Math.round(component.volume * 100)
      }%`;
    case "TILEMAP":
      return `${component.mapId} · ${component.tileSize}マス · 当たり判定 ${
        component.collisionEnabled ? "有効" : "無効"
      }`;
    case "COLLIDER":
      return `${component.shape} · ${
        component.isTrigger ? "Trigger" : "壁"
      } · レイヤー ${component.layer}`;
    case "RIGIDBODY":
      return `${component.bodyType} · 重力 ${component.gravityScale}`;
    case "CHARACTER_CONTROLLER":
      return `${component.moveSpeed} speed · 固定ステップ ${component.fixedStep}`;
    case "CAMERA":
      return `${component.active ? "有効" : "無効"} · ズーム ${component.zoom} · ${
        component.camera2D?.pixelPerfect === false ? "Pixel OFF" : "Pixel ON"
      }`;
    case "BEHAVIOR":
      return component.enabled ? "イベントを実行" : "無効";
  }
}

export function cloneGameComponents(
  components: readonly GameEditorComponent[],
): GameEditorComponent[] {
  return components.map((
    component,
  ) => ({ ...component } as GameEditorComponent));
}
