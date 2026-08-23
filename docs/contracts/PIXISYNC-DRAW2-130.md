# PiXiSYNC Draw2 130 — IndexedDB snapshot persistence

Status: `IMPLEMENTED_ISOLATED_REFERENCE_ONLY`

`pixiedraw2/src/pixisync/indexeddb-persistence.ts` implements the existing
`PixisyncSnapshotPersistencePort` for browser IndexedDB. It is project-bound:
each adapter reads and writes one object-store record keyed by `projectId`.

## Fixed boundary

- `atomicReplace` uses one `readwrite` transaction and replaces the complete
  snapshot record.
- Each adapter instance serializes `load` and `atomicReplace` through one
  Promise queue. A later call on that same instance cannot complete before an
  earlier call.
- Values are cloned before writes and after reads. JSON serialization is not
  used, and mutable storage aliases are not returned.
- Open, upgrade, request error, transaction error, and transaction abort are
  surfaced as rejected Promises with explicit adapter error codes.
- `PixisyncIndexedDbPersistenceOptions.indexedDB` injects a factory for
  Node/Deno or test environments without a host IndexedDB implementation.
- No database deletion API is exposed or called.

The adapter does not add CAS or expected-hash semantics because the existing
port has neither. Cross-tab and cross-process concurrency are explicitly
`UNTESTED`/unsupported. `productionReady` remains `false`.

## Evidence boundary

The 130 test double covers reload/open, project isolation, failed transaction
rollback, journal rejection of a tampered snapshot, same-instance atomic
replacement ordering, and factory injection. This is synthetic/isolated
qualification. Real browser IndexedDB, browser reload, multi-tab/process
concurrency, device durability, staging, provider transport, and production
readiness remain `UNTESTED`.
