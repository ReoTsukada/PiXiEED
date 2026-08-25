# ADR-001 — CORE-110 adapter interoperability boundary

- Status: Accepted for isolated qualification after independent review
- Scope: CORE-110 only

## Decision

Use a shared conformance runner around the fixed CORE-100 composition root.
Fixture adapters may be in-memory, restartable production-equivalent-shaped, or
deliberately failing, but they must expose the same CORE-100 dependency
contracts and typed result boundary.

## Reuse and separation

FP-004 remains the source of truth for transaction atomicity, aggregate
versions, provider Inbox identity, Outbox leases, fencing, retry/DLQ, crash
points, and replay `sideEffectMode: NONE`. FP-005 remains the source of truth
for storage placement, locator validation, privacy, and tenant scope. FP-007
remains the source of truth for schema identity, compatibility, and digest.
CORE-110 adds only test composition, fault injection, spies, comparison, and
evidence serialization. It does not mint AuthorityProof, Money, idempotency,
Storage, or Schema systems.

The production-equivalent label describes shape and restart behavior only. It
does not imply a production adapter, database durability, provider access, RLS
qualification, device qualification, or production performance. Real provider
and production checks remain `UNTESTED`.

## Consequences

The same command and synthetic fixture can be compared across adapter classes,
including typed failure identity and external side-effect count. A malformed
`{ok:true}` value is validated by CORE-100 and cannot throw through the runner.
Duplicate, crash, retry, and replay paths are checked for a second side effect.
Independent review is represented explicitly in evidence: generated evidence
starts as `PENDING`, and the accepted artifact records the reviewer and scope.
This ADR does not promote synthetic or production-equivalent-shaped results to
production qualification.
