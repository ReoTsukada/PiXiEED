# SOCIAL-430 Content and Authority Boundary

Status: `IMPLEMENTED_ISOLATED`
Package: `SOCIAL-430`
Context: `99ef42018fd768c69a36c16277970205a7696936afe89781b0a8ab5375611df0`

## Purpose

SOCIAL-430 composes the existing WP-230 Social vocabulary behind a new,
tenant-bound, read-time-safe reference boundary. It is an in-memory TypeScript
implementation only. The server-only composition entry closes over
server-owned authorization, resource, Market, and Event resolvers; command
inputs never carry a resolver or caller-supplied current-state authority. The
caller-facing `contracts.ts` entry exports no factory, class, adapter, or
capability. It does not replace the current SNS, Community, Creator, Market,
PixFind, account, or public URL routes.

The only publication command is an explicit `ShareCommand`. Asset changes,
Market publication, Direct Work activity, Event replay, or DOM state cannot
implicitly create a Post.

## Content matrix

| Input | Accepted representation | Forbidden consequence |
| --- | --- | --- |
| Completed Work, Material, Public Game, Public Project, Creator, Collection, future public resource | Stable tenant-bound ID, revision/content hash, safe same-origin path, bounded Card snapshot policy | Raw image/audio/video, Base64, Data URL, project body |
| Market Product / Package | Existing locked Product/Package reference and preserved URL candidate | Product, Purchase, Entitlement, License, Royalty, Payout, or Ledger mutation |
| Post / Comment | Explicit identity, bounded plain text, Post-scoped reference | Message-to-Direct-Work conversion, HTML/script, private body |
| Creator / My Page | Scoped public or owner-only IDs and bounded presentation data | Legal seller/account identity, email, phone, JWT, secret |
| Event / Notification / Search | Bounded IDs, visibility, presentation key, scalar metadata, server proof | Body copy, raw media, recipient chosen solely by client |

## Visibility and lifecycle

`PUBLIC`, `UNLISTED`, `PROJECT_MEMBERS`, `CREATOR_PRIVATE`, and `PRIVATE` are
distinct. Search requires explicit publication plus current `PUBLIC` visibility,
current `PUBLISHED`/`ACTIVE` lifecycle, moderation `APPROVED`, and a tenant-bound
server proof. `UNLISTED` is reference-only and is never a public Search result.

At read time, a Card whose visibility, lifecycle, moderation, or permission has
changed resolves to `CONTENT_UNAVAILABLE`; its old presentation path is not
returned. Post lifecycle is `DRAFT → PUBLISHED → ARCHIVED|HIDDEN|QUARANTINED`.

## Authority and durability

The dependency direction is one-way:

```text
caller → contracts.ts (types + authority-free helpers)
server-only root → event-adapter.ts → composition.ts
server-only root → private capability closure
```

`server-composition-root.ts` has no exports and the public contract does not
import it or the adapter. `authority-internal.ts` is an export-free retired
marker. Test fixtures may bind synthetic resolvers only inside the isolated
test boundary; those fixtures are not part of the product public surface.

Every write-like operation requires a server-issued `AuthorizationProofV1`
resolved by the private server capability against tenant, canonical resource,
principal, action, and capability. Current visibility, lifecycle, moderation,
membership, and locked Market state are looked up again at the boundary. The
client's `trustedProducer`, role, visibility, recipient, current-state fields,
resolver, or DOM state is not an authority.
`Social430EventProjectionLedger` accepts only a canonical Event ID from the
server Event/Outbox resolver, re-resolves the aggregate, revalidates the
producer proof, recomputes the payload hash, deduplicates identical event
identity, rejects conflicts/stale/gaps, and replay reports zero external side
effects. Visibility revoke additionally accepts only a server-resolved
`VISIBILITY_REVOKED` lifecycle Event ID, with its producer proof and payload
integrity checked again before the authorized projection change.

Notification records carry references only and set
`deliveryFailureRollsBackCanonicalState: false`. Market Card output explicitly
sets every commerce-mutation marker to `false`.

## Preservation

Current routes, Market, PiXiSYNC, PXD/project data, migrations, production
database/storage, and real provider services are not imported, called, or
modified. All fixtures are synthetic and non-private. The feature flags are
default-off and the kill switch fails closed.
