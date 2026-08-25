# ADR-20260809-WP230 Content Finalization Gate

## Decision

The Social Core accepts only bounded text and typed, server-approved Core Card references. A raw
media upload path is intentionally absent. Core Cards retain a stable resource reference and safe
presentation path, while price/availability/creator/preview are explicit LIVE/SNAPSHOT/OMITTED
policies. Current server visibility, lifecycle, moderation, and permission are re-resolved at read
time and fail closed to `CONTENT_UNAVAILABLE` without stale presentation data.

## Provenance

This supplement is derived from the WP-230 external audit gate, `02_ARCHITECTURE/SEARCH_INDEX_CORE.md`,
`ACCOUNT_PERMISSION_CORE.md`, `EVENT_ACTIVITY_CORE.md`, `NOTIFICATION_CORE.md`,
`WP-210-MARKET-RIGHTS-COMMERCE.md`, and the existing WP-230 isolated implementation. It does not
rerun or replace WP-000 through WP-230.

## Consequences

Draw2 can share a completed/public work or Market reference only after an explicit Share Command.
Market Cards remain non-commerce references. Duplicate Shares are safe to retry. Search and old
public presentation data cannot reveal a resource after it becomes private, deleted, trashed,
quarantined, or unpublished. Real SNS/RLS/moderation/Search/notification delivery remain untested.

