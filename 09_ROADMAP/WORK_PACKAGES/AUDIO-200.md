# AUDIO-200 — Audio Project / Revision Core

status: COMPLETE
phase: audio
kind: audio
depends_on: CORE-120
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: AUDIO-210
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

PiXiAudioを独立した本格Toolとして開始し、Audio Project、Track、Clip、Note、Automation、Mixer、Effect、Asset Revisionの正本を定義する。raw audio bytesはauthorityにしない。

## Canonical inputs

- `03_PRODUCTS/PIXIEEDRAW2_SPEC.md`のProject/Asset/Revisionと`CROSS_TOOL_LIVE_EDIT.md`
- Audio Core/Package/License/StorageLocator/Dependency Lock契約、performance/device matrix
- Host-neutral browser/native adapter境界とPiXiRuntimeの再生境界

## Deliverable

- Audio Project ID/Revision ID、track/clip/note/timing/tempo/timebase、source Blob locator/hash
- PCM/source、waveform、render cache、mixer/effect parameterの分離。Canonical metadataから再構築可能
- Command/Journal/Undo/Checkpoint、offline/local recovery、schema versioning
- icon-first Audio入口、Tooltip/Help/shortcut/creation guide、page scroll=0のworkspace skeleton

## Non-scope

- Draw2/PiXiGameの実装、Market/Commerce、production audio upload、Store/native signing、current site変更

## Workflows

1. New Audio Project→track追加→clip/note編集→tempo/marker設定→Undo/Redo→Revision/Checkpointを作る。
2. Source audioをimportし、hash/metadataを記録して、source削除・cache削除後もdiagnostic付きで復旧する。
3. Browser/native hostで同じProject semanticsを使い、Workspace stateをPiXiSYNC canonical eventへ送らない。

## Failure / attack tests

- caller提供のduration/sampleRate/channel/tempo/byte length/hashをCanonical authorityとして受理しない
- duplicate/missing/stale revision、unsupported codec/schema、invalid time range、NaN/overflow、source locator traversalを拒否
- raw Blob改変だけでrevision/rights/royaltyが変わらない。metadataとbytesの不一致はfail-closed
- page overflow、hidden panelのdecode/polling、icon/a11y/shortcut欠落を検出

## Performance / device / accessibility

- waveform/renderは必要時のみlazy/cacheし、編集hot pathで全音声decodeや全timeline rerenderをしない。
- fixtureごとに import、note edit、autosave、checkpoint、memory category、long taskを測定する。
- keyboard/focus/screen reader、touch target、safe-area、text scaling、reduced-motionを検証。physical audio device/real mobile未実施はUNTESTED。

## Exact acceptance evidence

- `docs/inventory/audio-200-evidence.json` にProject/Revision manifest、metadata/hash、journal/checkpoint、failure signatureを保存
- import/edit/recovery/stale/invalid fixture、accessible tree、viewport scroll bounds、bundle/memory traceを保存
- targeted tests、browser smoke、`git diff --check` exit code、current-system non-intrusionをCheckpointへ記録

## Registry acceptance IDs

- `AUDIO200-SCOPE-001`、`AUDIO200-EVIDENCE-001`、`AUDIO200-STOP-001`

## Bounded write scope

- `pixiedraw2/src/audio/audio-200/**`
- `pixiedraw2/tests/audio-200/**`
- `pixiedraw2/benchmarks/audio-200/**`
- `docs/contracts/AUDIO-200-*.md`
- `docs/inventory/audio-200-*.json`
- `docs/decisions/ADR-*-AUDIO-200-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on raw-byte authority、revision drift、data loss、page scroll、Core/UI coupling、scope violation、stale Context。
- Preserve current Market/PiXiSYNC/PXD/routes/data; do not migrate/deploy/publish/commit/push or auto-start `AUDIO-210`.
- Checkpoint: schema, fixtures, hash/recovery trace, exact commands/exit codes, UNTESTED, independent review。
