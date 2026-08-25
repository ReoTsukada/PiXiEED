---
contract: DRAW2-CREATOR-WORKSPACE-ASSET-UX
title: PiXiEEDraw2 Creator Workspace and Asset Workflow
status: ACCEPTED_PRODUCT_UX_DIRECTION
date: 2026-08-15
classification: PRIVATE_INTERNAL_ONLY
foundationStatus: COMPLETE_CANDIDATE
formalQualification: NOT_READY
nextScope: CANONICAL_ASSET_DEFINITION_LAYER
---

# Purpose

PiXiEEDraw2 is the authoring surface for a single PiXiEED Creator Workspace. The
workspace is one editing session and one Project context, but its creation modes
are independently presented and lazily mounted. This document turns the supplied
workspace and Asset reference images into a product contract; they are not a
literal pixel-copy target and do not authorize changes to the production route.

# Product boundary

```text
Shared Core
  Project / Asset ID / Revision / Hash / Permission / Command / Event / Package
        │
        ├─ DRAW       Raster / Layer / Frame / Cel / Palette / PXD
        ├─ ANIMATE    Timeline / Tag / Onion Skin / Playback
        ├─ ASSET      Source projection / Asset definition / Dependency view
        ├─ GAME       Scene / Object / Event / Runtime preview adapter
        ├─ AUDIO      Track / Note / Waveform / Mixer adapter
        └─ EXPORT     PNG / GIF / PXD / PiXiPackage preparation
```

The modes switch presentation inside the same Project session. They do not mean
that the app must navigate between unrelated pages or duplicate Project state.
Game Studio, Audio Studio, Core Registry, Commerce, and Runtime remain separate
modules and are not implemented by this UX contract.

## Creator Workspace closure checkpoint

The Creator Workspace foundation is a `COMPLETE_CANDIDATE` for its isolated
presentation and local-state contract. This closes the Workspace foundation
scope; it does not claim formal device, cross-browser, production-provider, or
release qualification.

The following invariants are canonical and must remain protected:

1. One canonical Project state is shared across all creation modes.
2. Mode switching does not recreate Canvas raster, Project, Layer, Frame, Cel,
   Timeline, Undo/Redo, PXD, or PiXiSYNC state.
3. Exactly one heavy Workspace presentation is active at a time.
4. GAME and AUDIO unavailable modules remain explicitly unavailable and never
   present a fake editor.
5. `LOCAL_DRAFT` never becomes canonical Asset Registry state implicitly.
6. Invalid Asset definitions fail closed.
7. Source references are normalized and deterministic before acceptance.
8. Mode switching never performs full Project serialization.
9. Hidden heavy panels do not keep high-frequency work, subscriptions, or
   observers active.
10. DRAW internals never become GAME or AUDIO canonical state.

`REOPEN_REQUIRED = NO` for this foundation scope. Reopen is allowed only for a
regression, contract change, new P0/P1 evidence, a real-device contradiction, or
an upstream canonical change. Formal external qualification remains separate.

# Mode rail

The top workflow rail exposes only the primary creation workflow:

```text
DRAW · ANIMATE · ASSET · GAME · AUDIO · EXPORT
```

The active mode is a local Workspace state, not a Canonical Project operation.
Mode buttons have stable identifiers and accessible names. Selecting a mode must:

- preserve Project, Raster, Layer, Frame, Cel, Selection, Undo/Redo, PXD, and
  PiXiSYNC state;
- mount only the presentation needed for that mode;
- leave unavailable modes visibly unavailable instead of showing a fake editor;
- keep advanced actions in the existing File/Edit/View/Tools/Window/Help menus or
  Command Palette;
- never start Game Studio, Audio production, Market publication, or Runtime
  deployment from the Draw2 UX slice.

Initial vertical slice behavior:

| Mode | Initial surface | Mount policy |
| --- | --- | --- |
| DRAW | existing Canvas, Color, Tool, Timeline | existing Draw2 surface |
| ANIMATE | existing Timeline/Layer/Cel projection | existing Draw2 surface |
| ASSET | local Asset Definition panel | lazy, first selection only |
| GAME | explicit Coming Later/adapter status | no Game Studio mount |
| AUDIO | explicit Coming Later/adapter status | no Audio editor mount |
| EXPORT | existing local Export panel | existing Draw2 surface |

# Asset Definition (vertical-slice contract)

An Asset definition is a reference to source data, not a flattened replacement
for the Project. The initial UI may validate and preview a local draft, but it
must not claim Registry persistence or publication.

```ts
type AssetSourceKind =
  | "LAYER_GROUP"
  | "SELECTED_LAYERS"
  | "VISIBLE_COMPOSITE"
  | "ANIMATION_RANGE";

type AssetKind = "CHARACTER" | "OBJECT" | "TILE" | "BACKGROUND" | "EFFECT";

interface AssetDefinitionDraft {
  sourceProjectId: string;
  sourceCanvasId: string;
  layerSelection:
    | { kind: "CURRENT_LAYER"; layerId: string }
    | { kind: "SELECTED_LAYERS"; layerIds: string[] }
    | { kind: "LAYER_GROUP"; groupId: string }
    | { kind: "VISIBLE_LAYERS" };
  frameSelection:
    | { kind: "CURRENT_FRAME"; frameId: string }
    | { kind: "RANGE"; startFrameId: string; endFrameId: string }
    | { kind: "TAG"; tagId: string }
    | { kind: "EXPLICIT"; frameIds: string[] };
  region:
    | { kind: "FULL_CANVAS" }
    | { kind: "MANUAL"; x: number; y: number; width: number; height: number }
    | { kind: "GRID"; cellSize: 16 | 32; x: number; y: number; columns: number; rows: number }
    | { kind: "CUSTOM_GRID"; cellWidth: number; cellHeight: number; x: number; y: number; columns: number; rows: number };
  animationMapping: Array<{ name: string; frameIds: string[]; loopMode: "LOOP" | "ONCE" | "PING_PONG"; fps?: number }>;
  sourceKind: AssetSourceKind;
  sourceLayerIds: string[];
  frameStart: number;
  frameEnd: number;
  assetKind: AssetKind;
  pivot: "CENTER" | "FEET" | "CUSTOM";
  pivotDefinition: { kind: "CENTER" | "FEET" } | { kind: "CUSTOM"; x: number; y: number };
  protection: { locked: boolean; sourceReadOnly: true; referencePolicy: "LIVE" | "PINNED" | "REVIEW" | "FORKED" };
  metadata: { name: string; description: string; tags: string[] };
  dependencyIds: string[];
}
```

Required invariants for the local vertical slice:

- `sourceProjectId` is non-empty;
- `sourceCanvasId`, Layer IDs, and Frame IDs are stable references; array indexes
  are display hints only and are never the Asset identity;
- `frameStart` and `frameEnd` are positive integers with start ≤ end;
- source layer IDs are deduplicated and deterministic;
- Layer selection, Frame selection, Region, Animation mapping, Pivot, Protection,
  and Metadata are normalized before acceptance;
- a Canvas edit invalidates only definitions whose source Project/Canvas and
  bounded Region intersect the edit; `FULL_CANVAS` is the explicit broad case;
- no source data is flattened or mutated;
- an empty or invalid draft is rejected with an accessible diagnostic;
- successful creation is labelled `LOCAL DRAFT / NOT PERSISTED` until a later
  Asset Registry Work Package supplies the authoritative adapter.

## Asset promotion states

The Asset path is deliberately staged so that a local preview cannot be
mistaken for a registered or sellable Asset:

```text
LOCAL_DRAFT
    ↓ local validation only
VALIDATED_DEFINITION
    ↓ server-authorized Registry adapter
REGISTERED_ASSET
```

Each promotion is explicit and fail-closed. `LOCAL_DRAFT` is Workspace-local
state and is never written to the canonical Asset Registry by a UI shortcut.
`VALIDATED_DEFINITION` means that the source references, frame range, region,
animation mapping, pivot, and dependency references pass the local contract;
it is still not a public or shared Asset. `REGISTERED_ASSET` requires the
future authoritative Registry adapter to resolve the current Project/Asset
records, authorization, revision, provenance, and dependency lock on the
server side.

The first Asset vertical slice must therefore implement the definition and
validation boundary only. It must not invent a client-side registration path,
copy source pixels into an unrelated canonical record, or let Game, Market,
Package, or Runtime consume `LOCAL_DRAFT` as if it were registered.

The live-reference direction is preserved: a definition records source Project,
selected Layer/Frame/Cel references, region, animation clips, pivot, and
dependencies. A later publish or package operation may create a locked
revision, but it must not silently mutate the source Draw Project.

## PXD source-container ownership

The user-facing source container for this workflow is one `.pxd` Project document. It is not
limited to a flattened picture and it does not require a separate `.pxasset` or `.pxproject`
file for each definition. The logical PXD contents are:

```text
PXD
├─ Project metadata and schema version
├─ Draw state: Canvas / Palette / Layers / Frames / Timeline / Tags / settings
├─ AssetDefinitions: source references owned by this PXD
├─ Audio/Game references and bindings for the initial Draw-centered slice
├─ Asset Graph / dependency references
├─ selected revision / recovery / provenance metadata
└─ previews / thumbnails
```

`LOCAL_DRAFT` and `VALIDATED_DEFINITION` are stored as PXD-owned reference definitions when a
PXD source container is materialized. `REGISTERED_ASSET` is an external Registry identity and
authorization result. A PXD may retain its explicit `registryIdentity` mapping, but the mapping
must not replace the source definition or copy source pixels into another canonical record.

The logical container is separate from the editing implementation. IndexedDB journals, OPFS
chunks, caches, checkpoints, and immutable blobs may be used during editing; save/export
materializes the logical PXD without requiring a full monolithic rewrite on every pointer
sample. PiXiPackage is the later delivery/materialization layer for resolved Draw/Audio/Game
revisions, dependencies, provenance, licenses, and runtime data. It is not a replacement for the
PXD source Project.

Initial scope is deliberately Draw-centered. Full Audio/Game editor state, server Registry
persistence, Market publication, and production migration remain separate Work Packages. A
successful local Asset draft must not imply any of those operations.

Future Asset Lock, contributor provenance, dependency lock, registry revision,
and Game Object creation are follow-up contracts. The Draw2 vertical slice may
show an unavailable state for them; it must not simulate completion.

# Presentation profiles

- Desktop: dense Creator Workspace; mode rail, compact tools, Canvas, right
  panels, and Timeline are available without page scroll.
- Tablet: adaptive dock/sheet; only the active presentation tree is mounted.
- Mobile: Canvas-first; mode selection and advanced Asset controls are sheets.
  Current PiXiEEDraw mobile interaction rhythm remains the reference, but the
  Draw2-owned tokens and icons remain authoritative.

Desktop, Tablet, and Mobile share the same Core and Asset draft semantics. Only
the Presentation Profile changes.

# Performance and recovery guardrails

- Never mount all mode trees and hide them with CSS.
- Never duplicate Project, Raster, Timeline, Undo/Redo, or Asset state per mode.
- Hidden mode surfaces must not keep subscriptions, observers, polling, thumbnail
  decoding, or animation work alive.
- Mode changes must not recreate the Editor Core.
- Mode changes and Asset draft validation are local UI actions and must not enter
  PiXiSYNC Canonical Output operations.
- A failed Asset panel must leave the Canonical Project untouched.
- Runtime i18n must not scan the entire Timeline subtree on every mode change.

# Required evidence

The vertical slice is not a product completion claim. Record separately:

1. mode transition and ARIA selected state;
2. Asset draft validation success/failure;
3. no Core recreation on mode change;
4. hidden mode surface not mounted or subscribed;
5. 1280×900, tablet, and 390×844 geometry smoke checks;
6. `deno check`, targeted tests, `git diff --check`;
7. browser/device/Safari/Firefox/long-session evidence as PASS or UNTESTED.

This contract does not approve production route cutover, native packaging,
Store publication, Game Studio implementation, Audio Studio implementation,
Registry persistence, Market changes, migrations, deploys, commits, or pushes.
