---
spec_id: ARCH-EVENT-ACTIVITY-CORE-001
title: PiXiEED Canonical Event and Activity Core
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/ASSET_REGISTRY_CORE.md
  - 02_ARCHITECTURE/PACKAGE_REGISTRY_CORE.md
  - 02_ARCHITECTURE/TOOL_BRIDGE_CORE.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# Event and Activity Core

WP-095は、Coreで確定した状態変化を小さな参照Eventとして疎結合に配信する。Market、SNS、
Notification、Search、Finance本体は実装せず、将来Consumerが安全に接続できる境界だけを定義する。

## FactとCommand

Eventは確定した事実だけを表す。`Command → Validation → Authorization → State Commit → Trusted
Event`の順序を守り、Request/Commandを確定Eventとして先に配信しない。State更新とOutbox追加は
同じTransactional Adapter呼び出しで扱い、State成功後のEvent消失を防ぐ。

## Canonical Envelope

```text
eventId / eventType / eventVersion / occurredAt
producer / aggregateType / aggregateId / aggregateVersion
actorRef / correlationId / causationId
projectId? / assetId? / packageId?
visibilityClass / payload / schemaVersion
causationDepth / causationChain
```

Clock、ID、Producer Trust、Transaction、Publisher、Backoff、Visibilityは注入Adapterとする。
Event Payloadは参照と小さなReason/Stateだけで、最大32 KiB、深さ6、Bounded Array/Objectに制限する。
Raw Pixel/Audio/PXD/PiXiPackage/Game Build、Blob、Base64/Data URL、JWT、Secret、PII、Payment、
Commission本文、Project本文、Royalty Ledger、巨大JSONを禁止する。

## CatalogとVersion

Account/Permission、Project、Asset、Tool Bridge、Packageの27 Event Typeをv1 Catalogへ登録する。
`eventType`と`eventVersion`は分離し、既存Versionの意味を変更しない。未知Type、Unsupported
Version、High-frequency Editor Operationはfail closedする。新しいMarket/SNS/Commission/
Subscription EventはCatalog追加Versionまたは新Typeとして登録し、ProducerへConsumer固有処理を入れない。

## Trusted Producer

Event CoreはServer-trusted Producer Registryを通過したProducerだけを受け入れる。Clientが任意の
Event Type、Producer、Aggregateを名乗ることはできない。Current Project/Asset/Package/Tool Bridge
はそれぞれAdapter Producerとして登録し、JWT詳細やClient ClaimsはEventへ流さない。

## Transactional Outbox

```text
State Commit Transaction
├─ State Update
└─ Outbox Row(Event reference)
COMMIT
↓
Outbox Dispatcher
↓
Consumer / Activity / Projection
```

Pure CoreはIn-memory OutboxとSynthetic Transaction Adapterでこの境界を証明する。Dispatcher OFF
でも確定済みOutboxを削除しない。DeliveryはAt-least-onceを前提とし、ConsumerごとのEvent ID
Idempotency LedgerでDuplicateを無害化する。

## OrderingとCausation

Global Total Orderは作らず、`aggregateId + aggregateVersion`単位で順序を検証する。古いEventは
状態を巻き戻さず、欠落VersionはGapとして保持・報告する。CorrelationはWorkflow全体、Causationは
直接原因を表し、Unknown Cause、Cycle、最大16段を超えるDepthを拒否する。

## Retry、Dead Letter、Replay

Publisher/ConsumerはRetryable、Non-retryable、Poisonを区別し、Backoffと最大試行回数をAdapterへ
委譲する。無限Retryは禁止し、Dead Letterへ移す際もPrivate Payloadを複製しない。ReplayはProjection
再構築専用で、Email、Notification、Payment、Webhook、その他外部Side Effectを実行しない。

## Activity、Visibility、責任分離

Canonical Eventと人間向けActivityを分離する。Activityは`presentationKey`と小さなMetadataを
保持し、表示文をEventへ固定しない。Event Visibilityを広げるProjectionは禁止し、Private Project
からPublic Activityを生成できない。SNS Postは明示的なShare Commandが必要で、自動生成しない。

Event、Audit、Activity、Telemetryは別配列・別責任とする。Package READYはMarket Publish候補に
なり得るだけで、Product/Price/License/Purchase/Royalty/Payoutを自動作成しない。

## PerformanceとStorage

Pointer Move、Brush Sample、Pixel、Tile Mutation、Audio Sample、Animation Tick、PiXiSYNC Operation
はEvent Coreへ流さない。Batch、Bounded Queue、Backpressure、Payload Limit、Unbounded History禁止を
契約化する。Event CoreはEditor Canvasの再描画経路や高頻度入力経路に接続しない。

## Flags

すべて初期OFFとする。

`event-core-read`, `event-core-write`, `event-outbox-dispatch`, `activity-projection`,
`event-replay`, `event-legacy-adapter`

OFF/Kill Switch時はLegacy/current pathを停止せず、Outboxと既存データを保持する。

## Implementation

- `core-shell/assets/core-event-activity-contracts.js`
- `core-shell/schemas/event-activity-v1.schema.json`
- `core-shell/fixtures/event-activity-v1.valid.json`
- `scripts/test-core-event-activity-wp095.mjs`
