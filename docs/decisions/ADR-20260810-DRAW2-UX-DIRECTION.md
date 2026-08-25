---
adr: ADR-20260810-DRAW2-UX-DIRECTION
title: PiXiEEDraw2 Canonical UX Direction
status: ACCEPTED_DIRECTION
date: 2026-08-10
classification: PRIVATE_INTERNAL_ONLY
---

# ADR-20260810: PiXiEEDraw2 Canonical UX Direction

## Context

Production PiXiEEDraw は、Desktop では left/right rail、center Canvas、bottom Timeline、
Mobile portrait では Canvas-first と contextual drawer を持つ。親監査では、1280×900 の production
Canvas は 735×735 at x=209/y=78、390×844 は Canvas 365×365 at x=14/y=158、drawer y=572/h=188、
bottom navigation y=776/h=68、page `scrollWidth=390` を確認した。

一方、isolated Draw2 は 1280px で professional workspace を表示するが、390×844 では
`profile=mobile` に切り替わるものの Canvas が y=422 から始まり、page `scrollHeight=1182` である。
Profile 判定は存在するが、mobile の canonical first frame としては未完成である。

Production の DOM/CSS は既存 route、PXD、PiXiSYNC、Project、Market、広告、startup と強く結合して
いる。これを Draw2 の canonical workspace として直接再利用すると、Core と presentation の境界が
失われる。

今回添付された Unreal、Unity、Aseprite の実作業画面は、製品 UI のコピー元ではなく、制作効率と
情報階層の参照として扱う。画像ファイルはリポジトリへ持ち込まず、画面から抽出した以下の
配置関係だけを Draw2 の設計に反映する。

- Unreal: 中央 Graph/Viewport、左 Structure、左右 Details、上下 Command/Utility。
- Unity: 左 Hierarchy、中央 Scene、右 Inspector、下 Project/Assets/Console、dock/tab/resize。
- Aseprite: 左 compact tools、中央 canvas、右 palette/color、下 layer × frame/cel timeline。

## Decision

### 0. Creator Workspace workflow modes

The attached Creator Workspace and Asset reference material is adopted as a
Product UX direction, not as a request to copy another product's UI or to merge
all tools into one runtime bundle. Draw2 remains one Project session with
independent presentation modes: `DRAW`, `ANIMATE`, `ASSET`, `GAME`, `AUDIO`, and
`EXPORT`. The modes share Project/Asset/Revision/Command semantics and switch
presentation locally. Only the active mode's heavy presentation is mounted.

The first implementation slice is intentionally narrow: existing Draw2
surfaces remain the DRAW/ANIMATE/EXPORT paths, ASSET gets a local draft
definition panel, and GAME/AUDIO show an explicit unavailable adapter state.
This keeps the boundary from claiming Game Studio, Audio Studio, Registry
persistence, or production readiness prematurely. The detailed contract is
`docs/contracts/DRAW2-CREATOR-WORKSPACE-ASSET-UX.md`.

### 1. Same Core, different presentation

Draw2 は一つの Editor Core と Project/PXD 意味論を共有し、次を profile 別に変える。

- Desktop: dock/tab/Inspector/Asset organization を備えた Creator Workspace。
- Tablet: Canvas と panel の同時到達性を優先する adaptive split/sheet。
- Mobile: current PiXiEEDraw の Canvas-first、topbar、contextual bottom sheet。

PC の canonical workspace は、Aseprite の即応性を floor とし、Unity/Unreal の拡張可能な
Structure、Details/Inspector、Assets/Diagnostics、Command/Utility、dock/tab/resize を
PiXiEEDraw2 の slot として抽象化する。Graph、Viewport、Scene、Inspector などの参照語は
information role を示すだけで、Unreal/Unity の object model、visual component、branding、
source、file format を採用しない。

Mobile portrait は PC workspace の縮小版ではない。現行 PiXiEEDraw の Canvas-first、topbar、
contextual drawer/sheet を優先し、Structure、Details、Palette、Timeline、Assets、Command は
必要時だけ sheet/tab で到達可能にする。

全profileのEditor rootはusable viewport内へ固定し、document/page scrollを使用しない。Canvasと
critical controlsは常にviewport内へ置き、長いTimeline/Layer/Asset/Console/Helpはpanel内部だけを
scroll/virtualizeする。常設Controlはcompactなicon-firstを標準にするが、全actionにaccessible name、
Tooltip、shortcut hintを持たせ、Help/Q&A、Shortcut一覧、Command Palette、再表示可能な作成guideから
意味と手順を確認できるようにする。High-risk actionはicon-onlyで確定させない。

Workspace state は canonical project state ではない。preset、active/open panel、panel size、
sheet mode、timeline scroll、active tab、local tool、local zoom、focus は UI state として扱い、
project revision、undo history、PiXiSYNC event、PXD canonical data に混ぜない。

### 3. Browser-first and future host contract

Browser-first を実装・検証の第一 host とする。ただし Core と Presentation Contract は、将来の
Desktop native と mobile store shell でも共有する。次の境界は Host adapter とし、Core は host API
を参照しない。

| Boundary | Shared contract | Host-specific adapter |
| --- | --- | --- |
| Safe area | inset、usable viewport、orientation | browser CSS env / native window inset / mobile system bar |
| Window | size、resize、split、visibility、resume | browser viewport / desktop window / store-shell lifecycle |
| Menu / Command | stable command ID、focus、shortcut、fallback | browser command lane / native menu / mobile command sheet |
| File dialog | open/save/import/export intent、cancel、result reference | browser picker / native dialog / mobile document picker |

Host capability が未対応の場合は fallback または `UNSUPPORTED` とし、Core state、revision、
selection、history を変えない。Desktop native、mobile store shell、OS permission、native menu、
native file dialog の実装や配布はこの ADR の対象外である。

### 2. Reference policy

Desktop の最低基準は Aseprite の editing efficiency と Sprite/Frame/Cel/Layer/Timeline semantics
である。Unity の workspace customization、Inspector、Project window は dock/tab、property
inspection、asset organization の構造参考にする。

参照リンク：

- [Aseprite Timeline](https://www.aseprite.org/docs/timeline/)
- [Aseprite Sprite](https://www.aseprite.org/docs/sprite/)
- [Aseprite Layers](https://www.aseprite.org/docs/layers/)
- [Aseprite Keyboard Shortcuts](https://www.aseprite.org/docs/keyboard-shortcuts/)
- [Unity Customizing Your Workspace](https://docs.unity3d.com/ja/current/Manual/CustomizingYourWorkspace.html)
- [Unity Using the Inspector](https://docs.unity3d.com/cn/current/Manual/UsingTheInspector.html)
- [Unity Project window](https://docs.unity3d.com/ja/current/Manual/ProjectView.html)

いずれも visual copy、source copy、branding、license、file format 採用を意味しない。Aseprite parity
は component/class の存在ではなく、Pen、temporary tool、selection、Cel、Layer、Onion Skin、
keyboard の operation-step audit で判定する。

### 3. Current Draw disposition

| Current surface | Desktop | Mobile | Decision |
| --- | --- | --- | --- |
| Canvas / overlay / selection projection | REUSE | REUSE | Core と renderer adapter の契約を維持。 |
| Tools / Palette / Timeline intent | ADAPT | ADAPT | 意味論を維持し、profile ごとに panel surface を変える。 |
| Production left/right rails | REPLACE | REPLACE | `#draw2WorkspaceFrame` の workspace slots に移す。 |
| Current mobile drawer interaction | DELETE_CANDIDATE の実装重複 | REUSE / ADAPT | Canvas-first と sheet reachability だけを Draw2 contract 化する。 |
| Floating Preview / Assets | ADAPT | ADAPT | lazy adapter/panel とする。 |
| Ads in active editor | DELETE_CANDIDATE | DELETE_CANDIDATE | Draw2 の Canvas/Timeline/Save/Undo area から除外。Production deletion は別判断。 |
| PiXiSYNC / camera / QR / external tools | ADAPT | ADAPT または DELETE_CANDIDATE | Core 外の adapter。最小 editor surface には常時表示しない。 |

詳細な source path、runtime geometry、risk は [`docs/inventory/pixiedraw-layout-audit-20260810.md`](../inventory/pixiedraw-layout-audit-20260810.md)、canonical UX contract は [`03_PRODUCTS/PIXIEEDRAW2_UX_SPEC.md`](../../03_PRODUCTS/PIXIEEDRAW2_UX_SPEC.md) に記録する。

## Alternatives considered

### A. Production DOM/CSS を Draw2 の標準 shell にする

却下。`pixiedraw/assets/js/app.js`、`style.css`、PiXiSYNC、storage、広告、startup の結合を持ち込み、
Desktop/Tablet/Mobile の presentation 境界と virtualization を壊す。

### B. Desktop layout を全 viewport で縮小する

却下。Mobile の操作 target、Canvas 可視性、Timeline reachability、focus を失う。Mobile は current
PiXiEEDraw portrait の Canvas-first/contextual drawer を基準にする。

### C. Profile ごとに別 Core/Project model を持つ

却下。PXD、undo、revision、Cel、selection、PiXiSYNC の意味論が分岐する。Core は一つにする。

### D. Unity/Aseprite の UI を視覚的にコピーする

却下。必要なのは操作意図と workspace 構造の採用であり、visual/brand/source/file-format copy ではない。

### E. PC workspace をそのまま Mobile に縮小する

却下。Mobile の Canvas 可視性、portrait reachability、safe-area、touch target を損なうため、
Mobile は現行 PiXiEEDraw の Canvas-first presentation を維持する。

## Consequences

### Positive

- Desktop の高密度 authoring と Mobile の Canvas-first を同じ project semantics で提供できる。
- Panel open/close、sheet drag、profile switch が Core 再生成の原因にならない。
- Aseprite parity を operation-step と performance evidence に分解できる。
- Unity 的な Inspector/Asset organization を Draw2 の adapter/panel として導入できる。

### Costs and risks

- Workspace contract、input owner、shortcut registry、panel mount、virtualization metrics が必要になる。
- Production の current mobile drawer をそのまま移植できず、intent と state を再定義する必要がある。
- Tablet の overflow、Draw2 mobile の Canvas y=422、page scrollHeight=1182 は現時点の未解決 audit risk。
- 添付画面から抽出した hierarchy は情報配置の根拠であり、実装 parity や外部製品との visual parity の
  証拠ではない。
- Host-safe-area/window/menu/file-dialog の native/store 実装は未着手であり、Browser-first contract
  の将来 adapter 境界として扱う。
- real device、stylus、Safari/Firefox、30分 memory、formal p95 は未検証であり、方向決定だけでは PASS にならない。

## Acceptance gates

1. 1280×900/1440×900: page scrollなし、Canvas/Tools/Inspector/Timeline 到達、desktop p95 ≤24ms。
2. 834×1112/1024×1366: page scrollなし、Canvas region ≥320×320、44px target、split/sheet、panel open で Core 再生成なし。
3. 390×844/430×932: page scrollなし、Canvas-first、sheet 非重複、2操作以内の主要操作到達、safe-area、panel内scroll。
4. 1000 frames × 100 layers: visible-window virtualization、bounded cache、cell selection/scroll。
5. Pen 1 stroke/1 undo、temporary tool、selection modes、Cel mapping、layer visibility/lock、Onion Skin、focus/a11y。
6. Visual regression: blank、populated、selection、layers、palette、timeline、onion、mobile half/full sheet、loading/error、light/dark/system。
7. real device、stylus、Safari/Firefox、30分 memory、formal p95 は証拠取得まで `UNTESTED`。
8. 全icon commandのaccessible name/Tooltip/shortcut/disabled reason、Help/Q&A、Shortcut一覧、Command Palette、
   作成guide、high-risk confirmationをkeyboard、touch、screen readerで検証する。

この ADR は UX direction を決めるものであり、production route cutover、implementation deletion、deploy、
publish、commit、push を承認しない。
