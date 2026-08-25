# GAME-320 — Runtime Preview and Save State

status: COMPLETE
phase: game
kind: game
depends_on: GAME-310
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: GAME-330
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

編集可能なGame Project Stateと、再生時のRuntime Save Stateを分離したPreview/Playを実装する。Play中にProjectやPackage lockを暗黙変更しない。

## Canonical inputs

- GAME-300/310のScene/Entity/Component/Input/Behavior IR
- `PIXIRUNTIME_SPEC.md`、`WP-160-DRAW-TO-PLAY-PREVIEW.md`、Save Schema/Dependency Lock

## Deliverable

- deterministic preview loop、semantic input、pause/step/restart、runtime world state
- versioned Save State schema、checkpoint/restore/migration boundary、unsupported state diagnostics
- Editor previewとPiXiRuntime executionをbundle/state/permissionで隔離
- icon-first play controls、Help/shortcut/creation guide、mobile preview-first layout、page scroll=0

## Non-scope

- Build/Package provenance、Draw/Audio authoring、Market publish、Production Runtime、current routes/data変更

## Workflows

1. Projectをpreviewし、input/actionでstateを変え、pause/restart/save/restoreする。
2. Project Revisionを変更しても既存Runtime Save Stateへ勝手に適用せず、明示Migration/拒否を表示する。
3. Runtime crash/unsupported schema/missing asset/offlineからProjectを壊さずrecoveryする。

## Failure / attack tests

- caller作成のSave State、Project revision/Package lock差し替え、untrusted asset/manifest、non-deterministic time/randomを拒否
- RuntimeがEditor UI/DOM/authoring stateを読み書きしない。save writeがProject/PiXiSYNC eventにならない
- reset/cancel/duplicate load/out-of-order input、page scroll、gesture conflict、focus lossを検出

## Performance / device / accessibility

- runtime frame、input-to-visible、save/restore、memory、long task、bundle sizeを測定。正式E2E未実施はUNTESTED。
- Desktop/Mobile/TabletのCanvas/preview surface、keyboard/touch/gamepad、screen reader/focus/safe-area/text scalingを確認。

## Exact acceptance evidence

- `docs/inventory/game-320-evidence.json` にProject hash、Runtime/Save schema、state trace、migration result、bundle/perf/memoryを記録
- deterministic replay、save tamper、wrong version、missing asset、crash/recovery fixtures、a11y/visual/scroll evidenceを保存
- targeted tests、browser smoke、`git diff --check` exit code、Runtime non-intrusionレビューをCheckpointへ記録

## Registry acceptance IDs

- `GAME320-SCOPE-001`、`GAME320-EVIDENCE-001`、`GAME320-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-320/**`
- `pixiedraw2/tests/game-320/**`
- `pixiedraw2/benchmarks/game-320/**`
- `docs/contracts/GAME-320-*.md`
- `docs/inventory/game-320-*.json`
- `docs/decisions/ADR-*-GAME-320-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on Project/Save mixing、nondeterminism、silent migration、Runtime UI contamination、page scroll、scope violation。
- Preserve current Runtime/Draw/PXD/PiXiSYNC/Market; do not auto-start `GAME-330`.
- Checkpoint: replay/save fixtures, hashes, tests/exit codes, runtime bundle/perf/a11y, UNTESTED, independent review。
