# FP-006 Recovery Contract

## Input state

`StrokeInputController` is a small state machine at the Canvas adapter
boundary. It has one owner at a time: Draw, Pan, Pinch, Panel Scroll, or
Timeline. A committed stroke emits exactly one `stroke_committed` event, which
is the adapter's single Undo/Command boundary. Pointer samples never emit an
Undo operation directly.

## Cancellation and capture

- `pointercancel`, `lost_capture`, and browser interruption discard the open
  stroke and return to an idle or explicitly continuing gesture state.
- Pointer-up outside the Canvas is still a release of the captured Canvas
  pointer and commits exactly once.
- A second touch pointer cancels the uncommitted one-finger Draw before
  entering Pinch. The cancelled points must not reach Raster or Undo.
- Panel and Timeline pointers cannot create a Canvas stroke.

## Journal/checkpoint boundary

The `RecoveryCheckpoint` records only an open/committed/cancelled stroke
identity, point count, and journal sequence. An incomplete open stroke is
discarded by default rather than replayed blindly. A committed checkpoint is a
no-op, preventing a duplicate command after a crash. Durable storage adapters
remain outside this package and must apply the same idempotency rule.

