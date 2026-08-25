# FP-004 Durable Event / Inbox / Outbox Contract

Status: CONTRACT_ONLY / IMPLEMENTATION NOT STARTED
Updated: 2026-08-10
Scope: Core durability boundary only; no product implementation or production connection

## 1. Truth and relationship to WP-095

FP-004 extends the concepts in [`WP-095-EVENT-ACTIVITY.md`](WP-095-EVENT-ACTIVITY.md): trusted
post-commit facts, bounded envelopes, producer trust, transactional Outbox, at-least-once delivery,
consumer idempotency, aggregate ordering/gap checks, retry/DLQ, projection-only replay, and
separate Activity visibility.

The current WP-095 implementation at
[`core-shell/assets/core-event-activity-contracts.js`](../../core-shell/assets/core-event-activity-contracts.js)
is `IMPLEMENTED_ISOLATED`. It uses an in-memory Outbox and Synthetic Transaction Adapter. It is
not durable, does not survive process loss, and must not be counted as FP-004 completion.

FP-004 is `CONTRACT_ONLY` until the requirements below pass against a durable adapter and a
production-equivalent test environment. It must not connect to the current production database,
Storage, queue, route, provider credentials, Market, PiXiSYNC, or existing data.

## 2. Boundary ownership

| Boundary | FP-004 responsibility | Explicit non-responsibility |
| --- | --- | --- |
| Core | Validate envelope, bind trusted producer, authorize/revalidate, assign durable identity, atomically commit state and Outbox, accept Inbox, enforce idempotency/order/retry/replay rules | Provider SDK behavior, UI, raw files, payment execution |
| Tool product | Submit a validated command and consume a typed result | Publishing a client-supplied fact or bypassing Core |
| Provider adapter | Translate transaction, lease, queue, and provider event operations | Deciding authorization, inventing event identity, treating a provider response as success without validation |
| Production-equivalent | Exercise provider-shaped Auth/DB/Storage/queue semantics with synthetic tenants and data | Production rows, secrets, migration, deploy, public traffic |
| Cutover | Separate future rollout decision with shadow comparison and rollback | Implied by this contract or by a passing isolated test |

## 3. Canonical lifecycle

```text
command/request
  -> authenticate and resolve current context
  -> validate bounded command and provider identity
  -> revalidate authorization and aggregate version
  -> durable transaction:
       state update
       canonical Event row
       Outbox row
       Inbox acceptance/idempotency record
  -> commit
  -> lease Outbox delivery
  -> consumer Inbox acceptance
  -> projection or provider adapter
  -> durable result / retry / DLQ
```

An Event is a trusted fact after the state commit. A request, command, provider callback, or
client assertion is not an Event until this lifecycle succeeds.

## 4. Atomic state plus Outbox

The durable transaction adapter must provide one atomic boundary for the canonical state change
and the corresponding Outbox record.

Required invariant:

```text
commit(state update + canonical event + outbox row)
or
commit(none of them)
```

The Outbox row must contain a stable event reference, aggregate identity/version, schema version,
dispatch state, attempt count, next-attempt time, and privacy-safe diagnostic metadata. It must not
contain raw pixel/audio/PXD/package/game-build bytes, JWTs, secrets, PII, payment details, or
unbounded project bodies.

The adapter must expose an explicit transaction result. A provider response that says “success”
without a committed state, event, Outbox row, and validated result is rejected as malformed success.

## 5. Durable Inbox and provider event identity

Every externally delivered event must be accepted into a durable Inbox before acknowledgement to
the provider or transport. The Inbox must survive process restart and must record:

- `providerName` and `providerEventId` as a required stable pair;
- provider event type and provider schema/version;
- received time, payload hash, tenant/resource binding, and validation result;
- canonical event identity once mapped;
- processing state, attempt count, lease metadata, and final outcome.

The unique provider identity is `(providerName, providerEventId)`. A provider retry with the same
identity and the same canonical payload hash is a duplicate and must be acknowledged without
creating a second state change or side effect. The same identity with a different payload hash,
tenant, event type, or canonical mapping is an `IDEMPOTENCY_CONFLICT` and must fail closed, be
audited, and not be overwritten.

Missing, blank, malformed, or client-invented provider identity is not accepted. A provider
adapter may parse provider-specific fields, but Core owns the final identity and validation result.

## 6. Idempotency

Idempotency keys are scoped by operation and tenant/resource. The durable record stores the
request hash, canonical result reference, status, and schema version.

| Condition | Required result |
| --- | --- |
| Same key and same request hash | Return the original canonical result; no second mutation |
| Same key and different request hash | Fail closed with `IDEMPOTENCY_CONFLICT`; no mutation |
| Same provider identity and same payload hash | Duplicate acknowledgement; no second side effect |
| Same provider identity and different payload hash | Conflict quarantine; no overwrite |
| Missing/invalid key where required | Reject before state mutation |

An idempotency record must not be deleted merely because dispatch is paused or a consumer is
replayed.

## 7. Per-aggregate ordering and gaps

Ordering is required per `(tenantId, aggregateType, aggregateId)`, not as a global total order.
Each canonical Event carries an integer `aggregateVersion`.

- `version == expected next version`: accept and advance the aggregate head atomically;
- `version < expected next version`: treat as stale/duplicate; never roll state backward;
- `version > expected next version`: hold as a durable gap, request recovery or retry, and do not
  expose it as a contiguous projection;
- conflicting identity at the same aggregate version: fail closed and quarantine;
- an unresolved gap must not be silently skipped by Search, Notification, or Finance.

The gap record is bounded, tenant-scoped, privacy-safe, and observable. High-frequency editor
operations remain outside the Event Core, as required by WP-095.

## 8. Retry, backoff, poison, and DLQ

Every delivery result is one of `SUCCESS`, `DUPLICATE`, `RETRYABLE_FAILURE`, `NON_RETRYABLE_FAILURE`,
or `POISON`.

- Retryable failures use bounded exponential backoff with a maximum attempt count.
- Non-retryable and poison events stop automatic retry and move to a durable DLQ reference.
- DLQ records retain only the minimum privacy-safe diagnostic and event references needed for
  review/recovery.
- Retry and DLQ transitions are idempotent and lease-protected.
- Infinite retry, silent drop, and destructive “clear queue” behavior are forbidden.

Finance, Notification, and Search consumers must each have independent retry/DLQ state. A failed
Notification projection must not block a canonical state commit; a failed Finance projection must
not be treated as a successful financial mutation; a failed Search projection must remain
rebuildable from canonical events.

## 9. Replay without side effect

Replay is projection reconstruction only. It may rebuild Search documents, Notification inbox
projections, or audit/activity views from trusted canonical Events. It must not:

- send email, push, or in-app delivery again;
- charge, refund, create payout, or mutate a financial ledger;
- call a webhook or provider mutation endpoint;
- create a Market listing, purchase, royalty, entitlement, or public Social post;
- re-run a tool command or alter canonical state.

Replay must carry an explicit `replayRunId`, consumer scope, source cursor, and `sideEffectMode=NONE`.
Consumers reject replay if the mode is absent or permissive.

## 10. Concurrency and lease fencing

Outbox and Inbox workers use a durable lease with owner, fencing token, acquisition time, expiry,
and attempt number. Lease acquisition is compare-and-swap/transactional. A worker whose lease has
expired or whose fencing token is stale cannot acknowledge, complete, or emit a provider side
effect.

The provider adapter must support either an idempotent operation or a provider-side idempotency
key. Core must not claim exactly-once delivery; it provides at-least-once processing with durable
deduplication and fencing.

## 11. Authorization revalidation

Authorization is checked when a request enters and again immediately before the durable mutation
or consumer/provider side effect. The second check resolves the current authenticated principal,
tenant membership, resource ownership/capability, lifecycle, and relevant entitlement.

The FP-003AA context at [`FP-003AA-AUTHENTICATED-SERVER-CONTEXT.md`](FP-003AA-AUTHENTICATED-SERVER-CONTEXT.md)
is an isolated server boundary. It is not evidence of production Auth/RLS enforcement. A stale,
missing, quarantined, or contradictory context fails closed.

## 12. Malformed success rejection

The adapter must reject success when any required result is absent or inconsistent, including:

- no committed transaction identifier;
- no canonical event identity or aggregate version;
- no durable Outbox/Inbox record;
- missing provider event identity for an external callback;
- result hash, tenant, resource, or schema mismatch;
- a claimed authorization decision without a current authenticated context;
- a provider response that contains an unknown status or unsupported schema.

Malformed success is a failure identity, not a warning and not a best-effort continuation.

## 13. Consumer contracts

### Finance

Finance consumes only explicitly catalogued, authorized financial facts. It must use its own
idempotency key and durable result reference. Replay and duplicate delivery cannot create a second
ledger entry, charge, refund, payout, royalty, or entitlement. WP-003 financial concepts remain
separate from the FP-004 transport boundary.

### Notification

Notification consumes privacy-filtered events and resolves recipients server-side. Duplicate,
replay, and stale delivery cannot resend. Delivery attempts, quiet hours, preference decisions,
and DLQ state remain consumer-owned. The current WP-097 in-memory backend is a projection reference,
not durable evidence.

### Search

Search is a rebuildable projection and never an authorization authority. It accepts only trusted,
privacy-safe events and canonical snapshots. Duplicate/gap/replay handling must not expose a
private resource or retain a stale public document after a tombstone.

## 14. Crash-point matrix

The conformance suite must inject failure at each point and assert the required invariant.

| Crash point | Required outcome |
| --- | --- |
| Before transaction begins | No state, Event, Outbox, or Inbox mutation |
| After state write, before Event/Outbox write | Whole transaction rolls back |
| After Event/Outbox write, before commit | Whole transaction rolls back |
| After commit, before response | Retry returns the canonical result through idempotency |
| After Outbox lease, before consumer call | Lease expires/reclaims; no false completion |
| After consumer mutation, before acknowledgement | Duplicate delivery is absorbed by consumer idempotency |
| After provider call, before local completion | Provider idempotency plus lease fencing prevents a second mutation |
| During replay | Projection may resume; external side effects remain disabled |
| During DLQ transition | Event remains recoverable and is not silently discarded |

## 15. Rollback and production boundary

FP-004 must support independent stop of acceptance, Outbox dispatch, and each consumer. Rollback
preserves accepted records and uses a compensating command or isolated recovery/replay plan; it
does not delete evidence or mutate the current production path.

The implementation may use test fixtures, an in-memory adapter, and a production-equivalent
adapter. It must not connect to production DB/Storage/queues, use production credentials, alter
current routes, run migrations, deploy, publish, commit, or push.

## 16. Exit evidence

FP-004 can move from `CONTRACT_ONLY` only when all of the following are attached to the completion
record:

- durable adapter implementation and schema/version record;
- production-equivalent conformance results;
- crash, lease, conflict, ordering/gap, retry/DLQ, replay, authorization, privacy, and malformed
  success failure matrices;
- independent Finance, Notification, and Search consumer results;
- explicit statement that WP-095 in-memory behavior was not counted as durable;
- no-production-connection statement and unchanged current-path evidence.
