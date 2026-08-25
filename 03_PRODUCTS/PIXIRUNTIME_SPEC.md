---
spec_id: PROD-PIXIRUNTIME-001
title: PiXiRuntime Execution Runtime Product Specification
status: RECONSTRUCTED_CANONICAL
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, PRODUCT, ENGINEERING
version: 1.0.0
updated: 2026-08-08
source_status: RECONSTRUCTED_FROM_APPROVED_SOURCES
---

# PiXiRuntime Execution Runtime

## Reconstruction boundary

The original `PIXIRUNTIME_SPEC.md` was not found in the working tree or Git history. This
specification is reconstructed from the approved PiXiEED Master Context, Core/Package/Asset/Tool
Bridge contracts, Cost-aware Realtime and performance documents, the site integration roadmap,
and the PiXiGame product direction. It defines the Runtime boundary; it does not claim a shipped
Runtime implementation.

PiXiRuntime is a lightweight, reproducible, embeddable execution Runtime. It is not PiXiGame
Editor and must not contain Editor UI or authoring state.

```text
PiXiGame Editor          → authoring, commands, Project/Revision changes
Build / Package Pipeline → validation, lock, processing, artifact creation
PiXiRuntime              → load, resolve, execute, render, input, save-state boundary
```

## Runtime contract

Every Runtime Artifact is interpreted with explicit:

- `runtimeId` and `runtimeVersion`;
- package/manifest schema and archive version compatibility;
- target/capability profile;
- exact Package ID, Package Version, Dependency Lock, and content Hash;
- asset resolution policy and license/provenance references;
- build configuration and deterministic verification metadata.

Unknown or incompatible versions fail closed with a diagnostic. Runtime must not reinterpret an
unknown Project or silently substitute a missing Asset.

## Execution responsibilities

```text
Runtime Artifact
→ manifest validation
→ Dependency Lock validation
→ fixed Revision/Blob resolution
→ Scene/Prefab/Entity load
→ Component/System registration
→ Input binding
→ deterministic game loop
→ raster/animation/audio presentation
→ save/state boundary
→ diagnostics and metrics
```

Runtime consumes Draw2 raster, sprite, animation, palette, and Tile assets, plus PiXiAudio BGM/SFX
references, through locked Package dependencies. It does not edit source Draw2 or Audio state.

The execution loop owns only the Runtime world state required for play:

- input sampling and semantic Action dispatch;
- timing, tick policy, frame pacing, and pause/resume;
- Scene/Entity/Component/System updates;
- animation and audio scheduling;
- renderer/presentation submission;
- bounded save/state persistence when the Package declares it.

Canonical Project authoring state, Asset Revisions, Package Registry records, permissions, and
license/entitlement state remain outside Runtime authority.

## Save and state boundary

Runtime save state is separate from editable Project State:

```text
Editable Project Revision
  └─ authoring source, Components, Graph/Script, Build Profile

Runtime Save State
  └─ declared Entity/Component values, progression, checkpoint, versioned schema
```

Only a declared, versioned Save Schema may be persisted. Runtime cannot rewrite the canonical
Game Project or change a Package Dependency Lock. Migration of save state is explicit and
fail-closed; unsupported versions remain recoverable diagnostics, not empty state.

## Security and capability boundary

Runtime must support:

- sandboxed or isolated script/extension execution;
- package path and URL restrictions;
- active-content and executable-module policy;
- dependency, hash, manifest, and license checks before execution;
- capability detection and explicit permission for input, audio, storage, network, and extension
  APIs;
- no unrestricted host-process execution;
- diagnostics that exclude JWT, email, secrets, raw Project content, and private commission data.

User code, Wasm, and external modules are versioned capabilities, not automatically available
Runtime features. A missing capability selects an explicit fallback or a visible unavailable
state; it never silently changes the Game Project.

## Hardware adaptation

The same canonical Game Project and locked dependency state must work across capability profiles:

- desktop browser;
- mobile browser;
- tablet;
- keyboard/mouse;
- touch and appropriate mobile controls;
- gamepad where supported.

Hardware differences are expressed through Input Mapping, Presentation Profile, Quality Profile,
and detected capabilities. They must not fork the canonical Project into incompatible data models.

## Runtime performance and bundle boundary

PiXiRuntime is optimized for public execution and may need to serve many users. It must not load
the PiXiGame Editor, Draw2, PiXiAudio Editor, unused Creator Workspace, or the full Asset Registry
client. Required assets are resolved from the Package Dependency Snapshot and loaded through
code-splitting, lazy loading, caching, streaming, and bounded decoding where supported.

Editor-only responsibilities remain outside Runtime:

- Layers Panel, Timeline UI, Inspector, Hierarchy editing;
- authoring Canvas and editor selection state;
- Editor Journal/Checkpoint UI;
- Package materialization controls;
- full Project/Asset Registry mutation client;
- Market seller/purchase/entitlement management.

Runtime measurements must record startup, Scene load, first frame, steady frame timing, memory,
asset bytes, cache hits, decoded bytes, and Long Tasks by target/capability. A local host result is
not a device or production PASS.

## Targets and status

| Target/capability | Status | Rule |
| --- | --- | --- |
| PiXiEED Native Web Runtime | CURRENT ISOLATED BRIDGE | WP-160, WP-200 | Preview/execution and artifact boundaries exist; no shipped or production Runtime is claimed. |
| Desktop/mobile/tablet browser profiles | PLANNED | Same Project; capability and Quality Profiles adapt presentation. |
| Generic web package | PLANNED | Build artifact boundary, not canonical Project State. |
| Unity data/export adapter | FUTURE EXTENSION | Versioned external adapter; no exporter is implemented or promised here. |
| Blender/other workflow adapter | FUTURE EXTENSION | Separate adapter with explicit format and license checks. |
| Native C++ / platform module | FUTURE EXTENSION | Isolated Build/WebAssembly/SDK boundary only; no unverified browser execution. |

## Relationship to PiXiGame and Build

PiXiGame is the authoring environment. Build Export Pipeline creates a target-specific Runtime
Artifact from a validated Package and locked dependencies. Runtime only executes a verified
artifact; it does not build, publish, or repair an artifact in place.

The same Package may produce multiple target artifacts. `Package Hash + Build Configuration Hash +
Runtime Version + Target + Toolchain` is the future cache identity. A failed or partial artifact
is not executable or `READY`.

## Explicit non-scope

This specification does not implement PiXiRuntime, native export, cloud execution, Store
submission, public route replacement, or current-data migration. Current PiXiEEDraw, PXD,
PiXiSYNC, Market, existing URLs, Project/Asset/Package records, production Database/Storage,
and public Navigation remain protected by separate release gates.
