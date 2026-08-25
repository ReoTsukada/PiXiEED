# PLATFORM-450 — Platform Completion and Rollback Integration

status: IN_PROGRESS
phase: platform-site
kind: gate
depends_on: OPS-440
implementation_model: Luna Fast
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol read-only canonical integration
independent_review: true
next_package: NATIVE-500
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Site、Registry、Tool Bridge、Search、Notification、Market、Direct Work、Social、Opsを、共通のAuthorization、Feature Flag、Durable Event、Rollback、Compatibility Adapterで横断接続する。各Coreが個別にPASSでも、横断Compositionで権限昇格・二重処理・private data漏洩・既存経路侵入がないことを証明する。

## Canonical inputs

- SITE-400、MARKET-410、WORK-420、SOCIAL-430、OPS-440の確定Contract
- AuthorizationProofV1、CanonicalMoneyV1、ProviderEventIdentityV1、DurableEventEnvelopeV1
- Project/Asset/Package Registry、Search/Notification/Routing、FP-003/FP-004の境界
- `EXISTING_PLATFORM_PRESERVATION.md`、Kill Switch、Rollback Artifact、Baseline identity

## User journeys

- Draw2/Audio/Game → Asset Revision → LIVE Preview → Package → Build → Runtimeの参照連携を確認する。
- Product → Checkout → Purchase → Entitlement → License → Ledgerの因果連携を、実決済なしのisolated fixtureで確認する。
- Direct WorkのRequest → Quote → Agreement → Delivery → Acceptance → Rights → Paymentを、Market/Social通知から分離して確認する。
- Public Work → Card → Social Share → Search → Notification → Moderationで、explicit publicationとvisibility revokeを確認する。
- Admin/Analytics/AdsのprojectionがStudio/Checkout/Entitlement/Commissionを汚染しないことを確認する。

## Server authority

各CompositionのrootでAuthenticated Server Context、Tenant、Resource、Action、Capability、Policy、Current Revision、Provider identityを再解決する。Core間でBoolean trust、client object、Search document、Notification record、UI flagをauthorityとして受け渡さない。Unknown/OFF/Deniedはfail closedする。

## Durable event

横断フローはCommand→Validation→Authorization→State Commit→Trusted Event→Outbox→Consumer Inboxの順を守る。Consumerごとにidempotency、aggregate ordering、gap、retry/DLQ、lease fencing、replay-no-side-effectを測定し、Search/Notification/Analytics失敗がCanonical Commerce/Work/Project stateを成功扱いにしないことを確認する。

## Privacy and non-intrusion

Event/Activity/Search/Notification/Telemetry/Auditはbounded referencesだけを扱う。JWT、Email、Secret、private Project/Commission/DM本文、Payment detail、Purchase file、License/Royalty/Ledger detail、raw Pixel/Audio/Buildを横断payloadへ混ぜない。Current Route、Draw、PXD、PiXiSYNC、Market、既存Project/Asset/Purchase dataに変更を加えない。

## Failure and attack tests

- cross-core fake AuthorizationProof、tenant/resource/action/capability mismatch、Provider substitution
- duplicate/replay/out-of-order/gap/crash/lease conflictを全cross-system pathで検証
- stale Asset/Package/License/Contributor/Payment/Entitlementを別Aggregateへ差し込めないこと
- Search/Notification/Social/Analytics projectionからprivate dataを再構成できないこと
- flag OFF/Unknown/Kill Switchで未許可Route/Chunk/Consumer/Providerが起動しないこと
- Rollback途中のaccepted record、Outbox、Inbox、Ledger、Entitlementが壊れず、二重補償されないこと
- current route/URL baseline、PXD/PiXiSYNC/Market smoke baselineが悪化しないこと
- 1280×900、768×1024、390×844でpage scrollを起こさず、主要UIを画面内に収めること

## Evidence

cross-system sequence、authority lineage、event/idempotency matrix、privacy scan、flag/rollback drill、current-system baseline、route/Bundle trace、failure injection、independent reviewを保存する。Production DB/RLS/Provider、実機、Store、Deploy、Cloud Build、Production performanceは実測前のままUNTESTEDとする。

## Non-scope

Production cutover、Route replacement/redirect、Migration、Deploy、Publish、Store submission、現行データ変更、実決済、Payout、Provider write、Commit、Push、NATIVE-500以降の自動開始。

## Stop

Cross-core authorityの不一致、durable eventの二重副作用、private data漏洩、rollback不能、既存baseline悪化、Production到達可能性、未検証事項のPASS化があれば停止する。Platform gateは修正の隠し場所ではなく、証拠に基づく判定点として扱う。

## Bounded write scope

- `pixiedraw2/src/platform/platform-450/**`
- `pixiedraw2/tests/platform-450/**`
- `pixiedraw2/benchmarks/platform-450/**`
- `docs/contracts/PLATFORM-450-*.md`
- `docs/inventory/platform-450-*.json`
- `docs/decisions/ADR-*-PLATFORM-450-*.md`
- Coordinator-owned Queue、Registry、State、Worklog、generated Context manifestは書き換えない。

## Handoff

`PLATFORM450-SCOPE-001`、`PLATFORM450-EVIDENCE-001`、`PLATFORM450-STOP-001`を満たし、Checkpoint・独立レビュー・baseline identityを記録した場合だけ完了候補とする。`next_package: NATIVE-500`、`auto_start_next: false`を維持し、外部監査を待つ。
