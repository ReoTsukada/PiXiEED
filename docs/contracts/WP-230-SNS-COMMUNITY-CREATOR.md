# WP-230 SNS / Community / Creator / My Page Contract

## Boundary

WP-230 is an unloaded, pure Core projection boundary. It accepts stable references, bounded text,
hashes, and injected server decisions. It does not call DOM, Canvas, browser storage, Supabase,
Storage, Realtime, current social scripts, Market routes, Notification providers, or Search.

```text
explicit Share Command → Post reference
Post → Comment / Reaction / Mention / Market Card references
Creator / Project / Community → scoped Page projections
trusted Event reference → Notification / Search / URL adapters
```

## Separate concepts

| Concept | Authority | Must not become |
| --- | --- | --- |
| Message | communication only | Agreement, Delivery, Acceptance, Payment, Rights |
| Post | explicit social publication record | automatic Event/Market publication |
| Comment | Post-scoped user content | Notification body or transaction authority |
| Follow | Creator relationship | permission to private resources |
| Reaction | Post-scoped idempotent interaction | financial or rights state |
| Mention | resolved Creator reference | arbitrary recipient selection |
| Community | scoped membership/resource | global role shortcut |
| Creator/Project/My Page | public, scoped, or owner projection | legal Seller, Account, Purchase, Entitlement |
| Market Card | reference to existing Product/Package | Product, Purchase, License, Royalty, Payout |

## Visibility and permission

`PUBLIC`, `UNLISTED`, `PROJECT_MEMBERS`, `CREATOR_PRIVATE`, and `PRIVATE` are distinct. Public
Discovery may contain only server-approved PUBLIC resources. UNLISTED is explicit-reference only.
Client filtering never authorizes reads, writes, moderation, membership, or mentions.

## Media and privacy

Posts carry Asset/AssetRevision/Package/Market/PixFind references, content hashes, and bounded
thumbnail/URL references. Raw media bytes, Base64/Data URLs, Project bodies, private request bodies,
JWT, Email, Phone, Secret, Payment, License, Royalty, Entitlement, and Direct Work content are
rejected. Event and Notification projections carry IDs, visibility, presentation keys, and safe
metadata only; they never copy Post or Comment body.

## Content finalization gate

SNS resource sharing requires an approved v1 Core Card. A Core Card retains only a stable resource
ID, card type/version, safe public presentation reference, and explicit `LIVE`/`SNAPSHOT`/`OMITTED`
policy for price, availability, creator, and preview. Supported types include Market Product,
Material, Completed Work, Public Game, Public Project, Creator, Collection, and future public
PiXiEED resources. Raw Image/Audio/Video, Base64, Data URL, HTML/script, and commerce mutation
fields are rejected.

At read time, current server visibility, lifecycle, moderation, and permission are re-resolved.
Private, deleted, trashed, quarantined, unpublished, or unauthorized Cards become
`CONTENT_UNAVAILABLE` without returning their old presentation reference. Search eligibility is
limited to explicitly published, public, moderation-approved, server-allowed Cards. Duplicate
Share Command identity is idempotent; conflicting identity reuse fails closed.

## Lifecycle and idempotency

Post lifecycle is explicit: `DRAFT → PUBLISHED → ARCHIVED|HIDDEN|QUARANTINED`. Comment lifecycle is
`VISIBLE → HIDDEN|DELETED`; Follow is `ACTIVE → REMOVED`; Reaction is idempotent by actor/Post/type;
Mention is idempotent by source/target/scope. Conflicting identity reuse fails closed.

## Market and notification boundaries

Market Card sharing accepts an existing locked Product/Package reference and preserved URL candidate;
it cannot create or mutate Product, Purchase, Entitlement, License, Royalty, Payout, or Ledger.
Trusted Event precedes Notification projection. Notification delivery or provider failure cannot
roll back Post, Comment, Follow, Reaction, Mention, Community, Creator, or Market state.

## Flags and rollback

All SNS/Community/Creator flags default OFF. Unknown flags fail closed. Kill Switch selects the
preserved current path. Rollback is local shadow restoration only; no public data or current route
is deleted or rewritten.
