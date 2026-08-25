# GAME-350 local browser evidence — 2026-08-25

## Decision

`EDITOR_INTEGRATION_COMPLETE` is a local-browser completion candidate.
`QUALIFIED_RELEASE_READY` remains `NOT_READY` until provider, PiXYNC,
recovery, native compilation, and production commerce evidence are collected.

## Environment

- Route: `http://localhost:8000/pixiedraw2/index.html?new_project=1&mode=GAME`
- Viewport: 1280 x 700
- Browser: Codex in-app browser
- Console errors: 0 during the scoped interaction

## Five-rail result

| Rail | Local result |
|---|---|
| ACTION | iDRAW / iGAME / iAUDIO mode rail and Game actions render |
| HIERARCHY | iGAME hierarchy rail renders Hero, Enemy, Tilemap; add-track path updates it |
| VIEWPORT | Game scene preview surface renders in the center workspace |
| INSPECTOR / ASSETS | Game tabs expose scene, inspector, assets, and build views |
| TIMELINE / TRACKS | Scene / Asset / Track tabs, 16-frame cells, play, snap, and track addition render |

The desktop Game grid measured as `220px 678px 380px`; the legacy Draw/mobile
drawer controls were hidden for the Game profile so they do not overlap the
hierarchy rail.

## Interactions

- Add Track: hierarchy count `3 -> 4`; status reported `Event Track 4 added · bind in Game Inspector`.
- Build validation: Web target returned Project, Track IDs, Frame references,
  canonical GameProject, editor boundary, and target BuildPlan checks as OK.
- Target switching: Web, Unity, Godot, and Unreal each produced a local
  GAME-330 BuildPlan and an explicit note that external compilation is a
  separate step. This is a target-contract check, not proof of native engine
  project materialization.
- Local persistence: Game Editor subdocument save path and canonical Game
  project persistence path were exercised by the workspace flow.
- iDRAW binding: active Draw asset was attached as `LIVE`, rejected by the
  local build gate as preview-only, then attached as `PINNED` and accepted by
  GAME-330 BuildPlan.
- iAUDIO binding: the Audio workspace was demand-loaded from the Game Assets
  tab. The Audio whole mix, instrument lane, and BGM lane were selectable;
  both `LIVE` rejection and `PINNED` BuildPlan success were observed.
- Binding persistence: a project reload by `?project=<id>&mode=GAME` restored
  the selected Audio binding, its revision, hash, and `PINNED` mode. No console
  errors occurred in this flow.
- PiXYNC isolated two-browser E2E: fake authenticated authority accepted Draw,
  Audio, Game, and a second Draw operation; duplicate hints stayed idempotent,
  reconnect caught up, local remote Undo depth stayed intact, and Game caught
  up. Result: `pass: true`.
- Market/PXD local checks: package composition, verification/public launch,
  purchase GIF export, PXD transfer, and PXD index8 round-trip passed.
- iGAME PXD→Market handoff: the shared Export panel prepared a v2 PXD
  containing the Draw/Audio/Game workspace snapshot, transferred it through
  the existing 15-minute IndexedDB handoff, and Market received it as one
  seller file. The handoff stops before submission; seller verification,
  package composition, price, rights, and legal confirmation remain Market
  responsibilities.
- Native hand-off package: Unity, Godot, and Unreal targets each generated a
  deterministic `ENGINE_HANDOFF_V2` local package from the same locked
  GAME-330 BuildPlan. The package includes `build-plan.json`, canonical
  `timeline.json`, a build manifest, the five-rail surface mapping, target
  starter structure, and a ZIP download action; Godot is explicitly GDScript,
  while external engine import/compile remains a separate qualification.
- Right-rail layout: the GAME desktop dock now uses a compact summary row and
  a scrollable content row, so preview/build primary actions remain reachable
  at 1280 x 720 without page overflow.

## Scope boundary

This evidence proves the local iGAME editor surface, local iDRAW/iAUDIO
reference bridge, persistence, and local BuildPlan projection. It does not
prove:

- server-authorized Draw/Audio Registry provider resolution or production
  source immutability;
- real Supabase/PiXYNC provider deployment, cross-account permissions, and
  production rollback; the isolated two-browser path is covered above;
- Unity/Godot/Unreal project materialization or external compilation;
- remote Supabase migration, Edge Function, Stripe checkout, entitlement,
  Storage delivery, or RLS acceptance for PXD sales;
- physical device, Safari/Firefox, screen-reader, or long-session recovery.

Therefore the local browser result is `PASS` for editor integration and
`UNTESTED` for release qualification.

## Coordinator recheck — 2026-08-25

The route was re-opened with `mode=GAME` and checked at 1440×900 and
1024×768. At the smaller desktop width the page `scrollWidth` and
`scrollHeight` matched the viewport; the Game preview panel remained
scrollable inside its dock instead of creating page overflow.

The following real UI actions were also repeated:

- Scene hierarchy `追加` changed the visible object list from 3 to 4 entries.
- `プレビューを読み込み / 開始` reached `Runtime READY · LIVE · tick=1`.
- `構成を検証` generated deterministic local adapter packages for `UNITY`,
  `GODOT`, and `UNREAL`.
- `Manifest表示` exposed `PXD_GAME_BUILD_MANIFEST_V1`, all five rail names,
  canonical project hash, and target adapter/package hashes.

The V2 package download path was then checked in the same browser session:

- Unity: `ENGINE_HANDOFF_V2`, 14 entries, ZIP download emitted
  `pixieed-unity-0f06c8a40ec0.zip` in the local run.
- Godot: `ENGINE_HANDOFF_V2`, 10 entries, with the adapter language set to
  `GDSCRIPT`.
- Unreal: `ENGINE_HANDOFF_V2`, 17 entries, with the adapter language set to
  `CPP`.

The repeatable browser test now reads the downloaded stored ZIP and checks
that every target contains `pixieed/build-plan.json`,
`pixieed/timeline.json`, `pixieed/asset-references.json`, plus the target
starter file (`Packages/manifest.json`, `project.godot`, or
`PiXiEED.uproject`). The test output was:

```text
GAME-350 browser 1440x900: rails/preview/build passed
GAME-350 browser 1024x768: rails/preview/build passed
```

The external engine import/compile boundary remains explicitly untested; a
successful browser ZIP download is not native-engine qualification.

The repeatable browser checks are now:

- `node scripts/test-game350-browser.mjs`
- `node scripts/test-market-composition-browser.mjs`
- `node scripts/test-pixiedraw2-market-handoff-browser.mjs`

This recheck strengthens the local editor claim only. It does not promote
native engine import/compile, real provider PiXYNC, or remote Market/PXD
verification to PASS.
