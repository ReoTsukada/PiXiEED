# WP-180 Workspace Contract (initial)

この契約は、PiXiEEDraw2のWorkspace ProjectionとCanonical Editor Coreを分離する。Workspaceは
Project/PXD/PiXiSYNCへ出力されず、UI例外がCanonical Stateを破壊しない。Desktop、Tablet、Mobileは
同じCoreを使用し、Device CapabilityはPresentation Profileだけを選択する。

## Regions

`Workspace`は`DockRegion`（left/right/bottom）、`Panel`、`PanelGroup`、`Toolbar`、`Inspector`、
`CanvasRegion`、`TimelineRegion`、`Drawer`、`BottomSheet`、`Overlay`、`CommandPalette`を含む。
Panelは`hidden → mounted → active`のライフサイクルを持ち、開閉時にEditorCoreを再生成しない。

## State boundary

Workspace stateはPanelの開閉・サイズ・順序・Preset・Sheet・Timeline scroll・UI tab・hover・local
zoom・local tool・local panel historyだけを持つ。Canonical Project state（Raster、Layer、Frame、
Cel、Selection、Command、Undo、Asset reference）とは型を分け、PiXiSYNCのCanonical Operationへ
変換しない。

## Hot path and ownership

Pointer sampleはCanvas ProjectionとInput sessionだけを更新し、Timeline/Layer/Palette/Inspector/
Workspaceのrenderを発生させない。Stroke commit時だけCore Commandへ渡す。所有権はPen/Eraser＝Canvas、
Pan＝Viewport、Selection＝Canvas selection、Timeline drag＝Timeline、Panel resize＝Workspace、
Panel scroll＝Panelとする。Pointer Captureのcancel/lostpointercaptureは未commitで終了する。

## Capability and responsive profiles

Capabilityはviewport、pointer coarse/fine、hover、touch、stylus candidate、orientation、safe area
から決める。Desktopはleft toolbar/right panel/bottom timeline、TabletはCanvas＋one persistent panel、
MobileはCanvas＋essential toolbar＋必要時Bottom Sheetとする。390×844、1280×900を最低Referenceとする。

## Virtualization and metrics

Timeline/Layer projectionはtotal/visible/overscan/mountedを記録し、1000 Frame/100 Layerでもbounded
windowを守る。Hot path metricsはpointer samples、canvas projection updates、workspace updatesを
分ける。Panel metricsはmount count、active panel、core recreation countを持つ。

## Commands and shortcuts

UI actionはversioned Command Registry境界へ接続可能にする。Input/textarea/select/contenteditable、
modal、sheet、IME中はglobal shortcutを抑止する。Undo/Redoは既存Coreの操作へ委譲し、Command Paletteは
将来のregistry actionを表示する入口とする。
