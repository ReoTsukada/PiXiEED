# MARKET-410 — Market / Rights / Commerce Compatibility

status: COMPLETE_CANDIDATE
phase: platform-site
kind: market
depends_on: SITE-400
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: WORK-420
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

素材または完成系だけをProductとして扱い、Product→Checkout→Purchase→Entitlement→License→Ledgerの参照・権利境界を接続する。既存Product、購入権、License、Royalty、Market URLを変更せず、callerが金額・通貨・受取人・料率・Ledgerを指定できない構造を証明する。

## Canonical inputs

- `docs/contracts/WP-210-MARKET-RIGHTS-COMMERCE.md`
- `02_ARCHITECTURE/FINANCIAL_INTEGRITY_CORE.md`、Package/Asset Registry
- `FP-003`の`CanonicalMoneyV1`、`ContributorSnapshotV1`、`ProductFingerprintV1`
- Product/Package/License/Entitlementの既存互換Adapterと現行Market baseline

## User journeys

- MaterialまたはCompleted Workを選ぶ → locked Product/Package Revisionを表示する。
- ProductをCheckoutへ進める → server-derived quote、currency、fee schedule、license snapshotを確認する。
- Paid confirmationを受ける → Purchase、Entitlement、Licenseを因果順に作成し、Ledgerはcanonical eventから導出する。
- Collaborative Workから各Contributorが別Productを作る → Product Leadは販売管理者に限定し、locked contributor snapshot全員へ控除後均等配分する。
- 完全一致するProductFingerprintは拒否し、Game全部入り、OST、素材集、編集可能Packageなど構成が異なるProductは許可する。
- 非対応形式、未購入、期限切れ、権利不一致はUnavailable/Permission Deniedとして表示し、起動可能に見せない。

## Server authority

ServerがProduct/Package Revision、Price、Currency、Fee Schedule、Contributor Snapshot、License、Provider Event、Entitlement、Ledgerを再解決する。callerの`amountMinor`、currency、recipient、royalty rate、entry type、Product Lead変更はヒントとしても信頼しない。AuthorizationProofとProviderEventIdentityが一致しない入力はfail closedする。

## Durable event

Payment/Provider callbackはdurable Inboxでidentityとpayload hashを検証し、同じTransaction境界でCanonical Purchase/Entitlement/Licenceの状態とOutbox参照を確定する。Duplicateはno-op、fingerprint conflictはquarantine、out-of-orderはholdとし、ReplayでCharge、Entitlement、License、Ledgerを再作成しない。

## Privacy and non-intrusion

Event/Telemetry/EvidenceへJWT、Email、Payment detail、Commission本文、Project本文、購入ファイル、raw Blobを入れない。Productはlocked reference、hash、license snapshot、dependency lockで表現する。Production Checkout、Stripe、DB/RLS、Storage、Migration、Publishは接続しない。

## Failure and attack tests

- caller指定金額・通貨・受取人・料率・entry type・directionを拒否
- 別Product/Package/Revision/License/Contributorのcross-record差替えを拒否
- Purchase前のEntitlement、未払のLicense、Payment成功だけのRights付与を拒否
- duplicate Provider Event、same id/different payload、wrong tenant/account/environment、missing identity
- Product Leadが自分だけ100%にする、Contributor削除、部分ProductでContributorを減らす操作を拒否
- 控除後均等分配、minor unit余り、currency mismatch、過去SaleへのContributor追加を決定論的に検証
- duplicate ProductFingerprintを拒否し、異なるincluded Revision setは許可
- flag OFF、Unknown、Permission Denied、Offline、Provider failure、Rollbackを確認

## Evidence

Product→Checkout→Purchase→Entitlement→License→Ledgerの因果図、Money/Allocation fixture、fingerprint、provider identity、idempotency、権利境界、既存Market baseline、storage non-write、独立レビューを保存する。実Provider、実決済、実購入者データ、Production RLSはUNTESTEDのまま残す。

## Non-scope

現行Market UI/URLの置換、Productの本番公開、Checkout Provider接続、Payout、Refund実行、Production Ledger/Royalty変更、広告、SNS投稿、Direct Work、Migration、Deploy、Publish、Commit、Push。

## Stop

caller financial authority、cross-record rights、duplicate ledger、privacy漏洩、既存Product/Entitlement/Licenseへの書込み、未検証決済のPASS化があれば停止する。完了後も`WORK-420`を自動開始しない。

## Bounded write scope

- `pixiedraw2/src/platform/market-410/**`
- `pixiedraw2/tests/market-410/**`
- `pixiedraw2/benchmarks/market-410/**`
- `docs/contracts/MARKET-410-*.md`
- `docs/inventory/market-410-*.json`
- `docs/decisions/ADR-*-MARKET-410-*.md`
- Coordinator-owned Queue、Registry、State、Worklog、generated Context manifestは書き換えない。

## Handoff

`MARKET410-SCOPE-001`、`MARKET410-EVIDENCE-001`、`MARKET410-STOP-001`の具体的証拠と独立レビューを揃え、隔離範囲の`COMPLETE_CANDIDATE`へ到達した。`next_package: WORK-420`、`auto_start_next: false`を維持する。
