# ADR-20260816: WORK-420 composition boundary

## Decision

Implement WORK-420 as an isolated server-only composition root around the
existing Direct Work/Billing, Authorization, Money, Provider-event, FP-002,
FP-003, FP-003AA, and FP-004 boundaries. Represent the Request-to-Ledger
chain as one canonical aggregate and resolve its Current Record before every
transition.

Caller input is treated as an untrusted claim. The Registry and the one-shot
server context derive the current aggregate, authority, record identities,
participant snapshot, terms, money, rights, Provider identity, and revision.
Canonical envelopes and hashes bind the resulting graph. Failed transitions
do not erase history; a recovery Delivery is a new revision.

Participant authorization is operation-specific and is derived from the
Current Request roles: requester-side operations cannot be performed by an
unrelated active tenant member, and creator-side Milestone/Delivery operations
are bound to the canonical creator. The server membership Registry is
re-resolved immediately before commit; the commit input includes the current
membership identity and revision so a revoke between context consumption and
mutation fails without changing aggregate state.

All Request, Quote, Agreement, Milestone, Delivery, Acceptance, Rights,
Payment, and Ledger current heads are compared with their canonical envelope
revisions before authority resolution and every transition.

## Rationale

This preserves the existing authority model and keeps WORK-420 from creating
a parallel Authorization, Money, or Provider trust system. It also makes
cross-record injection, stale-record reuse, parent-only substitution,
terms-only substitution, membership drift, ordering errors, and malformed
success responses fail closed at one server boundary.

The event adapter is intentionally only a deterministic reference adapter
over FP-004's existing in-memory transaction and inbox/outbox lease
boundaries. It provides fixture-level verification for trusted envelopes,
Provider identity, idempotency, duplicate/replay/out-of-order handling, crash
boundaries, lease fencing, DLQ, and no-side-effect replay. Durable cross-process
eventing and real Provider/payment integration are deferred and remain
`UNTESTED`.

## Consequences

- The default feature flag and kill switch leave the slice inactive unless a
  server caller explicitly enables it.
- Every operation pays the bounded current-record resolution cost at the
  server boundary; no per-frame, global, network, or whole-project
  serialization dependency is introduced.
- Private command fields are not copied to public projections; diagnostics
  expose only minimal identifiers/hashes.
- The bounded local evidence is `PASS` only after the independent Terra review;
  it cannot be used to claim production readiness or real-provider behavior.

## Non-goals

This ADR does not authorize edits to existing FP-004, FP-002, FP-003,
WP-220, Market, Direct Work, commission, route, Supabase, Storage, Registry,
Queue, State, Context manifest, or production files. It does not authorize
commit, push, deploy, migration, publish, or cutover.

Context SHA-256:
`ceacf9223d19ef74b0a00998cb9e2796fc7ab1bf31d14f9b26e3666d483930a2`.
