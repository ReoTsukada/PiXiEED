# ADR-20260813 — FP-006 Host-Neutral Input and Device Adapter Boundary

## Decision

FP-006 introduces a DOM-free TypeScript contract and state machine under
`pixiedraw2/src/fp-006/`. Browser and future native hosts translate their
pointer/capability events into this contract. The existing Draw2 entry remains
the current adapter and is not replaced in this work package.

## Reasons

- One stroke must produce one Core command/Undo boundary on every host.
- Browser pointer capture, native touch, and stylus events have different
  delivery details but must share the same recovery semantics.
- Workspace changes must not cause Canvas hot-path global rerenders.
- Physical-device and provider claims must remain separate from isolated tests.

## Rejected alternatives

- Rewriting `pixiedraw2/src/draw2-entry.ts` in this package would mix the
  adapter migration with the contract qualification and risk regressions.
- A UI-framework global store for each pointer sample would violate the hot
  path boundary.
- Width-only mobile detection would misclassify touch-capable tablets and
  unknown native hosts.

## Non-intrusion

No current `pixiedraw/` files, routes, PXD/PiXiSYNC data, Market data,
production providers, or native signing files are changed by this decision.

