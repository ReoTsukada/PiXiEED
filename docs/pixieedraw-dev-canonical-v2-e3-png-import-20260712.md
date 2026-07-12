# PiXiEEDraw DEV Canonical V2 PNG Sheet Import (Phase E3)

## Scope

Only the existing PNG **add as sheet** candidate path changed. The + menu,
Import image command, File System Access picker, and file-input fallback all
reach `buildImageSheetImportCandidate(file, 'image')` before tab commit.

GIF calls the same builder with `kind: 'gif'`, but is explicitly excluded from
the Canonical V2 connection in this phase. JPEG/WebP, V1/V2 readers,
recent/recovery, PiXiEELENS/QR, drag/drop, clipboard, ZIP codec, save handles,
and persistence schemas remain unchanged.

## Flow

```text
PNG File
  -> existing decodeImageFileToFrames()
  -> existing packaged candidate (applyToRuntime: false)
  -> normalizePngSheetCandidate()
  -> normalizeExternalProjectToCanonicalV2()
  -> validateCanonicalV2ProjectPayload()
  -> existing openDocumentsAsProjectTabs() commit/activation
```

`canonical-v2-project-utils` is injected from `app.js` into
`createOpenImportWorkflowUtils`; the workflow does not read the normalizer from
`window` implicitly. A missing normalizer or validator returns a structured
pre-commit failure.

## Commit and Rollback

Before decode/normalization succeeds, no tab, active sheet, runtime document,
handle, autosave state, recent record, recovery record, or U3 record changes.
The candidate replaces `project` with `normalized.canonicalPayload`; the raw
decoder candidate is never passed to commit. The existing append path rolls
back a new tab if activation fails, and the enclosing import command always
releases its busy lock and rerenders the + control.

Failure codes retained by the candidate failure include:

- `ERR_EXTERNAL_DECODE_FAILED`
- `ERR_PROJECT_PAYLOAD_BUILDER_UNAVAILABLE`
- `ERR_CANONICAL_V2_NORMALIZER_UNAVAILABLE`
- `ERR_CANONICAL_V2_VALIDATOR_UNAVAILABLE`
- `ERR_CANONICAL_V2_CANDIDATE_INVALID` with the normalizer/validator cause
- `ERR_V2_COMMIT_FAILED`

Picker cancellation remains a normal false result, not an error.

## Metadata and Diagnostics

The canonical PNG payload carries `canonicalPayloadFormat: 'v2'` and
`canonicalSourceMetadata` with `sourceKind: 'import-image'`, PNG MIME, source
file size/name, and decoded dimensions. It has no source adapter and cannot
bind an external project handle.

The imported tab retains the same canonical marker/source metadata. When that
sheet is persisted from active runtime state or captured by U3, the existing
packaged snapshot is decorated with the marker again. This changes neither the
U3 database schema nor its digest/ready rules.

DEV logs use `[pixieedraw-dev:png-canonical-import]` and report phase, byte
size, dimensions, structural metrics, warning count, and failure code. They do
not log filenames or pixel values.

## Compatibility

The canonical payload remains a packaged project payload, so existing sheet
switching, U3 active/inactive checkpoint snapshotting, and `includeSheets:true`
V2 archive encoding consume it without a schema bridge. E3 does not alter
their implementation or their database/handle rules.

## Validation

`scripts/test-pixiedraw-dev-canonical-v2-e3-png-import.mjs` verifies explicit
dependency injection, exactly one normalizer and validator call, canonical
payload handoff, input candidate non-mutation, normalizer/validator failures,
and the PNG-only branch guard. E2, U2/U3, sheet workflow, V2 codec/worker, and
G3 regressions remain part of the full verification set.

## E3-B Browser Gate Status

The browser/File System Access verification has not run in this environment.
The available browser execution quota rejected the attempted run, so no
alternative browser automation or UI workaround was used. No runtime behavior
was changed as part of that blocked verification attempt.

The following remain explicitly unverified in a real browser and must be
recorded before E3 is marked complete:

- PNG picker import, including opaque and transparent pixels
- multiple PNG sheets, sheet switching, and picker cancellation
- invalid-PNG rollback and post-failure editor availability
- active and inactive PNG U3 checkpoint readback
- multi-sheet V2 Save As, same-handle overwrite, and file reopen
- source metadata/handle isolation and pageerror count

## E4 Handoff

E4 may connect GIF only after preserving composited frame pixels, duration,
loop metadata, disposal results, and inactive-sheet/U3 behavior. It must not
reuse E3's PNG branch as evidence that GIF memory/deduplication is safe.
