# PiXiEEDraw DEV D1 Audit: Delete Dialog, RGB-to-Indexed, RGB Import Palette

## Scope

This is an audit only. It does not change decoder behavior, runtime commits,
the Canonical V2 schema, U3, V2 archive storage, autosave, recent-project
storage, recovery, advertising, Service Worker behavior, or production code.

## A. Recent Project Delete Confirmation

### Current execution path

| Step | Current location |
| --- | --- |
| Recent-card delete button | `recent-project-workflow-utils.js`, `data-startup-recent-delete-id` |
| Project-home click delegation | `startup-workflow-utils.js`, `setupProjectHomeScreen()` |
| Startup-screen click delegation | `startup-workflow-utils.js`, `setupStartupScreen()` |
| Target ID | `deleteButton.dataset.startupRecentDeleteId` |
| Confirm open | `openRecentProjectDeleteConfirmDialog(entry, ...)` |
| Dialog element | `#recentProjectDeleteConfirmDialog` in `index.html` |
| Backdrop | native `dialog::backdrop` through `dialog.showModal()` |
| Confirm/cancel | temporary click, `cancel`, and `close` listeners in the open function |
| Delete commit | `removeRecentProjectEntry(projectId)` after acceptance |

The dialog markup is a document-level `<dialog>` with a `.modal__form` and
confirm/cancel buttons. Its CSS uses `.modal[open]` and `.modal::backdrop`.
The project home itself is a fixed overlay with z-index 525; the current
working-tree mitigation assigns opened dialogs a higher z-index.

### Observed symptom and limit of static evidence

The reported darkened screen proves `showModal()` reached the browser native
top-layer backdrop. Static inspection cannot establish whether the dialog body
then has a zero rectangle, remains hidden, is placed outside the visible safe
area, or is affected by a browser-specific top-layer bug. Those need computed
style and rectangle evidence from the affected browser.

The current implementation explicitly clears `dialog.hidden` before opening
and has a native `window.confirm()` fallback only when `showModal()` throws.
Because no exception is reported, D2-A should add the requested diagnostic at
the point after `showModal()` with `open`, `hidden`, `isConnected`, computed
display/visibility/opacity, rectangle, and z-index values. It should not alter
the actual deletion transaction.

## B. RGB-to-Indexed Conversion

### Execution path

```text
Color-mode radio
-> palette-panel-utils.setColorMode()
-> beginHistory('colorModeConvert')
-> convertCurrentDocumentRgbPixelsToIndexedPalette()
-> buildIndexedPaletteFromFrameDataList()
-> palette / indices state commit
-> palette UI refresh
```

`buildIndexedPaletteFromFrameDataList()` is defined and returned by
`image-import-decode-utils.js`. `palette-panel-utils.js` correctly declares it
as a factory dependency. The DEV `app.js` palette-panel factory passes a
wrapper at the browser-reported line, but the wrapper closes over a binding
that `app.js` never defines or destructures from an image decoder factory.
That is the direct cause of the Safari `ReferenceError`.

`open-import-workflow-utils.js` does instantiate the decoder and destructures
the helper inside its private factory scope. It does not return that helper to
`app.js`. The matching `app.js` getter injected into open-import also refers to
the same undeclared free variable, although the open-import module presently
uses its private decoder binding instead.

### Failure state

The current RGB-to-Indexed path calls `beginHistory('colorModeConvert')`
before calling the missing dependency. The exception occurs before the
converter assigns `state.palette`, layer indices/direct buffers, or
`state.colorMode = nextMode`, and before persistence/dirty notification.
Therefore the document pixels and mode remain RGB, but `history.pending` can
remain set. That can interfere with the next history operation. There is no
conversion-specific rollback/finally path.

### D2-B minimum scope

1. Inject the decoder helper through an explicit, defined factory boundary.
   Do not use a window global or an app.js free-variable wrapper.
2. Keep conversion state atomic: capture/restore or discard the pending
   history snapshot when extraction/remap/UI refresh fails.
3. Commit history, dirty/autosave notification, active-sheet snapshot, and UI
   refresh only after the palette/indices conversion is complete.

## C. External Raster RGB Palette

### Current path

```text
PNG/GIF decode
-> open-import-workflow-utils.loadDocumentFromImageFile()
-> createRgbModeDefaultPalette()
-> RGB direct/importSourceDirect buffers
-> PNG only: Canonical V2 normalize/validate
-> atomic sheet candidate commit
```

`createRgbModeDefaultPalette()` in `palette-utils.js` returns the legacy
transparent-plus-15-color default palette. It is called directly by
`loadDocumentFromImageFile()` for both PNG and GIF. `activeRgb` is initialized
from that palette's active entry, not from a separately configured user draw
color.

P2-A's `applyImportedPalettePlanToCanonicalCandidate()` is not loaded or
called by the actual import path. No used-color extraction, quantizer, or
indexed remap is currently called during this RGB import route. Canonical V2
only safe-clones the already-built payload and adds canonical metadata; it does
not generate or replace the palette.

The observed palette is consequently the old fixed RGB import palette, not a
palette derived from source pixels. It nevertheless violates the current
specification because it is neither an `existingPalette` clone nor an explicit
user-configured palette. The current code has no `existingPalette` input at
the import boundary, and its source of truth is therefore unimplemented.

### D2-C minimum scope

1. Define a stable configured-palette source separate from a transient active
   sheet palette.
2. At import start, clone that palette and preserve the configured RGB draw
   color independently.
3. Remove the import call to `createRgbModeDefaultPalette()` only from the
   raster import builder.
4. Connect P2-A in RGB preserve-existing mode after the E3 browser gate; do
   not extract source colors, quantize, or remap in RGB mode.

## Independence

The three issues are independent:

- Delete confirmation is native dialog DOM/CSS/top-layer observability.
- RGB-to-Indexed is a factory dependency-injection failure with missing
  rollback around an existing history transaction.
- RGB import palette is an unconnected palette-policy migration that still
  calls the legacy default-palette helper.

They share no required schema, autosave, archive, or decoder change.

## Audit Validation

`scripts/test-pixiedraw-dev-delete-indexed-import-palette-d1-audit.mjs` checks
the static entry points, dialog markup/backdrop selectors, dependency return
and missing app binding, conversion ordering, legacy RGB palette call, P2-A
non-connection, and Canonical V2 clone boundary.

Runtime browser evidence remains required for dialog computed-style values and
for confirming the RGB conversion failure state in a live sheet.
