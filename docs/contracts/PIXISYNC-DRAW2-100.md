# PiXiSYNC Draw2 100 — deterministic three-domain core

Status: `IN_PROGRESS` / synthetic-only foundation

## Scope

This package defines the first Draw2 synchronization boundary for one project shared by
Draw, Audio, and Game. It has no UI, browser, IndexedDB, Supabase, Realtime, filesystem,
audio blob, or snapshot dependency. The package is an in-memory deterministic reference
implementation for contract and adversarial tests only.

Existing owners remain authoritative:

- Draw keeps raster commands, operation identity, and local history.
- Audio keeps commands, journal, and audio asset/blob ownership.
- Game keeps canonical project revisions and asset references.
- FP-004 keeps the durable event/inbox/outbox concepts.

This package composes those concepts without importing or changing their runtime owners.

## Canonical envelope

Each submitted operation is bounded and contains:

`schemaVersion`, `operationId`, `projectId`, `aggregate`, `actorId`, `clientId`,
`clientSequence`, `baseProjectRevision`, `aggregateRevision`, `payloadHash`, `payload`.

The sequencer adds the server-owned `projectRevision` and `committedAt`. `committedAt` is
diagnostic metadata only and is excluded from identity and hashes. The submission fingerprint
binds the operation, project, aggregate, actor, client, client sequence, base revision,
payload hash, canonical payload, and compensation guard. The committed fingerprint also binds
the server-owned project and aggregate revisions. A payloadHash that does not match the
canonical payload is rejected.

Payloads are JSON-only, bounded, and command-level. Pointer samples, UI previews, snapshots,
and raw audio blobs are rejected. Cross-domain references may carry only an operation ID,
aggregate, and locked project/aggregate revision; they may not carry a copied snapshot.

## Ordering and delivery

Only the sequencer allocates the monotonically increasing `projectRevision`. Delivery is
transport-only. The consumer holds gaps, applies contiguous operations through the injected
aggregate adapter, ignores an exact duplicate, and rejects an operation ID reused with a
different payload. Reconnect catch-up replays the same ordered committed log.

An adapter failure is atomic from the sequencer's perspective: the project revision and
committed log do not advance. Remote apply failures remain visible to the caller and do not
mutate local undo state.

## Undo / redo and cross-domain references

Undo and redo are new compensating operations. They must name `targetOperationId` and include
either `expectedAggregateRevision` or a writer guard. A stale guard is rejected; history is
never deleted or rewound. Draw-to-Game and Audio-to-Game links are revision references, not
embedded snapshots.

## Acceptance IDs

- `PIXISYNC-DRAW2-100-ENVELOPE`: bounded validation and canonical payload hash.
- `PIXISYNC-DRAW2-100-SEQUENCE`: one project revision authority and atomic failure.
- `PIXISYNC-DRAW2-100-ORDER`: duplicate, reorder, gap hold, replay, and reconnect catch-up.
- `PIXISYNC-DRAW2-100-COMPENSATE`: stale and valid compensating undo/redo.
- `PIXISYNC-DRAW2-100-CROSS-DOMAIN`: Draw/Audio revision references consumed by Game.
- `PIXISYNC-DRAW2-100-BRIDGE`: no UI, preview, snapshot, raw blob, or transport leakage.

Semantic acceptance remains pending until an independent read-only review. This package does
not claim Supabase, browser, production, or multi-device qualification.
