# WP-180 現行PiXiEEDraw Mobile UI Inventory

調査日: 2026-08-08  
対象: `pixiedraw/index.html`, `pixiedraw/assets/css/style.css`, `pixiedraw/assets/js/app.js`  
扱い: 読み取り専用。WP-180実装では現行ファイルを変更せず、Draw2側へPresentationだけを再構築する。

## 現行の構造

現行版は`body.is-mobile-layout`とSafe Area用CSS変数を中心に、縦向きCanvas-firstを組み立てている。
`#stage > #canvasViewport > #viewportWorkspace > #mainCanvasArea > #canvasStack`が描画面の基礎で、
`#drawingCanvas`、Brush Preview、Overlay、SelectionのCanvasを同じProjection領域に重ねる。
`#canvasControls`は再読込、ファイル/外部Tool、Copy/Cut/Paste、Undo/Redo、ZoomをまとめたCanvas上の
Quick Actionである。

モバイル専用の`#mobileDrawer`は、`#mobileTabs`のTablistと`#mobilePanels`のPanelを持つ。主な入口は
Tools、Frames/Layers、File、Settings、Share、Extensions/Helpで、Colorは構成によりToolsへ統合される。
`#mobileDrawerHandle`で高さを変更し、CSSはpeek/half/fullのDrawer高さ、Safe Area、`100dvh`、横方向の
overflow抑制、Panel内の`pan-y`を定義している。

Frame/Layerは`#panelFrames`内のTimeline Matrix、再生・FPS・Onion Skin・Layer opacity/blend設定を
持ち、DesktopではRight RailまたはBottom Timeline Dockへ移動する実装がある。現行Mobileでは同じ
PanelをDrawer内へ投影する。

## Classification

| Area | Classification | Draw2での扱い | 根拠 |
| --- | --- | --- | --- |
| Canvas-firstの縦向き構造 | REUSE | Canvasを常時主役にし、Essential Toolbarだけを常時表示 | `#stage`, `#canvasViewport`, `#canvasStack` |
| Safe Area / `viewport-fit=cover` / `100dvh` | REUSE | Draw2 ShellのDevice ProfileとTokenへ移す | `index.html` viewport、CSS `--safe-area-*` / `--mobile-viewport-*` |
| Canvas上Quick Action | ADAPT | Draw2 Command/Shortcut Registryへ接続し、必須操作の入口を維持 | `#canvasControls`, `#canvasControlButtons` |
| Mobile Drawerのpeek/half/full | ADAPT | Draw2 Bottom Sheetのpresentation stateとして再実装 | `#mobileDrawer`, `data-mode`, `--mobile-drawer-*` |
| Mobile Tablist + Panel切替 | ADAPT | Lazy Mount可能なPanel Groupへ移す。非表示Panelは計算・Decodeしない | `#mobileTabs`, `#mobilePanels`, `data-mobile-tab` |
| Tools / Colorへの到達性 | ADAPT | Context ToolbarとTool Options Sheetへ分離。Canvas面積を優先 | `#panelTools`, `#panelColor`, `tool-grid` |
| Frames / Layers / Onion Skin | REUSE + ADAPT | 同じCoreのTimeline/Layer/CelをSheetへ投影 | `#panelFrames`, `#timelineMatrix`, `#onionSkinEnabled` |
| Touch pan/zoom/draw境界 | ADAPT | Canvas=`none`、Panel=`pan-y`、Timeline=`pan-x pan-y`の所有権をDraw2契約へ移す | CSS `touch-action` とCanvas/Panel構造 |
| Virtual Cursor / floating draw controls | REUSE候補 | 操作性を比較し、Draw2ではCore外のMobile adapterとして再設計 | `#virtualCursorCanvas`, `.canvas-clipboard-buttons`, `mobile-draw-help` |
| PiXiSYNC / external tools / ads / legacy global DOM wiring | REPLACE | Draw2へ直接移植しない。WP-180は入口Contractだけを定義 | `#pixisyncPanel`, `data-external-tool`, `panel-ad-mount` |
| 目的不明な古いUI・重複Panel | DELETE_CANDIDATEではなくUNKNOWN | 削除・現行変更はWP-180外。依存証明なしに削除しない | 現行の共有Runtimeと動的移動処理に依存可能性 |

## 操作性の比較基準

Draw2 Mobileで最低限維持するものは、Canvas占有率、Top/Bottomの到達性、Tool選択、Palette、
Layer/Frame、Zoom/Pan、Safe Area、Panelのスクロールである。現行のDrawerをそのまま縮小せず、
必要なときだけBottom Sheetを開く。Panelを開いてもEditor Coreを再生成せず、Workspace Stateだけを
更新する。

## 非侵入確認

- 現行`pixiedraw/`のHTML/CSS/JSはWP-180で変更しない。
- 現行PiXiEEDrawのPiXiSYNC、PXD、既存Project、既存URL、Market、Production DB/StorageへDraw2
  Workspaceから接続しない。
- InventoryのREUSEはUIの原則だけを意味し、現行コードの直接再利用・密結合を意味しない。
