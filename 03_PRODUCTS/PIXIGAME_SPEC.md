---
spec_id: PROD-PIXIGAME-001
title: PiXiGame Creator Platform Product Specification
status: RECONSTRUCTED_CANONICAL
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, PRODUCT, ENGINEERING
version: 1.0.0
updated: 2026-08-08
source_status: RECONSTRUCTED_FROM_APPROVED_SOURCES
---

# PiXiGame Creator Platform

## Reconstruction boundary

This is the canonical product specification for the PiXiGame direction required by WP-160 and
later Game/Runtime Work Packages. The original file was not found in the working tree or Git
history. This document is reconstructed only from the approved Master Context, Core/Registry/
Bridge/Package contracts, the Draw2 product specification, the roadmap, and existing performance
and preservation rules. It does not claim that the product or any unlisted implementation exists.

PiXiGame is a Game Creation Environment integrated into the PiXiEED Creator Platform. It is not a
small standalone game maker and it is not a second incompatible type system. PiXiGame uses the
shared PiXiEED Core, Project Registry, Asset Registry, Tool Bridge, Event Core, Package Registry,
permissions, revisions, provenance, and rollback boundaries.

## Product direction

The same Project supports three authoring experiences over the same Entity, Component, Action,
Event, Behavior, Script, and Revision model:

```text
Beginner  → select an object → choose “when” → choose “do” → preview
Advanced  → edit conditions, variables, state, physics, animation, and input details
Expert    → edit TypeScript, Visual Graph, extensions, tests, and isolated SDK modules
```

Easy, detailed, and code modes are views over the same canonical state. They are not separate
engines or projects. Event Sheet and Visual Graph representations must compile to the same bounded
intermediate behavior contract; arbitrary TypeScript is not promised to reverse-convert into nodes.

## Canonical integration

PiXiGame consumes references, not ad-hoc exported copies:

```text
PiXiEED Core
├─ Project Registry: project identity, ownership, membership, visibility, lifecycle
├─ Asset Registry: Asset/Revision/Hash/Dependency/Provenance
├─ Tool Bridge: versioned requests, capabilities, cancellation, bounded events
├─ Event Core: trusted post-commit events and activity boundaries
├─ Package Registry: manifest, Dependency Lock, materialization, verification
└─ Permission/Feature Flag/Rollback: server-authoritative boundaries
```

Draw2 raster, animation, palette, named regions, and Tile Set assets can be consumed by Game.
PiXiAudio BGM, SFX, music-project, and timing assets can be consumed by Game. Consumption stores
`Asset ID + Revision ID + Hash + dependency/provenance reference`, not a silent duplicate upload.

References support the shared Core modes:

- `LIVE`: follows an allowed latest Revision during authoring/preview;
- `PINNED`: fixes the exact Revision for a release, purchased package, or reproducible test;
- `REVIEW`: reports an update and waits for approval;
- `FORKED`: creates an explicit independent lineage before editing.

Game state never overwrites Draw2 source pixels. Collider, Rigid Body, physics, hitbox, hurtbox,
and Game-side placement are Game-owned. Draw2 may provide visual Collider/Hitbox/Hurtbox Guides;
Guide changes do not silently replace an adjusted Game Component.

## Canonical Game project model

```text
Game Project
├─ Scenes
├─ Prefabs and Variants
├─ Entities / Objects
├─ Components and Systems
├─ Transform / Sprite / Animation
├─ Audio / UI / Input Action Maps
├─ Event Sheets / Behavior Graphs / Behavior IR
├─ TypeScript Scripts and Script Revision metadata
├─ Genre Modules and Templates
├─ Save Schema
├─ Build / Export Profiles
├─ Dependency Lock
└─ Package / Runtime compatibility metadata
```

The initial component vocabulary is extensible and includes Transform, Sprite Renderer, Animator,
Camera, Audio Source/Listener, Collider, Rigidbody, Character Controller, UI, Saveable, Script,
Behavior Graph, and later domain modules such as inventory, dialogue, quest, vehicle, AI, or
network identity. A vocabulary entry is not an implementation claim.

Genre templates are starting configurations, not restrictions or separate engines. RPG, fighting,
racing, platformer, puzzle, adventure, visual novel, rhythm, simulation, and other templates may
be added over the shared Core when their contracts and evidence exist.

## Requirement status

| Requirement | Status | Target | Truthful state |
| --- | --- | --- | --- |
| Core/Project/Asset/Tool/Package integration | CURRENT | WP-010, WP-091–WP-095 | Isolated contracts exist; Game production wiring is not connected. |
| Draw2 Asset consumption | CURRENT ISOLATED BRIDGE | WP-160, WP-200 | Locked Draw Asset Revision references are implemented; production Game Editor wiring is not claimed. |
| PiXiAudio Asset consumption | CURRENT ISOLATED BRIDGE | WP-190, WP-200 | Locked Audio Revision references are implemented; production Audio/Game wiring is not claimed. |
| LIVE/PINNED/REVIEW/FORKED references | CURRENT | WP-040, WP-092, WP-200 | Core reference semantics and isolated Game adapter exist; public wiring is not claimed. |
| Scene / Entity / Component / Transform | CURRENT ISOLATED CONTRACT | WP-200 | Deterministic Core schema and fixtures exist; full Game Editor UI is not claimed. |
| Sprite / Animation / Audio / UI | CURRENT ISOLATED CONTRACT | WP-190, WP-200 | Draw/Audio references and bounded Runtime consumption exist; full UI authoring is not claimed. |
| Input Action / Event / Logic | CURRENT ISOLATED CONTRACT | WP-200 | Semantic controls and bounded behavior IR exist; unrestricted scripting is not claimed. |
| No-code / Event Sheet / Visual Graph | PLANNED | WP-200+ | Same behavior contract is required; editor is not implemented. |
| TypeScript Script boundary | ADVANCED | WP-200+ | Isolated, versioned, capability-scoped execution boundary is required. |
| C# / C++ / external Engine Adapter | FUTURE EXTENSION | External adapters | No unverified native runtime or exporter is claimed. |
| Game preview | CURRENT ISOLATED ADAPTER | WP-160, WP-200 | Preview uses the separate Runtime boundary; public Runtime is not claimed. |
| Build / Package / Publish boundary | CURRENT ISOLATED PLAN | WP-160, WP-200, WP-210 | Deterministic plan/artifact provenance exists; production build or publish is not connected. |
| Runtime dependency snapshot | CURRENT ISOLATED CONTRACT | WP-160, WP-200 | Locked Package dependencies and Runtime compatibility are verified in fixtures. |
| Deterministic saved project state | CURRENT ISOLATED CONTRACT | WP-160, WP-200 | Versioned Runtime Save State is separate from editable Project State. |
| Extension architecture | ADVANCED | WP-093, WP-200+ | Tool Bridge capability/version/security boundaries exist; SDK is not implemented. |

Status definitions are deliberately conservative:

- `CURRENT`: an approved contract or isolated implementation exists;
- `PLANNED`: required product work is defined but not complete;
- `ADVANCED`: later high-complexity capability with a defined boundary;
- `FUTURE EXTENSION`: optional or external adapter boundary, not a current product promise.

## PiXiGame Workspace direction

Desktop Game Editor may use a professional Creator Workspace inspired by Unity-like authoring
density without copying Unity UI, code, branding, or license:

```text
Scene / Game Viewport | Hierarchy | Inspector
Asset Browser / Project | Components | Console / Diagnostics
Timeline / Animation when relevant | Preview / Runtime controls
```

The UI is a projection and command client. It cannot become the authority for canonical Game
state. Panel state, selection, zoom, and workspace presets are local presentation state; Project,
Entity, Component, Action, Script, Revision, and Dependency Lock are Core-owned state.

Mobile and tablet presentation must remain adaptive. Mobile may use a Canvas/preview-first surface,
vertical Event Sheet lists, Bottom Sheets, drawers, collapsed Inspector sections, and a readable
code handoff. Tablet is an intermediate workspace. No required operation may depend only on hover
or right-click.

## Preview, revision, and hot reload

Preview uses a confirmed Revision or an explicitly labelled unsaved local preview. It must never
silently become a published, purchased, or release state. During playback, an incoming Revision
is reported and applied at a safe boundary—stop, loop boundary, explicit approval, or a narrowly
verified hot-reload path. Failed reload returns to the previous valid Revision and preserves the
Runtime world state where possible.

When a Game user selects `Edit in Draw2`, the bridge opens the same source Asset ID and Revision
lineage. A saved Draw2 change creates a new Asset Revision; it does not delete Game placement,
Component values, events, or physics. Dimension, frame, anchor, or compatibility-breaking changes
must produce an impact report before acceptance.

## Security and preservation

Scripts, extensions, and external content are untrusted. They require version, capability,
compatibility, provenance, and sandbox/isolated execution boundaries. Build or preview must reject
active content, unsafe external URLs, path traversal, unsupported formats, dependency cycles, hash
mismatches, and unauthorized dependencies. No user script may run with unrestricted host-process
privileges.

Current PiXiEEDraw, current PXD, PiXiSYNC, Market, existing URLs, Projects, Purchases,
Entitlements, Licenses, Royalties, production Database/Storage, and public Navigation remain
unchanged until separate compatibility, rollback, and release gates pass.

## Explicit non-scope for WP-160

WP-160 is a Draw-to-play preview foundation. It must not implement the entire Game Creation
Environment, native export, marketplace integration, production Runtime, or external Engine
support. Those later scopes require their own Work Packages, fixtures, security review, and
approval gates.
