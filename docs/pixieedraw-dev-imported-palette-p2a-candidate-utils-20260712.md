# PiXiEEDraw DEV Imported Palette Candidate Utilities (P2-A)

## Pure Candidate Processing

`imported-palette-candidate-utils.js` adds the pure API:

```js
applyImportedPalettePlanToCanonicalCandidate({
  decodedPayload, sourceKind, colorMode, sourcePalette, paletteCapacity,
  quantizer, normalizeCanonicalV2, validateCanonicalV2, sourceMetadata
})
```

It clones the packaged candidate, processes each sheet independently, then
normalizes and validates the clone. It is not loaded or called by PNG/GIF
picker, decoder, sheet commit, runtime, U3, autosave, archive, or UI code.

P2-B will call this utility with `colorMode: 'rgb'` for raster PNG/GIF/JPEG/WebP
imports and pass the user's configured palette as `existingPalette`. Indexed
mode is reserved for valid PiXiEEDraw project restore data or a later explicit
RGB-to-Indexed conversion; source image container palette metadata alone is not
enough to select Indexed mode.

## Sheet Palette and Ordering

Each sheet document receives one palette derived from all its canvases, frames,
and visible raster layers. Truecolor ordering is frame, canvas, layer, then
scanline first occurrence. Indexed source layers retain source palette order
for used entries. Fully transparent pixels share one transparent entry;
semi-transparent RGBA remains distinct.

## RGB and Indexed Plans

RGB retains all direct/import source pixel bytes and does not generate a
used-color palette. It clones the supplied existing configured palette; when no
palette is supplied, it preserves the candidate's own palette. It never
quantizes, remaps, truncates pixels, or adds the former 16-color import
default palette.

For the eventual raster import connection, `existingPalette` is required from
the user's configured palette. The fallback that preserves a candidate palette
exists only for pure utility compatibility; it is not the P2-B import policy.
`activeRgb` remains an independent RGB draw color and is not synchronized to a
palette entry.

Indexed reserves the newly constructed transparent entry at index 0, maps exact
colors when they fit, or requires injected
`quantizeRgbaColorEntriesWithMapping()` for overflow. Indexed remap clears
direct/import-source buffers only in the cloned candidate. The input remains
untouched.

## Canonical V2, Metrics, and Errors

The cloned candidate flows through injected Canonical V2 normalizer and
validator. Success returns canonical payload, per-sheet palette/draw plans,
and metrics for sheets, canvases, frames, source pixels/colors, alpha,
quantization, remapping, and typed bytes. Structured failures include source,
extraction, plan, quantizer, remap, normalize, and validation failures.

Encoded base64 typed payloads and typed-array fixtures are both supported.
Failure never changes an input candidate or runtime state.

## Validation and P2-B

`test-pixiedraw-dev-imported-palette-p2a-candidate-utils.mjs` covers RGB,
Indexed exact and quantized mapping, transparent/alpha handling, source palette
order, multi-canvas, multi-sheet, encoded typed values, input isolation, and
actual E2 normalizer/validator success/failure propagation.

P2-B remains blocked on E3 browser completion. Its only connection point is:

```text
PNG decode -> packaged candidate -> P2-A -> existing Canonical V2 -> existing atomic commit
```

GIF, decoder/disposal/duration/loop metadata, runtime palette state, U3, V2
archive, and UI remain out of scope.
