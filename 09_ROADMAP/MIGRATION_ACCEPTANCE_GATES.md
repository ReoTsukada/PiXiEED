---
spec_id: ROADMAP-LEGACY-GATES-001
title: Legacy Migration Acceptance Gates
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
version: 1.2.0
---

# Legacy Migration Acceptance Gates

## GATE L0 — INVENTORY COMPLETE

- every production table/function/bucket/webhook known;
- every source field classified;
- current row counts and status values stored;
- migration history synchronized.

## GATE L1 — RESTORE PROVEN

- database restored in isolation;
- Storage restored or re-linked from verified copy;
- Stripe reports exported;
- checksums verified;
- application can read restored data.

## GATE L2 — IDENTITY

- 100% existing Auth users mapped;
- zero duplicate canonical accounts;
- zero creator-profile ownership changes;
- existing login works in test environment.

## GATE L3 — PRODUCTS AND FILES

- 100% active products resolve;
- existing URLs resolve;
- source file byte hashes match;
- withdrawn/private visibility unchanged;
- price and license history retained.

## GATE L4 — ENTITLEMENTS

- 100% valid paid and complimentary entitlements resolve;
- zero duplicate entitlements;
- zero orphan buyers/products;
- representative users can download exactly the products they owned;
- no charge is recreated.

## GATE L5 — MONEY

For every currency and user:

- sales sum exact;
- refunds/disputes exact;
- legacy rewards exact;
- royalties exact;
- pending/available/paid balances exact;
- payout requests and paid payouts exact;
- Stripe balance/payout reconciliation accepted.

Tolerance for integer minor-unit financial totals: `0`.

## GATE L6 — PARALLEL OPERATION

- shadow comparisons pass;
- dual-projection/outbox backlog is zero;
- duplicate webhook and idempotency tests pass;
- no missing event at cutover boundary;
- rollback feature flags tested.

## GATE L7 — USER EXPERIENCE

- no account recreation;
- no repurchase;
- no missing history;
- old and new labels explain legacy rewards;
- unresolved migration data displays `確認中`, never false zero;
- support can trace a user-visible amount to its source.

## GATE L8 — RETIREMENT

- two full payout cycles completed;
- 90-day fallback passed;
- no unresolved blocking exceptions;
- archive and restore tested;
- legal/accounting approval;
- owner and independent reviewer sign-off.


---
