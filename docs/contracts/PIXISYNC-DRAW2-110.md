# PiXiSYNC Draw2 110 — canonical domain adapter contract

Status: `IN_PROGRESS` / synthetic-only adapter and integration harness

## Scope

PIXISYNC-DRAW2-110 connects the existing transport-free Draw2 aggregate core to
the canonical Draw, Audio, and Game APIs. It owns only bounded adapter payloads
and injected aggregate-apply ports. It does not own transport, UI, DOM, browser
storage, network, provider state, or any editor's private history.

The existing owners remain authoritative:

- Draw owns `CanonicalOperation`, `CommandResult`, raster state, and private
  `Draw110Editor` history.
- Audio owns `AudioCommand`, `AudioJournalEntry`, `dispatchAudioCommand`, and
  `AudioProject.stateHash`.
- Game owns `GameProject`, `JournalCommand`, revision snapshots, and
  `appendJournalCommand`.
- PIXISYNC-DRAW2-100 owns the bounded envelope, project ordering, aggregate
  revision, idempotency, and transport-free sequencer/order keeper.

## Shared adapter boundary

Each adapter has two explicit halves:

1. A draft builder binds the operation identity supplied by the canonical owner
   to `operationId`, `projectId`, `actorId`, `clientId`, and `clientSequence`
   without normalizing or replacing it.
2. An aggregate apply port is injected by the composition root. The port returns
   applied identity and canonical state metadata. The adapter verifies the
   returned values after apply; a failed verification rejects the operation.

Payloads are bounded command-level JSON. `beforeState`, `afterState`, Game
 snapshots, pointer/UI previews, raw bytes, and blobs are not payload fields.
 Remote apply ports expose `preservesLocalHistory: true`; remote delivery never
 calls a local undo/redo stack or changes local undo depth.

## Draw

`createDrawOperationDraft()` accepts a canonical `CommandResult`, binds the
operation identity and structure epoch/base, and emits only the operation's
command payload plus bounded metadata. It never reads or serializes
`Draw110Editor` private history.

`createDrawPixisyncAdapter()` reconstructs a canonical operation and calls the
injected Draw port. The receipt must match operation ID, project, asset, actor,
client, sequence, and structure epoch/base, and must return the expected raster
hash. A port may apply through `EditorCore.execute`; the adapter does not
require a concrete editor class.

## Audio

`createAudioOperationDraft()` uses `AudioJournalEntry.command` and bounded audit
metadata (`entryHash`, `sequence`, `kind`, `entryId`). It never includes
`beforeState` or `afterState`, and never includes raw bytes/blob content.

The Audio port must dispatch a `COMMAND` through `dispatchAudioCommand` or an
equivalent canonical command API. `UNDO` and `REDO` are represented as
compensation envelopes and are not remote history rewind calls.

## Game

`createGameOperationDraft()` emits the `JournalCommand` identity, `beforeHash`,
`afterHash`, sequence, and a revision descriptor (`revisionId`, parent revision,
sequence, and `revisionHash`). `revisionHash` is the transport-safe name for
the canonical revision `snapshotHash`, because DRAW2-100 rejects payload keys
containing `snapshot`; only the hash descriptor is sent, never the project.

The Game port resolves the canonical `GameProject` by `afterHash` and
`revisionId`, verifies project/revision/parent/hash identity and the current
`beforeHash`, then calls `appendJournalCommand`. Resolver substitution, stale
parent, missing revision, and hash mismatch are rejected before append.

## Acceptance IDs

- `PIXISYNC-DRAW2-110-DRAW-CONVERGENCE`: Draw local commit, draft, canonical
  remote apply, and raster hash convergence.
- `PIXISYNC-DRAW2-110-DRAW-HISTORY`: remote Draw apply leaves local undo depth
  unchanged and does not enter private history.
- `PIXISYNC-DRAW2-110-AUDIO-CONVERGENCE`: Audio command journals converge to
  one state hash through the formal command API.
- `PIXISYNC-DRAW2-110-AUDIO-BOUNDARY`: Audio snapshot/state/raw payload leakage
  is rejected and undo/redo are compensation envelopes.
- `PIXISYNC-DRAW2-110-GAME-CONVERGENCE`: Game descriptor resolution and formal
  journal append converge to one current revision/hash.
- `PIXISYNC-DRAW2-110-GAME-BOUNDARY`: resolver substitution, hash mismatch, and
  stale parent are rejected without journal advancement.
- `PIXISYNC-DRAW2-110-ORDER`: Draw, Audio, and Game drafts are applied in
  project order by the existing PIXISYNC-DRAW2-100 order keeper.
- `PIXISYNC-DRAW2-110-IDENTITY`: project/actor/client/operation identity
  substitution, stale base, and operation mismatch are rejected.
- `PIXISYNC-DRAW2-110-ATOMIC-FAILURE`: apply failure does not advance the
  existing sequencer revision.

Semantic acceptance remains pending until an independent read-only review. This
package proves synthetic/local integration only; browser, device, staging,
production, and provider qualification remain `UNTESTED`.
