# PiXiEEDraw DEV RGB-to-Indexed Immediate Palette Refresh

## Cause

The RGB-to-Indexed mode switch did not use the existing
`convertCurrentDocumentRgbPixelsToIndexedPalette()` path. It constructed a
minimal draw-color palette instead, so the all-pixel indexed conversion and
the UI refresh contract were not one operation. A subsequent sheet restore
reapplied the saved document through its full render pipeline, which made the
palette appear only after leaving and returning to the sheet.

## Commit and Refresh Order

The RGB-to-Indexed switch now uses the existing conversion function, which:

1. Extracts colors from current direct layer data.
2. Builds the indexed palette with the existing palette capacity and quantizer
   path.
3. Writes layer indices and clears direct/import source pixel buffers.
4. Updates active and secondary palette indices plus `activeRgb`.

After `state.colorMode` is committed, the shared palette UI sequence is:

```text
syncColorModeControls()
-> renderPalette()
-> syncPaletteInputs()
-> updateColorTabSwatch()
-> focusUnifiedLeftContext('color')
```

The same `renderPalette()` path rebuilds desktop and mobile swatches, selected
and secondary states, count-dependent controls, color preview, quick palette,
and floating draw-color preview. No sheet activation or synthetic tab switch is
used.

## Persistence and History

`applyPaletteChange()` remains the successful commit path. It marks history
dirty, schedules the session persistence that captures the active sheet
snapshot, requests canvas/overlay rendering, and updates the color tab. The
conversion now starts and commits the existing `colorModeConvert` history item;
Undo/Redo restore through the normal snapshot application pipeline and hence
use the same palette renderer.

No autosave schema, U3 store, V2 archive codec, GIF decoder, GIF metadata, or
sheet switching behavior changed.

## Diagnostics

DEV logs use `[rgb-to-indexed-palette]` and report phase, color modes, palette
lengths, active palette index, UI swatch count, direct/indexed layer counts,
and active sheet ID. They deliberately omit file names, palette values, and
pixel data.

## Validation

`scripts/test-pixiedraw-dev-rgb-to-indexed-palette-refresh.mjs` verifies the
conversion writes indices, clears direct buffers, keeps palette indices in
range, schedules persistence/rendering, commits history, and retains the
explicit immediate UI refresh sequence.

Browser verification remains required for PNG and GIF imports, swatch drawing,
Undo/Redo interaction, and responsive desktop/mobile palette panels.
