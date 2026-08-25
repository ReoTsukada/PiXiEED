# WP-130 Timeline / Layer Track / Frame / Cel Contract

Status: `IMPLEMENTED_ISOLATED_REFERENCE`, 2026-08-08

WP-130 adds the structural timeline boundary to the isolated `pixiedraw2/`
entry. The current production route, PXD, PiXiSYNC, Market, and data are
unchanged. The entry remains `data-feature-flag="off"`, `noindex,nofollow`,
and is not connected to public navigation.

## Canonical identities

Project, Timeline, Frame, Layer Track, Cel, and raster backing are separate
records. `projectId`, `timelineId`, `frameId`, `layerTrackId`, and `celId` are
stable non-index identifiers. Array position is only a projection and may not
be used as an identity or a sync key.

`Frame` owns timing, order key, metadata version, and its cel bindings.
`Layer Track` owns name, visibility, opacity, blend-mode reference, lock,
lifecycle, and order key. `Cel` owns its identity, frame/layer binding,
binding mode, raster reference, record version, and lifecycle. An `EMPTY` Cel
has no raster reference and therefore does not allocate a transparent full
raster.

Cel binding modes are explicit: `EMPTY`, `RASTER`,
`DUPLICATE_INDEPENDENT`, `SHARED_REFERENCE`, and the future-compatible
`LINKED_HELD_CANDIDATE`. Duplicating a Frame creates new Frame/Cel identities
and references the existing raster backing. Editing that duplicate performs a
bounded affected-tile Copy-on-Write split; it does not clone the whole raster.

## Structural command boundary

All structural changes pass through a typed envelope with project/asset scope,
schema version, actor/client identity, client sequence, base structure epoch,
and bounded payload. The implementation validates before mutation and rejects
unknown IDs, duplicate IDs, stale/duplicate commands, invalid order or
duration, wrong asset scope, invalid cel bindings, and removal of the final
required Frame or Layer Track.

Supported commands are:

- Layer Track: add, remove, duplicate, reorder, rename, visibility, opacity,
  and lock.
- Frame: add, remove, duplicate, reorder, and duration change.
- Cel: create, clear, and replace binding.

The canonical mutation produces stable-ID-preserving state, a structural dirty
domain, a bounded Canonical Operation, and a local journal record. Structural
Undo/Redo restores the exact state snapshot, including identities, order, and
raster references/content. It is not a visual approximation.

Dirty domains are separate: `RASTER_DIRTY`, `COMPOSITE_DIRTY`,
`TIMELINE_STRUCTURE_DIRTY`, `TIMELINE_CELL_DIRTY`, `LAYER_METADATA_DIRTY`, and
`ONION_SKIN_DIRTY`.

## Timeline, Onion Skin, and playback

Canonical timeline order is kept separate from `TimelineSessionState`. Active
Frame, selected Frame/Layer, scroll, hover, zoom, and panel dimensions are
personal/session projections and are not Project State or PiXiSYNC operations.

`calculateTimelineWindow()` returns a visible range plus bounded overscan,
stable IDs, and total dimensions. It does not materialize all frame/layer DOM,
raster composites, or thumbnails. The 1000-frame fixture is used to verify
this boundary.

Onion Skin is a pure renderer projection over neighboring Frame/Cel references.
It reports `ONION_SKIN_DIRTY`, `canonicalMutation: false`, and does not change
Canonical State or hashes. Playback is a deterministic timing projection and
does not journal or mutate state.

## Persistence and sync seams

The implementation exposes only a local structural journal and a
`StructuralSyncEnvelope` seam. It marks `snapshotIncluded: false` and never
changes the current PiXiSYNC implementation. A future adapter may transport
structural Canonical Operations; session/UI projection state is explicitly not
sync-eligible. The current PXD format and storage placement remain unchanged.

## Instrumentation and fixtures

`measureTimelineMemory()` reports Frame, Layer Track, Cel metadata bytes,
allocated/shared/COW raster bytes, empty Cels, window count, and Onion cache
bytes. `run-timeline-structure-benchmark.ts` covers:

- A: 256×256, 12 layers, 60 frames
- B: 512×512, 20 layers, 120 frames
- C: 1000 frames
- D: 100 layers

The benchmark measures add/duplicate/remove/restore/reorder, active-frame and
virtual-window projection, Onion Skin, and COW split. It is a local synthetic
reference measurement; formal device/compositor/long-session performance gate
remains `UNTESTED`.

## Verification boundary

The isolated browser surface is checked at 390×844 and 1280×900 for frame
selection/add/duplicate/remove, layer add/select/reorder/visibility, timeline
scroll, Onion toggle, keyboard focus, accessible names/selected state, and
page-overflow containment. Empty, error, and unavailable states remain
explicit; no production capability is presented as available.

The required repository-wide baseline remains the pre-existing 14 failure
identities. WP-130 is accepted only when the existing Test/target/Error
Signatures match exactly and new failure identities are zero.

## Finalization Gate: Pointer Stroke and bundle boundary

### continuous Pen Stroke

The Pointer path is a `pointerdown`/`pointermove`/`pointerup` Stroke Session.
Coalesced samples are accepted when available, but are not required. Every
sample path is expanded with deterministic Bresenham pixel-line interpolation
before one `raster.strokeCommit`; repeated coordinates are deduplicated and
pointer capture keeps a Stroke continuous when the pointer leaves the Canvas.
Capture loss/cancel clears the preview without Canonical mutation. Pen and
Eraser use the same path, with Eraser writing transparent palette index 0.

The Stroke preview is drawn only on the overlay. Commit records one local
history operation and one Journal candidate. `strokeMetrics` records input
points, interpolated pixels, touched/dirty Tiles, dirty Regions, and unrelated
Frame/Layer counts. Dirty invalidation is derived from the touched pixels and
never escalates to a full Canvas by virtue of interpolation.

### Stroke Dirty Locality

The finalization fixtures cover horizontal, vertical, diagonal, steep diagonal,
reverse, edge, repeated-coordinate, leave/capture, and continuous Eraser paths.
The 1000-Frame/100-Layer proof records total items, visible bounded projection,
overscan, rendered item count, and no all-raster/all-Cel/all-thumbnail/full
composite work in the virtual window path.

### Bundle Baseline

Bundle measurements use the same compression definitions as the WP-110 local
reference measurement: raw, minified, gzip level 9, and Brotli, with CSS,
initial requests, lazy chunks, source-map policy, and measurement commands.
The current entry contains no Debug Fixture, benchmark harness, Audio, Game,
Market, or production route imports. Future boundaries remain available for
Timeline, advanced Selection/Transform, Export, Asset Browser, Advanced
Animation, and later tool families without changing the Project Format.
