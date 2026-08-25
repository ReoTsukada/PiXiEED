# GAME-300 — Game Project Core

status: COMPLETE
phase: game
kind: game
depends_on: CORE-120
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: GAME-310
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

PiXiGameを独立した本格Toolとして開始し、Game Project、Scene、Entity、Component、Prefab、Revision、DependencyのCanonical境界を作る。No-code、Visual Graph、Scriptは同じ正本を投影する。

## Canonical inputs

- `PIXIGAME_SPEC.md`、`PIXIGAME_AUTHORING_SPEC.md`、`PIXIGAME_SCRIPTING_SPEC.md`
- `PIXIRUNTIME_SPEC.md`、`CROSS_TOOL_LIVE_EDIT.md`、Project/Asset/Package/Authorization契約

## Deliverable

- Project/Scene/Entity/Component/Prefab/Camera/Layer/Collision metadata、behavior graph/IRのschema
- Draw/Audio assetをAsset ID + Revisionで参照し、authoring stateとRuntime stateを分離
- Command/Undo/Journal/Checkpoint、versioning、invalid/unsupported diagnostics
- desktop creator workspace、mobile preview-first/contextual panels、icon/help/shortcut/creation guide

## Non-scope

- Controlsの詳細、Runtime実行、Build artifact、Package integration、Market、現行Route/PiXiEEDraw/PXD/PiXiSYNC変更

## Workflows

1. New Game Project→Scene→Entity→Component/Prefab→Draw/Audio references→Revision/Checkpointを作る。
2. No-code/Event Sheet/Visual Graphが同一Behavior IRへ収束し、表示形式を変えてもProject hashが壊れないことを確認する。
3. invalid component/dependency/asset revisionをdiagnostic付きで拒否し、Projectを復旧する。

## Failure / attack tests

- caller指定のProject/Entity/Revision/asset owner、duplicate ID、cycle dependency、unknown schema、invalid component stateを拒否
- GraphとScriptの二重正本、raw DOM/network/filesystem参照、Runtime stateのauthoring state混入を検出
- panel crash、page scroll、hidden heavy preview、icon-only high-risk actionを検出

## Performance / device / accessibility

- Scene/entity list、graph nodes、asset thumbnailsはbounded projection/lazy mount。initial bundleに大型Runtime/Buildを含めない。
- Desktop 1280×900、Mobile 390×844、Tablet split viewのpage overflow=0、memory/long taskを測定。
- keyboard/focus/screen reader、touch target、safe-area、text scaling、reduced motionを検証。実機/Browser未実施はUNTESTED。

## Exact acceptance evidence

- `docs/inventory/game-300-evidence.json` にschema/Project hash、IR projection、revision graph、negative signature、viewport/a11y/perfを記録
- scene/entity/component/duplicate/cycle/unknown/restore fixtures、visual baselines、targeted tests、`git diff --check` exit codeを保存
- Draw/Audio/PiXiRuntime/current-system non-intrusionレビューをCheckpointへ記録

## Registry acceptance IDs

- `GAME300-SCOPE-001`、`GAME300-EVIDENCE-001`、`GAME300-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-300/**`
- `pixiedraw2/tests/game-300/**`
- `pixiedraw2/benchmarks/game-300/**`
- `docs/contracts/GAME-300-*.md`
- `docs/inventory/game-300-*.json`
- `docs/decisions/ADR-*-GAME-300-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on incompatible type system、state mixing、page scroll、data loss、scope violation、stale Context。
- Preserve current Draw/PXD/PiXiSYNC/Market/routes/data; do not migrate/deploy/publish/commit/push or auto-start `GAME-310`.
- Checkpoint: schema/IR/hash, fixtures, test commands/exit codes, visual/a11y/perf, UNTESTED, independent review。
