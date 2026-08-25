# WP-250 Policy / Economics / Moderation Contract

Status: `complete pending external audit`

Source status: `RECONSTRUCTED_FROM_APPROVED_SOURCES`

## Authority

Consent, region, age, provider eligibility, Admin actor, and moderation actor are server-resolved
inputs. Client flags, roles, or display state never grant authority. Unknown policy is fail-closed.
Ad consent and Analytics consent are separate; essential telemetry is represented separately and is
not an Ad or Analytics identity authority.

## Public Ad policy

Ads may be considered only for `DISCOVER`, `PUBLIC_SOCIAL`, `COMMUNITY`, `PUBLIC_CREATOR`,
`PUBLIC_PROJECT`, `MARKET_BROWSE`, `PUBLIC_GAME`, and `PUBLIC_LISTENING`. `DRAW2_EDITOR`,
`GAME_EDITOR`, `AUDIO_EDITOR`, `DIRECT_WORK`, `CHECKOUT`, `ACCOUNT_SECURITY`, `PRIVATE_PROJECT`,
`PRIVATE_INBOX`, and `ADMIN` are always ineligible. Eligibility requires server policy, consent,
provider policy, viewport proximity, and a reserved layout slot. The Core returns a lazy adapter
intent only; it does not load a provider SDK or request an Ad.

Slot plans reserve bounded inline/block dimensions, are safe-area-aware, and collapse only after a
provider outcome or retain a fallback reservation. No provider script is in the initial Editor or
Runtime bundle.

## Analytics and Admin boundary

This Core does not send Analytics or replay Admin operations. Audit references contain only bounded
stable references, permission, operation, target, and reason. JWT, secret, email, phone, address,
payment, private Project, commission, raw message, raw asset, and creative body are outside the
contract.

## Revenue and Cost projection

Projection lines use integer minor units and bounded stable scope references. Revenue streams are
Ads, Market fees, Subscriptions, Direct Work fees, and Build/Export paid features. Cost streams are
Realtime, Database, Storage, Egress, Build compute, Payment Provider fees, Moderation, and external
paid services. Ad lines carry one of Gross Estimated, Invalid-Traffic Adjusted, Provider Finalized,
Withheld, or Paid. Projection results expose totals and unit-economics grouping but are explicitly
shadow-only, with `ledgerMutation: false` and `payoutMutation: false`.

## Search and Moderation

Organic results retain organic relevance. Sponsored results use a separate channel and explicit
`Sponsored` label; paid presentation cannot silently mutate organic ranking. Moderation Cases and
Decisions are versioned, reference bounded evidence without copying its body, require server actor
resolution, require audit, and defer any canonical action to an explicitly authorized adapter.

## Flags and rollback

`wp250-policy-read`, `wp250-ad-lazy-read`, `wp250-economics-shadow-read`,
`wp250-moderation-case-read`, and `wp250-sponsored-separation-read` default OFF. Unknown flags and
the kill switch fail closed. Rollback restores a validated local shadow snapshot only.

## Non-goals

Provider delivery, consent UI/legal decisioning, Analytics transport/retention, Admin RPC/RLS,
moderation console, automatic hide/remove/suspend, Ledger/Payout, checkout, Market write, current
route change, migration, deployment, publish, and production performance are not implemented.
