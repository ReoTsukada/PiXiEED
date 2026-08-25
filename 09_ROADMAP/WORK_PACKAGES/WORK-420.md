# WORK-420 — Direct Work and Billing Compatibility

status: COMPLETE_CANDIDATE
phase: platform-site
kind: direct-work
depends_on: MARKET-410
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: SOCIAL-430
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

個人への直接依頼をDMと混同せず、Request→Quote→Agreement→Milestone→Delivery→Acceptance→Rights→Paymentの1つのAggregateとして接続する。各段のIdentity、Terms、権限、状態遷移を拘束し、別Request/Quote/Agreement/Paymentの差込みを構造上拒否する。

## Canonical inputs

- `02_ARCHITECTURE/DIRECT_WORK_AGGREGATE_INTEGRITY.md`
- `docs/contracts/WP-220-DIRECT-WORK-BILLING.md`、`docs/contracts/FP-002-DIRECT-WORK-AGGREGATE-INTEGRITY.md`
- `AuthorizationProofV1`、`CanonicalMoneyV1`、`ProviderEventIdentityV1`
- Project/Asset/Package/License Registryと既存Commission/Direct WorkのURL・権限境界

## User journeys

- 依頼者がrequestを送る → 対象、納期、成果物、権利範囲をbounded referenceとして提出する。
- Creatorがquoteを出す → server-derived terms snapshotを表示し、依頼者が明示承認する。
- Agreementを締結 → authorized partiesとacceptedTermsHashを固定する。
- Milestoneを進める → Delivery referenceを提出し、Acceptance前に支払い・権利付与を行わない。
- Acceptance後 → Rights/License decisionを明示し、Paymentは同じAggregateのCanonical eventからLedgerへ渡す。
- reject/revision → 履歴を消さず、旧Deliveryを保持して新しいrecovery Deliveryを作る。

## Server authority

ServerがRequest root、participants、Quote terms、Agreement、Milestone、Delivery、Acceptance、Rights、Payment、Ledgerを毎段再解決する。Clientは金額、Royalty、License、Acceptance、相手、Aggregate ID、Terms hashをauthorityとして指定できない。Direct Workは一般DM、Market Product、Notification deliveryと分離する。

## Durable event

各状態遷移はtransactional state + trusted event + Outboxで確定し、Payment/Provider callbackはInboxへ先に受け入れる。aggregateVersion順序、idempotency、lease fencing、retry/DLQ、replay-no-side-effectを適用する。通知失敗・Search遅延・Provider再送はAgreement/Acceptance/Rights/Ledgerを二重更新しない。

## Privacy and non-intrusion

依頼本文、個人連絡先、Payment detail、License、Royalty、LedgerをSearch、Notification、Telemetry、Auditの公開projectionへ流さない。EvidenceはrequestId、aggregateId、version、diagnostic code、hashなど最小参照だけにする。現行Commission、既存URL、DB、Storage、Provider、Production dataへ書き込まない。

## Failure and attack tests

- 別RequestのQuote、別QuoteのAgreement、別AgreementのMilestone、別DeliveryのAcceptance、別Rights/Payment/Ledger差込み
- parent IDだけ変更、Terms hashだけ変更、保存済みstale objectの再送、expired/revoked membership
- Request未提出のQuote、未承認QuoteのAgreement、Delivery前Acceptance、Acceptance前Rights/Payment
- caller指定額・currency・recipient・royalty・license、fake authorization/provider event
- duplicate/replay/out-of-order webhook、crash各境界、lease競合、DLQからの副作用Replay
- Delivery拒否後の履歴保持、recovery Delivery、同一Idempotency key再送
- private contentがSearch/Notification/Telemetryへ漏れないこと、Offline/Permission Deniedの偽成功防止

## Evidence

Aggregate identity graph、state machine、stale-chain攻撃結果、Terms/Authorization/Money fixture、durability/crash matrix、privacy redaction、baseline non-write、独立レビューを保存する。実Provider、Production Auth/RLS、実決済、実ユーザー・実依頼の結果はUNTESTEDとする。

## Non-scope

一般DM、Market Product/Checkout、実Provider接続、Payout、Production Ledger、現行Route/Commission置換、通知配送、公開SNS、Migration、Deploy、Publish、Commit、Push。

## Stop

Aggregate identityが曖昧、stale-chainが通る、Acceptance/Rights/Paymentがcaller値で決まる、二重Ledger、副作用Replay、依頼本文漏洩、既存データ変更のいずれかで停止する。`SOCIAL-430`は自動開始しない。

## Bounded write scope

- `pixiedraw2/src/platform/work-420/**`
- `pixiedraw2/tests/work-420/**`
- `pixiedraw2/benchmarks/work-420/**`
- `docs/contracts/WORK-420-*.md`
- `docs/inventory/work-420-*.json`
- `docs/decisions/ADR-*-WORK-420-*.md`
- Coordinator-owned Queue、Registry、State、Worklog、generated Context manifestは書き換えない。

## Handoff

`WORK420-SCOPE-001`、`WORK420-EVIDENCE-001`、`WORK420-STOP-001`を満たし、Checkpointと独立レビューを記録した場合だけ完了候補とする。`next_package: SOCIAL-430`、`auto_start_next: false`を維持する。
