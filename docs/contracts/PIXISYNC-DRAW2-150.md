# PiXYNC Draw2 150 — Workspace project lifecycle

Status: `IMPLEMENTED_ISOLATED_NOT_PRODUCT_WIRED`

`pixiedraw2/src/pixisync/project-lifecycle.ts` owns only the lifecycle of a
project-bound durable journal. It receives the Workspace project-change event
through an injected `EventTarget`; it does not own Draw, Audio, Game, UI,
transport, authentication, or canonical project identity.

The coordinator opens the initial project, serializes switches, flushes and
stops the old journal before opening the new project-bound persistence, and
publishes only bounded phase/project/generation metadata. `OPEN` for the active
ID is idempotent; `NEW` deliberately reopens it. A generation guard prevents a
slow intermediate open from becoming active after a newer switch request.

An open, flush, stop, or substituted-project failure never reuses the previous
journal under the requested ID. State becomes `UNAVAILABLE`, while the queue
remains able to process a later explicit project change. Disposal removes the
listener and drains the active journal.

Seven isolated tests cover initial open, ordered switch, OPEN/NEW behavior,
stale intermediate results, open failure, disposal, substituted identity, and
flush-failure recovery. The combined DRAW2-100/110/120/130/150 suite has 45
passing tests.

The module is not yet imported by `draw2-entry.ts` or `wp180-workspace-ui.ts`.
Actual product event wiring, page lifecycle, Safari, multiple tabs, transport,
Supabase, staging, and production remain `UNTESTED`.
