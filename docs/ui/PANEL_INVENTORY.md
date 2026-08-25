# PiXiEED Panel Inventory

調査日: 2026-08-20
目的: 現在存在するPanel／Surface、隔離EntryのPanel、将来のPanel候補を、owner・scroll・device presentation付きで整理する。
Panelの存在は、製品機能の完成やCurrent routeへの接続を意味しない。

## 1. Panel rules

- Page-level horizontal／vertical scrollは使わない。長い内容はowner Panel内部のbounded scroll／virtualizationだけに置く。
- Desktopはdense workspace reference、TabletはCanvas＋one persistent contextual panel、MobileはCanvas／Preview-first＋lazy Sheet／Drawer。
- Hidden panelは `LAZY`。hiddenのままdecode、network、high-frequency subscription、heavy renderingを実行しない。
- PanelはCanonical Project stateを直接所有しない。Panelからの変更はCommand／Coreへ渡す。
- 「現行UI」「隔離UI」「Future candidate」を列で分離する。

## 2. Global / Draw panels

| Panel ID | Owner | Surface / current source | Desktop | Tablet | Mobile | Scroll owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P-GLOBAL-TOPBAR` | Workspace | Draw2 topbar／current Draw header | persistent topbar | compact topbar | compact topbar + safe-area | none | `PARTIAL` |
| `P-GLOBAL-MENU` | Command Registry | Details／application menu | menu bar | menu／popover | full-height menu sheet | menu internal | `PARTIAL` |
| `P-GLOBAL-COMMAND` | Command Registry | Command Palette／`command-palette` | dialog | dialog | full-screen sheet | results internal | `PARTIAL` |
| `P-GLOBAL-SHORTCUT` | Help | Shortcuts dialog | dialog | dialog | sheet, keyboard alternatives | content internal | `PARTIAL` |
| `P-GLOBAL-PROJECT` | Project adapter | Open/New Project dialog | dialog | sheet/dialog | full-screen sheet | list internal | current + isolated |
| `P-GLOBAL-STATUS` | Core/Workspace | save／runtime／connection status | status rail | status chip | status region/live message | none | `PARTIAL` |
| `P-GLOBAL-RECOVERY` | Journal/Recovery | recovery／rollback surface | dialog | sheet/dialog | blocking sheet | content internal | contract / partial |
| `P-DRAW-CANVAS` | Draw Core | `draw2Canvas`, overlay, viewport stack | central Canvas | Canvas-first | primary full surface | Canvas internal only | current Draw + Draw2 isolated |
| `P-DRAW-TOOLS` | Draw Core | left/right tool dock, `data-workspace-command=tool-*` | icon rail／tool dock | compact rail | essential bottom/side tool group | none | `PARTIAL` |
| `P-DRAW-QUICK` | Draw Workspace | brush size／shape／opacity／mirror quick controls | top context row | compact row | compact action group／sheet | none | `PARTIAL` |
| `P-DRAW-COLOR` | Palette/Core | color editor／quick palette／`draw2WorkspaceColorSlot` | left dock | persistent contextual panel | bottom sheet／quick rail | palette internal | `PARTIAL` |
| `P-DRAW-LAYERS` | Timeline/Project | layers toolbar／`draw2WorkspaceLayersSlot` | right dock | one contextual panel | bottom sheet | layer list internal | `PARTIAL` |
| `P-DRAW-INSPECTOR` | Mode Core | `draw2WorkspaceInspectorSlot` | right inspector | contextual panel | sheet | inspector internal | `PARTIAL` |
| `P-DRAW-ADVANCED` | Draw2 Advanced | `draw2WorkspaceAdvancedSlot`, Pixel craft controls | right/secondary dock | lazy panel | lazy sheet | content internal | `PARTIAL` / advanced |
| `P-DRAW-PREVIEW` | Preview | mini preview／runtime preview | floating/dock | panel | overlay or sheet | preview internal | `PARTIAL` |
| `P-DRAW-ASSETS` | Asset Bridge | `draw2WorkspaceAssetsSlot`, Asset Builder | right panel | contextual panel | full-screen asset sheet | asset list internal | `PARTIAL` |
| `P-DRAW-EXPORT` | Export | Export mode／format／preview/output/progress | full panel | full panel/sheet | full-screen flow sheet | output list internal | `PARTIAL` |
| `P-DRAW-TIMELINE` | Timeline Core | bottom Timeline／`draw2WorkspaceTimelineSlot` | persistent bottom dock | collapsible bottom panel | bottom sheet opened on demand | timeline internal | `PARTIAL` |
| `P-DRAW-CANVAS-SETTINGS` | Canvas Core | canvas settings dialog | dialog | sheet | sheet | content internal | `PARTIAL` |
| `P-DRAW-HISTORY` | Recovery | history／journal panel | secondary panel | sheet | list internal | `PARTIAL` |
| `P-DRAW-NAVIGATOR` | Viewport | navigator preview | dock | sheet | preview sheet | none | `PARTIAL` |
| `P-DRAW-REFERENCE` | Advanced Asset | reference image／owned revision | panel | sheet | list/preview internal | `PARTIAL` |

## 3. Audio panels

| Panel ID | Owner | Current evidence | Desktop | Tablet | Mobile | Scroll owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P-AUDIO-TRANSPORT` | Audio Workspace | Draw2 global Audio controls: Stop／Record／Loop／BPM／Meter／Snap | persistent transport | compact transport | sticky preview transport | none | `PARTIAL`, Audio flag off |
| `P-AUDIO-EDITOR` | Audio Core | editor tab: Piano／Wave／Drum／Sampler | central editor | Canvas/Timeline priority | full-screen editor sheet | editor internal | `PARTIAL`/isolated |
| `P-AUDIO-TIMELINE` | Timebase | Audio deck timeline / waveform / clips | central bottom timeline | persistent contextual panel | bottom sheet timeline | bounded timeline | `PARTIAL` |
| `P-AUDIO-CLIP-INSPECTOR` | Audio Core | clip inspector controls | right inspector | one panel | clip sheet | inspector internal | `PARTIAL` |
| `P-AUDIO-TRACK-LIBRARY` | Audio Project | track／clip library | left rail | contextual panel | library sheet | list virtualized | `PARTIAL` |
| `P-AUDIO-PREVIEW` | Audio Preview | preview/transport panel | right/bottom | contextual | preview-first surface | waveform internal | `PARTIAL` |
| `P-AUDIO-MIXER` | Mixer | deck mixer | right/bottom | sheet | mixer sheet | channel list internal | `CANDIDATE` / isolated source |
| `P-AUDIO-AUTOMATION` | Automation | deck automation | panel | sheet | automation sheet | lane internal | `CANDIDATE` |
| `P-AUDIO-FX` | Effects | FX panel | panel | sheet | chain internal | `CANDIDATE` |
| `P-AUDIO-MARKERS` | Timebase | marker list／event binding | panel | sheet | marker list | `PARTIAL` |
| `P-AUDIO-SETTINGS` | Audio Project | sample rate／meter／snap/settings | dialog/panel | sheet | content internal | `PARTIAL` |
| `P-AUDIO-PACKAGE` | Package | package/license/provenance lock | full panel | dialog/sheet | dependency list | `PARTIAL` |

## 4. Game panels

| Panel ID | Owner | Current evidence | Desktop | Tablet | Mobile | Scroll owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P-GAME-SCENE` | Game Studio | Studio panel type `SCENE`; route Coming Later | left scene tree | contextual panel | scene sheet | tree internal | `PLANNED` UI route |
| `P-GAME-ENTITY` | Game Studio | Studio panel type `ENTITY` | tree/inspector | contextual | entity sheet | list internal | `PLANNED` |
| `P-GAME-INSPECTOR` | Game Studio | Studio panel type `INSPECTOR` | right inspector | one panel | property sheet | property internal | `PLANNED` |
| `P-GAME-EVENT-SHEET` | Behavior | Studio panel type `EVENT_SHEET` | central/bottom | sheet | full-screen behavior sheet | graph/list internal | `PLANNED` |
| `P-GAME-GRAPH` | Behavior | Studio panel type `GRAPH` | central editor | full-screen panel | full-screen graph sheet | graph internal | `PLANNED` |
| `P-GAME-CODE` | Behavior | Studio panel type `CODE` | central code editor | full-screen panel | code sheet | editor internal | `PLANNED` / bounded script |
| `P-GAME-INPUT` | Input | Studio panel type `INPUT` | panel | sheet | action editor sheet | bindings internal | `PARTIAL` contract |
| `P-GAME-ASSETS` | Asset Bridge | Game asset references / `GAME-340` | library panel | contextual | asset sheet | list internal | `PARTIAL` |
| `P-GAME-PREVIEW` | Runtime | Studio panel type `PREVIEW` | large preview | preview-first | full-screen playtest | runtime diagnostics internal | `PARTIAL` isolated |
| `P-GAME-BUILD` | Build | Studio panel type `BUILD` | bottom/right build panel | sheet | build sheet | diagnostics internal | `PARTIAL` isolated |
| `P-GAME-DEBUG` | Runtime | profiler/debug is future | panel | sheet | overlay/sheet | logs internal | `PLANNED` |

## 5. Platform / Commerce / Social panels

| Panel ID | Owner | Current source | Presentation | Status |
| --- | --- | --- | --- | --- |
| `P-PLATFORM-ROUTE` | Core Shell | `core-shell/assets/core-shell.js` route view / inspector | shell-owned | `PARTIAL`, local default-off |
| `P-ASSET-BROWSER` | Asset Registry | contracts／fixtures／Draw2 Asset slot | mode-specific panel | `PARTIAL` |
| `P-MARKET-LISTING` | Market | `/market/sell.html`, `/market/seller.html` | current route; future package panel separate | `IMPLEMENTED` current |
| `P-MARKET-PURCHASE` | Market | `/market/item.html`, dynamic items | current purchase flow | `IMPLEMENTED` current source |
| `P-MARKET-RIGHTS` | Rights | license/entitlement/provenance | dialog/panel | `PARTIAL` |
| `P-SOCIAL-FEED` | Social | root home / `scripts/home-social-feed.js` | current page/feed | `IMPLEMENTED` current source |
| `P-SOCIAL-POST` | Social | `post/index.html` | current detail page | `IMPLEMENTED` current source |
| `P-SOCIAL-NOTIFICATION` | Core/Social | notification contracts/current account surfaces | panel/sheet | `PARTIAL` |
| `P-OPS-ADMIN` | Ops | `account/admin.html` | admin page | `IMPLEMENTED` current source + new partial |

## 6. Panel inventory gaps

- Draw2 DOMにはDraw／Audio／GameのPanel候補が先に存在するが、Audio／Gameはflag・route・provider状態と一致しないためCurrent製品のPanelとして扱わない。
- Panelの重複（同じPanelをdesktop DOMとmobile sheetに二重mountすること）とstate ownershipは、UI実装前に一つのownerへ決める必要がある。
- MobileでのTimeline／Inspector／Asset Builder／Audio Mixer／Game Graphの優先順位、dismiss、focus restoration、IME中の挙動は未資格。
- Panel内部scroll・virtualizationの実機測定、text scale 200%、screen reader、Safari／Firefoxは未検証。
