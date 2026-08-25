# SITE-400 — Site Shell and Cross-Tool Integration

status: IN_PROGRESS
phase: platform-site
kind: site
depends_on: [DRAW-170, AUDIO-240, GAME-350]
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: MARKET-410
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

隔離された新Site Shellに、Account、Project、Asset、Tool、Search、Notification、Market、SNSの入口契約を接続する。既存Site・既存Route・現行PiXiEEDrawを変更せず、Feature Flag初期OFFのまま、Coreと各Editorを疎結合で受け入れられる入口を完成させる。

## Canonical inputs

- `02_ARCHITECTURE/APP_SHELL_NAVIGATION_DESIGN_SYSTEM_CORE.md`
- Project/Asset Registry、Versioned Tool Bridge、Package Registryの参照契約
- Event/Activity、Search、Notification、Public URL Routingの参照契約
- `docs/contracts/WP-080-APP-SHELL-DESIGN-SYSTEM.md` と現行URL/Route Inventory

## User journeys

- 隔離Entryを開く → flag OFFでUnavailableを表示し、現行Routeへ遷移しない。
- flag ONの隔離Entry → Account、Project、Tool、Search、Notificationの入口を表示し、権限のないResourceはPermission Deniedにする。
- Projectを選ぶ → Project/Assetの参照だけを解決し、EditorはTool Bridge経由で遅延ロードする。
- Search/Notificationを開く → privacy-filtered projectionだけを表示し、本文・JWT・決済・依頼内容をShellへ渡さない。
- Desktopはicon-firstのcompact dock、Mobileは必要時だけBottom Sheet/Drawerを開く。説明文は短く、全アイコンにaccessible nameとTooltip/Helpを付ける。
- 各主要操作に「作成→保存→確認→戻る」の短い手順とShortcut一覧をQAで確認できる導線を持たせる。

## UI and viewport contract

- 1280×900、1024×768、768×1024、390×844を基準に、ページ自体の縦横スクロールを発生させず、Shellの全主要要素をviewport内へ収める。
- 内部スクロールはTimeline、Layer、Asset、Search結果などのbounded regionだけに限定する。固定ヘッダー・Canvas・操作入口を隠さない。
- Icon-only操作は必ずaccessible name、focus、disabled reason、long-press/keyboard相当の代替を持つ。必須操作をHover/右クリックだけにしない。

## Server authority

Server Route、Feature Flag、Session、Tenant、Resource PermissionをServer Contextで再解決する。Client flag、role、email、DOM状態、localStorage、caller-created proofは権限根拠にしない。Unknown/OFF/Deniedはfail closedし、Flag ONでもServer Routeを通らないChunkを返さない。

## Durable event

Shellはtrusted Canonical Eventとbounded projectionだけを購読する。Project/Asset/Tool更新通知はeventId、aggregateId、version、reasonだけを扱い、Outbox/Inboxの重複・順序・Replay規則に従う。Panel、zoom、selected tool、mobile sheet、shortcut状態はCanonical Eventへ送らない。

## Privacy and non-intrusion

Telemetryはevent name、route id、component、state、diagnostic codeのallowlistだけとし、JWT、Email、Secret、Project本文、Pixel、Audio、Package、Commission、Payment、Rights、Ledgerを記録しない。現行Routeを削除・置換・Redirectせず、Current Draw/PXD/PiXiSYNC/Marketのデータへ書き込まない。

## Failure and attack tests

- flag OFF、Unknown flag、client-only ON、Server deny、tenant/resource/action mismatch
- 隔離Routeの直接URL、旧URL、現行Routeの表示・遷移・Redirect非侵入
- denied/offline/loading/empty/error/unavailableを偽の成功表示にしないこと
- Browserからのfake proof、localStorage flag、DOM role、URL queryによる権限昇格
- Lazy Tool chunkがOFF/Denied時に取得されないこと、初期Bundleへ大型Toolが混入しないこと
- Icon-only controlのkeyboard/focus/touch/screen-reader name、shortcutの入力欄・Modal競合
- 主要viewportでpage scrollWidth/scrollHeightがviewportを超えず、内部regionだけがscroll可能なこと
- Shell/Panel例外時もProject/Asset Canonical stateを変更しないこと

## Evidence

保存するものは、route/flag matrix、navigation map、viewport測定、initial/lazy request記録、accessibility結果、shortcut QA、privacy allowlist、current-route diff、独立レビュー結果。実機・本番・未接続Providerの結果はUNTESTEDと記録し、isolated referenceをProduction PASSへ昇格しない。

## Non-scope

現行Siteの改変、現行Draw/PXD/PiXiSYNCの置換、Market publish/checkout、Commerce/Rights/Ledger、SNS投稿、Production Auth/DB/RLS、Deploy、Migration、Publish、Commit、Push、次WPの自動開始。

## Stop

Stale Context、指定外書込み、Server authorityの曖昧さ、Page scrollによる必須UI欠落、既存Route/データへの影響、Privacy violation、未検証結果の過大表示が1つでもあれば停止する。完成後はCheckpointと独立レビューを記録し、`MARKET-410`へ自動移行せず待機する。

## Bounded write scope

- `pixiedraw2/src/platform/site-400/**`
- `pixiedraw2/tests/site-400/**`
- `pixiedraw2/benchmarks/site-400/**`
- `docs/contracts/SITE-400-*.md`
- `docs/inventory/site-400-*.json`
- `docs/decisions/ADR-*-SITE-400-*.md`
- Coordinator-owned Queue、Registry、State、Worklog、generated Context manifestは書き換えない。

## Handoff

`SITE400-SCOPE-001`、`SITE400-EVIDENCE-001`、`SITE400-STOP-001`を満たし、Acceptance evidence、Checkpoint、独立レビューが揃った場合だけ完了候補とする。`next_package: MARKET-410`、`auto_start_next: false`を維持する。
