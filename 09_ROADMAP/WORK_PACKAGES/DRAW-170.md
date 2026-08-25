# DRAW-170 — Draw2 Advanced Production Workspace

status: COMPLETE
phase: draw2
kind: draw2
depends_on: DRAW-160
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: SITE-400
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Draw2をProfessional Pixel Creation Workspaceとして統合する。Asepriteの操作効率を最低床、Unity/Unrealのdock/graph/Inspector/asset organizationを抽象参照とし、コピーせずPiXiEED Coreへ接続する。

## Canonical inputs

- DRAW-110〜160、`PIXIEEDRAW2_UX_SPEC.md`、`WP-170-ADVANCED-DRAW2-TOOLS.md`
- 添付されたUnreal Graph、Unity Editor、Aseprite画面から抽出したworkspace abstraction
- `CROSS_TOOL_LIVE_EDIT.md`、bundle/memory/worker budgets、Native host adapter方針

## Deliverable

- Desktop: top command lane、left compact tools/structure、center Canvas/Graph/Viewport、right Inspector/Palette、bottom Timeline/Assets/Console
- Tablet: persistent Canvas + one panel + collapsible Timeline。Mobile: current PiXiEEDraw縦画面のCanvas-first、contextual drawer/bottom sheet
- Workspace/Dock/Panel/Group/Toolbar/Inspector/Canvas/Timeline/Drawer/Sheet/Overlay/Command Palette boundary
- Pattern/Stamp/Mirror/Dither/Grid/Ruler/Guide/Reference/Slice/Palette advanced/Tags/Tile/Game metadata/Package preparationのlazy tool UI
- icon-first常設UI。short textはTooltip/Help/Q&A/shortcut cheat sheet/creation guideへ分離。high-riskだけtext確認を残す

## Non-scope

- 現行サイト/Draw/PXD/PiXiSYNC/Marketの置換、publish/sale、RuntimeへのWorkspace混入、Native store submission

## Workflows

1. Aseprite floor: Pencil/Eraser/Fill/Selection/Transform/Palette/Layer/Frame/Cel/Timeline/Onion/Pattern/Tile/Tags/Grid/Symmetry/Copy-Paste/Undo/Zoom-Panを実操作監査する。
2. Unity/Unreal abstraction: dock/tab/resize/selection Inspector/graph surfaceを使い、Canvasを主役にしてpanel stateをProject stateへ混ぜない。
3. Mobile 390×844でCanvas、essential toolbar、Layers/Timeline/Palette/Tool optionsを必要時だけsheetで到達し、page scroll=0を確認する。
4. hidden panelのDOM/thumbnail/decoder/pollingを停止し、開閉でEditor Coreを再生成しない。

## Failure / attack tests

- feature flag OFFで公開Navigation/Routeに接続しない。Unknown flag、kill switch、rollbackをfail-closedで確認
- 1000 frames/100 layersのfull materialization、stroke中全workspace rerender、advanced tool initial bundle混入を拒否
- panel crashがProjectを壊さない。icon missing accessible name、shortcut collision、drag-only、page overflowを検出
- current Draw/PXD/PiXiSYNC/Market/Runtime bundleへの侵入、広告枠の非公開領域混入を検出

## Performance / device / accessibility

- raw/min/gzip/Brotli、CSS、initial requests、lazy chunks、source mapの同一定義で記録。Canvas hot path p95/long task/memory categoryを測定する。
- 1280×900/1366×768/1920×1080/390×844/430×932、Tablet split viewを実測。physical stylus/Safari/Firefox/30-minute sessionは未実施ならUNTESTED。
- keyboard/focus trap/restore、screen-reader name、touch target、safe-area、text scaling、reduced-motion、light/dark/systemでCanvas pixel color不変を確認。

## Exact acceptance evidence

- `docs/inventory/draw-170-evidence.json` にAseprite operation matrix、desktop/mobile comparison、workspace DOM geometry、scroll bounds、virtualization、lazy boundary、bundle/perf/memory/a11y結果を記録
- screenshots/visual baselines: blank、drawing、selection、layers、timeline、palette、advanced、mobile sheet、loading/error
- targeted/core/interaction/browser tests、`git diff --check` exit code、current-system/runtime/market non-intrusion reviewをCheckpointへ保存
- qualification未実施はPASSにせずUNTESTED。独立レビュー承認なしにAudioへhand offしない

## Registry acceptance IDs

- `DRAW170-SCOPE-001`、`DRAW170-WORKSPACE-001`、`DRAW170-EVIDENCE-001`、`DRAW170-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2-entry.ts` (initial-entry lazy-boundary correction only)
- `pixiedraw2/deno.json` (Export chunk build task only)
- `pixiedraw2/dist/draw2-entry.js`
- `pixiedraw2/dist/draw2-entry.min.js`
- `pixiedraw2/dist/draw2-export.js`
- `pixiedraw2/src/draw2/draw-170/**`
- `pixiedraw2/tests/draw-170/**`
- `pixiedraw2/benchmarks/draw-170/**`
- `docs/contracts/DRAW-170-*.md`
- `docs/inventory/draw-170-*.json`
- `docs/decisions/ADR-*-DRAW-170-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on page scroll、Aseprite floor欠落、full rerender、virtualization欠落、bundle regression、Runtime/Market/current-system intrusion、scope violation。
- Do not migrate, deploy, publish, commit, push, or auto-start `SITE-400`; wait for accepted Audio and Game branches.
- Checkpoint: final workspace maps, operation matrix, evidence paths, exact test/exit codes, bundle/perf/memory, UNTESTED, independent review。
