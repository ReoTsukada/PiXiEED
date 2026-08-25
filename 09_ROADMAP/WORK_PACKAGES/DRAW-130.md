# DRAW-130 — Draw2 Layers / Frames / Cels / Timeline

status: PLANNED
phase: draw2
kind: draw2
depends_on: DRAW-120
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-140
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

AsepriteのLayer × Frame交点=CelモデルをCanonical Projectへ実装し、Timeline/Layer/Onion Skin/Tags/Playbackを仮想化された操作面として提供する。

## Canonical inputs

- DRAW-120のactive Cel/Command/Undo契約
- `WP-130-TIMELINE-STRUCTURE.md`、`PIXIEEDRAW2_SPEC.md`、`PIXIEEDRAW2_UX_SPEC.md`
- `TIMELINE_1000`、100 layers/1000 framesのbounded projection要件

## Deliverable

- Layer visibility/lock、Frame/Cel create/delete/copy/move/link、duration/FPS、tags、playback
- Onion Skinを非破壊Projectionとして実装し、CanvasとTimelineを局所更新する
- 1000 frames × 100 layersを全DOMへmaterializeしないvisible window/overscan/cache
- desktop bottom Timeline、tablet collapsible Timeline、mobile Canvas-first bottom sheet
- icon-first actions、Tooltip/shortcut/Help、shortcut cheat sheet、guided creation、keyboardとtouchのdrag代替

## Non-scope

- PNG/PXD、Legacy adapter、Runtime、Audio/Game、public route、PiXiSYNC transport実装

## Workflows

1. Layer/Frame/Celを作成・移動・複製・削除し、active Celだけを描画対象にする。
2. 1000 frame/100 layer fixtureを開き、scroll windowを移動、選択、再生、Onion Skin切替する。
3. Desktop shortcut、mouse、touch、mobile sheetから同じ structural Commandを生成しUndo/Redoする。

## Failure / attack tests

- hidden/locked layerへの書込み、存在しないFrame/Cel参照、linked Celの誤切断、孤立Cel、out-of-range durationを拒否
- 1000×100全materialize、hidden thumbnail生成、panel非表示中のpolling、Timeline操作中のCanvas mutationを検出
- Onion Skinがcanonical hash/historyを変更しないこと、Playback停止/再開がrevisionを改変しないことを確認
- page scroll、drag-only、focus trap、screen-reader row/cell nameを監査

## Performance / device / accessibility

- metricsはtotal/visible/overscan/mounted/rendered items、frame budget、long task原因、thumbnail cacheを記録する。
- UI更新をbounded projectionへ限定し、stroke sampleごとにTimeline/Layerをrerenderしない。
- Desktop 1280×900、Mobile 390×844を必須参照。実機、stylus、Safari/Firefoxは実行可否を明記しUNTESTED維持。

## Exact acceptance evidence

- `docs/inventory/draw-130-evidence.json` に構造fixture、operation trace、virtualization metrics、hash/history、screenshotsを記録
- 1000×100のmounted上限、Onion Skin非破壊、1 structural operation=1 Undo、page overflow=0を判定
- targeted/unit/browser tests、visual baseline、a11y tree、`git diff --check` exit codeをCheckpointへ保存

## Registry acceptance IDs

- `DRAW130-SCOPE-001`、`DRAW130-WORKSPACE-001`、`DRAW130-EVIDENCE-001`、`DRAW130-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-130/**`
- `pixiedraw2/tests/draw-130/**`
- `pixiedraw2/benchmarks/draw-130/**`
- `docs/contracts/DRAW-130-*.md`
- `docs/inventory/draw-130-*.json`
- `docs/decisions/ADR-*-DRAW-130-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on full materialization、virtualization metric欠落、structural data loss、page-level scroll、scope violation、stale Context。
- Current Draw/PXD/PiXiSYNC/Market/Runtimeを変更せず、`DRAW-140`を自動開始しない。
- Checkpointに mounted metrics、hash/history、test command/exit code、UNTESTED、independent reviewを残す。
