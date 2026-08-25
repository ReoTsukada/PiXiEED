# AUDIO-220 — Audio Package / License Compatibility

status: COMPLETE
phase: audio
kind: audio
depends_on: AUDIO-210
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: AUDIO-230
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Audio RevisionをPackage Registry、Dependency Lock、License/Provenance snapshotへ安全に接続する。raw bytes、caller price、caller licenseをauthorityにしない。

## Canonical inputs

- AUDIO-200/210、`WP-094-PACKAGE-REGISTRY.md`、Package/License/StorageLocator/DependencyLock契約
- `PIXIGAME_SPEC.md`、`PIXIGAME_AUTHORING_SPEC.md`、FP-001〜003のAuthorization/Money境界

## Deliverable

- Audio package manifest、source/rendered blob locator/hash、revision/format/license/provenance/dependency lock
- include/exclude、embedded/reference、offline materialization、hash verification、rollback
- license compatibility/unsupported dependency diagnosticsを表示し、販売/公開は別境界にする
- compact icon-first package UI、shortcut、Help/creation guide、keyboard/mobile access

## Non-scope

- Market product creation/publish、payment/royalty/Stripe、Production Storage upload、Game completion、Store distribution

## Workflows

1. Audio Revisionからreference/embedded packageを作り、manifest→verify→materialize→restoreする。
2. license snapshotを固定して、後からContributor/Sourceが変化しても既存Package inputを変えない。
3. missing/hash mismatch/unsupported license/offline/cancelからpackageを壊さず戻す。

## Failure / attack tests

- caller-provided hash/path/license/owner/dependency、path traversal、duplicate dependency、cycle、unlocked revisionを拒否
- raw Blob差し替え、manifest改変、partial upload、ambiguous licenseをREADY扱いしない
- package UIがMarket publish/writeやCommerce stateを呼ばない。page scroll/hidden heavy workも検出

## Performance / device / accessibility

- package/hash/materializeのbytes、time、memory、cancel、lazy chunkを記録。large workのWorker化は比較測定後のみ。
- Desktop/Mobile/Tablet page overflow=0、focus/dialg/sheet semantics、screen reader、touch target、reduced motionを確認。
- real Storage/production/physical device未接続はUNTESTED。

## Exact acceptance evidence

- `docs/inventory/audio-220-evidence.json` にmanifest/hash/lock/license snapshot、dependency graph、READY/REJECT traceを記録
- tamper/path/cycle/duplicate/missing/license/offline/cancel fixtures、visual/a11y/viewport、bundle/memory evidenceを保存
- targeted tests、browser smoke、`git diff --check` exit code、Market non-intrusion reviewをCheckpointへ記録

## Registry acceptance IDs

- `AUDIO220-SCOPE-001`、`AUDIO220-EVIDENCE-001`、`AUDIO220-STOP-001`

## Bounded write scope

- `pixiedraw2/src/audio/audio-220/**`
- `pixiedraw2/tests/audio-220/**`
- `pixiedraw2/benchmarks/audio-220/**`
- `docs/contracts/AUDIO-220-*.md`
- `docs/inventory/audio-220-*.json`
- `docs/decisions/ADR-*-AUDIO-220-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on unlocked/tampered dependency、license ambiguity、Commerce/Market write、page scroll、data loss、scope violation。
- Do not migrate, deploy, publish, commit, push, or auto-start `AUDIO-230`.
- Checkpoint: package examples, hashes/locks, negative results, exact tests/exit codes, UNTESTED, independent review。
