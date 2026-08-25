---
document_id: PIXIGAME-UNIFIED-AUTHORING-001
status: CANONICAL
version: 2.0.0
verified_at: 2026-08-10
---

# PiXiGame 統合オーサリング仕様 {#pixigame-authoring}

## 同一Project・三つの編集体験

初心者は対象→「タップされたら」→「ジャンプする」、中級者は条件・変数・State・Physics・Animation・Input、上級者はTypeScript、Visual Graph、拡張Component、Wasm/SDKを使う。かんたん・詳細・コードは別Engine/別Projectにせず、同じEntity、Component、Action、Event、Behavior Graph、Script、Revisionを編集する。

```text
Device input → Binding → Semantic Action → Trigger/Condition → Behavior/Script → Component mutation
```

座標を直接監視するゲームロジックに固定しない。Touch、Mouse、Keyboard、Gamepad、Accessibility inputを同一Actionへ割り当てる。

## Input Action Map

Action例は `player.move/jump/attack/guard/interact/dash`、`vehicle.steer/accelerate/brake`、`ui.confirm/cancel`、`camera.zoom/rotate`。一つのActionへTouch、Keyboard、Gamepad、External switch等を複数Bindingできる。Contextは gameplay、menu、dialogue、inventory、battle、vehicle、cutscene、editor-preview、customを持つ。

Rebindingはキー、Touch配置、左右利き、サイズ、感度、Dead Zone、Hold、振動、競合検出、初期化、Profile別保存を提供する。

操作はTap、Double/Triple/Multi Tap、Long Press、Press/Release/Hold/Repeat、Drag、Flick、方向Swipe、Pinch、Spread、Rotate、Two-finger、Chord、Enter/Exit、Hover、Wheel/Trackpad、Cancel、Keyboard/GamepadのPress/Axis/Trigger/D-pad/Analog、Gyro/Rumble、Accelerometer、Orientation、Tilt、Shake、Location、Camera/Microphone event、Gamepad motionを含む。権限入力は明示許可と代替入力を持つ。

GestureはDuration、Movement tolerance、Pointer count、Target mode、Consume、Tap count/interval、Repeat delay/interval、Swipe distance/velocity/direction/angle等を設定し、px/論理単位/画面比率の指定単位を保存する。

## No-code、Event Sheet、Visual Graph

基本形は `Trigger → Conditions → Actions → Else/Failure`。TriggerはInput、Tap、Collision、Area、Animation、Timer、Scene、Variable、State、Health、Item、Quest、Dialogue、Race、Fighting、Network、Custom、Script Event。ConditionはVariable、Flag、Tag/Component、Distance、Direction、LOS、Grounded、Speed、State、Inventory、Quest、Party、Cooldown、Timer、Random、Device、Authority、Custom expression。Actionは移動・回転・Scale、Jump/Dash/Knockback、Animation、Audio、Text/Choice、Scene、Spawn/Destroy、Enable、Variable/Item、Battle、Camera、Effect、Save/Load、UI、Common Event、Graph/Function、TypeScript、Custom Eventを含む。

Event Sheetはスマホ・初心者向けの折り畳み縦リスト、Visual GraphはPC・詳細向けの分岐グラフとする。両者は同じCanonical Behavior IRを編集し、表示切替でデータを複製しない。

No-code Behaviorの正本はBehavior IR、User Codeの正本はTypeScript Source。Graphから公開Script Functionを呼び、ScriptからAction/Event/Variable/Component/Common Eventを操作できる。同じBehaviorの二重実行にはOwnershipを明示する。Generated Codeは確認・複製用で、複製後は独立User Script、任意コードのGraph完全逆変換・自動上書きは保証しない。

## RuntimeとProject構造

```text
Project
├─ Scenes / Prefabs / Entities / Components / Systems
├─ Input Action Maps
├─ Behavior Graphs / Event Sheets
├─ TypeScript Scripts / UI / Audio
├─ Save Schema / Genre Modules
└─ Build / Export Profiles
```

Common ComponentはTransform、Sprite Renderer、Animator、Camera、Audio、Collider、Rigidbody、Character/Vehicle Controller、Health/Stats、Inventory、Quest、Dialogue、AI/Navigation、UI、Particle、Network Identity、Saveable、Script、Behavior Graph。PrefabはComponent、Behavior、Script、子Entityを再利用し、Variant/Overrideを持つ。

RPG、Fighting、Racing等は共通CoreのTemplate/Genre Moduleであり制限ではない。RPGはMap、NPC、Dialogue、Quest、Inventory、Battle、Save等、FightingはFixed-step、Input buffer、Frame data、Hit/Hurt、Hit stop/stun、Guard/Parry、Combo、Rollback-ready history、Training等、RacingはVehicle、Grip、Drift、Surface、Checkpoint、Lap、Spline、Ghost、AI line、Time trial等を含む。Platformer、Action RPG、Shooter、Puzzle、Novel、Rhythm、Card、Simulation、Tower Defense等も候補とし、Template後も全Component/Graph/Script/Moduleを追加削除できる。

## 画面とスマホ

Entity選択時は `[かんたん] [詳細] [コード]`。かんたんは自然文・主要Trigger/Action・Genre候補を1〜3ステップ、詳細はInspector、Action Map、Graph、State、Animation、Physics、AI、Save、Network、Performance、コードはTypeScript、API、Test、Debugger、Profilerを扱う。切替でEntityと関連Behaviorを失わない。

スマホは巨大Graphを必須にせず、Event Sheet、Trigger/Condition/Action Bottom Sheet、折り畳みInspector、コード読取・小修正を提供する。本格編集は横画面/PC推奨だが禁止しない。Preview中はEditor gestureがGameへ誤送信されない。

## Revision、Undo、保存、Export

Input Map、Behavior Graph、Component変更はCommand、Script変更はText Revisionとし、Domain別Undo/Redoを安全に適用する。Previewは確定Revisionまたは明示された未保存Preview。別WindowのDraw/Audio変更はHot Reload候補とし、同時編集を黙って上書きしない。

PXD Game PackageはScene、Prefab、Entity、Component、Input Map、Behavior IR、Event Sheet、Graph、TypeScript、UI、Genre、Save Schema、Build Profile、Dependency Lockを保存し、Graph/Scriptに権利・依存・Hash・Revisionを付ける。ExportはWeb、Android/Google、iOS/App Store、Steam/Desktop、External Adapter、editable PXD、licenseが許すSource Package。No-code ProjectでもExport可能なSourceを含める。

## Runtime data contract

```ts
type EntityId = string & { readonly __entityId: unique symbol };
type ComponentTypeId = string & { readonly __componentTypeId: unique symbol };
type ActionId = string & { readonly __actionId: unique symbol };
type EventTypeId = string & { readonly __eventTypeId: unique symbol };

interface InputBinding {
  id: string; actionId: ActionId;
  device: "touch" | "mouse" | "keyboard" | "gamepad" | "sensor" | "custom";
  controlPath: string;
  interaction: { type: "press" } | { type: "release" } | { type: "hold"; durationMs: number } | { type: "tap"; maxDurationMs: number } | { type: "multiTap"; count: number; maxIntervalMs: number } | { type: "swipe"; config: unknown } | { type: "custom"; interactionId: string; config: unknown };
  processors?: Array<{ type: "deadzone" | "scale" | "invert" | "normalize" | "custom"; config?: unknown }>;
  contexts: string[];
}

interface InputActionEvent<T = unknown> {
  actionId: ActionId; phase: "started" | "performed" | "canceled"; value: T; deviceId: string; pointerId?: number; targetEntityId?: EntityId; timestampUs: number; sequence: number;
}

interface BehaviorRule {
  id: string; enabled: boolean; trigger: unknown; conditions: unknown[]; actions: unknown[]; elseActions?: unknown[];
  execution: { mode: "immediate" | "queued" | "fixed_update" | "end_of_frame"; consumeInput?: boolean; cooldownMs?: number; maxConcurrent?: number };
}

interface GameScriptModule {
  moduleId: string; version: string; entryFile: string; capabilities: string[]; deterministic: boolean; sourceFiles: Record<string, string>;
}
```

## SDKとSecurity

Custom Component/System/Input Interaction/Node/Action/Inspector/Genre/Importer/Exporter、TypeScript package、verified WasmをSDKで追加する。Capability、Version、Signature、Sandbox、Compatibilityを要求する。Scriptはstrict sandbox、raw DOM/任意Network/任意Filesystem禁止、CPU/時間/Memory budget、Deterministic subset、署名とユーザー向けPermissionを持つ。

## 完成条件

- 代表的BehaviorをEntity選択から3操作以内でNo-code追加できる。
- Gesture、Device、Rebinding、Accessibility、Context競合を扱える。
- Event SheetとVisual Graphが同じIRを編集する。
- RPG等の縦切りをNo-codeで作り、GenreはProjectをロックしない。
- Scene/Entity/Component/Prefab/State/Physics/Animation/AI/UI/Saveを詳細設定できる。
- TypeScriptを保存・Debug・Testでき、Graph/Script/Common Event/SDKを安全に接続できる。
- Mobile/PCが同じProjectを編集し、既存Project、URL、Asset、Entitlementを維持する。
