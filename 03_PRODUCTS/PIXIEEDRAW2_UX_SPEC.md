---
document_id: PIXIEED-DRAW2-UX-SPEC
title: PiXiEEDraw2 Canonical UI/UX Specification
status: CANONICAL_DIRECTION
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-10
---

# PiXiEEDraw2 Canonical UI/UX Specification

## 1. Decision summary

PiXiEEDraw2 は、Desktop・Tablet・Mobile で同じ Editor Core と Project/PXD 意味論を
使い、Presentation、Workspace、Input だけを適応させる。`workspace state` は表示状態で
あり、canonical project state ではない。

- Desktop は Aseprite 相当の pixel-art editing efficiency と Layer × Frame × Cel semantics
  を最低基準にする。Unity 風の dock/tab/Inspector/Asset organization は構造上の参考に
  とどめ、UI、コード、branding、format はコピーしない。
- Mobile portrait は現行 PiXiEEDraw の Canvas-first と contextual drawer を主設計にする。
  Desktop を縮小表示しない。
- Tablet は Canvas の可視性と panel reachability を両立する中間 profile とする。
- 全profileでEditor document/pageをスクロールさせず、Workspaceをusable viewport内へ収める。
  長い一覧はpanel内部でvirtualize/scrollし、二次機能はtab、dock、sheetで切り替える。
- 常設Controlはicon-firstかつcompactにし、意味、shortcut、状態、操作手順はTooltip、Help/Q&A、
  Shortcut一覧、Command Paletteから確認できるようにする。
- Production `pixiedraw/` は既存 route、PXD、PiXiSYNC、URL、Project、Market data を保護する。
  Draw2 の workspace shell を production DOM/CSS の直接置換として扱わない。

## 2. External reference facts

以下は内部仕様を補助する公式資料であり、依存関係、実装移植、visual copy、license/file-format
採用を意味しない。

### Aseprite

- [Timeline](https://www.aseprite.org/docs/timeline/): Layer と Frame を横断する編集面を基準にする。
- [Sprite / Cel structure](https://www.aseprite.org/docs/sprite/): Sprite、Frame、Cel の構造意味論を確認する。
- [Layers](https://www.aseprite.org/docs/layers/): layer visibility、lock、ordering の操作意図を確認する。
- [Keyboard shortcuts](https://www.aseprite.org/docs/keyboard-shortcuts/): shortcut discoverability と selection/tool 操作の監査根拠にする。

Selection の parity は公式 URL の存在や class 名では判定せず、Add/Subtract/Intersect、Move、
Transform、active-Cel scope の operation-step audit で判定する。Aseprite の selection 専用 URL
は現在の参照環境で 404 だったため、仕様リンクには含めない。

### Unity

- [Customizing your workspace](https://docs.unity3d.com/ja/current/Manual/CustomizingYourWorkspace.html): dock/tab、panel 配置、workspace customization の構造参考。
- [Using the Inspector](https://docs.unity3d.com/cn/current/Manual/UsingTheInspector.html): context-sensitive property inspection の参考。
- [Project window](https://docs.unity3d.com/ja/current/Manual/ProjectView.html): asset organization と browsing の参考。

Unity の GameObject、Scene、Physics、Runtime authoring は Draw2 Editor Core の責務ではない。

## 2.1 Attached work-screen abstraction

今回添付された Unreal、Unity、Aseprite の実作業画面は、visual asset、branding、source code、
component tree、file format をコピーする対象ではない。ここから抽出するのは、制作中に情報を
探し、主作業へ戻り、補助情報を開閉し、入力密度を保つための情報階層だけである。画像は
リポジトリへコピーせず、以下の抽象化を設計根拠とする。

| 参照画面から抽出する階層 | PiXiEEDraw2 の抽象化 | 制約 |
| --- | --- | --- |
| Unreal の中央 Graph / Viewport | 中央の primary workspace。Canvas を常設し、Graph/Viewport は Tool-specific surface として差し替える | Unreal の node、panel、visual language、操作モデルを複製しない |
| Unreal の左 Structure | 左の Structure/Hierarchy/Tools dock。Project、Layer、Frame、Tool context を入口にする | canonical project state と workspace display state を分離する |
| Unreal の左右 Details | 右または左の context Details/Inspector。選択中 cel、layer、asset、tool の属性だけを表示する | 全設定を常時表示せず、selection scope を越えて状態を変更しない |
| Unreal の上下 Command / Utility | top command lane と bottom utility lane。Undo/Redo、Run/Preview、view、import/export、diagnostics を配置する | 高頻度 pointer sample や provider call を command lane に混ぜない |
| Unity の左 Hierarchy | 左 Structure dock。現在の Project/Asset/Layer/Frame 文脈を tree/list で示す | Unity の GameObject/Scene model は持ち込まない |
| Unity の中央 Scene | 中央 Canvas/Viewport。主作業と preview の焦点を維持する | Canvas 可視領域を panel のために隠さない |
| Unity の右 Inspector | 右 Details/Inspector。context-sensitive property inspection を行う | inspector は Core mutation の権限源ではない |
| Unity の下 Project / Assets / Console | bottom Asset/Output/Diagnostics dock。tab で切り替え、必要時だけ展開する | 常時 heavy DOM、network、thumbnail、audio/video を動かさない |
| Unity の dock / tab / resize | workspace preset、dock、tab、split、resize の presentation state | panel state は PXD、revision、PiXiSYNC event に保存しない |
| Aseprite の左 compact tools | 左 compact Tool dock。primary tool と detail tool を短い経路で切り替える | mobile では Canvas-first と contextual sheet に変換する |
| Aseprite の中央 canvas | 中央 Canvas。pixel editing、selection、preview の常設面 | canvas identity と canonical raster を panel open/close で再生成しない |
| Aseprite の右 palette / color | 右 Palette/Color context panel。active cel と color intent を近接表示する | palette/color の UI は profile ごとに適応する |
| Aseprite の下 layer × frame / cel timeline | 下部 Timeline。Layer × Frame intersection を Cel として操作する | 全 frame/layer を materialize せず visible window を virtualize する |

この抽象化での PC 基準は「Aseprite の即応性」+「Unity/Unreal 型の拡張可能な Workspace」である。
全パネルを同時に表示することではなく、中央の主作業面を維持したまま Structure、Details、
Assets、Timeline、Command、Diagnostics を dock/tab/resize で拡張できることを意味する。

## 2.2 Host-neutral presentation contract

PiXiEEDraw2 は Browser-first で実装・検証する。ただし Core と Presentation Contract は、将来の
Desktop native host と mobile store shell でも同一の意味論を使う。Host API を Core に持ち込まず、
以下の境界を adapter として注入する。

| Host boundary | Browser-first adapter | Future Desktop native adapter | Future mobile store adapter |
| --- | --- | --- | --- |
| Safe area | CSS `env(safe-area-inset-*)` と viewport metrics | window chrome/inset metrics | notch、home indicator、system bar metrics |
| Window | browser viewport、tab、fullscreen request | window size、split、maximize、native surface | portrait/landscape、sheet、system resume |
| Menu / Command | accessible command lane、keyboard registry、context menu | native menu/shortcut bridge、同じ command IDs | compact command sheet、同じ command IDs |
| File dialog | browser picker / drag-drop adapter | native open/save dialog adapter | mobile document picker/share adapter |

どの host でも Core が受け取るのは typed command、resource reference、safe viewport/input
capability だけであり、DOM、window object、native handle、file path、platform secret は受け取らない。
Presentation Contract は host capability が未対応なら `UNSUPPORTED` または contextual fallback を
返し、project state や command semantics を変えない。

## 3. Canonical surfaces and layout profiles

| Profile | Primary presentation | Required behavior |
| --- | --- | --- |
| Desktop / PC | Creator Workspace: left compact tools/Structure, center Canvas/Graph/Viewport, right Details/Inspector, bottom Timeline/Assets/Console | Aseprite の即応性を最低基準にし、Unity/Unreal 型の dock/tab/resize と top/bottom Command/Utility lane を拡張可能にする。Canvas と Timeline を常時到達可能にする。 |
| Tablet | Adaptive split workspace または Canvas + switchable panel | Canvas の最小可視領域を守り、panel を tab/sheet に切り替える。Desktop の幅不足を無理に圧縮しない。 |
| Mobile portrait | Canvas-first、topbar、contextual bottom sheet | primary tool を短い経路で到達可能にし、Layers/Timeline/Palette/Properties/Assets は必要時だけ sheet/drawer で表示する。 |

Profile 判定は [`pixiedraw2/src/wp180-workspace-contracts.ts`](../pixiedraw2/src/wp180-workspace-contracts.ts)
の `resolvePresentationProfile` を基準にし、width だけでなく pointer、hover、orientation、safe-area を読む。

### 3.1 Viewport containment and progressive disclosure

Editor shellは`100dvh`相当のusable viewportからsafe-areaとhost chromeを差し引いた領域へ固定し、
`document`/`body`/root workspaceのpage-level scrollを禁止する。全機能を同時表示することは「全要素を
画面内へ収める」ことではない。現在のCanvasとcritical controlsを画面内に保ち、二次機能を同じ
viewport内のdock/tab/sheet/full-screen subviewへ切り替えることを意味する。

- Timeline、Layer、Asset、Console、Help等の長い内容は各panel内部だけをscroll/virtualizeする。
- Panelを開いてもpage `scrollWidth` と `scrollHeight` をviewportより増やさない。
- Mobile soft keyboard/IME表示時はusable viewportを再計算し、critical actionを隠さない。
- Text scaling時は説明文を省略して意味を失わせず、icon + accessible name + internal panel flowへreflowする。
- Canvas最小領域を破る場合はpanelを同時表示せず、tab/sheet/full-screen subviewへ切り替える。

## 4. Current Draw element disposition

`REUSE` は意味論・既存操作を維持、`ADAPT` は intent/data contract を維持して presentation を変更、
`REPLACE` は Draw2 workspace 実装を置換、`DELETE_CANDIDATE` は新 Editor surface から段階的に除外する
候補を意味する。今回、Production ファイル自体の削除は行わない。

| Current element | Desktop | Tablet | Mobile | Source / disposition |
| --- | --- | --- | --- | --- |
| Canvas、overlay、selection canvas | REUSE | REUSE | REUSE | [`pixiedraw/index.html:631-659`](../pixiedraw/index.html) の `#canvasViewport`、`#viewportWorkspace`、`#drawingCanvas`、`#overlayCanvas`。Core projection と renderer adapter に接続する。 |
| pointer / zoom / pan | REUSE | ADAPT | ADAPT | [`pixiedraw/assets/js/app.js:20334`](../pixiedraw/assets/js/app.js)、`controls-mirror.js`、`layout-viewport.js`。touch/stylus 座標と gesture ownership を adapter 化する。 |
| tools / tool groups | ADAPT | ADAPT | ADAPT | `#panelTools`、`.tool-grid#toolGrid`、`[data-tool-group]`。Mobile は primary tool と詳細 tool を分ける。 |
| palette / color wheel | ADAPT | ADAPT | ADAPT | `#panelColor`、`#paletteList`、`#paletteColorWheel`。Mobile は contextual panel とする。 |
| Layers × Frames Timeline | ADAPT | ADAPT | ADAPT | `#panelFrames`、`#bottomTimelineDock`、`.timeline-card`、`.timeline-matrix-wrapper`。1000 frames/100 layers は materialize しない。 |
| left/right production rails | REPLACE | REPLACE | REPLACE | `#leftRail`、`#rightRail`、`#rightToolPanes`。Draw2 は `#draw2WorkspaceFrame` の slots と `wp180-workspace-ui.ts` を使用する。 |
| mobile drawer / tabs | DELETE_CANDIDATE | ADAPT | REUSE / ADAPT | `#mobileDrawer`、`#mobileTabs`、`#mobilePanels`。Current portrait interaction は保持し、Desktop 用重複 DOM は持たない。 |
| command lane / mobile shortcuts | ADAPT | ADAPT | ADAPT | `#editorCommandLaneActions`、`#mobileShortcutsMount`。command registry を共有し、mount 先だけ変える。 |
| floating preview / reference media | ADAPT | ADAPT | ADAPT | `#floatingPreviewPanel`、`floating-preview-panel-utils.js`。Preview/Assets panel へ lazy mount する。 |
| startup / projects | ADAPT | ADAPT | ADAPT | `#startupScreen`、`#startupWorkspace`。Project registry/storage adapter の外側に置く。 |
| ads in editor panels | DELETE_CANDIDATE | DELETE_CANDIDATE | DELETE_CANDIDATE | `#panelAdPreloadHost`、`.panel-ad`、`#rightPanelContextAd`、`#mobileBottomAd`。Active Canvas、Timeline、Save、Undo/Redo surface には置かない。 |
| PiXiSYNC panel | ADAPT | ADAPT | ADAPT | `#panelMulti`、`#mobileTabMulti`。Core ではなく session/transport adapter。 |
| camera / QR / extensions | ADAPT | ADAPT | DELETE_CANDIDATE | 外部 tool bridge として遅延接続し、最小 Editor surface には常時表示しない。 |

## 5. State and architecture boundaries

### 5.1 Editor Core

Core が canonical に所有するものは、indexed raster、palette、tile、layer/frame/cel、selection、
command、history、undo/redo、revision、dirty region である。Core は DOM、CSS、`window`、pointer
event、Realtime、Storage、Market、Game runtime を参照しない。

Canonical edit path:

```text
pointer / touch / stylus
  -> local preview
  -> validated command
  -> dirty tile / dirty region
  -> layer/frame/cel projection
  -> Canvas/thumbnail renderer
  -> journal/checkpoint adapter
```

Pointer sample、panel open/close、hover、selected tab、panel size、mobile sheet mode は project
state ではない。Panel の開閉で Core identity を変更せず、全 Canvas を再描画しない。

### 5.2 Presentation and Workspace

Workspace は `profile`、`preset`、active/open panels、panel sizes、sheet mode、timeline scroll、
active tab、local tool、local zoom、focus/hover target を所有する。これらは local UI state として
保存してもよいが、PXD の canonical project state、revision、PiXiSYNC event には混ぜない。

Workspace region は次の slot に限定する。

```text
topbar | left_dock | canvas | right_dock | timeline
drawer | bottom_sheet | overlay | command_palette
```

Draw2 の実装境界は次を基準にする。

- [`pixiedraw2/src/wp180-workspace-contracts.ts`](../pixiedraw2/src/wp180-workspace-contracts.ts): profile、state、input owner、virtualization metrics。
- [`pixiedraw2/src/wp180-workspace-ui.ts`](../pixiedraw2/src/wp180-workspace-ui.ts): panel mount、tool/command routing、responsive presentation。
- [`pixiedraw2/src/draw2-core.ts`](../pixiedraw2/src/draw2-core.ts): DOM-free editor core。
- [`pixiedraw2/src/draw2-entry.ts`](../pixiedraw2/src/draw2-entry.ts): browser projection と lazy adapter。

### 5.3 Input ownership and shortcut registry

入力 owner は `canvas`、`viewport`、`selection`、`timeline`、`workspace`、`panel`、`page` のいずれか
一つとする。Focus が input/textarea/contenteditable、IME、modal、open sheet にある場合、global
shortcut は横取りしない。

Shortcut は DOM listener の散在ではなく registry に登録する。

| Input context | Owner | Examples |
| --- | --- | --- |
| Canvas | Canvas adapter | Pen、temporary Eyedropper/Hand、zoom |
| Selection | Selection controller | Add/Subtract/Intersect、Move、Transform |
| Timeline | Timeline controller | cel select、frame/layer move、playback |
| Workspace | Workspace controller | panel toggle、preset、command palette |
| Text/editing | Focused control | text editing、IME、numeric input |

Touch/stylus は hover や right-click を必須にしない。主要操作 target は最低 44×44 CSS px、visible
focus ring は keyboard と high-contrast theme で確認可能にする。

常設Toolbarはicon-firstとするが、icon-onlyは視覚説明の省略であって意味情報の省略ではない。

- 全icon actionにaccessible name、Tooltip、shortcut hint、selected/current/loading/disabled stateと
  disabled reasonを持たせる。
- `?` Help/Q&A、検索可能なCommand Palette、Shortcut cheat sheetから全commandを確認できる。
- Toolbar、Menu、Help/Q&A、Shortcut一覧、Command Palette、QA automationは同じversioned Command
  Registryを読む。DOMだけに存在する未登録操作や、QAから列挙不能な必須操作を作らない。
- 初回作成は `New Project -> Template/Size/Palette -> Create -> First Action` の短いguideを用意し、
  完了後は常設説明を残さずHelpから再表示できる。
- delete、overwrite、publish、purchase、payment、permission等のhigh-risk actionはiconだけで確定
  させず、対象と結果を文字で示す確認を必須にする。

### 5.4 Host-safe workspace state

`safeAreaInsets`、`windowMetrics`、`menuCapability`、`fileDialogCapability` は Presentation/Host
state であり、canonical project state ではない。Host transition、dock resize、tab switch、
safe-area change、native dialog cancel は Core revision、history、selection raster、PiXiSYNC
event を変更しない。

Browser-first の acceptance は、同じ command ID、resource reference、focus/return contract を
使って次の順で行う。

```text
Browser DOM presentation
  -> host-safe Presentation Contract
  -> Desktop native / mobile store adapter contract
  -> product-specific host integration
```

Desktop native と mobile store は将来の adapter boundary であり、今回の Draw2 UX direction は
native menu、native window、native file dialog、store packaging、OS permission を実装済みとは
扱わない。

## 6. Measurable workflows

各 workflow は class/node の存在ではなく、開始状態・操作手順・結果・性能を記録する。
判定値は `PASS`、`FAIL`、`UNTESTED` とし、`UNTESTED` を parity と呼ばない。

### Desktop / Tablet core workflows

1. Pen: 連続 pointer samples から一つの stroke を完了し、Undo 1回で stroke 全体だけを戻す。
2. Temporary tool: Pen 中に modifier/shortcut または touch affordance で Eyedropper/Hand を使い、
   release 後に Pen が復帰する。
3. Cel: Timeline の Layer×Frame intersection を選択し、選択 cel の raster だけを変更する。
4. Layer: visibility と lock を独立に切り替え、lock 中の command が raster を変更しない。
5. Selection: Add/Subtract/Intersect、Move、Transform を active-Cel scope で実行する。
6. Onion Skin: 前後 frame を表示しても canonical raster hash と undo history が変化しない。
7. Keyboard: command registry から shortcut を発見でき、focused control の入力を奪わない。

### Mobile reachability workflows

1. Editor return 後、Canvas と primary tool が first frame に表示される。
2. 画面上の primary tool または mobile tab を1回、目的 panel の action を1回の合計2操作以内で
   reach できる。
3. Timeline の cell、layer visibility、palette entry、undo/redo を sheet 内で操作でき、page scroll
   や bottom navigation に隠れない。
4. half sheet / full sheet の切替で Canvas Core identity、project revision、selection raster を変えない。
5. `?` Help、Shortcut一覧、Command Palette、Project作成guideを開閉してもpage scrollとCore stateを変えない。

## 7. Performance and virtualization criteria

Reference workloads:

| Surface | Fixture | Target |
| --- | --- | --- |
| Desktop | 512×512、20 layers、120 frames | pointer input→visible update p95 ≤24ms |
| Tablet | Desktop または Mobile workload に近い adaptive fixture | p95 ≤32ms を監査目標とする |
| Mobile | 256×256、12 layers、60 frames | pointer input→visible update p95 ≤32ms |

Routine editing の Long Task >50ms は release failure とする。Timeline は 1000 frames × 100 layers
を全 materialize せず、visible layer/frame window と bounded cache を使う。scroll window、cell
measurement、thumbnail generation、layer update を独立計測する。

Panel の open/close、tab 切替、sheet drag では、次を満たす。

- `coreRecreationCount` が増えない。
- project/revision/history が変わらない。
- Canvas の全体再描画ではなく、必要な local projection のみ更新する。
- hidden panel が heavy DOM、thumbnail、audio/video、network を継続実行しない。

## 8. Viewport acceptance matrix

| Viewport | Expected profile | Required checks |
| --- | --- | --- |
| 1280×900 | desktop | page overflow なし、left/Canvas/right/Timeline 到達、keyboard path、dock/tab、p95 ≤24ms |
| 1440×900 | desktop | 高密度 panel、resizing、Inspector/Assets、visual regression |
| 834×1112 | tablet | Canvas region ≥320×320、44px target、split/sheet、page overflow なし、panel open で Core 再生成なし |
| 1024×1366 | tablet/split | Desktop density を無理に圧縮せず、Canvas と panel の同時到達 |
| 390×844 | mobile | Canvas-first、topbar/sheet 非重複、2-step reachability、safe-area、panel 内 scroll |
| 430×932 | mobile | 390px との差分で sheet height、text scaling、touch target、timeline reachability |

全行共通で、Editor表示中の `documentElement.scrollWidth == clientWidth`、
`documentElement.scrollHeight == clientHeight` を要求する。許可されるscroll containerは登録済みの
panel content、virtualized Timeline/Layer/Asset list、sheet contentだけとし、critical controlの到達を
page scrollへ依存させない。

Real device、stylus、Safari、Firefox、30分 memory、正式な GPU/WebGPU/Wasm/SAB equivalence は、
証拠が取得されるまで `UNTESTED` とする。これらを本仕様から PASS と推測しない。

## 9. Visual regression states

最低限、各 profile で次を取得する。

- blank / startup complete
- populated artwork
- selection active
- layers panel
- palette panel
- timeline with visible scroll window
- onion skin
- mobile half sheet / full sheet
- loading / error / recovery
- dark / light / system theme

基線は [`docs/visual-regression/wp180-baseline-manifest.json`](../docs/visual-regression/wp180-baseline-manifest.json)
と [`docs/visual-regression/wp190-baseline-manifest.json`](../docs/visual-regression/wp190-baseline-manifest.json)
に対応付ける。Screenshot のみで操作 parity を判定せず、DOM geometry、scroll bounds、operation trace、
performance trace を併記する。

## 10. Replacement gates

Draw2 が production editor route を置換するには、次を個別に PASS する必要がある。

- Aseprite operation-step audit、PXD/legacy round-trip、undo/recovery。
- Desktop/Tablet/Mobile visual regression と 2-step mobile reachability。
- 全reference viewportでpage-level scroll 0、internal scroll ownerの明示、icon/help/shortcut/creation guide。
- keyboard、touch、stylus、focus/a11y、safe-area。
- 1000 frames/100 layers virtualization と reference p95/Long Task。
- PiXiSYNC、Project/Asset Registry、Market/URL compatibility、rollback。

本仕様は production route の cutover、deploy、publish、delete を承認しない。
