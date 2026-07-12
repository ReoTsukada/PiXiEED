# PiXiEEDraw DEV Pre-update Checkpoint (Phase U3)

## Scope

This is a DEV-only update safety checkpoint. It does not activate a Service
Worker, call `skipWaiting()`, reload the page, or change Autosave V1, Autosave
V2 experimental, recent projects, or recovery.

The entry point is:

```js
await window.__pixieedrawPreparePreUpdateCheckpoint({ targetBuildInfo });
```

It is intentionally not wired to an update-apply button in U3.

## Data model and lifecycle

The dedicated IndexedDB database is `pixieedraw-pre-update-checkpoints-dev`.
It has two stores: `sessions` and `records`. This keeps the data outside both
the V1 autosave database and `pixieedraw-autosave-v2-experimental`.

Each run creates `pre-update-<timestamp>-<random>`. A session moves through
`preparing`, `writing`, `verifying`, then `ready`. A failed run is marked
`failed`; its records are removed where they were written. Only `ready`
sessions are eligible for U4.

The session stores build edition/version/buildId, active sheet ID, explicit
sheet order, sheet count, and per-record digests. Every record stores its tab,
project and sheet identities, source kind, order, active flag, payload, and
metadata.

## Snapshot and verification

The active sheet is built directly from the current runtime snapshot with its
current session. Inactive sheets are read without activation from their
resident payload, deferred payload, or their sheet-specific local payload.
Missing data fails the entire checkpoint; no sheet switch is attempted.

Payload and metadata use canonical key ordering. Typed arrays and ArrayBuffers
are represented by constructor name and bytes before SHA-256 hashing. A digest
failure fails the whole session. The records are written as one IndexedDB
transaction, then read back from IndexedDB and checked for identity, order,
source kind, document summary, build data, and both digests.

After readback, the current sheets are snapshotted again. The second pass uses
a revision digest that excludes only package `updatedAt`, which is regenerated
when packaging an otherwise unchanged document. Any real payload, sheet order,
or active-sheet change returns `ERR_PRE_UPDATE_REVISION_CHANGED` rather than
`ready`.

## Failure and retention

Structured recoverable errors include snapshot, payload, digest, write,
readback, verify, revision-change, session-commit, and in-flight failures.
They never alter the active tab, document identity, URL, Service Worker state,
or editor availability. The utility always releases its in-flight state.

The newest three `ready` sessions are retained. Cleanup is best effort and is
separate from a successful checkpoint. Failed or incomplete sessions are never
considered ready and have their records invalidated.

## Validation

`scripts/test-pixiedraw-dev-pre-update-checkpoint-u3.mjs` covers multi-sheet
readback, source kinds, typed data, metadata and payload digest checks,
write/readback failures, tampering, revision races, and concurrent requests.
Browser validation remains required for actual IndexedDB persistence with live
image/GIF sheets and drawing during a checkpoint.

## U4 handoff

U4 may use only an explicit `ready` session returned by the helper. It must
coordinate user confirmation, Service Worker activation, other tabs, and one
reload without weakening the U3 readback or revision checks.
