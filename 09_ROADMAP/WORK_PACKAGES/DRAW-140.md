# DRAW-140 — Draw2 PNG / PXD Export

status: PLANNED
phase: draw2
kind: draw2
depends_on: DRAW-130
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: DRAW-150
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Canonical Projectを決定論的PNGとversioned PXDへ書き出し、同一入力の同一bytes/hash、完全round-trip、壊れた入力のfail-closedを証明する。

## Canonical inputs

- DRAW-130のLayer/Frame/Cel/PXD identity
- `docs/contracts/WP-140-PNG-PXD-EXPORT.md` と `PIXIEEDRAW2_SPEC.md`
- palette、透明、duration、hash、StorageLocator/Package契約

## Deliverable

- nearest-neighbor/alpha/indexed paletteを保つPNG、manifest付きPXD v1 export/import
- canonical JSON/byte order、content hash、package hash、size/path limit、cancellation
- export/importのicon-first UI、shortcut、保存先/形式/警告をHelp/creation guide/accessible labelで説明
- Current PXD実装を置換せず、Draw2 PXDを隔離する

## Non-scope

- Legacy PXD v2 read、PiXiSYNC接続、Market販売、Object Storage upload、Deploy

## Workflows

1. Blank/drawing/animation projectをPNG/PXDへexportし、再importしてpixel/palette/layer/frame/durationを比較する。
2. 同じCanonical Projectを複数回exportしbytes/hashを比較する。
3. Cancel、overwrite warning、permission denied、offline、large package、unknown schemaを操作する。

## Failure / attack tests

- bad magic/version/manifest/hash、trailing bytes、危険path、duplicate entry、oversized entry、invalid palette/dimensionを拒否
- missing asset、content hash mismatch、partial export、cancel途中の破損fileを成功扱いしない
- caller指定のProject/Revision/Licenseを無断でmanifest authorityにしない
- Theme変更がPNG/PXD canonical color/hashを変えないことを確認

## Performance / device / accessibility

- encode/decode/large packageは測定後にのみWorker候補とし、pointer hot pathをWorker往復させない。
- fixture別にbytes、hash、時間、memory、cancel latencyを記録。正式device gate未実施はUNTESTED。
- keyboard focus、dialog focus trap/restore、screen-reader labels、mobile sheet、page overflow=0を確認。

## Exact acceptance evidence

- `docs/inventory/draw-140-evidence.json` にinput manifest hash、output bytes/hash、round-trip diff、negative fixture結果を記録
- PNG/PXD golden fixture、corrupt/path/trailing-byte fixture、visual diff、accessibility treeを保存
- targeted tests、browser smoke、`git diff --check` exit codeをCheckpointへ保存。全ての未実施資格をUNTESTEDにする

## Registry acceptance IDs

- `DRAW140-SCOPE-001`、`DRAW140-WORKSPACE-001`、`DRAW140-EVIDENCE-001`、`DRAW140-STOP-001`

## Bounded write scope

- `pixiedraw2/src/draw2/draw-140/**`
- `pixiedraw2/tests/draw-140/**`
- `pixiedraw2/benchmarks/draw-140/**`
- `docs/contracts/DRAW-140-*.md`
- `docs/inventory/draw-140-*.json`
- `docs/decisions/ADR-*-DRAW-140-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules / checkpoint

- Stop on nondeterministic bytes、round-trip loss、unsafe path、partial success、page scroll、current PXD mutation、scope violation。
- Do not modify current routes/PXD/Storage/Market/PiXiSYNC; do not auto-start `DRAW-150`.
- Checkpoint: exact commands/exit codes, fixture hashes, output sizes, visual/a11y evidence, baseline identity, UNTESTED, independent review。
