# PiXYNC Draw2 160 — product wiring gate

Status: `LOCAL_CHROMIUM_PRODUCT_WIRING_PASS`

## Scope

This package is a read-only static gate for the product composition in
`pixiedraw2/src/draw2-entry.ts`. It does not change Draw2, Audio, Game,
PiXYNC transport, Supabase, Realtime, or cache-buster files.

The product wiring is expected to connect the already-qualified 150 lifecycle
coordinator only. The coordinator remains the authority for project-bound
journal switching; Draw2 remains the authority for its editor state.

## Required wiring

`draw2-entry.ts` must satisfy all of the following:

1. Subscribe the lifecycle coordinator through the shared
   `WORKSPACE_PROJECT_CHANGED_EVENT` and the shared `window` EventTarget.
2. Use the active workspace project identity from
   `readActiveWorkspaceProjectId()` or a state identity that has already been
   resolved from that source. The current wiring uses `state.projectId` after
   startup restoration.
3. Create IndexedDB persistence with the requested project ID and call
   `PixisyncDurableJournal.open(projectId, persistence)`.
4. Dispose the local lifecycle on a real `pagehide`; keep bfcache pages alive
   when `event.persisted` is true. A hidden document must drain local pending
   persistence and cancel transient editor interaction as the existing
   visibility boundary requires.
5. Publish only bounded lifecycle metadata through `document.body.dataset`:
   phase, project ID, and generation. No raster, history, palette, payload,
   Audio, Game, or UI preference data may be published by the PiXYNC wiring.

## Explicit non-goals

The 160 product gate must reject or remain free of:

- Supabase or Realtime imports, subscriptions, broadcasts, or sends;
- operation dispatch, command forwarding, or transport queues;
- Draw/Audio/Game payload synchronization;
- editor preferences, palette, viewport, mirror, raster, or undo history
  synchronization;
- cache-buster rewrites.

The test may detect and report the current Draw2 entry cache-buster. It must not
edit `pixiedraw2/index.html` or any built asset.

## Evidence boundary

The static gate is supplemented by a localhost Chromium 151 product run. The
loaded bundle opened the restored project as `active`, an actual Project Open
UI operation advanced the lifecycle generation and activated the requested
project ID, and an actual page reload restored that same ID as `active` with
no browser warnings or errors. An IndexedDB/PiXYNC startup failure is isolated
to `pixyncState=unavailable`; it does not reject the Workspace UI bootstrap.

Safari behavior, multi-tab fencing, IndexedDB quota behavior, Supabase
transport, staging, and production readiness remain `UNTESTED`.

## Allowed changes

Only the following package artifacts are in scope for this gate:

- `pixiedraw2/tests/pixisync/pixisync-draw2-160-product-wiring.test.ts`;
- this contract;
- the 160 preflight manifest, result, evidence, and checkpoint.

No commit, push, deploy, network access, migration, or product source edit is
part of this package.
