# PiXiSYNC Draw2 120 — durable journal

Status: `IMPLEMENTED_ISOLATED_REFERENCE_ONLY`

`pixiedraw2/src/pixisync/durability.ts` composes the DRAW2-100 envelope
validators/fingerprints and `PixisyncOrderKeeper` with the FP-004 state names.
It is deliberately transport-free: no network, Supabase, DOM, IndexedDB,
filesystem, provider, or production composition root is included.

## Fixed boundary

The public API is `PixisyncDurableJournal.open(projectId, persistence, options)`
with `enqueue`, `leaseOutbox`, `acknowledgeOutbox`, `failOutbox`,
`acceptIncoming`, `leaseInbox`, `applyInbox`, `pruneConfirmed`, and `snapshot`.
Persistence is an injected `SnapshotPersistencePort` with `load` and
`atomicReplace`; `PixisyncSnapshotPersistencePort` remains the compatible
named interface. `PixisyncInMemorySnapshotPersistence` is only a restart
fixture.

Every staged mutation is cloned and validated with
`validatePixisyncDraft`/`validatePixisyncCommitted` and its operation
fingerprint before `atomicReplace`. The journal memory view is replaced only
after persistence succeeds. `AFTER_PERSIST_BEFORE_RESPONSE` therefore leaves
the persisted state recoverable while the crashing process retains its old
memory view.

## Snapshot and lifecycle

`PixisyncDurableSnapshot` has `schemaVersion`, `projectId`, `revision`, confirmed
revision/hash and retry/receipt indexes, a `vault` of draft/committed
envelope-plus-fingerprint entries, and Outbox/Inbox records. Restore verifies
the canonical snapshot hash, bounded JSON, envelope validators, and all stored
operation fingerprints.
Outbox states are `PENDING`, `LEASED`, `DISPATCHED`, `DLQ`; Inbox states are
`ACCEPTED`, `LEASED`, `COMPLETED`, `RETRYABLE`, `DLQ`, `CONFLICT`. Both record
attempt, next-attempt time, and lease owner/token/acquired/expiry metadata.

Outbox enqueue deduplicates an identical fingerprint and rejects a reused ID
with a different fingerprint. A lease expiry permits a new lease and makes
the old fencing token stale. ACK creates the committed envelope at the
confirmed project revision, updates the durable revision, and deletes the
draft only in the same persisted snapshot. A draft is never deleted before
confirmed revision binding. Retryable failures return to `PENDING`; the
bounded attempt limit moves the row to `DLQ`. A persisted `DISPATCHED` ACK can
be safely resent with the same fencing token.

Incoming operations are bound by `committedOperationFingerprint`. Reused IDs
with a different fingerprint and different IDs at one project revision are
recorded as `CONFLICT`. `applyInbox` calls `OrderKeeper.receive` first, records
an apply receipt `(operationId, fingerprint, projectRevision)`, then records
`COMPLETED`. A gap remains retryable for ordered replay. If the process fails
at `AFTER_APPLY_BEFORE_ACK`, restart sees the receipt and completes the Inbox
without invoking the adapter again.

Crash injection points are `BEFORE_COMMIT`, `AFTER_STAGE_BEFORE_PERSIST`,
`AFTER_PERSIST_BEFORE_RESPONSE`, and `AFTER_APPLY_BEFORE_ACK`.

Capability is intentionally fixed to:

```ts
{
  processDurable: false,
  productionReady: false,
  indexedDb: "UNTESTED",
  file: "UNTESTED",
}
```

## Evidence boundary

The durability test has 19 local tests covering restart/resend, duplicate and
conflict, fencing, ACK loss, deletion guard, all crash points used by the
fixture, incoming once/gap/retry/receipt recovery, tamper rejection, three
aggregates, DLQ, capability, and atomic persistence failure. DRAW2-100 and
110 regression tests also pass. This is synthetic/in-memory qualification;
IndexedDB, file durability, browser/device, staging, provider, production,
and cross-process qualification remain `UNTESTED`. Independent read-only
review remains separate from LUNA's self-test.
