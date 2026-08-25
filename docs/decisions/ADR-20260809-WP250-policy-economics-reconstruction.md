# ADR-20260809 — WP-250 Policy, Economics, and Moderation Reconstruction

## Decision

Reconstruct WP-250 as an isolated pure projection boundary because no dedicated package or
Mandatory Specification was present after WP-240 approval. The implementation covers server-input
policy evaluation, public-only lazy Ad eligibility and layout reservation, shadow unit economics,
Organic/Sponsored separation, and versioned Moderation/Audit references. It does not connect a
provider, transport, Admin RPC, moderation mutation, Ledger, Payout, or current route.

## Provenance

The scope is derived from the approved WP-240 gate and `COST_AWARE_REALTIME_POLICY.md`,
`PIXIEED_CORE_SYSTEM.md`, `FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md`,
`ACCOUNT_PERMISSION_CORE.md`, `EVENT_ACTIVITY_CORE.md`, `SEARCH_INDEX_CORE.md`,
`NOTIFICATION_CORE.md`, `EXISTING_PLATFORM_PRESERVATION.md`,
`MIGRATION_ACCEPTANCE_GATES.md`, and `WP-240-ADMIN-ANALYTICS-ADS-REVENUE.md`. Existing Ads/Admin
files are preservation evidence only. This ADR and the WP-250 contract are the source-status record.

## Safety consequences

Public Ads can later be connected through a lazy adapter while editors and private/commerce surfaces
remain ad-free. Analytics consent does not become a tracking identity. Revenue projections cannot be
mistaken for the financial Ledger or a payout instruction. Moderation references preserve evidence
identity without deleting or mutating content. Default-off flags and local rollback keep the Core
non-invasive.

## Release truth

The synthetic suite and local bundle measurements prove only the isolated contract. Real policy
authority, provider behavior, Admin security, Analytics delivery, moderation workflow, finance
reconciliation, browser/device performance, and production integration remain `UNTESTED`. WP-900
requires an external audit of this boundary and is not started automatically.
