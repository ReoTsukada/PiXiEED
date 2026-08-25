# AUDIO-240 — Audio Completion Gate

status: COMPLETE
phase: audio
kind: gate
depends_on: AUDIO-230
implementation_model: Terra High
implementation_parallelism: max-4-disjoint-tracks
review_model: Sol MAX
independent_review: true
next_package: SITE-400
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Audioを「実装されたCore」ではなく、独立して制作・preview・package準備できる本格Toolとして判定するGate。未測定を理由にPASSを作らない。

## Canonical inputs

- AUDIO-200〜230のcontracts/evidence、`PIXIEEDRAW2_UX_SPEC.md`、Package/License/Runtime境界
- Performance budgets、browser/device matrix、current-system preservation gate

## Deliverable

- project/revision、timeline/note、mixer/effect、preview/render、realtime bridge、package/license、workspaceを横断する資格証跡
- Desktop/Tablet/Mobileのpage overflow=0、icon/help/shortcut/creation guide、a11y/visual regression
- Draw/Game integrationはcontract-level smokeまで。Market publish/Commerce/Productionは含めない

## Non-scope

- Store/Deploy/Production Audio、購入/権利/台帳変更、Game completion、current routes/dataの置換

## Workflows

1. New Project→edit note/clip→mixer/effect→preview→Revision→package verify→restore。
2. Draw2/GameからLIVE/PINNED Audioを受け、safe update/rollbackする。
3. corrupt/offline/permission/unsupported/long session/large timelineで明確なstateを表示する。

## Failure / attack tests

- raw-byte/caller metadata authority、stale Revision、license/hash/Dependency tamper、preview-to-published leakを拒否
- duplicate/missing/out-of-order bridge、decode failure、cancel partial package、page scroll、a11y/shortcut欠落を検出
- initial bundleに大型Audio editor/rendererを無断投入しない。hidden panel work=0を確認

## Performance / device / accessibility

- raw/min/gzip/Brotli、CSS、requests、lazy chunks、audio decode/render、memory/long taskを同一定義で記録。
- formal mobile hardware、Safari/Firefox、physical audio/stylus、30-minute session、full compositor未実施はUNTESTED。
- keyboard/touch/screen reader/focus/safe-area/text scaling/reduced motion、themeによるaudio metadata変化なしを確認。

## Exact acceptance evidence

- `docs/inventory/audio-240-evidence.json` にcross-tool workflow trace、manifest/hash/lock、bundle/perf/memory/a11y/visual結果を保存
- required positive/negative matrix、viewport scroll proof、browser smoke、`git diff --check` exit code、independent reviewをCheckpointへ記録
- Gateは証拠不足をPARTIAL/UNTESTEDで残し、`SITE-400`を自動開始しない。新規baseline failure=0を確認する

## Registry acceptance IDs

- `AUDIO240-SCOPE-001`、`AUDIO240-EVIDENCE-001`、`AUDIO240-STOP-001`

## Bounded write scope

- `pixiedraw2/src/audio/audio-240/**`
- `pixiedraw2/tests/audio-240/**`
- `pixiedraw2/benchmarks/audio-240/**`
- `docs/contracts/AUDIO-240-*.md`
- `docs/inventory/audio-240-*.json`
- `docs/decisions/ADR-*-AUDIO-240-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on unproven quality、financial/Market write、current-system intrusion、page scroll、missing evidence、scope violation。
- No migrate/deploy/publish/commit/push/auto-start.
- Checkpoint: gate matrix、test commands/exit codes、bundle/perf/device status、visual/a11y、baseline identity、UNTESTED、Sol independent review。
