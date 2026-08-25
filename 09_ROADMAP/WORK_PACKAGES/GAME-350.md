# GAME-350 — Game Completion Gate

status: IN_PROGRESS
phase: game
kind: gate
depends_on: GAME-340
implementation_model: Terra High
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol MAX
independent_review: true
next_package: SITE-400
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

PiXiGameを独立して制作、preview、save、build、package、Draw/Audio連携できる製品として判定するGate。Architectureの存在だけで完成扱いしない。

## Completion vocabulary and current decision (2026-08-25)

GAME-350 has three deliberately separate completion levels. They must not be
collapsed into one `COMPLETE` label:

| Level | Meaning | Current state |
|---|---|---|
| `CONTRACT_COMPLETE_CANDIDATE` | GAME-300〜350の型、identity、fail-closed、LIVE/PINNED、runtime/save、build provenanceを隔離証拠で通過 | `CANDIDATE`; isolated evidence exists |
| `EDITOR_INTEGRATION_COMPLETE` | PiXiEEDstudioから実際にProjectを開き、5レールで編集、preview、save/reloadし、iDRAW/iAUDIO/PiXYNCの実経路を通過 | `LOCAL_BROWSER_PASS`; provider/PiXYNC/recovery acceptance remains `UNTESTED` |
| `QUALIFIED_RELEASE_READY` | Browser/device/native/provider/security/performance/recovery evidence is qualified and independently reviewed | `NOT_READY`; explicit `UNTESTED` remains |

For the requested product goal, iGAME completion means
`QUALIFIED_RELEASE_READY`. `EDITOR_INTEGRATION_COMPLETE` is only the local
editor milestone and must not unlock or market iGAME as a finished product;
`CONTRACT_COMPLETE_CANDIDATE` is even earlier and is never sufficient by
itself.

## Five-rail editor contract (inferred from the current repository layout)

The five rails are a responsibility model, not five independent sources of
truth. Workspace selection, open tabs, collapsed state, zoom, and panel layout
are UI state; edits to the project go through the GAME journal/canonical store.

| Rail | Surface | Canonical responsibility | Must not do |
|---|---|---|---|
| `R1` | Top action rail | Project identity, save/reload status, undo/redo, preview/run/stop, build validation, PiXYNC state | Mutate Draw/Audio source data or perform Market/Commerce writes |
| `R2` | Left Scene/Hierarchy rail | Scene list, entity tree, selection, ordering, add/remove scene/entity commands | Store a second hierarchy or silently mutate runtime state |
| `R3` | Center Viewport | Scene edit view and runtime preview projection; selection/focus; play/pause/step display | Write authoring data while previewing, or treat preview pixels as source assets |
| `R4` | Right Inspector/Assets rail | Selected entity/component properties and Draw/Audio asset references, revision/lock display | Copy raw Draw pixels/audio bytes or edit iDRAW/iAUDIO-owned source settings |
| `R5` | Bottom Timeline/Tracks rail | Scene/event/animation/audio-cue tracks, frame/tick navigation, track enable/mute and snap | Become a second audio/draw editor or change source project timing globally |

The intended data flow is:

```text
PiXiEEDstudio project
  -> GAME Project/Scene/Entity journal
  -> R2/R3/R4/R5 projections
  -> GAME-340 Draw/Audio references (LIVE or PINNED)
  -> GAME-320 immutable runtime snapshot
  -> GAME-330 build/provenance plan
```

## iGAME delivery roadmap after the local editor closure

The editor and export boundaries are intentionally staged so the five rails
never become a second source of truth:

| Stage | Scope | Exit evidence |
|---|---|---|
| G1 | 5-rail Scene/Entity/Component editor, local save/reload, iDRAW/iAUDIO LIVE/PINNED references | Local browser PASS; completed 2026-08-25 |
| G2 | PiXYNC Game journal, ordering, reconnect, rollback, and unrelated-mode isolation | Real two-client/browser evidence; not yet qualified |
| G3 | Engine-neutral BuildPlan and package manifest for Web/Unity/Godot/Unreal | Deterministic target-specific manifest and asset locks |
| G4 | Optional target adapters: Unity scene/prefab package, Godot scene/resource package, Unreal data/Sequencer package | `ENGINE_HANDOFF_V2` deterministic ZIP generated for all three targets with BuildPlan, timeline, starter structure, and five-rail mapping; per-target import or compile smoke test remains pending |
| G5 | Market handoff, entitlement, ZIP/PXD delivery, and production provider/RLS | Local iGAME/iDRAW2 handoff and seller composition are PASS; remote staging and purchase/download evidence remain required |

Unity Hierarchy/Inspector, Godot Scene/FileSystem/Inspector, and Unreal
Outliner/Details/Sequencer remain structural references only. The efficient
implementation order is G2 → G3 → G4 → G5: PiXYNC and the neutral manifest
must stabilize before three different engine serializers are added. Web is
the first executable target; Unity/Godot/Unreal are explicit adapters, not
claims that the browser editor itself is an engine project.

The structure follows the common separation seen in the official editors:
Unity exposes Hierarchy and Inspector views for selected scene objects, Godot
separates Scene, FileSystem, Inspector, viewport, and collapsible bottom
panels, and Unreal separates Viewport, Outliner, Details, Content Drawer, and
Sequencer timeline/playback. These are reference patterns, not a claim of
engine compatibility:

- Unity Inspector: <https://docs.unity3d.com/es/current/Manual/UsingTheInspector.html>
- Unity Hierarchy: <https://docs.unity3d.com/es/current/Manual/Hierarchy.html>
- Godot editor interface: <https://docs.godotengine.org/en/stable/getting_started/introduction/first_look_at_the_editor.html>
- Unreal editor interface: <https://dev.epicgames.com/documentation/unreal-engine/unreal-editor-interface?lang=en-US>
- Unreal Sequencer: <https://dev.epicgames.com/documentation/en-us/unreal-engine/sequencer-cinematic-editor-unreal-engine>

## Current reality matrix

| Area | Classification | Evidence boundary |
|---|---|---|
| GAME-300 Project/Scene/Entity/Component/Behavior IR | `IMPLEMENTED_ISOLATED` | Pure TypeScript tests and benchmarks; no host/provider |
| GAME-310 semantic input actions | `IMPLEMENTED_ISOLATED` | Keyboard/touch/gamepad contract only; physical input is untested |
| GAME-320 runtime and save-state separation | `IMPLEMENTED_ISOLATED` | Immutable runtime snapshot/state tests; no production runtime host |
| GAME-330 build plan/provenance | `IMPLEMENTED_ISOLATED` | Deterministic plan/lock tests; no compiler or artifact materialization |
| GAME-340 iDRAW/iAUDIO LIVE/PINNED bindings | `IMPLEMENTED_ISOLATED` | Canonical reference/lock semantics; real Registry adapters are not proven |
| iGAME 5-rail editor | `LOCAL_BROWSER_INTEGRATED` | Local PiXiEEDstudio route renders ACTION/HIERARCHY/VIEWPORT/INSPECTOR/TIMELINE, supports track editing, preview, persistence, and GAME-330 validation; provider/native/recovery gates remain `UNTESTED` |
| PiXYNC Game channel | `LOCAL_BROWSER_E2E_PASS` | 151 focused PiXYNC tests plus fake-authority two-browser E2E pass; real Supabase/provider deployment remains unqualified |
| PXD/Market sale | `MARKET_SERVER_VERIFIED_LOCAL` | Local source/tests support image-only, audio-only, image+audio, PXD project, all-files selection, PXD round-trip, purchase GIF export, and iGAME/iDRAW2→Market PXD handoff; the local seller flow now verifies MIME/container/size/hash/sourceHash, copies immutable verified objects, accepts the current 18-format registry through the latest RPC-capacity migration, and snapshots purchase rights; real Supabase/Stripe/Storage/RLS purchase and delivery remain release gates |
| Browser/device/native/provider/release | `UNTESTED` | Must be qualified separately; never infer PASS from isolated tests |

The linked Supabase production-state audit is recorded in
`docs/contracts/GAME-350-production-gate-audit-20260825.md`. It found the
current Draw2/PXD/PiXYNC migrations pending remotely and no deployed
`market-verify-listing-package` or `pixync_draw2_*` authority functions; no
remote mutation was performed.

## PXD sales boundary

GAME-350 does not decide whether a seller can sell “絵だけ”, “音楽と絵”, or a
full project. The authoritative Market flow must own that choice. The required
cross-package contract is:

1. seller selects an explicit composition (`image-only`, `audio-only`,
   `image-audio`, `pixiedraw-project`, or `all-files`);
2. the package manifest enumerates included asset IDs, revisions, hashes,
   licenses, and file roles;
3. preview, price, checkout, entitlement, and download contain exactly that
   composition;
4. a purchased PXD never grants an unlisted source asset or unrelated project
   data.

This is a boundary requirement owned by Market. The current local source now
implements the seller-side composition selector and audio-aware package
delivery path. The local verifier rejects manifest/Storage mismatches and
binds the seller attach step to immutable verified paths; the purchase download
path consumes a server-captured rights snapshot when present. It does not claim
that the remote migration, Edge Function, checkout, entitlement, Storage
delivery, or RLS path has been deployed and accepted.

The real local seller-page composition interaction is recorded in
`docs/contracts/MARKET-PXD-composition-browser-evidence-20260825.md`.

## Canonical inputs

- GAME-300〜340の全contract/evidence、`PIXIGAME_*`、`PIXIRUNTIME_SPEC.md`
- performance/device/browser matrix、Aseprite/Unity/Unreal workspace abstraction、current-system gate

## Deliverable

- Scene/Entity/Component、No-code/Graph/Code/Behavior IR、Custom Controls/Input、Runtime/Save、Build/Provenance、Draw/Audio/PXD/Package integrationの資格証跡
- desktop creator workspace、tablet adaptive、mobile preview-first、icon/help/shortcut/creation guide、page overflow=0
- failure/permission/offline/loading/error/unsupported/rollback、a11y/visual/performance/bundle/memory証拠

## Non-scope

- Production deploy、Store publish、Market sale、購入/権利/台帳変更、current routes/PXD/PiXiSYNC/Project/Asset dataの置換

## Workflows

1. New Game Project→Scene/Entity→Behavior/Input/Control→Draw/Audio refs→preview/save→build→package→runtime verify。
2. LIVE/PINNED revision、missing/tamper/license/lock mismatch、rollbackを横断する。
3. Desktop/Mobile/Tabletの同一Projectで操作し、workspace stateがcanonical state/PiXiSYNCへ混入しないことを確認する。

## Failure / attack tests

- caller authority/asset/revision/lock/license、stale chain、duplicate/cycle, unsigned module, partial artifact, non-deterministic buildを拒否
- Runtime save→Project mutation、preview→publish leak、Draw/Audio source mutation、Market/Commerce write、page scrollを検出
- Aseprite operation floor、keyboard/touch/gamepad、screen reader/focus、mobile safe-area、hidden heavy UI、lazy boundaryの欠落を検出

## Performance / device / accessibility

- initial/lazy raw/min/gzip/Brotli、requests、build/runtime/preview input-to-visible、memory categories、long task原因を記録。
- reference desktop/mobile/tablet viewportのpage overflow=0、virtualized list、reduced-motion/text scaling/theme invarianceを確認。
- physical mobile/stylus/gamepad、Safari/Firefox、native/cloud build、30-minute sessionは未実施ならUNTESTED。

## Exact acceptance evidence

- `docs/inventory/game-350-evidence.json` にend-to-end trace、schema/hash/lock/license、artifact/runtime/save、bundle/perf/memory/a11y/visualを記録
- positive/negative/attack/recovery matrix、screenshots、screen-reader/keyboard/touch results、`git diff --check` exit codeを保存
- baseline failure identityが既存と一致し新規0、current-system/Market/PiXiSYNC/Runtime non-intrusionレビューをCheckpointへ記録
- Gate承認までは`SITE-400`を自動開始せず、UNTESTED/PARTIALは明示する

## Additional product-level acceptance IDs

The following IDs define the missing integration evidence. They are not PASS
claims and are not satisfied by the current isolated evidence manifest:

- `GAME350-RAIL-001`: all five rails render in a real PiXiEEDstudio project,
  selection remains canonical, and no rail overflows or duplicates another
  authority;
- `GAME350-STUDIO-001`: create/open/reload a project, edit Scene/Entity/
  Component, preview, save, and recover through the real Studio route;
- `GAME350-CROSS-001`: iDRAW and iAUDIO references resolve through the real
  provider boundary, with LIVE/PINNED behavior and no source mutation;
- `GAME350-PIXYNC-001`: local and realtime PiXYNC updates preserve project,
  revision, event ordering, reconnect, rollback, and unrelated-mode isolation;
- `GAME350-COMMERCE-BOUNDARY-001`: Game package references are handed to
  Market without silently selecting or selling unlisted PXD content.

Until these are evidenced in their owning integration packages, the product
decision remains `NOT_READY`.

## Registry acceptance IDs

- `GAME350-SCOPE-001`、`GAME350-EVIDENCE-001`、`GAME350-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-350/**`
- `pixiedraw2/tests/game-350/**`
- `pixiedraw2/benchmarks/game-350/**`
- `docs/contracts/GAME-350-*.md`
- `docs/inventory/game-350-*.json`
- `docs/decisions/ADR-*-GAME-350-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on unproven product workflow、new regression、page scroll、authority/lock failure、security issue、scope violation、missing independent review。
- Do not migrate/deploy/publish/commit/push or auto-start the next package.
- Checkpoint: gate decision, evidence manifest, commands/exit codes, baseline identity, UNTESTED, Sol review, explicit handoff to `SITE-400`。
