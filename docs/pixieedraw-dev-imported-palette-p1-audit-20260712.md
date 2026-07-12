# PiXiEEDraw DEV Imported Palette Audit (Phase E4-B / P1)

## Scope and Fixed Contract

This phase audits and fixes the palette contract only. It does not connect
palette generation to PNG/GIF import, Canonical V2, runtime commit, autosave,
U3, or archive encoding.

## External Input Color-Mode Policy

The default external raster policy is RGB:

- PNG, GIF, JPEG, and WebP image imports open as RGB even when their source
  container happens to contain an indexed palette. The current decode path
  produces completed RGBA pixels and does not retain a safe source index map.
- PiXiEEDraw V1/V2 project files preserve Indexed mode only when their stored
  palette and per-pixel indices validate together. They are project restores,
  not raster image imports.
- Converting an imported RGB sheet to Indexed is an explicit later operation.
  It creates a palette/remap candidate and uses the existing quantizer only if
  the Indexed capacity is exceeded.

### RGB External Import Palette Rule

RGB external import does not generate a palette from source image colors. P2-B
will clone the user's configured palette into the new sheet; it will not retain
or create the former 16-color import default palette. Imported RGBA pixels
remain unchanged, and `activeRgb` remains independent from palette selection.
Only explicit Indexed import/conversion extracts colors, builds a palette, and
remaps pixel indices atomically.

The revised P2 target contract is:

- Palette ownership is per sheet/project payload, never a project-wide shared
  import palette.
- Multi-canvas sheets combine all canvas pixels into one sheet palette.
- GIF uses completed/composited RGBA frames from the existing decoder, not raw
  GIF rectangles, and combines all frames into one sheet palette.
- RGB import preserves source RGBA bytes and uses the existing configured
  palette. It must not generate a palette from imported colors or reduce RGB
  pixels.
- Indexed import builds the palette and pixel remap as one candidate, validates
  both, then commits atomically.
- Fully transparent pixels are one transparent category regardless of hidden
  RGB values. Semi-transparent RGBA colors remain distinct.
- Truecolor ordering is frame, canvas, then scanline first occurrence. Indexed
  source palettes retain their original order after unused colors are removed.

## Current Ownership and Import Behavior

The active sheet's document owns `document.palette`, `activePaletteIndex`,
`secondaryPaletteIndex`, and `activeRgb`; project/session serialization carries
those values with each sheet's packaged project. Switching sheets restores that
sheet's document state. No project-wide palette table is used.

Current external image/GIF import does **not** generate an input-derived
palette. `loadDocumentFromImageFile()` creates `createRgbModeDefaultPalette()`
(16 colors), selects index 2, copies it to `activeRgb`, and sets
`colorMode: 'rgb'`. It does not merge the previous active sheet palette, but it
does automatically add the RGB default palette. This is the precise current
behavior that P2 must replace for external-input candidates.

RGB drawing uses `state.activeRgb` for the currently selected palette slot;
Indexed drawing resolves `state.activePaletteIndex` against `state.palette`.
RGB pixel data is stored in `layer.direct`/`layer.importSourceDirect`; Indexed
pixels use `Int16Array` `layer.indices`. The array's numeric bit width is
signed 16-bit, but the intentional Indexed palette capacity is 256.

## Existing Quantization System

`color-codec-utils.js` provides the existing reusable quantizers:

- `quantizeRgbaColorEntriesWithMapping(colors, maxColors)`
- `quantizeRgbaColorEntriesWithWeightedKMeans(colors, maxColors)`
- RGBA median-cut fallback for more than 8,192 color entries
- `reduceRgbaColorEntriesByClosestPairsWithMapping(...)` for palette-reduction
  workflows

For up to 8,192 nontransparent entries, the main function uses deterministic
weighted k-means: deterministic first center selection, deterministic
farthest/weighted center seeding, and five or eight fixed iterations. Above
that threshold it uses deterministic RGBA median-cut boxes. Both use the
existing RGBA distance with alpha weighting. No worker, cancel, abort, or
runtime mutation is involved in these pure color-codec functions.

The quantizer filters `a <= 0`; transparent storage is handled separately.
Semi-transparent colors remain inputs and alpha participates in distance. The
function returns both a palette and `sourceIndexToPaletteIndex`, so it is
candidate-first compatible for an Indexed pixel remap.

Current callers are RGB-to-Indexed conversion, indexed palette reduction, and
clipboard/selection palette operations. `buildIndexedPaletteFromFrameDataList`
already scans multiple RGBA frame arrays, extracts first-seen opaque and
semi-transparent colors, reserves transparent pixels in frame indices, and
uses the mapping quantizer when more than 256 colors are present.

It is reusable for GIF's completed-frame inputs, but its current runtime
conversion caller pads an Indexed palette to 256 colors with generated unused
colors. P2 must not reuse that padding behavior for imported-sheet palettes.

## Capacity and Transparency

`MAX_IMPORTED_PALETTE_COLORS` is 256. Indexed UI controls use it as their
maximum: adding a color is disabled at 256. Indexed conversion reserves a
transparent entry, so at most 255 opaque/semi-transparent import palette
colors fit. The current RGB palette editor does not impose the same add-control
limit; serialized palette data also has no universal schema cap. Thus 256 is
an Indexed/import contract, not a general RGB data truncation rule.

`getTransparentPaletteIndex()` chooses the first palette entry with `a <= 0`.
Existing indexed conversion normally reserves/pads index 0 as transparent.
For P2 imported palettes, an all-transparent input must produce only a valid
transparent palette state: no generated opaque/default colors. RGB retains
the original alpha-zero pixels unchanged.

## Pure Audit Helpers

`imported-palette-planning-utils.js` is not loaded by application import code.
It provides only test/future-candidate helpers:

```js
extractUsedRgbaColors({ canvases, frames, sourcePalette })
buildImportedPalettePlan({ mode, usedColors, sourcePalette, paletteCapacity, quantizer })
```

Extraction normalizes every alpha-zero input to one transparent category,
keeps opaque and semi-transparent RGBA identity exact, and does not mutate any
array. The plan helper is also pure:

- RGB under capacity returns swatches only and no pixel remap.
- RGB overflow does not alter pixels. Without an injected approved quantizer it
  returns `ERR_IMPORTED_PALETTE_CAPACITY_EXCEEDED`.
- Indexed reserves transparent index 0 and returns an exact remap under
  capacity.
- Indexed overflow requires an injected existing quantizer; otherwise it
  returns `ERR_IMPORTED_PALETTE_QUANTIZER_UNAVAILABLE`.
- Invalid quantizer output returns `ERR_IMPORTED_PALETTE_PLAN_INVALID` and
  thrown quantizer errors return `ERR_IMPORTED_PALETTE_QUANTIZATION_FAILED`.

No import path calls these helpers in P1.

## Atomic Palette and Pixel Remap

P2 must use this future order:

```text
decode completed pixels
  -> extract sheet-wide used colors
  -> check Indexed/RGB capacity
  -> optionally invoke existing quantizer
  -> construct palette and Indexed remap candidate together
  -> Canonical V2 normalize and validate
  -> atomic sheet candidate commit and activation
```

Any extraction, capacity, quantizer, remap, normalize, validation, or commit
failure leaves the existing sheet, palette, active sheet, draw state, handles,
autosave/recent/recovery, and U3 checkpoint DB unchanged. Proposed failure
codes are retained in the P2 contract rather than wired into runtime in P1.

## V1/V2 and U3

V1/V2 packaged serialization persists a sheet document palette, active palette
indices, RGB draw color, Indexed arrays, direct buffers, and frame data as
they already exist. U3 snapshots those packaged payloads. None of these paths
currently knows an imported-palette plan, so P1 changes none of them.

## P2 Reuse Plan

Reuse `extractUsedRgbaColors()` for deterministic external-input extraction
and inject `quantizeRgbaColorEntriesWithMapping()` into the candidate planner
only after E3's browser gate completes. Do not use
`convertCurrentDocumentRgbPixelsToIndexedPalette()` directly: it changes
runtime state, clears direct buffers, synchronizes draw state, and pads the
palette to 256 slots.

P2's minimum change is limited to the pre-commit external PNG/GIF candidate
builder, an atomic palette/remap candidate, Canonical V2 validation, and tests.
It must not change the decoder, disposal, duration, U3 database, V2 codec, or
existing runtime palette conversion.

## Validation

`scripts/test-pixiedraw-dev-imported-palette-p1-audit.mjs` covers one/multiple
colors, duplicates, transparent hidden RGB, semi-transparency, source indexed
palette order and unused entries, truecolor first-seen order, multi-canvas
frame ordering, RGB/Indexed exact plans, overflow with/without the existing
quantizer, input non-mutation, and deterministic output.

The test also confirms current external import still uses the RGB default
palette and has not been connected to this helper.
