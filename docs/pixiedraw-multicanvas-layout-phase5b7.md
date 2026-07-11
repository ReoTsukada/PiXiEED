# PiXiEEDraw Multi-Canvas Layout State

## Purpose

This note describes the existing multi-canvas workspace layout state, its
normalization rules, persistence boundaries, and the Phase 5-B7 changes.

Scope:

- `PiXiEEDrawDEV/` only
- A sheet can contain one to four canvases
- Sheet, layer, and frame counts have no fixed schema limit
- Canvas positions are workspace layout state, not pixel/document coordinates

## State Model

The per-sheet layout is stored in the packaged project's existing `session`
object as `session.localViewportCanvases`.

```js
{
  count: 0,                 // Number of additional canvases: 0 to 3
  selectedKind: 'main',     // 'main' or 'local'
  selectedIndex: -1,        // 0-based local canvas index, otherwise -1
  layoutScale: 1,           // Canonical stored coordinate scale
  positionsRelative: true,  // Positions are relative to the main anchor
  anchorLeft: null,         // Main canvas logical workspace X
  anchorTop: null,          // Main canvas logical workspace Y
  positions: [              // One entry per local canvas
    { left: null, top: null }
  ]
}
```

`anchorLeft` / `anchorTop` are the main canvas workspace origin. A local
canvas position is a logical offset from that anchor. The display position is:

```text
displayLeft = (anchorLeft + local.left) * currentLayoutScale
displayTop  = (anchorTop  + local.top)  * currentLayoutScale
```

The layout state is intentionally separate from each canvas's pixel data.

## Related Canvas State

| State | Stored on | Purpose |
| --- | --- | --- |
| `document.canvases[]` | Project document | Canvas order and full editable content |
| `document.activeCanvasId` | Project document | Active canvas identity |
| `canvas.viewScale` | Each canvas document | Per-canvas display zoom |
| `session.localViewportCanvases` | Each packaged sheet | Main/local workspace positions and local selection |
| Canvas array order | `document.canvases[]` | Current visual stacking/order source |

There is no canvas `rotation` property and no independent saved z-index.
Canvas order is the `document.canvases[]` array order. No rotation or z-order
feature was added in Phase 5-B7.

## Existing Clamp and Normalize Rules

### Canvas count

- Total canvases per sheet: `1` to `4`.
- Local/additional canvases: `0` to `3`.
- A fifth canvas returns `ERR_CANVAS_LIMIT_EXCEEDED`; it is never silently
  reduced to four.
- Sheet, layer, and frame counts are not capped by this layout state.

The active validator is `validateSheetCanvasCount(...)`. It is shared by
candidate validation, parsed project loading, V2 codec, autosave preview, and
recovery validation.

### Position values

`normalizeLocalViewportCanvasState(...)` and
`normalizeLocalViewportCanvasPosition(...)` normalize layout state.

- Values are converted to finite numbers and rounded to three decimal places.
- Non-numeric, `NaN`, and infinite coordinates become `null`.
- `null` means no valid saved position, not coordinate zero.
- On layout render, `null` uses the default workspace layout.
- A normal finite saved value is not clamped to the current device viewport.

This distinction prevents responsive rendering from overwriting the logical
desktop workspace position with a temporary mobile display position.

### Zoom and pan

- `canvas.viewScale` is normalized through `normalizeProjectCanvasViewScale`.
- General zoom range: `MIN_ZOOM_SCALE = 0.05` through
  `MAX_ZOOM_SCALE = 4096`.
- `MAX_ZOOM_BASE_SCALE = 128` is used for fit/base zoom calculations.
- The active canvas view scale is synchronized to project canvas documents.
- `state.pan` is a viewport camera/display value. It is not the per-canvas
  workspace placement and does not replace `anchorLeft`, `anchorTop`, or
  `positions`.

## Default Placement

`computeDefaultLocalViewportCanvasPositions()` creates the initial layout.

- The first/main canvas uses the current workspace center as its anchor.
- `MULTI_CANVAS_SURFACE_GAP = 48` pixels separates canvas surfaces.
- Additional canvases use candidate slots around the main canvas, starting to
  the right, then left, below, and above.
- Candidate size uses each canvas's width, height, and display scale.
- `rectsOverlapWithGap(...)` detects overlap with the configured gap.
- If a requested/saved position would overlap during resolution, the resolver
  places that local surface to the right of the furthest occupied surface.

The new-canvas path calls
`assignAdjacentPositionForNewLocalViewportCanvases(previousLocalCount)` only
when the count increases. This gives each new canvas an immediately operable
position without rewriting valid positions of existing canvases.

## Drag Update Path

Module: `local-viewport-canvas-workflow-utils.js`

```text
drag handle pointer down
  -> beginCanvasSurfacePanelDragInteraction()
pointer move
  -> panel.style.left/top preview
  -> setLocalViewportCanvasPosition() for local canvases
pointer up/cancel
  -> stopCanvasSurfacePanelDragInteraction()
  -> setLocalViewportCanvasLayoutAnchor() for the main canvas
     or setLocalViewportCanvasPosition() for a local canvas
  -> if changed: markAutosaveDirty(), markDocumentUnsavedChange()
  -> scheduleSessionPersist({ includeSnapshots: true })
```

The state is committed once at the end of a drag. A drag that ends at the same
coordinates does not mark the project dirty or create an autosave write.

## Canvas Add and Delete Behavior

### Add

1. Validate the maximum of four total canvases.
2. Create the new canvas document.
3. Reset only the new-layout preparation state.
4. Assign a non-overlapping default position to newly added local canvases.
5. Persist as a structural project change.

### Delete

1. Remove the requested canvas and update `activeCanvasId` only if needed.
2. Preserve the stored positions of remaining canvases.
3. Do not call the layout reset that clears all saved positions.
4. Do not automatically compact or align remaining canvases.

This preserves intentional empty space after a canvas is removed. An explicit
future alignment command may reflow canvases; ordinary deletion does not.

## Persistence Before Phase 5-B7

Before this phase, `localViewportCanvasState` was only saved through the
device-scoped UI session storage key as `localViewportCanvases`.

Consequences:

- It could survive a reload on the same device.
- It was not part of the packaged project/session payload.
- Sheet switching could reuse another sheet's workspace layout.
- External V1/V2 files and Autosave V2 recovery did not have a guaranteed
  per-sheet placement source.

## Phase 5-B7 Changes

### Packaged session

`buildProjectSessionPayload()` and `buildAutosaveSessionPayload()` now add:

```js
session.localViewportCanvases = normalizeLocalViewportCanvasState(...)
```

This uses the existing `session` shape instead of a duplicate document-level
layout structure.

### Restore

`parseProjectSessionPayload()` reads and normalizes the property. During
`applyLoadedDocumentSnapshot()` the parsed value replaces the runtime
`localViewportCanvasState` before layout rendering.

When a valid layout is present, `resetOpenedDocumentViewport()` receives
`preserveLocalCanvasLayout: true`; it does not clear the restored positions.

When the property is absent or invalid, the previous behavior remains:
the default layout is generated from canvas order and surface sizes.

### Save and restore coverage

| Path | Layout source/result |
| --- | --- |
| Active/non-active sheet switching | Each tab's packaged `session` carries its own layout |
| V1 JSON | JSON adapter retains `session.localViewportCanvases` |
| V2 archive | Archive codec retains it while splitting/restoring timelapse only |
| Autosave V2 checkpoint | Sheet project session is checkpointed unchanged |
| Recovery preview/open | Restored packaged session is retained in recovery copy |
| Reload UI session | Existing device-local `localViewportCanvases` remains supported |

Runtime file handles, autosave handles, and project save handles remain
excluded from these layout values.

## Responsive Behavior

The saved values remain logical workspace coordinates.

- Desktop and mobile can calculate different visible panel positions.
- The calculated display position is not written back as a new saved layout.
- Returning to a larger desktop viewport uses the original logical values.
- Only invalid/missing layout values fall back to defaults.

## Validation

- `scripts/test-pixiedraw-dev-multicanvas-layout-phase5b7.mjs`
  verifies session generation/parse, invalid-value fallback, V1 retention,
  drag autosave scheduling, delete non-reflow guard, and restore preservation.
- `scripts/test-pixiedraw-dev-project-storage-v2-codec.mjs`
  verifies root and non-active sheet V2 archive layout round-trip.
- `scripts/test-pixiedraw-dev-autosave-schema-v2-phase4m.mjs`
  verifies checkpoint round-trip.
- `scripts/test-pixiedraw-dev-autosave-schema-v2-recovery-open-phase4r.mjs`
  verifies recovery candidate retention.

Browser verification remains required for four-canvas drag handles, actual
mobile display clamping, sheet switching, external file reopen, and recovery
open behavior.
