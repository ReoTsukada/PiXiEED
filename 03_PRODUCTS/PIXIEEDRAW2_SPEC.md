---
document_id: PIXIEED-DRAW2-PRODUCT-SPEC
title: PiXiEEDraw2 Product Specification
status: RECONSTRUCTED_CANONICAL
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
reconstruction_basis:
  - 02_ARCHITECTURE/PIXIEED_PRODUCT_STRATEGY.md
  - 00_START_HERE/LATEST_CANONICAL_DECISIONS.md
  - docs/contracts/WP-100-PIXEEDRAW2-VERTICAL-SLICE.md
  - docs/contracts/WP-110-PALETTE-RASTER-PEN-ERASER.md
  - 05_PERFORMANCE/DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md
  - 05_PERFORMANCE/DRAW2_DEVICE_AND_WORKLOAD_MATRIX.md
---

# PiXiEEDraw2 Product Specification

## 1. Product position

PiXiEEDraw2 is the isolated successor editor for PiXiEED's high-performance pixel-art
workflow. It is developed as a separate Module/Route/Entry and is not a direct rewrite of
the current `pixiedraw/` application. The current PiXiEEDraw, current PXD, current
PiXiSYNC, existing URLs, Projects, Market products, purchases, rights, and financial data
remain protected until the replacement gates are independently satisfied.

The product direction is a customizable pixel-art creation environment connected to
PiXiEED Core through Project Registry, Asset Registry, Package Registry, and the Versioned
Tool Bridge. Core owns identity, Revision, dependency, permission, and event contracts;
Draw2 owns Draw source editing. The editor must not create a competing identity or
LIVE/PINNED/REVIEW/FORKED policy system.

## 2. Canonical editing model

The canonical source raster is an indexed `Uint8Array`: palette index `0` is transparent,
indices `1..255` are editable palette entries, and RGBA is only a display or GPU-upload
projection. Draw2 edits Project/Asset Revisions through deterministic commands and keeps
the following responsibilities separate:

```text
Pointer / touch / stylus
  → local preview
  → validated command
  → dirty Tile / dirty Region
  → affected layer/frame presentation
  → Canvas/renderer projection
  → Journal, dirty-byte save, and verified Checkpoint
```

Active editing must remain bounded by affected Tile, Region, Layer, Frame, and viewport
work. It must not scan every canvas pixel, materialize an entire Timeline, serialize a
whole Project per stroke, or send pointer samples as PiXiSYNC events. Heavy operations
(fill, transform, composite, encode/decode, import/export, package materialization,
waveform, and large checkpoints) use explicit cancellation, progress, chunking, and
worker boundaries after measurement.

Storage follows the Core contract: memory owns active editing state and caches, IndexedDB
owns structured Journal/Index/Offline Queue metadata, OPFS owns local large bytes and
caches, the server database owns confirmed metadata/permission/Revision authority, and
Object Storage owns immutable Blobs, exports, packages, and backups.

## 3. Traceable product scope

The status values describe product intent, not an implementation claim:

- `CURRENT SLICE`: present in the isolated WP-100/WP-110 slice and covered by its tests.
- `PLANNED`: required Draw2 product work after the current slice.
- `ADVANCED`: a later high-complexity capability with a defined boundary, not a default
  editor implementation.
- `FUTURE EXTENSION`: an optional extension/plugin or external-tool boundary.

| Requirement | Status | Target phase | Truthful implementation state |
| --- | --- | --- | --- |
| High-performance pixel art editor | CURRENT SLICE | WP-100/WP-110, WP-120+ | Isolated indexed-raster slice exists; full performance gate is not passed. |
| Sprite authoring | PLANNED | WP-120–WP-160 | Not implemented as a complete workflow. |
| Animation authoring | PLANNED | WP-120–WP-160 | Timeline/frame contract remains future work. |
| Layer / track / frame / cel | PLANNED | WP-120–WP-160 | Full editor model and UI are not implemented. |
| Indexed palette | CURRENT SLICE | WP-110 | Palette indices and color definition are implemented and tested. |
| Pen / eraser / fill | CURRENT SLICE | WP-110 | Bounded Core commands and isolated UI are implemented and tested. |
| Selection / transform | PLANNED | WP-120+ | Not implemented in the current slice. |
| Undo / redo | PLANNED | WP-120+ | Command boundary exists; user-facing history is not complete. |
| Autosave / crash recovery | PLANNED | WP-130 | WP-110 has a local Journal/Checkpoint seam; crash recovery is not complete. |
| PXD / legacy compatibility | CURRENT SLICE | WP-140–WP-150 | New PXD v1 round-trip and isolated read-only Legacy archive-v2 adapter exist; real binary fixtures and production compatibility remain untested. |
| PiXiSYNC compatibility | PLANNED | WP-130, WP-150 | Existing contract is preserved; Draw2 sync is not connected. |
| Asset Registry / Project Registry / Package integration | PLANNED | WP-140, WP-150, WP-170, WP-190 | Registry contracts exist; Draw2 is not connected to production data. |
| Draw2 → Game live asset workflow | PLANNED | WP-160, WP-170 | Uses Core Asset Revision and event boundaries; not implemented. |
| Draw2 → visual/runtime workflow | PLANNED | WP-160, WP-190 | Preview/runtime references are planned; not implemented. |
| PNG / GIF / sprite sheet / project export | PLANNED | WP-140 | Deterministic PNG and isolated PXD v1 export/import are implemented; GIF and sprite sheet remain future work, while Legacy archive-v2 support is an isolated adapter with external compatibility gates pending. |
| Tile map authoring | ADVANCED | WP-160+ | Boundary is compatible with Tile Set assets; editor feature is not implemented. |
| Desktop landscape UI | PLANNED | WP-120 | Responsive shell direction exists; production editor UI is not implemented. |
| Mobile portrait UI | PLANNED | WP-120 | Browser viewport checks exist; real-device behavior is untested. |
| Touch / stylus | PLANNED | WP-120, WP-180 | Input boundary is planned; stylus evidence is untested. |
| Timeline / layer-list virtualization | ADVANCED | WP-120+ | Required for large projects; no full compositor is implemented. |
| Background / noise removal extension boundary | FUTURE EXTENSION | Plugin/Tool boundary | Must remain an extension, not an editor-core dependency. |
| Sprite-sheet / tile utilities | ADVANCED | WP-140+ | Export/utility boundary is planned; no complete utility suite exists. |
| Bone / physics-assisted extension boundary | FUTURE EXTENSION | PiXiGame/extension boundary | Draw2 may edit Collider/Hitbox/Hurtbox guides; physics belongs to PiXiGame. |
| Voxel / 3D export extension boundary | FUTURE EXTENSION | External/export boundary | No 3D or voxel editor is claimed. |
| Blender / Unity external export boundary | FUTURE EXTENSION | External adapters | External export is an adapter boundary; generated output is not reverse-synced automatically. |
| Extension / plugin architecture | FUTURE EXTENSION | Core Tool Bridge | Capability/version/permission boundaries are required before extensions load. |
| High customization capability | ADVANCED | WP-120+ | Tokenized UI and extension points are direction; no unrestricted customization is claimed. |

## 4. Compatibility and integration rules

The current PXD archive remains readable and writable by the current application and is not
changed by Draw2. Draw2 uses a lossless legacy adapter and retains the original source until
compatibility fixtures, hashes, and visual checks pass. The new Draw2 `.pxd` is a user-facing
source container for one PiXiEED Project: it keeps Draw state and reference-only
`AssetDefinitions` together, while the initial slice stores Audio/Game as bindings and
references rather than full editor state. The integrated PiXiPackage remains a versioned Core
delivery package for Draw, Audio, Game, runtime/video, controls, dependencies, provenance, and
licenses. It is materialized from the source container and never expands or rewrites the current
production PXD in place. `PXD2` is not a product or format name.

### PXD canonical project container

The creator's source of truth is one editable `.pxd` container:

```text
PXD
├── Project / Draw state
├── AssetDefinitions (stable source references, no pixel copies)
├── Asset Graph / dependency references
├── Audio/Game bindings for the current Draw-centered slice
├── recovery / revision / provenance boundaries
└── previews / thumbnails
```

An Asset Definition selects source Project/Canvas/Layer/Frame/Cel data, a region, animation
clips, pivot, protection, metadata, and dependencies. Its explicit promotion path is
`LOCAL_DRAFT → VALIDATED_DEFINITION → PXD AssetDefinitions → Registry Bridge → REGISTERED_ASSET`.
Registry identity is an external mapping and does not replace or remove the PXD definition.
There is no requirement for users to manage separate `.pxasset` or `.pxproject` files.

During editing, IndexedDB journals, OPFS chunks, caches, checkpoints, and immutable blobs may
back the logical PXD container. They are implementation details; materialization happens at save,
backup, transfer, or export. This keeps the one-file mental model without rewriting a monolithic
archive on every edit. The editable common extension remains `.pxd` when a package is
materialized as an editable file.

Draw2 does not directly rewrite Game, Audio, Market, or SNS records. A source edit creates
an Asset Revision and a bounded Core event. Consumers choose `LIVE`, `PINNED`, `REVIEW`, or
`FORKED`; published, sold, and purchased content is pinned with dependency and license
snapshots. A missing or unauthorized dependency is a visible recovery error, never an
empty substitute. Existing Market products and purchase/entitlement/rights records are
projected only through a later approved adapter and are not rewritten by this specification.

Draw2 may create visual Collider/Hitbox/Hurtbox guides. Actual Collider, Rigid Body, and
physics editing belongs to PiXiGame. External Unity/Blender/other-engine output is a
separate adapter boundary, and independent edits after export are not promised to
reverse-sync automatically into the PiXiEED Project.

## 5. UX, performance, and release constraints

Desktop landscape, tablet/split view, and mobile portrait surfaces must support keyboard,
touch, and stylus intent without requiring hover or right-click. The active production
canvas, Timeline, save, and undo/redo areas have no advertising. Safe Area and text scaling
are part of the mobile contract. Light/dark/system theme changes UI tokens only; they must
not change canonical pixel indices, alpha, palette values, Preview, or Thumbnail output.

The desktop reference fixture is 512×512, 20 Layers, 120 Frames at 60Hz with a target
p95 input-to-visible of `<=24ms`; the mobile reference fixture is 256×256, 12 Layers,
60 Frames with a target of `<=32ms`. A routine-editing Long Task over 50ms is a release
failure. Missing real-device, Safari/Firefox, stylus, 30-minute memory, WebGPU/Wasm/SAB,
Worker/Renderer-equivalence, or full compositor evidence remains `UNTESTED`, never PASS.

### 5.1 Aseprite UX reference baseline

Aseprite is an external reference for pixel-art editing ergonomics and feature
completeness. It is not a runtime dependency, copied implementation, or indication that
PiXiEED adopts its license, file format, or product identity. Draw2 must provide the
following basic operations before claiming a comparable pixel-art authoring baseline:

- continuous Pen interpolation during fast pointer movement, line/constraint assistance,
  temporary Eyedropper/Hand switching, and keyboard shortcut discovery;
- Selection Add/Subtract/Intersect, Move, and active-Cel Transform with nearest-neighbor
  pixel semantics;
- Layer visibility/lock, Layer × Frame cells (Cels), Cel/Frame/Layer copy and movement,
  Onion Skin as a non-destructive projection, and context/keyboard operations;
- indexed Palette and nearest-neighbor display/export semantics without Theme-dependent
  changes to canonical pixel values.

Desktop Draw2 may combine this dense pixel-art workflow with dockable Workspace,
Inspector, and Asset Browser concepts. Mobile Draw2 must offer the same intent through
adaptive Canvas-centered surfaces, Bottom Sheets, and switchable Panels rather than a
scaled-down desktop layout. Every relevant Work Package audit records baseline coverage,
operation steps, desktop/mobile equivalent, accessibility, and measured performance;
missing or unmeasured evidence is recorded as `UNTESTED`.

### 5.2 Canonical workspace direction

Draw2 Desktop is a professional Creator Workspace: Aseprite is the minimum pixel-art efficiency
reference, while dockable/resizable panels, Inspector, Asset Browser, workspace presets, and
high-density authoring ideas may be adapted from Unity-like creator tools. PiXiEED does not copy
either product's UI, code, branding, format, or license.

Draw2 Mobile Portrait is Canvas-first and inherits the useful vertical interaction qualities of
the current PiXiEEDraw: the Canvas remains central, primary tools are quickly reachable, and only
contextually needed UI is shown. Layers, Timeline, Palette, Properties, and Assets may appear as
Bottom Sheets, Drawers, Context Panels, Tabs, expandable panels, or focused full-screen subviews.
Mobile must expose the same intent without shrinking the Desktop workspace into an unusable UI.

Tablet is an adaptive middle workspace. Desktop, Tablet, and Mobile share one Canonical Editor
Core and Project/PXD model; only Presentation, Workspace, and input adaptation vary by hardware.

Hidden Timeline/layer/Asset panels must not continuously render heavy DOM or perform background
processing. Use Lazy Mount, virtualization, localized updates, and Canvas/UI render isolation.
Opening or closing a sheet must not recreate the Editor Core or force a full Canvas rerender.

### 5.3 Game/Runtime separation

PiXiGame owns Game authoring state, Scene/Entity/Component/Physics configuration, Input/Behavior,
and Preview controls. PiXiRuntime is a separate lightweight execution boundary and must not carry
Draw2 Editor UI, PiXiAudio Editor UI, Layers/Timeline/Inspector, or unrestricted authoring state.
Build and Package boundaries are defined in `02_ARCHITECTURE/BUILD_EXPORT_PIPELINE.md`.

## 6. Completion and replacement gates

Each implementation Work Package must trace to this specification, use versioned schemas,
normal and failure tests, recovery evidence, and a restartable Checkpoint. Draw2 cannot
replace the current editor or connect the public Navigation until legacy PXD/PiXiSYNC/URL/
Project/Product compatibility, accessibility, mobile/desktop performance, visual
regression, permissions, rollback, and baseline-failure gates pass. Production migration,
Deploy, Publish, and route cutover remain separate explicitly authorized operations.

## 7. Reconstruction notice

The original `03_PRODUCTS/PIXIEEDRAW2_SPEC.md` was not found in the working tree or Git
history during the WP-110 finalization search. This document is therefore a truthful
`RECONSTRUCTED_CANONICAL` specification, not a recovered verbatim file. The detailed
requirement-to-source mapping and implementation status are recorded in
`docs/inventory/pixiedraw2-product-spec-provenance.json`, and the decision is recorded in
`docs/decisions/ADR-20260807-PIXIEEDRAW2-product-spec-reconstruction.md`.
