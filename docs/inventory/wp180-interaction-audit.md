# WP-180 操作性・Interaction Audit

測定環境: Codex In-app Browser / Chromium / isolated `pixiedraw2/`  
実機Mobile、実機Stylus、Safari、Firefox、30分Memory、Full compositor E2Eは未測定。

## Browserで確認した項目

| 項目 | 結果 | 証拠 |
| --- | --- | --- |
| Desktop Workspace structure | PASS | 1280×900でTop/Left/Canvas/Right/Timelineが表示、Canvas領域の横Overflow 0 |
| Tablet adaptive workspace | PASS | 834×1112で`tablet` profile、52px Tool Dock＋Canvas＋280px persistent panel、横Overflow 0 |
| Mobile Canvas-first | PASS | 390×844で`mobile` profile、Outer headerを隠しCanvasを主役化、sticky essential toolbar、横Overflow 0 |
| Panel switch | PASS | Layers→Palette→InspectorをTab/Launcherから切替、Core再生成なしのstatusを確認 |
| Mobile Bottom Sheet | PASS | 390×844でPalette Panelを開閉、`transform`と`is-mobile-sheet-open`を確認、Escapeで閉じる |
| Command Palette | PASS | Native dialogが開きSearchへFocus、CancelでOpen Command PaletteへFocus restore、Escapeで閉じる |
| Tab keyboard | PASS | Layers TabへFocus後ArrowRightでPalette Tabへ移動しPanel切替 |
| Shortcut | PASS | Bodyで`e`を押すとEraser、Project ID Input内で`p`を押してもToolは変化せず文字だけ入力 |
| Theme | PASS | Light/Dark/Systemを切替。Canvas checkerboard computed styleが不変 |
| Unknown Flag | PASS | `?workspace=unknown`はOFF、`Unknown Workspace flag · fail-closed OFF`を表示 |
| Flag ON | PASS | `?workspace=on`はON表示。ただしisolated Entryのみ |
| Kill Switch / Rollback | PASS | Workspaceをhiddenにし、Canvas/Cardを元のReference DOM位置へ戻し、Project状態を変更しない |
| Assets unavailable | PASS | Assets Tabは`Coming Later`を表示し、未実装機能を操作可能に見せない |

## Aseprite参照監査の扱い

| 操作群 | WP-180評価 |
| --- | --- |
| Pencil fast interpolation / 1 Stroke = 1 Undo | Core/Pointer Captureの既存実装を保持。Source boundary確認はPASS、実機Pointer E2EはUNTESTED |
| Eraser / Fill / Selection / Transform | Existing isolated Core/UI controlsをWorkspaceへ移動。Apply/Cancel/Undo/RedoはUI入口確認、全Pointer操作はUNTESTED |
| Layer / Frame / Cel / Timeline / Onion Skin | BrowserでTimeline、Layer Track、Cel、Onion Skin controlsを確認。大量FixtureのcompositorはUNTESTED |
| Palette / Indexed color | Palette PanelをLazy tabで表示。ThemeはCanvas styleへ混入しないことを確認 |
| Pattern / Tile / Grid / symmetry | WP-170 Advanced Core/Lazy boundaryを保持。WP-170実装Testは再実行せず、WP-180はWorkspace tab/Unavailable境界だけ確認 |
| Copy / Cut / Paste | Existing Selection UIをInspectorへ移動。Clipboard実データ操作はWP-180では未測定 |
| Zoom / Pan / temporary Tool | Pan入口とShortcut Registryを実装。Canvasのvisible input E2EはBrowser CUAがStroke commitを生成しなかったためUNTESTED |

## 入力所有権

`Pen/Eraser＝Canvas`、`Pan＝Viewport`、`Selection＝Canvas Selection`、`Timeline drag＝Timeline`、
`Panel resize＝Workspace`、`Panel scroll＝Panel`をContractへ記録した。Existing Draw2 Entryの
`getCoalescedEvents`、Pointer Capture、pointercancel、lostpointercapture、one-commit pathは保持する。
BrowserでPanel／Timelineの操作とSheet閉鎖は確認できたが、物理Pointer/Touch/Stylusの全Lifecycleは
UNTESTEDとして残す。

## 未昇格の理由

Browser CUAによるCanvasドラッグは画面上のCanvasへ到達した表示確認まではできたが、検証環境の入力
経路からStroke Commitを発生させられず、Undo enablementとRaster変更の実機相当証拠を作れなかった。
したがってAseprite級の「実操作完成度」、24/32msのfull input-to-visible、Stylus、長時間Memory、
Production performanceはPASSへ昇格していない。
