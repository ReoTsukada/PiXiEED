# WP-210 Market / Rights / Commerce Contract

## Boundary

The WP-210 adapter is a pure projection/reconciliation boundary. It is independent from DOM,
Canvas, Draw2 Editor UI, Game Runtime, PiXiAudio UI, current Market routes, Supabase clients,
RPC/Edge calls, Stripe SDK/API, Storage, IndexedDB, OPFS, and Realtime. It accepts references and
synthetic records, not raw media, project bodies, credentials, JWTs, PII, or raw payment payloads.

The existing server-authoritative Market/RPC/Edge/Storage path remains unchanged:

```text
existing Product → intent/bind → provider/webhook → completion/reversal → entitlement → signed delivery
```

WP-210 only validates and reconciles an isolated representation of that contract.

## Separate concepts

| Concept | WP-210 responsibility |
| --- | --- |
| Package | Reference `packageId`, version, manifest/dependency/content hash; no price or rights body |
| Market Product | `MATERIAL` or `COMPLETED_WORK`, publication/status/price projection |
| Purchase | Immutable buyer/order/payment reference and lifecycle |
| Entitlement | Purchase-derived access, separate from subscription |
| License | Versioned rights snapshot for the purchased locked package |
| Royalty/Ledger | Integer minor-unit/currency compatibility projection; no historical recalculation |
| Provider | Opaque command/correlation boundary; no secret or provider API call |

## Product and rights

`MATERIAL` means a reusable asset/material product. `COMPLETED_WORK` means a finished work/game/
package product. Exhibition, free, paid, and limited are publication methods; personal use,
commercial use, derivative, embedding, and resale are license rights. No product classification
implicitly grants a license.

Published/sold/purchased package references are `PINNED` with content/dependency/license hashes.
`LIVE` is authoring-only. A source Asset tombstone cannot invalidate a previously purchased,
locked package or its License Snapshot.

## Reconciliation invariants

- Same event ID and same canonical payload: idempotent no-op.
- Same event ID and different payload: quarantine conflict.
- `PENDING` is not an Entitlement.
- Paid confirmation must precede delivery/entitlement materialization.
- Reverse/refund/dispute revokes or quarantines the purchase-derived entitlement; it does not
  alter historical purchase amount or recompute royalty history.
- Restore is an explicit server-authorized event, never an inferred resurrection.
- Subscription cancellation cannot revoke an independent purchased entitlement.
- Out-of-order, unsupported, or invalid transitions fail closed with the previous projection
  preserved.

## Provider and rollback

Provider commands contain only an action, provider name, opaque correlation/intent reference,
canonical command hash, and idempotency key. Secrets, JWTs, checkout session tokens, email,
webhook bodies, payment details, and project content are prohibited. Rollback restores a local
shadow projection from the last valid snapshot and returns a provider/RPC action for a separately
authorized operator; it does not execute that action.

## Feature flags

`market-core-read`, `market-core-write`, `market-reconcile`, `market-publish`, and
`market-finance` default to `false`. Unknown flags are disabled. The kill switch overrides every
flag. This isolated package does not expose a production write path even when a test flag is true.
