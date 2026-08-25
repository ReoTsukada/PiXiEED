# FP-004 Conformance Matrix

Status: `ISOLATED_REFERENCE_COMPLETE / INDEPENDENT_REVIEW_PASS`
Package: `FP-004`
Contract: [`FP-004-DURABLE-EVENT.md`](FP-004-DURABLE-EVENT.md)
Scope: isolated Core durability only

この表は、FP-004のAcceptance IDを実装・攻撃系テスト・証跡へ結び付けるための監査表です。Terra正式監査は29/29（baseline 14/14、新規0）、全7 Acceptanceが`PASS_ISOLATED_REFERENCE`、P0/P1は0件でした。production-equivalent adapter、実Provider、実DB/Queue/RLS、BrowserからのComposition Root到達不能性、power-loss durability、cross-process concurrencyは未検証です。合成ベンチマークの測定値は、本番SLOのPASSを意味しません。

## Acceptance mapping

| Acceptance ID | Required implementation | Required tests / failure injection | Required evidence | Current status |
|---|---|---|---|---|
| `FP004-EVT-001` | State、canonical Event、Outbox、idempotency resultを1つの耐久TransactionでcommitするAdapter。commit前後の再試行を同じcanonical resultへ結び付ける | 同一command並行投入、transaction開始前、state write後、Event/Outbox write後、commit後response前のCrash。partial recordがないこと、retryが二重mutationを作らないこと | Transaction test 10件、File Durable test 5件、transaction benchmark | `PASS_ISOLATED_REFERENCE` |
| `FP004-EVT-002` | Provider identity `(providerName, providerEventId)`、payload hash、schema、tenant/resource bindingをCore側で検証し、malformed successを拒否する | 同一identity+同一hash duplicate、同一identity+別hash/tenant/type conflict、missing/forged identity、`{ok:true}`のみ、unknown schema、result/tenant/hash不一致 | Transaction/Inbox tests、conflict quarantine、error-code assertions | `PASS_ISOLATED_REFERENCE` |
| `FP004-INBOX-001` | Durable Inbox acceptance、restart recovery、lease owner/fencing token、ack/completion state、consumer idempotency | duplicate delivery、2 worker concurrent consume、lease expiry、stale fencing token、ack前Crash、restart後state復元 | Inbox/Outbox/lease test 4件 | `PASS_ISOLATED_REFERENCE` |
| `FP004-ORDER-001` | Aggregate headとgap recordをtenant/aggregate単位で耐久保持し、expected next / stale / gap / same-version conflictをfail-closedで処理する | lower version、higher version gap、same-version different identity、gap recovery、cross-tenant collision、projection skip attempt | Transaction ordering/gap assertions | `PASS_ISOLATED_REFERENCE` |
| `FP004-RECOVERY-001` | Bounded exponential retry、poison/non-retryable DLQ、lease reclaim、independent consumer retry state、crash recovery | retryable failure、poison、non-retryable、DLQ transition中断、Outbox lease expiry、consumer mutation後ack前Crash、provider call後local completion前Crash | Transaction/File Durable/Inbox/Replay tests | `PASS_ISOLATED_REFERENCE` |
| `FP004-REPLAY-001` | `replayRunId`、consumer scope、`sideEffectMode=NONE`を必須にしたprojection-only replay | Finance/Notification/Search replay。email/push/provider/charge/refund/payout/royalty/entitlement/listing/social/canonical-state mutation spyが0 | Replay consumer 6件、cross-module integration test | `PASS_ISOLATED_REFERENCE` |
| `FP004-SEC-001` | commit直前・consumer/provider side-effect直前のAuthorizationProof再検証、tenant/resource binding、bounded privacy-safe records | revoked membership、stale proof、cross-tenant/resource、cyclic/oversized/private envelope、JWT/cookie/email/secret/raw media injection、production endpoint assertion | Transaction/Inbox/Replay security attack tests、no-production evidence、File Adapter root-containment・symlink・rename-failure recovery | `PASS_ISOLATED_REFERENCE` |

## Shared test and evidence rules

実装側で最低限、以下のDeno直接実行を行い、各結果に終了コード、fixture ID、source/build identity、実行時刻、環境、出力参照、baseline failure identityを添付します。

```text
deno check --no-remote <FP-004 implementation and tests>
deno test --no-remote --check <FP-004 tests>
deno run --no-remote --check pixiedraw2/benchmarks/fp004-durable-event-benchmark.ts
Terra formal audit: 29/29 (baseline 14/14, new 0; Acceptance 7/7; P0/P1 0)
```

必要な失敗注入は次の集合です。

```text
TX-BEFORE-BEGIN
TX-AFTER-STATE-BEFORE-EVENT
TX-AFTER-EVENT-BEFORE-COMMIT
TX-AFTER-COMMIT-BEFORE-RESPONSE
OUTBOX-LEASE-BEFORE-CONSUMER
CONSUMER-AFTER-MUTATION-BEFORE-ACK
PROVIDER-AFTER-CALL-BEFORE-COMPLETE
REPLAY-DURING-PROJECTION
DLQ-DURING-TRANSITION
AUTH-REVOKED-BEFORE-MUTATION
PROVIDER-ID-CONFLICT
MALFORMED-SUCCESS
AGGREGATE-GAP
```

合成ベンチマークは1/10/100/1000 synthetic eventについて transaction、lease、retry、replayの壁時計時間を計測します。これはアルゴリズムの局所的な測定であり、provider、DB、queue、ブラウザ、GPU、ネットワーク、production-equivalent transaction、production SLOの証明ではありません。

## No-production claims

- Current PiXiEEDraw、Market、PiXiSYNC、公開Route、PXD、Project、Asset、Purchase、Entitlement、License、Royalty、Ledger、Production DB/Storageは変更していません。
- Production credentials、JWT、cookie、private user content、real payment/provider eventは読み取り・生成・送信していません。
- Migration、Deploy、Publish、Cutover、Commit、Pushはこの証跡作成の権限範囲外です。
- `WP-095`のin-memory OutboxはDurable evidenceとして数えません。
- Browser/device/staging/provider/RLS/real database/long-sessionの証拠は未実施です。

## Completion gate

Terra正式監査で29/29（baseline 14/14、新規0）、全7 Acceptanceの`PASS_ISOLATED_REFERENCE`、P0/P1=0を確認したため、FP-004は`ISOLATED_REFERENCE_COMPLETE / INDEPENDENT_REVIEW_PASS`です。power-loss durability、実DB/Queue/Provider、production-equivalent adapter、cross-process concurrency等は`UNTESTED`のままであり、FP-005は自動開始しません。
