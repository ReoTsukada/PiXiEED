# PIXISYNC Draw2 210 — authenticated Supabase-like provider boundary

Status: `LOCAL_SYNTHETIC_GO`

## Scope

210 adds one internal Provider that composes the existing 190 transport contract
with a deliberately small, SDK-free Supabase-like port. The Provider does not
import Supabase, make network calls, alter a product entry, publish a public
index, or add a migration.

The port models only these server-authoritative operations:

1. `auth.getUser()` returns a server-validated authenticated user.
2. `pixisync_draw2_open_session_v1` resolves canonical project membership and
   returns the room, actor, membership revision, client, generation, and role.
3. `pixisync_draw2_commit_operation_v1` returns one authoritative ACK row.
4. `pixisync_draw2_get_operations_since_v1` returns authoritative committed
   operation rows.
5. Realtime broadcast `pixisync_hint` is a payload-free catch-up hint.

The implementation is `pixiedraw2/src/pixisync/supabase-provider.ts`. Its only
dependency is the structural `PixisyncSupabaseLikePort`; it has no SDK type or
runtime import.

## Authority and session rules

- `auth.getUser()` is required at open and before every submit/fetch action.
- The authenticated user ID and the exact `pixisync_open_session` row are the
  only authority for actor, room, membership, and role.
- `user_metadata` and `app_metadata` are not read and cannot grant membership
  permissions.
- The caller supplies only project, client, and session generation. The Provider
  never accepts caller actor, room, role, membership, or authority fields.
- `clientId` and `sessionGeneration` are fixed for the connection. A changed
  authenticated user, membership, role, room, actor, client, or generation
  closes the connection and fails closed.
- A viewer may fetch but cannot submit.
- Submit/fetch performs a second session check after the asynchronous RPC, so a
  revocation during the RPC cannot produce a successful result.

## Row validation

The Provider rejects malformed or substituted rows before returning them to the
190 adapter.

- Auth principal, room, actor, and membership identifiers are canonical UUIDs.
- Project/client identifiers use the existing bounded transport identifier rule.
- Membership revisions use a bounded revision token.
- Project and aggregate revisions are non-negative safe integers; committed
  revisions must be positive and fetch results must be contiguous.
- Submission and committed fingerprints must be lowercase SHA-256 values and
  must equal the canonical fingerprints calculated from the operation.
- Commit rows, session rows, and fetch arrays reject missing or unexpected
  fields.
- Committed operations are revalidated by the existing 100 envelope validator.

## Realtime rule

The broadcast callback discards the received payload entirely. It can invoke
only `onBroadcastHint()`. It cannot inject an operation, revision, actor,
payload, ACK, or snapshot. Callbacks after `close()` are ignored because the
connection is fenced before unsubscribe completes.

## Explicit design gate: existing RPC compatibility

Before any real Supabase composition or migration is considered, the existing
RPC contract must be classified:

`PIXISYNC-210-GATE-A` — If the existing RPC is pixel-only, for example it
requires a pixel-specific table, payload, operation type, or response shape, it
is **not** a compatible implementation of the generic Draw/Audio/Game operation
envelope. It must not be adapted by silently dropping fields, embedding a
generic envelope in an undocumented pixel column, or treating pixel success as
generic success.

The gate remains `PENDING / STOP` until one of the following is produced:

- a versioned generic RPC contract that accepts and returns the existing
  `PixisyncOperationDraft` / `PixisyncCommittedOperation` envelope for `draw`,
  `audio`, and `game`; or
- a separately versioned adapter contract with an explicit, lossless mapping,
  per-aggregate validation, canonical revision ownership, idempotency rules, and
  proof that no generic field is discarded.

The existing production migrations were inspected. Their current
`pixisync_commit_operation` and `pixisync_get_ops_since` contracts are pixel
patch specific and are not compatible with the generic Draw/Audio/Game envelope.
The three versioned Draw2 RPC names above are reserved contracts; they do not
exist yet. Therefore this package cannot be connected to a real Supabase client
until a separately reviewed migration implements them.

## Test evidence

The deterministic test covers:

- missing authentication;
- membership replacement and revocation;
- viewer authorization;
- user switching;
- stale Realtime callbacks;
- malicious Realtime payload ignored;
- RPC failure;
- membership revocation while a commit RPC is in flight;
- strict ACK identity, revision, UUID, and fingerprint checks;
- fixed client/generation and caller-authority rejection;
- contiguous catch-up and gap rejection;
- close fencing;
- Realtime subscription failure.

This is local synthetic evidence only. Real Supabase Auth, RLS, RPC, Realtime,
staging, Safari suspension, multi-device behavior, and production remain
`UNTESTED`. The existing 190 and 200 contracts remain unchanged.

## Allowed artifacts

- `pixiedraw2/src/pixisync/supabase-provider.ts`
- `pixiedraw2/tests/pixisync/pixisync-draw2-210-supabase-provider.test.ts`
- this contract
