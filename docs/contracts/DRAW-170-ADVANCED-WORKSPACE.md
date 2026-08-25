# DRAW-170 Advanced Workspace Contract

## Product boundary

Draw2 Advanced Tools are a pure Core plus a lazy Editor adapter. Pattern Brush,
Stamp, Mirror/Symmetry, Dither, indexed Palette operations, Grid/Ruler/Guide,
Reference, Slice, Tags, Tile Map, Game Asset Metadata, and Market Package
Preparation produce deterministic plans. The adapter converts a committed plan
to one `raster.writeSet` command; Preview/Cancel never mutates canonical
raster state.

The initial Editor entry may expose icon-first controls, but the Advanced Core
and adapter are not part of the initial authoring chunk. They load only after
an explicit isolated action. Package Preparation ends at `PREPARATION_ONLY`;
it has no price, purchase, entitlement, royalty, payout, or publish operation.

## State ownership

| State | Authority | Sync class |
| --- | --- | --- |
| Canonical raster and committed write set | Draw2 EditorCore | `ACTIVE_SYNC` when the command contract allows it |
| Tool preview, hover, pointer samples, local overlays | Advanced Tool session | `LOCAL_ONLY` |
| Asset Revision and locked Package dependencies | Canonical registries | `PLATFORM_EVENT` / `ASYNC_ON_DEMAND` |
| Market preparation summary | Isolated package preparation boundary | `PREPARATION_ONLY` |

Overlay toggles invalidate only their own projection domain. They never rebuild
or recolor canonical pixels. Indexed Palette index `0` remains transparent and
protected; palettes are bounded to 256 entries.

## Failure and performance policy

Malformed IDs, palette indexes, out-of-bounds writes, unsafe external reference
URLs, duplicate/cyclic dependencies, unknown metadata, stale commands,
duplicate commands, and preview commits fail closed. Large Dither plans expose
a measured Worker candidate but are not silently moved to a Worker.

All bundle, device, compositor, memory, and long-session claims must remain
separate. Current synthetic Stress measurements contain a residual Long Task;
they are evidence for triage, not a production performance PASS.
