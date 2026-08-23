# PiXYNC Draw2 180 — real-browser cross-tab CAS qualification

Status: `LOCAL_CHROMIUM_CROSS_TAB_PASS`

## Scope

This package qualifies the 170 IndexedDB compare-and-swap boundary in two
independent localhost browser tabs. The fixture uses only the dedicated
`pixisync-draw2-180-qualification-` database prefix and is not imported by the
Draw2 product entry.

## Required observations

1. Two tabs opening one project from an empty database both obtain the same
   valid initial snapshot hash.
2. Two journals opened from that same hash enqueue concurrently.
3. Exactly one enqueue succeeds and the other returns `SNAPSHOT_CONFLICT`.
4. The persisted record contains only the winning operation.
5. The losing journal retains its original hash and empty outbox.
6. Reopening the losing tab reloads the winner and converges to the persisted
   hash without silently overwriting it.

## Boundaries

- Database deletion is available only through the explicit fixture reset and
  only for the fixed qualification database.
- No product project, palette, raster, local Undo/Redo, Audio, Game, Supabase,
  Realtime, Web Locks, or BroadcastChannel state is read or written.
- The fixture proves localhost Chromium IndexedDB transaction behavior. Safari,
  physical-device suspension, quota exhaustion, staging, production, and
  cross-process behavior remain `UNTESTED`.

Schema validation and browser qualification are recorded separately. The
browser result does not by itself authorize Realtime transport integration.
