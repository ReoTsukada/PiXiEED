# ADR-20260807-WP097 — Isolated Notification Core

- Status: Accepted for WP-097
- Date: 2026-08-07
- Scope: Notification Record, Event Projection, Recipient/Visibility, Preferences, Inbox, Read State,
  Deduplication, Grouping, Rate Limit, Delivery Attempt, Retry/DLQ, Quiet Hours, Replay, and Flags

## Decision

Implement `core-notification-contracts.js` as an unloaded, framework-free, server-boundary-aware
reference Core. It consumes only a WP-095-validated and server-trusted Event, resolves recipients
through an injected Permission/Core adapter, persists only bounded Notification/Delivery references
through a replaceable backend, and never calls an external provider by itself.

## Rationale

Notification must survive a UI/Shell replacement and cannot become a second Event log, Search index,
financial ledger, entitlement source, or SNS activity stream. Separating creation from delivery lets
in-app records remain durable while Push/Email providers, quiet-hour scheduling, and future domain
adapters are reviewed independently. Server-injected clock, IDs, flags, permission, preferences,
rate limits, backend, and channel adapters keep the contract deterministic and testable.

## Rules recorded

1. Event eligibility is catalog-driven. Unknown Event Type/Version, high-frequency editor/PiXiSYNC
   operations, untrusted producers, and invalid payloads fail closed.
2. Recipient IDs never come from a client-selected field. The injected resolver returns a bounded
   server decision; every Inbox operation rechecks the recipient scope.
3. Event visibility cannot be broadened. Private Project labels are limited to authorized in-app
   presentation; external delivery receives a sanitized reference envelope.
4. Duplicate Event projection and per-channel delivery creation are idempotent. Grouping is limited
   to non-Critical notifications and uses an injected clock window; Critical/security/future finance
   classes are not silently grouped or rate-dropped.
5. Security/mandatory notifications cannot be fully muted. Preference suppression, quiet-hour delay,
   delivery failure, cancellation, and replay do not delete or roll back the Notification Record.
6. Retry/DLQ records contain canonical diagnostic codes only. Replay has zero external resend. Search
   does not index Notification, and Notification does not implement Market, SNS, Commission, or Finance.
7. All six flags are default-off. Kill Switch/unknown/off returns fail-closed diagnostics and current
   production paths remain unchanged.

## Non-application

No production push/email provider, SNS/Market/Commission implementation, migration, database/storage
write, current-route connection, legacy notification deletion, deploy, publish, commit, or push is
part of WP-097.
