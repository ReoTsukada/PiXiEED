# DRAW-120 Selection / Transform Contract

## Authority and scope

`pixiedraw2/src/draw2/draw-120/selection-transform.ts` is a presentation-neutral
adapter over `pixiedraw2/src/draw2-core.ts`. It does not create a second raster,
palette, project, Cel, or history authority. Selection and transform preview
state are local projections; only a committed write set mutates canonical
Project State.

The adapter is intentionally free of DOM, Canvas, IndexedDB, OPFS, network,
provider, current-route, production PiXiEEDraw, PXD, PiXiSYNC, and Market
imports.

## Selection

- Active Cel is the only selectable and mutable scope.
- Rectangle selection is deterministic and supports `REPLACE`, `ADD`,
  `SUBTRACT`, and `INTERSECT`.
- Selection points are deduplicated, sorted by `y` then `x`, and retain a
  deterministic bounding rectangle.
- Selection changes do not create Canonical Operations or Undo entries.
- Empty, non-integer, and out-of-bounds selections fail closed.

## Transform preview

- Move, horizontal/vertical flip, quarter-turn rotation, and bounded nearest
  neighbor scale are supported.
- Preview never mutates the canonical raster or history.
- Preview writes are bounded to the active Cel and use palette indices only.
- Cancel discards preview state without mutation.
- Commit emits one bounded `raster.writeSet`, producing one operation and one
  Undo unit.
- Invalid, non-finite, zero/negative, or out-of-range transforms are rejected.

## Clipboard

- Copy captures indexed palette values from the active Cel selection.
- Cut is one atomic write set that clears selected pixels to transparent index
  `0`.
- Paste preserves palette indices and rejects out-of-bounds destinations before
  canonical mutation.
- Copy itself is local and does not create a Canonical Operation.
- Cut and Paste each create exactly one Undo unit when they mutate pixels.

## UI adapter requirements

Desktop direct manipulation and mobile sheet/handle controls must call the same
selection and transform methods. Keyboard/button alternatives are required for
drag-only actions. The presentation layer must expose accessible names,
tooltips, shortcut hints, disabled reasons, cancel, and focus restoration; it
must not put panel or theme state into the Project State.
