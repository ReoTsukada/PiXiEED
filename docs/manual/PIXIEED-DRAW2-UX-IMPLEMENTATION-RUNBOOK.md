---
runbook_id: PIXIEED-DRAW2-UX-001
status: ACTIVE
updated: 2026-08-13
authority:
  - docs/contracts/PIXIEED-PIXEL-UI-DESIGN-SYSTEM.md
  - docs/draw2-creator-workspace-reference-contract.md
  - docs/contracts/wp180-workspace-contract.md
---

# PiXiEEDraw2 UX Implementation Runbook

このRunbookはLuna実装者へ渡す最小指示書である。各Sliceは指定Pathだけを書き、実装者と独立監査者を
同時に同じFileへ入れない。小変更ごとの全面監査は行わず、Slice完了時にGateを通す。

## 完成像

```text
Canonical Core
  Project / Asset / Revision / Command / Undo / Journal / Checkpoint
             ↓
Draw2 Editor Core
  Indexed Raster / Palette / Layer / Frame / Cel / Selection / Tool
             ↓
Workspace Adapter
  Desktop Professional / Tablet Adaptive / Mobile Canvas-first
             ↓
PiXiEED Pixel UI
  Token / Component State / Icon / Focus / Touch / Help
```

AudioとGameは最下段のVisual Grammarと最上段のCanonical Core契約を再利用するが、Draw固有Panelや
Tool Stateを共有しない。

## 実装順

### UX-01 Drawing truth

- PaletteのARGBをCanvas RGBAへ正しく変換する。
- Color EditorのAlphaをARGBへ保持し、Palette Button／Preview／Canvasへ同じ透明度を反映する。
- Pen／Eraser PreviewとCommitが全Pointer sampleを同じBresenham pathで補間する。
- Brush size、shape、pattern、actual Index ColorをPreviewとCommitで共有する。
- Previewはlocal projection、release時のCommitは1 Stroke＝1 Undoとする。

Gate: unit Test、折れ曲がりStroke、Palette Button／Preview／Canvas pixel一致。

### UX-02 Tool selection and Pixel UI

- 親Toolを通常の1:1 Buttonとして並べ、展開Markerを付けない。
- 子Toolを最大3列程度のFlyout Windowへ配置する。
- 選択子Icon／Nameを親へ反映し、Flyoutは選択、Escape、外側Clickで閉じる。
- PiXiEED Original Iconを整数Pixel Gridへ揃える。
- Token、Border、Corner、Focus、Pressed stateを共通契約へ収束させる。

Gate: Desktop／Mobile overflow 0、Flyout containment、Keyboard／Accessible Name、Icon id互換。

### UX-03 Input ownership

- 1本指／Primary pointerはDraw、2本指はPan／Pinch、Middle／temporary keyはPanとする。
- 2本目のTouch開始時は未確定StrokeをRollbackする。
- `pointercancel`、`lostpointercapture`、Canvas外releaseでStroke stateを残さない。
- Wheel／PinchはViewportだけを更新し、Page layoutとCanonical Rasterを変更しない。
- Wheel Zoom InはPointer Anchor、Zoom Outは中央復帰を使い、Page Zoomとは分離する。
- Canvas／OverlayはNearest-neighborを固定し、Virtual Cursorは整数Pixelの塗りつぶしと外周線でブラシサイズ・形状・色・Alphaを表示する。小数座標の輪郭描画は禁止する。
- Input、Dialog、Sheet、IME中はGlobal Tool Shortcutを抑止する。

Gate: Mouse／synthetic Touch、Pointer capture failure、Pointer Anchor Zoom、中央復帰Zoom Out、Page overflow。

### UX-04 Basic tool completeness

- Pen、Eraser、Fill、Eyedropper、Line、Rectangle、Ellipse、CircleをPreview／Cancel／Undoまで揃える。
- Rectangle／Ellipse／Circleのoutline／filled、Selectionのrect／lasso／same／similarを親子Tool化する。
- Brush size／shape／dither pattern／custom brushはContext OptionとしてLazy表示する。
- Circleは短辺へ内接し、Raster端で切れない決定論的integer geometryを使う。

Gate: apply／cancel／undo／redo／invalid input／edge bounds／fast stroke。

### UX-05 Workspace and device UX

- DesktopはCanvas中心、compact rail、bounded Timeline、必要PanelだけMountする。
- Mobileは現行PiXiEEDrawの縦型Canvas-first操作距離を基準にし、Desktopを縮小しない。
- TabletはCanvas＋1 persistent panel＋collapsible Timelineへ適応する。
- Virtual CursorとMini Previewはlocal settingでON／OFF可能にする。

Gate: 1280×900、390×844、Tablet、Text scaling、safe area、no page scroll。

### UX-06 Product proof

- 1000 Frame／100 Layerでbounded projectionを維持する。
- Initial／lazy BundleとLong Task原因を測定する。
- 30分Memory、physical Mobile、Stylus、Safari、Firefoxは実測まで`UNTESTED`とする。
- PXD、PiXiSYNC、Runtime、Market、現行Routeへ新規回帰がないことを確認する。

## Luna実装Promptの必須項目

各依頼は次を必ず明記する。

```text
Objective
Canonical contract
Read set
Exclusive write set
Required behavior
Forbidden behavior
Acceptance tests
Commands to run
Non-intrusion boundaries
Report format
```

「Aseprite風にする」のような曖昧な依頼は禁止する。操作数、状態、入力所有権、表示条件、Failure、
Viewport、Testを具体化する。参照製品のSourceやAssetはコピーせず、公式仕様から操作原則だけを抽出する。
