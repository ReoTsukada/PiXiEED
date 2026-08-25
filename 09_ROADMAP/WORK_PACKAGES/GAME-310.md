# GAME-310 — Game Controls and Input Actions

status: COMPLETE
phase: game
kind: game
depends_on: GAME-300
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: GAME-320
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Keyboard、mouse、touch、gamepad、sensor、custom inputを同じ semantic Input Actionへ束ね、自作操作UIとBehaviorを安全に作れるようにする。

## Canonical inputs

- GAME-300のScene/Entity/Component/Behavior IR
- `PIXIGAME_AUTHORING_SPEC.md`、`PIXIGAME_CUSTOM_CONTROL_UI_SPEC.md`、`PIXIGAME_SCRIPTING_SPEC.md`

## Deliverable

- Action Map、context、binding、deadzone/axis、device capability、priority/consume semantics
- custom control UI: anchor/safe-area/hit-area/multitouch/visibility/feedback/accessibility
- no-code/graph/codeから同一Input Actionを参照。keyboard shortcutとEditor commandは衝突しない
- icon/help/shortcut/creation guide、mobile preview-first sheet、page scroll=0

## Non-scope

- Runtime save/build/package、Commerce、Draw2/Audio editor implementation、current site/route/data変更

## Workflows

1. `move/jump/attack/confirm`等を定義し、keyboard/touch/gamepad/custom bindingを追加してpreviewする。
2. Controlをsafe-area anchorへ配置し、Portrait/Landscape/Tablet、left/right handedness、IME/Browser UIを確認する。
3. Context切替、priority、cancel、multi-touch、gamepad接続/切断を操作し、Behavior IRに決定論的Commandを残す。

## Failure / attack tests

- caller提供のaction owner/scene/context、duplicate binding、unbounded hit area、safe-area外、ambiguous priorityを拒否
- control assetへbehaviorを埋め込む、raw DOM/任意Network、page scroll依存、invisible critical controlを検出
- drag-only配置のkeyboard alternative、screen-reader name、focus order、touch conflictを確認

## Performance / device / accessibility

- input sampleでGraph/Scene全体を再描画しない。control projectionとRuntime input bridgeを局所化する。
- 390×844、430×932、1280×900、tablet splitのgeometry/overflow/touch targetを記録。
- physical gamepad/stylus/mobile/Safari/Firefox未実施はUNTESTED。reduced motion/text scalingを含める。

## Exact acceptance evidence

- `docs/inventory/game-310-evidence.json` にAction Map、binding trace、control layout/safe-area、event order、a11y/perfを記録
- duplicate/priority/context/device/offline/permission fixtures、visual baselines、targeted/browser tests、`git diff --check` exit codeを保存
- Checkpointに current-system/Draw/Audio non-intrusionと独立レビューを記録

## Registry acceptance IDs

- `GAME310-SCOPE-001`、`GAME310-EVIDENCE-001`、`GAME310-STOP-001`

## Bounded write scope

- `pixiedraw2/src/game/game-310/**`
- `pixiedraw2/tests/game-310/**`
- `pixiedraw2/benchmarks/game-310/**`
- `docs/contracts/GAME-310-*.md`
- `docs/inventory/game-310-*.json`
- `docs/decisions/ADR-*-GAME-310-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on action ambiguity、unsafe control layout、page scroll、input theft、a11y欠落、scope violation、stale Context。
- Do not migrate/deploy/publish/commit/push or auto-start `GAME-320`.
- Checkpoint: action/control fixtures, exact tests/exit codes, geometry/a11y/perf, UNTESTED, independent review。
