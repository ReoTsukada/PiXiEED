# PiXiEEDraw DEV External Input and Canonical V2 Audit (Phase E1)

## Scope and result

This is an audit only. No import, runtime payload, Autosave, recent, recovery,
Service Worker, or production behavior changed. `pixieedraw-v2-zip-experimental`
remains the V2 adapter ID.

The repository already has two distinct concepts:

1. **Packaged project payload**: editable `type`, `packageVersion`, `document`,
   `session`, `updatedAt`, and optionally `sheets` / `activeSheetId` objects.
2. **V2 archive**: a ZIP with `manifest.json`, `project.json`, sheet project
   entries, canvas entries, compressed bitmap entries, and optional timelapse
   entries.

The first is the closest current Canonical V2 candidate. It is not yet named,
versioned, or normalized as a single contract. The archive is not an in-memory
candidate format and must not become the editor's resident representation.

## Input inventory

| Input | Entry and decoder | Candidate / commit | Current result |
| --- | --- | --- | --- |
| File System Access picker | `openDocumentDialog()` in `open-import-workflow-utils.js` | `readProjectPayloadFromOpenItem()` then `openDocumentsAsProjectTabs()` | V1/V2 project files are parsed before the atomic project-sheet path. |
| File input fallback | `openDocumentViaInput()` | Same as picker; one image/GIF uses `buildImageSheetImportCandidate()` | Picker cancel has no runtime mutation. |
| Open as a new project | `openDocumentAsNewProject()` | `snapshotFromDocumentBlob()` then `loadDocumentFromBlob()` | Deliberately applies the parsed project to runtime after parse; it is not candidate-first. |
| Add project as sheet | `openProjectSheetDialog()` from `open-project-tab-sheet-actions.js` | `openDocumentsAsProjectTabs()` plus `prepareSheetCandidate()` / transaction validation | Candidate-first and atomic for direct project payloads. |
| Add image as sheet | + menu `sheetAddKind: image` | `buildImageSheetImportCandidate()` calls `loadDocumentFromImageFile(..., { applyToRuntime: false })` | Candidate-first, then transaction commit and active-sheet activation. |
| Add GIF as sheet | + menu `sheetAddKind: gif` | Same image candidate builder; GIF is selected by MIME/name | Candidate-first; one file only. |
| Recent project | `openRecentProjectAsTab()` / `appendRecentProjectAsSheets()` | local journal reconstruction or entry project, then append | Existing V1 recent payload; not a V2 DB restore source. |
| Autosave V2 recovery | Phase 4-R helper in `app.js` | preview payload -> recovery candidate -> `appendPackagedProjectTab()` | New unsaved recovery project, not a bound external handle. |
| Startup restore | recent/startup workflow | existing recent project reconstruction | V1 autosave/recent remains authoritative. |
| PiXiEELENS transfer | `maybeImportLensCapture()` | data URL -> Blob/File -> image loader | Append path still invokes the runtime image loader before tab append; residual direct-runtime path. |
| QR transfer | `maybeImportQrCapture()` | data URL -> Blob/File -> image loader | Same residual path as PiXiEELENS. |
| Drag and drop | none for document/image import | n/a | No editor-level external file drop handler was found. Palette drag/drop is internal reordering only. |
| Clipboard image/file | none for external image import | n/a | Clipboard support is selection/frame/layer data, not a File/bitmap-to-sheet import. |
| URL/share import | none for project files | n/a | Lens/QR query and storage transfer are the only external transfer mechanisms found. |

The picker accepts V1/V2 project extensions and PNG/GIF in the relevant menu
paths. Although the low-level browser image decoder could draw JPEG/WebP,
`isImportableImageFile()` currently classifies only PNG and GIF. JPEG/WebP are
therefore not supported external inputs yet; E3 must extend both classification
and picker accept lists before connecting them.

## Decoder and adapter boundary

`app.js` creates `projectStorageAdapterRegistry` with these readers:

| Format | Reader | Adapter ID | Parsed output |
| --- | --- | --- | --- |
| V1 JSON `.pixieedraw`, `.json`, `.pxdraw` | `project-storage-v1-json-adapter.js` | `pixieedraw-v1-json` | Original parsed JSON; `snapshotFromParsedDocumentValue()` normalizes it into runtime-compatible snapshot data. |
| V2 ZIP `.pixieedraw` | `project-storage-v2-zip-adapter.js` + `project-storage-v2-archive-codec.js` | `pixieedraw-v2-zip-experimental` | Restored packaged project and, when present, all restored sheet payloads. |
| PNG/static image | `decodeImageFileToImageData()` via `createImageBitmap`, then `Image` fallback | none | One RGBA ImageData frame. JPEG/WebP are not currently admitted by the classifier. |
| GIF | `decodeGifFileToFrames()` -> `decodeGifWithReader()` | none | Fully composited RGBA frame copies and durations. `ImageDecoder` support exists but is not selected by the current GIF file function. |

`parseProjectStorageBlob()` selects an adapter from bytes. `snapshotFromDocumentBlob()` then invokes `snapshotFromParsedDocumentValue()` and records the adapter ID on the parsed snapshot. This is the V1/V2 file boundary; it is not a Canonical V2 normalizer.

## Candidate and commit boundary

`project-sheet-collection-utils.js` owns candidate identity allocation and
`validateSheetCanvasCount()` (one through four canvases). It deep-clones the
candidate `project`, creates new runtime/persistence/history/timelapse IDs,
and clears handles. `project-sheet-transaction-utils.js` validates all IDs and
rolls back the tab collection on failure.

`openDocumentsAsProjectTabs()` prepares all directly parsed project files,
validates every candidate, appends all tabs, and activates only after the
collection is committed. A parse or validation failure leaves the collection
unchanged. Image/GIF batches are deliberately refused because the decoder has
not yet been generalized to prepare all candidates before commit.

`open-project-tab-sheet-actions.js:commitSheetCandidate()` is the single-sheet
commit boundary. It appends a tab, loads its packaged project, and restores the
prior tab collection if activation fails. Dirty/autosave notifications happen
only after a successful commit.

Residual non-candidate-first paths are intentional new-project replacement
flows (`openDocumentAsNewProject`, `openImageFileAsNewProject`) and the
PiXiEELENS/QR append callbacks. The latter currently call the runtime image
loader with its default `applyToRuntime: true`; E3 must route them through the
existing `applyToRuntime: false` candidate builder.

## Proposed Canonical V2 contract

E2 must reuse the current packaged payload rather than introduce a parallel
document schema. The contract below is a wrapper/validation contract, not a
ZIP representation:

```js
{
  canonicalPayloadFormat: 'pixieedraw-v2-canonical', // E2 addition
  schemaVersion: 2,                                  // E2 wrapper version
  adapterId: 'pixieedraw-v2-zip-experimental',       // target, not source proof
  project: {
    type: 'pixieedraw-project',
    packageVersion,
    version,
    document,       // canvas IDs, dimensions, activeCanvasId, frames/layers
    session,        // history, localViewportCanvases, timelapse
    updatedAt,
    activeSheetId,  // when multi-sheet
    sheets,         // [{ id, fileName, label, project, source metadata }]
  },
  sourceMetadata: { sourceKind, sourceAdapterId, sourceProjectToken },
  metrics: { bitmapCount, uniqueBitmapCount, duplicateBitmapCount }
}
```

Current packaged payloads do not own a universal project ID: the open tab owns
`projectId`, while each sheet owns tab/sheet/runtime/persistence IDs. E2 must
preserve that ownership rather than copy source project IDs into runtime keys.
Canvas, frame, layer, and bitmap identities remain in `document` / layer data.
`document.canvases[]` order is the canvas order; frame/layer arrays preserve
their order and active values. Palette, indexed `indices`, direct RGBA data,
`directOnly`, `importSourceDirect`, frame duration, session timelapse, and
local multi-canvas layout are already represented in packaged payloads.

`sourceKind`, source adapter, canonical payload format, and target adapter are
independent. A V1 file may therefore be `sourceKind: file`,
`sourceAdapterId: pixieedraw-v1-json`, Canonical V2 in memory after E2, and
target `pixieedraw-v2-zip-experimental` without gaining its old V1 handle.

## V2 archive boundary and bitmap ownership

`project-storage-v2-archive-codec.js:encodePackagedProject()` owns the V2 ZIP
format. With `includeSheets: true`, it validates all sheet IDs, creates
`sheets/<sanitized-id>/project.json` records, writes `project.json` with sheet
manifest entries and explicit `activeSheetId`, and shares compressed RGBA blobs
under `bitmaps/<hash>.rgba.zlib`. The codec splits timelapse into separate
session entries and restores it during archive decode. It rejects duplicate
sheet IDs, missing bitmap entries, malformed manifests, and canvas-limit
violations.

The archive deduplicates equal direct/import-source bitmap bytes by hash across
the archive. The runtime and image candidate do not have a central bitmap
table: image import stores `direct` and a second `importSourceDirect` typed
array per frame. GIF import composites each complete frame to its own RGBA copy
and retains that same direct/import-source pair. This is the principal current
memory duplication and is intentionally unchanged in E1.

No image/GIF original binary is stored in the packaged project after decode.
The temporary `File`, Blob, image bitmap/object URL, and GIF input buffer are
decoder-local. Thus original-binary retained bytes are normally zero after
decode, while decoded runtime bytes can be approximately
`frameCount * width * height * 4 * 2` for direct/import-source pairs, before
layer/frame object overhead.

## Inactive-sheet retention and U3

| Retention source | Current use | U3 source | Notes |
| --- | --- | --- | --- |
| Resident `tab.project` | Active and newly imported sheets | Yes | Imported sheets retain their own resident copy until a dedicated payload store exists. |
| `deferredProjectPayload` | Lightweight local tab restore | Yes | Chosen after resident payload. |
| Sheet-specific local/recent reconstruction | Fallback through `projectId` plus `tab.id` | Yes | Must extract the matching sheet; a collection project ID alone is not a sheet identity. |
| Runtime snapshot | Active sheet | Yes | U3 builds a packaged payload from `makeHistorySnapshot()` and `buildProjectSessionPayload()`. |
| V2 archive entry/original input binary | External I/O only | No | U3 never stores file handles or archive binaries. |

U3 records the existing packaged payload, not a ZIP and not the future E2
wrapper. It therefore preserves current document/session content but does not
prove a `canonicalPayloadFormat` field. E7 must update that assessment after
E2/E3/E4/E5 connect the normalizer.

## Handle and save safety

No audit finding changes existing rules:

| Source/target | Required plan |
| --- | --- |
| V1 -> V2 | conversion; `force save as new file: true`; no same-handle overwrite |
| V2 -> V2 with bound matching external handle | eligible narrow same-handle overwrite |
| V2 -> V1 | downgrade; `force save as new file: true`; no same-handle overwrite |
| recent/recovery/imported sheet | Save As; no imported/source handle inheritance |

The project-save handle is runtime-only and is excluded from candidate and
Autosave V2 structures. E2 must not infer overwrite eligibility from canonical
payload format.

## Size metrics and E2 minimum scope

Existing measurement points are V2 codec diagnostics (`bitmapCount`,
`dedupedBitmapCount`, sheet count) and serialized Blob sizes at save. E2 should
add only pure metrics for source bytes, decoded estimated bytes, canonical
estimated bytes, unique/duplicate bitmap counts, and retained original bytes.
It must not alter GIF representation, bitmap deduplication, inactive payload
retention, or any decoder connection.

The minimum E2 implementation is a pure
`normalizeExternalProjectToCanonicalV2({ sourceKind, sourceAdapterId,
decodedPayload, sourceMetadata })` utility plus fixtures. It should validate
existing packaged shape, canvas count, identities, source metadata, and metrics
without calling a picker, mutating runtime, writing IndexedDB, or binding a
file handle.

## Risks and test evidence

Risks to carry forward:

- JPEG/WebP require explicit classifier and picker support before they are external inputs.
- Lens/QR append imports still mutate runtime before appending.
- GIF stores complete RGBA frames and duplicate import-source data.
- Runtime package payloads are V2-like but have no single canonical marker or
  schema validator yet.
- Inactive local fallback still depends on correct sheet extraction from a
  collection payload.

No behavior was changed in E1. Existing U2/U3, sheet workflow, canvas limit,
V2 codec, worker parity, zoom/pan, and G3 checks remain the required E2
regression set.
