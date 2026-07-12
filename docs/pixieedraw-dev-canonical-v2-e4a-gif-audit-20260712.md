# PiXiEEDraw DEV GIF Canonical V2 Pre-Connection Audit (Phase E4-A)

## Scope

This is an audit and baseline measurement only. GIF import behavior is not
connected to Canonical V2 in this phase. No decoder, disposal, duration,
runtime commit, V2 archive, U3 database, autosave, recovery, or production
code behavior changed.

E3 PNG browser verification remains incomplete. GIF must not be normalized or
deduplicated at runtime until that gate is complete.

## 1. GIF Input Path

The `+` menu chooses `openGifSheetDialog()` in `app.js`, which calls
`openDocumentDialog({ sheetAddKind: 'gif' })`. Both the File System Access
picker and the file-input fallback call:

```text
buildImageSheetImportCandidate(file, 'gif')
  -> loadDocumentFromImageFile(file, { applyToRuntime: false })
  -> decodeImageFileToFrames(file)
  -> decodeGifFileToFrames(file)
  -> decodeGifWithReader(bytes)
  -> packaged candidate
  -> openDocumentsAsProjectTabs()
  -> appendProjectPayloadAsOpenTab()
```

The candidate is marked `sourceKind: 'import-gif'`, has no source adapter,
and is assigned a new local persistence token. No external file handle is
bound to the imported GIF.

`decodeGifWithImageDecoder()` exists as an exported utility but is not used by
`decodeGifFileToFrames()`. Current GIF sheet import uses `GifReader` on the
main thread; no GIF decode worker is used.

## 2. Decoder, Frames, and Disposal

`GifReader` parses image descriptors and Graphic Control Extensions. It retains
raw `x`, `y`, `width`, `height`, `delay`, `transparent_index`, and `disposal`.
The importer then maintains a full canvas-sized `Uint8ClampedArray`:

1. Apply the previous frame disposal before decoding the next frame.
2. For disposal `2`, clear the previous frame rectangle to the resolved GIF
   background or transparent pixels.
3. For disposal `3`, restore the saved full-canvas buffer.
4. Before a current frame with disposal `3`, copy the current canvas into the
   restore buffer.
5. Blit the current GIF rectangle and clone the result into a completed RGBA
   `ImageData` frame.

Therefore the imported project receives completed, composited full RGBA frames,
not GIF delta rectangles and not a shared bitmap reference. Raw disposal is
used during decode but is not copied into the packaged project frame.

Disposal `0` and `1` both leave the composited canvas unchanged by this
importer. Disposal `2` is restore-to-background; disposal `3` is
restore-to-previous.

## 3. Duration and Loop

- `GifReader.frameInfo(index).delay` is GIF hundredths of a second.
- Positive delays are converted to milliseconds by `delay * 10`.
- Zero or invalid GIF delay becomes `DEFAULT_IMPORT_FRAME_DURATION`.
- The packaged frame stores the resulting duration through
  `normalizeImportFrameDuration()`, which rounds and clamps to the existing
  import duration limits.
- The Netscape loop extension is read as `loopCount`; `0` means infinite loop
  and `null` means no extension was present.

Important current gap: `loadDocumentFromImageFile()` uses frame durations but
does not copy `importResult.loopCount` into the project/session/timelapse
payload. Consequently duration is available to U3 and V2 archive round-trip,
but original GIF loop metadata is not currently an imported-project property
to round-trip. E4 must decide whether to preserve it without changing existing
playback semantics.

## 4. Bitmap Ownership and Baseline Metrics

For every imported GIF frame, `loadDocumentFromImageFile()` creates one RGB
direct-only layer and allocates two independent full RGBA buffers:

- `layer.direct`
- `layer.importSourceDirect`

The decoder also allocates one completed RGBA `ImageData` buffer per frame
before the packaged snapshot is built. Runtime/import candidate buffers are
not shared between frames, even when two completed frames have identical
pixels.

`gif-import-inspection-utils.js` provides the pure async helper:

```js
await inspectGifImportMemoryMetrics(candidate)
```

It reports:

```js
{
  frameCount,
  bitmapCount,
  uniqueBitmapCountByHash,
  duplicateBitmapCount,
  totalTypedBytes,
  uniqueTypedBytes,
  dedupePotentialBytes,
  originalGifBytes,
  loopCount,
  frames: [{
    frameIndex, width, height, durationMs, disposalMethod, transparent,
    typedByteLength, bitmapId, sharesBitmapWithPrevious
  }]
}
```

The helper uses SHA-256 when Web Crypto is available; otherwise its diagnostic
fallback hash includes dimensions and byte length. It only reads byte views or
base64 values and never changes the candidate or a typed array. With decoded
frames, one bitmap represents each completed frame. With packaged candidates,
both `direct` and `importSourceDirect` are counted so the current runtime
ownership cost is visible.

No production GIF corpus is embedded in this repository. The baseline test
uses in-memory valid static and animated GIF byte fixtures plus synthetic
transparent, duplicate, and partially changed completed-frame fixtures.

## 5. V2 Archive and Shared Bitmap Analysis

The V2 archive codec already hashes cropped RGBA bitmap payloads by
dimensions/content and writes a single `bitmaps/<sha256>.rgba.zlib` entry for
all matching `direct` or `importSourceDirect` references. This deduplication
works across frames, canvases, and sheets during archive encoding only.

Archive restoration inflates every reference into a fresh encoded typed array.
It does not preserve shared runtime typed-array identity. This is safe for
editing because frame/layer edits cannot mutate another frame through a shared
buffer.

Runtime/resident payload deduplication is not justified yet. Sharing completed
frame buffers would require copy-on-write before every direct/import source
mutation, including history, drawing, palette conversion, frame operations,
and deferred/resident restoration. Archive-only dedupe gives file-size savings
without that destructive-sharing risk.

## 6. Commit, Failure, U3, and Archive Boundaries

The existing candidate is built with `applyToRuntime: false`; candidate decode
or build failure occurs before `openDocumentsAsProjectTabs()` commits a tab.
Picker cancellation returns false. Candidate validation/commit/activation
failure uses the existing atomic append rollback: open tabs, active sheet,
runtime document, project save handle, and persistence state remain unchanged.

U3 obtains active payloads from `buildPackagedProjectPayload()` and inactive
payloads from resident/deferred/local project-tab state. It snapshots completed
frame `direct` and `importSourceDirect` data plus per-frame duration. It has no
separate GIF decoder state or loop metadata today. E4-A does not change U3.

V2 archive serializes completed layer bitmaps and JSON frame duration; it does
not have GIF-specific raw disposal or loop fields. Timelapse is serialized by
the separate session split/restore path and is not GIF import metadata.

## 7. Canonical V2 Connection Point

The minimal future connection point is exactly after
`loadDocumentFromImageFile(file, { applyToRuntime: false })` returns the
packaged candidate and before `openDocumentsAsProjectTabs()` receives it:

```text
GIF decode and completed-frame package
  -> normalizeExternalProjectToCanonicalV2()
  -> validateCanonicalV2ProjectPayload()
  -> existing candidate commit and activation
```

This phase deliberately leaves the `kind === 'gif'` branch outside that call.
No GIF normalizer, bitmap ID replacement, shared runtime bitmap table, or
source-metadata shape change was made.

## 8. Tests

`scripts/test-pixiedraw-dev-canonical-v2-e4a-gif-audit.mjs` verifies:

- valid static and animated GIF byte fixture parsing
- no-loop and infinite-loop values
- zero-delay fallback and positive-delay millisecond conversion
- raw disposal `0`, `2`, and `3` parsing and completed-frame decode
- transparent, duplicate, and partially changed completed-frame metrics
- duplicate-byte savings calculation and input non-mutation
- current GIF import source routing, no Canonical V2 GIF branch, and V2 archive
  hash-table presence

Existing E2/E3/U3 and V2 codec/worker tests remain required regressions.

## 9. E4 Implementation Limits and Risks

Before E3 browser completion, do not connect GIF to Canonical V2, alter
disposal/duration/compositing, change runtime commits, change U3, or alter the
V2 codec.

When E4 begins, preserve completed frame pixels and durations first. Loop
metadata requires an explicit compatibility decision. Runtime bitmap sharing
requires a separate copy-on-write design and must not be bundled with archive
dedupe.
