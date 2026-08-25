---
spec_id: CONTRACT-WP060-ACCOUNT-PERMISSION-001
title: WP-060 Core Account and Permission Adapter
status: IMPLEMENTED_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# WP-060 Core Account and Permission Adapter

`core-account-permission-utils.js` is a deterministic, storage-neutral reference seam for the
site-wide Core Identity and resource-scoped authorization boundary. It is not loaded by the current
production page and does not create users, sessions, database rows, RLS policies, Storage objects,
Market purchases, or entitlements.

## Canonical identity

- `principalId` is the stable Core identity used by the adapter.
- `authUserId` preserves the existing `auth.users.id`; one Auth user maps to at most one canonical
  principal in this adapter.
- `user`, `creator`, and `service` are identity kinds, not interchangeable permission roles.
- Public Creator identity and legal Seller identity remain separate projections. A verified seller
  state is represented by a server-authoritative Market grant, not by a browser role string.
- Anonymous sessions have no canonical User identity and can only use explicitly public read paths.
- Suspended/deleted identities are denied even when a stale grant exists.

The adapter intentionally accepts trusted account projections only. It does not read client profile
metadata as authorization input. Supabase Auth/RLS/RPC remains the server authority; the browser
projection may hide or explain a denial but cannot grant access.

## Resource and capability model

Resources are scoped by `(resourceType, resourceId)` and may be `private` or `public`. Supported
resource families cover `project`, `asset`, `package`, Market product/purchase/entitlement,
subscription entitlement, post, community, direct-work commission, and admin. A grant carries a preserved role label for display and
legacy compatibility, but the explicit capability list is authoritative.

The default decision is deny. Public anonymous access is limited to `read` on a registered public
resource. Owner defaults apply only to the resource owner and do not grant `admin`, purchase,
download of another user's entitlement, or staff review. Market seller management, purchase
ownership, entitlement download, subscription use, direct-work requester/creator actions, and admin
review are explicitly scoped grants.

Subscription access is independent from a purchased Market entitlement. Revoking a subscription
grant must not delete or reinterpret a paid purchase entitlement; refund/dispute handling is a
separate server-owned state transition.

Direct work is a `commission` resource with its own participant grants. The adapter does not infer
commission authority from a general social/community permission or create a general-DM permission.

## Legacy and session compatibility

Legacy identity mappings are permanent one-to-one records for a `(system, entityType, legacyId)`
key. Conflicting forward or reverse mappings are recorded as `QUARANTINED`; they do not move
ownership or entitlements and require explicit administrator resolution. `resolveSession` maps an
existing Auth user ID to the canonical principal without recreating the user or changing provider
links.

The production integration must preserve current `auth.users.id`, email confirmation, anonymous
session handling, `user_profiles`, current PiXiSYNC membership/RPC checks, Market seller/reviewer/
purchase/entitlement checks, and existing public URLs. It must use additive projections and a
read-only/shadow comparison before any feature-flagged adoption.

## Server boundary and rollback

This contract does not add a Supabase migration. Existing RLS policies and security-definer RPCs
remain authoritative and must continue to use `auth.uid()`/server-side ownership checks. Any later
schema addition requires a dry run, policy review, reconciliation evidence, rollback instructions,
and explicit production approval. A failed Core decision or adapter mismatch falls back to the
current account/Market/PiXiSYNC path; no identity, financial, rights, purchase, or entitlement data
is transformed by this package.
