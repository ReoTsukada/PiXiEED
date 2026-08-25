# DRAW-130 Layer / Frame / Cel / Timeline Contract

## Canonical structure

The Timeline uses the Aseprite-compatible model `Layer × Frame = Cel`. Layer,
Frame, and Cel identity remains in the Draw2 `ProjectState`; the adapter does
not introduce a second raster or project authority. New layers and frames
create the corresponding empty Cel grid. Duplication uses an explicit shared
reference binding instead of silently copying pixel bytes.

## Structural operations

- Layer visibility, lock, opacity, rename, add, duplicate, and remove.
- Frame add, duplicate, remove, duration, and FPS metadata.
- Cel create, clear, and explicit asset binding replacement.
- Every accepted structural operation increments `structureEpoch`, records a
  deterministic operation identity, and creates exactly one Undo entry.
- Last Layer and last Frame removal is rejected. Unknown Layer/Frame/Cel/Asset
  references are rejected before mutation.
- Hidden or locked layers cannot be selected as the active writable target.

## Projection-only state

Onion Skin and Playback are presentation projections. They never mutate the
canonical raster, structural hash, or Undo history. The Timeline projection
returns a bounded visible window, overscan, and mounted/rendered metrics. It
does not materialize the full 1000 × 100 grid.

## UI contract

Desktop uses a bottom Timeline; Tablet may collapse it; Mobile uses a Canvas-first
sheet. All three call the same structural methods. Drag-only actions must have
keyboard/button alternatives and accessible row/cell names. Panel arrangement,
playback cursor, hover, and onion-skin visibility remain local presentation
state rather than PiXiSYNC operations.
