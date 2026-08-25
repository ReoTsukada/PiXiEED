# DRAW-150 — Draw2 Legacy Compatibility

status: PLANNED
phase: draw2
kind: draw2
depends_on: DRAW-140
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-160
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

現行PiXiEEDrawのLegacy PXDを読み取り専用でDraw2へ投影し、source bytes/hash、未知データ、rollbackを保つ。Current PXD v1/v2を混同しない。

## Canonical inputs

- `docs/contracts/WP-150-LEGACY-PXD-COMPATIBILITY.md`、DRAW-140 PXD v1
- Legacy archive-v2 fixture、`storage-and-formats`、既存PiXiEEDraw/PiXiSYNC契約

## Deliverable

- bounded ZIP/manifest/asset validation、Legacy→Draw2 read-only adapter
- original bytes/hashを別保存し、変換結果、unknown field、loss/warningを診断するUI
- adapterをlazy chunkに隔離。変換失敗時は元PXDを変更せず再試行/rollback可能
- import icon、Tooltip、Help、shortcut、creation guide、keyboard/mobile access

## Non-scope

- Current PXD writer、現行Route/PiXiSYNC/Market/Production Storage、silent migration、実ユーザーデータの完了宣言

## Workflows

1. valid legacy fixtureを読み、pixel/palette/layer/frame/durationを比較し、Draw2 project copyを作る。
2. unknown field/unsupported featureを保持または明示warningし、source bytes/hashを再確認する。
3. malformed/oversized/cancel/offline/permission deniedから元fileを残して復旧する。

## Failure / attack tests

- ZIP path traversal、duplicate entry、zip bomb、invalid JSON/base64、canvas/frame/layer count overflow、wrong hashを拒否
- legacy v2をDraw2 v1としてbest-effort decodeしない。source bytesのcaller改変、fake manifest、partial conversionを拒否
- import中のpage scroll、lazy chunk failure、unknown tool operation、theme変更によるpixel変化を検出

## Performance / device / accessibility

- adapterは初期Bundleに含めず、import操作時だけload。parse time/memory/chunk bytesを記録する。
- Desktop/Mobile/Tabletのbounded panel/sheet、Keyboard/focus/screen reader/touch targetを確認。
- real legacy user data、physical device、Safari/Firefoxは未検証ならUNTESTED。

## Exact acceptance evidence

- `docs/inventory/draw-150-evidence.json` にsource hash、parsed identity、converted hash、warnings、rejection reasonを記録
- valid/unknown/malformed/zip-bomb/path fixture、lazy-boundary、rollback trace、a11y/viewport screenshotsを保存
- targeted tests、browser smoke、`git diff --check` exit code、current-system non-intrusionレビューをCheckpointへ保存

## Registry acceptance IDs

- `DRAW150-SCOPE-001`、`DRAW150-WORKSPACE-001`、`DRAW150-EVIDENCE-001`、`DRAW150-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-150/**`
- `pixiedraw2/tests/draw-150/**`
- `pixiedraw2/benchmarks/draw-150/**`
- `docs/contracts/DRAW-150-*.md`
- `docs/inventory/draw-150-*.json`
- `docs/decisions/ADR-*-DRAW-150-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on source mutation、silent data loss、unsafe archive、current PXD/PiXiSYNC access、initial bundle regression、scope violation。
- Do not migrate, deploy, publish, commit, push, or auto-start `DRAW-160`.
- Checkpoint: fixture/source/output hashes、warnings、test commands/exit codes、bundle evidence、UNTESTED、independent review。
