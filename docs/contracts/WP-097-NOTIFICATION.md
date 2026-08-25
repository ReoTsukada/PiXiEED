# WP-097 Notification Core

## Status

2026-08-07に隔離Pure Coreとして実装・検証済み。WP-000〜WP-096を再実行せず、現行Route、
PiXiEEDraw、PXD、PiXiSYNC、Market、SNS、Project/Asset/Package、購入権、License、Royalty、
本番Database/Storageへ接続していない。

## Contract

- NotificationはWP-095のTrusted Eventから作るRecipient-scoped Durable Projectionであり、Event、Activity、Audit、Telemetry、Searchとは別責任。
- v1は14 Core Notification Typeと11 Reserved Future Typeを持つ。未知Type／VersionはFail-Closed。
- Server Permission/Coreから受信者を解決し、Client-selected recipient、Cross-user Inbox、Visibility Broadeningを拒否。
- PRIVATE／RECIPIENT_ONLY／PROJECT_MEMBERS／CREATOR_PRIVATE／PUBLIC_SAFEをRecipientと分離。
- Priority、Presentation Key、Mandatory PolicyはServer Catalogで固定し、Client Spoofを拒否。
- Preference、Mute、Mandatory Security、Quiet Hours、Locale/Timezone、IN_APP／External Deliveryを分離。
- Same Event→same Recipient/Typeの重複を抑え、非CriticalのみActor/Object/Project/Type/WindowでSemantic Grouping。
- InboxはUNREAD／READ／ARCHIVED、Stable Cursor、Bounded Page、Mark Read/Unread/All Read/Archive/Restoreを提供。
- Delivery Attempt、Bounded Retry、Retryable/Non-retryable、DLQ、Cancellation、Replay no resendを独立管理。
- Provider raw exception、JWT、Secret、Email、PII、Project本文、Commission本文、Finance/Rights本文、Media Blobを保存・送信しない。

## Event eligibility

`PROJECT_MEMBER_CHANGED`の招待、Project/Asset/Package/Toolの認可済みレビューや状態変化、
Account/Security状態のみをv1 signalとして扱う。Market Sale/Purchase/Refund、Commission、
Social、Community、Moderation、Subscriptionは予約Catalogに留まり、各ドメインの正本や
通知生成は後続Work Packageで定義する。Finance/RightsのState CommitをNotificationが代替しない。

## Verification

`scripts/test-core-notification-wp097.mjs` は次を確認する。

- 招待、Private recipient、Security mandatory、Asset/Package/Tool typed events
- Duplicate Event／Notification／Delivery Attempt、Semantic Grouping、Rate Limit
- Preference suppression、Mandatory Security non-suppression、Quiet Hours delay
- Stable cursor、Permission-scoped Inbox、idempotent read/archive/restore
- Delivery success、retry、non-retry、bounded DLQ、cancel-before-delivery、delivered-not-revoked
- Replay external resend 0、provider payload sanitization、no Search/SNS/Market side effect
- Unknown Type/Version、high-frequency PiXiSYNC rejection、raw/PII/Blob/JWT/secret rejection
- Invalid recipient/visibility/presentation/priority/channel, queue and flag failures

40 failure fixtures pass. WP-000 baseline failure identity is 14/14 inherited match, new 0.
