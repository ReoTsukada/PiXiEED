# PiXiSYNC Draw2 190 — provider-neutral transport boundary

Status: `LOCAL_SYNTHETIC_GO`

## Scope

190 introduces the smallest transport seam that can later connect Draw2,
Audio, and Game to a provider. The new boundary is deliberately UI-free and
provider-neutral. It does not connect Supabase, Realtime, authentication,
product entry, or the durable journal.

The internal adapter is
`pixiedraw2/src/pixisync/transport.ts`; the public package entry is only
`pixiedraw2/src/pixisync/index.ts`, which does not import or re-export the
transport seam. The 190 composition root is intentionally export-free and does
not construct a production provider. Internal qualification tests inject one
provider once; a runtime `connect()` caller cannot replace that provider. The
caller requests only its local `projectId`, `clientId`, and
`sessionGeneration`. `PixisyncTransportProvider.open()` must return an
authenticated `binding` containing `projectId`, `roomId`, `actorId`, `clientId`,
`role`, and `sessionGeneration`, plus a connection with only three operations:

1. `submit(operation)` returns the authoritative committed operation and its
   canonical ACK metadata.
2. `fetchSince(afterProjectRevision)` returns authoritative committed
   operations in strictly increasing project-revision order.
3. `close(reason)` releases the provider connection.

The adapter itself exposes `connect`, `submit`, `catchUp`, and `close`. It
does not apply an operation. The caller remains responsible for passing the
committed operation through `PixisyncDurableJournal` and
`PixisyncOrderKeeper` before an aggregate adapter is invoked.

## Invariants

- Provider binding is the authority for `roomId`, `actorId`, and `role`.
  Provider-returned project, client, and generation must exactly match the
  local request; missing or substituted binding fields close and reject the
  connection.
- A `viewer` binding cannot submit operations.
- A connection has one monotonically increasing `sessionGeneration`.
  Callbacks from a replaced or closed generation are ignored.
- A submitted operation is accepted only after the existing 100 envelope
  validation succeeds and its client identity matches the connection.
- Provider operation delivery accepts only an event whose origin is
  `AUTHORITATIVE_TAIL`. Broadcast is a separate payload-free hint callback and
  cannot inject an operation.
- Tail callbacks re-check token, active session, status, and authenticated
  binding after asynchronous operation validation. Delivery occurs only in
  `SUBSCRIBED`.
- An ACK must match the operation ID, project ID, committed revision,
  aggregate revision, submission fingerprint, and committed fingerprint. The
  committed operation fingerprint must bind the submitted identity and payload.
  A submitted aggregate revision of `0` permits a positive server-assigned
  canonical revision; an explicitly submitted non-zero aggregate revision must
  match the committed revision exactly.
- An exact resend is represented as `DUPLICATE`; it is not locally applied by
  the transport layer and does not create a new operation ID.
- Catch-up must contain valid committed operations for the bound project and
  be completely contiguous from `afterProjectRevision + 1`; an initial or
  internal gap is rejected.
- Transport delivery order is not domain application order. The order keeper
  remains the only client-side ordered apply authority.
- No snapshot, raster, pointer sample, UI preview, raw audio blob, or
  authentication state is accepted by this boundary.

## Explicit non-goals

- No Supabase or Realtime implementation.
- No network calls, retry worker, outbox lease, ACK persistence, or inbox
  application.
- No Draw, Audio, or Game mutation and no local Undo/Redo mutation.
- No change to the 100–180 sources, product entry, or Supabase migrations.

## Evidence boundary

The 190 test is a deterministic provider fixture. Its 14 cases cover the API
seam, composition-root provider ownership, authenticated binding mismatch,
viewer rejection, tail/Broadcast separation, post-validation callback
fencing, full ACK fingerprint equality, duplicate ACKs, contiguous catch-up,
close fencing, generation reuse, and the public-index source boundary.
This is synthetic contract evidence only. Supabase, Realtime, browser
suspension, Safari, multi-tab provider sessions, staging, and production
remain `UNTESTED`.

Schema validation and semantic acceptance remain separate. Terra's focused
closure review accepted the local synthetic transport boundary; provider,
Realtime, staging, and production qualification remain separate work.

## Allowed artifacts

- `pixiedraw2/src/pixisync/transport.ts` (internal qualification seam)
- `pixiedraw2/src/pixisync/index.ts` (public entry; transport-free)
- `pixiedraw2/src/pixisync/composition-root.ts` (export-free production-root marker)
- `pixiedraw2/tests/pixisync/pixisync-draw2-190-transport.test.ts`
- this contract
- the 190 preflight manifest, result, evidence, and checkpoint
