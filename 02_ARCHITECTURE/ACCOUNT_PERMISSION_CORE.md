---
spec_id: ARCH-ACCOUNT-PERMISSION-CORE-001
title: PiXiEED Core Account and Permission Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - 02_ARCHITECTURE/LEGACY_DATA_COMPATIBILITY.md
  - 02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md
---

# PiXiEED Core Account and Permission Contract

## Scope

PiXiEED Core has one identity and permission boundary for Draw/Draw2, Audio, Game/Runtime, Market,
SNS/Community, direct work, and Account/Admin. The boundary is a canonical projection over the
current account and server contracts. It is not permission to replace those contracts early.

The current production path remains active. No user, Auth session, public URL, project, product,
purchase, license, royalty, payout, entitlement, Storage object, or PiXiSYNC room is recreated or
rewritten merely because the Core model exists.

## Identity model

```text
Auth User (existing auth.users.id)
  ├─ Core User principal
  ├─ public Creator projection (optional)
  └─ legal Seller / payout projection (optional and separate)
```

Rules:

- Preserve `auth.users.id` and provider identity links.
- Do not recreate users or use a display name, email, local client ID, or profile field as the
  canonical security identity.
- Anonymous sessions have no Core User principal.
- Account status (`active`, `suspended`, `deleted`) is checked before any capability.
- Creator identity and legal seller verification are distinct projections. Being a Creator does not
  automatically grant seller, reviewer, admin, payout, or purchase rights.
- Auth/session data is normalized by the compatibility adapter. Untrusted client profile fields are
  never an authorization source; trusted server projections and RLS/RPC checks are authoritative.

## Authorization request and result

Every Core authorization request has:

```yaml
principalId: stable canonical User/Creator/Service ID or null for anonymous
resource:
  type: project | asset | package | market_product | market_purchase | entitlement |
        subscription | post | community | commission | admin
  id: stable resource ID
action: explicit capability such as read, update, publish, download, review, deliver
context: diagnostic-only request context; never a client-side authority override
```

The result is:

```yaml
ok: boolean
decision: allow | deny | unknown
diagnostics:
  - code: stable diagnostic code
    severity: info | warning | error
    message: human-readable explanation
    metadata: non-secret structured facts
```

`unknown` is returned only when the resource is not in the current projection. It is still
`ok: false`. All malformed input, unknown identities, inactive identities, missing mappings,
missing capabilities, and private anonymous requests fail closed.

## Resource-scoped capabilities

Roles may be preserved for UI/legacy display, but capability lists are the authority. There is no
global role shortcut for every resource.

| Resource | Typical authority | Important separation |
| --- | --- | --- |
| Project | owner/member grant | PiXiSYNC active membership and owner/editor RPC checks remain server-owned |
| Asset/Package | owner or explicit project/consumer grant | immutable revision and package dependency rules still apply |
| Market Product | explicit verified-seller capability grant | seller identity, MFA, listing review, and publish gates remain server-side; product ownership alone is insufficient |
| Market Purchase/Entitlement | explicit purchase-validated buyer grant | purchase, download, license, and payment reconciliation are server-owned; public product read is not entitlement |
| Subscription Entitlement | explicit current-plan grant | plan cancellation/revocation does not remove an independent purchased Market entitlement |
| Post/Community | creator/member/moderator grant | public read does not imply write or moderation |
| Commission | explicit requester/creator/milestone grant | direct work is separate from general DM and Market product authority; resource ownership alone is insufficient |
| Admin | explicit staff/admin capability | no creator, seller, buyer, or owner shortcut |

Public anonymous access is limited to `read` on a registered public resource. A purchased item
uses a buyer-scoped Purchase/Entitlement resource and must not be inferred from public product
visibility.

## Current Supabase boundary

The repository evidence establishes these current boundaries:

- `user_profiles.id` references `auth.users(id)` and its RLS is owner-scoped.
- Market seller profiles, staff roles, audit records, seller verification, and AAL2 session checks
  are separate server-side contracts.
- Market purchase and delivery RPCs bind actions to `auth.uid()` and entitlement state.
- PiXiSYNC `collab_v1` reads require an active room member; operation commit requires an owner or
  editor and validates the operation actor.
- Public catalog/preview and private source/delivery paths are separate.

Any future exposed table requires RLS. Policies must be scoped to the authenticated subject and
resource owner/member, with both `USING` and `WITH CHECK` where updates are allowed. Financial,
entitlement, seller, staff, and moderation mutations remain security-definer/RPC or equivalent
server-owned transactions. The browser adapter may explain a decision but cannot bypass RLS.

## Legacy mapping and rollout

The compatibility map is permanent and one-to-one for each legacy system/entity type:

```text
legacy_system + legacy_entity_type + legacy_id → canonical_id
```

Existing IDs are reused when semantics and uniqueness match. Otherwise the source is preserved and
the mapping is recorded; conflicting forward or reverse mappings fail. Existing URLs and product,
creator, post, project, purchase, license, and entitlement references remain resolvable.

Integration order:

```text
isolated adapter
→ synthetic denied/allowed fixtures
→ read-only/shadow comparison against current auth/Market/PiXiSYNC projections
→ default-off flag and correlation diagnostics
→ copied non-private fixture canary
→ rollback proof and owner approval
→ production consideration
```

WP-060 performs only the first two stages. It adds no migration and no production write.
