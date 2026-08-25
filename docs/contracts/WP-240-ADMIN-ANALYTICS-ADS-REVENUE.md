# WP-240 Admin / Analytics / Ads / Moderation / Revenue Contract

## Boundaries

`Admin Projection` is a server-permissioned read projection and contains no private creative body.
`Analytics Event` is bounded plain metadata and rejects authentication, PII, creative content,
payment, entitlement, commission, rights, and ledger fields. `Ad Placement` is eligible only on
public discovery/feed/resource/Market listing surfaces; Active Studio, Checkout, Entitlement,
Commission, Account-private, and Project-private surfaces are ad-free. `Moderation Reference`
contains a typed target and policy reason only; it does not copy body or mutate the target.
`Revenue Shadow Comparison` is a read-only expected/observed minor-unit comparison and cannot alter
Ledger or Payout.

## Server authority and flags

Client role/capability values are ignored. Admin and moderation require server-resolved decisions.
Flags `admin-projection-read`, `analytics-write`, `ads-public-read`, `moderation-reference-read`,
and `revenue-shadow-read` are independent and default OFF. Unknown flags and Kill Switch fail
closed; rollback restores only a local shadow snapshot and never deletes canonical data.

## Existing-system preservation

Existing owner/admin RPCs, Market reward functions, Ads scripts, ad-free edition policy, current
routes, Account, Market, purchase/entitlement/rights/royalty records, and production data remain
outside this unloaded implementation. The module is lazy-only and has no provider or server call.

