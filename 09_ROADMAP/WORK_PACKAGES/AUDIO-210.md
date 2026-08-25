# AUDIO-210 — Audio Event Binding and Preview

status: COMPLETE
phase: audio
kind: audio
depends_on: AUDIO-200
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: AUDIO-220
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Timeline/Note/Mixer/Effectを実操作できるAudio previewと、Draw/Gameが使うAudio Asset Revision Eventを提供する。Audio編集と再生中Runtime stateを分離する。

## Canonical inputs

- AUDIO-200のProject/Revision/Command契約
- `CROSS_TOOL_LIVE_EDIT.md`のLIVE/PINNED/REVIEW/FORKED、PiXiRuntime preview境界

## Deliverable

- note/clip/timeline edit、tempo/beat/waveform、mixer/effect graph、preview play/stop/seek/loop
- Audio Revision commit、Draw/Game bridge event、safe playback boundaryでのLIVE update、PINNED lock
- preview未保存状態を明示し、published/purchased stateへ昇格させない
- icon/shortcut/Help/creation guide、desktop dense workspaceとmobile contextual sheet

## Non-scope

- Commerce/License snapshotの完成、Package販売、Runtime publish、current PiXiEEDraw/PiXiSYNC変更

## Workflows

1. note/clip/mixer/effectを編集し、previewし、cancel/commit後にRevision/hashを比較する。
2. DrawまたはGameからAudio revisionをLIVE参照し、再生中は安全な位置で反映、PINNEDは固定する。
3. unsupported source/codec、offline、decode error、playback interruptionからdiagnosticを表示しrecoveryする。

## Failure / attack tests

- caller提供のAudio revision/tempo/asset ID/event identity、stale bridge、wrong Project/tenantを拒否
- preview中のuncommitted dataがGame/Market/Package正本へ混入しないことを確認
- effect parameter range、automation time order、channel mismatch、decode failure、duplicate eventをfail-closed
- page scroll、pointer/keyboard/touch focus競合、hidden panelのaudio workを検出

## Performance / device / accessibility

- audio decode/render/visualizerのcostを分離測定し、Pointer/Note hot pathのlong task原因を分類する。tiny operationはWorker化しない。
- waveform/Timelineはbounded projection。Desktop/Mobile/Tabletのpage overflow=0、safe-area、screen reader、keyboard、touchを確認。
- physical headphones/mic/stylus/mobile Safari等は未実施ならUNTESTED。

## Exact acceptance evidence

- `docs/inventory/audio-210-evidence.json` にoperation/event/revision trace、before/after hash、preview mode、latency、diagnosticを保存
- note/clip/effect/LIVE/PINNED/invalid/cancel fixtures、a11y tree、visual baseline、scroll metricsを保存
- targeted tests、browser smoke、`git diff --check` exit code、cross-tool non-intrusionをCheckpointへ記録

## Registry acceptance IDs

- `AUDIO210-SCOPE-001`、`AUDIO210-EVIDENCE-001`、`AUDIO210-STOP-001`

## Bounded write scope

- `pixiedraw2/src/audio/audio-210/**`
- `pixiedraw2/tests/audio-210/**`
- `pixiedraw2/benchmarks/audio-210/**`
- `docs/contracts/AUDIO-210-*.md`
- `docs/inventory/audio-210-*.json`
- `docs/decisions/ADR-*-AUDIO-210-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on stale/caller event trust、preview-to-canonical leak、unsafe hot swap、audio state loss、page scroll、scope violation。
- Preserve current data/routes/Market/PiXiSYNC; do not auto-start `AUDIO-220`.
- Checkpoint: event graph, modes, hashes, performance/a11y/viewport evidence, exact test/exit codes, UNTESTED, independent review。
