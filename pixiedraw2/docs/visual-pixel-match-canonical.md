# PiXiEEDraw2 Desktop Visual Pixel-Match Canonical

添付された完成イメージを、PiXiEEDraw2 Desktop WorkspaceのVisual Canonical Referenceとする。対象はPresentation / Workspace UIであり、PXD、PiXYNC、Raster Core、既存Route、Productionデータは変更しない。

## Canonical geometry

| 対象 | 値 |
|---|---:|
| 基本単位 | 4px |
| Global menu row | 38px |
| Context toolbar | 40px |
| Tool Rail | 48px |
| Tool Rail button | 36px square |
| Icon button | 34px square |
| Icon | 20px |
| Primary / input height | 32px / 30px |
| Panel header | 32px |
| Timeline frame / layer row | 30px |
| Timeline cel | 30px square |
| Small radius | 4px |
| Popover radius | 6px |
| Border | 1px |

MobileはPiXiEEDrawの配置・操作順・タッチジェスチャーを参考にしつつ、Draw2の統一Design Tokenを使用する。Headerを48px、Tool Railの主要ボタンを48px、Palette swatchを44px、Context tabを44px、Timeline celを32pxへ拡大する。Tabletは主要タッチ対象を52pxまで拡張できる。ページスクロールは使わず、Canvas、Tool Rail、Timeline、Dock Sheetの各領域が固有のbounded surfaceを持つ。

## Visual hierarchy

1. Canvas
2. Context toolbar
3. Tool Rail / Palette / Layers / Timeline
4. Project controls
5. Help and advanced features

DesktopはGlobal App Bar、Context Toolbar、Tool Rail、Canvas、Right Dock、Timeline、Status Barの順で構成する。Right DockはPalette strip、Tabs、Contextual Panelの順とし、Palette gridはColor編集Panelの切替で隠さない。

## State rules

- Default、Hover、Pressed、Selected、Focus-visible、Disabledを同一のGeometryで表現する。
- 選択状態だけAccentを使い、Panel全面をAccent色にしない。
- Panel separator、Input、Canvas boundaryは1pxで統一する。
- TimelineはFrame number header、Layer row、Square Celの行列として表現する。
- Canvas上のGrid、Preview、Mirror、SelectionはCanonical Rasterから分離する。
- Pointer moveでWorkspace全体を再描画しない。

## Audit

同一ViewportのScreenshotで次を確認する。

- Top bar 38px / context 40px
- Tool Rail 48px
- Icon button 34px / Tool button 36px
- Right Dock header 32px
- Input 30px / primary button 32px
- Timeline frame/layer row 30px / cel 30px
- Border 1px / radius 4px
- Canvasが中央の最大領域を占める
- 1280×720および390×844でページスクロールなし

未実測の実機、Safari/Firefox、Stylus、長時間MemoryはPASSへ昇格しない。
