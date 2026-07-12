# PiXiEEDraw DEV Canonical V2 GIF Loop Metadata (Phase E4-B)

## Contract

GIF provenance is stored only in the existing packaged-payload field:

```js
canonicalSourceMetadata: {
  sourceKind: 'import-gif',
  sourceMimeType: 'image/gif',
  sourceFileBytes,
  sourceWidth,
  sourceHeight,
  sourceFrameCount,
  gifLoopCount,
}
```

All fields are optional for existing payload compatibility. `gifLoopCount` is
preserved only when a future decoder/import caller provides it; the normalizer
does not infer a value.

## Loop Semantics

- Missing: no metadata field exists.
- `null`: GIF has no Netscape loop extension.
- `0`: GIF declares infinite looping.
- Positive integer: GIF declares that finite loop count.

Negative, fractional, non-finite, string, boolean, array, and object values
are rejected with `ERR_CANONICAL_V2_GIF_LOOP_COUNT_INVALID`. Optional GIF
metadata fields validate MIME, nonnegative byte length, positive dimensions,
and positive frame count with dedicated structured errors.

## Explicit Non-Goals

Raw disposal, rectangle, transparency-index, color-table, compressed-frame,
and restore-buffer metadata are not stored. Project frames already contain the
completed RGBA result, and `frame.duration` remains the only per-frame timing
field. `gifLoopCount` is provenance only: it does not change editor playback,
export looping, timelapse, runtime, or UI.

## Inspection and Compatibility

`inspectCanonicalV2ProjectPayload()` returns `hasGifSourceMetadata` and
`gifLoopCountKind` (`missing`, `no-extension`, `infinite`, or `finite`) without
returning image bytes or pixels.

The existing U3 checkpoint clone/digest/readback path preserves plain metadata
for an inactive GIF sheet without schema changes. Existing V2 archive encode/
decode preserves null loop metadata and frame count through its normal JSON
payload; worker parity remains unchanged. No archive or U3 code changed.

## Validation

`scripts/test-pixiedraw-dev-canonical-v2-e4b-gif-metadata.mjs` covers missing,
null, infinite, and finite values; all invalid loop values; optional dimensions
and frame count; non-GIF non-regression; inspection; input non-mutation; and
duration/raw-disposal separation. U3 and V2 codec fixtures add inactive GIF
metadata retention checks.

Browser GIF import remains unverified and E3 remains the connection gate. E4-C
may only pass decoded `gifLoopCount` into this existing metadata field after
that gate; it must not introduce playback behavior or raw disposal persistence.
