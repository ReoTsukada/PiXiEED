# WP-095 Event and Activity Core

## Status

2026-08-07に隔離Pure Coreとして実装・検証済み。WP-000〜WP-094の既存実装を再実行せず、
現行Route、PiXiEEDraw、PXD、PiXiSYNC、Market、SNS、Project、Asset、Package、商品、購入権、
License、Royalty、本番Database/Storageへ接続していない。

## Contract

- EventはState Commit後のTrusted Factだけであり、Command/Requestではない。
- 27 Event TypeのCanonical Catalog、Event Version、Trusted Producer Registryを持つ。
- EnvelopeはTyped ID、Aggregate Version、Correlation/Causation、Visibility、Bounded Payloadだけを扱う。
- Payloadは最大32 KiB、深さ6。Raw Blob、Pixel/Audio/PXD/Package/Game Build、Base64/Data URL、
  JWT、Secret、PII、Payment、Commission本文、Project本文、Royalty Ledgerを拒否する。
- Transactional OutboxのState+Outbox境界、At-least-once、Consumer Idempotency、Ordering/Gapを持つ。
- Causation Unknown/Cycle/Depth、Unknown Type/Version、Client Producer Spoofをfail closedする。
- Retry/Backoff、Poison、Dead Letter、Replay without Side Effectを注入Adapterで表現する。
- ActivityはEventからの人間向けProjectionで、presentationKey、Visibility、Object Referenceだけを持つ。
- Private ActivityをPublicへ拡張せず、SNS Post、Market Publish、Finance Ledgerを自動生成しない。

## Fixtures

- Draw revision → Asset Revision/Head → Game Preview Consumer
- Audio revision → Game Audio Consumer
- Project Private Activity and Public Visibility Denial
- Package READY → Activity Candidate without Market Product creation
- Duplicate Delivery、Out-of-order、Gap、Replay、Retry、Poison、Dead Letter
- Feature Flag OFF、Dispatcher OFF、Activity OFF、Kill Switch、PiXiSYNC high-frequency rejection

## Verification

- `node scripts/test-core-event-activity-wp095.mjs` — 27 Catalog entries、7 Producer Types、6 flags、
  Envelope/Privacy、Outbox、Idempotency、Ordering/Gap、Causation、Activity、Replay、Retry/DLQを通過。
- Financial Ledger、SNS、Search、Notification、Market本体は未実装・未接続。
- Current Route、Draw、PXD、PiXiSYNC、Market、SNS、既存Dataは変更なし。
