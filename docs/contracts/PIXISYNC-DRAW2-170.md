# PiXYNC Draw2 170 — IndexedDB cross-tab CAS

Status: `LOCAL_SYNTHETIC_PASS`

## Scope

This package adds optimistic snapshot concurrency to the existing project-bound
IndexedDB persistence boundary. It does not synchronize editor payloads and it
does not connect a network transport.

## Authority and behavior

- `PixisyncSnapshotPersistencePort.compareAndSwap` is optional so existing
  isolated persistence ports retain their legacy `atomicReplace` behavior.
- The IndexedDB implementation performs `get`, expected-hash comparison, and
  `put` in one `readwrite` transaction keyed by `projectId`.
- Journal creation uses an expected hash of `null`. If another tab creates the
  initial snapshot first, the losing opener reloads and validates that snapshot.
- Later journal commits use the journal's current `snapshotHash` as the expected
  value. A stale writer receives `SNAPSHOT_CONFLICT`.
- A conflict or transaction abort does not advance the stale journal's in-memory
  snapshot and does not replace the persisted winner.
- Project IDs remain isolated; activity in one project cannot conflict with a
  different project record.

## Non-goals

- No BroadcastChannel, Web Locks, Supabase, Realtime, operation dispatch, or
  automatic merge is introduced.
- Draw, Audio, Game, raster, palette, viewport, transient UI, and local Undo/Redo
  state are not copied into a new synchronization path.
- A stale tab must reopen/rebase before retrying; silent last-writer-wins is
  forbidden.

## Evidence boundary

The repository-bound preflight and Deno fake-IndexedDB tests cover transaction
shape, one-winner conflict behavior, project isolation, journal memory safety,
initial creation, abort rollback, and legacy fallback. Real browser multi-tab,
Safari, device suspension, quota exhaustion, staging, and production remain
`UNTESTED` until a dedicated browser qualification package runs.

Schema validation and semantic acceptance remain separate. Luna does not grant
independent reviewer acceptance.
