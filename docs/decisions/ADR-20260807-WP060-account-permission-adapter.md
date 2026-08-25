---
adr_id: ADR-20260807-WP060-ACCOUNT-PERMISSION-ADAPTER
title: Isolated Core Account and Resource Permission Adapter
status: ACCEPTED
date: 2026-08-07
---

# ADR-20260807-WP060 — Isolated Core Account and Resource Permission Adapter

## Context

The repository already has separate and security-sensitive account boundaries: `auth.users.id`
and `user_profiles`, PiXiSYNC room membership and editor checks, Market seller identity and MFA,
staff review/admin checks, purchase/entitlement delivery, and public versus private Storage/RPC
paths. A new site-wide Core must connect these boundaries without recreating users or silently
turning a UI role into server authorization.

## Decision

Implement WP-060 first as an unloaded, deterministic adapter with synthetic fixtures. Use:

1. stable canonical principals mapped to existing Auth IDs;
2. resource-scoped grants with explicit capabilities;
3. preserved role labels only as compatibility/display metadata;
4. public-read and default-deny decisions with structured diagnostics;
5. permanent legacy identity mappings with forward/reverse conflict rejection;
6. separate Market seller, purchase/entitlement, direct-work commission, and admin resources.

The adapter does not add a Supabase migration or change current RLS/RPC/Market/PiXiSYNC behavior.
Later runtime wiring must be additive, default-off, read-only/shadow comparable, and reversible.

## Repository evidence

- `supabase/migrations/20260405143000_create_user_profiles.sql` preserves `user_profiles.id` as
  `auth.users(id)` and scopes profile policies to the authenticated owner.
- `supabase/migrations/20260717110000_market_seller_and_asset_verification.sql` separates seller
  identity, staff roles, audit, and server-side `market_current_user_can_sell()` checks.
- `supabase/migrations/20260717133000_market_free_seller_registration_mfa.sql` requires confirmed
  non-anonymous identity and AAL2 for seller registration and keeps admin verification server-side.
- `supabase/migrations/20260730001657_pixisync_collab_v1_access_rpc.sql` scopes room reads and
  operation commits to active members and owner/editor roles.
- `docs/inventory/market-data-contracts.md` records purchase, entitlement, seller, royalty, payout,
  and delivery contracts; live state remains unknown and untouched.

## Consequences

- Core can test identity/session/authorization semantics without exposing secrets or real users.
- Existing current paths remain the source of truth until a later compatibility gate proves a
  projection equivalent.
- The adapter deliberately does not implement RLS, Auth, checkout, entitlement grants, or admin
  writes; these remain server-owned concerns.
- Unknown identities, resources, mappings, inactive users, and missing capabilities fail closed.
