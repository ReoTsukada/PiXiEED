# Repository Cleanup Report — 2026-08-16

```yaml
report_id: PIXIEED-REPOSITORY-CLEANUP-20260816
status: SAFE_LOCAL_CLEANUP_COMPLETE_WITH_PROTECTED_CANDIDATES
repository: /Users/tsukadareine/Documents/GitHub/PiXiEED
branch_or_worktree: agent/fix-qr-draw-import / current worktree
repository_commit: ff0a172a2db55e68a339959c2cde8f9ae5346295
production_changes: false
commit_push_deploy: false
```

## Scope

今回の依頼に対し、Repository内の再生成可能なローカルキャッシュと、存在しないパスを指す古い
Git worktree登録だけを対象にした。製品Source、現行Route、PXD、PiXiSYNC、Market、Production
Database/Storage、署名情報、Evidence、既存の未コミット変更は対象外とした。

## Classification

| Classification | 対象 | 判定 |
|---|---|---|
| `REGENERATE_NOT_COMMIT` | `scripts/__pycache__` | 削除済み。再実行時に再生成可能なPythonキャッシュ |
| `REGENERATE_NOT_COMMIT` | `node_modules/`、`tools/screenshots/node_modules/`、`app-shell/pixieed-capacitor/node_modules/` | 保持。今後の検証で使用するため、今回削除しない |
| `KEEP_PROTECTED` | `app-shell/pixieed-capacitor/android/pixieed-upload.jks` | 署名鍵のため保持。内容を読まず、Gitへ追加しない |
| `KEEP_GENERATED_EVIDENCE` | `.codex/context/**`、`docs/inventory/**`、`docs/cleanup/**` | 現行Context、Evidence、過去監査の参照元のため保持 |
| `KEEP_GENERATED_SOURCE` | `pixiedraw2/dist/**` | 再生成手順とClean Checkoutでの再現性を確認するまで保持 |
| `UNKNOWN` | WP-005で記録された完全重複37グループ | 公開URL、動的参照、互換性、Native resource名を完全否定できないため保持 |

## Removed

| Path / metadata | Evidence | Recovery |
|---|---|---|
| `scripts/__pycache__/` | Python実行時に生成されるignored cache。製品コード・Test sourceではない | 再度Python scriptを実行すれば再生成 |
| stale Git worktree registration `pixieed-fp007-qualification.VKG32W` | `git worktree prune --dry-run`でgitdirが存在しないことを確認 | 参照先が存在しないため、通常の作業Tree・製品ファイルは失われていない |

`scripts/__pycache__/`の削除前計測値は約43KB。stale worktreeの実体パスは存在せず、Git管理情報だけを整理した。

## Protected / Not deleted

- `node_modules`系：約106MB。削除すれば再インストールが必要で、現在の検証を不必要に遅くするため保持。
- `pixieed-upload.jks`：Android署名鍵。削除すると復旧不能になり得るため保持。秘密情報として扱い、Commit/Pushしない。
- `.codex/context`：Agent履歴の全削除ではなく、現在のPackage ContextとEvidenceの生成物。必要なContextを消すと再現性が下がるため保持。
- `docs/inventory`と既存Cleanup分類：WP-000/WP-005/各PackageのEvidence。削除候補ではない。
- `pixiedraw2/dist`：生成Bundleだが、現行検証とBundle比較で参照されるため、Clean Checkout再生成証明前は保持。
- 完全重複画像37グループ：Hash一致だけでは安全な削除証明にならず、`UNKNOWN`のまま保持。

## Verification

- `git worktree prune -v`: stale登録1件を整理。
- Python cache absence: `scripts/__pycache__`不在を確認。
- `python3 scripts/validate_pixieed_program.py --root .`: PASS。
- `node scripts/verify-canonical-package-alignment.mjs`: PASS（SOCIAL-430 / IN_PROGRESS）。
- 学習Contextのリンク検査: 13件、missing 0。
- `git diff --check`（学習Context・README）: PASS。
- Production migration/deploy/publish/store submission: 未実施。
- Commit/Push: 未実施。

## Remaining candidates

次回、依存再生成とClean Checkout証明を別Scopeで実施できる場合に限り、`node_modules`と`dist`の扱いを
再判定する。署名鍵、公開URL候補、旧互換ファイル、PXD/PiXiSYNC、UNKNOWN画像はOwnerの明示判断なしに削除しない。

## Rollback

キャッシュは再生成可能。stale worktree registrationは参照先がすでに存在しないため、作業Treeの復旧対象ではない。
製品ファイル・データ・権利・本番環境には変更を加えていない。

この報告は現在の未コミットworktreeに記録した監査結果であり、Commit/Pushは行っていない。
