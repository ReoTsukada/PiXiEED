# OPS-440 Composition Contract

OPS-440 is an isolated server-composed projection for Admin, Moderation,
Analytics, Ads, Revenue shadow, and durable event Inbox behavior. It does not
connect current routes, Supabase, Market, PiXiSYNC, provider SDKs, production
Auth/RLS, storage, payments, or legal consent services.

## Public boundary

`pixiedraw2/src/platform/ops-440/contracts.ts` is dependency-free. Its public
surface is limited to bounded opaque identifiers, scalar event metadata,
surfaces, commands, diagnostics, and safe result shapes. It must not import or
re-export `ServerAuthorityRequestContextV1`, `AuthPrincipalProvider`,
`TenantMembershipResolver`, a canonical registry adapter, a composition
factory, or an event adapter.

The caller cannot provide a resolver, role, capability, consent/region/age
authority, current state, AuthorizationProof, or revenue mutation controls.
Unknown command fields and direct Event-shaped substitutions are rejected.

## Server composition

`composition.ts` captures the FP-003AA Auth provider, tenant membership
resolver, AuthorizationProof resolver, policy resolver, resource resolver,
event resolver, and optional revenue shadow resolver at construction time. The
handler accepts one `Ops440Command` and validates canonical tenant/resource and
policy revisions before consuming the server authority context.

WP240 and WP250 are reused read-only for Admin/Moderation/Analytics/Ads and
shadow economics. Private surfaces always return `intent: NONE`, `sdkLoad:
NONE`, and `providerRequest: NOT_REQUESTED`. Analytics accepts bounded scalar
metadata only. Revenue output is shadow-only with Ledger/Payout/Royalty/
Purchase/Entitlement mutation flags false. Organic ranking and contributor
allocation are not changed.

The FP-004 lease adapter supplies duplicate/replay protection, out-of-order
rejection, bounded retry, and DLQ state. All event results expose
`sideEffectCount: 0`.

Unknown, disabled, kill-switched, offline, provider-ineligible, stale, or
revoked-consent decisions fail closed. Evidence is local synthetic evidence
only; production semantic qualification remains `PENDING/UNTESTED`, and Terra
audit is not commissioned for this handoff.
