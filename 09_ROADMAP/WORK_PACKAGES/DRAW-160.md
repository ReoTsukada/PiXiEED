# DRAW-160 — Draw-to-Play Preview and Runtime Boundary

status: COMPLETE
phase: draw2
kind: draw2
depends_on: DRAW-150
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-170
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Draw2 revisionをPiXiRuntime/PiXiGame previewへ接続する。Editor stateとRuntime world stateを分離し、LIVE/PINNED/REVIEW/FORKEDを明示する。

## Canonical inputs

- `docs/contracts/WP-160-DRAW-TO-PLAY-PREVIEW.md`、`PIXIRUNTIME_SPEC.md`
- `CROSS_TOOL_LIVE_EDIT.md`、DRAW-150 adapter、Asset/Package Registry、Revision/Dependency Lock

## Deliverable

- Draw Asset Revision→preview resolution、LIVE hot reload、PINNED lock、REVIEW approval、FORKED branch
- runtime preview open/stop/reload、diagnostic、rollback、missing/hash/license mismatch fail-closed
- Preview UIを隔離し、Runtime bundleへEditor UI/authoring stateを含めない
- icon/shortcut/Help/creation guideとmobile sheetでpreview controlsを提供しpage scroll=0

## Non-scope

- Runtime production publish、Game authoring、Audio editor、Market、public navigation、current Draw/PXD/PiXiSYNC変更

## Workflows

1. Draw revisionをLIVE previewへ送り、safe boundaryで更新してworld stateを保持する。
2. PINNED previewが新revisionへ勝手に追従せず、REVIEW approvalまたはnew build inputを要求する。
3. missing asset/hash/license/unsupported versionでpreviewを止め、直前状態/diagnosticへ戻す。

## Failure / attack tests

- callerがrevision/lock/license/permissionを差し替える、unconfirmed revisionをRuntimeへ渡す、LIVE→publishedを暗黙昇格する操作を拒否
- hot reload中のpartial asset、runtime crash、cancel、duplicate event、stale Projectを検出
- editor panel例外がProject/Revisionを破壊しない。RuntimeにDraw2 UI/DOM/authoring stateが混入しない

## Performance / device / accessibility

- Preview update latency、bundle bytes、Runtime memory、main-thread long taskを測定し、full compositor E2E未実施はUNTESTED。
- Desktop/Mobile/Tabletのcanvas-first/contextual controls、keyboard/touch/focus/screen reader、reduced-motionを確認。

## Exact acceptance evidence

- `docs/inventory/draw-160-evidence.json` に mode、revision/hash/lock、runtime state trace、diagnostic、rollback結果を記録
- LIVE/PINNED/REVIEW/FORKED positive/negative fixture、runtime bundle comparison、viewport/a11y/visual evidenceを保存
- targeted tests、browser smoke、`git diff --check` exit code、Runtime non-intrusion reviewをCheckpointへ保存

## Registry acceptance IDs

- `DRAW160-SCOPE-001`、`DRAW160-WORKSPACE-001`、`DRAW160-EVIDENCE-001`、`DRAW160-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-160/**`
- `pixiedraw2/tests/draw-160/**`
- `pixiedraw2/benchmarks/draw-160/**`
- `docs/contracts/DRAW-160-*.md`
- `docs/inventory/draw-160-*.json`
- `docs/decisions/ADR-*-DRAW-160-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on unpinned mutation、silent mode escalation、Runtime bundle contamination、state loss、page scroll、scope violation。
- Preserve current routes, Draw, PXD, PiXiSYNC, Market and production data; do not auto-start `DRAW-170`.
- Checkpoint: revision graph, hashes, modes, runtime trace, bundle/performance, tests/exit codes, UNTESTED, independent review。
