# PiXiEEDraw2 Timeline focused implementation

## Boundary

The Timeline UI is a local projection over the canonical Frame, Layer Track,
Cel, Undo, PXD, and PiXYNC contracts. Scroll position, active tab, density,
and multi-selection are local session state. Structural edits continue through
the existing `runTimelineCommand` path.

## Surface

- `Timeline`, `Tags`, `Markers`, and `Audio` are separate tab panels.
- Playback, FPS, loop, and Onion Skin stay in a compact toolbar. Onion options
  open from the single Onion button; low-frequency structural actions remain in
  the Timeline menu, cell context menu, and Frame × Layer corner action.
- The frame-number header and layer-name header remain fixed while the cel
  matrix owns bounded scrolling.
- Cells are square and expose EMPTY, OCCUPIED, LINKED, ACTIVE, SELECTED, and
  LOCKED projections through `data-*` state and accessible labels.
- Shift selects a range; Cmd/Ctrl toggles cells; frame and layer headers select
  their full row/column scope.
- The playhead is a non-interactive projection and never mutates raster data.
- Right-click opens a bounded context menu whose actions resolve through the
  existing structural command or local linked-cel adapter.
- Expanded, Compact, and Collapsed are layout states only.
- `▾` means expanded-to-compact, `⋯` means compact density, and `▴` means the
  rail is collapsed and can be expanded again. Structural edits clear local
  cell selection before activating the newly added target, so an old cel does
  not keep the active appearance.
- Application menu popovers are promoted to a viewport layer when open, so an
  icon-only menu rail at narrow desktop widths does not clip its panel.
- Audio is an explicit unavailable panel while the Audio feature flag is OFF;
  no fake controls or production write path are exposed.

## Performance boundary

`calculateTimelineWindow` remains the virtualization authority. Render work is
limited to the visible frame/layer window and is not coupled to pointer drawing
hot paths. Timeline UI state is not emitted as a canonical PiXYNC operation.

## Verification

```text
deno task check
deno task test
deno task build
deno task build:workspace
git diff --check -- pixiedraw2
```

Browser smoke coverage includes desktop/mobile tab switching, square cells,
range selection, bounded context menu, collapse cycle, Audio unavailable state,
and page overflow checks.
