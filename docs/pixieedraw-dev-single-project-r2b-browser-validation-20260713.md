# PiXiEEDrawDEV 単一プロジェクト化 R2-B ブラウザ検証記録

## 1. 検証環境

- 対象: `PiXiEEDrawDEV/` のみ。`pixiedraw/`（本番）は未変更。
- 実施日: 2026-07-13
- ブラウザ接続: **未接続**。この実行環境には、実ブラウザを操作して File System Access API のピッカー、IndexedDB、リロードを検証するブラウザ制御面が提供されていない。
- 方針: ブラウザ結果を推測で PASS にしない。以下の各ケースは実ブラウザでの再実施待ちとする。

## 2. 対象ビルド

- 基準ビルド: `20260713-040`
- 確認元: `PiXiEEDrawDEV/assets/js/build-info.js`、`PiXiEEDrawDEV/version.json`
- セッションモジュール読込: `PiXiEEDrawDEV/index.html` の `active-project-session-utils.js` を `app.js` より前に読み込む構成を確認した。

## 3. テスト用ファイル / 事前条件

実ブラウザ検証用に、次を別名で用意する。

- 新規 V2 保存先: `r2b-v2-source.pixieedraw`
- 変換確認用 V1: `r2b-v1-source.pixieedraw`
- 画像入力: PNG、JPEG、WebP、GIF を各 1 個
- recent / recovery: 初回保存済み V2 を recent と recovery の入口から開く
- 置換確認用: 内容が判別できる旧 V2 と新 V2

各ケース直後に、次を DevTools Console で実行する。

```js
window.__pixieedrawValidateActiveProjectSession?.()
window.__pixieedrawCompareActiveProjectSessionWithTab?.()
window.__pixieedrawGetActiveProjectSession?.()
```

## 4. ケース 1: 新規作成・描画・Undo / Redo

- 実ブラウザ結果: **未実行**。
- 確認項目: `projectId`、`sourceKind`、`isDirty` が作成、描画、Undo、Redo に追従し、validation / compare が `ok: true` であること。
- 静的根拠: `app.js` は `markDocumentUnsavedChange`、`markDocumentDurablySaved`、`resetDocumentUnsavedChanges` からセッションの dirty 状態を同期する。

## 5. ケース 2: V2 初回保存

- 実ブラウザ結果: **未実行**。
- 期待値: 初回だけ保存先ピッカーが開き、保存完了後は `isSaveDestinationBound: true`、`saveHandleUsable: true`、V2 の source / adapter metadata がセッションと互換ミラーで一致する。
- 静的根拠: `open-project-tab-lifecycle.js` は保存ハンドル更新時にセッションを先行更新する。

## 6. ケース 3: V2 上書き・再オープン

- 実ブラウザ結果: **未実行**。
- 期待値: 同じ保存先への通常保存でピッカーを再表示せず、再オープン後に変更内容・セッションの `projectId`・source / adapter metadata が一致する。

## 7. ケース 4: V1 から V2 への変換

- 実ブラウザ結果: **未実行**。
- 期待値: 初回保存時に V2 用の保存先選択を要求し、元 V1 ファイルを上書きせず、変換後のセッションが新しい V2 保存先にのみ bind される。

## 8. ケース 5: V2 から V1 への保存

- 実ブラウザ結果: **未実行**。
- 期待値: V1 形式を選ぶ保存は強制 Save As になり、元の V2 を上書きせず、V2 の通常保存 binding を V1 用に誤転用しない。

## 9. ケース 6: PNG / JPEG / WebP / GIF 読込

- 実ブラウザ結果: **未実行**。
- 期待値: 各画像読み込み直後は保存先未 bind で、保存操作でピッカーを要求する。各形式で validation / compare が成功する。

## 10. ケース 7: recent・ケース 8: recovery

- 実ブラウザ結果: **未実行**。
- 期待値: recent および recovery のいずれも、通常保存が既存の正しい保存先を使用するか、保存先未設定ならピッカーを要求する。別プロジェクトの handle / source metadata を引き継がない。

## 11. ケース 9: リロード後の同一性

- 実ブラウザ結果: **未実行**。
- 期待値: リロード後にアクティブな V2 / recent / recovery の `projectId`、`sourceKind`、`storageAdapterId` が復元先と一致し、保存先 binding が無効な値にならない。

## 12. ケース 10: プロジェクト置換中の同一性

- 実ブラウザ結果: **未実行**。
- 期待値: 新規プロジェクトや別ファイルの読込中は旧セッションを中途半端に新プロジェクトへ書き換えず、置換コミット時にのみ新しい session に切り替わる。コミット後に旧 `projectId`、旧 handle、旧 source / adapter metadata が残らない。

## 13. 手動確認時の保存先判定

- V2 の通常保存: 既存の有効な handle がある場合は上書き、ない場合は保存先選択。
- V1 / 画像入力: 既存ファイルを形式不整合で上書きせず、V2 保存先の選択を要求する。
- すべての保存完了後: session と互換ミラー双方の `projectId` / `sourceKind` / `storageAdapterId` / save-binding を比較する。

## 14. session と互換ミラーの validation / compare

- 静的・単体検証: **PASS**。
- `scripts/test-pixiedraw-dev-active-project-session-r2.mjs` は、空 session の拒否、作成、置換、更新時の既存フィールド保持、handle bind / clear / unavailable、session と tab の一致・不一致を検証して成功した。
- lifecycle は `save-handle-update:session-first` の後に `save-handle-update:tab-mirror` を行うことを静的テストで確認した。
- 実ブラウザでの validation / compare: **未実行**。

## 15. 不一致・未検出フォールバック

- Codex実行環境: 実ブラウザ未接続のため、Console由来の mismatch は未検出。
- ユーザー実ブラウザ（build `20260713-040`）: 起動直後に `initial-project-session`、`document-reset-clean`、`reset-project-session`、`persistence-state-update:tab-mirror` の mismatch を検出済み。
- ログ上では `sessionProjectId`、`autosaveProjectId`、`activeTabProjectId` は一致している。従って、これは単純な project ID 不一致ではない。
- R2-Bの保存系ブラウザ検証は停止し、R2-Cでこの初期化不一致を先に修正する。

## 16. Console エラー確認

- 実ブラウザ Console: **未確認**。
- 確認対象:
  - `active project session mismatch`
  - `project identity mismatch`
  - save binding mismatch
  - invalid session
  - silent fallback を示す警告
- 構文 / TDZ / session 単体テストの実行時には、上記の runtime Console エラーは発生しなかった。

## 17. 修正有無

- R2-B では **コード修正なし**。
- 理由: 実ブラウザで再現した不整合がないため、保存 writer、V2 schema、recovery、R4 対象に推測修正を入れていない。
- この検証記録のみを追加した。

## 18. R4 へ進む可否

- 判定: **保留**。
- session の構文・TDZ・純粋状態遷移は PASS だが、R2-B が要求する FSA ピッカー、実ファイル上書き、recent / recovery、リロード、置換中状態の実ブラウザ検証が未実施である。
- 実ブラウザで第 4〜12 節を完了し、Console mismatch がなく、全ケースの validation / compare が成功した時点で R4 の削減設計へ進める。

## 実施済みのコマンド

```sh
node --check PiXiEEDrawDEV/assets/js/app.js
node --check PiXiEEDrawDEV/assets/js/active-project-session-utils.js
node --check PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js
node --check PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js
node scripts/test-pixiedraw-dev-active-project-session-r2.mjs
node scripts/check-pixiedraw-dev-tdz.mjs
git diff --check -- PiXiEEDrawDEV scripts/test-pixiedraw-dev-active-project-session-r2.mjs
```

すべて成功した。
