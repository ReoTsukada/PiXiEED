# WP-160 Draw-to-play Preview Contract

Status: IMPLEMENTED_IN_ISOLATED_LOCAL_ENTRY

WP-160 adds the smallest executable foundation for opening Draw2 content in a play-oriented
Runtime preview. It does not implement PiXiGame authoring, a production Runtime service, a Build
worker, Market publication, or current-site replacement.

## Boundaries

```text
PiXiGame authoring      Project / Command / Revision / Asset Graph
Build Pipeline          validate / lock / process / hash / verify / artifact
PiXiRuntime             resolve / input / update / simulation / presentation / diagnostics
Package Registry        versioned Package / Dependency Snapshot / immutable identity
Distribution            separate future Publish / Market / Store operation
```

`pixiedraw2/src/wp160-game-runtime-core.ts` is DOM, Canvas, network, and storage independent.
`pixiedraw2/src/wp160-build-pipeline.ts` is measured as a separate tooling boundary. The existing
Draw2 Editor dynamically loads the Runtime bundle only from the isolated local entry.

## Asset and revision contract

- Typed IDs distinguish Project, Preview, Package, Asset, Asset Revision, and Build Artifact.
- `LIVE` may resolve a current Asset Revision during local authoring preview.
- `PINNED` retains the exact Revision and Content Hash for a stable preview/build input.
- `REVIEW` and `FORKED` remain explicit vocabulary for later approval and branching flows.
- Dependency Snapshots are canonical, sorted, hashed records. Build requires `locked: true`.
- Runtime resolves requested assets lazily; it does not preload a full Project or Registry.
- Missing required assets, quarantine, revision/hash mismatch, and unsupported versions fail closed.

## Runtime contract

Runtime state contains tick, elapsed time, semantic input actions, and presentation state. It is
not the editable Project State and is never written back to the Draw2 Editor by this slice.
Input sources converge on semantic Actions. Animation sampling uses explicit frame durations and
does not depend on display refresh rate or random state. The loop boundary is:

```text
input → update → simulation → presentation
```

Compatible `LIVE` hot reload preserves Runtime world state and loaded matching assets. A changed
`PINNED` dependency, Package identity, or unlocked snapshot is rejected with a typed diagnostic.

## Build and artifact contract

Build lifecycle is `PLANNED → VALIDATING → BUILDING → VERIFYING → READY` or a terminal failure,
cancel, or quarantine state. READY requires asset, Revision, hash, compatibility, permission,
integrity, and Runtime smoke evidence. The Artifact identity includes:

`buildArtifactId`, source Package ID/version, Dependency Snapshot Hash, target, Build Configuration
Version, Runtime Version, Artifact Hash, byte length, verification state, createdAt, and provenance.

Build Artifact ID is not Project ID. Build cache identity is package hash + dependency snapshot +
Runtime version + target + Build Configuration; cache reuse is separate from authorization.
`requestPublish` only returns an explicit intent for a READY artifact; Build never auto-publishes.

## Feature flags and preservation

The WP-160 flags `game-core-read`, `game-core-write`, `runtime-preview`, `runtime-execution`,
`game-build`, `game-build-cache`, and `game-publish` default OFF. They are not wired to the public
Navigation, current Routes, current PiXiEEDraw, PXD, PiXiSYNC, Market, Projects, purchases,
entitlements, licenses, royalties, database, or Storage.

## Diagnostics and security

The slice includes typed diagnostics for missing/optional assets, unsupported Runtime, capability
and renderer/audio gaps, hash/lock mismatch, quarantine, load/hot-reload failure, and Build
validation/security failure. Fixtures reject traversal/absolute paths, external URLs, active
content, oversized scripts/artifacts, unauthorized and quarantined inputs. Audit output contains
no JWT, email, secret, Project content, or private commission content.

## Truthful verification status

PASS: Deno type check, seven targeted tests, deterministic animation/input/state tests, LIVE/PINNED
and lazy resolution tests, Build lifecycle/cache/artifact tests, security fixture tests, isolated
browser start + PINNED status, independent Runtime/Build bundle boundary checks, and `git diff
--check`.

MEASURED_LOCAL only: bundle bytes and synthetic Runtime step benchmark. Device/browser startup,
memory, WebGPU, Wasm, native targets, cloud Build cost, production Runtime, and public release are
not PASS. WP-150 real Legacy PXD/user/device/production compatibility remains UNTESTED and is not
promoted by WP-160.
