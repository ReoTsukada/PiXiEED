# PiXiEED Feature Inventory

調査日: 2026-08-20
目的: 実装・無効化・Roadmap・将来候補を、入口とEvidence付きで分離する。
対象外: UIの再設計、CSS変更、Component変更、Feature Flag変更、route切替、production適用。

## 1. Evidence rule

`Current Entry / UI / State` は、ユーザーが現在触れる入口、表示・非表示の状態、保存・権利・同期Stateを記録する。
`Relevant Module` は主要実装、`Roadmap` は作業パッケージまたは正本、`Feature Flag` は明示的flagがある場合だけ記す。
契約やテストがあっても、Current Entryがないものは `IMPLEMENTED` に昇格しない。

各Feature行は、`Current Entry / UI / State`、`Relevant Module / Source`、`Roadmap / Flag / Note`
を最低限のEvidence fieldとする。明示的なflagが見つからない場合は「flagなし」と同じ意味で読み、
未接続・未検証・TODO・preservation条件を最後のNoteに残す。Production／Provider／Deviceの未確認は、
Statusを機械的に `IMPLEMENTED` へ昇格させない。

| Evidence level | 読み方 |
| --- | --- |
| `CURRENT_SOURCE` | 現行route／HTML／scriptが対象経路を読み込む。 |
| `ISOLATED` | local-only、in-memory、host-neutral、synthetic fixtureの実装。 |
| `CONTRACT` | 型・schema・ADR・仕様。実装・runtime接続の有無は別判定。 |
| `LOCAL_BROWSER` | ローカルBrowserの限定的観測。実機・productionではない。 |
| `UNTESTED` | 必要な観測がない。推測でPASSにしない。 |

## 2. Implementation surface inventory

Feature名だけでなく、実装の置き場所・責務・証拠の種類も棚卸しする。

| Surface category | Current / isolated evidence | Status | What is still separate or unknown |
| --- | --- | --- | --- |
| Core | `pixiedraw2/src/core/core-100/`〜`core-120/`, `core-shell/assets/*-contracts.js` | `PARTIAL` | composition／provider／production route接続 |
| State | current Draw state modules、Draw2 `ProjectState`、Audio state、Game Studio／Runtime state | `PARTIAL` | Current／isolated stateの統合、Runtimeとauthoringの分離 qualification |
| Store | Current IndexedDB／OPFS／File System、Audio-200 stores、Draw2 persistence | `PARTIAL` | durable server／Storage provider、real data compatibility |
| Command | current Draw handlers、Draw2 `data-workspace-command`、Core command adapters | `PARTIAL` | one versioned Command Registryへの全入口統合 |
| Actions | `draw2-basic-tools.ts`, selection/timeline/audio/game action modules | `PARTIAL` | Context availability／mobile gesture／IME matrix |
| Services / adapters | Auth、Market Edge Functions、PiXiSYNC modules、Registry／Tool Bridge contracts | `PARTIAL` | provider authority／live RLS／webhook／route connection |
| Engines | Draw raster／selection／timeline、Audio timebase／transport、Game runtime | `PARTIAL` | browser compositor、AudioContext、native runtime、profiler |
| Controllers | Draw2 interaction／workspace UI、PiXiSYNC lifecycle、Core Shell route controller | `PARTIAL` | current route ownership、focus／panel lifecycle integration |
| Models | Project、Asset、Revision、AudioProject、GameProject、Package、Social、Commerce entities | `PARTIAL` | canonical registry/provider convergence |
| Data / schemas | PXD、manifest、fixtures、Core Shell schemas、Supabase migrations | `PARTIAL` | applied production migration/RLS/Storage state |
| IndexedDB | current Draw journals/project stores、PiXiSYNC pending operations、Draw2/Audio local stores | `IMPLEMENTED` source-level | browser profile and real user data recovery qualification |
| Persistence / recovery | local autosave、journal、checkpoint／recovery contracts | `PARTIAL` | FP-004 durable transaction and cross-device recovery |
| Sync | PiXiSYNC V1 operation/order/checkpoint source | `IMPLEMENTED` source-level | live realtime/RPC/RLS/provider and new Core convergence |
| Assets | current Draw assets、Asset Registry contracts、Asset Definition／bridge | `PARTIAL` | registered resolver、immutable blob/materialization |
| UI | current Draw/Market/Social/account pages、Draw2 Workspace DOM／CSS | `PARTIAL` | Draw2 replacement authority、Audio/Game current routes |
| Mobile / device | current Draw mobile reference、Draw2 mobile contracts／fixture | `PARTIAL` | physical touch/stylus/IME/safe-area/long session |
| Desktop / tablet | Draw2 desktop/tablet browser reference and contracts | `PARTIAL` | real compositor、text scale、browser matrix |
| Experimental / isolated | `pixiedraw2/`, `core-shell/`, WP/F* contracts and synthetic fixtures | `IMPLEMENTED` isolated | must not be reported as current production |
| Disabled / legacy | shared project, multi-canvas, default-off Core Shell/Draw2, legacy PXD | `DISABLED` or `DEPRECATED` | URL/data/Storage/compatibility audit before deletion or replacement |
| Roadmap | `09_ROADMAP/`, `WORK_PACKAGES/`, Registry/Queue | `PLANNED` / `CANDIDATE` | completion status is not product release status |
| Docs / contracts / ADR | `02_ARCHITECTURE/`, `03_PRODUCTS/`, `docs/contracts/`, `docs/decisions/` | `IMPLEMENTED` as documentation | prose authority vs source/runtime drift |
| Tests / evidence | `pixiedraw2/tests/`, `scripts/test-*`, `docs/inventory/*-evidence.json` | `PARTIAL` | production/provider/device evidence and clean-repo qualification |

## 3. Global / Core / Platform inventory

| ID | Feature | Domain | Status | Current Entry / UI / State | Relevant Module / Source | Roadmap / Flag / Note |
| --- | --- | --- | --- | --- | --- | --- |
| G-001 | Account / Identity / Tenant / Permission | GLOBAL | `IMPLEMENTED` | `/account/` と現行Auth boundary。新Core providerは未資格 | `account/`, `pixiedraw/assets/js/modules/auth-session-cache.js`, `docs/contracts/WP-060-ACCOUNT-PERMISSION-ADAPTER.md` | CORE／FP-001。production Auth/RLSは `UNTESTED` |
| G-002 | Project Registry | GLOBAL | `PARTIAL` | 現行ProjectはPiXiEEDraw local／legacy経路。Core Shell registryはisolated | `core-shell/assets/core-project-registry-contracts.js`, `02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md` | `WP-091`, `SITE-400`。server authority未接続 |
| G-003 | Command Registry / Command Engine | GLOBAL | `PARTIAL` | Current Draw操作と新Draw2 command boundaryが併存 | `pixiedraw/assets/js/app.js`, `pixiedraw2/src/core/core-100`, `docs/contracts/WP-020-COMMAND-ENGINE-ADAPTER.md` | `CORE-100`〜`120`。UI handlersの全移行は未確認 |
| G-004 | Journal / Checkpoint / Recovery | GLOBAL | `PARTIAL` | Current local autosave／journalは存在。新Core durable providerは別境界 | `pixiedraw/assets/js/modules/local-project-journal-utils.js`, `pixiedraw2/src/draw2-persistence.ts`, `pixiedraw2/src/fp-004/` | `WP-030`, `FP-004`。durable transaction資格は未完 |
| G-005 | Event / Activity / Search / Notification | GLOBAL | `PARTIAL` | 現行 route／notification sourceとCore Shell contractsが分離 | `core-shell/assets/core-event-activity-contracts.js`, `core-search-index-contracts.js`, `core-notification-contracts.js` | `WP-095`〜`WP-097`。provider durability未確認 |
| G-006 | PXD / Package / Manifest / Hash | GLOBAL | `PARTIAL` | Current DrawのPXD／PNG。Draw2 PXD exportはisolated lazy chunk | `pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js`, `pixiedraw2/src/draw2-export.ts`, `pixiedraw2/src/draw2-legacy-compat.ts` | `DRAW-140`, `DRAW-150`, `AUDIO-220`, `GAME-330` |
| G-007 | Public URL / Route compatibility | PLATFORM | `IMPLEMENTED` | 現行公開route群を維持。Core route resolverは別のisolated projection | `docs/inventory/current-public-routes.md`, `core-shell/assets/core-public-url-routing-contracts.js` | `WP-098`, `SITE-400`。cutoverは禁止 |
| G-008 | Core Shell / lazy tool routes | PLATFORM | `PARTIAL` | `core-shell/index.html` はnoindex／default-off／Coming Later | `core-shell/index.html`, `core-shell/assets/core-shell.js`, `core-shell/assets/routes/*.js` | `WP-080`, `SITE-400`。current navigationではない |
| G-009 | Browser/PWA distribution | PLATFORM | `PARTIAL` | Browser current routesは存在。PWA/native release identityは別管理 | `docs/inventory/current-production-boundaries.md`, `app-shell/pixieed-capacitor/` | `PLATFORM-450`, `NATIVE-500`〜`520` |
| G-010 | Desktop native / mobile store distribution | PLATFORM | `PLANNED` | Current Entryなし。Capacitor stagingのみ | `app-shell/pixieed-capacitor`, `docs/contracts/FP-007-capacitor-staging-manifest.md` | `NATIVE-510`, `NATIVE-520`。signing／store未検証 |

## 4. Draw inventory

| ID | Feature | Status | Current Entry / UI / State | Relevant Module / Source | Roadmap / Evidence |
| --- | --- | --- | --- | --- | --- |
| D-001 | Create / Open Project | `PARTIAL` | `/pixiedraw/` current flowは実装済み。Draw2 local Project dialogはisolated | `pixiedraw/assets/js/app.js`, `pixiedraw2/src/draw2-entry.ts` | `DRAW-110`, `WP-100` |
| D-002 | Indexed sparse raster / tile / dirty region | `PARTIAL` | Current rasterとDraw2 Coreが別実装。Draw2はtile／dirty tracking | `pixiedraw2/src/draw2-core.ts`, `pixiedraw2/src/draw2/draw-110/raster-editor.ts` | `DRAW-110`, `docs/contracts/DRAW-110-RASTER-EDITOR.md` |
| D-003 | Pen / Eraser / Fill / shapes / line | `PARTIAL` | Draw2 Entryにtool commandとCore write set。実機qualificationなし | `pixiedraw2/src/draw2-basic-tools.ts`, `draw2-special-tools.ts` | `DRAW-110`, `FP-006` |
| D-004 | Palette / color / indexed codec | `PARTIAL` | Current Paletteあり。Draw2 indexed palette／color panelあり | `pixiedraw2/src/draw2-core.ts`, `pixiedraw2/index.html`, `pixiedraw/assets/js/modules/palette-utils.js` | `DRAW-110`, `DRAW-170` |
| D-005 | Selection / clipboard / transform | `PARTIAL` | Draw2 Core／panel／sheet boundary。Current Drawとは別経路 | `pixiedraw2/src/draw2-selection.ts`, `draw2-selection-edit.ts` | `DRAW-120`, `docs/contracts/DRAW-120-SELECTION-TRANSFORM.md` |
| D-006 | Layer / Frame / Cel / Timeline | `PARTIAL` | Draw2 Timeline DOM／Coreあり。Frame×Layer cellの資格化は限定 | `pixiedraw2/src/draw2-timeline.ts`, `draw2-creator-features.ts` | `DRAW-130`, `docs/contracts/DRAW-130-TIMELINE.md` |
| D-007 | Onion / Tags / Markers / Playback | `PARTIAL` | Draw2 creator feature storeとplayback projectionあり | `pixiedraw2/src/draw2-creator-features.ts`, `draw2-timeline.ts` | `DRAW-130`, `wp190-final-gap-inventory.json` |
| D-008 | PNG / PXD / package export | `PARTIAL` | Current PNG/PXDとDraw2 lazy exportが併存 | `pixiedraw2/src/draw2-export.ts`, `draw2-export-registry.ts` | `DRAW-140`, `DRAW-160`。production export pathは未接続 |
| D-009 | Legacy PXD read-only compatibility | `PARTIAL` | Adapterはlegacy archive向け。real user PXDは未検証 | `pixiedraw2/src/draw2-legacy-compat.ts` | `DRAW-150`, `docs/inventory/draw-150-evidence.json` |
| D-010 | Advanced pixel tools / tilemap / reference / slice | `PARTIAL` | Core／lazy chunkとisolated Browser reference | `pixiedraw2/src/wp170-advanced-tools-core.ts`, `draw2-tilemap.ts` | `DRAW-170`。marketはpreparation only |
| D-011 | Draw→Play preview | `PARTIAL` | Local Runtime previewは観測。production Game pathではない | `pixiedraw2/src/wp160-runtime-bundle-entry.ts`, `pixiedraw2/src/game/game-350/product-path.ts` | `DRAW-160`, `docs/inventory/game-350-browser-audit-20260815-rerun.json` |
| D-012 | Mobile Canvas / gesture / sheet UX | `PARTIAL` | `390x844` local Browser geometryは確認。physical touch／stylus未検証 | `pixiedraw2/src/draw2-mobile-v2.ts`, `draw2-mobile-workspace.ts`, `pixiedraw2/src/fp-006/` | `FP-006`, `WP-180`, `WP-190` |

## 5. Audio inventory

| ID | Feature | Status | Current Entry / UI / State | Relevant Module / Source | Roadmap / Evidence |
| --- | --- | --- | --- | --- | --- |
| A-001 | Audio Project / Audio Revision / metadata | `PARTIAL` | Host-neutral Core。current production Audio routeなし | `pixiedraw2/src/audio/audio-200/contracts.ts`, `state.ts`, `metadata-authority.ts` | `AUDIO-200`, `docs/inventory/audio-200-evidence.json` |
| A-002 | Source blob / IndexedDB / OPFS / journal | `PARTIAL` | store adapter／journal型は存在。実データproviderは未接続 | `audio-200/indexeddb-store.ts`, `opfs-store.ts`, `persistence.ts`, `journal.ts` | `AUDIO-200`。storage qualification未完 |
| A-003 | Track / Clip / waveform / timebase | `PARTIAL` | Draw2のAudio panel markupとCore projection。AudioContextなし | `audio-200/timebase.ts`, `waveform.ts`, `workspace-entry.ts` | `AUDIO-200`, `AUDIO-230` |
| A-004 | Event binding / LIVE / PINNED / preview | `PARTIAL` | graph／binding validationはisolated。Game/Timelineとのproduction接続なし | `pixiedraw2/src/audio/audio-210/core.ts` | `AUDIO-210` |
| A-005 | Package / license / provenance / export lock | `PARTIAL` | PINNED lock／manifest validation。sale／upload／entitlementは外部 | `audio-220/core.ts`, `docs/contracts/AUDIO-220-PACKAGE-LICENSE-COMPATIBILITY.md` | `AUDIO-220`, `MARKET-410` |
| A-006 | Desktop / Tablet / Mobile workspace projection | `PARTIAL` | profile／safe-area／sheet metadata。DOM／device outputなし | `audio-230/workspace.ts`, `projection.ts`, `device.ts` | `AUDIO-230`; browser visual／physical audio `UNTESTED` |
| A-007 | Transport / piano roll / mixer / long audio | `PARTIAL` | Core/runtime modulesとDraw2 Audio DOMあり。Audio device未接続 | `audio-240/transport.ts`, `piano-roll.ts`, `mixer-runtime.ts`, `long-audio-runtime.ts` | `AUDIO-240`; completion gateは `UNTESTED` をPASSにしない |
| A-008 | Recording / freeze / render / automation / effects / mastering | `CANDIDATE` | source moduleはあるが、RoadmapのAUDIO-240 completion pathと別の拡張 | `audio-250/`, `audio-260/`, `audio-270/`, `audio-300/`〜`audio-330/` | 将来候補。採用・UI入口・録音実機は未確認 |

## 6. Game inventory

| ID | Feature | Status | Current Entry / UI / State | Relevant Module / Source | Roadmap / Evidence |
| --- | --- | --- | --- | --- | --- |
| G-201 | GameProject / Scene / Entity / Component / Prefab | `PARTIAL` | Game Core／Studio state。Core Shell routeはComing Later | `pixiedraw2/src/game/game-300/core.ts`, `game-350/studio.ts` | `GAME-300`, `GAME-350` |
| G-202 | Behavior IR / No-code / Graph / bounded Script | `PARTIAL` | 同じBehaviorIRへcompileする契約。editor UI／script runtimeは別 | `game/game-300/core.ts`, `game-350/studio.ts`, `docs/contracts/GAME-300-game-project-core.md` | `GAME-300`, future Studio surface |
| G-203 | Input ActionMap / touch / gamepad / keyboard | `PARTIAL` | semantic ActionId／safe-area control metadata。physical deviceなし | `game/game-310/input-actions.ts` | `GAME-310` |
| G-204 | Runtime preview / play / pause / save state / checkpoint | `PARTIAL` | local isolated BrowserでRuntime READY。authoring Projectとは分離 | `game/game-320/core.ts` | `GAME-320`, `docs/inventory/game-350-browser-audit-20260815-rerun.json` |
| G-205 | Build plan / artifact / provenance / package | `PARTIAL` | hash／lock／path validation。compiler／Storage artifactなし | `game/game-330/core.ts`, `wp200-game-build-pipeline.ts` | `GAME-330` |
| G-206 | Draw / Audio Asset binding and LIVE/PINNED | `PARTIAL` | canonical revision reference／package manifest。Registry provider未接続 | `game/game-340/core.ts`, `game-350/runtime-qualification.ts` | `GAME-340` |
| G-207 | Game Studio profiles / panels / creation guide | `PLANNED` | state modelのみ。現行Game route・production UIなし | `game/game-350/studio.ts`, `core-shell/assets/routes/game-route.js` | `GAME-350`, `SITE-400` |

## 7. Collaboration / Asset / Market / Social / Ops

| ID | Feature | Domain | Status | Current Entry / UI / State | Relevant Module / Source | Roadmap / Note |
| --- | --- | --- | --- | --- | --- | --- |
| C-001 | PiXiSYNC V1 operation/revision/order | COLLABORATION | `IMPLEMENTED` | `/pixiedraw/` source path、IndexedDB journal、RPC/realtime boundary | `pixiedraw/assets/js/modules/pixisync-operation-codec.js`, `pixisync-realtime-client.js` | `WP-050`; live realtime state未確認 |
| C-002 | Legacy shared-project / room binding UI | COLLABORATION | `DISABLED` | `SHARED_PROJECTS_ENABLED=false`; old code／compatibility remains | `pixiedraw/assets/js/app.js`, `retired-collaboration-compat.js`, `docs/inventory/pixiedraw-feature-inventory.json` | 旧共有経路。削除ではなく依存監査が必要 |
| C-003 | Project／Asset Registry Bridge | ASSET | `PARTIAL` | Core contracts／fixtures。current production adapter未接続 | `core-shell/assets/core-project-registry-contracts.js`, `core-asset-registry-contracts.js` | `WP-091`, `WP-092`, `DRAW-170` |
| C-004 | Asset Definition / Region / Animation / Pivot | ASSET | `PARTIAL` | Draw2 draft／validation／Game lock reference | `pixiedraw2/src/draw2-creator-workspace.ts`, `draw2-asset-registry-bridge.ts` | `DRAW-160`, `DRAW-170`, `GAME-340` |
| C-005 | Market listing / checkout / download / purchase | MARKET | `IMPLEMENTED` | `/market/` route、current JS、Edge Function source | `market/`, `supabase/functions/market-create-checkout/`, `market-download/` | `MARKET-410`; provider/database live status未検証 |
| C-006 | Market rights / provenance bridge from new Core | MARKET | `PARTIAL` | WP-210 typed Core only。existing Marketは別経路 | `pixiedraw2/src/wp210-market-rights-core.ts` | `MARKET-410`, `FP-003` |
| C-007 | Direct Work / billing / ledger | MARKET | `PARTIAL` | Core composition／contractのみ。current new route/provider未確認 | `pixiedraw2/src/platform/work-420/`, `docs/contracts/WORK-420-COMPOSITION.md` | `WORK-420`; production semantic `UNTESTED` |
| C-008 | Social feed / post / comment / like / OGP | SOCIAL | `IMPLEMENTED` | Root／`/post/`／PixFind参照とmigrations source | `scripts/social-posts.js`, `scripts/home-social-feed.js`, `post/`, `pixfind/app.js` | current source path。DB/RLS applied state `UNTESTED` |
| C-009 | New Social Core event / moderation / notification adapter | SOCIAL | `PARTIAL` | isolated composition／event adapter | `pixiedraw2/src/platform/social-430/` | `SOCIAL-430`; no production claim |
| C-010 | Admin / analytics / ads / economics policy | PLATFORM | `PARTIAL` | current account/admin／ads sourceとWP-240/250 isolated Core | `account/admin.html`, `scripts/ads-lazy.js`, `pixiedraw2/src/wp240-*`, `wp250-*` | `OPS-440`, `PLATFORM-450`; legal/provider `UNTESTED` |

## 8. Disabled / deprecated / future register

| Item | Status | 根拠 | 扱い |
| --- | --- | --- | --- |
| `SHARED_PROJECTS_ENABLED` legacy shared projects | `DISABLED` | `pixiedraw/assets/js/app.js`, `docs/inventory/pixiedraw-feature-inventory.json` | runtime入口では無効。旧URL／データ／compatibilityを確認するまで残す。 |
| `MULTI_CANVAS_FEATURE_ENABLED` | `DISABLED` | `pixiedraw/assets/js/modules/state-normalizers.js` | 未使用を不要と推測しない。旧state／UI／保存formatを棚卸し対象にする。 |
| Draw2 `data-feature-flag="off"`, Audio flag `off` | `DISABLED` | `pixiedraw2/index.html`, `core-shell/assets/core-shell.js` | 隔離検証のdefault。UIを有効化する判断ではない。 |
| Legacy PXD adapter | `DEPRECATED` + compatibility | `pixiedraw2/src/draw2-legacy-compat.ts`, `DRAW-150` | 新PXDへ暗黙変換せず、読み取り・警告・preserveを分ける。 |
| Retired PiXiPackage separation | `DEPRECATED` | `00_START_HERE/LATEST_CANONICAL_DECISIONS.md` | 目標は統合PXD。旧分離形式を新UIの主語にしない。 |
| Audio 250〜330 expansion | `CANDIDATE` | `pixiedraw2/src/audio/audio-250/`〜`audio-330/` | RoadmapのAUDIO-240 completionとは別。録音・freeze・automation等の採用判断が必要。 |
| Native desktop / store | `PLANNED` | `NATIVE-500`〜`520`, Capacitor staging | signing、physical device、store、rollback evidence後に再分類。 |

## 9. Unknowns

- 現行本番HTMLのcache-buster／deploy identity、実DB／RLS／Storage／Stripe webhook状態。
- Real legacy PXD・real user dataの読み込み互換性。
- Audio hardware／recording permissions／native audio latency。
- Game Studioの現行route、Registry resolver、artifact materializer、実機入力。
- `PIXIEED_LEARNING_CONTEXT.md` の `current_package: SOCIAL-430` と Registry／Queueの `SITE-460` の時点差・文脈差。Registry authorityを優先するが、状態を無視してはいけない。
