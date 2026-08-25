# GAME-350 Final Integration Proof

**Capture date:** 2026-08-15
**Decision:** `COMPLETE_CANDIDATE / PARTIAL`
**Qualification:** `NOT_READY`
**SITE-400:** `READY_TO_START_CANDIDATE (implementation not authorized)`
**Scope:** GAME-350 host-neutral boundary proof only. No new Game feature, production route, Registry service, deploy, migration, commit, or push was performed.

**Boundary status:** `BOUNDARY_OWNERSHIP_APPROVED / COORDINATOR_DECISION_RECORDED`

**Coordinator decision (2026-08-15):** `BOUNDARY_OWNERSHIP = APPROVED`.
This is an ownership decision only; it does not authorize SITE-400 implementation or
promote external qualification to PASS.

## 1. What was actually proven

The GAME-350 runtime qualification boundary now provides:

- one-time composition preparation for `Project → Scene → Entity → Draw/Animation/Audio` references;
- canonical GAME-340 `resolveAssetBinding` usage at that preparation boundary;
- identity-scoped LIVE cache keys (`projectId/ownerId/kind/assetId/LIVE`);
- strict PINNED revision/hash cache keys;
- bounded LRU eviction, project-scoped cleanup, full clear, and current-revision LIVE invalidation;
- prepared runtime snapshots that do not call the Registry adapter again;
- deterministic duplicate-start rejection and stop/reload resource-count evidence.

The implementation remains host-neutral. It does not create DOM listeners, timers, animation frames, or production runtime resources.

## 1A. Product-path bridge added in this pass

The Draw2 source entry now has a narrow, host-neutral bridge for the existing local Draw2 preview:

```text
Draw2 active asset
  → local GAME-340 authority adapter
  → GAME-350 composition preparation
  → runtime asset load
  → LIVE/PINNED runtime preview
```

`pixiedraw2/src/game/game-350/product-path.ts` performs composition and resolver setup once, counts resolution calls, and keeps runtime ticks on the prepared snapshot. `pixiedraw2/src/draw2-entry.ts` supplies the active Draw2 asset through that bridge. The generated `pixiedraw2/dist/draw2-entry.js` was rebuilt after the independent review and now contains the same bridge; the prior stale-dist finding is closed.

This is an isolated local Draw2 preview path, not a claim that the production Core Registry, a server-backed Game Studio, or persisted Draw/Audio artifacts already exist. The remaining real-path gap is therefore still a `P1 / NOT_READY` acceptance item.

## 1B. Boundary ownership classification

The independent boundary audit found a responsibility-definition deadlock, not a dependency-cycle in the package Registry. The package graph remains:

```text
GAME-340 → GAME-350 → SITE-400
```

The proposed split is:

- `GAME-350_REQUIRED`: Project/Scene/Entity/Behavior contracts, GAME-340 adapter contract, runtime-start validation, LIVE/PINNED lock/hash/license validation, and Studio projection contracts.
- `SITE-400_REQUIRED`: Core Shell Game route, lazy entry, App Shell navigation, and server-authorized Project/Asset Registry provider.
- `SHARED_INTEGRATION_GATE`: Game Studio route and real provider adapters.
- `LATER_QUALIFICATION_GATE`: real artifact materialization, Safari/Firefox, device, long-session performance, RLS, staging, rollback, and production provider evidence.

The existing qualification matrix was synchronized to stop assigning SITE-400/later evidence to `blocksGame350`. The Coordinator approved that ownership split. The proposal does not change the Registry dependency IDs, and the machine package states remain unchanged while external qualification stays `NOT_READY`.

## 2. What is not proven

The repository still has no complete real path of:

```text
Game Studio UI
  → Core Registry service
  → real Draw2 / Audio adapters
  → runtime host
```

The existing `pixiedraw2/index.html` is the isolated Draw2 entry and its runtime preview is not a Game Studio authoring surface. Therefore the following remain `NOT_READY` or later gates:

- actual Studio UI workflow from Project open through reload;
- real Core Registry and real Draw/Audio artifact resolution;
- production/browser matrix, physical device, stylus, gamepad, screen reader;
- 30-minute memory, compositor, long-task, and production performance qualification;
- native signing, staging/provider/RLS, migration, rollback, deploy, and publish.

## 3. Independent review

An independent read-only Luna review was completed after the implementation pass. It found no new P0 and classified the missing real Studio/Registry/Draw/Audio path as `P1 / NOT_READY`. It also confirmed that the current evidence must not be promoted to a complete GAME-350 qualification.

## 4. Verification evidence

| Check | Exit | Result |
|---|---:|---|
| GAME-300〜340 targeted tests | 0 | 20/20 PASS |
| GAME-350 Core/Studio/Runtime tests | 0 | 20/20 PASS |
| GAME-350 type check | 0 | PASS |
| GAME-350 product-path test | 0 | PASS; one preparation-time resolution and zero tick-time resolutions in the synthetic fixture |
| GAME-350 deterministic benchmarks | 0 | PASS; prepared snapshot resolves 0 assets during iteration |
| Forbidden host API scan in GAME-350 modules | 0 | `requestAnimationFrame`, `setInterval`, `addEventListener`, `MutationObserver`, and Timeline translator absent |
| Context verifier | 0 | `issues=[]` |
| Evidence validator | 0 | `valid=true`, `qualificationReady=false` |
| Baseline failure identity | 0 | 14/14 existing identities match; new 0 |
| Baseline suite | 0 | 63/77 successful; same 14 inherited failures; new 0 |
| `git diff --check` for GAME-350 scope | 0 | PASS |

## 5. Current source hashes

These hashes describe the current uncommitted GAME-350 qualification files; they are not release or distribution hashes.

| Path | SHA-256 |
|---|---|
| `pixiedraw2/src/game/game-350/runtime-qualification.ts` | `d43468334c8080e97e22fa67992ae89a5053672db27c5b8ab452d9bf791bffe1` |
| `pixiedraw2/tests/game-350/runtime-qualification.test.ts` | `a8ac3de2097440c27cd2527c42a5af9bac0c972f6643c583a7056fc9f6ac1e9c` |
| `pixiedraw2/benchmarks/game-350/runtime.bench.ts` | `d31bef8bad8ebb1160c8fd21f7ba38c7190d469f3b080da89cc99bfece437cc9` |
| `pixiedraw2/src/game/game-350/product-path.ts` | `03dd7588c7b415e58ca23fc7f0db43560917343c470acb7b5f7a64de3e20e863` |
| `pixiedraw2/tests/game-350/product-path.test.ts` | `356f72716b3079b5f006ddfb89645b2d29abc81548eadae32ae49948c9b3526b` |
| `pixiedraw2/src/draw2-entry.ts` | `4b8ad3ca3af80328044c788826b74d62705ef0b06f765729aee6a508fb6cb084` |
| `pixiedraw2/dist/draw2-entry.js` | `c305608f009f91dfba0163a9384ee76bd7596c9cd374a136b046c54b1054ff1f` |

## 6. Gate decision

`GAME-350` is a `COMPLETE_CANDIDATE` for its native contract and isolated evidence scope, while its formal qualification remains `NOT_READY`. Its native contract evidence has no remaining matrix row that must be implemented inside GAME-350; the real Shell/Registry/provider path is owned by the SITE-400 shared gate. `SITE-400` is a `READY_TO_START_CANDIDATE`, but must not start automatically. The next action is a fresh read-only gate review; no artifact materializer is added to GAME-350 in this pass.

## 7. Read-only specification synchronization (2026-08-25)

This addendum records the product completion boundary without changing the
historical evidence above. No UI/TS, Market, Supabase, route, Registry, or
runtime implementation was changed in this review.

### 7.1 Five-rail target contract

The iGAME editor target is one PiXiEEDstudio project with five coordinated
rails:

1. **Top action rail** — project identity, save/reload, undo/redo,
   preview/run/stop, build validation, and PiXYNC status.
2. **Left Scene/Hierarchy rail** — scenes, entities, selection, and ordering.
3. **Center Viewport rail** — scene editing and runtime preview projection.
4. **Right Inspector/Assets rail** — selected component properties and
   revision-locked iDRAW/iAUDIO references.
5. **Bottom Timeline/Tracks rail** — scene, animation, event, and audio-cue
   tracks with navigation and local track state.

These rails are projections of the GAME journal/canonical store. They do not
create independent scene trees, source audio/drawing editors, or Market write
paths. Runtime preview reads an immutable GAME-320 snapshot; it does not write
the authoring project.

The placement is an informed UI/UX inference from official editor structures,
not an engine compatibility claim. Primary references:

- Unity Inspector and selected-object properties:
  <https://docs.unity3d.com/es/current/Manual/UsingTheInspector.html>
- Unity Hierarchy scene object tree:
  <https://docs.unity3d.com/es/current/Manual/Hierarchy.html>
- Godot viewport, Scene, FileSystem, Inspector, and bottom panels:
  <https://docs.godotengine.org/en/stable/getting_started/introduction/first_look_at_the_editor.html>
- Unreal Viewport, Outliner, Details, Content Drawer, and toolbars:
  <https://dev.epicgames.com/documentation/unreal-engine/unreal-editor-interface?lang=en-US>
- Unreal Sequencer toolbar, Outliner, Timeline, and playback controls:
  <https://dev.epicgames.com/documentation/en-us/unreal-engine/sequencer-cinematic-editor-unreal-engine>

### 7.2 Completion decision

`COMPLETE_CANDIDATE` remains valid only for the host-neutral GAME-350 contract
and isolated evidence captured on 2026-08-15. It must not be presented as a
finished iGAME editor. Product-level completion requires all of the following:

- a real PiXiEEDstudio route can create/open/reload a project;
- all five rails operate on one canonical GameProject journal;
- iDRAW and iAUDIO are resolved by real adapter/provider boundaries as
  revision-locked references, with LIVE/PINNED behavior and no source mutation;
- PiXYNC preserves project/revision/event identity, ordering, reconnect and
  rollback, while unrelated mode work remains isolated;
- preview, save, recovery, build validation, and package provenance work in a
  browser-qualified flow;
- failure, permission, offline, stale, tamper, and unsupported states are
  fail-closed and independently reviewed.

The current decision is therefore:

```text
GAME-350 native contract: COMPLETE_CANDIDATE
iGAME editor integration: NOT_READY
browser/device/native/provider/release qualification: UNTESTED
```

### 7.3 PXD/Market boundary

PXD sales are outside GAME-350 authority. GAME-350 may provide a package with
explicit asset/revision/hash/license references, but it does not choose the
seller's product composition, price, entitlement, checkout, rights ledger, or
download. Market must independently prove that a seller can select a defined
composition such as `DRAW_ONLY`, `AUDIO_ONLY`, `DRAW_AUDIO`, or `FULL_PROJECT`
and that preview, purchase, and delivery contain exactly the selected assets.

No PXD sales capability is promoted to PASS by this GAME-350 review.
