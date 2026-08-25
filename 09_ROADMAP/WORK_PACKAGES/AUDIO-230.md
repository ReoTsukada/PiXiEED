# AUDIO-230 — Audio Workspace and Device UX

status: COMPLETE
phase: audio
kind: audio
depends_on: AUDIO-220
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: AUDIO-240
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

PiXiAudioのDesktop/Tablet/Mobile workspaceを、独立Toolとして使える密度と明瞭性で統合する。全画面のpage-level scrollを0にし、長い内容はTimeline/Mixer/Asset panel内部だけで扱う。

## Canonical inputs

- AUDIO-200〜220、`PIXIEEDRAW2_UX_SPEC.md`のicon-first/accessibility/viewport契約
- Unreal/Unityのworkspace abstraction、current PiXiEEDraw mobile Canvas-first方針

## Deliverable

- Desktop: top command、left project/track、center timeline/editor、right Inspector/Mixer、bottom output/diagnostic
- Tablet: Canvas/Timeline優先 + one persistent panel。Mobile: preview-first + contextual bottom sheet/drawer
- keyboard/shortcut、mouse/touch/pointer、focus、safe-area、text scaling、reduced motion対応
- hidden panelのdecode/thumbnail/network/polling停止、lazy mount、bounded list
- icon常設、meaning/stepsはTooltip/Help/Q&A/shortcut/creation guideへ提供

## Non-scope

- Draw2 UI改変、Game runtime、Market/Commerce、Native build/store release、current routes/data変更

## Workflows

1. Project→Track→Clip/Note→Mixer/Effect→Preview→SaveをDesktop/Tablet/Mobileで完了する。
2. Panelをopen/close/resize/tab切替し、Core identity/Revision/Audio playbackを破壊しない。
3. Narrow/medium/wide、390×844、keyboard/IME/safe-areaでcritical controlをpage scrollなしに到達する。

## Failure / attack tests

- page overflow、horizontal overflow、hidden critical control、focus loss、keyboard shortcut collision、touch gesture conflictを検出
- inactive panelのwork、全Timeline materialization、Canvas/Audio stateへのworkspace state混入を拒否
- dialog/sheet cancel、offline、permission denied、loading/error/emptyを見せかけの成功にしない

## Performance / device / accessibility

- initial/lazy bundle、mounted/rendered item、waveform decode、main-thread long task、memory categoryを記録。
- screen-reader name/role/state、focus trap/restore、keyboard alternative、touch target、safe-area、text scalingを確認。
- physical mobile/audio hardware/Safari/Firefox未実施はUNTESTED。

## Exact acceptance evidence

- `docs/inventory/audio-230-evidence.json` に各profileのDOM geometry、scroll bounds、interaction trace、mounted count、bundle/perf/a11y結果を保存
- visual baselines: blank, timeline, mixer, effect, loading, error, mobile sheet
- targeted/browser tests、`git diff --check` exit code、current-system non-intrusionレビューをCheckpointへ記録

## Registry acceptance IDs

- `AUDIO230-SCOPE-001`、`AUDIO230-EVIDENCE-001`、`AUDIO230-STOP-001`

## Bounded write scope

- `pixiedraw2/src/audio/audio-230/**`
- `pixiedraw2/tests/audio-230/**`
- `pixiedraw2/benchmarks/audio-230/**`
- `docs/contracts/AUDIO-230-*.md`
- `docs/inventory/audio-230-*.json`
- `docs/decisions/ADR-*-AUDIO-230-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on page scroll、workspace/Core coupling、a11y欠落、lazy violation、audio loss、scope violation。
- Preserve current PiXiEEDraw/PXD/PiXiSYNC/Market/routes; do not auto-start `AUDIO-240`.
- Checkpoint: UX map, viewport/scroll proof, performance/bundle/memory, a11y/visual, tests/exit codes, UNTESTED, independent review。
