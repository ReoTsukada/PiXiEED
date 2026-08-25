# GAME-340 — Game Package / Draw / Audio Integration

status: COMPLETE
phase: game
kind: game
depends_on: [GAME-330, DRAW-160, AUDIO-230]
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: GAME-350
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Draw2とPiXiAudioのAsset RevisionをGame Scene/Control/Runtime/Packageへ統合する。LIVE/PINNED/REVIEW/FORKED、license、Dependency Lockを横断し、欠落時は起動不能のまま fail-closed にする。

## Canonical inputs

- GAME-300〜330、DRAW-160、AUDIO-210/220、`CROSS_TOOL_LIVE_EDIT.md`
- Package/Asset Registry、PXD/PiXiPackage、Runtime/Build/License/Provenance契約

## Deliverable

- Scene Entity componentへのDraw/Audio Asset ID+Revision reference、mode/lock/permission
- Draw変更→Game preview、Audio変更→safe playback update、Game placement/configはsource assetを破壊しない
- integrated PXD/PiXiPackage manifest、embedded/reference dependency、hash/license snapshot、diagnostic
- desktop dense workspace、mobile preview-first/contextual panel、icon/help/shortcut/creation guide、page scroll=0

## Non-scope

- Market publish/sale、Commerce/Ledger、Production Runtime/Storage、current Draw/PXD/PiXiSYNC/URLの置換

## Workflows

1. Draw/Audioを参照するSceneを作り、LIVEでlocal revision、PINNEDでlocked build inputを確認する。
2. Draw editとAudio editを別々に行い、Game previewへ反映して、Project/Runtime state/undoを壊さない。
3. package→verify→runtime load→missing/hash/license/unsupported dependency diagnostics→rollbackを実行する。

## Failure / attack tests

- caller-provided asset revision/hash/license/lock、stale cross-project reference、unresolved dependency、duplicate/cycleを拒否
- Draw raw pixelやAudio raw bytesをGame側が直接authorityにしない。Runtime saveでsource Projectを変更しない
- LIVEがpublishへ昇格、PINNEDが勝手に更新、partial package、page scroll、Market/Commerce callを検出

## Performance / device / accessibility

- asset invalidation/preview reload、package load、memory/cache、long task、bundle boundaryを測定。hot pathへ全project recomputeを持ち込まない。
- 1280×900、390×844、Tabletのpage overflow=0、touch/keyboard/focus/screen reader/safe-areaを確認。
- native build、real devices、Safari/Firefox、long sessionは実施状態をUNTESTED。

## Exact acceptance evidence

- `docs/inventory/game-340-evidence.json` に cross-tool revision graph、mode/lock/hash/license、event/reload trace、package/runtime resultを保存
- LIVE/PINNED/missing/tamper/cycle/partial/rollback fixtures、visual/a11y/scroll/perf evidenceを保存
- targeted tests、browser smoke、`git diff --check` exit code、Market/Runtime/current-system non-intrusionをCheckpointへ記録

## Registry acceptance IDs

- `GAME340-SCOPE-001`、`GAME340-EVIDENCE-001`、`GAME340-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-340/**`
- `pixiedraw2/tests/game-340/**`
- `pixiedraw2/benchmarks/game-340/**`
- `docs/contracts/GAME-340-*.md`
- `docs/inventory/game-340-*.json`
- `docs/decisions/ADR-*-GAME-340-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on cross-tool drift、unlocked input、source mutation、partial package、page scroll、Market/Runtime intrusion、scope violation。
- Do not migrate/deploy/publish/commit/push or auto-start `GAME-350`.
- Checkpoint: dependency graph, event/rollback trace, package hashes, tests/exit codes, bundle/perf/a11y, UNTESTED, independent review。
