---
spec_id: PIXIEED-PIXEL-UI-001
title: PiXiEED Pixel UI Design System
status: ACTIVE_CANONICAL
version: 1.0.0
updated: 2026-08-13
---

# PiXiEED Pixel UI Design System

この契約はDraw2、Audio、Gameに共通するVisual Grammarを定義する。各Toolの編集機能と
Workspace構造は専用化してよいが、Token、Control State、Icon規則、Focus、Touch Targetは
別体系を作らない。

## 1. Product原則

- Creatorの作品を主役にし、Canvas／Viewportへ説明文・Card・広告を置かない。
- 常設UIは高頻度操作だけとし、低頻度操作はMenu、Flyout、Panel、Command Paletteへ移す。
- 同一Commandへの入口を理由なく重複させない。
- 表示は簡潔にするが、意味はIcon、Tooltip、Accessible Name、Shortcut、Helpから確認できる。
- 既存製品のLayoutやIconを複製せず、操作距離・情報密度・状態表現を比較してPiXiEED用に再設計する。

## 2. Pixel GridとToken

- Layoutの基準単位は2px。主要Spacingは`2 / 4 / 6 / 8 / 12 / 16 / 24 / 32px`。
- BorderとIcon geometryは整数pxへ揃える。意図しない小数px、Blur、Soft Shadowを使わない。
- Cornerは原則`0 / 1 / 2px`。Pillは状態Chip等、意味がある場合だけに限定する。
- Control surfaceは`outline → structural border → base → top/left highlight → bottom/right hard shadow`
  の順で表現し、ThemeごとにSemantic Tokenを差し替える。
- 色、Spacing、Size、Typography、Border、Shadow、MotionをSemantic Tokenにする。
- ThemeはCanonical Pixel、Palette、Preview、Thumbnailの色を変更しない。

必須Token group:

```text
surface.canvas / surface.panel / surface.control / surface.flyout
text.primary / text.muted / text.onAccent
border.outline / border.structure / border.highlight
accent.primary / selection / focus / disabled / danger / warning
space.1..8 / control.compact / control.touch / timeline.cell
```

## 3. Icon

- PiXiEED所有のIconだけを使用し、外部製品のIconをトレースしない。
- 基準Gridは16または20。座標、Stroke、Blockは整数へ揃え、`shape-rendering: crispEdges`を使う。
- Rounded cap、曖昧な細線、過度なDetailを避け、同じ線幅・密度・視覚重量を維持する。
- Icon内に説明文字を入れない。意味は`aria-label`、`title`、Tooltip、Shortcutで補う。
- Draw2のSource of Truthは`pixiedraw2/assets/icons/draw2-icons.svg`。将来は同じSourceから
  Native用Raster atlasを生成できる境界を維持する。

## 4. Tool Group

- Tool railには現在選択中の子Tool Iconを持つ通常の1:1親Buttonを置く。
- 親Buttonへ三角、Corner marker、Badge等の「展開可能」装飾を付けない。
- Click／Keyboard activationで小型Flyoutを開く。6個を横一列にせず最大3列程度のGridにする。
- Flyoutは独立したPanel surfaceを持ち、Viewport内へ収め、Escape／外側Click／選択で閉じる。
- 親のIcon、`aria-label`、Tooltipは選択した子Toolへ更新する。
- Tool切替はCanonical Projectを変更せずWorkspace local stateだけを更新する。

## 5. Interaction State

すべてのInteractive Componentは`rest / hover / pressed / selected / focused / disabled / loading /
error`を同じTokenで表す。Focus ringをBorder色だけに依存させず、Keyboard使用時に常に判別できる
ようにする。Drag専用CommandにはClick／Keyboardの代替を持たせる。

## 6. Device Profile

- DesktopはCompact visual controlを使う。Tool Buttonは1:1で揃える。
- Mobileは見た目を肥大化させず、40〜44px以上のHit Targetを確保する。
- Mobileは現行PiXiEEDrawのCanvas-firstリズムを参照し、Desktop Dockを縮小しない。
- TabletはCanvasを常設し、1つのPanelを維持できる中間Presentationとする。
- Page全体を操作のためにScrollさせない。各Panel／Timelineが必要な範囲だけ内部Scrollを所有する。

## 7. Canvas、Input、Performance

- Pointer StrokeはCanvas projectionだけを更新し、Workspace全体を再描画しない。
- Pen Previewは選択中Index Colorのlocal draftを含む実描画色と同じ色・Brush footprint・経路を使う。
- PreviewはCanonical Rasterを変更せず、Pointer release時に1 Stroke＝1 UndoでCommitする。
- Browser gestureをCanvasへ誤転送しない。Canvas上のWheel／Pinch／PanはViewport projectionを更新し、
  Canonical RasterとPage layoutを再生成しない。
- WheelでのZoom Inはポインター位置をAnchorにし、Zoom OutはViewport中央へ戻しながら基準倍率へ復帰する。
- Color EditorはRGBだけでなくAlpha（透明度）をlocal draftへ含め、Palette Button、Stroke Preview、Canvas
  Previewへ同じARGB値を反映する。Pointer／Keyboard操作の終了時に1回だけPalette CommandへCommitする。
- Page Zoomを一律無効化してAccessibilityを壊さず、Editor Viewport上のGesture ownershipで競合を防ぐ。
- Canvasは`imageSmoothingEnabled=false`、Pixel surfaceは`image-rendering: pixelated`を維持する。

## 8. Validation Gate

各変更は最低限、次を分離して記録する。

1. Type／unit Testと`git diff --check`
2. Desktop 1280×900、Mobile 390×844、TabletでPage overflow 0
3. FlyoutのViewport containment、Keyboard、Focus、Escape、Accessible Name
4. Pen／Eraserの高速・折れ曲がりStroke、Preview一致、1 Stroke＝1 Undo
5. Palette local draft、Alpha、Palette Button、Preview、確定Canvas RGBAの一致
6. Pointer Anchor Zoom、中央復帰Zoom Out、Wheel／PinchがViewportだけを変更すること
7. 現行PiXiEEDraw、PXD、PiXiSYNC、Market、Runtimeへの非侵入

実測していないDevice、Stylus、Browser、長時間Memoryは`UNTESTED`のまま残す。
