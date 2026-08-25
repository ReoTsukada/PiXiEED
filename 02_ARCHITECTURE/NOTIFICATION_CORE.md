---
spec_id: ARCH-NOTIFICATION-CORE-001
title: PiXiEED Notification Core
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md
  - 02_ARCHITECTURE/SEARCH_INDEX_CORE.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# Notification Core

WP-097 defines a durable, permission-filtered notification projection. It is not a canonical
Event, Activity, Audit, Telemetry, Search document, finance/rights record, SNS record, or external
delivery provider.

## Projection boundary

```text
trusted Canonical Event
  → eligibility
  → server recipient resolution
  → preference and mandatory-policy evaluation
  → deduplication / rate limit / semantic grouping
  → Notification Record
  → independent Delivery Attempt / Adapter
```

Creation and delivery are separate operations. Notification creation does not send Push, Email,
SNS, Market, Commission, or payment messages. The reference implementation includes only an
in-memory backend and a synthetic IN_APP adapter; WEB_PUSH, MOBILE_PUSH, EMAIL, and DIGEST are
exchangeable adapter contracts without a production provider.

## Record contract

v1 `Notification Record` contains:

```text
notificationId / notificationVersion
recipientType / recipientId
notificationType
sourceEventId / sourceEventVersion
actorReference / objectReference / projectReference / resourceReference
visibilityClass / priority
presentationKey / presentationMetadata
groupingKey / deduplicationKey
deliveryPolicy
createdAt / readAt / archivedAt
schemaVersion
```

Notification ID and source Event ID are separate. IDs, references, metadata depth/bytes, cursors,
queues, batches, and retries are hard bounded. Raw Event payload, Project body, Blob, Pixel,
Audio, PXD, PiXiPackage, Game Build, Base64/Data URL, JWT, Secret, Email, PII, Commission body,
Purchase/Entitlement/Royalty body, and provider raw exceptions never enter the record or DLQ.

## v1 catalog and visibility

Core types are `ACCOUNT_STATE_CHANGED`, `SECURITY_ACTION_REQUIRED`, `PROJECT_INVITED`,
`PROJECT_MEMBER_CHANGED`, `PROJECT_ACCESS_CHANGED`, `PROJECT_MIGRATION_REQUIRES_REVIEW`,
`ASSET_REVIEW_AVAILABLE`, `ASSET_REFERENCE_BROKEN`, `ASSET_QUARANTINED`, `PACKAGE_READY`,
`PACKAGE_FAILED`, `PACKAGE_QUARANTINED`, `TOOL_OPERATION_REQUIRES_REVIEW`, and
`TOOL_COMPATIBILITY_WARNING`. Market, Commission, Social, Community, Moderation, and Subscription
names are reserved only; unknown and unsupported versions fail closed.

Visibility is separate from recipient scope: `PRIVATE`, `RECIPIENT_ONLY`, `PROJECT_MEMBERS`,
`CREATOR_PRIVATE`, and `PUBLIC_SAFE`. A private Project name can only be included in an authorized
in-app presentation. External delivery receives a sanitized presentation envelope and never a raw
private Project name.

Recipients are derived by the server Permission/Core adapter. A client cannot select an arbitrary
recipient. Every resolved recipient carries a server decision, and cross-user Inbox reads or
mutations fail closed.

## Preferences, Inbox, and read state

Preferences cover category, in-app/push/email/digest switches, muted Project/Resource/Actor IDs,
quiet-hours reference, locale, and timezone. Security/mandatory policy cannot be fully muted.
Marketing preference does not suppress service/security/purchase truth; Market and finance
domain behavior remains outside WP-097.

Inbox state is `UNREAD`, `READ`, or `ARCHIVED`. Mark Read/Unread, Mark All Read with a timestamp
watermark or stable cursor, Archive, and Restore are idempotent. Physical deletion is not assumed.
Queries are server-scoped, use stable cursors, bounded page size, and support unread/type/priority/
Project/created-range filters.

## Deduplication, grouping, priority, and rate limits

The same source Event for the same recipient and type produces at most one Notification. Delivery
deduplication is per Notification and channel. Non-critical types may group within an injected
clock window using the same actor/object/Project/type grouping key. Critical/security/future
finance/Commission types are never silently grouped.

Priority is server policy (`LOW`, `NORMAL`, `HIGH`, `CRITICAL`) and cannot be spoofed by a client.
Rate limiting is evaluated by recipient/type/actor/resource. Results are typed as suppress, delay,
or group; CRITICAL requires an explicit delay policy and is never silently dropped.

## Delivery, retry, and quiet hours

Channels are `IN_APP`, `WEB_PUSH`, `MOBILE_PUSH`, `EMAIL`, and `DIGEST`. A Delivery Attempt contains
the Attempt ID, Notification ID, Channel, optional safe Provider Reference, State, Attempt Number,
Retryable flag, canonical Diagnostic Code, and timestamps. States are `PENDING`, `SENT`, `DELIVERED`,
`FAILED`, `SUPPRESSED`, and `CANCELLED`.

External delivery is delayed during quiet hours through an adapter/scheduler boundary; no timer is
used in Core. Delivery failure never deletes a Notification or rolls back canonical state. Retries
are bounded and exhausted attempts enter a metadata-only DLQ. Cancellation is allowed only before
delivery; a delivered attempt is not falsely revoked.

Replay reprojects Notification records only and reports zero external sends/resends. Event Outbox
rows are not deleted or moved into the Notification store.

## Flags and rollback

All flags are default-off:

```text
notification-core-read
notification-core-write
notification-event-projection
notification-external-delivery
notification-digest
notification-legacy-adapter
```

Unknown flags, disabled flags, and Kill Switch decisions fail closed. Current routes and current
notification behavior remain the fallback. No legacy notification deletion or production adapter
is part of WP-097.

## Performance and privacy

No provider SDK, email library, large locale bundle, unbounded in-memory queue, timer, network, or
Editor Main Thread dependency is loaded. Queue, batch, metadata, cursor, recipient, retry, and
delivery work are bounded. Notification is not indexed by Search and does not subscribe directly
to high-frequency PiXiSYNC/editor operations.

## Implementation

- `core-shell/assets/core-notification-contracts.js`
- `core-shell/schemas/notification-v1.schema.json`
- `core-shell/fixtures/notification-v1.valid.json`
- `scripts/test-core-notification-wp097.mjs`

The module is unloaded from current routes and contains no DOM, Canvas, browser storage, network,
Supabase, Market, SNS, Commission, finance, or production notification-provider dependency.
