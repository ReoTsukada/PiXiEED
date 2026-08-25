---
document_id: PIXIEEDRAW-LAYOUT-AUDIT-20260810
title: PiXiEEDraw / Draw2 Current Layout Audit
status: AUDIT_COMPLETE_STATIC_AND_LOCAL_RUNTIME
classification: PRIVATE_INTERNAL_ONLY
updated: 2026-08-10
---

# PiXiEEDraw / Draw2 Current Layout Audit

## 1. Scope and evidence boundary

対象は Production `pixiedraw/`、isolated `pixiedraw2/`、関連 HTML/CSS/JS、保存済み visual
baseline である。Production route、Draw2 route、既存 project/PXD/PiXiSYNC data は変更していない。

証拠は次の4種類を分離する。

1. source inspection: HTML、CSS、JS、Draw2 contracts/UI。
2. repository visual baseline: WP180/WP190 manifest と画像。
3. local runtime geometry: `getBoundingClientRect()`、scroll dimensions、profile dataset。
4. 未検証範囲: real device、stylus、Safari/Firefox、30分 memory、正式 p95、Pointer E2E。

## 2. Current source map

| Area | Exact source | Finding |
| --- | --- | --- |
| Production shell | [`pixiedraw/index.html:617-776`](../../pixiedraw/index.html) | `#appLayout`、left rail、Canvas stage、right rail、bottom Timeline。 |
| Production mobile shell | [`pixiedraw/index.html:811-867`](../../pixiedraw/index.html) | `#mobileDrawer`、`#mobileTabs`、`#mobilePanels`。 |
| Production tools/panels | [`pixiedraw/index.html:868-1305`](../../pixiedraw/index.html) | Tools、Color、Frames、File、Settings、PiXiSYNC。 |
| Production layout CSS | [`pixiedraw/assets/css/style.css:647-842`](../../pixiedraw/assets/css/style.css) | rail/flyout layout、compact panel、high cascade density。 |
| Production Timeline CSS | [`pixiedraw/assets/css/style.css:1955-2122`](../../pixiedraw/assets/css/style.css) | bottom dock、matrix、horizontal/vertical scroll。 |
| Production mobile CSS | [`pixiedraw/assets/css/style.css:13945-14993`](../../pixiedraw/assets/css/style.css) | topbar、drawer、44px controls、portrait Timeline half mode。 |
| Layout mode | [`pixiedraw/assets/js/modules/controls-mirror.js:242-359`](../../pixiedraw/assets/js/modules/controls-mirror.js) | desktop/narrow/mobilePortrait と mobile mount の切替。 |
| Mobile drawer state | [`pixiedraw/assets/js/modules/layout-viewport.js:1841-2266`](../../pixiedraw/assets/js/modules/layout-viewport.js) | half/full、drag、scroll restore、keyboard movement。 |
| Production orchestration | [`pixiedraw/assets/js/app.js:1-15`](../../pixiedraw/assets/js/app.js) | single-file orchestration。`SHARED_PROJECTS_ENABLED=false` と `PIXISYNC_V1_ENABLED=true` は別 gate。 |
| Draw2 shell | [`pixiedraw2/index.html:11-90`](../../pixiedraw2/index.html) | isolated professional workspace、left dock、Canvas、right dock、Timeline。 |
| Draw2 workspace CSS | [`pixiedraw2/assets/draw2-shell.css:174-324`](../../pixiedraw2/assets/draw2-shell.css) | desktop/tablet/mobile grid と mobile bottom sheet。 |
| Draw2 workspace contract | [`pixiedraw2/src/wp180-workspace-contracts.ts:1-178`](../../pixiedraw2/src/wp180-workspace-contracts.ts) | profile、workspace state、input owner、metrics。 |
| Draw2 workspace behavior | [`pixiedraw2/src/wp180-workspace-ui.ts:109-360`](../../pixiedraw2/src/wp180-workspace-ui.ts) | panel mount、tool/command routing、rollback/debug surface。 |

## 3. Attached work-screen reference extraction

今回添付された Unreal、Unity、Aseprite の実作業画面は、リポジトリへ画像ファイルをコピーせず、
画面から読める情報階層と制作効率だけを `CONTRACT_ONLY` の設計根拠として記録する。以下は
runtime implementation や外部製品との parity を示すものではない。

| Attached reference | Observed hierarchy | Draw2 translation | Status |
| --- | --- | --- | --- |
| Unreal | 中央 Graph/Viewport、左 Structure、左右 Details、上下 Command/Utility | 中央 Canvas/Graph/Viewport slot、Structure dock、context Details、top/bottom Command/Utility lane | `CONTRACT_ONLY` |
| Unity | 左 Hierarchy、中央 Scene、右 Inspector、下 Project/Assets/Console、dock/tab/resize | Structure、primary Canvas/Viewport、Inspector/Details、bottom Assets/Diagnostics、dock/tab/resize state | `CONTRACT_ONLY` |
| Aseprite | 左 compact tools、中央 canvas、右 palette/color、下 layer × frame/cel timeline | 即応 Tool dock、常設 Canvas、context Palette/Color、virtualized Layer × Frame × Cel Timeline | `CONTRACT_ONLY` |

抽出した共通原則は `structure -> primary workspace -> context details -> utility/output` の順序と、
制作中の主作業から補助面へ戻る短い経路である。Unreal の node/graph、Unity の GameObject/Scene、
Aseprite の UI、branding、source、file format はコピーしない。

## 4. Host and responsive direction

| Target | Canonical direction | Boundary / current status |
| --- | --- | --- |
| PC browser | Aseprite の即応性 + Unity/Unreal 型の拡張 Workspace。left Structure/Tools、center Canvas/Graph/Viewport、right Details/Inspector、bottom Timeline/Assets/Console、top/bottom Command/Utility | Browser-first presentation contract。新 Core は isolated/reference |
| Mobile portrait | 現行 PiXiEEDraw の Canvas-first、topbar、contextual drawer/sheet。PC layout の縮小はしない | Current portrait は reference、Draw2 first-frame geometry は未完成 |
| Future Desktop native | 同じ Core/Presentation Contract。native window/menu/file-dialog は adapter | `UNTESTED` / 未実装 |
| Future mobile store shell | 同じ Core/Presentation Contract。safe-area、orientation、document picker、system resume は adapter | `UNTESTED` / 未実装 |

Host-safe boundary は `safe-area`、`window`、`menu/command`、`file-dialog` とする。これらの host
state は project/revision/history/PiXiSYNC event ではない。Browser、Desktop native、mobile store
の capability 差は fallback または `UNSUPPORTED` として返し、Core semantics を変えない。

追加のCanonical presentation requirementは、全hostでEditor rootをusable viewport内に固定し、
document/page scrollを0にすることである。Timeline、Layer、Asset、Console、Helpの長い内容は
登録済みpanel内部だけでscroll/virtualizeする。常設Toolbarはcompactなicon-firstとし、全commandの
意味と手順をTooltip、Help/Q&A、Shortcut一覧、Command Palette、再表示可能な作成guideから確認できる
ようにする。High-risk actionはicon-only confirmationを許可しない。

画像自体を参照 asset、visual regression baseline、runtime fixture、build input として登録して
いない。添付画面からの抽出は設計文書上の reference-only evidence である。

## 5. Local runtime observations

### 3.1 Production

Parent-provided live observation と同じ条件で、local runtime の geometry を照合した。

| Viewport | Observed geometry | Assessment |
| --- | --- | --- |
| 1280×900 | Canvas 735×735、x=209、y=78。top=54。right tool/nav と bottom Timeline が存在。page overflow なし。 | Desktop の Canvas-first ではなく、高密度 Creator Workspace として成立。 |
| 390×844 | Canvas 365×365、x=14、y=158。topbar y=54/h=54。mobile drawer y=572/h=188。bottom nav y=776/h=68。page `scrollWidth=390`。 | Current portrait は Canvas-first/contextual drawer の良い reference。 |
| 834×1112 | `#appLayout.scrollWidth=912`、`#canvasViewport.scrollWidth=965`。`#mobileDrawer[hidden]` は hidden 属性と computed display/geometry の不一致を示した。 | Tablet は overflow と cascade/visibility を要再検証。PASS とはしない。 |

Production 初期状態では `#startupScreen` が `is-startup-active` で editor 上に表示されたため、
visual comparison は startup complete state を必ず別 fixture にする。

### 3.2 Draw2

| Viewport | Observed geometry | Assessment |
| --- | --- | --- |
| 1280×900 | `profile=desktop`。left tools、center Canvas、right panel、下部 Timeline の isolated professional workspace。 | Desktop direction は canonical spec と整合。 |
| 390×844 | reload 後 `profile=mobile`。Canvas 320×320 が y=422 から開始。page `scrollHeight=1182`。right dock は closed transform 状態。 | Profile 判定は機能するが、Canvas-first の first frame としては未完成。 |

Draw2 runtime console error は観測されなかった。ただし geometry が正しいことは、操作 parity、
実機 touch/stylus、memory、正式 p95 の PASS を意味しない。

## 6. Repository visual baselines

- [`assets/screenshots/pixieedraw-pro-landscape.png`](../../assets/screenshots/pixieedraw-pro-landscape.png): Production Desktop の dense rail/palette/Canvas reference。
- [`assets/screenshots/pixieedraw-pro-portrait.png`](../../assets/screenshots/pixieedraw-pro-portrait.png): Portrait の bottom operation surface reference。
- [`pixiedraw/mobile_test.png`](../../pixiedraw/mobile_test.png): 390×844 現行 mobile capture。
- [`docs/visual-regression/wp180/desktop-blank.png`](../visual-regression/wp180/desktop-blank.png)、`tablet-blank.png`、`mobile-blank.png`: blank shell baseline。
- [`docs/visual-regression/wp190/desktop-populated.png`](../visual-regression/wp190/desktop-populated.png)、`mobile-layers-sheet.png`: populated/layers sheet baseline。

WP180/WP190 manifest は viewport/state coverage を定義するが、drawing Pointer E2E、loading/error、
real device、stylus、Safari/Firefox、formal p95 の一部は `UNTESTED` である。

## 7. Current Draw disposition

| Element / selector | Desktop | Mobile | Risk | Recommended action |
| --- | --- | --- | --- | --- |
| `#canvasViewport` / `#drawingCanvas` / overlay | REUSE | REUSE | Production orchestration と canvas projection が結合。 | Draw2 Core を DOM-free にし、renderer adapter で再利用。 |
| `#panelTools` / `.tool-grid#toolGrid` | ADAPT | ADAPT | tool 数と dense controls が mobile で overflow しやすい。 | primary/detail tool を分離し、44px target を維持。 |
| `#panelColor` / `#paletteList` | ADAPT | ADAPT | Palette editor と picker が常時 surface になる。 | contextual panel、lazy mount、local update。 |
| `#panelFrames` / `#bottomTimelineDock` | ADAPT | ADAPT | layer/frame cell 数、縦 scroll、hit target、再生更新。 | bounded virtualization、Timeline controller、cell operation audit。 |
| `#leftRail` / `#rightRail` | REPLACE | REPLACE | CSS media rules と panel DOM の重複。 | Draw2 `workspaceFrame` slots に置換。 |
| `#mobileDrawer` / `#mobileTabs` | DELETE_CANDIDATE | REUSE / ADAPT | hidden attribute と display cascade、panel duplication。 | Portrait interaction の意図だけを Draw2 sheet contract へ移す。 |
| `#floatingPreviewPanel` | ADAPT | ADAPT | media/preview の heavy resource。 | Preview/Assets adapter として lazy mount。 |
| `#panelAdPreloadHost` / `#mobileBottomAd` | DELETE_CANDIDATE | DELETE_CANDIDATE | Canvas/Timeline/Undo の操作面を圧迫、z-index と reserved height。 | Draw2 active editing area から除外。Production cleanup は別承認。 |
| `#panelMulti` / PiXiSYNC | ADAPT | ADAPT | transport/auth/session state が editor state と混ざる。 | separate adapter。Core project state に入れない。 |
| startup/projects | ADAPT | ADAPT | startup overlay が visual baseline を覆う。 | startup-complete fixture と Project registry boundary を定義。 |

## 8. Audit conclusions and risks

### Must preserve

- Current Production mobile の Canvas-first、topbar、contextual drawer、safe-area behavior。
- Canvas、pointer/zoom/pan、pixel nearest semantics、既存 PXD/PiXiSYNC/Project compatibility。
- Aseprite operation intent: stroke/undo、Cel、layer visibility/lock、selection、onion skin。

### Must change for Draw2

- Production の left/right rail を canonical Draw2 workspace として再利用しない。
- Desktop/tablet/mobile の panel surface を同じ DOM の縮小や CSS 上書きで表現しない。
- Workspace state、mobile sheet state、local zoom、panel scroll を canonical project/revision state と
  混ぜない。
- Timeline で 1000 frames × 100 layers を materialize しない。

### Risks

- `pixiedraw/assets/css/style.css` は media/orientation/pointer-coarse rule が多く、Tablet で
  `hidden` と computed display が衝突する可能性がある。
- Production `app.js` は single-file orchestration のため、Draw2 へ直接移植すると Core、Workspace、
  PiXiSYNC、storage、広告の境界が再結合する。
- Draw2 mobile は Canvas の y=422 開始と page scrollHeight=1182 により、first-frame Canvas-first と
  2-step reachability、およびpage-level scroll 0をまだ満たさない。
- Screenshot baseline は操作結果を証明しない。Aseprite parity は operation-step audit が必要。

## 9. Required next evidence

1. startup complete の 1280×900、834×1112、390×844、430×932 screenshot + geometry。各viewportで
   document `scrollWidth/clientWidth` と `scrollHeight/clientHeight` が一致すること。
2. Canvas、Timeline、sheet の open/close 前後で Core identity、project revision、canvas projection count。
3. 1000 frames/100 layers の visible-window、scroll、cell selection、thumbnail update trace。
4. Pen 1 stroke/1 undo、temporary tool、selection modes、cel mapping、layer lock/visibility、onion skin の操作記録。
5. real device、stylus、Safari/Firefox、30分 memory、正式 p95 は証拠取得まで `UNTESTED`。
6. 全icon commandのaccessible name、Tooltip、shortcut hint、disabled reason、Help/Q&A検索、
   Shortcut一覧、Command Palette、作成guide、high-risk confirmationのKeyboard/Screen Reader操作証拠。
