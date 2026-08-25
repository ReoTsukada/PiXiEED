# ADR-20260807-WP098 — Public URL and Routing Core

- Status: accepted for isolated implementation
- Scope: WP-098 only
- Date: 2026-08-07

## Context

PiXiEED has current static routes, generated Market/PiXFiND pages, legacy URL shapes, and
private account/commerce paths. The new Core must preserve them while making canonical routing,
SEO metadata, privacy checks, and rollback testable. Realtime is also costly and is not required
for a URL lookup.

## Decision

Add a pure ESM registry/resolver under `core-shell/assets/` with a 50-route WP-000 snapshot and
typed compatibility records. Keep the feature flags default-off. Return shadow redirect
candidates by default; apply only with server canonical/privacy proof. Keep `/pixiedraw/` as a
current public route and require server permission for private management/account routes.
Treat route metadata/discovery as `ASYNC_ON_DEMAND` under the canonical Cost-aware Realtime Policy;
do not create a Realtime subscription for route transitions.

The existing repository route files remain authoritative and are not edited by WP-098. No new
framework, router package, production adapter, database migration, storage upload, deploy,
publish, commit, or push is part of this decision.

## Alternatives rejected

1. Client-only redirects: rejected because client state cannot prove privacy, deletion, or
   canonical ownership.
2. Permanent Realtime for route state: rejected because route reads are bounded on-demand reads
   and must not turn high-frequency or unrelated state into global messages.
3. Immediate current-route cutover: rejected until WP-099 integration, browser, compatibility,
   and rollback gates pass.

## Consequences

The isolated Core can be conformance-tested without production access. A later host adapter must
recheck server permission and preserve the current route on unknown/off/killed flags. Metadata is
not a data export and cannot include private project, commerce, rights, commission, or raw media
content.
