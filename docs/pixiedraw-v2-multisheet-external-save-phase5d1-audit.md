# PiXiEEDraw V2 Multi-Sheet External Save: Phase 5-D1 Audit

## Decision

This is a `PiXiEEDrawDEV/` audit only. Normal multi-sheet V2 save remains
blocked. A complete archive must be assembled and validated before any picker,
download, or bound-handle write.

## Invariants

- Sheets, layers, and frames have no fixed count limit.
- A sheet has one through four canvases. Five or more is an error, never a
  truncation request.
- `session.localViewportCanvases` is the per-sheet workspace layout source.
- External V2 ZIP and Autosave V2 IndexedDB are distinct containers.
- Autosave V2 is experimental and not a startup restore source.
- External project file handles remain separate from autosave/recovery handles.
- Deprecated shared sync is not reconnected.

## Relevant Modules

| Responsibility | Module |
| --- | --- |
| Normal project save and safety stop | `assets/js/modules/export-rendering.js` |
| Package construction and sheet collection | `assets/js/modules/project-package-workflow-utils.js` |
| Resident/deferred tabs | `assets/js/modules/open-project-tab-lifecycle.js`, `open-project-tab-workflow-utils.js` |
| V2 ZIP encode/decode | `assets/js/modules/project-storage-v2-archive-codec.js` |
| V1/V2 parse and restore | `assets/js/modules/document-session-workflow-utils.js` |
| Canvas limit | `assets/js/modules/project-sheet-collection-utils.js` |

## Current Normal Save Flow

```text
saveProjectAsPixieedraw()
  -> resolveActiveProjectSavePlan()
  -> buildProjectExportBundle()
     -> buildProjectSessionPayload()
     -> serializeProjectStorageSnapshot()
     -> selected storage adapter
  -> resolveV2ProjectSheetOverwriteSafety()
  -> block, write bound handle, or Save As/download
```

`buildProjectExportBundle()` uses `includeSheets: options.includeSheets !==
false`, so it can build sheet payloads. The V2 safety check tests
`options.includeSheets === true`; normal save does not provide that explicit
option. Consequently a multi-sheet V2 target remains stopped even when the
serializer was asked to include sheets. This is safe but must be normalized in
Phase 5-D2.

The explicit DEV helper
`saveProjectAsPixieedrawV2ExperimentalIncludeSheetsDev()` builds an
`includeSheets: true` archive, but always uses new-file output. It is not the
normal save or same-handle overwrite route.

## Existing V2 Archive

```text
manifest.json
project.json
sheets/{sheetId}/project.json
sheets/{sheetId}/canvases/{canvasId}.json
sheets/{sheetId}/timelapse/session.json     # includeTimelapse:true
bitmaps/{hash}.rgba.zlib                    # archive-wide shared entries
```

The root contains lightweight sheet manifest entries. Each sheet body is
separate. Bitmap hashing uses `encoding + width + height + cropped RGBA bytes`,
so equal bytes with different dimensions do not collide. The codec restores
`indices`, `direct`, `importSourceDirect`, and `directOnly` from shared bitmap
entries.

## Current Sheet Collection and Gaps

`buildProjectSheetsPayload(activePackagedProject)` iterates `openProjectTabs`.

- Active tab uses a fresh packaged payload.
- Resident inactive tab uses `tab.project`.
- Missing `tab.project` falls back to a stored local project payload.
- If neither exists, the sheet is omitted.

This is acceptable while save is blocked, but insufficient for normal
multi-sheet saving. It does not force deferred/lightweight tab hydration or
return diagnostics for a missing sheet.

The current sheet package includes `source`, `fileName`, `label`, QR metadata,
and legacy shared compatibility fields. It does **not** explicitly copy each
tab's `sourceKind`, `sourceStorageAdapterId`, or `sourceProjectToken`. The V2
codec preserves manifest fields it receives, but cannot restore fields missing
from the packaged sheet. The current `sheets[]` array is also the practical
order; there is no separate root `sheetOrder` field.

## Required Complete Candidate

Phase 5-D2 must create a complete multi-sheet candidate before ZIP creation.

1. Capture active tab into a resident packaged payload.
2. Materialize each inactive tab from resident payload, deferred payload, or
   local journal/checkpoint.
3. Reject the entire save if any sheet cannot be materialized.
4. Copy `fileName`, `label`, `updatedAt`, `source`, `sourceKind`,
   `sourceStorageAdapterId`, `sourceProjectToken`, QR/import metadata, project,
   and session.
5. Generate explicit `sheetOrder` and require it to equal ordered sheet IDs.
6. Validate `activeSheetId`, all canvas counts, and every project payload.

The encoder must never infer missing sheets from active UI state.

## Multi-Canvas Layout

Every packaged sheet now has:

```js
session.localViewportCanvases = {
  count, selectedKind, selectedIndex, layoutScale, positionsRelative,
  anchorLeft, anchorTop, positions,
};
```

The V2 codec only splits canvas bitmaps and timelapse, so it retains the rest
of the session. Canvas `viewScale`, `document.activeCanvasId`, and canvas array
order remain in the document payload. Finite coordinates are retained; missing,
non-numeric, `NaN`, and infinite coordinates use default layout only.

## Canvas Limit

`validateSheetCanvasCount(...)` must run over every fully materialized sheet
before picker or handle access.

```text
all sheets have 1..4 canvases -> continue
one sheet has 5+ canvases   -> reject entire save
```

The error is `ERR_CANVAS_LIMIT_EXCEEDED`. No sheet is reduced to four, no
partial archive is produced, and no existing file is written.

## Timelapse

- `includeTimelapse: true` writes root and per-sheet `timelapse/session.json`
  entries containing `byCanvas`, `operationLogsByCanvas`, base snapshots, and
  operation entries.
- `includeTimelapse: false` omits those entries and restores an empty legacy
  `session.timelapse` shape.
- A missing entry declared as included is corrupt and errors.
- An intentionally omitted entry leaves the project editable with empty
  timelapse data.

For a new external full save, invalid requested timelapse data should reject
before write rather than silently drop a requested recording.

## Same-Handle Overwrite Design

Initial multi-sheet V2 output is Save As: generate and validate a complete
archive, show picker, then bind the selected handle only after success.

Same-handle V2 overwrite requires all of:

- V2 source and target adapter IDs
- `sourceKind === 'file'`
- `projectSaveHandleState === 'bound'`, an existing handle, and permission
- `includeSheets === true`
- complete candidate and `packagedSheetCount === openSheetCount`
- valid `sheetOrder`, `activeSheetId`, and 1..4 canvases for every sheet

Always use Save As for V1-to-V2 conversion, V2-to-V1 downgrade,
recent/autosave/recovery source, unknown/mixed/import origin without a
project-level binding, incomplete payload, canvas violation, or permission
failure.

## Write Atomicity

Current write order is:

```text
complete Blob in memory
-> request handle permission
-> handle.createWritable()
-> writable.write(blob)
-> writable.close()
```

Encode failures occur before writable creation. However, the browser API has
no portable transactional rename for an existing file handle. A write/close
failure is not a guaranteed atomic replacement across browsers. Phase 5-D2
must leave binding/persistence state unchanged unless `close()` succeeds. A
future high-assurance path can use Save Copy or backup versions, but must not
claim unsupported atomic rename behavior.

## Autosave Boundary

External ZIP may share document normalization, canvas validation, sheet
completeness, bitmap codec/hash, layout normalization, and timelapse
normalization with Autosave V2. It must not reuse IndexedDB revisions, journals,
recovery metadata, or runtime handles.

## Conditional Guard Release

Keep `resolveV2ProjectSheetOverwriteSafety()` as the final guard. Phase 5-D2
may add a DEV-only default-off capability such as
`canWriteCompleteMultiSheetV2Archive` after a preflight result contains:

```js
{
  includeSheets: true,
  openSheetCount,
  packagedSheetCount,
  sheetOrder,
  activeSheetId,
  sheets,
  complete: true,
}
```

Every missing condition remains the current blocked result; the guard is not
deleted.

## Phase 5-D2 Minimum Scope

1. Complete candidate collector/hydrator with missing-sheet diagnostics.
2. Source metadata plus explicit `sheetOrder` in package/archive.
3. All-sheet canvas and completeness validation before Blob/picker/write.
4. DEV default-off flag that passes `includeSheets: true` consistently to
   serialization and V2 overwrite safety.
5. Bound V2 overwrite only after the complete candidate succeeds.
6. Existing blocked behavior for all other cases.

## Required Tests

1. 2, 20, and 50 sheet V2 round-trip.
2. Sheet order, active sheet/canvas, `viewScale`, and layout session retention.
3. Large frame/layer counts plus indexed/direct/mixed/directOnly pixel data.
4. Cross-sheet bitmap dedupe and hash-dimension collision.
5. Root/inactive sheet timelapse included and omitted.
6. One 5-canvas sheet rejects the whole save before picker/write.
7. Missing resident/deferred payload rejects the whole save.
8. V1-to-V2, recent, recovery, and mixed source use Save As.
9. Complete bound V2 file is overwrite-eligible; failed write keeps state.
10. Current safety stop, Autosave V2 M-R, and Phase 5-B remain unchanged.

## Remaining Risks

- Deferred sheet hydration can be expensive for 20/50 sheet projects.
- Normal save currently constructs a Blob before its multi-sheet stop.
- Browser file writes lack portable atomic rename.
- Desktop/mobile picker, reopen, and overwrite behavior require real-browser
  confirmation.
- Normal multi-sheet V2 save remains intentionally unavailable until Phase
  5-D2 satisfies every listed condition.
