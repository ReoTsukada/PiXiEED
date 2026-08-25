# DRAW-110 — Draw2 Raster and Editor Hot Path

status: PLANNED
phase: draw2
kind: draw2
depends_on: FP-006
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-120
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Indexed rasterと実操作可能なEditor hot pathを作る。Aseprite級の最低操作床としてPencil、Eraser、Fill、Color、Zoom/Pan、temporary Eyedropper/Hand、shortcut discoveryを成立させる。

## Canonical inputs

- CORE-120のRaster/Command/Undo/Revision契約、`DRAW2_HIGH_PERFORMANCE_IMPLEMENTATION_CONTRACT.md`
- `DRAW2-ASEPRITE-UX-REFERENCE.md`、`PIXIEEDRAW2_UX_SPEC.md`
- `PROJECT_A`、Desktop 512×512/20 layers/120 frames、Pointer workload matrix

## Deliverable

- indexed/palette-aware raster、dirty tile/write-set、nearest-neighbor projection
- Pen/Eraser/Fillの補間、pointer capture、cancel、1 Stroke=1 Undo、COW/undo接続
- Canvasを中心にしたicon-first toolbar。各iconにaccessible name、Tooltip、shortcut hint、disabled reason
- `?` Help/Q&A、shortcut cheat sheet、初回Project→Canvas→Saveのcreation guide
- Desktop/Tablet/Mobile/Browser/Nativeで同じCoreを使うPresentation adapter

## Non-scope

- Selection/Transform、Layer/Frame/Cel、PXD、Legacy、Runtime、Advanced Toolの本実装
- 現行PiXiEEDrawのCSS/JS、公開Route、既存Storage、Market/PiXiSYNCの変更

## Workflows

1. Projectを作成し、Pencil/Eraser/Fillで描画、Colorを変更、Zoom/Panし、保存後にUndo/Redoする。
2. 高速・斜め・逆方向stroke、Canvas外release、modifier中のtemporary Eyedropper/Handを操作する。
3. Desktopは左compact tool/中央Canvas/右context/下utility、Mobileは現行Draw縦画面のCanvas-first drawerで同じ意図を達成する。

## Failure / attack tests

- sample間のpixel gap、二重stroke、stroke途中rerender、1 stroke複数Undo、cancel後のghost mutationを拒否
- Fillの境界外、巨大領域、透明色、palette index不整合、NaN/範囲外座標をfail-closed
- theme変更がcanonical pixel color/hashを変えないことを確認
- Page scroll、CanvasとPanelのpointer競合、iconのaccessible name/disabled reason欠落を検出

## Performance / device / accessibility

- pointer hot pathはUI framework global stateを更新せず、raster write-setとCanvas projectionだけを局所更新する。
- Desktop/Mobile fixtureのp95を記録し、正式24/32ms PASSはfull E2E実測時だけ付与する。Long Taskの原因を分類する。
- Keyboard、touch、stylus capability、focus order、screen-reader名、reduced motionを確認。未実機はUNTESTED。

## Exact acceptance evidence

- `docs/inventory/draw-110-evidence.json` にoperation trace、raster hash、undo count、dirty tiles、viewport geometry、performance traceを保存
- Pencil/Eraser/Fill/temporary tool/zoom-panのpositive/negative testとbrowser screenshotを保存
- `node` targeted tests、browser smoke、`git diff --check`のexit codeをCheckpointへ記録
- page `scrollWidth==clientWidth` かつ `scrollHeight==clientHeight` を全reference viewportで確認。未実測端末をPASSにしない

## Registry acceptance IDs

- `DRAW110-SCOPE-001`、`DRAW110-WORKSPACE-001`、`DRAW110-EVIDENCE-001`、`DRAW110-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-110/**`
- `pixiedraw2/tests/draw-110/**`
- `pixiedraw2/benchmarks/draw-110/**`
- `docs/contracts/DRAW-110-*.md`
- `docs/inventory/draw-110-*.json`
- `docs/decisions/ADR-*-DRAW-110-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Stop on gap, history corruption, full-workspace rerender, page overflow, stale Context, scope violation, or authority ambiguity.
- Do not migrate, deploy, publish, commit, push, or start `DRAW-120` automatically.
- Checkpoint: changed files, exact tests/exit codes, hashes, performance, screenshots, baseline identity, UNTESTED and independent review.
