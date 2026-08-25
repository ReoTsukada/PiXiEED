# GAME-330 — Game Build and Artifact Provenance

status: COMPLETE
phase: game
kind: game
depends_on: GAME-320
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: GAME-340
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Game Projectから決定論的なBuild Plan/Artifactを作り、Dependency Lock、Capability、License、Provenance、Artifact Hashを結び付ける。Build artifactはProject IDの代替ではない。

## Canonical inputs

- GAME-300〜320、`PIXIGAME_SCRIPTING_SPEC.md`、`PIXIRUNTIME_SPEC.md`
- Package Registry、DependencyLock、StorageLocator、License/Authorization、native/web target adapter

## Deliverable

- target/profile (Web/Android/iOS/Desktop/Unity/Unreal/Godot/Wasm)、language/module/capability validation
- deterministic build plan、source/Behavior IR/asset/Dependency Lock hashes、artifact manifest、reproducible diagnostics
- cancel/quarantine/failed build、build cache identity、artifact rollback/provenance
- build UIはicon-first、shortcut、creation guideを備え、ログ/原因は内部Console/Helpへ。page scroll=0

## Non-scope

- Store submission、Production deploy、signing credentials、Market publish、external engine automatic reverse-sync、current routes/data変更

## Workflows

1. Web targetでPlan→validate→build→verify→artifact hash/provenanceを保存する。
2. unsupported language/capabilityをWasm化/disable/target変更の選択肢と共に fail-closed 表示する。
3. same inputを再Buildして同一manifest/hash、dependency changeで別artifact、cancel/quarantineでrollbackする。

## Failure / attack tests

- caller提供のartifact hash/target/version/dependency/license、unverified module、path traversal、cycle、non-deterministic timestampを拒否
- build outputへProject/Save stateを混入、cache collision、partial artifactをREADY扱いしない
- arbitrary native binary/DOM/network/filesystem execution、Store/Market write、page scrollを検出

## Performance / device / accessibility

- build time/memory/cache hit/worker benefit/initial-lazy bundleを測定。tiny workのWorker化を禁止。
- desktop/tablet/mobile build UIのpage overflow=0、Keyboard/focus/screen reader、safe-area、text scalingを確認。
- real cloud/native toolchain/Store signing/physical devicesはUNTESTED。

## Exact acceptance evidence

- `docs/inventory/game-330-evidence.json` にbuild plan、input/lock/artifact hashes、target/capability、provenance、cache/rollbackを記録
- deterministic/repro/unsupported/tamper/path/partial/cancel fixtures、a11y/visual/scroll、bundle/perf/memory evidenceを保存
- targeted tests、browser smoke、`git diff --check` exit code、current-system/Market non-intrusionをCheckpointへ記録

## Registry acceptance IDs

- `GAME330-SCOPE-001`、`GAME330-EVIDENCE-001`、`GAME330-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-330/**`
- `pixiedraw2/tests/game-330/**`
- `pixiedraw2/benchmarks/game-330/**`
- `docs/contracts/GAME-330-*.md`
- `docs/inventory/game-330-*.json`
- `docs/decisions/ADR-*-GAME-330-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on nondeterministic build、unverified module、artifact collision、secret exposure、partial success、page scroll、scope violation。
- Do not migrate/deploy/publish/commit/push or auto-start `GAME-340`.
- Checkpoint: target matrix, hashes, commands/exit codes, bundle/perf/a11y, UNTESTED, independent review。
