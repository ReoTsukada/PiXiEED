---
document_id: PIXIGAME-CUSTOM-CONTROL-UI-001
status: CANONICAL
version: 2.1.0
verified_at: 2026-08-10
---

# PiXiGame 自作操作UI仕様 {#custom-control-ui}

## AssetからControlへ

PiXiEEDraw Asset/Animationを再アップロードせず、PiXiGameでControl Componentとして使用する。初期ComponentはButton、Toggle/Hold/Repeat、Directional Button、D-Pad、Analog Stick、Touch/Swipe/Gesture Area、Slider、Pedal、Steering Wheel、Radial Menu、Skill/Item/Menu等とする。同じAssetを複数Controlで再利用できる。

単一画像はnormal状態に使い、pressed時の縮小、明度、透明度、発光、Offsetは元画像を変更しない候補効果とする。Frame/Animation Tagはnormal、hover、focused、pressed、held、released、selected、disabled、cooldown、ready、warning、errorへStable Frame IDで割り当てる。1枚の画像内に名前付きRegion/Control Guideを設け、D-Pad等の複数領域をActionに結び付ける。

## Input Actionへの接続

Controlはデバイス固有入力ではなくSemantic Input ActionへBindする。同じ `player.jump` をCustom Button、Keyboard、Gamepad、Accessibility inputへ割り当てられる。D-Padは4/8/360度、固定/滑り、Neutral、方向Lock、Diagonalを設定し、Dead Zone、Radius、Threshold、Slide、Cancel、Repeat、Haptic、Pressed visualを持つ。

Analog Stickはbase/thumb/optional direction Asset、固定・floating origin・tap-to-appear・左右配置、8方向/360度、radial/axial dead zone、response curve、max radius、recenter、drag outside、cancelを持ち、 `Vector2 { x:-1..1, y:-1..1 }` を出力する。

## Hit AreaとMulti-touch

表示画像とTouch Hit Areaは別データとする。Rectangle、Rounded Rectangle、Circle、Capsule、Convex Polygon、Alpha候補、透明余白を使え、アクセシビリティのため画像より広くできる。Hit Area編集はPiXiGameで行い、Draw AssetのPixelを変えない。

複数Controlを同時操作できる。Pointer/Touch IDごとの所有を固定し、意図しないControl移動を防ぐ。D-Padと複数Button、Multi-touch Chord、最大同時数、Controlごとのexclusive/shared policyを管理する。

## ResponsiveとSafe Area

Layoutは画像座標ではなくAnchor、Safe Area、Constraintを基準にする。top-left/top/top-right/left/center/right/bottom-left/bottom/bottom-right、safe-area-relative、custom normalized position、offset、min/max size、DPI/viewport scaling、Portrait/Landscape、Tablet、Foldable segment、左右利き、入力デバイス別Visibilityを持つ。Touch DeviceはTouch UI、PC keyboard/gamepad接続時は必要に応じ非表示とする。

Notch、Dynamic Island相当、Home Indicator、Browser controls、Fold/Hinge、System Gesture risk、PiXiEED overlayを避ける。 `game viewport - safe-area insets - reserved system/UI regions` をControl layout領域とする。ControlごとにScene、Player state、Gameplay、Menu、Cutscene、Controller接続、Accessibility overrideを条件にできる。

## No-code、詳細、コード

No-codeは画像→Control種類→Action→配置、詳細はHit Area、Dead Zone、Layout、Feedback、Visibility、コードは同じControl ComponentとInput Action APIを直接編集する。自由TypeScriptを無理に簡易設定へ逆変換しないが、公開PropertyとBindingはGUIで編集できる。

```ts
type ControlKind = "button" | "toggle_button" | "hold_button" | "repeat_button" | "directional_button" | "dpad" | "analog_stick" | "touch_area" | "swipe_area" | "gesture_area" | "slider" | "pedal" | "steering_wheel" | "radial_menu";
type ControlVisualState = "normal" | "focused" | "pressed" | "held" | "released" | "selected" | "disabled" | "cooldown" | "ready" | "warning" | "error";
interface AssetFrameRef { assetId: string; revisionId: string; frameId?: string; animationTagId?: string; regionId?: string; }
interface ControlVisualMap { normal: AssetFrameRef; focused?: AssetFrameRef; pressed?: AssetFrameRef; held?: AssetFrameRef; released?: AssetFrameRef; selected?: AssetFrameRef; disabled?: AssetFrameRef; cooldown?: AssetFrameRef; ready?: AssetFrameRef; }
type HitArea = { type: "rect"; x: number; y: number; width: number; height: number; radius?: number } | { type: "circle"; x: number; y: number; radius: number } | { type: "polygon"; points: Array<{ x: number; y: number }> };
interface ActionBinding { actionId: string; phase: "started" | "performed" | "held" | "repeated" | "released" | "canceled"; valueMode: "button" | "axis_1d" | "axis_2d"; scale?: number; invert?: boolean; }
interface ResponsiveControlLayout { anchor: "top_left" | "top" | "top_right" | "left" | "center" | "right" | "bottom_left" | "bottom" | "bottom_right" | "safe_area"; normalizedX?: number; normalizedY?: number; offsetX: number; offsetY: number; minWidth?: number; maxWidth?: number; minHeight?: number; maxHeight?: number; portrait?: Partial<ResponsiveControlLayout>; landscape?: Partial<ResponsiveControlLayout>; leftHanded?: Partial<ResponsiveControlLayout>; }
interface ControlComponent { id: string; kind: ControlKind; visuals: ControlVisualMap; hitArea: HitArea; bindings: ActionBinding[]; layout: ResponsiveControlLayout; multiTouch: "exclusive_pointer" | "shared_pointer" | "multi_pointer"; visibility: { touchOnly?: boolean; mobileOnly?: boolean; hideWhenGamepadConnected?: boolean; scenes?: string[]; states?: string[] }; feedback?: { hapticMs?: number; soundAssetId?: string; acceptedAnimationId?: string; rejectedAnimationId?: string }; }
```

APIは `ui.control(id).bind({ actionId, phase, valueMode })` と `input.onAction(actionId, handler)` を提供し、Buttonはbutton value、Stickはaxis_2d valueを渡す。入力判定とFeedbackを分離し、表示遅延でActionを失わない。

## Asset更新・保存

Draw Asset更新で維持するのはControl Entity ID、Binding、Anchor、Size、Hit Area、Visibility、Accessibility、Haptic/Sound、Multiplayer ownership。Revision更新時はState mappingを検証し、削除Frame/Regionだけ警告する。設定を自動削除・破壊的自動修復しない。

ゲーム固有設定を画像へ書き込まず、 `PiXiEEDraw Asset = visual source`、`PiXiGame Control Component = input/layout/hit area/behavior` と分離する。PXD Mixed/Game Packageは両参照を保存できる。

## Accessibilityと完了条件

Hit Area拡張、左右反転、UI scale、opacity、high contrast、Hold/Double-tap/Repeat調整、Haptic無効化、Label/Screen Reader name、Touch UI常時表示、One-handed modeを提供する。

- Draw Assetを再アップロードせずControlへ使える。
- 画像、複数Frame、名前付きRegionからButton/D-Pad/Stickを作れる。
- Hit Areaは見た目から独立し、Multi-touch、同時入力、Action共通化ができる。
- Portrait/Landscape/Safe Area、左右利き、PC入力時Visibilityへ追従する。
- Asset更新でBindingが消えず、Frame/Region削除を勝手に別対象へ移さない。
- No-code、詳細、コードが同じComponentを編集し、Runtimeで遅延・取りこぼし・Pointer横取りを検証できる。
