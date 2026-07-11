# PiXiEEDraw Autosave Schema V2 Phase 4-N+ Specification

## Scope and Status

This specification applies to `PiXiEEDrawDEV/` Phase 4-N and later work.

- It does not switch the current autosave, recent-project UI, startup restore, or normal V2 save path.
- It does not change Undo/Redo, timelapse, sheet-add UI, or save UI in this phase.
- The existing Phase 4-M schema fixture remains the compatibility baseline.
- The V2 autosave schema uses the DEV-only `pixieedraw-autosave-v2-experimental` database. It must not change the V1 `pixieedraw-autosave` database version or stores.

## Capacity Policy

| Resource | Policy |
| --- | --- |
| Sheets per project | No fixed count limit |
| Canvases per sheet | Maximum 4 |
| Layers per sheet/canvas | No fixed count limit |
| Frames per sheet/canvas | No fixed count limit |

"No fixed count limit" means neither UI nor schema may silently truncate data because of its count. In particular, schema code must not use fixed-length arrays, bounded sheet IDs, or small integer assumptions for sheet, layer, or frame counts.

Large projects are handled by diagnostics and performance controls instead of count-based data removal:

- memory and serialized-size diagnostics
- layer/frame-heavy warning thresholds
- non-active sheet lazy hydration
- autosave queue backpressure
- thumbnail generation throttling
- journal/checkpoint generation cleanup

## Canvas Limit

`MAX_CANVASES_PER_SHEET = 4` is a shared domain rule. Future canvas-add, V1/V2 import, normal V2 save, autosave V2, and recent restore validation must call the same validator.

- Adding canvas 1 through 4 is allowed.
- Adding a fifth canvas is rejected before state mutation, with a user-facing reason supplied by the caller.
- Existing V1/V2 files with more than 4 canvases must never be silently modified or truncated.
- The initial safe import policy is warning plus read rejection. A later compatibility mode may open the file read-only or explicitly mark it as over-limit; it must preserve all canvas payloads until the user chooses a conversion path.
- Autosave schema V2 validates every sheet checkpoint before commit. A malformed over-limit checkpoint cannot become the new current manifest.

## Sheet Deletion Semantics

Closing a sheet tab means deleting that sheet from the runtime project; it is not merely a visual tab change.

The deleted runtime sheet includes its tab entry, manifest entry, project payload, canvases, frames, layers, palettes, active-canvas state, Undo/Redo state, journal references, timelapse references, thumbnail references, and source metadata.

Deletion is a structural operation, not a pixel-patch journal operation:

1. Remove the sheet from runtime project state and `sheetOrder`.
2. Resolve `activeSheetId` to an existing sheet.
3. Build a new root revision containing only remaining sheet checkpoints/references.
4. Exclude the deleted sheet from the new manifest and its journal references.
5. Atomically publish the new manifest/current reference.
6. Retain prior revisions for configured recovery generations.
7. Delete unreferenced checkpoint, journal, timelapse, and thumbnail records only during later generation cleanup.

If the publish transaction aborts, the previous manifest remains current and the deleted sheet remains recoverable from that revision.

### Last Sheet

A project must never contain zero sheets. Deleting the final sheet creates a new empty sheet with a new ID and makes it active.

The replacement sheet must not inherit deleted-sheet payloads, history, timelapse, source metadata, or runtime handles:

```js
{
  sourceKind: 'new',
  sourceStorageAdapterId: null,
  sourceProjectToken: '<new token>',
  projectSaveHandle: null,
  projectSaveHandleMeta: null,
  projectSaveHandleState: 'none'
}
```

An eventual project-level external save binding remains separate from per-sheet source metadata.

### Confirmation Boundary

The deletion API must accept a confirmation decision boundary, even before UI confirmation is implemented. Callers should request confirmation for sheets with unsaved changes, timelapse data, multiple canvases, or large layer/frame counts.

## Autosave Schema V2 Requirements

The root manifest remains authoritative for one immutable revision. It contains ordered sheet references and `activeSheetId`; each sheet checkpoint carries its complete sheet payload.

- A new revision may reference only its own complete checkpoint/journal set.
- A removed sheet is absent from the new manifest. Its old records remain reachable only from retained old revisions.
- `current manifest` update is part of the same IndexedDB transaction as checkpoint, journal, and manifest writes.
- Cleanup is a later best-effort transaction and may fail without invalidating the committed revision.
- Missing thumbnail or dotStats is non-fatal and may be regenerated.
- Runtime-only handles (`projectSaveHandle`, `autosaveHandle`, and related metadata) are never persisted in checkpoints or journals.

## Future APIs

The next implementation phase should introduce shared, side-effect-safe APIs rather than embedding rules in UI handlers:

```js
validateProjectCanvasLimit(packagedProject)
canAddCanvasToSheet(sheet)
planSheetDeletion(projectState, sheetId)
commitSheetStructureRevision(plan)
cleanupUnreferencedSchemaV2Generations(projectId)
```

`planSheetDeletion` must not mutate runtime state. It returns the confirmation requirements, replacement active sheet, and the intended new manifest/checkpoint membership. `commitSheetStructureRevision` performs the state transition only after the caller has approved it.

## Fixture and Test Requirements

Future Phase 4-M/N extensions must cover:

1. More than 20 sheet manifests round-trip without truncation.
2. Large layer/frame counts round-trip without truncation.
3. One through four canvases per sheet restore successfully.
4. A fifth canvas add is rejected before mutation.
5. Over-limit imported files are not silently truncated.
6. Sheet deletion removes the sheet from the new manifest and keeps `activeSheetId` valid.
7. A new revision does not reference the deleted sheet journal/checkpoint.
8. Transaction abort restores the pre-delete revision.
9. Before cleanup, an old revision can still restore the deleted sheet.
10. Last-sheet deletion creates a clean new sheet with no history, handle, or source inheritance.
11. Large sheet/layer/frame fixtures produce diagnostics, not data loss.

## Deferred Work

- Connecting schema V2 to `writeAutosaveSnapshot()`, `recordRecentProjectSnapshot()`, recent UI, or startup restore.
- V2 normal-save multi-sheet support.
- Lazy hydration implementation and concrete warning UI.
- IndexedDB migration of V1 entries.
- Physical deletion policies for timelapse and thumbnail records.
