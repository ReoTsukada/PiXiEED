# ADR-20260810 — FP-004 Isolated Durability Adapter Evidence Boundary

Status: `ACCEPTED_FOR_ISOLATED_EVIDENCE / NOT_PRODUCTION_INTEGRATED`
Date: 2026-08-10
Decision owner: PiXiEED Core program

## Context

FP-004 requires a durable transaction, Inbox/Outbox, provider identity, idempotency, ordering,
lease fencing, retry/DLQ, replay, authorization revalidation, crash recovery, and malformed-success
rejection. Existing WP-095 behavior is an in-memory reference and is explicitly not durable evidence.
The package is intentionally isolated because the current Market, PiXiSYNC, routes, projects, assets,
payments, and production providers must remain unchanged.

## Decision

FP-004 evidence uses an isolated reference adapter, the file-backed
`Fp004FileDurableAdapter`, together with the named
`IsolatedFp004DurabilityFixture` benchmark. The adapter models the minimum state needed to test
transaction, lease/fencing, retry, and projection-only replay; the benchmark measures the same
categories at 1/10/100/1000 synthetic events. Neither has DOM, Canvas, product UI, provider SDK,
network, database, Storage, credential, or production route dependency.

The fixture is a benchmark oracle for harness health, not a production implementation substitute.
The isolated in-memory and file-backed reference adapters and failure-injection tests support
`PASS_ISOLATED_REFERENCE` in the conformance matrix. They do not close FP-004 or establish a
production-equivalent durability claim.

The current file adapter is additionally bounded as a local reference only. Its caller supplies an
explicit storage root and an allow-listed relative `.json` snapshot name; absolute, traversal, and
path-separator names are rejected. The root, snapshot, and temporary snapshot must not be symlinks.
Deterministic rename-failure injection confirms that a failed replacement leaves the prior snapshot
readable. Atomic replacement still proves neither directory-metadata persistence across a power loss
nor cross-process coordination; both remain `UNTESTED` rather than production guarantees.

## Adapter assumptions

The future adapter must provide:

1. atomic state + canonical Event + Outbox + idempotency commit;
2. durable Inbox acceptance before external acknowledgement;
3. provider identity uniqueness and payload-hash conflict quarantine;
4. per-aggregate ordering and durable gap records;
5. compare-and-swap lease acquisition with fencing;
6. bounded retry and recoverable DLQ transitions;
7. replay with `sideEffectMode=NONE` and no canonical mutation;
8. current authorization revalidation immediately before mutation or provider side effect;
9. explicit result validation, rejecting `{ok:true}` without required durable identities.

No provider response is trusted merely because it contains a Boolean success field.

## Deterministic benchmark contract

File: `pixiedraw2/benchmarks/fp004-durable-event-benchmark.ts`

The harness uses fixed tenant, aggregate, event, provider identity, and payload-hash values. It
reports p50, p95, max, count, and logical counters for each operation. It runs four operations at
each fixture size:

- transaction: commit canonical state/event/outbox/idempotency records;
- lease: acquire and fence one lease per outbox record, then acknowledge with the current token;
- retry: schedule one retryable failure and one successful completion per event using logical time;
- replay: rebuild a projection with `sideEffectMode=NONE` while asserting canonical state and side-effect counters do not change.

The output status is `MEASURED_LOCAL_SYNTHETIC`. It must never be relabeled as production PASS or as
a browser/device/provider SLO. Wall-clock values are environment-dependent even though fixture data
and operation order are deterministic.

## Failure and recovery policy

Required implementation evidence must cover transaction crash points, duplicate/conflict provider
delivery, stale and expired leases, aggregate gaps, retry/poison/DLQ, replay side-effect rejection,
authorization revocation, privacy bounds, and malformed success. Accepted records are retained for
recovery; rollback uses a compensating isolated command or replay plan and does not delete evidence.

## Privacy and no-production boundary

Only bounded identifiers, hashes, typed references, counters, and diagnostics are permitted in the
fixture and evidence. No JWT, cookie, email, secret, payment detail, raw pixel/audio/PXD/package/game
body, private user content, production identifier, or provider credential is used. The harness does
not import or call current production code paths.

The following remain explicitly `UNTESTED`: production-equivalent Auth/DB/RLS/Storage/queue/provider,
real crash/restart persistence, browser/device behavior, network timing, cross-process concurrency,
financial/notification/search consumers, migration, deployment, rollback rehearsal, and cutover.

## Consequences

This decision makes early performance and evidence plumbing reproducible without contaminating shared
contracts or production paths. It also prevents synthetic fixture output from closing FP-004. The
implementation team must provide a production-equivalent adapter and independent attack review before
closing FP-004.

## Related records

- `docs/contracts/FP-004-DURABLE-EVENT.md`
- `docs/contracts/FP-004-CONFORMANCE-MATRIX.md`
- `docs/inventory/fp-004-evidence.json`
- `02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md`
