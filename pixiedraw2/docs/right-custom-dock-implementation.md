# PiXiEEDraw2 Right Custom Dock

## Scope

The right dock is an authoring-only workspace projection. It does not change
Canvas, Timeline, Raster, PXD, PiXYNC, Market, or production routes.

```text
RightDock
├─ PersistentPalette
├─ PaletteResizeDivider
└─ CustomDock
   ├─ TabStrip
   └─ ActivePanelHost
```

The Palette is always visible at the top. The custom area starts with `Color`
and `+`; additional panels are selected from the registry-backed panel picker.
Unavailable panels are shown explicitly as `Coming Later` and are not made to
look operational.

Undo/Redo and Zoom/Fit are top tools, not right-dock panels. Realtime Sync is a
compact top status popover; its Local/Connecting/Synced/Offline/Conflict state
is not stored in the right-dock preference and is not a creation panel.

The isolated UI displays the product name as `PiXYNC` and accepts a future
adapter event named
`draw2:pixync-status`. Its detail can provide `state`, `roomId`, `revision`,
`members`, `latencyMs`, and `message`; absent or invalid state remains explicitly
`Local` rather than implying a live connection.

The lower-case event identifier is intentionally retained as a compatibility
key; the user-facing name is `PiXYNC`.

## Local state

`pixieed:draw2:right-dock:v1` is a best-effort local preference only:

- `paletteRatio`: palette height ratio, clamped to the safe range
- `tabs`: visible singleton panel IDs
- `activeTab`: selected visible panel ID

This state is not Project data and is never emitted as a PiXYNC operation.
The divider has a 6–8px hit area, clamps Palette to at least 120px and the
custom area to at least 100px, and double-click restores the 30% default.

## Panel registry

The registry is the single UI source for Color, Layers, Inspector, Assets,
Tileset, Advanced Tools, Preview, and Export. History and Navigator are
intentionally excluded because Undo/Redo and Zoom/Fit are already available in
the top tool rail. The picker searches labels, categories, and aliases. A visible
singleton is disabled in the picker, avoiding duplicate tabs. A tab can be
closed with its context menu; closing the active tab selects the remaining tab,
and closing the last tab leaves an explicit `Add panel` empty state.

## Verification

Browser verification covered:

- initial `Color +` state and no legacy right-dock header
- Add → search → Layers → active panel switch
- new tab and active tab persistence after a fresh page load
- right-click tab close and fallback to Color
- divider cursor/hit area and double-click reset
- desktop horizontal overflow remains zero

Automated checks remain the Draw2 package checks (`deno task check`,
`deno task test`, `deno task build`, and `deno task build:workspace`).
