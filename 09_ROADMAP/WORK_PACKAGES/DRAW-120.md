# DRAW-120 — Draw2 Selection / Transform / Clipboard

status: PLANNED
phase: draw2
kind: draw2
depends_on: DRAW-110
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-130
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Active Celを対象に、Asepriteの制作効率を最低基準としたSelection、Transform、Clipboardを提供する。SelectionはAdd/Subtract/Intersectを持ち、Preview/Cancel/CommitとUndo境界を明確にする。

## Canonical inputs

- DRAW-110のRaster write-set、Command/Undo、Canvas projection
- `WP-120-SELECTION-TRANSFORMS.md`、`PIXIEEDRAW2_UX_SPEC.md`、Aseprite UX reference

## Deliverable

- rectangle/freeform selection、追加/減算/交差、move/flip/rotate/scaleの非破壊preview
- Copy/Cut/Paste、active Cel scope、Escape cancel、one atomic commit/one Undo
- desktop shortcutとmobile context optionの共通Command Registry接続
- icon-first selection handles、Tooltip/Help/shortcut/creation guide、focusable alternatives

## Non-scope

- Timeline本体、Legacy PXD、Runtime、Audio/Game、Market、現行Route変更

## Workflows

1. Active Celを選択し、selection modeを切り替え、移動/変形をpreview→cancelまたはcommitする。
2. Copy/Cut/Paste後にUndo/Redoし、別Layer/Frameへ誤適用されないことを確認する。
3. Desktopのdirect manipulationとMobileのsheet/handle操作で同じCanonical commandを生成する。

## Failure / attack tests

- selection対象外への書込み、empty selection、clip境界外、zero/NaN transform、巨大貼付、cancel後のmutationを拒否
- Add/Subtract/Intersectの順序、透明pixel、palette index、anchor roundingを決定論的に検証
- drag-only操作のkeyboard/button代替、focus trap/restore、screen-reader name、disabled reasonを確認
- Preview中のtheme変更、panel open、device rotateがraster/hash/historyを変えないことを確認

## Performance / device / accessibility

- transform previewはCOW/overlayへ隔離し、commitまでcanonical rasterを再生成しない。
- `PROJECT_A`とlarge selection fixtureでmemory、long task、p95を測定。Worker化は測定利益がある場合だけ。
- Desktop/Tablet/Mobile/Native profile、safe-area、touch target、keyboard、stylusは実測状態を記録し未実測をUNTESTED。

## Exact acceptance evidence

- `docs/inventory/draw-120-evidence.json` に各selection mode、transform trace、before/after hash、undo count、cancel resultを記録
- positive/negative fixture、accessibility tree、viewport geometry、visual baseline、performance traceを保存
- targeted test、browser/device可能範囲、`git diff --check`のexit codeをCheckpointへ記録
- page-level overflow=0、one commit=one Undo、active Cel以外のmutation=0が必須。端末未実測はUNTESTED。

## Registry acceptance IDs

- `DRAW120-SCOPE-001`、`DRAW120-WORKSPACE-001`、`DRAW120-EVIDENCE-001`、`DRAW120-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-120/**`
- `pixiedraw2/tests/draw-120/**`
- `pixiedraw2/benchmarks/draw-120/**`
- `docs/contracts/DRAW-120-*.md`
- `docs/inventory/draw-120-*.json`
- `docs/decisions/ADR-*-DRAW-120-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on non-atomic history、selection漏れ、page scroll、Canvas全体再描画、scope violation、stale Context、data-loss risk。
- 現行サイト、PXD、PiXiSYNC、Market、Production dataを変更しない。
- Checkpointに操作動画/trace、hash、history、test command/exit code、UNTESTED、independent reviewを残し、`DRAW-130`を自動開始しない。
