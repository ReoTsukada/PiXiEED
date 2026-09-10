# Repository Cleanup Report

> The original snapshot below records the earlier audit. The 2026-09-05 legacy-runtime retirement and its current counts are recorded in the addendum at the end of this file.

repository_commit: "working tree (no commit created)"
branch_or_worktree: "shared working tree"
scan_scope: "PiXiEED repository, with focus on pixiedraw2 iGAME/iAUDIO changes and untracked files"
candidate_count: 1
deleted_count: 0
kept_active_count: 25
kept_compatibility_count: 0
unknown_count: 1
bytes_removed: 0
files_deleted: []
duplicates_consolidated: []
generated_files_untracked: []

## Classification

- `KEEP_ACTIVE`: current iGAME/iAUDIO source, tests, bundled workspace output, and entry/style changes.
- `UNKNOWN`: `Claude outputs/piano-roll-cell-check.html`; purpose and ownership could not be disproven from repository references.
- No file met the safe deletion conditions.

## Commands run

- `git status --short`
- `git ls-files --others --exclude-standard`
- `rg` reference scan over `pixiedraw2/src`, `pixiedraw2/tests`, and `pixiedraw2/assets`
- `deno check src/wp180-workspace-ui.ts src/game/game-350/playground.ts`
- `deno test --no-remote --allow-read=src,tests,index.html --check tests/game-350`
- `deno task build:workspace`
- `git diff --check`

## Verification

- GAME-350 tests: 144 passed / 0 failed.
- Workspace bundle: generated successfully.
- Diff check: passed; existing unrelated CRLF warnings remain under `tools/screenshots/node_modules`.
- Browser: iAUDIO central workspace and lower timeline rendered as separate surfaces; no deletion smoke test was applicable.

## Compatibility notes

- User changes and active untracked implementation files were preserved.
- No backup, project data, PiXiSYNC data, compatibility route, or external file was touched.

## Rollback

- No files were deleted. The report itself can be removed or reverted independently.

## Remaining candidates

- `Claude outputs/piano-roll-cell-check.html` remains UNKNOWN and requires owner confirmation before deletion.

## Addendum: 旧PiXiEEDraw退役（2026-09-05）

repository_commit: "working tree (no commit created)"
branch_or_worktree: "shared working tree"
scan_scope: "tracked pixiedraw/ runtime, active URL/import references, Core test module placement, and current pixiedraw2 migration boundary"
retired_runtime_entries: 255
deleted_runtime_entries: 251
moved_compatibility_entries: 4
compatibility_stub_entries: 1
bytes_removed_from_old_runtime_blobs: 6037987
files_deleted: "旧 pixiedraw/ 本体のうち、現行へ移設した4つのCore共通モジュールを除く251エントリ"
files_moved: [
  "core-account-permission-utils.js",
  "core-asset-graph-utils.js",
  "core-command-engine-utils.js",
  "core-journal-recovery-utils.js"
]
files_added_for_compatibility: ["pixiedraw/index.html"]
unknown_candidates_kept: ["Claude outputs/piano-roll-cell-check.html"]

### 判断

- 旧エディタの実行コード、旧アセット、旧Worker、旧Service Worker、旧Manifest、旧Vendorを退役。
- `/pixiedraw/` は旧アプリ本体ではなく、`/pixiedraw2/` へ安全に渡す最小の互換入口だけを残した。`project` と `market_import` は許可した形式の値だけを引き継ぐ。
- 購入済みPXDは現行Draw2の `market_import` 受け渡しへ接続し、IndexedDBの一度きり消費・期限・Blob・ファイル名を検証する。画像・音声のみの商品はZIP出力に限定する。
- PiXYNC、PXD互換処理、Market契約、履歴資料、保護対象のバックアップ領域は削除していない。

### 検証

- `node scripts/test-market-verification.mjs`: PASS
- `node scripts/test-core-public-url-routing-wp098.mjs`: PASS（失敗系27件を含む）
- Core移設テスト: Account / Asset Graph / Command Engine / Journal Recovery は PASS
- `deno task check`: PASS
- iGAME/PXD関連: 25 passed / 0 failed
- iGAMEロジック・永続化関連: 55 passed / 0 failed
- Draw2 core suite: 65 passed / 0 failed
- iGAME/iAUDIO asset bridge・capture・runtime追加群: 124 passed / 0 failed
- iAUDIO-200: 32 passed / 0 failed
- iAUDIO-240: 21 passed / 0 failed
- `deno task build`, `deno task build:workspace`, `deno task build:game`: PASS
- `git diff --check` と staged diff check: PASS（既存node_modulesのCRLF警告のみ）
- ローカルブラウザ: `http://localhost:8000/pixiedraw/index.html?...` から現行 `pixiedraw2` へ遷移し、Draw2ワークスペースを表示。

### 未検証・残存境界

- `scripts/test-core-account-permission-supplement-wp060.mjs` は、今回の旧Draw退役とは無関係に、既に存在しない `pixfind/` を読むため未完了。削除済みページを復元する変更は行わない。
- ルート契約上の旧URLは `LEGACY_COMPAT` / `SHADOW` redirect candidate。静的サーバーにはサーバー側恒久リダイレクト機能がないため、公開配信側の恒久設定は別作業。
- 変更は未コミット・未プッシュ。ロールバックはコミット前なら作業ツリーの変更を個別確認して戻し、コミット後は旧ランタイムを復元せず互換入口の差し替えで行う。
