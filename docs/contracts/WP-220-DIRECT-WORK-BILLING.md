# WP-220 Direct Work / Billing Contract

## Boundary

WP-220 is a pure Direct Work projection and reconciliation boundary. It is independent from DOM,
Canvas, Draw2, Game Runtime, Audio UI, Market routes, general DM, Notification Delivery, database
clients, Storage, Provider SDKs, and production data. It stores references and canonical records,
not raw request bodies, project content, credentials, JWTs, email, payment card data, or provider
payloads.

```text
Direct Work Request
  → Scope / Quote
  → Agreement
  → Milestone
  → Delivery reference
  → Acceptance
  → Rights / License decision
  → Payment event / append-only Ledger
```

## Domain separation

| Domain | WP-220 meaning | Must not become |
| --- | --- | --- |
| Direct Work Request | requester/creator-scoped work request | general DM thread or Market Product |
| Quote | server-derived integer price/terms snapshot | client-selected checkout amount |
| Agreement | accepted scope, parties, terms, version | implicit acceptance from payment |
| Milestone | bounded deliverable and amount reference | payment-only status |
| Delivery | immutable Package/Asset/Revision reference | raw upload or automatic acceptance |
| Acceptance | explicit authorized party decision | Notification delivery success |
| Rights/License | explicit rights snapshot/decision | inferred commercial entitlement |
| Payment | Provider-opaque event projection | Provider object as Canonical state |
| Ledger | append-only sale/adjustment/reversal evidence | mutable balance or Payout |

## State and permission invariants

- A Request must be explicitly submitted before a Quote can be issued.
- Quote acceptance requires the requester and agreement signing requires the authorized parties.
- A Milestone cannot be accepted before a Delivery reference is submitted.
- Delivery rejection preserves history and may create a new recovery Delivery; it does not erase
  the old Delivery.
- Payment success does not imply Acceptance or Rights. Rights require an explicit License decision.
- Direct Work permission is requester/creator/milestone scoped. Product ownership, public read,
  general DM membership, or Market seller status is insufficient.
- Cancellation, Dispute, and Recovery are explicit records. They do not delete financial history.

## Money contract

Every money value contains `amountMinor`, `currency`, and `roundingPolicyVersion`. Amounts are
safe non-negative integers, except a Ledger direction may represent a signed adjustment through
`CREDIT`/`DEBIT`. Quote totals sum same-currency integer line items. Unsupported currencies,
non-integer values, currency mismatch, overflow, and provider display strings fail closed.

Client values are hints at most. The server-authoritative Quote/Agreement snapshot resolves price,
royalty, payout eligibility, license terms, owner, and any entitlement scope before a payment
command is emitted.

## Provider, webhook, and idempotency contract

Provider commands contain only provider name, opaque correlation/intent reference, Quote/Agreement
reference, idempotency key, and command hash. A verified server adapter must validate signature,
timestamp/replay window, event ID, environment, canonical request/account, and event type before
creating a Canonical Payment Event.

Duplicate event ID plus identical fingerprint is a no-op. Duplicate ID with another fingerprint is
quarantined. Unknown, forged, wrong-account, wrong-environment, out-of-order, or delayed events
are rejected or held for explicit repair; they never grant rights or double-post Ledger entries.

## Ledger and payout

Ledger entries are immutable. A correction appends `REVERSAL` or `ADJUSTMENT` referencing the old
entry. A balance is a derived projection and can be recomputed. Payout states and Provider payout
failures are separate from Direct Work Payment, Acceptance, Rights, and any Market Purchase or
Entitlement; a payout failure does not roll those records back.

## Flags and rollback

`work-request-read`, `work-request-write`, `quote-create`, `agreement-sign`, `milestone-write`,
`delivery-submit`, `payment-intent`, and `rights-acceptance` default to `false`. Unknown flags
fail closed. The Kill Switch wins. Rollback is shadow-only and restores a previous valid local
projection without deleting or mutating current Product, Purchase, Entitlement, License, Ledger,
Payout, or Direct Work history.
