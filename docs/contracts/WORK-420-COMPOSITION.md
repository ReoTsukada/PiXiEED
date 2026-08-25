# WORK-420 Direct Work/Billing Composition Contract

## Status and boundary

WORK-420 is an isolated Direct Work/Billing-compatible vertical slice and a
`COMPLETE_CANDIDATE` after bounded independent review. It
models one server-owned aggregate:

`Request -> Quote -> Agreement -> Milestone -> Delivery -> Acceptance -> Rights -> Payment -> Ledger`

The composition is fail-closed and feature-off by default. This contract does
not change the existing Market, Direct Work, commission, route, database,
Storage, or production surfaces. The implementation is limited to the
WORK-420 source, test, benchmark, contract, ADR, and inventory paths.

The Context used for this slice is
`ceacf9223d19ef74b0a00998cb9e2796fc7ab1bf31d14f9b26e3666d483930a2`.

## Authority boundary

`Work420CompositionRoot` is the server-only composition root. Before every
operation it consumes a one-shot server request context and resolves the
current canonical aggregate, the operation authority, and the authorization
proof from the supplied Registry. Caller-provided objects are claims only;
they are not authority for aggregate ID, parent ID, record ID, revision,
terms hash, amount, currency, recipient, royalty, license, acceptance, or
Provider identity.

The implementation reuses the existing authority boundaries:

- `AuthorizationProofV1` for authorization proof validation;
- `CanonicalMoneyV1` for amount and currency validation;
- the existing WP-220 Direct Work factories and transitions;
- FP-002 aggregate/current-record integrity;
- FP-003 and FP-003AA financial, Provider-event, and ledger authority.

WORK-420 does not introduce a second Authorization, Money, or Provider trust
system. The event surface is a thin adapter over the existing FP-004
in-memory reference adapter and is explicitly not a production durable-event
implementation.

## State and revision rules

The Registry stores a canonical current aggregate with typed record envelopes,
current heads, append-only histories, and a server-derived aggregate revision.
Each successful transition creates a new aggregate revision and binds every
record envelope to its canonical record hash, aggregate identity, participant
snapshot, and record-specific current version.

The operation participant is derived from the current Request and role chain:
the requester owns Request submission, Quote acceptance, Agreement creation and
signing as requester, acceptance, rights, payment, and ledger operations; the
creator owns Quote issuance, Agreement creator signing, Milestone lifecycle,
and Delivery lifecycle. Authority actor fields must agree with this
server-derived participant and never select it.

Every transition checks:

- the current Request/Quote/Agreement/Milestone/Delivery/Acceptance/Rights/
  Payment/Ledger graph and all parent links;
- every `currentHeads.*Revision` value against the corresponding canonical
  envelope revision, including Agreement and every downstream record;
- the record kind, record ID, aggregate ID, current head, and canonical hash;
- Quote terms against Agreement `acceptedTermsHash` and downstream records;
- Canonical Money, recipient, royalty, license, acceptance, and Provider-event
  bindings;
- active, unexpired membership and the one-shot server context;
- the required state order and server-side idempotency key.

After authority resolution and before `commit`, the existing membership
Registry is resolved again. The commit input carries the server-issued
membership ID, principal, tenant, and membership revision, and the isolated
fixture commit rechecks that identity before mutating aggregate state.

Rejected deliveries remain in history. Recovery creates a new Delivery
revision and preserves the rejected Delivery and Acceptance history; a stale
Acceptance is not silently reused as the current Acceptance. Identical
idempotent commands are no-op duplicates, while the same key with a different
command hash is rejected.

## Failure and attack protections

The isolated tests cover cross-record injection, parent-only changes, terms
hash-only changes, stale saved objects, stale current versions, cross-root
children, forged or cloned server context, revoked/expired membership,
order violations, malformed authority, malformed success values, and
idempotency conflicts. A result is successful only when it has the expected
success shape and remains bound to the server-derived current graph.

The FP-004 adapter tests cover trusted event-envelope binding, aggregate
version gaps and replay/idempotency, forged Provider ingress identity,
Provider identity conflicts, crash boundaries, lease fencing, DLQ behavior,
and side-effect-free replay. The adapter is bounded to an in-memory fixture;
it does not claim cross-process durability or real Provider execution.

## Privacy and public projection

Private request body, contact, payment detail, license, royalty, and ledger
content never enters the public Search, Notification, Telemetry, or Audit
projection. The public summary contains only a bounded diagnostic code and
minimal record/aggregate identifiers or hashes. No private command payload is
accepted as a public projection input.

## Qualification state

The checked-in evidence is `PASS` with
`reviewer=TERRA_HIGH_INDEPENDENT_REVIEW`. It records a bounded isolated
implementation and independent review; it does not qualify production
behavior.

The following remain `UNTESTED`: real Provider/Auth/RLS/DB/Storage, real
payment, browser/device behavior, current production routes, cross-process
durability, and production deployment or cutover.
