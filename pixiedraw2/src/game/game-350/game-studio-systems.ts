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
    label: "Create / Test",
    purpose: "作る・保存する・Play / Stop / Restartする",
    systems: ["Project", "Undo / Redo", "Play", "Stop", "Restart", "Build"],
  },
  {
    rail: "HIERARCHY",
    label: "Scenes & Objects",
    purpose: "Scene、親子関係、Player、NPC、Map、Triggerを管理する",
    systems: ["Scene", "GameObject", "Parenting", "Visibility", "Lock"],
  },
  {
    rail: "VIEWPORT",
    label: "Scene View",
    purpose: "配置とPlay中の結果を同じ座標系で確認する",
    systems: ["2D / 3D View", "Camera", "Gizmo", "Collision Overlay"],
  },
  {
    rail: "INSPECTOR",
    label: "Object & Components",
    purpose: "選択ObjectのComponentと値を編集する",
    systems: ["Transform", "Sprite", "Collider", "Rigidbody", "Behavior"],
  },
  {
    rail: "TIMELINE",
    label: "Systems & Events",
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
    title: "Objects",
    detail: "Sceneに置くGameObjectと親子関係",
    rail: "HIERARCHY",
  },
  {
    id: "COMPONENTS",
    title: "Components",
    detail: "Objectの見た目・物理・動作",
    rail: "INSPECTOR",
  },
  {
    id: "PHYSICS",
    title: "Physics",
    detail: "Collider / Trigger / Rigidbody / 重力",
    rail: "INSPECTOR",
  },
  {
    id: "INPUT",
    title: "Input Actions",
    detail: "move / jump / attackを論理名で接続",
    rail: "TIMELINE",
  },
  {
    id: "EVENTS",
    title: "Event Sheet",
    detail: "条件 → アクションを順番に実行",
    rail: "TIMELINE",
  },
  {
    id: "ASSETS",
    title: "References",
    detail: "iDRAW / iAUDIOを参照だけで使用",
    rail: "TIMELINE",
  },
  {
    id: "PLAY",
    title: "Play Test",
    detail: "編集状態と実行状態を分離して確認",
    rail: "ACTION",
  },
  {
    id: "BUILD",
    title: "Build",
    detail: "Web / Unity / Godot / Unrealへ受け渡す",
    rail: "ACTION",
  },
];

export const GAME_STUDIO_INPUT_ACTIONS = Object.freeze(
  [
    { id: "move", label: "Move", detail: "方向入力 / 固定ステップ移動" },
    { id: "interact", label: "Interact", detail: "近くのNPC・Triggerを起動" },
    { id: "jump", label: "Jump", detail: "Character Controllerの上方向動作" },
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
): readonly GameEditorComponent[] {
  const role = gameObjectRoleFor(trackId, kind);
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
    TRANSFORM: "Transform",
    SPRITE: "Sprite Renderer",
    AUDIO_SOURCE: "Audio Source",
    TILEMAP: "Tilemap",
    COLLIDER: "Collider",
    RIGIDBODY: "Rigidbody",
    CHARACTER_CONTROLLER: "Character Controller",
    CAMERA: "Camera",
    BEHAVIOR: "Behavior / Event",
  };
  return labels[type];
}

export function componentSummary(component: GameEditorComponent): string {
  switch (component.type) {
    case "TRANSFORM":
      return `位置 ${component.x}, ${component.y}`;
    case "SPRITE":
      return component.visible ? "iDRAW参照を表示" : "非表示";
    case "AUDIO_SOURCE":
      return `${component.loop ? "Loop" : "One shot"} · 音量 ${
        Math.round(component.volume * 100)
      }%`;
    case "TILEMAP":
      return `${component.mapId} · ${component.tileSize} tile · collision ${
        component.collisionEnabled ? "on" : "off"
      }`;
    case "COLLIDER":
      return `${component.shape} · ${
        component.isTrigger ? "Trigger" : "Block"
      } · ${component.layer}`;
    case "RIGIDBODY":
      return `${component.bodyType} · gravity ${component.gravityScale}`;
    case "CHARACTER_CONTROLLER":
      return `${component.moveSpeed} speed · fixed ${component.fixedStep}`;
    case "CAMERA":
      return `${
        component.active ? "Active" : "Inactive"
      } · zoom ${component.zoom}`;
    case "BEHAVIOR":
      return component.enabled ? "Event rules enabled" : "Disabled";
  }
}

export function cloneGameComponents(
  components: readonly GameEditorComponent[],
): GameEditorComponent[] {
  return components.map((
    component,
  ) => ({ ...component } as GameEditorComponent));
}
