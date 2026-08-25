# SOCIAL-430 — Social / Community / Creator Integration

status: COMPLETE_CANDIDATE
completion_state: isolated_reference_complete_not_production_qualified
production_semantic_qualification: PENDING_UNTESTED
phase: platform-site
kind: social
depends_on: WORK-420
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: OPS-440
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

投稿可能コンテンツを明示的に定義し、Post、Comment、Creator、Project、My Page、Market Cardを検索・通知・Moderationと安全に接続する。Share、Post、Message、Market shareを混同せず、Private Project・Direct Work・Payment・Rightsを公開Socialへ流さない。

## Canonical inputs

- `docs/contracts/WP-230-SNS-COMMUNITY-CREATOR.md`、`docs/contracts/WP-230-CONTENT-FINALIZATION.md`
- Event/Activity、Search、Notification、Public URL Routing、AuthorizationProofの契約
- Project/Asset/Package/Market Cardのvisibility、moderation、lifecycle状態
- 現行SNS/Community/Creator URLとcontent inventory

## User journeys

- Creatorが明示的にPost/Shareを選ぶ → content type、source reference、visibility、license/provenanceを確認する。
- Public WorkをCardとして公開 → serverがcurrent visibility/moderationを再確認し、Search/Notificationへbounded eventを投影する。
- Comment/Messageを送る → Post/Threadのscopeを越えず、Agreement、Delivery、Acceptance、Payment、Rightsを変更しない。
- Market Cardを共有 → locked Product/Package referenceと既存URL candidateだけを共有し、Product/Purchase/Entitlementを作成しない。
- Private/Unlisted/Moderation pending/Deleted/Blocked → CONTENT_UNAVAILABLEまたはPermission Deniedを表示し、古い本文やURLを復活させない。

## Server authority

Serverがproducer proof、recipient、visibility、lifecycle、moderation、membership、mention、Search eligibilityを再解決する。Clientの`trustedProducer`、role、visibility、isPublic、recipient、DOM表示はauthorityではない。投稿はexplicit commandのみで、Asset変更やMarket publishから暗黙作成しない。

## Durable event

Canonical Post/Comment/Share事実はstate commit後にtrusted Event/Outboxとして作成し、Search/Notification/Moderationは独立Consumer Inboxでidempotentに処理する。Duplicate、stale、replay、visibility revokeを吸収し、Replayで再投稿・再通知・再公開しない。

## Privacy and non-intrusion

Private Project、Direct Work本文、DM、Phone、Email、JWT、Payment、Entitlement、License、Royalty、Ledger、raw mediaをSocial/Search/Notification/Telemetryへ流さない。Audit/Telemetryはbounded ID、event、state、diagnosticのみ。既存SNS、Market、PiXiSYNC、URL、Production dataは変更しない。

## Failure and attack tests

- 明示Postなしの自動公開、private/unlisted Projectの共有、期限切れ/削除済みCardの復活を拒否
- fake producer/recipient proof、cross-tenant post/comment、別Projectのsource差替え、moderation bypass
- Search/NotificationのEvent duplicate、stale version、visibility revoke、replay side effect
- CommentをAgreement/Delivery/Acceptance/Payment/Rightsへ変換する越権経路を拒否
- Market Card shareからProduct/Purchase/Entitlement/License/Ledger mutationが起きないこと
- blocked user、permission denied、offline、empty、loading、errorを検証
- 投稿本文・DM・Payment・LicenseがTelemetry/Audit/Indexへ漏れないこと

## Evidence

content matrix（投稿可/不可）、visibility state machine、producer/recipient proof、URL/reference、Search/Notification projection、moderation boundary、privacy redaction、existing-route diff、独立レビューを保存する。実SNS provider、実Moderation、実Search、Production RLSはUNTESTEDとする。

## Non-scope

現行SNS/Communityの置換、自由なDMによるDirect Work化、Market publish/sale、Checkout、Purchase、Rights/Ledger、広告配信、Production moderation、Migration、Deploy、Publish、Commit、Push。

## Stop

explicit content boundary不明、private content漏洩、caller trust、stale eventによる再公開、Market/Direct Work/Paymentへの越権、既存データ変更があれば停止する。`OPS-440`は自動開始しない。

## Bounded write scope

- `pixiedraw2/src/platform/social-430/**`
- `pixiedraw2/tests/social-430/**`
- `pixiedraw2/benchmarks/social-430/**`
- `docs/contracts/SOCIAL-430-*.md`
- `docs/inventory/social-430-*.json`
- `docs/decisions/ADR-*-SOCIAL-430-*.md`
- Coordinator-owned Queue、Registry、State、Worklog、generated Context manifestは書き換えない。

## Handoff

`SOCIAL430-SCOPE-001`、`SOCIAL430-EVIDENCE-001`、`SOCIAL430-STOP-001`は、既存Evidenceの3 Acceptance
rows PASS、Evidence validator valid、Terra structural review PASS、Baseline identity再利用で満たす。
これはproduction-qualifiedを意味しない。Production semantic qualificationはPENDING/UNTESTEDのまま保持する。
CoordinatorはSOCIAL-430を`COMPLETE_CANDIDATE`として閉じ、明示されたユーザー指示「進めてください」を
OPS-440開始承認として記録する。`next_package: OPS-440`、`auto_start_next: false`を維持し、PLATFORM-450は自動開始しない。
