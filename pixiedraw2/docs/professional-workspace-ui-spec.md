# PiXiEEDraw2 Professional Workspace UI/UX Specification

Status: Canonical isolated Draw2 UI specification
Scope: `pixiedraw2/` only. Production PiXiEEDraw、PXD、PiXYNC、Market、既存Routeは対象外。

Visual geometryの数値基準は [Visual Pixel-Match Canonical](./visual-pixel-match-canonical.md) を優先する。

## Reference sheet interpretation

`スクリーンショット 2026-08-14 18.30.34.png` と `スクリーンショット 2026-08-14 19.13.17.png` は、
完成画面をそのまま一枚に再現するための画像ではなく、Mobile Workspaceの設計説明書・実装引き継ぎ資料である。

- 端末内の縦長画面は、Mobileの基本状態（Top bar / Tool bar / Context / Canvas / Palette / Tab / Context panel）の参照である。
- Tool、Timeline、Layerの小画面例は、同時表示する画面ではなく、同じContext panelを切り替えた状態の例である。
- 番号、説明文、重要ポイント、ジェスチャー説明、デザイン仕様、`Prompt`枠は設計資料であり、Runtime Workspaceへ表示しない。
- Runtimeは基本状態で一つのPanelだけを表示し、TimelineやLayerはTab操作で必要時だけMountまたはActivateする。
- Mobileの下部WorkspaceではPaletteを常設し、その直下にTimeline cardの拡張Tab strip（Timeline / Tags / Markers / Audio）を表示する。各Tabは同じ下部スペースを切り替え、将来のCreator要素もこのTab契約へ追加する。

- 資料から取り込むのは情報階層、操作性、タッチターゲット、Safe Area、状態遷移、視認性の規則であり、説明書のレイアウトや文章そのものではない。
- 現行PiXiEEDrawは配置、操作順、ドロワー、Sheet、タッチジェスチャーの参照元に限定する。色、余白、角丸、罫線、アイコン、Typography、Panel表現、AnimationはPiXiEEDraw2 Design TokenとComponent Contractを権威とする。

## Product principle

PiXiEEDraw2 is a Pixel Creator Application, not a web dashboard.

```text
Canvas / Artwork
  > Current tool controls
  > Layers / Frames / Palette
  > Project actions
  > Help / Diagnostics
```

常設表示は制作に必要な情報だけに限定し、機能を削除せず、低頻度機能をMenu、Command Palette、Context Panel、Popoverへ移す。

## Current UI classification

| UI | Classification | Rule |
|---|---|---|
| Tool Rail | ALWAYS_VISIBLE | アイコン中心。現在ToolだけSelected表示。 |
| Context Toolbar | CONTEXTUAL | Size、Shape、Opacity、Pattern、Mirror等。Toolに応じて変化。 |
| Canvas / Overlay | ALWAYS_VISIBLE | Canonical rasterと表示Projectionを分離。 |
| Palette Grid | ALWAYS_VISIBLE in Color dock | Color tabを切り替えてもPalette gridは失わない。 |
| Layers | DOCKABLE_PANEL | Pixel制作の標準Presetでは右Dockに保持。 |
| Inspector | DOCKABLE_PANEL | 選択、Layer、Frameの属性を同じPanel境界で表示。 |
| Timeline | DOCKABLE_PANEL | Expanded / Compact / Collapsed。Creator metadataはSecondaryへ収納。 |
| Undo / Redo / Zoom / Fit | TOP_TOOL | 描画中に迷わないよう、上部へ常設する。NavigatorやHistoryの独立Panelは持たない。 |
| Realtime Sync status | STATUS_POPOVER | Local、Connecting、Synced、Offline、Conflictを一つの状態表示で確認する。制作Panelにはしない。 |
| Mini Preview | VIEWPORT_TOOL | ビューポート右上のボタンから必要時だけ開く。常設Panelにはしない。 |
| Canvas Settings | POPOVER_OR_MENU | 3×3 anchorとリアルタイムresize previewを持つ。 |
| Advanced Tools / Assets / Export | POPOVER_OR_MENU | 初期表示しない。機能は削除しない。 |
| WP、Architecture、Compatibility説明 | HELP_ONLY | 通常の制作Workspaceへ表示しない。 |

## Canonical layout

```text
Global App Bar: File/Edit/Sprite/Layer/Frame/Select/View/Window/Help
Context Toolbar: current tool properties + compact zoom tools
Tool Rail | Canvas / Artwork | Color / Layers / Inspector Dock
Timeline: playback + frame/cel grid
Status Bar: XY / canvas size / zoom / frame / layer / sync / local save
```

Desktop target dimensions are compact and tokenized:

- Global row: 38px
- Context row: 40px
- Tool Rail: 48px
- Right Dock: 260–320px, resize/collapse capable
- Timeline: 164–260px, preset dependent
- Status Bar: 24px

Canvas remains the largest region. Focused Canvas hides right Dock and Timeline without reconstructing Editor Core.

## Workspace presets

- `pixel`: Color、Layers、Inspector、compact Timeline
- `animation`: Layers、expanded Timeline、Onion Skin controls
- `tileset`: Advanced/Tileset context and compact Timeline
- `focused`: Canvas、Tool Rail、minimum Context Toolbar

Preset and panel arrangement are local Workspace state. They are not Project data and are not PiXYNC operations.

## Panel and interaction rules

- Panel headers use one collapse/restore control. MobileではSheetを閉じ、DesktopではDockを折りたたむ。
- Panel resize and Timeline resize update CSS variables only; Editor Core is not reconstructed.
- Tool group buttons are exclusive. Child tools open in a bounded flyout.
- Canvas right-click、drag selection、text selectionは編集領域の操作を妨げない。入力欄は例外。
- `Ctrl/Cmd+Shift+F` toggles Focus Mode. `Ctrl/Cmd+K` opens Command Palette.
- 高頻度操作は1〜2操作以内。低頻度操作はMenu/Command Paletteへ配置する。
- Undo / Redo、Zoom、Fitは独立Panelにせず、上部の操作群から直接使える。
- 同期状態は制作Panelを増やさず、状態表示のPopoverだけで共有相手・Revision・遅延・競合を確認する。
- Details（ハンバーガー）は大分類、元のセクション、コマンドの順に段階表示し、初回クリックで全コマンドを露出させない。

## Timeline rules

Timeline header keeps playback、FPS、loop、frame actions、Onion Skin. Tags、Markers、Linked CelはSecondary disclosureに収納する。

Frame number rowとLayer label columnは固定投影。Cellは均一サイズ、仮想化されたvisible windowだけをmountする。

## Visual system

- 4px spacing grid: 4 / 8 / 12 / 16 / 24
- Icon: 20px viewBox、1.75–2px stroke、PiXiEED専用Registry
- Desktop control: 32px square baseline
- Touch control: 40px square baseline
- Radius: 3–6px。過度な丸角は禁止。
- BorderはPanel separator、Input、Selected stateなど必要箇所だけ。Surface差で階層を示す。
- `Canvas / Panel / Raised Control / Selected`をSurfaceとAccentで区別する。

## Performance guardrails

- Pointer strokeでWorkspace全体、Timeline全体、Layer list全体を再描画しない。
- Panel開閉でEditor Core、Raster、Undo、Project Stateを再生成しない。
- Timelineはbounded projection。1000 Frame、100 Layerを常時DOM化しない。
- Theme、Panel、Density、PresetはCanonical pixel colorへ影響しない。
- 初期BundleへAdvanced、Audio、Game、Marketの大型実装を混入させない。

## Visual audit checklist

各変更でPC 1280×720以上、Mobile 390×844を確認する。

- Canvas占有率と最小領域
- 上部2段の重なり、Menu到達性
- Tool Railの一貫したサイズ
- Color / Layer / InspectorのPanel階層
- TimelineのFrame番号、Cell視認性、Secondary disclosure
- Focus、Keyboard、Touch target、Reduced Motion
- page overflow 0、内部Panelだけのbounded scroll
- Console Error 0

## Safety boundary

この仕様はDraw2隔離WorkspaceのUI契約であり、Production route切替、現行PiXiEEDraw廃止、PXD schema変更、PiXYNC変更、Market変更、Production DB変更、Deploy、Publish、Commit、Pushを許可しない。
