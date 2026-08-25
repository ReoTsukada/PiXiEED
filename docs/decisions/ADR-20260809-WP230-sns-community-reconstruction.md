# ADR-20260809 — WP-230 SNS / Community / Creator Reconstruction

Status: `ACCEPTED_FOR_ISOLATED_IMPLEMENTATION`  
Date: 2026-08-09

## Context

The approved roadmap and queue allow WP-230 for SNS, Community, Creator Page, My Page, and Market
Cards, but no dedicated WP-230 Work Package, Context, or Mandatory Specification was present. The
repository contains current root/social/Post/PixFind/Market references and social migration source,
but those are evidence of the existing system, not permission to change it. The absence and source
provenance are recorded rather than silently treating an inferred design as a product contract.

## Sources

- `09_ROADMAP/CORE_SITE_INTEGRATION_PROGRAM.md`
- `02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md`
- `02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md`
- `02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md`
- `02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md`
- `02_ARCHITECTURE/SEARCH_INDEX_CORE.md`
- `02_ARCHITECTURE/NOTIFICATION_CORE.md`
- `02_ARCHITECTURE/PUBLIC_URL_ROUTING_CORE.md`
- `docs/inventory/legacy-sns-remnants-inventory.md`
- `docs/contracts/WP-095-EVENT-ACTIVITY.md`
- `docs/contracts/WP-097-NOTIFICATION.md`
- `docs/contracts/WP-098-PUBLIC-URL-ROUTING.md`
- `docs/contracts/WP-210-MARKET-RIGHTS-COMMERCE.md`
- `docs/contracts/WP-220-DIRECT-WORK-BILLING.md`

## Decisions

1. Reconstruct only a pure, unloaded SNS/Community/Core reference contract. It will not call the
   current social API, Supabase, Storage, Notification provider, Search backend, or public routes.
2. Separate communication, social content, community membership, Creator/My Page projections, and
   Market Cards. A Market Card references existing Market state and cannot create commerce state.
3. Require an explicit Share Command and server-resolved Creator authority. Automatic conversion of
   Events, Market Products, or Package readiness into a public Post is forbidden.
4. Keep Post media as Asset/Revision/Package/PixFind references and content hashes; raw public-media
   bytes and private bodies do not cross the Core boundary.
5. Use server-scoped visibility and permission results, bounded/sanitized trusted Event and
   Notification references, idempotency, fail-closed unknown flags, and local shadow rollback.
6. Keep current social migrations, routes, URLs, posts, comments, likes, Market cards, PixFind
   references, RLS, and data untouched until a separate compatibility and owner gate.

## Consequences

The WP-230 bundle can prove separation, privacy, lifecycle, and adapter seams but cannot claim real
SNS compatibility, production RLS correctness, public upload, moderation, delivery, or migration.
Those remain explicit follow-up gates. Current UI/data remains the fallback.
