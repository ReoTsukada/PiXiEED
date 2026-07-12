# PiXiEEDraw DEV Canonical V2 Normalizer (Phase E2)

## Purpose

`assets/js/modules/canonical-v2-project-utils.js` defines a pure validation
layer for existing packaged project payloads. It does not decode files, create
ZIP archives, bind a file handle, update a tab, write IndexedDB, or change the
runtime document.

The public module APIs are:

```js
normalizeExternalProjectToCanonicalV2(input)
validateCanonicalV2ProjectPayload(payload)
inspectCanonicalV2ProjectPayload(payload)
```

The module is loaded in DEV but is deliberately not connected to PNG/GIF,
V1/V2 file readers, recent/recovery, PiXiEELENS, QR, or save flows in E2.

## Canonical form

The canonical result is a deep-cloned existing packaged payload with canonical
markers. It does not introduce a replacement document schema, so it can be
passed to the existing candidate/commit boundary without an unwrap step.

```js
{
  canonicalPayloadFormat: 'v2',
  canonicalSchemaVersion: 1,
  canonicalSourceMetadata: {
    sourceKind,
    sourceAdapterId,
    // optional diagnostic source metadata, never a save-handle decision
  },
  // Existing packaged fields remain at this level:
  type, packageVersion, document, session, updatedAt, sheets, activeSheetId
}
```

The existing `type`, `packageVersion`, `document`, `session`, `updatedAt`,
optional `sheets`, and optional `activeSheetId` fields remain intact. V2 ZIP is
still owned solely by `project-storage-v2-archive-codec.js`; Canonical V2 is
not a ZIP, archive manifest, or bitmap-entry layout.

## Normalization and validation

- Input is copied recursively into plain objects/arrays while typed arrays and
  ArrayBuffers are copied with their original constructors and bytes.
- Unknown safe plain-data fields are retained. Optional `metadata` and
  `document.documentName` receive empty defaults with warnings.
- Functions, symbols, bigint values, prototype-pollution keys, cyclic values,
  DOM-like values, File System Access handle-like values, and ImageBitmap-like
  values are rejected with structured errors.
- Multi-sheet packages require unique IDs, matching `sheetOrder`, and a valid
  `activeSheetId`. Single-sheet packages use a transient deterministic root
  sheet view for validation and do not mutate the package into a multi-sheet
  runtime structure.
- Canvas dimensions, IDs, frame/layer IDs and order, active frame/layer,
  typed direct/indexed byte lengths, bitmap IDs/references, and active canvas
  are validated.
- Archive `bitmaps/...` references remain archive-codec responsibility. An
  in-memory `project.bitmaps` table, if supplied, is checked for duplicate IDs
  and dangling direct references.

Canonical payload format must not be used as evidence that a V1 external
handle is safe to overwrite. Save plans continue to use source adapter, target
adapter, source kind, binding state, and complete-sheet checks.

## Source metadata and metrics

`sourceKind` and `sourceAdapterId` are carried independently. Unknown source
kinds are accepted with `WARN_CANONICAL_V2_UNKNOWN_SOURCE_KIND`.

Returned metrics include sheet, canvas, frame, layer, bitmap, typed-byte, and
estimated-canonical-byte counts. The estimate counts raw typed bytes and
approximates base64-encoded packaged bytes; it is not a ZIP size estimate and
does not perform bitmap deduplication.

## Warnings and failures

Warnings cover optional defaults, legacy root-sheet view use, and unknown
source kinds. Corrupt IDs, dimensions, active references, bitmap references,
typed lengths, duplicate IDs, and unsafe values fail with structured
`ERR_CANONICAL_V2_*` results containing a schema path but never payload data.

## Fixtures and verification

`scripts/test-pixiedraw-dev-canonical-v2-e2-normalizer.mjs` covers:

- single/multi-sheet and multi-canvas packages
- indexed/direct/import-source typed data
- GIF duration and loop metadata retention
- shared bitmap references
- source adapter/source kind and unknown-source warnings
- input non-mutation and copied typed buffers
- duplicate IDs, invalid dimensions, missing bitmap references, functions,
  and handle-like unsafe values
- standalone validation, inspection, and metrics

## E3 handoff

E3 should connect only the PNG sheet-import candidate builder to this module.
It must call the normalizer after image decode/package creation and before
candidate validation/commit. GIF, JPEG/WebP, V1/V2 file reader, recent/recovery,
PiXiEELENS/QR, runtime commit, inactive deferred retention, V2 codec, and U3
remain outside that connection.
