# DRAW-110 Raster and Editor Hot Path Contract

## Core reuse

`pixiedraw2/src/draw2/draw-110/raster-editor.ts` is an interaction adapter over
`pixiedraw2/src/draw2-core.ts`. It does not introduce a second raster, palette,
command, identity, or history authority. The existing Core validates project,
asset, sequence, bounds, palette index, interpolation, fill limits, dirty tiles,
COW, and canonical operation identity.

## Operations

- Pencil and Eraser use `raster.strokeCommit`; Eraser writes canonical palette
  index `0` and one stroke creates one local undo entry.
- Fill uses bounded `raster.fill` with an explicit maximum pixel count.
- Temporary Eyedropper reads a palette index and Hand changes only viewport
  projection. Neither creates a canonical command.
- Zoom and Pan use a nearest-neighbor viewport projection and never regenerate
  canonical raster bytes.

## Non-intrusion

The adapter has no DOM, Canvas, Storage, Network, PiXiSYNC, Market, or current
route import. The existing Draw2 entry may adopt it in a later presentation
integration; this package does not modify that entry or the production
`pixiedraw/` application.

