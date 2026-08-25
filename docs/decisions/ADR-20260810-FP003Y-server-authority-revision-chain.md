# ADR-20260810 — FP-003Y Server Authority and Revision Chain Finalization

## Status

Superseded by FP-003Z for the release composition boundary; FP-004 remains NO-GO pending
external re-audit.

FP-003Y remains a historical checkpoint for revision-chain and financial hardening. The current
release authority is the fixed `CanonicalRegistryAdapter` composition in FP-003Z.

## Context

FP-003X removed several caller-controlled financial and Principal substitutions, but its factory
could still be constructed with a caller-selected Provider and child records needed explicit
current-head checks across the full Direct Work graph. Financial deductions also needed checked
arithmetic, and residual SNS/Admin/Moderation paths still copied caller Proof Principal values
into authority expectations.

## Decision

Use a server-only composition root that captures the Provider and exports a fixed service instance.
Expose only shared client contracts to Browser bundle entries. Keep the internal factory available
only for server assembly and synthetic tests; it is not a release entry.

Treat command Principal, License hash, and Contributor Snapshot values as claims. Resolve
canonical values inside the server Registry boundary and bind them to `AuthorizationProofV1`,
Canonical Record references, and current revisions. Use current-head checks across Request → Quote
→ Agreement → Milestone → Delivery → Acceptance → Rights and Request/Quote/Agreement → Payment.

Use BigInt only inside checked Money aggregation; keep JSON/API Money as safe integer minor units.
Reject overflow and deductions exceeding Gross rather than clamping.

## Alternatives rejected

- Passing a Provider or resolver through every command.
- Treating a frozen object, `origin` string, or WeakMap seal as the complete authority proof.
- Copying caller Principal, License semantic hash, or Contributor Snapshot into the server expectation.
- Starting Durable Inbox/Outbox, transactions, retries, or crash recovery in this package.

## Consequences

The Browser surface is smaller and cannot construct the server authority boundary. Rehydrated
Payment verification has an explicit Server Registry adapter path. The current isolated modules
remain framework-free and no production route, data, provider, database, Storage, migration,
deployment, publish, commit, or push is changed. The external audit must still validate the real
server adapter and production-equivalent integration before FP-004 can start.
